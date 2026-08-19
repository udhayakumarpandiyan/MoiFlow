import { SyncQueue } from '../../models/SyncQueue';

export interface ISyncQueueRepository {
  add(item: SyncQueue): Promise<void>;

  getPending(): Promise<SyncQueue[]>;

  remove(id: string): Promise<void>;

  updateRetry(
    id: string,
    retryCount: number,
    lastError?: string,
  ): Promise<void>;

  clear(): Promise<void>;
}