/**
 * Finance module — Loan domain models.
 *
 * A Loan represents money the user has borrowed from a provider (bank, NBFC,
 * chit fund, gold-loan lender, etc.) and repays via a monthly EMI. Loans live
 * in their own `loans` table, fully independent from the Moi domain.
 *
 * The loan row stores the plan (amount, EMI, tenure, total/paid EMIs). Derived
 * figures — outstanding amount, remaining EMIs, next EMI date, closure
 * suggestions — are computed on demand in loanCalculations.ts. Marking a loan
 * "Closed" only flips its status; the record is preserved in history.
 */

/** Category of loan. */
export type LoanType =
  | 'CAR'
  | 'TWO_WHEELER'
  | 'AGRI'
  | 'PERSONAL'
  | 'BUSINESS'
  | 'CHIT'
  | 'GOLD'
  | 'OTHERS';

/** Loan lifecycle status. */
export type LoanStatus = 'ACTIVE' | 'CLOSED';

export interface Loan {
  id: string;

  loanType: LoanType;

  /** Original sanctioned loan amount in INR. */
  loanAmount: number;

  /** ISO date the loan started. */
  startDate: string;

  /** Lender / bank / NBFC / chit fund name. */
  provider: string;

  /** Annual interest rate as a percentage (e.g. 9.5 = 9.5% p.a.). */
  interestRate: number;

  /** Monthly EMI amount in INR. */
  monthlyEMI: number;

  /** Day of month the EMI is due (1–31). */
  emiDate: number;

  /** Tenure in months. */
  tenure: number;

  /** Total number of EMIs across the loan term. */
  totalEMIs: number;

  /** Number of EMIs already paid. */
  paidEMIs: number;

  /**
   * Outstanding amount in INR. Optional — when not supplied it is derived from
   * remaining EMIs × monthlyEMI (see loanCalculations.ts).
   */
  outstandingAmount?: number | null;

  status: LoanStatus;

  notes?: string | null;

  createdAt: string;
  updatedAt: string;
  syncStatus: number;
}

export interface CreateLoanInput {
  loanType: LoanType;
  loanAmount: number;
  startDate: string;
  provider: string;
  interestRate: number;
  monthlyEMI: number;
  emiDate: number;
  tenure: number;
  totalEMIs: number;
  paidEMIs?: number;
  outstandingAmount?: number | null;
  status?: LoanStatus;
  notes?: string | null;
}

// ─── Filters ────────────────────────────────────────────────────────────────

export interface LoanFilter {
  loanType?: LoanType;
  status?: LoanStatus;
  keyword?: string;
}

// ─── Derived (computed) types ─────────────────────────────────────────────────

/** Fully-derived view of a loan's current state. */
export interface LoanSummary {
  loan: Loan;

  /** Number of EMIs still to be paid (clamped ≥ 0). */
  remainingEMIs: number;

  /** Outstanding amount — stored value if present, else remainingEMIs × EMI. */
  outstandingAmount: number;

  /** Total amount repaid so far = paidEMIs × monthlyEMI. */
  totalPaid: number;

  /** ISO date of the next EMI (null once the loan is closed / fully paid). */
  nextEmiDate: string | null;

  /** Fraction of EMIs paid (0–1). */
  progress: number;
}

/** Aggregate totals for the loans dashboard/list header. */
export interface LoanTotals {
  loanCount: number;
  activeCount: number;
  closedCount: number;
  totalOutstanding: number;
  totalMonthlyEMI: number;
}

// ─── Loan closure suggestions ─────────────────────────────────────────────────

/** A single "close loan faster" idea with an optional estimated saving. */
export interface ClosureSuggestion {
  /** Stable key used for i18n lookup: finance.closure.<key>. */
  key: 'INCREASE_EMI' | 'EXTRA_PRINCIPAL' | 'OCCASIONAL_PAYMENT';
  /** Estimated interest saving in INR, when it can be estimated. */
  estimatedSaving?: number | null;
  /** Estimated months shaved off the tenure, when it can be estimated. */
  monthsSaved?: number | null;
}

// ─── Gold loan comparison (configurable / updateable) ──────────────────────────

/**
 * A configurable gold-loan provider entry used for the Gold Loan Comparison
 * section. Rates/charges are user-updateable and never hardcoded as claims.
 */
export interface GoldLoanProvider {
  id: string;
  provider: string;
  /** Annual interest rate (% p.a.). */
  interestRate: number;
  /** Loan amount offered per gram of gold, in INR. */
  amountPerGram: number;
  /** Loan-to-value ratio as a percentage (e.g. 75 = 75%). */
  ltv: number;
  /** Processing fee (% or flat — stored as entered, in INR or %). */
  processingFee: number;
  /** Free-form other charges / remarks. */
  otherCharges?: string | null;
  updatedAt: string;
}

export interface CreateGoldLoanProviderInput {
  provider: string;
  interestRate: number;
  amountPerGram: number;
  ltv: number;
  processingFee: number;
  otherCharges?: string | null;
}

// ─── Option lists (for pickers) ─────────────────────────────────────────────────

export const LOAN_TYPES: LoanType[] = [
  'CAR',
  'TWO_WHEELER',
  'AGRI',
  'PERSONAL',
  'BUSINESS',
  'CHIT',
  'GOLD',
  'OTHERS',
];

export const LOAN_STATUSES: LoanStatus[] = ['ACTIVE', 'CLOSED'];
