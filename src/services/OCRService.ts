/**
 * OCRService — On-device text recognition for invitation images.
 *
 * Uses @react-native-ml-kit/text-recognition for on-device OCR (Google ML Kit).
 * Extracts Tamil event keywords, dates, and venue from recognized text.
 *
 * Fallback strategy:
 * 1. On-device ML Kit (@react-native-ml-kit/text-recognition) — works offline
 * 2. Backend API (Tesseract) — when available
 * 3. Graceful fallback — prompts manual entry
 */

import TextRecognition, { TextRecognitionScript } from '@react-native-ml-kit/text-recognition';

const API_BASE_URL = __DEV__
  ? 'http://192.168.0.3:8000'
  : 'https://api.moiflow.app';

export interface OCRResult {
  rawText: string;
  eventName: string | null;
  date: string | null;
  venue: string | null;
  confidence: number;
}

export class OCRService {
  private static readonly EVENT_TYPE_KEYWORDS: ReadonlyArray<[string, string]> = [
    ['\u0BA4\u0BBF\u0BB0\u0BC1\u0BAE\u0BA3\u0BAE\u0BCD', 'WEDDING'],           // திருமணம்
    ['\u0B95\u0BBE\u0BA4\u0BA3\u0BBF', 'EAR_PIERCING'],                         // காதணி
    ['\u0BAA\u0BBF\u0BB1\u0BA8\u0BCD\u0BA4\u0BA8\u0BBE\u0BB3\u0BCD', 'BIRTHDAY'], // பிறந்தநாள்
    ['\u0BAE\u0BC1\u0BAA\u0BCD\u0BAA\u0BC2\u0B9A\u0BC8', 'MUPPOOSAI_PADAYAL'],  // முப்பூசை
    ['\u0BAA\u0BC1\u0BA4\u0BC1\u0BAE\u0BA9\u0BC8', 'HOUSEWARMING'],             // புதுமனை
    ['\u0B95\u0BB0\u0BC1\u0BAE\u0B95\u0BBE\u0BB0\u0BBF\u0BAF\u0BAE\u0BCD', 'DEATH'], // கருமகாரியம்
    ['\u0BAE\u0B9E\u0BCD\u0B9A\u0BB3\u0BCD \u0BA8\u0BC0\u0BB0\u0BBE\u0B9F\u0BCD\u0B9F\u0BC1', 'MANJAL_NEERATTU'], // மஞ்சள் நீராட்டு
    // English keywords
    ['wedding', 'WEDDING'],
    ['marriage', 'WEDDING'],
    ['ear piercing', 'EAR_PIERCING'],
    ['birthday', 'BIRTHDAY'],
    ['housewarming', 'HOUSEWARMING'],
    ['gruhapravesam', 'HOUSEWARMING'],
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

  private static readonly ENGLISH_MONTHS: ReadonlyArray<[string, string]> = [
    ['january', '01'], ['february', '02'], ['march', '03'],
    ['april', '04'], ['may', '05'], ['june', '06'],
    ['july', '07'], ['august', '08'], ['september', '09'],
    ['october', '10'], ['november', '11'], ['december', '12'],
    ['jan', '01'], ['feb', '02'], ['mar', '03'],
    ['apr', '04'], ['jun', '06'], ['jul', '07'],
    ['aug', '08'], ['sep', '09'], ['oct', '10'],
    ['nov', '11'], ['dec', '12'],
  ];

  private static readonly VENUE_INDICATORS: ReadonlyArray<string> = [
    '\u0BB9\u0BBE\u0BB2\u0BCD',           // ஹால்
    '\u0BAE\u0BA3\u0BCD\u0B9F\u0BAA\u0BAE\u0BCD', // மண்டபம்
    '\u0B87\u0B9F\u0BAE\u0BCD',           // இடம்
    'hall',
    'mandapam',
    'kalyana mandapam',
    'marriage hall',
    'convention',
    'auditorium',
    'mahal',
  ];

  /**
   * Process an invitation image and extract event details.
   * Uses on-device ML Kit OCR (works offline).
   */
  async processImage(imagePath: string): Promise<OCRResult> {
    // Strategy 1: On-device ML Kit OCR
    try {
      const result = await this.processViaMLKit(imagePath);
      if (result.confidence > 0) {
        return result;
      }
    } catch (err) {
      // ML Kit unavailable or failed — try backend
    }

    // Strategy 2: Try backend API (Tesseract) if ML Kit fails
    try {
      const result = await this.processViaBackend(imagePath);
      if (result.confidence > 0) {
        return result;
      }
    } catch {
      // Backend unreachable
    }

    // Strategy 3: Graceful fallback
    return {
      rawText: 'Could not extract text from image.',
      eventName: null,
      date: null,
      venue: null,
      confidence: 0.0,
    };
  }

  /**
   * Process image using on-device @react-native-ml-kit/text-recognition.
   * Works completely offline — no server required.
   */
  private async processViaMLKit(imagePath: string): Promise<OCRResult> {
    // ML Kit expects a file path or URI
    const imageURI = imagePath.startsWith('file://') ? imagePath : `file://${imagePath}`;

    // Use LATIN script — ML Kit Latin model recognizes most scripts
    // including numbers and common patterns in Tamil invitations
    const result = await TextRecognition.recognize(imageURI, TextRecognitionScript.LATIN);

    const rawText = result.text || '';

    if (!rawText.trim()) {
      return { rawText: '', eventName: null, date: null, venue: null, confidence: 0.0 };
    }

    const eventName = this.extractEventName(rawText);
    const date = this.extractDate(rawText);
    const venue = this.extractVenue(rawText);
    const confidence = this.computeConfidence(eventName, date, venue);

    return { rawText, eventName, date, venue, confidence };
  }

  /**
   * Send image to backend API for OCR processing (Tesseract with Tamil support).
   */
  private async processViaBackend(imagePath: string): Promise<OCRResult> {
    const fileName = imagePath.split('/').pop() || 'invitation.jpg';

    const formData = new FormData();
    formData.append('file', {
      uri: imagePath.startsWith('file://') ? imagePath : `file://${imagePath}`,
      type: 'image/jpeg',
      name: fileName,
    } as any);

    const response = await fetch(`${API_BASE_URL}/api/ocr/process`, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    if (!response.ok) {
      throw new Error(`OCR API returned ${response.status}`);
    }

    const data = await response.json();
    return {
      rawText: data.raw_text || '',
      eventName: data.event_name || null,
      date: data.date || null,
      venue: data.venue || null,
      confidence: data.confidence || 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Text extraction helpers
  // ---------------------------------------------------------------------------

  private extractEventName(text: string): string | null {
    const normalized = text.toLowerCase();
    for (const [keyword, eventType] of OCRService.EVENT_TYPE_KEYWORDS) {
      if (normalized.includes(keyword.toLowerCase())) {
        return eventType;
      }
    }
    return null;
  }

  private extractDate(text: string): string | null {
    // Try DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
    const numericDMY = text.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (numericDMY) {
      const day = numericDMY[1].padStart(2, '0');
      const month = numericDMY[2].padStart(2, '0');
      const year = numericDMY[3];
      return `${year}-${month}-${day}`;
    }

    // Try YYYY-MM-DD (ISO format)
    const isoDate = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (isoDate) {
      return `${isoDate[1]}-${isoDate[2].padStart(2, '0')}-${isoDate[3].padStart(2, '0')}`;
    }

    // Try Tamil month names: "12 ஜூலை 2025" or "12 ஜூலை"
    for (const [tamilMonth, monthNum] of OCRService.TAMIL_MONTHS) {
      const match = text.match(new RegExp(`(\\d{1,2})\\s*${tamilMonth}(?:\\s*(\\d{4}))?`));
      if (match) {
        const day = match[1].padStart(2, '0');
        const year = match[2] || new Date().getFullYear().toString();
        return `${year}-${monthNum}-${day}`;
      }
    }

    // Try English month names: "12 July 2025", "July 12, 2025"
    const lower = text.toLowerCase();
    for (const [engMonth, monthNum] of OCRService.ENGLISH_MONTHS) {
      // "12 July 2025" or "12th July 2025"
      const match1 = lower.match(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+${engMonth}(?:\\s+(\\d{4}))?`));
      if (match1) {
        const day = match1[1].padStart(2, '0');
        const year = match1[2] || new Date().getFullYear().toString();
        return `${year}-${monthNum}-${day}`;
      }
      // "July 12, 2025" or "July 12 2025"
      const match2 = lower.match(new RegExp(`${engMonth}\\s+(\\d{1,2})(?:st|nd|rd|th)?[,\\s]+(\\d{4})?`));
      if (match2) {
        const day = match2[1].padStart(2, '0');
        const year = match2[2] || new Date().getFullYear().toString();
        return `${year}-${monthNum}-${day}`;
      }
    }

    return null;
  }

  private extractVenue(text: string): string | null {
    const lower = text.toLowerCase();
    for (const indicator of OCRService.VENUE_INDICATORS) {
      const idx = lower.indexOf(indicator.toLowerCase());
      if (idx !== -1) {
        const afterIndicator = text.substring(idx + indicator.length).trim();
        const clause = afterIndicator.match(/^[^,.\n]+/);
        const venue = clause ? clause[0].trim() : afterIndicator.split('\n')[0]?.trim();
        if (venue && venue.length > 0) {
          return `${text.substring(idx, idx + indicator.length)} ${venue}`.trim();
        }
      }
    }

    // Try to find venue on lines with "venue:", "place:", "at:", "location:"
    const venueLineMatch = text.match(/(?:venue|place|at|location)\s*[:]\s*(.+)/i);
    if (venueLineMatch) {
      return venueLineMatch[1].trim();
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
