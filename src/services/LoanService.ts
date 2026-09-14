import { v4 as uuidv4 } from 'uuid';

import { ILoanRepository } from '../repository/interfaces/ILoanRepository';
import { ISyncQueueRepository } from '../repository/interfaces/ISyncQueueRepository';
import {
  Loan,
  LoanFilter,
  LoanSummary,
  LoanTotals,
  LoanStatus,
  ClosureSuggestion,
  CreateLoanInput,
  GoldLoanProvider,
  CreateGoldLoanProviderInput,
} from '../finance/models/Loan';
import {
  computeLoanSummary,
  closureSuggestions,
} from '../finance/loanCalculations';

/**
 * Finance / Loans business logic (EMI-based loans).
 *
 * Independent from Moi services. Outstanding amount, remaining EMIs, next EMI
 * date and closure suggestions are DERIVED via loanCalculations. Marking a loan
 * CLOSED only flips its status — the record is preserved in history. Optionally
 * enqueues sync ops so loans flow through the existing (Premium-gated) sync.
 */
export class LoanService {
  constructor(
    private readonly loanRepo: ILoanRepository,
    private readonly syncRepo?: ISyncQueueRepository,
  ) {}

  // ── Loans CRUD ──────────────────────────────────────────────────────────────

  async createLoan(input: CreateLoanInput): Promise<Loan> {
    this.validateLoanInput(input);
    const now = new Date().toISOString();
    const loan: Loan = {
      id: uuidv4(),
      loanType: input.loanType,
      loanAmount: Number(input.loanAmount) || 0,
      startDate: input.startDate,
      provider: input.provider.trim(),
      interestRate: Number(input.interestRate) || 0,
      monthlyEMI: Number(input.monthlyEMI) || 0,
      emiDate: clampEmiDay(input.emiDate),
      tenure: Math.max(Math.round(Number(input.tenure) || 0), 0),
      totalEMIs: Math.max(Math.round(Number(input.totalEMIs) || 0), 0),
      paidEMIs: Math.max(Math.round(Number(input.paidEMIs) || 0), 0),
      outstandingAmount:
        input.outstandingAmount != null ? Number(input.outstandingAmount) : null,
      status: input.status ?? 'ACTIVE',
      notes: input.notes?.trim() || null,
      createdAt: now,
      updatedAt: now,
      syncStatus: 0,
    };

    await this.loanRepo.create(loan);
    await this.enqueue('CREATE', 'loan', loan.id, loan);
    return loan;
  }

  async updateLoan(id: string, updates: Partial<CreateLoanInput>): Promise<Loan> {
    const existing = await this.loanRepo.getById(id);
    if (!existing) throw new Error(`Loan not found: ${id}`);

    const updated: Loan = {
      ...existing,
      ...updates,
      provider:
        updates.provider !== undefined
          ? updates.provider.trim()
          : existing.provider,
      loanAmount:
        updates.loanAmount !== undefined
          ? Number(updates.loanAmount) || 0
          : existing.loanAmount,
      interestRate:
        updates.interestRate !== undefined
          ? Number(updates.interestRate) || 0
          : existing.interestRate,
      monthlyEMI:
        updates.monthlyEMI !== undefined
          ? Number(updates.monthlyEMI) || 0
          : existing.monthlyEMI,
      emiDate:
        updates.emiDate !== undefined
          ? clampEmiDay(updates.emiDate)
          : existing.emiDate,
      tenure:
        updates.tenure !== undefined
          ? Math.max(Math.round(Number(updates.tenure) || 0), 0)
          : existing.tenure,
      totalEMIs:
        updates.totalEMIs !== undefined
          ? Math.max(Math.round(Number(updates.totalEMIs) || 0), 0)
          : existing.totalEMIs,
      paidEMIs:
        updates.paidEMIs !== undefined
          ? Math.max(Math.round(Number(updates.paidEMIs) || 0), 0)
          : existing.paidEMIs,
      outstandingAmount:
        updates.outstandingAmount !== undefined
          ? updates.outstandingAmount != null
            ? Number(updates.outstandingAmount)
            : null
          : existing.outstandingAmount,
      notes:
        updates.notes !== undefined
          ? updates.notes?.trim() || null
          : existing.notes,
      updatedAt: new Date().toISOString(),
      syncStatus: 0,
    };
    this.validateLoanInput(updated);

    await this.loanRepo.update(updated);
    await this.enqueue('UPDATE', 'loan', updated.id, updated);
    return updated;
  }

  async deleteLoan(id: string): Promise<void> {
    await this.cancelReminders(id);
    await this.loanRepo.delete(id);
    await this.enqueue('DELETE', 'loan', id, { id });
  }

  async getLoan(id: string): Promise<Loan | null> {
    return this.loanRepo.getById(id);
  }

  async getLoans(filter?: LoanFilter): Promise<Loan[]> {
    return this.loanRepo.getAll(filter);
  }

  /** Close a loan — flips status to CLOSED, keeps the record + cancels reminders. */
  async markClosed(id: string): Promise<Loan> {
    return this.setStatus(id, 'CLOSED');
  }

  /** Manually set a loan status (ACTIVE / CLOSED). */
  async setStatus(id: string, status: LoanStatus): Promise<Loan> {
    const loan = await this.loanRepo.getById(id);
    if (!loan) throw new Error(`Loan not found: ${id}`);
    const updated: Loan = {
      ...loan,
      status,
      updatedAt: new Date().toISOString(),
      syncStatus: 0,
    };
    await this.loanRepo.update(updated);
    await this.enqueue('UPDATE', 'loan', updated.id, updated);
    if (status === 'CLOSED') {
      await this.cancelReminders(id);
    }
    return updated;
  }

  // ── Derived summaries ─────────────────────────────────────────────────────────

  /** Full computed summary for one loan. */
  async getLoanSummary(id: string): Promise<LoanSummary | null> {
    const loan = await this.loanRepo.getById(id);
    if (!loan) return null;
    return computeLoanSummary(loan);
  }

  /** Loans + their summaries for a filter. */
  async getLoanSummaries(filter?: LoanFilter): Promise<LoanSummary[]> {
    const loans = await this.loanRepo.getAll(filter);
    return loans.map(loan => computeLoanSummary(loan));
  }

  /** Aggregate totals for the dashboard/list header. */
  async getTotals(): Promise<LoanTotals> {
    const summaries = await this.getLoanSummaries();
    return this.computeTotals(summaries);
  }

  /** Pure aggregation of summaries into totals. */
  computeTotals(summaries: LoanSummary[]): LoanTotals {
    return summaries.reduce<LoanTotals>(
      (acc, s) => {
        acc.loanCount += 1;
        if (s.loan.status === 'ACTIVE') {
          acc.activeCount += 1;
          acc.totalOutstanding += s.outstandingAmount;
          acc.totalMonthlyEMI += s.loan.monthlyEMI;
        } else {
          acc.closedCount += 1;
        }
        return acc;
      },
      {
        loanCount: 0,
        activeCount: 0,
        closedCount: 0,
        totalOutstanding: 0,
        totalMonthlyEMI: 0,
      },
    );
  }

  /** "Close Loan Faster" suggestions for a loan. */
  getClosureSuggestions(loan: Loan): ClosureSuggestion[] {
    return closureSuggestions(loan);
  }

  // ── Reminders (reuse the existing notifee-based NotificationService) ───────────

  /**
   * Schedule (or cancel) the next-EMI reminder for a loan. When `enabled` is
   * true it schedules a one-time reminder on the loan's next EMI date; when
   * false it cancels it. Loaded lazily to mirror the app's pattern and avoid a
   * require cycle with the DI container.
   */
  async setEmiReminder(loan: Loan, enabled: boolean): Promise<boolean> {
    return this.scheduleReminder(loan, 'emi', enabled);
  }

  /** Schedule (or cancel) a due-date reminder on the loan's next EMI date. */
  async setDueDateReminder(loan: Loan, enabled: boolean): Promise<boolean> {
    return this.scheduleReminder(loan, 'due', enabled);
  }

  private async scheduleReminder(
    loan: Loan,
    kind: 'emi' | 'due',
    enabled: boolean,
  ): Promise<boolean> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { notificationService } = require('./NotificationService');
      const id = `loan-${kind}-${loan.id}`;
      if (!enabled) {
        await notificationService.cancelLoanReminder(id);
        return false;
      }
      const summary = computeLoanSummary(loan);
      if (!summary.nextEmiDate) return false;
      const title =
        kind === 'emi'
          ? `EMI reminder · ${loan.provider}`
          : `EMI due · ${loan.provider}`;
      const body = `Monthly EMI ₹${loan.monthlyEMI.toLocaleString('en-IN')}`;
      return await notificationService.scheduleLoanReminder(
        id,
        title,
        summary.nextEmiDate,
        body,
      );
    } catch {
      // Notification module unavailable — safe to ignore.
      return false;
    }
  }

  private async cancelReminders(loanId: string): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { notificationService } = require('./NotificationService');
      await notificationService.cancelLoanReminder(`loan-emi-${loanId}`);
      await notificationService.cancelLoanReminder(`loan-due-${loanId}`);
    } catch {
      /* safe to ignore */
    }
  }

  // ── Gold loan comparison (configurable providers) ────────────────────────────

  async getGoldProviders(): Promise<GoldLoanProvider[]> {
    return this.loanRepo.getGoldProviders();
  }

  async saveGoldProvider(
    input: CreateGoldLoanProviderInput,
    id?: string,
  ): Promise<GoldLoanProvider> {
    if (!input.provider || !input.provider.trim()) {
      throw new Error('PROVIDER_REQUIRED');
    }
    const provider: GoldLoanProvider = {
      id: id ?? uuidv4(),
      provider: input.provider.trim(),
      interestRate: Number(input.interestRate) || 0,
      amountPerGram: Number(input.amountPerGram) || 0,
      ltv: Number(input.ltv) || 0,
      processingFee: Number(input.processingFee) || 0,
      otherCharges: input.otherCharges?.trim() || null,
      updatedAt: new Date().toISOString(),
    };
    await this.loanRepo.upsertGoldProvider(provider);
    return provider;
  }

  async deleteGoldProvider(id: string): Promise<void> {
    await this.loanRepo.deleteGoldProvider(id);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private validateLoanInput(input: {
    provider: string;
    loanAmount: number;
    monthlyEMI: number;
    interestRate: number;
  }): void {
    if (!input.provider || !String(input.provider).trim()) {
      throw new Error('PROVIDER_REQUIRED');
    }
    if (!(Number(input.loanAmount) > 0)) {
      throw new Error('LOAN_AMOUNT_REQUIRED');
    }
    if (!(Number(input.monthlyEMI) > 0)) {
      throw new Error('EMI_REQUIRED');
    }
    if (Number(input.interestRate) < 0) {
      throw new Error('INVALID_INTEREST_RATE');
    }
  }

  private async enqueue(
    operation: 'CREATE' | 'UPDATE' | 'DELETE',
    entityType: 'loan',
    entityId: string,
    payload: unknown,
  ): Promise<void> {
    if (!this.syncRepo) return;
    try {
      await this.syncRepo.add({
        id: uuidv4(),
        entityType,
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

function clampEmiDay(day: number | undefined): number {
  let d = Math.round(Number(day) || 1);
  if (Number.isNaN(d) || d < 1) d = 1;
  if (d > 31) d = 31;
  return d;
}
