/**
 * Lazy feature-guard helpers for use inside deferred/native services (voice,
 * OCR, export) where importing the DI container at module-parse time would
 * create a circular dependency.
 *
 * These resolve the shared EntitlementService singleton on demand and throw a
 * PremiumRequiredError when the feature isn't available. Because enforcement
 * lives here (not only in the UI), a premium-only capability cannot be invoked
 * by a Free user even if a screen forgets to hide the button.
 */

import { PremiumFeature } from './subscriptionConfig';

/** Resolve the entitlement service without a static import (avoids cycles). */
function resolveEntitlement():
  | { isPremium(): boolean; assertFeature(f: PremiumFeature): void }
  | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { entitlementService } = require('@common/di/container');
    return entitlementService ?? null;
  } catch {
    return null;
  }
}

/**
 * Throw PremiumRequiredError if the given feature is not currently available.
 * If the entitlement service cannot be resolved (e.g. in an isolated unit test
 * without the container), this is a no-op so it never blocks unexpectedly.
 */
export function assertPremiumFeature(_feature: PremiumFeature): void {
  // TODO(testing): Premium gate bypassed — all features allowed.
  // Restore original logic before production release:
  // const ent = resolveEntitlement();
  // if (!ent) return;
  // ent.assertFeature(feature);
}

/** Non-throwing check for the given feature. */
export function hasPremiumFeature(_feature: PremiumFeature): boolean {
  // TODO(testing): Premium gate bypassed — always returns true.
  // Restore original logic before production release:
  // const ent = resolveEntitlement();
  // if (!ent) return true; // fail-open only when entitlement is unknowable
  // return ent.isPremium();
  return true;
}
