import { getDB } from '../../database/db';
import { v4 as uuidv4 } from 'uuid';
import { IPendingRepository } from '../interfaces/IPendingRepository';
import {
  PendingItem,
  PendingFilter,
  PendingDirection,
  PendingStatus,
  Settlement,
  CreateSettlementInput,
} from '../../models/Pending';

/**
 * SQLite implementation of Pending Payments & Receivables.
 *
 * The heavy lifting is done in SQL so we never load every entry into JS:
 *   1. Aggregate entries per person (or person+event) into cash_in/out, gold_in/out.
 *   2. Aggregate the settlements ledger per person (+event) per direction.
 *   3. Derive due = max(out-in,0) for RECEIVABLE, max(in-out,0) for PAYABLE, then
 *      pending = max(due - settled, 0). Only positive-due rows are emitted.
 */
export class PendingRepository implements IPendingRepository {
  // ─────────────────────────────────────────────────────────────────────────
  // Pending query
  // ─────────────────────────────────────────────────────────────────────────

  async getPending(filter?: PendingFilter): Promise<PendingItem[]> {
    const db = await getDB();
    const perEvent = !!filter?.perEvent;

    // The grouping key differs when we scope per event.
    const groupCols = perEvent
      ? 'person_id, person_name, village_name, event_id, event_name, event_date'
      : 'person_id, person_name, village_name';

    // Entry-level WHERE (date range / person / village / event filters).
    const entryConds: string[] = [];
    const entryParams: (string | number | null)[] = [];
    if (filter?.eventId) { entryConds.push('event_id = ?'); entryParams.push(filter.eventId); }
    if (filter?.personId) { entryConds.push('person_id = ?'); entryParams.push(filter.personId); }
    if (filter?.personName) { entryConds.push('person_name LIKE ?'); entryParams.push(`%${filter.personName}%`); }
    if (filter?.villageName) { entryConds.push('village_name LIKE ?'); entryParams.push(`%${filter.villageName}%`); }
    if (filter?.fromDate) { entryConds.push('DATE(created_at) >= DATE(?)'); entryParams.push(filter.fromDate); }
    if (filter?.toDate) { entryConds.push('DATE(created_at) <= DATE(?)'); entryParams.push(filter.toDate); }
    const entryWhere = entryConds.length ? `WHERE ${entryConds.join(' AND ')}` : '';

    const sql = `
      SELECT
        e.person_id,
        e.person_name,
        e.village_name,
        ${perEvent ? 'e.event_id, e.event_name, e.event_date,' : ''}
        e.cash_in, e.cash_out, e.gold_in, e.gold_out, e.last_entry_date
      FROM (
        SELECT
          person_id,
          person_name,
          MAX(village_name) AS village_name,
          ${perEvent ? 'event_id, MAX(event_name) AS event_name, MAX(event_date) AS event_date,' : ''}
          COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT'   THEN cash_amount ELSE 0 END), 0) AS cash_in,
          COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN cash_amount ELSE 0 END), 0) AS cash_out,
          COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT'   THEN gold_weight ELSE 0 END), 0) AS gold_in,
          COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN gold_weight ELSE 0 END), 0) AS gold_out,
          MAX(created_at) AS last_entry_date
        FROM entries
        ${entryWhere}
        GROUP BY ${groupCols}
      ) e
      ORDER BY e.person_name ASC
    `;

    const [result] = await db.executeSql(sql, entryParams);

    // Load settlement aggregates (per person, and per person+event) once.
    const settlementMap = await this.loadSettlementAggregates(db);
    const reminderKeys: string[] = [];
    const rows: PendingItem[] = [];

    const wantDirection = filter?.direction;

    for (let i = 0; i < result.rows.length; i++) {
      const r = result.rows.item(i);
      const personId = String(r.person_id);
      const eventId = perEvent && r.event_id ? String(r.event_id) : null;

      const cashIn = Number(r.cash_in) || 0;
      const cashOut = Number(r.cash_out) || 0;
      const goldIn = Number(r.gold_in) || 0;
      const goldOut = Number(r.gold_out) || 0;

      // Derived gross due per direction.
      const recvDueCash = Math.max(cashOut - cashIn, 0);
      const recvDueGold = Math.max(goldOut - goldIn, 0);
      const payDueCash = Math.max(cashIn - cashOut, 0);
      const payDueGold = Math.max(goldIn - goldOut, 0);

      const base = {
        personId,
        personName: String(r.person_name),
        villageName: r.village_name ? String(r.village_name) : null,
        eventId,
        eventName: perEvent && r.event_name ? String(r.event_name) : null,
        eventDate: perEvent && r.event_date ? String(r.event_date) : null,
        lastEntryDate: r.last_entry_date ? String(r.last_entry_date) : null,
      };

      const directions: PendingDirection[] =
        wantDirection ? [wantDirection] : ['RECEIVABLE', 'PAYABLE'];

      for (const direction of directions) {
        const dueCash = direction === 'RECEIVABLE' ? recvDueCash : payDueCash;
        const dueGold = direction === 'RECEIVABLE' ? recvDueGold : payDueGold;
        if (dueCash <= 0 && dueGold <= 0) continue;

        const settled = this.lookupSettlement(settlementMap, direction, personId, eventId);
        const pendingCash = Math.max(dueCash - settled.cash, 0);
        const pendingGold = Math.max(dueGold - settled.gold, 0);

        const key = this.buildKey(direction, personId, eventId);
        reminderKeys.push(key);

        rows.push({
          key,
          direction,
          ...base,
          dueCash,
          dueGold,
          settledCash: Math.min(settled.cash, dueCash),
          settledGold: Math.min(settled.gold, dueGold),
          pendingCash,
          pendingGold,
          status: this.computeStatus(dueCash, dueGold, pendingCash, pendingGold),
          reminderAt: null,
        });
      }
    }

    // Attach reminders.
    if (reminderKeys.length) {
      const reminders = await this.getReminders(reminderKeys);
      for (const item of rows) {
        item.reminderAt = reminders[item.key] ?? null;
      }
    }

    // Post-filter (status / cash-only / gold-only) — cheap in JS on the small
    // set of positive-due rows.
    return rows.filter(item => {
      // Fully-settled lines are not "pending" — hide them unless the caller is
      // explicitly asking for the SETTLED status (e.g. the Settled filter chip).
      if (item.status === 'SETTLED' && filter?.status !== 'SETTLED') return false;
      if (filter?.status && item.status !== filter.status) return false;
      if (filter?.cashOnly && item.pendingCash <= 0) return false;
      if (filter?.goldOnly && item.pendingGold <= 0) return false;
      return true;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Settlement ledger
  // ─────────────────────────────────────────────────────────────────────────

  async addSettlement(input: CreateSettlementInput): Promise<Settlement> {
    const db = await getDB();
    const now = new Date().toISOString();
    const settlement: Settlement = {
      id: uuidv4(),
      direction: input.direction,
      personId: input.personId,
      personName: input.personName,
      eventId: input.eventId ?? null,
      settledCash: Number(input.settledCash) || 0,
      settledGold: Number(input.settledGold) || 0,
      note: input.note ?? null,
      settledAt: now,
      createdAt: now,
    };

    await db.executeSql(
      `INSERT INTO settlements
         (id, direction, person_id, person_name, event_id, settled_cash, settled_gold, note, settled_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        settlement.id,
        settlement.direction,
        settlement.personId,
        settlement.personName,
        settlement.eventId,
        settlement.settledCash,
        settlement.settledGold,
        settlement.note,
        settlement.settledAt,
        settlement.createdAt,
      ],
    );

    return settlement;
  }

  async getSettlements(personId: string, eventId?: string | null): Promise<Settlement[]> {
    const db = await getDB();
    const conds = ['person_id = ?'];
    const params: (string | null)[] = [personId];
    if (eventId !== undefined) {
      if (eventId === null) {
        conds.push('event_id IS NULL');
      } else {
        conds.push('event_id = ?');
        params.push(eventId);
      }
    }
    const [result] = await db.executeSql(
      `SELECT * FROM settlements WHERE ${conds.join(' AND ')} ORDER BY settled_at DESC`,
      params,
    );
    const items: Settlement[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i);
      items.push({
        id: String(row.id),
        direction: row.direction as PendingDirection,
        personId: String(row.person_id),
        personName: String(row.person_name),
        eventId: row.event_id ? String(row.event_id) : null,
        settledCash: Number(row.settled_cash) || 0,
        settledGold: Number(row.settled_gold) || 0,
        note: row.note ? String(row.note) : null,
        settledAt: String(row.settled_at),
        createdAt: String(row.created_at),
      });
    }
    return items;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Reminders
  // ─────────────────────────────────────────────────────────────────────────

  async setReminder(
    key: string,
    personId: string,
    eventId: string | null,
    direction: string,
    remindAtISO: string,
  ): Promise<void> {
    const db = await getDB();
    const now = new Date().toISOString();
    await db.executeSql(
      `INSERT OR REPLACE INTO pending_reminders
         (key, person_id, event_id, direction, remind_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?,
         COALESCE((SELECT created_at FROM pending_reminders WHERE key = ?), ?), ?)`,
      [key, personId, eventId, direction, remindAtISO, key, now, now],
    );
  }

  async clearReminder(key: string): Promise<void> {
    const db = await getDB();
    await db.executeSql(`DELETE FROM pending_reminders WHERE key = ?`, [key]);
  }

  async getReminders(keys: string[]): Promise<Record<string, string>> {
    if (keys.length === 0) return {};
    const db = await getDB();
    const placeholders = keys.map(() => '?').join(', ');
    const [result] = await db.executeSql(
      `SELECT key, remind_at FROM pending_reminders WHERE key IN (${placeholders})`,
      keys,
    );
    const map: Record<string, string> = {};
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i);
      map[String(row.key)] = String(row.remind_at);
    }
    return map;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Load settlement sums keyed by direction+person and direction+person+event
   * so we can offset both aggregated and per-event pending lines in one pass.
   */
  private async loadSettlementAggregates(
    db: Awaited<ReturnType<typeof getDB>>,
  ): Promise<Map<string, { cash: number; gold: number }>> {
    const map = new Map<string, { cash: number; gold: number }>();
    const [result] = await db.executeSql(
      `SELECT direction, person_id, event_id,
              COALESCE(SUM(settled_cash), 0) AS cash,
              COALESCE(SUM(settled_gold), 0) AS gold
       FROM settlements
       GROUP BY direction, person_id, event_id`,
    );
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i);
      const direction = String(row.direction) as PendingDirection;
      const personId = String(row.person_id);
      const eventId = row.event_id ? String(row.event_id) : null;
      const cash = Number(row.cash) || 0;
      const gold = Number(row.gold) || 0;

      // Per-event key.
      const perEventKey = this.aggKey(direction, personId, eventId);
      map.set(perEventKey, {
        cash: (map.get(perEventKey)?.cash ?? 0) + cash,
        gold: (map.get(perEventKey)?.gold ?? 0) + gold,
      });

      // Person-level rollup (event_id = '*') sums across all events.
      const personKey = this.aggKey(direction, personId, '*');
      map.set(personKey, {
        cash: (map.get(personKey)?.cash ?? 0) + cash,
        gold: (map.get(personKey)?.gold ?? 0) + gold,
      });
    }
    return map;
  }

  private lookupSettlement(
    map: Map<string, { cash: number; gold: number }>,
    direction: PendingDirection,
    personId: string,
    eventId: string | null,
  ): { cash: number; gold: number } {
    // For per-event lines, match the exact event; for aggregated lines (eventId
    // null) use the person-level rollup keyed by '*'.
    const key = this.aggKey(direction, personId, eventId ?? '*');
    return map.get(key) ?? { cash: 0, gold: 0 };
  }

  private aggKey(direction: PendingDirection, personId: string, eventId: string | null): string {
    return `${direction}|${personId}|${eventId ?? 'NULL'}`;
  }

  private buildKey(direction: PendingDirection, personId: string, eventId: string | null): string {
    return `${direction}:${personId}:${eventId ?? 'ALL'}`;
  }

  private computeStatus(
    dueCash: number,
    dueGold: number,
    pendingCash: number,
    pendingGold: number,
  ): PendingStatus {
    const nothingPending = pendingCash <= 0 && pendingGold <= 0;
    if (nothingPending) return 'SETTLED';
    const anythingSettled = pendingCash < dueCash || pendingGold < dueGold;
    return anythingSettled ? 'PARTIAL' : 'PENDING';
  }
}
