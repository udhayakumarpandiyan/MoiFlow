import React, {
  Suspense,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Pressable,
  Alert,
} from 'react-native';

// SafeAreaView removed - tab header handles safe area
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@common/context/ThemeContext';
import Feather from '@react-native-vector-icons/feather';
import { entryService, eventService } from '@common/services';
import { Entry } from '@moi/models/Entry';
import { usePremiumGate } from '@common/hooks/usePremiumGate';
import { PremiumFeature } from '@common/subscription/subscriptionConfig';
import { PremiumLockIcon } from '@common/components/PremiumLockIcon';

/**
 * Loads the user's OWN events (used for the IN-tab event dropdown and for
 * mapping IN entries). Returns [] on any failure so the UI degrades safely.
 */
const entryServiceEventsLoader = async () => {
  try {
    return await eventService.getMyEvents();
  } catch {
    return [];
  }
};

import { Colors } from '@common/theme/colors';
import { Spacing } from '@common/theme/typography';

import {
  formatCash,
  formatGold,
  formatDate,
} from '@common/utils/format';

import { SearchBar } from '@common/components/SearchBar';
import { Badge } from '@common/components/Badge';
import { EmptyState } from '@common/components/EmptyState';

import AddEditEntryModal from './AddEditEntryModal';
import EntryDetailModal from './EntryDetailModal';
import OCRReviewModal from './OCRReviewModal';
import type { VoicePrefill } from './VoiceEntryModal';
import type { HandwrittenEntry } from '@common/services/OCRService';
import { pickImage } from '@common/utils/imagePicker';

// Lazy-load VoiceEntryModal to keep voice native module off the startup path
const LazyVoiceEntryModal = React.lazy(() => import('@moi/screens/entries/VoiceEntryModal'));

// TamilSpeechRecognizer is loaded on-demand to avoid pulling the native voice
// module into the startup path. The class is only needed when the user taps
// the voice-search button inside the Entries screen.
type TamilSpeechRecognizerType = import('@common/voice/TamilSpeechRecognizer').TamilSpeechRecognizer;
const getTamilSpeechRecognizer = () => {
  const { TamilSpeechRecognizer } = require('@common/voice/TamilSpeechRecognizer');
  return TamilSpeechRecognizer as typeof import('@common/voice/TamilSpeechRecognizer').TamilSpeechRecognizer;
};

/* ============================================================================
 * Types
 * ========================================================================== */

type OwnEvent = {
  id: string;
  name: string;
  eventDate?: string | null;
};

type EntryDirection = 'ALL' | 'IN' | 'OUT';

type OutDuration = 'ALL' | 'MONTH' | 'YEAR';

type PersonBalance = {
  personId?: string | null;
  personName: string;
  villageName?: string | null;

  entryCount: number;

  totalCashIn: number;
  totalCashOut: number;

  totalGoldIn: number;
  totalGoldOut: number;

  /**
   * Important:
   *
   * Positive netCash  => user has given more => payable
   * Negative netCash  => user has received more => receivable
   *
   * Example:
   * IN 1000
   * OUT 1500 + 2000
   *
   * netCash = 3500 - 1000 = 2500
   * => user should receive 2500
   */
  netCash: number;

  /**
   * Same logic for gold.
   */
  netGold: number;
};

/* ============================================================================
 * Constants
 * ========================================================================== */

const DIRECTION_TABS: {
  key: EntryDirection;
  labelKey: string;
  subLabelKey: string;
}[] = [
    {
      key: 'ALL',
      labelKey: 'entries.all',
      subLabelKey: 'entries.personAccount',
    },
    {
      key: 'IN',
      labelKey: 'common.in',
      subLabelKey: 'entries.inSubLabel',
    },
    {
      key: 'OUT',
      labelKey: 'common.out',
      subLabelKey: 'entries.outSubLabel',
    },
  ];

/* ============================================================================
 * Screen
 * ========================================================================== */

const EntriesScreen = () => {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const route = useRoute<any>();
  const { isPremium, ensurePremium } = usePremiumGate();

  /* --------------------------------------------------------------------------
   * Entries
   * ------------------------------------------------------------------------ */

  const [allEntries, setAllEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  /* --------------------------------------------------------------------------
   * Direction
   * ------------------------------------------------------------------------ */

  const [direction, setDirection] =
    useState<EntryDirection>(route.params?.initialDirection ?? 'IN');

  /* --------------------------------------------------------------------------
   * IN event selector
   * ------------------------------------------------------------------------ */

  const [selectedEventId, setSelectedEventId] =
    useState<string>('ALL');

  const [ownEvents, setOwnEvents] =
    useState<OwnEvent[]>([]);

  const [eventDropdownVisible, setEventDropdownVisible] =
    useState(false);

  /* --------------------------------------------------------------------------
   * OUT duration
   * ------------------------------------------------------------------------ */

  const [outDuration, setOutDuration] =
    useState<OutDuration>('MONTH');

  /* --------------------------------------------------------------------------
   * Search
   * ------------------------------------------------------------------------ */

  const [searchQuery, setSearchQuery] =
    useState('');

  const [voiceSearchActive, setVoiceSearchActive] =
    useState(false);

  /* --------------------------------------------------------------------------
   * Add / Edit
   * ------------------------------------------------------------------------ */

  const [modalVisible, setModalVisible] =
    useState(false);

  const [selectedEntry, setSelectedEntry] =
    useState<Entry | null>(null);

  /* --------------------------------------------------------------------------
   * Detail view
   * ------------------------------------------------------------------------ */

  const [detailEntry, setDetailEntry] =
    useState<Entry | null>(null);

  const [detailVisible, setDetailVisible] =
    useState(false);

  /* --------------------------------------------------------------------------
   * Voice entry
   * ------------------------------------------------------------------------ */

  const [voiceModalVisible, setVoiceModalVisible] =
    useState(false);

  const [voicePrefill, setVoicePrefill] =
    useState<VoicePrefill | null>(null);

  /* --------------------------------------------------------------------------
   * OCR notebook scan (handwritten IN entries)
   * ------------------------------------------------------------------------ */

  const [ocrReviewVisible, setOcrReviewVisible] =
    useState(false);

  const [ocrScanning, setOcrScanning] =
    useState(false);

  const [ocrEntries, setOcrEntries] =
    useState<HandwrittenEntry[]>([]);

  // Whether the last scan reached the OCR backend (false = server/OCR down).
  const [ocrBackendReachable, setOcrBackendReachable] =
    useState(true);

  /* --------------------------------------------------------------------------
   * Tamil speech recognizer
   * ------------------------------------------------------------------------ */

  const searchRecognizerRef =
    useRef<TamilSpeechRecognizerType | null>(null);

  const getSearchRecognizer = () => {
    if (!searchRecognizerRef.current) {
      const SpeechRecognizer = getTamilSpeechRecognizer();
      searchRecognizerRef.current =
        new SpeechRecognizer();
    }

    return searchRecognizerRef.current;
  };

  /* ==========================================================================
   * Load entries
   * ======================================================================== */

  const loadEntries = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        /**
         * IMPORTANT:
         *
         * Do not pass eventId.
         *
         * We need:
         *  - IN entries from all own events
         *  - OUT entries without eventId
         *
         * Filtering happens locally.
         */
        const data =
          await entryService.getEntries();

        setAllEntries(
          Array.isArray(data) ? data : [],
        );
      } catch (error) {
        setAllEntries([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  /* ==========================================================================
   * Load own events
   * ======================================================================== */

  const loadOwnEvents = useCallback(
    async () => {
      try {
        // IN entries are always mapped to the user's OWN events.
        const events = await entryServiceEventsLoader();

        const mappedEvents: OwnEvent[] =
          (events || []).map((event: any) => ({
            id: String(event.id),

            name:
              event.name ??
              event.eventName ??
              t('entries.unnamedEvent'),

            eventDate:
              event.date ??
              event.eventDate ??
              event.event_date ??
              null,
          }));

        setOwnEvents(mappedEvents);
      } catch (error) {
        setOwnEvents([]);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /* ==========================================================================
   * Screen focus
   * ======================================================================== */

  useFocusEffect(
    useCallback(() => {
      loadEntries();
      loadOwnEvents();

      // Pre-fill search from navigation params (e.g. from Dashboard "View Person Entries")
      const paramSearch = route.params?.searchQuery;
      if (paramSearch && typeof paramSearch === 'string') {
        setSearchQuery(paramSearch);
      }

      // Apply initial direction tab from navigation params on every focus so
      // navigating from Dashboard always lands on the right tab even when the
      // screen is already mounted in the tab navigator.
      const paramDirection = route.params?.initialDirection;
      if (paramDirection) {
        setDirection(paramDirection as EntryDirection);
      }
    }, [
      loadEntries,
      loadOwnEvents,
      route.params?.searchQuery,
      route.params?.initialDirection,
    ]),
  );

  /* ==========================================================================
   * Date helpers
   * ======================================================================== */

  const getStartOfOutEntries = () => {
    return null;
  };

  const getStartOfMonth = () => {
    const date = new Date();

    date.setDate(1);

    date.setHours(0, 0, 0, 0);

    return date;
  };

  const getStartOfYear = () => {
    const date = new Date();

    date.setMonth(0);
    date.setDate(1);

    date.setHours(0, 0, 0, 0);

    return date;
  };

  
  const isWithinDuration = (
    entry: Entry,
    duration: OutDuration,
  ) => {
    const createdAt =
      new Date(entry.createdAt);

    if (
      Number.isNaN(createdAt.getTime())
    ) {
      return false;
    }

    const now = new Date();

    let startDate: Date | null;

    switch (duration) {
      case 'ALL':
        startDate =
          getStartOfOutEntries();
        break;

      case 'YEAR':
        startDate =
          getStartOfYear();
        break;

      case 'MONTH':
      default:
        startDate =
          getStartOfMonth();
        break;
    }

    return startDate !== null ? (
      createdAt >= startDate &&
      createdAt <= now
    ) : true;
  };

  /* ==========================================================================
   * Search helper
   * ======================================================================== */

  const matchesSearch = (
    entry: Entry,
    query: string,
  ) => {
    if (!query.trim()) {
      return true;
    }

    const personName =
      String(
        entry.personName || '',
      ).toLowerCase();

    const villageName =
      String(
        entry.villageName || '',
      ).toLowerCase();

    // Split query into words so "ராமு சேலம்" matches person=ராமு, village=சேலம்
    const words = query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    // Every word must match either personName or villageName
    return words.every(
      w =>
        personName.includes(w) ||
        villageName.includes(w),
    );
  };

  /* ==========================================================================
   * Filtered normal entries
   *
   * Used only for IN / OUT.
   * ======================================================================== */

  const displayEntries = useMemo(() => {
    if (direction === 'ALL') {
      return [];
    }

    let result =
      [...allEntries];

    /* ------------------------------------------------------------------------
     * IN
     * ---------------------------------------------------------------------- */

    if (direction === 'IN') {
      result =
        result.filter(
          entry =>
            entry.entryType ===
            'OWN_EVENT',
        );

      if (
        selectedEventId !== 'ALL'
      ) {
        result =
          result.filter(
            entry =>
              String(
                entry.eventId || '',
              ) ===
              String(
                selectedEventId,
              ),
          );
      }
    }

    /* ------------------------------------------------------------------------
     * OUT
     * ---------------------------------------------------------------------- */

    if (direction === 'OUT') {
      result =
        result.filter(
          entry =>
            entry.entryType ===
            'OTHER_EVENT',
        );

      result =
        result.filter(entry =>
          isWithinDuration(
            entry,
            outDuration,
          ),
        );
    }

    /* ------------------------------------------------------------------------
     * Search
     * ---------------------------------------------------------------------- */

    result =
      result.filter(entry =>
        matchesSearch(
          entry,
          searchQuery,
        ),
      );

    /* ------------------------------------------------------------------------
     * Latest first
     * ---------------------------------------------------------------------- */

    result.sort((a, b) => {
      const first =
        new Date(
          a.createdAt,
        ).getTime();

      const second =
        new Date(
          b.createdAt,
        ).getTime();

      return second - first;
    });

    return result;
  }, [
    allEntries,
    direction,
    selectedEventId,
    outDuration,
    searchQuery,
  ]);

  /* ==========================================================================
   * Person balances
   *
   * Used only when ALL is selected.
   * ======================================================================== */

  const personBalances =
    useMemo<PersonBalance[]>(() => {
      if (direction !== 'ALL') {
        return [];
      }

      const query =
        searchQuery
          .trim()
          .toLowerCase();

      /**
       * First filter by search.
       */
      let entries =
        [...allEntries];

      if (query) {
        entries =
          entries.filter(entry =>
            matchesSearch(
              entry,
              searchQuery,
            ),
          );
      }

      /**
       * Group by personId when available.
       *
       * Fallback:
       * person name + village.
       */
      const grouped =
        new Map<
          string,
          PersonBalance
        >();

      entries.forEach(entry => {
        const personKey =
          String(
            entry.personId ||
            `${entry.personName}|${entry.villageName || ''}`,
          );

        const existing =
          grouped.get(personKey);

        if (existing) {
          existing.entryCount += 1;

          if (
            entry.entryType ===
            'OWN_EVENT'
          ) {
            existing.totalCashIn +=
              Number(
                entry.cashAmount || 0,
              );

            existing.totalGoldIn +=
              Number(
                entry.goldWeight || 0,
              );
          } else {
            existing.totalCashOut +=
              Number(
                entry.cashAmount || 0,
              );

            existing.totalGoldOut +=
              Number(
                entry.goldWeight || 0,
              );
          }

          existing.netCash =
            existing.totalCashOut -
            existing.totalCashIn;

          existing.netGold =
            existing.totalGoldOut -
            existing.totalGoldIn;

          return;
        }

        const totalCashIn =
          entry.entryType ===
            'OWN_EVENT'
            ? Number(
              entry.cashAmount || 0,
            )
            : 0;

        const totalCashOut =
          entry.entryType ===
            'OTHER_EVENT'
            ? Number(
              entry.cashAmount || 0,
            )
            : 0;

        const totalGoldIn =
          entry.entryType ===
            'OWN_EVENT'
            ? Number(
              entry.goldWeight || 0,
            )
            : 0;

        const totalGoldOut =
          entry.entryType ===
            'OTHER_EVENT'
            ? Number(
              entry.goldWeight || 0,
            )
            : 0;

        grouped.set(personKey, {
          personId:
            entry.personId || null,

          personName:
            entry.personName || '',

          villageName:
            entry.villageName || null,

          entryCount: 1,

          totalCashIn,
          totalCashOut,

          totalGoldIn,
          totalGoldOut,

          netCash:
            totalCashOut -
            totalCashIn,

          netGold:
            totalGoldOut -
            totalGoldIn,
        });
      });

      return Array.from(
        grouped.values(),
      ).sort((a, b) =>
        a.personName.localeCompare(
          b.personName,
        ),
      );
    }, [
      allEntries,
      direction,
      searchQuery,
    ]);

  /* ==========================================================================
   * Selected event
   * ======================================================================== */

  const selectedEvent =
    useMemo(() => {
      if (
        selectedEventId === 'ALL'
      ) {
        return null;
      }

      return ownEvents.find(
        event =>
          String(event.id) ===
          String(
            selectedEventId,
          ),
      );
    }, [
      ownEvents,
      selectedEventId,
    ]);

  /* ==========================================================================
   * Actions
   * ======================================================================== */

  const handleDirectionChange = (
    nextDirection: EntryDirection,
  ) => {
    setDirection(
      nextDirection,
    );

    /**
     * Keep the selected event
     * when moving between IN
     * and ALL.
     */
  };

  const selectEvent = (
    eventId: string,
  ) => {
    setSelectedEventId(
      eventId,
    );

    setEventDropdownVisible(
      false,
    );
  };

  const handleAdd = () => {
    setSelectedEntry(null);
    setVoicePrefill(null);
    setModalVisible(true);
  };

  const handleEdit = (
    entry: Entry,
  ) => {
    setSelectedEntry(entry);
    setVoicePrefill(null);
    setModalVisible(true);
  };

  /* --------------------------------------------------------------------------
   * Detail view — tap an entry to view, then edit or delete
   * ------------------------------------------------------------------------ */

  const handleOpenDetail = (entry: Entry) => {
    setDetailEntry(entry);
    setDetailVisible(true);
  };

  const handleDetailEdit = (entry: Entry) => {
    setDetailVisible(false);
    setDetailEntry(null);
    setSelectedEntry(entry);
    setVoicePrefill(null);
    setModalVisible(true);
  };

  const handleDetailDelete = (entry: Entry) => {
    Alert.alert(
      t('entries.deleteEntry'),
      t('entries.deleteConfirm'),
      [
        { text: t('entries.confirmNo'), style: 'cancel' },
        {
          text: t('entries.confirmYes'),
          style: 'destructive',
          onPress: async () => {
            try {
              await entryService.deleteEntry(entry.id);
              setDetailVisible(false);
              setDetailEntry(null);
              await loadEntries(true);
            } catch (err) {
              Alert.alert(t('common.error'), t('entries.deleteFailed'));
            }
          },
        },
      ],
    );
  };

  const handleSaved = async () => {
    setModalVisible(false);
    setSelectedEntry(null);
    setVoicePrefill(null);

    await loadEntries(true);
  };

  /* ==========================================================================
   * Voice search
   * ======================================================================== */

  const handleVoiceSearch =
    async () => {
      // Premium gate: voice search is a Premium feature. Show a friendly
      // upsell instead of starting recognition for Free users.
      if (
        !ensurePremium(PremiumFeature.VoiceSearch, () => {
          void startVoiceSearch();
        })
      ) {
        return;
      }
    };

  const startVoiceSearch =
    async () => {
      // Check native module availability first
      if (!getTamilSpeechRecognizer().isAvailable()) {
        Alert.alert(
          t('common.error'),
          t('entries.voiceStartFailed'),
        );
        return;
      }

      const recognizer =
        getSearchRecognizer();

      if (voiceSearchActive) {
        try {
          await recognizer.stop();
        } catch (_) { }

        setVoiceSearchActive(
          false,
        );

        return;
      }

      try {
        setVoiceSearchActive(
          true,
        );

        recognizer.onResult(
          text => {
            setSearchQuery(text);
            setVoiceSearchActive(
              false,
            );
          },
        );

        recognizer.onError(
          (error: string) => {
            // Error 7 = "no match" (speech not recognized)
            // Show user-friendly feedback instead of raw error
            const isNoMatch = typeof error === 'string' && error.includes('7/');
            if (isNoMatch) {
              // Silently stop — the user can try again
              setVoiceSearchActive(false);
            } else {
              setVoiceSearchActive(false);
            }
          },
        );

        // Use the app's current language for recognition (Tamil or English).
        const locale = i18n.language === 'ta' ? 'ta-IN' : 'en-IN';
        await recognizer.start(locale);
      } catch (error: any) {
        if (error?.message === 'MICROPHONE_PERMISSION_DENIED') {
          Alert.alert(
            t('common.error'),
            t('errors.permissionDenied'),
          );
        }

        setVoiceSearchActive(
          false,
        );
      }
    };

  /* ==========================================================================
   * Voice entry
   * ======================================================================== */

  const handleVoiceParsed = (
    prefill: VoicePrefill,
  ) => {
    // Attach currently selected event info to the prefill
    const enrichedPrefill: VoicePrefill = {
      ...prefill,
      eventId: selectedEvent?.id ?? null,
      eventName: selectedEvent?.name ?? undefined,
      eventDate: selectedEvent?.eventDate ?? undefined,
    };

    setVoicePrefill(
      enrichedPrefill,
    );

    setSelectedEntry(null);

    setVoiceModalVisible(
      false,
    );

    setModalVisible(true);
  };

  /* ==========================================================================
   * OCR notebook scan — handwritten IN entries
   *
   * IN-only: every scanned entry is mapped to the selected Own Event, which
   * is therefore mandatory before scanning.
   * ======================================================================== */

  const startNotebookScan = () => {
    // OCR notebook scanning is a Premium feature — gate with a friendly upsell.
    if (
      !ensurePremium(PremiumFeature.OcrScanner, () => {
        void proceedNotebookScan();
      })
    ) {
      return;
    }
  };

  const proceedNotebookScan = () => {
    if (selectedEventId === 'ALL' || !selectedEvent) {
      Alert.alert(
        t('ocr.selectEventFirst'),
        t('ocr.selectEventMsg'),
      );
      return;
    }

    Alert.alert(
      t('ocr.chooseSource'),
      t('ocr.chooseSourceMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('ocr.camera'), onPress: () => runNotebookScan('camera') },
        { text: t('ocr.gallery'), onPress: () => runNotebookScan('gallery') },
      ],
    );
  };

  const runNotebookScan = async (source: 'camera' | 'gallery') => {
    try {
      const imagePath = await pickImage(source, `ocr-${selectedEventId}`);
      if (imagePath === 'cancelled') return;
      if (!imagePath) {
        Alert.alert(t('common.error'), t('errors.permissionDenied'));
        return;
      }

      // Show the review modal in a loading state while OCR runs.
      setOcrEntries([]);
      setOcrBackendReachable(true);
      setOcrScanning(true);
      setOcrReviewVisible(true);

      const { ocrService } = require('@common/services');
      const result = await ocrService.processHandwrittenEntries(imagePath);
      setOcrEntries(Array.isArray(result?.entries) ? result.entries : []);
      setOcrBackendReachable(result?.backendReachable !== false);
    } catch (error) {
      Alert.alert(t('common.error'), t('errors.generic'));
      setOcrReviewVisible(false);
    } finally {
      setOcrScanning(false);
    }
  };

  const handleOcrSaved = async (count: number) => {
    setOcrReviewVisible(false);
    setOcrEntries([]);
    await loadEntries(true);
    if (count > 0) {
      Alert.alert(t('common.success'), t('ocr.willSaveCount', { count }));
    }
  };

  /* ==========================================================================
   * Summary for IN / OUT
   * ======================================================================== */

  const totalCash =
    displayEntries.reduce(
      (sum, entry) =>
        sum +
        Number(
          entry.cashAmount || 0,
        ),
      0,
    );

  const totalGold =
    displayEntries.reduce(
      (sum, entry) =>
        sum +
        Number(
          entry.goldWeight || 0,
        ),
      0,
    );

  /* ==========================================================================
   * Person Balance Card
   * ======================================================================== */

  const PersonBalanceCard: React.FC<{
    balance: PersonBalance;
  }> = ({ balance: b }) => {
    const [expanded, setExpanded] =
      useState(false);

    const cashBalance =
      (b.totalCashOut || 0) - (b.totalCashIn || 0);

    const goldBalance =
      (b.totalGoldOut || 0) - (b.totalGoldIn || 0);

    const hasCashReceivable = cashBalance > 0;
    const hasCashPayable = cashBalance < 0;

    const hasGoldReceivable = goldBalance > 0;
    const hasGoldPayable = goldBalance < 0;

    const hasReceivable =
      hasCashReceivable || hasGoldReceivable;

    const hasPayable =
      hasCashPayable || hasGoldPayable;

    const status =
      !hasReceivable && !hasPayable
        ? 'settled'
        : hasReceivable && !hasPayable
          ? 'receivable'
          : hasPayable && !hasReceivable
            ? 'payable'
            : 'mixed';

    const statusLabel =
      status === 'receivable'
        ? t('entries.receivableBadge')
        : status === 'payable'
          ? t('entries.payableBadge')
          : status === 'mixed'
            ? t('entries.mixedBadge')
            : t('entries.settledBadge');

    const statusBadge =
      status === 'receivable'
        ? 'in'
        : status === 'payable'
          ? 'out'
          : status === 'mixed'
            ? 'pending'
            : 'settled';

    const statusColor =
      status === 'receivable'
        ? colors.inColor
        : status === 'payable'
          ? colors.pendingColor
          : colors.textMuted;

    const displayAmount =
      Math.abs(b.netCash);

    return (
      <TouchableOpacity
        style={styles.personCard}
        onPress={() =>
          setExpanded(
            value => !value,
          )
        }
        activeOpacity={0.82}
      >
        {/* Main row */}

        <View
          style={
            styles.personCardMain
          }
        >
          <View
            style={
              styles.personCardInfo
            }
          >
            <View
              style={
                styles.personNameRow
              }
            >
              <Text
                style={
                  styles.personCardName
                }
                numberOfLines={1}
              >
                {b.personName}
              </Text>

              <Badge
                label={
                  statusLabel
                }
                type={
                  statusBadge as
                  | 'in'
                  | 'out'
                  | 'pending'
                  | 'settled'
                }
                style={
                  styles.personBadge
                }
              />
            </View>

            {b.villageName ? (
              <Text
                style={
                  styles.personVillage
                }
              >
                {b.villageName}
              </Text>
            ) : null}

            <Text
              style={
                styles.personEntryCount
              }
            >
              {b.entryCount} {t('entries.entries')}
            </Text>
          </View>

          {/* <View
            style={
              styles.personBalanceRight
            }
          >
            {displayAmount > 0 ? (
              <Text
                style={[
                  styles.personNetAmount,
                  {
                    color:
                      statusColor,
                  },
                ]}
              >
                {formatCash(
                  displayAmount,
                )}
              </Text>
            ) : (
              <Text
                style={
                  styles.settledAmount
                }
              >
                ₹0
              </Text>
            )}

            <Text
              style={[
                styles.personStatusText,
                {
                  color:
                    statusColor,
                },
              ]}
            >
              {status ===
              'receivable'
                ? '← வரவேண்டியது'
                : status ===
                  'payable'
                ? '→ தரவேண்டியது'
                : '✓ தீர்வு'}
            </Text>
          </View> */}
          <View style={styles.personNetValues}>

            {cashBalance !== 0 && (
              <Text
                style={[
                  styles.personNetAmount,
                  {
                    color:
                      cashBalance > 0
                        ? colors.inColor
                        : colors.outColor,
                  },
                ]}
              >
                {cashBalance > 0 ? '+' : '-'}
                {formatCash(Math.abs(cashBalance))}
              </Text>
            )}

            {goldBalance !== 0 && (
              <Text
                style={[
                  styles.personGoldAmount,
                  {
                    color:
                      goldBalance > 0
                        ? colors.inColor
                        : colors.outColor,
                  },
                ]}
              >
                {goldBalance > 0 ? '+' : '-'}
                {formatGold(Math.abs(goldBalance))}
              </Text>
            )}

            {cashBalance === 0 && goldBalance === 0 && (
              <Text style={styles.settledAmount}>
                ₹0 · 0 g
              </Text>
            )}

          </View>

          <Text
            style={
              styles.expandIcon
            }
          >
            {expanded
              ? '⌃'
              : '⌄'}
          </Text>
        </View>

        {/* Expanded details */}

        {expanded ? (
          <View
            style={
              styles.expandedSection
            }
          >
            {/* IN */}

            <View
              style={
                styles.expandedRow
              }
            >
              <View>
                <Text
                  style={
                    styles.expandedLabel
                  }
                >
                  {t('common.in')} ({t('entries.inSubLabel')})
                </Text>

                <Text
                  style={
                    styles.expandedHint
                  }
                >
                  {t('entries.totalIn')}
                </Text>
              </View>

              <View
                style={
                  styles.expandedValueContainer
                }
              >
                {b.totalCashIn >
                  0 ? (
                  <Text
                    style={[
                      styles.expandedValue,
                      {
                        color:
                          colors.inColor,
                      },
                    ]}
                  >
                    {formatCash(
                      b.totalCashIn,
                    )}
                  </Text>
                ) : null}

                {b.totalGoldIn >
                  0 ? (
                  <Text
                    style={
                      styles.expandedGold
                    }
                  >
                    {formatGold(
                      b.totalGoldIn,
                    )}
                  </Text>
                ) : null}

                {b.totalCashIn ===
                  0 &&
                  b.totalGoldIn ===
                  0 ? (
                  <Text
                    style={
                      styles.zeroValue
                    }
                  >
                    —
                  </Text>
                ) : null}
              </View>
            </View>

            <View
              style={
                styles.expandedSep
              }
            />

            {/* OUT */}

            <View
              style={
                styles.expandedRow
              }
            >
              <View>
                <Text
                  style={
                    styles.expandedLabel
                  }
                >
                  {t('common.out')} ({t('entries.outSubLabel')})
                </Text>

                <Text
                  style={
                    styles.expandedHint
                  }
                >
                  {t('entries.totalOut')}
                </Text>
              </View>

              <View
                style={
                  styles.expandedValueContainer
                }
              >
                {b.totalCashOut >
                  0 ? (
                  <Text
                    style={[
                      styles.expandedValue,
                      {
                        color:
                          colors.outColor,
                      },
                    ]}
                  >
                    {formatCash(
                      b.totalCashOut,
                    )}
                  </Text>
                ) : null}

                {b.totalGoldOut >
                  0 ? (
                  <Text
                    style={
                      styles.expandedGold
                    }
                  >
                    {formatGold(
                      b.totalGoldOut,
                    )}
                  </Text>
                ) : null}

                {b.totalCashOut ===
                  0 &&
                  b.totalGoldOut ===
                  0 ? (
                  <Text
                    style={
                      styles.zeroValue
                    }
                  >
                    —
                  </Text>
                ) : null}
              </View>
            </View>

            <View
              style={
                styles.expandedSep
              }
            />

            {/* NET */}

            <View
              style={[
                styles.expandedRow,
                styles.netRow,
              ]}
            >
              <View>
                <Text
                  style={
                    styles.netLabel
                  }
                >
                  {t('entries.netAccount')}
                </Text>

                <Text
                  style={
                    styles.expandedHint
                  }
                >
                  {t('entries.netCalculation')}
                </Text>
              </View>

              <View
                style={
                  styles.expandedValueContainer
                }
              >
                {b.netCash !==
                  0 ? (
                  <Text
                    style={[
                      styles.netValue,
                      {
                        color:
                          statusColor,
                      },
                    ]}
                  >
                    {formatCash(
                      Math.abs(
                        b.netCash,
                      ),
                    )}
                  </Text>
                ) : (
                  <Text
                    style={[
                      styles.netValue,
                      {
                        color:
                          colors.textMuted,
                      },
                    ]}
                  >
                    ₹0
                  </Text>
                )}

                {b.netGold !==
                  0 ? (
                  <Text
                    style={
                      styles.expandedGold
                    }
                  >
                    {formatGold(
                      Math.abs(
                        b.netGold,
                      ),
                    )}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Explanation */}

            <View
              style={[
                styles.balanceExplanation,
                {
                  backgroundColor:
                    status ===
                      'receivable'
                      ? '#ECFDF5'
                      : status ===
                        'payable'
                        ? '#FEF2F2'
                        : '#F9FAFB',
                },
              ]}
            >
              <Text
                style={[
                  styles.balanceExplanationText,
                  {
                    color:
                      statusColor,
                  },
                ]}
              >
                {status ===
                  'receivable'
                  ? t('entries.receivableHint')
                  : status ===
                    'payable'
                    ? t('entries.payableHint')
                    : t('entries.settledHint')}
              </Text>
            </View>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  /* ==========================================================================
   * Render normal entry
   * ======================================================================== */

  const renderEntry = ({
    item,
  }: {
    item: Entry;
  }) => {
    const isIn =
      item.entryType ===
      'OWN_EVENT';

    const cash =
      Number(
        item.cashAmount || 0,
      );

    const gold =
      Number(
        item.goldWeight || 0,
      );

    return (
      <TouchableOpacity
        style={styles.entryCard}
        activeOpacity={0.78}
        onPress={() =>
          handleOpenDetail(item)
        }
      >
        <View
          style={
            styles.entryLeft
          }
        >
          <View
            style={
              styles.entryNameRow
            }
          >
            <Text
              style={
                styles.entryName
              }
              numberOfLines={1}
            >
              {item.personName}
            </Text>

            <Badge
              label={
                isIn
                  ? 'IN'
                  : 'OUT'
              }
              type={
                isIn
                  ? 'in'
                  : 'out'
              }
              style={
                styles.badge
              }
            />
          </View>

          {item.villageName ? (
            <Text
              style={
                styles.entrySub
              }
            >
              {item.villageName}
            </Text>
          ) : null}

          {item.eventName ? (
            <Text
              style={
                styles.entryEvent
              }
              numberOfLines={1}
            >
              {item.eventName}
            </Text>
          ) : null}

          <Text
            style={
              styles.entryDate
            }
          >
            {formatDate(
              item.createdAt,
            )}
          </Text>
        </View>

        <View
          style={
            styles.entryRight
          }
        >
          {cash > 0 ? (
            <Text
              style={[
                styles.amount,
                isIn
                  ? styles.amountIn
                  : styles.amountOut,
              ]}
            >
              {isIn
                ? '+'
                : '-'}
              {formatCash(cash)}
            </Text>
          ) : null}

          {gold > 0 ? (
            <Text
              style={
                styles.goldAmount
              }
            >
              {isIn
                ? '+'
                : '-'}
              {formatGold(
                gold,
              )}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  /* ==========================================================================
   * Header
   * ======================================================================== */

  const screenTitle =
    direction === 'ALL'
      ? t('entries.personAccount')
      : direction === 'IN'
        ? t('entries.receivedEntries')
        : t('entries.givenEntries');

  /* ==========================================================================
   * UI
   * ======================================================================== */

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background },
      ]}
    >
      {/* Header */}

      <View
        style={
          styles.header
        }
      >
        <View>
          <Text
            style={[
              styles.title,
              { color: colors.textPrimary },
            ]}
          >
            {screenTitle}
          </Text>

          <Text
            style={[
              styles.subtitle,
              { color: colors.textMuted },
            ]}
          >
            {direction ===
              'ALL'
              ? t('entries.personAccountSub')
              : direction ===
                'IN'
                ? t('entries.receivedIn')
                : t('entries.givenToOthers')}
          </Text>
        </View>
      </View>

      {/* Direction tabs */}

      <View
        style={[
          styles.directionTabs,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        {DIRECTION_TABS.map(
          tab => {
            const active =
              direction ===
              tab.key;

            return (
              <TouchableOpacity
                key={
                  tab.key
                }
                style={[
                  styles.directionTab,
                  active &&
                  tab.key ===
                  'IN' &&
                  styles.directionTabActiveIn,
                  active &&
                  tab.key ===
                  'OUT' &&
                  styles.directionTabActiveOut,
                  active &&
                  tab.key ===
                  'ALL' &&
                  styles.directionTabActiveAll,
                ]}
                onPress={() =>
                  handleDirectionChange(
                    tab.key,
                  )
                }
                activeOpacity={
                  0.8
                }
              >
                <Text
                  style={[
                    styles.directionTabText,
                    active &&
                    tab.key ===
                    'IN' &&
                    styles.directionTabTextActiveIn,
                    active &&
                    tab.key ===
                    'OUT' &&
                    styles.directionTabTextActiveOut,
                    active &&
                    tab.key ===
                    'ALL' &&
                    styles.directionTabTextActiveAll,
                  ]}
                >
                  {t(tab.labelKey)}
                </Text>

                <Text
                  style={[
                    styles.directionTabSubText,
                    active &&
                    styles.directionTabSubTextActive,
                  ]}
                >
                  {t(
                    tab.subLabelKey,
                  )}
                </Text>
              </TouchableOpacity>
            );
          },
        )}
      </View>

      {/* Search */}

      <View
        style={
          styles.searchArea
        }
      >
        <SearchBar
          value={
            searchQuery
          }
          onChangeText={
            setSearchQuery
          }
          placeholder={t('entries.search')}
          onVoiceSearch={
            handleVoiceSearch
          }
          voiceActive={
            voiceSearchActive
          }
        />
      </View>

      {/* IN event selector */}

      {direction ===
        'IN' ? (
        <View
          style={
            styles.filterSection
          }
        >
          <Text
            style={[
              styles.filterLabel,
              { color: colors.textMuted },
            ]}
          >
            {t('entries.ownEventLabel')}
          </Text>

          <TouchableOpacity
            style={
              styles.dropdown
            }
            onPress={() =>
              setEventDropdownVisible(
                true,
              )
            }
          >
            <View
              style={
                styles.dropdownContent
              }
            >
              <Text
                style={
                  styles.dropdownText
                }
                numberOfLines={
                  1
                }
              >
                {selectedEvent
                  ? selectedEvent.name
                  : t('entries.allEvents')}
              </Text>

              {selectedEvent?.eventDate ? (
                <Text
                  style={
                    styles.dropdownSubText
                  }
                >
                  {
                    selectedEvent.eventDate
                  }
                </Text>
              ) : null}
            </View>

            <Text
              style={
                styles.dropdownArrow
              }
            >
              ▼
            </Text>
          </TouchableOpacity>

          {/* Scan handwritten notebook → multiple IN entries */}
          <TouchableOpacity
            style={[styles.scanNotebookBtn, { borderColor: colors.primary, backgroundColor: colors.primaryBg }]}
            onPress={startNotebookScan}
            activeOpacity={0.8}
          >
            <Feather name="camera" size={16} color={colors.primary} />
            <Text style={[styles.scanNotebookText, { color: colors.primary }]}>
              {t('ocr.scanEntries')}
            </Text>
            {!isPremium && (
              <Feather name="lock" size={12} color={colors.pendingColor} style={{ marginLeft: 6 }} />
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {/* OUT duration */}

      {direction ===
        'OUT' ? (
        <View
          style={
            styles.durationSection
          }
        >
          <Text
            style={[
              styles.filterLabel,
              { color: colors.textMuted },
            ]}
          >
            {t('entries.durationLabel')}
          </Text>

          <View
            style={
              styles.durationRow
            }
          >
            {[
              {
                key: 'ALL' as const,
                labelKey: 'entries.filterAll',
              },
              {
                key: 'MONTH' as const,
                labelKey: 'entries.thisMonth',
              },
              {
                key: 'YEAR' as const,
                labelKey: 'entries.thisYear',
              },

            ].map(
              option => {
                const active =
                  outDuration ===
                  option.key;

                return (
                  <TouchableOpacity
                    key={
                      option.key
                    }
                    style={[
                      styles.durationChip,
                      active &&
                      styles.durationChipActive,
                    ]}
                    onPress={() =>
                      setOutDuration(
                        option.key,
                      )
                    }
                  >
                    <Text
                      style={[
                        styles.durationChipText,
                        active &&
                        styles.durationChipTextActive,
                      ]}
                    >
                      {t(
                        option.labelKey,
                      )}
                    </Text>
                  </TouchableOpacity>
                );
              },
            )}
          </View>
        </View>
      ) : null}

      {/* Content */}

      {loading ? (
        <View
          style={
            styles.center
          }
        >
          <ActivityIndicator
            size="large"
            color={
              colors.primary
            }
          />

          <Text
            style={[
              styles.loadingText,
              { color: colors.textMuted },
            ]}
          >
            {t('entries.loadingEntries')}
          </Text>
        </View>
      ) : direction ===
        'ALL' ? (
        /* ================================================================
         * ALL - PERSON BALANCES
         * ================================================================ */

        <FlatList
          data={
            personBalances
          }
          keyExtractor={(
            item,
            index,
          ) =>
            String(
              item.personId ||
              `${item.personName}-${item.villageName}-${index}`,
            )
          }
          renderItem={({
            item,
          }) => (
            <PersonBalanceCard
              balance={item}
            />
          )}
          showsVerticalScrollIndicator={
            false
          }
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={7}
          initialNumToRender={8}
          contentContainerStyle={
            personBalances.length ===
              0
              ? styles.emptyContainer
              : styles.list
          }
          refreshControl={
            <RefreshControl
              refreshing={
                refreshing
              }
              onRefresh={() =>
                loadEntries(
                  true,
                )
              }
              colors={[
                colors.primary,
              ]}
            />
          }
          ListHeaderComponent={
            personBalances.length >
              0 ? (
              <View
                style={[
                  styles.balanceSummaryBar,
                  { backgroundColor: colors.surface, borderColor: colors.borderLight },
                ]}
              >
                <View>
                  <Text
                    style={[
                      styles.balanceSummaryTitle,
                      { color: colors.textPrimary },
                    ]}
                  >
                    {t('entries.personAccounts')}
                  </Text>

                  <Text
                    style={[
                      styles.balanceSummarySub,
                      { color: colors.textMuted },
                    ]}
                  >
                    {
                      personBalances.length
                    }{' '}
                    {t('entries.persons')}
                  </Text>
                </View>

                <Text
                  style={[
                    styles.balanceSummaryHint,
                    { color: colors.textMuted },
                  ]}
                >
                  {t('entries.tapToExpand')}
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              title={t('entries.noEntries')}
              subtitle={
                searchQuery
                  ? t('entries.tryAnotherSearch')
                  : t('entries.noEntriesHint')
              }
              actionLabel={
                !searchQuery
                  ? t('entries.addEntryAction')
                  : undefined
              }
              onAction={
                !searchQuery
                  ? handleAdd
                  : undefined
              }
              icon="📋"
            />
          }
        />
      ) : (
        /* ================================================================
         * IN / OUT - NORMAL ENTRIES
         * ================================================================ */

        <FlatList
          data={
            displayEntries
          }
          keyExtractor={item =>
            String(
              item.id,
            )
          }
          renderItem={
            renderEntry
          }
          showsVerticalScrollIndicator={
            false
          }
          removeClippedSubviews={true}
          maxToRenderPerBatch={12}
          windowSize={7}
          initialNumToRender={10}
          contentContainerStyle={
            displayEntries.length ===
              0
              ? styles.emptyContainer
              : styles.list
          }
          refreshControl={
            <RefreshControl
              refreshing={
                refreshing
              }
              onRefresh={() =>
                loadEntries(
                  true,
                )
              }
              colors={[
                colors.primary,
              ]}
            />
          }
          ListHeaderComponent={
            displayEntries.length >
              0 ? (
              <View
                style={[
                  styles.summaryBar,
                  { backgroundColor: colors.surface, borderColor: colors.borderLight },
                ]}
              >
                <Text
                  style={[
                    styles.summaryCount,
                    { color: colors.textMuted },
                  ]}
                >
                  {
                    displayEntries.length
                  }{' '}
                  {t('entries.entries')}
                </Text>

                <View
                  style={
                    styles.summaryRight
                  }
                >
                  {totalCash >
                    0 ? (
                    <Text
                      style={[
                        styles.summaryAmount,
                        direction ===
                          'IN'
                          ? styles.amountIn
                          : styles.amountOut,
                      ]}
                    >
                      {direction ===
                        'IN'
                        ? '+'
                        : '-'}
                      {formatCash(
                        totalCash,
                      )}
                    </Text>
                  ) : null}

                  {totalGold >
                    0 ? (
                    <Text
                      style={
                        styles.summaryGold
                      }
                    >
                      {formatGold(
                        totalGold,
                      )}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              title={t('entries.noEntries')}
              subtitle={
                searchQuery
                  ? t('entries.tryAnotherSearch')
                  : direction ===
                    'IN'
                    ? t('entries.noInEntriesHint')
                    : t('entries.noOutEntriesHint')
              }
              actionLabel={
                !searchQuery
                  ? t('entries.addEntryAction')
                  : undefined
              }
              onAction={
                !searchQuery
                  ? handleAdd
                  : undefined
              }
              icon="📋"
            />
          }
        />
      )}

      {/* =====================================================================
       * Add / Voice buttons (hidden on Person Entries / ALL tab)
       * =================================================================== */}

      {direction !== 'ALL' && (
        <>
          <TouchableOpacity
            style={[
              styles.fabVoice,
              { backgroundColor: colors.surface, borderColor: colors.primary },
            ]}
            onPress={() =>
              ensurePremium(PremiumFeature.VoiceEntry, () =>
                setVoiceModalVisible(true),
              )
            }
            activeOpacity={0.85}
          >
            <Feather name="mic" size={20} color={colors.primary} />
            {!isPremium && <PremiumLockIcon />}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.fab,
              { backgroundColor: colors.primary },
            ]}
            onPress={
              handleAdd
            }
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.fabText,
                { color: colors.textInverse },
              ]}
            >
              +
            </Text>
          </TouchableOpacity>
        </>
      )}

      {/* =====================================================================
       * Event dropdown
       * =================================================================== */}

      <Modal
        visible={
          eventDropdownVisible
        }
        transparent
        animationType="fade"
        onRequestClose={() =>
          setEventDropdownVisible(
            false,
          )
        }
      >
        <Pressable
          style={
            styles.modalOverlay
          }
          onPress={() =>
            setEventDropdownVisible(
              false,
            )
          }
        >
          <Pressable
            style={
              styles.eventModal
            }
            onPress={event =>
              event.stopPropagation()
            }
          >
            <View
              style={
                styles.eventModalHeader
              }
            >
              <View>
                <Text
                  style={[
                    styles.eventModalTitle,
                    { color: colors.textPrimary },
                  ]}
                >
                  {t('entries.selectEventTitle')}
                </Text>

                <Text
                  style={[
                    styles.eventModalSub,
                    { color: colors.textMuted },
                  ]}
                >
                  {t('entries.selectEventSub')}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() =>
                  setEventDropdownVisible(
                    false,
                  )
                }
              >
                <Text
                  style={
                    styles.closeButton
                  }
                >
                  ×
                </Text>
              </TouchableOpacity>
            </View>

            {/* All */}

            <TouchableOpacity
              style={[
                styles.eventOption,
                selectedEventId ===
                'ALL' &&
                styles.eventOptionSelected,
              ]}
              onPress={() =>
                selectEvent(
                  'ALL',
                )
              }
            >
              <View
                style={
                  styles.eventOptionContent
                }
              >
                <Text
                  style={[
                    styles.eventOptionText,
                    selectedEventId ===
                    'ALL' &&
                    styles.eventOptionTextSelected,
                  ]}
                >
                  {t('entries.allEvents')}
                </Text>

                <Text
                  style={
                    styles.eventOptionSub
                  }
                >
                  {t('entries.allEventsEntries')}
                </Text>
              </View>

              {selectedEventId ===
                'ALL' ? (
                <Text
                  style={
                    styles.checkMark
                  }
                >
                  ✓
                </Text>
              ) : null}
            </TouchableOpacity>

            {ownEvents.map(
              event => {
                const isSelected =
                  String(
                    selectedEventId,
                  ) ===
                  String(
                    event.id,
                  );

                return (
                  <TouchableOpacity
                    key={String(
                      event.id,
                    )}
                    style={[
                      styles.eventOption,
                      isSelected &&
                      styles.eventOptionSelected,
                    ]}
                    onPress={() =>
                      selectEvent(
                        String(
                          event.id,
                        ),
                      )
                    }
                  >
                    <View
                      style={
                        styles.eventOptionContent
                      }
                    >
                      <Text
                        style={[
                          styles.eventOptionText,
                          isSelected &&
                          styles.eventOptionTextSelected,
                        ]}
                        numberOfLines={
                          1
                        }
                      >
                        {
                          event.name
                        }
                      </Text>

                      {event.eventDate ? (
                        <Text
                          style={
                            styles.eventOptionSub
                          }
                        >
                          {
                            event.eventDate
                          }
                        </Text>
                      ) : null}
                    </View>

                    {isSelected ? (
                      <Text
                        style={
                          styles.checkMark
                        }
                      >
                        ✓
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              },
            )}

            {ownEvents.length ===
              0 ? (
              <View
                style={
                  styles.noEvents
                }
              >
                <Text
                  style={
                    styles.noEventsIcon
                  }
                >
                  📅
                </Text>

                <Text
                  style={[
                    styles.noEventsText,
                    { color: colors.textPrimary },
                  ]}
                >
                  {t('entries.noOwnEvents')}
                </Text>

                <Text
                  style={[
                    styles.noEventsSub,
                    { color: colors.textMuted },
                  ]}
                >
                  {t('entries.createEventFirst')}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* =====================================================================
       * Voice Entry Modal — lazy-loaded to keep voice native module off startup
       * =================================================================== */}

      {voiceModalVisible && (
        <Suspense fallback={null}>
          <LazyVoiceEntryModal
            visible={
              voiceModalVisible
            }
            onClose={() =>
              setVoiceModalVisible(
                false,
              )
            }
            onSaved={async () => {
              setVoiceModalVisible(false);
              await loadEntries(true);
            }}
            onParsed={
              handleVoiceParsed
            }
            entryType={
              direction === 'IN'
                ? 'OWN_EVENT'
                : direction === 'OUT'
                ? 'OTHER_EVENT'
                : null
            }
            eventId={
              direction === 'IN' && selectedEventId !== 'ALL'
                ? selectedEventId
                : null
            }
            eventName={
              direction === 'IN' ? selectedEvent?.name : undefined
            }
          />
        </Suspense>
      )}

      {/* =====================================================================
       * Add / Edit Entry Modal
       * =================================================================== */}

      <AddEditEntryModal
        visible={
          modalVisible
        }
        entry={
          selectedEntry
        }
        voicePrefill={
          voicePrefill
        }
        prefillEventId={
          // Only meaningful for new IN entries — ignored in edit mode and for
          // OUT entries (the modal's own logic handles those cases).
          !selectedEntry && direction === 'IN'
            ? selectedEventId !== 'ALL'
              ? selectedEventId          // user already filtered to a specific event
              : ownEvents[0]?.id ?? null // default: most recent own event
            : null
        }
        forceEntryType={
          selectedEntry
            ? selectedEntry.entryType
            : direction === 'IN'
            ? 'OWN_EVENT'
            : direction === 'OUT'
            ? 'OTHER_EVENT'
            : null
        }
        onClose={() => {
          setModalVisible(
            false,
          );

          setSelectedEntry(
            null,
          );

          setVoicePrefill(
            null,
          );
        }}
        onSaved={
          handleSaved
        }
      />

      <EntryDetailModal
        visible={detailVisible}
        entry={detailEntry}
        onClose={() => {
          setDetailVisible(false);
          setDetailEntry(null);
        }}
        onEdit={handleDetailEdit}
        onDelete={handleDetailDelete}
      />

      {/* OCR notebook-scan review — creates IN entries mapped to the event */}
      <OCRReviewModal
        visible={ocrReviewVisible}
        extracted={ocrEntries}
        loading={ocrScanning}
        backendReachable={ocrBackendReachable}
        eventId={selectedEventId !== 'ALL' ? selectedEventId : null}
        eventName={selectedEvent?.name}
        eventDate={selectedEvent?.eventDate ?? null}
        onClose={() => {
          setOcrReviewVisible(false);
          setOcrEntries([]);
        }}
        onSaved={handleOcrSaved}
      />
    </View>
  );
};

export default EntriesScreen;

/* =============================================================================
 * Styles
 * ========================================================================== */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor:
      Colors.background,
  },

  /* Header */

  header: {
    paddingHorizontal:
      Spacing.lg,
    paddingTop:20,
    paddingBottom:
      Spacing.sm,
    flexDirection: 'row',
    justifyContent:
      'space-between',
    alignItems:
      'center',
  },

  title: {
    fontSize: 19,
    lineHeight: 30,
    fontWeight: '700',
    color:
      Colors.textPrimary,
  },

  subtitle: {
    fontSize: 12,
    lineHeight: 17,
    color:
      Colors.textMuted,
    marginTop: 3,
  },

  addHeaderButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor:
      Colors.primary,
    alignItems:
      'center',
    justifyContent:
      'center',
    elevation: 3,
  },

  addHeaderButtonText: {
    color:
      Colors.textInverse,
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '400',
  },

  /* Direction tabs */

  directionTabs: {
    marginHorizontal:
      Spacing.lg,
    marginTop: 8,
    marginBottom: 8,
    flexDirection:
      'row',
    backgroundColor:
      Colors.surface,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor:
      Colors.border,
  },

  directionTab: {
    flex: 1,
    minHeight: 50,
    borderRadius: 9,
    alignItems:
      'center',
    justifyContent:
      'center',
  },

  directionTabActiveAll: {
    backgroundColor:
      '#EEF2FF',
  },

  directionTabActiveIn: {
    backgroundColor:
      '#DCFCE7',
  },

  directionTabActiveOut: {
    backgroundColor:
      '#FEE2E2',
  },

  directionTabText: {
    fontSize: 13,
    fontWeight: '800',
    color:
      Colors.textMuted,
  },

  directionTabTextActiveAll: {
    color:
      Colors.primary,
  },

  directionTabTextActiveIn: {
    color: '#15803D',
  },

  directionTabTextActiveOut: {
    color: '#DC2626',
  },

  directionTabSubText: {
    fontSize: 10,
    marginTop: 1,
    color:
      Colors.textMuted,
  },

  directionTabSubTextActive: {
    color:
      Colors.textPrimary,
  },

  /* Search */

  searchArea: {
    paddingHorizontal:
      Spacing.lg,
    paddingTop: 4,
    paddingBottom: 8,
  },

  /* Filters */

  filterSection: {
    paddingHorizontal:
      Spacing.lg,
    paddingBottom: 10,
  },

  durationSection: {
    paddingHorizontal:
      Spacing.lg,
    paddingBottom: 10,
  },

  filterLabel: {
    fontSize: 11,
    fontWeight: '700',
    color:
      Colors.textMuted,
    marginBottom: 6,
  },

  dropdown: {
    minHeight: 48,
    backgroundColor:
      Colors.surface,
    borderRadius: 11,
    borderWidth: 1,
    borderColor:
      Colors.border,
    paddingHorizontal: 14,
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'space-between',
  },

  dropdownContent: {
    flex: 1,
    paddingRight: 12,
  },

  dropdownText: {
    fontSize: 13,
    fontWeight: '600',
    color:
      Colors.textPrimary,
  },

  dropdownSubText: {
    fontSize: 11,
    color:
      Colors.textMuted,
    marginTop: 2,
  },

  dropdownArrow: {
    fontSize: 12,
    color:
      Colors.textMuted,
  },

  scanNotebookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },

  scanNotebookText: {
    fontSize: 13,
    fontWeight: '600',
  },

  durationRow: {
    flexDirection:
      'row',
    gap: 8,
  },

  durationChip: {
    flex: 1,
    minHeight: 40,
    borderRadius: 9,
    borderWidth: 1,
    borderColor:
      Colors.border,
    backgroundColor:
      Colors.surface,
    alignItems:
      'center',
    justifyContent:
      'center',
    paddingHorizontal: 6,
  },

  durationChipActive: {
    backgroundColor:
      '#EEF2FF',
    borderColor:
      Colors.primary,
  },

  durationChipText: {
    fontSize: 11,
    fontWeight: '600',
    color:
      Colors.textMuted,
  },

  durationChipTextActive: {
    color:
      Colors.primary,
    fontWeight: '700',
  },

  /* List */

  list: {
    paddingHorizontal:
      Spacing.lg,
    paddingBottom: 110,
  },

  emptyContainer: {
    flexGrow: 1,
    justifyContent:
      'center',
    paddingHorizontal:
      Spacing.lg,
    paddingBottom: 100,
  },

  center: {
    flex: 1,
    alignItems:
      'center',
    justifyContent:
      'center',
  },

  loadingText: {
    marginTop: 10,
    fontSize: 12,
    color:
      Colors.textMuted,
  },

  /* Normal entry summary */

  summaryBar: {
    minHeight: 46,
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'space-between',
    backgroundColor:
      Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 13,
    marginBottom: 10,
    borderWidth: 1,
    borderColor:
      Colors.borderLight,
  },

  summaryCount: {
    fontSize: 12,
    fontWeight: '600',
    color:
      Colors.textMuted,
  },

  summaryRight: {
    flexDirection:
      'row',
    alignItems:
      'center',
    gap: 10,
  },

  summaryAmount: {
    fontSize: 12,
    fontWeight: '700',
  },

  summaryGold: {
    fontSize: 12,
    fontWeight: '600',
    color:
      Colors.gold,
  },

  /* Normal entry card */

  entryCard: {
    backgroundColor:
      Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection:
      'row',
    elevation: 1,
  },

  entryLeft: {
    flex: 1,
    paddingRight: 10,
  },

  entryRight: {
    alignItems:
      'flex-end',
    justifyContent:
      'center',
    minWidth: 85,
  },

  entryNameRow: {
    flexDirection:
      'row',
    alignItems:
      'center',
    flexShrink: 1,
  },

  entryName: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '600',
    color:
      Colors.textPrimary,
  },

  badge: {
    marginLeft: 7,
  },

  entrySub: {
    fontSize: 12,
    color:
      Colors.textMuted,
    marginTop: 4,
  },

  entryEvent: {
    fontSize: 11,
    color:
      Colors.textDisabled,
    marginTop: 3,
  },

  entryDate: {
    fontSize: 10,
    color:
      Colors.textDisabled,
    marginTop: 3,
  },

  amount: {
    fontSize: 14,
    fontWeight: '700',
  },

  amountIn: {
    color:
      Colors.inColor,
  },

  amountOut: {
    color:
      Colors.outColor,
  },

  goldAmount: {
    fontSize: 12,
    fontWeight: '600',
    color:
      Colors.gold,
    marginTop: 4,
  },

  /* ==========================================================================
   * Person balance
   * ======================================================================== */

  balanceSummaryBar: {
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'space-between',
    backgroundColor:
      Colors.surface,
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 10,
    borderWidth: 1,
    borderColor:
      Colors.borderLight,
  },

  balanceSummaryTitle: {
    fontSize: 12,
    fontWeight: '700',
    color:
      Colors.textPrimary,
  },

  balanceSummarySub: {
    fontSize: 11,
    color:
      Colors.textMuted,
    marginTop: 2,
  },

  balanceSummaryHint: {
    fontSize: 10,
    color:
      Colors.textMuted,
  },

  personCard: {
    backgroundColor:
      Colors.surface,
    borderRadius: 13,
    marginBottom: 9,
    padding: 14,
    borderWidth: 1,
    borderColor:
      Colors.borderLight,
    elevation: 1,
  },

  personCardMain: {
    flexDirection:
      'row',
    alignItems:
      'center',
  },

  personCardInfo: {
    flex: 1,
    paddingRight: 8,
  },

  personNameRow: {
    flexDirection:
      'row',
    alignItems:
      'center',
    flexShrink: 1,
  },

  personCardName: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
    color:
      Colors.textPrimary,
  },

  personBadge: {
    marginLeft: 7,
    fontSize: 8,
  },

  personVillage: {
    fontSize: 12,
    color:
      Colors.textMuted,
    marginTop: 4,
  },

  personEntryCount: {
    fontSize: 10,
    color:
      Colors.textDisabled,
    marginTop: 3,
  },
  personNetValues: {
    alignItems: 'flex-end',
    justifyContent: 'center',

  },

  netValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 3,
  },

  netValueLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginRight: 6,
  },

  personNetAmount: {
    fontSize: 14,
    fontWeight: '700',
  },

  personGoldAmount: {
    fontSize: 14,
    fontWeight: '700',
  },

  settledAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
  },

  personBalanceRight: {
    minWidth: 92,
    alignItems:
      'flex-end',
    justifyContent:
      'center',
  },

  personStatusText: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: 3,
  },

  expandIcon: {
    width: 20,
    textAlign:
      'right',
    fontSize: 14,
    color:
      Colors.textMuted,
    marginLeft: 6,
  },

  expandedSection: {
    marginTop: 14,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor:
      Colors.borderLight,
  },

  expandedRow: {
    flexDirection:
      'row',
    justifyContent:
      'space-between',
    alignItems:
      'center',
    minHeight: 45,
  },

  expandedLabel: {
    fontSize: 12,
    fontWeight: '700',
    color:
      Colors.textPrimary,
  },

  expandedHint: {
    fontSize: 10,
    color:
      Colors.textDisabled,
    marginTop: 2,
  },

  expandedValueContainer: {
    alignItems:
      'flex-end',
  },

  expandedValue: {
    fontSize: 13,
    fontWeight: '700',
  },

  expandedGold: {
    fontSize: 13,
    fontWeight: '600',
    color:
      Colors.gold,
    marginTop: 3,
  },

  zeroValue: {
    fontSize: 13,
    color:
      Colors.textDisabled,
  },

  expandedSep: {
    height: 1,
    backgroundColor:
      Colors.borderLight,
    marginVertical: 4,
  },

  netRow: {
    marginTop: 2,
  },

  netLabel: {
    fontSize: 12,
    fontWeight: '800',
    color:
      Colors.textPrimary,
  },

  netValue: {
    fontSize: 14,
    fontWeight: '800',
  },

  balanceExplanation: {
    marginTop: 10,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  balanceExplanationText: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 15,
  },

  /* ==========================================================================
   * Event modal
   * ======================================================================== */

  modalOverlay: {
    flex: 1,
    backgroundColor:
      'rgba(0,0,0,0.45)',
    justifyContent:
      'center',
    paddingHorizontal: 20,
  },

  eventModal: {
    backgroundColor:
      Colors.surface,
    borderRadius: 16,
    maxHeight: '75%',
    overflow: 'hidden',
  },

  eventModalHeader: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 13,
    flexDirection:
      'row',
    justifyContent:
      'space-between',
    alignItems:
      'center',
    borderBottomWidth: 1,
    borderBottomColor:
      Colors.borderLight,
  },

  eventModalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color:
      Colors.textPrimary,
  },

  eventModalSub: {
    fontSize: 11,
    color:
      Colors.textMuted,
    marginTop: 3,
  },

  closeButton: {
    fontSize: 24,
    lineHeight: 27,
    color:
      Colors.textMuted,
  },

  eventOption: {
    minHeight: 58,
    paddingHorizontal: 18,
    flexDirection:
      'row',
    alignItems:
      'center',
    justifyContent:
      'space-between',
    borderBottomWidth: 1,
    borderBottomColor:
      Colors.borderLight,
  },

  eventOptionSelected: {
    backgroundColor:
      '#EEF2FF',
  },

  eventOptionContent: {
    flex: 1,
    paddingRight: 10,
  },

  eventOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color:
      Colors.textPrimary,
  },

  eventOptionTextSelected: {
    color:
      Colors.primary,
    fontWeight: '700',
  },

  eventOptionSub: {
    fontSize: 10,
    color:
      Colors.textMuted,
    marginTop: 3,
  },

  checkMark: {
    fontSize: 16,
    fontWeight: '800',
    color:
      Colors.primary,
  },

  noEvents: {
    alignItems:
      'center',
    paddingVertical: 25,
  },

  noEventsIcon: {
    fontSize: 24,
  },

  noEventsText: {
    fontSize: 12,
    fontWeight: '600',
    color:
      Colors.textPrimary,
    marginTop: 8,
  },

  noEventsSub: {
    fontSize: 11,
    color:
      Colors.textMuted,
    marginTop: 4,
  },

  /* FAB */

  fabVoice: {
    position:
      'absolute',
    bottom: 194,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor:
      Colors.surface,
    alignItems:
      'center',
    justifyContent:
      'center',
    elevation: 4,
    borderWidth: 1.5,
    borderColor:
      Colors.primary,
    shadowColor:
      '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },

  fabVoiceText: {
    fontSize: 18,
  },

  fab: {
    position:
      'absolute',
    bottom: 130,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor:
      Colors.primary,
    alignItems:
      'center',
    justifyContent:
      'center',
    elevation: 6,
    shadowColor:
      Colors.primary,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },

  fabText: {
    color:
      Colors.textInverse,
    fontSize: 26,
    fontWeight: '300',
    lineHeight: 32,
  },
});