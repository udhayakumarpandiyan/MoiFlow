import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Feather from '@react-native-vector-icons/feather';

import FinanceDashboardStack from './stacks/finance/FinanceDashboardStack';
import LoansStack from './stacks/finance/LoansStack';
import CreditsStack from './stacks/finance/CreditsStack';
import BusinessStack from './stacks/finance/BusinessStack';
import FinanceReportsStack from './stacks/finance/FinanceReportsStack';
import { ProfileMenu } from '../components/ProfileMenu';
import { ModeSwitch } from '../components/ModeSwitch';
import { authService } from '../services/AuthService';
import { useTheme } from '../context/ThemeContext';
import { FloatingTabBar } from '../components/FloatingTabBar';

const Tab = createBottomTabNavigator();

type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

/** Finance-specific tab icons. */
const FINANCE_ICON_MAP: Record<string, FeatherIconName> = {
  FinanceDashboardStack: 'grid',
  LoansStack: 'dollar-sign',
  CreditsStack: 'credit-card',
  BusinessStack: 'briefcase',
  FinanceReportsStack: 'bar-chart-2',
};

/**
 * Finance mode — a parallel tab navigator to MainTabNavigator. It reuses the
 * shared header pattern (mode switch + profile), FloatingTabBar, theme and
 * auth. Completely independent of the Moi tabs.
 */
const FinanceTabNavigator = () => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { colors, themeName } = useTheme();

  const handleSignOut = useCallback(async () => {
    await authService.signOut();
    navigation.dispatch(
      CommonActions.reset({ index: 0, routes: [{ name: 'PinLock' }] }),
    );
  }, [navigation]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Persistent header with the Moi ⇄ Finance switch. */}
      <View style={[styles.header, { paddingTop: insets.top + 20, backgroundColor: colors.background }]}>
        <ModeSwitch current="finance" />
        <ProfileMenu onSignOut={handleSignOut} />
      </View>

      <View style={styles.body}>
        <Tab.Navigator
          key={themeName}
          initialRouteName="FinanceDashboardStack"
          tabBar={props => (
            <FloatingTabBar {...props} iconMap={FINANCE_ICON_MAP} hiddenRoutes={[]} />
          )}
          screenOptions={{
            headerShown: false,
            animation: 'fade',
            sceneStyle: { backgroundColor: colors.background },
          }}
        >
          <Tab.Screen name="FinanceDashboardStack" component={FinanceDashboardStack} options={{ title: t('nav.dashboard') }} />
          <Tab.Screen name="LoansStack" component={LoansStack} options={{ title: t('nav.loans') }} />
          <Tab.Screen name="CreditsStack" component={CreditsStack} options={{ title: t('nav.credits') }} />
          <Tab.Screen name="BusinessStack" component={BusinessStack} options={{ title: t('nav.business') }} />
          <Tab.Screen name="FinanceReportsStack" component={FinanceReportsStack} options={{ title: t('nav.reports') }} />
        </Tab.Navigator>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 6,
    paddingHorizontal: 4,
  },
  body: { flex: 1 },
});

export default FinanceTabNavigator;
