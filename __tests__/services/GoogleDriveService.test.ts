/**
 * Unit Tests: GoogleDriveService
 *
 * **Validates: Requirements 8.1, 8.6**
 *
 * Tests the GoogleDriveService methods: signIn, signOut, getOrCreateFolder,
 * uploadFile, listBackups, downloadFile, shareFile.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('react-native-fs', () => ({
  readFile: jest.fn().mockResolvedValue('{"version":2,"data":{}}'),
  writeFile: jest.fn().mockResolvedValue(undefined),
  exists: jest.fn().mockResolvedValue(true),
  mkdir: jest.fn().mockResolvedValue(undefined),
}));

const mockConfigure = jest.fn();
const mockHasPlayServices = jest.fn().mockResolvedValue(true);
const mockSignInFn = jest.fn().mockResolvedValue({ user: { email: 'test@example.com' } });
const mockSignOutFn = jest.fn().mockResolvedValue(null);
const mockGetTokens = jest.fn().mockResolvedValue({ accessToken: 'mock-access-token' });

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: (...args: unknown[]) => mockConfigure(...args),
    hasPlayServices: (...args: unknown[]) => mockHasPlayServices(...args),
    signIn: (...args: unknown[]) => mockSignInFn(...args),
    signOut: (...args: unknown[]) => mockSignOutFn(...args),
    getTokens: (...args: unknown[]) => mockGetTokens(...args),
  },
}));

// Mock global fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

import { GoogleDriveService, GoogleDriveError } from '../../src/services/GoogleDriveService';
import RNFS from 'react-native-fs';

describe('GoogleDriveService', () => {
  let service: GoogleDriveService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GoogleDriveService();
  });

  // -------------------------------------------------------------------------
  // signIn
  // -------------------------------------------------------------------------

  describe('signIn', () => {
    it('should configure GoogleSignin with drive.file scope and return access token', async () => {
      const token = await service.signIn();

      expect(mockConfigure).toHaveBeenCalledWith({
        scopes: ['https://www.googleapis.com/auth/drive.file'],
        offlineAccess: false,
      });
      expect(mockHasPlayServices).toHaveBeenCalledWith({ showPlayServicesUpdateDialog: true });
      expect(mockSignInFn).toHaveBeenCalled();
      expect(mockGetTokens).toHaveBeenCalled();
      expect(token).toBe('mock-access-token');
    });

    it('should throw GoogleDriveError with SIGN_IN_FAILED when signIn rejects', async () => {
      mockSignInFn.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.signIn()).rejects.toThrow(GoogleDriveError);

      mockSignInFn.mockRejectedValueOnce(new Error('Network error'));
      await expect(service.signIn()).rejects.toMatchObject({ code: 'SIGN_IN_FAILED' });
    });

    it('should throw GoogleDriveError with TOKEN_UNAVAILABLE when no token returned', async () => {
      mockGetTokens.mockResolvedValueOnce({ accessToken: null });

      await expect(service.signIn()).rejects.toThrow(GoogleDriveError);

      mockGetTokens.mockResolvedValueOnce({ accessToken: null });
      await expect(service.signIn()).rejects.toMatchObject({ code: 'TOKEN_UNAVAILABLE' });
    });
  });

  // -------------------------------------------------------------------------
  // signOut
  // -------------------------------------------------------------------------

  describe('signOut', () => {
    it('should call GoogleSignin.signOut and clear internal state', async () => {
      await service.signIn(); // set up token
      await service.signOut();

      expect(mockSignOutFn).toHaveBeenCalled();
    });

    it('should throw GoogleDriveError with SIGN_OUT_FAILED on error', async () => {
      await service.signIn();
      mockSignOutFn.mockRejectedValueOnce(new Error('Sign out failed'));

      await expect(service.signOut()).rejects.toThrow(GoogleDriveError);

      await service.signIn();
      mockSignOutFn.mockRejectedValueOnce(new Error('Sign out failed'));
      await expect(service.signOut()).rejects.toMatchObject({ code: 'SIGN_OUT_FAILED' });
    });
  });

  // -------------------------------------------------------------------------
  // getOrCreateFolder
  // -------------------------------------------------------------------------

  describe('getOrCreateFolder', () => {
    beforeEach(async () => {
      await service.signIn();
    });

    it('should find existing MoiFlow_Backups folder', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: [{ id: 'folder-123', name: 'MoiFlow_Backups' }] }),
      });

      const folderId = await service.getOrCreateFolder();

      expect(folderId).toBe('folder-123');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toContain('drive/v3/files');
    });

    it('should create folder when not found', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ files: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'new-folder-456' }),
        });

      const folderId = await service.getOrCreateFolder();

      expect(folderId).toBe('new-folder-456');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      // Second call is the folder creation POST
      expect(mockFetch.mock.calls[1][1]).toMatchObject({
        method: 'POST',
        body: expect.stringContaining('MoiFlow_Backups'),
      });
    });

    it('should cache folder ID on subsequent calls', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: [{ id: 'folder-cached', name: 'MoiFlow_Backups' }] }),
      });

      const first = await service.getOrCreateFolder();
      const second = await service.getOrCreateFolder();

      expect(first).toBe('folder-cached');
      expect(second).toBe('folder-cached');
      // Only one API call thanks to caching
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should throw FOLDER_CREATION_FAILED on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(service.getOrCreateFolder()).rejects.toThrow(GoogleDriveError);
      await expect(service.getOrCreateFolder()).rejects.toMatchObject({
        code: 'FOLDER_CREATION_FAILED',
      });
    });
  });

  // -------------------------------------------------------------------------
  // uploadFile
  // -------------------------------------------------------------------------

  describe('uploadFile', () => {
    beforeEach(async () => {
      await service.signIn();
      // Mock getOrCreateFolder
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: [{ id: 'folder-id', name: 'MoiFlow_Backups' }] }),
      });
    });

    it('should upload file with multipart request and return DriveFile', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'file-123',
          name: 'backup.json',
          modifiedTime: '2024-01-15T10:00:00Z',
          size: '1024',
        }),
      });

      const result = await service.uploadFile('/path/to/file.json', 'backup.json');

      expect(result).toEqual({
        id: 'file-123',
        name: 'backup.json',
        modifiedTime: '2024-01-15T10:00:00Z',
        size: 1024,
      });
      expect(RNFS.readFile).toHaveBeenCalledWith('/path/to/file.json', 'utf8');
      // Upload call should use multipart/related
      const uploadCall = mockFetch.mock.calls[1];
      expect(uploadCall[0]).toContain('uploadType=multipart');
      expect(uploadCall[1].headers['Content-Type']).toContain('multipart/related');
    });

    it('should throw UPLOAD_FAILED on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });

      await expect(service.uploadFile('/path/to/file.json', 'backup.json'))
        .rejects.toMatchObject({ code: 'UPLOAD_FAILED' });
    });
  });

  // -------------------------------------------------------------------------
  // listBackups
  // -------------------------------------------------------------------------

  describe('listBackups', () => {
    beforeEach(async () => {
      await service.signIn();
      // Mock getOrCreateFolder
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: [{ id: 'folder-id', name: 'MoiFlow_Backups' }] }),
      });
    });

    it('should list backup files from the MoiFlow_Backups folder', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          files: [
            { id: 'f1', name: 'backup1.json', modifiedTime: '2024-01-15T10:00:00Z', size: '512' },
            { id: 'f2', name: 'backup2.json', modifiedTime: '2024-01-14T10:00:00Z', size: '256' },
          ],
        }),
      });

      const backups = await service.listBackups();

      expect(backups).toHaveLength(2);
      expect(backups[0]).toEqual({
        id: 'f1',
        name: 'backup1.json',
        modifiedTime: '2024-01-15T10:00:00Z',
        size: 512,
      });
      expect(backups[1]).toEqual({
        id: 'f2',
        name: 'backup2.json',
        modifiedTime: '2024-01-14T10:00:00Z',
        size: 256,
      });
    });

    it('should return empty array when no backups exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: [] }),
      });

      const backups = await service.listBackups();
      expect(backups).toEqual([]);
    });

    it('should throw LIST_FAILED on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(service.listBackups()).rejects.toMatchObject({ code: 'LIST_FAILED' });
    });
  });

  // -------------------------------------------------------------------------
  // downloadFile
  // -------------------------------------------------------------------------

  describe('downloadFile', () => {
    beforeEach(async () => {
      await service.signIn();
    });

    it('should download file content and write to local path', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '{"version":2,"data":{"entries":[]}}',
      });

      await service.downloadFile('file-123', '/local/path/backup.json');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/drive/v3/files/file-123?alt=media',
        expect.objectContaining({
          headers: { Authorization: 'Bearer mock-access-token' },
        }),
      );
      expect(RNFS.writeFile).toHaveBeenCalledWith(
        '/local/path/backup.json',
        '{"version":2,"data":{"entries":[]}}',
        'utf8',
      );
    });

    it('should create parent directory if it does not exist', async () => {
      (RNFS.exists as jest.Mock).mockResolvedValueOnce(false);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => '{}',
      });

      await service.downloadFile('file-123', '/local/new/dir/backup.json');

      expect(RNFS.mkdir).toHaveBeenCalledWith('/local/new/dir');
    });

    it('should throw DOWNLOAD_FAILED on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      await expect(service.downloadFile('file-123', '/local/path/backup.json'))
        .rejects.toMatchObject({ code: 'DOWNLOAD_FAILED' });
    });
  });

  // -------------------------------------------------------------------------
  // shareFile
  // -------------------------------------------------------------------------

  describe('shareFile', () => {
    beforeEach(async () => {
      await service.signIn();
    });

    it('should share file with reader role for the given email', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'permission-id' }),
      });

      await service.shareFile('file-123', 'family@example.com');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/drive/v3/files/file-123/permissions',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            role: 'reader',
            type: 'user',
            emailAddress: 'family@example.com',
          }),
        }),
      );
    });

    it('should throw SHARE_FAILED on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad request',
      });

      await expect(service.shareFile('file-123', 'bad@example.com'))
        .rejects.toMatchObject({ code: 'SHARE_FAILED' });
    });
  });

  // -------------------------------------------------------------------------
  // Token validation
  // -------------------------------------------------------------------------

  describe('token validation', () => {
    it('should throw TOKEN_UNAVAILABLE when calling methods without signing in', async () => {
      await expect(service.listBackups()).rejects.toMatchObject({ code: 'TOKEN_UNAVAILABLE' });
      await expect(service.downloadFile('id', '/path'))
        .rejects.toMatchObject({ code: 'TOKEN_UNAVAILABLE' });
      await expect(service.shareFile('id', 'email'))
        .rejects.toMatchObject({ code: 'TOKEN_UNAVAILABLE' });
    });
  });
});
