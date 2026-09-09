import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import Feather from '@react-native-vector-icons/feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, ThemeColors } from '../../context/ThemeContext';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { entryService, pendingService } from '../../services';
import type { Entry } from '../../models/Entry';
import type { Settlement } from '../../models/Pending';
import { formatCash, formatGold, formatDate } from '../../utils/format';
import { EmptyState } from '../../components/EmptyState';

/**
 * Complete contribution history for one person across all events, plus the
 * settlement ledger. Reuses entryService.getEntriesByPerson (existing) and
 * pendingService.getSettlementHistory. Reached from the Reports "Pending" tab.
 */
const PersonHistoryScreen: React.FC<{ navigation?: any; route?: any }> = ({ navigation, route }) => {
  const { colors } = useTheme();
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const personId: string = route?.params?.personId ?? '';
  const personName: string = route?.params?.personName ?? '';

  const [entries, setEntries] = useState<Entry[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, s] = await Promise.all([
        entryService.getEntriesByPerson(personId),
        pendingService.getSettlementHistory(personId),
      ]);
      setEntries(e);
      setSettlements(s);
    } catch {
      setEntries([]);
      setSettlements([]);
    } finally {
      setLoading(false);
    }
  }, [personId]);

  useEffect(() => {
    load();
  }, [load]);

  // Aggregate IN/OUT totals for the header summary.
  const summary = useMemo(() => {
    let cashIn = 0, cashOut = 0, goldIn = 0, goldOut = 0;
    for (const en of entries) {
      if (en.entryType === 'OWN_EVENT') {
        cashIn += en.cashAmount;
        goldIn += en.goldWeight;
      } else {
        cashOut += en.cashAmount;
        goldOut += en.goldWeight;
      }
    }
    return {
      cashIn,
      cashOut,
      goldIn,
      goldOut,
      cashToReceive: Math.max(cashOut - cashIn, 0),
      cashToGive: Math.max(cashIn - cashOut, 0),
    };
  }, [entries]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation?.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {personName || t('reports.pending.personHistory')}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {t('reports.pending.personHistory')}
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Summary */}
          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <View style={styles.summaryGrid}>
              <SummaryCell label={t('reports.cashReceived')} value={formatCash(summary.cashIn)} color={colors.inColor} colors={colors} />
              <SummaryCell label={t('reports.cashGiven')} value={formatCash(summary.cashOut)} color={colors.outColor} colors={colors} />
              <SummaryCell label={t('reports.goldReceived')} value={formatGold(summary.goldIn)} color={colors.gold} colors={colors} />
              <SummaryCell label={t('reports.goldGiven')} value={formatGold(summary.goldOut)} color={colors.outColor} colors={colors} />
            </View>
          </View>

          {/* Settlement history */}
          {settlements.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                {t('reports.pending.settlementHistory')}
              </Text>
              {settlements.map(s => (
                <View
                  key={s.id}
                  style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>
                      {s.direction === 'RECEIVABLE'
                        ? t('reports.pending.received')
                        : t('reports.pending.paid')}
                    </Text>
                    <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                      {formatDate(s.settledAt)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    {s.settledCash > 0 && (
                      <Text style={[styles.rowAmount, { color: colors.primary }]}>{formatCash(s.settledCash)}</Text>
                    )}
                    {s.settledGold > 0 && (
                      <Text style={[styles.rowAmount, { color: colors.gold }]}>{formatGold(s.settledGold)}</Text>
                    )}
                  </View>
                </View>
              ))}
            </>
          )}

          {/* Contribution history */}
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            {t('reports.pending.contributions')}
          </Text>
          {entries.length === 0 ? (
            <EmptyState title={t('reports.noData')} icon={'\uD83D\uDCDD'} />
          ) : (
            entries.map(en => (
              <View
                key={en.id}
                style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {en.eventName || (en.entryType === 'OWN_EVENT' ? t('common.received') : t('common.given'))}
                  </Text>
                  <Text style={[styles.rowSub, { color: colors.textMuted }]}>
                    {formatDate(en.eventDate || en.createdAt)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {en.cashAmount > 0 && (
                    <Text
                      style={[
                        styles.rowAmount,
                        { color: en.entryType === 'OWN_EVENT' ? colors.inColor : colors.outColor },
                      ]}
                    >
                      {en.entryType === 'OWN_EVENT' ? '+' : '-'}{formatCash(en.cashAmount)}
                    </Text>
                  )}
                  {en.goldWeight > 0 && (
                    <Text style={[styles.rowAmount, { color: colors.gold }]}>
                      {en.entryType === 'OWN_EVENT' ? '+' : '-'}{formatGold(en.goldWeight)}
                    </Text>
                  )}
                </View>
              </View>
            ))
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </View>
  );
};

const SummaryCell: React.FC<{ label: string; value: string; color: string; colors: ThemeColors }> = ({
  label,
  value,
  color,
  colors,
}) => (
  <View style={{ width: '48%', marginBottom: 10 }}>
    <Text style={{ fontSize: 11, color: colors.textMuted }}>{label}</Text>
    <Text style={{ fontSize: 15, fontWeight: '800', color, marginTop: 2 }}>{value}</Text>
  </View>
);

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 18, fontWeight: '800' },
    subtitle: { fontSize: 12, marginTop: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content: { paddingHorizontal: 16, paddingTop: 4 },
    summaryCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 8 },
    summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    sectionTitle: { fontSize: 14, fontWeight: '800', marginTop: 18, marginBottom: 8 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 12,
      borderWidth: 1,
      padding: 12,
      marginBottom: 8,
    },
    rowTitle: { fontSize: 14, fontWeight: '700' },
    rowSub: { fontSize: 12, marginTop: 2 },
    rowAmount: { fontSize: 14, fontWeight: '800' },
  });

export default PersonHistoryScreen;
