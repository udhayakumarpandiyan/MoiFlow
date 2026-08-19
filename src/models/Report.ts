// ─── Per-Person Balance ───────────────────────────────────────────────────────

export interface PersonBalance {
  personId: string;
  personName: string;
  villageName?: string | null | undefined;

  entryCount: number;

  totalCashIn: number;
  totalCashOut: number;

  totalGoldIn: number;
  totalGoldOut: number;

  netCash: number;
  netGold: number;

  cashToBeReceived: number;
  cashToBeGiven: number;

  goldToBeReceived: number;
  goldToBeGiven: number;
}

// ─── Per-Event Summary ────────────────────────────────────────────────────────

export interface EventReportSummary {
  eventId: string;
  eventName: string;
  eventDate: string | null;
  eventVenue: string | null;
  eventVillageName: string | null;
  ownerType: string;

  totalEntries: number;
  totalPersons: number;
  totalVillages: number;
  invitationsPrinted: number;
  totalInvites: number;

  totalCashReceived: number;
  totalGoldReceived: number;
  totalCashGiven: number;
  totalGoldGiven: number;

  estimatedCost: number;
  actualExpenses: number;
}

export interface EventReportEntry {
  id: string;
  personName: string;
  villageName: string | null;
  entryType: 'OWN_EVENT' | 'OTHER_EVENT';
  cashAmount: number;
  goldWeight: number;
  createdAt: string;
}

export interface EventReport {
  summary: EventReportSummary;
  entries: EventReportEntry[];
}

// ─── Per-Village Summary ──────────────────────────────────────────────────────

export interface VillageReport {
  villageName: string;
  entryCount: number;
  totalCashIn: number;
  totalGoldIn: number;
  totalCashOut: number;
  totalGoldOut: number;
  cashToBeReceived: number;
  cashToBeGiven: number;
  goldToBeReceived: number;
  goldToBeGiven: number;
}

// ─── Date-wise Summary ────────────────────────────────────────────────────────

export interface DateReport {
  date: string;
  entryCount: number;
  cashIn: number;
  goldIn: number;
  cashOut: number;
  goldOut: number;
}

// ─── Legacy aliases (used in existing ReportRepository) ──────────────────────
export type ReportSummary = EventReportSummary;
export type ReportEntry = EventReportEntry;
