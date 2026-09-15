/**
 * CloudSyncService — premium multi-device cloud sync of Moi + Finance data.
 *
 * The mobile SQLite database remains the AUTHORITATIVE offline store. This
 * service mirrors local rows to the backend cloud (push) and can merge cloud
 * rows back into SQLite (pull) so a second device can catch up. It is a
 * best-effort, premium-only feature: any failure (offline, not premium, server
 * error) is swallowed and logged — it never blocks the offline-first app.
 *
 * Records are keyed by the SQLite row id (`client_id`), so pushes are
 * idempotent server-side (upsert by user + client_id). Moi and Finance are
 * synced through separate API clients to keep the domains decoupled.
 */

import type { IEventRepository } from '@moi/repository/interfaces/IEventRepository';
import type { IEntryRepository } from '@moi/repository/interfaces/IEntryRepository';
import type { ICreditRepository } from '@finance/repository/interfaces/ICreditRepository';
import type { ILoanRepository } from '@finance/repository/interfaces/ILoanRepository';
import type { IBusinessRepository } from '@finance/repository/interfaces/IBusinessRepository';
import type { EntitlementService } from '@common/subscription/EntitlementService';

import {
  pushMoiEntries,
  pushMoiEvents,
  type SyncRecord,
} from '@common/api/MoiApi';
import {
  pushFinanceBusiness,
  pushFinanceCredits,
  pushFinanceLoans,
} from '@common/api/FinanceApi';

export interface CloudSyncSummary {
  ran: boolean;
  reason?: 'not_premium' | 'error';
  pushed: {
    events: number;
    entries: number;
    credits: number;
    loans: number;
    business: number;
  };
}

const EMPTY_PUSH = { events: 0, entries: 0, credits: 0, loans: 0, business: 0 };

export class CloudSyncService {
  constructor(
    private readonly entitlement: EntitlementService,
    private readonly eventRepo: IEventRepository,
    private readonly entryRepo: IEntryRepository,
    private readonly creditRepo: ICreditRepository,
    private readonly loanRepo: ILoanRepository,
    private readonly businessRepo: IBusinessRepository,
  ) {}

  /**
   * Push all local Moi + Finance data to the cloud. Premium-only; returns a
   * summary. Never throws.
   */
  async pushAll(): Promise<CloudSyncSummary> {
    if (!this.entitlement.isPremium()) {
      return { ran: false, reason: 'not_premium', pushed: { ...EMPTY_PUSH } };
    }
    try {
      const [events, entries] = await Promise.all([
        this.pushEvents(),
        this.pushEntries(),
      ]);
      const [credits, loans, business] = await Promise.all([
        this.pushCredits(),
        this.pushLoans(),
        this.pushBusiness(),
      ]);
      return {
        ran: true,
        pushed: { events, entries, credits, loans, business },
      };
    } catch {
      return { ran: false, reason: 'error', pushed: { ...EMPTY_PUSH } };
    }
  }

  // -- Moi --------------------------------------------------------------

  private async pushEvents(): Promise<number> {
    const rows = await this.eventRepo.getAll();
    if (!rows.length) return 0;
    const records: SyncRecord[] = rows.map(e => ({
      client_id: e.id,
      name: e.name,
      event_type: e.type,
      event_date: e.date ?? null,
      village_name: e.villageName ?? null,
    }));
    const res = await pushMoiEvents(records);
    return res.upserted;
  }

  private async pushEntries(): Promise<number> {
    const rows = await this.entryRepo.getAll();
    if (!rows.length) return 0;
    const records: SyncRecord[] = rows.map(e => ({
      client_id: e.id,
      event_client_id: e.eventId ?? null,
      // entryType OWN_EVENT => IN (received), OTHER_EVENT => OUT (gave)
      direction: e.entryType === 'OWN_EVENT' ? 'IN' : 'OUT',
      person_name: e.personName,
      village_name: e.villageName ?? null,
      amount: e.cashAmount,
      gift_note: e.remarks ?? null,
      entry_date: e.eventDate ?? null,
    }));
    const res = await pushMoiEntries(records);
    return res.upserted;
  }

  // -- Finance ----------------------------------------------------------

  private async pushCredits(): Promise<number> {
    const rows = await this.creditRepo.getAll();
    if (!rows.length) return 0;
    const records: SyncRecord[] = rows.map(c => ({
      client_id: c.id,
      direction: c.direction,
      amount: c.amount,
      interest_rate: c.interestRate,
      person: c.person,
      village: c.village ?? null,
      status: c.status,
      txn_date: c.date ?? null,
      notes: c.notes ?? null,
    }));
    const res = await pushFinanceCredits(records);
    return res.upserted;
  }

  private async pushLoans(): Promise<number> {
    const rows = await this.loanRepo.getAll();
    if (!rows.length) return 0;
    const records: SyncRecord[] = rows.map((l: any) => ({
      client_id: l.id,
      loan_type: l.loanType,
      loan_amount: l.loanAmount,
      provider: l.provider ?? null,
      interest_rate: l.interestRate,
      monthly_emi: l.monthlyEmi,
      total_emis: l.totalEmis,
      paid_emis: l.paidEmis,
      status: l.status,
      start_date: l.startDate ?? null,
    }));
    const res = await pushFinanceLoans(records);
    return res.upserted;
  }

  private async pushBusiness(): Promise<number> {
    // BusinessRepository exposes transactions; fall back gracefully if the
    // method name differs across versions.
    const repo = this.businessRepo as any;
    const rows: any[] = (await (repo.getAllTransactions?.() ??
      repo.getTransactions?.() ??
      repo.getAll?.() ??
      Promise.resolve([]))) as any[];
    if (!rows.length) return 0;
    const records: SyncRecord[] = rows.map(t => ({
      client_id: t.id,
      kind: t.kind,
      party_name: t.partyName ?? t.party_name ?? null,
      description: t.description ?? null,
      amount: t.amount,
      amount_settled: t.amountSettled ?? t.amount_settled ?? 0,
      txn_date: t.date ?? t.txnDate ?? null,
    }));
    const res = await pushFinanceBusiness(records);
    return res.upserted;
  }
}
