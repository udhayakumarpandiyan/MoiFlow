/**
 * FirebaseSyncService tests — sync permissions + graceful degradation.
 *
 * Firebase native modules are NOT installed in the test env, so the service
 * should report 'firebase_unavailable' rather than crash. We also verify the
 * Premium gate short-circuits before any Firebase work.
 */

import { FirebaseSyncService } from '../../src/subscription/FirebaseSyncService';
import type { ISyncQueueRepository } from '../../src/repository/interfaces/ISyncQueueRepository';
import type { SyncQueue } from '../../src/models/SyncQueue';

// Control what featureGuard reports without loading the DI container.
jest.mock('../../src/subscription/featureGuard', () => {
  return {
    __premium: { value: true },
    assertPremiumFeature: jest.fn(() => {
      if (!(jest.requireMock('../../src/subscription/featureGuard') as any).__premium.value) {
        const err: any = new Error('premium required');
        err.code = 'PREMIUM_REQUIRED';
        throw err;
      }
    }),
    hasPremiumFeature: jest.fn(
      () => (jest.requireMock('../../src/subscription/featureGuard') as any).__premium.value,
    ),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const guardMock = jest.requireMock('../../src/subscription/featureGuard') as any;

class FakeSyncQueueRepo implements ISyncQueueRepository {
  items: SyncQueue[] = [];
  add = jest.fn(async (i: SyncQueue) => {
    this.items.push(i);
  });
  getPending = jest.fn(async () => this.items);
  remove = jest.fn(async (id: string) => {
    this.items = this.items.filter(i => i.id !== id);
  });
  updateRetry = jest.fn(async () => {});
  clear = jest.fn(async () => {
    this.items = [];
  });
}

function build(userId: string | null = 'user-phone-1') {
  const repo = new FakeSyncQueueRepo();
  const svc = new FirebaseSyncService(repo, async () => userId);
  return { svc, repo };
}

beforeEach(() => {
  guardMock.__premium.value = true;
  jest.clearAllMocks();
});

describe('FirebaseSyncService — permissions', () => {
  it('short-circuits to not_premium for Free users', async () => {
    guardMock.__premium.value = false;
    const { svc, repo } = build();
    repo.items.push(sampleItem());
    const result = await svc.pushPending();
    expect(result.status).toBe('not_premium');
    expect(result.pushed).toBe(0);
    // Must not have touched the queue.
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('canSync() is false for Free users even if Firebase were present', () => {
    guardMock.__premium.value = false;
    const { svc } = build();
    expect(svc.canSync()).toBe(false);
  });
});

describe('FirebaseSyncService — graceful degradation', () => {
  it('reports firebase_unavailable when the native modules are absent', async () => {
    const { svc, repo } = build();
    repo.items.push(sampleItem());
    const result = await svc.pushPending();
    expect(result.status).toBe('firebase_unavailable');
    expect(svc.isFirebaseAvailable()).toBe(false);
    // Queue is preserved for a later attempt.
    expect(repo.items).toHaveLength(1);
  });

  it('does not crash when there is no signed-in user (firebase absent path wins first)', async () => {
    const { svc } = build(null);
    const result = await svc.pushPending();
    // Firebase-absent is detected before user check in this build.
    expect(['firebase_unavailable', 'not_signed_in']).toContain(result.status);
  });
});

function sampleItem(): SyncQueue {
  return {
    id: 'q1',
    entityType: 'entry',
    entityId: 'e1',
    operation: 'CREATE',
    payload: JSON.stringify({ id: 'e1', cashAmount: 100 }),
    createdAt: new Date().toISOString(),
    retryCount: 0,
    lastError: null,
  };
}
