import { getDB } from '@common/database/db';
import { Person } from '@moi/models/Person';
import { IPersonRepository } from '@moi/repository/interfaces/IPersonRepository';

export class PersonRepository implements IPersonRepository {

  async create(person: Person): Promise<void> {
    const db = await getDB();
    await db.executeSql(
      `INSERT INTO persons (id, name, phone, village_id, village_name, created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        person.id,
        person.name,
        person.phone ?? null,
        person.villageId ?? null,
        person.villageName ?? null,
        person.createdAt,
        person.updatedAt,
        person.syncStatus,
      ],
    );
  }

  async update(person: Person): Promise<void> {
    const db = await getDB();
    await db.executeSql(
      `UPDATE persons
       SET name = ?, phone = ?, village_id = ?, village_name = ?, updated_at = ?, sync_status = ?
       WHERE id = ?`,
      [
        person.name,
        person.phone ?? null,
        person.villageId ?? null,
        person.villageName ?? null,
        person.updatedAt,
        person.syncStatus,
        person.id,
      ],
    );
  }

  async delete(id: string): Promise<void> {
    const db = await getDB();
    await db.executeSql(`DELETE FROM persons WHERE id = ?`, [id]);
  }

  async getById(id: string): Promise<Person | null> {
    const db = await getDB();
    const [result] = await db.executeSql(
      `SELECT * FROM persons WHERE id = ? LIMIT 1`,
      [id],
    );
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows.item(0));
  }

  async getAll(): Promise<Person[]> {
    const db = await getDB();
    const [result] = await db.executeSql(
      `SELECT * FROM persons ORDER BY name ASC`,
    );
    return this.mapRows(result);
  }

  async search(keyword: string): Promise<Person[]> {
    const db = await getDB();
    const term = `%${keyword}%`;
    const [result] = await db.executeSql(
      `SELECT * FROM persons
       WHERE name LIKE ? OR village_name LIKE ? OR phone LIKE ?
       ORDER BY name ASC
       LIMIT 50`,
      [term, term, term],
    );
    return this.mapRows(result);
  }

  /**
   * Returns existing person matching name + village, or creates a new one.
   */
  async findOrCreate(name: string, villageName?: string): Promise<Person> {
    const db = await getDB();
    const trimmedName = name.trim();
    const trimmedVillage = villageName?.trim() ?? null;

    // Try to find existing person
    const [findResult] = await db.executeSql(
      `SELECT * FROM persons
       WHERE LOWER(name) = LOWER(?)
       ${trimmedVillage ? 'AND LOWER(village_name) = LOWER(?)' : ''}
       LIMIT 1`,
      trimmedVillage ? [trimmedName, trimmedVillage] : [trimmedName],
    );

    if (findResult.rows.length > 0) {
      return this.mapRow(findResult.rows.item(0));
    }

    // Create new
    const now = new Date().toISOString();
    const id = `person_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newPerson: Person = {
      id,
      name: trimmedName,
      villageName: trimmedVillage ?? undefined,
      createdAt: now,
      updatedAt: now,
      syncStatus: 0,
    };

    await this.create(newPerson);
    return newPerson;
  }

  private mapRow(row: Record<string, unknown>): Person {
    return {
      id: String(row.id),
      name: String(row.name),
      phone: row.phone ? String(row.phone) : undefined,
      villageId: row.village_id ? String(row.village_id) : undefined,
      villageName: row.village_name ? String(row.village_name) : undefined,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      syncStatus: Number(row.sync_status) || 0,
    };
  }

  private mapRows(result: { rows: { length: number; item: (i: number) => Record<string, unknown> } }): Person[] {
    const items: Person[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      items.push(this.mapRow(result.rows.item(i)));
    }
    return items;
  }
}
