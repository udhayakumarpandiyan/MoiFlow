import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import Feather from '@react-native-vector-icons/feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, ThemeColors } from '@common/context/ThemeContext';
import { useAppTranslation } from '@common/hooks/useAppTranslation';
import { eventService } from '@common/services';
import type { MoiEvent } from '@moi/models/Event';
import { formatDateTime } from '@common/utils/format';
import { formatCash, formatGold } from '@common/utils/format';
import { FadeInView } from './FadeInView';
import { giftSuggestionService, GiftSuggestion } from '@moi/services/GiftSuggestionService';

interface NotificationsModalProps {
  visible: boolean;
  onClose: () => void;
}

interface NotifItem {
  id: string;
  title: string;
  subtitle: string;
  when: string;
  kind: 'reminder' | 'upcoming';
  event: MoiEvent;
}

/** Build the notification feed from events: reminders first, then upcoming. */
function buildFeed(events: MoiEvent[], t: (k: string, o?: any) => string): NotifItem[] {
  const now = Date.now();
  const items: NotifItem[] = [];

  // Reminders: events with an explicit notifyAt (any time).
  events
    .filter(e => !!e.notifyAt)
    .sort((a, b) => Date.parse(a.notifyAt!) - Date.parse(b.notifyAt!))
    .forEach(e => {
      items.push({
        id: `notif-${e.id}`,
        title: e.name,
        subtitle: subtitleFor(e),
        when: t('notifications.reminderAt', { when: formatDateTime(e.notifyAt) }),
        kind: 'reminder',
        event: e,
      });
    });

  // Upcoming: future-dated events that don't already have a reminder listed.
  const reminderIds = new Set(events.filter(e => !!e.notifyAt).map(e => e.id));
  events
    .filter(e => e.date && Date.parse(e.date) > now && !reminderIds.has(e.id))
    .sort((a, b) => Date.parse(a.date!) - Date.parse(b.date!))
    .forEach(e => {
      items.push({
        id: `up-${e.id}`,
        title: e.name,
        subtitle: subtitleFor(e),
        when: t('notifications.eventOn', { when: formatDateTime(e.date) }),
        kind: 'upcoming',
        event: e,
      });
    });

  return items;
}

function subtitleFor(e: MoiEvent): string {
  const parts = [e.venue, e.villageName].filter(Boolean) as string[];
  return parts.join(' · ') || e.type || '';
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  visible,
  onClose,
}) => {
  const { colors } = useTheme();
  const { t } = useAppTranslation();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, GiftSuggestion>>({});

  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    setLoading(true);
    setSuggestions({});
    eventService
      .getAllEvents()
      .then(async events => {
        const feed = buildFeed(events, t);
        if (mounted) setItems(feed);

        // Compute a "what should I give?" suggestion for each event you attend
        // (OTHER_PERSON events). Done after first paint so the list shows fast.
        const map: Record<string, GiftSuggestion> = {};
        await Promise.all(
          feed
            .filter(it => it.event.ownerType === 'OTHER_PERSON')
            .map(async it => {
              try {
                map[it.id] = await giftSuggestionService.suggestForEvent(it.event);
              } catch {
                /* skip suggestion on error */
              }
            }),
        );
        if (mounted) setSuggestions(map);
      })
      .catch(() => {
        if (mounted) setItems([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [visible, t]);

  const suggestionText = (s: GiftSuggestion): string | null => {
    if (s.basis === 'none') return null;
    const parts: string[] = [];
    if (s.suggestedCash > 0) parts.push(formatCash(s.suggestedCash));
    if (s.suggestedGold > 0) parts.push(formatGold(s.suggestedGold));
    if (parts.length === 0) return null;
    const amount = parts.join(' + ');
    return s.basis === 'reciprocal'
      ? t('notifications.suggestReciprocal', {
          amount,
          received: formatCash(s.previouslyReceivedCash),
        })
      : t('notifications.suggestAverage', { amount });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/* Tap-to-dismiss backdrop */}
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />

        <View style={[styles.sheet, { paddingTop: insets.top + 8 }]}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.bellCircle}>
                <Feather name="bell" size={18} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.title}>{t('notifications.title')}</Text>
                <Text style={styles.subtitle}>{t('notifications.subtitle')}</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name="x" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : items.length === 0 ? (
            <View style={styles.centered}>
              <Feather name="bell-off" size={40} color={colors.textDisabled} />
              <Text style={styles.emptyTitle}>{t('notifications.empty')}</Text>
              <Text style={styles.emptyDesc}>{t('notifications.emptyDesc')}</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.list}
              contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
              showsVerticalScrollIndicator={false}
            >
              {items.map((item, i) => {
                const s = suggestions[item.id];
                const sText = s ? suggestionText(s) : null;
                return (
                  <FadeInView key={item.id} delay={i * 40}>
                    <View style={styles.card}>
                      <View style={styles.row}>
                        <View
                          style={[
                            styles.iconWrap,
                            {
                              backgroundColor:
                                item.kind === 'reminder' ? colors.pendingBg : colors.primaryBg,
                            },
                          ]}
                        >
                          <Feather
                            name={item.kind === 'reminder' ? 'clock' : 'calendar'}
                            size={16}
                            color={item.kind === 'reminder' ? colors.pendingColor : colors.primary}
                          />
                        </View>
                        <View style={styles.rowBody}>
                          <Text style={styles.rowTitle} numberOfLines={1}>
                            {item.title}
                          </Text>
                          {!!item.subtitle && (
                            <Text style={styles.rowSub} numberOfLines={1}>
                              {item.subtitle}
                            </Text>
                          )}
                          <Text style={styles.rowWhen}>{item.when}</Text>
                        </View>
                      </View>

                      {/* Event details */}
                      <View style={styles.detailRow}>
                        {!!item.event.personName && (
                          <View style={styles.detailChip}>
                            <Feather name="user" size={12} color={colors.textMuted} />
                            <Text style={styles.detailText} numberOfLines={1}>
                              {item.event.personName}
                            </Text>
                          </View>
                        )}
                        {!!item.event.type && (
                          <View style={styles.detailChip}>
                            <Feather name="tag" size={12} color={colors.textMuted} />
                            <Text style={styles.detailText} numberOfLines={1}>
                              {item.event.type}
                            </Text>
                          </View>
                        )}
                        {!!item.event.time && (
                          <View style={styles.detailChip}>
                            <Feather name="clock" size={12} color={colors.textMuted} />
                            <Text style={styles.detailText} numberOfLines={1}>
                              {item.event.time}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Smart "What should I give?" suggestion */}
                      {sText && (
                        <View style={styles.suggestBox}>
                          <View style={styles.suggestHeader}>
                            <Feather name="gift" size={14} color={colors.primary} />
                            <Text style={styles.suggestTitle}>
                              {t('notifications.suggestTitle')}
                            </Text>
                          </View>
                          <Text style={styles.suggestText}>{sText}</Text>
                        </View>
                      )}
                    </View>
                  </FadeInView>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
    },
    sheet: {
      position: 'absolute',
      top: 0,
      right: 0,
      left: 0,
      maxHeight: '78%',
      backgroundColor: colors.surface,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      paddingHorizontal: 16,
      paddingBottom: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.2,
      shadowRadius: 16,
      elevation: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
      marginBottom: 8,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    bellCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primaryBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    subtitle: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 1,
    },
    closeBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    centered: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
      gap: 8,
    },
    emptyTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textSecondary,
      marginTop: 6,
    },
    emptyDesc: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'center',
      paddingHorizontal: 24,
    },
    list: {
      flexGrow: 0,
    },
    card: {
      backgroundColor: colors.background,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.borderLight,
      padding: 12,
      marginBottom: 10,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowBody: {
      flex: 1,
    },
    rowTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textPrimary,
    },
    rowSub: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 1,
    },
    rowWhen: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 3,
    },
    detailRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 10,
    },
    detailChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderLight,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      maxWidth: '100%',
    },
    detailText: {
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    suggestBox: {
      marginTop: 10,
      backgroundColor: colors.primaryBg,
      borderRadius: 10,
      padding: 10,
    },
    suggestHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 4,
    },
    suggestTitle: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.primary,
      letterSpacing: 0.2,
    },
    suggestText: {
      fontSize: 13,
      color: colors.textPrimary,
      lineHeight: 19,
    },
  });
