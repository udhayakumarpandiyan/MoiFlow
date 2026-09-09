import { getDB } from '../../database/db';
import {
  EventReport,
  EventReportSummary,
  EventReportEntry,
  PersonBalance,
  VillageReport,
  DateReport,
} from '../../models/Report';
import { ReportFilter } from '../../models/ReportFilter';
import { IReportRepository } from '../interfaces/IReportRepository';

export class ReportRepository implements IReportRepository {

  // ── Person-wise balances ────────────────────────────────────────────────────

  async getPersonBalances(filter?: ReportFilter): Promise<PersonBalance[]> {
    const db = await getDB();

    const conditions: string[] = [];
    const params: (string | number | null)[] = [];

    if (filter?.fromDate) { conditions.push("DATE(created_at) >= DATE(?)"); params.push(filter.fromDate); }
    if (filter?.toDate)   { conditions.push("DATE(created_at) <= DATE(?)"); params.push(filter.toDate);   }
    if (filter?.villageName) { conditions.push("village_name LIKE ?");      params.push(`%${filter.villageName}%`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [result] = await db.executeSql(
      `SELECT
         person_id,
         person_name,
         village_name,
         COUNT(*) AS entry_count,
         COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT'   THEN cash_amount ELSE 0 END), 0) AS cash_in,
         COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN cash_amount ELSE 0 END), 0) AS cash_out,
         COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT'   THEN gold_weight ELSE 0 END), 0) AS gold_in,
         COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN gold_weight ELSE 0 END), 0) AS gold_out
       FROM entries
       ${where}
       GROUP BY person_id
       ORDER BY cash_in DESC, person_name ASC`,
      params,
    );

    const balances: PersonBalance[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i);
      const cashIn  = Number(row.cash_in)  || 0;
      const cashOut = Number(row.cash_out) || 0;
      const goldIn  = Number(row.gold_in)  || 0;
      const goldOut = Number(row.gold_out) || 0;
      balances.push({
        personId: String(row.person_id),
        personName: String(row.person_name),
        villageName: row.village_name ? String(row.village_name) : null,
        totalCashIn: cashIn,
        totalCashOut: cashOut,
        totalGoldIn: goldIn,
        totalGoldOut: goldOut,
        goldToBeReceived: Math.max(goldOut - goldIn, 0),
        goldToBeGiven: Math.max(goldIn - goldOut, 0),
        cashToBeReceived: Math.max(cashOut - cashIn, 0),
        cashToBeGiven: Math.max(cashIn - cashOut, 0),
        netCash: cashIn - cashOut,
        netGold: goldIn - goldOut,
        entryCount: Number(row.entry_count) || 0,
      });
    }
    return balances;
  }

  // ── Event report ────────────────────────────────────────────────────────────

  async getEventReport(eventId: string, filter?: ReportFilter): Promise<EventReport> {
    const db = await getDB();

    // Summary
    const [summaryResult] = await db.executeSql(
      `SELECT
         e.id AS event_id, e.name AS event_name, e.date AS event_date, e.owner_type,
         e.venue AS event_venue, e.village_name AS event_village,
         e.estimated_cost, e.actual_expenses, e.invitations_printed, e.total_invites,
         COUNT(en.id) AS total_entries,
         COUNT(DISTINCT COALESCE(en.person_id, en.person_name)) AS total_persons,
         COUNT(DISTINCT CASE WHEN en.village_name IS NOT NULL AND en.village_name != '' THEN en.village_name END) AS total_villages,
         COALESCE(SUM(CASE WHEN en.entry_type = 'OWN_EVENT'   THEN en.cash_amount ELSE 0 END), 0) AS cash_received,
         COALESCE(SUM(CASE WHEN en.entry_type = 'OTHER_EVENT' THEN en.cash_amount ELSE 0 END), 0) AS cash_given,
         COALESCE(SUM(CASE WHEN en.entry_type = 'OWN_EVENT'   THEN en.gold_weight ELSE 0 END), 0) AS gold_received,
         COALESCE(SUM(CASE WHEN en.entry_type = 'OTHER_EVENT' THEN en.gold_weight ELSE 0 END), 0) AS gold_given
       FROM events e
       LEFT JOIN entries en ON e.id = en.event_id
       WHERE e.id = ?
       GROUP BY e.id`,
      [eventId],
    );

    if (summaryResult.rows.length === 0) {
      throw new Error(`Event not found: ${eventId}`);
    }

    const sr = summaryResult.rows.item(0);
    const summary: EventReportSummary = {
      eventId: String(sr.event_id),
      eventName: String(sr.event_name),
      eventDate: sr.event_date ? String(sr.event_date) : null,
      eventVenue: sr.event_venue ? String(sr.event_venue) : null,
      eventVillageName: sr.event_village ? String(sr.event_village) : null,
      ownerType: String(sr.owner_type ?? 'OTHER_PERSON'),
      totalEntries: Number(sr.total_entries) || 0,
      totalPersons: Number(sr.total_persons) || 0,
      totalVillages: Number(sr.total_villages) || 0,
      invitationsPrinted: Number(sr.invitations_printed) || 0,
      totalInvites: Number(sr.total_invites) || 0,
      totalCashReceived: Number(sr.cash_received) || 0,
      totalGoldReceived: Number(sr.gold_received) || 0,
      totalCashGiven: Number(sr.cash_given) || 0,
      totalGoldGiven: Number(sr.gold_given) || 0,
      estimatedCost: Number(sr.estimated_cost) || 0,
      actualExpenses: Number(sr.actual_expenses) || 0,
    };

    // Entries with optional filter
    const entryConds: string[] = ['event_id = ?'];
    const entryParams: (string | number | null)[] = [eventId];

    if (filter?.personName) { entryConds.push('person_name LIKE ?'); entryParams.push(`%${filter.personName}%`); }
    if (filter?.villageName) { entryConds.push('village_name LIKE ?'); entryParams.push(`%${filter.villageName}%`); }

    const [entriesResult] = await db.executeSql(
      `SELECT id, person_name, village_name, entry_type, cash_amount, gold_weight, created_at
       FROM entries
       WHERE ${entryConds.join(' AND ')}
       ORDER BY created_at DESC`,
      entryParams,
    );

    const entries: EventReportEntry[] = [];
    for (let i = 0; i < entriesResult.rows.length; i++) {
      const row = entriesResult.rows.item(i);
      entries.push({
        id: String(row.id),
        personName: String(row.person_name),
        villageName: row.village_name ? String(row.village_name) : null,
        entryType: row.entry_type as 'OWN_EVENT' | 'OTHER_EVENT',
        cashAmount: Number(row.cash_amount) || 0,
        goldWeight: Number(row.gold_weight) || 0,
        createdAt: String(row.created_at),
      });
    }

    return { summary, entries };
  }

  // ── Event-wise report (all own events with aggregates) ─────────────────────

  async getEventWiseReport(filter?: ReportFilter): Promise<EventReportSummary[]> {
    const db = await getDB();

    const conditions: string[] = ["e.owner_type = 'MY_EVENT'"];
    const params: (string | number | null)[] = [];

    if (filter?.fromDate) { conditions.push("DATE(en.created_at) >= DATE(?)"); params.push(filter.fromDate); }
    if (filter?.toDate)   { conditions.push("DATE(en.created_at) <= DATE(?)"); params.push(filter.toDate); }

    const [result] = await db.executeSql(
      `SELECT
         e.id AS event_id,
         e.name AS event_name,
         e.date AS event_date,
         e.venue AS event_venue,
         e.village_name AS event_village,
         e.owner_type,
         e.estimated_cost,
         e.actual_expenses,
         e.invitations_printed,
         e.total_invites,
         COUNT(en.id) AS total_entries,
         COUNT(DISTINCT en.person_name) AS total_persons,
         COUNT(DISTINCT CASE WHEN en.village_name IS NOT NULL AND en.village_name != '' THEN en.village_name END) AS total_villages,
         COALESCE(SUM(CASE WHEN en.entry_type = 'OWN_EVENT'   THEN en.cash_amount ELSE 0 END), 0) AS cash_received,
         COALESCE(SUM(CASE WHEN en.entry_type = 'OTHER_EVENT' THEN en.cash_amount ELSE 0 END), 0) AS cash_given,
         COALESCE(SUM(CASE WHEN en.entry_type = 'OWN_EVENT'   THEN en.gold_weight ELSE 0 END), 0) AS gold_received,
         COALESCE(SUM(CASE WHEN en.entry_type = 'OTHER_EVENT' THEN en.gold_weight ELSE 0 END), 0) AS gold_given
       FROM events e
       LEFT JOIN entries en ON e.id = en.event_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY e.id
       ORDER BY e.date DESC, e.created_at DESC`,
      params,
    );

    const reports: EventReportSummary[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i);
      reports.push({
        eventId: String(row.event_id),
        eventName: String(row.event_name),
        eventDate: row.event_date ? String(row.event_date) : null,
        eventVenue: row.event_venue ? String(row.event_venue) : null,
        eventVillageName: row.event_village ? String(row.event_village) : null,
        ownerType: String(row.owner_type ?? 'MY_EVENT'),
        totalEntries: Number(row.total_entries) || 0,
        totalPersons: Number(row.total_persons) || 0,
        totalVillages: Number(row.total_villages) || 0,
        invitationsPrinted: Number(row.invitations_printed) || 0,
        totalInvites: Number(row.total_invites) || 0,
        totalCashReceived: Number(row.cash_received) || 0,
        totalGoldReceived: Number(row.gold_received) || 0,
        totalCashGiven: Number(row.cash_given) || 0,
        totalGoldGiven: Number(row.gold_given) || 0,
        estimatedCost: Number(row.estimated_cost) || 0,
        actualExpenses: Number(row.actual_expenses) || 0,
      });
    }
    return reports;
  }

  // ── Village report ──────────────────────────────────────────────────────────

  async getVillageReport(filter?: ReportFilter): Promise<VillageReport[]> {
    const db = await getDB();

    const conditions: string[] = ['village_name IS NOT NULL', "village_name != ''"];
    const params: (string | number | null)[] = [];

    if (filter?.fromDate) { conditions.push("DATE(created_at) >= DATE(?)"); params.push(filter.fromDate); }
    if (filter?.toDate)   { conditions.push("DATE(created_at) <= DATE(?)"); params.push(filter.toDate);   }
    if (filter?.villageName) { conditions.push("village_name LIKE ?"); params.push(`%${filter.villageName}%`); }

    const [result] = await db.executeSql(
      `SELECT
         village_name,
         COUNT(*) AS entry_count,
         COUNT(DISTINCT COALESCE(person_id, person_name)) AS person_count,
         COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT'   THEN cash_amount ELSE 0 END), 0) AS cash_in,
         COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN cash_amount ELSE 0 END), 0) AS cash_out,
         COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT'   THEN gold_weight ELSE 0 END), 0) AS gold_in,
         COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN gold_weight ELSE 0 END), 0) AS gold_out
       FROM entries
       WHERE ${conditions.join(' AND ')}
       GROUP BY village_name
       ORDER BY entry_count DESC`,
      params,
    );

    const reports: VillageReport[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i);
      reports.push({
        villageName: String(row.village_name),
        entryCount: Number(row.entry_count) || 0,
        personCount: Number(row.person_count) || 0,
        totalCashIn: Number(row.cash_in) || 0,
        totalGoldIn: Number(row.gold_in) || 0,
        totalCashOut: Number(row.cash_out) || 0,
        totalGoldOut: Number(row.gold_out) || 0,
        cashToBeGiven: Math.max((Number(row.cash_in) || 0) - (Number(row.cash_out) || 0), 0),
        cashToBeReceived: Math.max((Number(row.cash_out) || 0) - (Number(row.cash_in) || 0), 0),
        goldToBeGiven: Math.max((Number(row.gold_in) || 0) - (Number(row.gold_out) || 0), 0),
        goldToBeReceived: Math.max((Number(row.gold_out) || 0) - (Number(row.gold_in) || 0), 0),
      });
    }
    return reports;
  }

  // ── Date-wise report ────────────────────────────────────────────────────────

  async getDateReport(filter?: ReportFilter): Promise<DateReport[]> {
    const db = await getDB();

    const conditions: string[] = [];
    const params: (string | number | null)[] = [];

    if (filter?.fromDate) { conditions.push("DATE(created_at) >= DATE(?)"); params.push(filter.fromDate); }
    if (filter?.toDate)   { conditions.push("DATE(created_at) <= DATE(?)"); params.push(filter.toDate);   }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [result] = await db.executeSql(
      `SELECT
         DATE(created_at) AS date,
         COUNT(*) AS entry_count,
         COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT'   THEN cash_amount ELSE 0 END), 0) AS cash_in,
         COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN cash_amount ELSE 0 END), 0) AS cash_out,
         COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT'   THEN gold_weight ELSE 0 END), 0) AS gold_in,
         COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN gold_weight ELSE 0 END), 0) AS gold_out
       FROM entries
       ${where}
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      params,
    );

    const reports: DateReport[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i);
      reports.push({
        date: String(row.date),
        entryCount: Number(row.entry_count) || 0,
        cashIn: Number(row.cash_in) || 0,
        goldIn: Number(row.gold_in) || 0,
        cashOut: Number(row.cash_out) || 0,
        goldOut: Number(row.gold_out) || 0,
      });
    }
    return reports;
  }
}
