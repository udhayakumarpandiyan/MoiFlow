export interface ReportFilter {
  eventId?: string;
  personId?: string;
  personName?: string;
  villageName?: string;
  fromDate?: string;
  toDate?: string;
  minCashAmount?: number;
  maxCashAmount?: number;
  minGoldWeight?: number;
  maxGoldWeight?: number;
}
