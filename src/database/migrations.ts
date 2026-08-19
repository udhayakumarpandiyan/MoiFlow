import { SQLiteDatabase } from 'react-native-sqlite-storage';

export interface Migration {
  version: number;
  description: string;
  up: (db: SQLiteDatabase) => Promise<void>;
}

/**
 * All schema migrations in ascending version order.
 * Each migration runs exactly once and is recorded in db_migrations.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Initial schema — persons, villages, events, entries, operators, sync_queue, settings',
    up: async (_db: SQLiteDatabase) => {
      // All base tables are already created in db.ts initDB().
      // This migration just marks v1 as applied.
    },
  },

  {
    version: 2,
    description: 'Add owner_type + description to events; add is_active flag',
    up: async (db: SQLiteDatabase) => {
      // Add owner_type column if it doesn't exist (safe ALTER TABLE)
      try {
        await db.executeSql(
          `ALTER TABLE events ADD COLUMN owner_type TEXT NOT NULL DEFAULT 'OTHER_PERSON';`,
        );
      } catch (_) {
        // Column already exists — ignore
      }
      try {
        await db.executeSql(`ALTER TABLE events ADD COLUMN description TEXT;`);
      } catch (_) {}
      try {
        await db.executeSql(
          `ALTER TABLE events ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0;`,
        );
      } catch (_) {}
      try {
        await db.executeSql(`ALTER TABLE events ADD COLUMN village_name TEXT;`);
      } catch (_) {}
    },
  },

  {
    version: 3,
    description: 'Guarantee all v2 event columns exist — repairs installs where the events table was created before v2 columns were added to the schema DDL',
    up: async (db: SQLiteDatabase) => {
      // These are exactly the same ALTER TABLE statements as v2, but wrapped in
      // try/catch so they are silently skipped on databases that already have
      // the columns (i.e. fresh installs that got them via CREATE TABLE).
      // Devices that were stuck at schema v2 but still missing the physical
      // columns will have them added here.
      const safeAlter = async (sql: string) => {
        try {
          await db.executeSql(sql);
        } catch (_) {
          // Column already exists — ignore SQLITE_ERROR duplicate column
        }
      };

      await safeAlter(`ALTER TABLE events ADD COLUMN owner_type TEXT NOT NULL DEFAULT 'OTHER_PERSON';`);
      await safeAlter(`ALTER TABLE events ADD COLUMN description TEXT;`);
      await safeAlter(`ALTER TABLE events ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0;`);
      await safeAlter(`ALTER TABLE events ADD COLUMN village_name TEXT;`);
    },
  },

  {
    version: 4,
    description: 'Add estimated_cost, actual_expenses, invitations_printed, total_invites to events',
    up: async (db: SQLiteDatabase) => {
      const safeAlter = async (sql: string) => {
        try {
          await db.executeSql(sql);
        } catch (_) {}
      };

      await safeAlter(`ALTER TABLE events ADD COLUMN estimated_cost REAL NOT NULL DEFAULT 0;`);
      await safeAlter(`ALTER TABLE events ADD COLUMN actual_expenses REAL NOT NULL DEFAULT 0;`);
      await safeAlter(`ALTER TABLE events ADD COLUMN invitations_printed INTEGER NOT NULL DEFAULT 0;`);
      await safeAlter(`ALTER TABLE events ADD COLUMN total_invites INTEGER NOT NULL DEFAULT 0;`);
      await safeAlter(`ALTER TABLE events ADD COLUMN person_name TEXT;`);
      await safeAlter(`ALTER TABLE events ADD COLUMN invitation_image TEXT;`);
      await safeAlter(`ALTER TABLE events ADD COLUMN is_attended INTEGER NOT NULL DEFAULT 0;`);

      // Ensure entries table has all required columns (may be missing on older installs)
      await safeAlter(`ALTER TABLE entries ADD COLUMN entry_type TEXT NOT NULL DEFAULT 'OTHER_EVENT';`);
      await safeAlter(`ALTER TABLE entries ADD COLUMN person_id TEXT;`);
      await safeAlter(`ALTER TABLE entries ADD COLUMN person_name TEXT NOT NULL DEFAULT '';`);
      await safeAlter(`ALTER TABLE entries ADD COLUMN village_name TEXT;`);
      await safeAlter(`ALTER TABLE entries ADD COLUMN event_id TEXT;`);
      await safeAlter(`ALTER TABLE entries ADD COLUMN event_name TEXT;`);
      await safeAlter(`ALTER TABLE entries ADD COLUMN event_date TEXT;`);
      await safeAlter(`ALTER TABLE entries ADD COLUMN cash_amount REAL NOT NULL DEFAULT 0;`);
      await safeAlter(`ALTER TABLE entries ADD COLUMN gold_weight REAL NOT NULL DEFAULT 0;`);
      await safeAlter(`ALTER TABLE entries ADD COLUMN remarks TEXT;`);
      await safeAlter(`ALTER TABLE entries ADD COLUMN created_by TEXT;`);
    },
  },

  {
    version: 5,
    description: 'Add indexes for frequently queried columns on entries and events tables',
    up: async (db: SQLiteDatabase) => {
      const safeIndex = async (sql: string) => {
        try { await db.executeSql(sql); } catch (_) {}
      };

      // entries indexes — these columns appear in WHERE, GROUP BY, ORDER BY across
      // DashboardRepository, ReportRepository, EntryRepository, and VoiceSearchService
      await safeIndex(`CREATE INDEX IF NOT EXISTS idx_entries_entry_type ON entries (entry_type);`);
      await safeIndex(`CREATE INDEX IF NOT EXISTS idx_entries_person_id ON entries (person_id);`);
      await safeIndex(`CREATE INDEX IF NOT EXISTS idx_entries_person_name ON entries (person_name);`);
      await safeIndex(`CREATE INDEX IF NOT EXISTS idx_entries_event_id ON entries (event_id);`);
      await safeIndex(`CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries (created_at);`);
      await safeIndex(`CREATE INDEX IF NOT EXISTS idx_entries_village_name ON entries (village_name);`);
      // Composite index for the most common dashboard query pattern
      await safeIndex(`CREATE INDEX IF NOT EXISTS idx_entries_type_person ON entries (entry_type, person_id);`);

      // events indexes
      await safeIndex(`CREATE INDEX IF NOT EXISTS idx_events_owner_type ON events (owner_type);`);
      await safeIndex(`CREATE INDEX IF NOT EXISTS idx_events_date ON events (event_date);`);
      await safeIndex(`CREATE INDEX IF NOT EXISTS idx_events_is_active ON events (is_active);`);
    },
  },
];

/**
 * Run all pending migrations against the given database.
 * Returns the new schema version after migrations.
 */
export const runMigrations = async (
  db: SQLiteDatabase,
  currentVersion: number,
): Promise<number> => {
  const pending = MIGRATIONS.filter(m => m.version > currentVersion);

  if (pending.length === 0) {
    return currentVersion;
  }

  let latestVersion = currentVersion;

  for (const migration of pending) {
    try {
      await db.executeSql('BEGIN TRANSACTION;');
      await migration.up(db);
      await db.executeSql(
        `INSERT OR REPLACE INTO db_migrations (version, applied_at) VALUES (?, ?);`,
        [migration.version, new Date().toISOString()],
      );
      await db.executeSql('COMMIT;');
      latestVersion = migration.version;
      //console.warn(`[Migration] Applied v${migration.version}: ${migration.description}`);
    } catch (err) {
      await db.executeSql('ROLLBACK;');
      console.error(`[Migration] Failed v${migration.version}:`, err);
      throw err;
    }
  }

  return latestVersion;
};

/**
 * Read the current schema version from db_migrations table.
 */
export const getCurrentSchemaVersion = async (
  db: SQLiteDatabase,
): Promise<number> => {
  try {
    const [result] = await db.executeSql(
      `SELECT MAX(version) AS ver FROM db_migrations;`,
    );
    const ver = result.rows.item(0)?.ver;
    return ver != null ? Number(ver) : 0;
  } catch {
    return 0;
  }
};
