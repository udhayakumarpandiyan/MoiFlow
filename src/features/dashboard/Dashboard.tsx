import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
// SafeAreaView removed - tab header handles safe area
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import Feather from '@react-native-vector-icons/feather';
import { useTheme } from '../../context/ThemeContext';
import { dashboardService } from '../../services';
import {
  DashboardSummary,
  RecentEntry,
  DashboardEvent,
} from '../../models/Dashboard';
import VoiceSearchModal from './VoiceSearchModal';

const DashboardScreen = ({ navigation }: any) => {
  const { t } = useTranslation();
  const [userName, setUserName] = useState<string>('');

  useFocusEffect(
    useCallback(() => {
      const loadUserName = async () => {
        // Primary key used by AuthService
        let name = await AsyncStorage.getItem('app.user_name');
        // Fallback to legacy key from older registration
        if (!name) {
          name = await AsyncStorage.getItem('app.user.name');
        }
        if (name) setUserName(name);
      };
      loadUserName();
    }, []),
  );
  const { colors } = useTheme();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedEvent, setSelectedEvent] =
    useState<DashboardEvent | null>(null);

  const [selectedEntry, setSelectedEntry] =
    useState<RecentEntry | null>(null);

  const [voiceSearchVisible, setVoiceSearchVisible] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      setError(null);

      const data = await dashboardService.getSummary();

      setSummary(data);
    } catch (err) {
      console.error('[Dashboard] load error:', err);
      setError(t('errors.generic'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboard();
  };

  const formatCash = (amount?: number) => {
    const value = Number(amount ?? 0);

    return `₹${value.toLocaleString('en-IN')}`;
  };

  const formatGold = (weight?: number) => {
    const value = Number(weight ?? 0);

    return `${value.toFixed(2)} ${t('common.grams')}`;
  };

  const recentOutEntries = useMemo(() => {
    const entries = summary?.recentEntries ?? [];

    return entries
      .filter(entry => entry.entryType !== 'OWN_EVENT')
      .slice(0, 5);
  }, [summary]);

  const cashToReceive = Number(
    summary?.totalCashToBeReceived ?? 0,
  );

  const cashToGive = Number(
    summary?.totalCashToBeGiven ?? 0,
  );

  const goldToReceive = Number(
    summary?.totalGoldToBeReceived ?? 0,
  );

  const goldToGive = Number(
    summary?.totalGoldToBeGiven ?? 0,
  );

  const getDateParts = (dateStr?: string | null) => {
    if (!dateStr) return { day: '—', month: '' };
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { day: '—', month: '' };
    const day = d.getDate().toString().padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return { day, month: months[d.getMonth()] ?? '' };
  };

  const renderAmount = (
    cash?: number,
    gold?: number,
    negative = false,
  ) => {
    const cashValue = Number(cash ?? 0);
    const goldValue = Number(gold ?? 0);

    return (
      <View style={styles.amountColumn}>
        {cashValue > 0 && (
          <Text
            style={[
              styles.entryCash,
              { color: colors.outColor },
            ]}
          >
            {negative ? '-' : '+'}
            {formatCash(cashValue)}
          </Text>
        )}

        {goldValue > 0 && (
          <Text style={[styles.entryGold, { color: colors.gold }]}>
            {negative ? '-' : '+'}
            {formatGold(goldValue)}
          </Text>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            size="large"
            color={colors.primary}
          />

          <Text style={[styles.loadingText, { color: colors.textMuted }]}>
            {t('common.loading')}
          </Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorIcon, { backgroundColor: colors.outBg, color: colors.outColor }]}>!</Text>

          <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>
            {t('dashboard.somethingWrong')}
          </Text>

          <Text style={[styles.errorText, { color: colors.textMuted }]}>
            {error}
          </Text>

          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={loadDashboard}
          >
            <Text style={[styles.retryText, { color: colors.textInverse }]}>
              {t('common.retry')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!summary) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
            {t('common.noData')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, { color: colors.textMuted }]}>
              {t('dashboard.greeting')} 👋
            </Text>

            <Text style={[styles.title, { color: colors.textPrimary }]}>
              {userName || t('app.name')}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.voiceSearchBtn, { backgroundColor: colors.primaryBg }]}
            onPress={() => setVoiceSearchVisible(true)}
            activeOpacity={0.7}
            accessible
            accessibilityLabel={t('voiceSearch.title')}
            accessibilityRole="button"
          >
            <Feather name="mic" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Upcoming Events */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {t('dashboard.upcomingEvents')}
            </Text>

            <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
              {t('dashboard.yourNextEvents')}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() =>
              navigation.navigate('EventsStack', {
                screen: 'PastEvents',
              })
            }
          >
            <Text style={[styles.linkText, { color: colors.pendingColor }]}>
              {t('events.past')}
            </Text>
          </TouchableOpacity>
        </View>

        {(summary.upcomingEvents ?? []).length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <Text style={styles.emptyCardIcon}>
              📅
            </Text>

            <Text style={[styles.emptyCardTitle, { color: colors.textSecondary }]}>
              {t('dashboard.noEvents')}
            </Text>

            <Text style={[styles.emptyCardText, { color: colors.textMuted }]}>
              {t('dashboard.addNewEvent')}
            </Text>
          </View>
        ) : (
          <View style={styles.eventsList}>
            {(summary.upcomingEvents ?? []).slice(0, 5).map(event => {
              const dateParts = getDateParts(event.eventDate);
              return (
                <TouchableOpacity
                  key={event.id}
                  style={[styles.eventCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
                  activeOpacity={0.8}
                  onPress={() =>
                    navigation.navigate('EventsStack')
                  }
                >
                  <View style={[styles.eventDateBox, { backgroundColor: colors.primaryBg }]}>
                    <Text style={[styles.eventDateNumber, { color: colors.primary }]}>
                      {dateParts.day}
                    </Text>

                    <Text style={[styles.eventDateMonth, { color: colors.primaryLight }]}>
                      {dateParts.month}
                    </Text>
                  </View>

                  <View style={styles.eventInfo}>
                    <Text
                      style={[styles.eventName, { color: colors.textPrimary }]}
                      numberOfLines={1}
                    >
                      {event.name}
                    </Text>

                    <Text style={[styles.eventLocation, { color: colors.textMuted }]}>
                      📍 {event.villageName || '—'}
                    </Text>
                  </View>

                  <Text style={[styles.chevron, { color: colors.border }]}>
                    ›
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <TouchableOpacity
          style={[styles.secondaryButton, { borderColor: colors.primaryLight, backgroundColor: colors.primaryBg }]}
          onPress={() =>
            navigation.navigate('EventsStack')
          }
        >
          <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
            {t('dashboard.newEvent')}
          </Text>
        </TouchableOpacity>

        {/* Recent OUT Entries */}
        <View style={[styles.sectionHeader, styles.sectionSpacing]}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {t('dashboard.recentEntries')}
            </Text>
            <View style={styles.subSection}>
            <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
              {t('dashboard.last5Entries')}
            </Text>
            <TouchableOpacity
            onPress={() =>
              navigation.navigate('EntriesStack')
            }
          >
            <Text style={[styles.linkText, { color: colors.pendingColor }]}>
              {t('dashboard.viewAll')}
            </Text>
          </TouchableOpacity>
            </View>
          </View>

        </View>

        {recentOutEntries.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <Text style={styles.emptyCardIcon}>
              📝
            </Text>

            <Text style={[styles.emptyCardTitle, { color: colors.textSecondary }]}>
              {t('dashboard.noGivenEntries')}
            </Text>

            <Text style={[styles.emptyCardText, { color: colors.textMuted }]}>
              {t('dashboard.addNewEntry')}
            </Text>
          </View>
        ) : (
          <View style={[styles.entriesCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            {recentOutEntries.map(
              (entry, index) => (
                <TouchableOpacity
                  key={entry.id}
                  style={[
                    styles.entryRow,
                    { borderBottomColor: colors.borderLight },
                    index ===
                      recentOutEntries.length - 1 &&
                      styles.lastEntryRow,
                  ]}
                  activeOpacity={0.8}
                  onPress={() =>
                    setSelectedEntry(entry)
                  }
                >
                  <View style={[styles.avatar, { backgroundColor: colors.borderLight }]}>
                    <Text style={[styles.avatarText, { color: colors.textSecondary }]}>
                      {(entry.personName || '?')
                        .charAt(0)
                        .toUpperCase()}
                    </Text>
                  </View>

                  <View style={styles.entryInfo}>
                    <Text
                      style={[styles.personName, { color: colors.textPrimary }]}
                      numberOfLines={1}
                    >
                      {entry.personName}
                    </Text>

                    {!!entry.villageName && (
                      <Text style={[styles.villageText, { color: colors.textMuted }]}>
                        {entry.villageName}
                      </Text>
                    )}

                    {!!entry.eventName && (
                      <Text
                        style={[styles.entryEvent, { color: colors.textDisabled }]}
                        numberOfLines={1}
                      >
                        {entry.eventName}
                      </Text>
                    )}
                  </View>

                  {renderAmount(
                    entry.cashAmount,
                    entry.goldWeight,
                    true,
                  )}
                </TouchableOpacity>
              ),
            )}
          </View>
        )}

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          onPress={() =>
            navigation.navigate('EntriesStack')
          }
        >
          <Text style={[styles.primaryButtonText, { color: colors.textInverse }]}>
            {t('dashboard.newEntry')}
          </Text>
        </TouchableOpacity>

        {/* Cash Summary */}
        <Text style={[styles.sectionTitle, styles.sectionSpacing, { color: colors.textPrimary }]}>
          💰 {t('dashboard.cash')}
        </Text>

        <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <View style={styles.metricGrid}>
            <View style={styles.metricItem}>
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>
                {t('dashboard.totalReceived')}
              </Text>

              <Text style={[styles.receivedValue, { color: colors.inColor }]}>
                {formatCash(
                  summary.totalCashReceived,
                )}
              </Text>
            </View>

            <View style={styles.metricItem}>
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>
                {t('dashboard.totalGiven')}
              </Text>

              <Text style={[styles.givenValue, { color: colors.outColor }]}>
                {formatCash(
                  summary.totalCashGiven,
                )}
              </Text>
            </View>
          </View>

          <View style={[styles.summaryDivider, { backgroundColor: colors.borderLight }]} />

          <View style={styles.balanceGrid}>
            <View style={styles.balanceItem}>
              <Text style={[styles.balanceLabel, { color: colors.inColor }]}>
                {t('dashboard.toReceive')}
              </Text>

              <Text style={[styles.receiveBalance, { color: colors.inColor }]}>
                {formatCash(cashToReceive)}
              </Text>
            </View>

            <View style={styles.balanceItem}>
              <Text style={[styles.giveLabel, { color: colors.outColor }]}>
                {t('dashboard.toGive')}
              </Text>

              <Text style={[styles.giveBalance, { color: colors.outColor }]}>
                {formatCash(cashToGive)}
              </Text>
            </View>
          </View>
        </View>

        {/* Gold Summary */}
        <Text style={[styles.sectionTitle, styles.sectionSpacing, { color: colors.textPrimary }]}>
          🪙 {t('dashboard.goldSummary')}
        </Text>

        <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <View style={styles.metricGrid}>
            <View style={styles.metricItem}>
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>
                {t('dashboard.totalReceived')}
              </Text>

              <Text style={[styles.goldReceivedValue, { color: colors.gold }]}>
                {formatGold(
                  summary.totalGoldReceived,
                )}
              </Text>
            </View>

            <View style={styles.metricItem}>
              <Text style={[styles.metricLabel, { color: colors.textMuted }]}>
                {t('dashboard.totalGiven')}
              </Text>

              <Text style={[styles.goldGivenValue, { color: colors.goldLight }]}>
                {formatGold(
                  summary.totalGoldGiven,
                )}
              </Text>
            </View>
          </View>

          <View style={[styles.summaryDivider, { backgroundColor: colors.borderLight }]} />

          <View style={styles.balanceGrid}>
            <View style={styles.balanceItem}>
              <Text style={[styles.balanceLabel, { color: colors.gold }]}>
                {t('dashboard.toReceive')}
              </Text>

              <Text style={[styles.goldReceiveBalance, { color: colors.gold }]}>
                {formatGold(goldToReceive)}
              </Text>
            </View>

            <View style={styles.balanceItem}>
              <Text style={[styles.giveLabel, { color: colors.goldLight }]}>
                {t('dashboard.toGive')}
              </Text>

              <Text style={[styles.goldGiveBalance, { color: colors.goldLight }]}>
                {formatGold(goldToGive)}
              </Text>
            </View>
          </View>
        </View>

        {/* Period Summary */}
        <View style={[styles.sectionHeader, styles.sectionSpacing]}>
          <View>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {t('dashboard.summary')}
            </Text>

            <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
              {t('dashboard.periodStatus')}
            </Text>
          </View>
        </View>

        <View style={[styles.periodCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <View style={styles.periodRow}>
            <View style={[styles.periodIcon, { backgroundColor: colors.inBg }]}>
              <Text>↓</Text>
            </View>

            <View style={styles.periodContent}>
              <Text style={[styles.periodText, { color: colors.textMuted }]}>
                {t('dashboard.periodReceived')}
              </Text>

              <Text style={[styles.periodValue, { color: colors.inColor }]}>
                {formatCash(
                  summary.totalCashReceived,
                )}
              </Text>

              <Text style={[styles.periodSecondary, { color: colors.textDisabled }]}>
                {t('dashboard.gold')}{' '}
                {formatGold(
                  summary.totalGoldReceived,
                )}
              </Text>
            </View>
          </View>

          <View style={[styles.periodDivider, { backgroundColor: colors.borderLight }]} />

          <View style={styles.periodRow}>
            <View style={[styles.periodIconOut, { backgroundColor: colors.outBg }]}>
              <Text>↑</Text>
            </View>

            <View style={styles.periodContent}>
              <Text style={[styles.periodText, { color: colors.textMuted }]}>
                {t('dashboard.periodGiven')}
              </Text>

              <Text style={[styles.periodValueOut, { color: colors.outColor }]}>
                {formatCash(
                  summary.totalCashGiven,
                )}
              </Text>

              <Text style={[styles.periodSecondary, { color: colors.textDisabled }]}>
                {t('dashboard.gold')}{' '}
                {formatGold(
                  summary.totalGoldGiven,
                )}
              </Text>
            </View>
          </View>

          <View style={[styles.periodDivider, { backgroundColor: colors.borderLight }]} />

          <View style={styles.periodRow}>
            <View style={[styles.periodIconEvent, { backgroundColor: colors.primaryBg }]}>
              <Text>📅</Text>
            </View>

            <View style={styles.periodContent}>
              <Text style={[styles.periodText, { color: colors.textMuted }]}>
                {t('dashboard.eventsAttended')}
              </Text>

              <Text style={[styles.eventCountValue, { color: colors.primary }]}>
                {(summary.upcomingEvents ?? []).length}
              </Text>

              <Text style={[styles.periodSecondary, { color: colors.textDisabled }]}>
                {t('events.title')}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.reportButton, { backgroundColor: colors.textPrimary }]}
          onPress={() =>
            navigation.navigate('ReportsStack')
          }
        >
          <Text style={[styles.reportButtonText, { color: colors.textInverse }]}>
            {t('dashboard.viewReports')} ›
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Event Details Modal */}
      <Modal
        visible={!!selectedEvent}
        transparent
        animationType="slide"
        onRequestClose={() =>
          setSelectedEvent(null)
        }
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalContainer, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />

            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderContent}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                  {selectedEvent?.name}
                </Text>

                <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
                  {selectedEvent?.eventDate ? getDateParts(selectedEvent.eventDate).day + ' ' + getDateParts(selectedEvent.eventDate).month : ''}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.closeButton, { backgroundColor: colors.borderLight }]}
                onPress={() =>
                  setSelectedEvent(null)
                }
              >
                <Text style={[styles.closeText, { color: colors.textSecondary }]}>
                  ×
                </Text>
              </TouchableOpacity>
            </View>

            {/* Event Details */}
            <View style={[styles.modalDetailsSection, { backgroundColor: colors.background }]}>
              {selectedEvent?.villageName ? (
                <View style={styles.modalDetailItem}>
                  <Text style={[styles.modalDetailLabel, { color: colors.textMuted }]}>🏘️ {t('events.village')}</Text>
                  <Text style={[styles.modalDetailValue, { color: colors.textPrimary }]}>{selectedEvent.villageName}</Text>
                </View>
              ) : null}

              <View style={styles.modalDetailItem}>
                <Text style={[styles.modalDetailLabel, { color: colors.textMuted }]}>📝 {t('dashboard.totalEntries')}</Text>
                <Text style={[styles.modalDetailValue, { color: colors.textPrimary }]}>{selectedEvent?.entryCount ?? 0}</Text>
              </View>

              <View style={styles.modalDetailItem}>
                <Text style={[styles.modalDetailLabel, { color: colors.textMuted }]}>💰 {t('common.received')}</Text>
                <Text style={[styles.modalDetailValue, { color: colors.inColor }]}>{formatCash(selectedEvent?.totalReceived)}</Text>
              </View>

              <View style={styles.modalDetailItem}>
                <Text style={[styles.modalDetailLabel, { color: colors.textMuted }]}>💸 {t('common.given')}</Text>
                <Text style={[styles.modalDetailValue, { color: colors.outColor }]}>{formatCash(selectedEvent?.totalGiven)}</Text>
              </View>
            </View>

            {/* Navigate to Events */}
            <TouchableOpacity
              style={[styles.modalInvitationButton, { backgroundColor: colors.primaryBg, borderColor: colors.primary }]}
              onPress={() => {
                setSelectedEvent(null);
                navigation.navigate('EventsStack');
              }}
            >
              <Text style={styles.modalActionIcon}>📅</Text>
              <Text style={[styles.modalInvitationLabel, { color: colors.primary }]}>
                {t('dashboard.openEntry')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Entry Details Modal */}
      <Modal
        visible={!!selectedEntry}
        transparent
        animationType="slide"
        onRequestClose={() =>
          setSelectedEntry(null)
        }
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalContainer, { backgroundColor: colors.surface }]}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />

            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderContent}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                  {t('dashboard.entryDetail')}
                </Text>

                <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
                  {t('dashboard.entryId')}: {selectedEntry?.id}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.closeButton, { backgroundColor: colors.borderLight }]}
                onPress={() =>
                  setSelectedEntry(null)
                }
              >
                <Text style={[styles.closeText, { color: colors.textSecondary }]}>
                  ×
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.entryDetailCard, { backgroundColor: colors.background }]}>
              <DetailRow
                label={t('entries.personName')}
                value={
                  selectedEntry?.personName ||
                  '-'
                }
                colors={colors}
              />

              <DetailRow
                label={t('entries.village')}
                value={
                  selectedEntry?.villageName ||
                  '-'
                }
                colors={colors}
              />

              <DetailRow
                label={t('events.title')}
                value={
                  selectedEntry?.eventName ||
                  '-'
                }
                colors={colors}
              />

              <DetailRow
                label={t('dashboard.type')}
                value={t('dashboard.givenOut')}
                colors={colors}
              />

              <DetailRow
                label={t('dashboard.cash')}
                value={formatCash(
                  selectedEntry?.cashAmount,
                )}
                colors={colors}
              />

              <DetailRow
                label={t('dashboard.gold')}
                value={formatGold(
                  selectedEntry?.goldWeight,
                )}
                colors={colors}
              />
            </View>

            <TouchableOpacity
              style={[styles.modalPrimaryButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                setSelectedEntry(null);

                navigation.navigate(
                  'EntriesStack',
                  {
                    entryId:
                      selectedEntry?.id,
                  },
                );
              }}
            >
              <Text style={[styles.modalPrimaryButtonText, { color: colors.textInverse }]}>
                {t('dashboard.openEntry')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Voice Search Modal */}
      <VoiceSearchModal
        visible={voiceSearchVisible}
        onClose={() => setVoiceSearchVisible(false)}
      />
    </View>
  );
};

const DetailMetric = ({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value: string;
  valueStyle: any;
}) => {
  const { colors: themeColors } = useTheme();

  return (
    <View style={styles.detailMetric}>
      <Text style={[styles.detailMetricLabel, { color: themeColors.textMuted }]}>
        {label}
      </Text>

      <Text style={[styles.detailMetricValue, valueStyle]}>
        {value}
      </Text>
    </View>
  );
};

const DetailRow = ({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: any;
}) => (
  <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>
      {label}
    </Text>

    <Text
      style={[styles.detailValue, { color: colors.textPrimary }]}
      numberOfLines={2}
    >
      {value}
    </Text>
  </View>
);

export default DashboardScreen;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 32,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 28,
  },

  voiceSearchBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },

  greeting: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
  },

  title: {
    fontSize: 19,
    lineHeight: 28,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: -0.3,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 14,
  },

  sectionSpacing: {
    marginTop: 32,
  },

  sectionTitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: -0.2,
  },

  subSection: {
    width: '100%',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  sectionSubtitle: {
    fontSize: 12,
    marginTop: 3,
    marginRight: 10,
  },

  linkText: {
    fontSize: 12,
    fontWeight: '600',
  },

  eventsList: {
    gap: 10,
  },

  eventCard: {
    minHeight: 80,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },

  eventDateBox: {
    width: 56,
    height: 58,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  eventDateNumber: {
    fontSize: 17,
    fontWeight: '800',
  },

  eventDateMonth: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  eventInfo: {
    flex: 1,
    marginLeft: 14,
  },

  eventName: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.1,
  },

  eventLocation: {
    fontSize: 12,
    marginTop: 4,
  },

  eventEntries: {
    fontSize: 11,
    marginTop: 4,
  },

  chevron: {
    fontSize: 19,
    marginLeft: 8,
    fontWeight: '300',
  },

  secondaryButton: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },

  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },

  entriesCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  entryRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },

  lastEntryRow: {
    borderBottomWidth: 0,
  },

  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    fontSize: 14,
    fontWeight: '700',
  },

  entryInfo: {
    flex: 1,
    marginLeft: 12,
    paddingRight: 8,
  },

  personName: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.1,
  },

  villageText: {
    fontSize: 11,
    marginTop: 3,
  },

  entryEvent: {
    fontSize: 11,
    marginTop: 2,
  },

  amountColumn: {
    alignItems: 'flex-end',
    minWidth: 80,
  },

  entryCash: {
    fontSize: 13,
    fontWeight: '700',
  },

  entryGold: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
  },

  primaryButton: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },

  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  summaryCard: {
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },

  metricGrid: {
    flexDirection: 'row',
    gap: 16,
  },

  metricItem: {
    flex: 1,
  },

  metricLabel: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },

  receivedValue: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 6,
  },

  givenValue: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 6,
  },

  summaryDivider: {
    height: 1,
    marginVertical: 16,
  },

  balanceGrid: {
    flexDirection: 'row',
    gap: 16,
  },

  balanceItem: {
    flex: 1,
  },

  balanceLabel: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },

  receiveBalance: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 5,
  },

  giveLabel: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },

  giveBalance: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 5,
  },

  goldReceivedValue: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 6,
  },

  goldGivenValue: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 6,
  },

  goldReceiveBalance: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 5,
  },

  goldGiveBalance: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 5,
  },

  periodCard: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },

  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
  },

  periodIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  periodIconOut: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  periodIconEvent: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  periodContent: {
    flex: 1,
    marginLeft: 12,
  },

  periodText: {
    fontSize: 12,
    fontWeight: '500',
  },

  periodValue: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 3,
  },

  periodValueOut: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 3,
  },

  eventCountValue: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 3,
  },

  periodSecondary: {
    fontSize: 11,
    marginTop: 2,
  },

  periodDivider: {
    height: 1,
  },

  reportButton: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },

  reportButtonText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  emptyCard: {
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
  },

  emptyCardIcon: {
    fontSize: 28,
    marginBottom: 10,
  },

  emptyCardTitle: {
    fontSize: 14,
    fontWeight: '600',
  },

  emptyCardText: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: {
    marginTop: 12,
    fontSize: 13,
  },

  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },

  errorIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    textAlign: 'center',
    lineHeight: 44,
    fontSize: 19,
    fontWeight: '800',
    overflow: 'hidden',
  },

  errorTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 14,
  },

  errorText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 5,
  },

  retryButton: {
    marginTop: 18,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 9,
  },

  retryText: {
    fontSize: 12,
    fontWeight: '700',
  },

  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
  },

  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },

  modalContainer: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 32,
    maxHeight: '88%',
  },

  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 18,
  },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 18,
  },

  modalHeaderContent: {
    flex: 1,
    paddingRight: 15,
  },

  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },

  modalSubtitle: {
    fontSize: 12,
    marginTop: 5,
  },

  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },

  closeText: {
    fontSize: 21,
    lineHeight: 26,
  },

  modalEntryCount: {
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },

  modalEntryCountLabel: {
    fontSize: 12,
    fontWeight: '600',
  },

  modalEntryCountValue: {
    fontSize: 19,
    fontWeight: '800',
  },

  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 9,
  },

  modalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    gap: 10,
  },

  modalDetailItem: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },

  modalDetailsSection: {
    borderRadius: 12,
    padding: 14,
    flexDirection: 'column',
    marginBottom: 18,
  },

  modalDetailLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 3,
  },

  modalDetailValue: {
    fontSize: 13,
    fontWeight: '600',
  },

  modalActionButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 80,
  },

  modalActionIcon: {
    fontSize: 21,
    marginBottom: 6,
  },

  modalActionLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },

  modalInvitationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 10,
  },

  modalInvitationLabel: {
    fontSize: 13,
    fontWeight: '600',
  },

  checkboxOuter: {
    display: 'none',
  },

  checkboxTick: {
    display: 'none',
  },

  detailMetric: {
    width: '50%',
    paddingVertical: 8,
  },

  detailMetricLabel: {
    fontSize: 11,
  },

  detailMetricValue: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 6,
  },

  modalPrimaryButton: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },

  modalPrimaryButtonText: {
    fontSize: 13,
    fontWeight: '800',
  },

  entryDetailCard: {
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 4,
    marginBottom: 18,
  },

  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
    borderBottomWidth: 1,
  },

  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
  },

  detailValue: {
    maxWidth: '62%',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
});
