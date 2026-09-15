/** Moi domain overview. Kept separate from Finance. */
import { useCallback } from 'react';
import { api } from '@/api/client';
import type { MoiOverview } from '@/api/types';
import { useApiResource } from '@/hooks/useApiResource';
import { Page, Loading, ErrorState } from '@/components/StatusView';
import { MetricCard, MetricGrid } from '@/components/MetricCard';
import { formatCount } from '@/lib/format';

export function MoiOverviewPage() {
  const fetcher = useCallback(() => api.moiOverview(), []);
  const { data, loading, error, reload } = useApiResource<MoiOverview>(fetcher);

  return (
    <Page title="Moi" subtitle="Moi events and entries overview">
      {loading ? <Loading /> : null}
      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {data ? (
        <MetricGrid>
          <MetricCard label="Moi events" value={formatCount(data.events)} />
          <MetricCard label="Moi entries" value={formatCount(data.entries)} />
        </MetricGrid>
      ) : null}
    </Page>
  );
}
