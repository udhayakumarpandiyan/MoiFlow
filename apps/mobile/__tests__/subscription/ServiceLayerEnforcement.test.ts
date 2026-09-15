/**
 * Verifies Free limits + premium gating are enforced in the SERVICE layer
 * (EntryService, EventService, PersonService) — not just the UI.
 */

import { EntryService } from '../../src/moi/services/EntryService';
import { EventService } from '../../src/moi/services/EventService';
import { PersonService } from '../../src/moi/services/PersonService';
import { EntitlementService } from '../../src/common/subscription/EntitlementService';
import { FREE_LIMITS } from '../../src/common/subscription/subscriptionConfig';
import {
  EntitlementState,
  isFreeLimitError,
  isPremiumRequiredError,
} from '../../src/common/subscription/types';
import type { IEntitlementRepository } from '../../src/common/repository/interfaces/IEntitlementRepository';

class FakeEntitlementRepo implements IEntitlementRepository {
  state: EntitlementState | null;
  constructor(s: EntitlementState | null) {
    this.state = s;
  }
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

const premium = (): EntitlementState => ({
  isPremium: true,
  planId: 'yearly',
  productId: 'moiflow_yearly',
  expiryAt: new Date(Date.now() + 86_400_000).toISOString(),
  latestPurchaseAt: new Date().toISOString(),
  lastVerifiedAt: new Date().toISOString(),
  source: 'play',
  fromCacheOnly: false,
});

function buildEntitlement(
  state: EntitlementState | null,
  counts: { events?: number; entries?: number; people?: number } = {},
) {
  const eventRepo: any = { getAll: jest.fn(async () => new Array(counts.events ?? 0).fill({})) };
  const entryRepo: any = { getAll: jest.fn(async () => new Array(counts.entries ?? 0).fill({})) };
  const personRepo: any = { getAll: jest.fn(async () => new Array(counts.people ?? 0).fill({})) };
  const ent = new EntitlementService(
    new FakeEntitlementRepo(state),
    { verifyAndRefresh: jest.fn() } as any,
    eventRepo,
    entryRepo,
    personRepo,
  );
  return ent;
}

describe('EventService — event limit enforcement', () => {
  it('throws FreeLimitError when a Free user is at the event cap', async () => {
    const ent = buildEntitlement(null, { events: FREE_LIMITS.maxEvents });
    await ent.init();
    const eventRepo: any = { create: jest.fn() };
    const syncRepo: any = { add: jest.fn() };
    const svc = new EventService(eventRepo, syncRepo, ent);

    let caught: unknown;
    try {
      await svc.createEvent({ name: 'Wedding', type: 'wedding', ownerType: 'SELF' } as any);
    } catch (e) {
      caught = e;
    }
    expect(isFreeLimitError(caught)).toBe(true);
    expect(eventRepo.create).not.toHaveBeenCalled();
  });

  it('allows event creation for Premium users', async () => {
    const ent = buildEntitlement(premium(), { events: 50 });
    await ent.init();
    const eventRepo: any = { create: jest.fn() };
    const syncRepo: any = { add: jest.fn() };
    const svc = new EventService(eventRepo, syncRepo, ent);
    await svc.createEvent({ name: 'Wedding', type: 'wedding', ownerType: 'SELF' } as any);
    expect(eventRepo.create).toHaveBeenCalledTimes(1);
  });
});

describe('EntryService — gold gate + entry limit', () => {
  const baseInput = {
    personName: 'Ravi',
    entryType: 'OWN_EVENT' as const,
    eventId: 'evt-1',
    cashAmount: 100,
    goldWeight: 0,
  };

  it('blocks gold entries for Free users (PremiumRequiredError)', async () => {
    const ent = buildEntitlement(null, { entries: 0 });
    await ent.init();
    const entryRepo: any = { create: jest.fn() };
    const personRepo: any = {
      findOrCreate: jest.fn(async () => ({ id: 'p1', name: 'Ravi' })),
      search: jest.fn(async () => []),
    };
    const syncRepo: any = { add: jest.fn() };
    const svc = new EntryService(entryRepo, personRepo, syncRepo, ent);

    let caught: unknown;
    try {
      await svc.addEntry({ ...baseInput, goldWeight: 8 } as any);
    } catch (e) {
      caught = e;
    }
    expect(isPremiumRequiredError(caught)).toBe(true);
    expect(entryRepo.create).not.toHaveBeenCalled();
  });

  it('blocks the (N+1)th entry per event for Free users', async () => {
    const ent = buildEntitlement(null, { entries: FREE_LIMITS.maxEntriesPerEvent });
    await ent.init();
    const entryRepo: any = { create: jest.fn() };
    const personRepo: any = {
      findOrCreate: jest.fn(async () => ({ id: 'p1', name: 'Ravi' })),
      search: jest.fn(async () => [{ id: 'p1', name: 'Ravi' }]),
    };
    const syncRepo: any = { add: jest.fn() };
    const svc = new EntryService(entryRepo, personRepo, syncRepo, ent);

    await expect(svc.addEntry(baseInput as any)).rejects.toMatchObject({
      code: 'FREE_LIMIT_REACHED',
    });
    expect(entryRepo.create).not.toHaveBeenCalled();
  });

  it('allows a normal cash entry for Free users under the caps', async () => {
    const ent = buildEntitlement(null, { entries: 0, people: 0 });
    await ent.init();
    const entryRepo: any = { create: jest.fn() };
    const personRepo: any = {
      findOrCreate: jest.fn(async () => ({ id: 'p1', name: 'Ravi' })),
      search: jest.fn(async () => []),
    };
    const syncRepo: any = { add: jest.fn() };
    const svc = new EntryService(entryRepo, personRepo, syncRepo, ent);

    const entry = await svc.addEntry(baseInput as any);
    expect(entry.cashAmount).toBe(100);
    expect(entryRepo.create).toHaveBeenCalledTimes(1);
  });

  it('allows gold entries for Premium users', async () => {
    const ent = buildEntitlement(premium(), { entries: 500 });
    await ent.init();
    const entryRepo: any = { create: jest.fn() };
    const personRepo: any = {
      findOrCreate: jest.fn(async () => ({ id: 'p1', name: 'Ravi' })),
      search: jest.fn(async () => []),
    };
    const syncRepo: any = { add: jest.fn() };
    const svc = new EntryService(entryRepo, personRepo, syncRepo, ent);

    const entry = await svc.addEntry({ ...baseInput, goldWeight: 8 } as any);
    expect(entry.goldWeight).toBe(8);
    expect(entryRepo.create).toHaveBeenCalledTimes(1);
  });
});

describe('PersonService — people limit enforcement', () => {
  it('blocks a NEW person for Free users at the cap', async () => {
    const ent = buildEntitlement(null, { people: FREE_LIMITS.maxPeople });
    await ent.init();
    const personRepo: any = {
      search: jest.fn(async () => []), // no existing match → would create new
      findOrCreate: jest.fn(async () => ({ id: 'pX', name: 'New Person' })),
    };
    const svc = new PersonService(personRepo, ent);

    await expect(svc.findOrCreatePerson('New Person')).rejects.toMatchObject({
      code: 'FREE_LIMIT_REACHED',
    });
    expect(personRepo.findOrCreate).not.toHaveBeenCalled();
  });

  it('allows referencing an EXISTING person even at the cap', async () => {
    const ent = buildEntitlement(null, { people: FREE_LIMITS.maxPeople });
    await ent.init();
    const existing = { id: 'p1', name: 'Ravi', villageName: undefined };
    const personRepo: any = {
      search: jest.fn(async () => [existing]),
      findOrCreate: jest.fn(async () => existing),
    };
    const svc = new PersonService(personRepo, ent);

    const person = await svc.findOrCreatePerson('Ravi');
    expect(person.id).toBe('p1');
    expect(personRepo.findOrCreate).toHaveBeenCalled();
  });
});
