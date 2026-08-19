/**
 * MoiFlow Database Schema Definitions
 *
 * Version history:
 *   v1 -- initial schema (persons, events, entries, operators, sync_queue, settings)
 *   v2 -- add event_owner_type, description to events; add is_active, village_name to events
 *   v3 -- guarantee v2 event columns exist on all install paths (repair migration)
 */

export const SCHEMA_VERSION = 3;

// ---------------------------------------------------------------------------
// TABLE CREATION SQL (v1 baseline)
// ---------------------------------------------------------------------------

export const CREATE_PERSONS_TABLE = `
  CREATE TABLE IF NOT EXISTS persons (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    phone       TEXT,
    village_id  TEXT,
    village_name TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    sync_status INTEGER NOT NULL DEFAULT 0
  );
`;

export const CREATE_VILLAGES_TABLE = `
  CREATE TABLE IF NOT EXISTS villages (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );
`;

export const CREATE_EVENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS events (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    type             TEXT NOT NULL DEFAULT 'OTHER',
    owner_type       TEXT NOT NULL DEFAULT 'OTHER_PERSON'
                       CHECK (owner_type IN ('MY_EVENT', 'OTHER_PERSON')),
    date             TEXT,
    venue            TEXT,
    village_name     TEXT,
    description      TEXT,
    is_active        INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    sync_status      INTEGER NOT NULL DEFAULT 0
  );
`;

export const CREATE_ENTRIES_TABLE = `
  CREATE TABLE IF NOT EXISTS entries (
    id           TEXT PRIMARY KEY,
    entry_type   TEXT NOT NULL DEFAULT 'OTHER_EVENT'
                   CHECK (entry_type IN ('OWN_EVENT', 'OTHER_EVENT')),
    event_id     TEXT,
    event_name   TEXT,
    event_date   TEXT,
    person_id    TEXT NOT NULL,
    person_name  TEXT NOT NULL,
    village_name TEXT,
    cash_amount  REAL NOT NULL DEFAULT 0,
    gold_weight  REAL NOT NULL DEFAULT 0,
    remarks      TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    created_by   TEXT,
    sync_status  INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
    FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE RESTRICT
  );
`;

export const CREATE_OPERATORS_TABLE = `
  CREATE TABLE IF NOT EXISTS operators (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    phone      TEXT,
    role       TEXT NOT NULL DEFAULT 'USER',
    pin_hash   TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

export const CREATE_SYNC_QUEUE_TABLE = `
  CREATE TABLE IF NOT EXISTS sync_queue (
    id          TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id   TEXT NOT NULL,
    operation   TEXT NOT NULL CHECK (operation IN ('CREATE', 'UPDATE', 'DELETE')),
    payload     TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error  TEXT
  );
`;

export const CREATE_SETTINGS_TABLE = `
  CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT,
    updated_at TEXT NOT NULL
  );
`;

export const CREATE_DB_MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS db_migrations (
    version    INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
`;

// ---------------------------------------------------------------------------
// INDEXES
// ---------------------------------------------------------------------------

export const CREATE_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_entries_event_id    ON entries(event_id);`,
  `CREATE INDEX IF NOT EXISTS idx_entries_person_id   ON entries(person_id);`,
  `CREATE INDEX IF NOT EXISTS idx_entries_person_name ON entries(person_name);`,
  `CREATE INDEX IF NOT EXISTS idx_entries_village     ON entries(village_name);`,
  `CREATE INDEX IF NOT EXISTS idx_entries_entry_type  ON entries(entry_type);`,
  `CREATE INDEX IF NOT EXISTS idx_entries_created_at  ON entries(created_at);`,
  `CREATE INDEX IF NOT EXISTS idx_entries_sync        ON entries(sync_status);`,
  `CREATE INDEX IF NOT EXISTS idx_events_date         ON events(date);`,
  `CREATE INDEX IF NOT EXISTS idx_events_sync         ON events(sync_status);`,
  `CREATE INDEX IF NOT EXISTS idx_persons_name        ON persons(name);`,
  `CREATE INDEX IF NOT EXISTS idx_persons_village     ON persons(village_name);`,
  `CREATE INDEX IF NOT EXISTS idx_sync_queue_entity   ON sync_queue(entity_type, entity_id);`,
];