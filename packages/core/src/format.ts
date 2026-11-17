import { t as defaultT, type Translate } from './i18n';

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

/** fi-FI decimal: comma separator, at most one decimal. */
function dec(value: number, digits: number): string {
  return value.toFixed(digits).replace('.', ',');
}

/** "248 kt", "1,1 Mt", "38 Mt", "3,2 Gt", "200 Gt". */
export function formatBytes(bytes: number): string {
  if (bytes < KB) return bytes <= 0 ? '0 kt' : '1 kt';
  if (bytes < MB) return `${Math.round(bytes / KB)} kt`;
  if (bytes < GB) {
    const v = bytes / MB;
    return `${v < 10 ? dec(v, 1) : Math.round(v)} Mt`;
  }
  const v = bytes / GB;
  return `${v < 100 ? dec(v, 1) : Math.round(v)} Gt`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Finnish clock time: "9.12", "14.41". */
export function formatTime(d: Date): string {
  return `${d.getHours()}.${pad2(d.getMinutes())}`;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayDiff(date: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
}

const WEEKDAYS = ['Su', 'Ma', 'Ti', 'Ke', 'To', 'Pe', 'La'];

/** File "modified" column: "Tänään 14.41", "Eilen", "Ma 16.11.". */
export function formatModified(iso: string, now: Date = new Date(), t: Translate = defaultT): string {
  const d = new Date(iso);
  const diff = dayDiff(d, now);
  if (diff === 0) return t('time.today', { time: formatTime(d) });
  if (diff === 1) return t('time.yesterday');
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
}

/** Relative time: "3 min sitten", "1 h sitten"; older than 3 h falls back to formatModified. */
export function formatAgo(iso: string, now: Date = new Date(), t: Translate = defaultT): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return t('time.minutesAgo', { n: Math.max(minutes, 1) });
  const hours = Math.floor(minutes / 60);
  if (hours < 3) return t('time.hoursAgo', { n: hours });
  return formatModified(iso, now, t);
}

/** Lower-case "when" for sentences: "eilen 17.48", "tänään 13.05", "ma 16.11.". */
export function formatWhen(iso: string, now: Date = new Date(), t: Translate = defaultT): string {
  const d = new Date(iso);
  const diff = dayDiff(d, now);
  if (diff === 0) return t('time.todayAt', { time: formatTime(d) });
  if (diff === 1) return t('time.yesterdayAt', { time: formatTime(d) });
  return formatModified(iso, now, t).toLowerCase();
}

/** "1 min", "3 min" (never below 1 min, so "noin {eta} jäljellä" reads naturally). */
export function formatEta(seconds: number, t: Translate = defaultT): string {
  return t('time.etaMinutes', { n: Math.max(1, Math.round(seconds / 60)) });
}

/** Integer percent 0..100 from a 0..1 ratio. */
export function toPercent(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;
  return Math.round(Math.min(1, Math.max(0, ratio)) * 100);
}
