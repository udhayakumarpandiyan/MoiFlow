import type { PendingItem, PendingTotals } from '../models/Pending';

/**
 * Report export for Pending Payments & Receivables.
 *
 * The app has no PDF/Excel library, only react-native-share + react-native-fs
 * (both already used by BackupService/Events). So we:
 *   - PDF  → build a styled HTML document and share it (the share sheet / printer
 *            can save/print it as PDF). Native modules are loaded lazily so this
 *            file has no hard native dependency and degrades gracefully.
 *   - Excel→ build a CSV (opens in Excel/Sheets) written to a file and shared.
 *
 * Both include receivables, payables, per-line fields (person, event, cash/gold
 * pending, status, follow-up date) and summary totals.
 */

export interface PendingExportData {
  receivables: PendingItem[];
  payables: PendingItem[];
  totals: PendingTotals;
  generatedAt: string;
}

type Formatter = {
  cash: (n: number) => string;
  gold: (n: number) => string;
  date: (iso?: string | null) => string;
  statusLabel: (s: string) => string;
};

const DEFAULT_FMT: Formatter = {
  cash: n => `₹${(Number(n) || 0).toLocaleString('en-IN')}`,
  gold: n => `${Number(n) || 0} g`,
  date: iso => (iso ? String(iso).slice(0, 10) : '-'),
  statusLabel: s => s,
};

class ReportExportService {
  // ── Public API ───────────────────────────────────────────────────────────

  /** Export the pending report as HTML (shared as/printable to PDF). */
  async exportPendingPdf(
    data: PendingExportData,
    fmt: Partial<Formatter> = {},
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    const f = { ...DEFAULT_FMT, ...fmt };
    const html = this.buildHtml(data, f);
    return this.writeAndShare('moiflow-pending', 'html', html, 'text/html');
  }

  /** Export the pending report as CSV (opens in Excel / Google Sheets). */
  async exportPendingCsv(
    data: PendingExportData,
    fmt: Partial<Formatter> = {},
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    const f = { ...DEFAULT_FMT, ...fmt };
    const csv = this.buildCsv(data, f);
    return this.writeAndShare('moiflow-pending', 'csv', csv, 'text/csv');
  }

  // ── HTML (PDF) ─────────────────────────────────────────────────────────────

  buildHtml(data: PendingExportData, f: Formatter): string {
    const { receivables, payables, totals } = data;

    const section = (title: string, items: PendingItem[]): string => `
      <h2>${escapeHtml(title)}</h2>
      ${
        items.length === 0
          ? '<p class="muted">None</p>'
          : `<table>
              <thead>
                <tr>
                  <th>Person</th><th>Event</th>
                  <th class="num">Cash Pending</th><th class="num">Gold Pending</th>
                  <th>Status</th><th>Date</th><th>Follow-up</th>
                </tr>
              </thead>
              <tbody>
                ${items
                  .map(
                    it => `<tr>
                      <td>${escapeHtml(it.personName)}</td>
                      <td>${escapeHtml(it.eventName ?? '-')}</td>
                      <td class="num">${escapeHtml(f.cash(it.pendingCash))}</td>
                      <td class="num">${escapeHtml(f.gold(it.pendingGold))}</td>
                      <td>${escapeHtml(f.statusLabel(it.status))}</td>
                      <td>${escapeHtml(f.date(it.lastEntryDate))}</td>
                      <td>${escapeHtml(f.date(it.reminderAt))}</td>
                    </tr>`,
                  )
                  .join('')}
              </tbody>
            </table>`
      }`;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: -apple-system, Roboto, Arial, sans-serif; color: #1A2E2A; padding: 24px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    h2 { font-size: 16px; margin: 24px 0 8px; color: #09a564; }
    .sub { color: #6B8F86; font-size: 12px; margin: 0 0 16px; }
    .summary { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 0 8px; }
    .card { border: 1px solid #E0EDEA; border-radius: 10px; padding: 12px 16px; min-width: 150px; }
    .card .label { font-size: 11px; color: #6B8F86; }
    .card .value { font-size: 16px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 12px; }
    th, td { border: 1px solid #E0EDEA; padding: 6px 8px; text-align: left; }
    th { background: #E5F7EF; }
    .num { text-align: right; }
    .muted { color: #6B8F86; font-size: 12px; }
  </style>
</head>
<body>
  <h1>MoiFlow — Pending Payments &amp; Receivables</h1>
  <p class="sub">Generated ${escapeHtml(f.date(data.generatedAt))}</p>

  <div class="summary">
    <div class="card"><div class="label">Total Receivable (Cash)</div><div class="value">${escapeHtml(f.cash(totals.receivableCash))}</div></div>
    <div class="card"><div class="label">Total Receivable (Gold)</div><div class="value">${escapeHtml(f.gold(totals.receivableGold))}</div></div>
    <div class="card"><div class="label">Total Payable (Cash)</div><div class="value">${escapeHtml(f.cash(totals.payableCash))}</div></div>
    <div class="card"><div class="label">Total Payable (Gold)</div><div class="value">${escapeHtml(f.gold(totals.payableGold))}</div></div>
  </div>

  ${section('Pending Receivables', receivables)}
  ${section('Pending Payables', payables)}
</body>
</html>`;
  }

  // ── CSV (Excel) ──────────────────────────────────────────────────────────────

  buildCsv(data: PendingExportData, f: Formatter): string {
    const rows: string[][] = [];
    rows.push(['MoiFlow — Pending Payments & Receivables']);
    rows.push(['Generated', f.date(data.generatedAt)]);
    rows.push([]);
    rows.push([
      'Direction',
      'Person',
      'Event',
      'Cash Pending',
      'Gold Pending',
      'Status',
      'Date',
      'Follow-up',
    ]);

    const push = (label: string, items: PendingItem[]) => {
      for (const it of items) {
        rows.push([
          label,
          it.personName,
          it.eventName ?? '',
          String(it.pendingCash),
          String(it.pendingGold),
          it.status,
          f.date(it.lastEntryDate),
          f.date(it.reminderAt),
        ]);
      }
    };
    push('Receivable', data.receivables);
    push('Payable', data.payables);

    rows.push([]);
    rows.push(['Summary']);
    rows.push(['Total Receivable Cash', String(data.totals.receivableCash)]);
    rows.push(['Total Receivable Gold', String(data.totals.receivableGold)]);
    rows.push(['Total Payable Cash', String(data.totals.payableCash)]);
    rows.push(['Total Payable Gold', String(data.totals.payableGold)]);

    return rows.map(r => r.map(csvCell).join(',')).join('\n');
  }

  // ── Write + share (lazy native modules) ───────────────────────────────────────

  private async writeAndShare(
    baseName: string,
    ext: string,
    content: string,
    mime: string,
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const RNFS = require('react-native-fs');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Share = require('react-native-share').default;

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const dir = RNFS.CachesDirectoryPath ?? RNFS.DocumentDirectoryPath;
      const path = `${dir}/${baseName}-${stamp}.${ext}`;
      await RNFS.writeFile(path, content, 'utf8');

      await Share.open({
        url: `file://${path}`,
        type: mime,
        failOnCancel: false,
      });
      return { success: true, path };
    } catch (err: any) {
      // User cancelled the share sheet is not a real error.
      if (err?.message && /cancel/i.test(err.message)) {
        return { success: false, error: 'cancelled' };
      }
      return { success: false, error: err?.message ?? 'export_failed' };
    }
  }
}

// ── HTML/CSV escaping ──────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function csvCell(value: string): string {
  const v = value ?? '';
  if (/[",\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export const reportExportService = new ReportExportService();
export { ReportExportService };
