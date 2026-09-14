/**
 * Credits domain model — a per-person money-transaction ledger, separate from
 * the EMI-based Loans module.
 *
 * A Credit records money the user expects to receive (IN) or needs to give
 * (OUT), with an interest rate, the counter-party's details, an optional event
 * link and an Upcoming/Settled lifecycle. Marking a credit SETTLED only flips
 * its status and stores the settled date — the row is always preserved.
 */

/** Direction of the money flow. IN = to receive, OUT = to give. */
export type CreditDirection = 'IN' | 'OUT';

/** Credit lifecycle status. */
export type CreditStatus = 'UPCOMING' | 'SETTLED';

export interface Credit {
  id: string;

  /** IN = money the user will receive, OUT = money the user must pay. */
  direction: CreditDirection;

  /** Transaction amount in INR. */
  amount: number;

  /** Interest rate as a percentage (e.g. 12 = 12%). Stored/displayed only. */
  interestRate: number;

  /** ISO date of the transaction (used for sorting / reminders). */
  date: string;

  /** Counter-party name. */
  person: string;

  /** Counter-party village / place. */
  village?: string | null;

  /** Counter-party mobile number. */
  mobileNumber?: string | null;

  /** Optional linked event id. */
  eventId?: string | null;

  /** Optional linked event name (denormalised for display). */
  eventName?: string | null;

  notes?: string | null;

  status: CreditStatus;

  /** ISO date the credit was settled (set when status becomes SETTLED). */
  settledDate?: string | null;

  createdAt: string;
  updatedAt: string;
  syncStatus: number;
}

export interface CreateCreditInput {
  direction: CreditDirection;
  amount: number;
  interestRate?: number;
  date: string;
  person: string;
  village?: string | null;
  mobileNumber?: string | null;
  eventId?: string | null;
  eventName?: string | null;
  notes?: string | null;
  status?: CreditStatus;
  settledDate?: string | null;
}

// ─── Filters ────────────────────────────────────────────────────────────────

export interface CreditFilter {
  direction?: CreditDirection;
  status?: CreditStatus;
  keyword?: string;
}

// ─── Aggregate (computed) types ───────────────────────────────────────────────

/** Aggregate totals for the Credits summary header. Never stored. */
export interface CreditTotals {
  count: number;

  /** Total outstanding IN amount (UPCOMING, direction IN). */
  toReceive: number;

  /** Total outstanding OUT amount (UPCOMING, direction OUT). */
  toGive: number;

  /** Total amount of all SETTLED credits. */
  settled: number;

  /** Net pending = toReceive − toGive. */
  netPending: number;

  upcomingCount: number;
  settledCount: number;
}

// ─── Option lists (for pickers/filters) ────────────────────────────────────────

export const CREDIT_DIRECTIONS: CreditDirection[] = ['IN', 'OUT'];
export const CREDIT_STATUSES: CreditStatus[] = ['UPCOMING', 'SETTLED'];

/** UI filter keys used by the Credits list. */
export type CreditFilterKey = 'ALL' | 'IN' | 'OUT' | 'UPCOMING' | 'SETTLED';
export const CREDIT_FILTER_KEYS: CreditFilterKey[] = [
  'ALL',
  'IN',
  'OUT',
  'UPCOMING',
  'SETTLED',
];
