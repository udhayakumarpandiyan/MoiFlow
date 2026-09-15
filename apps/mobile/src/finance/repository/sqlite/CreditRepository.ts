import { getDB } from '@common/database/db';
import {
  Credit,
  CreditFilter,
  CreditDirection,
  CreditStatus,
} from '@finance/models/Credit';
import { ICreditRepository } from '@finance/repository/interfaces/ICreditRepository';

export class CreditRepository implements ICreditRepository {
  async create(credit: Credit): Promise<void> {
    const db = await getDB();
    await db.executeSql(
      `INSERT INTO credits
         (id, direction, amount, interest_rate, txn_date, person, village,
          mobile_number, event_id, event_name, notes, status, settled_date,
          created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        credit.id,
        credit.direction,
        credit.amount,
        credit.interestRate,
        credit.date,
        credit.person,
        credit.village ?? null,
        credit.mobileNumber ?? null,
        credit.eventId ?? null,
        credit.eventName ?? null,
        credit.notes ?? null,
        credit.status,
        credit.settledDate ?? null,
        credit.createdAt,
        credit.updatedAt,
        credit.syncStatus,
      ],
    );
  }

  async update(credit: Credit): Promise<void> {
    const db = await getDB();
    await db.executeSql(
      `UPDATE credits
       SET direction     = ?,
           amount        = ?,
           interest_rate = ?,
           txn_date      = ?,
           person        = ?,
           village       = ?,
           mobile_number = ?,
           event_id      = ?,
           event_name    = ?,
           notes         = ?,
           status        = ?,
           settled_date  = ?,
           updated_at    = ?,
           sync_status   = ?
       WHERE id = ?`,
      [
        credit.direction,
        credit.amount,
        credit.interestRate,
        credit.date,
        credit.person,
        credit.village ?? null,
        credit.mobileNumber ?? null,
        credit.eventId ?? null,
        credit.eventName ?? null,
        credit.notes ?? null,
        credit.status,
        credit.settledDate ?? null,
        credit.updatedAt,
        credit.syncStatus,
        credit.id,
      ],
    );
  }

  async delete(id: string): Promise<void> {
    const db = await getDB();
    await db.executeSql(`DELETE FROM credits WHERE id = ?`, [id]);
  }

  async getById(id: string): Promise<Credit | null> {
    const db = await getDB();
    const [result] = await db.executeSql(
      `SELECT * FROM credits WHERE id = ? LIMIT 1`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return this.mapCredit(result.rows.item(0));
  }

  async getAll(filter?: CreditFilter): Promise<Credit[]> {
    const db = await getDB();
    const conditions: string[] = [];
    const params: (string | number | null)[] = [];

    if (filter?.direction) {
      conditions.push('direction = ?');
      params.push(filter.direction);
    }
    if (filter?.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }
    if (filter?.keyword) {
      conditions.push('(person LIKE ? OR village LIKE ? OR mobile_number LIKE ? OR notes LIKE ?)');
      const kw = `%${filter.keyword}%`;
      params.push(kw, kw, kw, kw);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [result] = await db.executeSql(
      `SELECT * FROM credits ${where} ORDER BY txn_date DESC, created_at DESC`,
      params,
    );
    return this.mapCredits(result);
  }

  // ── Mappers ────────────────────────────────────────────────────────────────

  private mapCredit(row: Record<string, unknown>): Credit {
    return {
      id: String(row.id),
      direction: (row.direction as CreditDirection) ?? 'IN',
      amount: Number(row.amount) || 0,
      interestRate: Number(row.interest_rate) || 0,
      date: String(row.txn_date),
      person: String(row.person ?? ''),
      village: row.village ? String(row.village) : null,
      mobileNumber: row.mobile_number ? String(row.mobile_number) : null,
      eventId: row.event_id ? String(row.event_id) : null,
      eventName: row.event_name ? String(row.event_name) : null,
      notes: row.notes ? String(row.notes) : null,
      status: (row.status as CreditStatus) ?? 'UPCOMING',
      settledDate: row.settled_date ? String(row.settled_date) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      syncStatus: Number(row.sync_status) || 0,
    };
  }

  private mapCredits(result: {
    rows: { length: number; item: (i: number) => Record<string, unknown> };
  }): Credit[] {
    const items: Credit[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      items.push(this.mapCredit(result.rows.item(i)));
    }
    return items;
  }
}
