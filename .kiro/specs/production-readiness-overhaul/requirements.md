# Requirements Document

## Introduction

This specification covers the complete production-readiness overhaul of the MoiFlow React Native application. MoiFlow is a Tamil community event finance tracker that records monetary and gold exchanges (moi) between persons during events such as weddings, ear-piercings, and housewarmings. The overhaul spans authentication, internationalization, theming, backup/restore, voice features, invitation management, UI polish, and overall production quality across all screens.

## Glossary

- **App**: The MoiFlow React Native mobile application
- **User**: The person who has registered and uses the App
- **Splash_Screen**: The initial branded screen shown during app launch
- **Registration_Screen**: The screen where new users register with OTP verification
- **Auth_Gate**: The security checkpoint that verifies identity (mPIN or Pattern) before granting app access
- **Profile_Menu**: The profile icon and associated menu in the header area
- **Settings_Screen**: The screen for configuring app preferences
- **Entries_Screen**: The screen listing financial entries (IN/OUT) grouped by person or event
- **Events_Screen**: The screen listing own and others' events
- **Theme_Context**: A React Context provider that propagates the selected theme globally
- **Backup_Service**: The module responsible for exporting/importing app data to/from Google Drive
- **Voice_Service**: The module orchestrating Tamil speech recognition and NLU parsing (backend + local fallback)
- **OCR_Module**: The component that performs text recognition on invitation images
- **i18n_System**: The internationalization framework (i18next + react-i18next) providing Tamil and English translations
- **OTP_Verifier**: The local module that generates and verifies a 6-digit OTP for registration
- **Family_Member**: A trusted person with whom the User shares backup access via WhatsApp or Google Drive

## Requirements

### Requirement 1: Professional Splash Screen

**User Story:** As a User, I want to see a professional finance-themed splash screen with app branding when I launch the app, so that I have confidence in the quality of the application.

#### Acceptance Criteria

1. WHEN the App is launched, THE Splash_Screen SHALL display the MoiFlow logo, app name, and a finance-themed visual within 500ms of launch.
2. THE Splash_Screen SHALL display a loading indicator while initial data and authentication state are resolved.
3. WHEN initial loading completes, THE Splash_Screen SHALL navigate to the appropriate next screen (Registration_Screen for new users or Auth_Gate for returning users).

---

### Requirement 2: OTP Registration and Security Setup

**User Story:** As a new User, I want to verify my identity via OTP and set up a security method during registration, so that my financial data is protected from the start.

#### Acceptance Criteria

1. WHEN a new User opens the App for the first time, THE Registration_Screen SHALL prompt for a phone number and generate a local 6-digit OTP.
2. WHEN the OTP is generated, THE OTP_Verifier SHALL display the generated OTP in a developer alert for testing purposes.
3. WHEN the User enters the correct OTP, THE Registration_Screen SHALL navigate to a security method selection screen offering mPIN (4-digit) or Pattern Lock only.
4. THE Registration_Screen SHALL NOT offer fingerprint or biometric authentication as a security option.
5. WHEN the User completes security method setup, THE App SHALL apply the default theme and navigate to the main application.

---

### Requirement 3: Auth Gate Enforcement

**User Story:** As a User, I want the app to require authentication before granting access, so that unauthorized persons cannot view my financial data.

#### Acceptance Criteria

1. THE Auth_Gate SHALL prevent access to any main application screen until the User successfully completes mPIN or Pattern verification.
2. WHEN registration and security setup are incomplete, THE App SHALL redirect the User to the Registration_Screen.
3. IF the User enters an incorrect mPIN or Pattern three consecutive times, THEN THE Auth_Gate SHALL display a 30-second lockout message before allowing retry.

---

### Requirement 4: Profile Menu with Sign-Out

**User Story:** As a User, I want a profile icon in the header that lets me sign out, so that I can secure my session when handing my device to others.

#### Acceptance Criteria

1. THE App SHALL display a profile icon in the top-right area of the main header on all tab screens.
2. WHEN the User taps the profile icon, THE Profile_Menu SHALL display a dropdown with a "Sign Out" option.
3. WHEN the User selects "Sign Out", THE App SHALL clear the active session and navigate to the Auth_Gate screen.

---

### Requirement 5: Re-Login After Sign-Out

**User Story:** As a User who has signed out, I want to re-authenticate using mPIN or Pattern, so that I can resume using the app securely.

#### Acceptance Criteria

1. WHEN a signed-out User opens the App, THE Auth_Gate SHALL prompt for mPIN or Pattern verification based on the previously configured security method.
2. THE Auth_Gate SHALL NOT offer fingerprint or biometric authentication during re-login.
3. WHEN the User provides the correct mPIN or Pattern, THE App SHALL navigate to the main tab screen.

---

### Requirement 6: Full Internationalization (Tamil + English)

**User Story:** As a User, I want all app text to be available in Tamil and English with English as the default, so that I can use the app in my preferred language.

#### Acceptance Criteria

1. THE i18n_System SHALL default to English language on fresh installation.
2. THE i18n_System SHALL provide complete translations for all user-facing text in both Tamil and English.
3. WHEN the User changes the language in the Settings_Screen, THE i18n_System SHALL apply the new language to all screens immediately without requiring an app restart.
4. THE App SHALL persist the selected language preference across app restarts.

---

### Requirement 7: Global Theme Application

**User Story:** As a User, I want my selected theme to apply consistently across all screens, so that the visual experience is cohesive.

#### Acceptance Criteria

1. THE Theme_Context SHALL propagate the active theme (system, light, dark, ocean, forest, sunset) to all components in the application.
2. WHEN the User changes the theme in the Settings_Screen, THE Theme_Context SHALL re-render all visible components with updated colors within the same navigation session.
3. THE App SHALL persist the selected theme preference and restore it on subsequent launches.

---

### Requirement 8: Production-Ready Settings (Backup and Family Sharing)

**User Story:** As a User, I want to back up my data to Google Drive and share access with family members, so that my financial records are safe and accessible to trusted persons.

#### Acceptance Criteria

1. WHEN the User taps "Backup Now" in Settings_Screen, THE Backup_Service SHALL authenticate with Google Sign-In and upload the full database export as a JSON file to the User's Google Drive.
2. IF Google Sign-In authentication fails, THEN THE Backup_Service SHALL display an error message with a retry option.
3. WHILE auto-backup is enabled, THE Backup_Service SHALL perform a backup at the configured interval (daily, weekly, or monthly).
4. WHEN the User enables family member access, THE App SHALL allow the User to configure a sharing target (WhatsApp or Google Drive link).
5. WHILE family member access is enabled, THE Backup_Service SHALL share the latest backup file to the configured family member at each backup interval.
6. WHEN the User taps restore, THE Backup_Service SHALL list available backup files from Google Drive and allow selection for restoration.

---

### Requirement 9: Copyright and App Information

**User Story:** As a User, I want to see proper copyright and app details in Settings, so that I know the app is legitimate and maintained.

#### Acceptance Criteria

1. THE Settings_Screen SHALL display the application name as "MoiFlow", the current version number, and a copyright notice with the current year.
2. THE Settings_Screen SHALL provide a link to the privacy policy page.
3. THE Settings_Screen SHALL display developer or organization attribution information.

---

### Requirement 10: Voice-Based Event Addition and Editing

**User Story:** As a User, I want to add or edit events using Tamil voice commands, so that I can manage events hands-free.

#### Acceptance Criteria

1. WHEN the User taps the voice button on the Events_Screen, THE Voice_Service SHALL start Tamil speech recognition and capture the spoken text.
2. WHEN speech recognition completes, THE Voice_Service SHALL send the recognized text to the Python FastAPI backend for NLU parsing.
3. IF the backend is unreachable, THEN THE Voice_Service SHALL fall back to the local TamilEntryParser for parsing event details.
4. WHEN parsing succeeds, THE Events_Screen SHALL pre-fill the Add/Edit Event form with the extracted event name, type, date, and venue.
5. THE Events_Screen SHALL allow the User to review and correct pre-filled values before saving.

---

### Requirement 11: Upload and Share Invitation

**User Story:** As a User, I want to upload an invitation image (from camera or gallery) and share it, so that I can digitize event details and inform others.

#### Acceptance Criteria

1. WHEN the User taps "Upload Invitation" for an event, THE App SHALL present options to capture a photo via camera (react-native-vision-camera) or select from gallery.
2. WHEN an image is selected, THE OCR_Module SHALL perform text recognition on the image and extract event details (name, date, venue).
3. WHEN OCR processing completes, THE App SHALL pre-fill event fields with extracted text and allow the User to manually correct any errors.
4. IF OCR fails or produces low-confidence results, THEN THE App SHALL display "OCR processing" status and allow full manual entry.
5. WHEN the User taps "Share Invitation" for an event, THE App SHALL open the system share sheet with the invitation image attached.

---

### Requirement 12: Complete Text Localization

**User Story:** As a User, I want every piece of text in the app to be properly localized, so that no untranslated strings appear in my chosen language.

#### Acceptance Criteria

1. THE i18n_System SHALL provide translations for all button labels, headers, placeholders, error messages, alert titles, and alert messages in both Tamil and English.
2. THE App SHALL NOT display hardcoded Tamil or English strings that bypass the i18n_System.
3. WHEN a new screen or component is added, THE i18n_System SHALL include translations for all user-facing text in that component.

---

### Requirement 13: Voice Entry Search and Voice Entry Addition/Editing

**User Story:** As a User, I want to search entries and add/edit entries using Tamil voice input, so that I can operate the app efficiently without typing.

#### Acceptance Criteria

1. WHEN the User taps the voice search icon on the Entries_Screen, THE Voice_Service SHALL start Tamil speech recognition and set the recognized text as the search query.
2. WHEN the User opens the Voice Entry modal, THE Voice_Service SHALL capture speech input and parse it into entry fields (person name, direction, cash amount, gold weight).
3. WHEN voice parsing completes via the backend, THE App SHALL pre-fill the Add/Edit Entry form with parsed values.
4. IF the backend is unreachable, THEN THE Voice_Service SHALL use the local TamilEntryParser and apply a 0.7 confidence multiplier to the result.
5. THE App SHALL allow the User to review and correct all voice-parsed fields before saving.

---

### Requirement 14: Own Events Listing (MY_EVENT Filter)

**User Story:** As a User, I want my own events to be listed properly with the MY_EVENT filter, so that I can quickly access events I host.

#### Acceptance Criteria

1. WHEN the User selects the "என் நிகழ்வுகள்" (My Events) tab on the Events_Screen, THE Events_Screen SHALL display only events with ownerType equal to "MY_EVENT".
2. THE Events_Screen SHALL display a maximum of 5 own events and prevent creation of additional own events beyond this limit.
3. WHEN the User has no own events, THE Events_Screen SHALL display an empty state with a prompt to create an event.
4. THE Events_Screen SHALL sort own events by date (upcoming first for the upcoming filter, most recent first for the past filter).

---

### Requirement 15: UI Quality (Text Colors, Spacing, Accessibility)

**User Story:** As a User, I want text to be clearly readable with proper colors and spacing, so that I can use the app comfortably.

#### Acceptance Criteria

1. THE App SHALL use the defined Colors theme tokens (textPrimary, textSecondary, textMuted, textDisabled) consistently across all text elements.
2. THE App SHALL maintain minimum touch target sizes of 44x44 density-independent pixels for all interactive elements.
3. THE App SHALL provide sufficient color contrast (WCAG AA level, minimum 4.5:1 ratio for body text, 3:1 for large text) between text and background.
4. THE App SHALL use the Spacing constants from the theme for consistent padding and margins across all screens.
5. THE App SHALL support dynamic font scaling by using relative font sizes where applicable.

---

### Requirement 16: Cross-Screen Flaw Identification and Resolution

**User Story:** As a User, I want all screens to function correctly without visual or functional errors, so that I have a reliable experience.

#### Acceptance Criteria

1. THE App SHALL handle empty states gracefully on all list screens (Entries, Events, Dashboard) by displaying informative messages and action prompts.
2. THE App SHALL handle loading states with activity indicators on all screens that fetch data asynchronously.
3. IF a network request or database query fails, THEN THE App SHALL display a user-friendly error message with a retry option.
4. THE App SHALL handle edge cases in data formatting (zero amounts, null dates, missing person names) without rendering errors or crashes.
5. THE App SHALL ensure all modal overlays are dismissible via back button (Android) and overlay tap.

---

### Requirement 17: Overall Production Readiness

**User Story:** As a User, I want the app to be polished and production-quality, so that I can rely on it for real financial record-keeping.

#### Acceptance Criteria

1. THE App SHALL complete a cold start and display the Splash_Screen within 2 seconds on mid-range Android devices.
2. THE App SHALL persist all user data (entries, events, persons, settings) in the local SQLite database reliably across app restarts.
3. THE App SHALL handle the Android back button correctly on all screens (close modals, navigate back, or confirm exit from the root screen).
4. THE App SHALL not crash when permissions (microphone, camera, storage) are denied, and SHALL display informative permission request dialogs.
5. WHEN the App is backgrounded and resumed, THE App SHALL restore its state without data loss or navigation corruption.
6. THE App SHALL use exact or pinned dependency versions for all production packages to ensure reproducible builds.
