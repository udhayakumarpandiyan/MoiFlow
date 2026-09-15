/**
 * Parses Tamil word numbers into numeric values.
 *
 * Handles:
 *   - Basic numbers: ஒன்று (1), பத்து (10), நூறு (100)
 *   - Compound numbers: ஐந்நூறு (500), இரண்டாயிரம் (2000)
 *   - Composite: இரண்டு ஆயிரம் ஐந்நூறு (2500)
 *   - Mixed: "2 ஆயிரம்" (2000)
 */

const TAMIL_NUMBERS: Record<string, number> = {
  'பூஜ்ஜியம்': 0,
  'பூஜ்யம்': 0,
  'ஒன்று': 1,
  'ஒரு': 1,
  'இரண்டு': 2,
  'இரு': 2,
  'மூன்று': 3,
  'மூ': 3,
  'நான்கு': 4,
  'ஐந்து': 5,
  'ஐ': 5,
  'ஆறு': 6,
  'ஏழு': 7,
  'எட்டு': 8,
  'ஒன்பது': 9,
  'பத்து': 10,
  'பதினொன்று': 11,
  'பன்னிரண்டு': 12,
  'பதின்மூன்று': 13,
  'பதினான்கு': 14,
  'பதினைந்து': 15,
  'பதினாறு': 16,
  'பதினேழு': 17,
  'பதினெட்டு': 18,
  'பத்தொன்பது': 19,
  'இருபது': 20,
  'முப்பது': 30,
  'நாற்பது': 40,
  'ஐம்பது': 50,
  'அறுபது': 60,
  'எழுபது': 70,
  'எண்பது': 80,
  'தொண்ணூறு': 90,
  'நூறு': 100,
  'ஆயிரம்': 1000,
  'லட்சம்': 100000,
};

// Compound Tamil numbers (e.g., ஐந்நூறு = 500)
const COMPOUND_NUMBERS: Record<string, number> = {
  'இருநூறு': 200,
  'முன்னூறு': 300,
  'நானூறு': 400,
  'ஐந்நூறு': 500,
  'அறுநூறு': 600,
  'எழுநூறு': 700,
  'எண்ணூறு': 800,
  'தொள்ளாயிரம்': 900,
  'ஓராயிரம்': 1000,
  'இரண்டாயிரம்': 2000,
  'மூவாயிரம்': 3000,
  'நாலாயிரம்': 4000,
  'ஐயாயிரம்': 5000,
  'ஆறாயிரம்': 6000,
  'ஏழாயிரம்': 7000,
  'எட்டாயிரம்': 8000,
  'ஒன்பதாயிரம்': 9000,
  'பதினாயிரம்': 10000,
  'இருபதாயிரம்': 20000,
  'முப்பதாயிரம்': 30000,
  'ஐம்பதாயிரம்': 50000,
  'ஒரு லட்சம்': 100000,
  'இரண்டு லட்சம்': 200000,
};

export class TamilNumberParser {
  /**
   * Parse a Tamil number text into a numeric value.
   * Returns 0 if nothing could be parsed.
   */
  parse(text: string): number {
    if (!text || !text.trim()) return 0;

    const normalized = text.trim().toLowerCase();

    // Try direct numeric value first
    const directNum = Number(normalized.replace(/,/g, ''));
    if (!isNaN(directNum) && directNum > 0) {
      return directNum;
    }

    // Try compound numbers first (longer matches)
    for (const [word, value] of Object.entries(COMPOUND_NUMBERS)) {
      if (normalized.includes(word)) {
        // Remove the compound part and parse the rest
        const remaining = normalized.replace(word, '').trim();
        if (remaining) {
          return value + this.parse(remaining);
        }
        return value;
      }
    }

    // Try pattern: "N ஆயிரம்" (N thousand) or "N நூறு" (N hundred)
    const multiplierMatch = normalized.match(/^(\d+)\s*(ஆயிரம்|நூறு|லட்சம்)/);
    if (multiplierMatch) {
      const num = Number(multiplierMatch[1]);
      const multiplier = TAMIL_NUMBERS[multiplierMatch[2]] ?? 1;
      const remaining = normalized.replace(multiplierMatch[0], '').trim();
      if (remaining) {
        return num * multiplier + this.parse(remaining);
      }
      return num * multiplier;
    }

    // Try Tamil word + multiplier: "இரண்டு ஆயிரம்"
    const words = normalized.split(/\s+/);
    let total = 0;
    let current = 0;

    for (const word of words) {
      const value = TAMIL_NUMBERS[word];
      if (value !== undefined) {
        if (value >= 100) {
          // Multiplier
          current = current === 0 ? value : current * value;
          total += current;
          current = 0;
        } else {
          current += value;
        }
      }
    }
    total += current;

    return total;
  }
}
