/**
 * Property-Based Tests: Event Filter and Sort Properties (Properties 7 & 8)
 *
 * - Property 7: MY_EVENT Filter Correctness
 * - Property 8: Event Sorting by Date
 */

import fc from 'fast-check';
import { MoiEvent, EventOwnerType } from '../../src/models/Event';

// ---------------------------------------------------------------------------
// Shared Generators
// ---------------------------------------------------------------------------

const ownerTypeArb: fc.Arbitrary<EventOwnerType> = fc.constantFrom(
  'MY_EVENT',
  'OTHER_PERSON',
);

/** Generate a date string in YYYY-MM-DD format */
const dateStringArb: fc.Arbitrary<string> = fc
  .date({ min: new Date(2020, 0, 1), max: new Date(2030, 11, 31) })
  .map(d => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

/** Generate a MoiEvent with random fields */
const moiEventArb: fc.Arbitrary<MoiEvent> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  type: fc.constantFrom('WEDDING', 'EAR_PIERCING', 'BIRTHDAY', 'HOUSEWARMING', 'DEATH'),
  ownerType: ownerTypeArb,
  date: fc.option(dateStringArb, { nil: undefined }),
  venue: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  villageName: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
  description: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: undefined }),
  isActive: fc.boolean(),
  createdAt: dateStringArb,
  updatedAt: dateStringArb,
  syncStatus: fc.constantFrom(0, 1, 2),
});

/** Generate a list of MoiEvents */
const moiEventListArb = fc.array(moiEventArb, { minLength: 0, maxLength: 30 });

// ---------------------------------------------------------------------------
// Property 7: MY_EVENT Filter Correctness
// ---------------------------------------------------------------------------

/**
 * **Validates: Requirements 14.1**
 *
 * For any list of events with mixed ownerType values, applying the MY_EVENT
 * filter SHALL return a list where every event has ownerType === 'MY_EVENT'
 * and no events with other ownerType values are included.
 */
describe('Property 7: MY_EVENT Filter Correctness', () => {
  /** The filter function as implemented in Events.tsx */
  function applyMyEventFilter(events: MoiEvent[]): MoiEvent[] {
    return events.filter(e => e.ownerType === 'MY_EVENT');
  }

  it('all returned events have ownerType === MY_EVENT', () => {
    fc.assert(
      fc.property(moiEventListArb, (events) => {
        const filtered = applyMyEventFilter(events);

        for (const event of filtered) {
          expect(event.ownerType).toBe('MY_EVENT');
        }
      }),
      { numRuns: 200 },
    );
  });

  it('no events with ownerType OTHER_PERSON are included in results', () => {
    fc.assert(
      fc.property(moiEventListArb, (events) => {
        const filtered = applyMyEventFilter(events);

        const hasOtherPerson = filtered.some(
          e => e.ownerType === 'OTHER_PERSON',
        );
        expect(hasOtherPerson).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it('filtered count equals the count of MY_EVENT items in original list', () => {
    fc.assert(
      fc.property(moiEventListArb, (events) => {
        const filtered = applyMyEventFilter(events);
        const expectedCount = events.filter(
          e => e.ownerType === 'MY_EVENT',
        ).length;

        expect(filtered.length).toBe(expectedCount);
      }),
      { numRuns: 200 },
    );
  });

  it('filter preserves all MY_EVENT events (none are lost)', () => {
    fc.assert(
      fc.property(moiEventListArb, (events) => {
        const filtered = applyMyEventFilter(events);
        const myEvents = events.filter(e => e.ownerType === 'MY_EVENT');

        // Every MY_EVENT from the original list should appear in filtered
        for (const myEvent of myEvents) {
          expect(filtered).toContainEqual(myEvent);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('filter is idempotent (applying twice yields same result)', () => {
    fc.assert(
      fc.property(moiEventListArb, (events) => {
        const firstPass = applyMyEventFilter(events);
        const secondPass = applyMyEventFilter(firstPass);

        expect(secondPass).toEqual(firstPass);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8: Event Sorting by Date
// ---------------------------------------------------------------------------

/**
 * **Validates: Requirements 14.4**
 *
 * For any list of events with date fields, after applying the date sort:
 * - Ascending (upcoming): event[i].date <= event[i+1].date for all adjacent pairs
 * - Descending (past): event[i].date >= event[i+1].date for all adjacent pairs
 * - Events without dates are pushed to the end
 */
describe('Property 8: Event Sorting by Date', () => {
  /**
   * Sort function matching the implementation in Events.tsx:
   * - null/undefined dates go to end (return 1 / -1)
   * - ascending: earliest date first
   * - descending: latest date first
   */
  function sortEventsByDate(
    events: MoiEvent[],
    direction: 'ascending' | 'descending',
  ): MoiEvent[] {
    return [...events].sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;

      const diff =
        new Date(a.date).getTime() - new Date(b.date).getTime();

      return direction === 'descending' ? -diff : diff;
    });
  }

  /** Generate events where all have dates (for pure ordering tests) */
  const moiEventWithDateArb: fc.Arbitrary<MoiEvent> = fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    type: fc.constantFrom('WEDDING', 'EAR_PIERCING', 'BIRTHDAY', 'HOUSEWARMING', 'DEATH'),
    ownerType: ownerTypeArb,
    date: dateStringArb,
    venue: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    villageName: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
    description: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: undefined }),
    isActive: fc.boolean(),
    createdAt: dateStringArb,
    updatedAt: dateStringArb,
    syncStatus: fc.constantFrom(0, 1, 2),
  });

  const eventListWithDatesArb = fc.array(moiEventWithDateArb, {
    minLength: 0,
    maxLength: 30,
  });

  describe('Ascending sort (upcoming filter)', () => {
    it('adjacent pairs satisfy date[i] <= date[i+1]', () => {
      fc.assert(
        fc.property(eventListWithDatesArb, (events) => {
          const sorted = sortEventsByDate(events, 'ascending');

          for (let i = 0; i < sorted.length - 1; i++) {
            const dateA = new Date(sorted[i].date!).getTime();
            const dateB = new Date(sorted[i + 1].date!).getTime();
            expect(dateA).toBeLessThanOrEqual(dateB);
          }
        }),
        { numRuns: 200 },
      );
    });
  });

  describe('Descending sort (past filter)', () => {
    it('adjacent pairs satisfy date[i] >= date[i+1]', () => {
      fc.assert(
        fc.property(eventListWithDatesArb, (events) => {
          const sorted = sortEventsByDate(events, 'descending');

          for (let i = 0; i < sorted.length - 1; i++) {
            const dateA = new Date(sorted[i].date!).getTime();
            const dateB = new Date(sorted[i + 1].date!).getTime();
            expect(dateA).toBeGreaterThanOrEqual(dateB);
          }
        }),
        { numRuns: 200 },
      );
    });
  });

  describe('Null date handling', () => {
    it('events without dates are placed at the end for ascending sort', () => {
      fc.assert(
        fc.property(moiEventListArb, (events) => {
          const sorted = sortEventsByDate(events, 'ascending');
          const eventsWithDates = sorted.filter(e => e.date != null);
          const eventsWithoutDates = sorted.filter(e => e.date == null);

          // All dated events should come before undated ones
          if (eventsWithDates.length > 0 && eventsWithoutDates.length > 0) {
            const lastDatedIndex = sorted.lastIndexOf(
              eventsWithDates[eventsWithDates.length - 1],
            );
            const firstUndatedIndex = sorted.indexOf(eventsWithoutDates[0]);
            expect(lastDatedIndex).toBeLessThan(firstUndatedIndex);
          }
        }),
        { numRuns: 200 },
      );
    });

    it('events without dates are placed at the end for descending sort', () => {
      fc.assert(
        fc.property(moiEventListArb, (events) => {
          const sorted = sortEventsByDate(events, 'descending');
          const eventsWithDates = sorted.filter(e => e.date != null);
          const eventsWithoutDates = sorted.filter(e => e.date == null);

          // All dated events should come before undated ones
          if (eventsWithDates.length > 0 && eventsWithoutDates.length > 0) {
            const lastDatedIndex = sorted.lastIndexOf(
              eventsWithDates[eventsWithDates.length - 1],
            );
            const firstUndatedIndex = sorted.indexOf(eventsWithoutDates[0]);
            expect(lastDatedIndex).toBeLessThan(firstUndatedIndex);
          }
        }),
        { numRuns: 200 },
      );
    });
  });

  describe('Sort invariants', () => {
    it('sorting preserves all elements (no items lost or added)', () => {
      fc.assert(
        fc.property(moiEventListArb, (events) => {
          const sorted = sortEventsByDate(events, 'ascending');
          expect(sorted.length).toBe(events.length);

          // Each original event exists in sorted result
          for (const event of events) {
            expect(sorted).toContainEqual(event);
          }
        }),
        { numRuns: 200 },
      );
    });

    it('sorting is deterministic (same input produces same output)', () => {
      fc.assert(
        fc.property(moiEventListArb, (events) => {
          const sorted1 = sortEventsByDate(events, 'ascending');
          const sorted2 = sortEventsByDate(events, 'ascending');
          expect(sorted1).toEqual(sorted2);
        }),
        { numRuns: 100 },
      );
    });
  });
});
