import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  LANGUAGE: 'settings.language',

  // Security
  SECURITY_ENABLED: 'settings.security_enabled',
  SECURITY_METHOD: 'settings.security_method',
  PIN_HASH: 'settings.pin_hash',
  PATTERN_LOCK: 'settings.pattern_lock',
  BIOMETRIC_ENABLED: 'settings.biometric_enabled',

  // Notifications
  EVENT_ALARM_ENABLED: 'settings.event_alarm_enabled',

  // Backup
  AUTO_BACKUP: 'settings.auto_backup',
  BACKUP_INTERVAL: 'settings.backup_interval',
  BACKUP_PATH: 'settings.backup_path',
  LAST_BACKUP: 'settings.last_backup',

  // Family sharing
  FAMILY_ACCESS_ENABLED: 'settings.family_access_enabled',
  FAMILY_ACCESS_ID: 'settings.family_access_id',

  // Appearance
  THEME: 'settings.theme',

  // Other
  CURRENCY: 'settings.currency',
} as const;

export type Language = 'ta' | 'en';

export type Theme =
  | 'default'
  | 'light'
  | 'dark'

export type BackupInterval =
  | 'daily'
  | 'weekly'
  | 'monthly';

export interface AppSettings {
  // Language
  language: Language;

  // Security
  securityEnabled: boolean;
  securityMethod: 'pin' | 'pattern' | null;
  pinHash: string | null;
  patternLock: string | null;
  biometricEnabled: boolean;

  // Notifications
  eventAlarmEnabled: boolean;

  // Backup
  autoBackup: boolean;
  backupInterval: BackupInterval;
  backupPath: string | null;
  lastBackup: string | null;

  // Family sharing
  familyAccessEnabled: boolean;
  familyAccessId: string | null;

  // Appearance
  theme: Theme;

  // Other
  currency: 'INR';
}

const DEFAULTS: AppSettings = {
  language: 'ta',

  // Security
  securityEnabled: false,
  securityMethod: null,
  pinHash: null,
  patternLock: null,
  biometricEnabled: false,

  // Notifications
  eventAlarmEnabled: false,

  // Backup
  autoBackup: false,
  backupInterval: 'weekly',
  backupPath: null,
  lastBackup: null,

  // Family sharing
  familyAccessEnabled: false,
  familyAccessId: null,

  // Appearance
  theme: 'default',

  // Other
  currency: 'INR',
};

export class SettingsService {
  // ---------------------------------------------------------------------------
  // Get all settings
  // ---------------------------------------------------------------------------

  async getAll(): Promise<AppSettings> {
    try {
      const keys = Object.values(KEYS);

      const pairs = await AsyncStorage.multiGet(keys);

      const map: Record<string, string | null> = Object.fromEntries(
        pairs,
      );

      return {
        // Language
        language:
          map[KEYS.LANGUAGE] === 'en'
            ? 'en'
            : 'ta',

        // Security
        securityEnabled:
          map[KEYS.SECURITY_ENABLED] === 'true',

        securityMethod:
          (map[KEYS.SECURITY_METHOD] as 'pin' | 'pattern' | null) ?? null,

        pinHash:
          map[KEYS.PIN_HASH] ?? null,

        patternLock:
          map[KEYS.PATTERN_LOCK] ?? null,

        biometricEnabled:
          map[KEYS.BIOMETRIC_ENABLED] === 'true',

        // Notifications
        eventAlarmEnabled:
          map[KEYS.EVENT_ALARM_ENABLED] === 'true',

        // Backup
        autoBackup:
          map[KEYS.AUTO_BACKUP] === 'true',

        backupInterval:
          this.parseBackupInterval(
            map[KEYS.BACKUP_INTERVAL],
          ),

        backupPath:
          map[KEYS.BACKUP_PATH] ?? null,

        lastBackup:
          map[KEYS.LAST_BACKUP] ?? null,

        // Family sharing
        familyAccessEnabled:
          map[KEYS.FAMILY_ACCESS_ENABLED] === 'true',

        familyAccessId:
          map[KEYS.FAMILY_ACCESS_ID] ?? null,

        // Appearance
        theme:
          this.parseTheme(map[KEYS.THEME]),

        // Other
        currency: 'INR',
      };
    } catch (error) {
      console.error('[SettingsService] getAll error:', error);

      return { ...DEFAULTS };
    }
  }

  // ---------------------------------------------------------------------------
  // Generic getter
  // ---------------------------------------------------------------------------

  async get<K extends keyof AppSettings>(
    key: K,
  ): Promise<AppSettings[K]> {
    const all = await this.getAll();

    return all[key];
  }

  // ---------------------------------------------------------------------------
  // Language
  // ---------------------------------------------------------------------------

  async setLanguage(lang: Language): Promise<void> {
    await AsyncStorage.setItem(
      KEYS.LANGUAGE,
      lang,
    );
  }

  async getLanguage(): Promise<Language> {
    return this.get('language');
  }

  // ---------------------------------------------------------------------------
  // Security - mPIN
  // ---------------------------------------------------------------------------

  async setSecurityEnabled(
    enabled: boolean,
  ): Promise<void> {
    await AsyncStorage.setItem(
      KEYS.SECURITY_ENABLED,
      String(enabled),
    );
  }

  async setSecurityMethod(
    method: 'pin' | 'pattern' | null,
  ): Promise<void> {
    if (method) {
      await AsyncStorage.setItem(
        KEYS.SECURITY_METHOD,
        method,
      );
    } else {
      await AsyncStorage.removeItem(
        KEYS.SECURITY_METHOD,
      );
    }
  }

  async getSecurityMethod(): Promise<'pin' | 'pattern' | null> {
    const value = await AsyncStorage.getItem(KEYS.SECURITY_METHOD);
    if (value === 'pin' || value === 'pattern') return value;
    return null;
  }

  async setPinHash(
    pinHash: string | null,
  ): Promise<void> {
    if (pinHash) {
      await AsyncStorage.setItem(
        KEYS.PIN_HASH,
        pinHash,
      );
    } else {
      await AsyncStorage.removeItem(
        KEYS.PIN_HASH,
      );
    }
  }

  async getPinHash(): Promise<string | null> {
    return AsyncStorage.getItem(
      KEYS.PIN_HASH,
    );
  }

  async clearPin(): Promise<void> {
    await AsyncStorage.removeItem(
      KEYS.PIN_HASH,
    );

    await AsyncStorage.setItem(
      KEYS.SECURITY_ENABLED,
      'false',
    );
  }

  // ---------------------------------------------------------------------------
  // Security - Pattern Lock
  // ---------------------------------------------------------------------------

  async setPatternLock(
    pattern: string | null,
  ): Promise<void> {
    if (pattern) {
      await AsyncStorage.setItem(
        KEYS.PATTERN_LOCK,
        pattern,
      );
    } else {
      await AsyncStorage.removeItem(
        KEYS.PATTERN_LOCK,
      );
    }
  }

  async getPatternLock(): Promise<string | null> {
    return AsyncStorage.getItem(
      KEYS.PATTERN_LOCK,
    );
  }

  async clearPatternLock(): Promise<void> {
    await AsyncStorage.removeItem(
      KEYS.PATTERN_LOCK,
    );
  }

  // ---------------------------------------------------------------------------
  // Biometric
  // ---------------------------------------------------------------------------

  async setBiometricEnabled(
    enabled: boolean,
  ): Promise<void> {
    await AsyncStorage.setItem(
      KEYS.BIOMETRIC_ENABLED,
      String(enabled),
    );
  }

  // ---------------------------------------------------------------------------
  // Event Alarm
  // ---------------------------------------------------------------------------

  async setEventAlarmEnabled(
    enabled: boolean,
  ): Promise<void> {
    await AsyncStorage.setItem(
      KEYS.EVENT_ALARM_ENABLED,
      String(enabled),
    );
  }

  async getEventAlarmEnabled(): Promise<boolean> {
    const value = await AsyncStorage.getItem(KEYS.EVENT_ALARM_ENABLED);
    return value === 'true';
  }

  // ---------------------------------------------------------------------------
  // Backup
  // ---------------------------------------------------------------------------

  async setAutoBackup(
    enabled: boolean,
  ): Promise<void> {
    await AsyncStorage.setItem(
      KEYS.AUTO_BACKUP,
      String(enabled),
    );
  }

  async setBackupInterval(
    interval: BackupInterval,
  ): Promise<void> {
    await AsyncStorage.setItem(
      KEYS.BACKUP_INTERVAL,
      interval,
    );
  }

  async getBackupInterval(): Promise<BackupInterval> {
    return this.get('backupInterval');
  }

  async setBackupPath(
    path: string | null,
  ): Promise<void> {
    if (path) {
      await AsyncStorage.setItem(
        KEYS.BACKUP_PATH,
        path,
      );
    } else {
      await AsyncStorage.removeItem(
        KEYS.BACKUP_PATH,
      );
    }
  }

  async setLastBackup(
    isoDate: string,
  ): Promise<void> {
    await AsyncStorage.setItem(
      KEYS.LAST_BACKUP,
      isoDate,
    );
  }

  // ---------------------------------------------------------------------------
  // Family access / sharing
  // ---------------------------------------------------------------------------

  async setFamilyAccessEnabled(
    enabled: boolean,
  ): Promise<void> {
    await AsyncStorage.setItem(
      KEYS.FAMILY_ACCESS_ENABLED,
      String(enabled),
    );
  }

  async setFamilyAccessId(
    accessId: string | null,
  ): Promise<void> {
    if (accessId) {
      await AsyncStorage.setItem(
        KEYS.FAMILY_ACCESS_ID,
        accessId,
      );
    } else {
      await AsyncStorage.removeItem(
        KEYS.FAMILY_ACCESS_ID,
      );
    }
  }

  async getFamilyAccessId(): Promise<string | null> {
    return AsyncStorage.getItem(
      KEYS.FAMILY_ACCESS_ID,
    );
  }

  async clearFamilyAccess(): Promise<void> {
    await AsyncStorage.multiRemove([
      KEYS.FAMILY_ACCESS_ENABLED,
      KEYS.FAMILY_ACCESS_ID,
    ]);
  }

  // ---------------------------------------------------------------------------
  // Theme
  // ---------------------------------------------------------------------------

  async setTheme(
    theme: Theme,
  ): Promise<void> {
    await AsyncStorage.setItem(
      KEYS.THEME,
      theme,
    );
  }

  async getTheme(): Promise<Theme> {
    return this.get('theme');
  }

  // ---------------------------------------------------------------------------
  // Clear all settings
  // ---------------------------------------------------------------------------

  async clearAll(): Promise<void> {
    await AsyncStorage.multiRemove(
      Object.values(KEYS),
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private parseTheme(
    value: string | null,
  ): Theme {
    const themes: Theme[] = [
      'default',
      'light',
      'dark'
    ];

    if (
      value &&
      themes.includes(value as Theme)
    ) {
      return value as Theme;
    }

    return DEFAULTS.theme;
  }

  private parseBackupInterval(
    value: string | null,
  ): BackupInterval {
    const intervals: BackupInterval[] = [
      'daily',
      'weekly',
      'monthly',
    ];

    if (
      value &&
      intervals.includes(
        value as BackupInterval,
      )
    ) {
      return value as BackupInterval;
    }

    return DEFAULTS.backupInterval;
  }
}

export const settingsService =
  new SettingsService();