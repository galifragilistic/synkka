// SyncService backed by a running Syncthing instance (REST API + event long-poll).
// The UI keeps using the same SyncService interface as with the mock.
import { keepBothCopyName } from '../conflict';
import { Store, map } from '../observable';
import type {
  ActivityEvent, Conflict, ConflictResolution, ConflictVersion, Device, FileDetails, FileItem, Network, Observable,
  PendingDevice, QueueItem, SharedFolder, StorageQuota, SyncOverview, SyncService, SyncSettings, VersionEntry,
} from '../types';
import {
  SyncthingClient, type StBrowseEntry, type StCompletion, type StConnections, type StDeviceConfig,
  type StDeviceStats, type StEvent, type StFolderConfig, type StFolderStatus, type StNeed,
} from './client';
import { describeSyncError } from './errors';
import { isConflictName, normalizeDeviceId, parseConflictName, shortId, versionsPath, withVersionTag } from './conflicts';

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
  /** Read/write the shared ignore file (".stglobalignore" in a folder root). null when it doesn't exist. */
  readSharedIgnores(folderPath: string): Promise<string | null>;
  writeSharedIgnores(folderPath: string, content: string): Promise<void>;
}

/** Synced file holding the ignore rules shared by all devices; each .stignore includes it. */
export const SHARED_IGNORE_FILE = '.stglobalignore';
const INCLUDE_LINE = `#include ${SHARED_IGNORE_FILE}`;
const SHARED_HEADER = '// Synkka: jaetut ohitussäännöt (synkronoidaan kaikille laitteille)';
const splitLines = (text: string) => text.split(/\r?\n/).map((l) => l.trimEnd());

export interface SyncthingPlatform {
  fileOps: FileOps;
  diskUsage(): Promise<StorageQuota>;
  network?: () => Network;
  currentDeviceType: Device['type'];
  settingsStorage?: { load(): Promise<Partial<SyncSettings> | null>; save(s: SyncSettings): Promise<void> };
  onSettingsChange?: (s: SyncSettings) => void;
  /**
   * Ignore Unix permission bits (Android shared storage cannot keep them; without this every
   * received file looks locally modified and is re-announced as changed by this device).
   */
  ignorePermissions?: boolean;
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

const RECENT_SEED = 50;
/**
 * Version history for Roskakori: Syncthing's "simple" versioner keeps tagged versions
 * ("name~YYYYMMDD-HHMMSS.ext") and can restore them; "trashcan" keeps one untagged copy and
 * cannot restore tagged ones. Rejected/replaced versions are kept 30 days (conflict.historyNote).
 */
const VERSIONING = { type: 'simple', params: { keep: '10', cleanoutDays: '30' }, cleanupIntervalS: 3600 };
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
  /** Failed items per folder: path -> raw error. */
  let pullErrors: Record<string, Map<string, string>> = {};
  let remote: Record<string, StCompletion> = {}; // key folder|device
  const dlProgress = new Map<string, number>(); // "folder:path" -> 0..1
  let done: QueueItem[] = [];
  /** One conflict per original file (id = "folder:originalPath"), however many copies it has. */
  const conflictMap = new Map<string, Conflict>();
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
  const shared = new Store<SharedFolder[]>([]);
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

  /** Conflict copies grouped by original ("folder:path" of the original). */
  interface CopyInfo {
    path: string;
    /** Device (short or full ID) whose version the copy holds. */
    device: string;
    modifiedAt: string;
    sizeBytes: number;
    /** Creation time from the copy's name; newest copy is the one offered for resolution. */
    at: number;
  }
  const copies = new Map<string, Map<string, CopyInfo>>();
  const originals = new Map<string, { modifiedBy: string; modified: string; size: number }>();
  /** conflictId -> { copy shown in the dialog, whether that copy is the "local" side }. */
  const shown = new Map<string, { copy: string; copyIsLocal: boolean }>();

  function rebuildConflict(folder: string, original: string, announce: boolean) {
    const id = folderListId(folder, original);
    const group = copies.get(id);
    const orig = originals.get(id);
    if (!group || group.size === 0 || !orig) {
      conflictMap.delete(id);
      shown.delete(id);
      copies.delete(id);
      return;
    }
    const list = [...group.values()].sort((a, b) => b.at - a.at || b.modifiedAt.localeCompare(a.modifiedAt));
    const newest = list[0];
    const original_ = versionFor(orig.modifiedBy, orig.modified, orig.size);
    const conflicting = versionFor(newest.device, newest.modifiedAt, newest.sizeBytes);
    const copyIsLocal = !!conflicting.isCurrentDevice && !original_.isCurrentDevice;
    if (announce && !conflictMap.has(id)) {
      pushActivity({ fileName: basename(original), detailKey: 'activity.editedConcurrently', at: new Date().toISOString() });
    }
    shown.set(id, { copy: newest.path, copyIsLocal });
    conflictMap.set(id, {
      id,
      fileId: id,
      fileName: basename(original),
      local: copyIsLocal ? conflicting : original_,
      remote: copyIsLocal ? original_ : conflicting,
      olderCopies: list.length - 1,
    });
  }

  /** (Re)reads one conflict copy and its original, then rebuilds that file's conflict. */
  async function inspectConflict(folder: string, copyPath: string, announce = true): Promise<void> {
    const parsed = parseConflictName(copyPath);
    if (!parsed) return;
    const key = folderListId(folder, parsed.original);
    try {
      const [copy, orig] = await Promise.all([client.file(folder, copyPath), client.file(folder, parsed.original)]);
      const copyInfo = copy.local ?? copy.global;
      const origInfo = orig.global ?? orig.local;
      const group = copies.get(key) ?? new Map<string, CopyInfo>();
      if (!copyInfo || copyInfo.deleted || !origInfo || origInfo.deleted) {
        group.delete(copyPath);
      } else {
        originals.set(key, { modifiedBy: origInfo.modifiedBy, modified: origInfo.modified, size: origInfo.size });
        // The name suffix is not always the losing version's author (it can repeat the winner's ID);
        // the copy's own modifiedBy (the device that wrote it locally) disambiguates.
        const device = [parsed.shortDeviceId, copyInfo.modifiedBy].find((x) => x && x !== origInfo.modifiedBy) ?? parsed.shortDeviceId;
        group.set(copyPath, { path: copyPath, device, modifiedAt: copyInfo.modified, sizeBytes: copyInfo.size, at: parsed.at.getTime() });
      }
      copies.set(key, group);
      rebuildConflict(folder, parsed.original, announce);
    } catch {
      /* folder gone or file vanished: ignore */
    }
  }

  /**
   * Keeps "#include .stglobalignore" in a folder's .stignore exactly when the shared file exists
   * here (a missing include target stops the folder with a load error).
   */
  async function ensureInclude(folderId: string): Promise<void> {
    const f = folderCfg.find((x) => x.id === folderId);
    if (!f) return;
    try {
      const exists = (await platform.fileOps.readSharedIgnores(f.path)) !== null;
      const lines = (await client.ignores(folderId)).ignore ?? [];
      const has = lines.includes(INCLUDE_LINE);
      if (exists && !has) await client.setIgnores(folderId, [INCLUDE_LINE, ...lines]);
      if (!exists && has) await client.setIgnores(folderId, lines.filter((l) => l !== INCLUDE_LINE));
    } catch {
      /* folder not ready yet */
    }
  }

  async function scanConflicts(): Promise<void> {
    const files: FileItem[] = [];
    const walk = (folder: string, entries: StBrowseEntry[], prefix: string, out: string[]) => {
      for (const e of entries ?? []) {
        if (HIDDEN.has(e.name)) continue;
        const p = prefix ? `${prefix}/${e.name}` : e.name;
        if (isDir(e)) walk(folder, e.children ?? [], p, out);
        else if (isConflictName(e.name)) out.push(p);
        else files.push({ id: folderListId(folder, p), name: e.name, kind: 'file', modifiedAt: e.modTime, sizeBytes: e.size, state: 'synced' });
      }
    };
    const known = new Set(conflictMap.keys());
    conflictMap.clear();
    copies.clear();
    shown.clear();
    for (const f of folderCfg) {
      try {
        const tree = (await client.browse(f.id, '', -1 as unknown as number)) ?? [];
        const found: string[] = [];
        walk(f.id, tree, '', found);
        // Sequential per folder: copies of one original update the same group.
        for (const p of found) {
          const orig = parseConflictName(p)!.original;
          await inspectConflict(f.id, p, !known.has(folderListId(f.id, orig)) && known.size > 0);
        }
      } catch {
        /* ignore */
      }
    }
    // Seed "Viimeisimmät" with the most recently modified files (events only cover this session).
    for (const f of files.sort((a, b) => a.modifiedAt.localeCompare(b.modifiedAt)).slice(-RECENT_SEED)) {
      if (!recentMeta.has(f.id)) recentMeta.set(f.id, f);
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
    let errorCount = 0;
    for (const f of folderCfg) {
      const s = statuses[f.id];
      if (s) {
        // Items that failed (e.g. a name Android can't store) wait for a fix, not for transfer.
        const failed = pullErrors[f.id]?.size ?? 0;
        activeCount += Math.max(0, s.needFiles - failed);
        needBytes += s.needBytes;
        errorCount += failed;
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
      errorCount,
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

    shared.set(
      folderCfg.map((f) => {
        const root = rootItems().find((r) => r.id === folderListId(f.id));
        return {
          folderId: f.id,
          listId: folderListId(f.id),
          label: f.label || f.id,
          path: f.path,
          state: root?.state ?? 'synced',
          devices: devCfg
            .filter((d) => d.deviceID !== myId)
            .map((d) => ({
              id: d.deviceID,
              name: d.name || shortId(d.deviceID),
              type: guessType(d.name),
              online: !!conns?.connections[d.deviceID]?.connected,
              shared: f.devices.some((x) => x.deviceID === d.deviceID),
            })),
        };
      }),
    );

    const q: QueueItem[] = [];
    for (const f of folderCfg) {
      const n = needs[f.id];
      if (!n) continue;
      for (const x of n.progress) {
        q.push({ fileId: folderListId(f.id, x.name), name: basename(x.name), progress: dlProgress.get(`${f.id}:${x.name}`) ?? 0, status: 'uploading' });
      }
      const errs = pullErrors[f.id];
      for (const x of [...n.queued, ...n.rest]) {
        const err = errs?.get(x.name);
        q.push({
          fileId: folderListId(f.id, x.name),
          name: basename(x.name),
          progress: 0,
          status: err ? 'error' : 'queued',
          error: err ? describeSyncError(x.name, err) : undefined,
        });
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
    const nextErrors: typeof pullErrors = {};
    await Promise.all(
      folderCfg.map(async (fc) => {
        const [s, n] = await Promise.all([client.folderStatus(fc.id).catch(() => undefined), client.need(fc.id).catch(() => undefined)]);
        if (s) nextStatuses[fc.id] = s;
        if (n) nextNeeds[fc.id] = n;
        if (s?.pullErrors) {
          const e = await client.folderErrors(fc.id).catch(() => null);
          nextErrors[fc.id] = new Map((e?.errors ?? []).map((x) => [x.path, x.error]));
        }
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
    pullErrors = nextErrors;
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
        if (names.includes(SHARED_IGNORE_FILE)) await ensureInclude(e.data.folder);
        const touched = new Set(names.filter(isConflictName));
        // An original we track changed: re-check all of its copies.
        for (const [key, group] of copies) {
          const p = parseFolderListId(key)!;
          if (p.folder === e.data.folder && names.includes(p.path)) for (const c of group.keys()) touched.add(c);
        }
        for (const p of touched) await inspectConflict(e.data.folder, p);
        break;
      }
      case 'ConfigSaved':
        // New folders (e.g. auto-accepted) need a conflict scan and the shared-ignore include.
        setTimeout(() => {
          void (async () => {
            for (const f of folderCfg) await ensureInclude(f.id);
            await scanConflicts();
          })();
        }, 1000);
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
            versioning: VERSIONING,
            ...(platform.defaultFolderPath ? { path: platform.defaultFolderPath } : {}),
            ...(platform.ignorePermissions ? { ignorePerms: true } : {}),
          })
          .catch(() => {});
        for (const f of await client.folders()) {
          const patch: Partial<StFolderConfig> = {};
          if (platform.ignorePermissions && !f.ignorePerms) patch.ignorePerms = true;
          // Folders without versioning, or with Synkka's earlier trashcan setting, move to the
          // restorable "simple" versioner; a versioning type the user chose otherwise is kept.
          const v = f.versioning;
          if (!v?.type || (v.type === 'trashcan' && v.params?.cleanoutDays === '30')) patch.versioning = VERSIONING;
          if (Object.keys(patch).length) await client.patchFolder(f.id, patch).catch(() => {});
        }
        const stored = await platform.settingsStorage?.load().catch(() => null);
        if (stored) settings.set({ ...settings.get(), ...stored });
        await refreshAll();
        for (const f of folderCfg) await ensureInclude(f.id);
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
      const view = shown.get(id);
      if (!c || !view) throw new Error(`Conflict not found: ${id}`);
      const orig = parseFolderListId(id)!;
      const f = folderOf(orig.folder);
      const abs = (rel: string) => join(f.path, rel);
      const pad = (n: number) => String(n).padStart(2, '0');
      const d = new Date();
      const nowTag = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
      /**
       * Move a rejected version to version history as a version *of the original file*
       * ("name~TAG.ext"), so Roskakori lists and restores it under the original name. A copy uses
       * the tag from its own conflict name; if that is taken, its unique conflict name is used.
       */
      const retire = async (rel: string, isCopy: boolean) => {
        const tag = isCopy ? parseConflictName(rel)!.tag : nowTag;
        try {
          await platform.fileOps.rename(abs(rel), abs(versionsPath(withVersionTag(orig.path, tag))), false);
        } catch {
          await platform.fileOps.rename(abs(rel), abs(versionsPath(isCopy ? rel : withVersionTag(orig.path, `${nowTag}${Math.random().toString(36).slice(2, 4)}`))), false);
        }
      };
      const others = [...(copies.get(id)?.keys() ?? [])].filter((p) => p !== view.copy);
      const keepCopy = (r === 'keepLocal' && view.copyIsLocal) || (r === 'keepRemote' && !view.copyIsLocal);

      if (r === 'keepBoth') {
        const copyVersion = view.copyIsLocal ? c.local : c.remote;
        const base = keepBothCopyName(orig.path, copyVersion.deviceName);
        const candidates = [base, ...[2, 3, 4, 5].map((n) => keepBothCopyName(orig.path, `${copyVersion.deviceName} ${n}`))];
        let moved = false;
        for (const target of candidates) {
          try {
            await platform.fileOps.rename(abs(view.copy), abs(target), false);
            moved = true;
            break;
          } catch {
            /* name taken: try the next one */
          }
        }
        if (!moved) throw new Error(`Cannot keep both: ${base} exists`);
      } else if (keepCopy) {
        // Rejected original goes to .stversions (restorable for 30 days), then the copy takes its name.
        await retire(orig.path, false);
        await platform.fileOps.rename(abs(view.copy), abs(orig.path), true);
      } else {
        await retire(view.copy, true);
      }
      // Older copies of the same file: version history, so the file is fully resolved.
      for (const p of others) await retire(p, true);

      conflictMap.delete(id);
      shown.delete(id);
      copies.delete(id);
      await client.scan(orig.folder).catch(() => {});
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

    async fileInfo(id): Promise<FileDetails> {
      const p = parseFolderListId(id);
      if (!p) throw new Error(`Not a file id: ${id}`);
      const f = folderOf(p.folder);
      const label = f.label || f.id;
      if (!p.path) {
        const s = statuses[f.id];
        return {
          id, name: label, kind: 'folder', ...stateOf(f.id, '', true), modifiedAt: new Date().toISOString(),
          sizeBytes: s?.localBytes, folderLabel: label, relativePath: '', absolutePath: f.path, parentAbsolutePath: f.path,
          availableOn: [deviceName(myId), ...remoteDevicesOf(f).map(deviceName)],
        };
      }
      const db = await client.file(f.id, p.path);
      const info = db.global ?? db.local;
      if (!info) throw new Error(`File not found: ${p.path}`);
      const dir = isDir(db.global ?? { type: '' });
      const localHas = !!db.local && !db.local.deleted;
      const others = (db.availability ?? []).map((a) => a.id).filter((d) => d !== myId);
      const by = info.modifiedBy ? deviceByShort(info.modifiedBy)?.name ?? (shortId(myId) === info.modifiedBy ? deviceName(myId) : info.modifiedBy) : undefined;
      const slash = p.path.lastIndexOf('/');
      return {
        id,
        name: basename(p.path),
        kind: dir ? 'folder' : 'file',
        ...stateOf(f.id, p.path, dir),
        sizeBytes: dir ? undefined : info.size,
        modifiedAt: info.modified,
        modifiedBy: by,
        folderLabel: label,
        relativePath: p.path,
        absolutePath: localHas ? join(f.path, p.path) : undefined,
        parentAbsolutePath: slash > 0 ? join(f.path, p.path.slice(0, slash)) : f.path.replace(/[\\/]+$/, ''),
        availableOn: [...(localHas ? [deviceName(myId)] : []), ...others.map(deviceName)],
        syncError: pullErrors[f.id]?.has(p.path) ? describeSyncError(p.path, pullErrors[f.id].get(p.path)!) : undefined,
      };
    },

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
    async removeDevice(deviceId) {
      await client.deleteDevice(deviceId);
      await refreshAll();
    },
    sharedFolders: () => shared,
    async setFolderShared(folderId, deviceId, on) {
      const f = folderOf(folderId);
      const devices = on
        ? f.devices.some((x) => x.deviceID === deviceId) ? f.devices : [...f.devices, { deviceID: deviceId }]
        : f.devices.filter((x) => x.deviceID !== deviceId);
      await client.patchFolder(folderId, { devices });
      await refreshAll();
    },
    async getIgnores(folderId) {
      const f = folderOf(folderId);
      const shared = splitLines((await platform.fileOps.readSharedIgnores(f.path)) ?? '').filter((l) => l !== SHARED_HEADER);
      const local = ((await client.ignores(folderId)).ignore ?? []).filter((l) => l !== INCLUDE_LINE);
      const trim = (a: string[]) => {
        while (a.length && !a[a.length - 1].trim()) a.pop();
        return a;
      };
      return { shared: trim(shared), local: trim(local) };
    },
    async setIgnores(folderId, rules) {
      const f = folderOf(folderId);
      const clean = (a: string[]) => a.map((l) => l.trimEnd()).filter((l, i, all) => l || (i > 0 && all[i - 1]));
      const shared = clean(rules.shared);
      const local = clean(rules.local).filter((l) => l !== INCLUDE_LINE);
      // Write the shared file first: the include must never point at a missing file.
      const hadShared = (await platform.fileOps.readSharedIgnores(f.path)) !== null;
      if (shared.length || hadShared) {
        await platform.fileOps.writeSharedIgnores(f.path, [SHARED_HEADER, ...shared, ''].join('\n'));
      }
      const includeShared = shared.length > 0 || hadShared;
      await client.setIgnores(folderId, includeShared ? [INCLUDE_LINE, ...local] : local);
      await client.scan(folderId).catch(() => {});
      await refreshAll();
    },
    async ignoreItem(id) {
      const p = parseFolderListId(id);
      if (!p || !p.path) throw new Error(`Not a file id: ${id}`);
      const rules = await service.getIgnores(p.folder);
      // Leading "/" anchors the pattern to this exact path (not same-named files elsewhere).
      const pattern = `/${p.path}`;
      if (!rules.shared.includes(pattern)) rules.shared.push(pattern);
      await service.setIgnores(p.folder, rules);
    },
    async versions(): Promise<VersionEntry[]> {
      const all: VersionEntry[] = [];
      for (const f of folderCfg) {
        const v = await client.versions(f.id).catch(() => ({}) as Record<string, { versionTime: string; modTime: string; size: number }[]>);
        for (const [path, list] of Object.entries(v ?? {})) {
          for (const x of list) {
            all.push({
              id: `${f.id}:${path}@${x.versionTime}`,
              folderId: f.id,
              folderLabel: f.label || f.id,
              path,
              name: basename(path),
              versionTime: x.versionTime,
              modifiedAt: x.modTime,
              sizeBytes: x.size,
            });
          }
        }
      }
      return all.sort((a, b) => b.versionTime.localeCompare(a.versionTime));
    },
    async restoreVersion(v) {
      await client.restoreVersions(v.folderId, { [v.path]: v.versionTime });
      await client.scan(v.folderId).catch(() => {});
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
        ...(platform.ignorePermissions ? { ignorePerms: true } : {}),
        devices: devCfg.map((d) => ({ deviceID: d.deviceID })),
        versioning: VERSIONING,
      });
      await refreshAll();
    },
  };
  return service;
}
