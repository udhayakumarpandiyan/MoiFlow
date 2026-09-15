/**
 * RevenueCatService — subscription purchases + status via RevenueCat.
 *
 * RESPONSIBILITIES
 *  - Own the react-native-purchases (RevenueCat) SDK lifecycle (configure).
 *  - Fetch offerings/packages for the paywall.
 *  - Start purchases and restore purchases.
 *  - Read CustomerInfo and derive an EntitlementState.
 *  - Link the RevenueCat app_user_id to the backend so webhooks map to the user.
 *  - Persist the derived EntitlementState to the SQLite cache (offline/UX).
 *
 * DESIGN NOTES
 *  - RevenueCat is the billing/entitlement authority on-device; the backend
 *    (fed by RevenueCat webhooks) is the cross-device source of truth. We
 *    reconcile the two: whichever says premium wins for granting access, and
 *    the backend value is preferred when both are present.
 *  - The RevenueCat *public SDK key* (goog_...) is safe to ship in the app.
 *    The REST/secret key stays server-side only.
 *  - Like the old SubscriptionService, the native module is required LAZILY so
 *    the app still builds/runs before react-native-purchases is installed &
 *    linked. Every entry point degrades to a typed outcome, never throws.
 *  - We set the RevenueCat app_user_id to the MoiFlow user id (or phone) so the
 *    backend can map webhook app_user_id -> user without a lookup table.
 */

import type { IEntitlementRepository } from '@common/repository/interfaces/IEntitlementRepository';
import { REVENUECAT_PUBLIC_SDK_KEY, PREMIUM_ENTITLEMENT_ID } from './revenueCatConfig';
import { PRODUCT_ID_TO_PLAN, SUBSCRIPTION_PLANS } from './subscriptionConfig';
import {
  EntitlementState,
  FREE_ENTITLEMENT,
  PurchaseOutcome,
  PurchaseResult,
  RestoreResult,
  StoreSubscription,
} from './types';
import { fetchMySubscription, linkRevenueCatCustomer } from '@common/api/SubscriptionApi';

// ---------------------------------------------------------------------------
// Lazy, defensive access to react-native-purchases
// ---------------------------------------------------------------------------

type PurchasesModule = any; // eslint-disable-line @typescript-eslint/no-explicit-any

let _purchases: PurchasesModule | null | undefined;

function getPurchases(): PurchasesModule | null {
  if (_purchases !== undefined) return _purchases;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-purchases');
    _purchases = mod?.default ?? mod;
  } catch {
    _purchases = null;
  }
  return _purchases;
}

// ---------------------------------------------------------------------------
// CustomerInfo -> EntitlementState
// ---------------------------------------------------------------------------

/** RevenueCat CustomerInfo (loosely typed to avoid a hard dep at compile time). */
interface CustomerInfoLike {
  entitlements?: {
    active?: Record<string, EntitlementInfoLike>;
  };
  originalAppUserId?: string;
}

interface EntitlementInfoLike {
  identifier?: string;
  isActive?: boolean;
  productIdentifier?: string;
  latestPurchaseDate?: string;
  expirationDate?: string | null;
  willRenew?: boolean;
  store?: string;
}

function entitlementFromCustomerInfo(info: CustomerInfoLike): EntitlementState {
  const active = info.entitlements?.active ?? {};
  const premium = active[PREMIUM_ENTITLEMENT_ID];

  if (!premium || premium.isActive === false) {
    return {
      ...FREE_ENTITLEMENT,
      isPremium: false,
      source: 'play',
      lastVerifiedAt: new Date().toISOString(),
    };
  }

  const productId = premium.productIdentifier ?? null;
  const planId = productId ? PRODUCT_ID_TO_PLAN[productId] ?? null : null;

  return {
    isPremium: true,
    planId,
    productId,
    expiryAt: premium.expirationDate ?? null,
    latestPurchaseAt: premium.latestPurchaseDate ?? null,
    lastVerifiedAt: new Date().toISOString(),
    source: 'play',
    fromCacheOnly: false,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

import type { IBillingService } from './IBillingService';

export class RevenueCatService implements IBillingService {
  private configured = false;
  private appUserId: string | null = null;

  constructor(private readonly entitlementRepo: IEntitlementRepository) {}

  /** True when the native RevenueCat module is present on this build. */
  isBillingSupported(): boolean {
    return getPurchases() != null;
  }

  /**
   * Configure the RevenueCat SDK with the user id. Safe to call more than once;
   * a changed user id triggers logIn. Never throws — returns false when the
   * native module is unavailable.
   */
  async configure(appUserId: string): Promise<boolean> {
    const Purchases = getPurchases();
    if (!Purchases) return false;

    try {
      if (!this.configured) {
        Purchases.configure({
          apiKey: REVENUECAT_PUBLIC_SDK_KEY,
          appUserID: appUserId,
        });
        this.configured = true;
        this.appUserId = appUserId;
      } else if (this.appUserId !== appUserId) {
        await Purchases.logIn(appUserId);
        this.appUserId = appUserId;
      }

      // Link the RevenueCat app_user_id to the backend (best-effort).
      try {
        await linkRevenueCatCustomer(appUserId);
      } catch {
        /* backend link is best-effort; webhook can still map by app_user_id */
      }
      return true;
    } catch {
      this.configured = false;
      return false;
    }
  }

  /**
   * Build the paywall plan list from RevenueCat offerings, falling back to the
   * configured plans for pricing when offerings are unavailable (offline).
   */
  async getAvailablePlans(): Promise<StoreSubscription[]> {
    const Purchases = getPurchases();
    const byProductId = new Map<string, { price: string; title?: string }>();

    if (Purchases) {
      try {
        const offerings = await Purchases.getOfferings();
        const packages = offerings?.current?.availablePackages ?? [];
        for (const pkg of packages) {
          const product = pkg?.product;
          if (product?.identifier) {
            byProductId.set(product.identifier, {
              price: product.priceString ?? '',
              title: product.title,
            });
          }
        }
      } catch {
        /* fall back to config pricing */
      }
    }

    return SUBSCRIPTION_PLANS.map(plan => {
      const store = byProductId.get(plan.productId);
      return {
        planId: plan.id,
        productId: plan.productId,
        localizedPrice: store?.price || `₹${plan.priceInr}`,
        title: store?.title,
        durationMonths: plan.durationMonths,
        availableFromStore: Boolean(store),
      };
    });
  }

  /**
   * Purchase a plan by its Google Play product id. Locates the matching
   * RevenueCat package in the current offering and purchases it.
   */
  async purchase(productId: string): Promise<PurchaseResult> {
    const Purchases = getPurchases();
    if (!Purchases) {
      return {
        outcome: 'billing_unavailable',
        entitlement: await this.getCachedOrFree(),
        message: 'Billing module not available in this build.',
      };
    }

    try {
      const offerings = await Purchases.getOfferings();
      const packages = offerings?.current?.availablePackages ?? [];
      const pkg = packages.find(
        (p: any) => p?.product?.identifier === productId,
      );
      if (!pkg) {
        return {
          outcome: 'error',
          entitlement: await this.getCachedOrFree(),
          message: 'Selected plan is not available from the store.',
        };
      }

      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const entitlement = entitlementFromCustomerInfo(customerInfo);
      await this.entitlementRepo.save(entitlement);
      return {
        outcome: entitlement.isPremium ? 'success' : 'error',
        entitlement,
      };
    } catch (err: unknown) {
      return this.mapPurchaseError(err);
    }
  }

  /** Restore purchases from the store account. */
  async restorePurchases(): Promise<RestoreResult> {
    const Purchases = getPurchases();
    if (!Purchases) {
      return {
        restored: false,
        outcome: 'billing_unavailable',
        entitlement: await this.getCachedOrFree(),
        message: 'Billing module not available in this build.',
      };
    }
    try {
      const customerInfo = await Purchases.restorePurchases();
      const entitlement = entitlementFromCustomerInfo(customerInfo);
      await this.entitlementRepo.save(entitlement);
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
   * Verify current entitlement. Reads RevenueCat CustomerInfo AND the backend
   * status, reconciles them (premium if either is premium; backend preferred
   * for plan/expiry), and refreshes the cache. Falls back to cache when both
   * are unreachable — never downgrades on a transient failure.
   */
  async verifyAndRefresh(): Promise<EntitlementState> {
    const fromRc = await this.readRevenueCat();
    const fromBackend = await this.readBackend();

    if (!fromRc && !fromBackend) {
      return this.getCachedOrFree();
    }

    const merged = this.reconcile(fromRc, fromBackend);
    await this.entitlementRepo.save(merged);
    return merged;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async readRevenueCat(): Promise<EntitlementState | null> {
    const Purchases = getPurchases();
    if (!Purchases) return null;
    try {
      const info = await Purchases.getCustomerInfo();
      return entitlementFromCustomerInfo(info);
    } catch {
      return null;
    }
  }

  private async readBackend(): Promise<EntitlementState | null> {
    try {
      const s = await fetchMySubscription();
      return {
        isPremium: s.is_premium,
        planId: (s.product_id && PRODUCT_ID_TO_PLAN[s.product_id]) || null,
        productId: s.product_id,
        expiryAt: s.expires_at,
        latestPurchaseAt: null,
        lastVerifiedAt: new Date().toISOString(),
        source: 'play',
        fromCacheOnly: false,
      };
    } catch {
      return null;
    }
  }

  /** Premium if either source is premium; backend preferred for details. */
  private reconcile(
    rc: EntitlementState | null,
    backend: EntitlementState | null,
  ): EntitlementState {
    const isPremium = Boolean(rc?.isPremium || backend?.isPremium);
    const primary = backend?.isPremium ? backend : rc?.isPremium ? rc : backend ?? rc!;
    return {
      ...primary,
      isPremium,
      lastVerifiedAt: new Date().toISOString(),
      fromCacheOnly: false,
    };
  }

  private async getCachedOrFree(): Promise<EntitlementState> {
    const cached = await this.entitlementRepo.get();
    return cached ?? FREE_ENTITLEMENT;
  }

  private async mapPurchaseError(err: unknown): Promise<PurchaseResult> {
    const entitlement = await this.getCachedOrFree();
    const e = err as { userCancelled?: boolean; code?: string; message?: string };

    if (e?.userCancelled) {
      return { outcome: 'cancelled', entitlement };
    }
    const outcome: PurchaseOutcome = 'error';
    return {
      outcome,
      entitlement,
      message: e?.message ?? 'Purchase failed.',
    };
  }
}
