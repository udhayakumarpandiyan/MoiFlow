/**
 * ReportExportService tests — the pure HTML + CSV builders (no native modules).
 * Verifies receivables, payables, per-line fields (person, event, cash/gold
 * pending, status, follow-up date) and summary totals appear in the output.
 */

import { ReportExportService } from '../../src/services/ReportExportService';
import type { PendingExportData } from '../../src/services/ReportExportService';
import type { PendingItem } from '../../src/models/Pending';

const svc = new ReportExportService();

const fmt = {
  cash: (n: number) => `INR ${n}`,
  gold: (n: number) => `${n}g`,
  date: (iso?: string | null) => (iso ? String(iso).slice(0, 10) : '-'),
  statusLabel: (s: string) => s,
};

function item(overrides: Partial<PendingItem>): PendingItem {
  return {
    key: 'k',
    direction: 'RECEIVABLE',
    personId: 'p1',
    personName: 'Ravi',
    villageName: 'Kovai',
    eventId: 'e1',
    eventName: 'Wedding',
    eventDate: '2026-02-01',
    dueCash: 1000,
    dueGold: 2,
    settledCash: 0,
    settledGold: 0,
    pendingCash: 1000,
    pendingGold: 2,
    status: 'PENDING',
    lastEntryDate: '2026-01-15',
    reminderAt: '2026-03-01',
    ...overrides,
  };
}

const data: PendingExportData = {
  receivables: [
    item({ personName: 'Ravi', eventName: 'Wedding', pendingCash: 1000, pendingGold: 2, status: 'PENDING' }),
    item({ personName: 'Kumar', direction: 'RECEIVABLE', pendingCash: 500, pendingGold: 0, status: 'PARTIAL', reminderAt: null }),
  ],
  payables: [
    item({ personName: 'Devi', direction: 'PAYABLE', pendingCash: 300, pendingGold: 0, status: 'PENDING' }),
  ],
  totals: {
    receivableCash: 1500,
    receivableGold: 2,
    payableCash: 300,
    payableGold: 0,
    receivableCount: 2,
    payableCount: 1,
  },
  generatedAt: '2026-02-20T10:00:00.000Z',
};

describe('ReportExportService.buildHtml', () => {
  const html = svc.buildHtml(data, fmt);

  it('includes both receivables and payables sections', () => {
    expect(html).toContain('Pending Receivables');
    expect(html).toContain('Pending Payables');
  });

  it('includes per-line person, event, cash, gold, status and follow-up', () => {
    expect(html).toContain('Ravi');
    expect(html).toContain('Wedding');
    expect(html).toContain('INR 1000');
    expect(html).toContain('2g');
    expect(html).toContain('PENDING');
    expect(html).toContain('2026-03-01'); // follow-up date
  });

  it('includes summary totals', () => {
    expect(html).toContain('INR 1500'); // total receivable cash
    expect(html).toContain('INR 300'); // total payable cash
  });

  it('escapes HTML-unsafe characters in person names', () => {
    const risky = svc.buildHtml(
      { ...data, receivables: [item({ personName: 'A & <b>B</b>' })], payables: [] },
      fmt,
    );
    expect(risky).toContain('A &amp; &lt;b&gt;B&lt;/b&gt;');
    expect(risky).not.toContain('<b>B</b>');
  });
});

describe('ReportExportService.buildCsv', () => {
  const csv = svc.buildCsv(data, fmt);
  const lines = csv.split('\n');

  it('has a header row with the expected columns', () => {
    expect(csv).toContain('Direction,Person,Event,Cash Pending,Gold Pending,Status,Date,Follow-up');
  });

  it('includes receivable and payable rows', () => {
    expect(csv).toContain('Receivable,Ravi,Wedding,1000,2,PENDING');
    expect(csv).toContain('Payable,Devi,Wedding,300,0,PENDING');
  });

  it('includes summary totals', () => {
    expect(csv).toContain('Total Receivable Cash,1500');
    expect(csv).toContain('Total Payable Cash,300');
  });

  it('quotes/escapes cells containing commas or quotes', () => {
    const csv2 = svc.buildCsv(
      { ...data, receivables: [item({ personName: 'Ravi, Jr "the elder"', eventName: 'X' })], payables: [] },
      fmt,
    );
    expect(csv2).toContain('"Ravi, Jr ""the elder"""');
  });

  it('produces a non-trivial number of rows', () => {
    expect(lines.length).toBeGreaterThan(6);
  });
});
