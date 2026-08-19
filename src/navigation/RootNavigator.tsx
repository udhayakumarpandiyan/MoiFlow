import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme, Theme as NavTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import SplashScreen            from '../screens/SplashScreen';
import RegistrationScreen      from '../screens/RegistrationScreen';
import OTPVerificationScreen   from '../screens/OTPVerificationScreen';
import SecuritySetupScreen     from '../screens/SecuritySetupScreen';
import PinSetupScreen          from '../screens/PinSetupScreen';
import PatternSetupScreen      from '../screens/PatternSetupScreen';
import PinLockScreen           from '../screens/PinLockScreen';
import PatternLockScreen       from '../screens/PatternLockScreen';
import OnboardingScreen        from '../screens/OnboardingScreen';
import MainTabNavigator        from './MainTabNavigator';
import { useTheme } from '../context/ThemeContext';

const Stack = createNativeStackNavigator();

// Wrapper components so we can pass props through params
const PinLockWrapper = ({ navigation }: any) => (
  <PinLockScreen onUnlocked={() => navigation.replace('MainTab')} />
);

const PatternLockWrapper = ({ navigation }: any) => (
  <PatternLockScreen onUnlocked={() => navigation.replace('MainTab')} />
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
        <Stack.Screen name="PatternSetup"      component={PatternSetupScreen} />
        <Stack.Screen name="PinLock"           component={PinLockWrapper} options={{ animation: 'fade' }} />
        <Stack.Screen name="PatternLock"       component={PatternLockWrapper} options={{ animation: 'fade' }} />
        <Stack.Screen name="Onboarding"        component={OnboardingScreen} options={{ animation: 'fade_from_bottom' }} />
        <Stack.Screen name="MainTab"           component={MainTabNavigator} options={{ animation: 'fade' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;