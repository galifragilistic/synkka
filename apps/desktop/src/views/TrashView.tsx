import { useCallback, useEffect, useState } from 'react';
import { formatBytes, formatModified, t, type VersionEntry } from '@synkka/core';
import { useSync } from '../hooks';
import { Button, Icon } from '../components/primitives';

/** "Roskakori": version history of all folders (deleted, replaced and rejected conflict versions). */
export function TrashView({ now, query, onToast }: { now: Date; query: string; onToast: (m: string) => void }) {
  const sync = useSync();
  const [items, setItems] = useState<VersionEntry[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    sync.versions().then(setItems, (e) => {
      setItems([]);
      onToast(String(e?.message ?? e));
    });
  }, [sync, onToast]);
  useEffect(load, [load]);

  const visible = (items ?? []).filter((v) => !query || v.name.toLocaleLowerCase('fi').includes(query) || v.path.toLocaleLowerCase('fi').includes(query));

  const restore = async (v: VersionEntry) => {
    setBusy(v.id);
    try {
      await sync.restoreVersion(v);
      onToast(t('views.restored', { name: v.name }));
      load();
    } catch (e) {
      onToast(String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="files" aria-labelledby="view-title">
      <div className="files__head">
        <div className="files__title">
          <h1 id="view-title">{t('nav.trash')}</h1>
          <p className="muted small note">{t('views.trashHint')}</p>
        </div>
      </div>
      <div className="card ftable-scroll">
        <div className="ftable ftable--trash" role="table" aria-label={t('nav.trash')}>
          <div className="ftable__row ftable__head" role="row">
            <span role="columnheader">{t('table.name')}</span>
            <span role="columnheader">{t('views.folder')}</span>
            <span role="columnheader">{t('views.archived')}</span>
            <span role="columnheader" className="ftable__size">{t('table.size')}</span>
            <span role="columnheader" className="visually-hidden">{t('views.restore')}</span>
          </div>
          {visible.map((v) => (
            <div key={v.id} className="ftable__row" role="row">
              <div className="ftable__name" role="cell">
                <span className="icon-tile" aria-hidden="true">
                  <Icon name="file" size={18} />
                </span>
                <span className="device__text">
                  <span className="ellipsis">{v.name}</span>
                  {v.path !== v.name && <span className="muted label ellipsis">{v.path}</span>}
                </span>
              </div>
              <span className="muted small" role="cell">{v.folderLabel}</span>
              <span className="muted small" role="cell">{formatModified(v.versionTime, now)}</span>
              <span className="muted small ftable__size" role="cell">{formatBytes(v.sizeBytes)}</span>
              <span role="cell" className="ftable__size">
                <Button size="sm" disabled={busy === v.id} onClick={() => restore(v)} aria-label={`${t('views.restore')}: ${v.name}`}>
                  {t('views.restore')}
                </Button>
              </span>
            </div>
          ))}
          {items && visible.length === 0 && <p className="ftable__empty muted">{t('views.trashEmpty')}</p>}
        </div>
      </div>
    </section>
  );
}
