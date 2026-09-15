import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@common/context/ThemeContext';
import { authService } from '@common/services/AuthService';

interface Props {
  navigation: { goBack: () => void };
  route?: { params?: { onSuccess?: () => void; pinLength?: 4 | 6 } };
}

type Step = 'enter' | 'confirm';

const KEYPAD = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', '⌫'],
];

const PinSetupScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const PIN_LENGTH = route?.params?.pinLength ?? 4;
  const [step, setStep] = useState<Step>('enter');
  const [firstPin, setFirstPin] = useState('');
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const onSuccess = route?.params?.onSuccess;

  const handleKey = useCallback((key: string) => {
    if (saving) return;
    if (key === '⌫') {
      setPin(p => p.slice(0, -1));
      return;
    }
    if (key === '') return;
    setPin(prev => {
      if (prev.length >= PIN_LENGTH) return prev;
      const next = prev + key;
      if (next.length === PIN_LENGTH) {
        setTimeout(() => advance(next), 150);
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, firstPin, saving, PIN_LENGTH]);

  const advance = async (entered: string) => {
    if (step === 'enter') {
      setFirstPin(entered);
      setPin('');
      setStep('confirm');
    } else {
      if (entered !== firstPin) {
        Alert.alert(t('common.error'), t('auth.pinSetup.mismatch'));
        setPin('');
        setFirstPin('');
        setStep('enter');
        return;
      }

      // Store MPIN securely
      setSaving(true);
      try {
        await authService.setupMPIN(entered);
        if (onSuccess) {
          // Called from initial registration flow — onSuccess handles navigation
          onSuccess();
        } else {
          // Called from Settings (change PIN) — just go back
          navigation.goBack();
        }
      } catch (error) {
        Alert.alert(t('common.error'), t('auth.pinSetup.setupFailed'));
        setPin('');
        setFirstPin('');
        setStep('enter');
      } finally {
        setSaving(false);
      }
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
        <Text style={[styles.backText, { color: colors.primary }]}>{t('auth.pinSetup.back')}</Text>
      </TouchableOpacity>

      <Text style={[styles.title, { color: colors.textPrimary }]}>
        {step === 'enter' ? t('auth.pinSetup.title') : t('auth.pinSetup.confirmTitle')}
      </Text>
      <Text style={[styles.sub, { color: colors.textMuted }]}>
        {t('auth.pinSetup.subtitle', { length: PIN_LENGTH })}
      </Text>

      {/* PIN Dots */}
      <View style={styles.dotsRow}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { borderColor: pin.length > i ? colors.primary : colors.border },
              pin.length > i && [styles.dotFilled, { backgroundColor: colors.primary }],
            ]}
          />
        ))}
      </View>

      {saving ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 32 }} />
      ) : (
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
                  ]}
                  onPress={() => handleKey(key)}
                  disabled={key === '' || saving}
                  activeOpacity={0.7}
                  accessibilityLabel={key === '⌫' ? t('common.back') : key}
                >
                  <Text
                    style={[
                      styles.keyText,
                      { color: colors.textPrimary },
                      key === '⌫' && { fontSize: 20 },
                    ]}
                  >
                    {key}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
};

export default PinSetupScreen;

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', paddingTop: 20 },
  back: { alignSelf: 'flex-start', paddingHorizontal: 20, paddingVertical: 10 },
  backText: { fontSize: 14, fontWeight: '600' },
  title: { fontSize: 21, fontWeight: '800', marginTop: 20, textAlign: 'center' },
  sub: { fontSize: 13, marginTop: 8, marginBottom: 36, textAlign: 'center', paddingHorizontal: 40 },
  dotsRow: { flexDirection: 'row', gap: 16, marginBottom: 40 },
  dot: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 2,
    backgroundColor: 'transparent',
  },
  dotFilled: {},
  keypad: { width: 280 },
  keyRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  key: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center', elevation: 2,
  },
  keyEmpty: { backgroundColor: 'transparent', borderWidth: 0, elevation: 0 },
  keyText: { fontSize: 23, fontWeight: '600' },
});
