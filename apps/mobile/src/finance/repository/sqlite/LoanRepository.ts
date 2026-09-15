import { getDB } from '@common/database/db';
import {
  Loan,
  LoanFilter,
  LoanType,
  LoanStatus,
  GoldLoanProvider,
} from '@finance/models/Loan';
import { ILoanRepository } from '@finance/repository/interfaces/ILoanRepository';

export class LoanRepository implements ILoanRepository {
  // ── Loans ──────────────────────────────────────────────────────────────────

  async create(loan: Loan): Promise<void> {
    const db = await getDB();
    await db.executeSql(
      `INSERT INTO loans
         (id, loan_type, loan_amount, start_date, provider, interest_rate,
          monthly_emi, emi_date, tenure, total_emis, paid_emis,
          outstanding_amount, status, notes, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        loan.id,
        loan.loanType,
        loan.loanAmount,
        loan.startDate,
        loan.provider,
        loan.interestRate,
        loan.monthlyEMI,
        loan.emiDate,
        loan.tenure,
        loan.totalEMIs,
        loan.paidEMIs,
        loan.outstandingAmount ?? null,
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
       SET loan_type          = ?,
           loan_amount        = ?,
           start_date         = ?,
           provider           = ?,
           interest_rate      = ?,
           monthly_emi        = ?,
           emi_date           = ?,
           tenure             = ?,
           total_emis         = ?,
           paid_emis          = ?,
           outstanding_amount = ?,
           status             = ?,
           notes              = ?,
           updated_at         = ?,
           sync_status        = ?
       WHERE id = ?`,
      [
        loan.loanType,
        loan.loanAmount,
        loan.startDate,
        loan.provider,
        loan.interestRate,
        loan.monthlyEMI,
        loan.emiDate,
        loan.tenure,
        loan.totalEMIs,
        loan.paidEMIs,
        loan.outstandingAmount ?? null,
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

    if (filter?.loanType) {
      conditions.push('loan_type = ?');
      params.push(filter.loanType);
    }
    if (filter?.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }
    if (filter?.keyword) {
      conditions.push('(provider LIKE ? OR notes LIKE ?)');
      const kw = `%${filter.keyword}%`;
      params.push(kw, kw);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [result] = await db.executeSql(
      `SELECT * FROM loans ${where} ORDER BY start_date DESC, created_at DESC`,
      params,
    );
    return this.mapLoans(result);
  }

  // ── Gold loan providers (configurable comparison) ────────────────────────────

  async getGoldProviders(): Promise<GoldLoanProvider[]> {
    const db = await getDB();
    const [result] = await db.executeSql(
      `SELECT * FROM gold_loan_providers ORDER BY provider ASC`,
    );
    const items: GoldLoanProvider[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      items.push(this.mapGoldProvider(result.rows.item(i)));
    }
    return items;
  }

  async upsertGoldProvider(provider: GoldLoanProvider): Promise<void> {
    const db = await getDB();
    await db.executeSql(
      `INSERT OR REPLACE INTO gold_loan_providers
         (id, provider, interest_rate, amount_per_gram, ltv, processing_fee, other_charges, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        provider.id,
        provider.provider,
        provider.interestRate,
        provider.amountPerGram,
        provider.ltv,
        provider.processingFee,
        provider.otherCharges ?? null,
        provider.updatedAt,
      ],
    );
  }

  async deleteGoldProvider(id: string): Promise<void> {
    const db = await getDB();
    await db.executeSql(`DELETE FROM gold_loan_providers WHERE id = ?`, [id]);
  }

  // ── Mappers ────────────────────────────────────────────────────────────────

  private mapLoan(row: Record<string, unknown>): Loan {
    return {
      id: String(row.id),
      loanType: (row.loan_type as LoanType) ?? 'PERSONAL',
      loanAmount: Number(row.loan_amount) || 0,
      startDate: String(row.start_date),
      provider: String(row.provider ?? ''),
      interestRate: Number(row.interest_rate) || 0,
      monthlyEMI: Number(row.monthly_emi) || 0,
      emiDate: Number(row.emi_date) || 1,
      tenure: Number(row.tenure) || 0,
      totalEMIs: Number(row.total_emis) || 0,
      paidEMIs: Number(row.paid_emis) || 0,
      outstandingAmount:
        row.outstanding_amount != null ? Number(row.outstanding_amount) : null,
      status: (row.status as LoanStatus) ?? 'ACTIVE',
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

  private mapGoldProvider(row: Record<string, unknown>): GoldLoanProvider {
    return {
      id: String(row.id),
      provider: String(row.provider ?? ''),
      interestRate: Number(row.interest_rate) || 0,
      amountPerGram: Number(row.amount_per_gram) || 0,
      ltv: Number(row.ltv) || 0,
      processingFee: Number(row.processing_fee) || 0,
      otherCharges: row.other_charges ? String(row.other_charges) : null,
      updatedAt: String(row.updated_at),
    };
  }
}
