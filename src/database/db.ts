import SQLite, { SQLiteDatabase } from 'react-native-sqlite-storage';

import {
  CREATE_PERSONS_TABLE,
  CREATE_VILLAGES_TABLE,
  CREATE_EVENTS_TABLE,
  CREATE_ENTRIES_TABLE,
  CREATE_OPERATORS_TABLE,
  CREATE_SYNC_QUEUE_TABLE,
  CREATE_SETTINGS_TABLE,
  CREATE_DB_MIGRATIONS_TABLE,
  CREATE_SETTLEMENTS_TABLE,
  CREATE_PENDING_REMINDERS_TABLE,
  CREATE_LOANS_TABLE,
  CREATE_GOLD_LOAN_PROVIDERS_TABLE,
  CREATE_BUSINESS_PARTIES_TABLE,
  CREATE_BUSINESS_TRANSACTIONS_TABLE,
  CREATE_INDEXES,
} from './schema';

import {
  getCurrentSchemaVersion,
  runMigrations,
} from './migrations';

SQLite.enablePromise(true);

const DB_NAME = 'MoiFlowDB.db';

let db: SQLiteDatabase | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open the database, create all tables, run pending migrations.
 * Safe to call multiple times — reuses the existing connection.
 */
export const initDB = async (): Promise<SQLiteDatabase> => {
  if (db) {
    return db;
  }

  db = await SQLite.openDatabase({
    name: DB_NAME,
    location: 'default',
  });

  await createBaseTables(db);
  const currentVersion = await getCurrentSchemaVersion(db);
  await runMigrations(db, currentVersion);

  //console.warn('[DB] MoiFlow database initialized successfully');
  return db;
};

/**
 * Returns the active database, initializing it if necessary.
 */
export const getDB = async (): Promise<SQLiteDatabase> => {
  if (!db) {
    return initDB();
  }
  return db;
};

/**
 * Close the database connection. Call only when the app is shutting down.
 */
export const closeDB = async (): Promise<void> => {
  if (db) {
    await db.close();
    db = null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL
// ─────────────────────────────────────────────────────────────────────────────

const createBaseTables = async (database: SQLiteDatabase): Promise<void> => {
  const tables = [
    CREATE_DB_MIGRATIONS_TABLE,
    CREATE_PERSONS_TABLE,
    CREATE_VILLAGES_TABLE,
    CREATE_EVENTS_TABLE,
    CREATE_ENTRIES_TABLE,
    CREATE_OPERATORS_TABLE,
    CREATE_SYNC_QUEUE_TABLE,
    CREATE_SETTINGS_TABLE,
    CREATE_SETTLEMENTS_TABLE,
    CREATE_PENDING_REMINDERS_TABLE,
    CREATE_LOANS_TABLE,
    CREATE_GOLD_LOAN_PROVIDERS_TABLE,
    CREATE_BUSINESS_PARTIES_TABLE,
    CREATE_BUSINESS_TRANSACTIONS_TABLE,
    ...CREATE_INDEXES,
  ];

  for (const sql of tables) {
    await database.executeSql(sql);
  }

  //console.warn('[DB] All tables and indexes created/verified');
};
