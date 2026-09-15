import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useEntitlement } from '@common/context/EntitlementContext';
import { PremiumFeature } from '@common/subscription/subscriptionConfig';
import { useAppTranslation } from './useAppTranslation';

/**
 * Centralized "gate a Premium-only feature" helper for the UI layer.
 *
 * Instead of letting a Free user trigger a premium capability and hit a thrown
 * PremiumRequiredError, screens call `ensurePremium(feature, onAllowed)`:
 *   - Premium users: `onAllowed()` runs immediately.
 *   - Free users: a friendly dialog explains the feature is Premium and offers
 *     to open the Premium/plans screen. The action does NOT run.
 *
 * This keeps the messaging + navigation consistent across Dashboard, Entries,
 * and Events, and matches the app's existing Alert.alert + navigation.navigate
 * conventions.
 */
export const usePremiumGate = () => {
  const { isPremium, canUseFeature } = useEntitlement();
  const { t } = useAppTranslation();
  const navigation = useNavigation<any>();

  /** Open the Premium screen (registered inside the Settings tab stack). */
  const openPremium = useCallback(() => {
    // Premium lives in SettingsStack, so navigate into that tab's stack. This
    // works from any tab (Dashboard/Entries/Events) via nested navigation.
    navigation.navigate('SettingsStack', { screen: 'Premium' });
  }, [navigation]);

  /**
   * Run `onAllowed` only when the given feature is available; otherwise show
   * the upsell dialog. Returns true when the action was allowed to run.
   */
  const ensurePremium = useCallback(
    (feature: PremiumFeature, onAllowed: () => void, message?: string): boolean => {
      if (canUseFeature(feature)) {
        onAllowed();
        return true;
      }

      Alert.alert(
        t('premium.lockedTitle'),
        message ?? t('premium.lockedFeatureMsg'),
        [
          { text: t('premium.notNow'), style: 'cancel' },
          { text: t('premium.viewPlans'), onPress: openPremium },
        ],
      );
      return false;
    },
    [canUseFeature, t, openPremium],
  );

  return { isPremium, canUseFeature, ensurePremium, openPremium };
};
