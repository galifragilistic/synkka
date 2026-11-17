import { useEffect, useState } from 'react';
import { formatBytes, t, toPercent, type IconName, type StorageQuota } from '@synkka/core';
import { useSync } from '../hooks';
import { Button, Icon, ProgressBar } from './primitives';

const NAV: { key: string; icon: IconName }[] = [
  { key: 'nav.allFiles', icon: 'folder' },
  { key: 'nav.recent', icon: 'clock' },
  { key: 'nav.shared', icon: 'users' },
  { key: 'nav.devices', icon: 'monitor' },
  { key: 'nav.trash', icon: 'trash' },
];

export function Sidebar() {
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

      {/* Upload flow is not designed yet (spec §7). */}
      <Button variant="primary" size="lg" icon="plus">
        {t('actions.addFiles')}
      </Button>

      <ul className="nav">
        {NAV.map((item, i) => (
          <li key={item.key}>
            {/* Only "Kaikki tiedostot" is designed; other sections are inert placeholders. */}
            <a
              href="#"
              className={`nav__item ${i === 0 ? 'nav__item--active' : ''}`}
              aria-current={i === 0 ? 'page' : undefined}
              onClick={(e) => e.preventDefault()}
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
