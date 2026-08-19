import { getDB } from '../../database/db';
import { MoiEvent, EventOwnerType } from '../../models/Event';
import { IEventRepository } from '../interfaces/IEventRepository';

export class EventRepository implements IEventRepository {

  async create(event: MoiEvent): Promise<void> {
    const db = await getDB();
    await db.executeSql(
      `INSERT INTO events
         (id, name, type, owner_type, date, venue, village_name, description, is_active, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.id,
        event.name,
        event.type,
        event.ownerType,
        event.date ?? null,
        event.venue ?? null,
        event.villageName ?? null,
        event.description ?? null,
        event.isActive ? 1 : 0,
        event.createdAt,
        event.updatedAt,
        event.syncStatus,
      ],
    );
  }

  async update(event: MoiEvent): Promise<void> {
    const db = await getDB();
    await db.executeSql(
      `UPDATE events
       SET name = ?, type = ?, owner_type = ?, date = ?, venue = ?,
           village_name = ?, description = ?, is_active = ?,
           updated_at = ?, sync_status = ?
       WHERE id = ?`,
      [
        event.name,
        event.type,
        event.ownerType,
        event.date ?? null,
        event.venue ?? null,
        event.villageName ?? null,
        event.description ?? null,
        event.isActive ? 1 : 0,
        event.updatedAt,
        event.syncStatus,
        event.id,
      ],
    );
  }

  async delete(id: string): Promise<void> {
    const db = await getDB();
    await db.executeSql(`DELETE FROM events WHERE id = ?`, [id]);
  }

  async getById(id: string): Promise<MoiEvent | null> {
    const db = await getDB();
    const [result] = await db.executeSql(
      `SELECT * FROM events WHERE id = ? LIMIT 1`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows.item(0));
  }

  async getAll(): Promise<MoiEvent[]> {
    const db = await getDB();
    const [result] = await db.executeSql(
      `SELECT * FROM events ORDER BY date DESC, created_at DESC`,
    );
    return this.mapRows(result);
  }

  async getMyEvents(): Promise<MoiEvent[]> {
    const db = await getDB();
    const [result] = await db.executeSql(
      `SELECT * FROM events WHERE owner_type = 'MY_EVENT' ORDER BY date DESC`,
    );
    return this.mapRows(result);
  }

  async getOtherEvents(): Promise<MoiEvent[]> {
    const db = await getDB();
    const [result] = await db.executeSql(
      `SELECT * FROM events WHERE owner_type = 'OTHER_PERSON' ORDER BY date DESC`,
    );
    return this.mapRows(result);
  }

  async getActiveEvent(): Promise<MoiEvent | null> {
    const db = await getDB();
    const [result] = await db.executeSql(
      `SELECT * FROM events WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1`,
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows.item(0));
  }

  async setActiveEvent(id: string): Promise<void> {
    const db = await getDB();
    // Deactivate all, then activate the chosen one
    await db.executeSql(`UPDATE events SET is_active = 0`);
    await db.executeSql(
      `UPDATE events SET is_active = 1, updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), id],
    );
  }

  private mapRow(row: Record<string, unknown>): MoiEvent {
    return {
      id: String(row.id),
      name: String(row.name),
      type: String(row.type ?? 'OTHER'),
      ownerType: (row.owner_type as EventOwnerType) ?? 'OTHER_PERSON',
      date: row.date ? String(row.date) : undefined,
      venue: row.venue ? String(row.venue) : undefined,
      villageName: row.village_name ? String(row.village_name) : undefined,
      personName: row.person_name ? String(row.person_name) : undefined,
      description: row.description ? String(row.description) : undefined,
      invitationImage: row.invitation_image ? String(row.invitation_image) : undefined,
      isActive: Number(row.is_active) === 1,
      isAttended: Number(row.is_attended) === 1,
      estimatedCost: Number(row.estimated_cost) || 0,
      actualExpenses: Number(row.actual_expenses) || 0,
      invitationsPrinted: Number(row.invitations_printed) || 0,
      totalInvites: Number(row.total_invites) || 0,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      syncStatus: Number(row.sync_status) || 0,
    };
  }

  private mapRows(result: { rows: { length: number; item: (i: number) => Record<string, unknown> } }): MoiEvent[] {
    const items: MoiEvent[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      items.push(this.mapRow(result.rows.item(i)));
    }
    return items;
  }
}
