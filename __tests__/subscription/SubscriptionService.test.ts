/**
 * SubscriptionService tests.
 *
 * Covers the purchase-state matrix + restore + degrade-when-unavailable.
 * react-native-iap is mocked; the service requires it lazily via require(),
 * so jest.mock('react-native-iap', ...) is picked up.
 */

import type { IEntitlementRepository } from '../../src/repository/interfaces/IEntitlementRepository';
import type { EntitlementState } from '../../src/subscription/types';

// --- Mock react-native-iap -------------------------------------------------
// Prefixed with `mock` so jest.mock's factory is allowed to reference it.
const mockIap = {
  initConnection: jest.fn<Promise<boolean>, any[]>(async () => true),
  endConnection: jest.fn<Promise<boolean>, any[]>(async () => true),
  flushFailedPurchasesCachedAsPendingAndroid: jest.fn<Promise<void>, any[]>(async () => {}),
  getSubscriptions: jest.fn<Promise<any[]>, any[]>(async () => []),
  requestSubscription: jest.fn<Promise<any>, any[]>(),
  getAvailablePurchases: jest.fn<Promise<any[]>, any[]>(async () => []),
  finishTransaction: jest.fn<Promise<void>, any[]>(async () => {}),
};

jest.mock('react-native-iap', () => mockIap, { virtual: true });

// Import AFTER the mock is registered.
import { SubscriptionService } from '../../src/subscription/SubscriptionService';
import { PRODUCT_IDS } from '../../src/subscription/subscriptionConfig';

class FakeEntitlementRepo implements IEntitlementRepository {
  state: EntitlementState | null = null;
  async get() {
    return this.state;
  }
  async save(s: EntitlementState) {
    this.state = s;
  }
  async clear() {
    this.state = null;
  }
}

function build() {
  const repo = new FakeEntitlementRepo();
  const svc = new SubscriptionService(repo);
  return { svc, repo };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIap.initConnection.mockResolvedValue(true);
  mockIap.getAvailablePurchases.mockResolvedValue([]);
  mockIap.getSubscriptions.mockResolvedValue([]);
});

describe('SubscriptionService — plans', () => {
  it('always returns all four plans, using config fallback pricing offline', async () => {
    const { svc } = build();
    const plans = await svc.getAvailablePlans();
    expect(plans).toHaveLength(4);
    const monthly = plans.find(p => p.productId === PRODUCT_IDS.monthly)!;
    expect(monthly.localizedPrice).toBe('₹29');
    expect(monthly.availableFromStore).toBe(false);
  });

  it('uses the store price when available', async () => {
    const { svc } = build();
    mockIap.getSubscriptions.mockResolvedValueOnce([
      {
        productId: PRODUCT_IDS.yearly,
        subscriptionOfferDetails: [
          { pricingPhases: { pricingPhaseList: [{ formattedPrice: '₹289.00' }] } },
        ],
      },
    ]);
    const plans = await svc.getAvailablePlans();
    const yearly = plans.find(p => p.productId === PRODUCT_IDS.yearly)!;
    expect(yearly.localizedPrice).toBe('₹289.00');
    expect(yearly.availableFromStore).toBe(true);
  });
});

describe('SubscriptionService — purchase outcomes', () => {
  it('success: acknowledges, caches, and returns premium entitlement', async () => {
    const { svc, repo } = build();
    mockIap.requestSubscription.mockResolvedValueOnce({
      productId: PRODUCT_IDS.monthly,
      transactionDate: Date.now(),
      purchaseStateAndroid: 1,
      purchaseToken: 'tok-123',
    });
    const result = await svc.purchase(PRODUCT_IDS.monthly);
    expect(result.outcome).toBe('success');
    expect(result.entitlement.isPremium).toBe(true);
    expect(mockIap.finishTransaction).toHaveBeenCalled();
    expect(repo.state?.isPremium).toBe(true);
    expect(repo.state?.source).toBe('play');
  });

  it('pending: returns pending and does NOT grant premium', async () => {
    const { svc } = build();
    mockIap.requestSubscription.mockResolvedValueOnce({
      productId: PRODUCT_IDS.monthly,
      purchaseStateAndroid: 2, // pending
    });
    const result = await svc.purchase(PRODUCT_IDS.monthly);
    expect(result.outcome).toBe('pending');
    expect(result.entitlement.isPremium).toBe(false);
    expect(mockIap.finishTransaction).not.toHaveBeenCalled();
  });

  it('cancelled: maps E_USER_CANCELLED', async () => {
    const { svc } = build();
    mockIap.requestSubscription.mockRejectedValueOnce({ code: 'E_USER_CANCELLED' });
    const result = await svc.purchase(PRODUCT_IDS.monthly);
    expect(result.outcome).toBe('cancelled');
  });

  it('already_owned: detected before purchase when the sub is active', async () => {
    const { svc } = build();
    mockIap.getAvailablePurchases.mockResolvedValueOnce([
      { productId: PRODUCT_IDS.monthly, purchaseStateAndroid: 1, transactionDate: Date.now() },
    ]);
    const result = await svc.purchase(PRODUCT_IDS.monthly);
    expect(result.outcome).toBe('already_owned');
    expect(result.entitlement.isPremium).toBe(true);
    expect(mockIap.requestSubscription).not.toHaveBeenCalled();
  });

  it('offline: maps E_NETWORK_ERROR', async () => {
    const { svc } = build();
    mockIap.requestSubscription.mockRejectedValueOnce({ code: 'E_NETWORK_ERROR' });
    const result = await svc.purchase(PRODUCT_IDS.monthly);
    expect(result.outcome).toBe('offline');
  });

  it('billing_unavailable: when connect fails via E_SERVICE_ERROR', async () => {
    const { svc } = build();
    mockIap.requestSubscription.mockRejectedValueOnce({ code: 'E_SERVICE_ERROR' });
    const result = await svc.purchase(PRODUCT_IDS.monthly);
    expect(result.outcome).toBe('billing_unavailable');
  });
});

describe('SubscriptionService — restore', () => {
  it('restores an active subscription and grants premium', async () => {
    const { svc, repo } = build();
    mockIap.getAvailablePurchases.mockResolvedValueOnce([
      {
        productId: PRODUCT_IDS.yearly,
        purchaseStateAndroid: 1,
        transactionDate: Date.now(),
        isAcknowledgedAndroid: true,
      },
    ]);
    const result = await svc.restorePurchases();
    expect(result.restored).toBe(true);
    expect(result.entitlement.isPremium).toBe(true);
    expect(repo.state?.planId).toBe('yearly');
  });

  it('restore with no purchases → not restored, downgrades to Free (verified)', async () => {
    const { svc, repo } = build();
    mockIap.getAvailablePurchases.mockResolvedValueOnce([]);
    const result = await svc.restorePurchases();
    expect(result.restored).toBe(false);
    expect(result.entitlement.isPremium).toBe(false);
    // Verified-with-Play downgrade is persisted with source 'play'.
    expect(repo.state?.source).toBe('play');
  });
});

describe('SubscriptionService — verifyAndRefresh', () => {
  it('returns cached state when Play is unreachable (never downgrades)', async () => {
    const { svc, repo } = build();
    repo.state = {
      isPremium: true,
      planId: 'monthly',
      productId: PRODUCT_IDS.monthly,
      expiryAt: new Date(Date.now() + 86_400_000).toISOString(),
      latestPurchaseAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      source: 'cache',
      fromCacheOnly: true,
    };
    mockIap.initConnection.mockRejectedValueOnce(new Error('no play services'));
    const state = await svc.verifyAndRefresh();
    expect(state.isPremium).toBe(true);
    expect(state.source).toBe('cache');
  });
});
