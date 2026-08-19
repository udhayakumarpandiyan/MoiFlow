import { v4 as uuidv4 } from 'uuid';

import { MoiEvent, CreateEventInput } from '../models/Event';
import { IEventRepository } from '../repository/interfaces/IEventRepository';
import { ISyncQueueRepository } from '../repository/interfaces/ISyncQueueRepository';

export class EventService {
  constructor(
    private readonly eventRepo: IEventRepository,
    private readonly syncRepo: ISyncQueueRepository,
  ) {}

  async createEvent(input: CreateEventInput): Promise<MoiEvent> {
    if (!input.name.trim()) throw new Error('Event name is required');
    if (!input.type.trim()) throw new Error('Event type is required');

    const now = new Date().toISOString();
    const event: MoiEvent = {
      id: uuidv4(),
      name: input.name.trim(),
      type: input.type.trim(),
      ownerType: input.ownerType,
      date: input.date,
      venue: input.venue?.trim(),
      villageName: input.villageName?.trim(),
      description: input.description?.trim(),
      isActive: input.isActive ?? false,
      createdAt: now,
      updatedAt: now,
      syncStatus: 0,
    };

    await this.eventRepo.create(event);
    return event;
  }

  async updateEvent(id: string, updates: Partial<CreateEventInput>): Promise<MoiEvent> {
    const existing = await this.eventRepo.getById(id);
    if (!existing) throw new Error(`Event not found: ${id}`);

    const updated: MoiEvent = {
      ...existing,
      ...updates,
      name: (updates.name ?? existing.name).trim(),
      updatedAt: new Date().toISOString(),
      syncStatus: 0,
    };

    await this.eventRepo.update(updated);
    return updated;
  }

  async deleteEvent(id: string): Promise<void> {
    await this.eventRepo.delete(id);
  }

  async getEvent(id: string): Promise<MoiEvent | null> {
    return this.eventRepo.getById(id);
  }

  async getAllEvents(): Promise<MoiEvent[]> {
    return this.eventRepo.getAll();
  }

  async getMyEvents(): Promise<MoiEvent[]> {
    return this.eventRepo.getMyEvents();
  }

  async getOtherEvents(): Promise<MoiEvent[]> {
    return this.eventRepo.getOtherEvents();
  }

  async getActiveEvent(): Promise<MoiEvent | null> {
    return this.eventRepo.getActiveEvent();
  }

  async setActiveEvent(id: string): Promise<void> {
    return this.eventRepo.setActiveEvent(id);
  }
}
