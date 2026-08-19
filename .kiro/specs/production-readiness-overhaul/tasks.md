# Implementation Plan: Production Readiness Overhaul

## Overview

Incremental implementation of the MoiFlow production-readiness overhaul. The plan builds foundational layers (theme, i18n, auth) first, then adds features (backup, voice events, OCR), and finishes with screen migrations and production hardening. TypeScript is used throughout (React Native 0.86).

## Tasks

- [x] 1. Theme system and global context
  - [x] 1.1 Create ThemeContext provider with theme palettes
    - Create `src/context/ThemeContext.tsx` with ThemeProvider, useTheme hook, and ThemeColors interface
    - Define all 6 theme palettes (system, light, dark, ocean, forest, sunset) with complete color tokens (primary, primaryLight, primaryDark, primaryBg, inColor, inBg, outColor, outBg, background, surface, border, borderLight, textPrimary, textSecondary, textMuted, textDisabled, textInverse)
    - Resolve `system` theme via `useColorScheme()` to light/dark
    - Use `useMemo` on resolved theme to prevent unnecessary re-renders
    - Persist theme choice via SettingsService
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 1.2 Add theme persistence to SettingsService
    - Modify `src/services/SettingsService.ts` to add `getTheme()` and `setTheme()` methods
    - Store theme preference in AsyncStorage under `settings.theme`
    - Type `Theme = 'system' | 'light' | 'dark' | 'ocean' | 'forest' | 'sunset'`
    - _Requirements: 7.3_

  - [x] 1.3 Wrap App.tsx with ThemeProvider
    - Modify `App.tsx` to wrap the existing tree with `<ThemeProvider>`
    - Ensure ThemeProvider wraps outside NavigationContainer so all screens have access
    - _Requirements: 7.1_

  - [x] 1.4 Write property test for Settings Persistence Round-Trip
    - **Property 3: Settings Persistence Round-Trip**
    - **Validates: Requirements 6.4, 7.3**
    - For any valid theme value, writing via SettingsService then reading back produces an identical value

- [x] 2. Internationalization expansion
  - [x] 2.1 Set default language to English in i18n config
    - Modify `src/i18n/index.ts` to change default language from `'ta'` to `'en'`
    - _Requirements: 6.1_

  - [x] 2.2 Expand English translation file with all new keys
    - Modify `src/i18n/en.ts` to add keys for: auth (registration, OTP, security setup, pin lock, pattern lock), profile menu, backup/restore, Google Drive, family sharing, OCR/invitation, voice events, settings (copyright, version, privacy), empty states, error messages, common actions
    - _Requirements: 6.2, 12.1_

  - [x] 2.3 Expand Tamil translation file with matching keys
    - Modify `src/i18n/ta.ts` to add all corresponding Tamil translations for every key added to `en.ts`
    - _Requirements: 6.2, 12.1_

  - [x] 2.4 Write property test for Translation Key Completeness
    - **Property 2: Translation Key Completeness**
    - **Validates: Requirements 6.2, 12.1**
    - For all keys in en.ts, a corresponding non-empty key exists in ta.ts, and vice versa

- [x] 3. Checkpoint - Theme and i18n foundation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Authentication service and screens
  - [x] 4.1 Create AuthService
    - Create `src/services/AuthService.ts` with methods: getAuthState, completeRegistration, setupSecurity, verifyPin, verifyPattern, signOut, recordFailedAttempt, resetFailedAttempts
    - Store auth state in AsyncStorage keys: `app.registered`, `auth.session_active`, `auth.failed_attempts`, `auth.lockout_until`, `settings.pin_hash`, `settings.pattern_lock`
    - Implement lockout logic: 3 consecutive failures → 30-second lockout
    - Hash credentials with SHA-256 before storing
    - _Requirements: 2.1, 2.3, 3.1, 3.3, 5.1_

  - [x] 4.2 Create OTPVerificationScreen
    - Create `src/screens/OTPVerificationScreen.tsx`
    - Generate local 6-digit OTP, display in `__DEV__` alert
    - 4-field OTP input with auto-advance focus
    - Verify entered OTP matches generated OTP
    - On success navigate to SecuritySetupScreen
    - Use useTheme() and useTranslation() hooks
    - _Requirements: 2.1, 2.2_

  - [x] 4.3 Create SecuritySetupScreen
    - Create `src/screens/SecuritySetupScreen.tsx`
    - Present two options: mPIN (4-digit) and Pattern Lock only — no biometric option
    - On selection navigate to PinSetupScreen or PatternSetupScreen
    - On completion call AuthService.setupSecurity() and navigate to MainTab
    - Use useTheme() and useTranslation() hooks
    - _Requirements: 2.3, 2.4, 2.5_

  - [x] 4.4 Update RegistrationScreen with OTP flow
    - Modify `src/screens/RegistrationScreen.tsx` to navigate to OTPVerificationScreen after phone number entry
    - Call AuthService.completeRegistration() with name and phone
    - Apply i18n and theme hooks
    - _Requirements: 2.1_

  - [x] 4.5 Update SplashScreen with auth state routing
    - Modify `src/screens/SplashScreen.tsx` to check AuthService.getAuthState()
    - Route: not registered → Registration; registered with PIN → PinLock; registered with pattern → PatternLock; session active → MainTab
    - Display loading indicator during state resolution
    - Target < 2 seconds cold start
    - Apply i18n and theme hooks
    - _Requirements: 1.1, 1.2, 1.3, 3.2, 17.1_

  - [x] 4.6 Update PinLockScreen and PatternLockScreen with auth gate logic
    - Modify `src/screens/PinLockScreen.tsx` and `src/screens/PatternLockScreen.tsx`
    - Verify against stored hash via AuthService
    - Implement lockout countdown (3 failures → 30s wait)
    - On success reset failures and navigate to MainTab
    - Apply i18n and theme hooks
    - _Requirements: 3.1, 3.3, 5.1, 5.2, 5.3_

  - [x] 4.7 Update RootNavigator with new auth screens
    - Modify `src/navigation/RootNavigator.tsx` to add OTPVerification and SecuritySetup routes
    - Ensure correct navigation flow: Splash → Registration → OTP → SecuritySetup → MainTab
    - _Requirements: 1.3, 2.3_

  - [x] 4.8 Write property test for Navigation Routing Correctness
    - **Property 1: Navigation Routing Correctness**
    - **Validates: Requirements 1.3, 3.1, 3.2, 5.1**
    - For any auth state combination, SplashScreen routes to exactly one correct destination

- [x] 5. Checkpoint - Auth flow complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Profile menu and sign-out
  - [x] 6.1 Create ProfileMenu component
    - Create `src/components/ProfileMenu.tsx`
    - Render a profile avatar icon (top-right header)
    - On press: toggle dropdown with "Sign Out" option
    - Sign out: call AuthService.signOut(), navigate to PinLock/PatternLock screen
    - Use useTheme() and useTranslation()
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 6.2 Integrate ProfileMenu into MainTabNavigator header
    - Modify `src/navigation/MainTabNavigator.tsx` to add ProfileMenu as `headerRight` in screenOptions
    - Ensure it appears on all tab screens
    - _Requirements: 4.1_

- [x] 7. Google Drive backup and family sharing
  - [x] 7.1 Install Google Sign-In and ML Kit dependencies
    - Add `@react-native-google-signin/google-signin` (^13.0.0) and `@react-native-ml-kit/text-recognition` (^1.0.0) to package.json
    - _Requirements: 8.1, 11.2_

  - [x] 7.2 Create GoogleDriveService
    - Create `src/services/GoogleDriveService.ts`
    - Implement: signIn (returns access token), signOut, uploadFile, listBackups, downloadFile, shareFile
    - Use Google Drive REST API v3 via fetch with OAuth2 token
    - Store backups in `MoiFlow_Backups` folder on user's Drive
    - _Requirements: 8.1, 8.6_

  - [x] 7.3 Extend BackupService with cloud methods
    - Modify `src/services/BackupService.ts` to add: backupToGoogleDrive, listCloudBackups, restoreFromGoogleDrive, scheduleAutoBackup, shareWithFamily
    - Handle Google Sign-In failure with error + retry option
    - Implement auto-backup scheduling (daily, weekly, monthly)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 7.4 Update Settings screen with backup and family sharing UI
    - Modify `src/features/settings/Settings.tsx` to add: Backup Now button, auto-backup interval selector, Google Drive restore list, family member sharing configuration (email/WhatsApp), copyright/version/privacy info
    - Apply i18n and theme hooks
    - _Requirements: 8.1, 8.3, 8.4, 8.6, 9.1, 9.2, 9.3_

  - [x] 7.5 Write unit tests for BackupService cloud methods
    - Test backup upload flow, error handling on sign-in failure, auto-backup scheduling logic
    - _Requirements: 8.1, 8.2, 8.3_

- [x] 8. Checkpoint - Backup and sharing complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Voice event service and modal
  - [x] 9.1 Create TamilEventParser
    - Create `src/voice/TamilEventParser.ts`
    - Regex-based extraction for: event type keywords (திருமணம், காதணி, பிறந்தநாள், etc.), date patterns (Tamil month names, numeric), venue (after இடம் or ஹால்), event name (remaining proper nouns)
    - Return ParsedVoiceEvent with confidence score
    - Must never throw for non-empty input
    - _Requirements: 10.3_

  - [x] 9.2 Create VoiceEventService
    - Create `src/voice/VoiceEventService.ts`
    - Implement: startListening, stopListening, parse, destroy
    - Use TamilSpeechRecognizer (lazy init) for recognition
    - Parse: try backend first, fall back to local TamilEventParser with 0.7 confidence multiplier
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 9.3 Create VoiceEventModal
    - Create `src/features/events/VoiceEventModal.tsx`
    - Show mic icon/animation while recording
    - Display recognized text
    - Show parsed fields (event name, type, date, venue) with edit capability
    - On confirm: pre-fill AddEditEvent form
    - _Requirements: 10.4, 10.5_

  - [x] 9.4 Integrate voice button into Events screen
    - Modify `src/features/events/Events.tsx` to add a voice button that opens VoiceEventModal
    - On modal confirm: open AddEditEventModal with pre-filled values
    - Apply i18n and theme hooks
    - _Requirements: 10.1, 10.4_

  - [x] 9.5 Write property test for Voice Result to Form Field Mapping
    - **Property 4: Voice Result to Form Field Mapping**
    - **Validates: Requirements 10.4, 13.3**
    - For any valid ParsedVoiceEvent, mapping to form fields preserves all non-null values

  - [x] 9.6 Write property test for Local Fallback Confidence Multiplier
    - **Property 5: Local Fallback Confidence Multiplier**
    - **Validates: Requirements 13.4, 10.3**
    - When backend is unreachable, returned confidence equals local parser confidence × 0.7

  - [x] 9.7 Write property test for Local Voice Parser Resilience
    - **Property 6: Local Voice Parser Resilience**
    - **Validates: Requirements 10.3, 13.4**
    - For any non-empty string input, TamilEventParser.parse() returns valid result without throwing

- [x] 10. Invitation upload, OCR, and share
  - [x] 10.1 Create OCRService
    - Create `src/services/OCRService.ts`
    - Use `@react-native-ml-kit/text-recognition` for on-device text recognition
    - Post-process extracted text with regex for Tamil event keywords, date patterns, venue indicators
    - Return OCRResult with confidence score
    - If confidence < 0.3: indicate failure for manual entry fallback
    - _Requirements: 11.2, 11.4_

  - [x] 10.2 Add invitation image capture flow to Events
    - Modify `src/features/events/AddEditEventModal.tsx` to add "Upload Invitation" button
    - Show action sheet: Camera (react-native-vision-camera) or Gallery
    - Save images to `${DocumentDirectoryPath}/MoiFlow/invitations/{eventId}/`
    - On capture: call OCRService.processImage() → pre-fill form fields
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 10.3 Add share invitation functionality
    - Modify `src/features/events/AddEditEventModal.tsx` or `Events.tsx` to add "Share Invitation" button
    - Use React Native's `Share` API with the invitation image path
    - _Requirements: 11.5_

  - [x] 10.4 Write unit tests for OCRService
    - Test text extraction post-processing, confidence thresholding, error handling for invalid images
    - _Requirements: 11.2, 11.4_

- [x] 11. Checkpoint - Voice and OCR features complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Screen-by-screen i18n and theme migration
  - [x] 12.1 Migrate Dashboard screen to theme and i18n
    - Modify `src/features/dashboard/Dashboard.tsx`
    - Replace static `Colors` imports with `const { colors } = useTheme()`
    - Replace hardcoded strings with `t()` calls
    - Handle empty states with informative messages
    - _Requirements: 7.1, 12.2, 16.1_

  - [x] 12.2 Migrate Entries screens to theme and i18n
    - Modify `src/features/entries/*.tsx` (all entry-related components)
    - Replace `Colors` with `useTheme()`, hardcoded strings with `t()`
    - Ensure voice search icon calls VoiceEntryService for Tamil search
    - Handle empty states and loading indicators
    - _Requirements: 7.1, 12.2, 13.1, 16.1, 16.2_

  - [x] 12.3 Migrate Events screen to theme and i18n
    - Modify `src/features/events/Events.tsx` and `AddEditEventModal.tsx`
    - Replace `Colors` with `useTheme()`, hardcoded strings with `t()`
    - Implement MY_EVENT filter: show only ownerType === 'MY_EVENT' in "My Events" tab
    - Limit own events to max 5
    - Sort: upcoming ascending, past descending
    - Handle empty state with create event prompt
    - _Requirements: 7.1, 12.2, 14.1, 14.2, 14.3, 14.4_

  - [x] 12.4 Migrate Settings screen to theme and i18n
    - Modify `src/features/settings/Settings.tsx`
    - Replace `Colors` with `useTheme()`, hardcoded strings with `t()`
    - Add theme selector UI (6 options)
    - Add language toggle (English/Tamil) that calls i18next.changeLanguage()
    - _Requirements: 6.3, 7.1, 7.2, 12.2_

  - [x] 12.5 Migrate Reports screen to theme and i18n
    - Modify `src/features/reports/*.tsx`
    - Replace `Colors` with `useTheme()`, hardcoded strings with `t()`
    - _Requirements: 7.1, 12.2_

  - [x] 12.6 Write property test for MY_EVENT Filter Correctness
    - **Property 7: MY_EVENT Filter Correctness**
    - **Validates: Requirements 14.1**
    - Filter returns only events with ownerType === 'MY_EVENT', no others included

  - [x] 12.7 Write property test for Event Sorting by Date
    - **Property 8: Event Sorting by Date**
    - **Validates: Requirements 14.4**
    - After sorting, adjacent pairs maintain correct date ordering invariant

- [x] 13. DI container and service wiring
  - [x] 13.1 Register new services in DI container
    - Modify `src/di/container.ts` to register: AuthService, GoogleDriveService, OCRService, VoiceEventService
    - Ensure lazy initialization for VoiceEventService and OCRService
    - _Requirements: 17.2_

- [x] 14. UI polish and production hardening
  - [x] 14.1 Apply consistent spacing and touch targets
    - Review all interactive elements across screens for 44x44dp minimum touch targets
    - Apply Spacing constants for consistent padding/margins
    - Use theme color tokens (textPrimary, textSecondary, textMuted, textDisabled) consistently
    - Ensure WCAG AA color contrast (4.5:1 body text, 3:1 large text)
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

  - [x] 14.2 Add loading states and error handling across screens
    - Add ActivityIndicator for async data fetches on all list screens
    - Add user-friendly error messages with retry buttons for network/DB failures
    - Handle edge cases: zero amounts, null dates, missing person names
    - _Requirements: 16.2, 16.3, 16.4_

  - [x] 14.3 Handle modal dismissal and Android back button
    - Ensure all modals are dismissible via Android back button and overlay tap
    - Add exit confirmation on root screen back press
    - Restore state correctly on app background/resume
    - _Requirements: 16.5, 17.3, 17.5_

  - [x] 14.4 Handle permission denials gracefully
    - Show informative permission dialogs for microphone, camera, storage
    - Do not crash when permissions are denied — show fallback UI
    - Voice unavailable → show "Voice unavailable" message with manual entry option
    - Camera denied → inform user, offer gallery-only option
    - _Requirements: 17.4_

  - [x] 14.5 Support dynamic font scaling
    - Use relative font sizes where applicable to support accessibility font scaling
    - _Requirements: 15.5_

  - [x] 14.6 Write property test for Data Persistence Round-Trip
    - **Property 9: Data Persistence Round-Trip**
    - **Validates: Requirements 17.2**
    - For any valid entry/event/person written to SQLite, reading back by ID produces identical field values

- [x] 15. Final checkpoint - Production ready
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The `src/theme/colors.ts` static export remains as fallback for non-component code
- Existing voice infrastructure (`TamilSpeechRecognizer`, `VoiceEntryService`, `TamilEntryParser`) is reused — only new event-specific modules are created
- React Native 0.86 with TypeScript throughout

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1"] },
    { "id": 1, "tasks": ["1.3", "2.2", "2.3"] },
    { "id": 2, "tasks": ["1.4", "2.4", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "4.4", "4.5"] },
    { "id": 4, "tasks": ["4.6", "4.7", "4.8"] },
    { "id": 5, "tasks": ["6.1", "7.1", "9.1"] },
    { "id": 6, "tasks": ["6.2", "7.2", "9.2"] },
    { "id": 7, "tasks": ["7.3", "7.4", "9.3", "10.1"] },
    { "id": 8, "tasks": ["7.5", "9.4", "9.5", "9.6", "9.7", "10.2"] },
    { "id": 9, "tasks": ["10.3", "10.4", "12.1", "12.5"] },
    { "id": 10, "tasks": ["12.2", "12.3", "12.4"] },
    { "id": 11, "tasks": ["12.6", "12.7", "13.1"] },
    { "id": 12, "tasks": ["14.1", "14.2", "14.3", "14.4", "14.5"] },
    { "id": 13, "tasks": ["14.6"] }
  ]
}
```
