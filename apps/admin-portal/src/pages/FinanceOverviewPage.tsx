/** Finance domain overview. Kept separate from Moi. */
import { useCallback } from 'react';
import { api } from '@/api/client';
import type { FinanceOverview } from '@/api/types';
import { useApiResource } from '@/hooks/useApiResource';
import { Page, Loading, ErrorState } from '@/components/StatusView';
import { MetricCard, MetricGrid } from '@/components/MetricCard';
import { formatCount } from '@/lib/format';

export function FinanceOverviewPage() {
  const fetcher = useCallback(() => api.financeOverview(), []);
  const { data, loading, error, reload } = useApiResource<FinanceOverview>(fetcher);

  return (
    <Page title="Finance" subtitle="Credits, loans, and business transactions">
      {loading ? <Loading /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data ? (
        <MetricGrid>
          <MetricCard label="Credits" value={formatCount(data.credits)} />
          <MetricCard label="Loans" value={formatCount(data.loans)} />
          <MetricCard label="Business transactions" value={formatCount(data.business_txns)} />
        </MetricGrid>
      ) : null}
    </Page>
  );
}
