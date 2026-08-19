import { GoogleSignin } from '@react-native-google-signin/google-signin';
import RNFS from 'react-native-fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  size: number;
}

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

export class GoogleDriveError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'SIGN_IN_FAILED'
      | 'SIGN_OUT_FAILED'
      | 'UPLOAD_FAILED'
      | 'DOWNLOAD_FAILED'
      | 'LIST_FAILED'
      | 'SHARE_FAILED'
      | 'FOLDER_CREATION_FAILED'
      | 'TOKEN_UNAVAILABLE',
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'GoogleDriveError';
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3/files';
const BACKUP_FOLDER_NAME = 'MoiFlow_Backups';
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// ---------------------------------------------------------------------------
// GoogleDriveService
// ---------------------------------------------------------------------------

export class GoogleDriveService {
  private accessToken: string | null = null;
  private backupFolderId: string | null = null;

  // -------------------------------------------------------------------------
  // Sign In
  // -------------------------------------------------------------------------

  /**
   * Configure Google Sign-In with Drive file scope, sign in, and return an
   * access token for Drive API calls.
   */
  async signIn(): Promise<string> {
    try {
      GoogleSignin.configure({
        scopes: SCOPES,
        offlineAccess: false,
      });

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      await GoogleSignin.signIn();

      const tokenResult = await GoogleSignin.getTokens();
      const token = tokenResult.accessToken;

      if (!token) {
        throw new GoogleDriveError(
          'Failed to obtain access token after sign-in',
          'TOKEN_UNAVAILABLE',
        );
      }

      this.accessToken = token;
      return token;
    } catch (error) {
      if (error instanceof GoogleDriveError) throw error;
      throw new GoogleDriveError(
        'Google Sign-In failed',
        'SIGN_IN_FAILED',
        error,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Sign Out
  // -------------------------------------------------------------------------

  /**
   * Sign out of Google, clearing the cached access token.
   */
  async signOut(): Promise<void> {
    try {
      await GoogleSignin.signOut();
      this.accessToken = null;
      this.backupFolderId = null;
    } catch (error) {
      throw new GoogleDriveError(
        'Google Sign-Out failed',
        'SIGN_OUT_FAILED',
        error,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Get or Create Backup Folder
  // -------------------------------------------------------------------------

  /**
   * Find the MoiFlow_Backups folder on the user's Drive. If it does not
   * exist, create it. Returns the folder ID.
   */
  async getOrCreateFolder(): Promise<string> {
    if (this.backupFolderId) return this.backupFolderId;

    const token = this.getToken();

    try {
      // Search for existing folder
      const query = encodeURIComponent(
        `name='${BACKUP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      );
      const searchUrl = `${DRIVE_API_BASE}/files?q=${query}&fields=files(id,name)`;

      const searchResponse = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!searchResponse.ok) {
        throw new Error(`Search failed with status ${searchResponse.status}`);
      }

      const searchData = await searchResponse.json();
      const files = searchData.files as { id: string; name: string }[];

      if (files && files.length > 0) {
        this.backupFolderId = files[0].id;
        return this.backupFolderId;
      }

      // Create folder if not found
      const createResponse = await fetch(`${DRIVE_API_BASE}/files`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: BACKUP_FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder',
        }),
      });

      if (!createResponse.ok) {
        throw new Error(`Folder creation failed with status ${createResponse.status}`);
      }

      const folderData = await createResponse.json();
      this.backupFolderId = folderData.id as string;
      return this.backupFolderId;
    } catch (error) {
      if (error instanceof GoogleDriveError) throw error;
      throw new GoogleDriveError(
        'Failed to get or create backup folder',
        'FOLDER_CREATION_FAILED',
        error,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Upload File
  // -------------------------------------------------------------------------

  /**
   * Upload a local file to the MoiFlow_Backups folder on Google Drive.
   * Uses resumable upload for reliability.
   */
  async uploadFile(localPath: string, fileName: string): Promise<DriveFile> {
    const token = this.getToken();

    try {
      const folderId = await this.getOrCreateFolder();

      // Read the local file content
      const fileContent = await RNFS.readFile(localPath, 'utf8');

      // Multipart upload (simple for JSON backup files)
      const boundary = 'moiflow_boundary_' + Date.now();
      const metadata = JSON.stringify({
        name: fileName,
        parents: [folderId],
        mimeType: 'application/json',
      });

      const multipartBody =
        `--${boundary}\r\n` +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        metadata +
        '\r\n' +
        `--${boundary}\r\n` +
        'Content-Type: application/json\r\n\r\n' +
        fileContent +
        '\r\n' +
        `--${boundary}--`;

      const uploadResponse = await fetch(
        `${DRIVE_UPLOAD_BASE}?uploadType=multipart&fields=id,name,modifiedTime,size`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: multipartBody,
        },
      );

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`Upload failed with status ${uploadResponse.status}: ${errorText}`);
      }

      const uploadData = await uploadResponse.json();
      return {
        id: uploadData.id,
        name: uploadData.name,
        modifiedTime: uploadData.modifiedTime,
        size: Number(uploadData.size) || 0,
      };
    } catch (error) {
      if (error instanceof GoogleDriveError) throw error;
      throw new GoogleDriveError(
        'Failed to upload file to Google Drive',
        'UPLOAD_FAILED',
        error,
      );
    }
  }

  // -------------------------------------------------------------------------
  // List Backups
  // -------------------------------------------------------------------------

  /**
   * List all backup files in the MoiFlow_Backups folder, sorted by most
   * recent first.
   */
  async listBackups(): Promise<DriveFile[]> {
    const token = this.getToken();

    try {
      const folderId = await this.getOrCreateFolder();

      const query = encodeURIComponent(
        `'${folderId}' in parents and trashed=false`,
      );
      const url =
        `${DRIVE_API_BASE}/files?q=${query}&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime desc`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`List failed with status ${response.status}`);
      }

      const data = await response.json();
      const files = (data.files ?? []) as Array<{
        id: string;
        name: string;
        modifiedTime: string;
        size: string;
      }>;

      return files.map(f => ({
        id: f.id,
        name: f.name,
        modifiedTime: f.modifiedTime,
        size: Number(f.size) || 0,
      }));
    } catch (error) {
      if (error instanceof GoogleDriveError) throw error;
      throw new GoogleDriveError(
        'Failed to list backups from Google Drive',
        'LIST_FAILED',
        error,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Download File
  // -------------------------------------------------------------------------

  /**
   * Download a file from Google Drive to the specified local path.
   */
  async downloadFile(fileId: string, localPath: string): Promise<void> {
    const token = this.getToken();

    try {
      const url = `${DRIVE_API_BASE}/files/${fileId}?alt=media`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}`);
      }

      const content = await response.text();

      // Ensure parent directory exists
      const parentDir = localPath.substring(0, localPath.lastIndexOf('/'));
      const dirExists = await RNFS.exists(parentDir);
      if (!dirExists) {
        await RNFS.mkdir(parentDir);
      }

      await RNFS.writeFile(localPath, content, 'utf8');
    } catch (error) {
      if (error instanceof GoogleDriveError) throw error;
      throw new GoogleDriveError(
        'Failed to download file from Google Drive',
        'DOWNLOAD_FAILED',
        error,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Share File
  // -------------------------------------------------------------------------

  /**
   * Share a Drive file with a specific email address (reader role).
   */
  async shareFile(fileId: string, email: string): Promise<void> {
    const token = this.getToken();

    try {
      const url = `${DRIVE_API_BASE}/files/${fileId}/permissions`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: 'reader',
          type: 'user',
          emailAddress: email,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Share failed with status ${response.status}: ${errorText}`);
      }
    } catch (error) {
      if (error instanceof GoogleDriveError) throw error;
      throw new GoogleDriveError(
        'Failed to share file on Google Drive',
        'SHARE_FAILED',
        error,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Get the current access token, throwing if not signed in.
   */
  private getToken(): string {
    if (!this.accessToken) {
      throw new GoogleDriveError(
        'Not signed in to Google. Call signIn() first.',
        'TOKEN_UNAVAILABLE',
      );
    }
    return this.accessToken;
  }
}

// ---------------------------------------------------------------------------
// Singleton Instance
// ---------------------------------------------------------------------------

export const googleDriveService = new GoogleDriveService();
