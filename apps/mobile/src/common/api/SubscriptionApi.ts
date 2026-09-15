/**
 * Subscription API client.
 *
 * The backend (fed by RevenueCat webhooks) is the cross-device source of truth
 * for subscription status. The app links its RevenueCat app_user_id and reads
 * authoritative status here. No store secrets are involved — only the user's
 * bearer token.
 */

import { apiRequest } from './ApiClient';

export interface BackendSubscription {
  plan_id: string;
  status: string;
  is_premium: boolean;
  entitlement: string;
  store: string | null;
  product_id: string | null;
  will_renew: boolean;
  expires_at: string | null;
}

/** Fetch the authenticated user's subscription state from the backend. */
export async function fetchMySubscription(): Promise<BackendSubscription> {
  return apiRequest<BackendSubscription>(
    '/api/subscriptions/me',
    { method: 'GET' },
    true,
  );
}

/**
 * Associate the user's RevenueCat app_user_id with their backend account so
 * incoming RevenueCat webhooks can be mapped to this user. Idempotent.
 */
export async function linkRevenueCatCustomer(
  appUserId: string,
  originalAppUserId?: string,
): Promise<BackendSubscription> {
  return apiRequest<BackendSubscription>(
    '/api/subscriptions/link',
    {
      method: 'POST',
      body: JSON.stringify({
        app_user_id: appUserId,
        original_app_user_id: originalAppUserId ?? null,
      }),
    },
    true,
  );
}
