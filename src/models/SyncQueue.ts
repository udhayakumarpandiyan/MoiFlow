export interface SyncQueue {
  id: string;
  entityType: string;
  entityId: string;
  operation: string;
  payload: string;
  createdAt: string;
  retryCount: number;
  lastError: string | null;
}