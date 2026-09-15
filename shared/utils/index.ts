/**
 * Shared cross-app utility functions.
 *
 * Framework-agnostic helpers usable by the mobile app and the admin portal.
 * Keep these pure and dependency-free.
 */

import type { SubscriptionPlanId } from '../types';
import { SUBSCRIPTION_PLANS, type PlanDefinition } from '../constants';

/** Look up a plan definition by id. Returns undefined for unknown ids. */
export function getPlan(planId: SubscriptionPlanId): PlanDefinition | undefined {
  return SUBSCRIPTION_PLANS.find(p => p.id === planId);
}

/** Whether a plan id represents a paid (premium) plan. */
export function isPaidPlan(planId: SubscriptionPlanId): boolean {
  return planId !== 'free';
}

/** Format an INR amount for display, e.g. 1500 -> "₹1,500". */
export function formatInr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

/**
 * Normalize an Indian mobile number to the E.164 form (+91XXXXXXXXXX).
 * Accepts inputs with spaces, dashes, a leading 0, or a +91 prefix.
 * Returns null if the result is not a valid 10-digit Indian number.
 */
export function normalizeIndianPhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, '');
  let ten = digits;
  if (ten.length === 12 && ten.startsWith('91')) ten = ten.slice(2);
  if (ten.length === 11 && ten.startsWith('0')) ten = ten.slice(1);
  if (ten.length !== 10 || !/^[6-9]\d{9}$/.test(ten)) return null;
  return `+91${ten}`;
}

/** Clamp a number to an inclusive range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
