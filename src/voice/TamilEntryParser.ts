import { TamilNumberParser } from './TamilNumberParser';

export interface ParsedVoiceEntry {
  personName?: string;
  villageName?: string;
  cashAmount: number;
  goldWeight: number;
  direction: 'IN' | 'OUT';
  confidence: number;
}

// Tamil number words that indicate a numeric value (used to detect amount boundary)
const TAMIL_AMOUNT_WORDS = new Set([
  'ஆயிரம்', 'நூறு', 'லட்சம்', 'பத்து', 'இருபது', 'முப்பது', 'நாற்பது',
  'ஐம்பது', 'அறுபது', 'எழுபது', 'எண்பது', 'தொண்ணூறு',
  'ஐந்நூறு', 'இருநூறு', 'முன்னூறு', 'நானூறு', 'அறுநூறு', 'எழுநூறு', 'எண்ணூறு',
  'தொள்ளாயிரம்', 'ஓராயிரம்', 'இரண்டாயிரம்', 'மூவாயிரம்', 'நாலாயிரம்',
  'ஐயாயிரம்', 'ஆறாயிரம்', 'ஏழாயிரம்', 'எட்டாயிரம்', 'ஒன்பதாயிரம்',
  'பதினாயிரம்', 'இருபதாயிரம்', 'முப்பதாயிரம்', 'ஐம்பதாயிரம்',
  'ஒன்று', 'ஒரு', 'இரண்டு', 'இரு', 'மூன்று', 'நான்கு', 'ஐந்து',
  'ஆறு', 'ஏழு', 'எட்டு', 'ஒன்பது',
]);

// Keywords that signal cash or gold amounts
const CASH_KEYWORDS = ['ரூபாய்', 'ரூபா', 'ரூ', 'rupees', 'rs'];
const GOLD_KEYWORDS = ['கிராம்', 'கிராம', 'gram', 'grams', 'gm', 'பவுன்', 'sovereign'];
const CONNECTOR_WORDS = new Set(['மற்றும்', 'and', 'உம்']);

/**
 * Local fallback parser for Tamil voice entry text.
 * Supports positional input: "village name amount"
 *
 * Examples:
 *   "முத்தரசன்குப்பம் கண்ணன் ஆயிரம்" → { village, name, cash: 1000 }
 *   "முத்தரசன்குப்பம் சுரேஷ் 1 கிராம்" → { village, name, gold: 1 }
 *   "முத்தரசன்குப்பம் கண்ணன் ரூபாய் 2000 மற்றும் 2 கிராம்" → { village, name, cash: 2000, gold: 2 }
 */
export class TamilEntryParser {
  private numberParser = new TamilNumberParser();

  parse(text: string): ParsedVoiceEntry {
    const trimmed = text.trim();
    if (!trimmed) {
      return { cashAmount: 0, goldWeight: 0, direction: 'IN', confidence: 0.1 };
    }

    // Determine direction
    const direction = this.extractDirection(trimmed.toLowerCase());

    // Try the positional parse first (most common pattern for this app)
    const positional = this.parsePositional(trimmed);
    if (positional && (positional.cashAmount > 0 || positional.goldWeight > 0)) {
      let confidence = 0.5;
      if (positional.personName) confidence += 0.2;
      if (positional.villageName) confidence += 0.2;
      if (positional.cashAmount > 0 || positional.goldWeight > 0) confidence += 0.1;
      return { ...positional, direction, confidence: Math.min(confidence, 1.0) };
    }

    // Fallback to keyword-based extraction
    const cashAmount = this.extractCash(trimmed.toLowerCase());
    const goldWeight = this.extractGold(trimmed.toLowerCase());
    const personName = this.extractPerson(trimmed);
    const villageName = this.extractVillage(trimmed);

    let confidence = 0.4;
    if (cashAmount > 0 || goldWeight > 0) confidence += 0.2;
    if (personName) confidence += 0.2;
    if (villageName) confidence += 0.1;

    return {
      personName,
      villageName,
      cashAmount,
      goldWeight,
      direction,
      confidence: Math.min(confidence, 1.0),
    };
  }

  /**
   * Positional parser: assumes format "village name amount [and amount2]"
   * Splits tokens from right side to detect amounts, then assigns remaining to village + name.
   */
  private parsePositional(text: string): ParsedVoiceEntry | null {
    const tokens = text.split(/\s+/);
    if (tokens.length < 2) return null;

    // Scan from right to find where the "amount part" begins
    let amountStartIdx = tokens.length;

    for (let i = tokens.length - 1; i >= 0; i--) {
      const token = tokens[i].toLowerCase();
      const isAmountToken =
        TAMIL_AMOUNT_WORDS.has(token) ||
        CASH_KEYWORDS.includes(token) ||
        GOLD_KEYWORDS.includes(token) ||
        CONNECTOR_WORDS.has(token) ||
        /^\d+(\.\d+)?$/.test(token);

      if (isAmountToken) {
        amountStartIdx = i;
      } else {
        // Stop scanning once we hit a non-amount token
        break;
      }
    }

    // Need at least 1 token before amount for a name
    if (amountStartIdx < 1) return null;

    // Split into identity tokens and amount tokens
    const identityTokens = tokens.slice(0, amountStartIdx);
    const amountText = tokens.slice(amountStartIdx).join(' ');

    if (!amountText) return null;

    // Parse amounts from the amount section
    const { cashAmount, goldWeight } = this.parseAmountSection(amountText);

    // If no amounts detected, this isn't a valid positional parse
    if (cashAmount === 0 && goldWeight === 0) return null;

    // Assign identity: first token = village (if 2+ identity tokens), last identity = name
    let villageName: string | undefined;
    let personName: string | undefined;

    if (identityTokens.length >= 2) {
      villageName = identityTokens[0];
      personName = identityTokens.slice(1).join(' ');
    } else if (identityTokens.length === 1) {
      personName = identityTokens[0];
    }

    return { personName, villageName, cashAmount, goldWeight, direction: 'IN', confidence: 0.7 };
  }

  /**
   * Parse the amount section for cash and gold values.
   * Handles: "ஆயிரம்", "2000", "ரூபாய் 2000 மற்றும் 2 கிராம்", "1 கிராம்", etc.
   */
  private parseAmountSection(text: string): { cashAmount: number; goldWeight: number } {
    let cashAmount = 0;
    let goldWeight = 0;

    // Split by connectors (மற்றும் / and)
    const parts = text.split(/\s*(?:மற்றும்|and|உம்)\s*/i);

    for (const part of parts) {
      const trimPart = part.trim().toLowerCase();
      if (!trimPart) continue;

      // Check if this part is gold
      const isGold = GOLD_KEYWORDS.some(kw => trimPart.includes(kw));
      // Check if this part is explicitly cash
      const isCash = CASH_KEYWORDS.some(kw => trimPart.includes(kw));

      // Extract the numeric value
      const numericValue = this.extractNumericValue(trimPart);

      if (isGold && numericValue > 0) {
        goldWeight += numericValue;
      } else if (isCash && numericValue > 0) {
        cashAmount += numericValue;
      } else if (numericValue > 0) {
        // No explicit unit — heuristic: values <= 50 with no cash keyword could be gold grams
        // But for this app, default to cash unless gold keyword present
        cashAmount += numericValue;
      }
    }

    return { cashAmount, goldWeight };
  }

  /**
   * Extract numeric value from text (handles Tamil words, digits, and mixed).
   */
  private extractNumericValue(text: string): number {
    // Remove unit keywords to get just the number part
    let numText = text;
    for (const kw of [...CASH_KEYWORDS, ...GOLD_KEYWORDS]) {
      numText = numText.replace(new RegExp(kw, 'gi'), '');
    }
    numText = numText.trim();

    if (!numText) {
      // The entire text might be a unit keyword after a number, try the original
      const digitMatch = text.match(/(\d+(?:\.\d+)?)/);
      if (digitMatch) return Number(digitMatch[1]);
      return 0;
    }

    // Try direct digit
    const directNum = Number(numText.replace(/,/g, ''));
    if (!isNaN(directNum) && directNum > 0) return directNum;

    // Try Tamil number parser
    return this.numberParser.parse(numText);
  }

  private extractDirection(text: string): 'IN' | 'OUT' {
    const outWords = [
      'கொடுத்தேன்', 'கொடுத்த', 'கொடுக்க', 'வழங்கினேன்',
      'செலவு', 'தந்தேன்', 'கொடுத்தோம்', 'gave', 'given', 'paid',
    ];
    for (const word of outWords) {
      if (text.includes(word)) return 'OUT';
    }

    const inWords = [
      'கொடுத்தார்', 'கொடுத்தார்கள்', 'வந்தது', 'பெற்றேன்',
      'பெற்றது', 'கிடைத்தது', 'கொடுத்தாங்க', 'தந்தார்', 'received', 'got',
    ];
    for (const word of inWords) {
      if (text.includes(word)) return 'IN';
    }

    return 'IN';
  }

  private extractCash(text: string): number {
    const numericMatch = text.match(/(\d+(?:,\d+)*(?:\.\d+)?)\s*(ரூபாய்|ரூபா|ரூ|rupees?|rs\.?)/i);
    if (numericMatch) return Number(numericMatch[1].replace(/,/g, ''));

    const tamilCashMatch = text.match(/(.+?)\s*(ரூபாய்|ரூபா|ரூ)/i);
    if (tamilCashMatch) {
      const parsed = this.numberParser.parse(tamilCashMatch[1].trim());
      if (parsed > 0) return parsed;
    }

    // Standalone digit (not followed by gold unit)
    const standaloneNum = text.match(/(\d+(?:,\d+)*(?:\.\d+)?)/);
    if (standaloneNum && !text.match(/கிராம்|கிராம|gram|gm|g\b/i)) {
      return Number(standaloneNum[1].replace(/,/g, ''));
    }

    return 0;
  }

  private extractGold(text: string): number {
    const numericMatch = text.match(/(\d+(?:\.\d+)?)\s*(கிராம்|கிராம|grams?|gm|g\b)/i);
    if (numericMatch) return Number(numericMatch[1]);

    const tamilGoldMatch = text.match(/(.+?)\s*(கிராம்|கிராம)/i);
    if (tamilGoldMatch) {
      const parsed = this.numberParser.parse(tamilGoldMatch[1].trim());
      if (parsed > 0) return parsed;
    }

    return 0;
  }

  private extractPerson(text: string): string | undefined {
    const normalized = text.trim();

    const startNameMatch = normalized.match(/^([^\d\s,]+(?:\s+[^\d\s,]+)?)\s+\d/);
    if (startNameMatch) {
      const candidate = startNameMatch[1].trim();
      if (this.isLikelyName(candidate)) return candidate;
    }

    const dativeMatch = normalized.match(/([^\s,]+?)க்கு/);
    if (dativeMatch && dativeMatch[1].trim().length >= 2) {
      return dativeMatch[1].trim();
    }

    return undefined;
  }

  private extractVillage(text: string): string | undefined {
    const normalized = text.trim();
    const villagePatterns = [
      /(?:ஊரு|ஊர்|கிராமம்|village)\s*:?\s*([^\d,]+?)(?:\s+\d|\s*$)/i,
      /(?:from|இருந்து)\s+([^\d,]+?)(?:\s+\d|\s*$)/i,
    ];

    for (const pattern of villagePatterns) {
      const match = normalized.match(pattern);
      if (match && match[1].trim().length >= 3) {
        return match[1].trim();
      }
    }

    return undefined;
  }

  /**
   * Check if a string looks like a person name (not a verb/number/keyword).
   */
  private isLikelyName(text: string): boolean {
    if (text.length < 2) return false;

    // Filter out common Tamil verbs and keywords that might be falsely matched
    const nonNameWords = [
      'நான்', 'நாம்', 'அவர்', 'இவர்', 'அவள்',
      'ரூபாய்', 'ரூபா', 'கிராம்', 'கிராம',
      'கொடுத்தேன்', 'கொடுத்தார்', 'வந்தது',
      'ஆயிரம்', 'நூறு', 'லட்சம்',
    ];

    return !nonNameWords.includes(text.toLowerCase());
  }
}
