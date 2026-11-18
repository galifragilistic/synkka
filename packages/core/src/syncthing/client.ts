// Thin client for the Syncthing REST API (https://docs.syncthing.net/dev/rest.html).
// Platform-neutral: the transport is injected (fetch on Android, a Tauri command on desktop).

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface SyncthingTransport {
  /** Performs a request against the Syncthing GUI/REST address; rejects on non-2xx. Returns parsed JSON or null. */
  request(method: HttpMethod, path: string, body?: unknown): Promise<unknown>;
}

/** fetch-based transport (Android/web). The API key never leaves this process. */
export function fetchTransport(baseUrl: string, apiKey: string, fetchImpl: typeof fetch = fetch): SyncthingTransport {
  return {
    async request(method, path, body) {
      const res = await fetchImpl(baseUrl + path, {
        method,
        headers: { 'X-API-Key': apiKey, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(`Syncthing ${method} ${path} → ${res.status}`);
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    },
  };
}

// ---- Raw API shapes (only the fields we use) ----

export interface StDeviceConfig {
  deviceID: string;
  name: string;
  addresses: string[];
  paused: boolean;
  autoAcceptFolders: boolean;
  introducer?: boolean;
}

export interface StFolderDevice {
  deviceID: string;
  introducedBy?: string;
  encryptionPassword?: string;
}

export interface StFolderConfig {
  id: string;
  label: string;
  path: string;
  type: string;
  paused: boolean;
  devices: StFolderDevice[];
  versioning?: { type: string; params: Record<string, string>; cleanupIntervalS?: number };
}

export interface StSystemStatus {
  myID: string;
}

export interface StConnection {
  connected: boolean;
  paused: boolean;
  address: string;
  inBytesTotal: number;
  outBytesTotal: number;
}

export interface StConnections {
  connections: Record<string, StConnection>;
  total: { at: string; inBytesTotal: number; outBytesTotal: number };
}

export interface StFolderStatus {
  globalFiles: number;
  globalBytes: number;
  localFiles: number;
  localDirectories: number;
  localBytes: number;
  needFiles: number;
  needBytes: number;
  needTotalItems: number;
  inSyncBytes: number;
  state: string;
  error: string;
}

export interface StCompletion {
  completion: number;
  needBytes: number;
  needItems: number;
  globalBytes: number;
}

export interface StBrowseEntry {
  name: string;
  modTime: string;
  size: number;
  type: string; // FILE_INFO_TYPE_FILE | FILE_INFO_TYPE_DIRECTORY | …
  children?: StBrowseEntry[];
}

export interface StNeedFile {
  name: string;
  size: number;
  modified: string;
  type: string;
}

export interface StNeed {
  progress: StNeedFile[];
  queued: StNeedFile[];
  rest: StNeedFile[];
}

export interface StDbFile {
  global: { name: string; size: number; modified: string; modifiedBy: string; deleted: boolean; type: string } | null;
  local: { name: string; size: number; modified: string; modifiedBy: string; deleted: boolean } | null;
}

export interface StEvent {
  id: number;
  type: string;
  time: string;
  data: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface StPendingDevices {
  [deviceId: string]: { name: string; address: string; time: string };
}

export interface StDeviceStats {
  [deviceId: string]: { lastSeen: string };
}

const q = (params: Record<string, string | number | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

export const SYNCTHING_EVENTS = [
  'StateChanged', 'FolderSummary', 'FolderCompletion', 'DownloadProgress', 'ItemStarted', 'ItemFinished',
  'DeviceConnected', 'DeviceDisconnected', 'DevicePaused', 'DeviceResumed', 'ConfigSaved',
  'PendingDevicesChanged', 'LocalChangeDetected', 'RemoteChangeDetected', 'LocalIndexUpdated', 'RemoteIndexUpdated',
];

export class SyncthingClient {
  constructor(private t: SyncthingTransport) {}

  private get<T>(path: string) {
    return this.t.request('GET', path) as Promise<T>;
  }

  ping() {
    return this.get<{ ping: string }>('/rest/system/ping');
  }
  status() {
    return this.get<StSystemStatus>('/rest/system/status');
  }
  connections() {
    return this.get<StConnections>('/rest/system/connections');
  }
  devices() {
    return this.get<StDeviceConfig[]>('/rest/config/devices');
  }
  folders() {
    return this.get<StFolderConfig[]>('/rest/config/folders');
  }
  deviceStats() {
    return this.get<StDeviceStats>('/rest/stats/device');
  }
  folderStatus(folder: string) {
    return this.get<StFolderStatus>(`/rest/db/status?${q({ folder })}`);
  }
  completion(folder: string, device: string) {
    return this.get<StCompletion>(`/rest/db/completion?${q({ folder, device })}`);
  }
  browse(folder: string, prefix = '', levels = 0) {
    return this.get<StBrowseEntry[]>(`/rest/db/browse?${q({ folder, prefix, levels })}`);
  }
  need(folder: string) {
    return this.get<StNeed>(`/rest/db/need?${q({ folder })}`);
  }
  file(folder: string, file: string) {
    return this.get<StDbFile>(`/rest/db/file?${q({ folder, file })}`);
  }
  pendingDevices() {
    return this.get<StPendingDevices>('/rest/cluster/pending/devices');
  }
  validateDeviceId(id: string) {
    return this.get<{ id?: string; error?: string }>(`/rest/svc/deviceid?${q({ id })}`);
  }
  events(since: number, timeoutS = 60) {
    return this.get<StEvent[]>(`/rest/events?${q({ since, timeout: timeoutS, events: SYNCTHING_EVENTS.join(',') })}`);
  }

  pauseAll() {
    return this.t.request('POST', '/rest/system/pause');
  }
  resumeAll() {
    return this.t.request('POST', '/rest/system/resume');
  }
  scan(folder?: string) {
    return this.t.request('POST', `/rest/db/scan?${q({ folder })}`);
  }
  putDevice(device: Partial<StDeviceConfig> & { deviceID: string }) {
    return this.t.request('PUT', `/rest/config/devices/${encodeURIComponent(device.deviceID)}`, device);
  }
  patchFolder(id: string, patch: Partial<StFolderConfig>) {
    return this.t.request('PATCH', `/rest/config/folders/${encodeURIComponent(id)}`, patch);
  }
  putFolder(folder: Partial<StFolderConfig> & { id: string }) {
    return this.t.request('PUT', `/rest/config/folders/${encodeURIComponent(folder.id)}`, folder);
  }
  dismissPendingDevice(device: string) {
    return this.t.request('DELETE', `/rest/cluster/pending/devices?${q({ device })}`);
  }
  patchDefaultsFolder(patch: Partial<StFolderConfig>) {
    return this.t.request('PATCH', '/rest/config/defaults/folder', patch);
  }
}
