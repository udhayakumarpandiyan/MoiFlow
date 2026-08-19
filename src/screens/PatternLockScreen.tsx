import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, PanResponder, TouchableOpacity,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { authService } from '../services/AuthService';

const DOT_SIZE = 52;
const DOT_GAP  = 28;
const GRID_SIZE = 3;

const getDotCenter = (index: number) => {
  const col = index % GRID_SIZE;
  const row = Math.floor(index / GRID_SIZE);
  return {
    x: col * (DOT_SIZE + DOT_GAP) + DOT_SIZE / 2,
    y: row * (DOT_SIZE + DOT_GAP) + DOT_SIZE / 2,
  };
};

interface Props {
  onUnlocked: () => void;
}

const PatternLockScreen: React.FC<Props> = ({ onUnlocked }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const [selected, setSelected] = useState<number[]>([]);
  const [drawing,  setDrawing]  = useState(false);
  const [error,    setError]    = useState('');
  const [lockedOut, setLockedOut] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const gridRef    = useRef<View>(null);
  const gridOrigin = useRef({ x: 0, y: 0 });
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check lockout state on mount (e.g., user force-closed app during lockout)
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

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startCountdown = useCallback((seconds: number) => {
    setLockedOut(true);
    setCountdown(seconds);
    setError('');
    setSelected([]);

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

  const getDotAt = (px: number, py: number): number | null => {
    for (let i = 0; i < 9; i++) {
      const c  = getDotCenter(i);
      const ox = gridOrigin.current.x;
      const oy = gridOrigin.current.y;
      const dx = px - (ox + c.x);
      const dy = py - (oy + c.y);
      if (Math.sqrt(dx * dx + dy * dy) < DOT_SIZE / 2 + 8) return i;
    }
    return null;
  };

  const verify = async (pattern: number[]) => {
    if (lockedOut) return;

    // Encode pattern as dash-separated string for verification
    const encoded = pattern.join('-');
    const isValid = await authService.verifyPattern(encoded);

    if (isValid) {
      onUnlocked();
    } else {
      const result = await authService.recordFailedAttempt();
      setSelected([]);

      if (result.locked) {
        startCountdown(result.lockoutSeconds);
      } else {
        setError(t('auth.patternLock.wrongPattern'));
      }
    }
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (e) => {
        if (lockedOut) return;
        setSelected([]); setError(''); setDrawing(true);
        const dot = getDotAt(e.nativeEvent.pageX, e.nativeEvent.pageY);
        if (dot !== null) setSelected([dot]);
      },
      onPanResponderMove: (e) => {
        if (lockedOut) return;
        const dot = getDotAt(e.nativeEvent.pageX, e.nativeEvent.pageY);
        if (dot !== null) {
          setSelected(prev => prev.includes(dot) ? prev : [...prev, dot]);
        }
      },
      onPanResponderRelease: () => {
        if (lockedOut) return;
        setDrawing(false);
        setSelected(prev => { verify(prev); return prev; });
      },
    }),
  ).current;

  const gridWidth = GRID_SIZE * DOT_SIZE + (GRID_SIZE - 1) * DOT_GAP;
  const themedStyles = getStyles(colors);

  return (
    <SafeAreaView style={themedStyles.container}>
      <View style={themedStyles.brand}>
        <Text style={themedStyles.brandText}>MoiFlow</Text>
        <Text style={themedStyles.brandSub}>?????????</Text>
      </View>

      <Text style={themedStyles.title}>{t('auth.patternLock.title')}</Text>

      <View
        ref={gridRef}
        style={[themedStyles.grid, { width: gridWidth, height: gridWidth }]}
        onLayout={() => {
          gridRef.current?.measure((_fx, _fy, _w, _h, px, py) => {
            gridOrigin.current = { x: px, y: py };
          });
        }}
        {...responder.panHandlers}
      >
        {Array.from({ length: 9 }, (_, i) => {
          const c = getDotCenter(i);
          const isSelected = selected.includes(i);
          return (
            <View
              key={i}
              style={[
                themedStyles.dot,
                {
                  position: 'absolute',
                  left: c.x - DOT_SIZE / 2,
                  top:  c.y - DOT_SIZE / 2,
                  width: DOT_SIZE, height: DOT_SIZE,
                  borderRadius: DOT_SIZE / 2,
                  backgroundColor: isSelected ? colors.primary : colors.surface,
                  borderColor:     isSelected ? colors.primaryDark : colors.border,
                },
              ]}
            >
              {!isSelected ? <View style={themedStyles.dotInner} /> : null}
            </View>
          );
        })}
      </View>

      {lockedOut ? (
        <Text style={themedStyles.error}>
          {t('auth.patternLock.lockout', { seconds: countdown })}
        </Text>
      ) : error ? (
        <Text style={themedStyles.error}>{error}</Text>
      ) : (
        <Text style={themedStyles.hint}>
          {drawing ? t('auth.patternLock.drawPattern') : t('auth.patternLock.drawPattern')}
        </Text>
      )}

      <TouchableOpacity
        style={themedStyles.retryBtn}
        onPress={() => { setSelected([]); setError(''); }}
        disabled={lockedOut}
      >
        <Text style={[themedStyles.retryText, lockedOut && { opacity: 0.4 }]}>
          {t('common.retry')}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

export default PatternLockScreen;

const getStyles = (colors: ReturnType<typeof import('../context/ThemeContext').useTheme>['colors']) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, alignItems: 'center', paddingTop: 40 },
    brand:     { alignItems: 'center', marginBottom: 36 },
    brandText: { fontSize: 26, fontWeight: '800', color: colors.primary },
    brandSub:  { fontSize: 13, color: colors.textMuted, marginTop: 4 },
    title:     { fontSize: 19, fontWeight: '700', color: colors.textPrimary, marginBottom: 32 },
    grid:      { position: 'relative' },
    dot:       { borderWidth: 2, alignItems: 'center', justifyContent: 'center', elevation: 2 },
    dotInner:  { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.textDisabled },
    error:     { color: colors.error, fontSize: 12, fontWeight: '600', marginTop: 20 },
    hint:      { color: colors.textMuted, fontSize: 12, marginTop: 20 },
    retryBtn:  { marginTop: 24, paddingVertical: 10, paddingHorizontal: 24 },
    retryText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  });
