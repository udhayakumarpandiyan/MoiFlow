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

import { useTheme, ThemeColors } from '@common/context/ThemeContext';
import { useAppTranslation } from '@common/hooks/useAppTranslation';
import { businessService } from '@common/services';
import { TransactionView, Party } from '@finance/models/Business';
import { formatCash, formatDate } from '@common/utils/format';
import { FLOATING_TAB_BAR_CLEARANCE } from '@common/theme/typography';

const TransactionDetailScreen: React.FC<{ navigation?: any; route?: any }> = ({ navigation, route }) => {
  const { colors } = useTheme();
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const transactionId: string = route?.params?.transactionId ?? '';

  const [view, setView] = useState<TransactionView | null>(null);
  const [party, setParty] = useState<Party | null>(null);
  const [loading, setLoading] = useState(true);

  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const v = await businessService.getTransactionView(transactionId);
      setView(v);
      if (v) setParty(await businessService.getParty(v.transaction.partyId));
    } catch {
      setView(null);
    } finally {
      setLoading(false);
    }
  }, [transactionId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const isSale = view?.transaction.kind === 'SALE';

  const openPay = () => {
    if (!view) return;
    setPayAmount(view.outstanding > 0 ? String(view.outstanding) : '');
    setPayOpen(true);
  };

  const confirmPay = async () => {
    const amt = Number(payAmount) || 0;
    if (amt <= 0) {
      Alert.alert(t('common.error'), t('business.paymentRequired'));
      return;
    }
    setSaving(true);
    try {
      await businessService.recordPayment(transactionId, amt);
      setPayOpen(false);
      await load();
    } catch {
      Alert.alert(t('common.error'), t('business.paymentFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(t('business.deleteTransaction'), t('business.deleteTransactionConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await businessService.deleteTransaction(transactionId);
          navigation?.goBack();
        },
      },
    ]);
  };

  if (loading || !view) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="arrow-left" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>{loading ? <ActivityIndicator size="large" color={colors.primary} /> : null}</View>
      </View>
    );
  }

  const txn = view.transaction;
  const statusColor = view.status === 'PAID' ? colors.success : view.status === 'PARTIAL' ? colors.pendingColor : colors.error;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {isSale ? t('business.sale') : t('business.purchase')}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>{party?.name ?? t('business.unknownParty')}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation?.navigate('AddEditTransaction', { transactionId, kind: txn.kind })} style={styles.backBtn}>
          <Feather name="edit-2" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Outstanding hero */}
        <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <Text style={[styles.heroLabel, { color: colors.textMuted }]}>{t('business.outstanding')}</Text>
          <Text style={[styles.heroValue, { color: view.outstanding > 0 ? colors.outColor : colors.success }]}>
            {formatCash(view.outstanding)}
          </Text>
          <View style={[styles.statusChip, { backgroundColor: `${statusColor}22` }]}>
            <Text style={[styles.statusChipText, { color: statusColor }]}>{t(`business.paymentStatus.${view.status}`)}</Text>
          </View>
        </View>

        {/* Details */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <Row label={isSale ? t('business.customer') : t('business.supplier')} value={party?.name ?? '-'} colors={colors} />
          <Row label={isSale ? t('business.saleDate') : t('business.purchaseDate')} value={formatDate(txn.date)} colors={colors} />
          {txn.description ? <Row label={t('business.itemDescription')} value={txn.description} colors={colors} /> : null}
          {txn.quantity > 0 ? <Row label={t('business.quantity')} value={String(txn.quantity)} colors={colors} /> : null}
          <Divider colors={colors} />
          <Row label={t('business.amount')} value={formatCash(txn.amount)} colors={colors} />
          <Row label={isSale ? t('business.amountReceived') : t('business.amountPaid')} value={formatCash(txn.amountSettled)} colors={colors} />
          <Row label={t('business.outstanding')} value={formatCash(view.outstanding)} colors={colors} strong highlight={view.outstanding > 0 ? colors.outColor : colors.success} />
          {txn.notes ? <><Divider colors={colors} /><Row label={t('business.notes')} value={txn.notes} colors={colors} /></> : null}
        </View>

        {/* Record payment */}
        {view.outstanding > 0 && (
          <TouchableOpacity style={[styles.payBtn, { backgroundColor: colors.primary }]} onPress={openPay} activeOpacity={0.85}>
            <Feather name="plus-circle" size={18} color={colors.textInverse} />
            <Text style={[styles.payBtnText, { color: colors.textInverse }]}>
              {isSale ? t('business.recordReceipt') : t('business.recordPayment')}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} activeOpacity={0.7}>
          <Feather name="trash-2" size={16} color={colors.error} />
          <Text style={[styles.deleteText, { color: colors.error }]}>{t('business.deleteTransaction')}</Text>
        </TouchableOpacity>

        <View style={{ height: insets.bottom + FLOATING_TAB_BAR_CLEARANCE }} />
      </ScrollView>

      {/* Record payment modal */}
      <Modal visible={payOpen} transparent animationType="fade" onRequestClose={() => setPayOpen(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              {isSale ? t('business.recordReceipt') : t('business.recordPayment')}
            </Text>
            <Text style={[styles.modalSub, { color: colors.textMuted }]}>
              {t('business.outstanding')}: {formatCash(view.outstanding)}
            </Text>
            <TextInput
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
              value={payAmount}
              onChangeText={setPayAmount}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textDisabled}
            />
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
  label: { fontSize: 13, fontWeight: '500', flex: 1 },
  value: { fontSize: 13, textAlign: 'right', flex: 1 },
  divider: { height: 1, marginVertical: 6 },
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
    payBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 14 },
    payBtnText: { fontSize: 14, fontWeight: '700' },
    deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingVertical: 12 },
    deleteText: { fontSize: 13, fontWeight: '700' },
    modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
    modalSheet: { width: '100%', borderRadius: 18, padding: 20 },
    modalTitle: { fontSize: 17, fontWeight: '800' },
    modalSub: { fontSize: 13, marginTop: 4, marginBottom: 12 },
    input: { height: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
    modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
    modalCancel: { flex: 1, height: 46, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    modalConfirm: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  });

export default TransactionDetailScreen;
