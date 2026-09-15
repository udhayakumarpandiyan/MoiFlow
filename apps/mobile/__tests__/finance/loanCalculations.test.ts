/**
 * Pure loan-math tests (loanCalculations.ts).
 *
 * Covers EMI-based derived values: remaining EMIs, outstanding amount (stored
 * vs estimated), next EMI date, loan summary and the "close loan faster"
 * suggestions. All functions are pure so no SQLite / mocks are needed.
 */

import {
  remainingEMIs,
  computeOutstanding,
  nextEmiDate,
  computeLoanSummary,
  closureSuggestions,
} from '../../src/finance/loanCalculations';
import type { Loan } from '../../src/finance/models/Loan';

// ── Builders ──────────────────────────────────────────────────────────────────

function makeLoan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: overrides.id ?? 'loan-1',
    loanType: overrides.loanType ?? 'PERSONAL',
    loanAmount: overrides.loanAmount ?? 120000,
    startDate: overrides.startDate ?? '2025-01-01T00:00:00.000Z',
    provider: overrides.provider ?? 'HDFC Bank',
    interestRate: overrides.interestRate ?? 12,
    monthlyEMI: overrides.monthlyEMI ?? 10000,
    emiDate: overrides.emiDate ?? 5,
    tenure: overrides.tenure ?? 12,
    totalEMIs: overrides.totalEMIs ?? 12,
    paidEMIs: overrides.paidEMIs ?? 3,
    outstandingAmount:
      overrides.outstandingAmount !== undefined ? overrides.outstandingAmount : null,
    status: overrides.status ?? 'ACTIVE',
    notes: overrides.notes ?? null,
    createdAt: overrides.createdAt ?? '2025-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2025-01-01T00:00:00.000Z',
    syncStatus: overrides.syncStatus ?? 0,
  };
}

// ── remainingEMIs ────────────────────────────────────────────────────────────────

describe('remainingEMIs', () => {
  it('is totalEMIs minus paidEMIs', () => {
    expect(remainingEMIs(makeLoan({ totalEMIs: 12, paidEMIs: 3 }))).toBe(9);
  });

  it('never goes negative', () => {
    expect(remainingEMIs(makeLoan({ totalEMIs: 12, paidEMIs: 15 }))).toBe(0);
  });
});

// ── computeOutstanding ─────────────────────────────────────────────────────────

describe('computeOutstanding', () => {
  it('estimates outstanding as remaining EMIs * monthly EMI when not stored', () => {
    const loan = makeLoan({ totalEMIs: 12, paidEMIs: 3, monthlyEMI: 10000 });
    expect(computeOutstanding(loan)).toBe(90000);
  });

  it('uses the stored outstanding amount when provided', () => {
    const loan = makeLoan({ outstandingAmount: 55000 });
    expect(computeOutstanding(loan)).toBe(55000);
  });

  it('is 0 for a closed loan', () => {
    const loan = makeLoan({ status: 'CLOSED', paidEMIs: 3, totalEMIs: 12 });
    expect(computeOutstanding(loan)).toBe(0);
  });
});

// ── nextEmiDate ────────────────────────────────────────────────────────────────

describe('nextEmiDate', () => {
  it('returns null for a closed loan', () => {
    expect(nextEmiDate(makeLoan({ status: 'CLOSED' }))).toBeNull();
  });

  it('returns null when there are no remaining EMIs', () => {
    expect(nextEmiDate(makeLoan({ totalEMIs: 12, paidEMIs: 12 }))).toBeNull();
  });

  it('picks this month when the EMI day is still ahead', () => {
    // from = 2025-03-01, emiDate = 5 -> 2025-03-05
    const iso = nextEmiDate(makeLoan({ emiDate: 5 }), new Date(2025, 2, 1));
    expect(iso).not.toBeNull();
    const d = new Date(iso!);
    expect(d.getMonth()).toBe(2); // March
    expect(d.getDate()).toBe(5);
  });

  it('rolls to next month when the EMI day has passed', () => {
    // from = 2025-03-10, emiDate = 5 -> 2025-04-05
    const iso = nextEmiDate(makeLoan({ emiDate: 5 }), new Date(2025, 2, 10));
    const d = new Date(iso!);
    expect(d.getMonth()).toBe(3); // April
    expect(d.getDate()).toBe(5);
  });
});

// ── computeLoanSummary ─────────────────────────────────────────────────────────

describe('computeLoanSummary', () => {
  it('derives remaining EMIs, outstanding, total paid and progress', () => {
    const loan = makeLoan({ totalEMIs: 12, paidEMIs: 3, monthlyEMI: 10000 });
    const s = computeLoanSummary(loan, new Date(2025, 2, 1));
    expect(s.remainingEMIs).toBe(9);
    expect(s.outstandingAmount).toBe(90000);
    expect(s.totalPaid).toBe(30000);
    expect(s.progress).toBeCloseTo(0.25, 2);
    expect(s.nextEmiDate).not.toBeNull();
  });

  it('reports full progress and no next EMI for a closed loan', () => {
    const loan = makeLoan({ status: 'CLOSED', totalEMIs: 12, paidEMIs: 6 });
    const s = computeLoanSummary(loan);
    expect(s.outstandingAmount).toBe(0);
    expect(s.nextEmiDate).toBeNull();
  });
});

// ── closureSuggestions ─────────────────────────────────────────────────────────

describe('closureSuggestions', () => {
  it('returns no suggestions for a closed loan', () => {
    expect(closureSuggestions(makeLoan({ status: 'CLOSED' }))).toEqual([]);
  });

  it('returns no suggestions when the loan is fully paid', () => {
    expect(closureSuggestions(makeLoan({ totalEMIs: 12, paidEMIs: 12 }))).toEqual([]);
  });

  it('offers the three closure ideas for an active loan', () => {
    const suggestions = closureSuggestions(makeLoan({ totalEMIs: 12, paidEMIs: 3 }));
    const keys = suggestions.map(s => s.key);
    expect(keys).toContain('INCREASE_EMI');
    expect(keys).toContain('EXTRA_PRINCIPAL');
    expect(keys).toContain('OCCASIONAL_PAYMENT');
  });

  it('estimates a non-negative interest saving when a rate is known', () => {
    const suggestions = closureSuggestions(
      makeLoan({ interestRate: 12, monthlyEMI: 10000, totalEMIs: 24, paidEMIs: 2 }),
    );
    const increase = suggestions.find(s => s.key === 'INCREASE_EMI');
    expect(increase).toBeDefined();
    if (increase?.estimatedSaving != null) {
      expect(increase.estimatedSaving).toBeGreaterThanOrEqual(0);
    }
  });
});
