/**
 * RevenueCat client configuration.
 *
 * The value here is the RevenueCat *public SDK key* (Android: `goog_...`),
 * which is designed to be shipped inside the app — it is NOT a secret. The
 * RevenueCat REST/secret key and the webhook auth token live ONLY in the
 * backend and are never bundled with the mobile app.
 *
 * Replace the placeholder with your project's Android SDK key from the
 * RevenueCat dashboard (Project settings -> API keys -> Public app-specific
 * keys). For CI/multiple environments, wire this to a build-time config
 * (react-native-config / gradle field) rather than hard-coding.
 */

export const REVENUECAT_PUBLIC_SDK_KEY = 'goog_YOUR_PUBLIC_SDK_KEY';

/**
 * The RevenueCat entitlement identifier that unlocks premium. Must match the
 * entitlement configured in the RevenueCat dashboard and the backend
 * (`PREMIUM_ENTITLEMENT` in app/core/plans.py -> "premium").
 */
export const PREMIUM_ENTITLEMENT_ID = 'premium';
