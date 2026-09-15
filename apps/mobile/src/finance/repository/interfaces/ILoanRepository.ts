import {
  Loan,
  LoanFilter,
  GoldLoanProvider,
} from '@finance/models/Loan';

/**
 * Data access for the Finance / Loans module.
 *
 * Loans are EMI-based borrowings stored in the `loans` table, fully separate
 * from the Moi domain. Marking a loan CLOSED only updates its status row — the
 * record is preserved. Gold-loan provider comparison rows live in their own
 * configurable `gold_loan_providers` table.
 */
export interface ILoanRepository {
  create(loan: Loan): Promise<void>;
  update(loan: Loan): Promise<void>;
  delete(id: string): Promise<void>;
  getById(id: string): Promise<Loan | null>;
  getAll(filter?: LoanFilter): Promise<Loan[]>;

  // ── Gold loan comparison (configurable providers) ──────────────────────────
  getGoldProviders(): Promise<GoldLoanProvider[]>;
  upsertGoldProvider(provider: GoldLoanProvider): Promise<void>;
  deleteGoldProvider(id: string): Promise<void>;
}
