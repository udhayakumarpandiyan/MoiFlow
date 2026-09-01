import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Platform,
} from 'react-native';
// SafeAreaView removed - tab header handles safe area
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';

import { useTheme } from '../../context/ThemeContext';
import { reportService } from '../../services';
import {
  PersonBalance,
  VillageReport,
  DateReport,
  EventReportSummary,
} from '../../models/Report';
import { ReportFilter } from '../../models/ReportFilter';
import { Spacing } from '../../theme/typography';
import {
  formatCash,
  formatGold,
  formatDate,
} from '../../utils/format';
import { SegmentedControl } from '../../components/SegmentedControl';
import { EmptyState } from '../../components/EmptyState';

type ReportTab = 'OVERVIEW' | 'EVENT' | 'VILLAGE';
type PeriodFilter = 'ALL' | 'YEAR' | 'CUSTOM';

type OverallReport = {
  totalCashIn: number;
  totalCashOut: number;
  cashToReceive: number;
  cashToGive: number;

  totalGoldIn: number;
  totalGoldOut: number;
  goldToReceive: number;
  goldToGive: number;

  totalPersons: number;
  totalEntries: number;
};

type VillageSort = 'ENTRIES_DESC' | 'ENTRIES_ASC';

const ReportsScreen = () => {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const REPORT_TABS = useMemo(
    () => [
      { key: 'OVERVIEW', label: t('reports.overview') },
      { key: 'EVENT', label: t('reports.eventWise') },
      { key: 'VILLAGE', label: t('reports.village') },
    ],
    [t],
  );

  const [tab, setTab] = useState<ReportTab>('OVERVIEW');
  const [period, setPeriod] = useState<PeriodFilter>('ALL');

  // Custom date range
  const [fromDate, setFromDate] = useState<Date>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d;
  });
  const [toDate, setToDate] = useState<Date>(new Date());
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [personBalances, setPersonBalances] = useState<PersonBalance[]>([]);
  const [villageReports, setVillageReports] = useState<VillageReport[]>([]);
  const [dateReports, setDateReports] = useState<DateReport[]>([]);
  const [eventReports, setEventReports] = useState<EventReportSummary[]>([]);

  const [overallReport, setOverallReport] =
    useState<OverallReport | null>(null);

  const [villageSort, setVillageSort] =
    useState<VillageSort>('ENTRIES_DESC');

  // ---------------------------------------------------------------------------
  // Build filter based on period selection
  // ---------------------------------------------------------------------------

  const buildFilter = useCallback((): ReportFilter | undefined => {
    if (period === 'ALL') return undefined;

    if (period === 'YEAR') {
      const year = new Date().getFullYear();
      return {
        fromDate: `${year}-01-01`,
        toDate: `${year}-12-31`,
      };
    }

    // CUSTOM
    return {
      fromDate: fromDate.toISOString().split('T')[0],
      toDate: toDate.toISOString().split('T')[0],
    };
  }, [period, fromDate, toDate]);

  // ---------------------------------------------------------------------------
  // Load data
  // ---------------------------------------------------------------------------

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const filter = buildFilter();
      const [persons, villages, dates, overall, events] =
        await Promise.all([
          reportService.getPersonBalances(filter),
          reportService.getVillageReport(filter),
          reportService.getDateReport(filter),
          reportService.getOverallReport(filter),
          reportService.getEventWiseReport(filter),
        ]);

      setPersonBalances(persons);
      setVillageReports(villages);
      setDateReports(dates);
      setOverallReport(overall);
      setEventReports(events);
    } catch (err) {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [buildFilter]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  // ---------------------------------------------------------------------------
  // Period filtering (data is already filtered at load time)
  // ---------------------------------------------------------------------------

  const filteredDateReports = dateReports;

  // ---------------------------------------------------------------------------
  // Overall totals
  // ---------------------------------------------------------------------------

  const totalCashIn = useMemo(
    () =>
      personBalances.reduce(
        (sum, person) => sum + Number(person.totalCashIn || 0),
        0,
      ),
    [personBalances],
  );

  const totalCashOut = useMemo(
    () =>
      personBalances.reduce(
        (sum, person) => sum + Number(person.totalCashOut || 0),
        0,
      ),
    [personBalances],
  );

  const totalGoldIn = useMemo(
    () =>
      personBalances.reduce(
        (sum, person) => sum + Number(person.totalGoldIn || 0),
        0,
      ),
    [personBalances],
  );

  const totalGoldOut = useMemo(
    () =>
      personBalances.reduce(
        (sum, person) => sum + Number(person.totalGoldOut || 0),
        0,
      ),
    [personBalances],
  );

  const totalEntries =
    overallReport?.totalEntries ??
    personBalances.reduce(
      (sum, person) => sum + (person.entryCount || 0),
      0,
    );

  const totalPersons =
    overallReport?.totalPersons ?? personBalances.length;

  // Per-person reconciled values
  const cashToReceive = useMemo(
    () =>
      personBalances.reduce(
        (sum, person) =>
          sum +
          Math.max(
            (person.totalCashOut || 0) - (person.totalCashIn || 0),
            0,
          ),
        0,
      ),
    [personBalances],
  );

  const cashToGive = useMemo(
    () =>
      personBalances.reduce(
        (sum, person) =>
          sum +
          Math.max(
            (person.totalCashIn || 0) - (person.totalCashOut || 0),
            0,
          ),
        0,
      ),
    [personBalances],
  );

  const goldToReceive = useMemo(
    () =>
      personBalances.reduce(
        (sum, person) =>
          sum +
          Math.max(
            (person.totalGoldOut || 0) - (person.totalGoldIn || 0),
            0,
          ),
        0,
      ),
    [personBalances],
  );

  const goldToGive = useMemo(
    () =>
      personBalances.reduce(
        (sum, person) =>
          sum +
          Math.max(
            (person.totalGoldIn || 0) - (person.totalGoldOut || 0),
            0,
          ),
        0,
      ),
    [personBalances],
  );

  // ---------------------------------------------------------------------------
  // Chart data - GIVEN / OUT only
  // ---------------------------------------------------------------------------

  const chartReports = filteredDateReports.slice(-12);

  const maxCashOut = Math.max(
    ...chartReports.map(report => report.cashOut || 0),
    1,
  );

  const maxGoldOut = Math.max(
    ...chartReports.map(report => report.goldOut || 0),
    1,
  );

  const maxChartValue = Math.max(maxCashOut, maxGoldOut);

  // ---------------------------------------------------------------------------
  // Village sorting
  // ---------------------------------------------------------------------------

  const sortedVillageReports = useMemo(() => {
    const reports = [...villageReports];

    reports.sort((a, b) => {
      const aEntries = a.entryCount || 0;
      const bEntries = b.entryCount || 0;

      return villageSort === 'ENTRIES_DESC'
        ? bEntries - aEntries
        : aEntries - bEntries;
    });

    return reports;
  }, [villageReports, villageSort]);

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.center}>
          <ActivityIndicator
            size="large"
            color={colors.primary}
          />

          <Text style={[styles.loadingText, { color: colors.textMuted }]}>
            {t('app.loading')}
          </Text>
        </View>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData(true)}
            colors={[colors.primary]}
          />
        }
      >
        {/* Header */}
        <View style={styles.overviewHeader}>
          <Text style={[styles.pageTitle, { color: colors.textPrimary }]}>
            {t('reports.title')}
          </Text>

          <Text style={[styles.pageSubtitle, { color: colors.textMuted }]}>
            {t('reports.subtitle')}
          </Text>
        </View>

        {/* Period Filter */}
        <View style={styles.periodRow}>
          <PeriodChip
            label={t('reports.all')}
            active={period === 'ALL'}
            onPress={() => setPeriod('ALL')}
            colors={colors}
          />

          <PeriodChip
            label={t('reports.thisYear')}
            active={period === 'YEAR'}
            onPress={() => setPeriod('YEAR')}
            colors={colors}
          />

          <PeriodChip
            label={t('reports.custom')}
            active={period === 'CUSTOM'}
            onPress={() => setPeriod('CUSTOM')}
            colors={colors}
          />
        </View>

        {/* Custom Date Range Picker */}
        {period === 'CUSTOM' && (
          <View style={[styles.dateRangeRow, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <TouchableOpacity
              style={[styles.datePickerBtn, { borderColor: colors.border }]}
              onPress={() => setShowFromPicker(true)}
            >
              <Text style={[styles.datePickerLabel, { color: colors.textMuted }]}>
                {t('reports.from')}
              </Text>
              <Text style={[styles.datePickerValue, { color: colors.textPrimary }]}>
                {formatDate(fromDate.toISOString())}
              </Text>
            </TouchableOpacity>

            <Text style={[styles.dateRangeSep, { color: colors.textMuted }]}>→</Text>

            <TouchableOpacity
              style={[styles.datePickerBtn, { borderColor: colors.border }]}
              onPress={() => setShowToPicker(true)}
            >
              <Text style={[styles.datePickerLabel, { color: colors.textMuted }]}>
                {t('reports.to')}
              </Text>
              <Text style={[styles.datePickerValue, { color: colors.textPrimary }]}>
                {formatDate(toDate.toISOString())}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Date pickers (shown on tap) */}
        {showFromPicker && (
          <DateTimePicker
            value={fromDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={toDate}
            onValueChange={(_, date) => {
              setShowFromPicker(false);
              setFromDate(date);
            }}
            onDismiss={() => setShowFromPicker(false)}
          />
        )}
        {showToPicker && (
          <DateTimePicker
            value={toDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minimumDate={fromDate}
            maximumDate={new Date()}
            onValueChange={(_, date) => {
              setShowToPicker(false);
              setToDate(date);
            }}
            onDismiss={() => setShowToPicker(false)}
          />
        )}

        {/* Period indicator for This Year */}
        {period === 'YEAR' && (
          <View style={[styles.periodIndicator, { backgroundColor: colors.primaryBg }]}>
            <Text style={[styles.periodIndicatorText, { color: colors.primary }]}>
              📅 {t('reports.showingYear', { year: new Date().getFullYear() })}
            </Text>
          </View>
        )}

        {/* Cash Overview */}
        <View style={[styles.overviewCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.overviewCardTitle, { color: colors.textPrimary }]}>
            {'\uD83D\uDCB0'} {t('reports.cash')}
          </Text>

          <View style={styles.metricGrid}>
            <ReportMetric
              label={t('reports.cashReceived')}
              value={formatCash(totalCashIn)}
              color={colors.inColor}
              labelColor={colors.textMuted}
            />

            <ReportMetric
              label={t('reports.cashGiven')}
              value={formatCash(totalCashOut)}
              color={colors.outColor}
              labelColor={colors.textMuted}
            />

            <ReportMetric
              label={t('reports.toReceive')}
              value={formatCash(cashToReceive)}
              color={colors.inColor}
              labelColor={colors.textMuted}
            />

            <ReportMetric
              label={t('reports.toGive')}
              value={formatCash(cashToGive)}
              color={colors.outColor}
              labelColor={colors.textMuted}
            />
          </View>
        </View>

        {/* Gold Overview */}
        <View style={[styles.overviewCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.overviewCardTitle, { color: colors.textPrimary }]}>
            {'\uD83E\uDE99'} {t('reports.gold')}
          </Text>

          <View style={styles.metricGrid}>
            <ReportMetric
              label={t('reports.goldReceived')}
              value={formatGold(totalGoldIn)}
              color={colors.gold}
              labelColor={colors.textMuted}
            />

            <ReportMetric
              label={t('reports.goldGiven')}
              value={formatGold(totalGoldOut)}
              color={colors.outColor}
              labelColor={colors.textMuted}
            />

            <ReportMetric
              label={t('reports.toReceive')}
              value={formatGold(goldToReceive)}
              color={colors.gold}
              labelColor={colors.textMuted}
            />

            <ReportMetric
              label={t('reports.toGive')}
              value={formatGold(goldToGive)}
              color={colors.outColor}
              labelColor={colors.textMuted}
            />
          </View>
        </View>

        {/* Basic Insights */}
        <View style={styles.insightRow}>
          <View style={[styles.smallInsight, { backgroundColor: colors.surface }]}>
            <Text style={[styles.smallInsightLabel, { color: colors.textMuted }]}>
              {t('reports.totalPersons')}
            </Text>

            <Text
              style={[
                styles.smallInsightValue,
                { color: colors.primary },
              ]}
            >
              {totalPersons}
            </Text>
          </View>

          <View style={[styles.smallInsight, { backgroundColor: colors.surface }]}>
            <Text style={[styles.smallInsightLabel, { color: colors.textMuted }]}>
              {t('reports.totalEntries')}
            </Text>

            <Text
              style={[
                styles.smallInsightValue,
                { color: colors.primary },
              ]}
            >
              {totalEntries}
            </Text>
          </View>
        </View>

        {/* Tabs */}
        <SegmentedControl
          segments={REPORT_TABS}
          selected={tab}
          onSelect={value =>
            setTab(value as ReportTab)
          }
          style={styles.tabs}
        />

        {/* ---------------------------------------------------------------- */}
        {/* Overview */}
        {/* ---------------------------------------------------------------- */}

        {tab === 'OVERVIEW' && (
          <>
            {/* Given Chart */}
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {t('reports.givenChart')}
            </Text>

            <View style={[styles.chartCard, { backgroundColor: colors.surface }]}>
              {chartReports.length === 0 ? (
                <Text style={[styles.noData, { color: colors.textMuted }]}>
                  {t('reports.noData')}
                </Text>
              ) : (
                <>
                  <View style={styles.chart}>
                    {chartReports.map(report => {
                      const cashOut =
                        report.cashOut || 0;

                      const goldOut =
                        report.goldOut || 0;

                      const cashHeight =
                        maxChartValue > 0
                          ? Math.max(
                              4,
                              (cashOut /
                                maxChartValue) *
                                100,
                            )
                          : 4;

                      const goldHeight =
                        maxChartValue > 0
                          ? Math.max(
                              4,
                              (goldOut /
                                maxChartValue) *
                                100,
                            )
                          : 4;

                      return (
                        <View
                          key={report.date}
                          style={
                            styles.chartColumn
                          }
                        >
                          <View
                            style={styles.barArea}
                          >
                            <View
                              style={[
                                styles.bar,
                                {
                                  height: cashHeight,
                                  backgroundColor: colors.outColor,
                                },
                              ]}
                            />

                            <View
                              style={[
                                styles.bar,
                                {
                                  height: goldHeight,
                                  backgroundColor: colors.gold,
                                },
                              ]}
                            />
                          </View>

                          <Text
                            style={[
                              styles.chartLabel,
                              { color: colors.textDisabled },
                            ]}
                            numberOfLines={1}
                          >
                            {formatDate(
                              report.date,
                            )}
                          </Text>
                        </View>
                      );
                    })}
                  </View>

                  <View style={styles.legend}>
                    <Text
                      style={[styles.legendText, { color: colors.outColor }]}
                    >
                      {'\u25CF'} {t('reports.cashGivenChart')}
                    </Text>

                    <Text
                      style={[styles.legendText, { color: colors.gold }]}
                    >
                      {'\u25CF'} {t('reports.goldGivenChart')}
                    </Text>
                  </View>
                </>
              )}
            </View>

            {/* AI Prediction */}
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {t('reports.aiPrediction')}
            </Text>

            <View style={[styles.aiCard, { backgroundColor: colors.primaryBg, borderColor: colors.borderLight }]}>
              <Text style={[styles.aiTitle, { color: colors.primary }]}>
                {'\u2726'} {t('reports.aiIfEvent')}
              </Text>

              <Text style={[styles.aiText, { color: colors.textPrimary }]}>
                {t('reports.aiAvgCash', {
                  cash: formatCash(
                    totalCashIn /
                      Math.max(filteredDateReports.length, 1),
                  ),
                  gold: formatGold(
                    totalGoldIn /
                      Math.max(filteredDateReports.length, 1),
                  ),
                })}
              </Text>

              <Text style={[styles.aiText, { color: colors.textPrimary }]}>
                {t('reports.aiInviteCount', { count: totalPersons })}
              </Text>

              <Text style={[styles.aiText, { color: colors.textPrimary }]}>
                {t('reports.aiInviteHint')}
              </Text>

              <Text style={[styles.aiNote, { color: colors.textMuted }]}>
                {t('reports.aiNote')}
              </Text>
            </View>

            {/* Additional Insights */}
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {t('reports.moreInsights')}
            </Text>

            <Insight
              title={`\uD83C\uDFC6 ${t('reports.topContribution')}`}
              text={t('reports.topContributionDesc')}
              colors={colors}
            />

            <Insight
              title={`\uD83D\uDCCD ${t('reports.keyVillages')}`}
              text={t('reports.keyVillagesDesc')}
              colors={colors}
            />

            <Insight
              title={`\uD83D\uDCB0 ${t('reports.amountToReceive')}`}
              text={t('reports.amountToReceiveDesc', {
                cash: formatCash(cashToReceive),
                gold: formatGold(goldToReceive),
              })}
              colors={colors}
            />

            <Insight
              title={`\uD83C\uDFAF ${t('reports.nextEventInvitations')}`}
              text={t('reports.nextEventInvitationsDesc', { count: totalPersons })}
              colors={colors}
            />
          </>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Event-wise */}
        {/* ---------------------------------------------------------------- */}

        {tab === 'EVENT' && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {t('reports.eventWise')}
            </Text>

            {eventReports.length === 0 ? (
              <EmptyState
                title={t('reports.noData')}
                icon={'\uD83C\uDF89'}
              />
            ) : (
              eventReports.map(event => (
                <EventCard
                  key={event.eventId}
                  event={event}
                  colors={colors}
                  t={t}
                />
              ))
            )}
          </>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Village */}
        {/* ---------------------------------------------------------------- */}

        {tab === 'VILLAGE' && (
          <>
            <View style={styles.villageTitleRow}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                {t('reports.villageReport')}
              </Text>

              <TouchableOpacity
                style={[styles.sortButton, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
                onPress={() =>
                  setVillageSort(current =>
                    current === 'ENTRIES_DESC'
                      ? 'ENTRIES_ASC'
                      : 'ENTRIES_DESC',
                  )
                }
                activeOpacity={0.75}
              >
                <Text style={[styles.sortButtonText, { color: colors.textMuted }]}>
                  {villageSort === 'ENTRIES_DESC'
                    ? `\u2193 ${t('reports.sortEntries')}`
                    : `\u2191 ${t('reports.sortEntries')}`}
                </Text>
              </TouchableOpacity>
            </View>

            {sortedVillageReports.length === 0 ? (
              <EmptyState
                title={t('reports.noData')}
                icon={'\uD83C\uDFD8\uFE0F'}
              />
            ) : (
              sortedVillageReports.map(village => (
                <VillageCard
                  key={village.villageName}
                  village={village}
                  colors={colors}
                  t={t}
                />
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};

// -----------------------------------------------------------------------------
// Period Chip
// -----------------------------------------------------------------------------

const PeriodChip = ({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: any;
}) => (
  <TouchableOpacity
    style={[
      styles.periodChip,
      { backgroundColor: colors.surface, borderColor: colors.borderLight },
      active && { backgroundColor: colors.primary, borderColor: colors.primary },
    ]}
    onPress={onPress}
    activeOpacity={0.75}
  >
    <Text
      style={[
        styles.periodText,
        { color: colors.textMuted },
        active && { color: colors.textInverse },
      ]}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

// -----------------------------------------------------------------------------
// Event Card
// -----------------------------------------------------------------------------

const EventCard: React.FC<{
  event: EventReportSummary;
  colors: any;
  t: any;
}> = ({ event, colors, t }) => {
  const [expanded, setExpanded] = useState(false);

  const cashReceived = event.totalCashReceived || 0;
  const goldReceived = event.totalGoldReceived || 0;
  const estimatedCost = event.estimatedCost || 0;
  const actualExpenses = event.actualExpenses || 0;
  const totalIncome = cashReceived;
  const netBalance = totalIncome - actualExpenses;
  const deviation = actualExpenses - estimatedCost;

  return (
    <TouchableOpacity
      style={[styles.villageCard, { backgroundColor: colors.surface }]}
      onPress={() => setExpanded(!expanded)}
      activeOpacity={0.8}
    >
      {/* Header: Event name + details */}
      <View style={styles.villageHeader}>
        <View style={styles.villageLeft}>
          <Text style={[styles.villageName, { color: colors.textPrimary }]}>
            {event.eventName}
          </Text>
          <Text style={[styles.villageCount, { color: colors.textMuted }]}>
            {event.eventDate ? formatDate(event.eventDate) : ''}
            {event.eventVenue ? ` • ${event.eventVenue}` : ''}
            {event.eventVillageName ? ` • ${event.eventVillageName}` : ''}
          </Text>
        </View>
        <Text style={[styles.expandIcon, { color: colors.textDisabled }]}>
          {expanded ? '▲' : '▼'}
        </Text>
      </View>

      {/* Stats row: entries, persons, villages */}
      <View style={[styles.villageMetrics, { marginTop: 10 }]}>
        <View style={styles.villageMetric}>
          <Text style={[styles.villageMetricLabel, { color: colors.textMuted }]}>
            {t('reports.totalEntries')}
          </Text>
          <Text style={[styles.villageMetricValue, { color: colors.textPrimary }]}>
            {event.totalEntries}
          </Text>
        </View>
        <View style={styles.villageMetric}>
          <Text style={[styles.villageMetricLabel, { color: colors.textMuted }]}>
            {t('reports.totalPersons')}
          </Text>
          <Text style={[styles.villageMetricValue, { color: colors.textPrimary }]}>
            {event.totalPersons}
          </Text>
        </View>
        <View style={styles.villageMetric}>
          <Text style={[styles.villageMetricLabel, { color: colors.textMuted }]}>
            {t('reports.village')}
          </Text>
          <Text style={[styles.villageMetricValue, { color: colors.textPrimary }]}>
            {event.totalVillages}
          </Text>
        </View>
      </View>

      {/* Invitations row */}
      {(event.invitationsPrinted > 0 || event.totalInvites > 0) && (
        <View style={styles.villageMetrics}>
          <View style={styles.villageMetric}>
            <Text style={[styles.villageMetricLabel, { color: colors.textMuted }]}>
              {t('events.tasks.invitationPrinting')}
            </Text>
            <Text style={[styles.villageMetricValue, { color: colors.textPrimary }]}>
              {event.invitationsPrinted}
            </Text>
          </View>
          <View style={styles.villageMetric}>
            <Text style={[styles.villageMetricLabel, { color: colors.textMuted }]}>
              {t('events.tasks.inviting')}
            </Text>
            <Text style={[styles.villageMetricValue, { color: colors.textPrimary }]}>
              {event.totalInvites}
            </Text>
          </View>
        </View>
      )}

      {/* IN Cash & Gold (received only for own events) */}
      <View style={[styles.villageDivider, { backgroundColor: colors.borderLight }]} />
      <View style={styles.villageMetrics}>
        <View style={styles.villageMetric}>
          <Text style={[styles.villageMetricLabel, { color: colors.textMuted }]}>
            {t('reports.cashReceived')}
          </Text>
          <Text style={[styles.villageMetricValue, { color: colors.inColor }]}>
            {formatCash(cashReceived)}
          </Text>
        </View>
        <View style={styles.villageMetric}>
          <Text style={[styles.villageMetricLabel, { color: colors.textMuted }]}>
            {t('reports.goldReceived')}
          </Text>
          <Text style={[styles.villageMetricValue, { color: colors.gold }]}>
            {formatGold(goldReceived)}
          </Text>
        </View>
      </View>

      {/* Expanded: Cost estimation, expenses, summary */}
      {expanded && (
        <View style={[styles.villageExpanded, { borderTopColor: colors.borderLight }]}>
          {/* Estimation & Actual */}
          <View style={styles.villageExpandedRow}>
            <Text style={[styles.villageExpandedLabel, { color: colors.textMuted }]}>
              {t('events.estimatedCost')}
            </Text>
            <Text style={[styles.villageExpandedValue, { color: colors.textPrimary }]}>
              {formatCash(estimatedCost)}
            </Text>
          </View>

          <View style={[styles.villageExpandedDivider, { backgroundColor: colors.borderLight }]} />

          <View style={styles.villageExpandedRow}>
            <Text style={[styles.villageExpandedLabel, { color: colors.textMuted }]}>
              {t('reports.totalOut')}
            </Text>
            <Text style={[styles.villageExpandedValue, { color: colors.outColor }]}>
              {formatCash(actualExpenses)}
            </Text>
          </View>

          <View style={[styles.villageExpandedDivider, { backgroundColor: colors.borderLight }]} />

          {/* Summary: Total IN - Expenses */}
          <View style={styles.villageExpandedRow}>
            <Text style={[styles.villageExpandedLabel, { color: colors.textMuted }]}>
              {t('reports.totalIn')} − {t('reports.totalOut')}
            </Text>
            <Text style={[styles.villageExpandedValue, { color: netBalance >= 0 ? colors.inColor : colors.outColor }]}>
              {netBalance >= 0 ? '+' : ''}{formatCash(netBalance)}
            </Text>
          </View>

          <View style={[styles.villageExpandedDivider, { backgroundColor: colors.borderLight }]} />

          {/* Deviation from estimation */}
          {estimatedCost > 0 && (
            <View style={styles.villageExpandedRow}>
              <Text style={[styles.villageExpandedLabel, { color: colors.textMuted }]}>
                {t('reports.netBalance')}
              </Text>
              <Text style={[styles.villageExpandedValue, { color: deviation <= 0 ? colors.inColor : colors.outColor }]}>
                {deviation <= 0 ? '' : '+'}{formatCash(deviation)}
                {deviation < 0 ? ' ↓' : deviation > 0 ? ' ↑' : ' ✓'}
              </Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

// -----------------------------------------------------------------------------
// Village Card
// -----------------------------------------------------------------------------

const VillageCard: React.FC<{
  village: VillageReport;
  colors: any;
  t: any;
}> = ({ village: v, colors, t }) => {
  const [expanded, setExpanded] = useState(false);

  const totalCashIn = v.totalCashIn || 0;
  const totalCashOut = v.totalCashOut || 0;

  const totalGoldIn = v.totalGoldIn || 0;
  const totalGoldOut = v.totalGoldOut || 0;

  // Village-level reconciliation
  const villageCashToReceive = Math.max(
    totalCashOut - totalCashIn,
    0,
  );

  const villageCashToGive = Math.max(
    totalCashIn - totalCashOut,
    0,
  );

  const villageGoldToReceive = Math.max(
    totalGoldOut - totalGoldIn,
    0,
  );

  const villageGoldToGive = Math.max(
    totalGoldIn - totalGoldOut,
    0,
  );

  return (
    <TouchableOpacity
      style={[styles.villageCard, { backgroundColor: colors.surface }]}
      onPress={() =>
        setExpanded(current => !current)
      }
      activeOpacity={0.8}
    >
      {/* Village Header */}
      <View style={styles.villageHeader}>
        <View style={styles.villageLeft}>
          <Text style={[styles.villageName, { color: colors.textPrimary }]}>
            {v.villageName}
          </Text>

          <Text style={[styles.villageCount, { color: colors.textMuted }]}>
            {v.entryCount} {t('reports.entries')}
          </Text>
        </View>

        <Text style={[styles.expandIcon, { color: colors.textMuted }]}>
          {expanded ? '\u2303' : '\u2304'}
        </Text>
      </View>

      {/* Cash */}
      <View style={styles.villageMetrics}>
        <View style={styles.villageMetric}>
          <Text style={[styles.villageMetricLabel, { color: colors.textMuted }]}>
            {t('reports.cashReceived')}
          </Text>

          <Text
            style={[
              styles.villageMetricValue,
              { color: colors.inColor },
            ]}
          >
            {formatCash(totalCashIn)}
          </Text>
        </View>

        <View style={styles.villageMetric}>
          <Text style={[styles.villageMetricLabel, { color: colors.textMuted }]}>
            {t('reports.cashGiven')}
          </Text>

          <Text
            style={[
              styles.villageMetricValue,
              { color: colors.outColor },
            ]}
          >
            {formatCash(totalCashOut)}
          </Text>
        </View>
      </View>

      <View style={styles.villageMetrics}>
        <View style={styles.villageMetric}>
          <Text style={[styles.villageMetricLabel, { color: colors.textMuted }]}>
            {t('reports.toReceive')}
          </Text>

          <Text
            style={[
              styles.villageMetricValue,
              { color: colors.inColor },
            ]}
          >
            {formatCash(villageCashToReceive)}
          </Text>
        </View>

        <View style={styles.villageMetric}>
          <Text style={[styles.villageMetricLabel, { color: colors.textMuted }]}>
            {t('reports.toGive')}
          </Text>

          <Text
            style={[
              styles.villageMetricValue,
              { color: colors.outColor },
            ]}
          >
            {formatCash(villageCashToGive)}
          </Text>
        </View>
      </View>

      {/* Gold */}
      <View style={[styles.villageDivider, { backgroundColor: colors.borderLight }]} />

      <View style={styles.villageGoldRow}>
        <Text style={[styles.villageGoldLabel, { color: colors.textMuted }]}>
          {'\uD83E\uDE99'} {t('reports.gold')}
        </Text>

        <View style={styles.villageGoldValues}>
          <Text
            style={[
              styles.cardGold,
              { color: colors.gold },
            ]}
          >
            +{formatGold(totalGoldIn)}
          </Text>

          {totalGoldOut > 0 && (
            <Text
              style={[
                styles.cardGold,
                { color: colors.outColor },
              ]}
            >
              -{formatGold(totalGoldOut)}
            </Text>
          )}
        </View>
      </View>

      {/* Expanded Details */}
      {expanded && (
        <View style={[styles.villageExpanded, { borderTopColor: colors.borderLight }]}>
          <View style={styles.villageExpandedRow}>
            <Text
              style={[styles.villageExpandedLabel, { color: colors.textMuted }]}
            >
              {t('reports.toReceive')} ({t('reports.gold')})
            </Text>

            <Text
              style={[
                styles.villageExpandedValue,
                { color: colors.gold },
              ]}
            >
              {formatGold(villageGoldToReceive)}
            </Text>
          </View>

          <View style={[styles.villageExpandedDivider, { backgroundColor: colors.borderLight }]} />

          <View style={styles.villageExpandedRow}>
            <Text
              style={[styles.villageExpandedLabel, { color: colors.textMuted }]}
            >
              {t('reports.toGive')} ({t('reports.gold')})
            </Text>

            <Text
              style={[
                styles.villageExpandedValue,
                { color: colors.outColor },
              ]}
            >
              {formatGold(villageGoldToGive)}
            </Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
};

// -----------------------------------------------------------------------------
// Report Metric
// -----------------------------------------------------------------------------

const ReportMetric = ({
  label,
  value,
  color,
  labelColor,
}: {
  label: string;
  value: string;
  color: string;
  labelColor: string;
}) => (
  <View style={styles.metric}>
    <Text style={[styles.metricLabel, { color: labelColor }]}>
      {label}
    </Text>

    <Text
      style={[
        styles.metricValue,
        { color },
      ]}
      numberOfLines={1}
      adjustsFontSizeToFit
    >
      {value}
    </Text>
  </View>
);

// -----------------------------------------------------------------------------
// Insight
// -----------------------------------------------------------------------------

const Insight = ({
  title,
  text,
  colors,
}: {
  title: string;
  text: string;
  colors: any;
}) => (
  <View style={[styles.insightCard, { backgroundColor: colors.surface }]}>
    <Text style={[styles.insightTitle, { color: colors.textPrimary }]}>
      {title}
    </Text>

    <Text style={[styles.insightText, { color: colors.textMuted }]}>
      {text}
    </Text>
  </View>
);

export default ReportsScreen;

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  content: {
    padding: Spacing.lg,
    paddingBottom: 40,
  },

  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingText: {
    marginTop: 12,
    fontSize: 12,
  },

  // ---------------------------------------------------------------------------
  // Header
  // ---------------------------------------------------------------------------

  overviewHeader: {
    marginBottom: 14
  },

  pageTitle: {
    fontSize: 19,
    fontWeight: '700',
  },

  pageSubtitle: {
    fontSize: 12,
    marginTop: 3,
  },

  // ---------------------------------------------------------------------------
  // Period
  // ---------------------------------------------------------------------------

  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },

  periodChip: {
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderWidth: 1,
  },

  periodText: {
    fontSize: 11,
    fontWeight: '600',
  },

  dateRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
    gap: 8,
  },

  datePickerBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },

  datePickerLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  datePickerValue: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },

  dateRangeSep: {
    fontSize: 14,
    fontWeight: '600',
  },

  periodIndicator: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 14,
    alignItems: 'center',
  },

  periodIndicatorText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 10,
    marginBottom: 12,
    elevation: 1,
  },

  summarySep: {
    width: 1,
    height: 34,
    marginHorizontal: 4,
  },

  // ---------------------------------------------------------------------------
  // Overview
  // ---------------------------------------------------------------------------

  overviewCard: {
    borderRadius: 14,
    padding: 15,
    marginBottom: 10,
    elevation: 1,
  },

  overviewCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
  },

  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },

  metric: {
    width: '50%',
    paddingHorizontal: 4,
    paddingVertical: 7,
  },

  metricLabel: {
    fontSize: 10,
    fontWeight: '600',
  },

  metricValue: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 5,
  },

  // ---------------------------------------------------------------------------
  // Small Insights
  // ---------------------------------------------------------------------------

  insightRow: {
    flexDirection: 'row',
    gap: 9,
    marginBottom: 5,
  },

  smallInsight: {
    flex: 1,
    borderRadius: 12,
    padding: 13,
    elevation: 1,
  },

  smallInsightLabel: {
    fontSize: 10,
    fontWeight: '600',
  },

  smallInsightValue: {
    fontSize: 17,
    fontWeight: '800',
    marginTop: 5,
  },

  // ---------------------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------------------

  tabs: {
    marginTop: 14,
    marginBottom: 4,
  },

  // ---------------------------------------------------------------------------
  // Section Title
  // ---------------------------------------------------------------------------

  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 18,
    marginBottom: 10,
  },

  // ---------------------------------------------------------------------------
  // Chart
  // ---------------------------------------------------------------------------

  chartCard: {
    borderRadius: 14,
    padding: 14,
    minHeight: 190,
    elevation: 1,
  },

  chart: {
    height: 140,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },

  chartColumn: {
    flex: 1,
    alignItems: 'center',
    minWidth: 22,
  },

  barArea: {
    height: 112,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },

  bar: {
    width: 8,
    borderRadius: 5,
    minHeight: 4,
  },

  chartLabel: {
    fontSize: 7,
    marginTop: 6,
    maxWidth: 38,
  },

  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 10,
  },

  legendText: {
    fontSize: 10,
    fontWeight: '600',
  },

  noData: {
    textAlign: 'center',
    marginTop: 70,
  },

  // ---------------------------------------------------------------------------
  // AI
  // ---------------------------------------------------------------------------

  aiCard: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
  },

  aiTitle: {
    fontSize: 14,
    fontWeight: '800',
  },

  aiText: {
    fontSize: 12,
    lineHeight: 19,
    marginTop: 9,
  },

  aiNote: {
    fontSize: 10,
    lineHeight: 15,
    marginTop: 12,
  },

  // ---------------------------------------------------------------------------
  // Insights
  // ---------------------------------------------------------------------------

  insightCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    elevation: 1,
  },

  insightTitle: {
    fontSize: 13,
    fontWeight: '800',
  },

  insightText: {
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18,
  },

  // ---------------------------------------------------------------------------
  // Village
  // ---------------------------------------------------------------------------

  villageTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  sortButton: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 7,
    marginTop: 18,
    marginBottom: 10,
  },

  sortButtonText: {
    fontSize: 10,
    fontWeight: '700',
  },

  villageCard: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 9,
    elevation: 1,
  },

  villageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  villageLeft: {
    flex: 1,
  },

  villageName: {
    fontSize: 14,
    fontWeight: '700',
  },

  villageCount: {
    fontSize: 11,
    marginTop: 3,
  },

  expandIcon: {
    fontSize: 17,
    fontWeight: '700',
    paddingLeft: 10,
  },

  villageMetrics: {
    flexDirection: 'row',
    marginTop: 13,
  },

  villageMetric: {
    flex: 1,
  },

  villageMetricLabel: {
    fontSize: 10,
    fontWeight: '600',
  },

  villageMetricValue: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4,
  },

  villageDivider: {
    height: 1,
    marginVertical: 11,
  },

  villageGoldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  villageGoldLabel: {
    fontSize: 11,
    fontWeight: '600',
  },

  villageGoldValues: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  cardGold: {
    fontSize: 12,
    fontWeight: '700',
  },

  // ---------------------------------------------------------------------------
  // Village Expanded
  // ---------------------------------------------------------------------------

  villageExpanded: {
    borderTopWidth: 1,
    marginTop: 11,
    paddingTop: 10,
  },

  villageExpandedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },

  villageExpandedLabel: {
    fontSize: 11,
    fontWeight: '600',
  },

  villageExpandedValue: {
    fontSize: 12,
    fontWeight: '800',
  },

  villageExpandedDivider: {
    height: 1,
  },
});
