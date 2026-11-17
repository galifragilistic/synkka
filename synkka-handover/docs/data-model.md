# Data model (UI-facing) and mock data

The UI reads from a `SyncService`; start with an in-memory mock that emits progress over time.

```ts
export type SyncState =
  | 'synced' | 'syncing' | 'pending' | 'conflict' | 'cloudOnly' | 'offlineAvailable';

export interface FileItem {
  id: string;
  name: string;
  kind: 'file' | 'folder';
  state: SyncState;
  modifiedAt: string;      // ISO; format in UI as "Tänään 14.41", "Eilen", "Ma 16.11."
  sizeBytes?: number;      // files; format "248 kt", "38 Mt", "3,2 Gt" (fi-FI, comma decimals)
  childCount?: number;     // folders; "14 kohdetta"
  progress?: number;       // 0..1 when state === 'syncing'
  conflictId?: string;
}

export interface Device {
  id: string;
  name: string;
  type: 'computer' | 'phone';
  nameGenitive: string;    // Finnish genitive for copy, e.g. "iPhonen", "MacBook Pron"
  isCurrent: boolean;      // append " (tämä laite)"
  online: boolean;
  lastSyncAt: string;
  activity?: 'syncing' | 'idle';
}

export interface ActivityEvent { id: string; fileName: string; detailKey: string; at: string; }

export interface QueueItem { fileId: string; name: string; progress: number; status: 'uploading' | 'queued' | 'done'; }

export interface SyncOverview {
  activeCount: number;
  bytesDone: number;
  bytesTotal: number;
  network: 'wifi' | 'cellular' | 'offline';
  etaSeconds?: number;
  paused: boolean;
  conflictCount: number;
}

export interface ConflictVersion { deviceId: string; deviceName: string; modifiedAt: string; sizeBytes: number; }
export interface Conflict { id: string; fileId: string; fileName: string; local: ConflictVersion; remote: ConflictVersion; }
export type ConflictResolution = 'keepLocal' | 'keepRemote' | 'keepBoth';

export interface SyncSettings { wifiOnly: boolean; photoBackup: boolean; batterySaver: boolean; }

export interface StorageQuota { usedBytes: number; totalBytes: number; }

export interface SyncService {
  overview(): Observable<SyncOverview>;
  list(folderId: string): Observable<FileItem[]>;
  devices(): Observable<Device[]>;
  activity(limit: number): Observable<ActivityEvent[]>;
  queue(): Observable<QueueItem[]>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  syncNow(): Promise<void>;
  getConflict(id: string): Promise<Conflict>;
  resolve(id: string, r: ConflictResolution): Promise<void>;
  settings(): Observable<SyncSettings>;
  updateSettings(p: Partial<SyncSettings>): Promise<void>;
  quota(): Promise<StorageQuota>;
}
```

## Mock data (matches the designs)

Folder "Projektit / Asiakasprojekti":

| name | kind | state | modified | size |
|---|---|---|---|---|
| Luonnokset | folder | synced | today 09:12 | 14 items |
| Kuvamateriaali | folder | cloudOnly | yesterday | 3,2 Gt |
| Esitys_Q4.pptx | file | syncing 0.64 | today 14:41 | 38 Mt |
| Budjetti_2027.xlsx | file | conflict | today 13:05 | 412 kt |
| Tarjous_v3.docx | file | synced | today 11:20 | 248 kt |
| Sopimusluonnos.pdf | file | pending | today 14:44 | 1,1 Mt |
| Muistiinpanot.md | file | synced | Mon 16.11. | 9 kt |

Devices: MacBook Pro (current, online, syncing) · iPhone (online, synced 5 min ago) · Työaseman PC (offline, last yesterday 17:48).

Conflict on Budjetti_2027.xlsx: iPhone 13:05 / 412 kt vs MacBook Pro 13:02 / 398 kt.

Quota: 42,8 Gt / 200 Gt. Overview: 2 active, 24 / 38 Mt, Wi-Fi, ~1 min, 1 conflict.
