import { DashboardSummary } from '../../models/Dashboard';

export interface IDashboardRepository {
  getSummary(): Promise<DashboardSummary>;
}
