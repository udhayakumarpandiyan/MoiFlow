import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Feather from '@react-native-vector-icons/feather';

import { useTheme, ThemeColors } from '../../context/ThemeContext';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { creditService, loanService, businessService } from '../../services';
import { Credit } from '../../finance/models/Credit';
import { Loan } from '../../finance/models/Loan';
import { Transaction } from '../../finance/models/Business';
import { formatCash, formatDate } from '../../utils/format';
import { SegmentedControl } from '../../components/SegmentedControl';
import { EmptyState } from '../../components/EmptyState';
import { BarChart } from '../../components/BarChart';
import {
  ReportPeriod,
  rangeForPeriod,
  buildCreditReport,
  buildLoanReport,
  buildBusinessReport,
  buildOverallReport,
  buildAiSummary,
  buildSuggestions,
  CreditReport,
  LoanReport,
  BusinessReport,
  OverallReport,
  SummaryLine,
  Suggestion,
  PeriodChange,
} from '../../finance/financeReportCalculations';

type SectionTab = 'CREDITS' | 'LOANS' | 'BUSINESS' | 'OVERALL';

const PERIODS: ReportPeriod[] = ['WEEKLY', 'MONTHLY', 'YEARLY', 'CUSTOM'];

const FinanceReportsScreen: React.FC<{ navigation?: any }> = () => {
  const { colors } = useTheme();
  const { t } = useAppTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [tab, setTab] = useState<SectionTab>('OVERALL');
  const [period, setPeriod] = useState<ReportPeriod>('MONTHLY');

  const [fromDate, setFromDate] = useState<Date>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d;
  });
  const [toDate, setToDate] = useState<Date>(new Date());
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const [credits, setCredits] = useState<Credit[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [sales, setSales] = useState<Transaction[]>([]);
  const [purchases, setPurchases] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [c, l, s, p] = await Promise.all([
        creditService.getCredits(),
        loanService.getLoans(),
        businessService.getTransactions({ kind: 'SALE' }),
        businessService.getTransactions({ kind: 'PURCHASE' }),
      ]);
      setCredits(c);
      setLoans(l);
      setSales(s);
      setPurchases(p);
    } catch {
      setCredits([]);
      setLoans([]);
      setSales([]);
      setPurchases([]);
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

  const range = useMemo(
    () => rangeForPeriod(period, new Date(), { from: fromDate, to: toDate }),
    [period, fromDate, toDate],
  );

  const creditReport: CreditReport = useMemo(
    () => buildCreditReport(credits, period, range),
    [credits, period, range],
  );
  const loanReport: LoanReport = useMemo(
    () => buildLoanReport(loans, period, range),
    [loans, period, range],
  );
  const businessReport: BusinessReport = useMemo(
    () => buildBusinessReport(sales, purchases, period, range),
    [sales, purchases, period, range],
  );
  const overallReport: OverallReport = useMemo(
    () => buildOverallReport(credits, loans, sales, purchases, range),
    [credits, loans, sales, purchases, range],
  );

  const summaryInput = useMemo(
    () => ({ overall: overallReport, credit: creditReport, loan: loanReport, business: businessReport }),
    [overallReport, creditReport, loanReport, businessReport],
  );
  const aiLines: SummaryLine[] = useMemo(() => buildAiSummary(summaryInput), [summaryInput]);
  const suggestions: Suggestion[] = useMemo(() => buildSuggestions(summaryInput), [summaryInput]);

  const tabs = useMemo(
    () => [
      { key: 'OVERALL', label: t('finance.reportOverall') },
      { key: 'CREDITS', label: t('finance.credits') },
      { key: 'LOANS', label: t('finance.loans') },
      { key: 'BUSINESS', label: t('finance.business') },
    ],
    [t],
  );

  const hasAnyData =
    credits.length > 0 || loans.length > 0 || sales.length > 0 || purchases.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[colors.primary]} />
        }
      >
        <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>{t('finance.reports')}</Text>
        <Text style={[styles.pageSubtitle, { color: colors.textMuted }]}>{t('finance.reportsSubtitle')}</Text>

        {/* Period selector */}
        <View style={styles.periodRow}>
          {PERIODS.map(p => (
            <PeriodChip
              key={p}
              label={t(`finance.period.${p}`)}
              active={period === p}
              onPress={() => setPeriod(p)}
              colors={colors}
              styles={styles}
            />
          ))}
        </View>

        {/* Custom date range */}
        {period === 'CUSTOM' && (
          <View style={[styles.dateRangeRow, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <TouchableOpacity style={[styles.dateBtn, { borderColor: colors.border }]} onPress={() => setShowFromPicker(true)}>
              <Text style={[styles.dateLabel, { color: colors.textMuted }]}>{t('reports.from')}</Text>
              <Text style={[styles.dateValue, { color: colors.textPrimary }]}>{formatDate(fromDate.toISOString())}</Text>
            </TouchableOpacity>
            <Text style={[styles.dateSep, { color: colors.textMuted }]}>{'\u2192'}</Text>
            <TouchableOpacity style={[styles.dateBtn, { borderColor: colors.border }]} onPress={() => setShowToPicker(true)}>
              <Text style={[styles.dateLabel, { color: colors.textMuted }]}>{t('reports.to')}</Text>
              <Text style={[styles.dateValue, { color: colors.textPrimary }]}>{formatDate(toDate.toISOString())}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Section tabs */}
        <SegmentedControl segments={tabs} selected={tab} onSelect={v => setTab(v as SectionTab)} style={styles.tabs} />

        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : !hasAnyData ? (
          <EmptyState
            title={t('finance.noReportData')}
            subtitle={t('finance.noReportDataDesc')}
            icon={'\uD83D\uDCCA'}
          />
        ) : (
          <>
            {tab === 'OVERALL' && (
              <OverallSection report={overallReport} colors={colors} styles={styles} t={t} />
            )}
            {tab === 'CREDITS' && (
              <CreditsSection report={creditReport} period={period} colors={colors} styles={styles} t={t} />
            )}
            {tab === 'LOANS' && (
              <LoansSection report={loanReport} period={period} colors={colors} styles={styles} t={t} />
            )}
            {tab === 'BUSINESS' && (
              <BusinessSection report={businessReport} period={period} colors={colors} styles={styles} t={t} />
            )}

            {/* AI Summary */}
            <SectionTitle title={t('finance.aiSummary')} colors={colors} styles={styles} />
            <View style={[styles.aiCard, { backgroundColor: colors.primaryBg, borderColor: colors.borderLight }]}>
              <View style={styles.aiHeader}>
                <Feather name="cpu" size={16} color={colors.primary} />
                <Text style={[styles.aiHeaderText, { color: colors.primary }]}>{t('finance.aiSummary')}</Text>
              </View>
              {aiLines.map((line, i) => (
                <Text key={i} style={[styles.aiText, { color: colors.textPrimary }]}>
                  {t(`finance.ai.${line.key}`, formatValues(line.values))}
                </Text>
              ))}
              <Text style={[styles.aiNote, { color: colors.textMuted }]}>{t('finance.aiNote')}</Text>
            </View>

            {/* Suggestions */}
            <SectionTitle title={t('finance.suggestions')} colors={colors} styles={styles} />
            {suggestions.map((s, i) => (
              <View key={i} style={[styles.suggestionCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                <View style={[styles.suggestionIcon, { backgroundColor: colors.primaryBg }]}>
                  <Feather name="check-circle" size={15} color={colors.primary} />
                </View>
                <Text style={[styles.suggestionText, { color: colors.textPrimary }]}>
                  {t(`finance.suggestion.${s.key}`)}
                </Text>
              </View>
            ))}
          </>
        )}

        <View style={styles.bottomSpace} />
      </ScrollView>

      {showFromPicker && (
        <DateTimePicker
          value={fromDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={toDate}
          onChange={(_, d) => {
            setShowFromPicker(Platform.OS === 'ios');
            if (d) setFromDate(d);
          }}
        />
      )}
      {showToPicker && (
        <DateTimePicker
          value={toDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={fromDate}
          maximumDate={new Date()}
          onChange={(_, d) => {
            setShowToPicker(Platform.OS === 'ios');
            if (d) setToDate(d);
          }}
        />
      )}
    </View>
  );
};

// ── Sections ──────────────────────────────────────────────────────────────────

const CreditsSection: React.FC<{
  report: CreditReport;
  period: ReportPeriod;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  t: (k: string, o?: any) => string;
}> = ({ report, colors, styles, t }) => {
  const empty = report.count === 0;
  return (
    <>
      <View style={styles.metricGrid}>
        <Metric label={t('finance.totalIn')} value={formatCash(report.totalIn)} color={colors.inColor} colors={colors} styles={styles} />
        <Metric label={t('finance.totalOut')} value={formatCash(report.totalOut)} color={colors.outColor} colors={colors} styles={styles} />
        <Metric label={t('finance.toReceive')} value={formatCash(report.toReceive)} color={colors.inColor} colors={colors} styles={styles} />
        <Metric label={t('finance.toGive')} value={formatCash(report.toGive)} color={colors.outColor} colors={colors} styles={styles} />
        <Metric label={t('finance.settled')} value={formatCash(report.settled)} color={colors.success} colors={colors} styles={styles} />
      </View>
      <SectionTitle title={t('finance.creditTrend')} colors={colors} styles={styles} />
      <ChartCard empty={empty} colors={colors} styles={styles} t={t}>
        <BarChart
          labels={report.trend.map(p => p.label)}
          series={[{ data: report.trend.map(p => p.value), color: colors.primary, label: t('finance.creditTrend') }]}
        />
      </ChartCard>
    </>
  );
};

const LoansSection: React.FC<{
  report: LoanReport;
  period: ReportPeriod;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  t: (k: string, o?: any) => string;
}> = ({ report, colors, styles, t }) => {
  const empty = report.totalLoans === 0;
  return (
    <>
      <View style={styles.metricGrid}>
        <Metric label={t('finance.totalLoans')} value={String(report.totalLoans)} color={colors.primary} colors={colors} styles={styles} />
        <Metric label={t('finance.activeLoans')} value={String(report.activeLoans)} color={colors.pendingColor} colors={colors} styles={styles} />
        <Metric label={t('finance.closedLoans')} value={String(report.closedLoans)} color={colors.success} colors={colors} styles={styles} />
        <Metric label={t('finance.totalLoanAmount')} value={formatCash(report.totalLoanAmount)} color={colors.textPrimary} colors={colors} styles={styles} />
        <Metric label={t('finance.outstanding')} value={formatCash(report.outstandingAmount)} color={colors.outColor} colors={colors} styles={styles} />
        <Metric label={t('finance.totalEMILabel')} value={formatCash(report.totalEMI)} color={colors.primary} colors={colors} styles={styles} />
      </View>
      <SectionTitle title={t('finance.loanTrend')} colors={colors} styles={styles} />
      <ChartCard empty={empty} colors={colors} styles={styles} t={t}>
        <BarChart
          labels={report.trend.map(p => p.label)}
          series={[{ data: report.trend.map(p => p.value), color: colors.primary, label: t('finance.loanTrend') }]}
        />
      </ChartCard>
    </>
  );
};

const BusinessSection: React.FC<{
  report: BusinessReport;
  period: ReportPeriod;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  t: (k: string, o?: any) => string;
}> = ({ report, colors, styles, t }) => {
  const empty = report.totalSales === 0 && report.totalPurchases === 0;
  return (
    <>
      <View style={styles.metricGrid}>
        <Metric label={t('finance.totalSales')} value={formatCash(report.totalSales)} color={colors.inColor} colors={colors} styles={styles} />
        <Metric label={t('finance.totalPurchases')} value={formatCash(report.totalPurchases)} color={colors.outColor} colors={colors} styles={styles} />
        <Metric label={t('finance.customerReceivables')} value={formatCash(report.customerReceivables)} color={colors.inColor} colors={colors} styles={styles} />
        <Metric label={t('finance.supplierPayables')} value={formatCash(report.supplierPayables)} color={colors.outColor} colors={colors} styles={styles} />
      </View>
      <SectionTitle title={t('finance.salesPurchaseTrend')} colors={colors} styles={styles} />
      <ChartCard empty={empty} colors={colors} styles={styles} t={t}>
        <BarChart
          labels={report.salesTrend.map(p => p.label)}
          series={[
            { data: report.salesTrend.map(p => p.value), color: colors.inColor, label: t('finance.totalSales') },
            { data: report.purchaseTrend.map(p => p.value), color: colors.outColor, label: t('finance.totalPurchases') },
          ]}
        />
      </ChartCard>
    </>
  );
};

const OverallSection: React.FC<{
  report: OverallReport;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  t: (k: string, o?: any) => string;
}> = ({ report, colors, styles, t }) => {
  const up = report.netDelta >= 0;
  const trendColor = up ? colors.inColor : colors.outColor;
  return (
    <>
      {/* Net position hero */}
      <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
        <Text style={[styles.heroLabel, { color: colors.textMuted }]}>{t('finance.netPosition')}</Text>
        <Text style={[styles.heroValue, { color: trendColor }]}>{formatCash(report.netPosition)}</Text>
        <View style={styles.heroTrendRow}>
          <Feather name={up ? 'trending-up' : 'trending-down'} size={15} color={trendColor} />
          <Text style={[styles.heroTrendText, { color: trendColor }]}>
            {up ? t('finance.growth') : t('finance.downfall')}
            {report.netPercent != null ? ` ${Math.abs(report.netPercent)}%` : ''}
          </Text>
        </View>
      </View>

      {/* Current vs previous */}
      <View style={styles.compareRow}>
        <Metric label={t('finance.currentPeriod')} value={formatCash(report.netPosition)} color={colors.textPrimary} colors={colors} styles={styles} />
        <Metric label={t('finance.previousPeriod')} value={formatCash(report.previousNetPosition)} color={colors.textMuted} colors={colors} styles={styles} />
      </View>

      {/* Positive changes */}
      {report.positives.length > 0 && (
        <>
          <SectionTitle title={t('finance.majorPositives')} colors={colors} styles={styles} />
          {report.positives.map(c => (
            <ChangeRow key={c.key} change={c} positive colors={colors} styles={styles} t={t} />
          ))}
        </>
      )}

      {/* Negative changes */}
      {report.negatives.length > 0 && (
        <>
          <SectionTitle title={t('finance.majorNegatives')} colors={colors} styles={styles} />
          {report.negatives.map(c => (
            <ChangeRow key={c.key} change={c} positive={false} colors={colors} styles={styles} t={t} />
          ))}
        </>
      )}

      {report.positives.length === 0 && report.negatives.length === 0 && (
        <Text style={[styles.mutedNote, { color: colors.textMuted }]}>{t('finance.noSignificantChange')}</Text>
      )}
    </>
  );
};

// ── Small sub-components ──────────────────────────────────────────────────────

const SectionTitle: React.FC<{ title: string; colors: ThemeColors; styles: ReturnType<typeof createStyles> }> = ({ title, colors, styles }) => (
  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
);

const Metric: React.FC<{
  label: string;
  value: string;
  color: string;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}> = ({ label, value, color, colors, styles }) => (
  <View style={[styles.metric, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
    <Text style={[styles.metricLabel, { color: colors.textMuted }]} numberOfLines={2}>{label}</Text>
    <Text style={[styles.metricValue, { color }]} numberOfLines={1}>{value}</Text>
  </View>
);

const ChartCard: React.FC<{
  empty: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  t: (k: string, o?: any) => string;
  children: React.ReactNode;
}> = ({ empty, colors, styles, t, children }) => (
  <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
    {empty ? (
      <Text style={[styles.noData, { color: colors.textMuted }]}>{t('finance.noTrendData')}</Text>
    ) : (
      children
    )}
  </View>
);

const ChangeRow: React.FC<{
  change: PeriodChange;
  positive: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  t: (k: string, o?: any) => string;
}> = ({ change, positive, colors, styles, t }) => {
  const color = positive ? colors.inColor : colors.outColor;
  const arrow = change.delta >= 0 ? 'arrow-up-right' : 'arrow-down-right';
  return (
    <View style={[styles.changeRow, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
      <Text style={[styles.changeLabel, { color: colors.textPrimary }]}>{t(`finance.changeKey.${change.key}`)}</Text>
      <View style={styles.changeRight}>
        <Feather name={arrow} size={14} color={color} />
        <Text style={[styles.changeValue, { color }]}>
          {formatCash(Math.abs(change.delta))}
          {change.percent != null ? ` (${Math.abs(change.percent)}%)` : ''}
        </Text>
      </View>
    </View>
  );
};

const PeriodChip: React.FC<{
  label: string;
  active: boolean;
  onPress: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}> = ({ label, active, onPress, colors, styles }) => (
  <TouchableOpacity
    style={[
      styles.periodChip,
      { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border },
    ]}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <Text style={{ fontSize: 12.5, fontWeight: active ? '700' : '600', color: active ? colors.textInverse : colors.textMuted }}>
      {label}
    </Text>
  </TouchableOpacity>
);

// Convert interpolation values so i18n receives plain strings/numbers.
function formatValues(values?: Record<string, string | number>): Record<string, string | number> {
  if (!values) return {};
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(values)) {
    out[k] = typeof v === 'number' && k === 'amount' ? formatCash(v) : v;
  }
  return out;
}

const createStyles = (_colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: 16, paddingTop: 8 },
    pageTitle: { fontSize: 20, fontWeight: '800' },
    pageSubtitle: { fontSize: 13, marginTop: 2, marginBottom: 14 },
    loader: { marginTop: 48 },
    periodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    periodChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
    dateRangeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 12,
      borderWidth: 1,
      padding: 10,
      marginBottom: 12,
    },
    dateBtn: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
    dateLabel: { fontSize: 10, fontWeight: '600' },
    dateValue: { fontSize: 13, fontWeight: '700', marginTop: 2 },
    dateSep: { fontSize: 18, marginHorizontal: 10 },
    tabs: { marginBottom: 14 },
    metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    metric: {
      flexGrow: 1,
      flexBasis: '30%',
      minWidth: '30%',
      borderRadius: 14,
      borderWidth: 1,
      padding: 12,
    },
    metricLabel: { fontSize: 11, fontWeight: '600' },
    metricValue: { fontSize: 16, fontWeight: '800', marginTop: 4 },
    compareRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
    sectionTitle: { fontSize: 14, fontWeight: '800', marginTop: 20, marginBottom: 10 },
    chartCard: { borderRadius: 16, borderWidth: 1, padding: 16 },
    noData: { fontSize: 13, textAlign: 'center', paddingVertical: 24 },
    hero: { borderRadius: 16, borderWidth: 1, padding: 18, alignItems: 'center', marginBottom: 10 },
    heroLabel: { fontSize: 12, fontWeight: '600' },
    heroValue: { fontSize: 28, fontWeight: '800', marginTop: 4 },
    heroTrendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    heroTrendText: { fontSize: 13, fontWeight: '700' },
    changeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 8,
    },
    changeLabel: { fontSize: 13, fontWeight: '700', flex: 1 },
    changeRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    changeValue: { fontSize: 13, fontWeight: '800' },
    mutedNote: { fontSize: 13, textAlign: 'center', marginTop: 12 },
    aiCard: { borderRadius: 16, borderWidth: 1, padding: 16 },
    aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    aiHeaderText: { fontSize: 13, fontWeight: '800' },
    aiText: { fontSize: 13, lineHeight: 20, marginBottom: 6 },
    aiNote: { fontSize: 11, marginTop: 6, fontStyle: 'italic' },
    suggestionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 12,
      borderWidth: 1,
      padding: 14,
      marginBottom: 8,
    },
    suggestionIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    suggestionText: { fontSize: 13, fontWeight: '600', flex: 1, lineHeight: 19 },
    bottomSpace: { height: 120 },
  });

export default FinanceReportsScreen;
