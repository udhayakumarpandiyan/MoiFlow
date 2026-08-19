import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, PanResponder,
  Animated, TouchableOpacity, Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { settingsService } from '../services';
import { hashCredential } from '../services/AuthService';
import { Colors } from '../theme/colors';

// 3x3 grid positions (0-indexed)
const DOT_SIZE  = 52;
const DOT_GAP   = 28;
const GRID_SIZE = 3;

const getDotCenter = (index: number) => {
  const col = index % GRID_SIZE;
  const row = Math.floor(index / GRID_SIZE);
  return {
    x: col * (DOT_SIZE + DOT_GAP) + DOT_SIZE / 2,
    y: row * (DOT_SIZE + DOT_GAP) + DOT_SIZE / 2,
  };
};

const encodePattern = (dots: number[]): string => dots.join('-');

interface Props {
  navigation: { goBack: () => void };
  route?: { params?: { onSuccess?: () => void } };
}

type Step = 'draw' | 'confirm';

const PatternGrid: React.FC<{
  onComplete: (pattern: number[]) => void;
  label: string;
  colors: ReturnType<typeof useTheme>['colors'];
  t: ReturnType<typeof useTranslation>['t'];
}> = ({ onComplete, label, colors, t }) => {
  const [selected, setSelected]   = useState<number[]>([]);
  const [drawing,  setDrawing]    = useState(false);
  const gridRef = useRef<View>(null);
  const gridOrigin = useRef({ x: 0, y: 0 });

  const getDotAt = (px: number, py: number): number | null => {
    for (let i = 0; i < 9; i++) {
      const c = getDotCenter(i);
      const ox = gridOrigin.current.x;
      const oy = gridOrigin.current.y;
      const dx = px - (ox + c.x);
      const dy = py - (oy + c.y);
      if (Math.sqrt(dx * dx + dy * dy) < DOT_SIZE / 2 + 8) return i;
    }
    return null;
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (e) => {
        setSelected([]);
        setDrawing(true);
        const dot = getDotAt(e.nativeEvent.pageX, e.nativeEvent.pageY);
        if (dot !== null) setSelected([dot]);
      },
      onPanResponderMove: (e) => {
        const dot = getDotAt(e.nativeEvent.pageX, e.nativeEvent.pageY);
        if (dot !== null) {
          setSelected(prev => prev.includes(dot) ? prev : [...prev, dot]);
        }
      },
      onPanResponderRelease: () => {
        setDrawing(false);
      },
    }),
  ).current;

  const handleConfirm = () => {
    if (selected.length < 4) {
      Alert.alert(t('auth.patternSetup.minDots'), t('auth.patternSetup.minDotsMessage'));
      return;
    }
    onComplete(selected);
    setSelected([]);
  };

  const gridWidth  = GRID_SIZE * DOT_SIZE + (GRID_SIZE - 1) * DOT_GAP;
  const gridHeight = gridWidth;

  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>

      <View
        ref={gridRef}
        style={[styles.grid, { width: gridWidth, height: gridHeight }]}
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
          const orderNum = selected.indexOf(i) + 1;
          return (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  position: 'absolute',
                  left: c.x - DOT_SIZE / 2,
                  top:  c.y - DOT_SIZE / 2,
                  width: DOT_SIZE,
                  height: DOT_SIZE,
                  borderRadius: DOT_SIZE / 2,
                  backgroundColor: isSelected ? colors.primary : colors.surface,
                  borderColor:     isSelected ? colors.primaryDark : colors.border,
                },
              ]}
            >
              {isSelected ? (
                <Text style={styles.dotNum}>{orderNum}</Text>
              ) : (
                <View style={[styles.dotInner, { backgroundColor: colors.textDisabled }]} />
              )}
            </View>
          );
        })}
      </View>

      {selected.length > 0 ? (
        <Text style={[styles.dotCount, { color: colors.primary }]}>
          {t('auth.patternSetup.dotsSelected', { count: selected.length })}
        </Text>
      ) : (
        <Text style={[styles.dotHint, { color: colors.textMuted }]}>
          {t('auth.patternSetup.connectDots')}
        </Text>
      )}

      {selected.length >= 4 && !drawing ? (
        <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: colors.primary }]} onPress={handleConfirm}>
          <Text style={styles.confirmBtnText}>{t('auth.patternSetup.confirm')}</Text>
        </TouchableOpacity>
      ) : null}

      {selected.length > 0 && !drawing ? (
        <TouchableOpacity style={styles.resetBtn} onPress={() => setSelected([])}>
          <Text style={[styles.resetBtnText, { color: colors.textMuted }]}>{t('auth.patternSetup.reset')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const PatternSetupScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [step,        setStep]       = useState<Step>('draw');
  const [firstPattern, setFirstPattern] = useState<number[]>([]);
  const onSuccess = route?.params?.onSuccess;

  const handleFirstPattern = (pattern: number[]) => {
    setFirstPattern(pattern);
    setStep('confirm');
  };

  const handleConfirmPattern = async (pattern: number[]) => {
    if (encodePattern(pattern) !== encodePattern(firstPattern)) {
      Alert.alert(t('common.error'), t('auth.patternSetup.mismatch'));
      setStep('draw');
      setFirstPattern([]);
      return;
    }
    const encoded = encodePattern(pattern);
    const hashed = hashCredential(encoded);
    await settingsService.setPatternLock(hashed);
    await settingsService.setSecurityEnabled(true);
    await settingsService.setSecurityMethod('pattern');
    onSuccess?.();
    navigation.goBack();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
        <Text style={[styles.backText, { color: colors.primary }]}>{t('auth.patternSetup.back')}</Text>
      </TouchableOpacity>
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        {step === 'draw' ? t('auth.patternSetup.title') : t('auth.patternSetup.confirmTitle')}
      </Text>
      <PatternGrid
        onComplete={step === 'draw' ? handleFirstPattern : handleConfirmPattern}
        label={step === 'draw' ? t('auth.patternSetup.drawNew') : t('auth.patternSetup.drawAgain')}
        colors={colors}
        t={t}
      />
    </SafeAreaView>
  );
};

export default PatternSetupScreen;
export { encodePattern };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', paddingTop: 20 },
  back:      { alignSelf: 'flex-start', paddingHorizontal: 20, paddingVertical: 10 },
  backText:  { color: Colors.primary, fontSize: 14, fontWeight: '600' },
  title:     { fontSize: 19, fontWeight: '800', color: Colors.textPrimary, marginTop: 16, marginBottom: 28, textAlign: 'center' },
  grid:      { position: 'relative' },
  dot:       { borderWidth: 2, alignItems: 'center', justifyContent: 'center', elevation: 2 },
  dotInner:  { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.textDisabled },
  dotNum:    { color: '#fff', fontSize: 14, fontWeight: '800' },
  dotCount:  { marginTop: 16, fontSize: 12, color: Colors.primary, fontWeight: '600' },
  dotHint:   { marginTop: 16, fontSize: 12, color: Colors.textMuted },
  label:     { fontSize: 14, color: Colors.textSecondary, fontWeight: '600', marginBottom: 20, textAlign: 'center' },
  confirmBtn: {
    marginTop: 18, backgroundColor: Colors.primary,
    paddingHorizontal: 32, paddingVertical: 13, borderRadius: 12,
  },
  confirmBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  resetBtn:       { marginTop: 12, paddingVertical: 8 },
  resetBtnText:   { color: Colors.textMuted, fontSize: 12 },
});
