import { Entry } from '../models/Entry';
import { PersonBalance } from '../models/Report';

/**
 * BalanceService — centralized Moi transaction balance calculations.
 *
 * BUSINESS RULES:
 *   OWN_EVENT  (someone came to MY event)    → cash/gold flows IN
 *   OTHER_EVENT (I went to THEIR event)      → cash/gold flows OUT
 *
 * Net balance per person:
 *   netCash = totalCashIn - totalCashOut
 *   netGold = totalGoldIn - totalGoldOut
 *
 * If netCash > 0 → that person still owes me
 * If netCash < 0 → I still owe that person
 *
 * Example:
 *   Person gives me ₹1,000 (OWN_EVENT)  → cashIn  = 1000
 *   I give Person   ₹1,500 (OTHER_EVENT) → cashOut = 1500
 *   I give Person   ₹2,000 (OTHER_EVENT) → cashOut = 2000
 *   netCash = 1000 - 3500 = -2500  → I am owed ₹2500 to receive
 */
export class BalanceService {
  // ─────────────────────────────────────────────────────────────────────────
  // Core per-person balance from entry list
  // ─────────────────────────────────────────────────────────────────────────

  computePersonBalances(entries: Entry[]): Map<string, PersonBalance> {
    const map = new Map<string, PersonBalance>();

    for (const entry of entries) {
      let balance = map.get(entry.personId);

      if (!balance) {
        balance = {
          personId: entry.personId,
          personName: entry.personName,
          villageName: entry.villageName || null,
          totalCashIn: 0,
          totalGoldIn: 0,
          totalCashOut: 0,
          totalGoldOut: 0,
          netCash: 0,
          netGold: 0,
          entryCount: 0,
          cashToBeReceived: 0,
          cashToBeGiven: 0,
          goldToBeReceived: 0,
          goldToBeGiven: 0,
        };
        map.set(entry.personId, balance);
      }

      if (entry.entryType === 'OWN_EVENT') {
        balance.totalCashIn += entry.cashAmount;
        balance.totalGoldIn += entry.goldWeight;
      } else {
        balance.totalCashOut += entry.cashAmount;
        balance.totalGoldOut += entry.goldWeight;
      }

      balance.entryCount++;
    }

    // Compute net balances + receivable/payable
    for (const balance of map.values()) {
      balance.netCash = balance.totalCashIn - balance.totalCashOut;
      balance.netGold = balance.totalGoldIn - balance.totalGoldOut;
      balance.cashToBeReceived = balance.netCash < 0 ? Math.abs(balance.netCash) : 0;
      balance.cashToBeGiven    = balance.netCash > 0 ? balance.netCash : 0;
      balance.goldToBeReceived = balance.netGold < 0 ? Math.abs(balance.netGold) : 0;
      balance.goldToBeGiven    = balance.netGold > 0 ? balance.netGold : 0;
    }

    return map;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Aggregate across all persons
  // ─────────────────────────────────────────────────────────────────────────

  computeAggregateBalances(balances: Map<string, PersonBalance>): AggregateBalance {
    let cashToReceive = 0;
    let cashToGive = 0;
    let goldToReceive = 0;
    let goldToGive = 0;

    for (const b of balances.values()) {
      if (b.netCash < 0) {
        // I gave more than I received → net receivable
        cashToReceive += Math.abs(b.netCash);
      } else if (b.netCash > 0) {
        // I received more than I gave → net payable
        cashToGive += b.netCash;
      }

      if (b.netGold < 0) {
        goldToReceive += Math.abs(b.netGold);
      } else if (b.netGold > 0) {
        goldToGive += b.netGold;
      }
    }

    return { cashToReceive, cashToGive, goldToReceive, goldToGive };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Single-person balance label helpers
  // ─────────────────────────────────────────────────────────────────────────

  getPersonStatus(balance: PersonBalance): 'RECEIVABLE' | 'PAYABLE' | 'SETTLED' {
    if (balance.netCash < 0 || balance.netGold < 0) return 'RECEIVABLE';
    if (balance.netCash > 0 || balance.netGold > 0) return 'PAYABLE';
    return 'SETTLED';
  }

  formatNetCash(netCash: number): string {
    const absVal = Math.abs(netCash).toLocaleString('en-IN');
    if (netCash < 0) return `To Receive ₹${absVal}`;
    if (netCash > 0) return `To Give ₹${absVal}`;
    return 'Settled';
  }
}

export interface AggregateBalance {
  cashToReceive: number;
  cashToGive: number;
  goldToReceive: number;
  goldToGive: number;
}

export const balanceService = new BalanceService();
