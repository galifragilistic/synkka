// In-memory SyncService that matches the designs and simulates progress over time.
// Replace with a real implementation of the same interface when the backend exists.
import { keepBothCopyName } from './conflict';
import { map, Store } from './observable';
import type {
  ActivityEvent, Conflict, ConflictResolution, ConflictVersion, Device, FileItem, QueueItem,
  StorageQuota, SyncOverview, SyncService, SyncSettings, Network, PendingDevice,
} from './types';

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

export const ROOT_FOLDER = 'root';
export const DEMO_FOLDER = 'asiakasprojekti';

export interface MockOptions {
  /** Which device this app runs on. Desktop default: MacBook Pro; mobile: the phone. */
  currentDeviceId?: 'macbook' | 'phone' | 'workpc';
  /** Simulation tick; set 0 to disable the timer (tests call tick() manually). */
  tickMs?: number;
  /** Simulated throughput in bytes per second. */
  bytesPerSecond?: number;
  now?: () => Date;
  network?: Network;
}

export interface MockSyncService extends SyncService {
  /** Advance the simulation by `ms` milliseconds. */
  tick(ms?: number): void;
  dispose(): void;
}

export function createMockSyncService(opts: MockOptions = {}): MockSyncService {
  const now = opts.now ?? (() => new Date());
  const tickMs = opts.tickMs ?? 500;
  const bps = opts.bytesPerSecond ?? 0.5 * MB;
  const currentId = opts.currentDeviceId ?? 'macbook';

  const at = (h: number, m: number, daysAgo = 0) => {
    const d = now();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysAgo, h, m).toISOString();
  };
  const ago = (minutes: number) => new Date(now().getTime() - minutes * 60_000).toISOString();
  const lastMonday = () => {
    const d = now();
    const back = ((d.getDay() + 6) % 7) || 7; // previous Monday (never today)
    return at(10, 30, back);
  };

  // ---- devices -------------------------------------------------------------
  const baseDevices: Device[] = [
    { id: 'macbook', name: 'MacBook Pro', nameGenitive: 'MacBook Pron', type: 'computer', isCurrent: false, online: true, lastSyncAt: ago(0), activity: 'idle' },
    { id: 'phone', name: 'Pixel 9', nameGenitive: 'Pixel 9:n', type: 'phone', isCurrent: false, online: true, lastSyncAt: ago(5), activity: 'idle' },
    { id: 'workpc', name: 'Työaseman PC', nameGenitive: 'Työaseman PC:n', type: 'computer', isCurrent: false, online: false, lastSyncAt: at(17, 48, 1), activity: 'idle' },
  ];
  const devices = new Store<Device[]>(
    baseDevices
      .map((d) => (d.id === currentId ? { ...d, isCurrent: true, online: true, activity: 'syncing' as const } : d))
      .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent)),
  );
  const deviceById = (id: string) => devices.get().find((d) => d.id === id)!;

  // ---- files ---------------------------------------------------------------
  const folders = new Store<Record<string, FileItem[]>>({
    [ROOT_FOLDER]: [
      { id: 'projektit', name: 'Projektit', kind: 'folder', state: 'synced', modifiedAt: at(9, 12), childCount: 6 },
      { id: 'kuvat', name: 'Kuvat', kind: 'folder', state: 'synced', modifiedAt: at(8, 0), childCount: 1284 },
      { id: 'asiakirjat', name: 'Asiakirjat', kind: 'folder', state: 'synced', modifiedAt: at(16, 0, 1), childCount: 42 },
      { id: 'jaetut', name: 'Jaetut', kind: 'folder', state: 'synced', modifiedAt: at(12, 0, 2), childCount: 3 },
    ],
    [DEMO_FOLDER]: [
      { id: 'luonnokset', name: 'Luonnokset', kind: 'folder', state: 'synced', modifiedAt: at(9, 12), childCount: 14 },
      { id: 'kuvamateriaali', name: 'Kuvamateriaali', kind: 'folder', state: 'cloudOnly', modifiedAt: at(15, 30, 1), sizeBytes: Math.round(3.2 * GB) },
      { id: 'esitys', name: 'Esitys_Q4.pptx', kind: 'file', state: 'syncing', progress: 0.64, modifiedAt: at(14, 41), sizeBytes: 38 * MB },
      { id: 'budjetti', name: 'Budjetti_2027.xlsx', kind: 'file', state: 'conflict', conflictId: 'c-budjetti', modifiedAt: at(13, 5), sizeBytes: 412 * KB },
      { id: 'tarjous', name: 'Tarjous_v3.docx', kind: 'file', state: 'synced', modifiedAt: at(11, 20), sizeBytes: 248 * KB },
      { id: 'sopimus', name: 'Sopimusluonnos.pdf', kind: 'file', state: 'pending', modifiedAt: at(14, 44), sizeBytes: Math.round(1.1 * MB) },
      { id: 'muistiinpanot', name: 'Muistiinpanot.md', kind: 'file', state: 'synced', modifiedAt: lastMonday(), sizeBytes: 9 * KB },
    ],
    asiakirjat: [
      { id: 'matka', name: 'Matkasuunnitelma.pdf', kind: 'file', state: 'offlineAvailable', modifiedAt: at(10, 2), sizeBytes: Math.round(2.4 * MB) },
    ],
  });

  const allFiles = () => Object.values(folders.get()).flat();
  const updateFile = (id: string, patch: Partial<FileItem> | ((f: FileItem) => FileItem)) => {
    const next: Record<string, FileItem[]> = {};
    for (const [k, list] of Object.entries(folders.get())) {
      next[k] = list.map((f) => (f.id !== id ? f : typeof patch === 'function' ? patch(f) : { ...f, ...patch }));
    }
    folders.set(next);
  };
  const addFile = (folderId: string, file: FileItem) => {
    const cur = folders.get();
    folders.set({ ...cur, [folderId]: [...(cur[folderId] ?? []), file] });
  };
  const folderOf = (fileId: string) =>
    Object.entries(folders.get()).find(([, list]) => list.some((f) => f.id === fileId))?.[0] ?? DEMO_FOLDER;

  // ---- conflicts -----------------------------------------------------------
  const versionOf = (deviceId: string, modifiedAt: string, sizeBytes: number): ConflictVersion => {
    const d = deviceById(deviceId);
    return { deviceId, deviceName: d.name, deviceGenitive: d.nameGenitive, deviceType: d.type, modifiedAt, sizeBytes };
  };
  const otherId = currentId === 'phone' ? 'macbook' : 'phone';
  const localIsNewer = currentId === 'phone';
  const conflicts = new Store<Conflict[]>([
    {
      id: 'c-budjetti',
      fileId: 'budjetti',
      fileName: 'Budjetti_2027.xlsx',
      local: localIsNewer ? versionOf(currentId, at(13, 5), 412 * KB) : versionOf(currentId, at(13, 2), 398 * KB),
      remote: localIsNewer ? versionOf(otherId, at(13, 2), 398 * KB) : versionOf(otherId, at(13, 5), 412 * KB),
    },
  ]);

  // ---- activity, queue, settings, overview ---------------------------------
  let eventSeq = 0;
  const activity = new Store<ActivityEvent[]>([
    { id: 'a1', fileName: 'Esitys_Q4.pptx', detailKey: 'activity.editedHere', at: ago(3) },
    { id: 'a2', fileName: 'Budjetti_2027.xlsx', detailKey: 'activity.editedConcurrently', at: ago(60) },
    { id: 'a3', fileName: 'Luonnokset', detailKey: 'activity.sharedWith', detailParams: { count: 2 }, at: at(9, 12) },
  ]);
  let done: QueueItem[] = [{ fileId: 'img4821', name: 'IMG_4821.heic', progress: 1, status: 'done' }];

  const pending = new Store<PendingDevice[]>([]);
  const settings = new Store<SyncSettings>({ wifiOnly: true, photoBackup: true, batterySaver: false });

  let paused = false;
  const network: Network = opts.network ?? 'wifi';
  const active = () => allFiles().filter((f) => f.state === 'syncing' || f.state === 'pending');
  const remainingBytes = () =>
    active().reduce((sum, f) => sum + (f.sizeBytes ?? 0) * (1 - (f.state === 'syncing' ? f.progress ?? 0 : 0)), 0);

  // A "pass" accumulates bytes until the queue is empty, so the ring never jumps backwards.
  let passTotal = active().reduce((s, f) => s + (f.sizeBytes ?? 0), 0);
  let passDone = passTotal - remainingBytes();

  const computeOverview = (): SyncOverview => {
    const rem = remainingBytes();
    return {
      activeCount: active().length,
      bytesDone: Math.round(passDone),
      bytesTotal: Math.round(passTotal),
      network,
      etaSeconds: rem > 0 ? Math.ceil(rem / bps) : undefined,
      paused,
      conflictCount: conflicts.get().length,
    };
  };
  const overview = new Store<SyncOverview>(computeOverview());

  const computeQueue = (): QueueItem[] => [
    ...active()
      .sort((a, b) => (a.state === 'syncing' ? -1 : b.state === 'syncing' ? 1 : 0))
      .map<QueueItem>((f) => ({
        fileId: f.id,
        name: f.name,
        progress: f.state === 'syncing' ? f.progress ?? 0 : 0,
        status: f.state === 'syncing' ? 'uploading' : 'queued',
      })),
    ...done,
  ];
  const queue = new Store<QueueItem[]>(computeQueue());

  const refresh = () => {
    overview.set(computeOverview());
    queue.set(computeQueue());
    const busy = active().length > 0 && !paused;
    devices.set(devices.get().map((d) => (d.isCurrent ? { ...d, activity: busy ? 'syncing' : 'idle', lastSyncAt: busy ? d.lastSyncAt : now().toISOString() } : d)));
  };
  // Keep derived stores in sync with file changes (skip the synchronous initial emit).
  let ready = false;
  folders.subscribe(() => {
    if (ready) refresh();
  });
  ready = true;

  const startNewPassIfIdle = () => {
    if (active().length === 0) {
      passTotal = 0;
      passDone = 0;
    }
  };
  const enqueue = (fileId: string) => {
    const f = allFiles().find((x) => x.id === fileId);
    if (!f) return;
    startNewPassIfIdle();
    passTotal += f.sizeBytes ?? 0;
    done = done.filter((d) => d.fileId !== fileId); // a re-queued file must not also show as done
    updateFile(fileId, { state: 'pending', progress: undefined });
  };

  function tick(ms = tickMs || 500): void {
    if (paused) return;
    let budget = (bps * ms) / 1000;
    while (budget > 0) {
      let current = allFiles().find((f) => f.state === 'syncing');
      if (!current) {
        const next = allFiles().find((f) => f.state === 'pending');
        if (!next) break;
        updateFile(next.id, { state: 'syncing', progress: 0 });
        current = { ...next, state: 'syncing', progress: 0 };
      }
      const size = current.sizeBytes ?? 1;
      const left = size * (1 - (current.progress ?? 0));
      const used = Math.min(left, budget);
      budget -= used;
      passDone += used;
      if (used >= left) {
        updateFile(current.id, { state: 'synced', progress: undefined });
        done = [{ fileId: current.id, name: current.name, progress: 1, status: 'done' as const }, ...done].slice(0, 3);
        activity.set([
          { id: `e${++eventSeq}`, fileName: current.name, detailKey: 'activity.editedHere', at: now().toISOString() },
          ...activity.get(),
        ]);
      } else {
        updateFile(current.id, { progress: (current.progress ?? 0) + used / size });
      }
    }
    refresh();
  }

  const timer = tickMs > 0 ? setInterval(() => tick(tickMs), tickMs) : undefined;

  return {
    overview: () => overview,
    list: (folderId) => map(folders, (f) => f[folderId] ?? []),
    recent: (limit) =>
      map(folders, (f) =>
        Object.values(f)
          .flat()
          .filter((x) => x.kind === 'file')
          .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
          .slice(0, limit),
      ),
    devices: () => devices,
    activity: (limit) => map(activity, (a) => a.slice(0, limit)),
    queue: () => queue,
    conflicts: () => conflicts,
    async pause() {
      paused = true;
      refresh();
    },
    async resume() {
      paused = false;
      refresh();
    },
    async syncNow() {
      if (paused) {
        paused = false;
      } else if (active().length === 0) {
        // Simulate a sync pass that finds one locally changed file.
        const candidate = allFiles().find((f) => f.kind === 'file' && f.state === 'synced');
        if (candidate) {
          updateFile(candidate.id, { modifiedAt: now().toISOString() });
          enqueue(candidate.id);
        }
      }
      refresh();
    },
    async getConflict(id) {
      const c = conflicts.get().find((x) => x.id === id);
      if (!c) throw new Error(`Conflict not found: ${id}`);
      return c;
    },
    async resolve(id, r: ConflictResolution) {
      const c = conflicts.get().find((x) => x.id === id);
      if (!c) throw new Error(`Conflict not found: ${id}`);
      conflicts.set(conflicts.get().filter((x) => x.id !== id));
      if (r === 'keepRemote') {
        updateFile(c.fileId, { state: 'synced', conflictId: undefined, sizeBytes: c.remote.sizeBytes, modifiedAt: c.remote.modifiedAt });
      } else if (r === 'keepLocal') {
        updateFile(c.fileId, { conflictId: undefined, sizeBytes: c.local.sizeBytes, modifiedAt: c.local.modifiedAt });
        enqueue(c.fileId);
      } else {
        // Keep both: the remote version stays under the original name, local becomes a copy.
        updateFile(c.fileId, { state: 'synced', conflictId: undefined, sizeBytes: c.remote.sizeBytes, modifiedAt: c.remote.modifiedAt });
        const copyId = `${c.fileId}-copy`;
        addFile(folderOf(c.fileId), {
          id: copyId,
          name: keepBothCopyName(c.fileName, c.local.deviceName),
          kind: 'file',
          state: 'pending',
          modifiedAt: c.local.modifiedAt,
          sizeBytes: c.local.sizeBytes,
        });
        startNewPassIfIdle();
        passTotal += c.local.sizeBytes;
      }
      refresh();
    },
    settings: () => settings,
    async updateSettings(p) {
      settings.set({ ...settings.get(), ...p });
    },
    async quota(): Promise<StorageQuota> {
      return { usedBytes: Math.round(42.8 * GB), totalBytes: 200 * GB };
    },
    async fileInfo(id) {
      const f = allFiles().find((x) => x.id === id);
      if (!f) throw new Error(`Not found: ${id}`);
      const me = deviceById(currentId);
      return {
        id: f.id, name: f.name, kind: f.kind, state: f.state, progress: f.progress, conflictId: f.conflictId,
        sizeBytes: f.sizeBytes, modifiedAt: f.modifiedAt, modifiedBy: me.name, folderLabel: 'Asiakasprojekti',
        relativePath: f.name, absolutePath: `/mock/Asiakasprojekti/${f.name}`, parentAbsolutePath: '/mock/Asiakasprojekti',
        availableOn: devices.get().filter((d) => d.online).map((d) => d.name),
      };
    },
    async myDevice() {
      const d = deviceById(currentId);
      return { deviceId: `${d.id.toUpperCase().padEnd(7, 'X').slice(0, 7)}-MOCKMOC-KMOCKMO-CKMOCKM-OCKMOCK-MOCKMOC-KMOCKMO-CKMOCKM`, name: d.name };
    },
    pendingDevices: () => pending,
    async addDevice(deviceId, name) {
      pending.set(pending.get().filter((p) => p.deviceId !== deviceId));
      devices.set([
        ...devices.get(),
        { id: deviceId, name, nameGenitive: `laitteen ${name}`, type: 'computer', isCurrent: false, online: true, lastSyncAt: now().toISOString(), activity: 'idle' },
      ]);
    },
    async dismissPendingDevice(deviceId) {
      pending.set(pending.get().filter((p) => p.deviceId !== deviceId));
    },
    async addFolder(path, label) {
      const id = `f-${label.toLowerCase()}`;
      addFile(ROOT_FOLDER, { id, name: label || path, kind: 'folder', state: 'synced', modifiedAt: now().toISOString(), childCount: 0 });
    },
    tick,
    dispose() {
      if (timer) clearInterval(timer);
    },
  };
}
