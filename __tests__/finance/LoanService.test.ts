/**
 * LoanService tests.
 *
 * Covers: loan validation, per-direction totals aggregation, partial + full
 * payments with append-only history + clamping to outstanding, and automatic
 * status transitions (PENDING -> SETTLED on clear, BAD_DEBT preserved). Uses a
 * FAKE ILoanRepository so no SQLite is required.
 */

import { LoanService } from '../../src/services/LoanService';
import type { ILoanRepository } from '../../src/repository/interfaces/ILoanRepository';
import type {
  Loan,
  LoanPayment,
  LoanFilter,
  CreateLoanInput,
} from '../../src/finance/models/Loan';

// ── Fake repository ─────────────────────────────────────────────────────────────

class FakeLoanRepository implements ILoanRepository {
  loans: Loan[] = [];
  payments: LoanPayment[] = [];

  async create(loan: Loan): Promise<void> {
    this.loans.push({ ...loan });
  }
  async update(loan: Loan): Promise<void> {
    const i = this.loans.findIndex(l => l.id === loan.id);
    if (i >= 0) this.loans[i] = { ...loan };
  }
  async delete(id: string): Promise<void> {
    this.loans = this.loans.filter(l => l.id !== id);
    this.payments = this.payments.filter(p => p.loanId !== id);
  }
  async getById(id: string): Promise<Loan | null> {
    return this.loans.find(l => l.id === id) ?? null;
  }
  async getAll(filter?: LoanFilter): Promise<Loan[]> {
    return this.loans.filter(l => {
      if (filter?.direction && l.direction !== filter.direction) return false;
      if (filter?.status && l.status !== filter.status) return false;
      if (filter?.loanType && l.loanType !== filter.loanType) return false;
      if (filter?.partyType && l.partyType !== filter.partyType) return false;
      return true;
    });
  }
  async addPayment(payment: LoanPayment): Promise<void> {
    this.payments.push({ ...payment });
  }
  async getPayments(loanId: string): Promise<LoanPayment[]> {
    return this.payments
      .filter(p => p.loanId === loanId)
      .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
  }
  async getPaymentsForLoans(loanIds: string[]): Promise<Record<string, LoanPayment[]>> {
    const out: Record<string, LoanPayment[]> = {};
    for (const id of loanIds) out[id] = await this.getPayments(id);
    return out;
  }
}

function baseLoanInput(overrides: Partial<CreateLoanInput> = {}): CreateLoanInput {
  return {
    direction: overrides.direction ?? 'LENT',
    loanType: overrides.loanType ?? 'PERSONAL',
    partyType: overrides.partyType ?? 'PERSON',
    partyName: overrides.partyName ?? 'Ravi',
    partyVillage: overrides.partyVillage ?? null,
    partyPhone: overrides.partyPhone ?? null,
    partyContact: overrides.partyContact ?? null,
    principal: overrides.principal ?? 100000,
    interestRate: overrides.interestRate ?? 0,
    interestType: overrides.interestType ?? 'NONE',
    loanDate: overrides.loanDate ?? '2025-01-01T00:00:00.000Z',
    dueDate: overrides.dueDate ?? null,
    status: overrides.status,
    notes: overrides.notes ?? null,
  };
}

function newService() {
  const repo = new FakeLoanRepository();
  const service = new LoanService(repo);
  return { repo, service };
}

// ── Validation ──────────────────────────────────────────────────────────────────

describe('LoanService validation', () => {
  it('rejects a missing party name', async () => {
    const { service } = newService();
    await expect(service.createLoan(baseLoanInput({ partyName: '  ' }))).rejects.toThrow(
      'PARTY_NAME_REQUIRED',
    );
  });

  it('rejects a non-positive principal', async () => {
    const { service } = newService();
    await expect(service.createLoan(baseLoanInput({ principal: 0 }))).rejects.toThrow(
      'PRINCIPAL_REQUIRED',
    );
  });

  it('rejects a negative interest rate', async () => {
    const { service } = newService();
    await expect(service.createLoan(baseLoanInput({ interestRate: -5 }))).rejects.toThrow(
      'INVALID_INTEREST_RATE',
    );
  });

  it('creates a valid loan with a generated id and default PENDING status', async () => {
    const { service } = newService();
    const loan = await service.createLoan(baseLoanInput());
    expect(loan.id).toBeTruthy();
    expect(loan.status).toBe('PENDING');
    expect(loan.principal).toBe(100000);
  });
});

// ── Payments: append-only + clamping ───────────────────────────────────────────

describe('LoanService.recordPayment', () => {
  it('records a partial payment and leaves a balance outstanding', async () => {
    const { service } = newService();
    const loan = await service.createLoan(baseLoanInput({ principal: 100000 }));

    const { summary } = await service.recordPayment({
      loanId: loan.id,
      principalPaid: 40000,
      interestPaid: 0,
      paymentDate: '2025-06-01T00:00:00.000Z',
    });

    expect(summary.principalPaid).toBe(40000);
    expect(summary.remainingPrincipal).toBe(60000);
    expect(summary.isCleared).toBe(false);
    // Loan row's principal is never mutated.
    expect((await service.getLoan(loan.id))!.principal).toBe(100000);
  });

  it('appends each payment as a new history row (never overwrites)', async () => {
    const { service } = newService();
    const loan = await service.createLoan(baseLoanInput({ principal: 100000 }));

    await service.recordPayment({ loanId: loan.id, principalPaid: 30000, interestPaid: 0 });
    await service.recordPayment({ loanId: loan.id, principalPaid: 20000, interestPaid: 0 });

    const history = await service.getPayments(loan.id);
    expect(history).toHaveLength(2);
    expect(history.map(p => p.principalPaid)).toEqual([30000, 20000]);
  });

  it('clamps a payment to the outstanding principal', async () => {
    const { service } = newService();
    const loan = await service.createLoan(baseLoanInput({ principal: 100000 }));

    // Attempt to overpay: only 100000 outstanding.
    const { payment, summary } = await service.recordPayment({
      loanId: loan.id,
      principalPaid: 150000,
      interestPaid: 0,
    });

    expect(payment.principalPaid).toBe(100000);
    expect(summary.remainingPrincipal).toBe(0);
  });

  it('rejects an empty payment', async () => {
    const { service } = newService();
    const loan = await service.createLoan(baseLoanInput());
    await expect(
      service.recordPayment({ loanId: loan.id, principalPaid: 0, interestPaid: 0 }),
    ).rejects.toThrow('PAYMENT_AMOUNT_REQUIRED');
  });

  it('throws for a payment against an unknown loan', async () => {
    const { service } = newService();
    await expect(
      service.recordPayment({ loanId: 'nope', principalPaid: 100, interestPaid: 0 }),
    ).rejects.toThrow(/Loan not found/);
  });
});

// ── Status transitions ─────────────────────────────────────────────────────────

describe('LoanService status transitions', () => {
  it('auto-advances PENDING -> SETTLED when a full payment clears the loan', async () => {
    const { service } = newService();
    const loan = await service.createLoan(baseLoanInput({ principal: 100000 }));

    const { summary } = await service.recordPayment({
      loanId: loan.id,
      principalPaid: 100000,
      interestPaid: 0,
    });

    expect(summary.isCleared).toBe(true);
    expect(summary.loan.status).toBe('SETTLED');
    expect((await service.getLoan(loan.id))!.status).toBe('SETTLED');
  });

  it('keeps BAD_DEBT terminal even after a clearing payment', async () => {
    const { service } = newService();
    const loan = await service.createLoan(baseLoanInput({ principal: 100000 }));
    await service.setStatus(loan.id, 'BAD_DEBT');

    const { summary } = await service.recordPayment({
      loanId: loan.id,
      principalPaid: 100000,
      interestPaid: 0,
    });

    expect(summary.loan.status).toBe('BAD_DEBT');
  });

  it('setStatus manually flags a loan as EXPECTED', async () => {
    const { service } = newService();
    const loan = await service.createLoan(baseLoanInput());
    const updated = await service.setStatus(loan.id, 'EXPECTED');
    expect(updated.status).toBe('EXPECTED');
  });
});

// ── Totals aggregation ─────────────────────────────────────────────────────────

describe('LoanService.getTotals', () => {
  it('aggregates outstanding per direction independently', async () => {
    const { service } = newService();
    await service.createLoan(baseLoanInput({ direction: 'LENT', principal: 100000 }));
    await service.createLoan(baseLoanInput({ direction: 'LENT', principal: 50000 }));
    await service.createLoan(baseLoanInput({ direction: 'BORROWED', principal: 30000 }));

    const lent = await service.getTotals('LENT');
    expect(lent.loanCount).toBe(2);
    expect(lent.totalPrincipal).toBe(150000);
    expect(lent.totalOutstanding).toBe(150000);

    const borrowed = await service.getTotals('BORROWED');
    expect(borrowed.loanCount).toBe(1);
    expect(borrowed.totalOutstanding).toBe(30000);
  });

  it('excludes paid-down principal from outstanding totals', async () => {
    const { service } = newService();
    const loan = await service.createLoan(baseLoanInput({ direction: 'LENT', principal: 100000 }));
    await service.recordPayment({ loanId: loan.id, principalPaid: 40000, interestPaid: 0 });

    const lent = await service.getTotals('LENT');
    expect(lent.totalOutstanding).toBe(60000);
  });
});
