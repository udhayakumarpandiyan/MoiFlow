import { TamilSpeechRecognizer } from './TamilSpeechRecognizer';
import { TamilEntryParser }      from './TamilEntryParser';
import { VoiceEntryResult }      from '../types/VoiceEntryResult';
import { parseVoiceText }        from '../api/NLUApi';

/**
 * Orchestrates mic capture + NLU parsing.
 *
 * Flow:
 *   1. TamilSpeechRecognizer  — mic capture (native, lazy init)
 *   2. parseVoiceText          — POST to Python ai-backend for NLU
 *   3. On network failure       — fallback to local TamilEntryParser
 */
export class VoiceEntryService {
  private _recognizer: TamilSpeechRecognizer | null = null;
  private readonly localParser = new TamilEntryParser();

  private get recognizer(): TamilSpeechRecognizer {
    if (!this._recognizer) {
      this._recognizer = new TamilSpeechRecognizer();
    }
    return this._recognizer;
  }

  /**
   * Check if voice recognition is available on this device.
   */
  static isAvailable(): boolean {
    return TamilSpeechRecognizer.isAvailable();
  }

  async startListening(onText: (text: string) => void, onError?: (error: string) => void): Promise<void> {
    this.recognizer.onResult((text) => {
      onText(text);
    });
    this.recognizer.onError((err) => {
      const msg = typeof err === 'string' ? err : err?.message ?? 'Speech recognition error';
      onError?.(msg);
    });
    await this.recognizer.start();
  }

  async stopListening(): Promise<void> {
    await this.recognizer.stop();
  }

  /**
   * Parse recognised text using the Python NLU backend.
   * Falls back to local regex parser if the server is unreachable.
   */
  async parse(text: string): Promise<VoiceEntryResult> {
    if (!text.trim()) throw new Error('Text is empty');

    try {
      return await parseVoiceText(text);
    } catch (networkErr) {
      //console.warn('[VoiceEntryService] NLU server unreachable — using local parser:', networkErr);
      const local = this.localParser.parse(text);
      return {
        personName: local.personName ?? null,
        villageName: local.villageName ?? null,
        direction:  local.direction,
        cashAmount: local.cashAmount,
        goldWeight: local.goldWeight,
        confidence: local.confidence * 0.7, // lower confidence for local parse
      };
    }
  }

  destroy(): void {
    this._recognizer?.destroy();
    this._recognizer = null;
  }
}