// Sync status system (design-spec §3). Status is never color alone:
// every state maps to its own icon AND label.
import type { IconName } from './icons';
import { t as defaultT, type Translate } from './i18n';
import type { FileItem, SyncState } from './types';
import { tokens } from './tokens';
import { toPercent } from './format';

type StatusColorKey = keyof typeof tokens.color.status;

export interface StatusMeta {
  icon: IconName;
  /** Token key for the icon color. */
  iconColor: StatusColorKey;
  /** Token key for the label color. */
  textColor: StatusColorKey;
  /** i18n key for the desktop label. */
  labelKey: string;
  weight: 500 | 600;
  /** Conflict labels are links to resolution. */
  actionable: boolean;
  showProgress: boolean;
}

export const STATUS_META: Record<SyncState, StatusMeta> = {
  synced: { icon: 'checkCircle', iconColor: 'synced', textColor: 'syncedText', labelKey: 'status.synced', weight: 500, actionable: false, showProgress: false },
  syncing: { icon: 'sync', iconColor: 'syncing', textColor: 'syncingText', labelKey: 'status.syncing', weight: 500, actionable: false, showProgress: true },
  pending: { icon: 'clock', iconColor: 'pending', textColor: 'pending', labelKey: 'status.pending', weight: 500, actionable: false, showProgress: false },
  conflict: { icon: 'alertTriangle', iconColor: 'conflict', textColor: 'conflict', labelKey: 'status.conflictAction', weight: 600, actionable: true, showProgress: false },
  cloudOnly: { icon: 'cloud', iconColor: 'cloudOnly', textColor: 'cloudOnly', labelKey: 'status.cloudOnly', weight: 500, actionable: false, showProgress: false },
  offlineAvailable: { icon: 'downloadCircle', iconColor: 'offlineAvailable', textColor: 'offlineAvailable', labelKey: 'status.offlineAvailable', weight: 500, actionable: false, showProgress: false },
};

export function statusMeta(state: SyncState): StatusMeta {
  return STATUS_META[state];
}

export function statusColor(key: StatusColorKey): string {
  return tokens.color.status[key];
}

/** Desktop table label, e.g. "Lähetetään 64 %". */
export function statusLabel(file: Pick<FileItem, 'state' | 'progress'>, t: Translate = defaultT): string {
  const meta = statusMeta(file.state);
  return t(meta.labelKey, { pct: toPercent(file.progress ?? 0) });
}

/** Short label used as aria-label for icon-only status (mobile list). */
export function statusA11yLabel(file: Pick<FileItem, 'state' | 'progress'>, t: Translate = defaultT): string {
  if (file.state === 'conflict') return t('status.conflict');
  return statusLabel(file, t);
}
