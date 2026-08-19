import type { AuthState } from '../services/AuthService';

/**
 * Pure function that determines the navigation route based on authentication state.
 *
 * Decision tree:
 * 1. Not registered → 'Registration'
 * 2. Registered + never set up any security → 'SecuritySetup'
 * 3. Registered + no active security method (disabled but has credentials) → 'MainTab'
 * 4. Registered + active security + session active → 'MainTab'
 * 5. Registered + pattern security + session inactive → 'PatternLock'
 * 6. Registered + pin security + session inactive → 'PinLock'
 */
export function determineRoute(authState: AuthState): string {
  if (!authState.isRegistered) {
    return 'Registration';
  }

  // First-time user who hasn't set up any PIN or pattern yet
  if (!authState.hasCredentials) {
    return 'SecuritySetup';
  }

  // Security is disabled (user toggled off) — go straight to app
  if (!authState.securityMethod) {
    return 'MainTab';
  }

  // Security is enabled but session is still active — no need to re-auth
  if (authState.isSessionActive) {
    return 'MainTab';
  }

  // Session expired / first launch — show the appropriate lock screen
  if (authState.securityMethod === 'pattern') {
    return 'PatternLock';
  }

  return 'PinLock';
}
