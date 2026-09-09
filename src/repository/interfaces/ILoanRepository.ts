import {
  Loan,
  LoanPayment,
  LoanFilter,
} from '../../finance/models/Loan';

/**
 * Data access for the Finance / Loans module.
 *
 * Loans and their append-only payment history live in dedicated `loans` and
 * `loan_payments` tables, fully separate from the Moi domain. Recording a
 * payment inserts a new loan_payments row — it never updates the loan.
 */
export interface ILoanRepository {
  create(loan: Loan): Promise<void>;
  update(loan: Loan): Promise<void>;
  delete(id: string): Promise<void>;
  getById(id: string): Promise<Loan | null>;
  getAll(filter?: LoanFilter): Promise<Loan[]>;

  /** Append a payment (immutable history). */
  addPayment(payment: LoanPayment): Promise<void>;
  /** Payments for a loan, oldest → newest. */
  getPayments(loanId: string): Promise<LoanPayment[]>;
  /** Payments for many loans in one query (loanId → payments). */
  getPaymentsForLoans(loanIds: string[]): Promise<Record<string, LoanPayment[]>>;
}
