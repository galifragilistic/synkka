// Syncthing keeps the losing side of a conflict next to the original as
//   <name>.sync-conflict-<YYYYMMDD>-<HHMMSS>-<shortDeviceID><.ext>
// e.g. "Budjetti.sync-conflict-20261117-130500-ABCDEFG.xlsx" for "Budjetti.xlsx".

const RE = /^(.*)\.sync-conflict-(\d{8})-(\d{6})-([A-Z0-9]{7})(\.[^./]*)?$/;

export interface ParsedConflictName {
  /** Path of the original file (same directory). */
  original: string;
  /** When the conflict copy was created (local time of the device that created it). */
  at: Date;
  /** Short device ID (first 7 chars) of the device that made the conflicting version. */
  shortDeviceId: string;
}

export function parseConflictName(path: string): ParsedConflictName | null {
  const slash = path.lastIndexOf('/');
  const dir = slash >= 0 ? path.slice(0, slash + 1) : '';
  const m = RE.exec(path.slice(slash + 1));
  if (!m) return null;
  const [, base, ymd, hms, short, ext = ''] = m;
  const at = new Date(
    Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)),
    Number(hms.slice(0, 2)), Number(hms.slice(2, 4)), Number(hms.slice(4, 6)),
  );
  return { original: `${dir}${base}${ext}`, at, shortDeviceId: short };
}

export const isConflictName = (path: string) => RE.test(path.slice(path.lastIndexOf('/') + 1));

export const shortId = (deviceId: string) => deviceId.slice(0, 7);

/** Syncthing device IDs: 8 groups of 7 base32 chars (with or without dashes). */
export function normalizeDeviceId(input: string): string | null {
  const raw = input.toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-Z2-7]{56}$/.test(raw)) return null;
  return raw.match(/.{7}/g)!.join('-');
}

/** Where a rejected version goes so it can be restored for 30 days (Syncthing "trashcan" layout). */
export function versionsPath(relPath: string): string {
  return `.stversions/${relPath}`;
}
