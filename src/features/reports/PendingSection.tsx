import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Feather from '@react-native-vector-icons/feather';

import { useTheme, ThemeColors } from '../../context/ThemeContext';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { pendingService } from '../../services';
import { reportExportService } from '../../services/ReportExportService';
import {
  PendingItem,
  PendingTotals,
  PendingDirection,
  PendingStatus,
  PendingFilter,
} from '../../models/Pending';
import { formatCash, formatGold, formatDate } from '../../utils/format';

interface PendingSectionProps {
  /** Base filter from the parent Reports screen (date range etc.). */
  baseFilter?: PendingFilter;
  /** Navigate to a person's full history. */
  onOpenPerson?: (personId: string, personName: string) => void;
}

type DirTab = 'RECEIVABLE' | 'PAYABLE';
type StatusFilter = 'ALL' | PendingStatus;
type KindFilter = 'ALL' | 'CASH' | 'GOLD';

export const PendingSection: React.FC<PendingSectionProps> = ({
  baseFilter,
  onOpenPerson,
}) => {
  const { colors } = useTheme();
  const { t } = useAppTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [dirTab, setDirTab] = useState<DirTab>('RECEIVABLE');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [kindFilter, setKindFilter] = useState<KindFilter>('ALL');

  const [items, setItems] = useState<PendingItem[]>([]);
  const [totals, setTotals] = useState<PendingTotals | null>(null);
  const [loading, setLoading] = useState(true);

  // Settlement modal
  const [settleItem, setSettleItem] = useState<PendingItem | null>(null);
  const [settleCash, setSettleCash] = useState('');
  const [settleGold, setSettleGold] = useState('');
  const [saving, setSaving] = useState(false);

  // Reminder picker
  const [reminderItem, setReminderItem] = useState<PendingItem | null>(null);

  const buildFilter = useCallback(
    (direction: PendingDirection): PendingFilter => ({
      ...baseFilter,
      direction,
      status: statusFilter === 'ALL' ? undefined : statusFilter,
      cashOnly: kindFilter === 'CASH' || undefined,
      goldOnly: kindFilter === 'GOLD' || undefined,
    }),
    [baseFilter, statusFilter, kindFilter],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Load both directions so the summary totals cover receivables + payables,
      // then display the active direction's list.
      const [receivables, payables] = await Promise.all([
        pendingService.getReceivables({
          ...baseFilter,
          status: statusFilter === 'ALL' ? undefined : statusFilter,
          cashOnly: kindFilter === 'CASH' || undefined,
          goldOnly: kindFilter === 'GOLD' || undefined,
        }),
        pendingService.getPayables({
          ...baseFilter,
          status: statusFilter === 'ALL' ? undefined : statusFilter,
          cashOnly: kindFilter === 'CASH' || undefined,
          goldOnly: kindFilter === 'GOLD' || undefined,
        }),
      ]);
      const all = [...receivables, ...payables];
      setTotals(pendingService.computeTotals(all));
      setItems(dirTab === 'RECEIVABLE' ? receivables : payables);
    } catch {
      setItems([]);
      setTotals(null);
    } finally {
      setLoading(false);
    }
  }, [baseFilter, dirTab, statusFilter, kindFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Settlement ──────────────────────────────────────────────────────────────

  const openSettle = (item: PendingItem) => {
    setSettleItem(item);
    setSettleCash(item.pendingCash > 0 ? String(item.pendingCash) : '');
    setSettleGold(item.pendingGold > 0 ? String(item.pendingGold) : '');
  };

  const confirmSettle = async () => {
    if (!settleItem) return;
    const cash = Number(settleCash) || 0;
    const gold = Number(settleGold) || 0;
    if (cash <= 0 && gold <= 0) {
      Alert.alert(t('common.error'), t('reports.pending.settleAmountRequired'));
      return;
    }
    setSaving(true);
    try {
      await pendingService.settle(settleItem, cash, gold, null);
      setSettleItem(null);
      await load();
    } catch {
      Alert.alert(t('common.error'), t('reports.pending.settleFailed'));
    } finally {
      setSaving(false);
    }
  };

  const performMarkFull = async (item: PendingItem) => {
    try {
      if (item.direction === 'RECEIVABLE') {
        await pendingService.markReceived(item);
      } else {
        await pendingService.markPaid(item);
      }
      await load();
    } catch {
      Alert.alert(t('common.error'), t('reports.pending.settleFailed'));
    }
  };

  const markFull = (item: PendingItem) => {
    const isReceivable = item.direction === 'RECEIVABLE';
    const amount = [
      item.pendingCash > 0 ? formatCash(item.pendingCash) : null,
      item.pendingGold > 0 ? formatGold(item.pendingGold) : null,
    ]
      .filter(Boolean)
      .join(' + ');

    Alert.alert(
      isReceivable
        ? t('reports.pending.confirmReceivedTitle')
        : t('reports.pending.confirmPaidTitle'),
      t(
        isReceivable
          ? 'reports.pending.confirmReceivedMsg'
          : 'reports.pending.confirmPaidMsg',
        { name: item.personName, amount },
      ),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: isReceivable
            ? t('reports.pending.markReceived')
            : t('reports.pending.markPaid'),
          onPress: () => performMarkFull(item),
        },
      ],
    );
  };

  // ── Reminder ──────────────────────────────────────────────────────────────────

  const onReminderPicked = async (date?: Date) => {
    const item = reminderItem;
    setReminderItem(null);
    if (!item || !date) return;
    try {
      await pendingService.setReminder(item, date.toISOString());
      await load();
      Alert.alert(t('reports.pending.reminderSet'), formatDate(date.toISOString()));
    } catch {
      /* ignore */
    }
  };

  // ── Export ──────────────────────────────────────────────────────────────────────

  const doExport = async (kind: 'pdf' | 'csv') => {
    try {
      const [receivables, payables] = await Promise.all([
        pendingService.getReceivables(baseFilter),
        pendingService.getPayables(baseFilter),
      ]);
      const data = {
        receivables,
        payables,
        totals: pendingService.computeTotals([...receivables, ...payables]),
        generatedAt: new Date().toISOString(),
      };
      const fmt = {
        cash: formatCash,
        gold: formatGold,
        date: (iso?: string | null) => (iso ? formatDate(iso) : '-'),
        statusLabel: (s: string) => t(`reports.pending.status.${s}`),
      };
      if (kind === 'pdf') {
        await reportExportService.exportPendingPdf(data, fmt);
      } else {
        await reportExportService.exportPendingCsv(data, fmt);
      }
    } catch {
      Alert.alert(t('common.error'), t('reports.pending.exportFailed'));
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const statusColor = (s: PendingStatus) =>
    s === 'SETTLED' ? colors.success : s === 'PARTIAL' ? colors.pendingColor : colors.outColor;

  return (
    <View>
      {/* Summary totals */}
      {totals && (
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>
              {t('reports.pending.totalReceivable')}
            </Text>
            <Text style={[styles.summaryValue, { color: colors.inColor }]}>
              {formatCash(totals.receivableCash)}
            </Text>
            {totals.receivableGold > 0 && (
              <Text style={[styles.summarySub, { color: colors.gold }]}>
                {formatGold(totals.receivableGold)}
              </Text>
            )}
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>
              {t('reports.pending.totalPayable')}
            </Text>
            <Text style={[styles.summaryValue, { color: colors.outColor }]}>
              {formatCash(totals.payableCash)}
            </Text>
            {totals.payableGold > 0 && (
              <Text style={[styles.summarySub, { color: colors.gold }]}>
                {formatGold(totals.payableGold)}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Export buttons */}
      <View style={styles.exportRow}>
        <TouchableOpacity
          style={[styles.exportBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
          onPress={() => doExport('pdf')}
          activeOpacity={0.8}
        >
          <Feather name="file-text" size={14} color={colors.primary} />
          <Text style={[styles.exportBtnText, { color: colors.primary }]}>{t('reports.pending.exportPdf')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.exportBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
          onPress={() => doExport('csv')}
          activeOpacity={0.8}
        >
          <Feather name="grid" size={14} color={colors.primary} />
          <Text style={[styles.exportBtnText, { color: colors.primary }]}>{t('reports.pending.exportExcel')}</Text>
        </TouchableOpacity>
      </View>

      {/* Direction tabs */}
      <View style={styles.dirTabs}>
        <DirChip
          label={t('reports.pending.receivables')}
          active={dirTab === 'RECEIVABLE'}
          onPress={() => setDirTab('RECEIVABLE')}
          colors={colors}
        />
        <DirChip
          label={t('reports.pending.payables')}
          active={dirTab === 'PAYABLE'}
          onPress={() => setDirTab('PAYABLE')}
          colors={colors}
        />
      </View>

      {/* Filters: status + kind */}
      <View style={styles.filterRow}>
        {(['ALL', 'PENDING', 'PARTIAL', 'SETTLED'] as StatusFilter[]).map(s => (
          <FilterChip
            key={s}
            label={s === 'ALL' ? t('reports.pending.all') : t(`reports.pending.status.${s}`)}
            active={statusFilter === s}
            onPress={() => setStatusFilter(s)}
            colors={colors}
          />
        ))}
      </View>
      <View style={styles.filterRow}>
        {(['ALL', 'CASH', 'GOLD'] as KindFilter[]).map(k => (
          <FilterChip
            key={k}
            label={
              k === 'ALL'
                ? t('reports.pending.all')
                : k === 'CASH'
                ? t('reports.cash')
                : t('reports.gold')
            }
            active={kindFilter === k}
            onPress={() => setKindFilter(k)}
            colors={colors}
          />
        ))}
      </View>

      {/* List */}
      {loading ? null : items.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="check-circle" size={44} color={colors.success} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            {t('reports.pending.empty')}
          </Text>
        </View>
      ) : (
        items.map(item => (
          <View
            key={item.key}
            style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
          >
            <TouchableOpacity
              style={styles.cardHeader}
              activeOpacity={0.7}
              onPress={() => onOpenPerson?.(item.personId, item.personName)}
            >
              <View style={styles.cardHeaderLeft}>
                <Text style={[styles.personName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {item.personName}
                </Text>
                {!!item.villageName && (
                  <Text style={[styles.subtle, { color: colors.textMuted }]} numberOfLines={1}>
                    {item.villageName}
                  </Text>
                )}
              </View>
              <View style={[styles.statusBadge, { backgroundColor: `${statusColor(item.status)}22` }]}>
                <Text style={[styles.statusText, { color: statusColor(item.status) }]}>
                  {t(`reports.pending.status.${item.status}`)}
                </Text>
              </View>
            </TouchableOpacity>

            <View style={styles.amountRow}>
              {item.pendingCash > 0 && (
                <View style={styles.amountCol}>
                  <Text style={[styles.amountLabel, { color: colors.textMuted }]}>
                    {t('reports.pending.cashPending')}
                  </Text>
                  <Text
                    style={[
                      styles.amountValue,
                      { color: item.direction === 'RECEIVABLE' ? colors.inColor : colors.outColor },
                    ]}
                  >
                    {formatCash(item.pendingCash)}
                  </Text>
                </View>
              )}
              {item.pendingGold > 0 && (
                <View style={styles.amountCol}>
                  <Text style={[styles.amountLabel, { color: colors.textMuted }]}>
                    {t('reports.pending.goldPending')}
                  </Text>
                  <Text style={[styles.amountValue, { color: colors.gold }]}>
                    {formatGold(item.pendingGold)}
                  </Text>
                </View>
              )}
              {item.lastEntryDate && (
                <View style={styles.amountCol}>
                  <Text style={[styles.amountLabel, { color: colors.textMuted }]}>
                    {t('common.date')}
                  </Text>
                  <Text style={[styles.amountValueSm, { color: colors.textSecondary }]}>
                    {formatDate(item.lastEntryDate)}
                  </Text>
                </View>
              )}
            </View>

            {item.reminderAt && (
              <Text style={[styles.reminderNote, { color: colors.pendingColor }]}>
                {'\u23F0'} {t('reports.pending.reminderAt', { date: formatDate(item.reminderAt) })}
              </Text>
            )}

            {/* Actions */}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                onPress={() => markFull(item)}
                activeOpacity={0.85}
              >
                <Text style={[styles.actionBtnText, { color: colors.textInverse }]}>
                  {item.direction === 'RECEIVABLE'
                    ? t('reports.pending.markReceived')
                    : t('reports.pending.markPaid')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtnOutline, { borderColor: colors.border }]}
                onPress={() => openSettle(item)}
                activeOpacity={0.85}
              >
                <Text style={[styles.actionBtnOutlineText, { color: colors.textSecondary }]}>
                  {t('reports.pending.partial')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.iconBtn, { borderColor: colors.border }]}
                onPress={() => setReminderItem(item)}
                activeOpacity={0.85}
              >
                <Feather name="bell" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      {/* Partial settlement modal */}
      <Modal visible={!!settleItem} transparent animationType="fade" onRequestClose={() => setSettleItem(null)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              {settleItem?.direction === 'RECEIVABLE'
                ? t('reports.pending.recordReceived')
                : t('reports.pending.recordPaid')}
            </Text>
            <Text style={[styles.modalSub, { color: colors.textMuted }]}>{settleItem?.personName}</Text>

            {(settleItem?.pendingCash ?? 0) > 0 && (
              <>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                  {t('reports.pending.cashAmount')} ({t('reports.pending.max')} {formatCash(settleItem?.pendingCash ?? 0)})
                </Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
                  value={settleCash}
                  onChangeText={setSettleCash}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textDisabled}
                />
              </>
            )}
            {(settleItem?.pendingGold ?? 0) > 0 && (
              <>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                  {t('reports.pending.goldAmount')} ({t('reports.pending.max')} {formatGold(settleItem?.pendingGold ?? 0)})
                </Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
                  value={settleGold}
                  onChangeText={setSettleGold}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textDisabled}
                />
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalCancel, { borderColor: colors.border }]}
                onPress={() => setSettleItem(null)}
              >
                <Text style={{ color: colors.textMuted }}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, { backgroundColor: colors.primary }]}
                onPress={confirmSettle}
                disabled={saving}
              >
                <Text style={{ color: colors.textInverse, fontWeight: '700' }}>
                  {t('common.save')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reminder date picker */}
      {reminderItem && (
        <DateTimePicker
          value={new Date(Date.now() + 24 * 60 * 60 * 1000)}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          minimumDate={new Date()}
          onValueChange={(_, date) => onReminderPicked(date)}
          onDismiss={() => setReminderItem(null)}
        />
      )}
    </View>
  );
};

// ── Small chips ──────────────────────────────────────────────────────────────────

const DirChip: React.FC<{ label: string; active: boolean; onPress: () => void; colors: ThemeColors }> = ({
  label,
  active,
  onPress,
  colors,
}) => (
  <TouchableOpacity
    style={{
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: 10,
      backgroundColor: active ? colors.primary : colors.surface,
      borderWidth: 1,
      borderColor: active ? colors.primary : colors.border,
    }}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <Text style={{ fontSize: 13, fontWeight: '700', color: active ? colors.textInverse : colors.textMuted }}>
      {label}
    </Text>
  </TouchableOpacity>
);

const FilterChip: React.FC<{ label: string; active: boolean; onPress: () => void; colors: ThemeColors }> = ({
  label,
  active,
  onPress,
  colors,
}) => (
  <TouchableOpacity
    style={{
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: active ? colors.primaryBg : colors.surface,
      borderWidth: 1,
      borderColor: active ? colors.primary : colors.borderLight,
    }}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <Text style={{ fontSize: 12, fontWeight: '600', color: active ? colors.primary : colors.textMuted }}>
      {label}
    </Text>
  </TouchableOpacity>
);

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 12 },
    emptyTitle: { fontSize: 15, fontWeight: '700', textAlign: 'center' },

    summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    summaryCard: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 14 },
    summaryLabel: { fontSize: 11, fontWeight: '600' },
    summaryValue: { fontSize: 18, fontWeight: '800', marginTop: 4 },
    summarySub: { fontSize: 12, fontWeight: '700', marginTop: 2 },

    exportRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    exportBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 9,
      borderRadius: 10,
      borderWidth: 1,
    },
    exportBtnText: { fontSize: 12, fontWeight: '700' },

    dirTabs: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },

    card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardHeaderLeft: { flex: 1, paddingRight: 10 },
    personName: { fontSize: 15, fontWeight: '700' },
    subtle: { fontSize: 12, marginTop: 1 },
    statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },

    amountRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 12 },
    amountCol: {},
    amountLabel: { fontSize: 10, fontWeight: '600' },
    amountValue: { fontSize: 15, fontWeight: '800', marginTop: 2 },
    amountValueSm: { fontSize: 12, fontWeight: '600', marginTop: 2 },

    reminderNote: { fontSize: 11, fontWeight: '600', marginTop: 8 },

    actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
    actionBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
    actionBtnText: { fontSize: 12, fontWeight: '700' },
    actionBtnOutline: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
    actionBtnOutlineText: { fontSize: 12, fontWeight: '700' },
    iconBtn: { width: 40, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalSheet: { width: '100%', borderRadius: 18, padding: 20 },
    modalTitle: { fontSize: 16, fontWeight: '800' },
    modalSub: { fontSize: 12, marginTop: 2, marginBottom: 12 },
    inputLabel: { fontSize: 12, fontWeight: '600', marginTop: 8, marginBottom: 4 },
    input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
    modalCancel: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
    modalConfirm: { flex: 2, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  });
