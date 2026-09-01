import type { AuthState } from '../services/AuthService';

/**
 * Pure function that determines the navigation route based on authentication state.
 *
 * Decision tree:
 * 1. Not registered → 'Registration'
 * 2. Registered + no MPIN stored → 'SecuritySetup' (first-time setup)
 * 3. Registered + has MPIN + onboarding not done → 'Onboarding'
 * 4. Registered + has MPIN + session active → 'MainTab'
 * 5. Registered + has MPIN + session inactive (PIN lock) → 'PinLock'
 *
 * @param authState - Current auth state from AuthService
 * @param onboardingDone - Whether onboarding has been completed
 */
export function determineRoute(authState: AuthState, onboardingDone: boolean = true): string {
  // Not registered at all — show registration
  if (!authState.isRegistered) {
    return 'Registration';
  }

  // Registered but never set up MPIN — show security setup
  if (!authState.hasCredentials) {
    return 'SecuritySetup';
  }

  // MPIN is set but onboarding hasn't been shown yet
  if (!onboardingDone) {
    return 'Onboarding';
  }

  // Security is disabled (user toggled off in settings) — go straight to app
  if (!authState.securityMethod) {
    return 'MainTab';
  }

  // Always require PIN on every app open
  return 'PinLock';
}
