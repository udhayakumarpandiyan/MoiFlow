import {
  Transaction,
  TransactionView,
  PaymentStatus,
  Party,
  PartySummary,
  BusinessSummary,
} from './models/Business';

/**
 * Pure, dependency-free business math. Outstanding amounts and payment statuses
 * are always derived from amount − amountSettled so they stay correct whenever a
 * transaction or payment is edited. Nothing here mutates its inputs.
 */

/** Balances within this many rupees are treated as fully settled. */
const CLEAR_EPSILON = 0.5;

export function outstandingOf(txn: Transaction): number {
  return round2(Math.max((Number(txn.amount) || 0) - (Number(txn.amountSettled) || 0), 0));
}

export function statusOf(txn: Transaction): PaymentStatus {
  const amount = Number(txn.amount) || 0;
  const settled = Number(txn.amountSettled) || 0;
  if (settled <= CLEAR_EPSILON) return 'UNPAID';
  if (settled >= amount - CLEAR_EPSILON) return 'PAID';
  return 'PARTIAL';
}

export function toTransactionView(txn: Transaction): TransactionView {
  return {
    transaction: txn,
    outstanding: outstandingOf(txn),
    status: statusOf(txn),
  };
}

/** Roll up a party's transactions into a summary. */
export function computePartySummary(
  party: Party,
  transactions: Transaction[],
): PartySummary {
  let totalAmount = 0;
  let totalSettled = 0;
  let lastTransactionDate: string | null = null;

  for (const t of transactions) {
    totalAmount += Number(t.amount) || 0;
    totalSettled += Number(t.amountSettled) || 0;
    if (!lastTransactionDate || t.date > lastTransactionDate) {
      lastTransactionDate = t.date;
    }
  }

  return {
    party,
    totalAmount: round2(totalAmount),
    totalSettled: round2(totalSettled),
    outstanding: round2(Math.max(totalAmount - totalSettled, 0)),
    transactionCount: transactions.length,
    lastTransactionDate,
  };
}

/** Aggregate the whole business into the top-of-screen summary. */
export function computeBusinessSummary(
  sales: Transaction[],
  purchases: Transaction[],
): BusinessSummary {
  const totalSales = round2(sumBy(sales, t => Number(t.amount) || 0));
  const totalPurchases = round2(sumBy(purchases, t => Number(t.amount) || 0));
  const customerReceivables = round2(sumBy(sales, t => outstandingOf(t)));
  const supplierPayables = round2(sumBy(purchases, t => outstandingOf(t)));
  return { totalSales, totalPurchases, customerReceivables, supplierPayables };
}

/** Clamp a settled amount so it never exceeds the transaction total. */
export function clampSettled(amount: number, settled: number): number {
  const a = Number(amount) || 0;
  const s = Number(settled) || 0;
  if (s < 0) return 0;
  if (s > a) return round2(a);
  return round2(s);
}

// ── helpers ──────────────────────────────────────────────────────────────────

function sumBy<T>(items: T[], fn: (t: T) => number): number {
  return items.reduce((acc, t) => acc + fn(t), 0);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
