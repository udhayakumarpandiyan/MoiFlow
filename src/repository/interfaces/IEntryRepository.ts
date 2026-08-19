import { Entry } from '../../models/Entry';

export interface EntryFilter {
  eventId?: string;
  personId?: string;
  entryType?: 'OWN_EVENT' | 'OTHER_EVENT';
  villageName?: string;
  fromDate?: string;
  toDate?: string;
  keyword?: string;
}

export interface IEntryRepository {
  create(entry: Entry): Promise<void>;
  update(entry: Entry): Promise<void>;
  delete(id: string): Promise<void>;
  getById(id: string): Promise<Entry | null>;
  getAll(filter?: EntryFilter): Promise<Entry[]>;
  getRecent(limit: number): Promise<Entry[]>;
  search(keyword: string, filter?: EntryFilter): Promise<Entry[]>;
  getByPersonId(personId: string): Promise<Entry[]>;
  getTotals(filter?: EntryFilter): Promise<{
    cashIn: number;
    goldIn: number;
    cashOut: number;
    goldOut: number;
    count: number;
  }>;
}
