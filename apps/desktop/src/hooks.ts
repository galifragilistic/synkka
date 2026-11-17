import { createContext, useContext, useEffect, useState } from 'react';
import type { Observable, SyncService } from '@synkka/core';

export const SyncServiceContext = createContext<SyncService | null>(null);

export function useSync(): SyncService {
  const s = useContext(SyncServiceContext);
  if (!s) throw new Error('SyncServiceContext missing');
  return s;
}

/** Subscribe to an Observable; the factory is re-run only when deps change. */
export function useObservable<T>(factory: () => Observable<T>, deps: unknown[] = []): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => factory().subscribe(setValue), deps); // eslint-disable-line react-hooks/exhaustive-deps
  return value;
}

/** Current time, refreshed periodically so relative timestamps stay fresh. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useDebounced<T>(value: T, ms = 150): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
