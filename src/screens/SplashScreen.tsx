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

type NavProp = { replace: (screen: string, params?: Record<string, unknown>) => void };

const SplashScreen = ({ navigation }: { navigation: NavProp }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();

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
    <View style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#FFFFFF"
        translucent={false}
      />

      {/* Main content */}
      <View style={styles.content}>
        {/* Logo */}
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
            source={require('../assets/logo/moiflow-logo-temp.png')}
            style={styles.splashLogo}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Brand name */}
        {/* <Animated.View
          style={{
            opacity: brandOpacity,
            transform: [{ translateY: brandY }],
          }}
        >
          <Text style={[styles.brandText, { color: colors.primary }]}>
            <Text style={styles.brandMoi}>Moi</Text>
            <Text style={styles.brandFlow}>Flow</Text>
          </Text>
          <Text style={[styles.brandTamil, { color: colors.textMuted }]}>
            ?????????
          </Text>
        </Animated.View> */}

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
        <View style={[styles.progressContainer, { backgroundColor: colors.borderLight }]}>
          <Animated.View
            style={[
              styles.progressBar,
              { width: progressInterpolate, backgroundColor: colors.primary },
            ]}
          />
        </View>
        <Text style={[styles.versionText, { color: colors.textDisabled }]}>v1.0.0</Text>
      </View>
    </View>
  );
};

export default SplashScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  iconContainer: {
    marginBottom: 12,
  },
  splashLogo: {
    width: 200,
    height: 60,
  },
  brandText: {
    textAlign: 'center',
    fontSize: 30,
    letterSpacing: 0.5,
  },
  brandMoi: {
    fontWeight: '800',
  },
  brandFlow: {
    fontWeight: '400',
  },
  brandTamil: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
    letterSpacing: 1.5,
  },
  tagline: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500',
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
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
});
