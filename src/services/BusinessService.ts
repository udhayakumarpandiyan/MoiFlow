import { v4 as uuidv4 } from 'uuid';

import { IBusinessRepository } from '../repository/interfaces/IBusinessRepository';
import { ISyncQueueRepository } from '../repository/interfaces/ISyncQueueRepository';
import {
  Party,
  PartyKind,
  PartyFilter,
  PartySummary,
  CreatePartyInput,
  Transaction,
  TransactionKind,
  TransactionFilter,
  TransactionView,
  CreateTransactionInput,
  BusinessSummary,
} from '../finance/models/Business';
import {
  toTransactionView,
  computePartySummary,
  computeBusinessSummary,
  clampSettled,
} from '../finance/businessCalculations';

/**
 * Finance / Business business logic (customers, suppliers, sales, purchases).
 *
 * Outstanding amounts and payment status are DERIVED via businessCalculations,
 * so they always recalculate when a transaction or payment is edited. Optionally
 * enqueues sync ops so records flow through the existing (Premium-gated) sync.
 */
export class BusinessService {
  constructor(
    private readonly repo: IBusinessRepository,
    private readonly syncRepo?: ISyncQueueRepository,
  ) {}

  // ── Parties (customers / suppliers) ─────────────────────────────────────────

  async createParty(input: CreatePartyInput): Promise<Party> {
    this.validateParty(input);
    const now = new Date().toISOString();
    const party: Party = {
      id: uuidv4(),
      kind: input.kind,
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      notes: input.notes?.trim() || null,
      createdAt: now,
      updatedAt: now,
      syncStatus: 0,
    };
    await this.repo.createParty(party);
    await this.enqueue('CREATE', 'business_party', party.id, party);
    return party;
  }

  async updateParty(id: string, updates: Partial<CreatePartyInput>): Promise<Party> {
    const existing = await this.repo.getParty(id);
    if (!existing) throw new Error(`Party not found: ${id}`);
    const updated: Party = {
      ...existing,
      ...updates,
      name: (updates.name ?? existing.name).trim(),
      phone: updates.phone !== undefined ? updates.phone?.trim() || null : existing.phone,
      address: updates.address !== undefined ? updates.address?.trim() || null : existing.address,
      notes: updates.notes !== undefined ? updates.notes?.trim() || null : existing.notes,
      updatedAt: new Date().toISOString(),
      syncStatus: 0,
    };
    this.validateParty(updated);
    await this.repo.updateParty(updated);
    await this.enqueue('UPDATE', 'business_party', updated.id, updated);
    return updated;
  }

  async deleteParty(id: string): Promise<void> {
    await this.repo.deleteParty(id);
    await this.enqueue('DELETE', 'business_party', id, { id });
  }

  async getParty(id: string): Promise<Party | null> {
    return this.repo.getParty(id);
  }

  async getParties(filter?: PartyFilter): Promise<Party[]> {
    return this.repo.getParties(filter);
  }

  /** Parties of a kind with their derived rollups (outstanding, totals, last txn). */
  async getPartySummaries(kind: PartyKind): Promise<PartySummary[]> {
    const parties = await this.repo.getParties({ kind });
    if (parties.length === 0) return [];
    const byParty = await this.repo.getTransactionsForParties(parties.map(p => p.id));
    return parties.map(p => computePartySummary(p, byParty[p.id] ?? []));
  }

  /** One party's summary + its transaction history (newest first). */
  async getPartyDetail(
    id: string,
  ): Promise<{ summary: PartySummary; transactions: TransactionView[] } | null> {
    const party = await this.repo.getParty(id);
    if (!party) return null;
    const txns = await this.repo.getTransactions({ partyId: id });
    return {
      summary: computePartySummary(party, txns),
      transactions: txns.map(toTransactionView),
    };
  }

  // ── Transactions (sales / purchases) ────────────────────────────────────────

  async createTransaction(input: CreateTransactionInput): Promise<Transaction> {
    this.validateTransaction(input);
    const now = new Date().toISOString();
    const amount = Number(input.amount) || 0;
    const txn: Transaction = {
      id: uuidv4(),
      kind: input.kind,
      partyId: input.partyId,
      date: input.date,
      description: input.description?.trim() || null,
      quantity: Number(input.quantity) || 0,
      amount,
      amountSettled: clampSettled(amount, Number(input.amountSettled) || 0),
      notes: input.notes?.trim() || null,
      createdAt: now,
      updatedAt: now,
      syncStatus: 0,
    };
    await this.repo.createTransaction(txn);
    await this.enqueue('CREATE', 'business_transaction', txn.id, txn);
    return txn;
  }

  async updateTransaction(
    id: string,
    updates: Partial<CreateTransactionInput>,
  ): Promise<Transaction> {
    const existing = await this.repo.getTransaction(id);
    if (!existing) throw new Error(`Transaction not found: ${id}`);
    const amount =
      updates.amount !== undefined ? Number(updates.amount) || 0 : existing.amount;
    const rawSettled =
      updates.amountSettled !== undefined
        ? Number(updates.amountSettled) || 0
        : existing.amountSettled;
    const updated: Transaction = {
      ...existing,
      ...updates,
      description:
        updates.description !== undefined
          ? updates.description?.trim() || null
          : existing.description,
      quantity:
        updates.quantity !== undefined ? Number(updates.quantity) || 0 : existing.quantity,
      amount,
      // Recalculate settled/outstanding against the (possibly new) amount.
      amountSettled: clampSettled(amount, rawSettled),
      notes: updates.notes !== undefined ? updates.notes?.trim() || null : existing.notes,
      updatedAt: new Date().toISOString(),
      syncStatus: 0,
    };
    this.validateTransaction(updated);
    await this.repo.updateTransaction(updated);
    await this.enqueue('UPDATE', 'business_transaction', updated.id, updated);
    return updated;
  }

  async deleteTransaction(id: string): Promise<void> {
    await this.repo.deleteTransaction(id);
    await this.enqueue('DELETE', 'business_transaction', id, { id });
  }

  async getTransaction(id: string): Promise<Transaction | null> {
    return this.repo.getTransaction(id);
  }

  async getTransactionView(id: string): Promise<TransactionView | null> {
    const txn = await this.repo.getTransaction(id);
    return txn ? toTransactionView(txn) : null;
  }

  /** Transactions of a kind as views (with derived outstanding + status). */
  async getTransactionViews(kind: TransactionKind): Promise<TransactionView[]> {
    const txns = await this.repo.getTransactions({ kind });
    return txns.map(toTransactionView);
  }

  async getTransactions(filter?: TransactionFilter): Promise<Transaction[]> {
    return this.repo.getTransactions(filter);
  }

  /**
   * Record a payment (received for a SALE / paid for a PURCHASE) against a
   * transaction. Adds to amount_settled, clamped to the total. Outstanding +
   * status recalculate automatically.
   */
  async recordPayment(id: string, paymentAmount: number): Promise<Transaction> {
    const txn = await this.repo.getTransaction(id);
    if (!txn) throw new Error(`Transaction not found: ${id}`);
    const add = Number(paymentAmount) || 0;
    if (add <= 0) throw new Error('PAYMENT_AMOUNT_REQUIRED');
    const updated: Transaction = {
      ...txn,
      amountSettled: clampSettled(txn.amount, txn.amountSettled + add),
      updatedAt: new Date().toISOString(),
      syncStatus: 0,
    };
    await this.repo.updateTransaction(updated);
    await this.enqueue('UPDATE', 'business_transaction', updated.id, updated);
    return updated;
  }

  // ── Business summary ──────────────────────────────────────────────────────────

  async getBusinessSummary(): Promise<BusinessSummary> {
    const [sales, purchases] = await Promise.all([
      this.repo.getTransactions({ kind: 'SALE' }),
      this.repo.getTransactions({ kind: 'PURCHASE' }),
    ]);
    return computeBusinessSummary(sales, purchases);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private validateParty(input: { name: string }): void {
    if (!input.name || !String(input.name).trim()) {
      throw new Error('NAME_REQUIRED');
    }
  }

  private validateTransaction(input: { partyId: string; amount: number; date: string }): void {
    if (!input.partyId) throw new Error('PARTY_REQUIRED');
    if (!input.date) throw new Error('DATE_REQUIRED');
    if (!(Number(input.amount) > 0)) throw new Error('AMOUNT_REQUIRED');
  }

  private async enqueue(
    operation: 'CREATE' | 'UPDATE' | 'DELETE',
    entityType: 'business_party' | 'business_transaction',
    entityId: string,
    payload: unknown,
  ): Promise<void> {
    if (!this.syncRepo) return;
    try {
      await this.syncRepo.add({
        id: uuidv4(),
        entityType,
        entityId,
        operation,
        payload: JSON.stringify(payload),
        createdAt: new Date().toISOString(),
        retryCount: 0,
        lastError: null,
      });
    } catch {
      // Sync enqueue is best-effort; never block a local write on it.
    }
  }
}
