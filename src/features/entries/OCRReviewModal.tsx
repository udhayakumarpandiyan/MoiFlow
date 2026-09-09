import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Feather from '@react-native-vector-icons/feather';

import { useTheme, ThemeColors } from '../../context/ThemeContext';
import { entryService } from '../../services';
import type { HandwrittenEntry } from '../../services/OCRService';

type AmountKind = 'cash' | 'gold';

/** Editable row model for the review screen. */
interface ReviewRow {
  key: string;
  name: string;
  village: string;
  /** Which kind of contribution this row represents. */
  amountKind: AmountKind;
  /** Amount value as a string (cash in rupees, or gold in grams). */
  amount: string;
}

interface OCRReviewModalProps {
  visible: boolean;
  /** Extracted entries from OCR (may be empty). */
  extracted: HandwrittenEntry[];
  /** The Own Event these IN entries will be mapped to (mandatory). */
  eventId: string | null;
  eventName?: string;
  eventDate?: string | null;
  loading?: boolean;
  /** false = OCR backend was unreachable / unavailable for the last scan. */
  backendReachable?: boolean;
  onClose: () => void;
  /** Called after entries are saved (with the number saved). */
  onSaved: (count: number) => void;
}

/**
 * Review / edit screen for OCR-extracted handwritten IN entries.
 *
 * - Only creates IN entries (entryType = 'OWN_EVENT').
 * - Every entry is mapped to the provided Own Event (mandatory).
 * - The user can edit each field and remove rows before saving.
 */
const OCRReviewModal: React.FC<OCRReviewModalProps> = ({
  visible,
  extracted,
  eventId,
  eventName,
  eventDate,
  loading = false,
  backendReachable = true,
  onClose,
  onSaved,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      const mapped: ReviewRow[] = extracted.map((e, i) => {
        const isGold = e.goldWeight > 0 && e.cashAmount <= 0;
        return {
          key: `${i}-${Date.now()}`,
          name: e.name ?? '',
          village: e.village ?? '',
          amountKind: isGold ? 'gold' : 'cash',
          amount: isGold
            ? String(e.goldWeight)
            : e.cashAmount > 0
            ? String(e.cashAmount)
            : '',
        };
      });
      setRows(mapped);
    }
  }, [visible, extracted]);

  const updateRow = (key: string, field: keyof ReviewRow, value: string) => {
    setRows(prev => prev.map(r => (r.key === key ? { ...r, [field]: value } : r)));
  };

  const setAmountKind = (key: string, kind: AmountKind) => {
    setRows(prev => prev.map(r => (r.key === key ? { ...r, amountKind: kind } : r)));
  };

  const removeRow = (key: string) => {
    setRows(prev => prev.filter(r => r.key !== key));
  };

  const addRow = () => {
    setRows(prev => [
      ...prev,
      { key: `new-${Date.now()}`, name: '', village: '', amountKind: 'cash', amount: '' },
    ]);
  };

  const validRows = rows.filter(r => {
    const value = Number(r.amount) || 0;
    return r.name.trim().length > 0 && value > 0;
  });

  const handleSaveAll = async () => {
    if (!eventId) {
      Alert.alert(t('common.error'), t('entries.eventRequired'));
      return;
    }
    if (validRows.length === 0) {
      Alert.alert(t('common.error'), t('ocr.noValidEntries'));
      return;
    }

    setSaving(true);
    let savedCount = 0;
    try {
      for (const r of validRows) {
        const value = Number(r.amount) || 0;
        await entryService.addEntry({
          entryType: 'OWN_EVENT',
          personName: r.name.trim(),
          villageName: r.village.trim() || undefined,
          cashAmount: r.amountKind === 'cash' ? value : 0,
          goldWeight: r.amountKind === 'gold' ? value : 0,
          eventId,
          eventName: eventName ?? undefined,
          eventDate: eventDate ?? undefined,
          remarks: t('ocr.scannedRemark'),
        });
        savedCount += 1;
      }
      onSaved(savedCount);
    } catch (err: any) {
      // Partial save is possible; report how many succeeded.
      Alert.alert(
        t('common.error'),
        savedCount > 0
          ? t('ocr.partialSaveError', { count: savedCount })
          : (err?.message ?? t('entries.saveFailed')),
      );
      if (savedCount > 0) onSaved(savedCount);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{t('ocr.reviewTitle')}</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {eventName ? `${t('entries.ownEventLabel')}: ${eventName}` : t('ocr.reviewSubtitle')}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>{t('ocr.scanning')}</Text>
            </View>
          ) : (
            <>
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {rows.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyIcon}>{backendReachable ? '📄' : '📡'}</Text>
                    <Text style={styles.emptyText}>
                      {backendReachable ? t('ocr.noEntriesFound') : t('ocr.backendUnavailable')}
                    </Text>
                    <Text style={styles.emptyHint}>{t('ocr.addManuallyHint')}</Text>
                  </View>
                ) : (
                  rows.map((row, index) => (
                    <View key={row.key} style={styles.rowCard}>
                      <View style={styles.rowHeader}>
                        <Text style={styles.rowIndex}>#{index + 1}</Text>
                        <TouchableOpacity onPress={() => removeRow(row.key)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Feather name="trash-2" size={16} color={colors.error} />
                        </TouchableOpacity>
                      </View>

                      <Text style={styles.fieldLabel}>{t('entries.personName')} *</Text>
                      <TextInput
                        style={styles.input}
                        value={row.name}
                        onChangeText={v => updateRow(row.key, 'name', v)}
                        placeholder={t('entries.enterPersonName')}
                        placeholderTextColor={colors.textDisabled}
                      />

                      <Text style={styles.fieldLabel}>{t('entries.village')}</Text>
                      <TextInput
                        style={styles.input}
                        value={row.village}
                        onChangeText={v => updateRow(row.key, 'village', v)}
                        placeholder={t('entries.enterVillage')}
                        placeholderTextColor={colors.textDisabled}
                      />

                      {/* Amount type toggle: Cash (rupees) or Gold (grams) */}
                      <Text style={styles.fieldLabel}>{t('ocr.amountType')}</Text>
                      <View style={styles.kindToggle}>
                        <TouchableOpacity
                          style={[
                            styles.kindOption,
                            row.amountKind === 'cash' && styles.kindOptionActive,
                          ]}
                          onPress={() => setAmountKind(row.key, 'cash')}
                        >
                          <Feather
                            name="dollar-sign"
                            size={13}
                            color={row.amountKind === 'cash' ? colors.textInverse : colors.textMuted}
                          />
                          <Text
                            style={[
                              styles.kindText,
                              row.amountKind === 'cash' && styles.kindTextActive,
                            ]}
                          >
                            {t('entries.cashAmount')}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.kindOption,
                            row.amountKind === 'gold' && styles.kindOptionActive,
                          ]}
                          onPress={() => setAmountKind(row.key, 'gold')}
                        >
                          <Feather
                            name="circle"
                            size={13}
                            color={row.amountKind === 'gold' ? colors.textInverse : colors.textMuted}
                          />
                          <Text
                            style={[
                              styles.kindText,
                              row.amountKind === 'gold' && styles.kindTextActive,
                            ]}
                          >
                            {t('entries.goldWeight')}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <Text style={styles.fieldLabel}>
                        {row.amountKind === 'cash'
                          ? t('entries.cashAmount')
                          : `${t('entries.goldWeight')} (${t('ocr.grams')})`}
                      </Text>
                      <TextInput
                        style={styles.input}
                        value={row.amount}
                        onChangeText={v => updateRow(row.key, 'amount', v.replace(/[^0-9.]/g, ''))}
                        placeholder="0"
                        placeholderTextColor={colors.textDisabled}
                        keyboardType="numeric"
                      />
                    </View>
                  ))
                )}

                <TouchableOpacity style={styles.addRowBtn} onPress={addRow}>
                  <Feather name="plus" size={16} color={colors.primary} />
                  <Text style={styles.addRowText}>{t('ocr.addRow')}</Text>
                </TouchableOpacity>
              </ScrollView>

              {/* Sticky footer */}
              <View style={styles.footer}>
                <Text style={styles.footerHint}>
                  {t('ocr.willSaveCount', { count: validRows.length })}
                </Text>
                <TouchableOpacity
                  style={[styles.saveBtn, { opacity: saving || validRows.length === 0 ? 0.6 : 1 }]}
                  onPress={handleSaveAll}
                  disabled={saving || validRows.length === 0}
                >
                  <Text style={styles.saveBtnText}>
                    {saving ? t('entries.saving') : t('ocr.saveAll', { count: validRows.length })}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default OCRReviewModal;

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
    sheet: {
      maxHeight: '92%',
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 20,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
      paddingHorizontal: 20,
    },
    title: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
    subtitle: { fontSize: 12, fontWeight: '600', marginTop: 3, color: colors.textMuted },
    closeBtn: {
      width: 34, height: 34, borderRadius: 17,
      backgroundColor: colors.background,
      alignItems: 'center', justifyContent: 'center',
    },
    loadingBox: { paddingVertical: 60, alignItems: 'center' },
    loadingText: { marginTop: 12, fontSize: 13, color: colors.textMuted },
    scroll: { paddingHorizontal: 20 },
    scrollContent: { paddingBottom: 16 },
    emptyBox: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
    emptyIcon: { fontSize: 40, marginBottom: 10 },
    emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
    emptyHint: { fontSize: 12, color: colors.textDisabled, textAlign: 'center', marginTop: 6 },
    kindToggle: {
      flexDirection: 'row', gap: 8, marginTop: 2, marginBottom: 2,
    },
    kindOption: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 6, paddingVertical: 9, borderRadius: 10,
      borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    },
    kindOptionActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    kindText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
    kindTextActive: { color: colors.textInverse },
    rowCard: {
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 14,
      marginBottom: 12,
    },
    rowHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    rowIndex: { fontSize: 12, fontWeight: '700', color: colors.primary },
    fieldLabel: {
      fontSize: 11, fontWeight: '700', letterSpacing: 0.3,
      color: colors.textMuted, marginBottom: 5, marginTop: 8,
    },
    input: {
      borderWidth: 1, borderColor: colors.border, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10,
      fontSize: 13, color: colors.textPrimary, backgroundColor: colors.surface,
    },
    rowFields: { flexDirection: 'row', gap: 10 },
    halfField: { flex: 1 },
    addRowBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 6, paddingVertical: 12, borderRadius: 10,
      borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
    },
    addRowText: { fontSize: 13, fontWeight: '600', color: colors.primary },
    footer: {
      paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight,
    },
    footerHint: { fontSize: 12, color: colors.textMuted, marginBottom: 10, textAlign: 'center' },
    saveBtn: {
      backgroundColor: colors.primary, borderRadius: 12,
      paddingVertical: 14, alignItems: 'center',
    },
    saveBtnText: { fontSize: 14, fontWeight: '700', color: colors.textInverse },
  });
