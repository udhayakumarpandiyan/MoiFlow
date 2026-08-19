import { MoiEvent } from '../../models/Event';

export interface IEventRepository {
  create(event: MoiEvent): Promise<void>;
  update(event: MoiEvent): Promise<void>;
  delete(id: string): Promise<void>;
  getById(id: string): Promise<MoiEvent | null>;
  getAll(): Promise<MoiEvent[]>;
  getMyEvents(): Promise<MoiEvent[]>;
  getOtherEvents(): Promise<MoiEvent[]>;
  getActiveEvent(): Promise<MoiEvent | null>;
  setActiveEvent(id: string): Promise<void>;
}
