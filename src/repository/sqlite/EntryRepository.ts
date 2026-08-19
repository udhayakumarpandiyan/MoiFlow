import { getDB } from '../../database/db';
import { Entry, EntryType } from '../../models/Entry';
import { IEntryRepository, EntryFilter } from '../interfaces/IEntryRepository';

export class EntryRepository implements IEntryRepository {

  async create(entry: Entry): Promise<void> {
    const db = await getDB();
    await db.executeSql(
      `INSERT INTO entries
         (id, entry_type, event_id, event_name, event_date,
          person_id, person_name, village_name,
          cash_amount, gold_weight, remarks,
          created_at, updated_at, created_by, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.entryType,
        entry.eventId ?? null,
        entry.eventName ?? null,
        entry.eventDate ?? null,
        entry.personId,
        entry.personName,
        entry.villageName,
        entry.cashAmount,
        entry.goldWeight,
        entry.remarks ?? null,
        entry.createdAt,
        entry.updatedAt,
        entry.createdBy ?? null,
        entry.syncStatus,
      ],
    );
  }

  async update(entry: Entry): Promise<void> {
    const db = await getDB();
    await db.executeSql(
      `UPDATE entries
       SET entry_type   = ?,
           event_id     = ?,
           event_name   = ?,
           event_date   = ?,
           person_id    = ?,
           person_name  = ?,
           village_name = ?,
           cash_amount  = ?,
           gold_weight  = ?,
           remarks      = ?,
           updated_at   = ?,
           sync_status  = ?
       WHERE id = ?`,
      [
        entry.entryType,
        entry.eventId ?? null,
        entry.eventName ?? null,
        entry.eventDate ?? null,
        entry.personId,
        entry.personName,
        entry.villageName,
        entry.cashAmount,
        entry.goldWeight,
        entry.remarks ?? null,
        entry.updatedAt,
        entry.syncStatus,
        entry.id,
      ],
    );
  }

  async delete(id: string): Promise<void> {
    const db = await getDB();
    await db.executeSql(`DELETE FROM entries WHERE id = ?`, [id]);
  }

  async getById(id: string): Promise<Entry | null> {
    const db = await getDB();
    const [result] = await db.executeSql(
      `SELECT * FROM entries WHERE id = ? LIMIT 1`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows.item(0));
  }

  async getAll(filter?: EntryFilter): Promise<Entry[]> {
    const db = await getDB();
    const { sql, params } = this.buildQuery(filter);
    const [result] = await db.executeSql(sql, params);
    return this.mapRows(result);
  }

  async getRecent(limit: number): Promise<Entry[]> {
    const db = await getDB();
    const [result] = await db.executeSql(
      `SELECT * FROM entries ORDER BY created_at DESC LIMIT ?`,
      [limit],
    );
    return this.mapRows(result);
  }

  async search(keyword: string, filter?: EntryFilter): Promise<Entry[]> {
    return this.getAll({ ...filter, keyword });
  }

  async getByPersonId(personId: string): Promise<Entry[]> {
    return this.getAll({ personId });
  }

  async getTotals(filter?: EntryFilter): Promise<{
    cashIn: number;
    goldIn: number;
    cashOut: number;
    goldOut: number;
    count: number;
  }> {
    const db = await getDB();
    const { sql: baseSql, params } = this.buildQuery(filter, true);

    const aggregateSql = `
      SELECT
        COUNT(*) AS cnt,
        COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT'   THEN cash_amount ELSE 0 END), 0) AS cash_in,
        COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN cash_amount ELSE 0 END), 0) AS cash_out,
        COALESCE(SUM(CASE WHEN entry_type = 'OWN_EVENT'   THEN gold_weight ELSE 0 END), 0) AS gold_in,
        COALESCE(SUM(CASE WHEN entry_type = 'OTHER_EVENT' THEN gold_weight ELSE 0 END), 0) AS gold_out
      FROM entries
      ${baseSql}
    `;

    const [result] = await db.executeSql(aggregateSql, params);
    const row = result.rows.item(0);
    return {
      cashIn: Number(row.cash_in) || 0,
      goldIn: Number(row.gold_in) || 0,
      cashOut: Number(row.cash_out) || 0,
      goldOut: Number(row.gold_out) || 0,
      count: Number(row.cnt) || 0,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Query builder
  // ─────────────────────────────────────────────────────────────────────────

  private buildQuery(
    filter?: EntryFilter,
    whereOnly = false,
  ): { sql: string; params: (string | number | null)[] } {
    const conditions: string[] = [];
    const params: (string | number | null)[] = [];

    if (filter?.eventId) {
      conditions.push('event_id = ?');
      params.push(filter.eventId);
    }
    if (filter?.personId) {
      conditions.push('person_id = ?');
      params.push(filter.personId);
    }
    if (filter?.entryType) {
      conditions.push('entry_type = ?');
      params.push(filter.entryType);
    }
    if (filter?.villageName) {
      conditions.push('village_name LIKE ?');
      params.push(`%${filter.villageName}%`);
    }
    if (filter?.fromDate) {
      conditions.push("DATE(created_at) >= DATE(?)");
      params.push(filter.fromDate);
    }
    if (filter?.toDate) {
      conditions.push("DATE(created_at) <= DATE(?)");
      params.push(filter.toDate);
    }
    if (filter?.keyword) {
      conditions.push('(person_name LIKE ? OR village_name LIKE ? OR remarks LIKE ? OR event_name LIKE ?)');
      const kw = `%${filter.keyword}%`;
      params.push(kw, kw, kw, kw);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    if (whereOnly) {
      return { sql: whereClause, params };
    }

    return {
      sql: `SELECT * FROM entries ${whereClause} ORDER BY created_at DESC`,
      params,
    };
  }

  private mapRow(row: Record<string, unknown>): Entry {
    return {
      id: String(row.id),
      entryType: (row.entry_type as EntryType) ?? 'OTHER_EVENT',
      eventId: row.event_id ? String(row.event_id) : null,
      eventName: row.event_name ? String(row.event_name) : undefined,
      eventDate: row.event_date ? String(row.event_date) : undefined,
      personId: String(row.person_id),
      personName: String(row.person_name),
      villageName: row.village_name ? String(row.village_name) : '',
      cashAmount: Number(row.cash_amount) || 0,
      goldWeight: Number(row.gold_weight) || 0,
      remarks: row.remarks ? String(row.remarks) : undefined,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      createdBy: row.created_by ? String(row.created_by) : undefined,
      syncStatus: Number(row.sync_status) || 0,
    };
  }

  private mapRows(result: { rows: { length: number; item: (i: number) => Record<string, unknown> } }): Entry[] {
    const items: Entry[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      items.push(this.mapRow(result.rows.item(i)));
    }
    return items;
  }
}
