import { DashboardSummary } from '../models/Dashboard';
import { IDashboardRepository } from '../repository/interfaces/IDashboardRepository';

export class DashboardService {
  constructor(private readonly dashboardRepo: IDashboardRepository) {}

  async getSummary(): Promise<DashboardSummary> {
    return this.dashboardRepo.getSummary();
  }
}
