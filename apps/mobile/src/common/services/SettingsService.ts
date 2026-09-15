import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  LANGUAGE: 'settings.language',

  // Security
  SECURITY_ENABLED: 'settings.security_enabled',
  SECURITY_METHOD: 'settings.security_method',
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
  | 'dark';

export type BackupInterval =
  | 'daily'
  | 'weekly'
  | 'monthly';

export interface AppSettings {
  // Language
  language: Language;

  // Security
  securityEnabled: boolean;
  securityMethod: 'pin' | null;
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
          map[KEYS.SECURITY_METHOD] === 'pin' ? 'pin' : null,

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
  // Security — MPIN only (stored in secure keychain, not here)
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
    method: 'pin' | null,
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

  async getSecurityMethod(): Promise<'pin' | null> {
    const value = await AsyncStorage.getItem(KEYS.SECURITY_METHOD);
    if (value === 'pin') return 'pin';
    return null;
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
      'dark',
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
