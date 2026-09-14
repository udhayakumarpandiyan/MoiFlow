import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Feather from '@react-native-vector-icons/feather';

import { useTheme, ThemeColors } from '../../context/ThemeContext';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { loanService, creditService, businessService } from '../../services';
import { LoanTotals } from '../../finance/models/Loan';
import { CreditTotals } from '../../finance/models/Credit';
import { BusinessSummary } from '../../finance/models/Business';
import { formatCash } from '../../utils/format';

type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

const FinanceDashboardScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const { colors } = useTheme();
  const { t } = useAppTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [loanTotals, setLoanTotals] = useState<LoanTotals | null>(null);
  const [creditTotals, setCreditTotals] = useState<CreditTotals | null>(null);
  const [business, setBusiness] = useState<BusinessSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [loans, credits, biz] = await Promise.all([
        loanService.getTotals(),
        creditService.getTotals(),
        businessService.getBusinessSummary(),
      ]);
      setLoanTotals(loans);
      setCreditTotals(credits);
      setBusiness(biz);
    } catch {
      setLoanTotals(null);
      setCreditTotals(null);
      setBusiness(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const goLoans = () => navigation?.navigate('LoansStack', { screen: 'Loans' });
  const goCredits = () => navigation?.navigate('CreditsStack', { screen: 'Credits' });
  const goBusiness = () => navigation?.navigate('BusinessStack');

  const hasData =
    (loanTotals?.loanCount ?? 0) > 0 ||
    (creditTotals?.count ?? 0) > 0 ||
    ((business?.totalSales ?? 0) + (business?.totalPurchases ?? 0)) > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            colors={[colors.primary]}
          />
        }
      >
        <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>{t('finance.dashboard')}</Text>
        <Text style={[styles.pageSubtitle, { color: colors.textMuted }]}>{t('finance.dashboardSubtitle')}</Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : (
          <>
            {/* Loans */}
            <SectionHeader
              title={t('finance.loans')}
              actionLabel={t('finance.viewAll')}
              onAction={goLoans}
              colors={colors}
              styles={styles}
            />
            <View style={styles.cardRow}>
              <StatCard
                icon="trending-down"
                iconBg={colors.outBg}
                iconColor={colors.outColor}
                label={t('finance.totalOutstanding')}
                value={formatCash(loanTotals?.totalOutstanding ?? 0)}
                valueColor={colors.outColor}
                meta={`${loanTotals?.activeCount ?? 0} ${t('finance.activeLoans').toLowerCase()}`}
                onPress={goLoans}
                colors={colors}
                styles={styles}
              />
              <StatCard
                icon="calendar"
                iconBg={colors.primaryBg}
                iconColor={colors.primary}
                label={t('finance.monthlyEMI')}
                value={formatCash(loanTotals?.totalMonthlyEMI ?? 0)}
                valueColor={colors.primary}
                meta={`${loanTotals?.loanCount ?? 0} ${t('finance.loans').toLowerCase()}`}
                onPress={goLoans}
                colors={colors}
                styles={styles}
              />
            </View>

            {/* Credits */}
            <SectionHeader
              title={t('finance.credits')}
              actionLabel={t('finance.viewAll')}
              onAction={goCredits}
              colors={colors}
              styles={styles}
            />
            <View style={styles.cardRow}>
              <StatCard
                icon="arrow-down-left"
                iconBg={colors.inBg}
                iconColor={colors.inColor}
                label={t('finance.toReceive')}
                value={formatCash(creditTotals?.toReceive ?? 0)}
                valueColor={colors.inColor}
                meta={t('finance.creditStatus.UPCOMING').toLowerCase()}
                onPress={goCredits}
                colors={colors}
                styles={styles}
              />
              <StatCard
                icon="arrow-up-right"
                iconBg={colors.outBg}
                iconColor={colors.outColor}
                label={t('finance.toGive')}
                value={formatCash(creditTotals?.toGive ?? 0)}
                valueColor={colors.outColor}
                meta={t('finance.creditStatus.UPCOMING').toLowerCase()}
                onPress={goCredits}
                colors={colors}
                styles={styles}
              />
            </View>
            {creditTotals && creditTotals.count > 0 ? (
              <TouchableOpacity
                style={[styles.netBar, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
                activeOpacity={0.85}
                onPress={goCredits}
              >
                <Text style={[styles.netLabel, { color: colors.textMuted }]}>{t('finance.netPending')}</Text>
                <Text
                  style={[
                    styles.netValue,
                    { color: (creditTotals.netPending ?? 0) >= 0 ? colors.inColor : colors.outColor },
                  ]}
                >
                  {formatCash(creditTotals.netPending)}
                </Text>
              </TouchableOpacity>
            ) : null}

            {/* Business */}
            <SectionHeader
              title={t('finance.business')}
              actionLabel={t('finance.viewAll')}
              onAction={goBusiness}
              colors={colors}
              styles={styles}
            />
            <View style={styles.cardRow}>
              <StatCard
                icon="arrow-down-left"
                iconBg={colors.inBg}
                iconColor={colors.inColor}
                label={t('finance.customerReceivables')}
                value={formatCash(business?.customerReceivables ?? 0)}
                valueColor={colors.inColor}
                meta={`${t('finance.totalSales')}: ${formatCash(business?.totalSales ?? 0)}`}
                onPress={goBusiness}
                colors={colors}
                styles={styles}
              />
              <StatCard
                icon="arrow-up-right"
                iconBg={colors.outBg}
                iconColor={colors.outColor}
                label={t('finance.supplierPayables')}
                value={formatCash(business?.supplierPayables ?? 0)}
                valueColor={colors.outColor}
                meta={`${t('finance.totalPurchases')}: ${formatCash(business?.totalPurchases ?? 0)}`}
                onPress={goBusiness}
                colors={colors}
                styles={styles}
              />
            </View>

            {!hasData ? (
              <Text style={[styles.emptyHint, { color: colors.textMuted }]}>
                {t('finance.noFinanceDataDesc')}
              </Text>
            ) : null}

            {/* Quick access */}
            <Text style={[styles.quickTitle, { color: colors.textPrimary }]}>{t('finance.quickAccess')}</Text>
            <QuickRow icon="dollar-sign" label={t('finance.loans')} onPress={goLoans} colors={colors} />
            <QuickRow icon="credit-card" label={t('finance.credits')} onPress={goCredits} colors={colors} />
            <QuickRow icon="briefcase" label={t('finance.business')} onPress={goBusiness} colors={colors} />
          </>
        )}

        <View style={styles.bottomSpace} />
      </ScrollView>
    </View>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const SectionHeader: React.FC<{
  title: string;
  actionLabel: string;
  onAction: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}> = ({ title, actionLabel, onAction, colors, styles }) => (
  <View style={styles.sectionHeader}>
    <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
    <TouchableOpacity onPress={onAction} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <Text style={[styles.sectionAction, { color: colors.primary }]}>{actionLabel}</Text>
    </TouchableOpacity>
  </View>
);

const StatCard: React.FC<{
  icon: FeatherIconName;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  valueColor: string;
  meta: string;
  onPress: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}> = ({ icon, iconBg, iconColor, label, value, valueColor, meta, onPress, colors, styles }) => (
  <TouchableOpacity
    style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
    activeOpacity={0.85}
    onPress={onPress}
  >
    <View style={[styles.iconCircle, { backgroundColor: iconBg }]}>
      <Feather name={icon} size={18} color={iconColor} />
    </View>
    <Text style={[styles.statLabel, { color: colors.textMuted }]} numberOfLines={1}>{label}</Text>
    <Text style={[styles.statValue, { color: valueColor }]} numberOfLines={1}>{value}</Text>
    <Text style={[styles.statMeta, { color: colors.textMuted }]} numberOfLines={1}>{meta}</Text>
  </TouchableOpacity>
);

const QuickRow: React.FC<{
  icon: FeatherIconName;
  label: string;
  onPress: () => void;
  colors: ThemeColors;
}> = ({ icon, label, onPress, colors }) => (
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: 14, fontWeight: '700' },
});

const createStyles = (_colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: 16, paddingTop: 8 },
    pageTitle: { fontSize: 20, fontWeight: '800' },
    pageSubtitle: { fontSize: 13, marginTop: 2, marginBottom: 8 },
    loader: { marginTop: 48 },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 18,
      marginBottom: 10,
    },
    sectionTitle: { fontSize: 14, fontWeight: '800' },
    sectionAction: { fontSize: 12, fontWeight: '700' },
    cardRow: { flexDirection: 'row', gap: 12 },
    statCard: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 16 },
    iconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    statLabel: { fontSize: 12, fontWeight: '600' },
    statValue: { fontSize: 20, fontWeight: '800', marginTop: 3 },
    statMeta: { fontSize: 11, marginTop: 3 },
    netBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginTop: 10,
    },
    netLabel: { fontSize: 13, fontWeight: '600' },
    netValue: { fontSize: 16, fontWeight: '800' },
    emptyHint: { fontSize: 13, textAlign: 'center', marginTop: 16, lineHeight: 20 },
    quickTitle: { fontSize: 14, fontWeight: '800', marginTop: 22, marginBottom: 10 },
    bottomSpace: { height: 120 },
  });

export default FinanceDashboardScreen;
