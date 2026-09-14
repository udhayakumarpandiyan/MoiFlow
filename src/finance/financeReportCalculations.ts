/**
 * Pure, dependency-free reporting math for the Finance Reports screen.
 *
 * Everything here is derived from the user's actual MoiFlow data (credits,
 * loans, business transactions). No external claims, no forecasting beyond
 * simple current-vs-previous comparisons on real numbers.
 */

import { Credit } from './models/Credit';
import { Loan } from './models/Loan';
import { Transaction } from './models/Business';
import { computeLoanSummary } from './loanCalculations';
import { outstandingOf } from './businessCalculations';

// ─── Period selection ─────────────────────────────────────────────────────────

export type ReportPeriod = 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM';

export interface DateRange {
  /** Inclusive start (ms since epoch, start of day). */
  from: number;
  /** Inclusive end (ms since epoch, end of day). */
  to: number;
}

/** A single point in a trend series. */
export interface TrendPoint {
  /** Short axis label (e.g. "Mon", "Jan", "2024"). */
  label: string;
  value: number;
}

/** A labelled change between two numbers. */
export interface PeriodChange {
  key: string;
  current: number;
  previous: number;
  /** Absolute delta = current − previous. */
  delta: number;
  /** Percentage change vs previous (null when previous is 0). */
  percent: number | null;
  /** Whether an increase is good (receivables ↑) or bad (payables ↑). */
  higherIsBetter: boolean;
}

// ─── Section aggregates ────────────────────────────────────────────────────────

export interface CreditReport {
  totalIn: number;
  totalOut: number;
  toReceive: number;
  toGive: number;
  settled: number;
  count: number;
  trend: TrendPoint[];
}

export interface LoanReport {
  totalLoans: number;
  activeLoans: number;
  closedLoans: number;
  totalLoanAmount: number;
  outstandingAmount: number;
  totalEMI: number;
  trend: TrendPoint[];
}

export interface BusinessReport {
  totalSales: number;
  totalPurchases: number;
  customerReceivables: number;
  supplierPayables: number;
  salesTrend: TrendPoint[];
  purchaseTrend: TrendPoint[];
}

export interface OverallReport {
  /** Net position = (receivables + settled credits) − (payables + outstanding loans + toGive). */
  netPosition: number;
  previousNetPosition: number;
  netDelta: number;
  netPercent: number | null;
  changes: PeriodChange[];
  positives: PeriodChange[];
  negatives: PeriodChange[];
}

// ─── Date-range helpers ────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** The active date range for a period (CUSTOM uses the supplied from/to). */
export function rangeForPeriod(
  period: ReportPeriod,
  now: Date = new Date(),
  custom?: { from: Date; to: Date },
): DateRange {
  if (period === 'CUSTOM' && custom) {
    return { from: startOfDay(custom.from).getTime(), to: endOfDay(custom.to).getTime() };
  }
  const to = endOfDay(now).getTime();
  switch (period) {
    case 'WEEKLY':
      return { from: startOfDay(new Date(now.getTime() - 6 * DAY_MS)).getTime(), to };
    case 'YEARLY':
      return { from: new Date(now.getFullYear(), 0, 1).getTime(), to };
    case 'MONTHLY':
    default:
      return { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), to };
  }
}

/** The immediately-preceding range of equal length (for growth comparison). */
export function previousRange(range: DateRange): DateRange {
  const span = range.to - range.from;
  return { from: range.from - span - 1, to: range.from - 1 };
}

function inRange(iso: string | null | undefined, range: DateRange): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t >= range.from && t <= range.to;
}

// ─── Trend bucketing ──────────────────────────────────────────────────────────

interface Bucket {
  label: string;
  from: number;
  to: number;
}

/**
 * Build the time buckets that span a range for a given period granularity:
 *  - WEEKLY  → 7 daily buckets
 *  - MONTHLY → weekly buckets across the month
 *  - YEARLY  → 12 monthly buckets
 *  - CUSTOM  → up to 12 evenly-sized buckets across the range
 */
export function bucketsForPeriod(period: ReportPeriod, range: DateRange): Bucket[] {
  const buckets: Bucket[] = [];
  const start = new Date(range.from);

  if (period === 'WEEKLY') {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(range.from + i * DAY_MS);
      const from = startOfDay(d).getTime();
      buckets.push({ label: dayNames[d.getDay()], from, to: from + DAY_MS - 1 });
    }
    return buckets;
  }

  if (period === 'YEARLY') {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const year = start.getFullYear();
    for (let m = 0; m < 12; m++) {
      const from = new Date(year, m, 1).getTime();
      const to = new Date(year, m + 1, 1).getTime() - 1;
      buckets.push({ label: monthNames[m], from, to });
    }
    return buckets;
  }

  if (period === 'MONTHLY') {
    // Weekly buckets within the month.
    let cursor = startOfDay(start).getTime();
    let week = 1;
    while (cursor <= range.to && week <= 6) {
      const to = Math.min(cursor + 7 * DAY_MS - 1, range.to);
      buckets.push({ label: `W${week}`, from: cursor, to });
      cursor = to + 1;
      week += 1;
    }
    return buckets;
  }

  // CUSTOM — up to 12 even segments.
  const span = Math.max(range.to - range.from, 1);
  const segments = Math.min(12, Math.max(1, Math.ceil(span / (7 * DAY_MS))));
  const segMs = Math.ceil(span / segments);
  for (let i = 0; i < segments; i++) {
    const from = range.from + i * segMs;
    const to = Math.min(from + segMs - 1, range.to);
    const d = new Date(from);
    buckets.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, from, to });
  }
  return buckets;
}

function sumInBuckets<T>(
  items: T[],
  buckets: Bucket[],
  dateOf: (t: T) => string,
  valueOf: (t: T) => number,
): TrendPoint[] {
  return buckets.map(b => {
    let value = 0;
    for (const item of items) {
      const ts = new Date(dateOf(item)).getTime();
      if (!Number.isNaN(ts) && ts >= b.from && ts <= b.to) value += valueOf(item);
    }
    return { label: b.label, value: round2(value) };
  });
}

// ─── Credit report ─────────────────────────────────────────────────────────────

export function buildCreditReport(
  credits: Credit[],
  period: ReportPeriod,
  range: DateRange,
): CreditReport {
  const inRangeCredits = credits.filter(c => inRange(c.date, range));
  let totalIn = 0;
  let totalOut = 0;
  let toReceive = 0;
  let toGive = 0;
  let settled = 0;

  for (const c of inRangeCredits) {
    if (c.direction === 'IN') totalIn += c.amount;
    else totalOut += c.amount;
    if (c.status === 'SETTLED') settled += c.amount;
    else if (c.direction === 'IN') toReceive += c.amount;
    else toGive += c.amount;
  }

  const buckets = bucketsForPeriod(period, range);
  const trend = sumInBuckets(inRangeCredits, buckets, c => c.date, c => c.amount);

  return {
    totalIn: round2(totalIn),
    totalOut: round2(totalOut),
    toReceive: round2(toReceive),
    toGive: round2(toGive),
    settled: round2(settled),
    count: inRangeCredits.length,
    trend,
  };
}

// ─── Loan report ────────────────────────────────────────────────────────────────

export function buildLoanReport(
  loans: Loan[],
  period: ReportPeriod,
  range: DateRange,
): LoanReport {
  // Totals reflect the current loan book (loans started within the range for
  // the "new loans" trend; outstanding/EMI are current-state figures).
  const active = loans.filter(l => l.status === 'ACTIVE');
  const closed = loans.filter(l => l.status === 'CLOSED');
  const totalLoanAmount = sumBy(loans, l => l.loanAmount);
  const outstandingAmount = sumBy(active, l => computeLoanSummary(l).outstandingAmount);
  const totalEMI = sumBy(active, l => l.monthlyEMI);

  const buckets = bucketsForPeriod(period, range);
  const started = loans.filter(l => inRange(l.startDate, range));
  const trend = sumInBuckets(started, buckets, l => l.startDate, l => l.loanAmount);

  return {
    totalLoans: loans.length,
    activeLoans: active.length,
    closedLoans: closed.length,
    totalLoanAmount: round2(totalLoanAmount),
    outstandingAmount: round2(outstandingAmount),
    totalEMI: round2(totalEMI),
    trend,
  };
}

// ─── Business report ─────────────────────────────────────────────────────────────

export function buildBusinessReport(
  sales: Transaction[],
  purchases: Transaction[],
  period: ReportPeriod,
  range: DateRange,
): BusinessReport {
  const rangeSales = sales.filter(t => inRange(t.date, range));
  const rangePurchases = purchases.filter(t => inRange(t.date, range));

  const totalSales = sumBy(rangeSales, t => t.amount);
  const totalPurchases = sumBy(rangePurchases, t => t.amount);
  // Receivables/payables are current-state across ALL transactions.
  const customerReceivables = sumBy(sales, t => outstandingOf(t));
  const supplierPayables = sumBy(purchases, t => outstandingOf(t));

  const buckets = bucketsForPeriod(period, range);
  const salesTrend = sumInBuckets(rangeSales, buckets, t => t.date, t => t.amount);
  const purchaseTrend = sumInBuckets(rangePurchases, buckets, t => t.date, t => t.amount);

  return {
    totalSales: round2(totalSales),
    totalPurchases: round2(totalPurchases),
    customerReceivables: round2(customerReceivables),
    supplierPayables: round2(supplierPayables),
    salesTrend,
    purchaseTrend,
  };
}

// ─── Overall growth ────────────────────────────────────────────────────────────

/**
 * Net financial position for a window = money coming to the user minus money
 * going out, using activity within the window:
 *   + credit IN + sales   − credit OUT − purchases − new loan amounts
 * This measures period activity, letting us compare current vs previous.
 */
function netForRange(
  credits: Credit[],
  loans: Loan[],
  sales: Transaction[],
  purchases: Transaction[],
  range: DateRange,
): { net: number; parts: Record<string, number> } {
  const creditIn = sumBy(credits.filter(c => c.direction === 'IN' && inRange(c.date, range)), c => c.amount);
  const creditOut = sumBy(credits.filter(c => c.direction === 'OUT' && inRange(c.date, range)), c => c.amount);
  const salesAmt = sumBy(sales.filter(t => inRange(t.date, range)), t => t.amount);
  const purchaseAmt = sumBy(purchases.filter(t => inRange(t.date, range)), t => t.amount);
  const newLoans = sumBy(loans.filter(l => inRange(l.startDate, range)), l => l.loanAmount);

  const net = round2(creditIn + salesAmt - creditOut - purchaseAmt - newLoans);
  return {
    net,
    parts: {
      creditIn: round2(creditIn),
      creditOut: round2(creditOut),
      sales: round2(salesAmt),
      purchases: round2(purchaseAmt),
      newLoans: round2(newLoans),
    },
  };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return round1(((current - previous) / Math.abs(previous)) * 100);
}

export function buildOverallReport(
  credits: Credit[],
  loans: Loan[],
  sales: Transaction[],
  purchases: Transaction[],
  range: DateRange,
): OverallReport {
  const prev = previousRange(range);
  const cur = netForRange(credits, loans, sales, purchases, range);
  const pre = netForRange(credits, loans, sales, purchases, prev);

  const define = (
    key: string,
    current: number,
    previous: number,
    higherIsBetter: boolean,
  ): PeriodChange => ({
    key,
    current,
    previous,
    delta: round2(current - previous),
    percent: pctChange(current, previous),
    higherIsBetter,
  });

  const changes: PeriodChange[] = [
    define('creditIn', cur.parts.creditIn, pre.parts.creditIn, true),
    define('sales', cur.parts.sales, pre.parts.sales, true),
    define('creditOut', cur.parts.creditOut, pre.parts.creditOut, false),
    define('purchases', cur.parts.purchases, pre.parts.purchases, false),
    define('newLoans', cur.parts.newLoans, pre.parts.newLoans, false),
  ];

  const improved = (c: PeriodChange) =>
    c.higherIsBetter ? c.delta > 0 : c.delta < 0;
  const worsened = (c: PeriodChange) =>
    c.higherIsBetter ? c.delta < 0 : c.delta > 0;

  const positives = changes
    .filter(c => improved(c) && Math.abs(c.delta) > 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const negatives = changes
    .filter(c => worsened(c) && Math.abs(c.delta) > 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    netPosition: cur.net,
    previousNetPosition: pre.net,
    netDelta: round2(cur.net - pre.net),
    netPercent: pctChange(cur.net, pre.net),
    changes,
    positives,
    negatives,
  };
}

// ─── AI summary & suggestions (data-driven, no external claims) ──────────────────

export interface SummaryInput {
  overall: OverallReport;
  credit: CreditReport;
  loan: LoanReport;
  business: BusinessReport;
}

/** Keys the UI maps to i18n templates, plus the interpolation values. */
export interface SummaryLine {
  key:
    | 'improved'
    | 'declined'
    | 'flat'
    | 'noData'
    | 'receivablesUp'
    | 'receivablesDown'
    | 'loansDown'
    | 'loansUp'
    | 'salesUp'
    | 'purchasesUp';
  values?: Record<string, string | number>;
}

export function buildAiSummary(input: SummaryInput): SummaryLine[] {
  const { overall, credit, loan, business } = input;
  const lines: SummaryLine[] = [];

  const hasData =
    credit.count > 0 || loan.totalLoans > 0 || business.totalSales > 0 || business.totalPurchases > 0;
  if (!hasData) return [{ key: 'noData' }];

  // Headline: overall direction.
  if (overall.netDelta > 0) {
    lines.push({ key: 'improved', values: pctOrAbs(overall.netPercent, overall.netDelta) });
  } else if (overall.netDelta < 0) {
    lines.push({ key: 'declined', values: pctOrAbs(overall.netPercent, Math.abs(overall.netDelta)) });
  } else {
    lines.push({ key: 'flat' });
  }

  // Notable specifics from the top positive/negative changes.
  const byKey = (k: string) => overall.changes.find(c => c.key === k);

  const recv = byKey('creditIn');
  if (recv && recv.percent != null && recv.delta !== 0) {
    lines.push({
      key: recv.delta > 0 ? 'receivablesUp' : 'receivablesDown',
      values: { percent: Math.abs(recv.percent) },
    });
  }

  const sales = byKey('sales');
  if (sales && sales.delta > 0 && sales.percent != null) {
    lines.push({ key: 'salesUp', values: { percent: Math.abs(sales.percent) } });
  }

  const purch = byKey('purchases');
  if (purch && purch.delta > 0 && purch.percent != null) {
    lines.push({ key: 'purchasesUp', values: { percent: Math.abs(purch.percent) } });
  }

  return lines;
}

export interface Suggestion {
  key:
    | 'reduceOutstandingLoans'
    | 'followUpReceivables'
    | 'controlPurchases'
    | 'improveSales'
    | 'clearPayables'
    | 'settlePendingCredits'
    | 'healthy';
}

export function buildSuggestions(input: SummaryInput): Suggestion[] {
  const { overall, credit, loan, business } = input;
  const suggestions: Suggestion[] = [];

  if (loan.outstandingAmount > 0) {
    suggestions.push({ key: 'reduceOutstandingLoans' });
  }
  if (business.customerReceivables > 0 || credit.toReceive > 0) {
    suggestions.push({ key: 'followUpReceivables' });
  }
  const purch = overall.changes.find(c => c.key === 'purchases');
  if (purch && purch.delta > 0) {
    suggestions.push({ key: 'controlPurchases' });
  }
  const sales = overall.changes.find(c => c.key === 'sales');
  if (sales && sales.delta < 0) {
    suggestions.push({ key: 'improveSales' });
  }
  if (business.supplierPayables > 0) {
    suggestions.push({ key: 'clearPayables' });
  }
  if (credit.toGive > 0) {
    suggestions.push({ key: 'settlePendingCredits' });
  }

  if (suggestions.length === 0) {
    suggestions.push({ key: 'healthy' });
  }
  return suggestions;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function pctOrAbs(percent: number | null, absVal: number): Record<string, string | number> {
  return percent != null ? { percent: Math.abs(percent) } : { amount: round2(absVal) };
}

function sumBy<T>(items: T[], fn: (t: T) => number): number {
  return items.reduce((acc, t) => acc + (Number(fn(t)) || 0), 0);
}

function round1(n: number): number {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
