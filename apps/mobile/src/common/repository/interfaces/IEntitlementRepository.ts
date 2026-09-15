import { EntitlementState } from '@common/subscription/types';

/**
 * Persists a single cached snapshot of the user's Google Play subscription
 * entitlement for offline / fast-start UX.
 *
 * This cache is NEVER treated as proof of purchase — SubscriptionService
 * re-verifies ownership against Google Play whenever billing is reachable.
 */
export interface IEntitlementRepository {
  /** Read the cached entitlement, or null if nothing has been cached yet. */
  get(): Promise<EntitlementState | null>;
  /** Upsert the cached entitlement snapshot. */
  save(state: EntitlementState): Promise<void>;
  /** Clear the cache (does NOT touch any user data). */
  clear(): Promise<void>;
}
