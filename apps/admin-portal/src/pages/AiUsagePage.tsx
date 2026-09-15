/** AI usage: per-task counts and recent calls. */
import { useCallback } from 'react';
import { api } from '@/api/client';
import type { AiRecentCall, AiUsage } from '@/api/types';
import { useApiResource } from '@/hooks/useApiResource';
import { Page, Loading, ErrorState, EmptyState } from '@/components/StatusView';
import { DataTable, Badge, type Column } from '@/components/DataTable';
import { formatCount, formatDateTime, orDash } from '@/lib/format';

const recentColumns: Column<AiRecentCall>[] = [
  { key: 'created_at', header: 'Time', render: (r) => formatDateTime(r.created_at) },
  { key: 'task', header: 'Task', render: (r) => r.task },
  { key: 'provider', header: 'Provider', render: (r) => r.provider },
  { key: 'domain', header: 'Domain', render: (r) => orDash(r.domain) },
  {
    key: 'success',
    header: 'Result',
    render: (r) =>
      r.success ? <Badge tone="positive">Success</Badge> : <Badge tone="warning">Failed</Badge>,
  },
  {
    key: 'latency',
    header: 'Latency',
    render: (r) => (r.latency_ms != null ? `${formatCount(r.latency_ms)} ms` : '—'),
  },
];

export function AiUsagePage() {
  const fetcher = useCallback(() => api.aiUsage(), []);
  const { data, loading, error, reload } = useApiResource<AiUsage>(fetcher);

  const byTask = data ? Object.entries(data.by_task) : [];

  return (
    <Page title="AI Usage" subtitle="Model calls by task and recent activity">
      {loading ? <Loading /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <h2 className="section-title">By task</h2>
          {byTask.length === 0 ? (
            <EmptyState message="No task usage recorded." />
          ) : (
            <div className="kv-grid">
              {byTask.map(([task, count]) => (
                <div className="kv" key={task}>
                  <span className="kv__key">{task}</span>
                  <span className="kv__value">{formatCount(count)}</span>
                </div>
              ))}
            </div>
          )}

          <h2 className="section-title">Recent calls</h2>
          <DataTable
            columns={recentColumns}
            rows={data.recent}
            rowKey={(r, i) => `${r.created_at}-${i}`}
            emptyMessage="No recent AI calls."
          />
        </>
      ) : null}
    </Page>
  );
}
