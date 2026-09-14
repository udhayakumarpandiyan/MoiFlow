import { getDB } from '../../database/db';
import {
  Party,
  PartyKind,
  PartyFilter,
  Transaction,
  TransactionKind,
  TransactionFilter,
} from '../../finance/models/Business';
import { IBusinessRepository } from '../interfaces/IBusinessRepository';

export class BusinessRepository implements IBusinessRepository {
  // ── Parties ─────────────────────────────────────────────────────────────────

  async createParty(party: Party): Promise<void> {
    const db = await getDB();
    await db.executeSql(
      `INSERT INTO business_parties
         (id, kind, name, phone, address, notes, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        party.id,
        party.kind,
        party.name,
        party.phone ?? null,
        party.address ?? null,
        party.notes ?? null,
        party.createdAt,
        party.updatedAt,
        party.syncStatus,
      ],
    );
  }

  async updateParty(party: Party): Promise<void> {
    const db = await getDB();
    await db.executeSql(
      `UPDATE business_parties
       SET kind = ?, name = ?, phone = ?, address = ?, notes = ?, updated_at = ?, sync_status = ?
       WHERE id = ?`,
      [
        party.kind,
        party.name,
        party.phone ?? null,
        party.address ?? null,
        party.notes ?? null,
        party.updatedAt,
        party.syncStatus,
        party.id,
      ],
    );
  }

  async deleteParty(id: string): Promise<void> {
    const db = await getDB();
    // Remove linked transactions first (defensive — FK also cascades).
    await db.executeSql(`DELETE FROM business_transactions WHERE party_id = ?`, [id]);
    await db.executeSql(`DELETE FROM business_parties WHERE id = ?`, [id]);
  }

  async getParty(id: string): Promise<Party | null> {
    const db = await getDB();
    const [result] = await db.executeSql(
      `SELECT * FROM business_parties WHERE id = ? LIMIT 1`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return this.mapParty(result.rows.item(0));
  }

  async getParties(filter?: PartyFilter): Promise<Party[]> {
    const db = await getDB();
    const conditions: string[] = [];
    const params: (string | number | null)[] = [];

    if (filter?.kind) {
      conditions.push('kind = ?');
      params.push(filter.kind);
    }
    if (filter?.keyword) {
      conditions.push('(name LIKE ? OR phone LIKE ?)');
      const kw = `%${filter.keyword}%`;
      params.push(kw, kw);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [result] = await db.executeSql(
      `SELECT * FROM business_parties ${where} ORDER BY name COLLATE NOCASE ASC`,
      params,
    );
    const items: Party[] = [];
    for (let i = 0; i < result.rows.length; i++) items.push(this.mapParty(result.rows.item(i)));
    return items;
  }

  // ── Transactions ─────────────────────────────────────────────────────────────

  async createTransaction(txn: Transaction): Promise<void> {
    const db = await getDB();
    await db.executeSql(
      `INSERT INTO business_transactions
         (id, kind, party_id, date, description, quantity, amount, amount_settled,
          notes, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        txn.id,
        txn.kind,
        txn.partyId,
        txn.date,
        txn.description ?? null,
        txn.quantity,
        txn.amount,
        txn.amountSettled,
        txn.notes ?? null,
        txn.createdAt,
        txn.updatedAt,
        txn.syncStatus,
      ],
    );
  }

  async updateTransaction(txn: Transaction): Promise<void> {
    const db = await getDB();
    await db.executeSql(
      `UPDATE business_transactions
       SET kind = ?, party_id = ?, date = ?, description = ?, quantity = ?,
           amount = ?, amount_settled = ?, notes = ?, updated_at = ?, sync_status = ?
       WHERE id = ?`,
      [
        txn.kind,
        txn.partyId,
        txn.date,
        txn.description ?? null,
        txn.quantity,
        txn.amount,
        txn.amountSettled,
        txn.notes ?? null,
        txn.updatedAt,
        txn.syncStatus,
        txn.id,
      ],
    );
  }

  async deleteTransaction(id: string): Promise<void> {
    const db = await getDB();
    await db.executeSql(`DELETE FROM business_transactions WHERE id = ?`, [id]);
  }

  async getTransaction(id: string): Promise<Transaction | null> {
    const db = await getDB();
    const [result] = await db.executeSql(
      `SELECT * FROM business_transactions WHERE id = ? LIMIT 1`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return this.mapTransaction(result.rows.item(0));
  }

  async getTransactions(filter?: TransactionFilter): Promise<Transaction[]> {
    const db = await getDB();
    const conditions: string[] = [];
    const params: (string | number | null)[] = [];

    if (filter?.kind) {
      conditions.push('kind = ?');
      params.push(filter.kind);
    }
    if (filter?.partyId) {
      conditions.push('party_id = ?');
      params.push(filter.partyId);
    }
    if (filter?.keyword) {
      conditions.push('(description LIKE ? OR notes LIKE ?)');
      const kw = `%${filter.keyword}%`;
      params.push(kw, kw);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [result] = await db.executeSql(
      `SELECT * FROM business_transactions ${where} ORDER BY date DESC, created_at DESC`,
      params,
    );
    return this.mapTransactions(result);
  }

  async getTransactionsForParties(
    partyIds: string[],
  ): Promise<Record<string, Transaction[]>> {
    const map: Record<string, Transaction[]> = {};
    if (partyIds.length === 0) return map;
    const db = await getDB();
    const placeholders = partyIds.map(() => '?').join(', ');
    const [result] = await db.executeSql(
      `SELECT * FROM business_transactions WHERE party_id IN (${placeholders})
       ORDER BY date DESC, created_at DESC`,
      partyIds,
    );
    const txns = this.mapTransactions(result);
    for (const t of txns) {
      (map[t.partyId] ??= []).push(t);
    }
    return map;
  }

  // ── Mappers ────────────────────────────────────────────────────────────────

  private mapParty(row: Record<string, unknown>): Party {
    return {
      id: String(row.id),
      kind: (row.kind as PartyKind) ?? 'CUSTOMER',
      name: String(row.name ?? ''),
      phone: row.phone ? String(row.phone) : null,
      address: row.address ? String(row.address) : null,
      notes: row.notes ? String(row.notes) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      syncStatus: Number(row.sync_status) || 0,
    };
  }

  private mapTransaction(row: Record<string, unknown>): Transaction {
    return {
      id: String(row.id),
      kind: (row.kind as TransactionKind) ?? 'SALE',
      partyId: String(row.party_id),
      date: String(row.date),
      description: row.description ? String(row.description) : null,
      quantity: Number(row.quantity) || 0,
      amount: Number(row.amount) || 0,
      amountSettled: Number(row.amount_settled) || 0,
      notes: row.notes ? String(row.notes) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      syncStatus: Number(row.sync_status) || 0,
    };
  }

  private mapTransactions(result: {
    rows: { length: number; item: (i: number) => Record<string, unknown> };
  }): Transaction[] {
    const items: Transaction[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      items.push(this.mapTransaction(result.rows.item(i)));
    }
    return items;
  }
}
