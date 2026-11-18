import { useState } from 'react';
import { formatAgo, formatWhen, t, type Device, type PendingDevice } from '@synkka/core';
import { useObservable, useSync } from '../hooks';
import { Button, Icon } from '../components/primitives';

function stateText(d: Device, now: Date) {
  if (d.activity === 'syncing') return t('devices.syncingNow');
  if (d.online) return t('devices.upToDate', { ago: formatAgo(d.lastSyncAt, now) });
  return d.lastSyncAt ? t('devices.lastSeen', { when: formatWhen(d.lastSyncAt, now) }) : t('devices.neverSeen');
}

function DeviceCard({ d, now, onRemoved, onError }: { d: Device; now: Date; onRemoved: () => void; onError: (m: string) => void }) {
  const sync = useSync();
  const [confirming, setConfirming] = useState(false);
  return (
    <section className="card panel" aria-labelledby={`dev-${d.id}`}>
      <div className="share-head">
        <span className="icon-tile icon-tile--40" aria-hidden="true">
          <Icon name={d.type === 'phone' ? 'smartphone' : 'laptop'} size={20} />
        </span>
        <span className="device__text">
          <strong id={`dev-${d.id}`} className="device__name">
            {d.name}
            {d.isCurrent && ` ${t('devices.thisDevice')}`}
          </strong>
          <span className="muted label">{stateText(d, now)}</span>
        </span>
        <span
          className={`presence ${d.online ? 'presence--online' : 'presence--offline'}`}
          role="img"
          aria-label={t(d.online ? 'devices.online' : 'devices.offline')}
        />
      </div>
      <dl className="details">
        <dt>{t('devices.id')}</dt>
        <dd className="details__path">{d.id}</dd>
      </dl>
      {!d.isCurrent && (
        <div className="pending__actions">
          {confirming ? (
            <>
              <Button size="sm" onClick={() => setConfirming(false)}>
                {t('common.close')}
              </Button>
              <Button
                size="sm"
                className="btn--danger"
                onClick={() =>
                  sync.removeDevice(d.id).then(onRemoved, (e) => onError(String(e?.message ?? e)))
                }
              >
                {t('devices.removeConfirm')}
              </Button>
            </>
          ) : (
            <Button size="sm" icon="trash" onClick={() => setConfirming(true)}>
              {t('devices.remove')}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

/** "Laitteet": paired devices, pending requests and pairing. */
export function DevicesView({
  now, onPair, onToast,
}: {
  now: Date;
  onPair: (prefill?: PendingDevice) => void;
  onToast: (m: string) => void;
}) {
  const sync = useSync();
  const devices = useObservable(() => sync.devices(), [sync]) ?? [];
  const pending = useObservable(() => sync.pendingDevices(), [sync]) ?? [];
  return (
    <section className="files" aria-labelledby="view-title">
      <div className="files__head">
        <div className="files__title">
          <h1 id="view-title">{t('nav.devices')}</h1>
          <p className="muted small note">{t('views.devicesHint')}</p>
        </div>
        <div className="files__actions">
          <Button size="sm" icon="plus" onClick={() => onPair()}>
            {t('pairing.add')}
          </Button>
        </div>
      </div>
      {pending.map((p) => (
        <div key={p.deviceId} className="pending" role="group" aria-label={t('pairing.pendingTitle')}>
          <strong className="small">{t('pairing.pendingTitle')}</strong>
          <span className="muted label">{t('pairing.pendingBody', { name: p.name, id: p.deviceId.slice(0, 7) })}</span>
          <span className="pending__actions">
            <Button size="sm" variant="primary" onClick={() => onPair(p)}>
              {t('pairing.accept')}
            </Button>
            <Button size="sm" onClick={() => sync.dismissPendingDevice(p.deviceId)}>
              {t('pairing.dismiss')}
            </Button>
          </span>
        </div>
      ))}
      <div className="share-grid">
        {devices.map((d) => (
          <DeviceCard key={d.id} d={d} now={now} onRemoved={() => onToast(t('devices.removed'))} onError={onToast} />
        ))}
      </div>
    </section>
  );
}
