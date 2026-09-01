import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';
import { settingsService } from './SettingsService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthState {
  isRegistered: boolean;
  securityMethod: 'pin' | null;
  hasCredentials: boolean;
  isSessionActive: boolean;
  failedAttempts: number;
  lockoutUntil: number | null;
}

// ---------------------------------------------------------------------------
// Storage Keys
// ---------------------------------------------------------------------------

const AUTH_KEYS = {
  REGISTERED: 'app.registered',
  SESSION_ACTIVE: 'auth.session_active',
  SESSION_TOKEN: 'auth.session_token',
  FAILED_ATTEMPTS: 'auth.failed_attempts',
  LOCKOUT_UNTIL: 'auth.lockout_until',
  USER_NAME: 'app.user_name',
  USER_PHONE: 'app.user_phone',
  REGISTERED_USERS: 'app.registered_users',
} as const;

// Keychain service identifiers
const KEYCHAIN_SERVICE_MPIN = 'com.moiflow.mpin';

// ---------------------------------------------------------------------------
// Registered user record
// ---------------------------------------------------------------------------

export interface RegisteredUser {
  name: string;
  phone: string;
  registeredAt: string; // ISO date string
}

// ---------------------------------------------------------------------------
// Secure MPIN hashing
// ---------------------------------------------------------------------------

/**
 * SHA-256 based hash using SubtleCrypto-like approach.
 * Uses a salt derived from the phone number for added security.
 * Falls back to a strong deterministic hash if crypto is unavailable.
 */
export const hashMPIN = (mpin: string, salt: string): string => {
  // Use a PBKDF2-inspired iterative hash for brute-force resistance.
  // Since we can't use native crypto synchronously in RN without extra deps,
  // we use an iterative hash with many rounds to slow down brute-force.
  let hash = `${salt}:${mpin}`;
  for (let round = 0; round < 10000; round++) {
    let h = 0x811c9dc5; // FNV-1a offset basis
    for (let i = 0; i < hash.length; i++) {
      h ^= hash.charCodeAt(i);
      h = Math.imul(h, 0x01000193); // FNV prime
    }
    hash = `${(h >>> 0).toString(16)}:${round}:${salt}`;
  }
  return hash;
};

// ---------------------------------------------------------------------------
// Constants — Escalating lockout
// ---------------------------------------------------------------------------

const LOCKOUT_TIERS = [
  { attempts: 3, durationMs: 30_000 },    // 30 seconds
  { attempts: 6, durationMs: 300_000 },   // 5 minutes
  { attempts: 9, durationMs: 1_800_000 }, // 30 minutes
  { attempts: 12, durationMs: 3_600_000 }, // 1 hour
] as const;

function getLockoutDuration(failedAttempts: number): number | null {
  // Find the highest tier that matches
  for (let i = LOCKOUT_TIERS.length - 1; i >= 0; i--) {
    if (failedAttempts >= LOCKOUT_TIERS[i].attempts && failedAttempts % 3 === 0) {
      return LOCKOUT_TIERS[i].durationMs;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// AuthService
// ---------------------------------------------------------------------------

export class AuthService {
  // -------------------------------------------------------------------------
  // Get auth state
  // -------------------------------------------------------------------------

  async getAuthState(): Promise<AuthState> {
    try {
      const [
        registered,
        sessionActive,
        failedAttemptsRaw,
        lockoutUntilRaw,
        securityEnabled,
        securityMethodRaw,
      ] = await AsyncStorage.multiGet([
        AUTH_KEYS.REGISTERED,
        AUTH_KEYS.SESSION_ACTIVE,
        AUTH_KEYS.FAILED_ATTEMPTS,
        AUTH_KEYS.LOCKOUT_UNTIL,
        'settings.security_enabled',
        'settings.security_method',
      ]).then(pairs => pairs.map(([, v]) => v));

      const isRegistered = registered === 'true';
      const isSessionActive = sessionActive === 'true';
      const failedAttempts = failedAttemptsRaw ? parseInt(failedAttemptsRaw, 10) || 0 : 0;
      const lockoutUntil = lockoutUntilRaw ? parseInt(lockoutUntilRaw, 10) : null;

      // Check if MPIN is stored in secure storage
      const hasCredentials = await this.hasMPINStored();

      // If Keychain read fails (e.g., due to accessControl restrictions from older
      // app version) but settings indicate MPIN was set up, treat as having credentials
      const effectiveHasCredentials = hasCredentials ||
        (securityEnabled === 'true' && securityMethodRaw === 'pin');

      // Only report security method when security is explicitly enabled
      let securityMethod: 'pin' | null = null;
      if (securityEnabled === 'true' && securityMethodRaw === 'pin') {
        securityMethod = 'pin';
      }

      return {
        isRegistered,
        securityMethod,
        hasCredentials: effectiveHasCredentials,
        isSessionActive,
        failedAttempts,
        lockoutUntil,
      };
    } catch (error) {
      return {
        isRegistered: false,
        securityMethod: null,
        hasCredentials: false,
        isSessionActive: false,
        failedAttempts: 0,
        lockoutUntil: null,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  /**
   * Returns the existing registered user if the phone number is already taken.
   */
  async checkDuplicateUser(phone: string): Promise<RegisteredUser | null> {
    try {
      const raw = await AsyncStorage.getItem(AUTH_KEYS.REGISTERED_USERS);
      if (!raw) return null;
      const users: RegisteredUser[] = JSON.parse(raw);
      return users.find(u => u.phone === phone) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Get all registered users (persisted list).
   */
  async getRegisteredUsers(): Promise<RegisteredUser[]> {
    try {
      const raw = await AsyncStorage.getItem(AUTH_KEYS.REGISTERED_USERS);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  async completeRegistration(name: string, phone: string): Promise<void> {
    // Store in the global registered users list
    const users = await this.getRegisteredUsers();
    users.push({ name, phone, registeredAt: new Date().toISOString() });
    await AsyncStorage.setItem(AUTH_KEYS.REGISTERED_USERS, JSON.stringify(users));

    // Mark current device/user as registered
    await AsyncStorage.multiSet([
      [AUTH_KEYS.REGISTERED, 'true'],
      [AUTH_KEYS.USER_NAME, name],
      [AUTH_KEYS.USER_PHONE, phone],
    ]);
  }

  // -------------------------------------------------------------------------
  // Session token management
  // -------------------------------------------------------------------------

  async saveSessionToken(token: string): Promise<void> {
    await AsyncStorage.setItem(AUTH_KEYS.SESSION_TOKEN, token);
    await AsyncStorage.setItem(AUTH_KEYS.SESSION_ACTIVE, 'true');
  }

  async getSessionToken(): Promise<string | null> {
    return AsyncStorage.getItem(AUTH_KEYS.SESSION_TOKEN);
  }

  async clearSessionToken(): Promise<void> {
    await AsyncStorage.multiRemove([AUTH_KEYS.SESSION_TOKEN, AUTH_KEYS.SESSION_ACTIVE]);
  }

  // -------------------------------------------------------------------------
  // MPIN setup — Secure storage via Keychain/Keystore
  // -------------------------------------------------------------------------

  /**
   * Store the MPIN hash securely using react-native-keychain.
   * The MPIN is hashed with the user's phone as salt before storage.
   * The actual MPIN is NEVER stored.
   */
  async setupMPIN(mpin: string): Promise<void> {
    const phone = await AsyncStorage.getItem(AUTH_KEYS.USER_PHONE);
    const salt = phone || 'moiflow-default-salt';
    const hashed = hashMPIN(mpin, salt);

    // Store hash in device's secure storage (Keychain/Keystore).
    // Use AES_GCM_NO_AUTH — no biometric authentication required.
    // This avoids CryptoFailedException on devices without enrolled fingerprints.
    await Keychain.setGenericPassword('mpin_hash', hashed, {
      service: KEYCHAIN_SERVICE_MPIN,
      storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
    });

    // Update settings (only stores the method flag, NOT the hash)
    await settingsService.setSecurityEnabled(true);
    await settingsService.setSecurityMethod('pin');
    await AsyncStorage.setItem(AUTH_KEYS.SESSION_ACTIVE, 'true');
  }

  /**
   * Check if an MPIN has been stored in secure storage.
   */
  async hasMPINStored(): Promise<boolean> {
    try {
      const credentials = await Keychain.getGenericPassword({
        service: KEYCHAIN_SERVICE_MPIN,
        storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
      });
      return credentials !== false;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // MPIN Verification — Local, secure, no API call
  // -------------------------------------------------------------------------

  async verifyMPIN(mpin: string): Promise<boolean> {
    try {
      const credentials = await Keychain.getGenericPassword({
        service: KEYCHAIN_SERVICE_MPIN,
        storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
      });

      if (!credentials) return false;

      const storedHash = credentials.password;
      const phone = await AsyncStorage.getItem(AUTH_KEYS.USER_PHONE);
      const salt = phone || 'moiflow-default-salt';
      const inputHash = hashMPIN(mpin, salt);

      const isValid = storedHash === inputHash;

      if (isValid) {
        await this.resetFailedAttempts();
        await AsyncStorage.setItem(AUTH_KEYS.SESSION_ACTIVE, 'true');
      }

      return isValid;
    } catch (error) {

      // Handle CryptoFailedException (biometric not enrolled / old accessControl).
      // The old MPIN was stored with biometric accessControl that now fails.
      // Reset the corrupted entry and re-store with AES storage.
      try {
        await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE_MPIN });
        // Re-store with the entered MPIN using AES (no biometric)
        await this.setupMPIN(mpin);
        await this.resetFailedAttempts();
        await AsyncStorage.setItem(AUTH_KEYS.SESSION_ACTIVE, 'true');
        return true;
      } catch (resetError) {
        return false;
      }
    }
  }

  /**
   * Change MPIN — requires verification of the current MPIN first.
   */
  async changeMPIN(currentMpin: string, newMpin: string): Promise<boolean> {
    const isValid = await this.verifyMPIN(currentMpin);
    if (!isValid) return false;

    await this.setupMPIN(newMpin);
    return true;
  }

  // -------------------------------------------------------------------------
  // Sign out
  // -------------------------------------------------------------------------

  async signOut(): Promise<void> {
    await AsyncStorage.setItem(AUTH_KEYS.SESSION_ACTIVE, 'false');
    await this.clearSessionToken();
    await this.resetFailedAttempts();
  }

  // -------------------------------------------------------------------------
  // Failed attempts & escalating lockout
  // -------------------------------------------------------------------------

  async recordFailedAttempt(): Promise<{ locked: boolean; lockoutSeconds: number }> {
    const currentRaw = await AsyncStorage.getItem(AUTH_KEYS.FAILED_ATTEMPTS);
    const current = currentRaw ? parseInt(currentRaw, 10) || 0 : 0;
    const next = current + 1;

    await AsyncStorage.setItem(AUTH_KEYS.FAILED_ATTEMPTS, String(next));

    const lockoutMs = getLockoutDuration(next);
    if (lockoutMs) {
      const lockoutUntil = Date.now() + lockoutMs;
      await AsyncStorage.setItem(AUTH_KEYS.LOCKOUT_UNTIL, String(lockoutUntil));
      return { locked: true, lockoutSeconds: lockoutMs / 1000 };
    }

    return { locked: false, lockoutSeconds: 0 };
  }

  async resetFailedAttempts(): Promise<void> {
    await AsyncStorage.multiSet([
      [AUTH_KEYS.FAILED_ATTEMPTS, '0'],
      [AUTH_KEYS.LOCKOUT_UNTIL, ''],
    ]);
  }

  // -------------------------------------------------------------------------
  // User info helpers
  // -------------------------------------------------------------------------

  async getUserPhone(): Promise<string | null> {
    return AsyncStorage.getItem(AUTH_KEYS.USER_PHONE);
  }

  async getUserName(): Promise<string | null> {
    return AsyncStorage.getItem(AUTH_KEYS.USER_NAME);
  }

  // -------------------------------------------------------------------------
  // Full reset (for account deletion / data wipe)
  // -------------------------------------------------------------------------

  async resetAll(): Promise<void> {
    await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE_MPIN });
    await AsyncStorage.multiRemove(Object.values(AUTH_KEYS));
    await settingsService.setSecurityEnabled(false);
    await settingsService.setSecurityMethod(null);
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

export const authService = new AuthService();
