import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, SafeAreaView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { settingsService } from '../services';
import { Colors } from '../theme/colors';

const hashPin = (pin: string): string => {
  // Simple deterministic hash — fine for local PIN (no crypto needed)
  let h = 0;
  for (let i = 0; i < pin.length; i++) {
    h = (Math.imul(31, h) + pin.charCodeAt(i)) | 0;
  }
  return String(h >>> 0);
};

interface Props {
  navigation: { goBack: () => void };
  route?: { params?: { onSuccess?: () => void } };
}

type Step = 'enter' | 'confirm';

const KEYPAD = [
  ['1','2','3'],
  ['4','5','6'],
  ['7','8','9'],
  ['','0','?'],
];

const PinSetupScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [step, setStep]         = useState<Step>('enter');
  const [firstPin, setFirstPin] = useState('');
  const [pin, setPin]           = useState('');
  const onSuccess = route?.params?.onSuccess;

  const handleKey = (key: string) => {
    if (key === '?') { setPin(p => p.slice(0, -1)); return; }
    if (key === '')   return;
    if (pin.length >= 4) return;
    const next = pin + key;
    setPin(next);
    if (next.length === 4) {
      setTimeout(() => advance(next), 150);
    }
  };

  const advance = async (entered: string) => {
    if (step === 'enter') {
      setFirstPin(entered);
      setPin('');
      setStep('confirm');
    } else {
      if (entered !== firstPin) {
        Alert.alert(t('common.error'), t('auth.pinSetup.mismatch'));
        setPin(''); setFirstPin(''); setStep('enter');
        return;
      }
      const hash = hashPin(entered);
      await settingsService.setPinHash(hash);
      await settingsService.setSecurityEnabled(true);
      await settingsService.setSecurityMethod('pin');
      onSuccess?.();
      navigation.goBack();
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
      <Text style={[styles.sub, { color: colors.textMuted }]}>{t('auth.pinSetup.subtitle')}</Text>

      <View style={styles.dotsRow}>
        {[0,1,2,3].map(i => (
          <View key={i} style={[styles.dot, { borderColor: colors.primary }, pin.length > i && [styles.dotFilled, { backgroundColor: colors.primary }]]} />
        ))}
      </View>

      <View style={styles.keypad}>
        {KEYPAD.map((row, ri) => (
          <View key={ri} style={styles.keyRow}>
            {row.map((key, ki) => (
              <TouchableOpacity
                key={ki}
                style={[styles.key, { backgroundColor: colors.surface, borderColor: colors.border }, key === '' && styles.keyEmpty]}
                onPress={() => handleKey(key)}
                disabled={key === ''}
                activeOpacity={0.7}
              >
                <Text style={[styles.keyText, { color: colors.textPrimary }, key === '?' && { color: colors.outColor }]}>{key}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
};

export { hashPin };
export default PinSetupScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', paddingTop: 20 },
  back:      { alignSelf: 'flex-start', paddingHorizontal: 20, paddingVertical: 10 },
  backText:  { color: Colors.primary, fontSize: 14, fontWeight: '600' },
  title:     { fontSize: 21, fontWeight: '800', color: Colors.textPrimary, marginTop: 20, textAlign: 'center' },
  sub:       { fontSize: 13, color: Colors.textMuted, marginTop: 8, marginBottom: 36 },
  dotsRow:   { flexDirection: 'row', gap: 20, marginBottom: 40 },
  dot:       { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.primary, backgroundColor: 'transparent' },
  dotFilled: { backgroundColor: Colors.primary },
  keypad:    { width: 280 },
  keyRow:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  key: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', elevation: 2,
  },
  keyEmpty:  { backgroundColor: 'transparent', borderWidth: 0, elevation: 0 },
  keyText:   { fontSize: 23, fontWeight: '600', color: Colors.textPrimary },
});
