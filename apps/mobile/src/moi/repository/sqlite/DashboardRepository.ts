import { getDB } from '@common/database/db';
import {
  DashboardSummary,
  TopContributor,
  TopVillage,
  RecentEntry,
  YearToDateStats,
  EntryBreakdown,
  ReturnForecast,
  VillageInsight,
  MonthlyTrend,
} from '@moi/models/Dashboard';
import { IDashboardRepository } from '@moi/repository/interfaces/IDashboardRepository';

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

    const today = new Date().toISOString().split('T')[0];
    const currentYear = new Date().getFullYear();
    const yearStart = `${currentYear}-01-01`;

    // ── 1. Total entries ───────────────────────────────────────────────────
    const [countResult] = await db.executeSql(
      `SELECT COUNT(*) AS total FROM entries`,
    );
    const totalEntries = Number(countResult.rows.item(0).total) || 0;

    // ── 2. Cash / Gold aggregates (all-time) ──────────────────────────────
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

    // ── 6. Top village (single, for legacy field) ──────────────────────────
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

    // ── 8. Upcoming events ────────────────────────────────────────────────
    const [upcomingResult] = await db.executeSql(`
      SELECT
        e.id,
        e.name,
        e.date AS event_date,
        e.village_name,
        COALESCE(SUM(CASE WHEN ent.entry_type = 'OWN_EVENT' THEN ent.cash_amount ELSE 0 END), 0) AS total_received,
        COALESCE(SUM(CASE WHEN ent.entry_type = 'OTHER_EVENT' THEN ent.cash_amount ELSE 0 END), 0) AS total_given,
        COUNT(ent.id) AS entry_count
      FROM events e
      LEFT JOIN entries ent ON ent.event_id = e.id
      WHERE e.date >= ?
      GROUP BY e.id
      ORDER BY e.date ASC
      LIMIT 10
    `, [today]);

    const upcomingEvents: DashboardSummary['upcomingEvents'] = [];
    for (let i = 0; i < upcomingResult.rows.length; i++) {
      const row = upcomingResult.rows.item(i);
      const eventDate = row.event_date ? String(row.event_date) : '';
      const dateObj = eventDate ? new Date(eventDate) : null;
      upcomingEvents.push({
        id: String(row.id),
        name: String(row.name),
        eventDate,
        villageName: row.village_name ? String(row.village_name) : null,
        day: dateObj ? String(dateObj.getDate()) : undefined,
        month: dateObj ? dateObj.toLocaleString('default', { month: 'short' }) : undefined,
        entryCount: Number(row.entry_count) || 0,
        totalReceived: Number(row.total_received) || 0,
        totalGiven: Number(row.total_given) || 0,
        cashToReceive: 0,
        cashToGive: 0,
        goldToReceive: 0,
        goldToGive: 0,
      });
    }

    // ── 9. Year-to-date stats ──────────────────────────────────────────────
    // Entries this year
    const [ytdEntryResult] = await db.executeSql(`
      SELECT
        COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT'   THEN cash_amount ELSE 0 END), 0) AS cash_in,
        COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT'   THEN gold_weight ELSE 0 END), 0) AS gold_in,
        COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN cash_amount ELSE 0 END), 0) AS cash_out,
        COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN gold_weight ELSE 0 END), 0) AS gold_out,
        COUNT(DISTINCT CASE WHEN person_id IS NOT NULL THEN person_id END) AS unique_people,
        COUNT(DISTINCT CASE WHEN village_name IS NOT NULL AND village_name != '' THEN village_name END) AS unique_villages
      FROM entries
      WHERE DATE(created_at) >= ?
    `, [yearStart]);

    const ytdRow = ytdEntryResult.rows.item(0);

    // Events this year
    const [ytdEventResult] = await db.executeSql(`
      SELECT
        COALESCE(SUM(CASE WHEN owner_type = 'MY_EVENT'     THEN 1 ELSE 0 END), 0) AS hosted,
        COALESCE(SUM(CASE WHEN owner_type = 'OTHER_PERSON' THEN 1 ELSE 0 END), 0) AS attended
      FROM events
      WHERE date >= ?
    `, [yearStart]);

    const ytdEventRow = ytdEventResult.rows.item(0);

    const ytd: YearToDateStats = {
      eventsHosted:    Number(ytdEventRow.hosted)          || 0,
      eventsAttended:  Number(ytdEventRow.attended)        || 0,
      cashGiven:       Number(ytdRow.cash_out)             || 0,
      goldGiven:       Number(ytdRow.gold_out)             || 0,
      cashReceived:    Number(ytdRow.cash_in)              || 0,
      goldReceived:    Number(ytdRow.gold_in)              || 0,
      uniquePeople:    Number(ytdRow.unique_people)        || 0,
      uniqueVillages:  Number(ytdRow.unique_villages)      || 0,
    };

    // ── 10. Entry breakdown: new vs settlement ────────────────────────────
    // "New" = OWN_EVENT entries (someone giving TO me — income events).
    // "Settlement/given" = OTHER_EVENT entries (I'm giving TO others).
    // % split tells you what fraction of your total interaction is giving vs receiving.
    const [breakdownResult] = await db.executeSql(`
      SELECT
        COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT'   THEN 1 ELSE 0 END), 0) AS new_count,
        COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN 1 ELSE 0 END), 0) AS settle_count,
        COUNT(*) AS total
      FROM entries
    `);

    const bdRow = breakdownResult.rows.item(0);
    const bdTotal    = Number(bdRow.total)       || 0;
    const bdNew      = Number(bdRow.new_count)   || 0;
    const bdSettle   = Number(bdRow.settle_count) || 0;

    const entryBreakdown: EntryBreakdown = {
      newCount:        bdNew,
      settlementCount: bdSettle,
      totalCount:      bdTotal,
      newPct:          bdTotal > 0 ? Math.round((bdNew    / bdTotal) * 100) : 0,
      settlementPct:   bdTotal > 0 ? Math.round((bdSettle / bdTotal) * 100) : 0,
    };

    // ── 11. Return forecast ───────────────────────────────────────────────
    // Get per-event cash received for all past MY_EVENT events.
    const [forecastResult] = await db.executeSql(`
      SELECT
        e.id,
        e.date,
        COALESCE(SUM(CASE WHEN ent.entry_type = 'OWN_EVENT' THEN ent.cash_amount ELSE 0 END), 0) AS cash_in,
        COALESCE(SUM(CASE WHEN ent.entry_type = 'OWN_EVENT' THEN ent.gold_weight ELSE 0 END), 0) AS gold_in,
        STRFTIME('%m', e.date) AS event_month
      FROM events e
      LEFT JOIN entries ent ON ent.event_id = e.id
      WHERE e.owner_type = 'MY_EVENT'
        AND e.date < ?
      GROUP BY e.id
    `, [today]);

    let totalForecastCash = 0;
    let totalForecastGold = 0;
    const basedOnEvents = forecastResult.rows.length;

    // Seasonal weight: count how many past events fell in the current month
    // and in month+6. Events in those months get a 1.15× lift; others 1.0×.
    const currentMonth = new Date().getMonth() + 1; // 1–12
    const sixMonthsAhead = ((currentMonth - 1 + 6) % 12) + 1;
    let thisMonthEventCount = 0;
    let sixMonthEventCount = 0;

    for (let i = 0; i < forecastResult.rows.length; i++) {
      const row = forecastResult.rows.item(i);
      totalForecastCash += Number(row.cash_in) || 0;
      totalForecastGold += Number(row.gold_in) || 0;
      const em = Number(row.event_month);
      if (em === currentMonth) thisMonthEventCount++;
      if (em === sixMonthsAhead) sixMonthEventCount++;
    }

    const avgCashPerEvent = basedOnEvents > 0 ? totalForecastCash / basedOnEvents : 0;
    const avgGoldPerEvent = basedOnEvents > 0 ? totalForecastGold / basedOnEvents : 0;

    // Seasonal multiplier: if there are past events in that month, boost slightly
    const thisMonthFactor = thisMonthEventCount > 0
      ? 1 + Math.min(thisMonthEventCount / basedOnEvents, 0.25)
      : 0.9; // slightly below avg if no seasonal data
    const sixMonthFactor = sixMonthEventCount > 0
      ? 1 + Math.min(sixMonthEventCount / basedOnEvents, 0.25)
      : 0.9;

    const returnForecast: ReturnForecast = {
      avgCashPerEvent:          Math.round(avgCashPerEvent),
      avgGoldPerEvent:          Math.round(avgGoldPerEvent * 100) / 100,
      estimatedCashThisMonth:   Math.round(avgCashPerEvent * thisMonthFactor),
      estimatedCashIn6Months:   Math.round(avgCashPerEvent * sixMonthFactor),
      basedOnEvents,
      confidence: basedOnEvents >= 10 ? 'high' : basedOnEvents >= 3 ? 'medium' : 'low',
    };

    // ── 12. Top 5 villages insight ─────────────────────────────────────────
    const [villagesResult] = await db.executeSql(`
      SELECT
        village_name,
        COUNT(*) AS entry_count,
        COUNT(DISTINCT COALESCE(person_id, person_name)) AS person_count,
        COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT'   THEN cash_amount ELSE 0 END), 0) AS cash_in,
        COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN cash_amount ELSE 0 END), 0) AS cash_out
      FROM entries
      WHERE village_name IS NOT NULL AND village_name != ''
      GROUP BY village_name
      ORDER BY entry_count DESC
      LIMIT 5
    `);

    const topVillages: VillageInsight[] = [];
    for (let i = 0; i < villagesResult.rows.length; i++) {
      const row = villagesResult.rows.item(i);
      topVillages.push({
        villageName:  String(row.village_name),
        entryCount:   Number(row.entry_count)  || 0,
        cashIn:       Number(row.cash_in)       || 0,
        cashOut:      Number(row.cash_out)      || 0,
        personCount:  Number(row.person_count)  || 0,
      });
    }

    // ── 13. Monthly trend (last 6 months) ─────────────────────────────────
    // Build the 6-month window boundaries in JS so we can label them correctly
    // without relying on SQLite date-arithmetic extensions.
    const monthlyTrend: MonthlyTrend[] = [];
    const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    for (let m = 5; m >= 0; m--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - m);
      const yr  = d.getFullYear();
      const mo  = d.getMonth() + 1; // 1-based
      const moStr = mo.toString().padStart(2, '0');
      const from = `${yr}-${moStr}-01`;
      // Last day of the month: set to 1st of next month then back one day
      const last = new Date(yr, mo, 0);
      const to   = `${yr}-${moStr}-${last.getDate().toString().padStart(2, '0')}`;

      const [mResult] = await db.executeSql(`
        SELECT
          COUNT(*) AS entry_count,
          COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT'   THEN cash_amount ELSE 0 END), 0) AS cash_in,
          COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN cash_amount ELSE 0 END), 0) AS cash_out
        FROM entries
        WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
      `, [from, to]);

      const mr = mResult.rows.item(0);
      monthlyTrend.push({
        month: MONTH_ABBR[d.getMonth()],
        label: `${MONTH_ABBR[d.getMonth()]} ${String(yr).slice(2)}`,
        cashIn:     Number(mr.cash_in)      || 0,
        cashOut:    Number(mr.cash_out)     || 0,
        entryCount: Number(mr.entry_count)  || 0,
      });
    }

    return {
      username: '',
      upcomingEvents,
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
      // Analytics
      ytd,
      entryBreakdown,
      returnForecast,
      topVillages,
      monthlyTrend,
    };
  }
}
