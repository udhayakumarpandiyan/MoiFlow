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
import {
  LoanSummary,
  LoanTotals,
  LoanDirection,
} from '../../finance/models/Loan';
import { formatCash, formatDate } from '../../utils/format';
import { SegmentedControl } from '../../components/SegmentedControl';
import { EmptyState } from '../../components/EmptyState';

const LoansScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const { colors } = useTheme();
  const { t } = useAppTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [direction, setDirection] = useState<LoanDirection>('LENT');
  const [summaries, setSummaries] = useState<LoanSummary[]>([]);
  const [totals, setTotals] = useState<LoanTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const list = await loanService.getLoanSummaries({ direction });
        setSummaries(list);
        setTotals(loanService.computeTotals(direction, list));
      } catch {
        setSummaries([]);
        setTotals(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [direction],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const DIRECTION_TABS = useMemo(
    () => [
      { key: 'LENT', label: t('finance.lent') },
      { key: 'BORROWED', label: t('finance.borrowed') },
    ],
    [t],
  );

  const statusColor = (s: string) =>
    s === 'SETTLED'
      ? colors.success
      : s === 'BAD_DEBT'
      ? colors.error
      : s === 'EXPECTED'
      ? colors.info
      : colors.pendingColor;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[colors.primary]} />
        }
      >
        <SegmentedControl
          segments={DIRECTION_TABS}
          selected={direction}
          onSelect={v => setDirection(v as LoanDirection)}
          style={{ marginBottom: 14 }}
        />

        {/* Totals card */}
        {totals && (
          <View style={[styles.totalsCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <Text style={[styles.totalsLabel, { color: colors.textMuted }]}>
              {direction === 'LENT' ? t('finance.toReceive') : t('finance.toSettle')}
            </Text>
            <Text
              style={[
                styles.totalsValue,
                { color: direction === 'LENT' ? colors.inColor : colors.outColor },
              ]}
            >
              {formatCash(totals.totalOutstanding)}
            </Text>
            <View style={styles.totalsBreak}>
              <Text style={[styles.totalsBreakText, { color: colors.textSecondary }]}>
                {t('finance.remainingPrincipal')}: {formatCash(totals.totalPrincipal)}
              </Text>
              <Text style={[styles.totalsBreakText, { color: colors.textSecondary }]}>
                {t('finance.remainingInterest')}: {formatCash(totals.totalInterest)}
              </Text>
            </View>
          </View>
        )}

        {/* List */}
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : summaries.length === 0 ? (
          <EmptyState title={t('finance.noLoans')} subtitle={t('finance.noLoansDesc')} icon={'\uD83D\uDCB3'} />
        ) : (
          summaries.map(s => (
            <TouchableOpacity
              key={s.loan.id}
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
              activeOpacity={0.8}
              onPress={() => navigation?.navigate('LoanDetail', { loanId: s.loan.id })}
            >
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.partyName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {s.loan.partyName}
                  </Text>
                  <Text style={[styles.subtle, { color: colors.textMuted }]} numberOfLines={1}>
                    {t(`finance.loanType.${s.loan.loanType}`)}
                    {s.loan.partyVillage ? ` · ${s.loan.partyVillage}` : ''}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: `${statusColor(s.loan.status)}22` }]}>
                  <Text style={[styles.statusText, { color: statusColor(s.loan.status) }]}>
                    {t(`finance.status.${s.loan.status}`)}
                  </Text>
                </View>
              </View>

              <View style={styles.cardRow}>
                <View>
                  <Text style={[styles.cardLabel, { color: colors.textMuted }]}>
                    {t('finance.totalOutstanding')}
                  </Text>
                  <Text
                    style={[
                      styles.cardValue,
                      { color: direction === 'LENT' ? colors.inColor : colors.outColor },
                    ]}
                  >
                    {formatCash(s.totalOutstanding)}
                  </Text>
                </View>
                <View style={styles.cardMeta}>
                  <Text style={[styles.metaText, { color: colors.textMuted }]}>
                    {t('finance.principal')}: {formatCash(s.loan.principal)}
                  </Text>
                  <Text style={[styles.metaText, { color: colors.textMuted }]}>
                    {formatDate(s.loan.loanDate)}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Add loan FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        activeOpacity={0.85}
        onPress={() => navigation?.navigate('AddEditLoan', { direction })}
      >
        <Feather name="plus" size={26} color={colors.textInverse} />
      </TouchableOpacity>
    </View>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: 16, paddingTop: 8 },
    totalsCard: { borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 14 },
    totalsLabel: { fontSize: 12, fontWeight: '600' },
    totalsValue: { fontSize: 26, fontWeight: '800', marginTop: 4 },
    totalsBreak: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 },
    totalsBreakText: { fontSize: 12, fontWeight: '500' },
    card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    partyName: { fontSize: 15, fontWeight: '700' },
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
