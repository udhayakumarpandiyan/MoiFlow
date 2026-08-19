/**
 * OCRService — On-device text recognition for invitation images.
 *
 * Uses @react-native-ml-kit/text-recognition when available.
 * Falls back gracefully when the native module is not installed,
 * returning a low-confidence result that prompts manual entry.
 */

export interface OCRResult {
  rawText: string;
  eventName: string | null;
  date: string | null;
  venue: string | null;
  confidence: number;
}

// Try to import ML Kit — may not be available
let TextRecognition: { recognize: (path: string) => Promise<any> } | null = null;
try {
  TextRecognition = require('@react-native-ml-kit/text-recognition').default;
} catch {
  // Package not installed — OCR will fall back to manual entry
}

export class OCRService {
  private static readonly EVENT_TYPE_KEYWORDS: ReadonlyArray<string> = [
    '\u0BA4\u0BBF\u0BB0\u0BC1\u0BAE\u0BA3\u0BAE\u0BCD',
    '\u0B95\u0BBE\u0BA4\u0BA3\u0BBF',
    '\u0BAA\u0BBF\u0BB1\u0BA8\u0BCD\u0BA4\u0BA8\u0BBE\u0BB3\u0BCD',
    '\u0BAE\u0BC1\u0BAA\u0BCD\u0BAA\u0BC2\u0B9A\u0BC8',
    '\u0BAA\u0BC1\u0BA4\u0BC1\u0BAE\u0BA9\u0BC8',
    '\u0B95\u0BB0\u0BC1\u0BAE\u0B95\u0BBE\u0BB0\u0BBF\u0BAF\u0BAE\u0BCD',
    '\u0BAE\u0B9E\u0BCD\u0B9A\u0BB3\u0BCD \u0BA8\u0BC0\u0BB0\u0BBE\u0B9F\u0BCD\u0B9F\u0BC1',
  ];

  private static readonly TAMIL_MONTHS: ReadonlyArray<[string, string]> = [
    ['\u0B9C\u0BA9\u0BB5\u0BB0\u0BBF', '01'],
    ['\u0BAA\u0BBF\u0BAA\u0BCD\u0BB0\u0BB5\u0BB0\u0BBF', '02'],
    ['\u0BAE\u0BBE\u0BB0\u0BCD\u0B9A\u0BCD', '03'],
    ['\u0B8F\u0BAA\u0BCD\u0BB0\u0BB2\u0BCD', '04'],
    ['\u0BAE\u0BC7', '05'],
    ['\u0B9C\u0BC2\u0BA9\u0BCD', '06'],
    ['\u0B9C\u0BC2\u0BB2\u0BC8', '07'],
    ['\u0B86\u0B95\u0BB8\u0BCD\u0B9F\u0BCD', '08'],
    ['\u0B9A\u0BC6\u0BAA\u0BCD\u0B9F\u0BAE\u0BCD\u0BAA\u0BB0\u0BCD', '09'],
    ['\u0B85\u0B95\u0BCD\u0B9F\u0BCB\u0BAA\u0BB0\u0BCD', '10'],
    ['\u0BA8\u0BB5\u0BAE\u0BCD\u0BAA\u0BB0\u0BCD', '11'],
    ['\u0B9F\u0BBF\u0B9A\u0BAE\u0BCD\u0BAA\u0BB0\u0BCD', '12'],
  ];

  private static readonly VENUE_INDICATORS: ReadonlyArray<string> = [
    '\u0BB9\u0BBE\u0BB2\u0BCD',
    '\u0BAE\u0BA3\u0BCD\u0B9F\u0BAA\u0BAE\u0BCD',
    '\u0B87\u0B9F\u0BAE\u0BCD',
  ];

  async processImage(imagePath: string): Promise<OCRResult> {
    if (!TextRecognition) {
      return {
        rawText: 'OCR module not available. Please enter details manually.',
        eventName: null,
        date: null,
        venue: null,
        confidence: 0.0,
      };
    }

    try {
      const result = await TextRecognition.recognize(imagePath);
      const rawText = (result.blocks || []).map((b: any) => b.text).join('\n');

      const eventName = this.extractEventName(rawText);
      const date = this.extractDate(rawText);
      const venue = this.extractVenue(rawText);
      const confidence = this.computeConfidence(eventName, date, venue);

      return { rawText, eventName, date, venue, confidence };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown OCR error';
      return {
        rawText: `OCR failed: ${msg}`,
        eventName: null,
        date: null,
        venue: null,
        confidence: 0.1,
      };
    }
  }

  private extractEventName(text: string): string | null {
    const normalized = text.toLowerCase();
    for (const keyword of OCRService.EVENT_TYPE_KEYWORDS) {
      if (normalized.includes(keyword)) return keyword;
    }
    return null;
  }

  private extractDate(text: string): string | null {
    const numericDMY = text.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (numericDMY) {
      return `${numericDMY[3]}-${numericDMY[2].padStart(2, '0')}-${numericDMY[1].padStart(2, '0')}`;
    }
    for (const [tamilMonth, monthNum] of OCRService.TAMIL_MONTHS) {
      const match = text.match(new RegExp(`(\\d{1,2})\\s*${tamilMonth}(?:\\s*(\\d{4}))?`));
      if (match) {
        const day = match[1].padStart(2, '0');
        const year = match[2] || new Date().getFullYear().toString();
        return `${year}-${monthNum}-${day}`;
      }
    }
    return null;
  }

  private extractVenue(text: string): string | null {
    for (const indicator of OCRService.VENUE_INDICATORS) {
      const idx = text.indexOf(indicator);
      if (idx !== -1) {
        const after = text.substring(idx + indicator.length).trim();
        const clause = after.match(/^[^,.\n]+/);
        const venue = clause ? clause[0].trim() : after.split('\n')[0]?.trim();
        if (venue && venue.length > 0) return `${indicator} ${venue}`;
      }
    }
    return null;
  }

  private computeConfidence(eventName: string | null, date: string | null, venue: string | null): number {
    const fields = [eventName, date, venue].filter(f => f !== null).length;
    if (fields >= 2) return 0.8;
    if (fields === 1) return 0.5;
    return 0.2;
  }
}

export const ocrService = new OCRService();