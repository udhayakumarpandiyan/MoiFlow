/**
 * Shared cross-app constants.
 *
 * Subscription plan definitions live here so the mobile app, admin portal, and
 * backend agree on plan ids, pricing, and durations. Entitlements are kept
 * configurable — changing a plan here should be the only edit required.
 */

import type { SubscriptionPlanId } from '../types';

export interface PlanDefinition {
  id: SubscriptionPlanId;
  /** Human-readable label. */
  label: string;
  /** Price in INR (paise avoided for readability; 0 for free). */
  priceInr: number;
  /** Billing period length in months (0 for free/no expiry). */
  durationMonths: number;
  /** RevenueCat entitlement identifier this plan grants. */
  entitlement: string;
  /** Google Play product id (empty for free). */
  playProductId: string;
}

/**
 * Configurable plan catalogue. Order matters for display (cheapest first).
 * Free is always first and grants no premium entitlement.
 */
export const SUBSCRIPTION_PLANS: readonly PlanDefinition[] = [
  {
    id: 'free',
    label: 'Free',
    priceInr: 0,
    durationMonths: 0,
    entitlement: '',
    playProductId: '',
  },
  {
    id: 'monthly',
    label: '₹29 / month',
    priceInr: 29,
    durationMonths: 1,
    entitlement: 'premium',
    playProductId: 'moiflow_monthly',
  },
  {
    id: 'quarterly',
    label: '₹79 / 3 months',
    priceInr: 79,
    durationMonths: 3,
    entitlement: 'premium',
    playProductId: 'moiflow_quarterly',
  },
  {
    id: 'half_yearly',
    label: '₹149 / 6 months',
    priceInr: 149,
    durationMonths: 6,
    entitlement: 'premium',
    playProductId: 'moiflow_half_yearly',
  },
  {
    id: 'yearly',
    label: '₹289 / year',
    priceInr: 289,
    durationMonths: 12,
    entitlement: 'premium',
    playProductId: 'moiflow_yearly',
  },
] as const;

/** The entitlement identifier that unlocks premium features. */
export const PREMIUM_ENTITLEMENT = 'premium';

/** Supported app languages. */
export const SUPPORTED_LANGUAGES = ['en', 'ta'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Backend API route prefixes (kept in one place for client/server agreement). */
export const API_PREFIXES = {
  auth: '/api/auth',
  moi: '/api/moi',
  finance: '/api/finance',
  ai: '/api/ai',
  subscriptions: '/api/subscriptions',
  admin: '/api/admin',
  webhooks: '/api/webhooks',
} as const;
