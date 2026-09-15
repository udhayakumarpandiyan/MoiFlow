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
    time             TEXT,
    venue            TEXT,
    village_name     TEXT,
    description      TEXT,
    is_active        INTEGER NOT NULL DEFAULT 0,
    estimated_cost   REAL NOT NULL DEFAULT 0,
    actual_expenses  REAL NOT NULL DEFAULT 0,
    notify_at        TEXT,
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

// Pending Payments & Receivables — append-only settlement ledger + reminders.
// (Also created by migration v9; duplicated here so fresh installs have them.)
export const CREATE_SETTLEMENTS_TABLE = `
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
`;

export const CREATE_PENDING_REMINDERS_TABLE = `
  CREATE TABLE IF NOT EXISTS pending_reminders (
    key        TEXT PRIMARY KEY,
    person_id  TEXT NOT NULL,
    event_id   TEXT,
    direction  TEXT,
    remind_at  TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

// ---------------------------------------------------------------------------
// FINANCE MODULE — EMI-based loans + a configurable gold-loan provider table.
// Independent from the Moi domain. A loan stores its repayment plan (amount,
// EMI, tenure, total/paid EMIs); outstanding + next EMI date are derived.
// Marking a loan "CLOSED" only flips its status — the record is kept.
// ---------------------------------------------------------------------------

export const CREATE_LOANS_TABLE = `
  CREATE TABLE IF NOT EXISTS loans (
    id                 TEXT PRIMARY KEY,
    loan_type          TEXT NOT NULL DEFAULT 'PERSONAL'
                         CHECK (loan_type IN ('CAR','TWO_WHEELER','AGRI','PERSONAL','BUSINESS','CHIT','GOLD','OTHERS')),
    loan_amount        REAL NOT NULL DEFAULT 0,
    start_date         TEXT NOT NULL,
    provider           TEXT NOT NULL DEFAULT '',
    interest_rate      REAL NOT NULL DEFAULT 0,
    monthly_emi        REAL NOT NULL DEFAULT 0,
    emi_date           INTEGER NOT NULL DEFAULT 1,
    tenure             INTEGER NOT NULL DEFAULT 0,
    total_emis         INTEGER NOT NULL DEFAULT 0,
    paid_emis          INTEGER NOT NULL DEFAULT 0,
    outstanding_amount REAL,
    status             TEXT NOT NULL DEFAULT 'ACTIVE'
                         CHECK (status IN ('ACTIVE','CLOSED')),
    notes              TEXT,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL,
    sync_status        INTEGER NOT NULL DEFAULT 0
  );
`;

export const CREATE_GOLD_LOAN_PROVIDERS_TABLE = `
  CREATE TABLE IF NOT EXISTS gold_loan_providers (
    id              TEXT PRIMARY KEY,
    provider        TEXT NOT NULL,
    interest_rate   REAL NOT NULL DEFAULT 0,
    amount_per_gram REAL NOT NULL DEFAULT 0,
    ltv             REAL NOT NULL DEFAULT 0,
    processing_fee  REAL NOT NULL DEFAULT 0,
    other_charges   TEXT,
    updated_at      TEXT NOT NULL
  );
`;

// ---------------------------------------------------------------------------
// FINANCE MODULE — Business (customers, suppliers, sales, purchases).
// Parties store contact info; transactions store amount + amount settled.
// Outstanding + payment status are derived, never stored.
// ---------------------------------------------------------------------------

export const CREATE_BUSINESS_PARTIES_TABLE = `
  CREATE TABLE IF NOT EXISTS business_parties (
    id           TEXT PRIMARY KEY,
    kind         TEXT NOT NULL DEFAULT 'CUSTOMER'
                   CHECK (kind IN ('CUSTOMER','SUPPLIER')),
    name         TEXT NOT NULL,
    phone        TEXT,
    address      TEXT,
    notes        TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    sync_status  INTEGER NOT NULL DEFAULT 0
  );
`;

export const CREATE_BUSINESS_TRANSACTIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS business_transactions (
    id             TEXT PRIMARY KEY,
    kind           TEXT NOT NULL DEFAULT 'SALE'
                     CHECK (kind IN ('SALE','PURCHASE')),
    party_id       TEXT NOT NULL,
    date           TEXT NOT NULL,
    description    TEXT,
    quantity       REAL NOT NULL DEFAULT 0,
    amount         REAL NOT NULL DEFAULT 0,
    amount_settled REAL NOT NULL DEFAULT 0,
    notes          TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    sync_status    INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (party_id) REFERENCES business_parties(id) ON DELETE CASCADE
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
  `CREATE INDEX IF NOT EXISTS idx_loans_type           ON loans(loan_type);`,
  `CREATE INDEX IF NOT EXISTS idx_loans_status         ON loans(status);`,
  `CREATE INDEX IF NOT EXISTS idx_biz_parties_kind     ON business_parties(kind);`,
  `CREATE INDEX IF NOT EXISTS idx_biz_txn_kind         ON business_transactions(kind);`,
  `CREATE INDEX IF NOT EXISTS idx_biz_txn_party        ON business_transactions(party_id);`,
];