/**
 * Billing service interface.
 *
 * Abstracts the store/billing provider so the rest of the app (Entitlement
 * service, context, paywall) does not depend on a concrete implementation.
 * Implemented by RevenueCatService (current) and the legacy SubscriptionService
 * (react-native-iap), which lets the provider be swapped without touching
 * consumers.
 */

import {
  EntitlementState,
  PurchaseResult,
  RestoreResult,
  StoreSubscription,
} from './types';

export interface IBillingService {
  /** True when the native billing module is present on this build. */
  isBillingSupported(): boolean;

  /** Fetch plans for the paywall (always returns all configured plans). */
  getAvailablePlans(): Promise<StoreSubscription[]>;

  /** Start a purchase for a store product id. Never throws. */
  purchase(productId: string): Promise<PurchaseResult>;

  /** Restore purchases from the store account. Never throws. */
  restorePurchases(): Promise<RestoreResult>;

  /** Verify ownership and refresh the cached entitlement. Never downgrades on
   *  a transient failure. */
  verifyAndRefresh(): Promise<EntitlementState>;

  /**
   * Optional: configure/associate the billing SDK with a user id (RevenueCat).
   * Legacy providers may not implement this.
   */
  configure?(appUserId: string): Promise<boolean>;
}
