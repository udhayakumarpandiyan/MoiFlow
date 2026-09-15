/** Subscription list across all users. */
import { useCallback } from 'react';
import { api } from '@/api/client';
import type { AdminSubscription } from '@/api/types';
import { useApiResource } from '@/hooks/useApiResource';
import { Page, Loading, ErrorState } from '@/components/StatusView';
import { DataTable, Badge, type Column } from '@/components/DataTable';
import { formatDateTime, orDash } from '@/lib/format';

const columns: Column<AdminSubscription>[] = [
  { key: 'phone', header: 'Phone', render: (s) => s.phone },
  { key: 'plan', header: 'Plan', render: (s) => orDash(s.plan_id) },
  { key: 'status', header: 'Status', render: (s) => s.status },
  {
    key: 'premium',
    header: 'Premium',
    render: (s) =>
      s.is_premium ? <Badge tone="positive">Premium</Badge> : <Badge tone="muted">No</Badge>,
  },
  { key: 'store', header: 'Store', render: (s) => orDash(s.store) },
  { key: 'expires', header: 'Expires', render: (s) => formatDateTime(s.expires_at) },
  {
    key: 'renew',
    header: 'Auto-renew',
    render: (s) =>
      s.will_renew ? <Badge tone="neutral">Yes</Badge> : <Badge tone="muted">No</Badge>,
  },
];

export function SubscriptionsPage() {
  const fetcher = useCallback(() => api.subscriptions({ limit: 100, offset: 0 }), []);
  const { data, loading, error, reload } = useApiResource<AdminSubscription[]>(fetcher);

  return (
    <Page title="Subscriptions" subtitle="Plan status and renewal details">
      {loading ? <Loading /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data ? (
        <DataTable
          columns={columns}
          rows={data}
          rowKey={(s, i) => `${s.user_id}-${i}`}
          emptyMessage="No subscriptions found."
        />
      ) : null}
    </Page>
  );
}
