// Conflict resolution choice (design-spec §2.4). Shared by the mobile screen and the desktop dialog.
import type { IconName } from './icons';
import { t as defaultT, type Translate } from './i18n';
import { formatBytes, formatWhen } from './format';
import type { Conflict, ConflictResolution, ConflictVersion } from './types';

export const DEFAULT_RESOLUTION: ConflictResolution = 'keepBoth';

export interface ConflictOption {
  id: ConflictResolution;
  icon: IconName;
  title: string;
  meta: string;
  /** Label of the primary button while this option is selected. */
  cta: string;
}

const deviceIcon = (v: ConflictVersion): IconName => (v.deviceType === 'phone' ? 'smartphone' : 'laptop');

export function conflictOptions(conflict: Conflict, now: Date = new Date(), t: Translate = defaultT): ConflictOption[] {
  const meta = (v: ConflictVersion) =>
    t('conflict.versionMeta', { when: formatWhen(v.modifiedAt, now, t), size: formatBytes(v.sizeBytes) });
  return [
    {
      id: 'keepLocal',
      icon: deviceIcon(conflict.local),
      // With three devices neither version may come from this one; then don't say "Tämän …".
      title: t(conflict.local.isCurrentDevice === false ? 'conflict.versionOf' : 'conflict.thisDeviceVersion', {
        deviceGenitive: conflict.local.deviceGenitive,
      }),
      meta: meta(conflict.local),
      cta: t('conflict.cta.keepLocal', { deviceGenitive: conflict.local.deviceGenitive }),
    },
    {
      id: 'keepRemote',
      icon: deviceIcon(conflict.remote),
      title: t('conflict.versionOf', { deviceGenitive: conflict.remote.deviceGenitive }),
      meta: meta(conflict.remote),
      cta: t('conflict.cta.keepRemote', { deviceGenitive: conflict.remote.deviceGenitive }),
    },
    {
      id: 'keepBoth',
      icon: 'copy',
      title: t('conflict.keepBoth'),
      meta: t('conflict.keepBothHint'),
      cta: t('conflict.cta.keepBoth'),
    },
  ];
}

export function ctaFor(options: ConflictOption[], selected: ConflictResolution): string {
  return (options.find((o) => o.id === selected) ?? options[options.length - 1]).cta;
}

/** Name for the extra copy when both versions are kept: "Budjetti_2027 (iPhone).xlsx". */
export function keepBothCopyName(fileName: string, remoteDeviceName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return `${fileName} (${remoteDeviceName})`;
  return `${fileName.slice(0, dot)} (${remoteDeviceName})${fileName.slice(dot)}`;
}
