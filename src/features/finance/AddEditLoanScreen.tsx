import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Feather from '@react-native-vector-icons/feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, ThemeColors } from '../../context/ThemeContext';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { loanService } from '../../services';
import {
  LoanDirection,
  LoanType,
  PartyType,
  InterestType,
  LOAN_TYPES,
  INTEREST_TYPES,
} from '../../finance/models/Loan';
import { InputField } from '../../components/InputField';
import { Button } from '../../components/Button';
import { isoToDateInput } from '../../utils/format';

const AddEditLoanScreen: React.FC<{ navigation?: any; route?: any }> = ({ navigation, route }) => {
  const { colors } = useTheme();
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const loanId: string | undefined = route?.params?.loanId;
  const isEdit = !!loanId;

  const [direction, setDirection] = useState<LoanDirection>(route?.params?.direction ?? 'LENT');
  const [loanType, setLoanType] = useState<LoanType>('PERSONAL');
  const [partyType, setPartyType] = useState<PartyType>('PERSON');
  const [partyName, setPartyName] = useState('');
  const [partyVillage, setPartyVillage] = useState('');
  const [partyPhone, setPartyPhone] = useState('');
  const [partyContact, setPartyContact] = useState('');
  const [principal, setPrincipal] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [interestType, setInterestType] = useState<InterestType>('NONE');
  const [loanDate, setLoanDate] = useState<Date>(new Date());
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [notes, setNotes] = useState('');

  const [showLoanDatePicker, setShowLoanDatePicker] = useState(false);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ partyName?: string; principal?: string }>({});

  // Load existing loan for edit.
  useEffect(() => {
    if (!loanId) return;
    loanService.getLoan(loanId).then(loan => {
      if (!loan) return;
      setDirection(loan.direction);
      setLoanType(loan.loanType);
      setPartyType(loan.partyType);
      setPartyName(loan.partyName);
      setPartyVillage(loan.partyVillage ?? '');
      setPartyPhone(loan.partyPhone ?? '');
      setPartyContact(loan.partyContact ?? '');
      setPrincipal(String(loan.principal));
      setInterestRate(String(loan.interestRate));
      setInterestType(loan.interestType);
      setLoanDate(new Date(loan.loanDate));
      setDueDate(loan.dueDate ? new Date(loan.dueDate) : null);
      setNotes(loan.notes ?? '');
    });
  }, [loanId]);

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!partyName.trim()) next.partyName = t('finance.paymentRequired');
    if (!(Number(principal) > 0)) next.principal = t('finance.paymentRequired');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const input = {
      direction,
      loanType,
      partyType,
      partyName: partyName.trim(),
      partyVillage: partyType === 'PERSON' ? partyVillage.trim() || null : null,
      partyPhone: partyType === 'PERSON' ? partyPhone.trim() || null : null,
      partyContact: partyType === 'BUSINESS' ? partyContact.trim() || null : null,
      principal: Number(principal) || 0,
      interestRate: Number(interestRate) || 0,
      interestType,
      loanDate: loanDate.toISOString(),
      dueDate: dueDate ? dueDate.toISOString() : null,
      notes: notes.trim() || null,
    };
    try {
      if (isEdit && loanId) {
        await loanService.updateLoan(loanId, input);
      } else {
        await loanService.createLoan(input);
      }
      navigation?.goBack();
    } catch {
      Alert.alert(t('common.error'), t('finance.saveFailed'));
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {isEdit ? t('finance.editLoan') : t('finance.newLoan')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Direction */}
        <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>{t('finance.direction')}</Text>
        <ChipRow
          options={[
            { key: 'LENT', label: t('finance.lent') },
            { key: 'BORROWED', label: t('finance.borrowed') },
          ]}
          selected={direction}
          onSelect={k => setDirection(k as LoanDirection)}
          colors={colors}
        />

        {/* Party type */}
        <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>{t('finance.partyTypeLabel')}</Text>
        <ChipRow
          options={[
            { key: 'PERSON', label: t('finance.partyTypeOpt.PERSON') },
            { key: 'BUSINESS', label: t('finance.partyTypeOpt.BUSINESS') },
          ]}
          selected={partyType}
          onSelect={k => setPartyType(k as PartyType)}
          colors={colors}
        />

        {/* Party details */}
        <InputField
          label={partyType === 'PERSON' ? t('finance.partyNamePerson') : t('finance.partyNameBusiness')}
          required
          value={partyName}
          onChangeText={setPartyName}
          error={errors.partyName}
          autoCapitalize="words"
        />
        {partyType === 'PERSON' ? (
          <>
            <InputField label={`${t('finance.village')} (${t('finance.optional')})`} value={partyVillage} onChangeText={setPartyVillage} autoCapitalize="words" />
            <InputField label={`${t('finance.phone')} (${t('finance.optional')})`} value={partyPhone} onChangeText={setPartyPhone} keyboardType="phone-pad" />
          </>
        ) : (
          <InputField label={`${t('finance.contact')} (${t('finance.optional')})`} value={partyContact} onChangeText={setPartyContact} />
        )}

        {/* Loan type */}
        <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>{t('finance.loanTypeLabel')}</Text>
        <ChipWrap
          options={LOAN_TYPES.map(x => ({ key: x, label: t(`finance.loanType.${x}`) }))}
          selected={loanType}
          onSelect={k => setLoanType(k as LoanType)}
          colors={colors}
        />

        {/* Amounts */}
        <InputField label={t('finance.principal')} required value={principal} onChangeText={setPrincipal} keyboardType="decimal-pad" placeholder="0" error={errors.principal} />
        <InputField label={t('finance.interestRate')} value={interestRate} onChangeText={setInterestRate} keyboardType="decimal-pad" placeholder="0" />

        {/* Interest type */}
        <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>{t('finance.interestTypeLabel')}</Text>
        <ChipWrap
          options={INTEREST_TYPES.map(x => ({ key: x, label: t(`finance.interestType.${x}`) }))}
          selected={interestType}
          onSelect={k => setInterestType(k as InterestType)}
          colors={colors}
        />

        {/* Dates */}
        <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>{t('finance.loanDate')}</Text>
        <TouchableOpacity style={[styles.dateBtn, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => setShowLoanDatePicker(true)}>
          <Feather name="calendar" size={16} color={colors.textMuted} />
          <Text style={[styles.dateText, { color: colors.textPrimary }]}>{isoToDateInput(loanDate.toISOString())}</Text>
        </TouchableOpacity>

        <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>{`${t('finance.dueDate')} (${t('finance.optional')})`}</Text>
        <TouchableOpacity style={[styles.dateBtn, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => setShowDueDatePicker(true)}>
          <Feather name="calendar" size={16} color={colors.textMuted} />
          <Text style={[styles.dateText, { color: dueDate ? colors.textPrimary : colors.textDisabled }]}>
            {dueDate ? isoToDateInput(dueDate.toISOString()) : 'YYYY-MM-DD'}
          </Text>
        </TouchableOpacity>

        <InputField label={`${t('finance.notes')} (${t('finance.optional')})`} value={notes} onChangeText={setNotes} multiline />

        <View style={{ height: 16 }} />
        <Button
          title={isEdit ? t('common.save') : t('finance.addLoan')}
          onPress={handleSave}
          loading={saving}
          fullWidth
        />
        <View style={{ height: 40 }} />
      </ScrollView>

      {showLoanDatePicker && (
        <DateTimePicker
          value={loanDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onValueChange={(_, d) => {
            setShowLoanDatePicker(Platform.OS === 'ios');
            if (d) setLoanDate(d);
          }}
          onDismiss={() => setShowLoanDatePicker(false)}
        />
      )}
      {showDueDatePicker && (
        <DateTimePicker
          value={dueDate ?? new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onValueChange={(_, d) => {
            setShowDueDatePicker(Platform.OS === 'ios');
            if (d) setDueDate(d);
          }}
          onDismiss={() => setShowDueDatePicker(false)}
        />
      )}
    </View>
  );
};

// ── Chips ──────────────────────────────────────────────────────────────────────

interface Opt { key: string; label: string }

const ChipRow: React.FC<{ options: Opt[]; selected: string; onSelect: (k: string) => void; colors: ThemeColors }> = ({ options, selected, onSelect, colors }) => (
  <View style={chipStyles.row}>
    {options.map(o => (
      <Chip key={o.key} opt={o} active={selected === o.key} onPress={() => onSelect(o.key)} colors={colors} flex />
    ))}
  </View>
);

const ChipWrap: React.FC<{ options: Opt[]; selected: string; onSelect: (k: string) => void; colors: ThemeColors }> = ({ options, selected, onSelect, colors }) => (
  <View style={chipStyles.wrap}>
    {options.map(o => (
      <Chip key={o.key} opt={o} active={selected === o.key} onPress={() => onSelect(o.key)} colors={colors} />
    ))}
  </View>
);

const Chip: React.FC<{ opt: Opt; active: boolean; onPress: () => void; colors: ThemeColors; flex?: boolean }> = ({ opt, active, onPress, colors, flex }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.8}
    style={[
      chipStyles.chip,
      flex && { flex: 1 },
      {
        backgroundColor: active ? colors.primary : colors.surface,
        borderColor: active ? colors.primary : colors.border,
      },
    ]}
  >
    <Text style={{ fontSize: 12.5, fontWeight: active ? '700' : '600', color: active ? colors.textInverse : colors.textMuted }}>
      {opt.label}
    </Text>
  </TouchableOpacity>
);

const chipStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1, alignItems: 'center' },
});

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 18, fontWeight: '800' },
    content: { paddingHorizontal: 16, paddingTop: 4 },
    groupLabel: { fontSize: 12, fontWeight: '600', marginTop: 16, marginBottom: 8 },
    dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 48 },
    dateText: { fontSize: 14, fontWeight: '500' },
  });

export default AddEditLoanScreen;
