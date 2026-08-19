/**
 * Unit Tests: BackupService Cloud Methods
 *
 * **Validates: Requirements 8.1, 8.2, 8.3**
 *
 * Tests the BackupService cloud methods: backupToGoogleDrive, listCloudBackups,
 * restoreFromGoogleDrive, shouldAutoBackup, shareWithFamily.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('react-native-fs', () => ({
  ExternalDirectoryPath: '/mock/external',
  readFile: jest.fn().mockResolvedValue('{"version":2,"data":{"entries":[],"events":[],"persons":[]}}'),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readDir: jest.fn().mockResolvedValue([]),
  exists: jest.fn().mockResolvedValue(true),
  mkdir: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

const mockExecuteSql = jest.fn().mockResolvedValue([{ rows: { length: 0, item: () => ({}) } }]);

jest.mock('../../src/database/db', () => ({
  getDB: jest.fn().mockResolvedValue({
    executeSql: (...args: unknown[]) => mockExecuteSql(...args),
  }),
}));

const mockSignIn = jest.fn().mockResolvedValue('mock-token');
const mockUploadFile = jest.fn();
const mockListBackups = jest.fn();
const mockDownloadFile = jest.fn();
const mockShareFile = jest.fn();

jest.mock('../../src/services/GoogleDriveService', () => ({
  googleDriveService: {
    signIn: (...args: unknown[]) => mockSignIn(...args),
    uploadFile: (...args: unknown[]) => mockUploadFile(...args),
    listBackups: (...args: unknown[]) => mockListBackups(...args),
    downloadFile: (...args: unknown[]) => mockDownloadFile(...args),
    shareFile: (...args: unknown[]) => mockShareFile(...args),
  },
  GoogleDriveError: class GoogleDriveError extends Error {
    code: string;
    cause?: unknown;
    constructor(message: string, code: string, cause?: unknown) {
      super(message);
      this.name = 'GoogleDriveError';
      this.code = code;
      this.cause = cause;
    }
  },
}));

const mockSettingsGetAll = jest.fn();
const mockSetLastBackup = jest.fn().mockResolvedValue(undefined);
const mockSetAutoBackup = jest.fn().mockResolvedValue(undefined);
const mockSetBackupInterval = jest.fn().mockResolvedValue(undefined);

jest.mock('../../src/services/SettingsService', () => ({
  settingsService: {
    getAll: (...args: unknown[]) => mockSettingsGetAll(...args),
    setLastBackup: (...args: unknown[]) => mockSetLastBackup(...args),
    setAutoBackup: (...args: unknown[]) => mockSetAutoBackup(...args),
    setBackupInterval: (...args: unknown[]) => mockSetBackupInterval(...args),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { BackupService } from '../../src/services/BackupService';
import { GoogleDriveError } from '../../src/services/GoogleDriveService';
import RNFS from 'react-native-fs';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BackupService - Cloud Methods', () => {
  let service: BackupService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BackupService();

    // Default mock: DB returns empty results for export
    mockExecuteSql.mockResolvedValue([{ rows: { length: 0, item: () => ({}) } }]);
  });

  // -------------------------------------------------------------------------
  // backupToGoogleDrive
  // -------------------------------------------------------------------------

  describe('backupToGoogleDrive', () => {
    it('should sign in, export local backup, upload to Drive, and record timestamp', async () => {
      const mockDriveFile = {
        id: 'drive-file-123',
        name: 'moiflow_backup_2024-01-15.json',
        modifiedTime: '2024-01-15T10:00:00Z',
        size: 2048,
      };
      mockUploadFile.mockResolvedValue(mockDriveFile);

      const result = await service.backupToGoogleDrive();

      expect(result.success).toBe(true);
      expect(result.driveFile).toEqual(mockDriveFile);
      expect(result.path).toContain('/mock/external/MoiFlow/backups/');
      expect(result.timestamp).toBeDefined();

      // Verify sign-in was called
      expect(mockSignIn).toHaveBeenCalled();
      // Verify upload was called with the local path and a filename
      expect(mockUploadFile).toHaveBeenCalledWith(
        expect.stringContaining('/mock/external/MoiFlow/backups/moiflow_backup_'),
        expect.stringContaining('moiflow_backup_'),
      );
      // Verify last backup timestamp was recorded
      expect(mockSetLastBackup).toHaveBeenCalledWith(expect.any(String));
    });

    it('should return error in BackupResult when Google Sign-In fails', async () => {
      mockSignIn.mockRejectedValueOnce(
        new GoogleDriveError('Google Sign-In failed', 'SIGN_IN_FAILED'),
      );

      const result = await service.backupToGoogleDrive();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Google Sign-In failed');
      expect(result.timestamp).toBeDefined();
      // Upload should not have been called
      expect(mockUploadFile).not.toHaveBeenCalled();
    });

    it('should return error when local export fails', async () => {
      // Make DB throw an error during export
      mockExecuteSql.mockRejectedValueOnce(new Error('DB corrupted'));

      const result = await service.backupToGoogleDrive();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(mockUploadFile).not.toHaveBeenCalled();
    });

    it('should return error when upload to Drive fails', async () => {
      mockUploadFile.mockRejectedValueOnce(
        new GoogleDriveError('Upload failed', 'UPLOAD_FAILED'),
      );

      const result = await service.backupToGoogleDrive();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Upload failed');
      expect(mockSetLastBackup).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // listCloudBackups
  // -------------------------------------------------------------------------

  describe('listCloudBackups', () => {
    it('should sign in and return DriveFile[] from Google Drive', async () => {
      const mockFiles = [
        { id: 'f1', name: 'backup1.json', modifiedTime: '2024-01-15T10:00:00Z', size: 512 },
        { id: 'f2', name: 'backup2.json', modifiedTime: '2024-01-14T10:00:00Z', size: 256 },
      ];
      mockListBackups.mockResolvedValue(mockFiles);

      const result = await service.listCloudBackups();

      expect(mockSignIn).toHaveBeenCalled();
      expect(mockListBackups).toHaveBeenCalled();
      expect(result).toEqual(mockFiles);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no cloud backups exist', async () => {
      mockListBackups.mockResolvedValue([]);

      const result = await service.listCloudBackups();

      expect(result).toEqual([]);
    });

    it('should throw GoogleDriveError when sign-in fails', async () => {
      mockSignIn.mockRejectedValueOnce(
        new GoogleDriveError('Sign-In failed', 'SIGN_IN_FAILED'),
      );

      await expect(service.listCloudBackups()).rejects.toMatchObject({
        name: 'GoogleDriveError',
        code: 'SIGN_IN_FAILED',
      });
    });

    it('should throw GoogleDriveError when list operation fails', async () => {
      mockListBackups.mockRejectedValueOnce(
        new GoogleDriveError('List failed', 'LIST_FAILED'),
      );

      await expect(service.listCloudBackups()).rejects.toThrow(GoogleDriveError);
    });

    it('should wrap non-GoogleDriveError as LIST_FAILED', async () => {
      mockListBackups.mockRejectedValueOnce(new Error('Network timeout'));

      await expect(service.listCloudBackups()).rejects.toMatchObject({
        code: 'LIST_FAILED',
      });
    });
  });

  // -------------------------------------------------------------------------
  // restoreFromGoogleDrive
  // -------------------------------------------------------------------------

  describe('restoreFromGoogleDrive', () => {
    const validBackupContent = JSON.stringify({
      version: 2,
      exportedAt: '2024-01-15T10:00:00Z',
      data: {
        entries: [
          { id: 'e1', entry_type: 'OTHER_EVENT', person_id: 'p1', person_name: 'Test', cash_amount: 1000, gold_weight: 0, created_at: '2024-01-01', updated_at: '2024-01-01' },
        ],
        events: [],
        persons: [],
      },
    });

    it('should sign in, download file, restore, and clean up temp file', async () => {
      mockDownloadFile.mockResolvedValue(undefined);
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce(validBackupContent);

      const result = await service.restoreFromGoogleDrive('drive-file-id');

      expect(result.success).toBe(true);
      expect(result.recordsRestored).toBe(1);

      // Verify sign-in was called
      expect(mockSignIn).toHaveBeenCalled();
      // Verify download was called with fileId and temp path
      expect(mockDownloadFile).toHaveBeenCalledWith(
        'drive-file-id',
        expect.stringContaining('cloud_restore_temp.json'),
      );
      // Verify temp file cleanup
      expect(RNFS.unlink).toHaveBeenCalledWith(
        expect.stringContaining('cloud_restore_temp.json'),
      );
    });

    it('should return error when sign-in fails', async () => {
      mockSignIn.mockRejectedValueOnce(
        new GoogleDriveError('Sign-In failed', 'SIGN_IN_FAILED'),
      );

      const result = await service.restoreFromGoogleDrive('drive-file-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Sign-In failed');
    });

    it('should return error when download fails', async () => {
      mockDownloadFile.mockRejectedValueOnce(
        new GoogleDriveError('Download failed', 'DOWNLOAD_FAILED'),
      );

      const result = await service.restoreFromGoogleDrive('drive-file-id');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Download failed');
    });

    it('should return error when backup file has invalid format', async () => {
      mockDownloadFile.mockResolvedValue(undefined);
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce('not valid json');

      const result = await service.restoreFromGoogleDrive('drive-file-id');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should still succeed even if temp file cleanup fails', async () => {
      mockDownloadFile.mockResolvedValue(undefined);
      (RNFS.readFile as jest.Mock).mockResolvedValueOnce(validBackupContent);
      (RNFS.unlink as jest.Mock).mockRejectedValueOnce(new Error('Cleanup failed'));

      const result = await service.restoreFromGoogleDrive('drive-file-id');

      // Restore should still succeed — cleanup errors are ignored
      expect(result.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // shouldAutoBackup
  // -------------------------------------------------------------------------

  describe('shouldAutoBackup', () => {
    it('should return false when autoBackup is disabled', async () => {
      mockSettingsGetAll.mockResolvedValue({
        autoBackup: false,
        backupInterval: 'daily',
        lastBackup: null,
      });

      const result = await service.shouldAutoBackup();

      expect(result).toBe(false);
    });

    it('should return true when autoBackup is enabled and no previous backup exists', async () => {
      mockSettingsGetAll.mockResolvedValue({
        autoBackup: true,
        backupInterval: 'daily',
        lastBackup: null,
      });

      const result = await service.shouldAutoBackup();

      expect(result).toBe(true);
    });

    it('should return true when daily interval has elapsed', async () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      mockSettingsGetAll.mockResolvedValue({
        autoBackup: true,
        backupInterval: 'daily',
        lastBackup: twoDaysAgo,
      });

      const result = await service.shouldAutoBackup();

      expect(result).toBe(true);
    });

    it('should return false when daily interval has NOT elapsed', async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      mockSettingsGetAll.mockResolvedValue({
        autoBackup: true,
        backupInterval: 'daily',
        lastBackup: oneHourAgo,
      });

      const result = await service.shouldAutoBackup();

      expect(result).toBe(false);
    });

    it('should return true when weekly interval has elapsed', async () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      mockSettingsGetAll.mockResolvedValue({
        autoBackup: true,
        backupInterval: 'weekly',
        lastBackup: eightDaysAgo,
      });

      const result = await service.shouldAutoBackup();

      expect(result).toBe(true);
    });

    it('should return false when weekly interval has NOT elapsed', async () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      mockSettingsGetAll.mockResolvedValue({
        autoBackup: true,
        backupInterval: 'weekly',
        lastBackup: threeDaysAgo,
      });

      const result = await service.shouldAutoBackup();

      expect(result).toBe(false);
    });

    it('should return true when monthly interval has elapsed', async () => {
      const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
      mockSettingsGetAll.mockResolvedValue({
        autoBackup: true,
        backupInterval: 'monthly',
        lastBackup: thirtyOneDaysAgo,
      });

      const result = await service.shouldAutoBackup();

      expect(result).toBe(true);
    });

    it('should return false when monthly interval has NOT elapsed', async () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      mockSettingsGetAll.mockResolvedValue({
        autoBackup: true,
        backupInterval: 'monthly',
        lastBackup: tenDaysAgo,
      });

      const result = await service.shouldAutoBackup();

      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // shareWithFamily
  // -------------------------------------------------------------------------

  describe('shareWithFamily', () => {
    it('should backup to Drive and share the file with the given email', async () => {
      const mockDriveFile = {
        id: 'shared-file-123',
        name: 'moiflow_backup.json',
        modifiedTime: '2024-01-15T10:00:00Z',
        size: 1024,
      };
      mockUploadFile.mockResolvedValue(mockDriveFile);
      mockShareFile.mockResolvedValue(undefined);

      await service.shareWithFamily('family@example.com');

      // Verify backup was performed
      expect(mockSignIn).toHaveBeenCalled();
      expect(mockUploadFile).toHaveBeenCalled();
      // Verify file was shared
      expect(mockShareFile).toHaveBeenCalledWith('shared-file-123', 'family@example.com');
    });

    it('should throw GoogleDriveError when backup fails before sharing', async () => {
      mockSignIn.mockRejectedValueOnce(
        new GoogleDriveError('Sign-In failed', 'SIGN_IN_FAILED'),
      );

      await expect(service.shareWithFamily('family@example.com'))
        .rejects.toThrow(GoogleDriveError);
      expect(mockShareFile).not.toHaveBeenCalled();
    });

    it('should throw GoogleDriveError when upload succeeds but sharing fails', async () => {
      const mockDriveFile = {
        id: 'file-456',
        name: 'backup.json',
        modifiedTime: '2024-01-15T10:00:00Z',
        size: 512,
      };
      mockUploadFile.mockResolvedValue(mockDriveFile);
      mockShareFile.mockRejectedValueOnce(
        new GoogleDriveError('Share failed', 'SHARE_FAILED'),
      );

      await expect(service.shareWithFamily('family@example.com'))
        .rejects.toThrow(GoogleDriveError);
    });
  });
});
