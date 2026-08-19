import RNFS from 'react-native-fs';
import { getDB } from '../database/db';
import { googleDriveService, DriveFile, GoogleDriveError } from './GoogleDriveService';
import { settingsService, BackupInterval } from './SettingsService';

export interface BackupResult {
  success: boolean;
  path?: string;
  driveFile?: DriveFile;
  error?: string;
  timestamp: string;
}

export interface RestoreResult {
  success: boolean;
  recordsRestored?: number;
  error?: string;
}

/** Interval durations in milliseconds */
const INTERVAL_MS: Record<BackupInterval, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

export class BackupService {
  private readonly backupDir = `${RNFS.ExternalDirectoryPath}/MoiFlow/backups`;

  async ensureBackupDir(): Promise<void> {
    const exists = await RNFS.exists(this.backupDir);
    if (!exists) {
      await RNFS.mkdir(this.backupDir);
    }
  }

  /**
   * Export all data as a JSON backup file.
   */
  async exportBackup(): Promise<BackupResult> {
    const timestamp = new Date().toISOString();
    try {
      await this.ensureBackupDir();
      const db = await getDB();

      const [entriesResult] = await db.executeSql(`SELECT * FROM entries`);
      const [eventsResult]  = await db.executeSql(`SELECT * FROM events`);
      const [personsResult] = await db.executeSql(`SELECT * FROM persons`);

      const entries = this.resultToArray(entriesResult);
      const events  = this.resultToArray(eventsResult);
      const persons = this.resultToArray(personsResult);

      const backup = {
        version: 2,
        exportedAt: timestamp,
        data: { entries, events, persons },
      };

      const filename = `moiflow_backup_${timestamp.replace(/[:.]/g, '-')}.json`;
      const path = `${this.backupDir}/${filename}`;

      await RNFS.writeFile(path, JSON.stringify(backup, null, 2), 'utf8');

      return { success: true, path, timestamp };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message, timestamp };
    }
  }

  /**
   * List available backup files.
   */
  async listBackups(): Promise<RNFS.ReadDirItem[]> {
    try {
      await this.ensureBackupDir();
      const files = await RNFS.readDir(this.backupDir);
      return files
        .filter(f => f.name.endsWith('.json'))
        .sort((a, b) => b.name.localeCompare(a.name));
    } catch {
      return [];
    }
  }

  /**
   * Restore from a backup JSON file.
   * WARNING: This replaces all existing data.
   */
  async restoreBackup(filePath: string): Promise<RestoreResult> {
    try {
      const content = await RNFS.readFile(filePath, 'utf8');
      const backup = JSON.parse(content) as {
        version: number;
        data: {
          entries: Record<string, unknown>[];
          events: Record<string, unknown>[];
          persons: Record<string, unknown>[];
        };
      };

      if (!backup.data) throw new Error('Invalid backup format');

      const db = await getDB();

      // Clear existing data
      await db.executeSql('DELETE FROM entries');
      await db.executeSql('DELETE FROM events');
      await db.executeSql('DELETE FROM persons');

      let count = 0;

      // Restore persons
      for (const p of (backup.data.persons ?? [])) {
        await db.executeSql(
          `INSERT OR REPLACE INTO persons (id, name, phone, village_id, village_name, created_at, updated_at, sync_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [p.id, p.name, p.phone ?? null, p.village_id ?? null, p.village_name ?? null,
           p.created_at, p.updated_at, p.sync_status ?? 0],
        );
      }

      // Restore events
      for (const e of (backup.data.events ?? [])) {
        await db.executeSql(
          `INSERT OR REPLACE INTO events
             (id, name, type, owner_type, date, venue, village_name, description, is_active, created_at, updated_at, sync_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [e.id, e.name, e.type ?? 'OTHER', e.owner_type ?? 'OTHER_PERSON',
           e.date ?? null, e.venue ?? null, e.village_name ?? null, e.description ?? null,
           e.is_active ?? 0, e.created_at, e.updated_at, e.sync_status ?? 0],
        );
      }

      // Restore entries
      for (const en of (backup.data.entries ?? [])) {
        await db.executeSql(
          `INSERT OR REPLACE INTO entries
             (id, entry_type, event_id, event_name, event_date,
              person_id, person_name, village_name,
              cash_amount, gold_weight, remarks, created_at, updated_at, created_by, sync_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [en.id, en.entry_type ?? 'OTHER_EVENT', en.event_id ?? null,
           en.event_name ?? null, en.event_date ?? null,
           en.person_id, en.person_name, en.village_name ?? null,
           en.cash_amount ?? 0, en.gold_weight ?? 0, en.remarks ?? null,
           en.created_at, en.updated_at, en.created_by ?? null, en.sync_status ?? 0],
        );
        count++;
      }

      return { success: true, recordsRestored: count };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  // ---------------------------------------------------------------------------
  // Cloud Backup (Google Drive)
  // ---------------------------------------------------------------------------

  /**
   * Sign in to Google, export local DB as JSON, upload to Drive.
   * Returns a BackupResult with the uploaded DriveFile metadata.
   */
  async backupToGoogleDrive(): Promise<BackupResult> {
    const timestamp = new Date().toISOString();
    try {
      // Sign in to Google (will throw GoogleDriveError on failure)
      await googleDriveService.signIn();

      // Export a local backup first
      const localResult = await this.exportBackup();
      if (!localResult.success || !localResult.path) {
        return {
          success: false,
          error: localResult.error ?? 'Local export failed',
          timestamp,
        };
      }

      // Upload to Google Drive
      const fileName = localResult.path.substring(
        localResult.path.lastIndexOf('/') + 1,
      );
      const driveFile = await googleDriveService.uploadFile(
        localResult.path,
        fileName,
      );

      // Record last backup time
      await settingsService.setLastBackup(timestamp);

      return { success: true, path: localResult.path, driveFile, timestamp };
    } catch (err) {
      if (err instanceof GoogleDriveError) {
        return { success: false, error: err.message, timestamp };
      }
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message, timestamp };
    }
  }

  /**
   * List available backup files stored on Google Drive.
   */
  async listCloudBackups(): Promise<DriveFile[]> {
    try {
      await googleDriveService.signIn();
      return await googleDriveService.listBackups();
    } catch (err) {
      if (err instanceof GoogleDriveError) {
        throw err;
      }
      throw new GoogleDriveError(
        'Failed to list cloud backups',
        'LIST_FAILED',
        err,
      );
    }
  }

  /**
   * Download a backup file from Google Drive and restore into the local DB.
   */
  async restoreFromGoogleDrive(fileId: string): Promise<RestoreResult> {
    try {
      await googleDriveService.signIn();

      // Download to a temp local path
      const tempPath = `${this.backupDir}/cloud_restore_temp.json`;
      await this.ensureBackupDir();
      await googleDriveService.downloadFile(fileId, tempPath);

      // Restore from the downloaded file
      const result = await this.restoreBackup(tempPath);

      // Clean up temp file
      try {
        await RNFS.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }

      return result;
    } catch (err) {
      if (err instanceof GoogleDriveError) {
        return { success: false, error: err.message };
      }
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  // ---------------------------------------------------------------------------
  // Auto-Backup Scheduling
  // ---------------------------------------------------------------------------

  /**
   * Store the backup interval preference and perform a backup if the
   * configured interval has elapsed since lastBackup.
   */
  async scheduleAutoBackup(interval: BackupInterval): Promise<void> {
    await settingsService.setAutoBackup(true);
    await settingsService.setBackupInterval(interval);

    if (await this.shouldAutoBackup()) {
      await this.backupToGoogleDrive();
    }
  }

  /**
   * Check whether the configured auto-backup interval has elapsed since
   * the last successful backup.
   */
  async shouldAutoBackup(): Promise<boolean> {
    const settings = await settingsService.getAll();

    if (!settings.autoBackup) {
      return false;
    }

    if (!settings.lastBackup) {
      // Never backed up → should backup
      return true;
    }

    const lastBackupTime = new Date(settings.lastBackup).getTime();
    const elapsed = Date.now() - lastBackupTime;
    const intervalMs = INTERVAL_MS[settings.backupInterval];

    return elapsed >= intervalMs;
  }

  // ---------------------------------------------------------------------------
  // Family Sharing
  // ---------------------------------------------------------------------------

  /**
   * Upload the current backup to Google Drive and share it with the given
   * email address.
   */
  async shareWithFamily(email: string): Promise<void> {
    // Perform a backup to Drive first
    const result = await this.backupToGoogleDrive();

    if (!result.success || !result.driveFile) {
      throw new GoogleDriveError(
        result.error ?? 'Backup failed before sharing',
        'UPLOAD_FAILED',
      );
    }

    // Share the uploaded file with the family member
    await googleDriveService.shareFile(result.driveFile.id, email);
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private resultToArray(result: { rows: { length: number; item: (i: number) => Record<string, unknown> } }): Record<string, unknown>[] {
    const arr: Record<string, unknown>[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      arr.push(result.rows.item(i));
    }
    return arr;
  }
}
