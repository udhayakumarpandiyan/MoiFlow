/**
 * Finance module — Business domain models.
 *
 * The Business section tracks a small trader's customers, suppliers, and the
 * sales/purchases between them. It is independent from the Moi and Loan
 * domains and lives in its own tables.
 *
 * Parties (customers/suppliers) store contact info only. Each transaction
 * (sale/purchase) stores its amount and amount paid/received; the outstanding
 * amount and payment status are DERIVED (see businessCalculations.ts) so they
 * always stay consistent when a transaction or payment is edited.
 */

/** Who the party is. */
export type PartyKind = 'CUSTOMER' | 'SUPPLIER';

/** What the transaction is. Sales are to customers, purchases from suppliers. */
export type TransactionKind = 'SALE' | 'PURCHASE';

/** Derived payment status for a transaction. */
export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

// ─── Party (Customer / Supplier) ───────────────────────────────────────────────

export interface Party {
  id: string;
  kind: PartyKind;
  name: string;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  syncStatus: number;
}

export interface CreatePartyInput {
  kind: PartyKind;
  name: string;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
}

// ─── Transaction (Sale / Purchase) ─────────────────────────────────────────────

export interface Transaction {
  id: string;
  kind: TransactionKind;
  /** Linked party — customer for a SALE, supplier for a PURCHASE. */
  partyId: string;
  /** ISO date of the sale/purchase. */
  date: string;
  /** Item / description. */
  description?: string | null;
  /** Quantity (free-form numeric; 0 when not tracked). */
  quantity: number;
  /** Total amount of the transaction in INR. */
  amount: number;
  /**
   * Amount settled so far — amount received for a SALE, amount paid for a
   * PURCHASE. Outstanding + status are derived from amount − amountSettled.
   */
  amountSettled: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  syncStatus: number;
}

export interface CreateTransactionInput {
  kind: TransactionKind;
  partyId: string;
  date: string;
  description?: string | null;
  quantity?: number;
  amount: number;
  amountSettled?: number;
  notes?: string | null;
}

// ─── Derived (computed) types ─────────────────────────────────────────────────

/** A transaction plus its derived outstanding amount + payment status. */
export interface TransactionView {
  transaction: Transaction;
  outstanding: number;
  status: PaymentStatus;
}

/** A party plus its derived rollups from all linked transactions. */
export interface PartySummary {
  party: Party;
  /** Total transacted (total sales for a customer / total purchases for a supplier). */
  totalAmount: number;
  /** Total settled (received from a customer / paid to a supplier). */
  totalSettled: number;
  /** Outstanding = totalAmount − totalSettled (clamped ≥ 0). */
  outstanding: number;
  /** Number of linked transactions. */
  transactionCount: number;
  /** ISO date of the most recent transaction, if any. */
  lastTransactionDate: string | null;
}

/** Top-of-screen business summary. */
export interface BusinessSummary {
  totalSales: number;
  totalPurchases: number;
  /** Money customers still owe the business. */
  customerReceivables: number;
  /** Money the business still owes suppliers. */
  supplierPayables: number;
}

// ─── Filters ────────────────────────────────────────────────────────────────

export interface PartyFilter {
  kind?: PartyKind;
  keyword?: string;
}

export interface TransactionFilter {
  kind?: TransactionKind;
  partyId?: string;
  keyword?: string;
}
