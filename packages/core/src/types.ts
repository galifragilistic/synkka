// UI-facing data model. Source: synkka-handover/docs/data-model.md
// Additions vs. the handover are marked with "ADDED".

export type SyncState =
  | 'synced'
  | 'syncing'
  | 'pending'
  | 'conflict'
  | 'cloudOnly'
  | 'offlineAvailable';

export interface FileItem {
  id: string;
  name: string;
  kind: 'file' | 'folder';
  state: SyncState;
  /** ISO timestamp. */
  modifiedAt: string;
  sizeBytes?: number;
  childCount?: number;
  /** 0..1 when state === 'syncing'. */
  progress?: number;
  conflictId?: string;
}

export interface Device {
  id: string;
  name: string;
  type: 'computer' | 'phone';
  /** Finnish genitive, stored per device (never derived automatically). */
  nameGenitive: string;
  isCurrent: boolean;
  online: boolean;
  lastSyncAt: string;
  activity?: 'syncing' | 'idle';
}

export interface ActivityEvent {
  id: string;
  fileName: string;
  detailKey: string;
  /** ADDED: interpolation params for detailKey (e.g. { count: 2 }). */
  detailParams?: Record<string, string | number>;
  at: string;
}

export interface QueueItem {
  fileId: string;
  name: string;
  progress: number;
  status: 'uploading' | 'queued' | 'done';
}

/** 'unknown' when the platform cannot tell (e.g. desktop): the UI hides the label. */
export type Network = 'wifi' | 'cellular' | 'offline' | 'unknown';

export interface SyncOverview {
  activeCount: number;
  bytesDone: number;
  bytesTotal: number;
  network: Network;
  etaSeconds?: number;
  paused: boolean;
  conflictCount: number;
}

export interface ConflictVersion {
  deviceId: string;
  deviceName: string;
  /** ADDED: needed for copy ("Tämän iPhonen versio"). */
  deviceGenitive: string;
  /** ADDED: needed for the device icon in the radio card. */
  deviceType: Device['type'];
  /** ADDED: true when this version was made on the device running the app. */
  isCurrentDevice?: boolean;
  modifiedAt: string;
  sizeBytes: number;
}

export interface Conflict {
  id: string;
  fileId: string;
  fileName: string;
  /** Version on this device. */
  local: ConflictVersion;
  /** Version on the other device. */
  remote: ConflictVersion;
}

export type ConflictResolution = 'keepLocal' | 'keepRemote' | 'keepBoth';

export interface SyncSettings {
  wifiOnly: boolean;
  photoBackup: boolean;
  batterySaver: boolean;
}

export interface StorageQuota {
  usedBytes: number;
  totalBytes: number;
}

/** Minimal observable: emits the current value on subscribe, then every change. */
export interface Observable<T> {
  subscribe(listener: (value: T) => void): () => void;
}

/** ADDED (Syncthing): a device that tried to connect and is not yet accepted. */
export interface PendingDevice {
  deviceId: string;
  name: string;
  address?: string;
  at: string;
}

/** ADDED (Syncthing): this device's identity, shown for pairing (text + QR). */
export interface DeviceIdentity {
  deviceId: string;
  name: string;
}

export interface SyncService {
  overview(): Observable<SyncOverview>;
  list(folderId: string): Observable<FileItem[]>;
  /** ADDED: recent files across folders (mobile "Viimeisimmät"). */
  recent(limit: number): Observable<FileItem[]>;
  devices(): Observable<Device[]>;
  activity(limit: number): Observable<ActivityEvent[]>;
  queue(): Observable<QueueItem[]>;
  /** ADDED: unresolved conflicts, so screens can link to them. */
  conflicts(): Observable<Conflict[]>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  syncNow(): Promise<void>;
  getConflict(id: string): Promise<Conflict>;
  resolve(id: string, r: ConflictResolution): Promise<void>;
  settings(): Observable<SyncSettings>;
  updateSettings(p: Partial<SyncSettings>): Promise<void>;
  quota(): Promise<StorageQuota>;

  // ---- ADDED (Syncthing pairing & folders) ----
  myDevice(): Promise<DeviceIdentity>;
  pendingDevices(): Observable<PendingDevice[]>;
  /** Pair with a device by ID; shares all folders with it and auto-accepts its folders. */
  addDevice(deviceId: string, name: string): Promise<void>;
  dismissPendingDevice(deviceId: string): Promise<void>;
  /** Start syncing a local directory, shared with all paired devices. */
  addFolder(path: string, label: string): Promise<void>;
}
