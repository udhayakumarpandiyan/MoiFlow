/** Application routing: public login plus protected app shell with pages. */
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { UsersPage } from '@/pages/UsersPage';
import { SubscriptionsPage } from '@/pages/SubscriptionsPage';
import { MoiOverviewPage } from '@/pages/MoiOverviewPage';
import { FinanceOverviewPage } from '@/pages/FinanceOverviewPage';
import { AiUsagePage } from '@/pages/AiUsagePage';
import { ActivityPage } from '@/pages/ActivityPage';
import { AuditPage } from '@/pages/AuditPage';
import { ConfigPage } from '@/pages/ConfigPage';
import { AdminsPage } from '@/pages/AdminsPage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'users', element: <UsersPage /> },
      { path: 'subscriptions', element: <SubscriptionsPage /> },
      { path: 'moi', element: <MoiOverviewPage /> },
      { path: 'finance', element: <FinanceOverviewPage /> },
      { path: 'ai-usage', element: <AiUsagePage /> },
      { path: 'activity', element: <ActivityPage /> },
      { path: 'audit', element: <AuditPage /> },
      { path: 'admins', element: <AdminsPage /> },
      { path: 'config', element: <ConfigPage /> },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
]);
