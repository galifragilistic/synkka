import { t, type IconName, type SyncOverview } from '@synkka/core';
import { useSync } from '../hooks';
import { Button, Icon, IconButton } from './primitives';

function pill(o: SyncOverview | undefined): { tone: string; icon: IconName; text: string } {
  if (!o) return { tone: 'idle', icon: 'sync', text: '' };
  if (o.paused) return { tone: 'paused', icon: 'pause', text: t('sync.paused') };
  if (o.activeCount > 0) return { tone: 'active', icon: 'sync', text: t('sync.activeCount', { count: o.activeCount }) };
  if (o.errorCount) return { tone: 'error', icon: 'alertTriangle', text: t('errors.count', { count: o.errorCount }) };
  return { tone: 'active', icon: 'checkCircle', text: t('sync.allSynced') };
}

export function TopBar({ query, onQuery, overview }: { query: string; onQuery: (q: string) => void; overview?: SyncOverview }) {
  const sync = useSync();
  const p = pill(overview);

  return (
    <header className="topbar">
      <label className="search">
        <Icon name="search" size={16} />
        <span className="visually-hidden">{t('search.label')}</span>
        <input
          type="search"
          placeholder={t('search.placeholderDesktop')}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </label>

      <div className={`pill pill--${p.tone}`} role="status" aria-live="polite">
        <Icon name={p.icon} size={16} strokeWidth={2.2} />
        {p.text}
      </div>

      {overview?.paused ? (
        <Button icon="play" onClick={() => sync.resume()}>
          {t('actions.resume')}
        </Button>
      ) : (
        <Button icon="pause" onClick={() => sync.pause()}>
          {t('actions.pause')}
        </Button>
      )}

      {/* Settings screen is not designed yet (spec §7). */}
      <IconButton icon="settings" label={t('actions.settings')} />
    </header>
  );
}
