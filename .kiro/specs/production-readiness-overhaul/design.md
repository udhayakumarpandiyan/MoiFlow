# Design Document: Production Readiness Overhaul

## Overview

This document describes the architecture and component design for the MoiFlow production-readiness overhaul. The system is a React Native mobile application (TypeScript, React Native 0.86, SQLite, i18next) targeting Android and iOS, used by Tamil communities to track financial exchanges during events.

The overhaul introduces: a global theme system, full i18n (English default), auth gate with OTP registration, profile menu with sign-out, Google Drive backup with family sharing, voice-based event management, invitation upload/OCR/share, and cross-screen production polish.

---

## Architecture

### High-Level Component Diagram

```
App.tsx
├── ThemeProvider (React Context)
│   └── I18nextProvider (react-i18next)
│       └── NavigationContainer
│           └── RootNavigator (Stack)
│               ├── SplashScreen
│               ├── RegistrationScreen → OTPVerificationScreen → SecuritySetupScreen
│               ├── PinLockScreen
│               ├── PatternLockScreen
│               └── MainTabNavigator
│                   ├── DashboardTab
│                   ├── EntriesTab
│                   ├── EventsTab
│                   ├── ReportsTab
│                   └── SettingsTab (Stack)
│                       ├── SettingsScreen
│                       ├── PinSetupScreen
│                       └── PatternSetupScreen
```

### Layer Architecture

```
┌─────────────────────────────────────────────────┐
│  UI Layer (Screens, Components, Modals)         │
│    - Consumes useTheme(), useTranslation()      │
│    - Emits user actions via service calls       │
├─────────────────────────────────────────────────┤
│  Context Layer                                  │
│    - ThemeContext (colors, fonts, spacing)       │
│    - AuthContext (session state, lock status)    │
├─────────────────────────────────────────────────┤
│  Service Layer (Business Logic)                 │
│    - EntryService, EventService, PersonService  │
│    - BackupService, GoogleDriveService          │
│    - VoiceEntryService, VoiceEventService       │
│    - SettingsService, AuthService               │
├─────────────────────────────────────────────────┤
│  Repository Layer (Data Access)                 │
│    - SQLite repositories                        │
│    - AsyncStorage (settings, auth state)        │
├─────────────────────────────────────────────────┤
│  Native Layer                                   │
│    - TamilSpeechRecognizer (Voice)              │
│    - react-native-vision-camera (Camera)        │
│    - ML Kit Text Recognition (OCR)              │
│    - Google Sign-In                             │
└─────────────────────────────────────────────────┘
```

---

## Components

### 1. Theme System

**File:** `src/context/ThemeContext.tsx`

```typescript
import React, { createContext, useContext, useMemo, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { settingsService, Theme } from '../services/SettingsService';

interface ThemeColors {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  primaryBg: string;
  inColor: string;
  inBg: string;
  outColor: string;
  outBg: string;
  background: string;
  surface: string;
  border: string;
  borderLight: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDisabled: string;
  textInverse: string;
  // ... all existing Colors keys
}

interface ThemeContextValue {
  colors: ThemeColors;
  themeName: Theme;
  setTheme: (theme: Theme) => Promise<void>;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useColorScheme();
  const [themeName, setThemeName] = useState<Theme>('system');

  useEffect(() => {
    settingsService.getTheme().then(setThemeName);
  }, []);

  const setTheme = async (theme: Theme) => {
    await settingsService.setTheme(theme);
    setThemeName(theme);
  };

  const resolvedTheme = useMemo(() => resolveTheme(themeName, systemScheme), [themeName, systemScheme]);

  return (
    <ThemeContext.Provider value={{ colors: resolvedTheme.colors, themeName, setTheme, isDark: resolvedTheme.isDark }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
```

**Theme Palettes:** Each theme (light, dark, ocean, forest, sunset) defines a complete `ThemeColors` object. The `system` option delegates to light/dark based on `useColorScheme()`.

**Migration Strategy:** All screens currently import `Colors` from `src/theme/colors.ts`. They will be updated to `const { colors } = useTheme()`. The static `Colors` export remains as the light-theme default for any non-component code (e.g., services that need a fallback).

---

### 2. Internationalization (i18n)

**Existing:** `src/i18n/index.ts` already initializes i18next with `en.ts` and `ta.ts` translation objects.

**Changes:**
- Default language changed from `'ta'` to `'en'` in `src/i18n/index.ts`
- Expand `en.ts` and `ta.ts` to cover all user-facing strings (auth screens, profile menu, OTP, security setup, backup, OCR, family sharing)
- All hardcoded Tamil strings in components replaced with `t('key')` calls

**File Structure (unchanged):**
```
src/i18n/
├── index.ts     # i18next init, default 'en'
├── en.ts        # English translations (complete)
└── ta.ts        # Tamil translations (complete)
```

**Usage in components:**
```typescript
import { useTranslation } from 'react-i18next';

const MyComponent = () => {
  const { t } = useTranslation();
  return <Text>{t('events.title')}</Text>;
};
```

---

### 3. Authentication Flow

#### 3.1 Auth State Machine

```
┌──────────┐   not registered    ┌────────────────┐
│  Splash  │ ──────────────────► │  Registration  │
│  Screen  │                     │    Screen      │
└────┬─────┘                     └───────┬────────┘
     │ registered + security              │ OTP verified
     │                                    ▼
     │                           ┌────────────────┐
     │                           │  OTP Verify    │
     │                           │    Screen      │
     │                           └───────┬────────┘
     │                                    │ correct OTP
     │                                    ▼
     │                           ┌────────────────┐
     │                           │ Security Setup │
     │                           │ (PIN/Pattern)  │
     │                           └───────┬────────┘
     │                                    │ setup complete
     ▼                                    ▼
┌──────────┐   authenticated     ┌────────────────┐
│ Auth Gate│ ──────────────────► │   Main Tab     │
│(Pin/Pat) │                     │   Navigator    │
└──────────┘                     └────────────────┘
                                          │
                                          │ sign out
                                          ▼
                                 ┌────────────────┐
                                 │   Auth Gate    │
                                 │   (re-login)   │
                                 └────────────────┘
```

#### 3.2 AuthService

**File:** `src/services/AuthService.ts`

```typescript
export interface AuthState {
  isRegistered: boolean;
  securityMethod: 'pin' | 'pattern' | null;
  isSessionActive: boolean;
  failedAttempts: number;
  lockoutUntil: number | null; // timestamp
}

export class AuthService {
  async getAuthState(): Promise<AuthState>;
  async completeRegistration(name: string, phone: string): Promise<void>;
  async setupSecurity(method: 'pin' | 'pattern', credential: string): Promise<void>;
  async verifyPin(pin: string): Promise<boolean>;
  async verifyPattern(pattern: string): Promise<boolean>;
  async signOut(): Promise<void>;
  async recordFailedAttempt(): Promise<{ locked: boolean; lockoutSeconds: number }>;
  async resetFailedAttempts(): Promise<void>;
}
```

**Lockout Logic:** After 3 consecutive failures, set `lockoutUntil = Date.now() + 30_000`. UI polls or uses a countdown timer. Failures are stored in AsyncStorage under `auth.failed_attempts` and `auth.lockout_until`.

#### 3.3 OTP Verification

**File:** `src/screens/OTPVerificationScreen.tsx`

The OTP is generated locally (6-digit random) and displayed in a developer alert (`__DEV__` mode alert). In production, this would integrate with an SMS gateway. For now, the OTP is shown to the user for testing.

```typescript
const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};
```

#### 3.4 Security Setup Screen

**File:** `src/screens/SecuritySetupScreen.tsx`

Offers two options: mPIN (4-digit) or Pattern Lock. No biometric option is presented. On completion, stores the hashed credential via `SettingsService` and marks registration complete.

---

### 4. Profile Menu

**File:** `src/components/ProfileMenu.tsx`

```typescript
interface ProfileMenuProps {
  onSignOut: () => void;
}

const ProfileMenu: React.FC<ProfileMenuProps> = ({ onSignOut }) => {
  const [visible, setVisible] = useState(false);
  // Renders a small avatar icon (top-right header)
  // On press: toggles dropdown with "Sign Out" option
  // Sign Out calls authService.signOut() then navigates to Auth Gate
};
```

**Integration:** Added to `MainTabNavigator`'s `screenOptions.headerRight` so it appears on all tabs.

---

### 5. Backup & Google Drive Integration

#### 5.1 GoogleDriveService

**File:** `src/services/GoogleDriveService.ts`

```typescript
import { GoogleSignin } from '@react-native-google-signin/google-signin';

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  size: number;
}

export class GoogleDriveService {
  async signIn(): Promise<string>; // returns access token
  async signOut(): Promise<void>;
  async uploadFile(localPath: string, fileName: string): Promise<DriveFile>;
  async listBackups(): Promise<DriveFile[]>;
  async downloadFile(fileId: string, localPath: string): Promise<void>;
  async shareFile(fileId: string, email: string): Promise<void>;
}
```

**Implementation:** Uses Google Drive REST API v3 via `fetch` with the OAuth2 token from `@react-native-google-signin/google-signin`. Files are stored in a dedicated `MoiFlow_Backups` folder on the user's Drive.

#### 5.2 Enhanced BackupService

The existing `BackupService` is extended:

```typescript
export class BackupService {
  // Existing local methods remain
  async exportBackup(): Promise<BackupResult>;
  async listBackups(): Promise<RNFS.ReadDirItem[]>;
  async restoreBackup(filePath: string): Promise<RestoreResult>;

  // New cloud methods
  async backupToGoogleDrive(): Promise<BackupResult>;
  async listCloudBackups(): Promise<DriveFile[]>;
  async restoreFromGoogleDrive(fileId: string): Promise<RestoreResult>;
  async scheduleAutoBackup(interval: BackupInterval): Promise<void>;
  async shareWithFamily(email: string): Promise<void>;
}
```

#### 5.3 Family Sharing

When family sharing is enabled, the user configures a target (Google Drive email or WhatsApp number). On each backup (manual or auto), the system:
1. Uploads to Google Drive
2. Shares the file with the configured email (Drive sharing) OR generates a download link for WhatsApp sharing via the system Share API

---

### 6. Voice Event Service

#### 6.1 VoiceEventService

**File:** `src/voice/VoiceEventService.ts`

```typescript
import { TamilSpeechRecognizer } from './TamilSpeechRecognizer';
import { TamilEventParser } from './TamilEventParser';
import { parseVoiceEvent } from '../api/NLUApi';

export interface ParsedVoiceEvent {
  eventName: string | null;
  eventType: string | null;
  date: string | null;
  venue: string | null;
  confidence: number;
}

export class VoiceEventService {
  private _recognizer: TamilSpeechRecognizer | null = null;
  private readonly localParser = new TamilEventParser();

  private get recognizer(): TamilSpeechRecognizer { /* lazy init */ }

  async startListening(onText: (text: string) => void): Promise<void>;
  async stopListening(): Promise<void>;
  async parse(text: string): Promise<ParsedVoiceEvent>;
  destroy(): void;
}
```

Follows the same pattern as `VoiceEntryService`: backend first, local fallback with 0.7 confidence multiplier.

#### 6.2 TamilEventParser (Local Fallback)

**File:** `src/voice/TamilEventParser.ts`

```typescript
export class TamilEventParser {
  parse(text: string): ParsedVoiceEvent {
    // Regex-based extraction:
    // - Event type keywords: திருமணம், காதணி, பிறந்தநாள், etc.
    // - Date patterns: Tamil month names, numeric dates
    // - Venue keywords: after "இடம்" or "ஹால்"
    // - Event name: remaining proper nouns
  }
}
```

#### 6.3 Voice Event Modal

**File:** `src/features/events/VoiceEventModal.tsx`

A modal that:
1. Shows a mic icon/animation while recording
2. Displays recognized text
3. Shows parsed fields (event name, type, date, venue)
4. Allows user to edit before confirming
5. On confirm, pre-fills the AddEditEvent form

---

### 7. Invitation Upload/OCR/Share

#### 7.1 OCR Module

**File:** `src/services/OCRService.ts`

```typescript
export interface OCRResult {
  rawText: string;
  eventName: string | null;
  date: string | null;
  venue: string | null;
  confidence: number;
}

export class OCRService {
  async processImage(imagePath: string): Promise<OCRResult>;
}
```

**Implementation:** Uses `@react-native-ml-kit/text-recognition` for on-device text recognition. Extracted text is post-processed with regex to identify event details (Tamil event keywords, date patterns, venue indicators).

#### 7.2 Image Capture Flow

1. User taps "Upload Invitation" → Action sheet (Camera / Gallery)
2. Camera: `react-native-vision-camera` (already a dependency) captures photo
3. Gallery: `react-native-vision-camera` or platform image picker
4. Image saved to `${RNFS.DocumentDirectoryPath}/MoiFlow/invitations/{eventId}/`
5. OCR processes image → pre-fills event form
6. If OCR fails (confidence < 0.3): show "manual entry" fallback

#### 7.3 Share Invitation

Uses React Native's built-in `Share` API:
```typescript
import { Share } from 'react-native';
await Share.share({ url: imagePath, title: eventName });
```

---

### 8. Navigation Structure

**Updated RootNavigator:**

```typescript
const Stack = createNativeStackNavigator();

const RootNavigator = () => (
  <NavigationContainer>
    <Stack.Navigator initialRouteName="Splash" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Registration" component={RegistrationScreen} />
      <Stack.Screen name="OTPVerification" component={OTPVerificationScreen} />
      <Stack.Screen name="SecuritySetup" component={SecuritySetupScreen} />
      <Stack.Screen name="PinLock" component={PinLockScreen} />
      <Stack.Screen name="PatternLock" component={PatternLockScreen} />
      <Stack.Screen name="MainTab" component={MainTabNavigator} />
    </Stack.Navigator>
  </NavigationContainer>
);
```

---

## Interfaces

### AuthService Interface

```typescript
interface IAuthService {
  getAuthState(): Promise<AuthState>;
  completeRegistration(name: string, phone: string): Promise<void>;
  setupSecurity(method: 'pin' | 'pattern', credential: string): Promise<void>;
  verifyPin(pin: string): Promise<boolean>;
  verifyPattern(pattern: string): Promise<boolean>;
  signOut(): Promise<void>;
  recordFailedAttempt(): Promise<{ locked: boolean; lockoutSeconds: number }>;
  resetFailedAttempts(): Promise<void>;
}
```

### GoogleDriveService Interface

```typescript
interface IGoogleDriveService {
  signIn(): Promise<string>;
  signOut(): Promise<void>;
  uploadFile(localPath: string, fileName: string): Promise<DriveFile>;
  listBackups(): Promise<DriveFile[]>;
  downloadFile(fileId: string, localPath: string): Promise<void>;
  shareFile(fileId: string, email: string): Promise<void>;
}
```

### VoiceEventService Interface

```typescript
interface IVoiceEventService {
  startListening(onText: (text: string) => void): Promise<void>;
  stopListening(): Promise<void>;
  parse(text: string): Promise<ParsedVoiceEvent>;
  destroy(): void;
}
```

### OCRService Interface

```typescript
interface IOCRService {
  processImage(imagePath: string): Promise<OCRResult>;
}
```

### ThemeContext Interface

```typescript
interface IThemeContext {
  colors: ThemeColors;
  themeName: Theme;
  setTheme: (theme: Theme) => Promise<void>;
  isDark: boolean;
}
```

---

## Data Models

### AuthState

```typescript
interface AuthState {
  isRegistered: boolean;
  securityMethod: 'pin' | 'pattern' | null;
  isSessionActive: boolean;
  failedAttempts: number;
  lockoutUntil: number | null;
}
```

Storage keys (AsyncStorage):
- `app.registered` — 'true' when registered
- `auth.session_active` — 'true' when session is active
- `auth.failed_attempts` — number as string
- `auth.lockout_until` — ISO timestamp or null
- `settings.pin_hash` — hashed PIN
- `settings.pattern_lock` — hashed pattern

### ParsedVoiceEvent

```typescript
interface ParsedVoiceEvent {
  eventName: string | null;
  eventType: string | null;  // maps to EVENT_TYPE keys
  date: string | null;       // ISO date string
  venue: string | null;
  confidence: number;        // 0.0 to 1.0
}
```

### OCRResult

```typescript
interface OCRResult {
  rawText: string;
  eventName: string | null;
  date: string | null;
  venue: string | null;
  confidence: number;
}
```

### DriveFile

```typescript
interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  size: number;
}
```

### BackupPayload (extended)

```typescript
interface BackupPayload {
  version: number;
  exportedAt: string;
  appVersion: string;
  data: {
    entries: Record<string, unknown>[];
    events: Record<string, unknown>[];
    persons: Record<string, unknown>[];
    villages: Record<string, unknown>[];
    settings: Record<string, string>[];
  };
}
```

---

## Error Handling

### Strategy by Layer

| Layer | Strategy |
|-------|----------|
| UI | Display `t('common.error')` toast/alert with retry button. Loading states via ActivityIndicator. |
| Service | Try/catch with typed error returns. Network errors → fallback or retry. |
| Repository | SQL errors caught, logged, re-thrown as domain errors. |
| Native | Permission denial → informative dialog. Native module null → graceful degradation. |

### Specific Error Scenarios

1. **Google Sign-In failure:** Display error alert with "Retry" and "Cancel" buttons. Do not block other app functionality.

2. **Voice recognition native module unavailable:** `TamilSpeechRecognizer.getNativeVoice()` throws → `VoiceEventService` catches → shows "Voice unavailable" message → offers manual entry.

3. **OCR failure:** Low confidence (< 0.3) → show "Could not extract details" → allow full manual entry.

4. **Auth lockout:** After 3 failed attempts → disable input for 30 seconds → show countdown → reset attempts after successful verification.

5. **Database corruption:** `BackupService.restoreBackup()` wraps restore in transaction. On failure → rollback → show error → suggest re-download.

6. **Network timeout (NLU backend):** 5-second timeout on fetch → fall back to local parser → confidence × 0.7.

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/context/ThemeContext.tsx` | Theme provider + useTheme hook |
| `src/services/AuthService.ts` | Authentication state management |
| `src/services/GoogleDriveService.ts` | Google Drive upload/download/share |
| `src/services/OCRService.ts` | ML Kit text recognition wrapper |
| `src/screens/OTPVerificationScreen.tsx` | OTP entry + verification |
| `src/screens/SecuritySetupScreen.tsx` | PIN/Pattern choice + setup |
| `src/components/ProfileMenu.tsx` | Header profile icon + dropdown |
| `src/voice/VoiceEventService.ts` | Voice → event parsing orchestrator |
| `src/voice/TamilEventParser.ts` | Local regex Tamil event parser |
| `src/features/events/VoiceEventModal.tsx` | Voice event recording modal |
| `src/types/ParsedVoiceEvent.ts` | Type definition for voice event results |

## Files to Modify

| File | Changes |
|------|---------|
| `App.tsx` | Wrap with ThemeProvider |
| `src/i18n/index.ts` | Change default language to 'en' |
| `src/i18n/en.ts` | Add auth, profile, backup, OCR, family sharing keys |
| `src/i18n/ta.ts` | Add matching Tamil translations |
| `src/navigation/RootNavigator.tsx` | Add OTPVerification, SecuritySetup routes |
| `src/navigation/MainTabNavigator.tsx` | Add ProfileMenu to header |
| `src/screens/SplashScreen.tsx` | Use i18n + theme, updated auth flow routing |
| `src/screens/RegistrationScreen.tsx` | OTP flow, i18n, theme |
| `src/services/BackupService.ts` | Add Google Drive methods, family sharing |
| `src/services/SettingsService.ts` | Add auth-related getters |
| `src/features/events/Events.tsx` | i18n, theme, voice event button integration |
| `src/features/entries/*.tsx` | i18n, theme hooks |
| `src/features/dashboard/Dashboard.tsx` | i18n, theme hooks |
| `src/di/container.ts` | Add authService, googleDriveService, ocrService, voiceEventService |
| `package.json` | Add @react-native-google-signin/google-signin, @react-native-ml-kit/text-recognition |

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Navigation Routing Correctness

*For any* combination of authentication state (isRegistered, securityMethod, isSessionActive, pinHash, patternLock), the SplashScreen boot logic SHALL route to exactly one correct destination: RegistrationScreen (when not registered), PinLockScreen (when registered with PIN security), PatternLockScreen (when registered with pattern security), or MainTab (when registered without security).

**Validates: Requirements 1.3, 3.1, 3.2, 5.1**

### Property 2: Translation Key Completeness

*For all* translation keys defined in `en.ts`, a corresponding key with a non-empty string value SHALL exist in `ta.ts`, and vice versa — ensuring no translation gaps between languages.

**Validates: Requirements 6.2, 12.1**

### Property 3: Settings Persistence Round-Trip

*For any* valid settings value (language ∈ {'en', 'ta'}, theme ∈ {'system', 'light', 'dark', 'ocean', 'forest', 'sunset'}, backupInterval ∈ {'daily', 'weekly', 'monthly'}), writing the value via SettingsService and then reading it back SHALL produce an identical value.

**Validates: Requirements 6.4, 7.3**

### Property 4: Voice Result to Form Field Mapping

*For any* valid ParsedVoiceEvent or VoiceEntryResult object, mapping it to form fields SHALL preserve all non-null field values — specifically, if a parsed field is non-null, the corresponding form field SHALL contain that exact value.

**Validates: Requirements 10.4, 13.3**

### Property 5: Local Fallback Confidence Multiplier

*For any* text input parsed by the local TamilEntryParser or TamilEventParser, when the NLU backend is unreachable, the returned confidence value SHALL equal the local parser's confidence multiplied by 0.7.

**Validates: Requirements 13.4, 10.3**

### Property 6: Local Voice Parser Resilience

*For any* non-empty string input, the local TamilEntryParser.parse() and TamilEventParser.parse() SHALL return a valid result object without throwing an exception — ensuring graceful degradation when the backend is unavailable.

**Validates: Requirements 10.3, 13.4**

### Property 7: MY_EVENT Filter Correctness

*For any* list of events with mixed ownerType values, applying the MY_EVENT filter SHALL return a list where every event has ownerType === 'MY_EVENT' and no events with other ownerType values are included.

**Validates: Requirements 14.1**

### Property 8: Event Sorting by Date

*For any* list of events with date fields, after applying the date sort (upcoming filter: ascending; past filter: descending), for all adjacent pairs (event[i], event[i+1]), the date ordering invariant SHALL hold: event[i].date <= event[i+1].date for ascending, event[i].date >= event[i+1].date for descending.

**Validates: Requirements 14.4**

### Property 9: Data Persistence Round-Trip

*For any* valid entry, event, or person object written to the SQLite database via the respective repository, reading that record back by its ID SHALL produce an object with identical field values (within type coercion boundaries of SQLite — e.g., booleans stored as integers).

**Validates: Requirements 17.2**

---

## Dependencies (New)

| Package | Purpose | Version |
|---------|---------|---------|
| `@react-native-google-signin/google-signin` | Google OAuth for Drive access | ^13.0.0 |
| `@react-native-ml-kit/text-recognition` | On-device OCR | ^1.0.0 |

All existing dependencies (`react-native-vision-camera`, `@react-native-voice/voice`, `react-native-fs`, `react-native-sqlite-storage`, `i18next`, `react-i18next`) are reused without version changes.

---

## Security Considerations

1. **PIN/Pattern Storage:** Credentials are stored as one-way hashes (SHA-256) in AsyncStorage. Raw values are never persisted.
2. **Session Management:** `auth.session_active` is cleared on sign-out. The flag is checked on app resume.
3. **Google OAuth Tokens:** Managed by `@react-native-google-signin/google-signin`; tokens are stored in the platform's secure credential store, not in AsyncStorage.
4. **Backup Encryption:** Future consideration. Current version stores backups as plaintext JSON on Google Drive (user's own account).

---

## Performance Considerations

1. **Theme re-renders:** `useMemo` on the resolved theme object prevents unnecessary re-renders when the theme hasn't changed.
2. **i18n initialization:** Synchronous init with bundled translation objects — no network delay.
3. **Splash cold start:** Target < 2 seconds. DB init is the bottleneck; already optimized with `initDB()` on first call only.
4. **Voice recognition:** Lazy initialization of `TamilSpeechRecognizer` avoids native module resolution during app boot.
5. **OCR processing:** Runs on a background thread via ML Kit's native implementation — does not block UI.
