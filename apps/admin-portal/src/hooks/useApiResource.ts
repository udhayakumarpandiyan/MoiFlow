/**
 * Small data-fetching hook used by pages. Handles loading and error state and
 * exposes a `reload` callback for refreshing after mutations.
 */
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/api/client';

interface ApiResourceState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useApiResource<T>(fetcher: () => Promise<T>): ApiResourceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState<number>(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcher()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // A 401 is handled globally (logout + redirect); avoid a noisy message.
        if (err instanceof ApiError && err.status === 401) return;
        const message = err instanceof Error ? err.message : 'Something went wrong.';
        setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `fetcher` is expected to be stable per page; nonce drives manual reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  return { data, loading, error, reload };
}
