import {
  Party,
  PartyFilter,
  Transaction,
  TransactionFilter,
} from '@finance/models/Business';

/**
 * Data access for the Finance / Business module (customers, suppliers, sales,
 * purchases). Parties and transactions live in dedicated tables. Outstanding
 * amounts and payment status are never stored — they are derived in the service
 * layer from amount − amount_settled.
 */
export interface IBusinessRepository {
  // ── Parties (customers / suppliers) ─────────────────────────────────────────
  createParty(party: Party): Promise<void>;
  updateParty(party: Party): Promise<void>;
  deleteParty(id: string): Promise<void>;
  getParty(id: string): Promise<Party | null>;
  getParties(filter?: PartyFilter): Promise<Party[]>;

  // ── Transactions (sales / purchases) ────────────────────────────────────────
  createTransaction(txn: Transaction): Promise<void>;
  updateTransaction(txn: Transaction): Promise<void>;
  deleteTransaction(id: string): Promise<void>;
  getTransaction(id: string): Promise<Transaction | null>;
  getTransactions(filter?: TransactionFilter): Promise<Transaction[]>;
  /** Transactions for many parties in one query (partyId → transactions). */
  getTransactionsForParties(partyIds: string[]): Promise<Record<string, Transaction[]>>;
}
