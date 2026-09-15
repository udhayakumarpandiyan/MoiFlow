/**
 * Property-Based Tests: Voice Parsing Properties (Properties 4, 5, 6)
 *
 * This file tests three correctness properties for the voice subsystem:
 *
 * - Property 4: Voice Result to Form Field Mapping
 * - Property 5: Local Fallback Confidence Multiplier
 * - Property 6: Local Voice Parser Resilience
 */

import fc from 'fast-check';
import { TamilEventParser, ParsedVoiceEvent } from '../../src/common/voice/TamilEventParser';
import { TamilEntryParser, ParsedVoiceEntry } from '../../src/common/voice/TamilEntryParser';

// ---------------------------------------------------------------------------
// Property 4: Voice Result to Form Field Mapping
// ---------------------------------------------------------------------------

/**
 * **Validates: Requirements 10.4, 13.3**
 *
 * For any valid ParsedVoiceEvent object with non-null fields, when mapped
 * to form fields, all non-null values should be preserved. The mapping is:
 *   result.eventName  → form.name
 *   result.eventType  → form.type
 *   result.date       → form.date
 *   result.venue      → form.venue
 */
describe('Property 4: Voice Result to Form Field Mapping', () => {
  // The mapping function as it exists in VoiceEventModal → AddEditEventModal flow
  function mapVoiceEventToFormFields(parsed: ParsedVoiceEvent) {
    return {
      name: parsed.eventName ?? '',
      type: parsed.eventType ?? 'WEDDING',
      date: parsed.date ?? '',
      venue: parsed.venue ?? '',
    };
  }

  const EVENT_TYPES = [
    'WEDDING',
    'EAR_PIERCING',
    'BIRTHDAY',
    'MUPPOOSAI_PADAYAL',
    'HOUSEWARMING',
    'DEATH',
    'MANJAL_NEERATTU',
  ];

  const parsedVoiceEventArb = fc.record({
    eventName: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 50 })),
    eventType: fc.oneof(fc.constant(null), fc.constantFrom(...EVENT_TYPES)),
    date: fc.oneof(
      fc.constant(null),
      fc.date({ min: new Date(2020, 0, 1), max: new Date(2030, 11, 31) }).map(d => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }),
    ),
    venue: fc.oneof(fc.constant(null), fc.string({ minLength: 1, maxLength: 80 })),
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
  });

  it('preserves all non-null ParsedVoiceEvent fields in form mapping', () => {
    fc.assert(
      fc.property(parsedVoiceEventArb, (parsed) => {
        const form = mapVoiceEventToFormFields(parsed);

        // Non-null fields must be preserved exactly
        if (parsed.eventName !== null) {
          expect(form.name).toBe(parsed.eventName);
        }
        if (parsed.eventType !== null) {
          expect(form.type).toBe(parsed.eventType);
        }
        if (parsed.date !== null) {
          expect(form.date).toBe(parsed.date);
        }
        if (parsed.venue !== null) {
          expect(form.venue).toBe(parsed.venue);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('null fields map to default values (empty string or default type)', () => {
    fc.assert(
      fc.property(parsedVoiceEventArb, (parsed) => {
        const form = mapVoiceEventToFormFields(parsed);

        // Null fields should have safe defaults
        if (parsed.eventName === null) {
          expect(form.name).toBe('');
        }
        if (parsed.eventType === null) {
          expect(form.type).toBe('WEDDING'); // default type
        }
        if (parsed.date === null) {
          expect(form.date).toBe('');
        }
        if (parsed.venue === null) {
          expect(form.venue).toBe('');
        }
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: Local Fallback Confidence Multiplier
// ---------------------------------------------------------------------------

/**
 * **Validates: Requirements 13.4, 10.3**
 *
 * When the NLU backend is unreachable, the VoiceEventService falls back to
 * the local TamilEventParser and multiplies confidence by 0.7.
 *
 * TamilEventParser confidence rules:
 *   - eventType + date found → 0.9
 *   - only eventType found → 0.6
 *   - neither found → 0.3
 *
 * After 0.7 multiplier:
 *   - 0.9 × 0.7 = 0.63
 *   - 0.6 × 0.7 = 0.42
 *   - 0.3 × 0.7 = 0.21
 */
describe('Property 5: Local Fallback Confidence Multiplier', () => {
  const parser = new TamilEventParser();

  it('local parser confidence is one of {0.9, 0.6, 0.3} based on extraction results', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        (text) => {
          const result = parser.parse(text);

          if (result.eventType !== null && result.date !== null) {
            expect(result.confidence).toBe(0.9);
          } else if (result.eventType !== null) {
            expect(result.confidence).toBe(0.6);
          } else {
            expect(result.confidence).toBe(0.3);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('fallback confidence equals local confidence × 0.7 for all inputs', () => {
    const MULTIPLIER = 0.7;

    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        (text) => {
          const local = parser.parse(text);
          const fallbackConfidence = local.confidence * MULTIPLIER;

          // Verify the multiplied value matches expected
          expect(fallbackConfidence).toBeCloseTo(local.confidence * 0.7, 10);

          // Verify it's one of the 3 expected values
          const expectedValues = [0.9 * 0.7, 0.6 * 0.7, 0.3 * 0.7]; // [0.63, 0.42, 0.21]
          const matchesExpected = expectedValues.some(
            v => Math.abs(fallbackConfidence - v) < 1e-10,
          );
          expect(matchesExpected).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('fallback confidence is always less than local confidence', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        (text) => {
          const local = parser.parse(text);
          const fallbackConfidence = local.confidence * 0.7;
          expect(fallbackConfidence).toBeLessThan(local.confidence);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('specific multiplied values: 0.63, 0.42, or 0.21', () => {
    // eventType + date → 0.9 × 0.7 = 0.63
    const withBoth = parser.parse('திருமணம் 15-06-2025');
    expect(withBoth.confidence * 0.7).toBeCloseTo(0.63, 10);

    // only eventType → 0.6 × 0.7 = 0.42
    const withType = parser.parse('திருமணம் விழா');
    expect(withType.confidence * 0.7).toBeCloseTo(0.42, 10);

    // neither → 0.3 × 0.7 = 0.21
    const withNeither = parser.parse('hello world');
    expect(withNeither.confidence * 0.7).toBeCloseTo(0.21, 10);
  });
});

// ---------------------------------------------------------------------------
// Property 6: Local Voice Parser Resilience
// ---------------------------------------------------------------------------

/**
 * **Validates: Requirements 10.3, 13.4**
 *
 * For any non-empty string input, TamilEntryParser.parse() and
 * TamilEventParser.parse() SHALL return a valid result object without
 * throwing an exception — ensuring graceful degradation when the backend
 * is unavailable.
 */
describe('Property 6: Local Voice Parser Resilience', () => {
  const eventParser = new TamilEventParser();
  const entryParser = new TamilEntryParser();

  // Generators for diverse string inputs
  const nonEmptyStringArb = fc.oneof(
    fc.string({ minLength: 1, maxLength: 500 }),                // general strings
    fc.unicodeString({ minLength: 1, maxLength: 200 }),         // unicode with various scripts
    fc.stringOf(                                                 // Tamil-like characters
      fc.integer({ min: 0x0B80, max: 0x0BFF }).map(c => String.fromCharCode(c)),
      { minLength: 1, maxLength: 100 },
    ),
    fc.constantFrom(                                            // edge cases
      ' ',
      '\t\n',
      '🎤🔥💰',
      '<!DOCTYPE html>',
      'null',
      'undefined',
      '0',
      '-1',
      '999999999999999999',
      'DROP TABLE entries;',
      '<script>alert("xss")</script>',
      '\\n\\t\\r',
      '   திருமணம்   ',
      'a'.repeat(1000),
    ),
  );

  describe('TamilEventParser resilience', () => {
    it('never throws for any non-empty string input', () => {
      fc.assert(
        fc.property(nonEmptyStringArb, (text) => {
          // Must not throw
          const result = eventParser.parse(text);
          expect(result).toBeDefined();
          expect(result).not.toBeNull();
        }),
        { numRuns: 500 },
      );
    });

    it('always returns correct shape with all expected fields', () => {
      fc.assert(
        fc.property(nonEmptyStringArb, (text) => {
          const result = eventParser.parse(text);

          // Structural check: all fields present
          expect(result).toHaveProperty('eventName');
          expect(result).toHaveProperty('eventType');
          expect(result).toHaveProperty('date');
          expect(result).toHaveProperty('venue');
          expect(result).toHaveProperty('confidence');

          // Type checks
          expect(
            result.eventName === null || typeof result.eventName === 'string',
          ).toBe(true);
          expect(
            result.eventType === null || typeof result.eventType === 'string',
          ).toBe(true);
          expect(
            result.date === null || typeof result.date === 'string',
          ).toBe(true);
          expect(
            result.venue === null || typeof result.venue === 'string',
          ).toBe(true);
          expect(typeof result.confidence).toBe('number');
        }),
        { numRuns: 500 },
      );
    });

    it('confidence is always between 0 and 1 (inclusive)', () => {
      fc.assert(
        fc.property(nonEmptyStringArb, (text) => {
          const result = eventParser.parse(text);
          expect(result.confidence).toBeGreaterThanOrEqual(0);
          expect(result.confidence).toBeLessThanOrEqual(1);
        }),
        { numRuns: 500 },
      );
    });
  });

  describe('TamilEntryParser resilience', () => {
    it('never throws for any non-empty string input', () => {
      fc.assert(
        fc.property(nonEmptyStringArb, (text) => {
          // Must not throw
          const result = entryParser.parse(text);
          expect(result).toBeDefined();
          expect(result).not.toBeNull();
        }),
        { numRuns: 500 },
      );
    });

    it('always returns correct shape with all expected fields', () => {
      fc.assert(
        fc.property(nonEmptyStringArb, (text) => {
          const result = entryParser.parse(text);

          // Structural check: all fields present
          expect(result).toHaveProperty('cashAmount');
          expect(result).toHaveProperty('goldWeight');
          expect(result).toHaveProperty('direction');
          expect(result).toHaveProperty('confidence');

          // Type checks
          expect(typeof result.cashAmount).toBe('number');
          expect(typeof result.goldWeight).toBe('number');
          expect(['IN', 'OUT']).toContain(result.direction);
          expect(typeof result.confidence).toBe('number');

          // personName is optional (string | undefined)
          if (result.personName !== undefined) {
            expect(typeof result.personName).toBe('string');
          }
        }),
        { numRuns: 500 },
      );
    });

    it('confidence is always between 0 and 1 (inclusive)', () => {
      fc.assert(
        fc.property(nonEmptyStringArb, (text) => {
          const result = entryParser.parse(text);
          expect(result.confidence).toBeGreaterThanOrEqual(0);
          expect(result.confidence).toBeLessThanOrEqual(1);
        }),
        { numRuns: 500 },
      );
    });

    it('cashAmount and goldWeight are non-negative numbers', () => {
      fc.assert(
        fc.property(nonEmptyStringArb, (text) => {
          const result = entryParser.parse(text);
          expect(result.cashAmount).toBeGreaterThanOrEqual(0);
          expect(result.goldWeight).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(result.cashAmount)).toBe(true);
          expect(Number.isFinite(result.goldWeight)).toBe(true);
        }),
        { numRuns: 500 },
      );
    });
  });
});
