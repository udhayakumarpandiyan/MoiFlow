/**
 * entry_type drives the IN/OUT direction:
 *   OWN_EVENT   -> someone gave ME money/gold  -> IN
 *   OTHER_EVENT -> I gave money/gold to someone -> OUT
 */
export type EntryType = 'OWN_EVENT' | 'OTHER_EVENT';

export interface Entry {
  id: string;

  /** Which event this entry belongs to (null = standalone) */
  eventId: string | null;
  eventName?: string;
  eventDate?: string;

  entryType: EntryType;

  personId: string;
  personName: string;
  villageName?: string;

  /** Cash in INR */
  cashAmount: number;

  /** Gold in grams */
  goldWeight: number;

  remarks?: string;

  createdAt: string;
  updatedAt: string;
  createdBy?: string;

  syncStatus: number;
}

export interface CreateEntryInput {
  eventId: string | null;
  eventName?: string;
  eventDate?: string;
  entryType: EntryType;
  /** Optional — EntryService resolves this via personRepo.findOrCreate */
  personId?: string;
  personName: string;
  villageName?: string;
  cashAmount: number;
  goldWeight: number;
  remarks?: string;
}