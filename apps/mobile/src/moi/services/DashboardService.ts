import { DashboardSummary } from '@moi/models/Dashboard';
import { IDashboardRepository } from '@moi/repository/interfaces/IDashboardRepository';

export class DashboardService {
  constructor(private readonly dashboardRepo: IDashboardRepository) {}

  async getSummary(): Promise<DashboardSummary> {
    return this.dashboardRepo.getSummary();
  }
}
