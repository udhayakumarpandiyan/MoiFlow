import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  Pressable,
  Animated,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { useTheme, ThemeColors } from '@common/context/ThemeContext';
import { authService } from '@common/services/AuthService';
import Feather from '@react-native-vector-icons/feather';
import { NotificationsModal } from './NotificationsModal';

// ---------------------------------------------------------------------------
// Header action cluster: [ theme toggle ] [ notifications ] [ profile ▾ ]
// The profile button opens a small menu: Settings, Sign out.
// ---------------------------------------------------------------------------

interface HeaderActionsProps {
  onSignOut: () => void;
}

const HeaderActions: React.FC<HeaderActionsProps> = ({ onSignOut }) => {
  const { t } = useTranslation();
  const { colors, isDark, setTheme } = useTheme();
  const navigation = useNavigation<any>();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const pillBg = colors.primaryBg;

  const toggleTheme = () => {
    // Dark → restore default (system-follow). Light/default → explicit dark.
    setTheme(isDark ? 'default' : 'dark');
  };

  const openSettings = () => {
    setMenuOpen(false);
    // This header lives ABOVE the Tab.Navigator, so useNavigation() here is the
    // ROOT stack navigator. Settings is a screen inside the tab navigator
    // (MainTab → SettingsStack → Settings), so we must navigate through the
    // nested route hierarchy rather than to a bare 'SettingsStack'.
    navigation.navigate('MainTab', {
      screen: 'SettingsStack',
      params: { screen: 'Settings' },
    });
  };

  const handleSignOut = () => {
    setMenuOpen(false);
    Alert.alert(
      t('profile.signOut'),
      t('profile.confirmSignOut'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.signOut'),
          style: 'destructive',
          onPress: async () => {
            await authService.signOut();
            onSignOut();
          },
        },
      ],
    );
  };

  return (
    <View style={styles.cluster}>
      {/* Day / night toggle */}
      <TouchableOpacity
        onPress={toggleTheme}
        style={[styles.iconBtn, { backgroundColor: pillBg }]}
        activeOpacity={0.7}
        accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        accessibilityRole="button"
      >
        <Feather name={isDark ? 'sun' : 'moon'} size={18} color={isDark ? '#FBBF24' : '#F59E0B'} />
      </TouchableOpacity>

      {/* Notifications */}
      <TouchableOpacity
        onPress={() => setNotifOpen(true)}
        style={[styles.iconBtn, { backgroundColor: pillBg }]}
        activeOpacity={0.7}
        accessibilityLabel={t('notifications.title')}
        accessibilityRole="button"
      >
        <Feather name="bell" size={18} color={colors.primary} />
      </TouchableOpacity>

      {/* Profile — opens a menu (Settings / Sign out) */}
      <TouchableOpacity
        onPress={() => setMenuOpen(true)}
        style={[styles.iconBtn, styles.profileBtn]}
        activeOpacity={0.7}
        accessibilityLabel={t('profile.title')}
        accessibilityRole="button"
      >
        <Feather name="user" size={18} color={colors.textInverse} />
      </TouchableOpacity>

      {/* Profile dropdown menu */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
        statusBarTranslucent
      >
        <Pressable style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
          <View style={styles.menu}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={openSettings}
              activeOpacity={0.7}
            >
              <Feather name="settings" size={18} color={colors.textSecondary} />
              <Text style={styles.menuText}>{t('settings.title')}</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleSignOut}
              activeOpacity={0.7}
            >
              <Feather name="log-out" size={18} color={colors.error} />
              <Text style={[styles.menuText, { color: colors.error }]}>
                {t('profile.signOut')}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <NotificationsModal visible={notifOpen} onClose={() => setNotifOpen(false)} />
    </View>
  );
};

// Backward-compatible export names so MainTabNavigator doesn't need renaming.
export const ProfileMenu = HeaderActions;
export const LogoutButton = HeaderActions;
export { HeaderActions };

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    cluster: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginRight: 12,
    },
    iconBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    profileBtn: {
      backgroundColor: colors.primary,
    },
    menuOverlay: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    menu: {
      position: 'absolute',
      top: 56,
      right: 12,
      minWidth: 180,
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.18,
      shadowRadius: 16,
      elevation: 16,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    menuText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    menuDivider: {
      height: 1,
      backgroundColor: colors.borderLight,
      marginHorizontal: 12,
    },
  });
