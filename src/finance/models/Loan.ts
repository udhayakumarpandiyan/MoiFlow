/**
 * Finance module — Loan domain models.
 *
 * Completely independent from the Moi domain (events/entries/persons). Loans
 * live in their own `loans` table; every payment is an append-only row in
 * `loan_payments` — the original loan principal/interest are NEVER overwritten.
 * Interest accrued, amounts paid, and outstanding balances are all DERIVED
 * dynamically from the loan + its payment history (see loanCalculations.ts).
 */

/** Whether I lent the money out (to receive) or borrowed it (to settle). */
export type LoanDirection = 'LENT' | 'BORROWED';

/** Category of loan. */
export type LoanType =
  | 'PERSONAL'
  | 'BUSINESS'
  | 'CAR'
  | 'GOLD'
  | 'AGRICULTURAL'
  | 'HOME'
  | 'EDUCATION'
  | 'OTHER';

/** Counterparty kind. */
export type PartyType = 'PERSON' | 'BUSINESS';

/** How interest accrues over time. */
export type InterestType =
  | 'NONE' // interest-free
  | 'SIMPLE' // simple interest on original principal
  | 'FLAT' // flat interest on original principal for the full term (per year)
  | 'REDUCING' // interest on the currently-outstanding principal
  | 'COMPOUND'; // compounded annually on principal

/** Settlement lifecycle. */
export type LoanStatus =
  | 'PENDING' // active, outstanding balance remains
  | 'EXPECTED' // expected to settle soon (manual flag)
  | 'SETTLED' // fully repaid / closed
  | 'BAD_DEBT'; // written off as unrecoverable

export interface Loan {
  id: string;

  direction: LoanDirection;
  loanType: LoanType;

  // Counterparty
  partyType: PartyType;
  /** Person name OR business/organization name. */
  partyName: string;
  /** Village (person) — optional. */
  partyVillage?: string | null;
  /** Mobile number (person) — optional. */
  partyPhone?: string | null;
  /** Free-form contact details (business/organization) — optional. */
  partyContact?: string | null;

  /** Original principal in INR. NEVER mutated after creation. */
  principal: number;
  /** Annual interest rate as a percentage (e.g. 12 = 12% p.a.). */
  interestRate: number;
  interestType: InterestType;

  /** ISO date the loan was given/taken. */
  loanDate: string;
  /** ISO due date (optional). */
  dueDate?: string | null;

  status: LoanStatus;

  notes?: string | null;

  createdAt: string;
  updatedAt: string;
  syncStatus: number;
}

export interface CreateLoanInput {
  direction: LoanDirection;
  loanType: LoanType;
  partyType: PartyType;
  partyName: string;
  partyVillage?: string | null;
  partyPhone?: string | null;
  partyContact?: string | null;
  principal: number;
  interestRate: number;
  interestType: InterestType;
  loanDate: string;
  dueDate?: string | null;
  status?: LoanStatus;
  notes?: string | null;
}

/**
 * A single repayment/collection event. Append-only — recording a payment never
 * changes the loan row, preserving full history. `principalPaid`/`interestPaid`
 * split how much of this payment went to principal vs interest.
 */
export interface LoanPayment {
  id: string;
  loanId: string;
  principalPaid: number;
  interestPaid: number;
  /** ISO date the payment was made/received. */
  paymentDate: string;
  note?: string | null;
  createdAt: string;
  syncStatus: number;
}

export interface CreateLoanPaymentInput {
  loanId: string;
  principalPaid: number;
  interestPaid: number;
  paymentDate?: string;
  note?: string | null;
}

// ─── Filters ────────────────────────────────────────────────────────────────

export interface LoanFilter {
  direction?: LoanDirection;
  status?: LoanStatus;
  loanType?: LoanType;
  partyType?: PartyType;
  keyword?: string;
}

// ─── Derived (computed) types ─────────────────────────────────────────────────

/** Fully-derived view of a loan's current financial state. */
export interface LoanSummary {
  loan: Loan;

  /** Sum of principal repaid across all payments. */
  principalPaid: number;
  /** Sum of interest repaid across all payments. */
  interestPaid: number;
  /** Total repaid = principalPaid + interestPaid. */
  totalPaid: number;

  /** Interest accrued from loanDate → asOf, per interestType. */
  interestAccrued: number;

  /** Original principal − principalPaid (clamped ≥ 0). */
  remainingPrincipal: number;
  /** interestAccrued − interestPaid (clamped ≥ 0). */
  remainingInterest: number;
  /** remainingPrincipal + remainingInterest. */
  totalOutstanding: number;

  /** Whether the effective balance is cleared (outstanding ≈ 0). */
  isCleared: boolean;
}

/** Per-direction totals for the loans dashboard/list header. */
export interface LoanTotals {
  direction: LoanDirection;
  loanCount: number;
  totalPrincipal: number;
  totalInterest: number; // remaining interest across loans
  totalOutstanding: number;
}

// ─── Option lists (for pickers) ─────────────────────────────────────────────────

export const LOAN_TYPES: LoanType[] = [
  'PERSONAL',
  'BUSINESS',
  'CAR',
  'GOLD',
  'AGRICULTURAL',
  'HOME',
  'EDUCATION',
  'OTHER',
];

export const INTEREST_TYPES: InterestType[] = [
  'NONE',
  'SIMPLE',
  'FLAT',
  'REDUCING',
  'COMPOUND',
];

export const LOAN_STATUSES: LoanStatus[] = [
  'PENDING',
  'EXPECTED',
  'SETTLED',
  'BAD_DEBT',
];
