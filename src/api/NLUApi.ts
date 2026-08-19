import { apiRequest } from './ApiClient';
import { VoiceEntryResult } from '../types/VoiceEntryResult';

export interface NLURequest {
  text: string;
}

export async function parseVoiceText(
  text: string,
): Promise<VoiceEntryResult> {
  return apiRequest<VoiceEntryResult>(
    '/api/nlu/parse',
    {
      method: 'POST',

      body: JSON.stringify({
        text,
      }),
    },
  );
}