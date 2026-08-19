import { View, Text } from 'react-native';
import React, { useCallback } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Feather from '@react-native-vector-icons/feather';

import DashboardStack from './stacks/maintab/DashboardStack';
import EntriesStack from './stacks/maintab/EntriesStack';
import EventsStack from './stacks/maintab/EventsStack';
import ReportsStack from './stacks/maintab/ReportsStack';
import SettingsStack from './stacks/maintab/SettingsStack';
import { ProfileMenu } from '../components/ProfileMenu';
import { authService } from '../services/AuthService';
import { useTheme } from '../context/ThemeContext';
import MoiflowLogo from '../components/MoiflowLogo';
import CalendarDayIcon from '../components/CalendarDayIcon';

const Tab = createBottomTabNavigator();

type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

const ICON_MAP: Record<string, FeatherIconName> = {
  DashboardStack: 'home',
  EntriesStack:   'list',
  EventsStack:    'calendar',
  ReportsStack:   'bar-chart-2',
  SettingsStack:  'settings',
};

const MainTabNavigator = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { colors, themeName } = useTheme();

  const handleSignOut = useCallback(async () => {
    // Determine security method to navigate to the correct auth gate
    const authState = await authService.getAuthState();
    const lockScreen = authState.securityMethod === 'pattern' ? 'PatternLock' : 'PinLock';

    // Reset the root navigator to the lock screen
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: lockScreen }],
      }),
    );
  }, [navigation]);

  return (
    <Tab.Navigator
      key={themeName}
      initialRouteName="DashboardStack"
      screenOptions={({ route }) => ({
        headerShown: true,
        headerStyle: {
          backgroundColor: colors.primary,
          elevation: 4,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
        },
        headerTitleStyle: {
          color: colors.textInverse,
          fontSize: 16,
          fontWeight: '600',
        },
        headerTitle: () => (
          <MoiflowLogo color={colors.textInverse} size="small" variant="header" />
        ),
        headerRight: () => <ProfileMenu onSignOut={handleSignOut} />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: -2,
        },
        tabBarStyle: {
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
          paddingTop: 8,
          borderTopWidth: 0,
          backgroundColor: colors.surface,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.06,
          shadowRadius: 6,
        },
        tabBarIcon: ({ color }) => {
          if (route.name === 'EventsStack') {
            return <CalendarDayIcon color={color} size={22} />;
          }
          return (
            <Feather
              name={ICON_MAP[route.name] ?? 'circle'}
              size={22}
              color={color}
            />
          );
        },
      })}
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
  );
};

export default MainTabNavigator;