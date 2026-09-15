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

  // ── Analytics ────────────────────────────────────────────────────────────

  /** Year-to-date stats (Jan 1 of current year → today) */
  ytd: YearToDateStats;

  /** Entry type breakdown: % new entries vs % settlement entries */
  entryBreakdown: EntryBreakdown;

  /**
   * Estimated cash/gold you'd receive if you conducted an event this month
   * and in 6 months, based on the historical average received per event.
   */
  returnForecast: ReturnForecast;

  /** Top 5 villages by entry count (for the bar-chart insight) */
  topVillages: VillageInsight[];

  /** Monthly cash-in trend for the last 6 months (for the trend insight) */
  monthlyTrend: MonthlyTrend[];
}
// Keep legacy alias for compatibility
export type Dashboard = DashboardSummary;

// ── Analytics types ──────────────────────────────────────────────────────────

export interface YearToDateStats {
  eventsAttended: number;       // OTHER_PERSON events whose date falls in current year
  eventsHosted: number;         // MY_EVENT events in current year
  cashGiven: number;            // total cash OUT (OTHER_EVENT) this year
  goldGiven: number;
  cashReceived: number;         // total cash IN (OWN_EVENT) this year
  goldReceived: number;
  uniquePeople: number;         // distinct people you interacted with this year
  uniqueVillages: number;
}

export interface EntryBreakdown {
  newCount: number;             // entries from people who only have OWN_EVENT records (received from them before)
  settlementCount: number;      // OTHER_EVENT entries (given out) — the "repayment" side
  totalCount: number;
  /** 0–100 percentage of new / first-time received entries */
  newPct: number;
  /** 0–100 percentage of give-out / settlement entries */
  settlementPct: number;
}

export interface ReturnForecast {
  /** Average cash received per past MY_EVENT */
  avgCashPerEvent: number;
  /** Average gold received per past MY_EVENT */
  avgGoldPerEvent: number;
  /** Estimated cash if you host an event this month (avg × seasonal factor) */
  estimatedCashThisMonth: number;
  /** Estimated cash if you host an event in 6 months */
  estimatedCashIn6Months: number;
  /** Number of past MY_EVENT events used for this estimate */
  basedOnEvents: number;
  /**
   * Confidence: 'low' (<3 events), 'medium' (3–9), 'high' (≥10)
   */
  confidence: 'low' | 'medium' | 'high';
}

export interface VillageInsight {
  villageName: string;
  entryCount: number;
  cashIn: number;
  cashOut: number;
  personCount: number;
}

export interface MonthlyTrend {
  /** 'Jan', 'Feb', … */
  month: string;
  /** Full label like 'Jan 25' */
  label: string;
  cashIn: number;
  cashOut: number;
  entryCount: number;
}

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
