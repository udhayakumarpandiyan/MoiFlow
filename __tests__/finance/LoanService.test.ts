/**
 * LoanService tests (EMI-based loans).
 *
 * Covers: loan validation, CRUD, totals aggregation (outstanding + monthly EMI
 * across active loans), mark-closed status transition, and gold-provider CRUD.
 * Uses a FAKE ILoanRepository so no SQLite is required.
 */

import { LoanService } from '../../src/services/LoanService';
import type { ILoanRepository } from '../../src/repository/interfaces/ILoanRepository';
import type {
  Loan,
  LoanFilter,
  CreateLoanInput,
  GoldLoanProvider,
} from '../../src/finance/models/Loan';

// ── Fake repository ─────────────────────────────────────────────────────────────

class FakeLoanRepository implements ILoanRepository {
  loans: Loan[] = [];
  goldProviders: GoldLoanProvider[] = [];

  async create(loan: Loan): Promise<void> {
    this.loans.push({ ...loan });
  }
  async update(loan: Loan): Promise<void> {
    const i = this.loans.findIndex(l => l.id === loan.id);
    if (i >= 0) this.loans[i] = { ...loan };
  }
  async delete(id: string): Promise<void> {
    this.loans = this.loans.filter(l => l.id !== id);
  }
  async getById(id: string): Promise<Loan | null> {
    return this.loans.find(l => l.id === id) ?? null;
  }
  async getAll(filter?: LoanFilter): Promise<Loan[]> {
    return this.loans.filter(l => {
      if (filter?.status && l.status !== filter.status) return false;
      if (filter?.loanType && l.loanType !== filter.loanType) return false;
      return true;
    });
  }
  async getGoldProviders(): Promise<GoldLoanProvider[]> {
    return [...this.goldProviders];
  }
  async upsertGoldProvider(provider: GoldLoanProvider): Promise<void> {
    const i = this.goldProviders.findIndex(p => p.id === provider.id);
    if (i >= 0) this.goldProviders[i] = { ...provider };
    else this.goldProviders.push({ ...provider });
  }
  async deleteGoldProvider(id: string): Promise<void> {
    this.goldProviders = this.goldProviders.filter(p => p.id !== id);
  }
}

function baseLoanInput(overrides: Partial<CreateLoanInput> = {}): CreateLoanInput {
  return {
    loanType: overrides.loanType ?? 'PERSONAL',
    loanAmount: overrides.loanAmount ?? 120000,
    startDate: overrides.startDate ?? '2025-01-01T00:00:00.000Z',
    provider: overrides.provider ?? 'HDFC Bank',
    interestRate: overrides.interestRate ?? 12,
    monthlyEMI: overrides.monthlyEMI ?? 10000,
    emiDate: overrides.emiDate ?? 5,
    tenure: overrides.tenure ?? 12,
    totalEMIs: overrides.totalEMIs ?? 12,
    paidEMIs: overrides.paidEMIs,
    outstandingAmount: overrides.outstandingAmount,
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
  it('rejects a missing provider', async () => {
    const { service } = newService();
    await expect(service.createLoan(baseLoanInput({ provider: '  ' }))).rejects.toThrow(
      'PROVIDER_REQUIRED',
    );
  });

  it('rejects a non-positive loan amount', async () => {
    const { service } = newService();
    await expect(service.createLoan(baseLoanInput({ loanAmount: 0 }))).rejects.toThrow(
      'LOAN_AMOUNT_REQUIRED',
    );
  });

  it('rejects a non-positive EMI', async () => {
    const { service } = newService();
    await expect(service.createLoan(baseLoanInput({ monthlyEMI: 0 }))).rejects.toThrow(
      'EMI_REQUIRED',
    );
  });

  it('rejects a negative interest rate', async () => {
    const { service } = newService();
    await expect(service.createLoan(baseLoanInput({ interestRate: -5 }))).rejects.toThrow(
      'INVALID_INTEREST_RATE',
    );
  });

  it('creates a valid loan with a generated id and default ACTIVE status', async () => {
    const { service } = newService();
    const loan = await service.createLoan(baseLoanInput());
    expect(loan.id).toBeTruthy();
    expect(loan.status).toBe('ACTIVE');
    expect(loan.loanAmount).toBe(120000);
    expect(loan.paidEMIs).toBe(0);
  });

  it('clamps the EMI day into the 1–31 range', async () => {
    const { service } = newService();
    const loan = await service.createLoan(baseLoanInput({ emiDate: 40 }));
    expect(loan.emiDate).toBe(31);
  });
});

// ── Update ──────────────────────────────────────────────────────────────────────

describe('LoanService.updateLoan', () => {
  it('applies partial updates and preserves untouched fields', async () => {
    const { service } = newService();
    const loan = await service.createLoan(baseLoanInput({ paidEMIs: 2 }));

    const updated = await service.updateLoan(loan.id, { paidEMIs: 5, monthlyEMI: 12000 });
    expect(updated.paidEMIs).toBe(5);
    expect(updated.monthlyEMI).toBe(12000);
    expect(updated.provider).toBe('HDFC Bank');
  });
});

// ── Status transitions ─────────────────────────────────────────────────────────

describe('LoanService status transitions', () => {
  it('markClosed flips status to CLOSED and keeps the record', async () => {
    const { service } = newService();
    const loan = await service.createLoan(baseLoanInput());

    const closed = await service.markClosed(loan.id);
    expect(closed.status).toBe('CLOSED');
    expect(await service.getLoan(loan.id)).not.toBeNull();
  });

  it('setStatus can reopen a loan to ACTIVE', async () => {
    const { service } = newService();
    const loan = await service.createLoan(baseLoanInput());
    await service.markClosed(loan.id);
    const reopened = await service.setStatus(loan.id, 'ACTIVE');
    expect(reopened.status).toBe('ACTIVE');
  });
});

// ── Totals aggregation ─────────────────────────────────────────────────────────

describe('LoanService.getTotals', () => {
  it('sums outstanding + monthly EMI across active loans only', async () => {
    const { service } = newService();
    // 9 remaining * 10000 = 90000 outstanding
    await service.createLoan(baseLoanInput({ totalEMIs: 12, paidEMIs: 3, monthlyEMI: 10000 }));
    // 5 remaining * 5000 = 25000 outstanding
    await service.createLoan(baseLoanInput({ totalEMIs: 10, paidEMIs: 5, monthlyEMI: 5000 }));
    // Closed loan — excluded from outstanding + EMI.
    await service.createLoan(baseLoanInput({ status: 'CLOSED', monthlyEMI: 8000 }));

    const totals = await service.getTotals();
    expect(totals.loanCount).toBe(3);
    expect(totals.activeCount).toBe(2);
    expect(totals.closedCount).toBe(1);
    expect(totals.totalOutstanding).toBe(115000);
    expect(totals.totalMonthlyEMI).toBe(15000);
  });
});

// ── Gold providers ──────────────────────────────────────────────────────────────

describe('LoanService gold providers', () => {
  it('rejects a provider with no name', async () => {
    const { service } = newService();
    await expect(
      service.saveGoldProvider({
        provider: ' ',
        interestRate: 9,
        amountPerGram: 5000,
        ltv: 75,
        processingFee: 1,
      }),
    ).rejects.toThrow('PROVIDER_REQUIRED');
  });

  it('saves, lists and deletes a gold provider', async () => {
    const { service } = newService();
    const saved = await service.saveGoldProvider({
      provider: 'Muthoot',
      interestRate: 9.5,
      amountPerGram: 5200,
      ltv: 75,
      processingFee: 0.5,
      otherCharges: 'Valuation ₹100',
    });
    expect(saved.id).toBeTruthy();

    let list = await service.getGoldProviders();
    expect(list).toHaveLength(1);
    expect(list[0].provider).toBe('Muthoot');

    await service.deleteGoldProvider(saved.id);
    list = await service.getGoldProviders();
    expect(list).toHaveLength(0);
  });

  it('updates an existing provider when an id is passed', async () => {
    const { service } = newService();
    const saved = await service.saveGoldProvider({
      provider: 'Manappuram',
      interestRate: 10,
      amountPerGram: 5000,
      ltv: 70,
      processingFee: 1,
    });

    await service.saveGoldProvider(
      { provider: 'Manappuram', interestRate: 8.5, amountPerGram: 5300, ltv: 75, processingFee: 0.5 },
      saved.id,
    );

    const list = await service.getGoldProviders();
    expect(list).toHaveLength(1);
    expect(list[0].interestRate).toBe(8.5);
  });
});
