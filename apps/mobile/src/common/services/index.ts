/**
 * Re-export all services from the DI container.
 * This is the single import point for features/screens.
 *
 * NOTE: Non-critical services (voice, OCR, backup, Google Drive) are
 * lazy-initialized via Proxy in the container — they are NOT instantiated
 * until first property access. This keeps the startup path fast.
 */
export {
  entryService,
  eventService,
  personService,
  dashboardService,
  reportService,
  pendingService,
  loanService,
  creditService,
  businessService,
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
  subscriptionService,
  revenueCatService,
  cloudSyncService,
  entitlementService,
  entitlementRepository,
  firebaseSyncService,
} from '@common/di/container';
