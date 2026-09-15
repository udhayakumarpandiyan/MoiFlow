/**
 * Shared types for the subscription / entitlement system.
 */

import { LimitKind, PlanId, PremiumFeature } from './subscriptionConfig';

/** How the current entitlement was established. */
export type EntitlementSource =
  | 'play' // verified from a Google Play purchase (authoritative)
  | 'cache' // loaded from the local SQLite cache (offline / not yet re-verified)
  | 'none'; // no premium entitlement known

/**
 * A snapshot of the user's subscription/entitlement state.
 *
 * IMPORTANT: `isPremium` is *derived*, never a hand-set boolean flag. It is
 * true only when there is a known Play purchase (verified now, or cached from a
 * previous verification) whose expiry is still in the future.
 */
export interface EntitlementState {
  isPremium: boolean;
  /** Active plan id, if any. */
  planId: PlanId | null;
  /** Google Play product id backing the entitlement, if any. */
  productId: string | null;
  /** ISO expiry timestamp, if known. Null when unknown/lifetime/none. */
  expiryAt: string | null;
  /** ISO timestamp of the most recent purchase we know about. */
  latestPurchaseAt: string | null;
  /** ISO timestamp we last verified ownership against Google Play. */
  lastVerifiedAt: string | null;
  /** Where this state came from. */
  source: EntitlementSource;
  /**
   * True when the entitlement is being served from cache and has NOT been
   * re-verified against Play in this session (e.g. offline / billing
   * unavailable). Useful for showing an "offline" hint in the UI.
   */
  fromCacheOnly: boolean;
}

/** The default, non-premium state. */
export const FREE_ENTITLEMENT: EntitlementState = {
  isPremium: false,
  planId: null,
  productId: null,
  expiryAt: null,
  latestPurchaseAt: null,
  lastVerifiedAt: null,
  source: 'none',
  fromCacheOnly: false,
};

// ---------------------------------------------------------------------------
// Billing / purchase flow result types
// ---------------------------------------------------------------------------

export type PurchaseOutcome =
  | 'success'
  | 'pending' // Play reports the purchase is pending (e.g. slow card / cash)
  | 'cancelled' // user dismissed the purchase dialog
  | 'already_owned' // subscription already active on this account
  | 'billing_unavailable' // Play billing not available on this device
  | 'offline' // no connectivity to complete/verify
  | 'error';

export interface PurchaseResult {
  outcome: PurchaseOutcome;
  /** New entitlement snapshot after the attempt (may be unchanged on failure). */
  entitlement: EntitlementState;
  /** Human-friendly, already-localized-key-free message for logging. */
  message?: string;
}

export interface RestoreResult {
  /** True when at least one active subscription was found + restored. */
  restored: boolean;
  outcome: PurchaseOutcome;
  entitlement: EntitlementState;
  message?: string;
}

/** A store product enriched with our plan metadata for display. */
export interface StoreSubscription {
  planId: PlanId;
  productId: string;
  /** Localized price string from the store, or a fallback like "₹29". */
  localizedPrice: string;
  /** Store title if available. */
  title?: string;
  /** Duration in months (from our config). */
  durationMonths: number;
  /** True when this product was actually returned by the store. */
  availableFromStore: boolean;
}

// ---------------------------------------------------------------------------
// Limit enforcement
// ---------------------------------------------------------------------------

/**
 * Thrown by the service layer when a Free user hits a usage limit.
 * The `code` is stable ('FREE_LIMIT_REACHED') so callers can catch it without
 * string matching; `limit` and `kind` let the UI localize + deep-link to the
 * Premium screen.
 */
export class FreeLimitError extends Error {
  readonly code = 'FREE_LIMIT_REACHED';
  readonly kind: LimitKind;
  readonly limit: number;

  constructor(kind: LimitKind, limit: number, message?: string) {
    super(message ?? `Free plan limit reached: ${kind} (max ${limit})`);
    this.name = 'FreeLimitError';
    this.kind = kind;
    this.limit = limit;
  }
}

/** Type guard for FreeLimitError across module/bundle boundaries. */
export const isFreeLimitError = (err: unknown): err is FreeLimitError =>
  err instanceof FreeLimitError ||
  (typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'FREE_LIMIT_REACHED');

/**
 * Thrown by the service layer when a Free user attempts a Premium-only feature.
 */
export class PremiumRequiredError extends Error {
  readonly code = 'PREMIUM_REQUIRED';
  readonly feature: PremiumFeature;

  constructor(feature: PremiumFeature, message?: string) {
    super(message ?? `Premium required for feature: ${feature}`);
    this.name = 'PremiumRequiredError';
    this.feature = feature;
  }
}

/** Type guard for PremiumRequiredError across module/bundle boundaries. */
export const isPremiumRequiredError = (
  err: unknown,
): err is PremiumRequiredError =>
  err instanceof PremiumRequiredError ||
  (typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'PREMIUM_REQUIRED');
