/**
 * Unit Tests: OCRService
 *
 * **Validates: Requirements 11.2, 11.4**
 *
 * Tests OCR text extraction post-processing, confidence thresholding,
 * and error handling for invalid images.
 */

jest.mock('@react-native-ml-kit/text-recognition', () => ({
  __esModule: true,
  default: {
    recognize: jest.fn(),
  },
}));

import TextRecognition from '@react-native-ml-kit/text-recognition';
import {OCRService} from '../../src/common/services/OCRService';
import type {OCRResult} from '../../src/common/services/OCRService';

const mockRecognize = TextRecognition.recognize as jest.MockedFunction<
  typeof TextRecognition.recognize
>;

describe('OCRService', () => {
  let service: OCRService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OCRService();
  });

  describe('processImage - text extraction', () => {
    it('concatenates all text blocks into rawText', async () => {
      mockRecognize.mockResolvedValue({
        text: '',
        blocks: [
          {text: 'திருமணம்', cornerPoints: [], frame: {x: 0, y: 0, width: 0, height: 0}, lines: []},
          {text: '15-06-2025', cornerPoints: [], frame: {x: 0, y: 0, width: 0, height: 0}, lines: []},
        ],
      });

      const result = await service.processImage('/path/to/image.jpg');

      expect(result.rawText).toBe('திருமணம்\n15-06-2025');
    });

    it('extracts event name from Tamil event keywords', async () => {
      mockRecognize.mockResolvedValue({
        text: '',
        blocks: [
          {text: 'திருமணம் அழைப்பிதழ்', cornerPoints: [], frame: {x: 0, y: 0, width: 0, height: 0}, lines: []},
        ],
      });

      const result = await service.processImage('/path/to/image.jpg');

      expect(result.eventName).toBe('திருமணம்');
    });

    it('extracts date in DD-MM-YYYY format', async () => {
      mockRecognize.mockResolvedValue({
        text: '',
        blocks: [
          {text: '15-06-2025', cornerPoints: [], frame: {x: 0, y: 0, width: 0, height: 0}, lines: []},
        ],
      });

      const result = await service.processImage('/path/to/image.jpg');

      expect(result.date).toBe('2025-06-15');
    });

    it('extracts date in DD/MM/YYYY format', async () => {
      mockRecognize.mockResolvedValue({
        text: '',
        blocks: [
          {text: '25/12/2024', cornerPoints: [], frame: {x: 0, y: 0, width: 0, height: 0}, lines: []},
        ],
      });

      const result = await service.processImage('/path/to/image.jpg');

      expect(result.date).toBe('2024-12-25');
    });

    it('extracts date from Tamil month names', async () => {
      const currentYear = new Date().getFullYear();
      mockRecognize.mockResolvedValue({
        text: '',
        blocks: [
          {text: '5 ஜூன்', cornerPoints: [], frame: {x: 0, y: 0, width: 0, height: 0}, lines: []},
        ],
      });

      const result = await service.processImage('/path/to/image.jpg');

      expect(result.date).toBe(`${currentYear}-06-05`);
    });

    it('extracts date from Tamil month names with year', async () => {
      mockRecognize.mockResolvedValue({
        text: '',
        blocks: [
          {text: '12 ஜனவரி 2026', cornerPoints: [], frame: {x: 0, y: 0, width: 0, height: 0}, lines: []},
        ],
      });

      const result = await service.processImage('/path/to/image.jpg');

      expect(result.date).toBe('2026-01-12');
    });

    it('extracts venue using ஹால் indicator', async () => {
      mockRecognize.mockResolvedValue({
        text: '',
        blocks: [
          {text: 'ஹால் சிவா திருமண மண்டபம்', cornerPoints: [], frame: {x: 0, y: 0, width: 0, height: 0}, lines: []},
        ],
      });

      const result = await service.processImage('/path/to/image.jpg');

      expect(result.venue).toBe('ஹால் சிவா திருமண மண்டபம்');
    });

    it('extracts venue using மண்டபம் indicator', async () => {
      mockRecognize.mockResolvedValue({
        text: '',
        blocks: [
          {text: 'மண்டபம் ராஜா', cornerPoints: [], frame: {x: 0, y: 0, width: 0, height: 0}, lines: []},
        ],
      });

      const result = await service.processImage('/path/to/image.jpg');

      expect(result.venue).toBe('மண்டபம் ராஜா');
    });

    it('extracts venue using இடம் indicator', async () => {
      mockRecognize.mockResolvedValue({
        text: '',
        blocks: [
          {text: 'இடம் சென்னை', cornerPoints: [], frame: {x: 0, y: 0, width: 0, height: 0}, lines: []},
        ],
      });

      const result = await service.processImage('/path/to/image.jpg');

      expect(result.venue).toBe('இடம் சென்னை');
    });
  });

  describe('processImage - confidence scoring', () => {
    it('returns confidence 0.8 when 2+ fields are extracted', async () => {
      mockRecognize.mockResolvedValue({
        text: '',
        blocks: [
          {text: 'திருமணம் 15-06-2025', cornerPoints: [], frame: {x: 0, y: 0, width: 0, height: 0}, lines: []},
        ],
      });

      const result = await service.processImage('/path/to/image.jpg');

      expect(result.confidence).toBe(0.8);
      expect(result.eventName).not.toBeNull();
      expect(result.date).not.toBeNull();
    });

    it('returns confidence 0.8 when all 3 fields are extracted', async () => {
      mockRecognize.mockResolvedValue({
        text: '',
        blocks: [
          {text: 'திருமணம் 15-06-2025 ஹால் ராஜா', cornerPoints: [], frame: {x: 0, y: 0, width: 0, height: 0}, lines: []},
        ],
      });

      const result = await service.processImage('/path/to/image.jpg');

      expect(result.confidence).toBe(0.8);
    });

    it('returns confidence 0.5 when exactly 1 field is extracted', async () => {
      mockRecognize.mockResolvedValue({
        text: '',
        blocks: [
          {text: 'திருமணம்', cornerPoints: [], frame: {x: 0, y: 0, width: 0, height: 0}, lines: []},
        ],
      });

      const result = await service.processImage('/path/to/image.jpg');

      expect(result.confidence).toBe(0.5);
      expect(result.eventName).not.toBeNull();
      expect(result.date).toBeNull();
      expect(result.venue).toBeNull();
    });

    it('returns confidence 0.2 when no fields are extracted', async () => {
      mockRecognize.mockResolvedValue({
        text: '',
        blocks: [
          {text: 'some random English text', cornerPoints: [], frame: {x: 0, y: 0, width: 0, height: 0}, lines: []},
        ],
      });

      const result = await service.processImage('/path/to/image.jpg');

      expect(result.confidence).toBe(0.2);
      expect(result.eventName).toBeNull();
      expect(result.date).toBeNull();
      expect(result.venue).toBeNull();
    });
  });

  describe('processImage - error handling', () => {
    it('returns low-confidence result when ML Kit throws', async () => {
      mockRecognize.mockRejectedValue(new Error('Image file not found'));

      const result = await service.processImage('/invalid/path.jpg');

      expect(result.confidence).toBe(0.1);
      expect(result.rawText).toContain('OCR failed');
      expect(result.rawText).toContain('Image file not found');
      expect(result.eventName).toBeNull();
      expect(result.date).toBeNull();
      expect(result.venue).toBeNull();
    });

    it('handles non-Error exceptions gracefully', async () => {
      mockRecognize.mockRejectedValue('Unknown failure');

      const result = await service.processImage('/invalid/path.jpg');

      expect(result.confidence).toBe(0.1);
      expect(result.rawText).toContain('OCR failed');
      expect(result.rawText).toContain('Unknown OCR error');
    });

    it('handles empty blocks array', async () => {
      mockRecognize.mockResolvedValue({
        text: '',
        blocks: [],
      });

      const result = await service.processImage('/path/to/blank.jpg');

      expect(result.rawText).toBe('');
      expect(result.confidence).toBe(0.2);
      expect(result.eventName).toBeNull();
      expect(result.date).toBeNull();
      expect(result.venue).toBeNull();
    });
  });

  describe('processImage - full integration scenario', () => {
    it('extracts all fields from a realistic Tamil invitation', async () => {
      mockRecognize.mockResolvedValue({
        text: '',
        blocks: [
          {text: 'திருமணம் அழைப்பிதழ்', cornerPoints: [], frame: {x: 0, y: 0, width: 0, height: 0}, lines: []},
          {text: 'நாள்: 20-03-2025', cornerPoints: [], frame: {x: 0, y: 0, width: 0, height: 0}, lines: []},
          {text: 'இடம் சிவா திருமண மண்டபம்', cornerPoints: [], frame: {x: 0, y: 0, width: 0, height: 0}, lines: []},
        ],
      });

      const result = await service.processImage('/path/to/invitation.jpg');

      expect(result.eventName).toBe('திருமணம்');
      expect(result.date).toBe('2025-03-20');
      expect(result.venue).toBe('இடம் சிவா திருமண மண்டபம்');
      expect(result.confidence).toBe(0.8);
    });

    it('indicates low confidence for manual entry fallback when confidence < 0.3', async () => {
      mockRecognize.mockResolvedValue({
        text: '',
        blocks: [
          {text: 'blurry unreadable text', cornerPoints: [], frame: {x: 0, y: 0, width: 0, height: 0}, lines: []},
        ],
      });

      const result = await service.processImage('/path/to/blurry.jpg');

      // confidence 0.2 < 0.3 threshold means caller should fall back to manual entry
      expect(result.confidence).toBeLessThan(0.3);
    });
  });
});
