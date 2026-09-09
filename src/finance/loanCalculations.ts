import { Loan, LoanPayment, LoanSummary } from './models/Loan';

/**
 * Pure, dependency-free loan math. Given a loan + its payment history, derive
 * interest accrued, amounts paid, and outstanding balances. Nothing here mutates
 * the loan — every value is computed on demand so the original principal is
 * always preserved.
 */

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;
/** Balances within this many rupees are treated as fully cleared. */
const CLEAR_EPSILON = 0.5;

/** Fractional years between two ISO dates (never negative). */
export function yearsBetween(fromISO: string, toISO: string): number {
  const from = Date.parse(fromISO);
  const to = Date.parse(toISO);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  const diff = to - from;
  return diff > 0 ? diff / MS_PER_YEAR : 0;
}

/**
 * Interest accrued on a loan from its loanDate up to `asOf`.
 *
 * Interest types:
 *  - NONE:     0
 *  - SIMPLE / FLAT: principal * rate% * elapsedYears (on the original principal)
 *  - REDUCING: interest on the currently-outstanding principal for the elapsed
 *              period. Since payments happen over time, we approximate using the
 *              principal still outstanding as of `asOf` (principal − principalPaid).
 *              This keeps it a pure function of the summary snapshot.
 *  - COMPOUND: principal * ((1 + rate%)^elapsedYears − 1), compounded annually.
 *
 * `principalPaidSoFar` is only used by REDUCING to reduce the interest base.
 */
export function computeInterestAccrued(
  loan: Loan,
  asOf: string,
  principalPaidSoFar = 0,
): number {
  const rate = (Number(loan.interestRate) || 0) / 100;
  if (rate <= 0 || loan.interestType === 'NONE') return 0;

  const years = yearsBetween(loan.loanDate, asOf);
  if (years <= 0) return 0;

  const principal = Number(loan.principal) || 0;

  switch (loan.interestType) {
    case 'SIMPLE':
    case 'FLAT':
      return principal * rate * years;

    case 'REDUCING': {
      const outstandingPrincipal = Math.max(principal - principalPaidSoFar, 0);
      return outstandingPrincipal * rate * years;
    }

    case 'COMPOUND':
      return principal * (Math.pow(1 + rate, years) - 1);

    default:
      return 0;
  }
}

/** Sum principal + interest paid across the payment history. */
export function sumPayments(payments: LoanPayment[]): {
  principalPaid: number;
  interestPaid: number;
} {
  return payments.reduce(
    (acc, p) => ({
      principalPaid: acc.principalPaid + (Number(p.principalPaid) || 0),
      interestPaid: acc.interestPaid + (Number(p.interestPaid) || 0),
    }),
    { principalPaid: 0, interestPaid: 0 },
  );
}

/**
 * Full derived financial summary for a loan as of `asOf` (defaults to now).
 * All values are computed; the loan row is never modified.
 */
export function computeLoanSummary(
  loan: Loan,
  payments: LoanPayment[],
  asOf: string = new Date().toISOString(),
): LoanSummary {
  const { principalPaid, interestPaid } = sumPayments(payments);

  const principal = Number(loan.principal) || 0;
  const interestAccrued = round2(
    computeInterestAccrued(loan, asOf, principalPaid),
  );

  const remainingPrincipal = round2(Math.max(principal - principalPaid, 0));
  const remainingInterest = round2(Math.max(interestAccrued - interestPaid, 0));
  const totalOutstanding = round2(remainingPrincipal + remainingInterest);

  return {
    loan,
    principalPaid: round2(principalPaid),
    interestPaid: round2(interestPaid),
    totalPaid: round2(principalPaid + interestPaid),
    interestAccrued,
    remainingPrincipal,
    remainingInterest,
    totalOutstanding,
    isCleared: totalOutstanding <= CLEAR_EPSILON,
  };
}

/**
 * Suggest a settlement status from a loan + its summary. The user can always
 * override manually; SETTLED and BAD_DEBT are respected as terminal states.
 */
export function deriveStatus(loan: Loan, summary: LoanSummary): Loan['status'] {
  if (loan.status === 'BAD_DEBT') return 'BAD_DEBT';
  if (summary.isCleared) return 'SETTLED';
  // Respect a manual "expected to settle" flag while still outstanding.
  if (loan.status === 'EXPECTED') return 'EXPECTED';
  return 'PENDING';
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
