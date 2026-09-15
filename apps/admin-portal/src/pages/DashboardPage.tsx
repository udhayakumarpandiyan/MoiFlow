/** Platform overview: headline metrics, subscription mix, and recent activity. */
import { useCallback } from 'react';
import { formatInr } from '@moiflow/shared';
import { api } from '@/api/client';
import type { ActivityEntry, DashboardData } from '@/api/types';
import { useApiResource } from '@/hooks/useApiResource';
import { Page, Loading, ErrorState } from '@/components/StatusView';
import { MetricCard, MetricGrid } from '@/components/MetricCard';
import { DataTable, type Column } from '@/components/DataTable';
import { formatCount, formatDateTime, orDash } from '@/lib/format';

const activityColumns: Column<ActivityEntry>[] = [
  { key: 'created_at', header: 'Time', render: (r) => formatDateTime(r.created_at) },
  { key: 'actor', header: 'Actor', render: (r) => `${r.actor_type}${r.actor_id ? ` (${r.actor_id})` : ''}` },
  { key: 'action', header: 'Action', render: (r) => r.action },
  {
    key: 'target',
    header: 'Target',
    render: (r) => (r.target_type ? `${r.target_type}${r.target_id ? `:${r.target_id}` : ''}` : '—'),
  },
  { key: 'ip', header: 'IP', render: (r) => orDash(r.ip_address) },
];

export function DashboardPage() {
  const fetcher = useCallback(() => api.dashboard(), []);
  const { data, loading, error, reload } = useApiResource<DashboardData>(fetcher);

  return (
    <Page title="Dashboard" subtitle="Platform health at a glance">
      {loading ? <Loading /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <h2 className="section-title">Users</h2>
          <MetricGrid>
            <MetricCard label="Total users" value={formatCount(data.users.total)} />
            <MetricCard label="Active (7d)" value={formatCount(data.users.active_7d)} />
            <MetricCard label="New (7d)" value={formatCount(data.users.new_7d)} />
            <MetricCard label="New (30d)" value={formatCount(data.users.new_30d)} />
            <MetricCard label="Free" value={formatCount(data.users.free)} />
            <MetricCard label="Premium" value={formatCount(data.users.premium)} />
          </MetricGrid>

          <h2 className="section-title">Subscriptions &amp; usage</h2>
          <MetricGrid>
            <MetricCard label="Premium subscriptions" value={formatCount(data.subscriptions.premium)} />
            <MetricCard
              label="Estimated revenue"
              value={formatInr(data.subscriptions.estimated_revenue_inr)}
            />
            <MetricCard label="AI calls (total)" value={formatCount(data.ai.total_calls)} />
            <MetricCard label="AI calls (30d)" value={formatCount(data.ai.calls_30d)} />
            <MetricCard label="OTP requests (24h)" value={formatCount(data.otp.requests_24h)} />
          </MetricGrid>

          <h2 className="section-title">Subscription distribution</h2>
          <DistributionBars distribution={data.subscriptions.distribution} />

          <h2 className="section-title">Recent activity</h2>
          <DataTable
            columns={activityColumns}
            rows={data.recent_activity}
            rowKey={(r, i) => `${r.created_at}-${i}`}
            emptyMessage="No recent activity."
          />
        </>
      ) : null}
    </Page>
  );
}

function DistributionBars({ distribution }: { distribution: Record<string, number> }) {
  const entries = Object.entries(distribution);
  if (entries.length === 0) {
    return <p className="muted">No subscription data.</p>;
  }
  const max = Math.max(...entries.map(([, count]) => count), 1);

  return (
    <div className="dist">
      {entries.map(([planId, count]) => (
        <div className="dist__row" key={planId}>
          <span className="dist__label">{planId}</span>
          <span className="dist__track">
            <span className="dist__fill" style={{ width: `${(count / max) * 100}%` }} />
          </span>
          <span className="dist__count">{formatCount(count)}</span>
        </div>
      ))}
    </div>
  );
}
