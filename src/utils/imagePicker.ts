import { Platform, PermissionsAndroid } from 'react-native';
import RNFS from 'react-native-fs';

/**
 * Directory where invitation images are stored.
 */
export const INVITATIONS_DIR = `${RNFS.DocumentDirectoryPath}/MoiFlow/invitations`;

/**
 * Ensure the invitations directory exists for a given event.
 */
export async function ensureInvitationDir(eventId: string): Promise<string> {
  const dir = `${INVITATIONS_DIR}/${eventId}`;
  const exists = await RNFS.exists(dir);
  if (!exists) {
    await RNFS.mkdir(dir);
  }
  return dir;
}

/**
 * Request camera permission on Android.
 * Returns true if granted.
 */
async function requestCameraPermission(): Promise<boolean> {
  if (Platform.OS === 'ios') return true;

  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: 'Camera Permission',
        message: 'MoiFlow needs access to your camera to capture invitation images.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      },
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/**
 * Request storage/photo library permission.
 * On Android 13+, READ_MEDIA_IMAGES is needed; older uses READ_EXTERNAL_STORAGE.
 */
async function requestGalleryPermission(): Promise<boolean> {
  if (Platform.OS === 'ios') return true;

  try {
    const sdkVersion = Platform.Version as number;
    // Android 13+ doesn't need explicit READ permission for image picker intents
    if (sdkVersion >= 33) return true;

    const permission = PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
    const result = await PermissionsAndroid.request(permission, {
      title: 'Gallery Permission',
      message: 'MoiFlow needs access to your gallery to pick invitation images.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    });
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/**
 * Pick an image from camera or gallery using react-native-image-picker.
 *
 * @param source - 'camera' to take a photo, 'gallery' to pick from library
 * @param eventId - The event ID used to determine the save directory
 * @returns The file path of the captured/selected image, 'cancelled' if user cancelled, or null if permission denied
 */
export async function pickImage(
  source: 'camera' | 'gallery',
  eventId: string,
): Promise<string | 'cancelled' | null> {
  try {
    // Request appropriate permission
    if (source === 'camera') {
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) return null;
    } else {
      const hasPermission = await requestGalleryPermission();
      if (!hasPermission) return null;
    }

    // Dynamically import react-native-image-picker
    let launchCamera: any;
    let launchImageLibrary: any;
    try {
      const imagePicker = require('react-native-image-picker');
      launchCamera = imagePicker.launchCamera;
      launchImageLibrary = imagePicker.launchImageLibrary;
    } catch {
      return null;
    }

    // Camera needs `saveToPhotos: true` on some Android versions for the
    // capture to be written to a readable URI; gallery must not use it.
    const options =
      source === 'camera'
        ? {
            mediaType: 'photo' as const,
            quality: 0.8 as const,
            saveToPhotos: true,
            includeBase64: false,
            cameraType: 'back' as const,
          }
        : {
            mediaType: 'photo' as const,
            quality: 0.8 as const,
            selectionLimit: 1,
            includeBase64: false,
          };

    const result = await new Promise<any>((resolve) => {
      if (source === 'camera') {
        launchCamera(options, resolve);
      } else {
        launchImageLibrary(options, resolve);
      }
    });

    if (result.didCancel) return 'cancelled';
    if (result.errorCode) {
      // permission / camera_unavailable / others — treat as failure (null) so
      // the caller can prompt the user. Log the reason for diagnostics.
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn(`[imagePicker] ${source} error:`, result.errorCode, result.errorMessage);
      }
      return null;
    }

    const asset = result.assets?.[0];
    if (!asset?.uri) return null;

    const sourceUri: string = asset.uri;

    // Copy to app's invitations directory for persistence.
    let destPath: string | null = null;
    try {
      const dir = await ensureInvitationDir(eventId);
      const filename = `invitation_${Date.now()}.jpg`;
      destPath = `${dir}/${filename}`;

      // RNFS.copyFile accepts file:// and content:// URIs directly. Try the
      // raw URI first (works for content://), then a stripped file path.
      try {
        await RNFS.copyFile(sourceUri, destPath);
      } catch {
        const stripped = sourceUri.startsWith('file://')
          ? sourceUri.replace('file://', '')
          : sourceUri;
        await RNFS.copyFile(stripped, destPath);
      }
    } catch {
      // Copy failed entirely — fall back to the original URI so OCR can still
      // read the just-captured image (it may live in a cache dir).
      return sourceUri;
    }

    return destPath;
  } catch (error) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[imagePicker] unexpected error:', error);
    }
    return null;
  }
}
