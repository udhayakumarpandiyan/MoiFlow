import { TamilSpeechRecognizer } from './TamilSpeechRecognizer';
import { TamilEventParser, ParsedVoiceEvent } from './TamilEventParser';
import { apiRequest } from '@common/api/ApiClient';

/**
 * Orchestrates mic capture + NLU parsing for events.
 *
 * Flow:
 *   1. TamilSpeechRecognizer  — mic capture (native, lazy init)
 *   2. apiRequest             — POST to Python ai-backend for NLU event parsing
 *   3. On network failure     — fallback to local TamilEventParser
 */
export class VoiceEventService {
  private _recognizer: TamilSpeechRecognizer | null = null;
  private readonly localParser = new TamilEventParser();

  private get recognizer(): TamilSpeechRecognizer {
    if (!this._recognizer) {
      this._recognizer = new TamilSpeechRecognizer();
    }
    return this._recognizer;
  }

  async startListening(onText: (text: string) => void, onError?: (error: string) => void): Promise<void> {
    // Voice event capture is a Premium feature — enforce beyond the UI.
    const { assertPremiumFeature } = require('@common/subscription/featureGuard');
    const { PremiumFeature } = require('@common/subscription/subscriptionConfig');
    assertPremiumFeature(PremiumFeature.VoiceEntry);
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
  async parse(text: string): Promise<ParsedVoiceEvent> {
    if (!text.trim()) throw new Error('Text is empty');

    try {
      return await apiRequest<ParsedVoiceEvent>('/api/nlu/parse-event', {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
    } catch (networkErr) {
      const local = this.localParser.parse(text);
      return {
        eventName: local.eventName,
        eventType: local.eventType,
        date: local.date,
        time: local.time,
        venue: local.venue,
        villageName: local.villageName,
        confidence: local.confidence * 0.7,
      };
    }
  }

  destroy(): void {
    this._recognizer?.destroy();
    this._recognizer = null;
  }
}

export const voiceEventService = new VoiceEventService();
