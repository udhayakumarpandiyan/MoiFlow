/**
 * Dependency Injection Container
 *
 * All repositories and services are instantiated here.
 * Import from this file everywhere -- never create instances inline.
 */

import { EntryRepository }     from '../repository/sqlite/EntryRepository';
import { EventRepository }     from '../repository/sqlite/EventRepository';
import { PersonRepository }    from '../repository/sqlite/PersonRepository';
import { VillageRepository }   from '../repository/sqlite/VillageRepository';
import { DashboardRepository } from '../repository/sqlite/DashboardRepository';
import { ReportRepository }    from '../repository/sqlite/ReportRepository';
import { SyncQueueRepository } from '../repository/sqlite/SyncQueueRepository';

import { EntryService }      from '../services/EntryService';
import { EventService }      from '../services/EventService';
import { PersonService }     from '../services/PersonService';
import { DashboardService }  from '../services/DashboardService';
import { ReportService }     from '../services/ReportService';
import { SyncQueueService }  from '../services/SyncQueueService';
import { BackupService }     from '../services/BackupService';
import { SettingsService }   from '../services/SettingsService';
import { balanceService }    from '../services/BalanceService';

// VoiceEntryService lives in voice/ because it owns both mic capture and
// NLU API parsing. The services/VoiceEntryService.ts is a thin alias kept
// for backward compatibility but the canonical one is voice/VoiceEntryService.
import { VoiceEntryService } from '../voice/VoiceEntryService';

// New services added for production-readiness overhaul
import { authService }          from '../services/AuthService';
import { googleDriveService }   from '../services/GoogleDriveService';
import { ocrService }           from '../services/OCRService';
import { voiceEventService }    from '../voice/VoiceEventService';
import { VoiceSearchService }   from '../voice/VoiceSearchService';

// --- Repositories -----------------------------------------------------------

export const entryRepository     = new EntryRepository();
export const eventRepository     = new EventRepository();
export const personRepository    = new PersonRepository();
export const villageRepository   = new VillageRepository();
export const dashboardRepository = new DashboardRepository();
export const reportRepository    = new ReportRepository();
export const syncQueueRepository = new SyncQueueRepository();

// --- Services ----------------------------------------------------------------

export const entryService     = new EntryService(entryRepository, personRepository, syncQueueRepository);
export const eventService     = new EventService(eventRepository, syncQueueRepository);
export const personService    = new PersonService(personRepository);
export const dashboardService = new DashboardService(dashboardRepository);
export const reportService    = new ReportService(reportRepository);
export const syncQueueService = new SyncQueueService(syncQueueRepository);
export const backupService    = new BackupService();
export const settingsService  = new SettingsService();

// VoiceEntryService is NOT a singleton at module level because it holds a
// lazy ref to TamilSpeechRecognizer (native module). It is safe to export
// as a singleton here because the recognizer inside it is only created on
// first use (after the bridge is ready).
export const voiceEntryService = new VoiceEntryService();

export const voiceSearchService = new VoiceSearchService();

export { balanceService };

// --- New services (production-readiness overhaul) ----------------------------
// These are instantiated in their own modules (lazy-safe singletons) and
// re-exported here so the rest of the app imports from the container.

export { authService };
export { googleDriveService };
export { ocrService };
export { voiceEventService };