export interface ParsedVoiceEvent {
  eventName: string | null;
  eventType: string | null;
  date: string | null;
  time: string | null;
  venue: string | null;
  villageName: string | null;
  confidence: number;
}

/**
 * Local regex-based Tamil event parser.
 *
 * Extracts event type, date, venue, and event name
 * from Tamil voice-recognised text. Used as a fallback
 * when the NLU backend is unreachable.
 *
 * Must never throw for any non-empty string input.
 */
export class TamilEventParser {
  private static readonly EVENT_TYPE_MAP: ReadonlyArray<[string, string]> = [
    ['திருமணம்', 'WEDDING'],
    ['காதணி', 'EAR_PIERCING'],
    ['பிறந்தநாள்', 'BIRTHDAY'],
    ['முப்பூசை', 'MUPPOOSAI_PADAYAL'],
    ['புதுமனை', 'HOUSEWARMING'],
    ['கருமகாரியம்', 'DEATH'],
    ['மஞ்சள் நீராட்டு', 'MANJAL_NEERATTU'],
  ];

  private static readonly TAMIL_MONTHS: ReadonlyArray<[string, string]> = [
    ['ஜனவரி', '01'],
    ['பிப்ரவரி', '02'],
    ['மார்ச்', '03'],
    ['ஏப்ரல்', '04'],
    ['மே', '05'],
    ['ஜூன்', '06'],
    ['ஜூலை', '07'],
    ['ஆகஸ்ட்', '08'],
    ['செப்டம்பர்', '09'],
    ['அக்டோபர்', '10'],
    ['நவம்பர்', '11'],
    ['டிசம்பர்', '12'],
  ];

  private static readonly VENUE_KEYWORDS = ['இடம்', 'ஹால்', 'மண்டபம்', 'hall', 'mandapam', 'mahal'];

  private static readonly VILLAGE_KEYWORDS = ['ஊர்', 'ஊரு', 'கிராமம்', 'village'];

  private static readonly TIME_PATTERNS: ReadonlyArray<[RegExp, (m: RegExpMatchArray) => string]> = [
    // "10:30" or "10.30"
    [/(\d{1,2})[:.]\s*(\d{2})\s*(am|pm|AM|PM)?/, (m) => {
      let h = parseInt(m[1], 10);
      const min = m[2];
      const ampm = m[3]?.toLowerCase();
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      return `${String(h).padStart(2, '0')}:${min}`;
    }],
    // "மணி 10" or "10 மணி"
    [/(\d{1,2})\s*மணி/, (m) => `${m[1].padStart(2, '0')}:00`],
    [/மணி\s*(\d{1,2})/, (m) => `${m[1].padStart(2, '0')}:00`],
    // "காலை 10 மணி" (morning) or "மாலை 5 மணி" (evening)
    [/காலை\s*(\d{1,2})/, (m) => `${m[1].padStart(2, '0')}:00`],
    [/மாலை\s*(\d{1,2})/, (m) => `${String(parseInt(m[1], 10) + 12).padStart(2, '0')}:00`],
    [/இரவு\s*(\d{1,2})/, (m) => `${String(parseInt(m[1], 10) + 12).padStart(2, '0')}:00`],
    // English: "5 pm", "10 am"
    [/(\d{1,2})\s*(am|pm|AM|PM)/, (m) => {
      let h = parseInt(m[1], 10);
      if (m[2].toLowerCase() === 'pm' && h < 12) h += 12;
      if (m[2].toLowerCase() === 'am' && h === 12) h = 0;
      return `${String(h).padStart(2, '0')}:00`;
    }],
  ];

  parse(text: string): ParsedVoiceEvent {
    try {
      const normalized = text.trim().toLowerCase();

      const eventType = this.extractEventType(normalized);
      const date = this.extractDate(normalized);
      const time = this.extractTime(normalized);
      const venue = this.extractVenue(normalized);
      const villageName = this.extractVillage(normalized);
      const eventName = this.extractEventName(normalized, eventType, date, venue);

      const confidence = this.computeConfidence(eventType, date);

      return {
        eventName,
        eventType,
        date,
        time,
        venue,
        villageName,
        confidence,
      };
    } catch {
      // Must never throw for any non-empty string input
      return {
        eventName: null,
        eventType: null,
        date: null,
        time: null,
        venue: null,
        villageName: null,
        confidence: 0.3,
      };
    }
  }

  private extractEventType(text: string): string | null {
    for (const [keyword, type] of TamilEventParser.EVENT_TYPE_MAP) {
      if (text.includes(keyword)) {
        return type;
      }
    }
    return null;
  }

  private extractDate(text: string): string | null {
    // Try numeric date patterns first: DD-MM-YYYY, DD/MM/YYYY
    const numericDMY = text.match(
      /(\d{1,2})[-/](\d{1,2})[-/](\d{4})/,
    );
    if (numericDMY) {
      const day = numericDMY[1].padStart(2, '0');
      const month = numericDMY[2].padStart(2, '0');
      const year = numericDMY[3];
      return `${year}-${month}-${day}`;
    }

    // Try YYYY-MM-DD (ISO format)
    const isoDate = text.match(
      /(\d{4})-(\d{1,2})-(\d{1,2})/,
    );
    if (isoDate) {
      const year = isoDate[1];
      const month = isoDate[2].padStart(2, '0');
      const day = isoDate[3].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    // Try Tamil month names with day and optional year
    for (const [tamilMonth, monthNum] of TamilEventParser.TAMIL_MONTHS) {
      const monthPattern = new RegExp(
        `(\\d{1,2})\\s*${tamilMonth}(?:\\s*(\\d{4}))?`,
      );
      const match = text.match(monthPattern);
      if (match) {
        const day = match[1].padStart(2, '0');
        const year = match[2] || new Date().getFullYear().toString();
        return `${year}-${monthNum}-${day}`;
      }
    }

    // Try relative date keywords
    if (text.includes('நாளை')) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return this.formatDate(tomorrow);
    }

    if (text.includes('அடுத்த வாரம்')) {
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      return this.formatDate(nextWeek);
    }

    return null;
  }

  private extractVenue(text: string): string | null {
    for (const keyword of TamilEventParser.VENUE_KEYWORDS) {
      const index = text.indexOf(keyword);
      if (index !== -1) {
        const afterKeyword = text.substring(index + keyword.length).trim();
        const clauseMatch = afterKeyword.match(/^[^,.\n।]+/);
        const venue = clauseMatch ? clauseMatch[0].trim() : afterKeyword.trim();
        if (venue.length > 0) {
          return venue;
        }
      }
    }
    return null;
  }

  private extractTime(text: string): string | null {
    for (const [pattern, formatter] of TamilEventParser.TIME_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        return formatter(match);
      }
    }
    return null;
  }

  private extractVillage(text: string): string | null {
    for (const keyword of TamilEventParser.VILLAGE_KEYWORDS) {
      const index = text.indexOf(keyword);
      if (index !== -1) {
        // Try text after the keyword
        const afterKeyword = text.substring(index + keyword.length).trim();
        const clauseMatch = afterKeyword.match(/^[^,.\n।]+/);
        const village = clauseMatch ? clauseMatch[0].trim() : afterKeyword.split(/\s+/)[0]?.trim();
        if (village && village.length > 1) {
          return village;
        }
        // Try text before the keyword (e.g., "முத்தரசன்குப்பம் ஊர்")
        const beforeKeyword = text.substring(0, index).trim();
        const lastWord = beforeKeyword.split(/\s+/).pop();
        if (lastWord && lastWord.length > 2) {
          return lastWord;
        }
      }
    }
    return null;
  }

  private extractEventName(
    text: string,
    eventType: string | null,
    date: string | null,
    venue: string | null,
  ): string | null {
    // Remove matched portions to find remaining meaningful text
    let remaining = text;

    // Remove event type keyword
    if (eventType) {
      for (const [keyword, type] of TamilEventParser.EVENT_TYPE_MAP) {
        if (type === eventType) {
          remaining = remaining.replace(keyword, '');
          break;
        }
      }
    }

    // Remove date patterns (numeric)
    remaining = remaining.replace(
      /\d{1,2}[-/]\d{1,2}[-/]\d{4}/g,
      '',
    );
    remaining = remaining.replace(
      /\d{4}-\d{1,2}-\d{1,2}/g,
      '',
    );

    // Remove Tamil month patterns
    for (const [tamilMonth] of TamilEventParser.TAMIL_MONTHS) {
      remaining = remaining.replace(
        new RegExp(`\\d{1,2}\\s*${tamilMonth}(?:\\s*\\d{4})?`, 'g'),
        '',
      );
    }

    // Remove relative date words
    remaining = remaining.replace('நாளை', '');
    remaining = remaining.replace('அடுத்த வாரம்', '');

    // Remove venue portion
    if (venue) {
      for (const keyword of TamilEventParser.VENUE_KEYWORDS) {
        const venuePattern = new RegExp(
          `${keyword}\\s*[^,.\n।]*`,
        );
        remaining = remaining.replace(venuePattern, '');
      }
    }

    // Clean up the remaining text
    remaining = remaining
      .replace(/\s+/g, ' ')
      .trim();

    // Return remaining text as event name if substantial
    if (remaining.length > 1) {
      return remaining;
    }

    return null;
  }

  private computeConfidence(
    eventType: string | null,
    date: string | null,
  ): number {
    if (eventType && date) {
      return 0.9;
    }
    if (eventType) {
      return 0.6;
    }
    return 0.3;
  }

  private formatDate(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
