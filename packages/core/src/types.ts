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
  /** ADDED 'error': the engine gave up on this item for now (see `error`). */
  status: 'uploading' | 'queued' | 'done' | 'error';
  /** ADDED: user-facing explanation when status is 'error'. */
  error?: string;
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
  /** ADDED: items that failed to sync (not counted in activeCount). */
  errorCount?: number;
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
  /**
   * ADDED (Syncthing): older conflict copies of the same file besides the one shown. Resolving
   * moves them to version history (restorable for 30 days).
   */
  olderCopies?: number;
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

/** ADDED: details shown on the file info screen. */
export interface FileDetails {
  id: string;
  name: string;
  kind: FileItem['kind'];
  state: SyncState;
  progress?: number;
  conflictId?: string;
  sizeBytes?: number;
  modifiedAt: string;
  /** Name of the device that last changed the file, when known. */
  modifiedBy?: string;
  /** Label of the synced folder the file belongs to. */
  folderLabel: string;
  /** Path inside the synced folder, e.g. "Raportit/Q4.pdf". */
  relativePath: string;
  /** Absolute path on this device (for "open file"), when the file exists here. */
  absolutePath?: string;
  /** Absolute path of the directory containing the file (for "open folder"). */
  parentAbsolutePath?: string;
  /** Names of devices that have the current version (this device included). */
  availableOn: string[];
  /** ADDED: why this item fails to sync on this device, if it does. */
  syncError?: string;
}

/** ADDED (Syncthing): an archived version in a folder's version history (".stversions"). */
export interface VersionEntry {
  /** Unique key: folder, path and version time. */
  id: string;
  folderId: string;
  folderLabel: string;
  /** Path of the file inside the folder; restoring puts the version back here. */
  path: string;
  name: string;
  /** When the version was archived (deleted, replaced, or rejected in a conflict). */
  versionTime: string;
  modifiedAt: string;
  sizeBytes: number;
}

/** ADDED (Syncthing): ignore patterns of a folder (Syncthing .stignore syntax). */
export interface IgnoreRules {
  /** Synced to all devices (".stglobalignore", included from each device's .stignore). */
  shared: string[];
  /** Only on this device (the rest of .stignore). */
  local: string[];
}

/** ADDED (Syncthing): a synced folder and which paired devices it is shared with. */
export interface SharedFolder {
  folderId: string;
  /** list() id of the folder root. */
  listId: string;
  label: string;
  path: string;
  state: SyncState;
  devices: { id: string; name: string; type: Device['type']; online: boolean; shared: boolean }[];
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

  /** ADDED: details for one file or folder from list()/recent(). */
  fileInfo(id: string): Promise<FileDetails>;

  // ---- ADDED (Syncthing pairing & folders) ----
  myDevice(): Promise<DeviceIdentity>;
  pendingDevices(): Observable<PendingDevice[]>;
  /** Pair with a device by ID; shares all folders with it and auto-accepts its folders. */
  addDevice(deviceId: string, name: string): Promise<void>;
  dismissPendingDevice(deviceId: string): Promise<void>;
  /** Start syncing a local directory, shared with all paired devices. */
  addFolder(path: string, label: string): Promise<void>;
  /** Unpair a device (its folders stay on this device). */
  removeDevice(deviceId: string): Promise<void>;
  sharedFolders(): Observable<SharedFolder[]>;
  setFolderShared(folderId: string, deviceId: string, shared: boolean): Promise<void>;
  getIgnores(folderId: string): Promise<IgnoreRules>;
  setIgnores(folderId: string, rules: IgnoreRules): Promise<void>;
  /** Stop syncing one file or folder (adds it to the folder's shared ignore rules). */
  ignoreItem(id: string): Promise<void>;
  /** Version history of all folders, newest first. */
  versions(): Promise<VersionEntry[]>;
  restoreVersion(v: VersionEntry): Promise<void>;
}
