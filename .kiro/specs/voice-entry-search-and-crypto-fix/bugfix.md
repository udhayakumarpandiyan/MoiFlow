# Bugfix Requirements Document

## Introduction

This document covers four inter-related issues in the MoiFlow React Native app:

1. **UUID/Crypto runtime crash** — `uuid` v14 requires the Web Crypto API (`crypto.getRandomValues`) which does not exist in React Native's JS environment. Every call to `uuidv4()` crashes the app at runtime, making it impossible to create any entry, event, or sync queue item.

2. **`CreateEntryInput` type mismatch** — `personId` is typed as a required `string` in `CreateEntryInput`, but `AddEditEntryModal` never provides it (the service resolves it via `personRepo.findOrCreate`). This produces a TypeScript compile error. Additionally, `villageName` is typed inconsistently between `CreateEntryInput` and `Entry`.

3. **Voice-based entry addition** — All voice infrastructure (`TamilSpeechRecognizer`, `TamilEntryParser`, `VoiceEntryService`) exists in `src/voice/` but there is no UI. Users cannot add entries by speaking.

4. **Voice-based search** — `SearchBar` has no microphone button. Users cannot search entries by speaking.

---

## Bug Analysis

### Current Behavior (Defect)

**Issue 1 — UUID/Crypto crash**

1.1 WHEN `entryService.addEntry()` is called THEN the system crashes with `TypeError: crypto.getRandomValues is not a function` before any entry is saved

1.2 WHEN `eventService.createEvent()` is called THEN the system crashes with `TypeError: crypto.getRandomValues is not a function` before any event is saved

1.3 WHEN any sync queue operation executes THEN the system crashes with `TypeError: crypto.getRandomValues is not a function` because `SyncQueueService` also calls `uuidv4()`

**Issue 2 — `CreateEntryInput` type mismatch**

1.4 WHEN TypeScript compiles `AddEditEntryModal.tsx` THEN the compiler reports an error because `personId` (required in `CreateEntryInput`) is not supplied by the modal

1.5 WHEN TypeScript compiles code that assigns `Entry.villageName` THEN type inconsistencies arise because `villageName` is `string` (required) in `CreateEntryInput` but `string | undefined` (optional) in `Entry`

**Issue 3 — No voice entry UI**

1.6 WHEN a user wants to add an entry by speaking in Tamil THEN the system provides no mechanism to do so, despite the voice infrastructure being present in `src/voice/`

1.7 WHEN the `Entries` screen is open THEN there is no voice entry trigger — only the FAB for manual form entry

**Issue 4 — No voice search**

1.8 WHEN a user wants to search entries by speaking in Tamil THEN the system provides no mechanism to do so

1.9 WHEN the `SearchBar` component is rendered THEN it shows no microphone button and accepts no `onVoiceSearch` prop

---

### Expected Behavior (Correct)

**Issue 1 — UUID/Crypto crash**

2.1 WHEN `entryService.addEntry()` is called THEN the system SHALL generate a valid UUID without crashing, by polyfilling `crypto.getRandomValues` via `react-native-get-random-values` imported at the app entry point

2.2 WHEN `eventService.createEvent()` is called THEN the system SHALL generate a valid UUID without crashing

2.3 WHEN any sync queue operation executes THEN the system SHALL generate a valid UUID without crashing

**Issue 2 — `CreateEntryInput` type mismatch**

2.4 WHEN `AddEditEntryModal` builds a `CreateEntryInput` object THEN the system SHALL compile without error because `personId` is optional in `CreateEntryInput` (resolved internally by `EntryService.addEntry` via `personRepo.findOrCreate`)

2.5 WHEN code assigns `villageName` across `CreateEntryInput` and `Entry` THEN the system SHALL compile without error because both types SHALL declare `villageName` as `string | undefined` (optional)

**Issue 3 — Voice entry UI**

2.6 WHEN a user taps the voice entry button on the `Entries` screen THEN the system SHALL open a `VoiceEntryModal` that activates `TamilSpeechRecognizer` and displays the microphone state

2.7 WHEN `TamilSpeechRecognizer` returns a result THEN the system SHALL display the recognized Tamil text in `VoiceEntryModal` and parse it via `TamilEntryParser`

2.8 WHEN `TamilEntryParser` produces a parsed result THEN the system SHALL pre-fill `AddEditEntryModal` with `personName`, `cashAmount`, `goldWeight`, and the inferred `entryType` derived from the `direction` field

2.9 WHEN the user reviews the pre-filled form and taps save THEN the system SHALL save the entry through the existing `entryService.addEntry()` flow

2.10 WHEN `TamilSpeechRecognizer` reports an error THEN the system SHALL display an error message in Tamil within `VoiceEntryModal` without crashing

**Issue 4 — Voice search**

2.11 WHEN `SearchBar` is rendered with `onVoiceSearch` prop THEN the system SHALL display a microphone icon button alongside the search input

2.12 WHEN the user taps the microphone button in `SearchBar` THEN the system SHALL start `TamilSpeechRecognizer` and show an active/pulsing indicator

2.13 WHEN `TamilSpeechRecognizer` returns a result during voice search THEN the system SHALL populate the search input with the recognized text and invoke `onVoiceSearch` with that text

2.14 WHEN `SearchBar` is rendered without `onVoiceSearch` prop THEN the system SHALL render identically to the current implementation with no microphone button visible

2.15 WHEN the `Entries` screen's `SearchBar` microphone button is used THEN the system SHALL invoke `handleSearch` with the recognized text, filtering the entries list accordingly

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `entryService.addEntry()` is called with valid `personName`, `cashAmount > 0`, and a valid `entryType` THEN the system SHALL CONTINUE TO create and persist the entry with the correct field values

3.2 WHEN `entryService.updateEntry()` or `entryService.deleteEntry()` is called THEN the system SHALL CONTINUE TO update or delete entries as before

3.3 WHEN `eventService.createEvent()` or `eventService.updateEvent()` is called THEN the system SHALL CONTINUE TO create and update events as before

3.4 WHEN `AddEditEntryModal` is opened for manual entry THEN the system SHALL CONTINUE TO display the form, accept user input, validate it, and save via `entryService`

3.5 WHEN `AddEditEntryModal` is opened in edit mode with an existing entry THEN the system SHALL CONTINUE TO pre-fill all fields from the existing entry and save updates correctly

3.6 WHEN `SearchBar` is used for text-based search without the `onVoiceSearch` prop THEN the system SHALL CONTINUE TO function identically to the current implementation

3.7 WHEN the `Entries` screen is loaded THEN the system SHALL CONTINUE TO fetch, display, filter, and search entries as it currently does

3.8 WHEN `TamilEntryParser.parse()` is called with Tamil speech text THEN the system SHALL CONTINUE TO extract `cashAmount`, `goldWeight`, and `direction` using the existing regex and keyword logic

3.9 WHEN `EventRepository.mapRow()` reads `is_active` from SQLite THEN the system SHALL CONTINUE TO correctly convert the integer value to a boolean `isActive` field
