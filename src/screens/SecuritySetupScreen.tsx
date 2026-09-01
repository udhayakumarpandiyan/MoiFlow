import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { SafeAreaView } from 'react-native-safe-area-context';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  navigation: {
    replace: (screen: string) => void;
    navigate: (screen: string, params?: any) => void;
  };
}

// ---------------------------------------------------------------------------
// SecuritySetupScreen — MPIN only (V1)
// ---------------------------------------------------------------------------

const SecuritySetupScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const handleSetupMPIN = () => {
    navigation.navigate('PinSetup', {
      pinLength: 4,
      onSuccess: () => navigation.replace('Onboarding'),
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#FFFFFF' }]}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.shieldIcon, { backgroundColor: colors.primaryBg }]}>
            <Text style={styles.shieldEmoji}>🛡️</Text>
          </View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {t('auth.security.title')}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {t('auth.security.subtitle')}
          </Text>
        </View>

        {/* MPIN Setup Card */}
        <View style={styles.options}>
          <TouchableOpacity
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
            onPress={handleSetupMPIN}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('auth.security.setupMPIN')}
          >
            <View style={[styles.iconContainer, { backgroundColor: colors.primaryBg }]}>
              <Text style={styles.iconText}>🔐</Text>
            </View>
            <View style={styles.cardContent}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                {t('auth.security.setupMPIN')}
              </Text>
              <Text style={[styles.cardDescription, { color: colors.textMuted }]}>
                {t('auth.security.mpinDescription')}
              </Text>
            </View>
            <Text style={[styles.chevron, { color: colors.textDisabled }]}>›</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default SecuritySetupScreen;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  shieldIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  shieldEmoji: {
    fontSize: 32,
  },
  title: {
    fontSize: 21,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  options: {
    gap: 14,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    minHeight: 80,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 19,
  },
  cardContent: {
    flex: 1,
    marginLeft: 14,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 3,
  },
  cardDescription: {
    fontSize: 12,
    lineHeight: 18,
  },
  chevron: {
    fontSize: 24,
    fontWeight: '300',
    marginLeft: 8,
  },
});
