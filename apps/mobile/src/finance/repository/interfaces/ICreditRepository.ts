import { Credit, CreditFilter } from '@finance/models/Credit';

/**
 * Data access for the Finance / Credits module.
 *
 * Credits are per-person money transactions (IN / OUT) stored in the `credits`
 * table, fully separate from the Moi domain and the EMI `loans` table. Marking
 * a credit SETTLED only updates its status/settled_date row — the record is
 * preserved for history.
 */
export interface ICreditRepository {
  create(credit: Credit): Promise<void>;
  update(credit: Credit): Promise<void>;
  delete(id: string): Promise<void>;
  getById(id: string): Promise<Credit | null>;
  getAll(filter?: CreditFilter): Promise<Credit[]>;
}
