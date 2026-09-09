import { v4 as uuidv4 } from 'uuid';

import { MoiEvent, CreateEventInput } from '../models/Event';
import { IEventRepository } from '../repository/interfaces/IEventRepository';
import { ISyncQueueRepository } from '../repository/interfaces/ISyncQueueRepository';
import type { EntitlementService } from '../subscription/EntitlementService';

export class EventService {
  constructor(
    private readonly eventRepo: IEventRepository,
    private readonly syncRepo: ISyncQueueRepository,
    private readonly entitlement?: EntitlementService,
  ) {}

  async createEvent(input: CreateEventInput): Promise<MoiEvent> {
    if (!input.name.trim()) throw new Error('Event name is required');
    if (!input.type.trim()) throw new Error('Event type is required');

    // Enforce the Free-plan event limit in the service layer (not just UI).
    // Premium users are unlimited. Throws FreeLimitError when exceeded.
    if (this.entitlement) {
      await this.entitlement.assertCanCreateEvent();
    }

    const now = new Date().toISOString();
    const event: MoiEvent = {
      id: uuidv4(),
      name: input.name.trim(),
      type: input.type.trim(),
      ownerType: input.ownerType,
      date: input.date,
      time: input.time,
      venue: input.venue?.trim(),
      villageName: input.villageName?.trim(),
      description: input.description?.trim(),
      isActive: input.isActive ?? false,
      isAttended: false,
      estimatedCost: input.estimatedCost ?? 0,
      actualExpenses: input.actualExpenses ?? 0,
      invitationsPrinted: 0,
      totalInvites: 0,
      notifyAt: input.notifyAt ?? null,
      createdAt: now,
      updatedAt: now,
      syncStatus: 0,
    };

    await this.eventRepo.create(event);

    // Schedule a one-time reminder if a future notify datetime was set.
    await this.syncEventNotification(event);

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

    // Reschedule / cancel the reminder to match the (possibly changed) datetime.
    await this.syncEventNotification(updated);

    return updated;
  }

  async deleteEvent(id: string): Promise<void> {
    await this.eventRepo.delete(id);

    // Cancel any pending reminder for the removed event.
    try {
      const { notificationService } = require('./NotificationService');
      await notificationService.cancelEventNotification(id);
    } catch {
      // Notification module unavailable — safe to ignore.
    }
  }

  /**
   * Schedule / reschedule / cancel the one-time reminder for an event based on
   * its notifyAt value. Loaded lazily to avoid a circular import with the
   * NotificationService (which reads from the DI container).
   */
  private async syncEventNotification(event: MoiEvent): Promise<void> {
    try {
      const { notificationService } = require('./NotificationService');
      const body = event.venue
        ? `${event.venue}${event.villageName ? ` · ${event.villageName}` : ''}`
        : event.villageName ?? undefined;
      await notificationService.scheduleEventNotification(
        event.id,
        event.name,
        event.notifyAt ?? null,
        body,
      );
    } catch {
      // Notification module unavailable — safe to ignore.
    }
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
