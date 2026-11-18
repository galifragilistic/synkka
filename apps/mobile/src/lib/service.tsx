import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createMockSyncService, createSyncthingService, fetchTransport, SyncthingClient,
  type EngineState, type Network, type Observable, type SyncService, type SyncSettings, type SyncthingSyncService,
} from '@synkka/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { SynkkaEngine } from '../../modules/synkka-engine';
import { EngineGate } from '../components/EngineGate';

const SyncServiceContext = createContext<SyncService | null>(null);
const SETTINGS_KEY = 'synkka.settings';
const DEFAULT_FOLDER_PATH = '/storage/emulated/0/Synkka';

/** True when this build talks to a real Syncthing engine (Android dev/release build). */
export const usesEngine = SynkkaEngine !== null;

async function createEngineService(): Promise<SyncthingSyncService> {
  const engine = SynkkaEngine!;
  if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    // Needed for the foreground-service notification that keeps sync running.
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => undefined);
  }
  const { port, apiKey } = await engine.start();
  const transport = fetchTransport(`http://127.0.0.1:${port}`, apiKey);
  let network: Network = engine.networkType();
  let autoPaused = false;

  const service: SyncthingSyncService = createSyncthingService(new SyncthingClient(transport), {
    fileOps: { rename: (from, to, overwrite) => engine.rename(from, to, overwrite) },
    diskUsage: () => engine.diskUsage(),
    network: () => network,
    currentDeviceType: 'phone',
    defaultFolderPath: DEFAULT_FOLDER_PATH,
    settingsStorage: {
      async load() {
        const raw = await AsyncStorage.getItem(SETTINGS_KEY);
        return raw ? (JSON.parse(raw) as Partial<SyncSettings>) : null;
      },
      save: (s) => AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s)),
    },
    onSettingsChange: () => void applyConditions(),
  });

  /** "Vain Wi-Fi-yhteydellä": pause on mobile data, resume when back on Wi-Fi (only if we paused). */
  async function applyConditions() {
    let s!: SyncSettings;
    service.settings().subscribe((v) => (s = v))();
    const blocked = s.wifiOnly && network === 'cellular';
    if (blocked && !autoPaused) {
      autoPaused = true;
      await service.pause().catch(() => undefined);
    } else if (!blocked && autoPaused) {
      autoPaused = false;
      await service.resume().catch(() => undefined);
    }
  }
  const poll = setInterval(() => {
    const next = engine.networkType();
    if (next !== network) {
      network = next;
      void applyConditions();
    }
  }, 10_000);
  const dispose = service.dispose;
  service.dispose = () => {
    clearInterval(poll);
    dispose();
  };

  await service.start();
  // Name this device after the phone model instead of Syncthing's default hostname ("localhost").
  try {
    const me = await service.myDevice();
    if (!me.name || /^localhost$/i.test(me.name) || me.name === me.deviceId.slice(0, 7)) {
      await transport.request('PATCH', `/rest/config/devices/${me.deviceId}`, { name: engine.deviceModel() });
    }
  } catch {
    /* non-fatal */
  }
  void applyConditions();
  return service;
}

export function SyncServiceProvider({ children }: { children: ReactNode }) {
  const mock = useMemo(() => (usesEngine ? null : createMockSyncService({ currentDeviceId: 'phone' })), []);
  const [service, setService] = useState<SyncthingSyncService | null>(null);
  const [state, setState] = useState<EngineState>({ state: 'starting' });

  const boot = useCallback(() => {
    setState({ state: 'starting' });
    createEngineService()
      .then((s) => {
        s.engine().subscribe(setState);
        setService(s);
      })
      .catch((e) => setState({ state: 'error', error: e instanceof Error ? e.message : String(e) }));
  }, []);

  useEffect(() => {
    if (!usesEngine) return () => mock?.dispose();
    boot();
    return undefined;
  }, [boot, mock]);

  // Re-establish the engine if Android killed it while the app was in the background.
  useEffect(() => {
    if (!usesEngine) return undefined;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && SynkkaEngine && !SynkkaEngine.isRunning()) void SynkkaEngine.start();
    });
    return () => sub.remove();
  }, []);

  const value: SyncService | null = mock ?? (state.state === 'ready' ? service : null);
  if (!value) return <EngineGate state={state} onRetry={boot} />;
  return <SyncServiceContext.Provider value={value}>{children}</SyncServiceContext.Provider>;
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
