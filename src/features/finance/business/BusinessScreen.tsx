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

import { useTheme, ThemeColors } from '../../../context/ThemeContext';
import { useAppTranslation } from '../../../hooks/useAppTranslation';
import { businessService } from '../../../services';
import {
  PartySummary,
  TransactionView,
  BusinessSummary,
  PartyKind,
  TransactionKind,
} from '../../../finance/models/Business';
import { formatCash, formatDate } from '../../../utils/format';
import { SegmentedControl } from '../../../components/SegmentedControl';
import { EmptyState } from '../../../components/EmptyState';

type TabKey = 'CUSTOMERS' | 'SUPPLIERS' | 'PURCHASES' | 'SALES';

const BusinessScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const { colors } = useTheme();
  const { t } = useAppTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [tab, setTab] = useState<TabKey>('CUSTOMERS');
  const [summary, setSummary] = useState<BusinessSummary | null>(null);
  const [customers, setCustomers] = useState<PartySummary[]>([]);
  const [suppliers, setSuppliers] = useState<PartySummary[]>([]);
  const [purchases, setPurchases] = useState<TransactionView[]>([]);
  const [sales, setSales] = useState<TransactionView[]>([]);
  const [partyNames, setPartyNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [sum, cust, supp, purch, sale] = await Promise.all([
        businessService.getBusinessSummary(),
        businessService.getPartySummaries('CUSTOMER'),
        businessService.getPartySummaries('SUPPLIER'),
        businessService.getTransactionViews('PURCHASE'),
        businessService.getTransactionViews('SALE'),
      ]);
      setSummary(sum);
      setCustomers(cust);
      setSuppliers(supp);
      setPurchases(purch);
      setSales(sale);
      // Build a party-id → name map for transaction rows.
      const names: Record<string, string> = {};
      for (const p of cust) names[p.party.id] = p.party.name;
      for (const p of supp) names[p.party.id] = p.party.name;
      setPartyNames(names);
    } catch {
      setSummary(null);
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

  const TABS = useMemo(
    () => [
      { key: 'CUSTOMERS', label: t('business.customers') },
      { key: 'SUPPLIERS', label: t('business.suppliers') },
      { key: 'PURCHASES', label: t('business.purchases') },
      { key: 'SALES', label: t('business.sales') },
    ],
    [t],
  );

  const goAddParty = (kind: PartyKind) => navigation?.navigate('AddEditParty', { kind });
  const goAddTxn = (kind: TransactionKind) => navigation?.navigate('AddEditTransaction', { kind });

  const onFab = () => {
    if (tab === 'CUSTOMERS') goAddParty('CUSTOMER');
    else if (tab === 'SUPPLIERS') goAddParty('SUPPLIER');
    else if (tab === 'PURCHASES') goAddTxn('PURCHASE');
    else goAddTxn('SALE');
  };

  const statusColor = (s: string) =>
    s === 'PAID' ? colors.success : s === 'PARTIAL' ? colors.pendingColor : colors.error;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[colors.primary]} />
        }
      >
        {/* Business summary */}
        <View style={styles.summaryGrid}>
          <SummaryTile label={t('business.totalSales')} value={formatCash(summary?.totalSales ?? 0)} color={colors.inColor} bg={colors.inBg} colors={colors} />
          <SummaryTile label={t('business.totalPurchases')} value={formatCash(summary?.totalPurchases ?? 0)} color={colors.outColor} bg={colors.outBg} colors={colors} />
          <SummaryTile label={t('business.customerReceivables')} value={formatCash(summary?.customerReceivables ?? 0)} color={colors.inColor} bg={colors.inBg} colors={colors} />
          <SummaryTile label={t('business.supplierPayables')} value={formatCash(summary?.supplierPayables ?? 0)} color={colors.outColor} bg={colors.outBg} colors={colors} />
        </View>

        <SegmentedControl
          segments={TABS}
          selected={tab}
          onSelect={v => setTab(v as TabKey)}
          style={{ marginBottom: 14 }}
        />

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : tab === 'CUSTOMERS' ? (
          customers.length === 0 ? (
            <EmptyState title={t('business.noCustomers')} subtitle={t('business.noCustomersDesc')} icon={'\uD83D\uDC65'} actionLabel={t('business.addCustomer')} onAction={() => goAddParty('CUSTOMER')} />
          ) : (
            customers.map(c => (
              <PartyCard key={c.party.id} summary={c} onPress={() => navigation?.navigate('PartyDetail', { partyId: c.party.id })} colors={colors} t={t} />
            ))
          )
        ) : tab === 'SUPPLIERS' ? (
          suppliers.length === 0 ? (
            <EmptyState title={t('business.noSuppliers')} subtitle={t('business.noSuppliersDesc')} icon={'\uD83C\uDFED'} actionLabel={t('business.addSupplier')} onAction={() => goAddParty('SUPPLIER')} />
          ) : (
            suppliers.map(s => (
              <PartyCard key={s.party.id} summary={s} onPress={() => navigation?.navigate('PartyDetail', { partyId: s.party.id })} colors={colors} t={t} />
            ))
          )
        ) : tab === 'PURCHASES' ? (
          purchases.length === 0 ? (
            <EmptyState title={t('business.noPurchases')} subtitle={t('business.noPurchasesDesc')} icon={'\uD83D\uDCE6'} actionLabel={t('business.addPurchase')} onAction={() => goAddTxn('PURCHASE')} />
          ) : (
            purchases.map(v => (
              <TxnCard key={v.transaction.id} view={v} partyName={partyNames[v.transaction.partyId] ?? t('business.unknownParty')} onPress={() => navigation?.navigate('TransactionDetail', { transactionId: v.transaction.id })} statusColor={statusColor} colors={colors} t={t} />
            ))
          )
        ) : sales.length === 0 ? (
          <EmptyState title={t('business.noSales')} subtitle={t('business.noSalesDesc')} icon={'\uD83D\uDED2'} actionLabel={t('business.addSale')} onAction={() => goAddTxn('SALE')} />
        ) : (
          sales.map(v => (
            <TxnCard key={v.transaction.id} view={v} partyName={partyNames[v.transaction.partyId] ?? t('business.unknownParty')} onPress={() => navigation?.navigate('TransactionDetail', { transactionId: v.transaction.id })} statusColor={statusColor} colors={colors} t={t} />
          ))
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      <TouchableOpacity style={[styles.fab, { backgroundColor: colors.primary }]} activeOpacity={0.85} onPress={onFab}>
        <Feather name="plus" size={26} color={colors.textInverse} />
      </TouchableOpacity>
    </View>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const SummaryTile: React.FC<{ label: string; value: string; color: string; bg: string; colors: ThemeColors }> = ({ label, value, color, bg, colors }) => (
  <View style={[tileStyles.tile, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
    <View style={[tileStyles.dot, { backgroundColor: bg }]} />
    <Text style={[tileStyles.label, { color: colors.textMuted }]} numberOfLines={1}>{label}</Text>
    <Text style={[tileStyles.value, { color }]} numberOfLines={1}>{value}</Text>
  </View>
);

const PartyCard: React.FC<{ summary: PartySummary; onPress: () => void; colors: ThemeColors; t: any }> = ({ summary, onPress, colors, t }) => (
  <TouchableOpacity style={[cardStyles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]} activeOpacity={0.8} onPress={onPress}>
    <View style={cardStyles.header}>
      <View style={{ flex: 1 }}>
        <Text style={[cardStyles.name, { color: colors.textPrimary }]} numberOfLines={1}>{summary.party.name}</Text>
        <Text style={[cardStyles.subtle, { color: colors.textMuted }]} numberOfLines={1}>
          {summary.party.phone || t('business.noPhone')}
          {summary.lastTransactionDate ? ` · ${t('business.last')}: ${formatDate(summary.lastTransactionDate)}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[cardStyles.label, { color: colors.textMuted }]}>{t('business.outstanding')}</Text>
        <Text style={[cardStyles.value, { color: summary.outstanding > 0 ? colors.outColor : colors.success }]}>
          {formatCash(summary.outstanding)}
        </Text>
      </View>
    </View>
  </TouchableOpacity>
);

const TxnCard: React.FC<{ view: TransactionView; partyName: string; onPress: () => void; statusColor: (s: string) => string; colors: ThemeColors; t: any }> = ({ view, partyName, onPress, statusColor, colors, t }) => {
  const { transaction: txn } = view;
  return (
    <TouchableOpacity style={[cardStyles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]} activeOpacity={0.8} onPress={onPress}>
      <View style={cardStyles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[cardStyles.name, { color: colors.textPrimary }]} numberOfLines={1}>{partyName}</Text>
          <Text style={[cardStyles.subtle, { color: colors.textMuted }]} numberOfLines={1}>
            {formatDate(txn.date)}{txn.description ? ` · ${txn.description}` : ''}
          </Text>
        </View>
        <View style={[cardStyles.badge, { backgroundColor: `${statusColor(view.status)}22` }]}>
          <Text style={[cardStyles.badgeText, { color: statusColor(view.status) }]}>{t(`business.paymentStatus.${view.status}`)}</Text>
        </View>
      </View>
      <View style={cardStyles.row}>
        <View>
          <Text style={[cardStyles.label, { color: colors.textMuted }]}>{t('business.amount')}</Text>
          <Text style={[cardStyles.value, { color: colors.textPrimary }]}>{formatCash(txn.amount)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[cardStyles.label, { color: colors.textMuted }]}>{t('business.outstanding')}</Text>
          <Text style={[cardStyles.value, { color: view.outstanding > 0 ? colors.outColor : colors.success }]}>{formatCash(view.outstanding)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const tileStyles = StyleSheet.create({
  tile: { width: '48%', borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 10 },
  dot: { width: 20, height: 6, borderRadius: 3, marginBottom: 8 },
  label: { fontSize: 11, fontWeight: '600' },
  value: { fontSize: 17, fontWeight: '800', marginTop: 2 },
});

const cardStyles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 15, fontWeight: '700' },
  subtle: { fontSize: 12, marginTop: 1 },
  label: { fontSize: 10, fontWeight: '600' },
  value: { fontSize: 15, fontWeight: '800', marginTop: 1 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  badgeText: { fontSize: 10, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 12 },
});

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: 16, paddingTop: 8 },
    summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 6 },
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

export default BusinessScreen;
