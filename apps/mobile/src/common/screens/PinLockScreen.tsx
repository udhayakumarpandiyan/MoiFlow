import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Image,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@common/context/ThemeContext';
import { authService } from '@common/services/AuthService';

interface Props {
  onUnlocked: () => void;
}

const PIN_LENGTH = 4;

const KEYPAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', '⌫'],
];

const PinLockScreen: React.FC<Props> = ({ onUnlocked }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [lockedOut, setLockedOut] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Animations
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const dotScales = useRef(
    Array.from({ length: PIN_LENGTH }, () => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    const checkLockout = async () => {
      const state = await authService.getAuthState();
      if (state.lockoutUntil && state.lockoutUntil > Date.now()) {
        const remaining = Math.ceil((state.lockoutUntil - Date.now()) / 1000);
        startCountdown(remaining);
      }
    };
    checkLockout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startCountdown = useCallback((seconds: number) => {
    setLockedOut(true);
    setCountdown(seconds);
    setError('');
    setPin('');

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          setLockedOut(false);
          setError('');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const triggerShake = useCallback(() => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 4, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const animateDotFill = useCallback((index: number) => {
    dotScales[index].setValue(0);
    Animated.spring(dotScales[index], {
      toValue: 1,
      friction: 4,
      tension: 200,
      useNativeDriver: true,
    }).start();
  }, [dotScales]);

  const resetDots = useCallback(() => {
    dotScales.forEach(scale => scale.setValue(0));
  }, [dotScales]);

  const handleKey = (key: string) => {
    if (lockedOut || verifying) return;
    if (key === '⌫') {
      setPin(prev => {
        if (prev.length > 0) {
          dotScales[prev.length - 1].setValue(0);
          return prev.slice(0, -1);
        }
        return prev;
      });
      setError('');
      return;
    }
    if (key === '') return;

    setPin(prev => {
      if (prev.length >= PIN_LENGTH) return prev;
      const next = prev + key;
      animateDotFill(next.length - 1);

      if (next.length === PIN_LENGTH) {
        setTimeout(() => verify(next), 200);
      }
      return next;
    });
  };

  const verify = async (entered: string) => {
    setVerifying(true);
    try {
      const isValid = await authService.verifyMPIN(entered);

      if (isValid) {
        onUnlocked();
      } else {
        const result = await authService.recordFailedAttempt();
        setPin('');
        resetDots();
        triggerShake();

        if (result.locked) {
          startCountdown(result.lockoutSeconds);
        } else {
          setError(t('auth.pinLock.wrongPin'));
        }
      }
    } catch {
      setPin('');
      resetDots();
      setError(t('auth.pinLock.wrongPin'));
    } finally {
      setVerifying(false);
    }
  };

  const formatCountdown = (seconds: number): string => {
    if (seconds >= 60) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    return `${seconds}s`;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Brand */}
      <View style={styles.brandSection}>
        <Image
          source={require('../assets/app-icon/moiflow-app-icon-192.png')}
          style={styles.appIcon}
          resizeMode="contain"
        />
      </View>

      {/* Title & subtitle */}
      <View style={styles.headerSection}>
        <Text style={styles.title}>
          {t('auth.pinLock.title')}
        </Text>
        <Text style={styles.subtitle}>
          {t('auth.pinLock.enterPin')}
        </Text>
      </View>

      {/* PIN Dots */}
      <Animated.View
        style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}
        accessibilityRole="none"
        accessibilityLabel={t('auth.pinLock.enterPin')}
      >
        {Array.from({ length: PIN_LENGTH }, (_, i) => {
          const isFilled = i < pin.length;
          const scale = dotScales[i].interpolate({
            inputRange: [0, 1],
            outputRange: [0, 1],
          });
          return (
            <View key={i} style={[styles.dotOuter, { borderColor: isFilled ? colors.primary : colors.border }]}>
              {isFilled && (
                <Animated.View
                  style={[
                    styles.dotInner,
                    { backgroundColor: colors.primary, transform: [{ scale }] },
                  ]}
                />
              )}
            </View>
          );
        })}
      </Animated.View>

      {/* Status messages */}
      {lockedOut ? (
        <Text style={[styles.errorText, { color: colors.error }]}>
          {t('auth.pinLock.lockout', { time: formatCountdown(countdown) })}
        </Text>
      ) : error ? (
        <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
      ) : (
        <View style={styles.errorPlaceholder} />
      )}

      {/* Keypad */}
      <View style={styles.keypad}>
        {KEYPAD.map((row, ri) => (
          <View key={ri} style={styles.keyRow}>
            {row.map((key, ki) => (
              <TouchableOpacity
                key={ki}
                style={[
                  styles.key,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  key === '' && styles.keyEmpty,
                  lockedOut && styles.keyLockedOut,
                ]}
                onPress={() => handleKey(key)}
                disabled={key === '' || lockedOut || verifying}
                activeOpacity={0.7}
                accessibilityLabel={key === '⌫' ? t('common.back') : key}
              >
                <Text
                  style={[
                    styles.keyText,
                    { color: colors.textPrimary },
                    key === '⌫' && styles.keyTextBackspace,
                  ]}
                >
                  {key}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
};

export default PinLockScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 40,
    backgroundColor: '#FFFFFF',
  },
  brandSection: {
    marginBottom: 32,
    alignItems: 'center',
  },
  appIcon: {
    width: 80,
    height: 80,
    borderRadius: 18,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
    color: '#111827',
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 16,
  },
  dotOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 20,
    minHeight: 18,
  },
  errorPlaceholder: {
    minHeight: 18,
    marginBottom: 20,
  },
  keypad: {
    width: 280,
  },
  keyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  key: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  keyEmpty: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
  },
  keyLockedOut: {
    opacity: 0.4,
  },
  keyText: {
    fontSize: 23,
    fontWeight: '600',
  },
  keyTextBackspace: {
    fontSize: 20,
  },
});
