import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
  TextInput,
} from 'react-native';
// SafeAreaView removed - MainTabNavigator header handles safe area
import { useFocusEffect } from '@react-navigation/native';
import RNFS from 'react-native-fs';

import {
  settingsService,
  backupService,
  authService,
} from '../../services';

import { notificationService } from '../../services/NotificationService';

import {
  AppSettings,
  Language,
  Theme,
  BackupInterval,
} from '../../services/SettingsService';

import i18n from '../../i18n/index';
import { Spacing } from '../../theme/typography';
import { formatDateTime } from '../../utils/format';
import { ThemeColors, useTheme } from '@/context/ThemeContext';
import { useAppTranslation } from '@/hooks/useAppTranslation';
import { useEntitlement } from '@/context/EntitlementContext';

const LANGUAGE_OPTIONS: {
  key: Language;
  titleKey: string;
  subtitleKey: string;
}[] = [
    {
      key: 'ta',
      titleKey: 'settings.tamil',
      subtitleKey: 'settings.english',
    },
    {
      key: 'en',
      titleKey: 'settings.english',
      subtitleKey: 'settings.tamil',
    },
  ];

const BACKUP_INTERVAL_KEYS: {
  key: BackupInterval;
  titleKey: string;
  subtitleKey: string;
}[] = [
    {
      key: 'daily',
      titleKey: 'settings.daily',
      subtitleKey: 'settings.dailySubtitle',
    },
    {
      key: 'weekly',
      titleKey: 'settings.weekly',
      subtitleKey: 'settings.weeklySubtitle',
    },
    {
      key: 'monthly',
      titleKey: 'settings.monthly',
      subtitleKey: 'settings.monthlySubtitle',
    },
  ];

const THEME_KEYS: {
  key: Theme;
  titleKey: string;
  subtitleKey: string;
}[] = [
    {
      key: 'default',
      titleKey: 'settings.default',
      subtitleKey: 'settings.system',
    },
    {
      key: 'light',
      titleKey: 'settings.light',
      subtitleKey: 'settings.light',
    },
    {
      key: 'dark',
      titleKey: 'settings.dark',
      subtitleKey: 'settings.dark',
    }
  ];

const SettingsScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const { colors, setTheme } = useTheme();
  const { t } = useAppTranslation();
  const { isPremium } = useEntitlement();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [settings, setSettings] = useState<AppSettings>({
    language: 'ta',

    securityEnabled: false,
    securityMethod: null,
    biometricEnabled: false,

    eventAlarmEnabled: false,

    autoBackup: false,
    backupInterval: 'weekly',
    backupPath: null,
    lastBackup: null,

    familyAccessEnabled: false,
    familyAccessId: null,

    theme: 'default',
    currency: 'INR',
  });

  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);

  const [backupFiles, setBackupFiles] = useState<
    RNFS.ReadDirItem[]
  >([]);

  // Language confirmation
  const [languageModalVisible, setLanguageModalVisible] =
    useState(false);

  const [pendingLanguage, setPendingLanguage] =
    useState<Language | null>(null);

  // Theme confirmation
  const [themeModalVisible, setThemeModalVisible] =
    useState(false);

  const [pendingTheme, setPendingTheme] =
    useState<Theme | null>(null);

  // Backup interval modal
  const [backupIntervalModalVisible, setBackupIntervalModalVisible] =
    useState(false);

  // ---------------------------------------------------------------------------
  // Load settings
  // ---------------------------------------------------------------------------

  const loadSettings = useCallback(async () => {
    try {
      const all = await settingsService.getAll();

      setSettings(all);

      const files = await backupService.listBackups();

      setBackupFiles(files);
    } catch (err) {
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [loadSettings]),
  );

  // ---------------------------------------------------------------------------
  // Language
  // ---------------------------------------------------------------------------

  const requestLanguageChange = (
    language: Language,
  ) => {
    if (language === settings.language) {
      return;
    }

    setPendingLanguage(language);
    setLanguageModalVisible(true);
  };

  const confirmLanguageChange = async () => {
    if (!pendingLanguage) {
      return;
    }

    try {
      await settingsService.setLanguage(
        pendingLanguage,
      );

      await i18n.changeLanguage(
        pendingLanguage,
      );

      setSettings(prev => ({
        ...prev,
        language: pendingLanguage,
      }));
    } catch (error) {

      Alert.alert(
        t('settings.error'),
        t('settings.languageChangeFailed'),
      );
    } finally {
      setLanguageModalVisible(false);
      setPendingLanguage(null);
    }
  };

  // ---------------------------------------------------------------------------
  // mPIN
  // ---------------------------------------------------------------------------

  const handlePinToggle = async (
    enabled: boolean,
  ) => {
    if (enabled) {
      // If an MPIN already exists in secure storage, just re-enable it
      const hasMpin = await authService.hasMPINStored();
      if (hasMpin) {
        await settingsService.setSecurityEnabled(true);
        await settingsService.setSecurityMethod('pin');
        setSettings(prev => ({
          ...prev,
          securityEnabled: true,
          securityMethod: 'pin',
        }));
        return;
      }

      // No existing MPIN — navigate to setup
      navigation?.navigate('PinSetup', {
        onSuccess: async () => {
          await settingsService.setSecurityEnabled(true);
          await settingsService.setSecurityMethod('pin');
          setSettings(prev => ({
            ...prev,
            securityEnabled: true,
            securityMethod: 'pin',
          }));
        },
      });
      return;
    }

    // Toggling OFF — just disable security, keep the MPIN in keychain
    await settingsService.setSecurityEnabled(false);
    await settingsService.setSecurityMethod(null);
    setSettings(prev => ({
      ...prev,
      securityEnabled: false,
      securityMethod: null,
    }));
  };

  // ---------------------------------------------------------------------------
  // Biometric
  // ---------------------------------------------------------------------------

  const handleBiometricToggle = async (
    enabled: boolean,
  ) => {
    await settingsService.setBiometricEnabled(
      enabled,
    );

    setSettings(prev => ({
      ...prev,
      biometricEnabled: enabled,
    }));
  };

  // ---------------------------------------------------------------------------
  // Event Alarm
  // ---------------------------------------------------------------------------

  const handleEventAlarmToggle = async (
    enabled: boolean,
  ) => {
    if (enabled) {
      const granted = await notificationService.requestPermission();
      if (!granted) {
        Alert.alert(
          t('settings.error'),
          t('errors.permissionDenied'),
        );
        return;
      }
    }

    await settingsService.setEventAlarmEnabled(enabled);
    setSettings(prev => ({
      ...prev,
      eventAlarmEnabled: enabled,
    }));

    if (enabled) {
      await notificationService.scheduleEventAlarms();
    } else {
      await notificationService.cancelAllEventAlarms();
    }
  };

  // ---------------------------------------------------------------------------
  // Backup
  // ---------------------------------------------------------------------------

  const handleBackup = async () => {
    setBackingUp(true);

    try {
      const result =
        await backupService.exportBackup();

      if (result.success) {
        await settingsService.setLastBackup(
          result.timestamp,
        );

        setSettings(prev => ({
          ...prev,
          lastBackup: result.timestamp,
        }));

        const files =
          await backupService.listBackups();

        setBackupFiles(files);

        Alert.alert(
          t('settings.success'),
          t('settings.backupCreatedMsg', { path: result.path }),
        );
      } else {
        Alert.alert(
          t('settings.error'),
          result.error ?? t('settings.backupFailedMsg'),
        );
      }
    } catch (err) {
      Alert.alert(
        t('settings.error'),
        t('settings.backupFailedMsg'),
      );
    } finally {
      setBackingUp(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Auto backup
  // ---------------------------------------------------------------------------

  const handleAutoBackupToggle = async (
    enabled: boolean,
  ) => {
    await settingsService.setAutoBackup(
      enabled,
    );

    setSettings(prev => ({
      ...prev,
      autoBackup: enabled,
    }));
  };

  // ---------------------------------------------------------------------------
  // Backup interval
  // ---------------------------------------------------------------------------

  const handleBackupInterval = async (
    interval: BackupInterval,
  ) => {
    await settingsService.setBackupInterval(
      interval,
    );

    setSettings(prev => ({
      ...prev,
      backupInterval: interval,
    }));

    setBackupIntervalModalVisible(false);
  };

  // ---------------------------------------------------------------------------
  // Family sharing
  // ---------------------------------------------------------------------------

  const [familyModalVisible, setFamilyModalVisible] = useState(false);
  const [familyIdInput, setFamilyIdInput] = useState('');

  const handleFamilyAccess = async (enabled: boolean) => {
    if (enabled) {
      // Show modal to generate or enter family sharing ID
      setFamilyModalVisible(true);
      return;
    }

    Alert.alert(
      t('settings.removeFamilyTitle'),
      t('settings.removeFamilyMsg'),
      [
        { text: t('settings.no'), style: 'cancel' },
        {
          text: t('settings.remove'),
          style: 'destructive',
          onPress: async () => {
            await settingsService.clearFamilyAccess();
            setSettings(prev => ({
              ...prev,
              familyAccessEnabled: false,
              familyAccessId: null,
            }));
          },
        },
      ],
    );
  };

  const handleGenerateFamilyId = async () => {
    // Generate a unique 8-character sharing code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const familyId = `MF-${code}`;

    await settingsService.setFamilyAccessEnabled(true);
    await settingsService.setFamilyAccessId(familyId);
    setSettings(prev => ({
      ...prev,
      familyAccessEnabled: true,
      familyAccessId: familyId,
    }));
    setFamilyModalVisible(false);

    Alert.alert(
      t('settings.success'),
      t('settings.familyIdGenerated', { id: familyId }),
    );
  };

  const handleLinkFamilyId = async () => {
    const id = familyIdInput.trim();
    if (!id || id.length < 4) {
      Alert.alert(t('settings.error'), t('settings.invalidFamilyId'));
      return;
    }

    await settingsService.setFamilyAccessEnabled(true);
    await settingsService.setFamilyAccessId(id);
    setSettings(prev => ({
      ...prev,
      familyAccessEnabled: true,
      familyAccessId: id,
    }));
    setFamilyIdInput('');
    setFamilyModalVisible(false);

    Alert.alert(t('settings.success'), t('settings.familyLinked', { id }));
  };

  // ---------------------------------------------------------------------------
  // Theme
  // ---------------------------------------------------------------------------

  const requestThemeChange = (
    theme: Theme,
  ) => {
    if (theme === settings.theme) {
      return;
    }

    setPendingTheme(theme);
    setThemeModalVisible(true);
  };

  const confirmThemeChange = async () => {
    if (!pendingTheme) {
      return;
    }

    await setTheme(pendingTheme);

    setSettings(prev => ({
      ...prev,
      theme: pendingTheme,
    }));

    setThemeModalVisible(false);
    setPendingTheme(null);
  };

  // ---------------------------------------------------------------------------
  // Restore
  // ---------------------------------------------------------------------------

  const handleRestore = (
    filePath: string,
    fileName: string,
  ) => {
    Alert.alert(
      t('settings.restoreTitle'),
      t('settings.restoreMsg', { fileName }),
      [
        {
          text: t('settings.no'),
          style: 'cancel',
        },
        {
          text: t('settings.restoreBtn'),
          style: 'destructive',
          onPress: async () => {
            try {
              const result =
                await backupService.restoreBackup(
                  filePath,
                );

              if (result.success) {
                Alert.alert(
                  t('settings.success'),
                  t('settings.recordsRestored', { count: result.recordsRestored }),
                );
              } else {
                Alert.alert(
                  t('settings.error'),
                  result.error ??
                  t('settings.restoreFailedMsg'),
                );
              }
            } catch (err) {
              Alert.alert(
                t('settings.error'),
                t('settings.restoreFailedMsg'),
              );
            }
          },
        },
      ],
    );
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const getLanguageName = (
    language: Language,
  ) => {
    return language === 'ta'
      ? t('settings.tamil')
      : t('settings.english');
  };

  const getBackupIntervalLabel = (
    interval: BackupInterval,
  ) => {
    const item =
      BACKUP_INTERVAL_KEYS.find(
        x => x.key === interval,
      );

    return item
      ? `${t(item.titleKey as any)} / ${t(item.subtitleKey as any)}`
      : interval;
  };

  const getThemeLabel = (
    theme: Theme,
  ) => {
    const item = THEME_KEYS.find(
      x => x.key === theme,
    );

    return item
      ? t(item.titleKey as any)
      : theme;
  };

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator
            size="large"
            color={colors.primary}
          />
        </View>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.pageTitle}>
              {t('settings.title')}
            </Text>

            <Text style={styles.pageSubtitle}>
              {t('settings.subTitle')}
            </Text>
          </View>
        </View>
        {/* ================================================================ */}
        {/* PREMIUM / SUBSCRIPTION */}
        {/* ================================================================ */}

        <Text style={styles.sectionTitle}>
          {t('premium.sectionTitle')}
        </Text>

        <View style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation?.navigate('Premium')}
          >
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>
                {isPremium
                  ? t('premium.manageTitle')
                  : t('premium.upgradeTitle')}
              </Text>
              <Text style={styles.rowSub}>
                {isPremium
                  ? t('premium.statusActive')
                  : t('premium.upgradeSubtitle')}
              </Text>
            </View>
            <Text style={styles.rowArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* ================================================================ */}
        {/* LANGUAGE */}
        {/* ================================================================ */}

        <Text style={styles.sectionTitle}>
          {t('settings.languageSection')}
        </Text>

        <View style={styles.card}>
          {LANGUAGE_OPTIONS.map(
            (language, index) => (
              <React.Fragment key={language.key}>
                {index > 0 && (
                  <View style={styles.sep} />
                )}

                <TouchableOpacity
                  style={[
                    styles.row,
                    settings.language ===
                    language.key &&
                    styles.rowSelected,
                  ]}
                  onPress={() =>
                    requestLanguageChange(
                      language.key,
                    )
                  }
                >
                  <View style={styles.rowContent}>
                    <Text style={styles.rowTitle}>
                      {t(language.titleKey as any)}
                    </Text>

                    <Text style={styles.rowSub}>
                      {t(language.subtitleKey as any)}
                    </Text>
                  </View>

                  {settings.language ===
                    language.key ? (
                    <Text
                      style={
                        styles.checkMark
                      }
                    >
                      ✓
                    </Text>
                  ) : null}
                </TouchableOpacity>
              </React.Fragment>
            ),
          )}
        </View>

        {/* ================================================================ */}
        {/* SECURITY */}
        {/* ================================================================ */}

        <Text style={styles.sectionTitle}>
          {t('settings.security')}
        </Text>

        <View style={styles.card}>
          {/* mPIN */}

          <View style={styles.row}>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>
                {t('settings.mpin')}
              </Text>

              <Text style={styles.rowSub}>
                {t('settings.mpinDesc')}
              </Text>
            </View>

            <Switch
              value={
                settings.securityMethod === 'pin'
              }
              onValueChange={
                handlePinToggle
              }
              trackColor={{
                false: colors.border,
                true: colors.primaryLight,
              }}
              thumbColor={
                settings.securityMethod === 'pin'
                  ? colors.primary
                  : colors.textDisabled
              }
            />
          </View>

        </View>

        {/* ================================================================ */}
        {/* EVENT ALARM */}
        {/* ================================================================ */}

        <Text style={styles.sectionTitle}>
          {t('settings.eventAlarm')}
        </Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>
                {t('settings.eventAlarm')}
              </Text>

              <Text style={styles.rowSub}>
                {t('settings.eventAlarmDesc')}
              </Text>
            </View>

            <Switch
              value={settings.eventAlarmEnabled}
              onValueChange={handleEventAlarmToggle}
              trackColor={{
                false: colors.border,
                true: colors.primaryLight,
              }}
              thumbColor={
                settings.eventAlarmEnabled
                  ? colors.primary
                  : colors.textDisabled
              }
            />
          </View>
        </View>

        {/* ================================================================ */}
        {/* BACKUP */}
        {/* ================================================================ */}

        <Text style={styles.sectionTitle}>
          {t('settings.backup')}
        </Text>

        <View style={styles.card}>
          {/* Last backup */}

          <View style={styles.backupInfo}>
            <Text style={styles.rowSub}>
              {t('settings.lastBackup')}:{' '}
              {settings.lastBackup
                ? formatDateTime(
                  settings.lastBackup,
                )
                : t('settings.neverBacked')}
            </Text>
          </View>

          {/* Manual backup */}

          <TouchableOpacity
            style={[
              styles.backupButton,
              backingUp &&
              styles.disabledButton,
            ]}
            onPress={handleBackup}
            disabled={backingUp}
          >
            {backingUp ? (
              <ActivityIndicator
                size="small"
                color={
                  colors.textInverse
                }
              />
            ) : (
              <Text
                style={
                  styles.backupButtonText
                }
              >
                {t('settings.backupNow')}
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.sep} />

          {/* Auto backup */}

          <View style={styles.row}>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>
                {t('settings.autoBackup')}
              </Text>

              <Text style={styles.rowSub}>
                {t('settings.autoBackupDesc')}
              </Text>
            </View>

            <Switch
              value={settings.autoBackup}
              onValueChange={
                handleAutoBackupToggle
              }
              trackColor={{
                false: colors.border,
                true: colors.primaryLight,
              }}
              thumbColor={
                settings.autoBackup
                  ? colors.primary
                  : colors.textDisabled
              }
            />
          </View>

          <View style={styles.sep} />

          {/* Backup interval */}

          <TouchableOpacity
            style={styles.row}
            onPress={() =>
              setBackupIntervalModalVisible(
                true,
              )
            }
          >
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>
                {t('settings.backupInterval')}
              </Text>

              <Text style={styles.rowSub}>
                {getBackupIntervalLabel(
                  settings.backupInterval,
                )}
              </Text>
            </View>

            <Text style={styles.rowArrow}>
              ›
            </Text>
          </TouchableOpacity>

          <View style={styles.sep} />

          {/* Family access */}

          <View style={styles.row}>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>
                {t('settings.familyAccess')}
              </Text>

              <Text style={styles.rowSub}>
                {settings.familyAccessEnabled && settings.familyAccessId
                  ? `${t('settings.familyAccessDesc')} (${settings.familyAccessId})`
                  : t('settings.familyAccessDesc')}
              </Text>
            </View>

            <Switch
              value={
                settings.familyAccessEnabled
              }
              onValueChange={
                handleFamilyAccess
              }
              trackColor={{
                false: colors.border,
                true: colors.primaryLight,
              }}
              thumbColor={
                settings.familyAccessEnabled
                  ? colors.primary
                  : colors.textDisabled
              }
            />
          </View>
        </View>

        {/* ================================================================ */}
        {/* BACKUP FILES */}
        {/* ================================================================ */}

        {backupFiles.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>
              {t('settings.savedBackups')}
            </Text>

            <View style={styles.card}>
              {backupFiles.map(
                (file, index) => (
                  <React.Fragment
                    key={file.path}
                  >
                    {index > 0 && (
                      <View
                        style={
                          styles.sep
                        }
                      />
                    )}

                    <TouchableOpacity
                      style={styles.row}
                      onPress={() =>
                        handleRestore(
                          file.path,
                          file.name,
                        )
                      }
                    >
                      <View
                        style={
                          styles.rowContent
                        }
                      >
                        <Text
                          style={
                            styles.rowTitle
                          }
                          numberOfLines={1}
                        >
                          {file.name}
                        </Text>

                        <Text
                          style={
                            styles.rowSub
                          }
                        >
                          {t('settings.tapToRestore')}
                        </Text>
                      </View>

                      <Text
                        style={
                          styles.restoreArrow
                        }
                      >
                        ↺
                      </Text>
                    </TouchableOpacity>
                  </React.Fragment>
                ),
              )}
            </View>
          </>
        ) : null}

        {/* ================================================================ */}
        {/* THEME */}
        {/* ================================================================ */}

        <Text style={styles.sectionTitle}>
          {t('settings.themeSection')}
        </Text>

        <View style={styles.card}>
          <View style={styles.themeHeader}>
            <View>
              <Text style={styles.rowTitle}>
                {t('settings.appTheme')}
              </Text>

              <Text style={styles.rowSub}>
                {getThemeLabel(
                  settings.theme,
                )}
              </Text>
            </View>
          </View>

          <View style={styles.themeGrid}>
            {THEME_KEYS.map(theme => (
              <TouchableOpacity
                key={theme.key}
                style={[
                  styles.themeItem,
                  settings.theme ===
                  theme.key &&
                  styles.themeItemSelected,
                ]}
                onPress={() =>
                  requestThemeChange(
                    theme.key,
                  )
                }
              >
                <View
                  style={[
                    styles.themePreview,
                    theme.key ===
                    'default' &&
                    styles.themeDefault,
                    theme.key ===
                    'light' &&
                    styles.themeLight,
                    theme.key ===
                    'dark' &&
                    styles.themeDark
                  ]}
                />

                <Text
                  style={
                    styles.themeTitle
                  }
                >
                  {t(theme.titleKey as any)}
                </Text>

                {settings.theme ===
                  theme.key ? (
                  <View
                    style={
                      styles.themeCheck
                    }
                  >
                    <Text
                      style={
                        styles.themeCheckText
                      }
                    >
                      ✓
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ================================================================ */}
        {/* APP INFO */}
        {/* ================================================================ */}

        <Text style={styles.sectionTitle}>
          {t('settings.appInfo')}
        </Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <View>
              <Text style={styles.rowTitle}>
                {t('app.name')}
              </Text>

              <Text style={styles.rowSub}>
                {t('settings.version', { version: '1.0.0' })}
              </Text>
            </View>
          </View>

          <View style={styles.sep} />

          <View style={styles.row}>
            <View>
              <Text style={styles.rowSub}>
                {t('settings.copyright', { year: new Date().getFullYear() })}
              </Text>
              <Text style={[styles.rowSub, { marginTop: 4 }]}>
                {t('settings.developer')}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ================================================================ */}
      {/* LANGUAGE CONFIRMATION MODAL */}
      {/* ================================================================ */}

      <Modal
        visible={languageModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setLanguageModalVisible(false)
        }
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              {t('settings.changeLanguageTitle')}
            </Text>

            <Text style={styles.modalMessage}>
              {t('settings.changeLanguageMsg', {
                language: pendingLanguage
                  ? getLanguageName(pendingLanguage)
                  : '',
              })}
            </Text>

            <View style={styles.modalActions}>
              <Pressable
                style={[
                  styles.modalButton,
                  styles.modalCancel,
                ]}
                onPress={() => {
                  setLanguageModalVisible(
                    false,
                  );
                  setPendingLanguage(null);
                }}
              >
                <Text
                  style={
                    styles.modalCancelText
                  }
                >
                  {t('settings.no')}
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.modalButton,
                  styles.modalConfirm,
                ]}
                onPress={
                  confirmLanguageChange
                }
              >
                <Text
                  style={
                    styles.modalConfirmText
                  }
                >
                  {t('settings.change')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================================================================ */}
      {/* BACKUP INTERVAL MODAL */}
      {/* ================================================================ */}

      <Modal
        visible={
          backupIntervalModalVisible
        }
        transparent
        animationType="fade"
        onRequestClose={() =>
          setBackupIntervalModalVisible(
            false,
          )
        }
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              {t('settings.backupInterval')}
            </Text>

            {BACKUP_INTERVAL_KEYS.map(
              interval => (
                <TouchableOpacity
                  key={interval.key}
                  style={[
                    styles.optionRow,
                    settings.backupInterval ===
                    interval.key &&
                    styles.optionRowSelected,
                  ]}
                  onPress={() =>
                    handleBackupInterval(
                      interval.key,
                    )
                  }
                >
                  <View>
                    <Text
                      style={
                        styles.rowTitle
                      }
                    >
                      {t(interval.titleKey as any)}
                    </Text>

                    <Text
                      style={
                        styles.rowSub
                      }
                    >
                      {t(interval.subtitleKey as any)}
                    </Text>
                  </View>

                  {settings.backupInterval ===
                    interval.key ? (
                    <Text
                      style={
                        styles.checkMark
                      }
                    >
                      ✓
                    </Text>
                  ) : null}
                </TouchableOpacity>
              ),
            )}

            <TouchableOpacity
              style={styles.modalClose}
              onPress={() =>
                setBackupIntervalModalVisible(
                  false,
                )
              }
            >
              <Text
                style={
                  styles.modalCancelText
                }
              >
                {t('settings.close')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ================================================================ */}
      {/* THEME CONFIRMATION MODAL */}
      {/* ================================================================ */}

      <Modal
        visible={themeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setThemeModalVisible(false)
        }
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              {t('settings.changeThemeTitle')}
            </Text>

            <Text style={styles.modalMessage}>
              {t('settings.changeThemeMsg', {
                theme: pendingTheme
                  ? getThemeLabel(pendingTheme)
                  : '',
              })}
            </Text>

            <View style={styles.modalActions}>
              <Pressable
                style={[
                  styles.modalButton,
                  styles.modalCancel,
                ]}
                onPress={() => {
                  setThemeModalVisible(
                    false,
                  );
                  setPendingTheme(null);
                }}
              >
                <Text
                  style={
                    styles.modalCancelText
                  }
                >
                  {t('settings.no')}
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.modalButton,
                  styles.modalConfirm,
                ]}
                onPress={
                  confirmThemeChange
                }
              >
                <Text
                  style={
                    styles.modalConfirmText
                  }
                >
                  {t('settings.change')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================================================================ */}
      {/* FAMILY ACCESS MODAL */}
      {/* ================================================================ */}

      <Modal
        visible={familyModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFamilyModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              {t('settings.familyAccessTitle')}
            </Text>

            <Text style={styles.modalMessage}>
              {t('settings.familyAccessModalDesc')}
            </Text>

            {/* Generate new code */}
            <Pressable
              style={[styles.modalButton, styles.modalConfirm, { marginBottom: 12 }]}
              onPress={handleGenerateFamilyId}
            >
              <Text style={styles.modalConfirmText}>
                {t('settings.generateFamilyId')}
              </Text>
            </Pressable>

            {/* Or link with existing code */}
            <Text style={[styles.rowSub, { textAlign: 'center', marginBottom: 8 }]}>
              {t('settings.orLinkExisting')}
            </Text>

            <View style={styles.familyInputRow}>
              <View style={styles.familyInput}>
                <TextInput
                  value={familyIdInput}
                  onChangeText={setFamilyIdInput}
                  placeholder={t('settings.enterFamilyId')}
                  placeholderTextColor={colors.textDisabled}
                  style={styles.familyInputText}
                  autoCapitalize="characters"
                />
              </View>
              <Pressable
                style={[styles.modalButton, styles.modalConfirm, { flex: 0, paddingHorizontal: 16 }]}
                onPress={handleLinkFamilyId}
              >
                <Text style={styles.modalConfirmText}>{t('settings.link')}</Text>
              </Pressable>
            </View>

            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => {
                setFamilyModalVisible(false);
                setFamilyIdInput('');
              }}
            >
              <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default SettingsScreen;

// ============================================================================
// Styles
// ============================================================================

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  content: {
    padding: Spacing.lg,
    paddingBottom: 110,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  pageTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  pageSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 3,
  },

  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 20,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 1,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },

  rowContent: {
    flex: 1,
    paddingRight: 12,
  },

  rowSelected: {
    backgroundColor: colors.primaryBg,
  },

  rowDisabled: {
    opacity: 0.5,
  },

  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  rowTitleDisabled: {
    color: colors.textDisabled,
  },

  rowSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },

  rowSubDisabled: {
    color: colors.textDisabled,
    fontStyle: 'italic',
  },

  checkMark: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '700',
  },

  rowArrow: {
    fontSize: 19,
    color: colors.textMuted,
  },

  sep: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginHorizontal: 16,
  },

  // Backup

  backupInfo: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },

  backupButton: {
    marginHorizontal: 16,
    marginVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },

  disabledButton: {
    opacity: 0.6,
  },

  backupButtonText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: '700',
  },

  restoreArrow: {
    fontSize: 19,
    color: colors.primary,
    fontWeight: '700',
  },

  // Theme

  themeHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },

  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
    gap: 10,
  },

  themeItem: {
    width: '31%',
    minHeight: 108,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    padding: 8,
    alignItems: 'center',
    position: 'relative',
  },

  themeItemSelected: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryBg,
  },

  themePreview: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginBottom: 6,
  },

  themeDefault: {
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.primary,
  },

  themeLight: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },

  themeDark: {
    backgroundColor: '#1F2937',
  },

  themeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },

  themeSubtitle: {
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },

  themeCheck: {
    position: 'absolute',
    right: 5,
    top: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  themeCheckText: {
    color: colors.textInverse,
    fontSize: 12,
    fontWeight: '700',
  },

  // Modal

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },

  modal: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 20,
    elevation: 10,
  },

  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 10,
  },

  modalMessage: {
    fontSize: 13,
    lineHeight: 21,
    color: colors.textSecondary,
    marginBottom: 20,
  },

  modalBold: {
    fontWeight: '700',
    color: colors.primary,
  },

  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },

  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },

  modalCancel: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },

  modalConfirm: {
    backgroundColor: colors.primary,
  },

  modalCancelText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },

  modalConfirmText: {
    color: colors.textInverse,
    fontSize: 13,
    fontWeight: '700',
  },

  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
  },

  optionRowSelected: {
    backgroundColor: colors.primaryBg,
  },

  modalClose: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },

  familyInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },

  familyInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    justifyContent: 'center',
  },

  familyInputText: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '600',
    letterSpacing: 1,
  },
});