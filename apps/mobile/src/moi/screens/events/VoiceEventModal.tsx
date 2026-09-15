import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Feather from '@react-native-vector-icons/feather';
import { useTheme } from '@common/context/ThemeContext';
import { voiceEventService } from '@common/voice/VoiceEventService';
import { ParsedVoiceEvent } from '@common/voice/TamilEventParser';
import { isPremiumRequiredError } from '@common/subscription/types';

interface VoiceEventModalProps {
  visible: boolean;
  onClose: () => void;
  onParsed: (result: ParsedVoiceEvent) => void;
}

type Phase = 'idle' | 'listening' | 'parsing' | 'done' | 'error';

const VoiceEventModal: React.FC<VoiceEventModalProps> = ({
  visible,
  onClose,
  onParsed,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const [phase, setPhase] = useState<Phase>('idle');
  const [recognizedText, setRecognizedText] = useState('');
  const [parsedResult, setParsedResult] = useState<ParsedVoiceEvent | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  // Reset state when modal opens; stop listening when it closes
  useEffect(() => {
    if (visible) {
      setPhase('idle');
      setRecognizedText('');
      setParsedResult(null);
      setErrorMsg('');
    } else {
      voiceEventService.stopListening().catch(() => {});
    }
  }, [visible]);

  // Pulse animation while mic is active
  useEffect(() => {
    if (phase === 'listening') {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
    }
    return () => {
      pulseLoop.current?.stop();
    };
  }, [phase, pulseAnim]);

  const startListening = async () => {
    setPhase('listening');
    setRecognizedText('');
    setParsedResult(null);
    setErrorMsg('');

    try {
      await voiceEventService.startListening(
        async (text) => {
          setRecognizedText(text);
          setPhase('parsing');

          try {
            const result = await voiceEventService.parse(text);
            setParsedResult(result);
            setPhase('done');
          } catch (err: any) {
            setErrorMsg(
              err?.message?.includes('API Error') || err?.message?.includes('fetch')
                ? t('voice.serverUnavailable')
                : (err?.message ?? t('voice.errorGeneric')),
            );
            setPhase('error');
          }
        },
        (error) => {
          // Speech recognition error (e.g., no match after retries)
          const isNoMatch = error.includes('7/') || error.includes('No match');
          setErrorMsg(
            isNoMatch
              ? t('voice.noMatch')
              : (error || t('voice.errorGeneric')),
          );
          setPhase('error');
        },
      );
    } catch (err: any) {
      setErrorMsg(
        isPremiumRequiredError(err)
          ? t('premium.lockedFeatureMsg')
          : t('errors.voiceUnavailable'),
      );
      setPhase('error');
    }
  };

  const stopListening = async () => {
    await voiceEventService.stopListening().catch(() => {});
    if (phase === 'listening') {
      setPhase('idle');
    }
  };

  const handleConfirm = () => {
    if (!parsedResult) return;
    onParsed(parsedResult);
    onClose();
  };

  const handleRetry = () => {
    setPhase('idle');
    setRecognizedText('');
    setParsedResult(null);
    setErrorMsg('');
  };

  const micLabel =
    phase === 'idle'      ? t('voice.tapToSpeak') :
    phase === 'listening' ? t('voice.listening') :
    phase === 'parsing'   ? t('voice.parsing') :
    phase === 'done'      ? t('voice.done') :
                            t('voice.retry');

  const micEmoji =
    phase === 'listening' ? 'square' :
    phase === 'parsing'   ? 'loader' :
    phase === 'done'      ? 'check' :
    phase === 'error'     ? 'alert-circle' : 'mic';

  const styles = createStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>{t('voice.title')}</Text>
              <Text style={styles.subtitle}>{t('voice.subtitle')}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Mic button */}
          <View style={styles.micArea}>
            <Animated.View style={[styles.micOuter, { transform: [{ scale: pulseAnim }] }]}>
              <TouchableOpacity
                style={[
                  styles.micInner,
                  phase === 'listening' && styles.micListening,
                  phase === 'parsing' && styles.micParsing,
                  phase === 'done' && styles.micDone,
                  phase === 'error' && styles.micError,
                ]}
                onPress={
                  phase === 'idle' || phase === 'error' ? startListening :
                  phase === 'listening' ? stopListening : undefined
                }
                disabled={phase === 'parsing' || phase === 'done'}
                activeOpacity={0.8}
              >
                <Feather name={micEmoji as any} size={26} color="#FFFFFF" />
              </TouchableOpacity>
            </Animated.View>
            <Text style={styles.hint}>{micLabel}</Text>
          </View>

          {/* Recognised text */}
          {recognizedText ? (
            <View style={styles.resultBox}>
              <View style={styles.resultLabelRow}>
                <Feather name="mic" size={12} color={colors.textMuted} />
                <Text style={styles.resultLabel}>{t('voice.listening')}</Text>
              </View>
              <Text style={styles.resultText}>{recognizedText}</Text>
            </View>
          ) : null}

          {/* Parsed event fields */}
          {parsedResult && phase === 'done' ? (
            <View style={styles.parsedBox}>
              <Text style={styles.parsedLabel}>✦ {t('voice.done')}</Text>

              {parsedResult.eventName ? (
                <View style={styles.parsedRow}>
                  <Text style={styles.parsedKey}>{t('events.eventName')}</Text>
                  <Text style={styles.parsedVal}>{parsedResult.eventName}</Text>
                </View>
              ) : null}

              {parsedResult.eventType ? (
                <View style={styles.parsedRow}>
                  <Text style={styles.parsedKey}>{t('events.eventType')}</Text>
                  <Text style={styles.parsedVal}>{parsedResult.eventType}</Text>
                </View>
              ) : null}

              {parsedResult.date ? (
                <View style={styles.parsedRow}>
                  <Text style={styles.parsedKey}>{t('events.date')}</Text>
                  <Text style={styles.parsedVal}>{parsedResult.date}</Text>
                </View>
              ) : null}

              {parsedResult.time ? (
                <View style={styles.parsedRow}>
                  <Text style={styles.parsedKey}>{t('events.time')}</Text>
                  <Text style={styles.parsedVal}>{parsedResult.time}</Text>
                </View>
              ) : null}

              {parsedResult.venue ? (
                <View style={styles.parsedRow}>
                  <Text style={styles.parsedKey}>{t('events.venue')}</Text>
                  <Text style={styles.parsedVal}>{parsedResult.venue}</Text>
                </View>
              ) : null}

              {parsedResult.villageName ? (
                <View style={styles.parsedRow}>
                  <Text style={styles.parsedKey}>{t('events.village')}</Text>
                  <Text style={styles.parsedVal}>{parsedResult.villageName}</Text>
                </View>
              ) : null}

              <View style={styles.confidenceRow}>
                <Text style={styles.confidenceLabel}>{t('voice.confidence', { value: '' })}</Text>
                <Text style={styles.confidenceVal}>
                  {Math.round(parsedResult.confidence * 100)}%
                </Text>
              </View>
            </View>
          ) : null}

          {/* Error */}
          {phase === 'error' ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>
                {errorMsg || t('voice.errorGeneric')}
              </Text>
            </View>
          ) : null}

          {/* Actions */}
          <View style={styles.actions}>
            {phase === 'done' ? (
              <>
                <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
                  <Text style={styles.retryBtnText}>{t('voice.retry')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
                  <Text style={styles.confirmBtnText}>{t('voice.fillForm')}</Text>
                </TouchableOpacity>
              </>
            ) : phase === 'error' ? (
              <TouchableOpacity style={styles.confirmBtn} onPress={handleRetry}>
                <Text style={styles.confirmBtnText}>{t('voice.retry')}</Text>
              </TouchableOpacity>
            ) : phase === 'listening' ? (
              <TouchableOpacity style={styles.retryBtn} onPress={stopListening}>
                <Text style={styles.retryBtnText}>{t('voice.cancel')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default VoiceEventModal;

// ---------------------------------------------------------------------------
// Styles (theme-aware)
// ---------------------------------------------------------------------------

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: colors.overlay,
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 24,
      paddingTop: 20,
      paddingBottom: 36,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 24,
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    subtitle: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 3,
    },
    closeBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeBtnText: {
      fontSize: 14,
      color: colors.textMuted,
    },
    micArea: {
      alignItems: 'center',
      marginBottom: 20,
    },
    micOuter: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: colors.primaryBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    micInner: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    micListening: { backgroundColor: '#e53935' },
    micParsing: { backgroundColor: '#7b1fa2' },
    micDone: { backgroundColor: '#43a047' },
    micError: { backgroundColor: '#fb8c00' },
    micEmoji: { fontSize: 28 },
    hint: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
    },
    resultBox: {
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
    },
    resultLabelRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
      marginBottom: 4,
    },
    resultLabel: {
      fontSize: 11,
      fontWeight: '700' as const,
      color: colors.textMuted,
    },
    resultText: {
      fontSize: 14,
      color: colors.textPrimary,
      lineHeight: 22,
    },
    parsedBox: {
      backgroundColor: colors.primaryBg,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
    },
    parsedLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
      marginBottom: 10,
      letterSpacing: 0.5,
    },
    parsedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    parsedKey: {
      fontSize: 12,
      color: colors.textMuted,
      width: 64,
    },
    parsedVal: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textPrimary,
      flex: 1,
    },
    confidenceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.borderLight,
    },
    confidenceLabel: {
      fontSize: 11,
      color: colors.textMuted,
      flex: 1,
    },
    confidenceVal: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
    },
    errorBox: {
      backgroundColor: colors.pendingBg,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
    },
    errorText: {
      fontSize: 12,
      color: colors.warning,
      textAlign: 'center',
      lineHeight: 20,
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 8,
    },
    retryBtn: {
      flex: 1,
      height: 48,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    retryBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    confirmBtn: {
      flex: 2,
      height: 48,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    confirmBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textInverse,
    },
  });
}
