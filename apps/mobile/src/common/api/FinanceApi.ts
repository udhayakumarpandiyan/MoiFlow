/**
 * Finance cloud-sync API client.
 *
 * Thin wrapper over the backend /api/finance/* push/pull endpoints. Kept in a
 * separate module from MoiApi so the two domains stay decoupled on the client
 * too. Cloud sync is premium + best-effort; SQLite stays authoritative offline.
 */

import { apiRequest } from './ApiClient';
import type { SyncRecord, SyncPushResult } from './MoiApi';

interface PullResponse {
  records: SyncRecord[];
}

const pushBody = (records: SyncRecord[]) => JSON.stringify({ records });

export const pushFinanceCredits = (records: SyncRecord[]) =>
  apiRequest<SyncPushResult>(
    '/api/finance/credits/push',
    { method: 'POST', body: pushBody(records) },
    true,
  );

export const pullFinanceCredits = () =>
  apiRequest<PullResponse>('/api/finance/credits/pull', { method: 'GET' }, true).then(
    r => r.records,
  );

export const pushFinanceLoans = (records: SyncRecord[]) =>
  apiRequest<SyncPushResult>(
    '/api/finance/loans/push',
    { method: 'POST', body: pushBody(records) },
    true,
  );

export const pullFinanceLoans = () =>
  apiRequest<PullResponse>('/api/finance/loans/pull', { method: 'GET' }, true).then(
    r => r.records,
  );

export const pushFinanceBusiness = (records: SyncRecord[]) =>
  apiRequest<SyncPushResult>(
    '/api/finance/business/push',
    { method: 'POST', body: pushBody(records) },
    true,
  );

export const pullFinanceBusiness = () =>
  apiRequest<PullResponse>('/api/finance/business/pull', { method: 'GET' }, true).then(
    r => r.records,
  );
