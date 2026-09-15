/**
 * Moi cloud-sync API client.
 *
 * Thin wrapper over the backend /api/moi/* push/pull endpoints. Cloud sync is a
 * premium, best-effort mirror — the app's SQLite stays authoritative offline.
 * Records are identified by `client_id` (the SQLite row id).
 */

import { apiRequest } from './ApiClient';

export interface SyncRecord {
  client_id: string;
  [key: string]: unknown;
}

export interface SyncPushResult {
  upserted: number;
  skipped: number;
}

interface PullResponse {
  records: SyncRecord[];
}

const pushBody = (records: SyncRecord[]) => JSON.stringify({ records });

export const pushMoiEvents = (records: SyncRecord[]) =>
  apiRequest<SyncPushResult>(
    '/api/moi/events/push',
    { method: 'POST', body: pushBody(records) },
    true,
  );

export const pullMoiEvents = () =>
  apiRequest<PullResponse>('/api/moi/events/pull', { method: 'GET' }, true).then(
    r => r.records,
  );

export const pushMoiEntries = (records: SyncRecord[]) =>
  apiRequest<SyncPushResult>(
    '/api/moi/entries/push',
    { method: 'POST', body: pushBody(records) },
    true,
  );

export const pullMoiEntries = () =>
  apiRequest<PullResponse>('/api/moi/entries/pull', { method: 'GET' }, true).then(
    r => r.records,
  );
