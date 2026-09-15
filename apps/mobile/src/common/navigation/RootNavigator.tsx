import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme, Theme as NavTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SplashScreen            from '@common/screens/SplashScreen';
import RegistrationScreen      from '@common/screens/RegistrationScreen';
import OTPVerificationScreen   from '@common/screens/OTPVerificationScreen';
import SecuritySetupScreen     from '@common/screens/SecuritySetupScreen';
import PinSetupScreen          from '@common/screens/PinSetupScreen';
import PinLockScreen           from '@common/screens/PinLockScreen';
import OnboardingScreen        from '@common/screens/OnboardingScreen';
import MainTabNavigator        from '@moi/navigation/MainTabNavigator';
import FinanceTabNavigator     from '@finance/navigation/FinanceTabNavigator';
import { useTheme } from '@common/context/ThemeContext';

export type RootStackParamList = {
  SplashStack: undefined;
  Registration: undefined;
  OTPVerification: { phone: string; name: string };
  SecuritySetup: undefined;
  PinSetup: undefined;
  PinLock: undefined;
  Onboarding: undefined;
  MainTab: undefined;
  FinanceTab: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// Wrapper component so we can pass props through params
const PinLockWrapper = ({ navigation }: any) => (
  <PinLockScreen onUnlocked={() => navigation.replace('MainTab')} />
);

const RootNavigator = () => {
  const { colors, isDark } = useTheme();

  const navigationTheme: NavTheme = {
    dark: isDark,
    colors: {
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.textPrimary,
      border: colors.border,
      notification: colors.error,
    },
    fonts: isDark ? DarkTheme.fonts : DefaultTheme.fonts,
  };

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        initialRouteName="SplashStack"
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          animationDuration: 250,
        }}
      >
        <Stack.Screen name="SplashStack"       component={SplashScreen} options={{ animation: 'fade' }} />
        <Stack.Screen name="Registration"      component={RegistrationScreen} options={{ animation: 'fade_from_bottom' }} />
        <Stack.Screen name="OTPVerification"   component={OTPVerificationScreen} />
        <Stack.Screen name="SecuritySetup"     component={SecuritySetupScreen} />
        <Stack.Screen name="PinSetup"          component={PinSetupScreen} />
        <Stack.Screen name="PinLock"           component={PinLockWrapper} options={{ animation: 'fade' }} />
        <Stack.Screen name="Onboarding"        component={OnboardingScreen} options={{ animation: 'fade_from_bottom' }} />
        <Stack.Screen name="MainTab"           component={MainTabNavigator} options={{ animation: 'fade' }} />
        <Stack.Screen name="FinanceTab"        component={FinanceTabNavigator} options={{ animation: 'fade' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;
