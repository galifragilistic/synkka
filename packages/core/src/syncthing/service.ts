// SyncService backed by a running Syncthing instance (REST API + event long-poll).
// The UI keeps using the same SyncService interface as with the mock.
import { keepBothCopyName } from '../conflict';
import { Store, map } from '../observable';
import type {
  ActivityEvent, Conflict, ConflictResolution, ConflictVersion, Device, FileItem, Network, Observable,
  PendingDevice, QueueItem, StorageQuota, SyncOverview, SyncService, SyncSettings,
} from '../types';
import {
  SyncthingClient, type StBrowseEntry, type StCompletion, type StConnections, type StDeviceConfig,
  type StDeviceStats, type StEvent, type StFolderConfig, type StFolderStatus, type StNeed,
} from './client';
import { isConflictName, normalizeDeviceId, parseConflictName, shortId, versionsPath } from './conflicts';

export const ROOT = 'root';

/** Folder ids used by list(): "root" or "<syncthingFolderId>:<relative/path>". */
export function folderListId(folder: string, path = ''): string {
  return `${folder}:${path}`;
}
export function parseFolderListId(id: string): { folder: string; path: string } | null {
  if (id === ROOT) return null;
  const i = id.indexOf(':');
  return i < 0 ? null : { folder: id.slice(0, i), path: id.slice(i + 1) };
}

export interface FileOps {
  /** Move `from` to `to` (absolute paths), creating parent directories; replace `to` when overwrite. */
  rename(from: string, to: string, overwrite: boolean): Promise<void>;
}

export interface SyncthingPlatform {
  fileOps: FileOps;
  diskUsage(): Promise<StorageQuota>;
  network?: () => Network;
  currentDeviceType: Device['type'];
  settingsStorage?: { load(): Promise<Partial<SyncSettings> | null>; save(s: SyncSettings): Promise<void> };
  onSettingsChange?: (s: SyncSettings) => void;
  /** Base directory for folders auto-accepted from other devices (e.g. /storage/emulated/0/Synkka). */
  defaultFolderPath?: string;
  pathSeparator?: '/' | '\\';
}

export type EngineState = { state: 'starting' } | { state: 'ready' } | { state: 'error'; error: string };

export interface SyncthingSyncService extends SyncService {
  engine(): Observable<EngineState>;
  start(): Promise<void>;
  dispose(): void;
}

const HIDDEN = new Set(['.stfolder', '.stversions', '.stignore', '.stglobalignore']);
const isDir = (e: { type: string }) => e.type.includes('DIRECTORY');
const basename = (p: string) => p.slice(p.lastIndexOf('/') + 1);
const validTime = (iso: string | undefined) => !!iso && !iso.startsWith('0001') && !iso.startsWith('1970');
const guessType = (name: string): Device['type'] =>
  /android|phone|pixel|galaxy|sm-|iphone|puhelin/i.test(name) ? 'phone' : 'computer';

export function createSyncthingService(client: SyncthingClient, platform: SyncthingPlatform): SyncthingSyncService {
  const sep = platform.pathSeparator ?? '/';
  const join = (base: string, rel: string) => base.replace(/[\\/]+$/, '') + sep + rel.split('/').join(sep);

  // ---- raw state ----
  let myId = '';
  let devCfg: StDeviceConfig[] = [];
  let folderCfg: StFolderConfig[] = [];
  let conns: StConnections | null = null;
  let prevTotals: { at: number; bytes: number } | null = null;
  let rate = 0;
  let devStats: StDeviceStats = {};
  let statuses: Record<string, StFolderStatus> = {};
  let needs: Record<string, StNeed> = {};
  let remote: Record<string, StCompletion> = {}; // key folder|device
  const dlProgress = new Map<string, number>(); // "folder:path" -> 0..1
  let done: QueueItem[] = [];
  const conflictMap = new Map<string, Conflict>();
  /** conflictId -> device ID of the version stored in the conflict copy. */
  const copyDevice = new Map<string, string>();
  const activityList: ActivityEvent[] = [];
  const recentMeta = new Map<string, FileItem>(); // "folder:path" -> item
  let passMax = 0;
  let disposed = false;
  let since = 0;
  let paused = false;

  // ---- observable state ----
  const engine = new Store<EngineState>({ state: 'starting' });
  const overview = new Store<SyncOverview>({ activeCount: 0, bytesDone: 0, bytesTotal: 0, network: 'unknown', paused: false, conflictCount: 0 });
  const devices = new Store<Device[]>([]);
  const queue = new Store<QueueItem[]>([]);
  const conflicts = new Store<Conflict[]>([]);
  const activity = new Store<ActivityEvent[]>([]);
  const recent = new Store<FileItem[]>([]);
  const pending = new Store<PendingDevice[]>([]);
  const settings = new Store<SyncSettings>({ wifiOnly: true, photoBackup: false, batterySaver: false });
  const lists = new Map<string, { store: Store<FileItem[]>; subscribers: number }>();

  const deviceName = (id: string) => devCfg.find((d) => d.deviceID === id)?.name || shortId(id);
  const deviceByShort = (s: string) => devCfg.find((d) => shortId(d.deviceID) === s);
  const remoteDevicesOf = (f: StFolderConfig) => f.devices.map((d) => d.deviceID).filter((id) => id !== myId);

  // ---- per-path sync state ----
  function stateOf(folder: string, path: string, dir: boolean): Pick<FileItem, 'state' | 'progress' | 'conflictId'> {
    for (const c of conflictMap.values()) {
      const f = parseFolderListId(c.fileId)!;
      if (f.folder === folder && (f.path === path || (dir && f.path.startsWith(path + '/')))) {
        return { state: 'conflict', conflictId: dir ? undefined : c.id };
      }
    }
    const n = needs[folder];
    if (n) {
      const match = (x: { name: string }) => x.name === path || (dir && x.name.startsWith(path + '/'));
      if (n.progress.some(match)) return { state: 'syncing', progress: dlProgress.get(`${folder}:${path}`) ?? 0 };
      if (n.queued.some(match) || n.rest.some(match)) return { state: 'pending' };
    }
    return { state: 'synced' };
  }

  function rootItems(): FileItem[] {
    return folderCfg.map((f) => {
      const s = statuses[f.id];
      const busy = s && s.needTotalItems > 0;
      const hasConflict = [...conflictMap.values()].some((c) => parseFolderListId(c.fileId)!.folder === f.id);
      return {
        id: folderListId(f.id),
        name: f.label || f.id,
        kind: 'folder',
        state: hasConflict ? 'conflict' : busy ? 'syncing' : 'synced',
        progress: busy && s.globalBytes ? s.inSyncBytes / s.globalBytes : undefined,
        modifiedAt: new Date().toISOString(),
        childCount: s ? s.localFiles : undefined,
      } satisfies FileItem;
    });
  }

  function toItem(folder: string, prefix: string, e: StBrowseEntry): FileItem {
    const path = prefix ? `${prefix}/${e.name}` : e.name;
    const dir = isDir(e);
    return {
      id: folderListId(folder, path),
      name: e.name,
      kind: dir ? 'folder' : 'file',
      modifiedAt: e.modTime,
      sizeBytes: dir ? undefined : e.size,
      ...stateOf(folder, path, dir),
    };
  }

  async function loadList(id: string): Promise<void> {
    const entry = lists.get(id);
    if (!entry) return;
    if (id === ROOT) {
      entry.store.set(rootItems());
      return;
    }
    const p = parseFolderListId(id);
    if (!p) return;
    try {
      const entries = await client.browse(p.folder, p.path, 0);
      const items = (entries ?? [])
        .filter((e) => !HIDDEN.has(e.name) && !isConflictName(e.name))
        .map((e) => toItem(p.folder, p.path, e))
        .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'fi') : a.kind === 'folder' ? -1 : 1));
      entry.store.set(items);
    } catch {
      entry.store.set([]);
    }
  }

  // ---- conflicts ----
  /** `device` is a full device ID when known, otherwise the short ID from the file metadata/name. */
  function versionFor(device: string, modifiedAt: string, sizeBytes: number): ConflictVersion {
    const id = device.length > 7 ? device : deviceByShort(device)?.deviceID ?? (shortId(myId) === device ? myId : device);
    const name = deviceName(id);
    const isMe = id === myId;
    return {
      deviceId: id,
      deviceName: name,
      deviceGenitive: `laitteen ${name}`,
      deviceType: isMe ? platform.currentDeviceType : guessType(name),
      isCurrentDevice: isMe,
      modifiedAt,
      sizeBytes,
    };
  }

  async function inspectConflict(folder: string, copyPath: string): Promise<void> {
    const parsed = parseConflictName(copyPath);
    if (!parsed) return;
    const id = folderListId(folder, copyPath);
    try {
      const [copy, orig] = await Promise.all([client.file(folder, copyPath), client.file(folder, parsed.original)]);
      const copyInfo = copy.local ?? copy.global;
      const origInfo = orig.global ?? orig.local;
      if (!copyInfo || copyInfo.deleted || !origInfo || origInfo.deleted) {
        conflictMap.delete(id);
        return;
      }
      const original = versionFor(origInfo.modifiedBy, origInfo.modified, origInfo.size);
      // The name suffix is not always the losing version's author (it can repeat the winner's ID);
      // the copy's own modifiedBy (the device that wrote it locally) disambiguates.
      const copyBy = [parsed.shortDeviceId, copyInfo.modifiedBy].find((x) => x && x !== origInfo.modifiedBy) ?? parsed.shortDeviceId;
      const conflicting = versionFor(copyBy, copyInfo.modified, copyInfo.size);
      const copyIsLocal = conflicting.isCurrentDevice && !original.isCurrentDevice;
      copyDevice.set(id, conflicting.deviceId);
      if (!conflictMap.has(id)) {
        pushActivity({ fileName: basename(parsed.original), detailKey: 'activity.editedConcurrently', at: new Date().toISOString() });
      }
      conflictMap.set(id, {
        id,
        fileId: folderListId(folder, parsed.original),
        fileName: basename(parsed.original),
        local: copyIsLocal ? conflicting : original,
        remote: copyIsLocal ? original : conflicting,
      });
    } catch {
      /* folder gone or file vanished: ignore */
    }
  }

  async function scanConflicts(): Promise<void> {
    const walk = (folder: string, entries: StBrowseEntry[], prefix: string, out: string[]) => {
      for (const e of entries ?? []) {
        if (HIDDEN.has(e.name)) continue;
        const p = prefix ? `${prefix}/${e.name}` : e.name;
        if (isDir(e)) walk(folder, e.children ?? [], p, out);
        else if (isConflictName(e.name)) out.push(p);
      }
    };
    conflictMap.clear();
    for (const f of folderCfg) {
      try {
        const tree = (await client.browse(f.id, '', -1 as unknown as number)) ?? [];
        const found: string[] = [];
        walk(f.id, tree, '', found);
        await Promise.all(found.map((p) => inspectConflict(f.id, p)));
      } catch {
        /* ignore */
      }
    }
    publish();
  }

  // ---- activity & recent ----
  let activitySeq = 0;
  function pushActivity(e: Omit<ActivityEvent, 'id'>) {
    activityList.unshift({ id: `a${++activitySeq}`, ...e });
    activityList.length = Math.min(activityList.length, 50);
    activity.set([...activityList]);
  }

  async function noteChange(folder: string, path: string, action: string, by: string | undefined, local: boolean) {
    if (isConflictName(path) || path.split('/').some((s) => HIDDEN.has(s))) return;
    const deleted = action === 'deleted';
    const device = by ? deviceByShort(by)?.name ?? by : undefined;
    pushActivity({
      fileName: basename(path),
      detailKey: deleted ? (local ? 'activity.deletedHere' : 'activity.deletedOn') : local ? 'activity.editedHere' : 'activity.editedOn',
      detailParams: device ? { device } : undefined,
      at: new Date().toISOString(),
    });
    const key = folderListId(folder, path);
    if (deleted) {
      recentMeta.delete(key);
    } else {
      try {
        const f = await client.file(folder, path);
        const info = f.local ?? f.global;
        if (info && !info.deleted && !isDir(f.global ?? { type: '' })) {
          recentMeta.delete(key);
          recentMeta.set(key, { id: key, name: basename(path), kind: 'file', modifiedAt: info.modified, sizeBytes: info.size, state: 'synced' });
        }
      } catch {
        /* ignore */
      }
    }
    publishRecent();
  }

  function publishRecent() {
    const items = [...recentMeta.values()]
      .reverse()
      .map((it) => {
        const p = parseFolderListId(it.id)!;
        return { ...it, ...stateOf(p.folder, p.path, false) };
      })
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    recent.set(items);
  }

  // ---- derived publishing ----
  function publish() {
    const remoteConnected = (id: string) => !!conns?.connections[id]?.connected;
    let activeCount = 0;
    let needBytes = 0;
    for (const f of folderCfg) {
      const s = statuses[f.id];
      if (s) {
        activeCount += s.needFiles;
        needBytes += s.needBytes;
      }
      for (const d of remoteDevicesOf(f)) {
        const c = remote[`${f.id}|${d}`];
        if (c && remoteConnected(d)) {
          activeCount += c.needItems;
          needBytes += c.needBytes;
        }
      }
    }
    if (needBytes > 0) passMax = Math.max(passMax, needBytes);
    const others = devCfg.filter((d) => d.deviceID !== myId);
    paused = others.length > 0 && others.every((d) => d.paused);
    overview.set({
      activeCount,
      bytesDone: needBytes > 0 ? passMax - needBytes : passMax,
      bytesTotal: passMax,
      network: platform.network?.() ?? 'unknown',
      etaSeconds: needBytes > 0 && rate > 0 ? Math.ceil(needBytes / rate) : undefined,
      paused,
      conflictCount: conflictMap.size,
    });
    if (needBytes === 0 && activeCount === 0) passMax = 0;

    const busy = activeCount > 0 && !paused;
    devices.set(
      devCfg
        .map<Device>((d) => {
          const isMe = d.deviceID === myId;
          const c = conns?.connections[d.deviceID];
          const lastSeen = devStats[d.deviceID]?.lastSeen;
          const remoteBusy = folderCfg.some((f) => {
            const x = remote[`${f.id}|${d.deviceID}`];
            return x && x.needItems > 0;
          });
          return {
            id: d.deviceID,
            name: d.name || shortId(d.deviceID),
            nameGenitive: `laitteen ${d.name || shortId(d.deviceID)}`,
            type: isMe ? platform.currentDeviceType : guessType(d.name),
            isCurrent: isMe,
            online: isMe || !!c?.connected,
            lastSyncAt: isMe ? new Date().toISOString() : validTime(lastSeen) ? lastSeen! : '',
            activity: (isMe ? busy : !!c?.connected && remoteBusy) ? 'syncing' : 'idle',
          };
        })
        .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent)),
    );

    const q: QueueItem[] = [];
    for (const f of folderCfg) {
      const n = needs[f.id];
      if (!n) continue;
      for (const x of n.progress) {
        q.push({ fileId: folderListId(f.id, x.name), name: basename(x.name), progress: dlProgress.get(`${f.id}:${x.name}`) ?? 0, status: 'uploading' });
      }
      for (const x of [...n.queued, ...n.rest]) {
        q.push({ fileId: folderListId(f.id, x.name), name: basename(x.name), progress: 0, status: 'queued' });
      }
    }
    const activeIds = new Set(q.map((x) => x.fileId));
    queue.set([...q.slice(0, 20), ...done.filter((d) => !activeIds.has(d.fileId))]);
    conflicts.set([...conflictMap.values()]);
    for (const id of lists.keys()) void loadList(id);
    publishRecent();
  }

  // ---- refresh ----
  async function refreshAll(): Promise<void> {
    const [d, f, c, st, pd] = await Promise.all([
      client.devices(), client.folders(), client.connections(), client.deviceStats(), client.pendingDevices(),
    ]);
    devCfg = d;
    folderCfg = f;
    devStats = st;
    const now = Date.now();
    const totalBytes = c.total.inBytesTotal + c.total.outBytesTotal;
    if (prevTotals && now > prevTotals.at) {
      const r = ((totalBytes - prevTotals.bytes) * 1000) / (now - prevTotals.at);
      rate = rate ? rate * 0.6 + r * 0.4 : r; // smoothed bytes/s
    }
    prevTotals = { at: now, bytes: totalBytes };
    conns = c;
    pending.set(
      Object.entries(pd ?? {}).map(([deviceId, p]) => ({ deviceId, name: p.name || shortId(deviceId), address: p.address, at: p.time })),
    );
    const nextStatuses: typeof statuses = {};
    const nextNeeds: typeof needs = {};
    const nextRemote: typeof remote = {};
    await Promise.all(
      folderCfg.map(async (fc) => {
        const [s, n] = await Promise.all([client.folderStatus(fc.id).catch(() => undefined), client.need(fc.id).catch(() => undefined)]);
        if (s) nextStatuses[fc.id] = s;
        if (n) nextNeeds[fc.id] = n;
        await Promise.all(
          remoteDevicesOf(fc)
            .filter((dev) => c.connections[dev]?.connected)
            .map(async (dev) => {
              const comp = await client.completion(fc.id, dev).catch(() => undefined);
              if (comp) nextRemote[`${fc.id}|${dev}`] = comp;
            }),
        );
      }),
    );
    statuses = nextStatuses;
    needs = nextNeeds;
    remote = nextRemote;
    publish();
  }

  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleRefresh = (ms = 300) => {
    if (refreshTimer || disposed) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      refreshAll().catch(() => {});
    }, ms);
  };

  async function handleEvent(e: StEvent) {
    switch (e.type) {
      case 'DownloadProgress':
        dlProgress.clear();
        for (const [folder, files] of Object.entries<Record<string, { bytesDone: number; bytesTotal: number }>>(e.data ?? {})) {
          for (const [path, p] of Object.entries(files)) dlProgress.set(`${folder}:${path}`, p.bytesTotal ? p.bytesDone / p.bytesTotal : 0);
        }
        break;
      case 'ItemFinished':
        if (!e.data.error && e.data.type === 'file' && !isConflictName(e.data.item)) {
          const fileId = folderListId(e.data.folder, e.data.item);
          done = [{ fileId, name: basename(e.data.item), progress: 1, status: 'done' as const }, ...done.filter((d) => d.fileId !== fileId)].slice(0, 3);
        }
        break;
      case 'LocalChangeDetected':
      case 'RemoteChangeDetected':
        void noteChange(e.data.folder, e.data.path, e.data.action, e.data.modifiedBy, e.type === 'LocalChangeDetected');
        break;
      case 'LocalIndexUpdated':
      case 'RemoteIndexUpdated': {
        const names: string[] = e.data.filenames ?? [];
        const touched = names.filter(isConflictName);
        // A conflict copy appeared or vanished, or an original we track changed.
        for (const c of [...conflictMap.values()]) {
          const p = parseFolderListId(c.id)!;
          if (p.folder === e.data.folder && names.some((n) => n === p.path || n === parseFolderListId(c.fileId)!.path)) touched.push(p.path);
        }
        await Promise.all([...new Set(touched)].map((p) => inspectConflict(e.data.folder, p)));
        break;
      }
      case 'ConfigSaved':
        // New folders (e.g. auto-accepted) need a conflict scan.
        setTimeout(() => void scanConflicts(), 1000);
        break;
    }
    scheduleRefresh();
  }

  async function eventLoop() {
    while (!disposed) {
      try {
        const events = await client.events(since, 60);
        for (const e of events ?? []) {
          since = Math.max(since, e.id);
          await handleEvent(e);
        }
      } catch {
        if (disposed) return;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  const fallback = setInterval(() => scheduleRefresh(0), 5000);

  const folderOf = (id: string) => {
    const f = folderCfg.find((x) => x.id === id);
    if (!f) throw new Error(`Unknown folder ${id}`);
    return f;
  };

  const service: SyncthingSyncService = {
    engine: () => engine,
    async start() {
      try {
        engine.set({ state: 'starting' });
        // Wait for the REST API to come up (the engine may still be starting).
        for (let i = 0; ; i++) {
          try {
            await client.ping();
            break;
          } catch (err) {
            if (i > 60) throw err;
            await new Promise((r) => setTimeout(r, 500));
          }
        }
        myId = (await client.status()).myID;
        // Folders accepted from other devices keep rejected versions 30 days (copy: conflict.historyNote).
        await client
          .patchDefaultsFolder({
            versioning: { type: 'trashcan', params: { cleanoutDays: '30' }, cleanupIntervalS: 3600 },
            ...(platform.defaultFolderPath ? { path: platform.defaultFolderPath } : {}),
          })
          .catch(() => {});
        const stored = await platform.settingsStorage?.load().catch(() => null);
        if (stored) settings.set({ ...settings.get(), ...stored });
        await refreshAll();
        await scanConflicts();
        engine.set({ state: 'ready' });
        void eventLoop();
      } catch (err) {
        engine.set({ state: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    },
    dispose() {
      disposed = true;
      clearInterval(fallback);
      if (refreshTimer) clearTimeout(refreshTimer);
    },

    overview: () => overview,
    list(folderId) {
      return {
        subscribe(listener) {
          let entry = lists.get(folderId);
          if (!entry) {
            entry = { store: new Store<FileItem[]>([]), subscribers: 0 };
            lists.set(folderId, entry);
            void loadList(folderId);
          }
          entry.subscribers++;
          const unsub = entry.store.subscribe(listener);
          return () => {
            unsub();
            entry!.subscribers--;
            if (entry!.subscribers <= 0) lists.delete(folderId);
          };
        },
      };
    },
    recent: (limit) => map(recent, (r) => r.slice(0, limit)),
    devices: () => devices,
    activity: (limit) => map(activity, (a) => a.slice(0, limit)),
    queue: () => queue,
    conflicts: () => conflicts,
    async pause() {
      await client.pauseAll();
      await refreshAll();
    },
    async resume() {
      await client.resumeAll();
      await refreshAll();
    },
    async syncNow() {
      if (paused) await client.resumeAll();
      await client.scan();
      await refreshAll();
    },
    async getConflict(id) {
      const c = conflictMap.get(id);
      if (!c) throw new Error(`Conflict not found: ${id}`);
      return c;
    },
    async resolve(id, r: ConflictResolution) {
      const c = conflictMap.get(id);
      if (!c) throw new Error(`Conflict not found: ${id}`);
      const copy = parseFolderListId(c.id)!;
      const orig = parseFolderListId(c.fileId)!;
      const f = folderOf(copy.folder);
      const abs = (rel: string) => join(f.path, rel);
      const stamp = (rel: string) => {
        const d = new Date();
        const ts = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
        const dot = rel.lastIndexOf('.');
        return dot > rel.lastIndexOf('/') ? `${rel.slice(0, dot)}~${ts}${rel.slice(dot)}` : `${rel}~${ts}`;
      };
      // Which physical file holds which version: the conflict copy is the version whose device made it.
      const copyIsLocal = copyDevice.get(id) === c.local.deviceId && c.local.deviceId !== c.remote.deviceId;
      const keepCopy = (r === 'keepLocal' && copyIsLocal) || (r === 'keepRemote' && !copyIsLocal);
      if (r === 'keepBoth') {
        const copyVersion = copyIsLocal ? c.local : c.remote;
        await platform.fileOps.rename(abs(copy.path), abs(keepBothCopyName(orig.path, copyVersion.deviceName)), false);
      } else if (keepCopy) {
        // Rejected original goes to .stversions (restorable for 30 days), then the copy takes its name.
        await platform.fileOps.rename(abs(orig.path), abs(versionsPath(stamp(orig.path))), false);
        await platform.fileOps.rename(abs(copy.path), abs(orig.path), true);
      } else {
        await platform.fileOps.rename(abs(copy.path), abs(versionsPath(stamp(orig.path))), false);
      }
      conflictMap.delete(id);
      copyDevice.delete(id);
      await client.scan(copy.folder).catch(() => {});
      await refreshAll();
    },
    settings: () => settings,
    async updateSettings(p) {
      const next = { ...settings.get(), ...p };
      settings.set(next);
      platform.onSettingsChange?.(next);
      await platform.settingsStorage?.save(next);
    },
    quota: () => platform.diskUsage(),

    async myDevice() {
      if (!myId) myId = (await client.status()).myID;
      return { deviceId: myId, name: deviceName(myId) };
    },
    pendingDevices: () => pending,
    async addDevice(input, name) {
      const deviceID = normalizeDeviceId(input);
      if (!deviceID) throw new Error('invalid-device-id');
      await client.putDevice({ deviceID, name, addresses: ['dynamic'], autoAcceptFolders: true, paused: false });
      // Share every folder with the new device (all devices belong to the same person).
      for (const f of folderCfg) {
        if (!f.devices.some((d) => d.deviceID === deviceID)) {
          await client.patchFolder(f.id, { devices: [...f.devices, { deviceID }] });
        }
      }
      await refreshAll();
    },
    async dismissPendingDevice(deviceId) {
      await client.dismissPendingDevice(deviceId);
      await refreshAll();
    },
    async addFolder(path, label) {
      const slug = (label || basename(path) || 'kansio').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'kansio';
      const id = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
      await client.putFolder({
        id,
        label: label || basename(path),
        path,
        type: 'sendreceive',
        devices: devCfg.map((d) => ({ deviceID: d.deviceID })),
        versioning: { type: 'trashcan', params: { cleanoutDays: '30' }, cleanupIntervalS: 3600 },
      });
      await refreshAll();
    },
  };
  return service;
}
