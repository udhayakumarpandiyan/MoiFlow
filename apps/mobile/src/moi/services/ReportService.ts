import {
  EventReport,
  EventReportSummary,
  PersonBalance,
  VillageReport,
  DateReport,
} from '@moi/models/Report';
import { ReportFilter } from '@moi/models/ReportFilter';
import { IReportRepository } from '@moi/repository/interfaces/IReportRepository';

export class ReportService {
  constructor(private readonly reportRepo: IReportRepository) {}

  // ---------------------------------------------------------------------------
  // Person-wise reconciliation
  // ---------------------------------------------------------------------------
  //
  // Cash:
  //   OUT > IN  -> Cash to be received
  //   IN > OUT  -> Cash to be given
  //   IN = OUT  -> Settled
  //
  // Gold follows the same logic independently.
  //
  // Examples:
  //   IN  = 0,    OUT = 2000 -> Receive 2000
  //   IN  = 1000, OUT = 2000 -> Receive 1000
  //   IN  = 500,  OUT = 1000 -> Receive 500
  //   IN  = 1000, OUT = 0    -> Give 1000
  //   IN  = 2000, OUT = 1000 -> Give 1000
  // ---------------------------------------------------------------------------

  async getPersonBalances(
    filter?: ReportFilter,
  ): Promise<PersonBalance[]> {
    const persons = await this.reportRepo.getPersonBalances(filter);

    return persons.map(person => {
      const totalCashIn = person.totalCashIn || 0;
      const totalCashOut = person.totalCashOut || 0;

      const totalGoldIn = person.totalGoldIn || 0;
      const totalGoldOut = person.totalGoldOut || 0;

      // -----------------------------------------------------------------------
      // Cash reconciliation
      // -----------------------------------------------------------------------

      const cashToReceive = Math.max(
        totalCashOut - totalCashIn,
        0,
      );

      const cashToGive = Math.max(
        totalCashIn - totalCashOut,
        0,
      );

      // -----------------------------------------------------------------------
      // Gold reconciliation
      // -----------------------------------------------------------------------

      const goldToReceive = Math.max(
        totalGoldOut - totalGoldIn,
        0,
      );

      const goldToGive = Math.max(
        totalGoldIn - totalGoldOut,
        0,
      );

      return {
        ...person,

        // Keep the original totals
        totalCashIn,
        totalCashOut,
        totalGoldIn,
        totalGoldOut,

        // Reconciled balances
        cashToReceive,
        cashToGive,
        goldToReceive,
        goldToGive,

        // Cash-only net balance
        //
        // Negative -> receive
        // Positive -> give
        // Zero     -> settled
        netCash: totalCashIn - totalCashOut,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Event report
  // ---------------------------------------------------------------------------

  async getEventReport(
    eventId: string,
    filter?: ReportFilter,
  ): Promise<EventReport> {
    if (!eventId) {
      throw new Error('Event ID is required');
    }

    return this.reportRepo.getEventReport(eventId, filter);
  }

  // ---------------------------------------------------------------------------
  // Event-wise report (all own events)
  // ---------------------------------------------------------------------------

  async getEventWiseReport(
    filter?: ReportFilter,
  ): Promise<EventReportSummary[]> {
    return this.reportRepo.getEventWiseReport(filter);
  }

  // ---------------------------------------------------------------------------
  // Village report
  // ---------------------------------------------------------------------------

  async getVillageReport(
    filter?: ReportFilter,
  ): Promise<VillageReport[]> {
    const villages = await this.reportRepo.getVillageReport(filter);

    return villages.map(village => {
      const totalCashIn = village.totalCashIn || 0;
      const totalCashOut = village.totalCashOut || 0;

      const totalGoldIn = village.totalGoldIn || 0;
      const totalGoldOut = village.totalGoldOut || 0;

      return {
        ...village,

        totalCashIn,
        totalCashOut,
        totalGoldIn,
        totalGoldOut,

        // Village-level reconciliation
        cashToReceive: Math.max(
          totalCashOut - totalCashIn,
          0,
        ),

        cashToGive: Math.max(
          totalCashIn - totalCashOut,
          0,
        ),

        goldToReceive: Math.max(
          totalGoldOut - totalGoldIn,
          0,
        ),

        goldToGive: Math.max(
          totalGoldIn - totalGoldOut,
          0,
        ),
      };
    });
  }
 async getOverallReport(filter?: ReportFilter) {
  const persons = await this.getPersonBalances(filter);

  const totalCashIn = persons.reduce(
    (sum, person) => sum + (person.totalCashIn || 0),
    0,
  );

  const totalCashOut = persons.reduce(
    (sum, person) => sum + (person.totalCashOut || 0),
    0,
  );

  const totalGoldIn = persons.reduce(
    (sum, person) => sum + (person.totalGoldIn || 0),
    0,
  );

  const totalGoldOut = persons.reduce(
    (sum, person) => sum + (person.totalGoldOut || 0),
    0,
  );

  // Aggregate reconciled person-level balances.
  //
  // OUT > IN  -> Cash/Gold to be received
  // IN > OUT  -> Cash/Gold to be given

  const cashToReceive = persons.reduce(
    (sum, person) => sum + (person.cashToBeReceived || 0),
    0,
  );

  const cashToGive = persons.reduce(
    (sum, person) => sum + (person.cashToBeGiven || 0),
    0,
  );

  const goldToReceive = persons.reduce(
    (sum, person) => sum + (person.goldToBeReceived || 0),
    0,
  );

  const goldToGive = persons.reduce(
    (sum, person) => sum + (person.goldToBeGiven || 0),
    0,
  );

  const totalEntries = persons.reduce(
    (sum, person) => sum + (person.entryCount || 0),
    0,
  );

  return {
    totalCashIn,
    totalCashOut,
    cashToReceive,
    cashToGive,

    totalGoldIn,
    totalGoldOut,
    goldToReceive,
    goldToGive,

    totalPersons: persons.length,
    totalEntries,
  };
}
  // ---------------------------------------------------------------------------
  // Date report
  // ---------------------------------------------------------------------------

  async getDateReport(
    filter?: ReportFilter,
  ): Promise<DateReport[]> {
    return this.reportRepo.getDateReport(filter);
  }
}