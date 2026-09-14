import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Feather from '@react-native-vector-icons/feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, ThemeColors } from '../../context/ThemeContext';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { loanService } from '../../services';
import {
  LoanSummary,
  ClosureSuggestion,
  GoldLoanProvider,
} from '../../finance/models/Loan';
import { formatCash, formatDate } from '../../utils/format';
import { FLOATING_TAB_BAR_CLEARANCE } from '../../theme/typography';

const LoanDetailScreen: React.FC<{ navigation?: any; route?: any }> = ({ navigation, route }) => {
  const { colors } = useTheme();
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const loanId: string = route?.params?.loanId ?? '';

  const [summary, setSummary] = useState<LoanSummary | null>(null);
  const [suggestions, setSuggestions] = useState<ClosureSuggestion[]>([]);
  const [goldProviders, setGoldProviders] = useState<GoldLoanProvider[]>([]);
  const [loading, setLoading] = useState(true);

  // Gold provider editor modal
  const [gpOpen, setGpOpen] = useState(false);
  const [gpEditId, setGpEditId] = useState<string | undefined>(undefined);
  const [gpName, setGpName] = useState('');
  const [gpRate, setGpRate] = useState('');
  const [gpPerGram, setGpPerGram] = useState('');
  const [gpLtv, setGpLtv] = useState('');
  const [gpFee, setGpFee] = useState('');
  const [gpOther, setGpOther] = useState('');
  const [gpSaving, setGpSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await loanService.getLoanSummary(loanId);
      setSummary(s);
      if (s) {
        setSuggestions(loanService.getClosureSuggestions(s.loan));
        if (s.loan.loanType === 'GOLD') {
          setGoldProviders(await loanService.getGoldProviders());
        }
      }
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [loanId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleEmiReminder = async () => {
    if (!summary) return;
    const scheduled = await loanService.setEmiReminder(summary.loan, true);
    Alert.alert(
      t('finance.reminder'),
      scheduled ? t('finance.reminderSet') : t('finance.reminderNotSet'),
    );
  };

  const handleDueDateReminder = async () => {
    if (!summary) return;
    const scheduled = await loanService.setDueDateReminder(summary.loan, true);
    Alert.alert(
      t('finance.reminder'),
      scheduled ? t('finance.reminderSet') : t('finance.reminderNotSet'),
    );
  };

  const handleMarkClosed = () => {
    if (!summary) return;
    Alert.alert(t('finance.markClosed'), t('finance.markClosedConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('finance.markClosed'),
        onPress: async () => {
          try {
            await loanService.markClosed(loanId);
            await load();
          } catch {
            Alert.alert(t('common.error'), t('finance.saveFailed'));
          }
        },
      },
    ]);
  };

  const openGpEditor = (p?: GoldLoanProvider) => {
    setGpEditId(p?.id);
    setGpName(p?.provider ?? '');
    setGpRate(p ? String(p.interestRate) : '');
    setGpPerGram(p ? String(p.amountPerGram) : '');
    setGpLtv(p ? String(p.ltv) : '');
    setGpFee(p ? String(p.processingFee) : '');
    setGpOther(p?.otherCharges ?? '');
    setGpOpen(true);
  };

  const saveGoldProvider = async () => {
    if (!gpName.trim()) {
      Alert.alert(t('common.error'), t('finance.provider'));
      return;
    }
    setGpSaving(true);
    try {
      await loanService.saveGoldProvider(
        {
          provider: gpName.trim(),
          interestRate: Number(gpRate) || 0,
          amountPerGram: Number(gpPerGram) || 0,
          ltv: Number(gpLtv) || 0,
          processingFee: Number(gpFee) || 0,
          otherCharges: gpOther.trim() || null,
        },
        gpEditId,
      );
      setGpOpen(false);
      setGoldProviders(await loanService.getGoldProviders());
    } catch {
      Alert.alert(t('common.error'), t('finance.saveFailed'));
    } finally {
      setGpSaving(false);
    }
  };

  const deleteGoldProvider = (p: GoldLoanProvider) => {
    Alert.alert(t('common.delete'), p.provider, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await loanService.deleteGoldProvider(p.id);
          setGoldProviders(await loanService.getGoldProviders());
        },
      },
    ]);
  };

  if (loading || !summary) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="arrow-left" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          {loading ? <ActivityIndicator size="large" color={colors.primary} /> : null}
        </View>
      </View>
    );
  }

  const loan = summary.loan;
  const isActive = loan.status === 'ACTIVE';
  const sColor = isActive ? colors.pendingColor : colors.success;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{loan.provider}</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {t(`finance.loanType.${loan.loanType}`)}
          </Text>
        </View>
        <TouchableOpacity onPress={() => navigation?.navigate('AddEditLoan', { loanId })} style={styles.backBtn}>
          <Feather name="edit-2" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Outstanding hero + status */}
        <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <Text style={[styles.heroLabel, { color: colors.textMuted }]}>{t('finance.outstanding')}</Text>
          <Text style={[styles.heroValue, { color: colors.outColor }]}>{formatCash(summary.outstandingAmount)}</Text>
          <View style={[styles.statusChip, { backgroundColor: `${sColor}22` }]}>
            <Text style={[styles.statusChipText, { color: sColor }]}>{t(`finance.loanStatus.${loan.status}`)}</Text>
          </View>
        </View>

        {/* Details */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <Row label={t('finance.loanAmount')} value={formatCash(loan.loanAmount)} colors={colors} />
          <Row label={t('finance.outstanding')} value={formatCash(summary.outstandingAmount)} colors={colors} />
          <Row label={t('finance.provider')} value={loan.provider} colors={colors} />
          <Row label={t('finance.interestRate')} value={`${loan.interestRate}%`} colors={colors} />
          <Divider colors={colors} />
          <Row label={t('finance.emi')} value={formatCash(loan.monthlyEMI)} colors={colors} />
          <Row label={t('finance.emiDateLabel')} value={String(loan.emiDate)} colors={colors} />
          <Row label={t('finance.startDate')} value={formatDate(loan.startDate)} colors={colors} />
          <Row label={t('finance.tenure')} value={`${loan.tenure} ${t('finance.months')}`} colors={colors} />
          <Divider colors={colors} />
          <Row label={t('finance.paidEmis')} value={`${loan.paidEMIs} / ${loan.totalEMIs}`} colors={colors} />
          <Row label={t('finance.remainingEmis')} value={String(summary.remainingEMIs)} colors={colors} strong />
          {summary.nextEmiDate ? (
            <Row label={t('finance.nextEmi')} value={formatDate(summary.nextEmiDate)} colors={colors} strong />
          ) : null}
        </View>

        {/* Actions */}
        <View style={styles.actionsGrid}>
          <ActionButton icon="bell" label={t('finance.setEmiReminder')} onPress={handleEmiReminder} colors={colors} disabled={!isActive} />
          <ActionButton icon="clock" label={t('finance.setDueDateReminder')} onPress={handleDueDateReminder} colors={colors} disabled={!isActive} />
          {isActive ? (
            <ActionButton icon="check-circle" label={t('finance.markClosed')} onPress={handleMarkClosed} colors={colors} />
          ) : null}
        </View>

        {/* Close Loan Faster suggestions (active loans only) */}
        {isActive && suggestions.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('finance.closeFaster')}</Text>
            {suggestions.map(s => (
              <View key={s.key} style={[styles.suggestionCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                <View style={[styles.suggestionIcon, { backgroundColor: colors.primaryBg }]}>
                  <Feather name="trending-down" size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.suggestionTitle, { color: colors.textPrimary }]}>
                    {t(`finance.closure.${s.key}`)}
                  </Text>
                  <Text style={[styles.suggestionDesc, { color: colors.textMuted }]}>
                    {t(`finance.closureDesc.${s.key}`)}
                  </Text>
                  {s.estimatedSaving != null && s.estimatedSaving > 0 ? (
                    <Text style={[styles.suggestionSaving, { color: colors.success }]}>
                      {t('finance.estSaving')}: {formatCash(s.estimatedSaving)}
                      {s.monthsSaved != null && s.monthsSaved > 0
                        ? ` · ${s.monthsSaved} ${t('finance.months')}`
                        : ''}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Gold Loan Comparison (gold loans only) */}
        {loan.loanType === 'GOLD' && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('finance.goldComparison')}</Text>
              <TouchableOpacity onPress={() => openGpEditor()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="plus" size={18} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.goldNote, { color: colors.textMuted }]}>{t('finance.goldComparisonNote')}</Text>

            {goldProviders.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>{t('finance.goldNoProviders')}</Text>
            ) : (
              goldProviders.map(p => (
                <TouchableOpacity
                  key={p.id}
                  activeOpacity={0.8}
                  onPress={() => openGpEditor(p)}
                  onLongPress={() => deleteGoldProvider(p)}
                  style={[styles.goldCard, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
                >
                  <Text style={[styles.goldProvider, { color: colors.textPrimary }]}>{p.provider}</Text>
                  <View style={styles.goldGrid}>
                    <GoldStat label={t('finance.interestRate')} value={`${p.interestRate}%`} colors={colors} />
                    <GoldStat label={t('finance.amountPerGram')} value={formatCash(p.amountPerGram)} colors={colors} />
                    <GoldStat label={t('finance.ltv')} value={`${p.ltv}%`} colors={colors} />
                    <GoldStat label={t('finance.processingFee')} value={String(p.processingFee)} colors={colors} />
                  </View>
                  {p.otherCharges ? (
                    <Text style={[styles.goldOther, { color: colors.textMuted }]}>
                      {t('finance.otherCharges')}: {p.otherCharges}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        {loan.notes ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight, marginTop: 6 }]}>
            <Text style={[styles.notesLabel, { color: colors.textMuted }]}>{t('finance.notes')}</Text>
            <Text style={[styles.notesText, { color: colors.textPrimary }]}>{loan.notes}</Text>
          </View>
        ) : null}

        <View style={{ height: insets.bottom + FLOATING_TAB_BAR_CLEARANCE }} />
      </ScrollView>

      {/* Gold provider editor modal */}
      <Modal visible={gpOpen} transparent animationType="fade" onRequestClose={() => setGpOpen(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{t('finance.goldProviderTitle')}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <GpInput label={t('finance.provider')} value={gpName} onChangeText={setGpName} colors={colors} autoCapitalize="words" />
              <GpInput label={t('finance.interestRate')} value={gpRate} onChangeText={setGpRate} colors={colors} keyboardType="decimal-pad" />
              <GpInput label={t('finance.amountPerGram')} value={gpPerGram} onChangeText={setGpPerGram} colors={colors} keyboardType="decimal-pad" />
              <GpInput label={t('finance.ltv')} value={gpLtv} onChangeText={setGpLtv} colors={colors} keyboardType="decimal-pad" />
              <GpInput label={t('finance.processingFee')} value={gpFee} onChangeText={setGpFee} colors={colors} keyboardType="decimal-pad" />
              <GpInput label={t('finance.otherCharges')} value={gpOther} onChangeText={setGpOther} colors={colors} />
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalCancel, { borderColor: colors.border }]} onPress={() => setGpOpen(false)}>
                <Text style={{ color: colors.textMuted }}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirm, { backgroundColor: colors.primary }]} onPress={saveGoldProvider} disabled={gpSaving}>
                <Text style={{ color: colors.textInverse, fontWeight: '700' }}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const Row: React.FC<{ label: string; value: string; colors: ThemeColors; strong?: boolean }> = ({ label, value, colors, strong }) => (
  <View style={rowStyles.row}>
    <Text style={[rowStyles.label, { color: colors.textMuted }]}>{label}</Text>
    <Text style={[rowStyles.value, { color: colors.textPrimary, fontWeight: strong ? '800' : '600' }]}>{value}</Text>
  </View>
);

const Divider: React.FC<{ colors: ThemeColors }> = ({ colors }) => (
  <View style={[rowStyles.divider, { backgroundColor: colors.borderLight }]} />
);

const ActionButton: React.FC<{ icon: any; label: string; onPress: () => void; colors: ThemeColors; disabled?: boolean }> = ({ icon, label, onPress, colors, disabled }) => (
  <TouchableOpacity
    style={[actionStyles.btn, { backgroundColor: colors.surface, borderColor: colors.borderLight, opacity: disabled ? 0.5 : 1 }]}
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.8}
  >
    <Feather name={icon} size={18} color={colors.primary} />
    <Text style={[actionStyles.label, { color: colors.textPrimary }]}>{label}</Text>
  </TouchableOpacity>
);

const GoldStat: React.FC<{ label: string; value: string; colors: ThemeColors }> = ({ label, value, colors }) => (
  <View style={goldStyles.stat}>
    <Text style={[goldStyles.statLabel, { color: colors.textMuted }]}>{label}</Text>
    <Text style={[goldStyles.statValue, { color: colors.textPrimary }]}>{value}</Text>
  </View>
);

const GpInput: React.FC<any> = ({ label, colors, ...rest }) => (
  <View style={{ marginBottom: 10 }}>
    <Text style={[{ fontSize: 12, fontWeight: '600', marginBottom: 6 }, { color: colors.textSecondary }]}>{label}</Text>
    <TextInput
      style={[{ height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 14 }, { borderColor: colors.border, color: colors.textPrimary }]}
      placeholderTextColor={colors.textDisabled}
      {...rest}
    />
  </View>
);

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
  label: { fontSize: 13, fontWeight: '500', flex: 1 },
  value: { fontSize: 13, textAlign: 'right', flex: 1 },
  divider: { height: 1, marginVertical: 6 },
});

const actionStyles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexGrow: 1,
    flexBasis: '47%',
  },
  label: { fontSize: 13, fontWeight: '700' },
});

const goldStyles = StyleSheet.create({
  stat: { width: '48%', marginBottom: 8 },
  statLabel: { fontSize: 11, fontWeight: '500' },
  statValue: { fontSize: 14, fontWeight: '700', marginTop: 1 },
});

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 18, fontWeight: '800' },
    subtitle: { fontSize: 12, marginTop: 1 },
    content: { paddingHorizontal: 16, paddingTop: 4 },
    hero: { borderRadius: 16, borderWidth: 1, padding: 18, alignItems: 'center', marginBottom: 12 },
    heroLabel: { fontSize: 12, fontWeight: '600' },
    heroValue: { fontSize: 28, fontWeight: '800', marginTop: 4 },
    statusChip: { marginTop: 10, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 },
    statusChipText: { fontSize: 12, fontWeight: '800' },
    card: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 12 },
    actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
    section: { marginTop: 10 },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 8 },
    suggestionCard: { flexDirection: 'row', gap: 12, borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
    suggestionIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    suggestionTitle: { fontSize: 14, fontWeight: '700' },
    suggestionDesc: { fontSize: 12, marginTop: 2, lineHeight: 17 },
    suggestionSaving: { fontSize: 12, fontWeight: '700', marginTop: 6 },
    goldNote: { fontSize: 11, marginBottom: 10, lineHeight: 16 },
    goldCard: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
    goldProvider: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
    goldGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    goldOther: { fontSize: 12, marginTop: 4 },
    emptyText: { fontSize: 13, textAlign: 'center', paddingVertical: 20 },
    notesLabel: { fontSize: 12, fontWeight: '600' },
    notesText: { fontSize: 14, marginTop: 6, lineHeight: 20 },
    modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
    modalSheet: { width: '100%', maxHeight: '82%', borderRadius: 18, padding: 20 },
    modalTitle: { fontSize: 17, fontWeight: '800', marginBottom: 14 },
    modalActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
    modalCancel: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    modalConfirm: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  });

export default LoanDetailScreen;
