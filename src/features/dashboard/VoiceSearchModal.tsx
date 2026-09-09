import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  ScrollView,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Feather from '@react-native-vector-icons/feather';
import { useTheme } from '../../context/ThemeContext';
import { voiceSearchService } from '../../services';
import { VoiceSearchService } from '../../voice/VoiceSearchService';
import { VoiceSearchResult } from '../../voice/VoiceSearchService';
import { isPremiumRequiredError } from '../../subscription/types';

interface VoiceSearchModalProps {
  visible: boolean;
  onClose: () => void;
}

type Phase = 'idle' | 'listening' | 'processing' | 'result' | 'error';

const VoiceSearchModal: React.FC<VoiceSearchModalProps> = ({ visible, onClose }) => {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();

  const [phase, setPhase] = useState<Phase>('idle');
  const [recognizedText, setRecognizedText] = useState('');
  const [result, setResult] = useState<VoiceSearchResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (visible) {
      setPhase('idle');
      setRecognizedText('');
      setResult(null);
      setErrorMsg('');
    } else {
      voiceSearchService.stopListening().catch(() => {});
    }
  }, [visible]);

  // Pulse animation while listening
  useEffect(() => {
    if (phase === 'listening') {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
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
  }, [phase]);

  const getLocale = (): string => {
    const lang = i18n.language;
    if (lang === 'ta') return 'ta-IN';
    return 'en-IN';
  };

  const getLang = (): 'en' | 'ta' => {
    return i18n.language === 'ta' ? 'ta' : 'en';
  };

  const startListening = async () => {
    setPhase('listening');
    setRecognizedText('');
    setResult(null);
    setErrorMsg('');

    if (!VoiceSearchService.isAvailable()) {
      setErrorMsg(t('voiceSearch.voiceUnavailable'));
      setPhase('error');
      return;
    }

    try {
      await voiceSearchService.startListening(
        getLocale(),
        async (text) => {
          setRecognizedText(text);
          setPhase('processing');

          try {
            const searchResult = await voiceSearchService.processQuery(text, getLang());
            setResult(searchResult);
            setPhase('result');
          } catch (err: any) {
            setErrorMsg(err?.message ?? t('voiceSearch.processingFailed'));
            setPhase('error');
          }
        },
        (error) => {
          setErrorMsg(error || t('voiceSearch.voiceError'));
          setPhase('error');
        },
      );
    } catch (err: any) {
      const msg = err?.message ?? '';
      if (isPremiumRequiredError(err)) {
        setErrorMsg(t('premium.lockedFeatureMsg'));
      } else if (msg === 'VOICE_MODULE_UNAVAILABLE') {
        setErrorMsg(t('voiceSearch.voiceUnavailable'));
      } else if (msg === 'MICROPHONE_PERMISSION_DENIED') {
        setErrorMsg(t('errors.permissionDenied'));
      } else if (msg === 'SPEECH_NOT_AVAILABLE') {
        setErrorMsg(t('errors.voiceUnavailable'));
      } else {
        setErrorMsg(msg || t('voiceSearch.voiceError'));
      }
      setPhase('error');
    }
  };

  const stopListening = async () => {
    await voiceSearchService.stopListening().catch(() => {});
    if (phase === 'listening' && !recognizedText) {
      setPhase('idle');
    }
  };

  const handleRetry = () => {
    setPhase('idle');
    setRecognizedText('');
    setResult(null);
    setErrorMsg('');
  };

  const renderMicButton = () => {
    const isListening = phase === 'listening';
    const isProcessing = phase === 'processing';

    return (
      <View style={styles.micContainer}>
        <Animated.View
          style={[
            styles.micPulseRing,
            {
              backgroundColor: isListening ? colors.primaryBg : colors.transparent,
              transform: [{ scale: pulseAnim }],
              opacity: isListening ? 0.6 : 0,
            },
          ]}
        />
        <TouchableOpacity
          style={[
            styles.micButton,
            {
              backgroundColor: isListening ? colors.error : colors.primary,
            },
          ]}
          onPress={isListening ? stopListening : startListening}
          disabled={isProcessing}
          activeOpacity={0.7}
          accessible
          accessibilityLabel={isListening ? t('voiceSearch.stopListening') : t('voiceSearch.startListening')}
          accessibilityRole="button"
        >
          {isProcessing ? (
            <Feather name="loader" size={26} color="#FFFFFF" />
          ) : isListening ? (
            <Feather name="square" size={22} color="#FFFFFF" />
          ) : (
            <Feather name="mic" size={26} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const renderIdleState = () => (
    <View style={styles.centerContent}>
      {renderMicButton()}
      <Text style={[styles.phaseLabel, { color: colors.textPrimary }]}>
        {t('voiceSearch.tapToAsk')}
      </Text>
      <Text style={[styles.hintText, { color: colors.textMuted }]}>
        {t('voiceSearch.supportedLanguages')}
      </Text>
      <View style={styles.examplesContainer}>
        <Text style={[styles.exampleTitle, { color: colors.textSecondary }]}>
          {t('voiceSearch.examples')}
        </Text>
        <Text style={[styles.exampleText, { color: colors.textMuted }]}>
          {`• "${t('voiceSearch.exampleCashReceive')}"`}
        </Text>
        <Text style={[styles.exampleText, { color: colors.textMuted }]}>
          {`• "${t('voiceSearch.examplePersonBalance')}"`}
        </Text>
        <Text style={[styles.exampleText, { color: colors.textMuted }]}>
          {`• "${t('voiceSearch.exampleEventContrib')}"`}
        </Text>
      </View>
    </View>
  );

  const renderListeningState = () => (
    <View style={styles.centerContent}>
      {renderMicButton()}
      <Text style={[styles.phaseLabel, { color: colors.primary }]}>
        {t('voiceSearch.listening')}
      </Text>
      <Text style={[styles.hintText, { color: colors.textMuted }]}>
        {t('voiceSearch.speakYourQuestion')}
      </Text>
    </View>
  );

  const renderProcessingState = () => (
    <View style={styles.centerContent}>
      {renderMicButton()}
      <Text style={[styles.phaseLabel, { color: colors.pendingColor }]}>
        {t('voiceSearch.processing')}
      </Text>
      {recognizedText ? (
        <View style={[styles.recognizedCard, { backgroundColor: colors.primaryBg, borderColor: colors.borderLight }]}>
          <Text style={[styles.recognizedLabel, { color: colors.textMuted }]}>
            {t('voiceSearch.heard')}
          </Text>
          <Text style={[styles.recognizedText, { color: colors.textPrimary }]}>
            "{recognizedText}"
          </Text>
        </View>
      ) : null}
    </View>
  );

  const renderResultState = () => (
    <ScrollView
      style={styles.resultScroll}
      contentContainerStyle={styles.resultContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Query card */}
      {recognizedText ? (
        <View style={[styles.queryCard, { backgroundColor: colors.primaryBg, borderColor: colors.borderLight }]}>
          <View style={styles.queryLabelRow}>
            <Feather name="mic" size={12} color={colors.textMuted} />
            <Text style={[styles.queryLabel, { color: colors.textMuted }]}>
              {t('voiceSearch.yourQuestion')}
            </Text>
          </View>
          <Text style={[styles.queryText, { color: colors.textPrimary }]}>
            "{recognizedText}"
          </Text>
        </View>
      ) : null}

      {/* Answer card */}
      <View style={[styles.answerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.answerHeader}>
          <Text style={styles.answerIcon}>✦</Text>
          <Text style={[styles.answerLabel, { color: colors.primary }]}>
            {t('voiceSearch.answer')}
          </Text>
        </View>
        <Text style={[styles.answerText, { color: colors.textPrimary }]}>
          {result?.answer}
        </Text>
      </View>

      {/* Actions */}
      <View style={styles.resultActions}>
        <TouchableOpacity
          style={[styles.askAgainBtn, { backgroundColor: colors.primary }]}
          onPress={handleRetry}
          accessible
          accessibilityLabel={t('voiceSearch.askAnother')}
          accessibilityRole="button"
        >
          <View style={styles.askAgainContent}>
            <Feather name="mic" size={16} color="#FFFFFF" />
            <Text style={[styles.askAgainText, { color: colors.textInverse }]}>
              {t('voiceSearch.askAnother')}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderErrorState = () => (
    <View style={styles.centerContent}>
      <View style={[styles.errorIconContainer, { backgroundColor: colors.outBg }]}>
        <Text style={styles.errorEmoji}>!</Text>
      </View>
      <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>
        {t('voiceSearch.errorTitle')}
      </Text>
      <Text style={[styles.errorText, { color: colors.textMuted }]}>
        {errorMsg}
      </Text>
      <TouchableOpacity
        style={[styles.retryButton, { backgroundColor: colors.primary }]}
        onPress={handleRetry}
        accessible
        accessibilityLabel={t('voiceSearch.tryAgain')}
        accessibilityRole="button"
      >
        <Text style={[styles.retryText, { color: colors.textInverse }]}>
          {t('voiceSearch.tryAgain')}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderContent = () => {
    switch (phase) {
      case 'idle':
        return renderIdleState();
      case 'listening':
        return renderListeningState();
      case 'processing':
        return renderProcessingState();
      case 'result':
        return renderResultState();
      case 'error':
        return renderErrorState();
      default:
        return renderIdleState();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <View style={styles.dragHandle} />
            <View style={styles.headerRow}>
              <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
                {t('voiceSearch.title')}
              </Text>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessible
                accessibilityLabel={t('common.close')}
                accessibilityRole="button"
              >
                <Text style={[styles.closeBtn, { color: colors.textMuted }]}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.sheetSubtitle, { color: colors.textMuted }]}>
              {t('voiceSearch.subtitle')}
            </Text>
          </View>

          {/* Content */}
          <View style={styles.sheetBody}>
            {renderContent()}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: '65%',
    maxHeight: '85%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  sheetHeader: {
    alignItems: 'center',
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    marginBottom: 16,
  },
  headerRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  closeBtn: {
    fontSize: 17,
    padding: 4,
  },
  sheetSubtitle: {
    fontSize: 12,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  sheetBody: {
    flex: 1,
    paddingHorizontal: 20,
  },

  // Center content (idle, listening, processing, error)
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },

  // Mic button
  micContainer: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  micPulseRing: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  micButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },

  // Phase labels
  phaseLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  hintText: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 20,
  },

  // Examples
  examplesContainer: {
    width: '100%',
    paddingHorizontal: 8,
    marginTop: 8,
  },
  exampleTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  exampleText: {
    fontSize: 12,
    lineHeight: 20,
    marginBottom: 4,
  },

  // Recognized text card
  recognizedCard: {
    width: '100%',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
  },
  recognizedLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  recognizedText: {
    fontSize: 13,
    fontStyle: 'italic',
  },

  // Result state
  resultScroll: {
    flex: 1,
  },
  resultContent: {
    paddingVertical: 12,
  },
  queryCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  queryLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  queryLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  queryText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  answerCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  answerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  answerIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  answerLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  answerText: {
    fontSize: 14,
    lineHeight: 24,
  },

  // Actions
  resultActions: {
    alignItems: 'center',
  },
  askAgainBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  askAgainContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  askAgainText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Error state
  errorIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  errorEmoji: {
    fontSize: 21,
    fontWeight: '700',
    color: '#DC2626',
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

export default VoiceSearchModal;
