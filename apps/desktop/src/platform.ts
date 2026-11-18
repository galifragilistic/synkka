import { invoke } from '@tauri-apps/api/core';
import {
  SyncthingClient, createMockSyncService, createSyncthingService, fetchTransport,
  type EngineState, type Observable, type StorageQuota, type SyncService, type SyncthingTransport,
} from '@synkka/core';

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
/** Real engine available (Tauri, or the dev proxy). */
export const isRealEngine = isTauri || !!import.meta.env.VITE_ST_PROXY;

/** REST calls go through Rust (st_request), which holds the API key. */
const tauriTransport: SyncthingTransport = {
  request: (method, path, body) => invoke('st_request', { method, path, body: body ?? null }),
};

export interface AppService {
  service: SyncService;
  engine?: Observable<EngineState>;
}

export function createAppService(): AppService {
  if (!isTauri && import.meta.env.VITE_ST_PROXY) {
    // Dev: browser preview against a real Syncthing through the Vite proxy (no file access).
    const service = createSyncthingService(new SyncthingClient(fetchTransport('', '')), {
      fileOps: { rename: async () => { throw new Error('file operations need the desktop app'); } },
      diskUsage: async () => ({ usedBytes: 0, totalBytes: 1 }),
      currentDeviceType: 'computer',
    });
    void service.start();
    return { service, engine: service.engine() };
  }
  if (!isTauri) {
    // Browser preview (npm run desktop:web): design mock.
    const isWindows = /Windows/i.test(navigator.userAgent);
    return { service: createMockSyncService({ currentDeviceId: isWindows ? 'workpc' : 'macbook' }) };
  }
  const client = new SyncthingClient(tauriTransport);
  const service = createSyncthingService(client, {
    fileOps: { rename: (from, to, overwrite) => invoke('fs_rename', { from, to, overwrite }) },
    diskUsage: () => invoke<StorageQuota>('disk_usage'),
    currentDeviceType: 'computer',
    // Folders accepted from other devices land in ~/Synkka/<name> (Syncthing expands "~").
    defaultFolderPath: '~/Synkka',
    pathSeparator: /Windows/i.test(navigator.userAgent) ? '\\' : '/',
    settingsStorage: {
      async load() {
        try {
          return JSON.parse(localStorage.getItem('synkka.settings') ?? 'null');
        } catch {
          return null;
        }
      },
      async save(s) {
        try {
          localStorage.setItem('synkka.settings', JSON.stringify(s));
        } catch {
          /* ignore */
        }
      },
    },
  });
  void service.start().then(async () => {
    // Syncthing names a new device after the host ("Pasin-MacBook-Pro.local"); use the friendly name.
    const me = await service.myDevice();
    if (/\.local$/i.test(me.name) || me.name === '') {
      const name = await invoke<string>('host_name');
      if (name) await tauriTransport.request('PATCH', `/rest/config/devices/${me.deviceId}`, { name });
    }
  });
  return { service, engine: service.engine() };
}
