/**
 * EntitlementService — the single source of truth for Free vs Premium.
 *
 * RESPONSIBILITIES
 *  - Hold the current EntitlementState (loaded from cache on init, refreshed
 *    from Google Play via SubscriptionService).
 *  - Answer "is the user premium?" and "can the user use feature X?".
 *  - Enforce Free usage limits in the SERVICE layer (not just UI) by exposing
 *    assert* methods that throw typed errors before a repo write happens.
 *  - Expose current usage counts for display on the Premium screen.
 *
 * DESIGN NOTES
 *  - Premium is DERIVED. `isPremium()` is true only when the current
 *    EntitlementState says premium AND (no expiry OR expiry is in the future).
 *    A lapsed cache falls back to Free until Play re-verifies.
 *  - This service is consumed by both the service layer (EntryService,
 *    EventService, PersonService) and the UI (via EntitlementContext).
 *  - Limit checks read live counts from the repositories so they stay correct
 *    even if data changed on another device / via import.
 */

import type { IEntitlementRepository } from '@common/repository/interfaces/IEntitlementRepository';
import type { IEventRepository } from '@moi/repository/interfaces/IEventRepository';
import type { IEntryRepository } from '@moi/repository/interfaces/IEntryRepository';
import type { IPersonRepository } from '@moi/repository/interfaces/IPersonRepository';
import type { IBillingService } from './IBillingService';
import {
  FORCE_ALL_FEATURES_UNLOCKED,
  FREE_LIMITS,
  LimitKind,
  PremiumFeature,
} from './subscriptionConfig';
import {
  EntitlementState,
  FREE_ENTITLEMENT,
  FreeLimitError,
  PremiumRequiredError,
} from './types';

export interface UsageSnapshot {
  events: { used: number; limit: number };
  people: { used: number; limit: number };
  /** Per-event entry usage is only meaningful with an event id; provided lazily. */
}

type Listener = (state: EntitlementState) => void;

export class EntitlementService {
  private state: EntitlementState = FREE_ENTITLEMENT;
  private initialized = false;
  private initializing: Promise<void> | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly entitlementRepo: IEntitlementRepository,
    private readonly subscriptionService: IBillingService,
    private readonly eventRepo: IEventRepository,
    private readonly entryRepo: IEntryRepository,
    private readonly personRepo: IPersonRepository,
  ) {}

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Load the cached entitlement (fast, offline) so the app can render premium
   * UI immediately. Safe to call multiple times; only loads once.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;
    this.initializing = (async () => {
      try {
        const cached = await this.entitlementRepo.get();
        if (cached) this.setState(cached);
      } catch {
        // Cache read failure → stay on Free defaults.
      } finally {
        this.initialized = true;
        this.initializing = null;
      }
    })();
    return this.initializing;
  }

  /**
   * Re-verify ownership against Google Play and update state. Falls back to the
   * cached/last-known state when Play is unreachable (never downgrades on a
   * transient network failure).
   */
  async refresh(): Promise<EntitlementState> {
    const next = await this.subscriptionService.verifyAndRefresh();
    this.setState(next);
    return this.getState();
  }

  // -------------------------------------------------------------------------
  // State access + subscription (for the React context)
  // -------------------------------------------------------------------------

  /** Return the current state with a freshly-evaluated `isPremium`. */
  getState(): EntitlementState {
    const premium = this.computeIsPremium(this.state);
    // Reflect the evaluated premium value without mutating the stored source.
    return { ...this.state, isPremium: premium };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(next: EntitlementState): void {
    this.state = next;
    const evaluated = this.getState();
    this.listeners.forEach(l => {
      try {
        l(evaluated);
      } catch {
        /* listener errors must not break state propagation */
      }
    });
  }

  // -------------------------------------------------------------------------
  // Premium / feature checks
  // -------------------------------------------------------------------------

  /**
   * Derived premium check. True only when the state claims premium AND the
   * expiry (if known) has not passed. Unknown expiry with premium=true (e.g.
   * freshly verified purchase whose expiry we couldn't compute) is treated as
   * premium.
   */
  isPremium(): boolean {
    return this.computeIsPremium(this.state);
  }

  private computeIsPremium(state: EntitlementState): boolean {
    // TEMPORARY master switch: treat everyone as premium while all features
    // are unlocked. Flip FORCE_ALL_FEATURES_UNLOCKED back to false to restore
    // the real derivation below.
    if (FORCE_ALL_FEATURES_UNLOCKED) return true;

    // Premium is derived: the state must claim premium AND, if an expiry is
    // known, it must still be in the future. An unknown/unparseable expiry on a
    // premium state is treated as premium (don't punish the user for a missing
    // field on a freshly-verified purchase).
    if (!state.isPremium) return false;
    if (!state.expiryAt) return true;
    const expiry = Date.parse(state.expiryAt);
    if (Number.isNaN(expiry)) return true;
    return expiry > Date.now();
  }

  /**
   * Whether a given premium feature is currently usable. All listed features
   * require premium; there is no per-feature partial unlock at this time.
   */
  canUseFeature(_feature: PremiumFeature): boolean {
    return this.isPremium();
  }

  /** Throw PremiumRequiredError if the feature is not available. */
  assertFeature(feature: PremiumFeature): void {
    if (!this.canUseFeature(feature)) {
      throw new PremiumRequiredError(feature);
    }
  }

  // -------------------------------------------------------------------------
  // Free-limit enforcement (service layer)
  // -------------------------------------------------------------------------

  /**
   * Assert the user may create another event. Premium users are unlimited.
   * Free users are capped at FREE_LIMITS.maxEvents.
   */
  async assertCanCreateEvent(): Promise<void> {
    if (this.isPremium()) return;
    const events = await this.eventRepo.getAll();
    if (events.length >= FREE_LIMITS.maxEvents) {
      throw new FreeLimitError(LimitKind.Events, FREE_LIMITS.maxEvents);
    }
  }

  /**
   * Assert the user may add another entry to the given event. Premium users are
   * unlimited. Free users are capped at FREE_LIMITS.maxEntriesPerEvent.
   */
  async assertCanAddEntry(eventId: string): Promise<void> {
    if (this.isPremium()) return;
    const entries = await this.entryRepo.getAll({ eventId });
    if (entries.length >= FREE_LIMITS.maxEntriesPerEvent) {
      throw new FreeLimitError(
        LimitKind.EntriesPerEvent,
        FREE_LIMITS.maxEntriesPerEvent,
      );
    }
  }

  /**
   * Assert the user may add another person. Premium users are unlimited.
   * Free users are capped at FREE_LIMITS.maxPeople.
   *
   * Note: this is checked before creating a NEW person. Callers that only
   * reference existing people should not call this.
   */
  async assertCanAddPerson(): Promise<void> {
    if (this.isPremium()) return;
    const people = await this.personRepo.getAll();
    if (people.length >= FREE_LIMITS.maxPeople) {
      throw new FreeLimitError(LimitKind.People, FREE_LIMITS.maxPeople);
    }
  }

  // -------------------------------------------------------------------------
  // Usage reporting (for the Premium screen)
  // -------------------------------------------------------------------------

  async getUsage(): Promise<UsageSnapshot> {
    const [events, people] = await Promise.all([
      this.eventRepo.getAll(),
      this.personRepo.getAll(),
    ]);
    const premium = this.isPremium();
    return {
      events: {
        used: events.length,
        limit: premium ? Number.POSITIVE_INFINITY : FREE_LIMITS.maxEvents,
      },
      people: {
        used: people.length,
        limit: premium ? Number.POSITIVE_INFINITY : FREE_LIMITS.maxPeople,
      },
    };
  }
}
