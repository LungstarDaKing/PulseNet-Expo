import { useCallback, useEffect, useRef, useState } from 'react';

/** Loads async data on mount and exposes reload. Ignores results after unmount. */
export function useAsync<T>(fn: () => Promise<T>, initial: T): { data: T; loading: boolean; error: string | null; reload: () => Promise<void> } {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const v = await fn();
      if (alive.current) { setData(v); setError(null); }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      if (alive.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    alive.current = true;
    void reload();
    return () => { alive.current = false; };
  }, [reload]);
  return { data, loading, error, reload };
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
