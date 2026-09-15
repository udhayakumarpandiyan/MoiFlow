import { Loan, LoanSummary, ClosureSuggestion } from '@finance/models/Loan';

/**
 * Pure, dependency-free loan math for EMI-based loans. Given a loan's plan
 * (amount, EMI, tenure, total/paid EMIs), derive remaining EMIs, outstanding
 * amount, next EMI date and "close faster" suggestions. Nothing here mutates
 * the loan.
 */

/** Remaining EMIs = totalEMIs − paidEMIs, clamped ≥ 0. */
export function remainingEMIs(loan: Loan): number {
  return Math.max((loan.totalEMIs || 0) - (loan.paidEMIs || 0), 0);
}

/**
 * Outstanding amount. Uses the stored value when provided (e.g. entered from a
 * bank statement); otherwise estimates it as remainingEMIs × monthlyEMI.
 */
export function computeOutstanding(loan: Loan): number {
  if (loan.status === 'CLOSED') return 0;
  if (loan.outstandingAmount != null && loan.outstandingAmount >= 0) {
    return round2(loan.outstandingAmount);
  }
  return round2(remainingEMIs(loan) * (Number(loan.monthlyEMI) || 0));
}

/**
 * ISO date of the next EMI. Based on the loan's emiDate (day of month) relative
 * to today. Returns null once the loan is closed or fully paid.
 */
export function nextEmiDate(loan: Loan, from: Date = new Date()): string | null {
  if (loan.status === 'CLOSED') return null;
  if (remainingEMIs(loan) <= 0) return null;

  const day = clampDay(loan.emiDate || 1);
  const candidate = new Date(from.getFullYear(), from.getMonth(), day);

  // If this month's EMI day has already passed, roll to next month.
  if (candidate.getTime() < startOfDay(from).getTime()) {
    candidate.setMonth(candidate.getMonth() + 1);
    candidate.setDate(clampDay(loan.emiDate || 1, candidate));
  }
  return candidate.toISOString();
}

/** Full derived summary for a loan. The loan row is never modified. */
export function computeLoanSummary(
  loan: Loan,
  from: Date = new Date(),
): LoanSummary {
  const remaining = remainingEMIs(loan);
  const outstanding = computeOutstanding(loan);
  const totalPaid = round2((loan.paidEMIs || 0) * (Number(loan.monthlyEMI) || 0));
  const progress =
    loan.totalEMIs > 0
      ? Math.min(Math.max((loan.paidEMIs || 0) / loan.totalEMIs, 0), 1)
      : loan.status === 'CLOSED'
      ? 1
      : 0;

  return {
    loan,
    remainingEMIs: remaining,
    outstandingAmount: outstanding,
    totalPaid,
    nextEmiDate: nextEmiDate(loan, from),
    progress,
  };
}

/**
 * "Close Loan Faster" suggestions for an ACTIVE loan. Estimated interest
 * savings are rough approximations based on the loan's own numbers — never
 * external claims. Returns an empty list for closed / fully-paid loans.
 */
export function closureSuggestions(loan: Loan): ClosureSuggestion[] {
  if (loan.status === 'CLOSED') return [];
  const remaining = remainingEMIs(loan);
  if (remaining <= 0) return [];

  const emi = Number(loan.monthlyEMI) || 0;
  const monthlyRate = (Number(loan.interestRate) || 0) / 100 / 12;
  const outstanding = computeOutstanding(loan);

  const suggestions: ClosureSuggestion[] = [];

  // 1) Increase EMI by ~10%: estimate months saved + interest saved.
  const higherEmi = round2(emi * 1.1);
  const baseInterest = estimateRemainingInterest(outstanding, emi, monthlyRate, remaining);
  const fasterMonths = monthsToClear(outstanding, higherEmi, monthlyRate);
  const fasterInterest = estimateRemainingInterest(outstanding, higherEmi, monthlyRate, fasterMonths);
  suggestions.push({
    key: 'INCREASE_EMI',
    estimatedSaving:
      baseInterest != null && fasterInterest != null
        ? clampNonNeg(round2(baseInterest - fasterInterest))
        : null,
    monthsSaved:
      fasterMonths != null ? clampNonNeg(remaining - fasterMonths) : null,
  });

  // 2) One extra principal payment of ~1 EMI now.
  const afterExtra = clampNonNeg(outstanding - emi);
  const afterExtraMonths = monthsToClear(afterExtra, emi, monthlyRate);
  const afterExtraInterest = estimateRemainingInterest(afterExtra, emi, monthlyRate, afterExtraMonths);
  suggestions.push({
    key: 'EXTRA_PRINCIPAL',
    estimatedSaving:
      baseInterest != null && afterExtraInterest != null
        ? clampNonNeg(round2(baseInterest - afterExtraInterest))
        : null,
    monthsSaved:
      afterExtraMonths != null ? clampNonNeg(remaining - afterExtraMonths) : null,
  });

  // 3) Occasional additional payments — qualitative (no single estimate).
  suggestions.push({ key: 'OCCASIONAL_PAYMENT', estimatedSaving: null, monthsSaved: null });

  return suggestions;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Total interest still to be paid over `months` at `monthlyRate` on a balance. */
function estimateRemainingInterest(
  balance: number,
  emi: number,
  monthlyRate: number,
  months: number | null,
): number | null {
  if (months == null || months <= 0) return 0;
  if (monthlyRate <= 0) return 0; // no interest info → nothing to estimate
  if (emi <= 0) return null;

  let remaining = balance;
  let interest = 0;
  let guard = 0;
  const cap = Math.min(months, 1200); // hard cap to avoid runaway loops
  while (remaining > 0.5 && guard < cap) {
    const monthInterest = remaining * monthlyRate;
    const principalPart = emi - monthInterest;
    if (principalPart <= 0) return null; // EMI can't cover interest → unknown
    interest += monthInterest;
    remaining -= principalPart;
    guard += 1;
  }
  return round2(interest);
}

/** Number of months to clear a balance given EMI + monthly rate. */
function monthsToClear(
  balance: number,
  emi: number,
  monthlyRate: number,
): number | null {
  if (balance <= 0) return 0;
  if (emi <= 0) return null;
  if (monthlyRate <= 0) return Math.ceil(balance / emi);

  let remaining = balance;
  let months = 0;
  while (remaining > 0.5 && months < 1200) {
    const principalPart = emi - remaining * monthlyRate;
    if (principalPart <= 0) return null;
    remaining -= principalPart;
    months += 1;
  }
  return months;
}

function clampDay(day: number, ref?: Date): number {
  let d = Math.round(day);
  if (Number.isNaN(d) || d < 1) d = 1;
  if (d > 28) {
    if (ref) {
      const last = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
      return Math.min(d, last);
    }
    return Math.min(d, 28);
  }
  return d;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function clampNonNeg(n: number): number {
  return n > 0 ? n : 0;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
