/** User directory with a role-gated deactivate action. */
import { useCallback, useState } from 'react';
import { api, ApiError } from '@/api/client';
import type { AdminUser } from '@/api/types';
import { useAuth, canMutate } from '@/auth/AuthContext';
import { useApiResource } from '@/hooks/useApiResource';
import { Page, Loading, ErrorState } from '@/components/StatusView';
import { DataTable, Badge, type Column } from '@/components/DataTable';
import { formatDate, orDash } from '@/lib/format';

export function UsersPage() {
  const { admin } = useAuth();
  const allowMutate = canMutate(admin?.role);

  const fetcher = useCallback(() => api.users({ limit: 100, offset: 0 }), []);
  const { data, loading, error, reload } = useApiResource<AdminUser[]>(fetcher);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleDeactivate = async (id: string) => {
    setActionError(null);
    setBusyId(id);
    try {
      await api.deactivateUser(id);
      reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return;
      setActionError(err instanceof Error ? err.message : 'Failed to deactivate user.');
    } finally {
      setBusyId(null);
    }
  };

  const columns: Column<AdminUser>[] = [
    { key: 'phone', header: 'Phone', render: (u) => u.phone },
    { key: 'name', header: 'Name', render: (u) => orDash(u.name) },
    { key: 'plan', header: 'Plan', render: (u) => orDash(u.plan_id) },
    {
      key: 'premium',
      header: 'Premium',
      render: (u) =>
        u.is_premium ? <Badge tone="positive">Premium</Badge> : <Badge tone="muted">Free</Badge>,
    },
    {
      key: 'verified',
      header: 'Verified',
      render: (u) =>
        u.is_verified ? <Badge tone="positive">Yes</Badge> : <Badge tone="warning">No</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) =>
        u.is_active ? <Badge tone="neutral">Active</Badge> : <Badge tone="muted">Inactive</Badge>,
    },
    { key: 'created', header: 'Created', render: (u) => formatDate(u.created_at) },
    {
      key: 'actions',
      header: 'Actions',
      render: (u) =>
        u.is_active ? (
          <button
            type="button"
            className="btn btn--small btn--danger"
            disabled={!allowMutate || busyId === u.id}
            title={allowMutate ? 'Deactivate this user' : 'Requires admin role'}
            onClick={() => handleDeactivate(u.id)}
          >
            {busyId === u.id ? 'Working...' : 'Deactivate'}
          </button>
        ) : (
          <span className="muted">—</span>
        ),
    },
  ];

  return (
    <Page title="Users" subtitle="Registered accounts and their subscription state">
      {loading ? <Loading /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {actionError ? <ErrorState message={actionError} /> : null}
      {data ? (
        <DataTable columns={columns} rows={data} rowKey={(u) => u.id} emptyMessage="No users found." />
      ) : null}
    </Page>
  );
}
