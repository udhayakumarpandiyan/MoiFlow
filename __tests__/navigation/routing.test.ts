/**
 * Property-Based Test: Navigation Routing Correctness (Property 1)
 *
 * **Validates: Requirements 1.3, 3.1, 3.2, 5.1**
 *
 * For any combination of auth state (isRegistered, securityMethod, isSessionActive),
 * the routing logic produces exactly one correct destination from the set:
 * ['Registration', 'SecuritySetup', 'MainTab', 'PatternLock', 'PinLock']
 */

import fc from 'fast-check';
import { determineRoute } from '../../src/navigation/determineRoute';
import type { AuthState } from '../../src/services/AuthService';

// Valid routes that the routing logic can produce
const VALID_ROUTES = ['Registration', 'SecuritySetup', 'MainTab', 'PatternLock', 'PinLock'];

// Generator for valid AuthState objects
const authStateArb: fc.Arbitrary<AuthState> = fc.record({
  isRegistered: fc.boolean(),
  securityMethod: fc.constantFrom('pin' as const, 'pattern' as const, null),
  isSessionActive: fc.boolean(),
  failedAttempts: fc.nat({ max: 10 }),
  lockoutUntil: fc.oneof(fc.constant(null), fc.nat()),
});

describe('Navigation Routing - Property 1: Navigation Routing Correctness', () => {
  /**
   * **Validates: Requirements 1.3, 3.1, 3.2, 5.1**
   *
   * For any valid AuthState, determineRoute always returns exactly one route
   * from the set of valid destinations.
   */
  it('always produces exactly one valid route for any auth state combination', () => {
    fc.assert(
      fc.property(authStateArb, (authState) => {
        const route = determineRoute(authState);
        expect(VALID_ROUTES).toContain(route);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 3.2**
   *
   * When not registered, the route is always 'Registration' regardless of other state.
   */
  it('routes to Registration when user is not registered', () => {
    fc.assert(
      fc.property(
        authStateArb.filter((s) => !s.isRegistered),
        (authState) => {
          const route = determineRoute(authState);
          expect(route).toBe('Registration');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.3, 3.1**
   *
   * When registered but no security method is set, routes to SecuritySetup.
   */
  it('routes to SecuritySetup when registered but no security method', () => {
    fc.assert(
      fc.property(
        authStateArb.filter((s) => s.isRegistered && s.securityMethod === null),
        (authState) => {
          const route = determineRoute(authState);
          expect(route).toBe('SecuritySetup');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 5.1**
   *
   * When registered with security and session is active, routes to MainTab.
   */
  it('routes to MainTab when registered with security and session active', () => {
    fc.assert(
      fc.property(
        authStateArb.filter(
          (s) => s.isRegistered && s.securityMethod !== null && s.isSessionActive,
        ),
        (authState) => {
          const route = determineRoute(authState);
          expect(route).toBe('MainTab');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.1, 5.1**
   *
   * When registered with pattern security and session inactive, routes to PatternLock.
   */
  it('routes to PatternLock when registered with pattern and session inactive', () => {
    fc.assert(
      fc.property(
        authStateArb.filter(
          (s) =>
            s.isRegistered &&
            s.securityMethod === 'pattern' &&
            !s.isSessionActive,
        ),
        (authState) => {
          const route = determineRoute(authState);
          expect(route).toBe('PatternLock');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.1, 5.1**
   *
   * When registered with PIN security and session inactive, routes to PinLock.
   */
  it('routes to PinLock when registered with pin and session inactive', () => {
    fc.assert(
      fc.property(
        authStateArb.filter(
          (s) =>
            s.isRegistered &&
            s.securityMethod === 'pin' &&
            !s.isSessionActive,
        ),
        (authState) => {
          const route = determineRoute(authState);
          expect(route).toBe('PinLock');
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.3, 3.1, 3.2, 5.1**
   *
   * The routing function is deterministic: the same auth state always produces
   * the same route.
   */
  it('is deterministic: same auth state always produces the same route', () => {
    fc.assert(
      fc.property(authStateArb, (authState) => {
        const route1 = determineRoute(authState);
        const route2 = determineRoute(authState);
        expect(route1).toBe(route2);
      }),
      { numRuns: 200 },
    );
  });

  /**
   * **Validates: Requirements 1.3, 3.1, 3.2, 5.1**
   *
   * The failedAttempts and lockoutUntil fields do not affect routing —
   * routing depends only on isRegistered, securityMethod, and isSessionActive.
   */
  it('routing is independent of failedAttempts and lockoutUntil', () => {
    fc.assert(
      fc.property(
        authStateArb,
        fc.nat({ max: 100 }),
        fc.oneof(fc.constant(null), fc.nat()),
        (authState, newFailedAttempts, newLockout) => {
          const route1 = determineRoute(authState);
          const modified: AuthState = {
            ...authState,
            failedAttempts: newFailedAttempts,
            lockoutUntil: newLockout,
          };
          const route2 = determineRoute(modified);
          expect(route1).toBe(route2);
        },
      ),
      { numRuns: 200 },
    );
  });
});
