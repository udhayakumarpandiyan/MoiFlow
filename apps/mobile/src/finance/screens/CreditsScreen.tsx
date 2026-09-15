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

import { useTheme, ThemeColors } from '@common/context/ThemeContext';
import { useAppTranslation } from '@common/hooks/useAppTranslation';
import { creditService } from '@common/services';
import {
  Credit,
  CreditTotals,
  CreditFilterKey,
  CREDIT_FILTER_KEYS,
} from '@finance/models/Credit';
import { formatCash, formatDate } from '@common/utils/format';
import { EmptyState } from '@common/components/EmptyState';

const CreditsScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const { colors } = useTheme();
  const { t } = useAppTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [credits, setCredits] = useState<Credit[]>([]);
  const [totals, setTotals] = useState<CreditTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<CreditFilterKey>('ALL');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const list = await creditService.getCredits();
      setCredits(list);
      setTotals(creditService.computeTotals(list));
    } catch {
      setCredits([]);
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

  // Apply the active filter.
  const filtered = useMemo(() => {
    switch (filter) {
      case 'IN':
        return credits.filter(c => c.direction === 'IN');
      case 'OUT':
        return credits.filter(c => c.direction === 'OUT');
      case 'UPCOMING':
        return credits.filter(c => c.status === 'UPCOMING');
      case 'SETTLED':
        return credits.filter(c => c.status === 'SETTLED');
      default:
        return credits;
    }
  }, [credits, filter]);

  // Upcoming: nearest date first. Settled: most recent settled/txn date first.
  const upcoming = useMemo(
    () =>
      filtered
        .filter(c => c.status === 'UPCOMING')
        .sort((a, b) => +new Date(a.date) - +new Date(b.date)),
    [filtered],
  );

  const settled = useMemo(
    () =>
      filtered
        .filter(c => c.status === 'SETTLED')
        .sort(
          (a, b) =>
            +new Date(b.settledDate ?? b.date) -
            +new Date(a.settledDate ?? a.date),
        ),
    [filtered],
  );

  const isEmpty = credits.length === 0;

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
        {/* Summary */}
        {totals && totals.count > 0 && (
          <View style={styles.summaryRow}>
            <SummaryCard
              label={t('finance.toReceive')}
              value={formatCash(totals.toReceive)}
              color={colors.inColor}
              colors={colors}
            />
            <SummaryCard
              label={t('finance.toGive')}
              value={formatCash(totals.toGive)}
              color={colors.outColor}
              colors={colors}
            />
          </View>
        )}
        {totals && totals.count > 0 && (
          <View style={styles.summaryRow}>
            <SummaryCard
              label={t('finance.settled')}
              value={formatCash(totals.settled)}
              color={colors.textSecondary}
              colors={colors}
            />
            <SummaryCard
              label={t('finance.netPending')}
              value={formatCash(totals.netPending)}
              color={totals.netPending >= 0 ? colors.inColor : colors.outColor}
              colors={colors}
            />
          </View>
        )}

        {/* Filters */}
        {!isEmpty && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {CREDIT_FILTER_KEYS.map(key => (
              <FilterChip
                key={key}
                label={t(`finance.filter.${key}`)}
                active={filter === key}
                onPress={() => setFilter(key)}
                colors={colors}
              />
            ))}
          </ScrollView>
        )}

        {/* List */}
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : isEmpty ? (
          <EmptyState
            title={t('finance.noCredits')}
            subtitle={t('finance.noCreditsDesc')}
            icon={'\uD83D\uDCB0'}
            actionLabel={t('finance.addCredit')}
            onAction={() => navigation?.navigate('AddEditCredit')}
          />
        ) : (
          <>
            {/* Upcoming */}
            {(filter === 'ALL' ||
              filter === 'IN' ||
              filter === 'OUT' ||
              filter === 'UPCOMING') && (
              <Section
                title={t('finance.upcoming')}
                count={upcoming.length}
                colors={colors}
                styles={styles}
              >
                {upcoming.length === 0 ? (
                  <Text style={[styles.emptySection, { color: colors.textMuted }]}>
                    {t('finance.noUpcoming')}
                  </Text>
                ) : (
                  upcoming.map(c => (
                    <CreditCard
                      key={c.id}
                      credit={c}
                      colors={colors}
                      styles={styles}
                      t={t}
                      onPress={() =>
                        navigation?.navigate('CreditDetail', { creditId: c.id })
                      }
                    />
                  ))
                )}
              </Section>
            )}

            {/* Settled */}
            {(filter === 'ALL' ||
              filter === 'IN' ||
              filter === 'OUT' ||
              filter === 'SETTLED') && (
              <Section
                title={t('finance.settledSection')}
                count={settled.length}
                colors={colors}
                styles={styles}
              >
                {settled.length === 0 ? (
                  <Text style={[styles.emptySection, { color: colors.textMuted }]}>
                    {t('finance.noSettled')}
                  </Text>
                ) : (
                  settled.map(c => (
                    <CreditCard
                      key={c.id}
                      credit={c}
                      colors={colors}
                      styles={styles}
                      t={t}
                      onPress={() =>
                        navigation?.navigate('CreditDetail', { creditId: c.id })
                      }
                    />
                  ))
                )}
              </Section>
            )}
          </>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Add credit FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        activeOpacity={0.85}
        onPress={() => navigation?.navigate('AddEditCredit')}
      >
        <Feather name="plus" size={26} color={colors.textInverse} />
      </TouchableOpacity>
    </View>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const SummaryCard: React.FC<{
  label: string;
  value: string;
  color: string;
  colors: ThemeColors;
}> = ({ label, value, color, colors }) => (
  <View
    style={[
      summaryStyles.card,
      { backgroundColor: colors.surface, borderColor: colors.borderLight },
    ]}
  >
    <Text style={[summaryStyles.label, { color: colors.textMuted }]} numberOfLines={1}>
      {label}
    </Text>
    <Text style={[summaryStyles.value, { color }]} numberOfLines={1}>
      {value}
    </Text>
  </View>
);

const Section: React.FC<{
  title: string;
  count: number;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  children: React.ReactNode;
}> = ({ title, count, colors, styles, children }) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.sectionCount, { color: colors.textMuted }]}>{count}</Text>
    </View>
    {children}
  </View>
);

const CreditCard: React.FC<{
  credit: Credit;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  t: (k: string) => string;
  onPress: () => void;
}> = ({ credit, colors, styles, t, onPress }) => {
  const isIn = credit.direction === 'IN';
  const dirColor = isIn ? colors.inColor : colors.outColor;
  const isSettled = credit.status === 'SETTLED';
  const statusColor = isSettled ? colors.success : colors.pendingColor;

  const metaBits = [
    credit.person,
    credit.village ? credit.village : null,
  ].filter(Boolean);

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <View style={styles.cardHeader}>
        <View style={styles.dirRow}>
          <View style={[styles.dot, { backgroundColor: dirColor }]} />
          <Text style={[styles.dirText, { color: dirColor }]}>
            {isIn ? t('finance.directionIn') : t('finance.directionOut')}
          </Text>
        </View>
        <Text style={[styles.amount, { color: dirColor }]}>{formatCash(credit.amount)}</Text>
      </View>

      {credit.interestRate > 0 ? (
        <Text style={[styles.interest, { color: colors.textSecondary }]}>
          {t('finance.interest')}: {credit.interestRate}%
        </Text>
      ) : null}

      <Text style={[styles.person, { color: colors.textPrimary }]} numberOfLines={1}>
        {metaBits.join(' · ')}
      </Text>

      <View style={styles.cardFooter}>
        <Text style={[styles.metaText, { color: colors.textMuted }]} numberOfLines={1}>
          {formatDate(credit.date)}
          {credit.mobileNumber ? ` · ${credit.mobileNumber}` : ''}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: `${statusColor}22` }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {isSettled
              ? `\u2713 ${t('finance.creditStatus.SETTLED')}`
              : t('finance.creditStatus.UPCOMING')}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const FilterChip: React.FC<{
  label: string;
  active: boolean;
  onPress: () => void;
  colors: ThemeColors;
}> = ({ label, active, onPress, colors }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.8}
    style={[
      filterStyles.chip,
      {
        backgroundColor: active ? colors.primary : colors.surface,
        borderColor: active ? colors.primary : colors.border,
      },
    ]}
  >
    <Text
      style={{
        fontSize: 12.5,
        fontWeight: active ? '700' : '600',
        color: active ? colors.textInverse : colors.textMuted,
      }}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

const summaryStyles = StyleSheet.create({
  card: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 14 },
  label: { fontSize: 11, fontWeight: '600' },
  value: { fontSize: 18, fontWeight: '800', marginTop: 4 },
});

const filterStyles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
});

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: 16, paddingTop: 10 },
    summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
    filterRow: { paddingVertical: 4, marginBottom: 6 },
    section: { marginBottom: 8 },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 6,
      marginBottom: 8,
    },
    sectionTitle: { fontSize: 15, fontWeight: '800' },
    sectionCount: { fontSize: 12, fontWeight: '600' },
    emptySection: { fontSize: 13, paddingVertical: 12, textAlign: 'center' },
    card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    dirRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    dirText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
    amount: { fontSize: 18, fontWeight: '800' },
    interest: { fontSize: 12, fontWeight: '600', marginTop: 6 },
    person: { fontSize: 14, fontWeight: '700', marginTop: 6 },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
    },
    metaText: { fontSize: 12, fontWeight: '500', flex: 1, marginRight: 8 },
    statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    statusText: { fontSize: 10, fontWeight: '800' },
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

export default CreditsScreen;
