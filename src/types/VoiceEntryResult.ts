export type EntryDirection = 'IN' | 'OUT';

export interface VoiceEntryResult {
  personName: string | null;
  villageName?: string | null;
  direction: EntryDirection | null;
  cashAmount: number;
  goldWeight: number;
  confidence: number;
}