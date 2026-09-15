import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Modal,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Feather from '@react-native-vector-icons/feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, ThemeColors } from '@common/context/ThemeContext';
import { useAppTranslation } from '@common/hooks/useAppTranslation';
import { businessService } from '@common/services';
import { Party, TransactionKind, PartyKind } from '@finance/models/Business';
import { InputField } from '@common/components/InputField';
import { Button } from '@common/components/Button';
import { formatDate } from '@common/utils/format';
import { FLOATING_TAB_BAR_CLEARANCE } from '@common/theme/typography';

const AddEditTransactionScreen: React.FC<{ navigation?: any; route?: any }> = ({ navigation, route }) => {
  const { colors } = useTheme();
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const transactionId: string | undefined = route?.params?.transactionId;
  const kind: TransactionKind = route?.params?.kind ?? 'SALE';
  const presetPartyId: string | undefined = route?.params?.partyId;
  const isEdit = !!transactionId;
  const isSale = kind === 'SALE';
  const partyKind: PartyKind = isSale ? 'CUSTOMER' : 'SUPPLIER';

  const [parties, setParties] = useState<Party[]>([]);
  const [partyId, setPartyId] = useState<string>(presetPartyId ?? '');
  const [date, setDate] = useState<Date>(new Date());
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [amount, setAmount] = useState('');
  const [amountSettled, setAmountSettled] = useState('');
  const [notes, setNotes] = useState('');

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [partyPickerOpen, setPartyPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ partyId?: string; amount?: string }>({});

  useEffect(() => {
    businessService.getParties({ kind: partyKind }).then(setParties);
  }, [partyKind]);

  useEffect(() => {
    if (!transactionId) return;
    businessService.getTransaction(transactionId).then(txn => {
      if (!txn) return;
      setPartyId(txn.partyId);
      setDate(new Date(txn.date));
      setDescription(txn.description ?? '');
      setQuantity(txn.quantity ? String(txn.quantity) : '');
      setAmount(String(txn.amount));
      setAmountSettled(String(txn.amountSettled));
      setNotes(txn.notes ?? '');
    });
  }, [transactionId]);

  const selectedParty = parties.find(p => p.id === partyId);

  // Derived payment status preview.
  const statusPreview = useMemo(() => {
    const a = Number(amount) || 0;
    const s = Number(amountSettled) || 0;
    if (s <= 0) return 'UNPAID';
    if (s >= a && a > 0) return 'PAID';
    return 'PARTIAL';
  }, [amount, amountSettled]);

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!partyId) next.partyId = t('common.required');
    if (!(Number(amount) > 0)) next.amount = t('common.required');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const input = {
      kind,
      partyId,
      date: date.toISOString(),
      description: description.trim() || null,
      quantity: Number(quantity) || 0,
      amount: Number(amount) || 0,
      amountSettled: Number(amountSettled) || 0,
      notes: notes.trim() || null,
    };
    try {
      if (isEdit && transactionId) {
        await businessService.updateTransaction(transactionId, input);
      } else {
        await businessService.createTransaction(input);
      }
      navigation?.goBack();
    } catch {
      Alert.alert(t('common.error'), t('business.saveFailed'));
      setSaving(false);
    }
  };

  const title = isEdit
    ? isSale ? t('business.editSale') : t('business.editPurchase')
    : isSale ? t('business.addSale') : t('business.addPurchase');

  const statusColor = (s: string) =>
    s === 'PAID' ? colors.success : s === 'PARTIAL' ? colors.pendingColor : colors.error;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Party picker */}
        <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>
          {isSale ? t('business.customer') : t('business.supplier')} <Text style={{ color: colors.error }}>*</Text>
        </Text>
        <TouchableOpacity
          style={[styles.pickerBtn, { borderColor: errors.partyId ? colors.error : colors.border, backgroundColor: colors.surface }]}
          onPress={() => setPartyPickerOpen(true)}
        >
          <Text style={[styles.pickerText, { color: selectedParty ? colors.textPrimary : colors.textDisabled }]}>
            {selectedParty ? selectedParty.name : t('business.selectParty')}
          </Text>
          <Feather name="chevron-down" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Date */}
        <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>
          {isSale ? t('business.saleDate') : t('business.purchaseDate')}
        </Text>
        <TouchableOpacity style={[styles.dateBtn, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => setShowDatePicker(true)}>
          <Feather name="calendar" size={16} color={colors.textMuted} />
          <Text style={[styles.dateText, { color: colors.textPrimary }]}>{formatDate(date.toISOString())}</Text>
        </TouchableOpacity>

        <InputField label={t('business.itemDescription')} value={description} onChangeText={setDescription} />
        <InputField label={`${t('business.quantity')} (${t('finance.optional')})`} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="0" />
        <InputField label={t('business.amount')} required value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" error={errors.amount} />
        <InputField
          label={isSale ? t('business.amountReceived') : t('business.amountPaid')}
          value={amountSettled}
          onChangeText={setAmountSettled}
          keyboardType="decimal-pad"
          placeholder="0"
        />

        {/* Derived payment status */}
        <View style={styles.statusRow}>
          <Text style={[styles.groupLabel, { color: colors.textSecondary, marginTop: 0 }]}>{t('business.paymentStatusLabel')}</Text>
          <View style={[styles.statusChip, { backgroundColor: `${statusColor(statusPreview)}22` }]}>
            <Text style={[styles.statusChipText, { color: statusColor(statusPreview) }]}>{t(`business.paymentStatus.${statusPreview}`)}</Text>
          </View>
        </View>

        <InputField label={`${t('business.notes')} (${t('finance.optional')})`} value={notes} onChangeText={setNotes} multiline />
      </ScrollView>

      {/* Sticky footer — actions stay above the floating tab bar */}
      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.borderLight,
            paddingBottom: insets.bottom + FLOATING_TAB_BAR_CLEARANCE,
          },
        ]}
      >
        <View style={styles.actions}>
          <Button title={t('common.cancel')} onPress={() => navigation?.goBack()} variant="outline" style={{ flex: 1 }} />
          <Button title={t('common.save')} onPress={handleSave} loading={saving} style={{ flex: 2 }} />
        </View>
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, d) => {
            setShowDatePicker(Platform.OS === 'ios');
            if (d) setDate(d);
          }}
        />
      )}

      {/* Party picker modal */}
      <Modal visible={partyPickerOpen} transparent animationType="fade" onRequestClose={() => setPartyPickerOpen(false)}>
        <TouchableOpacity style={[styles.modalOverlay, { backgroundColor: colors.overlay }]} activeOpacity={1} onPress={() => setPartyPickerOpen(false)}>
          <View style={[styles.pickerSheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.pickerTitle, { color: colors.textPrimary }]}>
              {isSale ? t('business.selectCustomer') : t('business.selectSupplier')}
            </Text>
            {parties.length === 0 ? (
              <View style={{ paddingVertical: 16 }}>
                <Text style={[styles.pickerEmpty, { color: colors.textMuted }]}>
                  {isSale ? t('business.noCustomers') : t('business.noSuppliers')}
                </Text>
                <TouchableOpacity
                  style={[styles.addPartyInline, { borderColor: colors.primary }]}
                  onPress={() => {
                    setPartyPickerOpen(false);
                    navigation?.navigate('AddEditParty', { kind: partyKind });
                  }}
                >
                  <Feather name="plus" size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: '700' }}>
                    {isSale ? t('business.addCustomer') : t('business.addSupplier')}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                {parties.map(p => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.pickerOption}
                    onPress={() => {
                      setPartyId(p.id);
                      setPartyPickerOpen(false);
                    }}
                  >
                    <Text style={[styles.pickerOptionText, { color: colors.textPrimary }]}>{p.name}</Text>
                    {partyId === p.id ? <Feather name="check" size={16} color={colors.primary} /> : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 18, fontWeight: '800' },
    content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
    footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
    groupLabel: { fontSize: 12, fontWeight: '600', marginTop: 16, marginBottom: 8 },
    pickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 48 },
    pickerText: { fontSize: 14, fontWeight: '500' },
    dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 48 },
    dateText: { fontSize: 14, fontWeight: '500' },
    statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
    statusChip: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 },
    statusChipText: { fontSize: 12, fontWeight: '800' },
    actions: { flexDirection: 'row', gap: 12 },
    modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
    pickerSheet: { width: '100%', borderRadius: 18, padding: 20 },
    pickerTitle: { fontSize: 16, fontWeight: '800', marginBottom: 12 },
    pickerEmpty: { fontSize: 13, textAlign: 'center', marginBottom: 12 },
    addPartyInline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12 },
    pickerOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
    pickerOptionText: { fontSize: 14, fontWeight: '600' },
  });

export default AddEditTransactionScreen;
