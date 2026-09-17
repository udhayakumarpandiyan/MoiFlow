/**
 * Central configuration for the MoiFlow Free + Premium subscription system.
 *
 * This is the single source of truth for:
 *  - Google Play subscription product IDs
 *  - The four subscription plans + pricing metadata
 *  - Premium feature keys (used by EntitlementService for gating)
 *  - Free-plan usage limits
 *
 * Nothing here is a "proof of purchase". Google Play Billing remains the
 * authority for ownership (see SubscriptionService). These constants only
 * describe *what* is offered and *what* Free users are limited to.
 */

// ---------------------------------------------------------------------------
// TEMPORARY: unlock all premium features
// ---------------------------------------------------------------------------
// When true, EntitlementService treats every user as premium: all premium
// features are usable and all Free usage limits are lifted. This is a single
// master switch for the current "everything unlocked" phase.
//
// TO RE-ENABLE PREMIUM GATING: set this back to `false`. No other code needs
// to change — the real derivation logic in EntitlementService is preserved.
export const FORCE_ALL_FEATURES_UNLOCKED = true;

// ---------------------------------------------------------------------------
// Google Play product IDs (must match Play Console exactly)
// ---------------------------------------------------------------------------

export const PRODUCT_IDS = {
  monthly: 'moiflow_monthly',
  quarterly: 'moiflow_quarterly',
  halfYearly: 'moiflow_half_yearly',
  yearly: 'moiflow_yearly',
} as const;

export type PlanId = keyof typeof PRODUCT_IDS;

/** All product IDs as a plain array (for react-native-iap getSubscriptions). */
export const ALL_PRODUCT_IDS: string[] = Object.values(PRODUCT_IDS);

/** Reverse lookup: Google Play productId -> internal PlanId. */
export const PRODUCT_ID_TO_PLAN: Record<string, PlanId> = Object.entries(
  PRODUCT_IDS,
).reduce((acc, [plan, productId]) => {
  acc[productId] = plan as PlanId;
  return acc;
}, {} as Record<string, PlanId>);

// ---------------------------------------------------------------------------
// Plan catalogue (display metadata + fallback pricing)
// ---------------------------------------------------------------------------

export interface SubscriptionPlan {
  /** Internal plan id. */
  id: PlanId;
  /** Google Play product id. */
  productId: string;
  /** Duration in whole months (used to compute a local fallback expiry). */
  durationMonths: number;
  /** Fallback price in INR (Play Console is authoritative for the real price). */
  priceInr: number;
  /** i18n key suffix under `premium.plans.*` for the label. */
  labelKey: string;
}

/**
 * The four subscription plans, in display order.
 * Pricing here is a *fallback* for display when the Play Store price string
 * is unavailable (e.g. offline). The Play Store localized price always wins.
 */
export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'monthly',
    productId: PRODUCT_IDS.monthly,
    durationMonths: 1,
    priceInr: 29,
    labelKey: 'monthly',
  },
  {
    id: 'quarterly',
    productId: PRODUCT_IDS.quarterly,
    durationMonths: 3,
    priceInr: 79,
    labelKey: 'quarterly',
  },
  {
    id: 'halfYearly',
    productId: PRODUCT_IDS.halfYearly,
    durationMonths: 6,
    priceInr: 149,
    labelKey: 'halfYearly',
  },
  {
    id: 'yearly',
    productId: PRODUCT_IDS.yearly,
    durationMonths: 12,
    priceInr: 289,
    labelKey: 'yearly',
  },
];

/** Look up a plan by its internal id. */
export const getPlanById = (id: PlanId): SubscriptionPlan | undefined =>
  SUBSCRIPTION_PLANS.find(p => p.id === id);

/** Look up a plan by its Google Play product id. */
export const getPlanByProductId = (
  productId: string,
): SubscriptionPlan | undefined =>
  SUBSCRIPTION_PLANS.find(p => p.productId === productId);

// ---------------------------------------------------------------------------
// Premium feature keys
// ---------------------------------------------------------------------------

/**
 * Every capability that is Premium-only. UI + services check these via
 * EntitlementService.canUseFeature(key). Basic capabilities (manual cash entry,
 * basic IN/OUT, basic dashboard, basic search, offline, Tamil) are intentionally
 * NOT listed here — they are always available to Free users.
 */
export enum PremiumFeature {
  UnlimitedEvents = 'UNLIMITED_EVENTS',
  UnlimitedEntries = 'UNLIMITED_ENTRIES',
  UnlimitedPeople = 'UNLIMITED_PEOPLE',
  GoldTracking = 'GOLD_TRACKING',
  AdvancedDashboard = 'ADVANCED_DASHBOARD',
  AdvancedSearch = 'ADVANCED_SEARCH',
  AdvancedReports = 'ADVANCED_REPORTS',
  PdfExport = 'PDF_EXPORT',
  ExcelExport = 'EXCEL_EXPORT',
  VoiceEntry = 'VOICE_ENTRY',
  VoiceSearch = 'VOICE_SEARCH',
  OcrScanner = 'OCR_SCANNER',
  AiReports = 'AI_REPORTS',
  NaturalLanguageQueries = 'NL_QUERIES',
  DuplicateDetection = 'DUPLICATE_DETECTION',
  SmartReminders = 'SMART_REMINDERS',
  AdvancedAnalytics = 'ADVANCED_ANALYTICS',
  CloudBackup = 'CLOUD_BACKUP',
  MultiDeviceSync = 'MULTI_DEVICE_SYNC',
  SharedEvents = 'SHARED_EVENTS',
  FamilyMembers = 'FAMILY_MEMBERS',
}

/** Ordered list of features to render as benefits on the Premium screen. */
export const PREMIUM_FEATURE_ORDER: PremiumFeature[] = [
  PremiumFeature.UnlimitedEvents,
  PremiumFeature.UnlimitedEntries,
  PremiumFeature.UnlimitedPeople,
  PremiumFeature.GoldTracking,
  PremiumFeature.AdvancedDashboard,
  PremiumFeature.AdvancedSearch,
  PremiumFeature.AdvancedReports,
  PremiumFeature.PdfExport,
  PremiumFeature.ExcelExport,
  PremiumFeature.VoiceEntry,
  PremiumFeature.VoiceSearch,
  PremiumFeature.OcrScanner,
  PremiumFeature.AiReports,
  PremiumFeature.NaturalLanguageQueries,
  PremiumFeature.DuplicateDetection,
  PremiumFeature.SmartReminders,
  PremiumFeature.AdvancedAnalytics,
  PremiumFeature.CloudBackup,
  PremiumFeature.MultiDeviceSync,
  PremiumFeature.SharedEvents,
  PremiumFeature.FamilyMembers,
];

// ---------------------------------------------------------------------------
// Free-plan usage limits
// ---------------------------------------------------------------------------

export const FREE_LIMITS = {
  /** Free users may own at most this many events. */
  maxEvents: 1,
  /** Free users may add at most this many entries per event. */
  maxEntriesPerEvent: 50,
  /** Free users may have at most this many people. */
  maxPeople: 50,
} as const;

/** Sentinel for "no limit" (Premium). */
export const UNLIMITED = Number.POSITIVE_INFINITY;

// ---------------------------------------------------------------------------
// Typed limit-kinds (used in thrown errors so the UI can localize + link out)
// ---------------------------------------------------------------------------

export enum LimitKind {
  Events = 'EVENTS',
  EntriesPerEvent = 'ENTRIES_PER_EVENT',
  People = 'PEOPLE',
}
