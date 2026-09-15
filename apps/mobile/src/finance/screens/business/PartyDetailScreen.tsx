import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Feather from '@react-native-vector-icons/feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, ThemeColors } from '@common/context/ThemeContext';
import { useAppTranslation } from '@common/hooks/useAppTranslation';
import { businessService } from '@common/services';
import { PartySummary, TransactionView } from '@finance/models/Business';
import { formatCash, formatDate } from '@common/utils/format';
import { FLOATING_TAB_BAR_CLEARANCE } from '@common/theme/typography';

const PartyDetailScreen: React.FC<{ navigation?: any; route?: any }> = ({ navigation, route }) => {
  const { colors } = useTheme();
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const partyId: string = route?.params?.partyId ?? '';

  const [summary, setSummary] = useState<PartySummary | null>(null);
  const [transactions, setTransactions] = useState<TransactionView[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const detail = await businessService.getPartyDetail(partyId);
      if (detail) {
        setSummary(detail.summary);
        setTransactions(detail.transactions);
      } else {
        setSummary(null);
      }
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [partyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleDelete = () => {
    if (!summary) return;
    Alert.alert(t('business.deleteParty'), t('business.deletePartyConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await businessService.deleteParty(partyId);
          navigation?.goBack();
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
        <View style={styles.center}>{loading ? <ActivityIndicator size="large" color={colors.primary} /> : null}</View>
      </View>
    );
  }

  const party = summary.party;
  const isCustomer = party.kind === 'CUSTOMER';
  const statusColor = (s: string) =>
    s === 'PAID' ? colors.success : s === 'PARTIAL' ? colors.pendingColor : colors.error;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>{party.name}</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {isCustomer ? t('business.customer') : t('business.supplier')}
            {party.phone ? ` · ${party.phone}` : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={() => navigation?.navigate('AddEditParty', { partyId, kind: party.kind })} style={styles.backBtn}>
          <Feather name="edit-2" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Totals */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <Row label={isCustomer ? t('business.totalSales') : t('business.totalPurchases')} value={formatCash(summary.totalAmount)} colors={colors} />
          <Row label={isCustomer ? t('business.amountReceived') : t('business.amountPaid')} value={formatCash(summary.totalSettled)} colors={colors} />
          <Divider colors={colors} />
          <Row label={t('business.outstanding')} value={formatCash(summary.outstanding)} colors={colors} strong highlight={summary.outstanding > 0 ? colors.outColor : colors.success} />
        </View>

        {/* Contact */}
        {(party.address || party.notes) ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            {party.address ? <Row label={t('business.address')} value={party.address} colors={colors} /> : null}
            {party.notes ? <Row label={t('business.notes')} value={party.notes} colors={colors} /> : null}
          </View>
        ) : null}

        {/* Add transaction */}
        <TouchableOpacity
          style={[styles.addTxnBtn, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
          onPress={() =>
            navigation?.navigate('AddEditTransaction', {
              kind: isCustomer ? 'SALE' : 'PURCHASE',
              partyId,
            })
          }
        >
          <Feather name="plus-circle" size={18} color={colors.textInverse} />
          <Text style={[styles.addTxnText, { color: colors.textInverse }]}>
            {isCustomer ? t('business.addSale') : t('business.addPurchase')}
          </Text>
        </TouchableOpacity>

        {/* Transaction history */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('business.transactionHistory')}</Text>
        {transactions.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>{t('business.noTransactions')}</Text>
        ) : (
          transactions.map(v => (
            <TouchableOpacity
              key={v.transaction.id}
              style={[styles.txnRow, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
              activeOpacity={0.8}
              onPress={() => navigation?.navigate('TransactionDetail', { transactionId: v.transaction.id })}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.txnTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                  {v.transaction.description || formatDate(v.transaction.date)}
                </Text>
                <Text style={[styles.txnSub, { color: colors.textMuted }]}>{formatDate(v.transaction.date)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.txnAmt, { color: colors.textPrimary }]}>{formatCash(v.transaction.amount)}</Text>
                <Text style={[styles.txnStatus, { color: statusColor(v.status) }]}>{t(`business.paymentStatus.${v.status}`)}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}

        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} activeOpacity={0.7}>
          <Feather name="trash-2" size={16} color={colors.error} />
          <Text style={[styles.deleteText, { color: colors.error }]}>
            {isCustomer ? t('business.deleteCustomer') : t('business.deleteSupplier')}
          </Text>
        </TouchableOpacity>

        <View style={{ height: insets.bottom + FLOATING_TAB_BAR_CLEARANCE }} />
      </ScrollView>
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
    card: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 12 },
    addTxnBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 13, marginBottom: 16 },
    addTxnText: { fontSize: 14, fontWeight: '700' },
    sectionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 8 },
    emptyText: { fontSize: 13, textAlign: 'center', paddingVertical: 20 },
    txnRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
    txnTitle: { fontSize: 14, fontWeight: '700' },
    txnSub: { fontSize: 12, marginTop: 1 },
    txnAmt: { fontSize: 14, fontWeight: '800' },
    txnStatus: { fontSize: 11, fontWeight: '700', marginTop: 2 },
    deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingVertical: 12 },
    deleteText: { fontSize: 13, fontWeight: '700' },
  });

export default PartyDetailScreen;
