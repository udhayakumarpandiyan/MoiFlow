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

import { useTheme, ThemeColors } from '@common/context/ThemeContext';
import { useAppTranslation } from '@common/hooks/useAppTranslation';
import { loanService } from '@common/services';
import { LoanType, LOAN_TYPES } from '@finance/models/Loan';
import { InputField } from '@common/components/InputField';
import { Button } from '@common/components/Button';
import { isoToDateInput, formatDate } from '@common/utils/format';
import { FLOATING_TAB_BAR_CLEARANCE } from '@common/theme/typography';

const AddEditLoanScreen: React.FC<{ navigation?: any; route?: any }> = ({ navigation, route }) => {
  const { colors } = useTheme();
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const loanId: string | undefined = route?.params?.loanId;
  const isEdit = !!loanId;

  const [loanType, setLoanType] = useState<LoanType>(route?.params?.loanType ?? 'PERSONAL');
  const [loanAmount, setLoanAmount] = useState('');
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [provider, setProvider] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [monthlyEMI, setMonthlyEMI] = useState('');
  const [emiDate, setEmiDate] = useState('');
  const [tenure, setTenure] = useState('');
  const [totalEMIs, setTotalEMIs] = useState('');
  const [notes, setNotes] = useState('');

  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{
    provider?: string;
    loanAmount?: string;
    monthlyEMI?: string;
    emiDate?: string;
  }>({});

  // Load existing loan for edit.
  useEffect(() => {
    if (!loanId) return;
    loanService.getLoan(loanId).then(loan => {
      if (!loan) return;
      setLoanType(loan.loanType);
      setLoanAmount(String(loan.loanAmount));
      setStartDate(new Date(loan.startDate));
      setProvider(loan.provider);
      setInterestRate(String(loan.interestRate));
      setMonthlyEMI(String(loan.monthlyEMI));
      setEmiDate(String(loan.emiDate));
      setTenure(String(loan.tenure));
      setTotalEMIs(String(loan.totalEMIs));
      setNotes(loan.notes ?? '');
    });
  }, [loanId]);

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!provider.trim()) next.provider = t('common.required');
    if (!(Number(loanAmount) > 0)) next.loanAmount = t('common.required');
    if (!(Number(monthlyEMI) > 0)) next.monthlyEMI = t('common.required');
    const day = Number(emiDate);
    if (emiDate && (day < 1 || day > 31)) next.emiDate = t('finance.emiDateInvalid');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const input = {
      loanType,
      loanAmount: Number(loanAmount) || 0,
      startDate: startDate.toISOString(),
      provider: provider.trim(),
      interestRate: Number(interestRate) || 0,
      monthlyEMI: Number(monthlyEMI) || 0,
      emiDate: Number(emiDate) || 1,
      tenure: Number(tenure) || 0,
      totalEMIs: Number(totalEMIs) || 0,
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
        {/* Loan type */}
        <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>{t('finance.loanTypeLabel')}</Text>
        <View style={chipStyles.wrap}>
          {LOAN_TYPES.map(x => (
            <Chip
              key={x}
              label={t(`finance.loanType.${x}`)}
              active={loanType === x}
              onPress={() => setLoanType(x)}
              colors={colors}
            />
          ))}
        </View>

        {/* Provider */}
        <InputField
          label={t('finance.provider')}
          required
          value={provider}
          onChangeText={setProvider}
          error={errors.provider}
          autoCapitalize="words"
        />

        {/* Amount + rate */}
        <InputField
          label={t('finance.loanAmount')}
          required
          value={loanAmount}
          onChangeText={setLoanAmount}
          keyboardType="decimal-pad"
          placeholder="0"
          error={errors.loanAmount}
        />
        <InputField
          label={`${t('finance.interestRate')} (${t('finance.optional')})`}
          value={interestRate}
          onChangeText={setInterestRate}
          keyboardType="decimal-pad"
          placeholder="0"
        />

        {/* EMI + EMI date */}
        <InputField
          label={t('finance.monthlyEMI')}
          required
          value={monthlyEMI}
          onChangeText={setMonthlyEMI}
          keyboardType="decimal-pad"
          placeholder="0"
          error={errors.monthlyEMI}
        />
        <InputField
          label={t('finance.emiDateLabel')}
          value={emiDate}
          onChangeText={setEmiDate}
          keyboardType="number-pad"
          placeholder="1 - 31"
          error={errors.emiDate}
        />

        {/* Tenure + total EMIs */}
        <InputField
          label={`${t('finance.tenure')} (${t('finance.optional')})`}
          value={tenure}
          onChangeText={setTenure}
          keyboardType="number-pad"
          placeholder="0"
        />
        <InputField
          label={`${t('finance.totalEMIs')} (${t('finance.optional')})`}
          value={totalEMIs}
          onChangeText={setTotalEMIs}
          keyboardType="number-pad"
          placeholder="0"
        />

        {/* Start date */}
        <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>{t('finance.startDate')}</Text>
        <TouchableOpacity style={[styles.dateBtn, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => setShowStartDatePicker(true)}>
          <Feather name="calendar" size={16} color={colors.textMuted} />
          <Text style={[styles.dateText, { color: colors.textPrimary }]}>{formatDate(startDate.toISOString())}</Text>
        </TouchableOpacity>

        <InputField label={`${t('finance.notes')} (${t('finance.optional')})`} value={notes} onChangeText={setNotes} multiline />
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
          <Button
            title={isEdit ? t('common.save') : t('finance.addLoan')}
            onPress={handleSave}
            loading={saving}
            style={{ flex: 2 }}
          />
        </View>
      </View>

      {showStartDatePicker && (
        <DateTimePicker
          value={startDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, d) => {
            setShowStartDatePicker(Platform.OS === 'ios');
            if (d) setStartDate(d);
          }}
        />
      )}
    </View>
  );
};

// ── Chips ──────────────────────────────────────────────────────────────────────

const Chip: React.FC<{ label: string; active: boolean; onPress: () => void; colors: ThemeColors }> = ({ label, active, onPress, colors }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.8}
    style={[
      chipStyles.chip,
      {
        backgroundColor: active ? colors.primary : colors.surface,
        borderColor: active ? colors.primary : colors.border,
      },
    ]}
  >
    <Text style={{ fontSize: 12.5, fontWeight: active ? '700' : '600', color: active ? colors.textInverse : colors.textMuted }}>
      {label}
    </Text>
  </TouchableOpacity>
);

const chipStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1, alignItems: 'center' },
});

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
    backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 18, fontWeight: '800' },
    content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
    groupLabel: { fontSize: 12, fontWeight: '600', marginTop: 16, marginBottom: 8 },
    dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 48 },
    dateText: { fontSize: 14, fontWeight: '500' },
    footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
    actions: { flexDirection: 'row', gap: 12 },
  });

export default AddEditLoanScreen;
