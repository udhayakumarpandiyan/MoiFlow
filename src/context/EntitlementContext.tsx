import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';

import { entitlementService } from '../services';
import {
  EntitlementState,
  FREE_ENTITLEMENT,
  PurchaseResult,
  RestoreResult,
  StoreSubscription,
} from '../subscription/types';
import { PremiumFeature } from '../subscription/subscriptionConfig';
import { subscriptionService } from '../services';

// ---------------------------------------------------------------------------
// Context value
// ---------------------------------------------------------------------------

export interface EntitlementContextValue {
  /** Current derived entitlement snapshot. */
  entitlement: EntitlementState;
  /** Convenience flag (entitlement.isPremium). */
  isPremium: boolean;
  /** True while the initial cache load / first refresh is in flight. */
  loading: boolean;
  /** Re-verify against Google Play and update state. */
  refresh: () => Promise<void>;
  /** Non-throwing feature check. */
  canUseFeature: (feature: PremiumFeature) => boolean;
  /** Fetch the purchasable plans (for the paywall). */
  getPlans: () => Promise<StoreSubscription[]>;
  /** Start a purchase for the given product id. */
  purchase: (productId: string) => Promise<PurchaseResult>;
  /** Restore prior purchases. */
  restore: () => Promise<RestoreResult>;
}

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const EntitlementProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [entitlement, setEntitlement] =
    useState<EntitlementState>(FREE_ENTITLEMENT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Subscribe to service-side state changes (e.g. after purchase/restore
    // triggered from the service layer).
    const unsubscribe = entitlementService.subscribe(next => {
      if (mounted) setEntitlement(next);
    });

    (async () => {
      // 1. Load cached entitlement fast (offline-friendly).
      await entitlementService.init();
      if (mounted) setEntitlement(entitlementService.getState());

      // 2. Re-verify against Google Play in the background. Never downgrades on
      //    a transient failure (verifyAndRefresh returns cached state).
      try {
        const fresh = await entitlementService.refresh();
        if (mounted) setEntitlement(fresh);
      } catch {
        /* keep cached state */
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const refresh = useCallback(async () => {
    const fresh = await entitlementService.refresh();
    setEntitlement(fresh);
  }, []);

  const canUseFeature = useCallback(
    (feature: PremiumFeature) => entitlementService.canUseFeature(feature),
    // entitlement is a dep so the callback re-evaluates when it changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entitlement],
  );

  const getPlans = useCallback(
    () => subscriptionService.getAvailablePlans(),
    [],
  );

  const purchase = useCallback(async (productId: string) => {
    const result = await subscriptionService.purchase(productId);
    // Reflect any change immediately.
    setEntitlement(await entitlementService.refresh());
    return result;
  }, []);

  const restore = useCallback(async () => {
    const result = await subscriptionService.restorePurchases();
    setEntitlement(await entitlementService.refresh());
    return result;
  }, []);

  const value = useMemo<EntitlementContextValue>(
    () => ({
      entitlement,
      isPremium: entitlement.isPremium,
      loading,
      refresh,
      canUseFeature,
      getPlans,
      purchase,
      restore,
    }),
    [entitlement, loading, refresh, canUseFeature, getPlans, purchase, restore],
  );

  return (
    <EntitlementContext.Provider value={value}>
      {children}
    </EntitlementContext.Provider>
  );
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useEntitlement = (): EntitlementContextValue => {
  const ctx = useContext(EntitlementContext);
  if (!ctx) {
    throw new Error('useEntitlement must be used within an EntitlementProvider');
  }
  return ctx;
};
