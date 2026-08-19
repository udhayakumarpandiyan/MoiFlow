import AsyncStorage from '@react-native-async-storage/async-storage';
import { settingsService } from './SettingsService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthState {
  isRegistered: boolean;
  securityMethod: 'pin' | 'pattern' | null;
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
  FAILED_ATTEMPTS: 'auth.failed_attempts',
  LOCKOUT_UNTIL: 'auth.lockout_until',
  USER_NAME: 'app.user_name',
  USER_PHONE: 'app.user_phone',
  REGISTERED_USERS: 'app.registered_users',
} as const;

// ---------------------------------------------------------------------------
// Registered user record (persisted outside the app session)
// ---------------------------------------------------------------------------

export interface RegisteredUser {
  name: string;
  phone: string;
  registeredAt: string; // ISO date string
}

// ---------------------------------------------------------------------------
// Hash function (same as PinSetupScreen)
// ---------------------------------------------------------------------------

/**
 * Simple deterministic hash — matches the one used in PinSetupScreen and
 * PinLockScreen. Uses Math.imul-based hash (Java's String.hashCode style).
 */
export const hashCredential = (value: string): string => {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (Math.imul(31, h) + value.charCodeAt(i)) | 0;
  }
  return String(h >>> 0);
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_DURATION_MS = 30_000; // 30 seconds

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
        pinHash,
        patternLock,
      ] = await AsyncStorage.multiGet([
        AUTH_KEYS.REGISTERED,
        AUTH_KEYS.SESSION_ACTIVE,
        AUTH_KEYS.FAILED_ATTEMPTS,
        AUTH_KEYS.LOCKOUT_UNTIL,
        'settings.security_enabled',
        'settings.security_method',
        'settings.pin_hash',
        'settings.pattern_lock',
      ]).then(pairs => pairs.map(([, v]) => v));

      const isRegistered = registered === 'true';
      const isSessionActive = sessionActive === 'true';
      const failedAttempts = failedAttemptsRaw ? parseInt(failedAttemptsRaw, 10) || 0 : 0;
      const lockoutUntil = lockoutUntilRaw ? parseInt(lockoutUntilRaw, 10) : null;

      // Whether the user has ever set up any credential (PIN or pattern)
      const hasCredentials = !!(pinHash || patternLock);

      // Only report a security method when security is explicitly enabled
      let securityMethod: 'pin' | 'pattern' | null = null;
      if (securityEnabled === 'true' && (securityMethodRaw === 'pin' || securityMethodRaw === 'pattern')) {
        securityMethod = securityMethodRaw;
      }

      return {
        isRegistered,
        securityMethod,
        hasCredentials,
        isSessionActive,
        failedAttempts,
        lockoutUntil,
      };
    } catch (error) {
      console.error('[AuthService] getAuthState error:', error);
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
  // Security setup
  // -------------------------------------------------------------------------

  async setupSecurity(method: 'pin' | 'pattern', credential: string): Promise<void> {
    const hashed = hashCredential(credential);

    if (method === 'pin') {
      await settingsService.setPinHash(hashed);
      // Clear any existing pattern
      await settingsService.setPatternLock(null);
    } else {
      await settingsService.setPatternLock(hashed);
      // Clear any existing pin
      await settingsService.setPinHash(null);
    }

    await settingsService.setSecurityEnabled(true);
    await AsyncStorage.setItem(AUTH_KEYS.SESSION_ACTIVE, 'true');
  }

  // -------------------------------------------------------------------------
  // Verification
  // -------------------------------------------------------------------------

  async verifyPin(pin: string): Promise<boolean> {
    const storedHash = await settingsService.getPinHash();
    if (!storedHash) return false;

    const inputHash = hashCredential(pin);
    const isValid = storedHash === inputHash;

    if (isValid) {
      await this.resetFailedAttempts();
      await AsyncStorage.setItem(AUTH_KEYS.SESSION_ACTIVE, 'true');
    }

    return isValid;
  }

  async verifyPattern(pattern: string): Promise<boolean> {
    const storedHash = await settingsService.getPatternLock();
    if (!storedHash) return false;

    const inputHash = hashCredential(pattern);
    const isValid = storedHash === inputHash;

    if (isValid) {
      await this.resetFailedAttempts();
      await AsyncStorage.setItem(AUTH_KEYS.SESSION_ACTIVE, 'true');
    }

    return isValid;
  }

  // -------------------------------------------------------------------------
  // Sign out
  // -------------------------------------------------------------------------

  async signOut(): Promise<void> {
    await AsyncStorage.setItem(AUTH_KEYS.SESSION_ACTIVE, 'false');
    await this.resetFailedAttempts();
  }

  // -------------------------------------------------------------------------
  // Failed attempts & lockout
  // -------------------------------------------------------------------------

  async recordFailedAttempt(): Promise<{ locked: boolean; lockoutSeconds: number }> {
    const currentRaw = await AsyncStorage.getItem(AUTH_KEYS.FAILED_ATTEMPTS);
    const current = currentRaw ? parseInt(currentRaw, 10) || 0 : 0;
    const next = current + 1;

    await AsyncStorage.setItem(AUTH_KEYS.FAILED_ATTEMPTS, String(next));

    if (next >= MAX_FAILED_ATTEMPTS) {
      const lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
      await AsyncStorage.setItem(AUTH_KEYS.LOCKOUT_UNTIL, String(lockoutUntil));
      return { locked: true, lockoutSeconds: LOCKOUT_DURATION_MS / 1000 };
    }

    return { locked: false, lockoutSeconds: 0 };
  }

  async resetFailedAttempts(): Promise<void> {
    await AsyncStorage.multiSet([
      [AUTH_KEYS.FAILED_ATTEMPTS, '0'],
      [AUTH_KEYS.LOCKOUT_UNTIL, ''],
    ]);
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

export const authService = new AuthService();
