import { NativeModules, NativeEventEmitter, Platform, PermissionsAndroid } from 'react-native';

/**
 * Wrapper around the @react-native-voice/voice native module.
 *
 * NOTE: This library requires the OLD React Native architecture.
 * gradle.properties must have: newArchEnabled=false
 *
 * The native module is registered as "RCTVoice" which React Native exposes as
 * NativeModules.Voice (standard RCT prefix stripping).
 */

type SpeechEvent = {
  value?: string[];
  error?: { message?: string; code?: string } | string;
};

/**
 * Android SpeechRecognizer error codes that indicate "no speech matched"
 * rather than a fatal failure. We retry on these.
 */
const RETRYABLE_ERROR_CODES = ['7', '11'];
const MAX_RETRIES = 2;

export class TamilSpeechRecognizer {
  private emitter: NativeEventEmitter | null = null;
  private listeners: any[] = [];
  private onResultCallback: ((text: string) => void) | null = null;
  private onErrorCallback: ((error: any) => void) | null = null;
  private isListening = false;
  /** Tracks the best partial result received before a final result or error */
  private lastPartialResult: string = '';
  /** Current locale for auto-retry */
  private currentLocale: string = 'ta-IN';
  /** Retry count for the current listening session */
  private retryCount: number = 0;

  /**
   * Check if the voice native module is available at runtime.
   */
  static isAvailable(): boolean {
    return !!(NativeModules.Voice || NativeModules.RCTVoice);
  }

  private getNativeVoice(): any {
    const mod = NativeModules.Voice ?? NativeModules.RCTVoice;
    if (!mod) {
      throw new Error('VOICE_MODULE_UNAVAILABLE');
    }
    return mod;
  }

  /**
   * Request RECORD_AUDIO permission on Android.
   */
  async requestMicrophonePermission(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true;
    }

    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission',
          message: 'MoiFlow needs access to your microphone for voice entry.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      return false;
    }
  }

  onResult(callback: (text: string) => void): void {
    this.onResultCallback = callback;
  }

  onError(callback: (error: any) => void): void {
    this.onErrorCallback = callback;
  }

  async start(locale: string = 'ta-IN'): Promise<void> {
    this.currentLocale = locale;
    this.retryCount = 0;
    this.lastPartialResult = '';
    await this.startInternal(locale);
  }

  private async startInternal(locale: string): Promise<void> {
    const nativeVoice = this.getNativeVoice();

    // Request microphone permission (only on first start, not retries)
    if (this.retryCount === 0) {
      const hasPermission = await this.requestMicrophonePermission();
      if (!hasPermission) {
        throw new Error('MICROPHONE_PERMISSION_DENIED');
      }
    }

    // Set up NativeEventEmitter
    // Pass undefined instead of the native module to avoid the warning about
    // missing addListener/removeListeners methods on newer RN versions.
    // Events still work because the native module dispatches them globally.
    if (!this.emitter) {
      this.emitter = new NativeEventEmitter();
    }

    // Remove any previous listeners
    this.removeListeners();

    // Register event listeners
    this.listeners = [
      this.emitter.addListener('onSpeechResults', (event: SpeechEvent) => {
        const text = event.value?.[0] ?? '';
        if (text && this.onResultCallback) {
          this.isListening = false;
          this.lastPartialResult = '';
          this.retryCount = 0;
          this.onResultCallback(text);
        }
      }),
      this.emitter.addListener('onSpeechPartialResults', (event: SpeechEvent) => {
        const text = event.value?.[0] ?? '';
        if (text) {
          this.lastPartialResult = text;
        }
      }),
      this.emitter.addListener('onSpeechError', (event: SpeechEvent) => {
        this.isListening = false;
        const errorCode = this.extractErrorCode(event.error);
        const isRetryable = RETRYABLE_ERROR_CODES.includes(errorCode);

        // If we have a partial result captured, use it as the final result
        if (isRetryable && this.lastPartialResult.trim()) {
          const text = this.lastPartialResult.trim();
          this.lastPartialResult = '';
          this.retryCount = 0;
          this.onResultCallback?.(text);
          return;
        }

        // If retryable and we haven't exceeded retries, try again automatically
        if (isRetryable && this.retryCount < MAX_RETRIES) {
          this.retryCount++;
          // Small delay before retry to let the system settle
          setTimeout(() => {
            this.startInternal(this.currentLocale).catch(() => {
              this.onErrorCallback?.('SPEECH_NOT_AVAILABLE');
            });
          }, 300);
          return;
        }

        // Non-retryable error or retries exhausted
        this.retryCount = 0;
        this.lastPartialResult = '';
        const errorMsg = typeof event.error === 'string'
          ? event.error
          : event.error?.message ?? 'Speech recognition error';
        this.onErrorCallback?.(errorMsg);
      }),
      this.emitter.addListener('onSpeechEnd', () => {
        this.isListening = false;
      }),
    ];

    // Start speech recognition
    await new Promise<void>((resolve, reject) => {
      const callback = (error: string | null) => {
        if (error) {
          this.isListening = false;
          reject(new Error(error));
        } else {
          this.isListening = true;
          resolve();
        }
      };

      if (Platform.OS === 'android') {
        nativeVoice.startSpeech(
          locale,
          {
            EXTRA_LANGUAGE_MODEL: 'LANGUAGE_MODEL_FREE_FORM',
            EXTRA_MAX_RESULTS: 5,
            EXTRA_PARTIAL_RESULTS: true,
            REQUEST_PERMISSIONS_AUTO: true,
          },
          callback,
        );
      } else {
        nativeVoice.startSpeech(locale, callback);
      }
    });
  }

  /**
   * Extract numeric error code from the speech error event.
   * Android errors come as "11/Didn't understand" or { code: "11", message: "..." }
   */
  private extractErrorCode(error: SpeechEvent['error']): string {
    if (!error) return '';
    if (typeof error === 'string') {
      // Format: "11/Didn't understand, please try again."
      const match = error.match(/^(\d+)\//);
      return match ? match[1] : '';
    }
    return error.code ?? '';
  }

  async stop(): Promise<void> {
    if (!this.isListening) {
      this.removeListeners();
      return;
    }

    try {
      const nativeVoice = this.getNativeVoice();
      await new Promise<void>((resolve, reject) => {
        nativeVoice.stopSpeech((error: string | null) => {
          if (error) reject(new Error(error));
          else resolve();
        });
      });
    } catch (_) {
      // Ignore — stop() can throw if recognition ended naturally
    } finally {
      this.isListening = false;
      this.removeListeners();
    }
  }

  async cancel(): Promise<void> {
    try {
      const nativeVoice = this.getNativeVoice();
      await new Promise<void>((resolve, reject) => {
        nativeVoice.cancelSpeech((error: string | null) => {
          if (error) reject(new Error(error));
          else resolve();
        });
      });
    } catch (_) {}
    finally {
      this.isListening = false;
      this.removeListeners();
    }
  }

  destroy(): void {
    this.removeListeners();
    try {
      const nativeVoice = this.getNativeVoice();
      nativeVoice.destroySpeech(() => {});
    } catch (_) {}
    this.emitter = null;
    this.isListening = false;
    this.lastPartialResult = '';
    this.retryCount = 0;
    this.onResultCallback = null;
    this.onErrorCallback = null;
  }

  private removeListeners(): void {
    this.listeners.forEach(l => l?.remove?.());
    this.listeners = [];
  }
}
