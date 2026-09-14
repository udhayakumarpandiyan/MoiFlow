import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Feather from '@react-native-vector-icons/feather';

import { useTheme, ThemeColors } from '../../context/ThemeContext';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { loanService } from '../../services';
import { LoanSummary, LoanTotals, LoanType, LOAN_TYPES } from '../../finance/models/Loan';
import { formatCash, formatDate } from '../../utils/format';
import { EmptyState } from '../../components/EmptyState';

const LoansScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const { colors } = useTheme();
  const { t } = useAppTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [summaries, setSummaries] = useState<LoanSummary[]>([]);
  const [totals, setTotals] = useState<LoanTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const list = await loanService.getLoanSummaries();
      setSummaries(list);
      setTotals(loanService.computeTotals(list));
    } catch {
      setSummaries([]);
      setTotals(null);
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

  // Group loans by type; only keep types that have loans (hides empty sections).
  const grouped = useMemo(() => {
    const map = new Map<LoanType, LoanSummary[]>();
    for (const s of summaries) {
      const list = map.get(s.loan.loanType) ?? [];
      list.push(s);
      map.set(s.loan.loanType, list);
    }
    return LOAN_TYPES.filter(type => map.has(type)).map(type => ({
      type,
      items: map.get(type)!,
    }));
  }, [summaries]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[colors.primary]} />
        }
      >
        {/* Totals card */}
        {totals && totals.loanCount > 0 && (
          <View style={[styles.totalsCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <Text style={[styles.totalsLabel, { color: colors.textMuted }]}>{t('finance.totalOutstanding')}</Text>
            <Text style={[styles.totalsValue, { color: colors.outColor }]}>{formatCash(totals.totalOutstanding)}</Text>
            <View style={styles.totalsBreak}>
              <Text style={[styles.totalsBreakText, { color: colors.textSecondary }]}>
                {t('finance.monthlyEMI')}: {formatCash(totals.totalMonthlyEMI)}
              </Text>
              <Text style={[styles.totalsBreakText, { color: colors.textSecondary }]}>
                {t('finance.activeLoans')}: {totals.activeCount}
              </Text>
              {totals.closedCount > 0 ? (
                <Text style={[styles.totalsBreakText, { color: colors.textSecondary }]}>
                  {t('finance.closedLoans')}: {totals.closedCount}
                </Text>
              ) : null}
            </View>
          </View>
        )}

        {/* List */}
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : summaries.length === 0 ? (
          <EmptyState
            title={t('finance.noLoans')}
            subtitle={t('finance.noLoansDesc')}
            icon={'\uD83C\uDFE6'}
            actionLabel={t('finance.addLoan')}
            onAction={() => navigation?.navigate('AddEditLoan')}
          />
        ) : (
          grouped.map(group => (
            <View key={group.type} style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                  {t(`finance.loanType.${group.type}`)}
                </Text>
                <Text style={[styles.sectionCount, { color: colors.textMuted }]}>{group.items.length}</Text>
              </View>

              {group.items.map(s => (
                <TouchableOpacity
                  key={s.loan.id}
                  style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
                  activeOpacity={0.8}
                  onPress={() => navigation?.navigate('LoanDetail', { loanId: s.loan.id })}
                >
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.provider, { color: colors.textPrimary }]} numberOfLines={1}>
                        {s.loan.provider}
                      </Text>
                      <Text style={[styles.subtle, { color: colors.textMuted }]} numberOfLines={1}>
                        {formatCash(s.loan.loanAmount)} · {s.loan.paidEMIs}/{s.loan.totalEMIs} {t('finance.emisShort')}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: `${statusColor(s.loan.status, colors)}22` },
                      ]}
                    >
                      <Text style={[styles.statusText, { color: statusColor(s.loan.status, colors) }]}>
                        {t(`finance.loanStatus.${s.loan.status}`)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardRow}>
                    <View>
                      <Text style={[styles.cardLabel, { color: colors.textMuted }]}>
                        {t('finance.outstanding')}
                      </Text>
                      <Text style={[styles.cardValue, { color: colors.outColor }]}>
                        {formatCash(s.outstandingAmount)}
                      </Text>
                    </View>
                    <View style={styles.cardMeta}>
                      <Text style={[styles.metaText, { color: colors.textMuted }]}>
                        {t('finance.emi')}: {formatCash(s.loan.monthlyEMI)}
                      </Text>
                      <Text style={[styles.metaText, { color: colors.textMuted }]}>
                        {s.nextEmiDate
                          ? `${t('finance.nextEmi')}: ${formatDate(s.nextEmiDate)}`
                          : t('finance.loanStatus.CLOSED')}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ))
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Add loan FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        activeOpacity={0.85}
        onPress={() => navigation?.navigate('AddEditLoan')}
      >
        <Feather name="plus" size={26} color={colors.textInverse} />
      </TouchableOpacity>
    </View>
  );
};

const statusColor = (s: string, colors: ThemeColors) =>
  s === 'CLOSED' ? colors.success : colors.pendingColor;

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: 16, paddingTop: 8 },
    totalsCard: { borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 14 },
    totalsLabel: { fontSize: 12, fontWeight: '600' },
    totalsValue: { fontSize: 26, fontWeight: '800', marginTop: 4 },
    totalsBreak: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 },
    totalsBreakText: { fontSize: 12, fontWeight: '500' },
    section: { marginBottom: 8 },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 6,
      marginBottom: 8,
    },
    sectionTitle: { fontSize: 14, fontWeight: '800' },
    sectionCount: { fontSize: 12, fontWeight: '600' },
    card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    provider: { fontSize: 15, fontWeight: '700' },
    subtle: { fontSize: 12, marginTop: 1 },
    statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
    statusText: { fontSize: 10, fontWeight: '800' },
    cardRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      marginTop: 12,
    },
    cardLabel: { fontSize: 10, fontWeight: '600' },
    cardValue: { fontSize: 18, fontWeight: '800', marginTop: 2 },
    cardMeta: { alignItems: 'flex-end', gap: 2 },
    metaText: { fontSize: 11, fontWeight: '500' },
    fab: {
      position: 'absolute',
      bottom: 110,
      right: 20,
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 6,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
    },
  });

export default LoansScreen;
