export interface DashboardSummary {
  totalEntries: number;
  username: string;

  upcomingEvents: DashboardEvent[];

  recentOutEntries: RecentEntry[];

  totalCashReceived: number;
  totalCashGiven: number;
  totalCashToBeReceived: number;
  totalCashToBeGiven: number;

  totalGoldReceived: number;
  totalGoldGiven: number;
  totalGoldToBeReceived: number;
  totalGoldToBeGiven: number;

  attendedEvents: number;
  todayEntries: number;
  todayCashReceived: number;

  recentEntries: RecentEntry[];
  todayCashGiven: number;
  todayGoldReceived: number;
  todayGoldGiven: number;
  topContributor: TopContributor | null;
  topVillage: TopVillage | null;
}
// Keep legacy alias for compatibility
export type Dashboard = DashboardSummary;

export interface DashboardEvent {
  id: string;
  name: string;
  eventDate: string;
  villageName?: string | null;

  day?: string;
  month?: string;

  entryCount: number;

  totalReceived: number;
  totalGiven: number;

  cashToReceive: number;
  cashToGive: number;

  goldToReceive: number;
  goldToGive: number;
}

export interface TopContributor {
  personName: string;
  villageName: string | null;
  cashAmount: number;
  goldWeight: number;
}

export interface TopVillage {
  villageName: string;
  entryCount: number;
  cashAmount: number;
  goldWeight: number;
}

export interface RecentEntry {
  id: string;
  personName: string;
  villageName: string | null;
  eventId: string | null;
  eventName?: string;
  eventDate?: string;
  entryType: 'OWN_EVENT' | 'OTHER_EVENT';
  cashAmount: number;
  goldWeight: number;
  createdAt: string;
}
