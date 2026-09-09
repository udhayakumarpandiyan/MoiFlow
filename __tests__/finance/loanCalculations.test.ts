/**
 * Pure loan-math tests (loanCalculations.ts).
 *
 * Covers interest accrual for every InterestType (NONE / SIMPLE / FLAT /
 * REDUCING / COMPOUND), payment summing, derived outstanding balances, the
 * "cleared" threshold, and status derivation. All functions are pure so no
 * SQLite / mocks are needed.
 */

import {
  yearsBetween,
  computeInterestAccrued,
  sumPayments,
  computeLoanSummary,
  deriveStatus,
} from '../../src/finance/loanCalculations';
import type { Loan, LoanPayment, InterestType } from '../../src/finance/models/Loan';

// ── Builders ──────────────────────────────────────────────────────────────────

function makeLoan(overrides: Partial<Loan> = {}): Loan {
  return {
    id: overrides.id ?? 'loan-1',
    direction: overrides.direction ?? 'LENT',
    loanType: overrides.loanType ?? 'PERSONAL',
    partyType: overrides.partyType ?? 'PERSON',
    partyName: overrides.partyName ?? 'Ravi',
    partyVillage: overrides.partyVillage ?? null,
    partyPhone: overrides.partyPhone ?? null,
    partyContact: overrides.partyContact ?? null,
    principal: overrides.principal ?? 100000,
    interestRate: overrides.interestRate ?? 12,
    interestType: overrides.interestType ?? 'SIMPLE',
    loanDate: overrides.loanDate ?? '2025-01-01T00:00:00.000Z',
    dueDate: overrides.dueDate ?? null,
    status: overrides.status ?? 'PENDING',
    notes: overrides.notes ?? null,
    createdAt: overrides.createdAt ?? '2025-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2025-01-01T00:00:00.000Z',
    syncStatus: overrides.syncStatus ?? 0,
  };
}

function makePayment(overrides: Partial<LoanPayment> = {}): LoanPayment {
  return {
    id: overrides.id ?? 'pay-1',
    loanId: overrides.loanId ?? 'loan-1',
    principalPaid: overrides.principalPaid ?? 0,
    interestPaid: overrides.interestPaid ?? 0,
    paymentDate: overrides.paymentDate ?? '2025-07-01T00:00:00.000Z',
    note: overrides.note ?? null,
    createdAt: overrides.createdAt ?? '2025-07-01T00:00:00.000Z',
    syncStatus: overrides.syncStatus ?? 0,
  };
}

// Exactly one year after loanDate for clean interest math.
const ONE_YEAR_LATER = '2026-01-01T00:00:00.000Z';

// ── yearsBetween ────────────────────────────────────────────────────────────────

describe('yearsBetween', () => {
  it('is ~1 for a one-year gap', () => {
    expect(yearsBetween('2025-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')).toBeCloseTo(1, 2);
  });

  it('is 0 when the end date is before the start', () => {
    expect(yearsBetween('2026-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z')).toBe(0);
  });

  it('is 0 for invalid dates', () => {
    expect(yearsBetween('not-a-date', ONE_YEAR_LATER)).toBe(0);
  });
});

// ── computeInterestAccrued: per interest type ─────────────────────────────────────

describe('computeInterestAccrued', () => {
  it('NONE accrues no interest', () => {
    const loan = makeLoan({ interestType: 'NONE' });
    expect(computeInterestAccrued(loan, ONE_YEAR_LATER)).toBe(0);
  });

  it('SIMPLE = principal * rate * years', () => {
    const loan = makeLoan({ interestType: 'SIMPLE', principal: 100000, interestRate: 12 });
    // 100000 * 0.12 * 1yr = 12000
    expect(computeInterestAccrued(loan, ONE_YEAR_LATER)).toBeCloseTo(12000, 0);
  });

  it('FLAT matches SIMPLE on the original principal', () => {
    const loan = makeLoan({ interestType: 'FLAT', principal: 100000, interestRate: 12 });
    expect(computeInterestAccrued(loan, ONE_YEAR_LATER)).toBeCloseTo(12000, 0);
  });

  it('REDUCING charges interest on principal net of what was paid', () => {
    const loan = makeLoan({ interestType: 'REDUCING', principal: 100000, interestRate: 12 });
    // 40000 principal already paid -> base 60000 * 0.12 * 1yr = 7200
    expect(computeInterestAccrued(loan, ONE_YEAR_LATER, 40000)).toBeCloseTo(7200, 0);
  });

  it('COMPOUND = principal * ((1+rate)^years - 1)', () => {
    const loan = makeLoan({ interestType: 'COMPOUND', principal: 100000, interestRate: 12 });
    // 100000 * ((1.12)^1 - 1) = 12000 at exactly one year
    expect(computeInterestAccrued(loan, ONE_YEAR_LATER)).toBeCloseTo(12000, 0);
  });

  it('is 0 when the rate is 0 regardless of type', () => {
    (['SIMPLE', 'FLAT', 'REDUCING', 'COMPOUND'] as InterestType[]).forEach(t => {
      expect(computeInterestAccrued(makeLoan({ interestType: t, interestRate: 0 }), ONE_YEAR_LATER)).toBe(0);
    });
  });

  it('is 0 before any time has elapsed', () => {
    const loan = makeLoan({ interestType: 'SIMPLE' });
    expect(computeInterestAccrued(loan, loan.loanDate)).toBe(0);
  });
});

// ── sumPayments ────────────────────────────────────────────────────────────────

describe('sumPayments', () => {
  it('adds up principal and interest separately', () => {
    const payments = [
      makePayment({ principalPaid: 10000, interestPaid: 500 }),
      makePayment({ id: 'pay-2', principalPaid: 5000, interestPaid: 250 }),
    ];
    expect(sumPayments(payments)).toEqual({ principalPaid: 15000, interestPaid: 750 });
  });

  it('returns zeros for no payments', () => {
    expect(sumPayments([])).toEqual({ principalPaid: 0, interestPaid: 0 });
  });
});

// ── computeLoanSummary ─────────────────────────────────────────────────────────

describe('computeLoanSummary', () => {
  it('derives outstanding from principal + accrued interest minus payments', () => {
    const loan = makeLoan({ interestType: 'SIMPLE', principal: 100000, interestRate: 12 });
    const payments = [makePayment({ principalPaid: 40000, interestPaid: 2000 })];

    const s = computeLoanSummary(loan, payments, ONE_YEAR_LATER);

    expect(s.principalPaid).toBe(40000);
    expect(s.interestPaid).toBe(2000);
    expect(s.totalPaid).toBe(42000);
    expect(s.interestAccrued).toBeCloseTo(12000, 0);
    expect(s.remainingPrincipal).toBe(60000);
    expect(s.remainingInterest).toBeCloseTo(10000, 0);
    expect(s.totalOutstanding).toBeCloseTo(70000, 0);
    expect(s.isCleared).toBe(false);
  });

  it('never lets the original principal be overwritten (loan ref unchanged)', () => {
    const loan = makeLoan({ principal: 100000 });
    computeLoanSummary(loan, [makePayment({ principalPaid: 100000 })], ONE_YEAR_LATER);
    expect(loan.principal).toBe(100000);
  });

  it('marks the loan cleared once principal + interest are fully paid', () => {
    const loan = makeLoan({ interestType: 'NONE', principal: 50000, interestRate: 0 });
    const s = computeLoanSummary(loan, [makePayment({ principalPaid: 50000 })], ONE_YEAR_LATER);
    expect(s.remainingPrincipal).toBe(0);
    expect(s.totalOutstanding).toBe(0);
    expect(s.isCleared).toBe(true);
  });

  it('clamps remaining balances at 0 even on overpayment', () => {
    const loan = makeLoan({ interestType: 'NONE', principal: 50000, interestRate: 0 });
    const s = computeLoanSummary(loan, [makePayment({ principalPaid: 60000 })], ONE_YEAR_LATER);
    expect(s.remainingPrincipal).toBe(0);
    expect(s.totalOutstanding).toBe(0);
  });
});

// ── deriveStatus ────────────────────────────────────────────────────────────────

describe('deriveStatus', () => {
  it('returns SETTLED once cleared', () => {
    const loan = makeLoan({ status: 'PENDING', interestType: 'NONE', interestRate: 0 });
    const s = computeLoanSummary(loan, [makePayment({ principalPaid: loan.principal })], ONE_YEAR_LATER);
    expect(deriveStatus(loan, s)).toBe('SETTLED');
  });

  it('keeps BAD_DEBT as a terminal state even if cleared', () => {
    const loan = makeLoan({ status: 'BAD_DEBT', interestType: 'NONE', interestRate: 0 });
    const s = computeLoanSummary(loan, [makePayment({ principalPaid: loan.principal })], ONE_YEAR_LATER);
    expect(deriveStatus(loan, s)).toBe('BAD_DEBT');
  });

  it('preserves a manual EXPECTED flag while still outstanding', () => {
    const loan = makeLoan({ status: 'EXPECTED' });
    const s = computeLoanSummary(loan, [], ONE_YEAR_LATER);
    expect(deriveStatus(loan, s)).toBe('EXPECTED');
  });

  it('falls back to PENDING while outstanding with no special flag', () => {
    const loan = makeLoan({ status: 'PENDING' });
    const s = computeLoanSummary(loan, [], ONE_YEAR_LATER);
    expect(deriveStatus(loan, s)).toBe('PENDING');
  });
});
