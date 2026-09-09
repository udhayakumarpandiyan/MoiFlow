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

  {
    version: 6,
    description: 'Add time column to events (event start time alongside date)',
    up: async (db: SQLiteDatabase) => {
      const safeAlter = async (sql: string) => {
        try { await db.executeSql(sql); } catch (_) {}
      };

      // event start time (HH:mm). estimated_cost / actual_expenses already added in v4.
      await safeAlter(`ALTER TABLE events ADD COLUMN time TEXT;`);
    },
  },

  {
    version: 7,
    description: 'Add notify_at column to events (one-time reminder notification datetime)',
    up: async (db: SQLiteDatabase) => {
      const safeAlter = async (sql: string) => {
        try { await db.executeSql(sql); } catch (_) {}
      };

      // ISO datetime for a one-time reminder notification (nullable).
      await safeAlter(`ALTER TABLE events ADD COLUMN notify_at TEXT;`);
    },
  },

  {
    version: 8,
    description:
      'Add entitlement_cache table — offline/UX cache of the Google Play subscription state. Google Play remains the authority; this is never proof of purchase and is never used to grant premium on its own beyond its cached, expiry-bounded record.',
    up: async (db: SQLiteDatabase) => {
      // Single-row cache (id is always 'current'). We keep the latest known
      // Play purchase snapshot so the app can render premium UI while offline
      // and before the billing client finishes connecting. It is refreshed
      // whenever we successfully verify ownership against Google Play.
      await db.executeSql(`
        CREATE TABLE IF NOT EXISTS entitlement_cache (
          id                 TEXT PRIMARY KEY,
          is_premium         INTEGER NOT NULL DEFAULT 0,
          plan_id            TEXT,
          product_id         TEXT,
          purchase_token     TEXT,
          expiry_at          TEXT,
          latest_purchase_at TEXT,
          last_verified_at   TEXT,
          source             TEXT NOT NULL DEFAULT 'none',
          created_at         TEXT NOT NULL,
          updated_at         TEXT NOT NULL
        );
      `);
    },
  },

  {
    version: 9,
    description:
      'Pending Payments & Receivables: append-only settlements ledger (partial/full settlement of derived pending balances — never mutates entries) + pending_reminders (follow-up reminder datetime per pending line).',
    up: async (db: SQLiteDatabase) => {
      // Append-only ledger. Each row records how much cash/gold of a person's
      // (optionally per-event) RECEIVABLE or PAYABLE balance was received/paid.
      // Outstanding is computed as derived-due minus SUM of settlements. Original
      // entries are never touched, so transaction history is fully preserved.
      await db.executeSql(`
        CREATE TABLE IF NOT EXISTS settlements (
          id            TEXT PRIMARY KEY,
          direction     TEXT NOT NULL CHECK (direction IN ('RECEIVABLE', 'PAYABLE')),
          person_id     TEXT NOT NULL,
          person_name   TEXT NOT NULL,
          event_id      TEXT,
          settled_cash  REAL NOT NULL DEFAULT 0,
          settled_gold  REAL NOT NULL DEFAULT 0,
          note          TEXT,
          settled_at    TEXT NOT NULL,
          created_at    TEXT NOT NULL
        );
      `);
      await db.executeSql(
        `CREATE INDEX IF NOT EXISTS idx_settlements_person ON settlements (person_id, direction);`,
      );
      await db.executeSql(
        `CREATE INDEX IF NOT EXISTS idx_settlements_event ON settlements (event_id);`,
      );

      // One follow-up reminder per pending line. `key` is the deterministic
      // pending key (person[+event][+direction]); remind_at is an ISO datetime.
      await db.executeSql(`
        CREATE TABLE IF NOT EXISTS pending_reminders (
          key        TEXT PRIMARY KEY,
          person_id  TEXT NOT NULL,
          event_id   TEXT,
          direction  TEXT,
          remind_at  TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    },
  },

  {
    version: 10,
    description:
      'Finance module — loans + append-only loan_payments. Independent from the Moi domain. Original loan principal/interest is never mutated; every repayment is a new loan_payments row, preserving full history.',
    up: async (db: SQLiteDatabase) => {
      await db.executeSql(`
        CREATE TABLE IF NOT EXISTS loans (
          id             TEXT PRIMARY KEY,
          direction      TEXT NOT NULL DEFAULT 'LENT'
                           CHECK (direction IN ('LENT', 'BORROWED')),
          loan_type      TEXT NOT NULL DEFAULT 'PERSONAL'
                           CHECK (loan_type IN ('PERSONAL','BUSINESS','CAR','GOLD','AGRICULTURAL','HOME','EDUCATION','OTHER')),
          party_type     TEXT NOT NULL DEFAULT 'PERSON'
                           CHECK (party_type IN ('PERSON','BUSINESS')),
          party_name     TEXT NOT NULL,
          party_village  TEXT,
          party_phone    TEXT,
          party_contact  TEXT,
          principal      REAL NOT NULL DEFAULT 0,
          interest_rate  REAL NOT NULL DEFAULT 0,
          interest_type  TEXT NOT NULL DEFAULT 'NONE'
                           CHECK (interest_type IN ('NONE','SIMPLE','FLAT','REDUCING','COMPOUND')),
          loan_date      TEXT NOT NULL,
          due_date       TEXT,
          status         TEXT NOT NULL DEFAULT 'PENDING'
                           CHECK (status IN ('PENDING','EXPECTED','SETTLED','BAD_DEBT')),
          notes          TEXT,
          created_at     TEXT NOT NULL,
          updated_at     TEXT NOT NULL,
          sync_status    INTEGER NOT NULL DEFAULT 0
        );
      `);

      await db.executeSql(`
        CREATE TABLE IF NOT EXISTS loan_payments (
          id             TEXT PRIMARY KEY,
          loan_id        TEXT NOT NULL,
          principal_paid REAL NOT NULL DEFAULT 0,
          interest_paid  REAL NOT NULL DEFAULT 0,
          payment_date   TEXT NOT NULL,
          note           TEXT,
          created_at     TEXT NOT NULL,
          sync_status    INTEGER NOT NULL DEFAULT 0
        );
      `);

      await db.executeSql(
        `CREATE INDEX IF NOT EXISTS idx_loans_direction ON loans(direction);`,
      );
      await db.executeSql(
        `CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);`,
      );
      await db.executeSql(
        `CREATE INDEX IF NOT EXISTS idx_loan_payments_loan ON loan_payments(loan_id);`,
      );
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
