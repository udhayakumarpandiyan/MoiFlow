import React from 'react';
import { View, StyleSheet } from 'react-native';
import Feather from '@react-native-vector-icons/feather';
import { useTheme } from '../../context/ThemeContext';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { EmptyState } from '../../components/EmptyState';

/**
 * Placeholder for Finance sub-modules not yet built (Credits, Business,
 * Finance Reports). Reuses the shared EmptyState + theme.
 */
export function makeComingSoonScreen(icon: React.ComponentProps<typeof Feather>['name']) {
  const Screen: React.FC = () => {
    const { colors } = useTheme();
    const { t } = useAppTranslation();
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Feather name={icon} size={48} color={colors.textDisabled} style={styles.icon} />
        <EmptyState title={t('finance.comingSoon')} subtitle={t('finance.comingSoonDesc')} icon={'\uD83D\uDEE0\uFE0F'} />
      </View>
    );
  };
  return Screen;
}

const CreditsScreen = makeComingSoonScreen('credit-card');
export const BusinessScreen = makeComingSoonScreen('briefcase');
export const FinanceReportsScreen = makeComingSoonScreen('bar-chart-2');

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  icon: { marginBottom: 4 },
});

export default CreditsScreen;
