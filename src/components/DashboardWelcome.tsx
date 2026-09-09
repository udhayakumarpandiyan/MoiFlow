import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useTheme } from '../context/ThemeContext';

interface DashboardWelcomeProps {
  /** Optional element rendered on the trailing side (e.g. a voice-search button). */
  rightSlot?: React.ReactNode;
}

/**
 * Shared "Welcome back / <user name>" header used by both the Moi and Finance
 * dashboards so the greeting stays identical across the two top-level flows.
 * Loads the signed-in user's name from storage on focus (same keys AuthService
 * writes), keeping it consistent no matter which dashboard renders it.
 */
export const DashboardWelcome: React.FC<DashboardWelcomeProps> = ({ rightSlot }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [userName, setUserName] = useState('');

  useFocusEffect(
    useCallback(() => {
      const loadUserName = async () => {
        // Primary key used by AuthService, with a fallback to the legacy key.
        let name = await AsyncStorage.getItem('app.user_name');
        if (!name) {
          name = await AsyncStorage.getItem('app.user.name');
        }
        if (name) setUserName(name);
      };
      loadUserName();
    }, []),
  );

  return (
    <View style={styles.row}>
      <View style={styles.textBlock}>
        <Text style={[styles.greeting, { color: colors.textMuted }]}>
          {t('dashboard.greeting')} 👋
        </Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {userName || t('app.name')}
        </Text>
      </View>

      {rightSlot ? <View>{rightSlot}</View> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  textBlock: {
    flexShrink: 1,
  },
  greeting: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  title: {
    fontSize: 19,
    lineHeight: 28,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: -0.3,
  },
});

export default DashboardWelcome;
