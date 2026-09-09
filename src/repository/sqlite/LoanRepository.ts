import { getDB } from '../../database/db';
import {
  Loan,
  LoanPayment,
  LoanFilter,
  LoanDirection,
  LoanType,
  PartyType,
  InterestType,
  LoanStatus,
} from '../../finance/models/Loan';
import { ILoanRepository } from '../interfaces/ILoanRepository';

export class LoanRepository implements ILoanRepository {
  // ── Loans ──────────────────────────────────────────────────────────────────

  async create(loan: Loan): Promise<void> {
    const db = await getDB();
    await db.executeSql(
      `INSERT INTO loans
         (id, direction, loan_type, party_type, party_name, party_village,
          party_phone, party_contact, principal, interest_rate, interest_type,
          loan_date, due_date, status, notes, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        loan.id,
        loan.direction,
        loan.loanType,
        loan.partyType,
        loan.partyName,
        loan.partyVillage ?? null,
        loan.partyPhone ?? null,
        loan.partyContact ?? null,
        loan.principal,
        loan.interestRate,
        loan.interestType,
        loan.loanDate,
        loan.dueDate ?? null,
        loan.status,
        loan.notes ?? null,
        loan.createdAt,
        loan.updatedAt,
        loan.syncStatus,
      ],
    );
  }

  async update(loan: Loan): Promise<void> {
    const db = await getDB();
    await db.executeSql(
      `UPDATE loans
       SET direction    = ?,
           loan_type     = ?,
           party_type    = ?,
           party_name    = ?,
           party_village = ?,
           party_phone   = ?,
           party_contact = ?,
           principal     = ?,
           interest_rate = ?,
           interest_type = ?,
           loan_date     = ?,
           due_date      = ?,
           status        = ?,
           notes         = ?,
           updated_at    = ?,
           sync_status   = ?
       WHERE id = ?`,
      [
        loan.direction,
        loan.loanType,
        loan.partyType,
        loan.partyName,
        loan.partyVillage ?? null,
        loan.partyPhone ?? null,
        loan.partyContact ?? null,
        loan.principal,
        loan.interestRate,
        loan.interestType,
        loan.loanDate,
        loan.dueDate ?? null,
        loan.status,
        loan.notes ?? null,
        loan.updatedAt,
        loan.syncStatus,
        loan.id,
      ],
    );
  }

  async delete(id: string): Promise<void> {
    const db = await getDB();
    // Remove payment history first (defensive — FK also cascades).
    await db.executeSql(`DELETE FROM loan_payments WHERE loan_id = ?`, [id]);
    await db.executeSql(`DELETE FROM loans WHERE id = ?`, [id]);
  }

  async getById(id: string): Promise<Loan | null> {
    const db = await getDB();
    const [result] = await db.executeSql(
      `SELECT * FROM loans WHERE id = ? LIMIT 1`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return this.mapLoan(result.rows.item(0));
  }

  async getAll(filter?: LoanFilter): Promise<Loan[]> {
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
    if (filter?.loanType) {
      conditions.push('loan_type = ?');
      params.push(filter.loanType);
    }
    if (filter?.partyType) {
      conditions.push('party_type = ?');
      params.push(filter.partyType);
    }
    if (filter?.keyword) {
      conditions.push('(party_name LIKE ? OR party_village LIKE ? OR notes LIKE ?)');
      const kw = `%${filter.keyword}%`;
      params.push(kw, kw, kw);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [result] = await db.executeSql(
      `SELECT * FROM loans ${where} ORDER BY loan_date DESC, created_at DESC`,
      params,
    );
    return this.mapLoans(result);
  }

  // ── Payments (append-only) ───────────────────────────────────────────────────

  async addPayment(payment: LoanPayment): Promise<void> {
    const db = await getDB();
    await db.executeSql(
      `INSERT INTO loan_payments
         (id, loan_id, principal_paid, interest_paid, payment_date, note, created_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payment.id,
        payment.loanId,
        payment.principalPaid,
        payment.interestPaid,
        payment.paymentDate,
        payment.note ?? null,
        payment.createdAt,
        payment.syncStatus,
      ],
    );
  }

  async getPayments(loanId: string): Promise<LoanPayment[]> {
    const db = await getDB();
    const [result] = await db.executeSql(
      `SELECT * FROM loan_payments WHERE loan_id = ? ORDER BY payment_date ASC, created_at ASC`,
      [loanId],
    );
    return this.mapPayments(result);
  }

  async getPaymentsForLoans(
    loanIds: string[],
  ): Promise<Record<string, LoanPayment[]>> {
    const map: Record<string, LoanPayment[]> = {};
    if (loanIds.length === 0) return map;
    const db = await getDB();
    const placeholders = loanIds.map(() => '?').join(', ');
    const [result] = await db.executeSql(
      `SELECT * FROM loan_payments WHERE loan_id IN (${placeholders})
       ORDER BY payment_date ASC, created_at ASC`,
      loanIds,
    );
    const payments = this.mapPayments(result);
    for (const p of payments) {
      (map[p.loanId] ??= []).push(p);
    }
    return map;
  }

  // ── Mappers ────────────────────────────────────────────────────────────────

  private mapLoan(row: Record<string, unknown>): Loan {
    return {
      id: String(row.id),
      direction: (row.direction as LoanDirection) ?? 'LENT',
      loanType: (row.loan_type as LoanType) ?? 'PERSONAL',
      partyType: (row.party_type as PartyType) ?? 'PERSON',
      partyName: String(row.party_name ?? ''),
      partyVillage: row.party_village ? String(row.party_village) : null,
      partyPhone: row.party_phone ? String(row.party_phone) : null,
      partyContact: row.party_contact ? String(row.party_contact) : null,
      principal: Number(row.principal) || 0,
      interestRate: Number(row.interest_rate) || 0,
      interestType: (row.interest_type as InterestType) ?? 'NONE',
      loanDate: String(row.loan_date),
      dueDate: row.due_date ? String(row.due_date) : null,
      status: (row.status as LoanStatus) ?? 'PENDING',
      notes: row.notes ? String(row.notes) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      syncStatus: Number(row.sync_status) || 0,
    };
  }

  private mapLoans(result: {
    rows: { length: number; item: (i: number) => Record<string, unknown> };
  }): Loan[] {
    const items: Loan[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      items.push(this.mapLoan(result.rows.item(i)));
    }
    return items;
  }

  private mapPayment(row: Record<string, unknown>): LoanPayment {
    return {
      id: String(row.id),
      loanId: String(row.loan_id),
      principalPaid: Number(row.principal_paid) || 0,
      interestPaid: Number(row.interest_paid) || 0,
      paymentDate: String(row.payment_date),
      note: row.note ? String(row.note) : null,
      createdAt: String(row.created_at),
      syncStatus: Number(row.sync_status) || 0,
    };
  }

  private mapPayments(result: {
    rows: { length: number; item: (i: number) => Record<string, unknown> };
  }): LoanPayment[] {
    const items: LoanPayment[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      items.push(this.mapPayment(result.rows.item(i)));
    }
    return items;
  }
}
