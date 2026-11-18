import { formatAgo, formatWhen, t, type Device, type PendingDevice } from '@synkka/core';
import { useObservable, useSync } from '../hooks';
import { Button, Icon } from './primitives';

function deviceState(d: Device, now: Date): string {
  if (d.isCurrent && d.activity === 'syncing') return t('devices.syncingNow');
  if (d.online && !d.isCurrent && d.activity === 'syncing') return t('devices.syncingNow');
  if (d.online) return t('devices.upToDate', { ago: formatAgo(d.lastSyncAt, now) });
  if (!d.lastSyncAt) return t('devices.offline');
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

function PendingRow({ p, onAccept, onDismiss }: { p: PendingDevice; onAccept: () => void; onDismiss: () => void }) {
  return (
    <li className="pending" role="group" aria-label={t('pairing.pendingTitle')}>
      <span className="small">
        <strong>{t('pairing.pendingTitle')}</strong>
      </span>
      <span className="muted label">{t('pairing.pendingBody', { name: p.name, id: p.deviceId.slice(0, 7) })}</span>
      <span className="pending__actions">
        <Button size="sm" variant="primary" onClick={onAccept}>
          {t('pairing.accept')}
        </Button>
        <Button size="sm" onClick={onDismiss}>
          {t('pairing.dismiss')}
        </Button>
      </span>
    </li>
  );
}

export function SidePanel({ now, onPair }: { now: Date; onPair: (prefill?: PendingDevice) => void }) {
  const sync = useSync();
  const devices = useObservable(() => sync.devices(), [sync]) ?? [];
  const pending = useObservable(() => sync.pendingDevices(), [sync]) ?? [];
  const activity = useObservable(() => sync.activity(5), [sync]) ?? [];

  return (
    <aside className="sidepanel">
      <section className="card panel" aria-labelledby="devices-title">
        <h2 id="devices-title">{t('devices.title')}</h2>
        {pending.length > 0 && (
          <ul className="plain-list panel__list">
            {pending.map((p) => (
              <PendingRow key={p.deviceId} p={p} onAccept={() => onPair(p)} onDismiss={() => sync.dismissPendingDevice(p.deviceId)} />
            ))}
          </ul>
        )}
        <ul className="plain-list panel__list">
          {devices.map((d) => (
            <DeviceRow key={d.id} device={d} now={now} />
          ))}
        </ul>
        {devices.length <= 1 && <p className="muted small note">{t('pairing.noDevices')}</p>}
        <Button size="sm" icon="plus" onClick={() => onPair()}>
          {t('pairing.add')}
        </Button>
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
      </section>
    </aside>
  );
}
