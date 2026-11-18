import { t as defaultT, type Translate } from '../i18n';

/** Characters Android shared storage (and Windows) refuse in file names. */
const INVALID_NAME_CHARS = /["*:<>?\\|]/g;

/** Turns a raw Syncthing pull error into a short Finnish explanation. */
export function describeSyncError(path: string, raw: string, t: Translate = defaultT): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const bad = [...new Set(name.match(INVALID_NAME_CHARS) ?? [])];
  if (bad.length && /not permitted|invalid argument|not allowed|incorrect|syntax/i.test(raw)) {
    return t('errors.invalidName', { chars: bad.join(' ') });
  }
  if (/no connected device has the required version/i.test(raw)) return t('errors.noSource');
  if (/permission denied|not permitted|read-only/i.test(raw)) return t('errors.permission');
  if (/insufficient space|no space left/i.test(raw)) return t('errors.diskFull');
  return t('errors.generic', { error: raw.replace(/^syncing: /, '') });
}
