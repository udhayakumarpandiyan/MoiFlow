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

import { useTheme, ThemeColors } from '../../context/ThemeContext';
import { useAppTranslation } from '../../hooks/useAppTranslation';
import { creditService, eventService } from '../../services';
import { CreditDirection } from '../../finance/models/Credit';
import { InputField } from '../../components/InputField';
import { Button } from '../../components/Button';
import { SegmentedControl } from '../../components/SegmentedControl';
import { formatDate } from '../../utils/format';
import { FLOATING_TAB_BAR_CLEARANCE } from '../../theme/typography';

interface EventOption {
  id: string;
  name: string;
}

const AddEditCreditScreen: React.FC<{ navigation?: any; route?: any }> = ({
  navigation,
  route,
}) => {
  const { colors } = useTheme();
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const creditId: string | undefined = route?.params?.creditId;
  const isEdit = !!creditId;

  const [direction, setDirection] = useState<CreditDirection>('IN');
  const [amount, setAmount] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [date, setDate] = useState<Date>(new Date());
  const [person, setPerson] = useState('');
  const [village, setVillage] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [eventId, setEventId] = useState<string | null>(null);
  const [eventName, setEventName] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const [events, setEvents] = useState<EventOption[]>([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{
    person?: string;
    amount?: string;
    interestRate?: string;
    mobileNumber?: string;
  }>({});

  // Load event options for the optional event picker.
  useEffect(() => {
    eventService
      .getAllEvents()
      .then(list => setEvents(list.map(e => ({ id: e.id, name: e.name }))))
      .catch(() => setEvents([]));
  }, []);

  // Load existing credit for edit.
  useEffect(() => {
    if (!creditId) return;
    creditService.getCredit(creditId).then(c => {
      if (!c) return;
      setDirection(c.direction);
      setAmount(String(c.amount));
      setInterestRate(c.interestRate ? String(c.interestRate) : '');
      setDate(new Date(c.date));
      setPerson(c.person);
      setVillage(c.village ?? '');
      setMobileNumber(c.mobileNumber ?? '');
      setEventId(c.eventId ?? null);
      setEventName(c.eventName ?? null);
      setNotes(c.notes ?? '');
    });
  }, [creditId]);

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!person.trim()) next.person = t('common.required');
    if (!(Number(amount) > 0)) next.amount = t('finance.amountRequired');
    if (interestRate && Number(interestRate) < 0) {
      next.interestRate = t('finance.invalidRate');
    }
    if (mobileNumber && !/^[+\d][\d\s-]{5,}$/.test(mobileNumber.trim())) {
      next.mobileNumber = t('finance.invalidMobile');
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const input = {
      direction,
      amount: Number(amount) || 0,
      interestRate: Number(interestRate) || 0,
      date: date.toISOString(),
      person: person.trim(),
      village: village.trim() || null,
      mobileNumber: mobileNumber.trim() || null,
      eventId: eventId ?? null,
      eventName: eventName ?? null,
      notes: notes.trim() || null,
    };
    try {
      if (isEdit && creditId) {
        await creditService.updateCredit(creditId, input);
      } else {
        await creditService.createCredit(input);
      }
      navigation?.goBack();
    } catch {
      Alert.alert(t('common.error'), t('finance.saveFailed'));
      setSaving(false);
    }
  };

  const selectEvent = (opt: EventOption | null) => {
    setEventId(opt?.id ?? null);
    setEventName(opt?.name ?? null);
    setShowEventPicker(false);
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation?.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="arrow-left" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {isEdit ? t('finance.editCredit') : t('finance.newCredit')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Direction */}
        <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>
          {t('finance.type')}
        </Text>
        <SegmentedControl
          segments={[
            { key: 'IN', label: t('finance.directionInLong') },
            { key: 'OUT', label: t('finance.directionOutLong') },
          ]}
          selected={direction}
          onSelect={k => setDirection(k as CreditDirection)}
        />

        {/* Amount + interest */}
        <InputField
          label={t('finance.amount')}
          required
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0"
          error={errors.amount}
        />
        <InputField
          label={`${t('finance.interestRatePct')} (${t('finance.optional')})`}
          value={interestRate}
          onChangeText={setInterestRate}
          keyboardType="decimal-pad"
          placeholder="0"
          error={errors.interestRate}
        />

        {/* Date */}
        <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>
          {t('finance.date')}
        </Text>
        <TouchableOpacity
          style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
          onPress={() => setShowDatePicker(true)}
        >
          <Feather name="calendar" size={16} color={colors.textMuted} />
          <Text style={[styles.pickerText, { color: colors.textPrimary }]}>
            {formatDate(date.toISOString())}
          </Text>
        </TouchableOpacity>

        {/* Person */}
        <InputField
          label={t('finance.person')}
          required
          value={person}
          onChangeText={setPerson}
          error={errors.person}
          autoCapitalize="words"
        />

        {/* Village */}
        <InputField
          label={`${t('finance.village')} (${t('finance.optional')})`}
          value={village}
          onChangeText={setVillage}
          autoCapitalize="words"
        />

        {/* Mobile */}
        <InputField
          label={`${t('finance.mobileNumber')} (${t('finance.optional')})`}
          value={mobileNumber}
          onChangeText={setMobileNumber}
          keyboardType="phone-pad"
          error={errors.mobileNumber}
        />

        {/* Event (optional) */}
        <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>
          {`${t('finance.event')} (${t('finance.optional')})`}
        </Text>
        <TouchableOpacity
          style={[styles.pickerBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
          onPress={() => setShowEventPicker(true)}
        >
          <Feather name="calendar" size={16} color={colors.textMuted} />
          <Text
            style={[
              styles.pickerText,
              { color: eventName ? colors.textPrimary : colors.textDisabled },
            ]}
            numberOfLines={1}
          >
            {eventName ?? t('finance.selectEvent')}
          </Text>
          {eventName ? (
            <TouchableOpacity onPress={() => selectEvent(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ) : (
            <Feather name="chevron-down" size={16} color={colors.textMuted} />
          )}
        </TouchableOpacity>

        {/* Notes */}
        <InputField
          label={`${t('finance.notes')} (${t('finance.optional')})`}
          value={notes}
          onChangeText={setNotes}
          multiline
        />
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
          <Button
            title={t('common.cancel')}
            onPress={() => navigation?.goBack()}
            variant="outline"
            style={{ flex: 1 }}
          />
          <Button
            title={isEdit ? t('common.save') : t('finance.addCredit')}
            onPress={handleSave}
            loading={saving}
            style={{ flex: 2 }}
          />
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

      {/* Event picker */}
      <Modal
        visible={showEventPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEventPicker(false)}
      >
        <TouchableOpacity
          style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}
          activeOpacity={1}
          onPress={() => setShowEventPicker(false)}
        >
          <View style={[styles.modalSheet, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              {t('finance.selectEvent')}
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <TouchableOpacity style={styles.eventRow} onPress={() => selectEvent(null)}>
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>{t('finance.noEvent')}</Text>
                {eventId == null ? <Feather name="check" size={18} color={colors.primary} /> : null}
              </TouchableOpacity>
              {events.map(opt => (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.eventRow, { borderTopColor: colors.borderLight, borderTopWidth: 1 }]}
                  onPress={() => selectEvent(opt)}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 14, flex: 1 }} numberOfLines={1}>
                    {opt.name}
                  </Text>
                  {eventId === opt.id ? <Feather name="check" size={18} color={colors.primary} /> : null}
                </TouchableOpacity>
              ))}
              {events.length === 0 ? (
                <Text style={{ color: colors.textMuted, fontSize: 13, paddingVertical: 16, textAlign: 'center' }}>
                  {t('finance.noEventsAvailable')}
                </Text>
              ) : null}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 18, fontWeight: '800' },
    content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
    groupLabel: { fontSize: 12, fontWeight: '600', marginTop: 16, marginBottom: 8 },
    pickerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      height: 48,
    },
    pickerText: { fontSize: 14, fontWeight: '500', flex: 1 },
    footer: {
      paddingHorizontal: 16,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    actions: { flexDirection: 'row', gap: 12 },
    modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
    modalSheet: { width: '100%', maxHeight: '70%', borderRadius: 18, padding: 20 },
    modalTitle: { fontSize: 17, fontWeight: '800', marginBottom: 14 },
    eventRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
    },
  });

export default AddEditCreditScreen;
