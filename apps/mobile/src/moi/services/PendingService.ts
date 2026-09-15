import { IPendingRepository } from '@moi/repository/interfaces/IPendingRepository';
import {
  PendingItem,
  PendingFilter,
  PendingTotals,
  PendingDirection,
  Settlement,
} from '@moi/models/Pending';

/**
 * Application service for Pending Payments & Receivables.
 *
 * Thin orchestration over PendingRepository:
 *  - getReceivables / getPayables with filters + summary totals
 *  - settle (partial or full) — appends to the ledger, never mutates entries
 *  - reminders — persists the follow-up date and schedules a local notification
 *    via the existing NotificationService (loaded lazily to avoid a require cycle)
 */
export class PendingService {
  constructor(private readonly repo: IPendingRepository) {}

  // ── Queries ────────────────────────────────────────────────────────────────

  async getPending(filter?: PendingFilter): Promise<PendingItem[]> {
    return this.repo.getPending(filter);
  }

  async getReceivables(filter?: PendingFilter): Promise<PendingItem[]> {
    return this.repo.getPending({ ...filter, direction: 'RECEIVABLE' });
  }

  async getPayables(filter?: PendingFilter): Promise<PendingItem[]> {
    return this.repo.getPending({ ...filter, direction: 'PAYABLE' });
  }

  /** Compute summary totals over a set of pending items (outstanding only). */
  computeTotals(items: PendingItem[]): PendingTotals {
    return items.reduce<PendingTotals>(
      (acc, item) => {
        if (item.direction === 'RECEIVABLE') {
          acc.receivableCash += item.pendingCash;
          acc.receivableGold += item.pendingGold;
          if (item.pendingCash > 0 || item.pendingGold > 0) acc.receivableCount += 1;
        } else {
          acc.payableCash += item.pendingCash;
          acc.payableGold += item.pendingGold;
          if (item.pendingCash > 0 || item.pendingGold > 0) acc.payableCount += 1;
        }
        return acc;
      },
      {
        receivableCash: 0,
        receivableGold: 0,
        payableCash: 0,
        payableGold: 0,
        receivableCount: 0,
        payableCount: 0,
      },
    );
  }

  /** Convenience: pending items + their totals in one call. */
  async getPendingWithTotals(
    filter?: PendingFilter,
  ): Promise<{ items: PendingItem[]; totals: PendingTotals }> {
    const items = await this.repo.getPending(filter);
    return { items, totals: this.computeTotals(items) };
  }

  // ── Settlement ──────────────────────────────────────────────────────────────

  /**
   * Record a settlement against a pending item.
   *
   * - `cash`/`gold` are the amounts received (receivable) or paid (payable) now.
   * - Amounts are clamped to the outstanding balance so a settlement can never
   *   exceed what is due.
   * - Appends to the ledger; original entries are untouched (history preserved).
   * - Returns the refreshed pending item (with new status/outstanding), or null
   *   if the line is now fully settled and no longer pending.
   */
  async settle(
    item: PendingItem,
    cash: number,
    gold: number,
    note?: string | null,
  ): Promise<{ settlement: Settlement; updated: PendingItem | null }> {
    const settledCash = clampNonNeg(Math.min(cash || 0, item.pendingCash));
    const settledGold = clampNonNeg(Math.min(gold || 0, item.pendingGold));

    if (settledCash <= 0 && settledGold <= 0) {
      throw new Error('SETTLEMENT_AMOUNT_REQUIRED');
    }

    const settlement = await this.repo.addSettlement({
      direction: item.direction,
      personId: item.personId,
      personName: item.personName,
      eventId: item.eventId ?? null,
      settledCash,
      settledGold,
      note: note ?? null,
    });

    // Re-fetch just this person's pending line to reflect the new balance.
    const refreshed = await this.repo.getPending({
      direction: item.direction,
      personId: item.personId,
      perEvent: item.eventId != null,
      ...(item.eventId ? { eventId: item.eventId } : {}),
    });
    const updated =
      refreshed.find(r => r.key === item.key) ?? null;

    return { settlement, updated };
  }

  /** Mark a receivable fully received (settles the entire outstanding balance). */
  async markReceived(item: PendingItem, note?: string | null) {
    return this.settle(item, item.pendingCash, item.pendingGold, note);
  }

  /** Mark a payable fully paid (settles the entire outstanding balance). */
  async markPaid(item: PendingItem, note?: string | null) {
    return this.settle(item, item.pendingCash, item.pendingGold, note);
  }

  async getSettlementHistory(
    personId: string,
    eventId?: string | null,
  ): Promise<Settlement[]> {
    return this.repo.getSettlements(personId, eventId);
  }

  // ── Reminders ────────────────────────────────────────────────────────────────

  /**
   * Set a follow-up reminder for a pending item. Persists the date and schedules
   * a local notification via the existing NotificationService. Returns true when
   * a notification was actually scheduled (future date + permission granted).
   */
  async setReminder(item: PendingItem, remindAtISO: string): Promise<boolean> {
    await this.repo.setReminder(
      item.key,
      item.personId,
      item.eventId ?? null,
      item.direction,
      remindAtISO,
    );

    try {
      // Loaded lazily so this service has no hard dependency on the native
      // notification module (and to mirror the app's existing pattern).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { notificationService } = require('@common/services/NotificationService');
      const title =
        item.direction === 'RECEIVABLE'
          ? `Follow up: ${item.personName}`
          : `Payment due: ${item.personName}`;
      const body =
        item.direction === 'RECEIVABLE'
          ? 'Amount to receive is pending.'
          : 'Amount to pay is pending.';
      // Namespaced id so it doesn't collide with event reminders.
      return await notificationService.scheduleEventNotification(
        `pending-${item.key}`,
        title,
        remindAtISO,
        body,
      );
    } catch {
      return false;
    }
  }

  async clearReminder(item: PendingItem): Promise<void> {
    await this.repo.clearReminder(item.key);
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { notificationService } = require('@common/services/NotificationService');
      await notificationService.cancelEventNotification(`pending-${item.key}`);
    } catch {
      /* notification module unavailable — safe to ignore */
    }
  }
}

function clampNonNeg(n: number): number {
  return n > 0 ? n : 0;
}

export type { PendingItem, PendingFilter, PendingTotals, PendingDirection };
