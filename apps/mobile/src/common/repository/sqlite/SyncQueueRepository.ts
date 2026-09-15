import { getDB } from '@common/database/db';
import { SyncQueue } from '@common/models/SyncQueue';
import { ISyncQueueRepository } from '@common/repository/interfaces/ISyncQueueRepository';

export class SyncQueueRepository implements ISyncQueueRepository {

  async add(item: SyncQueue): Promise<void> {
    const db = await getDB();

    await db.executeSql(
      `
      INSERT INTO sync_queue (
        id,
        entity_type,
        entity_id,
        operation,
        payload,
        created_at,
        retry_count,
        last_error
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        item.id,
        item.entityType,
        item.entityId,
        item.operation,
        item.payload,
        item.createdAt,
        item.retryCount,
        item.lastError,
      ],
    );
  }

  async getPending(): Promise<SyncQueue[]> {
    const db = await getDB();

    const [result] = await db.executeSql(
      `
      SELECT *
      FROM sync_queue
      ORDER BY created_at ASC
      `,
    );

    const items: SyncQueue[] = [];

    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows.item(i);

      items.push({
        id: row.id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        operation: row.operation,
        payload: row.payload,
        createdAt: row.created_at,
        retryCount: row.retry_count,
        lastError: row.last_error ?? null,
      });
    }

    return items;
  }

  async remove(id: string): Promise<void> {
    const db = await getDB();

    await db.executeSql(
      `DELETE FROM sync_queue WHERE id = ?`,
      [id],
    );
  }

  async updateRetry(
    id: string,
    retryCount: number,
    lastError?: string,
  ): Promise<void> {
    const db = await getDB();

    await db.executeSql(
      `
      UPDATE sync_queue
      SET
        retry_count = ?,
        last_error = ?
      WHERE id = ?
      `,
      [
        retryCount,
        lastError ?? null,
        id,
      ],
    );
  }

  async clear(): Promise<void> {
    const db = await getDB();

    await db.executeSql(`DELETE FROM sync_queue`);
  }
}