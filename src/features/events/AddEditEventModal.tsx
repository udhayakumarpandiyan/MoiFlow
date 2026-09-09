import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Modal,
  TouchableOpacity, Alert, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';

import { MoiEvent, CreateEventInput, EventOwnerType } from '../../models/Event';
import { eventService } from '../../services';
import { useTheme, ThemeColors } from '../../context/ThemeContext';
import { Spacing } from '../../theme/typography';
import { InputField } from '../../components/InputField';
import { Button } from '../../components/Button';
import { SegmentedControl } from '../../components/SegmentedControl';
import { isoToDateInput, formatDate } from '../../utils/format';

/** Prefill data from voice recognition or OCR */
export interface EventPrefill {
  eventName?: string | null;
  eventType?: string | null;
  date?: string | null;
  time?: string | null;
  venue?: string | null;
  villageName?: string | null;
}

interface AddEditEventModalProps {
  visible: boolean;
  event?: MoiEvent | null;
  defaultOwnerType?: EventOwnerType;
  /** Prefill from voice or OCR */
  prefill?: EventPrefill | null;
  onClose: () => void;
  onSaved: () => void;
}

const EVENT_TYPES = [
  'WEDDING',
  'EAR_PIERCING',
  'BIRTHDAY',
  'MUPPOOSAI_PADAYAL',
  'HOUSEWARMING',
  'DEATH',
  'MANJAL_NEERATTU',
  'OTHER',
];

const AddEditEventModal: React.FC<AddEditEventModalProps> = ({
  visible,
  event: existing,
  defaultOwnerType,
  prefill,
  onClose,
  onSaved,
}) => {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const OWNER_SEGMENTS = useMemo(() => [
    { key: 'MY_EVENT', label: t('events.myEvent') },
    { key: 'OTHER_PERSON', label: t('events.otherPerson') },
  ], [t]);

  const isEdit = !!existing;

  const [ownerType, setOwnerType] = useState<EventOwnerType>('MY_EVENT');
  const [name, setName] = useState('');
  const [type, setType] = useState('WEDDING');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [venue, setVenue] = useState('');
  const [villageName, setVillageName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    if (visible) {
      if (existing) {
        setOwnerType(existing.ownerType);
        setName(existing.name);
        setType(existing.type);
        setDate(isoToDateInput(existing.date));
        setTime(existing.time ?? '');
        setVenue(existing.venue ?? '');
        setVillageName(existing.villageName ?? '');
        setDescription(existing.description ?? '');

        // Apply prefill from OCR on top of existing event data (overwrite only non-empty fields)
        if (prefill) {
          if (prefill.eventName) setName(prefill.eventName);
          if (prefill.eventType) {
            const mapped = EVENT_TYPES.find(
              et => et === prefill.eventType?.toUpperCase() || et.includes(prefill.eventType?.toUpperCase() ?? ''),
            );
            if (mapped) setType(mapped);
          }
          if (prefill.date) setDate(prefill.date);
          if (prefill.time) setTime(prefill.time);
          if (prefill.venue) setVenue(prefill.venue);
          if (prefill.villageName) setVillageName(prefill.villageName);
        }
      } else {
        setOwnerType(defaultOwnerType ?? 'MY_EVENT');
        setName('');
        setType('WEDDING');
        setDate('');
        setTime('');
        setVenue('');
        setVillageName('');
        setDescription('');

        // Apply prefill from voice or OCR
        if (prefill) {
          if (prefill.eventName) setName(prefill.eventName);
          if (prefill.eventType) {
            // Map to known type or default
            const mapped = EVENT_TYPES.find(
              et => et === prefill.eventType?.toUpperCase() || et.includes(prefill.eventType?.toUpperCase() ?? ''),
            );
            if (mapped) setType(mapped);
          }
          if (prefill.date) setDate(prefill.date);
          if (prefill.time) setTime(prefill.time);
          if (prefill.venue) setVenue(prefill.venue);
          if (prefill.villageName) setVillageName(prefill.villageName);
        }
      }
      setErrors({});
    }
  }, [visible, existing, defaultOwnerType, prefill]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = t('common.required');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const input: CreateEventInput = {
        name: name.trim(),
        type,
        ownerType,
        date: date || undefined,
        time: time || undefined,
        venue: venue.trim() || undefined,
        villageName: villageName.trim() || undefined,
        description: description.trim() || undefined,
      };
      if (isEdit && existing) {
        await eventService.updateEvent(existing.id, input);
      } else {
        await eventService.createEvent(input);
      }
      onSaved();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('common.error');
      Alert.alert(t('common.error'), msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!existing) return;
    Alert.alert(t('events.deleteEventTitle'), t('events.deleteEventMessage', { name: existing.name }), [
      { text: t('events.no'), style: 'cancel' },
      {
        text: t('events.yes'), style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await eventService.deleteEvent(existing.id);
            onSaved();
            onClose();
          } catch {
            Alert.alert(t('common.error'), t('events.deleteEventError'));
          } finally { setSaving(false); }
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {isEdit ? t('events.editEvent') : t('events.createEvent')}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Owner type */}
            <Text style={styles.label}>{t('events.ownerType')}</Text>
            <SegmentedControl
              segments={OWNER_SEGMENTS}
              selected={ownerType}
              onSelect={v => setOwnerType(v as EventOwnerType)}
              style={{ marginBottom: 4 }}
            />

            <InputField
              label={t('events.eventName')}
              required
              value={name}
              onChangeText={setName}
              placeholder={t('events.eventName')}
              autoCapitalize="words"
              error={errors.name}
            />

            {/* Event type picker */}
            <Text style={styles.label}>{t('events.eventType')}</Text>
            <View style={styles.typeGrid}>
              {EVENT_TYPES.map(typeKey => (
                <TouchableOpacity
                  key={typeKey}
                  style={[styles.typeChip, type === typeKey && styles.typeChipActive]}
                  onPress={() => setType(typeKey)}
                >
                  <Text style={[styles.typeChipText, type === typeKey && styles.typeChipTextActive]}>
                    {t(`events.types.${typeKey}`, { defaultValue: typeKey })}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Date */}
            <Text style={styles.label}>{t('events.date')}</Text>
            <TouchableOpacity
              style={styles.dateBtn}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={styles.dateBtnText}>
                📅 {date ? formatDate(date) : t('common.select')}
              </Text>
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={date ? new Date(date) : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onValueChange={(_, selectedDate) => {
                  setShowDatePicker(false);
                  setDate(selectedDate.toISOString().split('T')[0]);
                }}
                onDismiss={() => setShowDatePicker(false)}
              />
            )}

            {/* Time */}
            <Text style={styles.label}>{t('events.time')}</Text>
            <TouchableOpacity
              style={styles.dateBtn}
              onPress={() => setShowTimePicker(true)}
            >
              <Text style={styles.dateBtnText}>
                🕐 {time || t('common.select')}
              </Text>
            </TouchableOpacity>

            {showTimePicker && (
              <DateTimePicker
                value={time ? new Date(`2000-01-01T${time}`) : new Date()}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onValueChange={(_, selectedTime) => {
                  setShowTimePicker(false);
                  const h = selectedTime.getHours().toString().padStart(2, '0');
                  const m = selectedTime.getMinutes().toString().padStart(2, '0');
                  setTime(`${h}:${m}`);
                }}
                onDismiss={() => setShowTimePicker(false)}
              />
            )}

            <InputField
              label={t('events.venue')}
              value={venue}
              onChangeText={setVenue}
              placeholder={t('events.venue')}
              autoCapitalize="words"
            />
            <InputField
              label={t('events.village')}
              value={villageName}
              onChangeText={setVillageName}
              placeholder={t('events.village')}
              autoCapitalize="words"
            />
            <InputField
              label={t('events.description')}
              value={description}
              onChangeText={setDescription}
              placeholder={t('events.description')}
              multiline
            />

            <View style={styles.actions}>
              {isEdit && (
                <Button title={t('common.delete')} onPress={handleDelete} variant="danger" disabled={saving} style={{ flex: 1 }} />
              )}
              <Button
                title={saving ? t('common.loading') : isEdit ? t('common.save') : t('events.saveEvent')}
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

export default AddEditEventModal;

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContainer: {
    maxHeight: '92%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontSize: 14, color: colors.textMuted },
  content: { padding: Spacing.lg, paddingBottom: 40 },
  label: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 7, marginTop: 12 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  typeChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  typeChipTextActive: { color: colors.textInverse },
  dateBtn: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.background,
  },
  dateBtnText: { fontSize: 13, fontWeight: '500', color: colors.textPrimary },
  actions: { flexDirection: 'row', gap: 10, marginTop: 28 },
});