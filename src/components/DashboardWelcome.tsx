import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useTheme } from '../context/ThemeContext';

/**
 * Shared greeting + username block rendered in the persistent header of both
 * the Moi and Finance tab navigators. Because the header lives ABOVE the tab
 * navigator it is truly common to every screen in both flows.
 *
 * Loads the signed-in user's name from AsyncStorage on focus using the same
 * keys AuthService writes, so it stays consistent wherever it appears.
 */
export const DashboardWelcome: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [userName, setUserName] = useState('');

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        let name = await AsyncStorage.getItem('app.user_name');
        if (!name) name = await AsyncStorage.getItem('app.user.name');
        if (name) setUserName(name);
      };
      load();
    }, []),
  );

  return (
    <View style={styles.container}>
      <Text style={[styles.greeting, { color: colors.textMuted }]}>
        {t('dashboard.greeting')} 👋
      </Text>
      <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
        {userName || t('app.name')}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    /* Takes the flex:1 space given by welcomeWrap in the navigator. */
  },
  greeting: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: -0.3,
  },
});

export default DashboardWelcome;
