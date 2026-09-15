import {
  parseVoiceText,
} from '@common/api/NLUApi';

import {
  VoiceEntryResult,
} from '@common/types/VoiceEntryResult';

export class VoiceEntryService {

  async parse(
    text: string,
  ): Promise<VoiceEntryResult> {

    if (!text.trim()) {
      throw new Error(
        'Please enter some text',
      );
    }

    return parseVoiceText(text);
  }
}

export const voiceEntryService =
  new VoiceEntryService();