import { useEffect, useState } from 'react';
import { formatBytes, t, toPercent, type IconName, type StorageQuota } from '@synkka/core';
import { useSync } from '../hooks';
import { Button, Icon, ProgressBar } from './primitives';

export type Section = 'all' | 'recent' | 'shared' | 'devices' | 'trash';

export const NAV: { id: Section; key: string; icon: IconName }[] = [
  { id: 'all', key: 'nav.allFiles', icon: 'folder' },
  { id: 'recent', key: 'nav.recent', icon: 'clock' },
  { id: 'shared', key: 'nav.shared', icon: 'users' },
  { id: 'devices', key: 'nav.devices', icon: 'monitor' },
  { id: 'trash', key: 'nav.trash', icon: 'trash' },
];

export function Sidebar({ onAddFolder, active, onSelect }: { onAddFolder: () => void; active: Section; onSelect: (s: Section) => void }) {
  const sync = useSync();
  const [quota, setQuota] = useState<StorageQuota>();
  useEffect(() => {
    sync.quota().then(setQuota);
  }, [sync]);
  const ratio = quota ? quota.usedBytes / quota.totalBytes : 0;

  return (
    <nav className="sidebar" aria-label={t('nav.mainMenu')}>
      <div className="logo">
        <span className="logo__mark" aria-hidden="true">
          <Icon name="sync" size={18} strokeWidth={2.2} />
        </span>
        <span className="logo__name">{t('app.name')}</span>
      </div>

      {/* Syncthing syncs folders, so the primary action adds a folder to sync. */}
      <Button variant="primary" size="lg" icon="plus" onClick={onAddFolder}>
        {t('folders.add')}
      </Button>

      <ul className="nav">
        {NAV.map((item) => (
          <li key={item.key}>
            <a
              href={`#${item.id}`}
              className={`nav__item ${item.id === active ? 'nav__item--active' : ''}`}
              aria-current={item.id === active ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                onSelect(item.id);
              }}
            >
              <Icon name={item.icon} size={18} />
              {t(item.key)}
            </a>
          </li>
        ))}
      </ul>

      <section className="storage" aria-label={t('storage.title')}>
        <div className="storage__head">
          <span className="storage__title">{t('storage.title')}</span>
          <span className="muted">{t('storage.percent', { pct: toPercent(ratio) })}</span>
        </div>
        <ProgressBar value={ratio} label={t('storage.title')} />
        <div className="storage__used">
          {quota && t('storage.used', { used: formatBytes(quota.usedBytes), total: formatBytes(quota.totalBytes) })}
        </div>
      </section>
    </nav>
  );
}
