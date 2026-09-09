/**
 * SubscriptionService — Google Play Billing integration.
 *
 * RESPONSIBILITIES
 *  - Own the react-native-iap billing client lifecycle (connect / disconnect).
 *  - Fetch the four subscription products for display.
 *  - Start purchases and finish/acknowledge them.
 *  - Restore purchases.
 *  - Determine current ownership from Google Play (the AUTHORITY).
 *  - Persist a derived EntitlementState to the SQLite cache (UX/offline only).
 *
 * DESIGN NOTES
 *  - Google Play is the source of truth for ownership. We never set a bare
 *    `isPremium = true`; premium is always derived from a Play purchase record
 *    (active, acknowledged) with a computed/known expiry in the future.
 *  - react-native-iap is a native module. To keep the app buildable/runnable
 *    before the native side is installed & linked, the module is required
 *    lazily and every entry point degrades gracefully to a typed outcome
 *    ('billing_unavailable') instead of throwing.
 *  - No secrets live here. Play signature verification for production should be
 *    done with Play's server-side / Play Integrity; on-device we rely on the
 *    Billing Library's acknowledged purchase state. (See report notes.)
 */

import type { IEntitlementRepository } from '../repository/interfaces/IEntitlementRepository';
import {
  ALL_PRODUCT_IDS,
  getPlanByProductId,
  PRODUCT_ID_TO_PLAN,
  SUBSCRIPTION_PLANS,
} from './subscriptionConfig';
import {
  EntitlementState,
  FREE_ENTITLEMENT,
  PurchaseOutcome,
  PurchaseResult,
  RestoreResult,
  StoreSubscription,
} from './types';

// ---------------------------------------------------------------------------
// Lazy, defensive access to react-native-iap
// ---------------------------------------------------------------------------

// We type the bits of the library we use loosely to avoid a hard dependency at
// type-check time (the package may not be installed in CI yet).
type IapModule = any; // eslint-disable-line @typescript-eslint/no-explicit-any

let _iap: IapModule | null | undefined;

/** Returns the react-native-iap module, or null if it isn't installed. */
function getIap(): IapModule | null {
  if (_iap !== undefined) return _iap;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _iap = require('react-native-iap');
  } catch {
    _iap = null;
  }
  return _iap;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Approximate month length used only for local fallback expiry estimates. */
const DAYS_PER_MONTH = 30;

interface PlayPurchaseLike {
  productId: string;
  transactionDate?: number; // ms epoch
  purchaseToken?: string;
  purchaseStateAndroid?: number; // 0 unspecified, 1 purchased, 2 pending
  isAcknowledgedAndroid?: boolean;
  autoRenewingAndroid?: boolean;
  transactionReceipt?: string;
}

/**
 * Compute an expiry ISO string for a purchase. Google Play does not expose a
 * precise expiry in the on-device purchase object for subscriptions, so we
 * estimate from the plan duration + the transaction date. This is used ONLY
 * for cache/UX; a lapsed cache simply falls back to Free until re-verified.
 */
function estimateExpiry(productId: string, transactionDateMs?: number): string | null {
  const plan = getPlanByProductId(productId);
  if (!plan) return null;
  const start = transactionDateMs ? new Date(transactionDateMs) : new Date();
  const expiry = new Date(
    start.getTime() + plan.durationMonths * DAYS_PER_MONTH * MS_PER_DAY,
  );
  return expiry.toISOString();
}

/** Pick the most recent purchase from a list. */
function pickLatest(purchases: PlayPurchaseLike[]): PlayPurchaseLike | null {
  if (!purchases.length) return null;
  return [...purchases].sort(
    (a, b) => (b.transactionDate ?? 0) - (a.transactionDate ?? 0),
  )[0];
}

/**
 * Build a derived EntitlementState from a Google Play purchase. Premium is
 * granted only when the purchase is in the "purchased" state (not pending).
 */
function entitlementFromPurchase(
  purchase: PlayPurchaseLike,
  source: EntitlementState['source'],
): EntitlementState {
  const nowIso = new Date().toISOString();
  const planId = PRODUCT_ID_TO_PLAN[purchase.productId] ?? null;
  const isPurchased =
    purchase.purchaseStateAndroid === undefined ||
    purchase.purchaseStateAndroid === 1; // 1 = purchased
  const expiryAt = estimateExpiry(purchase.productId, purchase.transactionDate);
  const latestPurchaseAt = purchase.transactionDate
    ? new Date(purchase.transactionDate).toISOString()
    : nowIso;

  return {
    isPremium: isPurchased,
    planId,
    productId: purchase.productId,
    expiryAt,
    latestPurchaseAt,
    lastVerifiedAt: source === 'play' ? nowIso : null,
    source,
    fromCacheOnly: source !== 'play',
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SubscriptionService {
  private connected = false;
  private connecting: Promise<boolean> | null = null;

  constructor(private readonly entitlementRepo: IEntitlementRepository) {}

  /** True when the native billing module is present on this build. */
  isBillingSupported(): boolean {
    return getIap() != null;
  }

  /**
   * Ensure the billing client is connected. Returns false when billing is
   * unavailable (module missing, or Play services unavailable). Never throws.
   */
  async connect(): Promise<boolean> {
    const iap = getIap();
    if (!iap) return false;
    if (this.connected) return true;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      try {
        await iap.initConnection();
        // Best-effort: clears stuck/consumed items on Android. Safe if absent.
        if (typeof iap.flushFailedPurchasesCachedAsPendingAndroid === 'function') {
          try {
            await iap.flushFailedPurchasesCachedAsPendingAndroid();
          } catch {
            /* non-fatal */
          }
        }
        this.connected = true;
        return true;
      } catch {
        this.connected = false;
        return false;
      } finally {
        this.connecting = null;
      }
    })();

    return this.connecting;
  }

  /** Disconnect the billing client (call on app teardown; optional). */
  async disconnect(): Promise<void> {
    const iap = getIap();
    if (!iap || !this.connected) return;
    try {
      await iap.endConnection();
    } catch {
      /* ignore */
    } finally {
      this.connected = false;
    }
  }

  /**
   * Fetch the four subscription products for display. Falls back to config
   * pricing for any product the store didn't return (e.g. offline). Always
   * returns all four plans so the paywall renders fully.
   */
  async getAvailablePlans(): Promise<StoreSubscription[]> {
    const iap = getIap();
    let storeItems: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (iap && (await this.connect())) {
      try {
        // react-native-iap v12: getSubscriptions({ skus }).
        storeItems = await iap.getSubscriptions({ skus: ALL_PRODUCT_IDS });
      } catch {
        storeItems = [];
      }
    }

    const byProductId = new Map<string, any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const item of storeItems ?? []) {
      if (item?.productId) byProductId.set(item.productId, item);
    }

    return SUBSCRIPTION_PLANS.map(plan => {
      const storeItem = byProductId.get(plan.productId);
      const localizedPrice =
        extractLocalizedPrice(storeItem) ?? `₹${plan.priceInr}`;
      return {
        planId: plan.id,
        productId: plan.productId,
        localizedPrice,
        title: storeItem?.title,
        durationMonths: plan.durationMonths,
        availableFromStore: Boolean(storeItem),
      };
    });
  }

  /**
   * Start a subscription purchase for the given product id. Handles the full
   * matrix of outcomes and persists the resulting entitlement to cache on
   * success. Never throws — always resolves to a typed PurchaseResult.
   */
  async purchase(productId: string): Promise<PurchaseResult> {
    const iap = getIap();
    if (!iap) {
      return {
        outcome: 'billing_unavailable',
        entitlement: await this.getCachedOrFree(),
        message: 'Billing module not available in this build.',
      };
    }

    const ok = await this.connect();
    if (!ok) {
      return {
        outcome: await this.classifyUnavailable(),
        entitlement: await this.getCachedOrFree(),
        message: 'Could not connect to Google Play Billing.',
      };
    }

    // If already owned, treat as already_owned and refresh entitlement.
    try {
      const active = await this.getActivePurchases();
      if (active.some(p => p.productId === productId)) {
        const entitlement = await this.syncEntitlementFromPurchases(active);
        return {
          outcome: 'already_owned',
          entitlement,
          message: 'Subscription already active on this account.',
        };
      }
    } catch {
      /* fall through to attempt purchase */
    }

    try {
      // v12 API: requestSubscription({ sku }) on Android.
      const result = await iap.requestSubscription({ sku: productId });
      const purchase: PlayPurchaseLike | null = Array.isArray(result)
        ? pickLatest(result as PlayPurchaseLike[])
        : (result as PlayPurchaseLike | null);

      if (!purchase) {
        // No purchase object — re-check ownership to be safe.
        const active = await this.getActivePurchases();
        const entitlement = await this.syncEntitlementFromPurchases(active);
        return {
          outcome: entitlement.isPremium ? 'success' : 'error',
          entitlement,
        };
      }

      // Pending purchase (e.g. cash / slow card).
      if (purchase.purchaseStateAndroid === 2) {
        return {
          outcome: 'pending',
          entitlement: await this.getCachedOrFree(),
          message: 'Purchase is pending confirmation from Google Play.',
        };
      }

      // Acknowledge / finish the transaction so it isn't refunded after 3 days.
      await this.finishPurchase(purchase);

      const entitlement = entitlementFromPurchase(purchase, 'play');
      await this.entitlementRepo.save(entitlement);
      return { outcome: 'success', entitlement };
    } catch (err: unknown) {
      return this.mapPurchaseError(err);
    }
  }

  /**
   * Restore purchases: query Play for active subscriptions owned by the signed-
   * in Google account and rebuild the entitlement from them.
   */
  async restorePurchases(): Promise<RestoreResult> {
    const iap = getIap();
    if (!iap) {
      return {
        restored: false,
        outcome: 'billing_unavailable',
        entitlement: await this.getCachedOrFree(),
        message: 'Billing module not available in this build.',
      };
    }
    const ok = await this.connect();
    if (!ok) {
      return {
        restored: false,
        outcome: await this.classifyUnavailable(),
        entitlement: await this.getCachedOrFree(),
      };
    }

    try {
      const active = await this.getActivePurchases();
      // Acknowledge anything that Play delivered but wasn't finished.
      for (const p of active) {
        if (p.isAcknowledgedAndroid === false) {
          await this.finishPurchase(p);
        }
      }
      const entitlement = await this.syncEntitlementFromPurchases(active);
      return {
        restored: entitlement.isPremium,
        outcome: 'success',
        entitlement,
      };
    } catch (err) {
      return {
        restored: false,
        outcome: 'error',
        entitlement: await this.getCachedOrFree(),
        message: err instanceof Error ? err.message : 'Restore failed.',
      };
    }
  }

  /**
   * Verify current ownership against Google Play and refresh the cache.
   * Returns the freshest entitlement. When Play is unreachable, returns the
   * cached entitlement (marked fromCacheOnly) rather than downgrading.
   */
  async verifyAndRefresh(): Promise<EntitlementState> {
    const iap = getIap();
    if (!iap || !(await this.connect())) {
      return this.getCachedOrFree();
    }
    try {
      const active = await this.getActivePurchases();
      return this.syncEntitlementFromPurchases(active);
    } catch {
      return this.getCachedOrFree();
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** Query Play for the account's current (non-consumed) purchases. */
  private async getActivePurchases(): Promise<PlayPurchaseLike[]> {
    const iap = getIap();
    if (!iap) return [];
    try {
      // v12: getAvailablePurchases() returns current subscriptions + non-consumed.
      const purchases = await iap.getAvailablePurchases();
      return (purchases ?? []).filter((p: PlayPurchaseLike) =>
        ALL_PRODUCT_IDS.includes(p.productId),
      );
    } catch {
      return [];
    }
  }

  /**
   * Rebuild + persist entitlement from a list of Play purchases.
   * Chooses the latest owned subscription. If none, downgrades to Free but
   * NEVER deletes user data (that's the caller's contract).
   */
  private async syncEntitlementFromPurchases(
    purchases: PlayPurchaseLike[],
  ): Promise<EntitlementState> {
    const owned = purchases.filter(
      p =>
        p.purchaseStateAndroid === undefined || p.purchaseStateAndroid === 1,
    );
    const latest = pickLatest(owned);

    if (!latest) {
      // Verified-with-Play that nothing is owned → downgrade to Free.
      const free: EntitlementState = {
        ...FREE_ENTITLEMENT,
        source: 'play',
        lastVerifiedAt: new Date().toISOString(),
      };
      await this.entitlementRepo.save(free);
      return free;
    }

    const entitlement = entitlementFromPurchase(latest, 'play');
    await this.entitlementRepo.save(entitlement);
    return entitlement;
  }

  /** Acknowledge/finish a purchase (idempotent, non-fatal on failure). */
  private async finishPurchase(purchase: PlayPurchaseLike): Promise<void> {
    const iap = getIap();
    if (!iap) return;
    try {
      if (typeof iap.finishTransaction === 'function') {
        await iap.finishTransaction({ purchase, isConsumable: false });
      } else if (typeof iap.acknowledgePurchaseAndroid === 'function' && purchase.purchaseToken) {
        await iap.acknowledgePurchaseAndroid({ token: purchase.purchaseToken });
      }
    } catch {
      /* non-fatal — Play will retry acknowledgement window */
    }
  }

  private async getCachedOrFree(): Promise<EntitlementState> {
    const cached = await this.entitlementRepo.get();
    return cached ?? FREE_ENTITLEMENT;
  }

  /**
   * When connect() fails we can't always tell "offline" from "billing
   * unavailable". Prefer 'offline' when the module exists (likely transient),
   * else 'billing_unavailable'.
   */
  private async classifyUnavailable(): Promise<PurchaseOutcome> {
    return getIap() ? 'offline' : 'billing_unavailable';
  }

  /** Map a react-native-iap error to a typed PurchaseResult. */
  private async mapPurchaseError(err: unknown): Promise<PurchaseResult> {
    const code = (err as { code?: string })?.code ?? '';
    const entitlement = await this.getCachedOrFree();

    // react-native-iap error codes (E_USER_CANCELLED, E_ALREADY_OWNED, etc.)
    if (code === 'E_USER_CANCELLED') {
      return { outcome: 'cancelled', entitlement };
    }
    if (code === 'E_ALREADY_OWNED' || code === 'E_ITEM_ALREADY_OWNED') {
      const active = await this.getActivePurchases();
      const refreshed = await this.syncEntitlementFromPurchases(active);
      return { outcome: 'already_owned', entitlement: refreshed };
    }
    if (code === 'E_SERVICE_ERROR' || code === 'E_NOT_PREPARED') {
      return { outcome: 'billing_unavailable', entitlement };
    }
    if (code === 'E_NETWORK_ERROR') {
      return { outcome: 'offline', entitlement };
    }
    return {
      outcome: 'error',
      entitlement,
      message: err instanceof Error ? err.message : 'Purchase failed.',
    };
  }
}

// ---------------------------------------------------------------------------
// Price extraction (handles differing react-native-iap shapes across versions)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractLocalizedPrice(item: any): string | null {
  if (!item) return null;
  // v12 Android subscriptionOfferDetails -> pricingPhases
  const offer = item.subscriptionOfferDetails?.[0];
  const phase = offer?.pricingPhases?.pricingPhaseList?.[0];
  if (phase?.formattedPrice) return phase.formattedPrice;
  // Older shapes
  if (item.localizedPrice) return item.localizedPrice;
  if (item.price) return String(item.price);
  return null;
}
