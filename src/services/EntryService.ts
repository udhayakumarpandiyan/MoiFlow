import { v4 as uuidv4 } from 'uuid';

import { Entry, CreateEntryInput, EntryType } from '../models/Entry';
import { IEntryRepository, EntryFilter } from '../repository/interfaces/IEntryRepository';
import { IPersonRepository } from '../repository/interfaces/IPersonRepository';
import { ISyncQueueRepository } from '../repository/interfaces/ISyncQueueRepository';

export class EntryService {
  constructor(
    private readonly entryRepo: IEntryRepository,
    private readonly personRepo: IPersonRepository,
    private readonly syncRepo: ISyncQueueRepository,
  ) {}

  async addEntry(input: CreateEntryInput): Promise<Entry> {
    // Validate
    this.validateInput(input);

    // Ensure person exists
    const person = await this.personRepo.findOrCreate(
      input.personName,
      input.villageName,
    );

    const now = new Date().toISOString();
    const entry: Entry = {
      id: uuidv4(),
      entryType: input.entryType,
      eventId: input.eventId,
      eventName: input.eventName,
      eventDate: input.eventDate,
      personId: person.id,
      personName: person.name,
      villageName: input.villageName,
      cashAmount: input.cashAmount,
      goldWeight: input.goldWeight,
      remarks: input.remarks,
      createdAt: now,
      updatedAt: now,
      createdBy: 'local-user',
      syncStatus: 0,
    };

    await this.entryRepo.create(entry);
    await this.enqueueSyncOp('CREATE', entry);

    return entry;
  }

  async updateEntry(id: string, updates: Partial<CreateEntryInput>): Promise<Entry> {
    const existing = await this.entryRepo.getById(id);
    if (!existing) throw new Error(`Entry not found: ${id}`);

    const updated: Entry = {
      ...existing,
      ...updates,
      personName: updates.personName ?? existing.personName,
      villageName: updates.villageName ?? existing.villageName,
      updatedAt: new Date().toISOString(),
      syncStatus: 0,
    };

    this.validateEntry(updated);
    await this.entryRepo.update(updated);
    await this.enqueueSyncOp('UPDATE', updated);

    return updated;
  }

  async deleteEntry(id: string): Promise<void> {
    const existing = await this.entryRepo.getById(id);
    if (!existing) throw new Error(`Entry not found: ${id}`);

    await this.entryRepo.delete(id);

    // Enqueue delete sync
    const now = new Date().toISOString();
    await this.syncRepo.add({
      id: uuidv4(),
      entityType: 'entry',
      entityId: id,
      operation: 'DELETE',
      payload: JSON.stringify({ id }),
      createdAt: now,
      retryCount: 0,
      lastError: null,
    });
  }

  async getEntry(id: string): Promise<Entry | null> {
    return this.entryRepo.getById(id);
  }

  async getEntries(filter?: EntryFilter): Promise<Entry[]> {
    return this.entryRepo.getAll(filter);
  }

  async getRecentEntries(limit = 10): Promise<Entry[]> {
    return this.entryRepo.getRecent(limit);
  }

  async searchEntries(keyword: string, filter?: EntryFilter): Promise<Entry[]> {
    return this.entryRepo.search(keyword, filter);
  }

  async getEntriesByPerson(personId: string): Promise<Entry[]> {
    return this.entryRepo.getByPersonId(personId);
  }

  async getTotals(filter?: EntryFilter) {
    return this.entryRepo.getTotals(filter);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Validation
  // ─────────────────────────────────────────────────────────────────────────

  private validateInput(input: CreateEntryInput): void {
    if (!input.personName?.trim()) throw new Error('Person name is required');
    if (!['OWN_EVENT', 'OTHER_EVENT'].includes(input.entryType)) {
      throw new Error('Invalid entry type');
    }
    if (input.cashAmount < 0) throw new Error('Cash amount cannot be negative');
    if (input.goldWeight < 0) throw new Error('Gold weight cannot be negative');
    if (input.cashAmount === 0 && input.goldWeight === 0) {
      throw new Error('Cash amount or gold weight must be greater than zero');
    }
  }

  private validateEntry(entry: Entry): void {
    this.validateInput({
      personName: entry.personName,
      villageName: entry.villageName,
      entryType: entry.entryType as EntryType,
      eventId: entry.eventId,
      cashAmount: entry.cashAmount,
      goldWeight: entry.goldWeight,
    });
  }

  private async enqueueSyncOp(operation: 'CREATE' | 'UPDATE', entry: Entry): Promise<void> {
    await this.syncRepo.add({
      id: uuidv4(),
      entityType: 'entry',
      entityId: entry.id,
      operation,
      payload: JSON.stringify(entry),
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastError: null,
    });
  }
}
