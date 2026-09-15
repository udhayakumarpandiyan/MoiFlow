import { getDB } from '@common/database/db';
import { Village } from '@moi/models/Village';
import { IVillageRepository } from '@moi/repository/interfaces/IVillageRepository';

export class VillageRepository implements IVillageRepository {

  async create(village: Village): Promise<void> {
    const db = await getDB();
    await db.executeSql(
      `INSERT OR IGNORE INTO villages (id, name, created_at) VALUES (?, ?, ?)`,
      [village.id, village.name, village.createdAt],
    );
  }

  async getAll(): Promise<Village[]> {
    const db = await getDB();
    const [result] = await db.executeSql(
      `SELECT * FROM villages ORDER BY name ASC`,
    );
    return this.mapRows(result);
  }

  async search(keyword: string): Promise<Village[]> {
    const db = await getDB();
    const [result] = await db.executeSql(
      `SELECT * FROM villages WHERE name LIKE ? ORDER BY name ASC LIMIT 30`,
      [`%${keyword}%`],
    );
    return this.mapRows(result);
  }

  async findOrCreate(name: string): Promise<Village> {
    const db = await getDB();
    const trimmed = name.trim();

    const [findResult] = await db.executeSql(
      `SELECT * FROM villages WHERE LOWER(name) = LOWER(?) LIMIT 1`,
      [trimmed],
    );

    if (findResult.rows.length > 0) {
      return this.mapRow(findResult.rows.item(0));
    }

    const now = new Date().toISOString();
    const village: Village = {
      id: `village_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: trimmed,
      createdAt: now,
    };
    await this.create(village);
    return village;
  }

  /**
   * Returns distinct village names from the entries table (denormalized store).
   * Useful for autocomplete without relying on the villages table being populated.
   */
  async getDistinctFromEntries(): Promise<string[]> {
    const db = await getDB();
    const [result] = await db.executeSql(
      `SELECT DISTINCT village_name
       FROM entries
       WHERE village_name IS NOT NULL AND village_name != ''
       ORDER BY village_name ASC`,
    );
    const names: string[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      names.push(String(result.rows.item(i).village_name));
    }
    return names;
  }

  private mapRow(row: Record<string, unknown>): Village {
    return {
      id: String(row.id),
      name: String(row.name),
      createdAt: String(row.created_at),
    };
  }

  private mapRows(result: { rows: { length: number; item: (i: number) => Record<string, unknown> } }): Village[] {
    const items: Village[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      items.push(this.mapRow(result.rows.item(i)));
    }
    return items;
  }
}
