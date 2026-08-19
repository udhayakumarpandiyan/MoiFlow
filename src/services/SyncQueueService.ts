import { SyncQueue } from '../models/SyncQueue';
import { ISyncQueueRepository } from '../repository/interfaces/ISyncQueueRepository';

export class SyncQueueService {
  constructor(
    private readonly syncQueueRepository: ISyncQueueRepository,
  ) {}

  async getPendingItems(): Promise<SyncQueue[]> {
    return this.syncQueueRepository.getPending();
  }

  async removeSyncedItem(id: string): Promise<void> {
    await this.syncQueueRepository.remove(id);
  }

  async updateRetry(
    id: string,
    retryCount: number,
    error?: string,
  ): Promise<void> {
    await this.syncQueueRepository.updateRetry(
      id,
      retryCount,
      error,
    );
  }
}