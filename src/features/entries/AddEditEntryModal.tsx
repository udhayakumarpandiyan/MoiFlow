import React, { useEffect, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';

import { Entry, CreateEntryInput, EntryType } from '../../models/Entry';
import { MoiEvent } from '../../models/Event';
import { entryService, eventService } from '../../services';
import { useTheme } from '../../context/ThemeContext';
import Feather from '@react-native-vector-icons/feather';
import { Colors } from '../../theme/colors';
import { Spacing } from '../../theme/typography';
import { InputField } from '../../components/InputField';
import { Button } from '../../components/Button';
import { SegmentedControl } from '../../components/SegmentedControl';
import { isoToDateInput } from '../../utils/format';
import { VoicePrefill } from './VoiceEntryModal';

interface AddEditEntryModalProps {
  visible: boolean;
  entry?: Entry | null;
  prefillEventId?: string | null;
  /** Pre-filled values coming from voice recognition */
  voicePrefill?: VoicePrefill | null;
  /** When set, locks the entry type (hides the toggle). Derived from Entries screen direction. */
  forceEntryType?: EntryType | null;
  onClose: () => void;
  onSaved: (entry: Entry) => void;
}

const ENTRY_TYPE_SEGMENTS_KEYS = [
  { key: 'OWN_EVENT', labelKey: 'entries.inEntryType' },
  { key: 'OTHER_EVENT', labelKey: 'entries.outEntryType' },
];

const AddEditEntryModal: React.FC<AddEditEntryModalProps> = ({
  visible,
  entry,
  prefillEventId,
  voicePrefill,
  forceEntryType,
  onClose,
  onSaved,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const isEdit = !!entry;

  const [entryType, setEntryType] = useState<EntryType>('OWN_EVENT');
  const [personName, setPersonName] = useState('');
  const [villageName, setVillageName] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [goldWeight, setGoldWeight] = useState('');
  const [remarks, setRemarks] = useState('');
  const [eventId, setEventId] = useState<string | null>(null);
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [events, setEvents] = useState<MoiEvent[]>([]);
  const [showEventPicker, setShowEventPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const loadEvents = useCallback(async () => {
    try {
      const all = await eventService.getAllEvents();
      setEvents(all);
    } catch (err) {
      console.error('[AddEditEntryModal] load events error:', err);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      loadEvents();
      if (entry) {
        // Edit mode
        setEntryType(entry.entryType);
        setPersonName(entry.personName);
        setVillageName(entry.villageName ?? '');
        setCashAmount(entry.cashAmount > 0 ? String(entry.cashAmount) : '');
        setGoldWeight(entry.goldWeight > 0 ? String(entry.goldWeight) : '');
        setRemarks(entry.remarks ?? '');
        setEventId(entry.eventId);
        setEventName(entry.eventName ?? '');
        setEventDate(isoToDateInput(entry.eventDate));
      } else {
        resetForm();
        if (voicePrefill) {
          // Apply voice prefill
          setEntryType(voicePrefill.entryType);
          if (voicePrefill.personName) setPersonName(voicePrefill.personName);
          if (voicePrefill.villageName) setVillageName(voicePrefill.villageName);
          if (voicePrefill.cashAmount > 0) setCashAmount(String(voicePrefill.cashAmount));
          if (voicePrefill.goldWeight > 0) setGoldWeight(String(voicePrefill.goldWeight));
          if (voicePrefill.eventId) setEventId(voicePrefill.eventId);
          if (voicePrefill.eventName) setEventName(voicePrefill.eventName);
          if (voicePrefill.eventDate) setEventDate(voicePrefill.eventDate);
          if (voicePrefill.remarks) setRemarks(voicePrefill.remarks);
        } else if (forceEntryType) {
          setEntryType(forceEntryType);
          if (prefillEventId) setEventId(prefillEventId);
        } else if (prefillEventId) {
          setEventId(prefillEventId);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, entry, prefillEventId, voicePrefill]);

  const resetForm = () => {
    setEntryType('OWN_EVENT');
    setPersonName('');
    setVillageName('');
    setCashAmount('');
    setGoldWeight('');
    setRemarks('');
    setEventId(null);
    setEventName('');
    setEventDate('');
    setErrors({});
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!personName.trim()) newErrors.personName = t('entries.personNameRequired');
    const cash = Number(cashAmount) || 0;
    const gold = Number(goldWeight) || 0;
    if (cash === 0 && gold === 0) newErrors.amount = t('entries.amountRequired');
    if (cash < 0) newErrors.amount = t('entries.negativeAmount');
    if (gold < 0) newErrors.goldWeight = t('entries.negativeGold');
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const input: CreateEntryInput = {
        entryType,
        personName: personName.trim(),
        villageName: villageName.trim() || undefined,
        cashAmount: Number(cashAmount) || 0,
        goldWeight: Number(goldWeight) || 0,
        remarks: remarks.trim() || undefined,
        eventId: eventId ?? null,
        eventName: eventName.trim() || undefined,
        eventDate: eventDate || undefined,
      };

      let saved: Entry;
      if (isEdit && entry) {
        saved = await entryService.updateEntry(entry.id, input);
      } else {
        saved = await entryService.addEntry(input);
      }

      onSaved(saved);
      resetForm();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('entries.saveFailed');
      Alert.alert(t('common.error'), msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t('entries.deleteEntry'),
      t('entries.deleteConfirm'),
      [
        { text: t('entries.confirmNo'), style: 'cancel' },
        {
          text: t('entries.confirmYes'),
          style: 'destructive',
          onPress: async () => {
            if (!entry) return;
            setSaving(true);
            try {
              await entryService.deleteEntry(entry.id);
              onSaved(entry);
              onClose();
            } catch (err) {
              Alert.alert(t('common.error'), t('entries.deleteFailed'));
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  const selectedEvent = events.find(e => e.id === eventId);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.overlay, { backgroundColor: colors.overlay }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {showEventPicker ? (
          <View style={[styles.pickerOverlay, { backgroundColor: colors.overlay }]}>
            <View style={[styles.pickerSheet, { backgroundColor: colors.surface }]}>
              <View style={[styles.pickerHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.pickerTitle, { color: colors.textPrimary }]}>{t('entries.selectEvent')}</Text>
                <TouchableOpacity onPress={() => setShowEventPicker(false)}>
                  <Text style={[styles.pickerClose, { color: colors.textMuted }]}>?</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.pickerItem}
                onPress={() => { setEventId(null); setEventName(''); setShowEventPicker(false); }}
              >
                <Text style={[styles.pickerItemText, { color: colors.textPrimary }]}>{t('entries.noEvent')}</Text>
              </TouchableOpacity>
              {events.map(ev => (
                <TouchableOpacity
                  key={ev.id}
                  style={[styles.pickerItem, ev.id === eventId && [styles.pickerItemSelected, { backgroundColor: colors.primaryBg }]]}
                  onPress={() => { setEventId(ev.id); setEventName(ev.name); setShowEventPicker(false); }}
                >
                  <Text style={[styles.pickerItemText, { color: colors.textPrimary }, ev.id === eventId && { color: colors.primary, fontWeight: '600' }]}>
                    {ev.name}
                  </Text>
                  {ev.date ? <Text style={[styles.pickerItemSub, { color: colors.textMuted }]}>{ev.date}</Text> : null}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={styles.header}>
            <View>
              <View style={styles.titleRow}>
                {voicePrefill && !isEdit ? <Feather name="mic" size={16} color={colors.textPrimary} /> : null}
                <Text style={[styles.title, { color: colors.textPrimary }]}>
                  {isEdit ? t('entries.editEntry') : voicePrefill ? t('entries.voiceEntry') : t('entries.addEntry')}
                </Text>
              </View>
              <Text style={[styles.subtitle, entryType === 'OWN_EVENT' ? { color: colors.inColor } : { color: colors.outColor }]}>
                {entryType === 'OWN_EVENT' ? t('entries.inMoneyReceived') : t('entries.outMoneyGiven')}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.background }]}>
              <Text style={[styles.closeBtnText, { color: colors.textMuted }]}>?</Text>
            </TouchableOpacity>
          </View>

          {/* Voice recognised text banner */}
          {voicePrefill?.recognizedText ? (
            <View style={[styles.voiceBanner, { backgroundColor: colors.primaryBg }]}>
              <Text style={[styles.voiceBannerLabel, { color: colors.primary }]}>{t('entries.heardText')}</Text>
              <Text style={[styles.voiceBannerText, { color: colors.textSecondary }]} numberOfLines={2}>{voicePrefill.recognizedText}</Text>
            </View>
          ) : null}

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('entries.eventOptional')}</Text>
            {entryType === 'OWN_EVENT' ? (
              <TouchableOpacity style={[styles.eventSelector, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => setShowEventPicker(true)}>
                <Text style={selectedEvent ? [styles.eventSelectorText, { color: colors.textPrimary }] : [styles.eventSelectorPlaceholder, { color: colors.textDisabled }]}>
                  {selectedEvent ? selectedEvent.name : t('entries.selectEventPlaceholder')}
                </Text>
                <Text style={[styles.eventSelectorArrow, { color: colors.textMuted }]}>?</Text>
              </TouchableOpacity>
            ) : (
              <InputField
                label=""
                value={eventName}
                onChangeText={setEventName}
                placeholder={t('entries.selectEventPlaceholder')}
                autoCapitalize="words"
              />
            )}

            <InputField
              label={t('entries.personName')}
              required
              value={personName}
              onChangeText={setPersonName}
              placeholder={t('entries.enterPersonName')}
              autoCapitalize="words"
              error={errors.personName}
            />

            <InputField
              label={t('entries.village')}
              value={villageName}
              onChangeText={setVillageName}
              placeholder={t('entries.enterVillage')}
              autoCapitalize="words"
            />

            <InputField
              label={`${t('entries.cashAmount')} (?)`}
              value={cashAmount}
              onChangeText={setCashAmount}
              placeholder="0"
              keyboardType="decimal-pad"
              error={errors.amount}
            />

            <InputField
              label={t('entries.goldWeight')}
              value={goldWeight}
              onChangeText={setGoldWeight}
              placeholder="0"
              keyboardType="decimal-pad"
              error={errors.goldWeight}
            />

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t('entries.eventDateOptional')}</Text>
            <TouchableOpacity
              style={[styles.eventSelector, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={eventDate ? [styles.eventSelectorText, { color: colors.textPrimary }] : [styles.eventSelectorPlaceholder, { color: colors.textDisabled }]}>
                {eventDate || 'YYYY-MM-DD'}
              </Text>
              <Text style={[styles.eventSelectorArrow, { color: colors.textMuted }]}>??</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={eventDate ? new Date(eventDate) : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(_event, selectedDate) => {
                  setShowDatePicker(Platform.OS === 'ios');
                  if (selectedDate) {
                    const yyyy = selectedDate.getFullYear();
                    const mm = String(selectedDate.getMonth() + 1).padStart(2, '0');
                    const dd = String(selectedDate.getDate()).padStart(2, '0');
                    setEventDate(`${yyyy}-${mm}-${dd}`);
                  }
                }}
              />
            )}

            <InputField
              label={`${t('entries.remarks')} (${t('common.optional')})`}
              value={remarks}
              onChangeText={setRemarks}
              placeholder={t('entries.additionalNotes')}
              multiline
            />

            <View style={styles.actions}>
              {isEdit ? (
                <Button
                  title={t('common.delete')}
                  onPress={handleDelete}
                  variant="danger"
                  disabled={saving}
                  style={{ flex: 1 }}
                />
              ) : null}
              <Button
                title={saving ? t('entries.saving') : isEdit ? t('entries.updateEntry') : t('entries.saveEntry')}
                onPress={handleSave}
                loading={saving}
                style={{ flex: isEdit ? 2 : 1 }}
              />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default AddEditEntryModal;

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.overlay },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    maxHeight: '94%', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 30,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 16,
  },
  title: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subtitle: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontSize: 14, color: Colors.textMuted },

  voiceBanner: {
    backgroundColor: Colors.primaryBg, borderRadius: 10,
    padding: 10, marginBottom: 12,
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
  },
  voiceBannerLabel: { fontSize: 12, fontWeight: '700', color: Colors.primary, marginTop: 1 },
  voiceBannerText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },

  fieldLabel: {
    fontSize: 12, fontWeight: '600', color: Colors.textSecondary,
    marginBottom: 7, marginTop: Spacing.md,
  },
  eventSelector: {
    height: 48, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, paddingHorizontal: 13,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface,
  },
  eventSelectorText: { fontSize: 14, color: Colors.textPrimary },
  eventSelectorPlaceholder: { fontSize: 14, color: Colors.textDisabled },
  eventSelectorArrow: { color: Colors.textMuted, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 24 },

  pickerOverlay: {
    ...StyleSheet.absoluteFill, backgroundColor: Colors.overlay,
    zIndex: 10, justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '60%', paddingBottom: 30,
  },
  pickerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  pickerTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  pickerClose: { fontSize: 16, color: Colors.textMuted, padding: 4 },
  pickerItem: {
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  pickerItemSelected: { backgroundColor: Colors.primaryBg },
  pickerItemText: { fontSize: 14, color: Colors.textPrimary },
  pickerItemSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
});