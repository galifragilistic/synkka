import { formatAgo, formatWhen, t, type Device } from '@synkka/core';
import { useObservable, useSync } from '../hooks';
import { Icon } from './primitives';

function deviceState(d: Device, now: Date): string {
  if (d.isCurrent && d.activity === 'syncing') return t('devices.syncingNow');
  if (d.online) return t('devices.upToDate', { ago: formatAgo(d.lastSyncAt, now) });
  return t('devices.lastSeen', { when: formatWhen(d.lastSyncAt, now) });
}

function DeviceRow({ device, now }: { device: Device; now: Date }) {
  return (
    <li className="device">
      <span className="icon-tile icon-tile--36" aria-hidden="true">
        <Icon name={device.type === 'phone' ? 'smartphone' : 'laptop'} size={18} />
      </span>
      <span className="device__text">
        <span className="device__name">
          {device.name}
          {device.isCurrent && ` ${t('devices.thisDevice')}`}
        </span>
        <span className="muted label">{deviceState(device, now)}</span>
      </span>
      <span
        className={`presence ${device.online ? 'presence--online' : 'presence--offline'}`}
        role="img"
        aria-label={t(device.online ? 'devices.online' : 'devices.offline')}
      />
    </li>
  );
}

export function SidePanel({ now }: { now: Date }) {
  const sync = useSync();
  const devices = useObservable(() => sync.devices(), [sync]) ?? [];
  const activity = useObservable(() => sync.activity(3), [sync]) ?? [];

  return (
    <aside className="sidepanel">
      <section className="card panel" aria-labelledby="devices-title">
        <h2 id="devices-title">{t('devices.title')}</h2>
        <ul className="plain-list panel__list">
          {devices.map((d) => (
            <DeviceRow key={d.id} device={d} now={now} />
          ))}
        </ul>
      </section>

      <section className="card panel" aria-labelledby="activity-title">
        <h2 id="activity-title">{t('activity.title')}</h2>
        <ul className="plain-list panel__list">
          {activity.map((a) => (
            <li key={a.id} className="activity">
              <span className="small">
                <strong>{a.fileName}</strong> {t(a.detailKey, a.detailParams)}
              </span>
              <span className="muted label">{formatAgo(a.at, now)}</span>
            </li>
          ))}
        </ul>
        {/* Full history view is not designed yet. */}
        <a href="#" className="link small" onClick={(e) => e.preventDefault()}>
          {t('actions.showHistory')}
        </a>
      </section>
    </aside>
  );
}
