import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import DashboardStack from './stacks/maintab/DashboardStack';
import EntriesStack from './stacks/maintab/EntriesStack';
import EventsStack from './stacks/maintab/EventsStack';
import ReportsStack from './stacks/maintab/ReportsStack';
import SettingsStack from './stacks/maintab/SettingsStack';
import { ProfileMenu } from '../components/ProfileMenu';
import { ModeSwitch } from '../components/ModeSwitch';
import { authService } from '../services/AuthService';
import { useTheme } from '../context/ThemeContext';
import MoiflowLogo from '../components/MoiflowLogo';
import { FloatingTabBar } from '../components/FloatingTabBar';

const Tab = createBottomTabNavigator();

const MainTabNavigator = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { colors, themeName } = useTheme();

  const handleSignOut = useCallback(async () => {
    await authService.signOut();

    // Always navigate to PinLock (MPIN is the only lock method)
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'PinLock' }],
      }),
    );
  }, [navigation]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Persistent header — rendered ONCE above the navigator, so it never
          animates or shifts when the active tab changes. Only the body (the
          Tab.Navigator scenes) transitions. */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 20, backgroundColor: colors.background },
        ]}
      >
        <View style={styles.headerLeft}>
          <MoiflowLogo color={colors.textPrimary} size="medium" variant="header" />
          <ModeSwitch current="moi" />
        </View>
        <ProfileMenu onSignOut={handleSignOut} />
      </View>

      <View style={styles.body}>
        <Tab.Navigator
          key={themeName}
          initialRouteName="DashboardStack"
          tabBar={props => <FloatingTabBar {...props} />}
          screenOptions={{
            // Header is now the persistent one above; disable the per-scene header.
            headerShown: false,
            // Crossfade only the body content on tab change.
            animation: 'fade',
            sceneStyle: { backgroundColor: colors.background },
          }}
        >
          <Tab.Screen
            name="DashboardStack"
            component={DashboardStack}
            options={{ title: t('nav.dashboard') }}
          />
          <Tab.Screen
            name="EntriesStack"
            component={EntriesStack}
            options={{ title: t('nav.entries') }}
          />
          <Tab.Screen
            name="EventsStack"
            component={EventsStack}
            options={{ title: t('nav.events') }}
          />
          <Tab.Screen
            name="ReportsStack"
            component={ReportsStack}
            options={{ title: t('nav.reports') }}
          />
          <Tab.Screen
            name="SettingsStack"
            component={SettingsStack}
            options={{ title: t('nav.settings') }}
          />
        </Tab.Navigator>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 6,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  body: {
    flex: 1,
  },
});

export default MainTabNavigator;
