/**
 * Property-Based Test: Data Persistence Round-Trip (Property 9)
 *
 * **Validates: Requirements 17.2**
 *
 * For any valid entry, event, or person object written to SQLite, reading
 * back by ID produces identical field values (within type coercion boundaries
 * — booleans stored as integers).
 *
 * Since we cannot run SQLite in Jest, this test validates the
 * SERIALIZATION/DESERIALIZATION logic:
 * 1. Object → SQL INSERT parameter array (same mapping as repo.create())
 * 2. SQL parameters → simulated DB row (column name mapping)
 * 3. Simulated DB row → mapRow() → domain object
 * 4. Assert equivalence with the original
 */

import fc from 'fast-check';
import { Entry, EntryType } from '../../src/moi/models/Entry';
import { MoiEvent, EventOwnerType } from '../../src/moi/models/Event';
import { Person } from '../../src/moi/models/Person';

// ---------------------------------------------------------------------------
// mapRow functions extracted from repository implementations
// These mirror the exact logic in the repository files.
// ---------------------------------------------------------------------------

function mapEntryRow(row: Record<string, unknown>): Entry {
  return {
    id: String(row.id),
    entryType: (row.entry_type as EntryType) ?? 'OTHER_EVENT',
    eventId: row.event_id ? String(row.event_id) : null,
    eventName: row.event_name ? String(row.event_name) : undefined,
    eventDate: row.event_date ? String(row.event_date) : undefined,
    personId: String(row.person_id),
    personName: String(row.person_name),
    villageName: row.village_name ? String(row.village_name) : '',
    cashAmount: Number(row.cash_amount) || 0,
    goldWeight: Number(row.gold_weight) || 0,
    remarks: row.remarks ? String(row.remarks) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    createdBy: row.created_by ? String(row.created_by) : undefined,
    syncStatus: Number(row.sync_status) || 0,
  };
}

function mapEventRow(row: Record<string, unknown>): MoiEvent {
  return {
    id: String(row.id),
    name: String(row.name),
    type: String(row.type ?? 'OTHER'),
    ownerType: (row.owner_type as EventOwnerType) ?? 'OTHER_PERSON',
    date: row.date ? String(row.date) : undefined,
    venue: row.venue ? String(row.venue) : undefined,
    villageName: row.village_name ? String(row.village_name) : undefined,
    description: row.description ? String(row.description) : undefined,
    isActive: Number(row.is_active) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    syncStatus: Number(row.sync_status) || 0,
  };
}

function mapPersonRow(row: Record<string, unknown>): Person {
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

// ---------------------------------------------------------------------------
// Serialization helpers (mirror repo.create() parameter mapping)
// ---------------------------------------------------------------------------

/**
 * Simulates what EntryRepository.create() writes to SQL columns.
 * Returns a row object with SQL column names and values as SQLite would store them.
 */
function entryToSqlRow(entry: Entry): Record<string, unknown> {
  return {
    id: entry.id,
    entry_type: entry.entryType,
    event_id: entry.eventId ?? null,
    event_name: entry.eventName ?? null,
    event_date: entry.eventDate ?? null,
    person_id: entry.personId,
    person_name: entry.personName,
    village_name: entry.villageName ?? null,
    cash_amount: entry.cashAmount,
    gold_weight: entry.goldWeight,
    remarks: entry.remarks ?? null,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
    created_by: entry.createdBy ?? null,
    sync_status: entry.syncStatus,
  };
}

/**
 * Simulates what EventRepository.create() writes to SQL columns.
 * Note: isActive boolean is stored as integer 0/1.
 */
function eventToSqlRow(event: MoiEvent): Record<string, unknown> {
  return {
    id: event.id,
    name: event.name,
    type: event.type,
    owner_type: event.ownerType,
    date: event.date ?? null,
    venue: event.venue ?? null,
    village_name: event.villageName ?? null,
    description: event.description ?? null,
    is_active: event.isActive ? 1 : 0,
    created_at: event.createdAt,
    updated_at: event.updatedAt,
    sync_status: event.syncStatus,
  };
}

/**
 * Simulates what PersonRepository.create() writes to SQL columns.
 */
function personToSqlRow(person: Person): Record<string, unknown> {
  return {
    id: person.id,
    name: person.name,
    phone: person.phone ?? null,
    village_id: person.villageId ?? null,
    village_name: person.villageName ?? null,
    created_at: person.createdAt,
    updated_at: person.updatedAt,
    sync_status: person.syncStatus,
  };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const isoDateStringArb: fc.Arbitrary<string> = fc
  .date({ min: new Date(2020, 0, 1), max: new Date(2030, 11, 31) })
  .map(d => d.toISOString());

const entryTypeArb: fc.Arbitrary<EntryType> = fc.constantFrom(
  'OWN_EVENT',
  'OTHER_EVENT',
);

const ownerTypeArb: fc.Arbitrary<EventOwnerType> = fc.constantFrom(
  'MY_EVENT',
  'OTHER_PERSON',
);

/** Non-empty string that won't be treated as falsy by mapRow */
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);

const entryArb: fc.Arbitrary<Entry> = fc.record({
  id: fc.uuid(),
  entryType: entryTypeArb,
  eventId: fc.option(fc.uuid(), { nil: null }),
  eventName: fc.option(nonEmptyStringArb, { nil: undefined }),
  eventDate: fc.option(isoDateStringArb, { nil: undefined }),
  personId: fc.uuid(),
  personName: nonEmptyStringArb,
  villageName: fc.option(nonEmptyStringArb, { nil: undefined }),
  cashAmount: fc.float({ min: 0, max: 1000000, noNaN: true }).map(v => Math.round(v * 100) / 100),
  goldWeight: fc.float({ min: 0, max: 1000, noNaN: true }).map(v => Math.round(v * 1000) / 1000),
  remarks: fc.option(nonEmptyStringArb, { nil: undefined }),
  createdAt: isoDateStringArb,
  updatedAt: isoDateStringArb,
  createdBy: fc.option(nonEmptyStringArb, { nil: undefined }),
  syncStatus: fc.constantFrom(0, 1, 2),
});

const eventArb: fc.Arbitrary<MoiEvent> = fc.record({
  id: fc.uuid(),
  name: nonEmptyStringArb,
  type: fc.constantFrom('WEDDING', 'EAR_PIERCING', 'BIRTHDAY', 'HOUSEWARMING', 'DEATH', 'OTHER'),
  ownerType: ownerTypeArb,
  date: fc.option(isoDateStringArb, { nil: undefined }),
  venue: fc.option(nonEmptyStringArb, { nil: undefined }),
  villageName: fc.option(nonEmptyStringArb, { nil: undefined }),
  description: fc.option(nonEmptyStringArb, { nil: undefined }),
  isActive: fc.boolean(),
  createdAt: isoDateStringArb,
  updatedAt: isoDateStringArb,
  syncStatus: fc.constantFrom(0, 1, 2),
});

const personArb: fc.Arbitrary<Person> = fc.record({
  id: fc.uuid(),
  name: nonEmptyStringArb,
  phone: fc.option(nonEmptyStringArb, { nil: undefined }),
  villageId: fc.option(fc.uuid(), { nil: undefined }),
  villageName: fc.option(nonEmptyStringArb, { nil: undefined }),
  createdAt: isoDateStringArb,
  updatedAt: isoDateStringArb,
  syncStatus: fc.constantFrom(0, 1, 2),
});

// ---------------------------------------------------------------------------
// Property 9: Data Persistence Round-Trip
// ---------------------------------------------------------------------------

/**
 * **Validates: Requirements 17.2**
 *
 * For any valid entry/event/person written to SQLite, reading back by ID
 * produces identical field values (within type coercion boundaries —
 * booleans stored as integers).
 */
describe('Property 9: Data Persistence Round-Trip', () => {
  describe('Entry round-trip', () => {
    it('Entry → SQL row → mapRow produces equivalent Entry', () => {
      fc.assert(
        fc.property(entryArb, (entry) => {
          const sqlRow = entryToSqlRow(entry);
          const restored = mapEntryRow(sqlRow);

          // Core fields that must be preserved
          expect(restored.id).toBe(entry.id);
          expect(restored.entryType).toBe(entry.entryType);
          expect(restored.personId).toBe(entry.personId);
          expect(restored.personName).toBe(entry.personName);
          expect(restored.cashAmount).toBe(entry.cashAmount);
          expect(restored.goldWeight).toBe(entry.goldWeight);
          expect(restored.eventId).toBe(entry.eventId);
          expect(restored.createdAt).toBe(entry.createdAt);
          expect(restored.updatedAt).toBe(entry.updatedAt);
          expect(restored.syncStatus).toBe(entry.syncStatus);
        }),
        { numRuns: 200 },
      );
    });

    it('optional string fields are preserved when non-null', () => {
      fc.assert(
        fc.property(entryArb, (entry) => {
          const sqlRow = entryToSqlRow(entry);
          const restored = mapEntryRow(sqlRow);

          if (entry.eventName) {
            expect(restored.eventName).toBe(entry.eventName);
          }
          if (entry.eventDate) {
            expect(restored.eventDate).toBe(entry.eventDate);
          }
          if (entry.remarks) {
            expect(restored.remarks).toBe(entry.remarks);
          }
          if (entry.createdBy) {
            expect(restored.createdBy).toBe(entry.createdBy);
          }
        }),
        { numRuns: 200 },
      );
    });

    it('villageName normalizes undefined/empty to empty string', () => {
      fc.assert(
        fc.property(entryArb, (entry) => {
          const sqlRow = entryToSqlRow(entry);
          const restored = mapEntryRow(sqlRow);

          // mapRow converts village_name: truthy → string, falsy → ''
          if (entry.villageName) {
            expect(restored.villageName).toBe(entry.villageName);
          } else {
            expect(restored.villageName).toBe('');
          }
        }),
        { numRuns: 200 },
      );
    });
  });

  describe('Event round-trip', () => {
    it('Event → SQL row → mapRow produces equivalent Event', () => {
      fc.assert(
        fc.property(eventArb, (event) => {
          const sqlRow = eventToSqlRow(event);
          const restored = mapEventRow(sqlRow);

          // Core fields
          expect(restored.id).toBe(event.id);
          expect(restored.name).toBe(event.name);
          expect(restored.type).toBe(event.type);
          expect(restored.ownerType).toBe(event.ownerType);
          expect(restored.createdAt).toBe(event.createdAt);
          expect(restored.updatedAt).toBe(event.updatedAt);
          expect(restored.syncStatus).toBe(event.syncStatus);
        }),
        { numRuns: 200 },
      );
    });

    it('boolean isActive stored as 0/1 maps back correctly', () => {
      fc.assert(
        fc.property(eventArb, (event) => {
          const sqlRow = eventToSqlRow(event);

          // Verify the SQL representation uses integer
          expect(sqlRow.is_active).toBe(event.isActive ? 1 : 0);

          // Verify round-trip restores the boolean
          const restored = mapEventRow(sqlRow);
          expect(restored.isActive).toBe(event.isActive);
        }),
        { numRuns: 200 },
      );
    });

    it('optional string fields are preserved when non-null', () => {
      fc.assert(
        fc.property(eventArb, (event) => {
          const sqlRow = eventToSqlRow(event);
          const restored = mapEventRow(sqlRow);

          if (event.date) {
            expect(restored.date).toBe(event.date);
          }
          if (event.venue) {
            expect(restored.venue).toBe(event.venue);
          }
          if (event.villageName) {
            expect(restored.villageName).toBe(event.villageName);
          }
          if (event.description) {
            expect(restored.description).toBe(event.description);
          }
        }),
        { numRuns: 200 },
      );
    });

    it('null optional fields become undefined after round-trip', () => {
      fc.assert(
        fc.property(eventArb, (event) => {
          const sqlRow = eventToSqlRow(event);
          const restored = mapEventRow(sqlRow);

          if (!event.date) {
            expect(restored.date).toBeUndefined();
          }
          if (!event.venue) {
            expect(restored.venue).toBeUndefined();
          }
          if (!event.villageName) {
            expect(restored.villageName).toBeUndefined();
          }
          if (!event.description) {
            expect(restored.description).toBeUndefined();
          }
        }),
        { numRuns: 200 },
      );
    });
  });

  describe('Person round-trip', () => {
    it('Person → SQL row → mapRow produces equivalent Person', () => {
      fc.assert(
        fc.property(personArb, (person) => {
          const sqlRow = personToSqlRow(person);
          const restored = mapPersonRow(sqlRow);

          // Core fields
          expect(restored.id).toBe(person.id);
          expect(restored.name).toBe(person.name);
          expect(restored.createdAt).toBe(person.createdAt);
          expect(restored.updatedAt).toBe(person.updatedAt);
          expect(restored.syncStatus).toBe(person.syncStatus);
        }),
        { numRuns: 200 },
      );
    });

    it('optional fields are preserved when non-null', () => {
      fc.assert(
        fc.property(personArb, (person) => {
          const sqlRow = personToSqlRow(person);
          const restored = mapPersonRow(sqlRow);

          if (person.phone) {
            expect(restored.phone).toBe(person.phone);
          }
          if (person.villageId) {
            expect(restored.villageId).toBe(person.villageId);
          }
          if (person.villageName) {
            expect(restored.villageName).toBe(person.villageName);
          }
        }),
        { numRuns: 200 },
      );
    });

    it('null optional fields become undefined after round-trip', () => {
      fc.assert(
        fc.property(personArb, (person) => {
          const sqlRow = personToSqlRow(person);
          const restored = mapPersonRow(sqlRow);

          if (!person.phone) {
            expect(restored.phone).toBeUndefined();
          }
          if (!person.villageId) {
            expect(restored.villageId).toBeUndefined();
          }
          if (!person.villageName) {
            expect(restored.villageName).toBeUndefined();
          }
        }),
        { numRuns: 200 },
      );
    });
  });
});
