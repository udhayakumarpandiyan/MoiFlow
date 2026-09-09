import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Feather from '@react-native-vector-icons/feather';

import { useTheme, ThemeColors } from '../../context/ThemeContext';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { loanService } from '../../services';
import { LoanTotals } from '../../finance/models/Loan';
import { formatCash } from '../../utils/format';

const FinanceDashboardScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const { colors } = useTheme();
  const { t } = useAppTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [lent, setLent] = useState<LoanTotals | null>(null);
  const [borrowed, setBorrowed] = useState<LoanTotals | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [l, b] = await Promise.all([
        loanService.getTotals('LENT'),
        loanService.getTotals('BORROWED'),
      ]);
      setLent(l);
      setBorrowed(b);
    } catch {
      setLent(null);
      setBorrowed(null);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const goLoans = () =>
    navigation?.navigate('LoansStack', { screen: 'Loans' });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            colors={[colors.primary]}
          />
        }
      >
        <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>{t('finance.dashboard')}</Text>
        <Text style={[styles.pageSubtitle, { color: colors.textMuted }]}>{t('finance.dashboardSubtitle')}</Text>

        {/* Loan totals */}
        <View style={styles.totalsRow}>
          <TouchableOpacity
            style={[styles.totalCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
            activeOpacity={0.85}
            onPress={goLoans}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.inBg }]}>
              <Feather name="arrow-down-left" size={18} color={colors.inColor} />
            </View>
            <Text style={[styles.totalLabel, { color: colors.textMuted }]}>{t('finance.toReceive')}</Text>
            <Text style={[styles.totalValue, { color: colors.inColor }]}>
              {formatCash(lent?.totalOutstanding ?? 0)}
            </Text>
            <Text style={[styles.totalMeta, { color: colors.textMuted }]}>
              {lent?.loanCount ?? 0} {t('finance.loans').toLowerCase()}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.totalCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
            activeOpacity={0.85}
            onPress={goLoans}
          >
            <View style={[styles.iconCircle, { backgroundColor: colors.outBg }]}>
              <Feather name="arrow-up-right" size={18} color={colors.outColor} />
            </View>
            <Text style={[styles.totalLabel, { color: colors.textMuted }]}>{t('finance.toSettle')}</Text>
            <Text style={[styles.totalValue, { color: colors.outColor }]}>
              {formatCash(borrowed?.totalOutstanding ?? 0)}
            </Text>
            <Text style={[styles.totalMeta, { color: colors.textMuted }]}>
              {borrowed?.loanCount ?? 0} {t('finance.loans').toLowerCase()}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Quick actions */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('finance.loans')}</Text>
        <QuickRow
          icon="dollar-sign"
          label={t('finance.loans')}
          onPress={goLoans}
          colors={colors}
        />
        <QuickRow
          icon="credit-card"
          label={t('nav.credits')}
          onPress={() => navigation?.navigate('CreditsStack')}
          colors={colors}
        />
        <QuickRow
          icon="briefcase"
          label={t('nav.business')}
          onPress={() => navigation?.navigate('BusinessStack')}
          colors={colors}
        />

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
};

const QuickRow: React.FC<{ icon: any; label: string; onPress: () => void; colors: ThemeColors }> = ({ icon, label, onPress, colors }) => (
  <TouchableOpacity
    style={[quickStyles.row, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
    activeOpacity={0.8}
    onPress={onPress}
  >
    <View style={[quickStyles.iconWrap, { backgroundColor: colors.primaryBg }]}>
      <Feather name={icon} size={18} color={colors.primary} />
    </View>
    <Text style={[quickStyles.label, { color: colors.textPrimary }]}>{label}</Text>
    <Feather name="chevron-right" size={18} color={colors.textMuted} />
  </TouchableOpacity>
);

const quickStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: 14, fontWeight: '700' },
});

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: 16, paddingTop: 8 },
    pageTitle: { fontSize: 20, fontWeight: '800' },
    pageSubtitle: { fontSize: 13, marginTop: 2, marginBottom: 16 },
    totalsRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
    totalCard: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 16 },
    iconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    totalLabel: { fontSize: 12, fontWeight: '600' },
    totalValue: { fontSize: 20, fontWeight: '800', marginTop: 3 },
    totalMeta: { fontSize: 11, marginTop: 3 },
    sectionTitle: { fontSize: 14, fontWeight: '800', marginTop: 18, marginBottom: 10 },
  });

export default FinanceDashboardScreen;
