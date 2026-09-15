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
import { creditService } from '@common/services';
import { Credit } from '@finance/models/Credit';
import { formatCash, formatDate } from '@common/utils/format';
import { FLOATING_TAB_BAR_CLEARANCE } from '@common/theme/typography';

const CreditDetailScreen: React.FC<{ navigation?: any; route?: any }> = ({
  navigation,
  route,
}) => {
  const { colors } = useTheme();
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const creditId: string = route?.params?.creditId ?? '';

  const [credit, setCredit] = useState<Credit | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCredit(await creditService.getCredit(creditId));
    } catch {
      setCredit(null);
    } finally {
      setLoading(false);
    }
  }, [creditId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleMarkSettled = () => {
    if (!credit) return;
    Alert.alert(t('finance.markSettled'), t('finance.markSettledConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('finance.markSettled'),
        onPress: async () => {
          try {
            await creditService.markSettled(creditId);
            await load();
          } catch {
            Alert.alert(t('common.error'), t('finance.saveFailed'));
          }
        },
      },
    ]);
  };

  const handleReopen = () => {
    if (!credit) return;
    Alert.alert(t('finance.reopen'), t('finance.reopenConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('finance.reopen'),
        onPress: async () => {
          try {
            await creditService.markUpcoming(creditId);
            await load();
          } catch {
            Alert.alert(t('common.error'), t('finance.saveFailed'));
          }
        },
      },
    ]);
  };

  const handleReminder = async () => {
    if (!credit) return;
    const scheduled = await creditService.setDateReminder(credit, true);
    Alert.alert(
      t('finance.reminder'),
      scheduled ? t('finance.reminderSet') : t('finance.reminderNotSet'),
    );
  };

  const handleDelete = () => {
    if (!credit) return;
    Alert.alert(t('finance.deleteCredit'), t('finance.deleteCreditConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await creditService.deleteCredit(creditId);
            navigation?.goBack();
          } catch {
            Alert.alert(t('common.error'), t('finance.saveFailed'));
          }
        },
      },
    ]);
  };

  if (loading || !credit) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation?.goBack()}
            style={styles.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="arrow-left" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.center}>
          {loading ? <ActivityIndicator size="large" color={colors.primary} /> : null}
        </View>
      </View>
    );
  }

  const isIn = credit.direction === 'IN';
  const dirColor = isIn ? colors.inColor : colors.outColor;
  const isSettled = credit.status === 'SETTLED';
  const sColor = isSettled ? colors.success : colors.pendingColor;

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
            {credit.person}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {isIn ? t('finance.directionInLong') : t('finance.directionOutLong')}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation?.navigate('AddEditCredit', { creditId })}
          style={styles.backBtn}
        >
          <Feather name="edit-2" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Amount hero */}
        <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <View style={styles.dirRow}>
            <View style={[styles.dot, { backgroundColor: dirColor }]} />
            <Text style={[styles.heroDir, { color: dirColor }]}>
              {isIn ? t('finance.directionIn') : t('finance.directionOut')}
            </Text>
          </View>
          <Text style={[styles.heroValue, { color: dirColor }]}>{formatCash(credit.amount)}</Text>
          <View style={[styles.statusChip, { backgroundColor: `${sColor}22` }]}>
            <Text style={[styles.statusChipText, { color: sColor }]}>
              {isSettled
                ? `\u2713 ${t('finance.creditStatus.SETTLED')}`
                : t('finance.creditStatus.UPCOMING')}
            </Text>
          </View>
        </View>

        {/* Details */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
          <Row label={t('finance.amount')} value={formatCash(credit.amount)} colors={colors} strong />
          <Row label={t('finance.interestRatePct')} value={`${credit.interestRate}%`} colors={colors} />
          <Row label={t('finance.date')} value={formatDate(credit.date)} colors={colors} />
          <Divider colors={colors} />
          <Row label={t('finance.person')} value={credit.person} colors={colors} />
          {credit.village ? <Row label={t('finance.village')} value={credit.village} colors={colors} /> : null}
          {credit.mobileNumber ? (
            <Row label={t('finance.mobileNumber')} value={credit.mobileNumber} colors={colors} />
          ) : null}
          {credit.eventName ? (
            <>
              <Divider colors={colors} />
              <Row label={t('finance.event')} value={credit.eventName} colors={colors} />
            </>
          ) : null}
          {isSettled && credit.settledDate ? (
            <>
              <Divider colors={colors} />
              <Row label={t('finance.settledDate')} value={formatDate(credit.settledDate)} colors={colors} strong />
            </>
          ) : null}
        </View>

        {credit.notes ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <Text style={[styles.notesLabel, { color: colors.textMuted }]}>{t('finance.notes')}</Text>
            <Text style={[styles.notesText, { color: colors.textPrimary }]}>{credit.notes}</Text>
          </View>
        ) : null}

        {/* Actions */}
        <View style={styles.actionsGrid}>
          {!isSettled ? (
            <>
              <ActionButton icon="bell" label={t('finance.setDateReminder')} onPress={handleReminder} colors={colors} />
              <ActionButton icon="check-circle" label={t('finance.markSettled')} onPress={handleMarkSettled} colors={colors} />
            </>
          ) : (
            <ActionButton icon="rotate-ccw" label={t('finance.reopen')} onPress={handleReopen} colors={colors} />
          )}
          <ActionButton icon="edit-2" label={t('common.edit')} onPress={() => navigation?.navigate('AddEditCredit', { creditId })} colors={colors} />
          <ActionButton icon="trash-2" label={t('common.delete')} onPress={handleDelete} colors={colors} danger />
        </View>

        <View style={{ height: insets.bottom + FLOATING_TAB_BAR_CLEARANCE }} />
      </ScrollView>
    </View>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const Row: React.FC<{ label: string; value: string; colors: ThemeColors; strong?: boolean }> = ({
  label,
  value,
  colors,
  strong,
}) => (
  <View style={rowStyles.row}>
    <Text style={[rowStyles.label, { color: colors.textMuted }]}>{label}</Text>
    <Text style={[rowStyles.value, { color: colors.textPrimary, fontWeight: strong ? '800' : '600' }]}>
      {value}
    </Text>
  </View>
);

const Divider: React.FC<{ colors: ThemeColors }> = ({ colors }) => (
  <View style={[rowStyles.divider, { backgroundColor: colors.borderLight }]} />
);

const ActionButton: React.FC<{
  icon: any;
  label: string;
  onPress: () => void;
  colors: ThemeColors;
  danger?: boolean;
}> = ({ icon, label, onPress, colors, danger }) => (
  <TouchableOpacity
    style={[actionStyles.btn, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <Feather name={icon} size={18} color={danger ? colors.error : colors.primary} />
    <Text style={[actionStyles.label, { color: danger ? colors.error : colors.textPrimary }]}>{label}</Text>
  </TouchableOpacity>
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
    dirRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    heroDir: { fontSize: 13, fontWeight: '800', letterSpacing: 0.4 },
    heroValue: { fontSize: 28, fontWeight: '800', marginTop: 6 },
    statusChip: { marginTop: 10, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 },
    statusChipText: { fontSize: 12, fontWeight: '800' },
    card: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 12 },
    notesLabel: { fontSize: 12, fontWeight: '600' },
    notesText: { fontSize: 14, marginTop: 6, lineHeight: 20 },
    actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  });

export default CreditDetailScreen;
