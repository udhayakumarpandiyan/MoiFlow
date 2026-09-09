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
  LoanPayment,
  LoanStatus,
  LOAN_STATUSES,
} from '../../finance/models/Loan';
import { formatCash, formatDate } from '../../utils/format';

const LoanDetailScreen: React.FC<{ navigation?: any; route?: any }> = ({ navigation, route }) => {
  const { colors } = useTheme();
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const loanId: string = route?.params?.loanId ?? '';

  const [summary, setSummary] = useState<LoanSummary | null>(null);
  const [payments, setPayments] = useState<LoanPayment[]>([]);
  const [loading, setLoading] = useState(true);

  const [payOpen, setPayOpen] = useState(false);
  const [payPrincipal, setPayPrincipal] = useState('');
  const [payInterest, setPayInterest] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([
        loanService.getLoanSummary(loanId),
        loanService.getPayments(loanId),
      ]);
      setSummary(s);
      setPayments(p);
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

  const isLent = summary?.loan.direction === 'LENT';

  const openPay = () => {
    if (!summary) return;
    setPayPrincipal(summary.remainingPrincipal > 0 ? String(summary.remainingPrincipal) : '');
    setPayInterest(summary.remainingInterest > 0 ? String(summary.remainingInterest) : '');
    setPayOpen(true);
  };

  const confirmPay = async () => {
    if (!summary) return;
    const p = Number(payPrincipal) || 0;
    const i = Number(payInterest) || 0;
    if (p <= 0 && i <= 0) {
      Alert.alert(t('common.error'), t('finance.paymentRequired'));
      return;
    }
    setSaving(true);
    try {
      await loanService.recordPayment({ loanId, principalPaid: p, interestPaid: i });
      setPayOpen(false);
      await load();
    } catch {
      Alert.alert(t('common.error'), t('finance.paymentFailed'));
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status: LoanStatus) => {
    setStatusOpen(false);
    try {
      await loanService.setStatus(loanId, status);
      await load();
    } catch {
      /* ignore */
    }
  };

  const statusColor = (s: string) =>
    s === 'SETTLED' ? colors.success : s === 'BAD_DEBT' ? colors.error : s === 'EXPECTED' ? colors.info : colors.pendingColor;

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

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{loan.partyName}</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {t(`finance.loanType.${loan.loanType}`)} · {isLent ? t('finance.lent') : t('finance.borrowed')}
          </Text>
        </View>
        <TouchableOpacity onPress={() => navigation?.navigate('AddEditLoan', { loanId })} style={styles.backBtn}>
          <Feather name="edit-2" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Outstanding hero + status */}
        <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <Text style={[styles.heroLabel, { color: colors.textMuted }]}>
            {isLent ? t('finance.totalReceivable') : t('finance.totalPayable')}
          </Text>
          <Text style={[styles.heroValue, { color: isLent ? colors.inColor : colors.outColor }]}>
            {formatCash(summary.totalOutstanding)}
          </Text>
          <TouchableOpacity
            style={[styles.statusChip, { backgroundColor: `${statusColor(loan.status)}22` }]}
            onPress={() => setStatusOpen(true)}
          >
            <Text style={[styles.statusChipText, { color: statusColor(loan.status) }]}>
              {t(`finance.status.${loan.status}`)}
            </Text>
            <Feather name="chevron-down" size={13} color={statusColor(loan.status)} />
          </TouchableOpacity>
        </View>

        {/* Breakdown */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <Row label={t('finance.principal')} value={formatCash(loan.principal)} colors={colors} />
          <Row label={`${t('finance.interestRate')}`} value={`${loan.interestRate}% · ${t(`finance.interestType.${loan.interestType}`)}`} colors={colors} />
          <Row label={t('finance.interestAccrued')} value={formatCash(summary.interestAccrued)} colors={colors} />
          <Divider colors={colors} />
          <Row label={isLent ? t('finance.principalReceived') : t('finance.principalPaid')} value={formatCash(summary.principalPaid)} colors={colors} />
          <Row label={isLent ? t('finance.interestReceived') : t('finance.interestPaid')} value={formatCash(summary.interestPaid)} colors={colors} />
          <Divider colors={colors} />
          <Row label={t('finance.remainingPrincipal')} value={formatCash(summary.remainingPrincipal)} colors={colors} strong />
          <Row label={t('finance.remainingInterest')} value={formatCash(summary.remainingInterest)} colors={colors} strong />
          <Row label={t('finance.totalOutstanding')} value={formatCash(summary.totalOutstanding)} colors={colors} strong highlight={isLent ? colors.inColor : colors.outColor} />
          <View style={styles.datesRow}>
            <Text style={[styles.dateMeta, { color: colors.textMuted }]}>{t('finance.loanDate')}: {formatDate(loan.loanDate)}</Text>
            {loan.dueDate ? <Text style={[styles.dateMeta, { color: colors.textMuted }]}>{t('finance.dueDate')}: {formatDate(loan.dueDate)}</Text> : null}
          </View>
        </View>

        {/* Record payment */}
        {!summary.isCleared && (
          <TouchableOpacity style={[styles.payBtn, { backgroundColor: colors.primary }]} onPress={openPay} activeOpacity={0.85}>
            <Feather name="plus-circle" size={18} color={colors.textInverse} />
            <Text style={[styles.payBtnText, { color: colors.textInverse }]}>
              {isLent ? t('finance.recordReceipt') : t('finance.recordPayment')}
            </Text>
          </TouchableOpacity>
        )}

        {/* Payment history */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('finance.paymentHistory')}</Text>
        {payments.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>{t('finance.noPayments')}</Text>
        ) : (
          payments
            .slice()
            .reverse()
            .map(p => (
              <View key={p.id} style={[styles.payRow, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.payRowTitle, { color: colors.textPrimary }]}>{formatDate(p.paymentDate)}</Text>
                  {!!p.note && <Text style={[styles.payRowNote, { color: colors.textMuted }]}>{p.note}</Text>}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {p.principalPaid > 0 && (
                    <Text style={[styles.payAmt, { color: colors.textSecondary }]}>
                      {t('finance.paymentPrincipal')}: {formatCash(p.principalPaid)}
                    </Text>
                  )}
                  {p.interestPaid > 0 && (
                    <Text style={[styles.payAmt, { color: colors.textSecondary }]}>
                      {t('finance.paymentInterest')}: {formatCash(p.interestPaid)}
                    </Text>
                  )}
                </View>
              </View>
            ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Record payment modal */}
      <Modal visible={payOpen} transparent animationType="fade" onRequestClose={() => setPayOpen(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              {isLent ? t('finance.recordReceipt') : t('finance.recordPayment')}
            </Text>
            <Text style={[styles.modalSub, { color: colors.textMuted }]}>{loan.partyName}</Text>

            {summary.remainingPrincipal > 0 && (
              <>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                  {t('finance.paymentPrincipal')} ({t('finance.remainingPrincipal')}: {formatCash(summary.remainingPrincipal)})
                </Text>
                <TextInput style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]} value={payPrincipal} onChangeText={setPayPrincipal} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.textDisabled} />
              </>
            )}
            {summary.remainingInterest > 0 && (
              <>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                  {t('finance.paymentInterest')} ({t('finance.remainingInterest')}: {formatCash(summary.remainingInterest)})
                </Text>
                <TextInput style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]} value={payInterest} onChangeText={setPayInterest} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.textDisabled} />
              </>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalCancel, { borderColor: colors.border }]} onPress={() => setPayOpen(false)}>
                <Text style={{ color: colors.textMuted }}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirm, { backgroundColor: colors.primary }]} onPress={confirmPay} disabled={saving}>
                <Text style={{ color: colors.textInverse, fontWeight: '700' }}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Status change sheet */}
      <Modal visible={statusOpen} transparent animationType="fade" onRequestClose={() => setStatusOpen(false)}>
        <TouchableOpacity style={[styles.modalOverlay, { backgroundColor: colors.overlay }]} activeOpacity={1} onPress={() => setStatusOpen(false)}>
          <View style={[styles.statusSheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary, marginBottom: 8 }]}>{t('finance.changeStatus')}</Text>
            {LOAN_STATUSES.map(s => (
              <TouchableOpacity key={s} style={styles.statusOption} onPress={() => changeStatus(s)}>
                <View style={[styles.statusDot, { backgroundColor: statusColor(s) }]} />
                <Text style={[styles.statusOptionText, { color: colors.textPrimary }]}>{t(`finance.status.${s}`)}</Text>
                {loan.status === s ? <Feather name="check" size={16} color={colors.primary} /> : null}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const Row: React.FC<{ label: string; value: string; colors: ThemeColors; strong?: boolean; highlight?: string }> = ({ label, value, colors, strong, highlight }) => (
  <View style={rowStyles.row}>
    <Text style={[rowStyles.label, { color: colors.textMuted }]}>{label}</Text>
    <Text style={[rowStyles.value, { color: highlight ?? colors.textPrimary, fontWeight: strong ? '800' : '600' }]}>{value}</Text>
  </View>
);

const Divider: React.FC<{ colors: ThemeColors }> = ({ colors }) => (
  <View style={[rowStyles.divider, { backgroundColor: colors.borderLight }]} />
);

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  label: { fontSize: 13 },
  value: { fontSize: 14 },
  divider: { height: 1, marginVertical: 8 },
});

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 18, fontWeight: '800' },
    subtitle: { fontSize: 12, marginTop: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    content: { paddingHorizontal: 16, paddingTop: 4 },
    hero: { borderRadius: 16, borderWidth: 1, padding: 18, alignItems: 'center', marginBottom: 12 },
    heroLabel: { fontSize: 12, fontWeight: '600' },
    heroValue: { fontSize: 30, fontWeight: '800', marginTop: 4 },
    statusChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5, marginTop: 12 },
    statusChipText: { fontSize: 12, fontWeight: '800' },
    card: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 14 },
    datesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12 },
    dateMeta: { fontSize: 11, fontWeight: '500' },
    payBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 13, marginBottom: 18 },
    payBtnText: { fontSize: 14, fontWeight: '700' },
    sectionTitle: { fontSize: 14, fontWeight: '800', marginBottom: 8 },
    emptyText: { fontSize: 13, paddingVertical: 12 },
    payRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8 },
    payRowTitle: { fontSize: 13, fontWeight: '700' },
    payRowNote: { fontSize: 12, marginTop: 2 },
    payAmt: { fontSize: 12, fontWeight: '600' },
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalSheet: { width: '100%', borderRadius: 18, padding: 20 },
    modalTitle: { fontSize: 16, fontWeight: '800' },
    modalSub: { fontSize: 12, marginTop: 2, marginBottom: 12 },
    inputLabel: { fontSize: 12, fontWeight: '600', marginTop: 8, marginBottom: 4 },
    input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
    modalCancel: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
    modalConfirm: { flex: 2, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
    statusSheet: { width: '100%', borderRadius: 18, padding: 16 },
    statusOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    statusDot: { width: 10, height: 10, borderRadius: 5 },
    statusOptionText: { fontSize: 14, fontWeight: '600', flex: 1 },
  });

export default LoanDetailScreen;
