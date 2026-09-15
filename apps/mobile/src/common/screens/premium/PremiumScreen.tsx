import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';

import { ThemeColors, useTheme } from '@common/context/ThemeContext';
import { useAppTranslation } from '@common/hooks/useAppTranslation';
import { useEntitlement } from '@common/context/EntitlementContext';
import { Button } from '@common/components/Button';
import {
  PREMIUM_FEATURE_ORDER,
  SubscriptionPlan,
  SUBSCRIPTION_PLANS,
} from '@common/subscription/subscriptionConfig';
import {
  PurchaseOutcome,
  StoreSubscription,
} from '@common/subscription/types';
import { entitlementService } from '@common/services';
import { formatDate } from '@common/utils/format';

const PremiumScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const { colors } = useTheme();
  const { t } = useAppTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    entitlement,
    isPremium,
    getPlans,
    purchase,
    restore,
  } = useEntitlement();

  const [plans, setPlans] = useState<StoreSubscription[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState<string>(
    SUBSCRIPTION_PLANS[3].productId, // default to yearly (best value)
  );
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<{
    events: { used: number; limit: number };
    people: { used: number; limit: number };
  } | null>(null);

  // ---------------------------------------------------------------------------
  // Load plans + usage
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const fetched = await getPlans();
        if (mounted) setPlans(fetched);
      } catch {
        if (mounted) setPlans([]);
      } finally {
        if (mounted) setLoadingPlans(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getPlans]);

  useEffect(() => {
    let mounted = true;
    entitlementService
      .getUsage()
      .then(u => {
        if (mounted) setUsage(u);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [isPremium]);

  // ---------------------------------------------------------------------------
  // Outcome → message
  // ---------------------------------------------------------------------------

  const messageForOutcome = useCallback(
    (outcome: PurchaseOutcome): string => {
      switch (outcome) {
        case 'success':
          return t('premium.purchaseSuccess');
        case 'pending':
          return t('premium.purchasePending');
        case 'cancelled':
          return t('premium.purchaseCancelled');
        case 'already_owned':
          return t('premium.alreadyOwned');
        case 'billing_unavailable':
          return t('premium.billingUnavailable');
        case 'offline':
          return t('premium.offlineError');
        default:
          return t('premium.purchaseError');
      }
    },
    [t],
  );

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleSubscribe = useCallback(async () => {
    setBusy(true);
    try {
      const result = await purchase(selectedProductId);
      Alert.alert(t('premium.title'), messageForOutcome(result.outcome));
    } catch {
      Alert.alert(t('premium.title'), t('premium.purchaseError'));
    } finally {
      setBusy(false);
    }
  }, [purchase, selectedProductId, t, messageForOutcome]);

  const handleRestore = useCallback(async () => {
    setBusy(true);
    try {
      const result = await restore();
      Alert.alert(
        t('premium.title'),
        result.restored
          ? t('premium.restoreSuccess')
          : result.outcome === 'success'
          ? t('premium.restoreNone')
          : messageForOutcome(result.outcome),
      );
    } catch {
      Alert.alert(t('premium.title'), t('premium.purchaseError'));
    } finally {
      setBusy(false);
    }
  }, [restore, t, messageForOutcome]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const priceLabelFor = (plan: SubscriptionPlan): string => {
    const store = plans.find(p => p.productId === plan.productId);
    return store?.localizedPrice ?? `₹${plan.priceInr}`;
  };

  const cadenceLabelFor = (plan: SubscriptionPlan): string => {
    switch (plan.id) {
      case 'monthly':
        return t('premium.perMonth');
      case 'quarterly':
        return t('premium.perQuarter');
      case 'halfYearly':
        return t('premium.perHalfYear');
      default:
        return t('premium.perYear');
    }
  };

  const statusLine = (): string => {
    if (isPremium) return t('premium.statusActive');
    if (entitlement.expiryAt) return t('premium.statusExpired');
    return t('premium.statusFree');
  };

  const usageText = (used: number, limit: number): string =>
    limit === Number.POSITIVE_INFINITY
      ? t('premium.unlimited')
      : t('premium.ofLimit', { used, limit });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation?.goBack()}>
            <Text style={styles.back}>‹ {t('common.back')}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('premium.title')}</Text>
          <Text style={styles.subtitle}>{t('premium.subtitle')}</Text>
        </View>

        {/* Status */}
        <View style={[styles.card, styles.statusCard]}>
          <Text style={styles.statusText}>{statusLine()}</Text>
          {entitlement.expiryAt ? (
            <Text style={styles.statusSub}>
              {t('premium.expiresOn', {
                date: safeFormatDate(entitlement.expiryAt),
              })}
            </Text>
          ) : null}
          {entitlement.fromCacheOnly ? (
            <Text style={styles.offlineNotice}>
              {t('premium.offlineNotice')}
            </Text>
          ) : null}
        </View>

        {/* Usage */}
        {usage ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('premium.usageTitle')}</Text>
            <View style={styles.usageRow}>
              <Text style={styles.usageLabel}>{t('premium.usageEvents')}</Text>
              <Text style={styles.usageValue}>
                {usageText(usage.events.used, usage.events.limit)}
              </Text>
            </View>
            <View style={styles.usageRow}>
              <Text style={styles.usageLabel}>{t('premium.usagePeople')}</Text>
              <Text style={styles.usageValue}>
                {usageText(usage.people.used, usage.people.limit)}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Plans (hidden when already premium) */}
        {!isPremium ? (
          <>
            <Text style={styles.sectionTitle}>{t('premium.choosePlan')}</Text>
            {loadingPlans ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
            ) : (
              <View style={styles.plansWrap}>
                {SUBSCRIPTION_PLANS.map(plan => {
                  const selected = plan.productId === selectedProductId;
                  const best = plan.id === 'yearly';
                  return (
                    <TouchableOpacity
                      key={plan.productId}
                      style={[styles.planCard, selected && styles.planCardSelected]}
                      onPress={() => setSelectedProductId(plan.productId)}
                      activeOpacity={0.85}
                    >
                      {best ? (
                        <View style={styles.bestBadge}>
                          <Text style={styles.bestBadgeText}>
                            {t('premium.bestValue')}
                          </Text>
                        </View>
                      ) : null}
                      <Text style={styles.planName}>
                        {t(`premium.plans.${plan.labelKey}` as any)}
                      </Text>
                      <Text style={styles.planPrice}>{priceLabelFor(plan)}</Text>
                      <Text style={styles.planCadence}>{cadenceLabelFor(plan)}</Text>
                      {selected ? <Text style={styles.planCheck}>✓</Text> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <Button
              title={t('premium.subscribeTo', {
                price: priceLabelFor(
                  SUBSCRIPTION_PLANS.find(p => p.productId === selectedProductId) ??
                    SUBSCRIPTION_PLANS[3],
                ),
              })}
              onPress={handleSubscribe}
              loading={busy}
              fullWidth
              style={{ marginTop: 8 }}
            />
          </>
        ) : null}

        {/* Restore */}
        <Button
          title={t('premium.restore')}
          onPress={handleRestore}
          variant="outline"
          loading={busy}
          fullWidth
          style={{ marginTop: 12 }}
        />

        {/* Benefits */}
        <Text style={styles.sectionTitle}>{t('premium.benefitsTitle')}</Text>
        <View style={styles.card}>
          {PREMIUM_FEATURE_ORDER.map((feature, index) => (
            <View
              key={feature}
              style={[styles.benefitRow, index > 0 && styles.benefitSep]}
            >
              <Text style={styles.benefitTick}>✓</Text>
              <Text style={styles.benefitText}>
                {t(`premium.features.${feature}` as any)}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

// Guard against unparseable dates without crashing the paywall.
function safeFormatDate(iso: string): string {
  try {
    return formatDate(iso);
  } catch {
    return iso;
  }
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16 },
    header: { marginBottom: 12 },
    back: { color: colors.primary, fontSize: 15, fontWeight: '600', marginBottom: 8 },
    title: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
    subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 4 },

    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginTop: 12,
    },
    statusCard: { backgroundColor: colors.primaryBg, borderColor: colors.primaryLight },
    statusText: { fontSize: 16, fontWeight: '700', color: colors.primary },
    statusSub: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
    offlineNotice: { fontSize: 12, color: colors.textMuted, marginTop: 8, fontStyle: 'italic' },

    cardTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 8 },
    usageRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
    usageLabel: { fontSize: 14, color: colors.textSecondary },
    usageValue: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },

    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginTop: 20,
      marginBottom: 4,
    },

    plansWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    planCard: {
      width: '48.5%',
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.border,
      padding: 14,
      marginTop: 10,
    },
    planCardSelected: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
    planName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
    planPrice: { fontSize: 20, fontWeight: '800', color: colors.primary, marginTop: 6 },
    planCadence: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    planCheck: { position: 'absolute', top: 10, right: 12, color: colors.primary, fontWeight: '800' },
    bestBadge: {
      position: 'absolute',
      top: -8,
      left: 12,
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    bestBadgeText: { color: colors.textInverse, fontSize: 10, fontWeight: '800' },

    benefitRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
    benefitSep: { borderTopWidth: 1, borderTopColor: colors.borderLight },
    benefitTick: { color: colors.success, fontWeight: '800', marginRight: 10, fontSize: 15 },
    benefitText: { fontSize: 14, color: colors.textPrimary, flex: 1 },
  });

export default PremiumScreen;
