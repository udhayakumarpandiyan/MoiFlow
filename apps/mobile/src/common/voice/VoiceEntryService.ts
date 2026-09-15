import { TamilSpeechRecognizer } from './TamilSpeechRecognizer';
import { TamilEntryParser }      from './TamilEntryParser';
import { VoiceEntryResult }      from '@common/types/VoiceEntryResult';
import { parseVoiceText }        from '@common/api/NLUApi';
import { assertPremiumFeature }  from '@common/subscription/featureGuard';
import { PremiumFeature }        from '@common/subscription/subscriptionConfig';

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

  async startListening(
    onText: (text: string) => void,
    onError?: (error: string) => void,
    locale: string = 'ta-IN',
  ): Promise<void> {
    // Voice entry is a Premium feature — enforce beyond the UI.
    assertPremiumFeature(PremiumFeature.VoiceEntry);
    this.recognizer.onResult((text) => {
      onText(text);
    });
    this.recognizer.onError((err) => {
      const msg = typeof err === 'string' ? err : err?.message ?? 'Speech recognition error';
      onError?.(msg);
    });
    await this.recognizer.start(locale);
  }

  async stopListening(): Promise<void> {
    await this.recognizer.stop();
  }

  /**
   * Parse recognised text into an entry.
   *
   * Strategy:
   *   - Always run the local Tamil parser, which is the ONLY source of
   *     person name and village name (the backend NLU currently returns
   *     personName = null).
   *   - Try the backend NLU for direction/cash/gold; if it succeeds, use its
   *     amounts when they are present, otherwise fall back to the local values.
   *   - This guarantees person/village are prefilled even when the backend is
   *     reachable, and everything still works fully offline.
   */
  async parse(text: string): Promise<VoiceEntryResult> {
    if (!text.trim()) throw new Error('Text is empty');

    const local = this.localParser.parse(text);

    try {
      const remote = await parseVoiceText(text);

      return {
        // Person / village: prefer whichever is non-empty (local is primary).
        personName: local.personName ?? remote.personName ?? null,
        villageName: local.villageName ?? remote.villageName ?? null,
        // Direction / amounts: prefer backend values when present.
        direction: remote.direction ?? local.direction,
        cashAmount: remote.cashAmount > 0 ? remote.cashAmount : local.cashAmount,
        goldWeight: remote.goldWeight > 0 ? remote.goldWeight : local.goldWeight,
        confidence: Math.max(remote.confidence, local.confidence),
      };
    } catch (networkErr) {
      // Backend unreachable — use the local parser result directly.
      return {
        personName: local.personName ?? null,
        villageName: local.villageName ?? null,
        direction: local.direction,
        cashAmount: local.cashAmount,
        goldWeight: local.goldWeight,
        confidence: local.confidence * 0.7,
      };
    }
  }

  destroy(): void {
    this._recognizer?.destroy();
    this._recognizer = null;
  }
}