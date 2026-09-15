/**
 * Shared cross-app type definitions.
 *
 * These types describe the contracts between the mobile app, the admin portal,
 * and the FastAPI backend. Keep them free of framework-specific imports so they
 * can be consumed anywhere.
 *
 * Domain rule: Moi and Finance types are kept in separate namespaces below and
 * must never be mixed. Common auth/subscription types are shared by both.
 */

// ---------------------------------------------------------------------------
// Common — auth, users, subscriptions (shared by Moi and Finance)
// ---------------------------------------------------------------------------

export type ISODateString = string;

export interface AuthTokens {
  accessToken: string;
  tokenType: 'bearer';
  expiresIn: number;
}

export interface UserProfile {
  id: string;
  phone: string;
  name: string | null;
  createdAt: ISODateString;
  isVerified: boolean;
}

export type SubscriptionPlanId =
  | 'free'
  | 'monthly'
  | 'quarterly'
  | 'half_yearly'
  | 'yearly';

export type SubscriptionStatus =
  | 'active'
  | 'expired'
  | 'in_grace_period'
  | 'cancelled'
  | 'none';

export interface SubscriptionState {
  planId: SubscriptionPlanId;
  status: SubscriptionStatus;
  isPremium: boolean;
  expiresAt: ISODateString | null;
  willRenew: boolean;
}

// ---------------------------------------------------------------------------
// Moi domain (events, entries, people, villages, reports)
// ---------------------------------------------------------------------------

export namespace Moi {
  export type EntryDirection = 'IN' | 'OUT';

  export interface EventSummary {
    id: string;
    name: string;
    date: ISODateString | null;
  }
}

// ---------------------------------------------------------------------------
// Finance domain (credits, loans, business, transactions)
// ---------------------------------------------------------------------------

export namespace Finance {
  export type CreditDirection = 'IN' | 'OUT';
  export type LoanStatus = 'ACTIVE' | 'CLOSED';

  export interface FinanceSummary {
    totalOutstanding: number;
    activeLoans: number;
  }
}
