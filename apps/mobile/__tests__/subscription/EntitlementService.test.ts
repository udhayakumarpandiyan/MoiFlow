/**
 * EntitlementService tests.
 *
 * Covers:
 *  - Free-plan usage limits (events, entries-per-event, people) enforced in the
 *    service layer.
 *  - Premium entitlement derivation.
 *  - Expired subscription → falls back to Free (features locked, limits apply).
 *  - Feature gating (assertFeature / canUseFeature).
 *  - Usage reporting.
 */

import { EntitlementService } from '../../src/common/subscription/EntitlementService';
import {
  FREE_LIMITS,
  LimitKind,
  PremiumFeature,
} from '../../src/common/subscription/subscriptionConfig';
import {
  EntitlementState,
  FREE_ENTITLEMENT,
  isFreeLimitError,
  isPremiumRequiredError,
} from '../../src/common/subscription/types';
import type { IEntitlementRepository } from '../../src/common/repository/interfaces/IEntitlementRepository';
import type { IEventRepository } from '../../src/moi/repository/interfaces/IEventRepository';
import type { IEntryRepository } from '../../src/moi/repository/interfaces/IEntryRepository';
import type { IPersonRepository } from '../../src/moi/repository/interfaces/IPersonRepository';

// --- Fakes -----------------------------------------------------------------

class FakeEntitlementRepo implements IEntitlementRepository {
  state: EntitlementState | null = null;
  async get() {
    return this.state;
  }
  async save(s: EntitlementState) {
    this.state = s;
  }
  async clear() {
    this.state = null;
  }
}

function makeCountRepos(counts: {
  events?: number;
  entriesPerEvent?: number;
  people?: number;
}) {
  const eventRepo = {
    getAll: jest.fn(async () => new Array(counts.events ?? 0).fill({})),
  } as unknown as IEventRepository;

  const entryRepo = {
    getAll: jest.fn(async () => new Array(counts.entriesPerEvent ?? 0).fill({})),
  } as unknown as IEntryRepository;

  const personRepo = {
    getAll: jest.fn(async () => new Array(counts.people ?? 0).fill({})),
  } as unknown as IPersonRepository;

  return { eventRepo, entryRepo, personRepo };
}

const stubSubscription = {
  verifyAndRefresh: jest.fn(),
} as any;

function build(
  entitlement: EntitlementState | null,
  counts: { events?: number; entriesPerEvent?: number; people?: number } = {},
) {
  const entRepo = new FakeEntitlementRepo();
  entRepo.state = entitlement;
  const { eventRepo, entryRepo, personRepo } = makeCountRepos(counts);
  const svc = new EntitlementService(
    entRepo,
    stubSubscription,
    eventRepo,
    entryRepo,
    personRepo,
  );
  return { svc, entRepo, eventRepo, entryRepo, personRepo };
}

const premiumState = (expiryAt: string | null): EntitlementState => ({
  isPremium: true,
  planId: 'yearly',
  productId: 'moiflow_yearly',
  expiryAt,
  latestPurchaseAt: new Date().toISOString(),
  lastVerifiedAt: new Date().toISOString(),
  source: 'play',
  fromCacheOnly: false,
});

const future = () => new Date(Date.now() + 86_400_000).toISOString();
const past = () => new Date(Date.now() - 86_400_000).toISOString();

// --- Tests -----------------------------------------------------------------

describe('EntitlementService — premium derivation', () => {
  it('is premium when state says premium and expiry is in the future', async () => {
    const { svc } = build(premiumState(future()));
    await svc.init();
    expect(svc.isPremium()).toBe(true);
  });

  it('is premium when premium and expiry is unknown (null)', async () => {
    const { svc } = build(premiumState(null));
    await svc.init();
    expect(svc.isPremium()).toBe(true);
  });

  it('is NOT premium when the cached premium has expired', async () => {
    const { svc } = build(premiumState(past()));
    await svc.init();
    expect(svc.isPremium()).toBe(false);
  });

  it('defaults to Free when nothing is cached', async () => {
    const { svc } = build(null);
    await svc.init();
    expect(svc.isPremium()).toBe(false);
    expect(svc.getState().source).toBe(FREE_ENTITLEMENT.source);
  });
});

describe('EntitlementService — feature gating', () => {
  it('locks premium features for Free users', async () => {
    const { svc } = build(null);
    await svc.init();
    expect(svc.canUseFeature(PremiumFeature.GoldTracking)).toBe(false);
    expect(() => svc.assertFeature(PremiumFeature.VoiceEntry)).toThrow();
    try {
      svc.assertFeature(PremiumFeature.OcrScanner);
    } catch (e) {
      expect(isPremiumRequiredError(e)).toBe(true);
    }
  });

  it('unlocks premium features for active Premium users', async () => {
    const { svc } = build(premiumState(future()));
    await svc.init();
    expect(svc.canUseFeature(PremiumFeature.GoldTracking)).toBe(true);
    expect(() => svc.assertFeature(PremiumFeature.CloudBackup)).not.toThrow();
  });

  it('re-locks features once a subscription has expired', async () => {
    const { svc } = build(premiumState(past()));
    await svc.init();
    expect(svc.canUseFeature(PremiumFeature.MultiDeviceSync)).toBe(false);
  });
});

describe('EntitlementService — Free limits (events)', () => {
  it('allows creating an event under the limit', async () => {
    const { svc } = build(null, { events: 0 });
    await svc.init();
    await expect(svc.assertCanCreateEvent()).resolves.toBeUndefined();
  });

  it('blocks creating an event at the limit', async () => {
    const { svc } = build(null, { events: FREE_LIMITS.maxEvents });
    await svc.init();
    await expect(svc.assertCanCreateEvent()).rejects.toMatchObject({
      code: 'FREE_LIMIT_REACHED',
      kind: LimitKind.Events,
    });
  });

  it('never blocks event creation for Premium users', async () => {
    const { svc } = build(premiumState(future()), { events: 999 });
    await svc.init();
    await expect(svc.assertCanCreateEvent()).resolves.toBeUndefined();
  });
});

describe('EntitlementService — Free limits (entries per event)', () => {
  it('blocks the (N+1)th entry in an event for Free users', async () => {
    const { svc } = build(null, {
      entriesPerEvent: FREE_LIMITS.maxEntriesPerEvent,
    });
    await svc.init();
    let caught: unknown;
    try {
      await svc.assertCanAddEntry('event-1');
    } catch (e) {
      caught = e;
    }
    expect(isFreeLimitError(caught)).toBe(true);
    expect((caught as any).kind).toBe(LimitKind.EntriesPerEvent);
  });

  it('allows entries under the per-event limit', async () => {
    const { svc } = build(null, { entriesPerEvent: 10 });
    await svc.init();
    await expect(svc.assertCanAddEntry('event-1')).resolves.toBeUndefined();
  });
});

describe('EntitlementService — Free limits (people)', () => {
  it('blocks adding a person at the limit for Free users', async () => {
    const { svc } = build(null, { people: FREE_LIMITS.maxPeople });
    await svc.init();
    await expect(svc.assertCanAddPerson()).rejects.toMatchObject({
      kind: LimitKind.People,
    });
  });

  it('is unlimited for Premium users', async () => {
    const { svc } = build(premiumState(future()), { people: 10_000 });
    await svc.init();
    await expect(svc.assertCanAddPerson()).resolves.toBeUndefined();
  });
});

describe('EntitlementService — usage reporting', () => {
  it('reports finite limits for Free users', async () => {
    const { svc } = build(null, { events: 1, people: 3 });
    await svc.init();
    const usage = await svc.getUsage();
    expect(usage.events).toEqual({ used: 1, limit: FREE_LIMITS.maxEvents });
    expect(usage.people).toEqual({ used: 3, limit: FREE_LIMITS.maxPeople });
  });

  it('reports Infinity limits for Premium users', async () => {
    const { svc } = build(premiumState(future()), { events: 5, people: 5 });
    await svc.init();
    const usage = await svc.getUsage();
    expect(usage.events.limit).toBe(Number.POSITIVE_INFINITY);
    expect(usage.people.limit).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('EntitlementService — refresh', () => {
  it('adopts the state returned by SubscriptionService.verifyAndRefresh', async () => {
    const { svc } = build(null);
    await svc.init();
    const fresh = premiumState(future());
    stubSubscription.verifyAndRefresh.mockResolvedValueOnce(fresh);
    const result = await svc.refresh();
    expect(result.isPremium).toBe(true);
    expect(svc.isPremium()).toBe(true);
  });
});
