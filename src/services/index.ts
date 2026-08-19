/**
 * Re-export all services from the DI container.
 * This is the single import point for features/screens.
 */
export {
  entryService,
  eventService,
  personService,
  dashboardService,
  reportService,
  syncQueueService,
  backupService,
  settingsService,
  balanceService,
  voiceEntryService,
  voiceSearchService,
  authService,
  googleDriveService,
  ocrService,
  voiceEventService,
} from '../di/container';