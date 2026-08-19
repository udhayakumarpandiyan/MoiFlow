/**
 * Unit Tests: TamilEventParser
 *
 * Validates the local regex-based Tamil event parser extracts
 * event type, date, venue, and event name correctly from Tamil text.
 *
 * **Validates: Requirements 10.3**
 */

import { TamilEventParser, ParsedVoiceEvent } from '../../src/voice/TamilEventParser';

describe('TamilEventParser', () => {
  let parser: TamilEventParser;

  beforeEach(() => {
    parser = new TamilEventParser();
  });

  describe('Event Type Extraction', () => {
    it('detects WEDDING from திருமணம்', () => {
      const result = parser.parse('ராஜா திருமணம் நாளை');
      expect(result.eventType).toBe('WEDDING');
    });

    it('detects EAR_PIERCING from காதணி', () => {
      const result = parser.parse('குழந்தை காதணி விழா');
      expect(result.eventType).toBe('EAR_PIERCING');
    });

    it('detects BIRTHDAY from பிறந்தநாள்', () => {
      const result = parser.parse('ரமேஷ் பிறந்தநாள்');
      expect(result.eventType).toBe('BIRTHDAY');
    });

    it('detects MUPPOOSAI_PADAYAL from முப்பூசை', () => {
      const result = parser.parse('முப்பூசை நிகழ்ச்சி');
      expect(result.eventType).toBe('MUPPOOSAI_PADAYAL');
    });

    it('detects HOUSEWARMING from புதுமனை', () => {
      const result = parser.parse('புதுமனை புகுவிழா');
      expect(result.eventType).toBe('HOUSEWARMING');
    });

    it('detects DEATH from கருமகாரியம்', () => {
      const result = parser.parse('கருமகாரியம் நிகழ்வு');
      expect(result.eventType).toBe('DEATH');
    });

    it('detects MANJAL_NEERATTU from மஞ்சள் நீராட்டு', () => {
      const result = parser.parse('மஞ்சள் நீராட்டு விழா');
      expect(result.eventType).toBe('MANJAL_NEERATTU');
    });

    it('returns null when no event type keyword found', () => {
      const result = parser.parse('ஏதோ நிகழ்வு நடக்கிறது');
      expect(result.eventType).toBeNull();
    });
  });

  describe('Date Extraction', () => {
    it('extracts DD-MM-YYYY format', () => {
      const result = parser.parse('திருமணம் 15-06-2025');
      expect(result.date).toBe('2025-06-15');
    });

    it('extracts DD/MM/YYYY format', () => {
      const result = parser.parse('திருமணம் 03/12/2024');
      expect(result.date).toBe('2024-12-03');
    });

    it('extracts YYYY-MM-DD ISO format', () => {
      const result = parser.parse('திருமணம் 2025-01-20');
      expect(result.date).toBe('2025-01-20');
    });

    it('extracts Tamil month name with day', () => {
      const result = parser.parse('திருமணம் 15 ஜனவரி 2025');
      expect(result.date).toBe('2025-01-15');
    });

    it('extracts Tamil month name without year (defaults to current year)', () => {
      const result = parser.parse('திருமணம் 10 மார்ச்');
      const currentYear = new Date().getFullYear();
      expect(result.date).toBe(`${currentYear}-03-10`);
    });

    it('extracts relative date நாளை (tomorrow)', () => {
      const result = parser.parse('திருமணம் நாளை');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const expected = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
      expect(result.date).toBe(expected);
    });

    it('extracts relative date அடுத்த வாரம் (next week)', () => {
      const result = parser.parse('திருமணம் அடுத்த வாரம்');
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      const expected = `${nextWeek.getFullYear()}-${String(nextWeek.getMonth() + 1).padStart(2, '0')}-${String(nextWeek.getDate()).padStart(2, '0')}`;
      expect(result.date).toBe(expected);
    });

    it('returns null when no date pattern found', () => {
      const result = parser.parse('திருமணம் விழா');
      expect(result.date).toBeNull();
    });
  });

  describe('Venue Extraction', () => {
    it('extracts venue after இடம்', () => {
      const result = parser.parse('திருமணம் இடம் கல்யாண மண்டபம்');
      expect(result.venue).not.toBeNull();
      expect(result.venue).toContain('கல்யாண மண்டபம்');
    });

    it('extracts venue after ஹால்', () => {
      const result = parser.parse('திருமணம் ஹால் சரஸ்வதி ஹால்');
      expect(result.venue).not.toBeNull();
    });

    it('extracts venue after மண்டபம்', () => {
      const result = parser.parse('திருமணம் மண்டபம் அருள் திருமண மாளிகை');
      expect(result.venue).not.toBeNull();
    });

    it('stops at clause boundary (comma)', () => {
      const result = parser.parse('திருமணம் இடம் அருள் மண்டபம், 15-06-2025');
      expect(result.venue).toBe('அருள் மண்டபம்');
    });

    it('returns null when no venue keyword found', () => {
      const result = parser.parse('திருமணம் நாளை');
      expect(result.venue).toBeNull();
    });
  });

  describe('Confidence Scoring', () => {
    it('returns 0.9 when type and date found', () => {
      const result = parser.parse('திருமணம் 15-06-2025');
      expect(result.confidence).toBe(0.9);
    });

    it('returns 0.6 when only type found', () => {
      const result = parser.parse('திருமணம் விழா');
      expect(result.confidence).toBe(0.6);
    });

    it('returns 0.3 when neither type nor date found', () => {
      const result = parser.parse('ஏதோ நிகழ்வு');
      expect(result.confidence).toBe(0.3);
    });
  });

  describe('Resilience - Never Throws', () => {
    it('handles single character input', () => {
      expect(() => parser.parse('a')).not.toThrow();
    });

    it('handles whitespace-only input after trim is non-empty', () => {
      const result = parser.parse(' x ');
      expect(result).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });

    it('handles very long input', () => {
      const longText = 'திருமணம் '.repeat(1000);
      expect(() => parser.parse(longText)).not.toThrow();
    });

    it('handles special characters', () => {
      expect(() => parser.parse('!@#$%^&*()[]{}|\\/<>')).not.toThrow();
    });

    it('handles mixed Tamil and English', () => {
      const result = parser.parse('Raja wedding திருமணம் at hall');
      expect(result.eventType).toBe('WEDDING');
    });

    it('returns valid ParsedVoiceEvent structure for any input', () => {
      const result = parser.parse('random text');
      expect(result).toHaveProperty('eventName');
      expect(result).toHaveProperty('eventType');
      expect(result).toHaveProperty('date');
      expect(result).toHaveProperty('venue');
      expect(result).toHaveProperty('confidence');
      expect(typeof result.confidence).toBe('number');
    });
  });

  describe('Event Name Extraction', () => {
    it('extracts remaining text as event name', () => {
      const result = parser.parse('ராஜா திருமணம்');
      expect(result.eventName).not.toBeNull();
      expect(result.eventName).toContain('ராஜா');
    });

    it('returns null when all text is consumed by other fields', () => {
      const result = parser.parse('திருமணம்');
      expect(result.eventName).toBeNull();
    });
  });
});
