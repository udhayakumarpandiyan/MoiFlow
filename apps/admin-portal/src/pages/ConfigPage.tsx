/** Read-only view of system configuration and plan catalogue. */
import { useCallback } from 'react';
import { formatInr } from '@moiflow/shared';
import { api } from '@/api/client';
import type { ConfigPlan, SystemConfig } from '@/api/types';
import { useApiResource } from '@/hooks/useApiResource';
import { Page, Loading, ErrorState } from '@/components/StatusView';
import { DataTable, type Column } from '@/components/DataTable';
import { formatCount } from '@/lib/format';

const planColumns: Column<ConfigPlan>[] = [
  { key: 'id', header: 'Plan ID', render: (p) => p.id },
  { key: 'label', header: 'Label', render: (p) => p.label },
  { key: 'price', header: 'Price', render: (p) => formatInr(p.price_inr) },
  {
    key: 'duration',
    header: 'Duration',
    render: (p) => `${p.duration_months} month${p.duration_months === 1 ? '' : 's'}`,
  },
];

export function ConfigPage() {
  const fetcher = useCallback(() => api.config(), []);
  const { data, loading, error, reload } = useApiResource<SystemConfig>(fetcher);

  return (
    <Page title="Config" subtitle="Read-only system configuration">
      {loading ? <Loading /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data ? (
        <>
          <div className="kv-grid">
            <div className="kv">
              <span className="kv__key">Environment</span>
              <span className="kv__value">{data.environment}</span>
            </div>
            <div className="kv">
              <span className="kv__key">SMS provider</span>
              <span className="kv__value">{data.sms_provider}</span>
            </div>
            <div className="kv">
              <span className="kv__key">AI provider</span>
              <span className="kv__value">{data.ai_provider}</span>
            </div>
            <div className="kv">
              <span className="kv__key">OTP expiry</span>
              <span className="kv__value">{formatCount(data.otp_expiry_seconds)} s</span>
            </div>
            <div className="kv">
              <span className="kv__key">OTP max send / hour</span>
              <span className="kv__value">{formatCount(data.otp_max_send_per_hour)}</span>
            </div>
          </div>

          <h2 className="section-title">Plans</h2>
          <DataTable
            columns={planColumns}
            rows={data.plans}
            rowKey={(p) => p.id}
            emptyMessage="No plans configured."
          />
        </>
      ) : null}
    </Page>
  );
}
