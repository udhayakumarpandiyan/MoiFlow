/**
 * Route guard: renders children only when authenticated. While the persisted
 * token is being validated it shows a lightweight loading screen; otherwise it
 * redirects unauthenticated visitors to /login.
 */
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Loading } from '@/components/StatusView';
import type { ReactNode } from 'react';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, initializing } = useAuth();
  const location = useLocation();

  if (initializing) {
    return (
      <div className="app-boot">
        <Loading label="Verifying session..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
