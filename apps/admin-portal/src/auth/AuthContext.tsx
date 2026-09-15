/**
 * Authentication context for the admin portal.
 *
 * Holds the admin JWT and profile, exposes login/logout, and validates a
 * persisted token on mount by calling /me. A 401 from any API call clears the
 * token and dispatches a logout event that this provider also listens for.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  api,
  clearAuthStorage,
  getStoredName,
  getStoredRole,
  getToken,
  LOGOUT_EVENT,
  setAuthStorage,
} from '@/api/client';
import type { AdminRole } from '@/api/types';

export interface AdminIdentity {
  name: string;
  role: AdminRole;
}

interface AuthContextValue {
  token: string | null;
  admin: AdminIdentity | null;
  isAuthenticated: boolean;
  /** True while the persisted token is being validated on startup. */
  initializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const CAN_MUTATE_ROLES = ['admin', 'superadmin'];

export function canMutate(role: AdminRole | undefined | null): boolean {
  return role != null && CAN_MUTATE_ROLES.includes(role);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getToken());
  const [admin, setAdmin] = useState<AdminIdentity | null>(() => {
    const name = getStoredName();
    const role = getStoredRole();
    return name && role ? { name, role } : null;
  });
  const [initializing, setInitializing] = useState<boolean>(() => getToken() != null);

  const logout = useCallback(() => {
    clearAuthStorage();
    setToken(null);
    setAdmin(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.login(email, password);
    setAuthStorage(result.token, result.name, result.role);
    setToken(result.token);
    setAdmin({ name: result.name, role: result.role });
  }, []);

  // Validate a persisted token on mount.
  useEffect(() => {
    let cancelled = false;
    if (!getToken()) {
      setInitializing(false);
      return;
    }
    api
      .me()
      .then((profile) => {
        if (cancelled) return;
        setAdmin({ name: profile.name, role: profile.role });
      })
      .catch(() => {
        // 401 (or any failure) invalidates the session.
        if (!cancelled) logout();
      })
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [logout]);

  // React to logout events dispatched by the API client on 401.
  useEffect(() => {
    const handler = () => {
      setToken(null);
      setAdmin(null);
    };
    window.addEventListener(LOGOUT_EVENT, handler);
    return () => window.removeEventListener(LOGOUT_EVENT, handler);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      admin,
      isAuthenticated: token != null,
      initializing,
      login,
      logout,
    }),
    [token, admin, initializing, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
