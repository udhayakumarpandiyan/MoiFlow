import { getDB } from '@common/database/db';
import { IEntitlementRepository } from '@common/repository/interfaces/IEntitlementRepository';
import { EntitlementState, EntitlementSource } from '@common/subscription/types';
import { PlanId } from '@common/subscription/subscriptionConfig';

const ROW_ID = 'current';

/**
 * SQLite-backed cache of the Google Play entitlement snapshot.
 * Uses the single `entitlement_cache` row (id = 'current').
 */
export class EntitlementRepository implements IEntitlementRepository {
  async get(): Promise<EntitlementState | null> {
    const db = await getDB();
    const [result] = await db.executeSql(
      `SELECT * FROM entitlement_cache WHERE id = ? LIMIT 1`,
      [ROW_ID],
    );
    if (result.rows.length === 0) return null;

    const row = result.rows.item(0);
    return {
      isPremium: Number(row.is_premium) === 1,
      planId: (row.plan_id as PlanId) ?? null,
      productId: row.product_id ?? null,
      expiryAt: row.expiry_at ?? null,
      latestPurchaseAt: row.latest_purchase_at ?? null,
      lastVerifiedAt: row.last_verified_at ?? null,
      source: (row.source as EntitlementSource) ?? 'none',
      // A cached row is, by definition, cache-sourced when re-read from disk.
      fromCacheOnly: true,
    };
  }

  async save(state: EntitlementState): Promise<void> {
    const db = await getDB();
    const now = new Date().toISOString();

    // Preserve original created_at if the row already exists.
    const [existing] = await db.executeSql(
      `SELECT created_at FROM entitlement_cache WHERE id = ? LIMIT 1`,
      [ROW_ID],
    );
    const createdAt =
      existing.rows.length > 0 ? existing.rows.item(0).created_at : now;

    await db.executeSql(
      `INSERT OR REPLACE INTO entitlement_cache
         (id, is_premium, plan_id, product_id, purchase_token, expiry_at,
          latest_purchase_at, last_verified_at, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ROW_ID,
        state.isPremium ? 1 : 0,
        state.planId ?? null,
        state.productId ?? null,
        // purchase_token is intentionally NOT part of EntitlementState (it is a
        // billing detail); persist null here. SubscriptionService owns tokens.
        null,
        state.expiryAt ?? null,
        state.latestPurchaseAt ?? null,
        state.lastVerifiedAt ?? null,
        state.source,
        createdAt,
        now,
      ],
    );
  }

  async clear(): Promise<void> {
    const db = await getDB();
    // Removes only the cached entitlement row. User data is untouched.
    await db.executeSql(`DELETE FROM entitlement_cache WHERE id = ?`, [ROW_ID]);
  }
}
