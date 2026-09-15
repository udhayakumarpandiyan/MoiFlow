/**
 * PendingService tests.
 *
 * Covers: receivable/payable totals, cash/gold pending, full + partial
 * settlement (with clamping to outstanding), status transitions, direction
 * routing, and reminder delegation. Uses a FAKE IPendingRepository so no SQLite
 * is required.
 */

import { PendingService } from '../../src/moi/services/PendingService';
import type { IPendingRepository } from '../../src/moi/repository/interfaces/IPendingRepository';
import type {
  PendingItem,
  PendingFilter,
  Settlement,
  CreateSettlementInput,
  PendingDirection,
  PendingStatus,
} from '../../src/moi/models/Pending';

// ── Test data builders ────────────────────────────────────────────────────────

function makeItem(overrides: Partial<PendingItem> = {}): PendingItem {
  const dueCash = overrides.dueCash ?? 1000;
  const dueGold = overrides.dueGold ?? 0;
  const settledCash = overrides.settledCash ?? 0;
  const settledGold = overrides.settledGold ?? 0;
  const pendingCash = overrides.pendingCash ?? Math.max(dueCash - settledCash, 0);
  const pendingGold = overrides.pendingGold ?? Math.max(dueGold - settledGold, 0);
  return {
    key: overrides.key ?? 'RECEIVABLE:p1:ALL',
    direction: overrides.direction ?? 'RECEIVABLE',
    personId: overrides.personId ?? 'p1',
    personName: overrides.personName ?? 'Ravi',
    villageName: overrides.villageName ?? null,
    eventId: overrides.eventId ?? null,
    eventName: overrides.eventName ?? null,
    eventDate: overrides.eventDate ?? null,
    dueCash,
    dueGold,
    settledCash,
    settledGold,
    pendingCash,
    pendingGold,
    status: overrides.status ?? 'PENDING',
    lastEntryDate: overrides.lastEntryDate ?? '2026-01-01',
    reminderAt: overrides.reminderAt ?? null,
  };
}

/**
 * Fake repository backed by a settlement ledger array. getPending recomputes
 * outstanding from a fixed "due" map minus recorded settlements so we can assert
 * status transitions after settle().
 */
class FakePendingRepository implements IPendingRepository {
  settlements: Settlement[] = [];
  reminders: Record<string, string> = {};

  // Fixed derived-due per direction+person (simulates entries aggregation).
  due: Record<string, { cash: number; gold: number; personName: string }> = {};

  async getPending(filter?: PendingFilter): Promise<PendingItem[]> {
    const out: PendingItem[] = [];
    for (const [dpKey, due] of Object.entries(this.due)) {
      const [direction, personId] = dpKey.split('|') as [PendingDirection, string];
      if (filter?.direction && filter.direction !== direction) continue;
      if (filter?.personId && filter.personId !== personId) continue;

      const settled = this.settlements
        .filter(s => s.direction === direction && s.personId === personId)
        .reduce(
          (acc, s) => ({ cash: acc.cash + s.settledCash, gold: acc.gold + s.settledGold }),
          { cash: 0, gold: 0 },
        );

      const pendingCash = Math.max(due.cash - settled.cash, 0);
      const pendingGold = Math.max(due.gold - settled.gold, 0);
      const status: PendingStatus =
        pendingCash <= 0 && pendingGold <= 0
          ? 'SETTLED'
          : pendingCash < due.cash || pendingGold < due.gold
          ? 'PARTIAL'
          : 'PENDING';

      // Only emit lines with a positive gross due.
      if (due.cash <= 0 && due.gold <= 0) continue;
      // Fully-settled lines are hidden unless SETTLED is explicitly requested
      // (mirrors the real PendingRepository behavior).
      if (status === 'SETTLED' && filter?.status !== 'SETTLED') continue;

      out.push(
        makeItem({
          key: `${direction}:${personId}:ALL`,
          direction,
          personId,
          personName: due.personName,
          dueCash: due.cash,
          dueGold: due.gold,
          settledCash: Math.min(settled.cash, due.cash),
          settledGold: Math.min(settled.gold, due.gold),
          pendingCash,
          pendingGold,
          status,
        }),
      );
    }
    // Apply cash/gold/status post-filters like the real repo.
    return out.filter(i => {
      if (filter?.status && i.status !== filter.status) return false;
      if (filter?.cashOnly && i.pendingCash <= 0) return false;
      if (filter?.goldOnly && i.pendingGold <= 0) return false;
      return true;
    });
  }

  async addSettlement(input: CreateSettlementInput): Promise<Settlement> {
    const now = new Date().toISOString();
    const s: Settlement = {
      id: `s${this.settlements.length + 1}`,
      direction: input.direction,
      personId: input.personId,
      personName: input.personName,
      eventId: input.eventId ?? null,
      settledCash: input.settledCash,
      settledGold: input.settledGold,
      note: input.note ?? null,
      settledAt: now,
      createdAt: now,
    };
    this.settlements.push(s);
    return s;
  }

  async getSettlements(personId: string): Promise<Settlement[]> {
    return this.settlements.filter(s => s.personId === personId);
  }

  async setReminder(key: string, _p: string, _e: string | null, _d: string, remindAtISO: string) {
    this.reminders[key] = remindAtISO;
  }
  async clearReminder(key: string) {
    delete this.reminders[key];
  }
  async getReminders(keys: string[]): Promise<Record<string, string>> {
    const map: Record<string, string> = {};
    for (const k of keys) if (this.reminders[k]) map[k] = this.reminders[k];
    return map;
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('PendingService — totals', () => {
  const svc = new PendingService(new FakePendingRepository());

  it('sums receivable and payable cash/gold separately', () => {
    const totals = svc.computeTotals([
      makeItem({ direction: 'RECEIVABLE', pendingCash: 1000, pendingGold: 2 }),
      makeItem({ direction: 'RECEIVABLE', personId: 'p2', pendingCash: 500, pendingGold: 0 }),
      makeItem({ direction: 'PAYABLE', personId: 'p3', pendingCash: 300, pendingGold: 1 }),
    ]);
    expect(totals.receivableCash).toBe(1500);
    expect(totals.receivableGold).toBe(2);
    expect(totals.payableCash).toBe(300);
    expect(totals.payableGold).toBe(1);
    expect(totals.receivableCount).toBe(2);
    expect(totals.payableCount).toBe(1);
  });

  it('does not count fully-settled (zero-pending) items', () => {
    const totals = svc.computeTotals([
      makeItem({ direction: 'RECEIVABLE', pendingCash: 0, pendingGold: 0 }),
    ]);
    expect(totals.receivableCount).toBe(0);
    expect(totals.receivableCash).toBe(0);
  });
});

describe('PendingService — receivable/payable routing', () => {
  it('getReceivables forces direction RECEIVABLE, getPayables forces PAYABLE', async () => {
    const repo = new FakePendingRepository();
    const spy = jest.spyOn(repo, 'getPending');
    const svc = new PendingService(repo);

    await svc.getReceivables({ personId: 'p1' });
    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ direction: 'RECEIVABLE', personId: 'p1' }),
    );

    await svc.getPayables();
    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ direction: 'PAYABLE' }),
    );
  });
});

describe('PendingService — settlement (full + partial + clamping)', () => {
  let repo: FakePendingRepository;
  let svc: PendingService;

  beforeEach(() => {
    repo = new FakePendingRepository();
    repo.due = { 'RECEIVABLE|p1': { cash: 1000, gold: 4, personName: 'Ravi' } };
    svc = new PendingService(repo);
  });

  it('partial settlement leaves outstanding and marks PARTIAL', async () => {
    const [item] = await svc.getReceivables({ personId: 'p1' });
    const { settlement, updated } = await svc.settle(item, 400, 0);
    expect(settlement.settledCash).toBe(400);
    expect(updated?.pendingCash).toBe(600);
    expect(updated?.status).toBe('PARTIAL');
  });

  it('full settlement (markReceived) removes the line from the pending list', async () => {
    const [item] = await svc.getReceivables({ personId: 'p1' });
    const { updated } = await svc.markReceived(item);
    // Fully settled → no longer pending, so it drops out of the default list.
    expect(updated).toBeNull();
    const remaining = await svc.getReceivables({ personId: 'p1' });
    expect(remaining).toHaveLength(0);
    // ...but it is still visible when explicitly querying SETTLED.
    const settled = await svc.getReceivables({ personId: 'p1', status: 'SETTLED' });
    expect(settled[0].status).toBe('SETTLED');
    expect(settled[0].pendingCash).toBe(0);
  });

  it('clamps a settlement that exceeds the outstanding balance', async () => {
    const [item] = await svc.getReceivables({ personId: 'p1' });
    const { settlement } = await svc.settle(item, 5000, 99);
    // Cannot settle more than due (1000 cash / 4 gold).
    expect(settlement.settledCash).toBe(1000);
    expect(settlement.settledGold).toBe(4);
  });

  it('accumulates multiple partial settlements', async () => {
    let [item] = await svc.getReceivables({ personId: 'p1' });
    await svc.settle(item, 300, 1);
    [item] = await svc.getReceivables({ personId: 'p1' });
    expect(item.pendingCash).toBe(700);
    expect(item.pendingGold).toBe(3);
    await svc.settle(item, 700, 3);
    // Fully settled now — gone from the default pending list.
    const remaining = await svc.getReceivables({ personId: 'p1' });
    expect(remaining).toHaveLength(0);
    const settled = await svc.getReceivables({ personId: 'p1', status: 'SETTLED' });
    expect(settled[0].status).toBe('SETTLED');
  });

  it('rejects a zero-amount settlement', async () => {
    const [item] = await svc.getReceivables({ personId: 'p1' });
    await expect(svc.settle(item, 0, 0)).rejects.toThrow('SETTLEMENT_AMOUNT_REQUIRED');
  });

  it('preserves settlement history (append-only)', async () => {
    const [item] = await svc.getReceivables({ personId: 'p1' });
    await svc.settle(item, 200, 0, 'first');
    const [item2] = await svc.getReceivables({ personId: 'p1' });
    await svc.settle(item2, 200, 0, 'second');
    const history = await svc.getSettlementHistory('p1');
    expect(history).toHaveLength(2);
  });
});

describe('PendingService — filters (cash/gold/status)', () => {
  it('cashOnly excludes gold-only pending lines', async () => {
    const repo = new FakePendingRepository();
    repo.due = {
      'RECEIVABLE|p1': { cash: 0, gold: 5, personName: 'GoldOnly' },
      'RECEIVABLE|p2': { cash: 800, gold: 0, personName: 'CashOnly' },
    };
    const svc = new PendingService(repo);
    const cashOnly = await svc.getReceivables({ cashOnly: true });
    expect(cashOnly.map(i => i.personName)).toEqual(['CashOnly']);
  });

  it('status filter returns only matching items', async () => {
    const repo = new FakePendingRepository();
    repo.due = { 'RECEIVABLE|p1': { cash: 1000, gold: 0, personName: 'Ravi' } };
    const svc = new PendingService(repo);
    let [item] = await svc.getReceivables({});
    await svc.settle(item, 400, 0); // now PARTIAL
    const partials = await svc.getReceivables({ status: 'PARTIAL' });
    expect(partials).toHaveLength(1);
    const pendings = await svc.getReceivables({ status: 'PENDING' });
    expect(pendings).toHaveLength(0);
  });
});

describe('PendingService — reminders', () => {
  it('persists a reminder via the repository', async () => {
    const repo = new FakePendingRepository();
    const svc = new PendingService(repo);
    const item = makeItem({ key: 'RECEIVABLE:p1:ALL' });
    // NotificationService require will fail in jest (native) → returns false,
    // but the repo persistence must still happen.
    await svc.setReminder(item, new Date(Date.now() + 86400000).toISOString());
    expect(repo.reminders['RECEIVABLE:p1:ALL']).toBeDefined();
  });
});
