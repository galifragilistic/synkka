import { useState } from 'react';
import { t, type SharedFolder } from '@synkka/core';
import { useObservable, useSync } from '../hooks';
import { Button, Icon } from '../components/primitives';
import { SyncStatusBadge } from '../components/SyncStatusBadge';

/** One switch per paired device: whether this folder syncs to it. */
function ShareToggle({ folder, device, onError }: {
  folder: SharedFolder;
  device: SharedFolder['devices'][number];
  onError: (m: string) => void;
}) {
  const sync = useSync();
  const [busy, setBusy] = useState(false);
  return (
    <label className={`share-row ${busy ? 'share-row--busy' : ''}`}>
      <span className="icon-tile icon-tile--36" aria-hidden="true">
        <Icon name={device.type === 'phone' ? 'smartphone' : 'laptop'} size={18} />
      </span>
      <span className="device__text">
        <span className="device__name">{device.name}</span>
        <span className="muted label">{t(device.online ? 'devices.online' : 'devices.offline')}</span>
      </span>
      <input
        type="checkbox"
        className="switch"
        role="switch"
        checked={device.shared}
        disabled={busy}
        aria-label={t('views.sharedWith', { name: device.name })}
        onChange={async (e) => {
          setBusy(true);
          try {
            await sync.setFolderShared(folder.folderId, device.id, e.target.checked);
          } catch (err) {
            onError(String((err as Error)?.message ?? err));
          } finally {
            setBusy(false);
          }
        }}
      />
    </label>
  );
}

/** "Jaetut": synced folders and the devices each one is shared with. */
export function SharedView({ onError, onOpenFolder, onIgnores }: {
  onError: (m: string) => void;
  onOpenFolder: (f: SharedFolder) => void;
  onIgnores: (f: SharedFolder) => void;
}) {
  const sync = useSync();
  const folders = useObservable(() => sync.sharedFolders(), [sync]) ?? [];
  return (
    <section className="files" aria-labelledby="view-title">
      <div className="files__head">
        <div className="files__title">
          <h1 id="view-title">{t('nav.shared')}</h1>
          <p className="muted small note">{t('views.sharedHint')}</p>
        </div>
      </div>
      {folders.length === 0 && <p className="card ftable__empty muted">{t('folders.none')}</p>}
      <div className="share-grid">
        {folders.map((f) => (
          <section key={f.folderId} className="card panel" aria-labelledby={`share-${f.folderId}`}>
            <div className="share-head">
              <span className="icon-tile icon-tile--folder" aria-hidden="true">
                <Icon name="folder" size={18} />
              </span>
              <span className="device__text">
                <button type="button" id={`share-${f.folderId}`} className="ftable__open share-title" onClick={() => onOpenFolder(f)}>
                  {f.label}
                </button>
                <span className="muted label details__path">{f.path}</span>
              </span>
              <SyncStatusBadge file={{ id: f.listId, name: f.label, kind: 'folder', state: f.state, modifiedAt: '' }} />
            </div>
            <div className="pending__actions">
              <Button size="sm" icon="settings" onClick={() => onIgnores(f)}>
                {t('ignore.button')}
              </Button>
            </div>
            {f.devices.length === 0 ? (
              <p className="muted small note">{t('views.noOtherDevices')}</p>
            ) : (
              <div className="share-list">
                {f.devices.map((d) => (
                  <ShareToggle key={d.id} folder={f} device={d} onError={onError} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </section>
  );
}
