/** OTP activity monitoring. */
import { useCallback } from 'react';
import { api } from '@/api/client';
import type { OtpActivityEntry } from '@/api/types';
import { useApiResource } from '@/hooks/useApiResource';
import { Page, Loading, ErrorState } from '@/components/StatusView';
import { DataTable, Badge, type Column } from '@/components/DataTable';
import { formatDateTime, orDash } from '@/lib/format';

const columns: Column<OtpActivityEntry>[] = [
  { key: 'created_at', header: 'Time', render: (r) => formatDateTime(r.created_at) },
  { key: 'phone', header: 'Phone', render: (r) => r.phone },
  { key: 'purpose', header: 'Purpose', render: (r) => r.purpose },
  { key: 'channel', header: 'Channel', render: (r) => r.channel },
  {
    key: 'delivered',
    header: 'Delivered',
    render: (r) =>
      r.delivered ? <Badge tone="positive">Yes</Badge> : <Badge tone="warning">No</Badge>,
  },
  {
    key: 'verified',
    header: 'Verified',
    render: (r) =>
      r.verified ? <Badge tone="positive">Yes</Badge> : <Badge tone="muted">No</Badge>,
  },
  { key: 'ip', header: 'IP', render: (r) => orDash(r.ip_address) },
];

export function ActivityPage() {
  const fetcher = useCallback(() => api.otpActivity({ limit: 100, offset: 0 }), []);
  const { data, loading, error, reload } = useApiResource<OtpActivityEntry[]>(fetcher);

  return (
    <Page title="OTP Activity" subtitle="One-time-password delivery and verification monitoring">
      {loading ? <Loading /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data ? (
        <DataTable
          columns={columns}
          rows={data}
          rowKey={(r, i) => `${r.created_at}-${i}`}
          emptyMessage="No OTP activity recorded."
        />
      ) : null}
    </Page>
  );
}
