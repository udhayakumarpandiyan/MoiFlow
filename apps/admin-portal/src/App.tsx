/**
 * Admin portal root. Wires the auth provider around the router so every route
 * (including the guard) can read authentication state.
 */
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthContext';
import { router } from '@/router';

export function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
