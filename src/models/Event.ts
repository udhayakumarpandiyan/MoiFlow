/** Whether this event belongs to me or another person */
export type EventOwnerType = 'MY_EVENT' | 'OTHER_PERSON';

export interface MoiEvent {
  id: string;
  name: string;
  type: string;
  ownerType: EventOwnerType;
  date?: string;
  time?: string;
  venue?: string;
  villageName?: string;
  personName?: string;
  description?: string;
  invitationImage?: string;
  isActive: boolean;
  isAttended: boolean;
  estimatedCost: number;
  actualExpenses: number;
  invitationsPrinted: number;
  totalInvites: number;
  createdAt: string;
  updatedAt: string;
  syncStatus: number;
}

export interface CreateEventInput {
  name: string;
  type: string;
  ownerType: EventOwnerType;
  date?: string;
  time?: string;
  venue?: string;
  villageName?: string;
  description?: string;
  isActive?: boolean;
}
