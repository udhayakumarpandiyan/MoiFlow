import { DashboardSummary } from '@moi/models/Dashboard';

export interface IDashboardRepository {
  getSummary(): Promise<DashboardSummary>;
}
