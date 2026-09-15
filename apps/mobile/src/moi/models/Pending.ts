/**
 * Pending Payments & Receivables model.
 *
 * "Pending" is DERIVED from the existing entries (no duplicate ledger):
 *   - RECEIVABLE (someone owes me): the net of what I GAVE them (OTHER_EVENT / OUT)
 *     minus what they GAVE me (OWN_EVENT / IN), when OUT > IN.
 *   - PAYABLE (I owe someone): the reverse, when IN > OUT.
 *
 * A separate append-only `settlements` ledger records how much of each pending
 * balance has since been received/paid (supports partial settlement) WITHOUT
 * ever mutating or deleting the original entries — transaction history is
 * preserved. Outstanding = due − settled.
 */

export type PendingDirection = 'RECEIVABLE' | 'PAYABLE';

export type PendingStatus = 'PENDING' | 'PARTIAL' | 'SETTLED';

/** One pending line — grouped per person, and per event when event scoping is on. */
export interface PendingItem {
  /** Stable key for this pending line (person[+event][+direction]). */
  key: string;
  direction: PendingDirection;

  personId: string;
  personName: string;
  villageName?: string | null;

  /** Event this pending relates to (null = aggregated across all events). */
  eventId?: string | null;
  eventName?: string | null;
  eventDate?: string | null;

  /** Gross amount due for this direction (before settlements). */
  dueCash: number;
  dueGold: number;

  /** Amount already received/paid via the settlements ledger. */
  settledCash: number;
  settledGold: number;

  /** Outstanding = max(due − settled, 0). */
  pendingCash: number;
  pendingGold: number;

  status: PendingStatus;

  /** Most recent related entry date (for display / sorting). */
  lastEntryDate?: string | null;

  /** Follow-up reminder datetime (ISO), if set. */
  reminderAt?: string | null;
}

/** A single settlement ledger record (append-only history). */
export interface Settlement {
  id: string;
  direction: PendingDirection;
  personId: string;
  personName: string;
  eventId?: string | null;
  settledCash: number;
  settledGold: number;
  note?: string | null;
  settledAt: string;
  createdAt: string;
}

export interface CreateSettlementInput {
  direction: PendingDirection;
  personId: string;
  personName: string;
  eventId?: string | null;
  settledCash: number;
  settledGold: number;
  note?: string | null;
}

/** Totals across a set of pending items. */
export interface PendingTotals {
  receivableCash: number;
  receivableGold: number;
  payableCash: number;
  payableGold: number;
  receivableCount: number;
  payableCount: number;
}

/** Filters for querying pending items. */
export interface PendingFilter {
  direction?: PendingDirection;
  eventId?: string;
  personId?: string;
  personName?: string;
  villageName?: string;
  fromDate?: string;
  toDate?: string;
  /** Only include items with pending cash > 0. */
  cashOnly?: boolean;
  /** Only include items with pending gold > 0. */
  goldOnly?: boolean;
  status?: PendingStatus;
  /** When true, produce one line per person+event instead of per person. */
  perEvent?: boolean;
}
