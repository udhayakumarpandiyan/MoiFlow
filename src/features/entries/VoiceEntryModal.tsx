import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Animated,
  Easing,
  ScrollView,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';
import Feather from '@react-native-vector-icons/feather';
import { useTheme } from '../../context/ThemeContext';
import { voiceEntryService, entryService } from '../../services';
import { VoiceEntryService } from '../../voice/VoiceEntryService';
import { Colors } from '../../theme/colors';
import { EntryType, Entry } from '../../models/Entry';
import { isPremiumRequiredError } from '../../subscription/types';

export interface VoicePrefill {
  personName?: string;
  villageName?: string;
  cashAmount: number;
  goldWeight: number;
  entryType: EntryType;
  eventId?: string | null;
  eventName?: string;
  eventDate?: string;
  remarks?: string;
  recognizedText: string;
}

interface VoiceEntryModalProps {
  visible: boolean;
  onClose: () => void;
  /** Called after entry is successfully saved */
  onSaved: (entry: Entry) => void;
  /** Called with NLU-parsed values so caller can open AddEditEntryModal pre-filled (legacy support) */
  onParsed?: (prefill: VoicePrefill) => void;
  /** Force entry type based on selected tab (IN = OWN_EVENT, OUT = OTHER_EVENT) */
  entryType?: EntryType | null;
  /** Pre-selected event ID */
  eventId?: string | null;
  eventName?: string;
}

type Phase = 'idle' | 'listening' | 'parsing' | 'form' | 'saving' | 'error';

const VoiceEntryModal: React.FC<VoiceEntryModalProps> = ({
  visible,
  onClose,
  onSaved,
  onParsed,
  entryType: forcedEntryType,
  eventId,
  eventName,
}) => {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();

  const [phase, setPhase] = useState<Phase>('idle');
  const [recognizedText, setRecognizedText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Form fields (auto-filled from voice, editable by user)
  const [personName, setPersonName] = useState('');
  const [villageName, setVillageName] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [goldWeight, setGoldWeight] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  // Reset state each time the modal opens
  useEffect(() => {
    if (visible) {
      setPhase('idle');
      setRecognizedText('');
      setErrorMsg('');
      setPersonName('');
      setVillageName('');
      setCashAmount('');
      setGoldWeight('');
      setEntryDate(new Date().toISOString().split('T')[0]);
    } else {
      voiceEntryService.stopListening().catch(() => {});
    }
  }, [visible]);

  // Pulse animation while mic is active
  useEffect(() => {
    if (phase === 'listening') {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25, duration: 600,
            easing: Easing.inOut(Easing.ease), useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1, duration: 600,
            easing: Easing.inOut(Easing.ease), useNativeDriver: true,
          }),
        ]),
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
    }
    return () => { pulseLoop.current?.stop(); };
  }, [phase]);

  const startListening = async () => {
    setPhase('listening');
    setRecognizedText('');
    setErrorMsg('');

    if (!VoiceEntryService.isAvailable()) {
      setErrorMsg(t('entries.voiceStartFailed'));
      setPhase('error');
      return;
    }

    try {
      await voiceEntryService.startListening(
        async (text) => {
          setRecognizedText(text);
          setPhase('parsing');

          try {
            const result = await voiceEntryService.parse(text);
            // Auto-fill form fields from NLU result
            if (result.personName) setPersonName(result.personName);
            if (result.villageName) setVillageName(result.villageName);
            if (result.cashAmount > 0) setCashAmount(String(result.cashAmount));
            if (result.goldWeight > 0) setGoldWeight(String(result.goldWeight));
            setPhase('form');
          } catch (err: any) {
            setErrorMsg(
              err?.message?.includes('API Error') || err?.message?.includes('fetch')
                ? t('entries.serverUnreachable')
                : (err?.message ?? t('entries.parseFailed')),
            );
            setPhase('error');
          }
        },
        (error) => {
          // Speech recognition error (e.g., no match after retries)
          const isNoMatch = error.includes('7/') || error.includes('No match');
          setErrorMsg(
            isNoMatch
              ? t('entries.couldNotRecognize')
              : (error || t('entries.voiceStartFailed')),
          );
          setPhase('error');
        },
        i18n.language === 'ta' ? 'ta-IN' : 'en-IN',
      );
    } catch (err: any) {
      const msg = err?.message ?? '';
      if (isPremiumRequiredError(err)) {
        setErrorMsg(t('premium.lockedFeatureMsg'));
      } else if (msg === 'VOICE_MODULE_UNAVAILABLE') {
        setErrorMsg(t('entries.voiceStartFailed'));
      } else if (msg === 'MICROPHONE_PERMISSION_DENIED') {
        setErrorMsg(t('errors.permissionDenied'));
      } else if (msg === 'SPEECH_NOT_AVAILABLE') {
        setErrorMsg(t('errors.voiceUnavailable'));
      } else {
        setErrorMsg(msg || t('entries.voiceStartFailed'));
      }
      setPhase('error');
    }
  };

  const stopListening = async () => {
    await voiceEntryService.stopListening().catch(() => {});
    if (phase === 'listening') setPhase('form');
  };

  const handleConfirmSave = async () => {
    // Validate
    if (!personName.trim()) {
      Alert.alert(t('common.error'), t('entries.personNameRequired'));
      return;
    }
    const cash = Number(cashAmount) || 0;
    const gold = Number(goldWeight) || 0;
    if (cash === 0 && gold === 0) {
      Alert.alert(t('common.error'), t('entries.amountRequired'));
      return;
    }

    const resolvedEntryType: EntryType = forcedEntryType ?? 'OWN_EVENT';

    // IN entries must be mapped to an Own Event. If none was pre-selected,
    // hand off to the full Add Entry form (via onParsed) so the user can pick
    // the mandatory event there instead of failing the save.
    if (resolvedEntryType === 'OWN_EVENT' && !eventId && onParsed) {
      onParsed({
        entryType: resolvedEntryType,
        personName: personName.trim() || undefined,
        villageName: villageName.trim() || undefined,
        cashAmount: cash,
        goldWeight: gold,
        eventId: eventId ?? null,
        eventName: eventName ?? undefined,
        eventDate: entryDate || undefined,
        remarks: recognizedText ? `[Voice] ${recognizedText}` : undefined,
        recognizedText,
      });
      return;
    }

    setPhase('saving');
    try {
      const saved = await entryService.addEntry({
        entryType: resolvedEntryType,
        personName: personName.trim(),
        villageName: villageName.trim() || undefined,
        cashAmount: cash,
        goldWeight: gold,
        eventId: eventId ?? null,
        eventName: eventName ?? undefined,
        eventDate: entryDate || undefined,
        remarks: recognizedText ? `[Voice] ${recognizedText}` : undefined,
      });

      onSaved(saved);
      onClose();
    } catch (err: any) {
      const raw = err?.message ?? '';
      const msg = raw === 'EVENT_REQUIRED_FOR_IN_ENTRY'
        ? t('entries.eventRequired')
        : (raw || t('entries.saveFailed'));
      Alert.alert(t('common.error'), msg);
      setPhase('form');
    }
  };

  const handleRetry = () => {
    setPhase('idle');
    setRecognizedText('');
    setErrorMsg('');
  };

  const handleSkipToForm = () => {
    setPhase('form');
  };

  const micLabel =
    phase === 'idle'      ? t('entries.speakNow') :
    phase === 'listening' ? t('entries.listening') :
    phase === 'parsing'   ? t('entries.aiParsing') :
                            '';

  const micEmoji =
    phase === 'listening' ? 'square' :
    phase === 'parsing'   ? 'loader' :
    phase === 'error'     ? 'alert-circle' : 'mic';

  const directionLabel = forcedEntryType === 'OWN_EVENT'
    ? t('entries.inDirection')
    : forcedEntryType === 'OTHER_EVENT'
    ? t('entries.outDirection')
    : '';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Header */}
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>
                  <Feather name="mic" size={16} color={colors.textPrimary} /> {t('entries.voiceEntry')}
                </Text>
                {directionLabel ? (
                  <Text style={[styles.subtitle, { color: forcedEntryType === 'OWN_EVENT' ? colors.inColor : colors.outColor }]}>
                    {directionLabel}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.background }]}>
                <Feather name="x" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Mic button (shown when not in form phase) */}
            {(phase === 'idle' || phase === 'listening' || phase === 'parsing') && (
              <View style={styles.micArea}>
                <Animated.View style={[styles.micOuter, { backgroundColor: colors.primaryBg, transform: [{ scale: pulseAnim }] }]}>
                  <TouchableOpacity
                    style={[
                      styles.micInner,
                      { backgroundColor: colors.primary },
                      phase === 'listening' && styles.micListening,
                      phase === 'parsing' && styles.micParsing,
                    ]}
                    onPress={
                      phase === 'idle' || phase === 'error' ? startListening :
                      phase === 'listening' ? stopListening : undefined
                    }
                    disabled={phase === 'parsing'}
                    activeOpacity={0.8}
                  >
                    <Feather name={micEmoji as any} size={26} color="#FFFFFF" />
                  </TouchableOpacity>
                </Animated.View>
                <Text style={[styles.hint, { color: colors.textMuted }]}>{micLabel}</Text>

                {/* Skip to manual entry */}
                {phase === 'idle' && (
                  <TouchableOpacity onPress={handleSkipToForm} style={{ marginTop: 12 }}>
                    <Text style={[styles.skipText, { color: colors.primary }]}>{t('entries.skipToManual')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Recognised text */}
            {recognizedText && phase === 'form' ? (
              <View style={[styles.resultBox, { backgroundColor: colors.background }]}>
                <Text style={[styles.resultLabel, { color: colors.textMuted }]}>{t('entries.heardText')}</Text>
                <Text style={[styles.resultText, { color: colors.textPrimary }]} numberOfLines={2}>{recognizedText}</Text>
              </View>
            ) : null}

            {/* Error state */}
            {phase === 'error' && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMsg || t('entries.couldNotRecognize')}</Text>
                <View style={[styles.actions, { marginTop: 12 }]}>
                  <TouchableOpacity style={[styles.retryBtn, { borderColor: colors.border }]} onPress={handleRetry}>
                    <Text style={[styles.retryBtnText, { color: colors.textSecondary }]}>{t('entries.retryVoice')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: colors.primary }]} onPress={handleSkipToForm}>
                    <Text style={[styles.confirmBtnText, { color: colors.textInverse }]}>{t('entries.skipToManual')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Form fields (shown after voice parse or manual skip) */}
            {(phase === 'form' || phase === 'saving') && (
              <View style={styles.formSection}>
                {/* Person Name */}
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{t('entries.personName')} *</Text>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={personName}
                  onChangeText={setPersonName}
                  placeholder={t('entries.enterPersonName')}
                  placeholderTextColor={colors.textDisabled}
                />

                {/* Village Name */}
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{t('entries.villageName')}</Text>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background }]}
                  value={villageName}
                  onChangeText={setVillageName}
                  placeholder={t('entries.enterVillage')}
                  placeholderTextColor={colors.textDisabled}
                />

                {/* Cash Amount & Gold Weight side-by-side */}
                <View style={styles.rowFields}>
                  <View style={styles.halfField}>
                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{t('entries.cashAmount')}</Text>
                    <TextInput
                      style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background }]}
                      value={cashAmount}
                      onChangeText={setCashAmount}
                      placeholder="0"
                      placeholderTextColor={colors.textDisabled}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={styles.halfField}>
                    <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{t('entries.goldWeight')}</Text>
                    <TextInput
                      style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.background }]}
                      value={goldWeight}
                      onChangeText={setGoldWeight}
                      placeholder="0 g"
                      placeholderTextColor={colors.textDisabled}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                {/* Date */}
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{t('common.date')}</Text>
                <TouchableOpacity
                  style={[styles.input, styles.dateInput, { borderColor: colors.border, backgroundColor: colors.background }]}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Text style={[styles.dateText, { color: colors.textPrimary }]}>
                    📅 {entryDate || t('common.select')}
                  </Text>
                </TouchableOpacity>

                {showDatePicker && (
                  <DateTimePicker
                    value={entryDate ? new Date(entryDate) : new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    maximumDate={new Date()}
                    onValueChange={(_, date) => {
                      setShowDatePicker(false);
                      setEntryDate(date.toISOString().split('T')[0]);
                    }}
                    onDismiss={() => setShowDatePicker(false)}
                  />
                )}

                {/* Re-record button */}
                <TouchableOpacity
                  style={[styles.reRecordBtn, { borderColor: colors.border }]}
                  onPress={handleRetry}
                >
                  <View style={styles.reRecordContent}>
                    <Feather name="mic" size={14} color={colors.textSecondary} />
                    <Text style={[styles.reRecordText, { color: colors.textSecondary }]}>
                      {t('entries.again')}
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Confirm button */}
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: phase === 'saving' ? 0.6 : 1 }]}
                  onPress={handleConfirmSave}
                  disabled={phase === 'saving'}
                >
                  <Text style={[styles.saveBtnText, { color: colors.textInverse }]}>
                    {phase === 'saving' ? t('entries.saving') : t('common.confirm')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default VoiceEntryModal;

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    maxHeight: '92%',
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 20, paddingBottom: 36,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 20,
  },
  title:    { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontSize: 14 },

  micArea:  { alignItems: 'center', marginBottom: 20 },
  micOuter: {
    width: 90, height: 90, borderRadius: 45,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  micInner: {
    width: 70, height: 70, borderRadius: 35,
    alignItems: 'center', justifyContent: 'center',
  },
  micListening: { backgroundColor: '#e53935' },
  micParsing:   { backgroundColor: '#7b1fa2' },
  hint: { fontSize: 12, textAlign: 'center' },
  skipText: { fontSize: 12, fontWeight: '600' },

  resultBox: {
    borderRadius: 10, padding: 12, marginBottom: 14,
  },
  resultLabel: { fontSize: 10, fontWeight: '700', marginBottom: 3 },
  resultText:  { fontSize: 12, lineHeight: 20 },

  errorBox: {
    backgroundColor: '#fff3e0', borderRadius: 12, padding: 14, marginBottom: 10,
  },
  errorText: { fontSize: 12, color: '#e65100', textAlign: 'center', lineHeight: 20 },

  formSection: { marginTop: 4 },

  fieldLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.3,
    textTransform: 'uppercase', marginBottom: 6, marginTop: 12,
  },

  input: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 13, fontWeight: '500',
  },

  rowFields: {
    flexDirection: 'row', gap: 10,
  },

  halfField: {
    flex: 1,
  },

  dateInput: {
    justifyContent: 'center',
  },

  dateText: {
    fontSize: 13, fontWeight: '500',
  },

  reRecordBtn: {
    marginTop: 16, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, alignItems: 'center',
  },

  reRecordContent: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },

  reRecordText: {
    fontSize: 12, fontWeight: '600',
  },

  saveBtn: {
    marginTop: 12, paddingVertical: 14, borderRadius: 12,
    alignItems: 'center',
  },

  saveBtnText: {
    fontSize: 14, fontWeight: '700',
  },

  actions: { flexDirection: 'row', gap: 10 },
  retryBtn: {
    flex: 1, height: 44, borderRadius: 10, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  retryBtnText: { fontSize: 13, fontWeight: '600' },
  confirmBtn: {
    flex: 1, height: 44, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmBtnText: { fontSize: 13, fontWeight: '700' },
});
