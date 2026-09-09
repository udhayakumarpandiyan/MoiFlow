/**
 * FirebaseSyncService — Premium-gated cloud backup + multi-device sync.
 *
 * This is a NET-NEW capability layered on the existing architecture:
 *  - SQLite remains the primary, offline-first store.
 *  - The existing `sync_queue` table is reused as the change feed (it is already
 *    populated by EntryService on create/update/delete).
 *  - Firebase (Firestore) is used only as the cloud mirror + cross-device sync.
 *  - Google Play remains the subscription AUTHORITY; sync is gated behind the
 *    MultiDeviceSync / CloudBackup entitlements.
 *
 * RESILIENCE
 *  - @react-native-firebase/* are native modules that may not be installed or
 *    configured (no google-services.json) yet. Every method degrades
 *    gracefully: it detects availability and returns a typed, non-throwing
 *    result instead of crashing the app.
 *  - No Firebase Admin credentials, service-account keys, or secrets live in
 *    the app. Client access is governed by Firebase Auth + Firestore security
 *    rules (see the final report for the recommended rules).
 */

import type { ISyncQueueRepository } from '../repository/interfaces/ISyncQueueRepository';
import { assertPremiumFeature, hasPremiumFeature } from './featureGuard';
import { PremiumFeature } from './subscriptionConfig';

export type SyncStatus =
  | 'ok'
  | 'not_premium'
  | 'firebase_unavailable'
  | 'not_signed_in'
  | 'nothing_to_sync'
  | 'error';

export interface SyncResult {
  status: SyncStatus;
  pushed: number;
  message?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FirestoreModule = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AuthModule = any;

export class FirebaseSyncService {
  private _firestore: FirestoreModule | null | undefined;
  private _auth: AuthModule | null | undefined;

  constructor(
    private readonly syncQueueRepo: ISyncQueueRepository,
    private readonly getUserId: () => Promise<string | null>,
  ) {}

  /** True when the Firebase native modules are present in this build. */
  isFirebaseAvailable(): boolean {
    return this.firestore() != null && this.auth() != null;
  }

  /**
   * Whether cloud sync can run right now: requires Premium + Firebase present.
   * Non-throwing — for UI enablement checks.
   */
  canSync(): boolean {
    return (
      this.isFirebaseAvailable() &&
      hasPremiumFeature(PremiumFeature.MultiDeviceSync)
    );
  }

  /**
   * Push all pending local changes (from the existing sync_queue) to Firestore.
   * Premium-gated; safe to call even when Firebase is absent.
   */
  async pushPending(): Promise<SyncResult> {
    // Hard gate: Premium is required (throws PremiumRequiredError if not).
    try {
      assertPremiumFeature(PremiumFeature.MultiDeviceSync);
    } catch {
      return { status: 'not_premium', pushed: 0 };
    }

    const firestore = this.firestore();
    if (!firestore) {
      return {
        status: 'firebase_unavailable',
        pushed: 0,
        message: 'Firebase is not installed/configured in this build.',
      };
    }

    const userId = await this.getUserId();
    if (!userId) {
      return { status: 'not_signed_in', pushed: 0 };
    }

    let pending;
    try {
      pending = await this.syncQueueRepo.getPending();
    } catch (err) {
      return {
        status: 'error',
        pushed: 0,
        message: err instanceof Error ? err.message : 'Failed to read sync queue.',
      };
    }
    if (!pending.length) {
      return { status: 'nothing_to_sync', pushed: 0 };
    }

    let pushed = 0;
    try {
      const db = firestore();
      const userDoc = db.collection('users').doc(userId);

      for (const item of pending) {
        const collection = userDoc.collection(pluralize(item.entityType));
        const payload = safeParse(item.payload);

        try {
          if (item.operation === 'DELETE') {
            await collection.doc(item.entityId).delete();
          } else {
            await collection.doc(item.entityId).set(
              {
                ...(payload ?? {}),
                _syncedAt: new Date().toISOString(),
                _op: item.operation,
              },
              { merge: true },
            );
          }
          // Only remove from the queue after a confirmed push.
          await this.syncQueueRepo.remove(item.id);
          pushed += 1;
        } catch (itemErr) {
          // Record the failure + keep the item for a later retry.
          await this.syncQueueRepo.updateRetry(
            item.id,
            item.retryCount + 1,
            itemErr instanceof Error ? itemErr.message : 'push failed',
          );
        }
      }

      return { status: 'ok', pushed };
    } catch (err) {
      return {
        status: 'error',
        pushed,
        message: err instanceof Error ? err.message : 'Sync failed.',
      };
    }
  }

  // -------------------------------------------------------------------------
  // Lazy module resolution
  // -------------------------------------------------------------------------

  private firestore(): FirestoreModule | null {
    if (this._firestore !== undefined) return this._firestore;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('@react-native-firebase/firestore');
      this._firestore = mod.default ?? mod;
    } catch {
      this._firestore = null;
    }
    return this._firestore;
  }

  private auth(): AuthModule | null {
    if (this._auth !== undefined) return this._auth;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('@react-native-firebase/auth');
      this._auth = mod.default ?? mod;
    } catch {
      this._auth = null;
    }
    return this._auth;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pluralize(entityType: string): string {
  if (entityType.endsWith('s')) return entityType;
  if (entityType.endsWith('y')) return `${entityType.slice(0, -1)}ies`;
  return `${entityType}s`;
}

function safeParse(json: string): Record<string, unknown> | null {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}
