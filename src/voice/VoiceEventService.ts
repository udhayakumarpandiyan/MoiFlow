import { TamilSpeechRecognizer } from './TamilSpeechRecognizer';
import { TamilEventParser, ParsedVoiceEvent } from './TamilEventParser';
import { apiRequest } from '../api/ApiClient';

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

  async startListening(onText: (text: string) => void): Promise<void> {
    this.recognizer.onResult((text) => {
      console.log('[VoiceEventService] recognised:', text);
      onText(text);
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
      //console.warn('[VoiceEventService] NLU server unreachable — using local parser:', networkErr);
      const local = this.localParser.parse(text);
      return {
        eventName: local.eventName,
        eventType: local.eventType,
        date: local.date,
        venue: local.venue,
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
