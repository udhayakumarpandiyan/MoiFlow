import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Feather from '@react-native-vector-icons/feather';

import { useTheme, ThemeColors } from '@common/context/ThemeContext';
import { Entry } from '@moi/models/Entry';
import { Badge } from '@common/components/Badge';
import { formatCash, formatGold, formatDate } from '@common/utils/format';

interface EntryDetailModalProps {
  visible: boolean;
  entry: Entry | null;
  onClose: () => void;
  onEdit: (entry: Entry) => void;
  onDelete: (entry: Entry) => void;
}

/**
 * Read-only detail view for a single IN/OUT entry.
 * Provides Edit and Delete actions.
 */
const EntryDetailModal: React.FC<EntryDetailModalProps> = ({
  visible,
  entry,
  onClose,
  onEdit,
  onDelete,
}) => {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  if (!entry) return null;

  const isIn = entry.entryType === 'OWN_EVENT';
  const cash = Number(entry.cashAmount) || 0;
  const gold = Number(entry.goldWeight) || 0;

  const Row = ({ label, value }: { label: string; value?: string | null }) =>
    value ? (
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    ) : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.title} numberOfLines={1}>
                {entry.personName}
              </Text>
              <Badge label={isIn ? 'IN' : 'OUT'} type={isIn ? 'in' : 'out'} />
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Amounts */}
            <View style={styles.amountRow}>
              <View style={styles.amountBox}>
                <Text style={styles.amountLabel}>{t('entries.cashAmount')}</Text>
                <Text style={[styles.amountValue, { color: isIn ? colors.inColor : colors.outColor }]}>
                  {formatCash(cash)}
                </Text>
              </View>
              <View style={styles.amountBox}>
                <Text style={styles.amountLabel}>{t('entries.goldWeight')}</Text>
                <Text style={[styles.amountValue, { color: colors.gold }]}>
                  {formatGold(gold)}
                </Text>
              </View>
            </View>

            {/* Details */}
            <View style={styles.detailsCard}>
              <Row label={t('entries.direction')} value={isIn ? t('entries.inMoneyReceived') : t('entries.outMoneyGiven')} />
              <Row label={t('entries.villageName')} value={entry.villageName} />
              <Row label={t('entries.event')} value={entry.eventName} />
              <Row label={t('common.date')} value={formatDate(entry.eventDate ?? entry.createdAt)} />
              <Row label={t('entries.remarks')} value={entry.remarks} />
            </View>
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.deleteBtn]}
              onPress={() => onDelete(entry)}
              activeOpacity={0.8}
            >
              <Feather name="trash-2" size={16} color={colors.error} />
              <Text style={[styles.actionBtnText, { color: colors.error }]}>{t('common.delete')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.editBtn]}
              onPress={() => onEdit(entry)}
              activeOpacity={0.8}
            >
              <Feather name="edit-2" size={16} color={colors.textInverse} />
              <Text style={[styles.actionBtnText, { color: colors.textInverse }]}>{t('common.edit')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default EntryDetailModal;

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: colors.overlay,
    },
    sheet: {
      maxHeight: '85%',
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 24,
      paddingTop: 20,
      paddingBottom: 32,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textPrimary,
      flexShrink: 1,
    },
    closeBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeBtnText: {
      fontSize: 14,
      color: colors.textMuted,
    },
    amountRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 16,
    },
    amountBox: {
      flex: 1,
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 14,
      alignItems: 'center',
    },
    amountLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textMuted,
      marginBottom: 6,
    },
    amountValue: {
      fontSize: 18,
      fontWeight: '700',
    },
    detailsCard: {
      backgroundColor: colors.background,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 4,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderLight,
    },
    rowLabel: {
      fontSize: 13,
      color: colors.textMuted,
      flex: 1,
    },
    rowValue: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textPrimary,
      flex: 1.4,
      textAlign: 'right',
    },
    actions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 20,
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 50,
      borderRadius: 12,
    },
    deleteBtn: {
      borderWidth: 1.5,
      borderColor: colors.error,
      backgroundColor: 'transparent',
    },
    editBtn: {
      backgroundColor: colors.primary,
    },
    actionBtnText: {
      fontSize: 14,
      fontWeight: '700',
    },
  });
