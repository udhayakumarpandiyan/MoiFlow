import {
  EventReport,
  EventReportSummary,
  PersonBalance,
  VillageReport,
  DateReport,
} from '../../models/Report';
import { ReportFilter } from '../../models/ReportFilter';

export interface IReportRepository {
  getPersonBalances(filter?: ReportFilter): Promise<PersonBalance[]>;
  getEventReport(eventId: string, filter?: ReportFilter): Promise<EventReport>;
  getEventWiseReport(filter?: ReportFilter): Promise<EventReportSummary[]>;
  getVillageReport(filter?: ReportFilter): Promise<VillageReport[]>;
  getDateReport(filter?: ReportFilter): Promise<DateReport[]>;
}
