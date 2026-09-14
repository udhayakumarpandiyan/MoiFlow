import { v4 as uuidv4 } from 'uuid';

import { ICreditRepository } from '../repository/interfaces/ICreditRepository';
import { ISyncQueueRepository } from '../repository/interfaces/ISyncQueueRepository';
import {
  Credit,
  CreditFilter,
  CreditStatus,
  CreditTotals,
  CreateCreditInput,
} from '../finance/models/Credit';

/**
 * Finance / Credits business logic.
 *
 * Credits are per-person money transactions (IN = to receive, OUT = to give)
 * with an interest rate, counter-party details and an Upcoming/Settled
 * lifecycle. Independent from the Moi and Loans services. Marking a credit
 * SETTLED only flips its status and records the settled date — the record is
 * preserved in history. Optionally enqueues sync ops so credits flow through
 * the existing (Premium-gated) sync.
 */
export class CreditService {
  constructor(
    private readonly creditRepo: ICreditRepository,
    private readonly syncRepo?: ISyncQueueRepository,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async createCredit(input: CreateCreditInput): Promise<Credit> {
    this.validateInput(input);
    const now = new Date().toISOString();
    const status: CreditStatus = input.status ?? 'UPCOMING';
    const credit: Credit = {
      id: uuidv4(),
      direction: input.direction,
      amount: Number(input.amount) || 0,
      interestRate: Math.max(Number(input.interestRate) || 0, 0),
      date: input.date,
      person: input.person.trim(),
      village: input.village?.trim() || null,
      mobileNumber: input.mobileNumber?.trim() || null,
      eventId: input.eventId ?? null,
      eventName: input.eventName?.trim() || null,
      notes: input.notes?.trim() || null,
      status,
      settledDate:
        status === 'SETTLED'
          ? input.settledDate ?? now
          : input.settledDate ?? null,
      createdAt: now,
      updatedAt: now,
      syncStatus: 0,
    };

    await this.creditRepo.create(credit);
    await this.enqueue('CREATE', credit.id, credit);
    return credit;
  }

  async updateCredit(
    id: string,
    updates: Partial<CreateCreditInput>,
  ): Promise<Credit> {
    const existing = await this.creditRepo.getById(id);
    if (!existing) throw new Error(`Credit not found: ${id}`);

    const updated: Credit = {
      ...existing,
      direction: updates.direction ?? existing.direction,
      amount:
        updates.amount !== undefined
          ? Number(updates.amount) || 0
          : existing.amount,
      interestRate:
        updates.interestRate !== undefined
          ? Math.max(Number(updates.interestRate) || 0, 0)
          : existing.interestRate,
      date: updates.date ?? existing.date,
      person:
        updates.person !== undefined ? updates.person.trim() : existing.person,
      village:
        updates.village !== undefined
          ? updates.village?.trim() || null
          : existing.village,
      mobileNumber:
        updates.mobileNumber !== undefined
          ? updates.mobileNumber?.trim() || null
          : existing.mobileNumber,
      eventId:
        updates.eventId !== undefined ? updates.eventId ?? null : existing.eventId,
      eventName:
        updates.eventName !== undefined
          ? updates.eventName?.trim() || null
          : existing.eventName,
      notes:
        updates.notes !== undefined
          ? updates.notes?.trim() || null
          : existing.notes,
      status: updates.status ?? existing.status,
      settledDate:
        updates.settledDate !== undefined
          ? updates.settledDate ?? null
          : existing.settledDate,
      updatedAt: new Date().toISOString(),
      syncStatus: 0,
    };

    // Keep settledDate consistent with status.
    if (updated.status === 'SETTLED' && !updated.settledDate) {
      updated.settledDate = updated.updatedAt;
    }
    if (updated.status === 'UPCOMING') {
      updated.settledDate = null;
    }

    this.validateInput(updated);

    await this.creditRepo.update(updated);
    await this.enqueue('UPDATE', updated.id, updated);
    return updated;
  }

  async deleteCredit(id: string): Promise<void> {
    await this.cancelReminder(id);
    await this.creditRepo.delete(id);
    await this.enqueue('DELETE', id, { id });
  }

  async getCredit(id: string): Promise<Credit | null> {
    return this.creditRepo.getById(id);
  }

  async getCredits(filter?: CreditFilter): Promise<Credit[]> {
    return this.creditRepo.getAll(filter);
  }

  // ── Status transitions ──────────────────────────────────────────────────────

  /** Mark a credit as settled — records settled date, keeps the record. */
  async markSettled(id: string, settledDate?: string): Promise<Credit> {
    return this.setStatus(id, 'SETTLED', settledDate);
  }

  /** Re-open a settled credit back to Upcoming (clears settled date). */
  async markUpcoming(id: string): Promise<Credit> {
    return this.setStatus(id, 'UPCOMING');
  }

  /** Manually set a credit status (UPCOMING / SETTLED). */
  async setStatus(
    id: string,
    status: CreditStatus,
    settledDate?: string,
  ): Promise<Credit> {
    const credit = await this.creditRepo.getById(id);
    if (!credit) throw new Error(`Credit not found: ${id}`);
    const now = new Date().toISOString();
    const updated: Credit = {
      ...credit,
      status,
      settledDate:
        status === 'SETTLED' ? settledDate ?? credit.settledDate ?? now : null,
      updatedAt: now,
      syncStatus: 0,
    };
    await this.creditRepo.update(updated);
    await this.enqueue('UPDATE', updated.id, updated);
    if (status === 'SETTLED') {
      await this.cancelReminder(id);
    }
    return updated;
  }

  // ── Aggregate totals ──────────────────────────────────────────────────────

  async getTotals(): Promise<CreditTotals> {
    const credits = await this.creditRepo.getAll();
    return this.computeTotals(credits);
  }

  /** Pure aggregation of credits into summary totals. */
  computeTotals(credits: Credit[]): CreditTotals {
    const totals = credits.reduce<CreditTotals>(
      (acc, c) => {
        acc.count += 1;
        if (c.status === 'SETTLED') {
          acc.settledCount += 1;
          acc.settled += c.amount;
        } else {
          acc.upcomingCount += 1;
          if (c.direction === 'IN') acc.toReceive += c.amount;
          else acc.toGive += c.amount;
        }
        return acc;
      },
      {
        count: 0,
        toReceive: 0,
        toGive: 0,
        settled: 0,
        netPending: 0,
        upcomingCount: 0,
        settledCount: 0,
      },
    );
    totals.netPending = totals.toReceive - totals.toGive;
    return totals;
  }

  // ── Reminders (reuse the existing notifee-based NotificationService) ──────────

  /**
   * Schedule (or cancel) a reminder on the credit's transaction date. When
   * `enabled` is true it schedules a one-time reminder; when false it cancels
   * it. Loaded lazily to mirror the app's pattern and avoid a require cycle
   * with the DI container. Returns true when a reminder was scheduled.
   */
  async setDateReminder(credit: Credit, enabled: boolean): Promise<boolean> {
    try {
      const { notificationService } = require('./NotificationService');
      const reminderId = `credit-${credit.id}`;
      if (!enabled) {
        await notificationService.cancelLoanReminder(reminderId);
        return false;
      }
      if (credit.status === 'SETTLED') return false;
      const label = credit.direction === 'IN' ? 'To receive' : 'To give';
      const title = `Credit reminder · ${credit.person}`;
      const body = `${label} ₹${credit.amount.toLocaleString('en-IN')}`;
      return await notificationService.scheduleLoanReminder(
        reminderId,
        title,
        credit.date,
        body,
      );
    } catch {
      // Notification module unavailable — safe to ignore.
      return false;
    }
  }

  private async cancelReminder(creditId: string): Promise<void> {
    try {
      const { notificationService } = require('./NotificationService');
      await notificationService.cancelLoanReminder(`credit-${creditId}`);
    } catch {
      /* safe to ignore */
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private validateInput(input: {
    direction: string;
    amount: number;
    person: string;
    interestRate?: number;
    date?: string;
  }): void {
    if (input.direction !== 'IN' && input.direction !== 'OUT') {
      throw new Error('INVALID_DIRECTION');
    }
    if (!input.person || !String(input.person).trim()) {
      throw new Error('PERSON_REQUIRED');
    }
    if (!(Number(input.amount) > 0)) {
      throw new Error('AMOUNT_REQUIRED');
    }
    if (input.interestRate != null && Number(input.interestRate) < 0) {
      throw new Error('INVALID_INTEREST_RATE');
    }
    if (input.date != null && Number.isNaN(new Date(input.date).getTime())) {
      throw new Error('INVALID_DATE');
    }
  }

  private async enqueue(
    operation: 'CREATE' | 'UPDATE' | 'DELETE',
    entityId: string,
    payload: unknown,
  ): Promise<void> {
    if (!this.syncRepo) return;
    try {
      await this.syncRepo.add({
        id: uuidv4(),
        entityType: 'credit',
        entityId,
        operation,
        payload: JSON.stringify(payload),
        createdAt: new Date().toISOString(),
        retryCount: 0,
        lastError: null,
      });
    } catch {
      // Sync enqueue is best-effort; never block a local write on it.
    }
  }
}
