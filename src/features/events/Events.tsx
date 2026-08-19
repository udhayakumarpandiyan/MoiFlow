import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  TextInput,
  Share,
  Image,
  Linking,
  ScrollView,
  SectionList,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { eventService } from '../../services';
import { MoiEvent } from '../../models/Event';
import { useTheme, ThemeColors } from '../../context/ThemeContext';
import Feather from '@react-native-vector-icons/feather';
import { Spacing } from '../../theme/typography';
import { formatDate, formatCash } from '../../utils/format';
import { SegmentedControl } from '../../components/SegmentedControl';
import { EmptyState } from '../../components/EmptyState';
import { Badge } from '../../components/Badge';
import AddEditEntryModal from '../entries/AddEditEntryModal';
import VoiceEventModal from './VoiceEventModal';
import { ParsedVoiceEvent } from '../../voice/TamilEventParser';
import { ocrService } from '../../services/OCRService';
import { pickImage } from '../../utils/imagePicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AddEditEventModal, { EventPrefill } from './AddEditEventModal';

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

const EVENT_TASK_KEYS = [
  'events.tasks.invitationPrinting',
  'events.tasks.inviting',
  'events.tasks.dressShopping',
  'events.tasks.jewelShopping',
  'events.tasks.bookingCaterer',
  'events.tasks.bookingHall',
  'events.tasks.bookingProhit',
  'events.tasks.informingLabours',
  'events.tasks.functionArrangements',
  'events.tasks.bookingDrums',
  'events.tasks.bookingVessel',
  'events.tasks.buyingBananaLeaves',
  'events.tasks.bookingMicset',
  'events.tasks.bookingLights',
  'events.tasks.bookingVehicles',
  'events.tasks.bookingMoiEntry',
  'events.tasks.otherArrangements',
];

interface Props {
  navigation: {
    navigate: (
      screen: string,
      params?: Record<string, unknown>,
    ) => void;
  };
}

type EventFilter = 'UPCOMING' | 'PAST';

const EventsScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Only 2 tabs: My Events and Other Events
  const TAB_SEGMENTS = useMemo(() => [
    { key: 'MY_EVENT', label: t('events.myEvents') },
    { key: 'OTHER_PERSON', label: t('events.others') },
  ], [t]);

  const EVENT_FILTERS_LIST: { key: EventFilter; label: string }[] = useMemo(() => [
    { key: 'UPCOMING', label: t('events.upcoming') },
    { key: 'PAST', label: t('events.past') },
  ], [t]);

  const [allEvents, setAllEvents] = useState<MoiEvent[]>([]);

  const [tab, setTab] = useState<string>('MY_EVENT');
  const [eventFilter, setEventFilter] = useState<EventFilter>('UPCOMING');

  const [search, setSearch] = useState('');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [entryModalVisible, setEntryModalVisible] = useState(false);
  const [entryEventId, setEntryEventId] = useState<string | null>(null);

  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const [completedTasks, setCompletedTasks] = useState<Record<string, string[]>>({});

  const [voiceEventModalVisible, setVoiceEventModalVisible] = useState(false);

  // Invitation viewer
  const [viewingInvitation, setViewingInvitation] = useState<string | null>(null);

  // Add/Edit Event modal
  const [eventModalVisible, setEventModalVisible] = useState(false);
  const [editingEvent, setEditingEvent] = useState<MoiEvent | null>(null);
  const [eventPrefill, setEventPrefill] = useState<EventPrefill | null>(null);

  const loadEvents = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const events = await eventService.getAllEvents();
        setAllEvents(events);
      } catch (err) {
        console.error('[Events] load error:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [loadEvents]),
  );

  const today = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  // Filtered events based on tab, date filter, and search
  const filteredEvents = useMemo(() => {
    let events = allEvents.filter(event => event.ownerType === tab);

    if (tab === 'OTHER_PERSON') {
      // For other events, filter by upcoming/past
      if (eventFilter === 'UPCOMING') {
        events = events.filter(event => {
          if (!event.date) return true;
          const date = new Date(event.date);
          date.setHours(0, 0, 0, 0);
          return date >= today;
        });
      } else {
        events = events.filter(event => {
          if (!event.date) return false;
          const date = new Date(event.date);
          date.setHours(0, 0, 0, 0);
          return date < today;
        });
      }
    }

    if (search.trim()) {
      const query = search.trim().toLowerCase();
      events = events.filter(event => {
        const name = event.name?.toLowerCase() ?? '';
        const venue = event.venue?.toLowerCase() ?? '';
        const village = event.villageName?.toLowerCase() ?? '';
        return name.includes(query) || venue.includes(query) || village.includes(query);
      });
    }

    events.sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
      return eventFilter === 'PAST' ? -diff : diff;
    });

    return events;
  }, [allEvents, eventFilter, search, tab, today]);

  const myEventCount = useMemo(
    () => allEvents.filter(event => event.ownerType === 'MY_EVENT').length,
    [allEvents],
  );

  const canCreateMyEvent = myEventCount < 5;

  const handleTabChange = (value: string) => {
    setTab(value);
    setExpandedEventId(null);
  };

  const handleEventFilterChange = (value: EventFilter) => {
    setEventFilter(value);
    setExpandedEventId(null);
  };

  const handleCreateEvent = () => {
    if (tab === 'MY_EVENT' && !canCreateMyEvent) {
      Alert.alert(t('events.maxEventsTitle'), t('events.maxEventsMessage'));
      return;
    }
    setEditingEvent(null);
    setEventModalVisible(true);
  };

  const handleSetActive = (event: MoiEvent) => {
    Alert.alert(
      t('events.setActiveTitle'),
      t('events.setActiveMessage', { name: event.name }),
      [
        { text: t('events.no'), style: 'cancel' },
        {
          text: t('events.yes'),
          onPress: async () => {
            try {
              await eventService.setActiveEvent(event.id);
              loadEvents(true);
            } catch (error) {
              console.error('[Events] set active error:', error);
              Alert.alert(t('common.error'), t('events.setActiveError'));
            }
          },
        },
      ],
    );
  };

  const handleAddEntry = (event: MoiEvent) => {
    setEntryEventId(event.id);
    setEntryModalVisible(true);
  };

  const handleToggleExpand = (eventId: string) => {
    setExpandedEventId(current => (current === eventId ? null : eventId));
  };

  const handleTaskToggle = (eventId: string, task: string) => {
    setCompletedTasks(current => {
      const existing = current[eventId] ?? [];
      const updated = existing.includes(task)
        ? existing.filter(item => item !== task)
        : [...existing, task];
      return { ...current, [eventId]: updated };
    });
  };

  const handleScanInvitation = (event?: MoiEvent) => {
    Alert.alert(
      t('events.invitationScan'),
      t('events.invitationScanPrompt'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('events.camera'), onPress: () => captureInvitationImage('camera', event) },
        { text: t('events.gallery'), onPress: () => captureInvitationImage('gallery', event) },
      ],
    );
  };

  const handleVoiceEvent = () => {
    setVoiceEventModalVisible(true);
  };

  const handleVoiceEventParsed = (result: ParsedVoiceEvent) => {
    // Voice parsed a new event — open the add modal with prefilled data
    setEditingEvent(null);
    setEventPrefill({
      eventName: result.eventName,
      eventType: result.eventType,
      date: result.date,
      venue: result.venue,
    });
    setEventModalVisible(true);
  };

  const captureInvitationImage = async (
    source: 'camera' | 'gallery',
    event?: MoiEvent,
  ) => {
    try {
      const eventId = event?.id ?? 'new';
      const imagePath = await pickImage(source, eventId);

      if (!imagePath) {
        Alert.alert(t('events.permissionDenied'), t('events.permissionDeniedMessage'));
        return;
      }

      // Store the image path in AsyncStorage
      await AsyncStorage.setItem(`invitation.${eventId}`, imagePath);

      // Process the image with OCR
      const ocrResult = await ocrService.processImage(imagePath);

      if (ocrResult.confidence >= 0.3) {
        // OCR extracted data — open event modal with prefilled fields
        setEditingEvent(event ?? null);
        setEventPrefill({
          eventName: ocrResult.eventName,
          date: ocrResult.date,
          venue: ocrResult.venue,
        });
        setEventModalVisible(true);
      } else {
        Alert.alert(
          t('events.invitationScan'),
          t('events.ocrFailed'),
          [
            {
              text: t('common.confirm'),
              onPress: () => {
                setEditingEvent(event ?? null);
                setEventPrefill(null);
                setEventModalVisible(true);
              },
            },
          ],
        );
      }
    } catch (error) {
      console.error('[Events] captureInvitationImage error:', error);
      Alert.alert(t('common.error'), t('events.ocrError'));
    }
  };

  const handleUploadInvitation = (event: MoiEvent) => {
    Alert.alert(
      t('events.invitationUpload'),
      t('events.invitationUploadPrompt', { name: event.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('events.camera'),
          onPress: async () => {
            try {
              const imagePath = await pickImage('camera', event.id);
              if (!imagePath) {
                Alert.alert(t('events.permissionDenied'), t('events.permissionDeniedMessage'));
                return;
              }
              await AsyncStorage.setItem(`invitation.${event.id}`, imagePath);
              Alert.alert(t('common.success'), t('events.invitationSaved'));
            } catch (error) {
              console.error('[Events] upload invitation error:', error);
              Alert.alert(t('common.error'), t('events.ocrError'));
            }
          },
        },
        {
          text: t('events.gallery'),
          onPress: async () => {
            try {
              const imagePath = await pickImage('gallery', event.id);
              if (!imagePath) {
                Alert.alert(t('events.permissionDenied'), t('events.permissionDeniedMessage'));
                return;
              }
              await AsyncStorage.setItem(`invitation.${event.id}`, imagePath);
              Alert.alert(t('common.success'), t('events.invitationSaved'));
            } catch (error) {
              console.error('[Events] upload invitation error:', error);
              Alert.alert(t('common.error'), t('events.ocrError'));
            }
          },
        },
      ],
    );
  };

  const handleViewInvitation = async (event: MoiEvent) => {
    try {
      const imagePath = await AsyncStorage.getItem(`invitation.${event.id}`);
      if (!imagePath) {
        Alert.alert(t('events.noInvitation'), t('events.noInvitationMessage'));
        return;
      }
      setViewingInvitation(imagePath);
    } catch (error) {
      console.error('[Events] view invitation error:', error);
      Alert.alert(t('common.error'), t('events.shareError'));
    }
  };

  const handleShareInviteWhatsApp = async (event: MoiEvent) => {
    try {
      const userName = await AsyncStorage.getItem('app.user_name');
      const ownerName = userName || t('events.eventOwnerDefault');
      const eventDate = event.date ? formatDate(event.date) : t('events.noDate');
      const venue = event.venue || '—';
      const village = event.villageName || '';

      const message = [
        `🎉 *${event.name}*`,
        '',
        `👤 ${t('events.eventOwner')}: ${ownerName}`,
        `📅 ${t('events.date')}: ${eventDate}`,
        `📍 ${t('events.venue')}: ${venue}`,
        village ? `🏘️ ${t('events.village')}: ${village}` : '',
        '',
        `— ${t('app.name')}`,
      ].filter(Boolean).join('\n');

      const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
      const canOpen = await Linking.canOpenURL(whatsappUrl);

      if (canOpen) {
        await Linking.openURL(whatsappUrl);
      } else {
        // Fallback to general share
        await Share.share({ message });
      }
    } catch (error) {
      console.error('[Events] share invite error:', error);
      Alert.alert(t('common.error'), t('events.shareError'));
    }
  };

  const handleDeleteEvent = (event: MoiEvent) => {
    Alert.alert(
      t('events.deleteEventTitle'),
      t('events.deleteEventMessage', { name: event.name }),
      [
        { text: t('events.no'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await eventService.deleteEvent(event.id);
              await loadEvents(true);
            } catch (error) {
              console.error('[Events] delete error:', error);
              Alert.alert(t('common.error'), t('events.deleteEventError'));
            }
          },
        },
      ],
    );
  };

  const getEventStatus = (event: MoiEvent) => {
    if (!event.date) {
      return { label: t('events.noDate'), type: 'pending' as const };
    }
    const date = new Date(event.date);
    date.setHours(0, 0, 0, 0);
    if (date < today) {
      return { label: t('events.completed'), type: 'out' as const };
    }
    if (date.getTime() === today.getTime()) {
      return { label: t('events.today'), type: 'primary' as const };
    }
    return { label: t('events.upcomingStatus'), type: 'in' as const };
  };

  const getDateParts = (dateStr?: string) => {
    if (!dateStr) return { day: '—', month: '' };
    const d = new Date(dateStr);
    const day = d.getDate().toString().padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return { day, month: months[d.getMonth()] ?? '' };
  };

  /* =========================================================================
   * MY EVENTS - Detailed Card with full info
   * ========================================================================= */
  const renderMyEvent = ({ item }: { item: MoiEvent }) => {
    const isExpanded = expandedEventId === item.id;
    const status = getEventStatus(item);
    const tasks = completedTasks[item.id] ?? [];
    const completedTaskCount = tasks.length;

    return (
      <View style={[styles.card, item.isActive && styles.cardActive]}>
        {/* Header */}
        <TouchableOpacity
          style={styles.cardHeader}
          onPress={() => handleToggleExpand(item.id)}
          activeOpacity={0.8}
        >
          <View style={styles.cardHeaderLeft}>
            <View style={styles.nameRow}>
              <Text style={styles.eventName} numberOfLines={1}>
                {item.name}
              </Text>
              {item.isActive && (
                <Badge label={t('events.active')} type="primary" style={{ marginLeft: 8 }} />
              )}
            </View>
            <Text style={styles.eventType}>
              {t(`events.types.${item.type}`, { defaultValue: item.type })}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Badge label={status.label} type={status.type} />
            <Text style={styles.expandIcon}>{isExpanded ? '⌃' : '⌄'}</Text>
          </View>
        </TouchableOpacity>

        {/* Event details summary (always visible) */}
        <View style={styles.details}>
          {item.date && (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>{t('events.date')}</Text>
              <Text style={styles.detailValue}>{formatDate(item.date)}</Text>
            </View>
          )}
          {item.venue && (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>{t('events.venue')}</Text>
              <Text style={styles.detailValue}>{item.venue}</Text>
            </View>
          )}
          {item.villageName && (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>{t('events.village')}</Text>
              <Text style={styles.detailValue}>{item.villageName}</Text>
            </View>
          )}
        </View>

        {/* Expanded content */}
        {isExpanded && (
          <View style={styles.expandedContent}>
            {/* Invitation section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('events.invitation')}</Text>
              <View style={styles.inlineActions}>
                <TouchableOpacity style={styles.smallAction} onPress={() => handleUploadInvitation(item)}>
                  <Text style={styles.smallActionText}>📤 {t('events.upload')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.smallAction} onPress={() => handleViewInvitation(item)}>
                  <Text style={styles.smallActionText}>👁️ {t('events.view')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.smallAction} onPress={() => handleShareInviteWhatsApp(item)}>
                  <Text style={styles.smallActionText}>📲 {t('events.share')}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Financial summary */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('events.financeSummary')}</Text>
              <View style={styles.financeGrid}>
                <View style={styles.financeItem}>
                  <Text style={styles.financeLabel}>{t('events.cashReceived')}</Text>
                  <Text style={[styles.financeValue, { color: colors.inColor }]}>₹0</Text>
                </View>
                <View style={styles.financeItem}>
                  <Text style={styles.financeLabel}>{t('events.cashGiven')}</Text>
                  <Text style={[styles.financeValue, { color: colors.outColor }]}>₹0</Text>
                </View>
                <View style={styles.financeItem}>
                  <Text style={styles.financeLabel}>{t('events.goldReceived')}</Text>
                  <Text style={[styles.financeValue, { color: colors.gold }]}>0 g</Text>
                </View>
                <View style={styles.financeItem}>
                  <Text style={styles.financeLabel}>{t('events.goldGiven')}</Text>
                  <Text style={[styles.financeValue, { color: colors.outColor }]}>0 g</Text>
                </View>
              </View>
            </View>

            {/* Cost estimation */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>{t('events.costEstimation')}</Text>
              </View>
              <View style={styles.costSummary}>
                <Text style={styles.costLabel}>{t('events.estimatedCost')}</Text>
                <Text style={styles.costValue}>{formatCash(0)}</Text>
              </View>
            </View>

            {/* Tasks */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>{t('events.eventTasks')}</Text>
                <Text style={styles.taskProgress}>
                  {completedTaskCount}/{EVENT_TASK_KEYS.length}
                </Text>
              </View>
              {EVENT_TASK_KEYS.map(taskKey => {
                const completed = tasks.includes(taskKey);
                return (
                  <TouchableOpacity
                    key={taskKey}
                    style={styles.taskRow}
                    onPress={() => handleTaskToggle(item.id, taskKey)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.checkbox, completed && styles.checkboxCompleted]}>
                      {completed && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text style={[styles.taskText, completed && styles.taskTextCompleted]}>
                      {t(taskKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Actions */}
            <View style={styles.expandedActions}>
              <TouchableOpacity
                style={styles.primaryAction}
                onPress={() => { setEditingEvent(item); setEventModalVisible(true); }}
              >
                <Text style={styles.primaryActionText}>{t('events.editEvent')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryAction}
                onPress={() => handleAddEntry(item)}
              >
                <Text style={styles.secondaryActionText}>{t('events.addEntry')}</Text>
              </TouchableOpacity>
              {!item.isActive && (
                <TouchableOpacity
                  style={styles.secondaryAction}
                  onPress={() => handleSetActive(item)}
                >
                  <Text style={styles.secondaryActionText}>{t('events.setActive')}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Delete */}
            <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteEvent(item)}>
              <Text style={styles.deleteButtonText}>{t('events.deleteEvent')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Collapsed quick actions */}
        {!isExpanded && (
          <View style={styles.cardActions}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleAddEntry(item)}>
              <Text style={styles.actionBtnText}>{t('events.addEntry')}</Text>
            </TouchableOpacity>
            {!item.isActive && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnSecondary]}
                onPress={() => handleSetActive(item)}
              >
                <Text style={styles.actionBtnTextSecondary}>{t('events.setActive')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  /* =========================================================================
   * OTHER EVENTS - Dashboard-style card (date box + info)
   * ========================================================================= */
  const renderOtherEvent = ({ item }: { item: MoiEvent }) => {
    const { day, month } = getDateParts(item.date);
    const status = getEventStatus(item);
    const isPast = item.date ? new Date(item.date) < today : false;

    return (
      <TouchableOpacity
        style={styles.otherEventCard}
        activeOpacity={0.8}
        onPress={() => handleToggleExpand(item.id)}
      >
        {/* Date box */}
        <View style={styles.eventDateBox}>
          <Text style={styles.eventDateNumber}>{day}</Text>
          <Text style={styles.eventDateMonth}>{month}</Text>
        </View>

        {/* Event info */}
        <View style={styles.otherEventInfo}>
          <Text style={styles.otherEventName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.otherEventType}>
            {t(`events.types.${item.type}`, { defaultValue: item.type })}
          </Text>
          {item.villageName && (
            <Text style={styles.otherEventVillage}>📍 {item.villageName}</Text>
          )}
          {item.venue && (
            <Text style={styles.otherEventVenue}>{item.venue}</Text>
          )}
        </View>

        {/* Status badge */}
        <View style={styles.otherEventRight}>
          <Badge label={status.label} type={status.type} />
        </View>

        {/* Expanded section */}
        {expandedEventId === item.id && (
          <View style={styles.otherEventExpanded}>
            {isPast ? (
              /* Past events: only View Invitation, Add/Edit Entry, Delete */
              <View style={styles.otherExpandActions}>
                <TouchableOpacity
                  style={styles.otherActionBtn}
                  onPress={() => handleViewInvitation(item)}
                >
                  <Text style={styles.otherActionText}>👁️ {t('events.view')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.otherActionBtn}
                  onPress={() => handleAddEntry(item)}
                >
                  <Text style={styles.otherActionText}>📝 {t('events.addEntry')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.otherActionBtn, { borderColor: colors.outColor }]}
                  onPress={() => handleDeleteEvent(item)}
                >
                  <Text style={[styles.otherActionText, { color: colors.outColor }]}>
                    🗑️ {t('common.delete')}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* Upcoming events: full actions */
              <>
                <View style={styles.otherExpandActions}>
                  <TouchableOpacity
                    style={styles.otherActionBtn}
                    onPress={() => handleUploadInvitation(item)}
                  >
                    <Text style={styles.otherActionText}>📤 {t('events.upload')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.otherActionBtn}
                    onPress={() => handleViewInvitation(item)}
                  >
                    <Text style={styles.otherActionText}>👁️ {t('events.view')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.otherActionBtn}
                    onPress={() => handleShareInviteWhatsApp(item)}
                  >
                    <Text style={styles.otherActionText}>📲 {t('events.share')}</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.otherExpandActions}>
                  <TouchableOpacity
                    style={styles.otherActionBtn}
                    onPress={() => handleAddEntry(item)}
                  >
                    <Text style={styles.otherActionText}>📝 {t('events.addEntry')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.otherActionBtn}
                    onPress={() => handleScanInvitation(item)}
                  >
                    <Text style={styles.otherActionText}>📷 {t('events.scan')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.otherActionBtn, { borderColor: colors.outColor }]}
                    onPress={() => handleDeleteEvent(item)}
                  >
                    <Text style={[styles.otherActionText, { color: colors.outColor }]}>
                      🗑️ {t('common.delete')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.pageTitle}>{t('events.title')}</Text>
          <Text style={styles.pageSubtitle}>{t('events.subtitle')}</Text>
        </View>
      </View>

      {/* Tabs: My Events / Other Events */}
      <View style={styles.tabArea}>
        <SegmentedControl
          segments={TAB_SEGMENTS}
          selected={tab}
          onSelect={handleTabChange}
        />
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('events.searchPlaceholder')}
          placeholderTextColor={colors.textDisabled}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={styles.clearSearch}>×</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Upcoming / Past filter - shown only for Other Events */}
      {tab === 'OTHER_PERSON' && (
        <View style={styles.filterRow}>
          {EVENT_FILTERS_LIST.map(filter => {
            const active = eventFilter === filter.key;
            return (
              <TouchableOpacity
                key={filter.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => handleEventFilterChange(filter.key as EventFilter)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Event list */}
      <FlatList
        data={filteredEvents}
        keyExtractor={item => item.id}
        renderItem={tab === 'MY_EVENT' ? renderMyEvent : renderOtherEvent}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={7}
        initialNumToRender={8}
        contentContainerStyle={
          filteredEvents.length === 0 ? styles.emptyContainer : styles.list
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadEvents(true)}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          filteredEvents.length > 0 ? (
            <View style={styles.listHeader}>
              <Text style={styles.listTitle}>
                {tab === 'MY_EVENT'
                  ? t('events.myEvents')
                  : eventFilter === 'UPCOMING'
                    ? t('events.upcomingEvents')
                    : t('events.pastEvents')}
              </Text>
              <Text style={styles.listCount}>
                {t('events.eventsCount', { count: filteredEvents.length })}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            title={t('events.noEvents')}
            subtitle={
              tab === 'MY_EVENT'
                ? t('events.noEventsHint')
                : eventFilter === 'UPCOMING'
                  ? t('events.noUpcomingOtherEvents')
                  : t('events.noPastOtherEvents')
            }
            actionLabel={t('events.createEvent')}
            onAction={handleCreateEvent}
            icon="📅"
          />
        }
      />

      {/* Quick tools */}
      <View style={styles.quickTools}>
        {tab === 'OTHER_PERSON' && eventFilter === 'UPCOMING' && (
          <TouchableOpacity style={styles.quickTool} onPress={() => handleScanInvitation()}>
            <Text style={styles.quickToolIcon}>📷</Text>
            <Text style={styles.quickToolText}>{t('events.scan')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Voice FAB - above add button */}
      {!(tab === 'OTHER_PERSON' && eventFilter === 'PAST') && (
        <TouchableOpacity
          style={[styles.fabVoice, { backgroundColor: colors.surface, borderColor: colors.primary }]}
          onPress={handleVoiceEvent}
          activeOpacity={0.85}
        >
          <Feather name="mic" size={20} color={colors.primary} />
        </TouchableOpacity>
      )}

      {/* FAB - hidden for past events in Other tab */}
      {!(tab === 'OTHER_PERSON' && eventFilter === 'PAST') && (
        <TouchableOpacity
          style={styles.fab}
          onPress={handleCreateEvent}
          activeOpacity={0.85}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

      {/* Quick add entry modal */}
      <AddEditEntryModal
        visible={entryModalVisible}
        prefillEventId={entryEventId}
        onClose={() => {
          setEntryModalVisible(false);
          setEntryEventId(null);
        }}
        onSaved={() => {
          setEntryModalVisible(false);
          setEntryEventId(null);
        }}
      />

      {/* Voice event modal */}
      <VoiceEventModal
        visible={voiceEventModalVisible}
        onClose={() => setVoiceEventModalVisible(false)}
        onParsed={handleVoiceEventParsed}
      />

      {/* Invitation Viewer Modal */}
      {viewingInvitation && (
        <View style={styles.invitationOverlay}>
          <View style={styles.invitationViewer}>
            <View style={styles.invitationHeader}>
              <Text style={styles.invitationTitle}>{t('events.invitation')}</Text>
              <TouchableOpacity onPress={() => setViewingInvitation(null)}>
                <Text style={styles.invitationClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <Image
              source={{ uri: `file://${viewingInvitation}` }}
              style={styles.invitationImage}
              resizeMode="contain"
            />
          </View>
        </View>
      )}

      {/* Add/Edit Event Modal */}
      <AddEditEventModal
        visible={eventModalVisible}
        event={editingEvent}
        defaultOwnerType={tab === 'OTHER_PERSON' ? 'OTHER_PERSON' : 'MY_EVENT'}
        prefill={eventPrefill}
        onClose={() => {
          setEventModalVisible(false);
          setEditingEvent(null);
          setEventPrefill(null);
        }}
        onSaved={() => loadEvents(true)}
      />
    </View>
  );
};

export default EventsScreen;

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: 20,
    paddingBottom: 4,
  },

  pageTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.textPrimary,
  },

  pageSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 3,
  },

  headerAddButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 9,
  },

  headerAddText: {
    color: colors.textInverse,
    fontSize: 12,
    fontWeight: '700',
  },

  tabArea: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 10,
    paddingBottom: 8,
  },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 11,
    height: 43,
  },

  searchIcon: {
    fontSize: 13,
    marginRight: 7,
  },

  searchInput: {
    flex: 1,
    fontSize: 12,
    color: colors.textPrimary,
    paddingVertical: 0,
  },

  clearSearch: {
    fontSize: 19,
    color: colors.textMuted,
    paddingHorizontal: 4,
  },

  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingTop: 9,
    gap: 8,
  },

  filterChip: {
    backgroundColor: colors.surface,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },

  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },

  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },

  filterChipTextActive: {
    color: colors.textInverse,
  },

  list: {
    padding: Spacing.lg,
    paddingTop: 10,
    paddingBottom: 150,
  },

  emptyContainer: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
  },

  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },

  listTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
  },

  listCount: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },

  // ─── MY EVENT CARD ──────────────────────────────────────────────
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    marginBottom: 12,
    overflow: 'hidden',
    elevation: 1,
  },

  cardActive: {
    borderWidth: 1.5,
    borderColor: colors.primary,
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 15,
  },

  cardHeaderLeft: {
    flex: 1,
    paddingRight: 8,
  },

  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  eventName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  eventType: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 4,
  },

  headerRight: {
    alignItems: 'flex-end',
    gap: 7,
  },

  expandIcon: {
    fontSize: 16,
    color: colors.textMuted,
    lineHeight: 18,
  },

  details: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 15,
    paddingBottom: 11,
    gap: 14,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: 10,
  },

  detailItem: {
    minWidth: 70,
  },

  detailLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },

  detailValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 3,
  },

  cardActions: {
    flexDirection: 'row',
    gap: 8,
    padding: 11,
    paddingTop: 0,
  },

  actionBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },

  actionBtnSecondary: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },

  actionBtnText: {
    color: colors.textInverse,
    fontSize: 12,
    fontWeight: '600',
  },

  actionBtnTextSecondary: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },

  expandedContent: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    padding: 14,
  },

  section: {
    marginBottom: 17,
  },

  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 9,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  inlineActions: {
    flexDirection: 'row',
    gap: 7,
  },

  smallAction: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 10,
  },

  smallActionText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '700',
  },

  financeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 7,
  },

  financeItem: {
    width: '50%',
    padding: 7,
  },

  financeLabel: {
    fontSize: 9,
    color: colors.textMuted,
    fontWeight: '600',
  },

  financeValue: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 3,
  },

  costSummary: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  costLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },

  costValue: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
  },

  taskProgress: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: '800',
  },

  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },

  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },

  checkboxCompleted: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },

  checkmark: {
    color: colors.textInverse,
    fontSize: 12,
    fontWeight: '800',
  },

  taskText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
  },

  taskTextCompleted: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },

  expandedActions: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 2,
  },

  primaryAction: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },

  primaryActionText: {
    color: colors.textInverse,
    fontSize: 11,
    fontWeight: '700',
  },

  secondaryAction: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },

  secondaryActionText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },

  deleteButton: {
    alignItems: 'center',
    paddingTop: 13,
  },

  deleteButtonText: {
    color: colors.outColor,
    fontSize: 11,
    fontWeight: '700',
  },

  // ─── OTHER EVENT CARD (Dashboard-style) ─────────────────────────
  otherEventCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: 10,
    padding: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },

  eventDateBox: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  eventDateNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary,
  },

  eventDateMonth: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.primaryLight,
    marginTop: 1,
  },

  otherEventInfo: {
    flex: 1,
  },

  otherEventName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  otherEventType: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 2,
  },

  otherEventVillage: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 3,
  },

  otherEventVenue: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 1,
  },

  otherEventRight: {
    marginLeft: 8,
  },

  otherEventExpanded: {
    width: '100%',
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: 10,
    gap: 8,
  },

  otherExpandActions: {
    flexDirection: 'row',
    gap: 6,
  },

  otherActionBtn: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 8,
  },

  otherActionText: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '700',
  },

  // ─── QUICK TOOLS ────────────────────────────────────────────────
  quickTools: {
    position: 'absolute',
    bottom: 26,
    left: 20,
    flexDirection: 'row',
    gap: 8,
  },

  quickTool: {
    minWidth: 54,
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },

  quickToolIcon: {
    fontSize: 15,
  },

  quickToolText: {
    fontSize: 8,
    color: colors.textSecondary,
    fontWeight: '700',
    marginTop: 2,
  },

  fabVoice: {
    position: 'absolute',
    bottom: 88,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    borderWidth: 1.5,
    borderColor: colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },

  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },

  fabText: {
    color: colors.textInverse,
    fontSize: 26,
    fontWeight: '300',
    lineHeight: 32,
  },

  // ─── INVITATION VIEWER ──────────────────────────────────────────
  invitationOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    zIndex: 999,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  invitationViewer: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
  },

  invitationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },

  invitationTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  invitationClose: {
    fontSize: 17,
    color: colors.textMuted,
    padding: 4,
  },

  invitationImage: {
    width: '100%',
    height: 500,
  },
});
