import { getDB } from '../../database/db';
import {
  DashboardSummary,
  TopContributor,
  TopVillage,
  RecentEntry,
} from '../../models/Dashboard';
import { IDashboardRepository } from '../interfaces/IDashboardRepository';

export class DashboardRepository implements IDashboardRepository {

  async getSummary(): Promise<DashboardSummary> {
    const db = await getDB();

    // Ensure all required columns exist (safety for older DB versions)
    const safeAlter = async (sql: string) => {
      try { await db.executeSql(sql); } catch (_) {}
    };
    await safeAlter(`ALTER TABLE entries ADD COLUMN entry_type TEXT NOT NULL DEFAULT 'OTHER_EVENT';`);
    await safeAlter(`ALTER TABLE entries ADD COLUMN person_id TEXT;`);
    await safeAlter(`ALTER TABLE entries ADD COLUMN person_name TEXT NOT NULL DEFAULT '';`);
    await safeAlter(`ALTER TABLE entries ADD COLUMN village_name TEXT;`);
    await safeAlter(`ALTER TABLE entries ADD COLUMN event_id TEXT;`);
    await safeAlter(`ALTER TABLE entries ADD COLUMN event_name TEXT;`);
    await safeAlter(`ALTER TABLE entries ADD COLUMN event_date TEXT;`);
    await safeAlter(`ALTER TABLE entries ADD COLUMN cash_amount REAL NOT NULL DEFAULT 0;`);
    await safeAlter(`ALTER TABLE entries ADD COLUMN gold_weight REAL NOT NULL DEFAULT 0;`);
    await safeAlter(`ALTER TABLE entries ADD COLUMN remarks TEXT;`);
    await safeAlter(`ALTER TABLE entries ADD COLUMN created_at TEXT;`);
    await safeAlter(`ALTER TABLE entries ADD COLUMN updated_at TEXT;`);
    await safeAlter(`ALTER TABLE entries ADD COLUMN created_by TEXT;`);
    await safeAlter(`ALTER TABLE entries ADD COLUMN sync_status INTEGER NOT NULL DEFAULT 0;`);

    // ── 1. Total entries ───────────────────────────────────────────────────
    const [countResult] = await db.executeSql(
      `SELECT COUNT(*) AS total FROM entries`,
    );
    const totalEntries = Number(countResult.rows.item(0).total) || 0;

    // ── 2. Cash / Gold aggregates ──────────────────────────────────────────
    const [aggregateResult] = await db.executeSql(`
      SELECT
        COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT'   THEN cash_amount ELSE 0 END), 0) AS cash_received,
        COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN cash_amount ELSE 0 END), 0) AS cash_given,
        COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT'   THEN gold_weight ELSE 0 END), 0) AS gold_received,
        COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN gold_weight ELSE 0 END), 0) AS gold_given
      FROM entries
    `);

    const agg = aggregateResult.rows.item(0);
    const totalCashReceived = Number(agg.cash_received) || 0;
    const totalCashGiven    = Number(agg.cash_given)    || 0;
    const totalGoldReceived = Number(agg.gold_received) || 0;
    const totalGoldGiven    = Number(agg.gold_given)    || 0;

    // ── 3. Per-person balances → aggregate receivable / payable ───────────
    const [personResult] = await db.executeSql(`
      SELECT
        person_id,
        COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT'   THEN cash_amount ELSE 0 END), 0) AS cash_in,
        COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN cash_amount ELSE 0 END), 0) AS cash_out,
        COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT'   THEN gold_weight ELSE 0 END), 0) AS gold_in,
        COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN gold_weight ELSE 0 END), 0) AS gold_out
      FROM entries
      WHERE person_id IS NOT NULL
      GROUP BY person_id
    `);

    let cashToReceive = 0, cashToGive = 0;
    let goldToReceive = 0, goldToGive = 0;

    for (let i = 0; i < personResult.rows.length; i++) {
      const row = personResult.rows.item(i);
      const netCash = Number(row.cash_in) - Number(row.cash_out);
      const netGold = Number(row.gold_in) - Number(row.gold_out);

      // net < 0 means I gave more → I am owed
      if (netCash < 0) cashToReceive += Math.abs(netCash);
      else if (netCash > 0) cashToGive += netCash;

      if (netGold < 0) goldToReceive += Math.abs(netGold);
      else if (netGold > 0) goldToGive += netGold;
    }

    // ── 4. Today ──────────────────────────────────────────────────────────
    const today = new Date().toISOString().split('T')[0];
    const [todayResult] = await db.executeSql(
      `SELECT
        COUNT(*) AS entries,
        COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT'   THEN cash_amount ELSE 0 END), 0) AS cash_in,
        COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN cash_amount ELSE 0 END), 0) AS cash_out,
        COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT'   THEN gold_weight ELSE 0 END), 0) AS gold_in,
        COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN gold_weight ELSE 0 END), 0) AS gold_out
       FROM entries
       WHERE DATE(created_at) = ?`,
      [today],
    );
    const todayRow = todayResult.rows.item(0);

    // ── 5. Top contributor ─────────────────────────────────────────────────
    const [topContribResult] = await db.executeSql(`
      SELECT person_name, village_name,
             SUM(cash_amount) AS cash_amount,
             SUM(gold_weight) AS gold_weight
      FROM entries
      WHERE entry_type = 'OWN_EVENT'
      GROUP BY person_id
      ORDER BY cash_amount DESC, gold_weight DESC
      LIMIT 1
    `);

    let topContributor: TopContributor | null = null;
    if (topContribResult.rows.length > 0) {
      const row = topContribResult.rows.item(0);
      topContributor = {
        personName: String(row.person_name),
        villageName: row.village_name ? String(row.village_name) : null,
        cashAmount: Number(row.cash_amount) || 0,
        goldWeight: Number(row.gold_weight) || 0,
      };
    }

    // ── 6. Top village ────────────────────────────────────────────────────
    const [topVillageResult] = await db.executeSql(`
      SELECT village_name,
             COUNT(*) AS entry_count,
             COALESCE(SUM(cash_amount), 0) AS cash_amount,
             COALESCE(SUM(gold_weight), 0) AS gold_weight
      FROM entries
      WHERE entry_type = 'OWN_EVENT'
        AND village_name IS NOT NULL AND village_name != ''
      GROUP BY village_name
      ORDER BY entry_count DESC
      LIMIT 1
    `);

    let topVillage: TopVillage | null = null;
    if (topVillageResult.rows.length > 0) {
      const row = topVillageResult.rows.item(0);
      topVillage = {
        villageName: String(row.village_name),
        entryCount: Number(row.entry_count) || 0,
        cashAmount: Number(row.cash_amount) || 0,
        goldWeight: Number(row.gold_weight) || 0,
      };
    }

    // ── 7. Recent entries ─────────────────────────────────────────────────
    const [recentResult] = await db.executeSql(`
      SELECT id, person_name, village_name, entry_type,
             event_id, event_name, event_date,
             cash_amount, gold_weight, created_at
      FROM entries
      ORDER BY created_at DESC
      LIMIT 10
    `);

    const recentEntries: RecentEntry[] = [];
    for (let i = 0; i < recentResult.rows.length; i++) {
      const row = recentResult.rows.item(i);
      recentEntries.push({
        id: String(row.id),
        personName: String(row.person_name),
        villageName: row.village_name ? String(row.village_name) : null,
        entryType: row.entry_type as 'OWN_EVENT' | 'OTHER_EVENT',
        eventId: row.event_id ? String(row.event_id) : null,
        eventName: row.event_name ? String(row.event_name) : undefined,
        eventDate: row.event_date ? String(row.event_date) : undefined,
        cashAmount: Number(row.cash_amount) || 0,
        goldWeight: Number(row.gold_weight) || 0,
        createdAt: String(row.created_at),
      });
    }

    return {
      username: '',
      upcomingEvents: [],
      recentOutEntries: recentEntries.filter(e => e.entryType === 'OTHER_EVENT'),
      attendedEvents: 0,
      totalEntries,
      totalCashReceived,
      totalGoldReceived,
      totalCashGiven,
      totalGoldGiven,
      totalCashToBeReceived: cashToReceive,
      totalGoldToBeReceived: goldToReceive,
      totalCashToBeGiven: cashToGive,
      totalGoldToBeGiven: goldToGive,
      todayEntries:      Number(todayRow.entries)  || 0,
      todayCashReceived: Number(todayRow.cash_in)  || 0,
      todayCashGiven:    Number(todayRow.cash_out) || 0,
      todayGoldReceived: Number(todayRow.gold_in)  || 0,
      todayGoldGiven:    Number(todayRow.gold_out) || 0,
      topContributor,
      topVillage,
      recentEntries,
    };
  }
}
