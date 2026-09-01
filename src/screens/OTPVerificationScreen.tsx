import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import { authService } from '../services/AuthService';
import { sendOTP, verifyOTP } from '../api/AuthApi';
import { RootStackParamList } from '../navigation/RootNavigator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = NativeStackScreenProps<RootStackParamList, 'OTPVerification'>;

// ---------------------------------------------------------------------------
// OTPVerificationScreen
// ---------------------------------------------------------------------------

const OTP_LENGTH = 6;

const OTPVerificationScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { phone, name } = route.params;

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [error, setError] = useState<string>('');
  const [verifying, setVerifying] = useState(false);

  const inputRefs = useRef<(TextInput | null)[]>([]);

  // Resend requests a new OTP from the backend
  const handleResendOtp = useCallback(async () => {
    setOtp(Array(OTP_LENGTH).fill(''));
    setError('');
    try {
      await sendOTP(phone, name);
    } catch {
      Alert.alert(t('common.error'), t('auth.registration.failed'));
    }
    inputRefs.current[0]?.focus();
  }, [phone, name, t]);

  useEffect(() => {
    // Focus the first OTP input on mount
    setTimeout(() => inputRefs.current[0]?.focus(), 300);
  }, []);

  // Handle individual digit input
  const handleChange = (text: string, index: number) => {
    const digit = text.replace(/[^0-9]/g, '').slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);
    setError('');

    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  // Handle backspace
  const handleKeyPress = (e: { nativeEvent: { key: string } }, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      const newOtp = [...otp];
      newOtp[index - 1] = '';
      setOtp(newOtp);
    }
  };

  // Verify OTP via the backend and complete registration
  const handleVerify = async () => {
    const enteredOtp = otp.join('');

    if (enteredOtp.length !== OTP_LENGTH) {
      setError(t('auth.otp.invalidOtp'));
      return;
    }

    setVerifying(true);
    try {
      const response = await verifyOTP(phone, name, enteredOtp);
      if (!response.verified) {
        setError(response.message || t('auth.otp.invalidOtp'));
        setVerifying(false);
        return;
      }

      // Save session token from backend
      if (response.token) {
        await authService.saveSessionToken(response.token);
      }

      // OTP verified — now complete the registration locally
      await authService.completeRegistration(name, phone);
      navigation.replace('SecuritySetup');
    } catch {
      Alert.alert(t('common.error'), t('auth.registration.failed'));
    } finally {
      setVerifying(false);
    }
  };

  const isComplete = otp.every(d => d !== '');

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: '#FFFFFF' }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Branding */}
        <View style={styles.brand}>
          <Image
            source={require('../assets/logo/moiflow-logo-temp.png')}
            style={styles.brandLogo}
            resizeMode="contain"
          />
        </View>

        {/* Card */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{t('auth.otp.title')}</Text>
          <Text style={[styles.cardSub, { color: colors.textMuted }]}>{t('auth.otp.subtitle')}</Text>

          {/* Phone display */}
          {phone ? (
            <View style={[styles.phoneChip, { backgroundColor: colors.primaryBg }]}>
              <Text style={[styles.phoneText, { color: colors.primary }]}>+91 {phone}</Text>
            </View>
          ) : null}

          {/* OTP Inputs */}
          <View style={styles.otpRow}>
            {Array.from({ length: OTP_LENGTH }).map((_, index) => (
              <TextInput
                key={index}
                ref={ref => { inputRefs.current[index] = ref; }}
                style={[
                  styles.otpInput,
                  { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.background },
                  otp[index] ? { borderColor: colors.primary, backgroundColor: colors.primaryBg } : null,
                  error ? { borderColor: colors.error } : null,
                ]}
                value={otp[index]}
                onChangeText={text => handleChange(text, index)}
                onKeyPress={e => handleKeyPress(e, index)}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
                accessibilityLabel={`OTP digit ${index + 1}`}
              />
            ))}
          </View>

          {/* Error */}
          {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}

          {/* Verify Button */}
          <TouchableOpacity
            style={[
              styles.btn,
              { backgroundColor: colors.primary },
              (!isComplete || verifying) && styles.btnDisabled,
            ]}
            onPress={handleVerify}
            disabled={!isComplete || verifying}
            activeOpacity={0.85}
          >
            <Text style={[styles.btnText, { color: colors.textInverse }]}>
              {verifying ? t('common.loading') : t('auth.otp.verify')}
            </Text>
          </TouchableOpacity>

          {/* Resend */}
          <TouchableOpacity
            style={styles.resendBtn}
            onPress={handleResendOtp}
            activeOpacity={0.7}
          >
            <Text style={[styles.resendText, { color: colors.primary }]}>{t('auth.otp.resend')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default OTPVerificationScreen;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  brand: { alignItems: 'center', marginBottom: 32 },
  brandLogo: { width: 200, height: 60, marginBottom: 10 },
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
  cardSub: { fontSize: 12, marginBottom: 16, lineHeight: 18 },
  phoneChip: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 20,
  },
  phoneText: { fontSize: 14, fontWeight: '600' },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  otpInput: {
    width: 44,
    height: 52,
    borderWidth: 1.5,
    borderRadius: 10,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
  },
  errorText: { fontSize: 12, textAlign: 'center', marginBottom: 12 },
  btn: {
    marginTop: 8,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: 14, fontWeight: '700' },
  resendBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 8 },
  resendText: { fontSize: 13, fontWeight: '600' },
});
