/**
 * Property-Based Test: Settings Persistence Round-Trip (Property 3)
 *
 * **Validates: Requirements 6.4, 7.3**
 *
 * For any valid settings value (language, theme, backupInterval),
 * writing the value via SettingsService and then reading it back
 * SHALL produce an identical value.
 */

import fc from 'fast-check';

jest.mock(
  '@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { SettingsService } from '../../src/services/SettingsService';
import type { Theme, Language, BackupInterval } from '../../src/services/SettingsService';
import AsyncStorage from '@react-native-async-storage/async-storage';

describe('SettingsService - Property 3: Settings Persistence Round-Trip', () => {
  let service: SettingsService;

  beforeEach(async () => {
    await AsyncStorage.clear();
    service = new SettingsService();
  });

  /**
   * **Validates: Requirements 7.3**
   *
   * For any valid theme value ('system'|'light'|'dark'|'ocean'|'forest'|'sunset'),
   * writing via setTheme() and reading back via getTheme() produces an identical value.
   */
  it('theme round-trip: setTheme(t) then getTheme() === t for all valid themes', async () => {
    const themes: Theme[] = ['system', 'light', 'dark', 'ocean', 'forest', 'sunset'];

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...themes),
        async (theme) => {
          await service.setTheme(theme);
          const result = await service.getTheme();
          expect(result).toBe(theme);
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 6.4**
   *
   * For any valid language ('en'|'ta'), writing via setLanguage()
   * and reading back via getLanguage() produces an identical value.
   */
  it('language round-trip: setLanguage(l) then getLanguage() === l for all valid languages', async () => {
    const languages: Language[] = ['en', 'ta'];

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...languages),
        async (language) => {
          await service.setLanguage(language);
          const result = await service.getLanguage();
          expect(result).toBe(language);
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 6.4, 7.3**
   *
   * For any valid backup interval ('daily'|'weekly'|'monthly'), writing via
   * setBackupInterval() and reading back via getBackupInterval() produces an identical value.
   */
  it('backupInterval round-trip: setBackupInterval(i) then getBackupInterval() === i for all valid intervals', async () => {
    const intervals: BackupInterval[] = ['daily', 'weekly', 'monthly'];

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...intervals),
        async (interval) => {
          await service.setBackupInterval(interval);
          const result = await service.getBackupInterval();
          expect(result).toBe(interval);
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 6.4, 7.3**
   *
   * Combined property: writing any combination of valid theme, language, and backup interval,
   * then reading each back, produces identical values for all three.
   */
  it('combined round-trip: setting all three values and reading them back produces identical values', async () => {
    const themes: Theme[] = ['system', 'light', 'dark', 'ocean', 'forest', 'sunset'];
    const languages: Language[] = ['en', 'ta'];
    const intervals: BackupInterval[] = ['daily', 'weekly', 'monthly'];

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...themes),
        fc.constantFrom(...languages),
        fc.constantFrom(...intervals),
        async (theme, language, interval) => {
          await service.setTheme(theme);
          await service.setLanguage(language);
          await service.setBackupInterval(interval);

          const readTheme = await service.getTheme();
          const readLanguage = await service.getLanguage();
          const readInterval = await service.getBackupInterval();

          expect(readTheme).toBe(theme);
          expect(readLanguage).toBe(language);
          expect(readInterval).toBe(interval);
        },
      ),
      { numRuns: 100 },
    );
  });
});
