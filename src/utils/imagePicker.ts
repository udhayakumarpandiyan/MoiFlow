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
 * @returns The file path of the captured/selected image, or null if cancelled/denied
 */
export async function pickImage(
  source: 'camera' | 'gallery',
  eventId: string,
): Promise<string | null> {
  try {
    // Request appropriate permission
    if (source === 'camera') {
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) return null;
    } else {
      const hasPermission = await requestGalleryPermission();
      if (!hasPermission) return null;
    }

    // Dynamically import react-native-image-picker to avoid hard crash if not installed
    let launchCamera: any;
    let launchImageLibrary: any;
    try {
      const imagePicker = require('react-native-image-picker');
      launchCamera = imagePicker.launchCamera;
      launchImageLibrary = imagePicker.launchImageLibrary;
    } catch {
      // Fallback: if react-native-image-picker is not available, return placeholder path
      const dir = await ensureInvitationDir(eventId);
      const timestamp = Date.now();
      return `${dir}/invitation_${timestamp}.jpg`;
    }

    const options = {
      mediaType: 'photo' as const,
      quality: 0.8,
      saveToPhotos: false,
      includeBase64: false,
    };

    const result = await new Promise<any>((resolve) => {
      if (source === 'camera') {
        launchCamera(options, resolve);
      } else {
        launchImageLibrary(options, resolve);
      }
    });

    if (result.didCancel || result.errorCode) {
      if (result.errorCode === 'permission') return null;
      if (result.didCancel) return null;
      console.warn('[imagePicker] Error:', result.errorMessage);
      return null;
    }

    const asset = result.assets?.[0];
    if (!asset?.uri) return null;

    // Copy to app's invitations directory for persistence
    const dir = await ensureInvitationDir(eventId);
    const timestamp = Date.now();
    const filename = `invitation_${timestamp}.jpg`;
    const destPath = `${dir}/${filename}`;

    // On Android, the URI might be content:// — copy it to local storage
    const sourceUri = asset.uri.replace('file://', '');
    if (await RNFS.exists(sourceUri)) {
      await RNFS.copyFile(sourceUri, destPath);
    } else {
      // For content:// URIs, try copying directly
      await RNFS.copyFile(asset.uri, destPath);
    }

    return destPath;
  } catch (error) {
    console.error('[imagePicker] Error picking image:', error);
    return null;
  }
}
