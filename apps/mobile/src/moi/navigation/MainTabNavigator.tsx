import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import DashboardStack from '@moi/navigation/stacks/DashboardStack';
import EntriesStack from '@moi/navigation/stacks/EntriesStack';
import EventsStack from '@moi/navigation/stacks/EventsStack';
import ReportsStack from '@moi/navigation/stacks/ReportsStack';
import SettingsStack from '@moi/navigation/stacks/SettingsStack';
import { ProfileMenu } from '@common/components/ProfileMenu';
import { ModeSwitch } from '@common/components/ModeSwitch';
import { DashboardWelcome } from '@common/components/DashboardWelcome';
import { authService } from '@common/services/AuthService';
import { useTheme } from '@common/context/ThemeContext';
import MoiflowLogo from '@common/components/MoiflowLogo';
import { FloatingTabBar } from '@common/components/FloatingTabBar';

const Tab = createBottomTabNavigator();

const MainTabNavigator = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { colors, themeName } = useTheme();

  const handleSignOut = useCallback(async () => {
    await authService.signOut();
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'PinLock' }],
      }),
    );
  }, [navigation]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/*
        Persistent header — rendered ONCE above the tab navigator.

        Row 1: App logo (left)  ·  Notifications + Profile (right)
        Row 2: Welcome + username (left)  ·  Moi | Finance toggle (right)
      */}
      <View
        style={[
          styles.headerWrap,
          { paddingTop: insets.top + 16, backgroundColor: colors.background },
        ]}
      >
        {/* Row 1 */}
        <View style={styles.headerTop}>
          <MoiflowLogo color={colors.textPrimary} size="medium" variant="header" />
          <ProfileMenu onSignOut={handleSignOut} />
        </View>

        {/* Row 2 */}
        <View style={styles.headerBottom}>
          <View style={styles.welcomeWrap}>
            <DashboardWelcome />
          </View>
          <ModeSwitch current="moi" />
        </View>
      </View>

      <View style={styles.body}>
        <Tab.Navigator
          key={themeName}
          initialRouteName="DashboardStack"
          tabBar={props => <FloatingTabBar {...props} />}
          screenOptions={{
            headerShown: false,
            animation: 'fade',
            sceneStyle: { backgroundColor: colors.background },
          }}
        >
          <Tab.Screen name="DashboardStack"  component={DashboardStack}  options={{ title: t('nav.dashboard') }} />
          <Tab.Screen name="EntriesStack"    component={EntriesStack}    options={{ title: t('nav.entries') }} />
          <Tab.Screen name="EventsStack"     component={EventsStack}     options={{ title: t('nav.events') }} />
          <Tab.Screen name="ReportsStack"    component={ReportsStack}    options={{ title: t('nav.reports') }} />
          <Tab.Screen name="SettingsStack"   component={SettingsStack}   options={{ title: t('nav.settings') }} />
        </Tab.Navigator>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },

  headerWrap: {
    paddingBottom: 10,
    // No horizontal padding here — each row controls its own insets so the
    // logo in Row 1 can sit flush-left while Row 2 content stays inset at 16.
  },

  /* Row 1: logo (flush-left) | profile cluster (flush-right) */
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    // ProfileMenu has its own marginRight: 12; cancel it so the icons land
    // at the same right edge as the Row 2 content.
    paddingRight: 4,
  },

  /* Row 2: welcome text (flex:1) | mode switch — inset to match body content */
  headerBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 12,
  },

  welcomeWrap: {
    flex: 1,
    marginRight: 12,
  },

  body: { flex: 1 },
});

export default MainTabNavigator;
