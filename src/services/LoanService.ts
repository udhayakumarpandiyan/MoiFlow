import { v4 as uuidv4 } from 'uuid';

import { ILoanRepository } from '../repository/interfaces/ILoanRepository';
import { ISyncQueueRepository } from '../repository/interfaces/ISyncQueueRepository';
import {
  Loan,
  LoanPayment,
  LoanFilter,
  LoanSummary,
  LoanTotals,
  LoanDirection,
  LoanStatus,
  CreateLoanInput,
  CreateLoanPaymentInput,
} from '../finance/models/Loan';
import { computeLoanSummary, deriveStatus } from '../finance/loanCalculations';

/**
 * Finance / Loans business logic.
 *
 * Independent from Moi services. All financial figures (interest, outstanding,
 * paid) are DERIVED via loanCalculations — the loan row's principal/interest is
 * never overwritten. Payments are append-only. Optionally enqueues sync ops so
 * loans flow through the existing (Premium-gated) Firebase sync when enabled.
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
      direction: input.direction,
      loanType: input.loanType,
      partyType: input.partyType,
      partyName: input.partyName.trim(),
      partyVillage: input.partyVillage?.trim() || null,
      partyPhone: input.partyPhone?.trim() || null,
      partyContact: input.partyContact?.trim() || null,
      principal: Number(input.principal) || 0,
      interestRate: Number(input.interestRate) || 0,
      interestType: input.interestType,
      loanDate: input.loanDate,
      dueDate: input.dueDate ?? null,
      status: input.status ?? 'PENDING',
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
      // Coerce trimmed/typed fields where provided.
      partyName: (updates.partyName ?? existing.partyName).trim(),
      partyVillage:
        updates.partyVillage !== undefined
          ? updates.partyVillage?.trim() || null
          : existing.partyVillage,
      partyPhone:
        updates.partyPhone !== undefined
          ? updates.partyPhone?.trim() || null
          : existing.partyPhone,
      partyContact:
        updates.partyContact !== undefined
          ? updates.partyContact?.trim() || null
          : existing.partyContact,
      principal:
        updates.principal !== undefined
          ? Number(updates.principal) || 0
          : existing.principal,
      interestRate:
        updates.interestRate !== undefined
          ? Number(updates.interestRate) || 0
          : existing.interestRate,
      updatedAt: new Date().toISOString(),
      syncStatus: 0,
    };
    this.validateLoanInput(updated);

    await this.loanRepo.update(updated);
    await this.enqueue('UPDATE', 'loan', updated.id, updated);
    return updated;
  }

  async deleteLoan(id: string): Promise<void> {
    await this.loanRepo.delete(id);
    await this.enqueue('DELETE', 'loan', id, { id });
  }

  async getLoan(id: string): Promise<Loan | null> {
    return this.loanRepo.getById(id);
  }

  async getLoans(filter?: LoanFilter): Promise<Loan[]> {
    return this.loanRepo.getAll(filter);
  }

  // ── Derived summaries ─────────────────────────────────────────────────────────

  /** Full computed summary for one loan (interest, paid, outstanding). */
  async getLoanSummary(id: string, asOf?: string): Promise<LoanSummary | null> {
    const loan = await this.loanRepo.getById(id);
    if (!loan) return null;
    const payments = await this.loanRepo.getPayments(id);
    return computeLoanSummary(loan, payments, asOf);
  }

  /** Loans + their summaries for a filter, in one efficient pass. */
  async getLoanSummaries(
    filter?: LoanFilter,
    asOf?: string,
  ): Promise<LoanSummary[]> {
    const loans = await this.loanRepo.getAll(filter);
    if (loans.length === 0) return [];
    const paymentsByLoan = await this.loanRepo.getPaymentsForLoans(
      loans.map(l => l.id),
    );
    return loans.map(loan =>
      computeLoanSummary(loan, paymentsByLoan[loan.id] ?? [], asOf),
    );
  }

  /** Per-direction totals (to receive for LENT, to settle for BORROWED). */
  async getTotals(direction: LoanDirection, asOf?: string): Promise<LoanTotals> {
    const summaries = await this.getLoanSummaries({ direction }, asOf);
    return this.computeTotals(direction, summaries);
  }

  /** Pure aggregation of summaries into per-direction totals. */
  computeTotals(direction: LoanDirection, summaries: LoanSummary[]): LoanTotals {
    return summaries.reduce<LoanTotals>(
      (acc, s) => {
        acc.loanCount += 1;
        acc.totalPrincipal += s.remainingPrincipal;
        acc.totalInterest += s.remainingInterest;
        acc.totalOutstanding += s.totalOutstanding;
        return acc;
      },
      {
        direction,
        loanCount: 0,
        totalPrincipal: 0,
        totalInterest: 0,
        totalOutstanding: 0,
      },
    );
  }

  // ── Payments (append-only) + settlement ─────────────────────────────────────────

  /**
   * Record a repayment/collection against a loan. Appends a new payment row —
   * the loan itself is never modified except its derived status. Amounts are
   * clamped so they can't exceed the outstanding principal/interest. When the
   * loan is fully cleared, its status auto-advances to SETTLED (unless already
   * BAD_DEBT). Returns the payment + the refreshed summary.
   */
  async recordPayment(
    input: CreateLoanPaymentInput,
  ): Promise<{ payment: LoanPayment; summary: LoanSummary }> {
    const loan = await this.loanRepo.getById(input.loanId);
    if (!loan) throw new Error(`Loan not found: ${input.loanId}`);

    const now = new Date().toISOString();
    const currentSummary = computeLoanSummary(
      loan,
      await this.loanRepo.getPayments(loan.id),
      input.paymentDate ?? now,
    );

    const principalPaid = clampNonNeg(
      Math.min(Number(input.principalPaid) || 0, currentSummary.remainingPrincipal),
    );
    const interestPaid = clampNonNeg(
      Math.min(Number(input.interestPaid) || 0, currentSummary.remainingInterest),
    );

    if (principalPaid <= 0 && interestPaid <= 0) {
      throw new Error('PAYMENT_AMOUNT_REQUIRED');
    }

    const payment: LoanPayment = {
      id: uuidv4(),
      loanId: loan.id,
      principalPaid,
      interestPaid,
      paymentDate: input.paymentDate ?? now,
      note: input.note?.trim() || null,
      createdAt: now,
      syncStatus: 0,
    };

    await this.loanRepo.addPayment(payment);
    await this.enqueue('CREATE', 'loan_payment', payment.id, payment);

    // Recompute and auto-settle if cleared.
    const payments = await this.loanRepo.getPayments(loan.id);
    const summary = computeLoanSummary(loan, payments, input.paymentDate ?? now);
    const nextStatus = deriveStatus(loan, summary);
    if (nextStatus !== loan.status) {
      const updated: Loan = {
        ...loan,
        status: nextStatus,
        updatedAt: now,
        syncStatus: 0,
      };
      await this.loanRepo.update(updated);
      await this.enqueue('UPDATE', 'loan', updated.id, updated);
      summary.loan = updated;
    }

    return { payment, summary };
  }

  async getPayments(loanId: string): Promise<LoanPayment[]> {
    return this.loanRepo.getPayments(loanId);
  }

  /** Manually set a settlement status (e.g. Expected to Settle, Bad Debt). */
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
    return updated;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private validateLoanInput(input: {
    partyName: string;
    principal: number;
    interestRate: number;
  }): void {
    if (!input.partyName || !String(input.partyName).trim()) {
      throw new Error('PARTY_NAME_REQUIRED');
    }
    if (!(Number(input.principal) > 0)) {
      throw new Error('PRINCIPAL_REQUIRED');
    }
    if (Number(input.interestRate) < 0) {
      throw new Error('INVALID_INTEREST_RATE');
    }
  }

  private async enqueue(
    operation: 'CREATE' | 'UPDATE' | 'DELETE',
    entityType: 'loan' | 'loan_payment',
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

function clampNonNeg(n: number): number {
  return n > 0 ? n : 0;
}
