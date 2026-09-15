/** Audit log of admin and system actions. */
import { useCallback } from 'react';
import { api } from '@/api/client';
import type { ActivityEntry } from '@/api/types';
import { useApiResource } from '@/hooks/useApiResource';
import { Page, Loading, ErrorState } from '@/components/StatusView';
import { DataTable, type Column } from '@/components/DataTable';
import { formatDateTime, orDash } from '@/lib/format';

const columns: Column<ActivityEntry>[] = [
  { key: 'created_at', header: 'Time', render: (r) => formatDateTime(r.created_at) },
  {
    key: 'actor',
    header: 'Actor',
    render: (r) => `${r.actor_type}${r.actor_id ? ` (${r.actor_id})` : ''}`,
  },
  { key: 'action', header: 'Action', render: (r) => r.action },
  {
    key: 'target',
    header: 'Target',
    render: (r) => (r.target_type ? `${r.target_type}${r.target_id ? `:${r.target_id}` : ''}` : '—'),
  },
  { key: 'ip', header: 'IP', render: (r) => orDash(r.ip_address) },
];

export function AuditPage() {
  const fetcher = useCallback(() => api.audit({ limit: 100, offset: 0 }), []);
  const { data, loading, error, reload } = useApiResource<ActivityEntry[]>(fetcher);

  return (
    <Page title="Audit Log" subtitle="Chronological record of privileged actions">
      {loading ? <Loading /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data ? (
        <DataTable
          columns={columns}
          rows={data}
          rowKey={(r, i) => `${r.created_at}-${i}`}
          emptyMessage="No audit records."
        />
      ) : null}
    </Page>
  );
}
