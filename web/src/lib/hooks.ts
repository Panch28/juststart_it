import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import type { PageMeta, Paged } from './api';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  errorDetails?: { field: string; message: string }[];
  reload: () => void;
  setData: (updater: T | ((prev: T | null) => T | null)) => void;
}

/**
 * Runs an async loader whenever `deps` change and tracks loading / error state.
 * `immediate: false` skips the first fetch (useful for lazily opened panels).
 */
export function useAsync<T>(
  loader: () => Promise<T>,
  deps: React.DependencyList,
  options: { immediate?: boolean } = {},
): AsyncState<T> {
  const { immediate = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<{ field: string; message: string }[] | undefined>();
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let cancelled = false;
    if (!immediate && tick === 0) return;
    setLoading(true);
    setError(null);
    setErrorDetails(undefined);
    loaderRef
      .current()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Something went wrong while loading this data.';
        setError(message);
        if (err instanceof ApiError && err.details) setErrorDetails(err.details);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, immediate]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const update = useCallback((updater: T | ((prev: T | null) => T | null)) => {
    setData((prev) =>
      typeof updater === 'function' ? (updater as (p: T | null) => T | null)(prev) : updater,
    );
  }, []);

  return { data, loading, error, errorDetails, reload, setData: update };
}

export interface PagedState<T> extends AsyncState<Paged<T>> {
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  total: number;
  totalPages: number;
}

/**
 * Fetches a paginated endpoint. `params` is a plain object of query values;
 * changing it refetches and resets to page 1.
 */
export function usePaged<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
  pageSize = 10,
): PagedState<T> {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(pageSize);
  const key = JSON.stringify(params);

  const state = useAsync<Paged<T>>(
    () => api.get<Paged<T>>(path, { ...JSON.parse(key), page, pageSize: size }),
    [key, page, size],
  );

  const meta: PageMeta = state.data?.meta ?? { page, pageSize: size, total: 0, totalPages: 1 };

  return {
    ...state,
    page: meta.page,
    pageSize: meta.pageSize,
    total: meta.total,
    totalPages: meta.totalPages,
    setPage: (p: number) => setPage(p),
    setPageSize: (s: number) => {
      setSize(s);
      setPage(1);
    },
  };
}

/** Debounces a rapidly changing value (used by the global search box). */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Tracks a media query — used to switch table layouts on small screens. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return matches;
}
