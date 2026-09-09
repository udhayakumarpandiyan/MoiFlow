import {
  PendingItem,
  PendingFilter,
  Settlement,
  CreateSettlementInput,
} from '../../models/Pending';

/**
 * Data access for Pending Payments & Receivables.
 *
 * Pending balances are DERIVED from `entries` (aggregated per person, optionally
 * per event) and offset by the append-only `settlements` ledger. The repository
 * never mutates or deletes entries — settlement is recorded as new ledger rows.
 */
export interface IPendingRepository {
  /**
   * Return pending items (receivables and/or payables) matching the filter.
   * Efficient: aggregation + settlement offset happen in SQL; only rows with a
   * positive derived-due for the requested direction(s) are materialized.
   */
  getPending(filter?: PendingFilter): Promise<PendingItem[]>;

  /** Append a settlement record (partial or full). Never touches entries. */
  addSettlement(input: CreateSettlementInput): Promise<Settlement>;

  /** Full settlement history for a person (optionally a specific event). */
  getSettlements(personId: string, eventId?: string | null): Promise<Settlement[]>;

  /** Set / update a follow-up reminder datetime for a pending line key. */
  setReminder(
    key: string,
    personId: string,
    eventId: string | null,
    direction: string,
    remindAtISO: string,
  ): Promise<void>;

  /** Remove a reminder for a pending line key. */
  clearReminder(key: string): Promise<void>;

  /** Map of pending-line key → reminder ISO datetime, for the given keys. */
  getReminders(keys: string[]): Promise<Record<string, string>>;
}
