import { describe, expect, it } from 'vitest';
import {
  STATUS_META, statusLabel, statusA11yLabel, statusColor, icons, tokens,
  conflictOptions, ctaFor, DEFAULT_RESOLUTION, keepBothCopyName,
  formatBytes, formatModified, formatAgo, formatEta, formatWhen,
  createMockSyncService, DEMO_FOLDER, t,
  type Conflict, type FileItem, type SyncState, type Observable,
} from './index';

const NOW = new Date(2026, 10, 17, 15, 0); // Tue 17.11.2026 15.00
const KB = 1024, MB = KB * 1024, GB = MB * 1024;

function current<T>(o: Observable<T>): T {
  let v!: T;
  o.subscribe((x) => (v = x))();
  return v;
}

describe('status mapping', () => {
  const states: SyncState[] = ['synced', 'syncing', 'pending', 'conflict', 'cloudOnly', 'offlineAvailable'];

  it('gives every state its own icon and its own label', () => {
    const iconSet = new Set(states.map((s) => STATUS_META[s].icon));
    const labelSet = new Set(states.map((s) => STATUS_META[s].labelKey));
    expect(iconSet.size).toBe(states.length);
    expect(labelSet.size).toBe(states.length);
    for (const s of states) {
      expect(icons[STATUS_META[s].icon]).toBeDefined();
      expect(t(STATUS_META[s].labelKey)).not.toBe(STATUS_META[s].labelKey);
    }
  });

  it('maps states to the spec icons, labels and color tokens', () => {
    const f = (state: SyncState, progress?: number) => ({ state, progress });
    expect(STATUS_META.synced.icon).toBe('checkCircle');
    expect(statusLabel(f('synced'))).toBe('Synkronoitu');
    expect(statusColor(STATUS_META.synced.textColor)).toBe(tokens.color.status.syncedText);
    expect(STATUS_META.syncing.icon).toBe('sync');
    expect(statusLabel(f('syncing', 0.64))).toBe('Lähetetään 64 %');
    expect(STATUS_META.syncing.showProgress).toBe(true);
    expect(STATUS_META.pending.icon).toBe('clock');
    expect(statusLabel(f('pending'))).toBe('Jonossa');
    expect(STATUS_META.conflict.icon).toBe('alertTriangle');
    expect(statusLabel(f('conflict'))).toBe('Ristiriita – ratkaise');
    expect(statusA11yLabel(f('conflict'))).toBe('Ristiriita');
    expect(STATUS_META.conflict.actionable).toBe(true);
    expect(STATUS_META.conflict.weight).toBe(600);
    expect(statusColor(STATUS_META.conflict.iconColor)).toBe(tokens.color.status.conflict);
    expect(STATUS_META.cloudOnly.icon).toBe('cloud');
    expect(statusLabel(f('cloudOnly'))).toBe('Vain pilvessä');
    expect(STATUS_META.offlineAvailable.icon).toBe('downloadCircle');
    expect(statusLabel(f('offlineAvailable'))).toBe('Tallennettu laitteelle');
  });
});

describe('i18n', () => {
  it('interpolates and picks plural forms', () => {
    expect(t('sync.activeCount', { count: 2 })).toBe('Synkronoidaan 2 tiedostoa');
    expect(t('sync.activeCount', { count: 1 })).toBe('Synkronoidaan 1 tiedosto');
    expect(t('sync.conflictsWaiting', { count: 1 })).toBe('1 ristiriita odottaa ratkaisua');
    expect(t('table.items', { count: 14 })).toBe('14 kohdetta');
    expect(t('missing.key')).toBe('missing.key');
  });
});

describe('formatting (fi-FI)', () => {
  it('formats sizes', () => {
    expect(formatBytes(248 * KB)).toBe('248 kt');
    expect(formatBytes(9 * KB)).toBe('9 kt');
    expect(formatBytes(1.1 * MB)).toBe('1,1 Mt');
    expect(formatBytes(38 * MB)).toBe('38 Mt');
    expect(formatBytes(3.2 * GB)).toBe('3,2 Gt');
    expect(formatBytes(200 * GB)).toBe('200 Gt');
  });

  it('formats dates', () => {
    expect(formatModified(new Date(2026, 10, 17, 14, 41).toISOString(), NOW)).toBe('Tänään 14.41');
    expect(formatModified(new Date(2026, 10, 17, 9, 12).toISOString(), NOW)).toBe('Tänään 9.12');
    expect(formatModified(new Date(2026, 10, 16, 8, 0).toISOString(), NOW)).toBe('Eilen');
    expect(formatModified(new Date(2026, 10, 9, 8, 0).toISOString(), NOW)).toBe('Ma 9.11.');
    expect(formatAgo(new Date(2026, 10, 17, 14, 57).toISOString(), NOW)).toBe('3 min sitten');
    expect(formatAgo(new Date(2026, 10, 17, 14, 0).toISOString(), NOW)).toBe('1 h sitten');
    expect(formatWhen(new Date(2026, 10, 16, 17, 48).toISOString(), NOW)).toBe('eilen 17.48');
    expect(formatEta(55)).toBe('1 min');
  });
});

describe('conflict resolution choice', () => {
  const conflict: Conflict = {
    id: 'c1',
    fileId: 'f1',
    fileName: 'Budjetti_2027.xlsx',
    local: { deviceId: 'p', deviceName: 'Pixel 9', deviceGenitive: 'Pixel 9:n', deviceType: 'phone', modifiedAt: new Date(2026, 10, 17, 13, 5).toISOString(), sizeBytes: 412 * KB },
    remote: { deviceId: 'm', deviceName: 'MacBook Pro', deviceGenitive: 'MacBook Pron', deviceType: 'computer', modifiedAt: new Date(2026, 10, 17, 13, 2).toISOString(), sizeBytes: 398 * KB },
  };
  const options = conflictOptions(conflict, NOW);

  it('offers local, remote and keep-both, defaulting to keep-both', () => {
    expect(options.map((o) => o.id)).toEqual(['keepLocal', 'keepRemote', 'keepBoth']);
    expect(DEFAULT_RESOLUTION).toBe('keepBoth');
    expect(options[0]).toMatchObject({ title: 'Tämän Pixel 9:n versio', meta: 'Muokattu tänään 13.05 · 412 kt', icon: 'smartphone' });
    expect(options[1]).toMatchObject({ title: 'MacBook Pron versio', meta: 'Muokattu tänään 13.02 · 398 kt', icon: 'laptop' });
    expect(options[2]).toMatchObject({ title: 'Säilytä molemmat', icon: 'copy' });
  });

  it('CTA label follows the selection', () => {
    expect(ctaFor(options, 'keepLocal')).toBe('Säilytä Pixel 9:n versio');
    expect(ctaFor(options, 'keepRemote')).toBe('Säilytä MacBook Pron versio');
    expect(ctaFor(options, 'keepBoth')).toBe('Säilytä molemmat');
  });

  it('names the keep-both copy after the device', () => {
    expect(keepBothCopyName('Budjetti_2027.xlsx', 'Pixel 9')).toBe('Budjetti_2027 (Pixel 9).xlsx');
    expect(keepBothCopyName('README', 'PC')).toBe('README (PC)');
  });
});

describe('mock sync service', () => {
  const make = () => createMockSyncService({ tickMs: 0, now: () => NOW, bytesPerSecond: MB });
  const file = (s: ReturnType<typeof make>, id: string) =>
    current(s.list(DEMO_FOLDER)).find((f: FileItem) => f.id === id);

  it('starts with the designed overview', () => {
    const s = make();
    const o = current(s.overview());
    expect(o).toMatchObject({ activeCount: 2, conflictCount: 1, paused: false, network: 'wifi' });
    expect(file(s, 'esitys')?.progress).toBeCloseTo(0.64);
  });

  it('progresses, pauses and resumes', async () => {
    const s = make();
    s.tick(1000);
    expect(file(s, 'esitys')!.progress!).toBeGreaterThan(0.64);
    await s.pause();
    const p = file(s, 'esitys')!.progress;
    s.tick(5000);
    expect(file(s, 'esitys')!.progress).toBe(p);
    expect(current(s.overview()).paused).toBe(true);
    await s.resume();
    s.tick(60_000);
    expect(file(s, 'esitys')!.state).toBe('synced');
    expect(file(s, 'sopimus')!.state).toBe('synced');
    expect(current(s.overview()).activeCount).toBe(0);
    expect(current(s.queue()).every((q) => q.status === 'done')).toBe(true);
  });

  it('resolving a conflict removes it and applies the choice', async () => {
    const s = make();
    await s.resolve('c-budjetti', 'keepBoth');
    expect(current(s.conflicts())).toHaveLength(0);
    expect(current(s.overview()).conflictCount).toBe(0);
    const list = current(s.list(DEMO_FOLDER));
    expect(list.find((f) => f.id === 'budjetti')!.state).toBe('synced');
    expect(list.find((f) => f.name === 'Budjetti_2027 (MacBook Pro).xlsx')!.state).toBe('pending');

    const s2 = make();
    await s2.resolve('c-budjetti', 'keepLocal');
    expect(file(s2, 'budjetti')!.state).toBe('pending');
    await expect(s2.resolve('c-budjetti', 'keepLocal')).rejects.toThrow();
  });

  it('syncNow re-queues a file without duplicating it in the queue', async () => {
    const s = make();
    s.tick(60_000);
    await s.syncNow();
    const ids = current(s.queue()).map((q) => q.fileId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(current(s.overview()).activeCount).toBe(1);
  });

  it('settings update immediately', async () => {
    const s = make();
    expect(current(s.settings())).toEqual({ wifiOnly: true, photoBackup: true, batterySaver: false });
    await s.updateSettings({ batterySaver: true });
    expect(current(s.settings()).batterySaver).toBe(true);
  });

  it('uses the phone as current device in the mobile perspective', async () => {
    const s = createMockSyncService({ tickMs: 0, now: () => NOW, currentDeviceId: 'phone' });
    const c = await s.getConflict('c-budjetti');
    expect(c.local.deviceType).toBe('phone');
    expect(current(s.devices())[0]).toMatchObject({ id: 'phone', isCurrent: true });
  });
});
