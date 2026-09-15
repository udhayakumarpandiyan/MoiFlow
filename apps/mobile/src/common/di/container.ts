/**
 * Dependency Injection Container
 *
 * All repositories and services are instantiated here.
 * Import from this file everywhere -- never create instances inline.
 *
 * -------------------------------------------------------------------------------
 * STARTUP PERFORMANCE OPTIMIZATION
 * -------------------------------------------------------------------------------
 *
 * Services are split into two categories:
 *
 * 1. CRITICAL (eagerly initialized) � needed at startup for offline-first
 *    core functionality: entries, events, persons, dashboard, settings, auth.
 *
 * 2. DEFERRED (lazy getters) � only instantiated on first access. These are
 *    features the user may never use in a session (voice, OCR, backup,
 *    Google Drive, notifications). Their imports and constructors are deferred
 *    so they don't block the JS thread during app startup.
 */

import { EntryRepository }     from '@moi/repository/sqlite/EntryRepository';
import { EventRepository }     from '@moi/repository/sqlite/EventRepository';
import { PersonRepository }    from '@moi/repository/sqlite/PersonRepository';
import { VillageRepository }   from '@moi/repository/sqlite/VillageRepository';
import { DashboardRepository } from '@moi/repository/sqlite/DashboardRepository';
import { ReportRepository }    from '@moi/repository/sqlite/ReportRepository';
import { PendingRepository }   from '@moi/repository/sqlite/PendingRepository';
import { LoanRepository }      from '@finance/repository/sqlite/LoanRepository';
import { CreditRepository }    from '@finance/repository/sqlite/CreditRepository';
import { BusinessRepository }  from '@finance/repository/sqlite/BusinessRepository';
import { SyncQueueRepository } from '@common/repository/sqlite/SyncQueueRepository';
import { EntitlementRepository } from '@common/repository/sqlite/EntitlementRepository';

import { EntryService }      from '@moi/services/EntryService';
import { EventService }      from '@moi/services/EventService';
import { PersonService }     from '@moi/services/PersonService';
import { DashboardService }  from '@moi/services/DashboardService';
import { ReportService }     from '@moi/services/ReportService';
import { PendingService }    from '@moi/services/PendingService';
import { LoanService }       from '@finance/services/LoanService';
import { CreditService }     from '@finance/services/CreditService';
import { BusinessService }   from '@finance/services/BusinessService';
import { SyncQueueService }  from '@common/services/SyncQueueService';
import { SettingsService }   from '@common/services/SettingsService';
import { CloudSyncService }  from '@common/services/CloudSyncService';
import { balanceService }    from '@moi/services/BalanceService';

import { RevenueCatService } from '@common/subscription/RevenueCatService';
import { EntitlementService }  from '@common/subscription/EntitlementService';

// Auth is needed at splash to determine the initial route
import { authService }       from '@common/services/AuthService';

// --- Repositories (critical � SQLite, offline-first) -------------------------

export const entryRepository     = new EntryRepository();
export const eventRepository     = new EventRepository();
export const personRepository    = new PersonRepository();
export const villageRepository   = new VillageRepository();
export const dashboardRepository = new DashboardRepository();
export const reportRepository    = new ReportRepository();
export const pendingRepository   = new PendingRepository();
export const loanRepository      = new LoanRepository();
export const creditRepository    = new CreditRepository();
export const businessRepository  = new BusinessRepository();
export const syncQueueRepository = new SyncQueueRepository();
export const entitlementRepository = new EntitlementRepository();

// --- Subscription / entitlement ----------------------------------------------
// RevenueCatService wraps the native react-native-purchases (RevenueCat) SDK.
// It is safe to instantiate eagerly: the native module is required lazily
// *inside* the service (require-on-access), so no native code loads until a
// billing method is actually called. RevenueCat is the billing authority; the
// backend (fed by RevenueCat webhooks) is the cross-device source of truth and
// is reconciled inside verifyAndRefresh(). EntitlementService is the single
// source of truth consumed by both the service layer and the UI.
//
// Exported as `subscriptionService` (the name consumers already use) so the
// provider swap from react-native-iap -> RevenueCat is transparent to callers.

export const revenueCatService = new RevenueCatService(entitlementRepository);
export const subscriptionService = revenueCatService;
export const entitlementService  = new EntitlementService(
  entitlementRepository,
  subscriptionService,
  eventRepository,
  entryRepository,
  personRepository,
);

// FirebaseSyncService � deferred: it lazily requires the native Firebase
// modules only when a sync method is called, and degrades gracefully when they
// are absent/unconfigured. Premium-gated internally.
import type { FirebaseSyncService as FirebaseSyncServiceType } from '@common/subscription/FirebaseSyncService';

let _firebaseSyncService: FirebaseSyncServiceType | null = null;
export const firebaseSyncService: FirebaseSyncServiceType = new Proxy(
  {} as FirebaseSyncServiceType,
  {
    get(_target, prop) {
      if (!_firebaseSyncService) {
        const { FirebaseSyncService } = require('@common/subscription/FirebaseSyncService');
        _firebaseSyncService = new FirebaseSyncService(
          syncQueueRepository,
          () => authService.getUserPhone(),
        );
      }
      return (_firebaseSyncService as any)[prop];
    },
  },
);

// --- Critical Services (eagerly initialized) ---------------------------------

export const entryService     = new EntryService(entryRepository, personRepository, syncQueueRepository, entitlementService);
export const eventService     = new EventService(eventRepository, syncQueueRepository, entitlementService);
export const personService    = new PersonService(personRepository, entitlementService);
export const dashboardService = new DashboardService(dashboardRepository);
export const reportService    = new ReportService(reportRepository);
export const pendingService   = new PendingService(pendingRepository);
export const loanService      = new LoanService(loanRepository, syncQueueRepository);
export const creditService    = new CreditService(creditRepository, syncQueueRepository);
export const businessService  = new BusinessService(businessRepository, syncQueueRepository);
export const syncQueueService = new SyncQueueService(syncQueueRepository);
export const settingsService  = new SettingsService();

// Cloud sync (premium multi-device mirror of Moi + Finance to the backend).
// Lightweight to construct (holds refs only); network happens on pushAll().
export const cloudSyncService = new CloudSyncService(
  entitlementService,
  eventRepository,
  entryRepository,
  creditRepository,
  loanRepository,
  businessRepository,
);

export { balanceService };
export { authService };

// --- Deferred Services (lazy initialization) ---------------------------------
// These are not imported at module parse time. Instead, they are instantiated
// on first access via getter functions. This removes their entire module trees
// (voice native modules, Google Sign-In, RNFS backup logic, OCR ML Kit, etc.)
// from the critical startup path.

import type { BackupService as BackupServiceType }           from '@common/services/BackupService';
import type { GoogleDriveService as GoogleDriveServiceType } from '@common/services/GoogleDriveService';
import type { OCRService as OCRServiceType }                 from '@common/services/OCRService';
import type { VoiceEntryService as VoiceEntryServiceType }   from '@common/voice/VoiceEntryService';
import type { VoiceSearchService as VoiceSearchServiceType } from '@common/voice/VoiceSearchService';
import type { VoiceEventService as VoiceEventServiceType }   from '@common/voice/VoiceEventService';

let _backupService: BackupServiceType | null = null;
let _googleDriveService: GoogleDriveServiceType | null = null;
let _ocrService: OCRServiceType | null = null;
let _voiceEntryService: VoiceEntryServiceType | null = null;
let _voiceSearchService: VoiceSearchServiceType | null = null;
let _voiceEventService: VoiceEventServiceType | null = null;

/**
 * BackupService � deferred because it imports RNFS and GoogleDriveService,
 * and is only used from the Settings screen.
 */
export const backupService: BackupServiceType = new Proxy({} as BackupServiceType, {
  get(_target, prop) {
    if (!_backupService) {
      const { BackupService } = require('@common/services/BackupService');
      _backupService = new BackupService();
    }
    return (_backupService as any)[prop];
  },
});

/**
 * GoogleDriveService � deferred because it imports Google Sign-In native
 * module and is only used for cloud backup operations.
 */
export const googleDriveService: GoogleDriveServiceType = new Proxy({} as GoogleDriveServiceType, {
  get(_target, prop) {
    if (!_googleDriveService) {
      const mod = require('@common/services/GoogleDriveService');
      _googleDriveService = mod.googleDriveService;
    }
    return (_googleDriveService as any)[prop];
  },
});

/**
 * OCRService � deferred because it imports react-native-mlkit-ocr.
 * Only used when scanning invitations.
 */
export const ocrService: OCRServiceType = new Proxy({} as OCRServiceType, {
  get(_target, prop) {
    if (!_ocrService) {
      const mod = require('@common/services/OCRService');
      _ocrService = mod.ocrService;
    }
    return (_ocrService as any)[prop];
  },
});

/**
 * VoiceEntryService � deferred because it imports TamilSpeechRecognizer
 * (native voice module). Only used when user opens the voice entry modal.
 */
export const voiceEntryService: VoiceEntryServiceType = new Proxy({} as VoiceEntryServiceType, {
  get(_target, prop) {
    if (!_voiceEntryService) {
      const { VoiceEntryService } = require('@common/voice/VoiceEntryService');
      _voiceEntryService = new VoiceEntryService();
    }
    return (_voiceEntryService as any)[prop];
  },
});

/**
 * VoiceSearchService � deferred because it imports TamilSpeechRecognizer.
 * Only used from the dashboard voice search modal.
 */
export const voiceSearchService: VoiceSearchServiceType = new Proxy({} as VoiceSearchServiceType, {
  get(_target, prop) {
    if (!_voiceSearchService) {
      const { VoiceSearchService } = require('@common/voice/VoiceSearchService');
      _voiceSearchService = new VoiceSearchService();
    }
    return (_voiceSearchService as any)[prop];
  },
});

/**
 * VoiceEventService � deferred because it imports TamilSpeechRecognizer.
 * Only used from the voice event modal.
 */
export const voiceEventService: VoiceEventServiceType = new Proxy({} as VoiceEventServiceType, {
  get(_target, prop) {
    if (!_voiceEventService) {
      const mod = require('@common/voice/VoiceEventService');
      _voiceEventService = mod.voiceEventService;
    }
    return (_voiceEventService as any)[prop];
  },
});
