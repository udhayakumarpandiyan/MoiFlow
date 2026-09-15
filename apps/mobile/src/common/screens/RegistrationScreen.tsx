import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
  Image,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@common/context/ThemeContext';
import { authService } from '@common/services/AuthService';
import { sendOTP } from '@common/api/AuthApi';

interface Props {
  navigation: { replace: (screen: string, params?: Record<string, unknown>) => void };
}

const RegistrationScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const validate = (): boolean => {
    if (!name.trim()) {
      Alert.alert(t('common.error'), t('auth.registration.nameRequired'));
      return false;
    }
    if (!phone.trim()) {
      Alert.alert(t('common.error'), t('auth.registration.phoneRequired'));
      return false;
    }
    if (!/^[6-9]\d{9}$/.test(phone.trim())) {
      Alert.alert(t('common.error'), t('auth.registration.invalidPhone'));
      return false;
    }
    return true;
  };

  // OTP generation and sending is now handled by the FastAPI backend.

  const handleRegister = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      // Check if this phone number is already registered
      const existingUser = await authService.checkDuplicateUser(phone.trim());
      if (existingUser) {
        Alert.alert(
          t('auth.registration.alreadyRegisteredTitle'),
          t('auth.registration.alreadyRegisteredMsg', {
            name: existingUser.name,
            phone: existingUser.phone,
          }),
        );
        setSaving(false);
        return;
      }

      // Try to send OTP via the backend. If the backend is unreachable
      // (offline / server not running), fall back to local-only registration
      // so the offline-first app remains fully functional without network.
      try {
        const response = await sendOTP(phone.trim(), name.trim());
        if (!response.success) {
          Alert.alert(t('common.error'), response.message);
          setSaving(false);
          return;
        }

        // Backend is available — use OTP verification flow
        navigation.replace('OTPVerification', {
          phone: phone.trim(),
          name: name.trim(),
        });
      } catch {
        // Backend unreachable — complete registration locally (offline-first)
        await authService.completeRegistration(name.trim(), phone.trim());
        navigation.replace('SecuritySetup');
      }
    } catch {
      Alert.alert(t('common.error'), t('auth.registration.failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: '#FFFFFF' }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Brand */}
        <View style={styles.brand}>
          <Image
            source={require('../assets/logo/moiflow-logo-temp.png')}
            style={styles.brandLogo}
            resizeMode="contain"
          />
          <Text style={[styles.tagline, { color: colors.textMuted }]}>
            {t('app.tagline')}
          </Text>
        </View>

        {/* Card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
            {t('auth.registration.title')}
          </Text>
          <Text style={[styles.cardSub, { color: colors.textMuted }]}>
            {t('auth.registration.subtitle')}
          </Text>

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t('auth.registration.nameLabel')} <Text style={{ color: colors.error }}>*</Text>
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: colors.border,
                color: colors.textPrimary,
                backgroundColor: colors.background,
              },
            ]}
            value={name}
            onChangeText={setName}
            placeholder={t('auth.registration.nameLabel')}
            placeholderTextColor={colors.textDisabled}
            autoCapitalize="words"
            returnKeyType="next"
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {t('auth.registration.phonePlaceholder')} <Text style={{ color: colors.error }}>*</Text>
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: colors.border,
                color: colors.textPrimary,
                backgroundColor: colors.background,
              },
            ]}
            value={phone}
            onChangeText={setPhone}
            placeholder="9876543210"
            placeholderTextColor={colors.textDisabled}
            keyboardType="phone-pad"
            maxLength={10}
            returnKeyType="done"
          />

          <TouchableOpacity
            style={[
              styles.btn,
              { backgroundColor: colors.primary },
              saving && styles.btnDisabled,
            ]}
            onPress={handleRegister}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Text style={[styles.btnText, { color: colors.textInverse }]}>
              {saving ? t('common.loading') : t('auth.registration.continueBtn')}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.note, { color: colors.textMuted }]}>
          {t('auth.registration.privacyNote')}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default RegistrationScreen;

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  brand: { alignItems: 'center', marginBottom: 32 },
  brandLogo: { width: 200, height: 60 },
  tagline: { marginTop: 6, fontSize: 12 },
  card: {
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  cardSub: { fontSize: 12, marginBottom: 20, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 14 },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  btn: {
    marginTop: 24,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: 14, fontWeight: '700' },
  note: { textAlign: 'center', fontSize: 11, marginTop: 20, lineHeight: 16 },
});
