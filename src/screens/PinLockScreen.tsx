import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { authService } from '../services/AuthService';
import MoiflowLogo from '../components/MoiflowLogo';

interface Props {
  onUnlocked: () => void;
}

const PIN_LENGTH = 4;

const KEYPAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', '?'],
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
    if (key === '?') {
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
      const isValid = await authService.verifyPin(entered);

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
    } catch (err) {
      console.error('[PinLock] verify error:', err);
      setPin('');
      resetDots();
      setError(t('auth.pinLock.wrongPin'));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
      {/* Brand */}
      <View style={styles.brandSection}>
        <MoiflowLogo color={colors.primary} size="medium" />
      </View>

      {/* Title & subtitle */}
      <View style={styles.headerSection}>
        <Text style={[styles.title, { color: '#111827' }]}>
          {t('auth.pinLock.title')}
        </Text>
        <Text style={[styles.subtitle, { color: '#6B7280' }]}>
          {t('auth.pinLock.enterPin')}
        </Text>
      </View>

      {/* PIN Dots */}
      <Animated.View
        style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}
        accessibilityRole="image"
        accessibilityLabel={t('auth.pinLock.enterPin')}
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => {
          const isFilled = pin.length > i;
          const scale = dotScales[i].interpolate({
            inputRange: [0, 1],
            outputRange: [0, 1],
          });

          return (
            <View key={i} style={styles.dotWrapper}>
              <View
                style={[
                  styles.dot,
                  { borderColor: '#D1D5DB' },
                ]}
              />
              {isFilled && (
                <Animated.View
                  style={[
                    styles.dotFilled,
                    {
                      backgroundColor: '#111827',
                      transform: [{ scale }],
                    },
                  ]}
                />
              )}
            </View>
          );
        })}
      </Animated.View>

      {/* Error / Lockout message */}
      <View style={styles.messageContainer}>
        {lockedOut ? (
          <Text style={[styles.errorText, { color: '#DC2626' }]}>
            {t('auth.pinLock.lockout', { seconds: countdown })}
          </Text>
        ) : error ? (
          <Text style={[styles.errorText, { color: '#DC2626' }]}>
            {error}
          </Text>
        ) : null}
      </View>

      {/* Keypad */}
      <View style={styles.keypad}>
        {KEYPAD.map((row, ri) => (
          <View key={ri} style={styles.keyRow}>
            {row.map((key, ki) => {
              const isEmpty = key === '';
              const isBackspace = key === '?';

              return (
                <TouchableOpacity
                  key={ki}
                  style={[
                    styles.key,
                    isEmpty && styles.keyInvisible,
                    !isEmpty && {
                      backgroundColor: '#F3F4F6',
                    },
                  ]}
                  onPress={() => handleKey(key)}
                  disabled={isEmpty || lockedOut}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isBackspace ? 'Delete' : key
                  }
                >
                  <Text
                    style={[
                      styles.keyText,
                      { color: isBackspace ? '#6B7280' : '#111827' },
                      isBackspace && styles.keyBackspace,
                    ]}
                  >
                    {key}
                  </Text>
                </TouchableOpacity>
              );
            })}
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
    paddingTop: 48,
  },
  brandSection: {
    marginBottom: 40,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 8,
    fontWeight: '400',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 12,
  },
  dotWrapper: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    position: 'absolute',
  },
  dotFilled: {
    width: 18,
    height: 18,
    borderRadius: 9,
    position: 'absolute',
  },
  messageContainer: {
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  keypad: {
    width: 280,
    marginTop: 12,
  },
  keyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  key: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyInvisible: {
    backgroundColor: 'transparent',
  },
  keyText: {
    fontSize: 24,
    fontWeight: '500',
  },
  keyBackspace: {
    fontSize: 21,
  },
});
