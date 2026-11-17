import { createMockSyncService, type Observable, type SyncService } from '@synkka/core';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const SyncServiceContext = createContext<SyncService | null>(null);

export function SyncServiceProvider({ children }: { children: ReactNode }) {
  const service = useMemo(() => createMockSyncService({ currentDeviceId: 'phone' }), []);
  useEffect(() => () => service.dispose(), [service]);
  return <SyncServiceContext.Provider value={service}>{children}</SyncServiceContext.Provider>;
}

export function useSyncService(): SyncService {
  const s = useContext(SyncServiceContext);
  if (!s) throw new Error('useSyncService must be used inside SyncServiceProvider');
  return s;
}

function currentValue<T>(o: Observable<T>): T {
  let v!: T;
  o.subscribe((x) => (v = x))();
  return v;
}

/** Subscribe to an observable created by `factory` (re-created when deps change). */
export function useObservable<T>(factory: (s: SyncService) => Observable<T>, deps: unknown[] = []): T {
  const service = useSyncService();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const obs = useMemo(() => factory(service), [service, ...deps]);
  const [value, setValue] = useState<T>(() => currentValue(obs));
  useEffect(() => obs.subscribe((v) => setValue(() => v)), [obs]);
  return value;
}
