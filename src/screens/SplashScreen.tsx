import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Animated,
  StatusBar,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initDB } from '../database/db';
import { settingsService } from '../services';
import { authService } from '../services/AuthService';
import { useTheme } from '../context/ThemeContext';
import { determineRoute } from '../navigation/determineRoute';
import i18n from '../i18n/index';
import { GradientBackground } from '../components/GradientBackground';

/**
 * Splash gradient, tuned to the MoiFlow logo and the active theme.
 *
 * Light mode: a soft brand mint → cool-blue wash that echoes the logo's green
 * swoosh and navy wordmark, kept light so the dark logo/tagline stay legible.
 * Dark mode: a deep teal → navy wash so the splash matches night mode instead
 * of flashing a bright screen.
 */
const SPLASH_GRADIENT_LIGHT = ['#A7E3C6', '#BEE6D6', '#C9DDEC', '#B4CCE6'];
const SPLASH_GRADIENT_DARK = ['#0B1F1B', '#0F2A2E', '#122536', '#0C1A2E'];

type NavProp = { replace: (screen: string, params?: Record<string, unknown>) => void };

const SplashScreen = ({ navigation }: { navigation: NavProp }) => {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const gradient = isDark ? SPLASH_GRADIENT_DARK : SPLASH_GRADIENT_LIGHT;

  // Animations
  const iconScale = useRef(new Animated.Value(0.6)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const brandOpacity = useRef(new Animated.Value(0)).current;
  const brandY = useRef(new Animated.Value(16)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const progressWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entrance animation sequence
    Animated.sequence([
      Animated.parallel([
        Animated.spring(iconScale, {
          toValue: 1,
          friction: 6,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(iconOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(brandOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(brandY, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
    ]).start();

    // Progress bar
    Animated.timing(progressWidth, {
      toValue: 1,
      duration: 2000,
      useNativeDriver: false,
    }).start();

    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const boot = async () => {
    try {
      await initDB();
      const lang = await settingsService.get('language');
      if (lang) await i18n.changeLanguage(lang);

      const authState = await authService.getAuthState();
      const onboardingDone = (await AsyncStorage.getItem('app.onboarding_done')) === 'true';
      const route = determineRoute(authState, onboardingDone);
      setTimeout(() => navigation.replace(route), 2200);
    } catch (err) {
      setTimeout(() => navigation.replace('MainTab'), 2500);
    }
  };

  const progressInterpolate = progressWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <GradientBackground colors={gradient} steps={28} style={styles.container}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      {/* Main content */}
      <View style={styles.content}>
        {/* App icon tile — reads cleanly on both light and dark gradients */}
        <Animated.View
          style={[
            styles.iconContainer,
            {
              opacity: iconOpacity,
              transform: [{ scale: iconScale }],
            },
          ]}
        >
          <Image
            source={require('../assets/app-icon/moiflow-app-icon-192.png')}
            style={styles.appIcon}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Brand wordmark */}
        <Animated.View
          style={{
            opacity: brandOpacity,
            transform: [{ translateY: brandY }],
            alignItems: 'center',
          }}
        >
          <Text style={styles.brandText}>
            <Text style={[styles.brandMoi, { color: isDark ? '#F1F9F7' : '#0A2540' }]}>Moi</Text>
            <Text style={[styles.brandFlow, { color: colors.primary }]}>Flow</Text>
          </Text>
        </Animated.View>

        {/* Tagline */}
        <Animated.View style={{ opacity: taglineOpacity }}>
          <Text style={[styles.tagline, { color: colors.textSecondary }]}>
            {t('app.tagline')}
          </Text>
        </Animated.View>
      </View>

      {/* Bottom section */}
      <View style={styles.bottomSection}>
        {/* Progress bar */}
        <View style={[styles.progressContainer, { backgroundColor: 'rgba(9,165,100,0.15)' }]}>
          <Animated.View
            style={[
              styles.progressBar,
              { width: progressInterpolate, backgroundColor: colors.primary },
            ]}
          />
        </View>
        <Text style={[styles.versionText, { color: colors.textDisabled }]}>v1.0.0</Text>
      </View>
    </GradientBackground>
  );
};

export default SplashScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  iconContainer: {
    marginBottom: 10,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 12,
  },
  appIcon: {
    width: 112,
    height: 112,
    borderRadius: 26,
  },
  brandText: {
    textAlign: 'center',
    fontSize: 34,
    letterSpacing: 0.3,
  },
  brandMoi: {
    fontWeight: '800',
  },
  brandFlow: {
    fontWeight: '700',
  },
  tagline: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
    letterSpacing: 0.3,
  },
  bottomSection: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 60,
  },
  progressContainer: {
    width: '100%',
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  versionText: {
    color: '#111111',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
});
