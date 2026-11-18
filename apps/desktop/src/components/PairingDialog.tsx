import { useEffect, useRef, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { normalizeDeviceId, t, type DeviceIdentity } from '@synkka/core';
import { useSync } from '../hooks';
import { isTauri } from '../platform';
import { Button, IconButton } from './primitives';

async function copyText(text: string) {
  if (isTauri) {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
    await writeText(text);
  } else {
    await navigator.clipboard.writeText(text);
  }
}

/**
 * Pairing (not designed yet): this device's ID as text + QR, and a form to add another device.
 * Uses the same card/dialog patterns as the conflict dialog.
 */
export function PairingDialog({
  initialId = '', initialName = '', onClose, onDone,
}: {
  initialId?: string;
  initialName?: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const sync = useSync();
  const ref = useRef<HTMLDialogElement>(null);
  const [me, setMe] = useState<DeviceIdentity>();
  const [qr, setQr] = useState('');
  const [id, setId] = useState(initialId);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
    sync.myDevice().then(async (d) => {
      setMe(d);
      setQr(await QRCode.toString(d.deviceId, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }));
    });
  }, [sync]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeDeviceId(id);
    if (!normalized || normalized === me?.deviceId) {
      setError(t('pairing.invalidId'));
      return;
    }
    setBusy(true);
    try {
      await sync.addDevice(normalized, name.trim() || normalized.slice(0, 7));
      ref.current?.close();
      onDone(t('pairing.added'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} className="dialog" aria-labelledby="pairing-title" onClose={onClose}>
      <form className="dialog__body" onSubmit={submit}>
        <div className="dialog__head">
          <h2 id="pairing-title">{t('pairing.title')}</h2>
          <IconButton icon="close" label={t('common.close')} onClick={() => ref.current?.close()} />
        </div>

        <section className="pair-me" aria-labelledby="my-id-title">
          <h3 id="my-id-title" className="overline">{t('pairing.myId')}</h3>
          <div className="pair-me__row">
            {/* QR SVG generated locally from the device ID. */}
            <div className="pair-me__qr" role="img" aria-label={t('pairing.myId')} dangerouslySetInnerHTML={{ __html: qr }} />
            <div className="pair-me__text">
              <code className="device-id">{me?.deviceId ?? '…'}</code>
              <span className="muted small">{t('pairing.myIdHint')}</span>
              <Button
                size="sm"
                icon="copy"
                disabled={!me}
                onClick={() => me && copyText(me.deviceId).then(() => onDone(t('pairing.copied')))}
              >
                {t('pairing.copy')}
              </Button>
            </div>
          </div>
        </section>

        <label className="field">
          <span className="field__label">{t('pairing.otherId')}</span>
          <input
            className="field__input mono"
            value={id}
            onChange={(e) => {
              setId(e.target.value);
              setError('');
            }}
            placeholder={t('pairing.otherIdPlaceholder')}
            aria-invalid={!!error}
            aria-describedby={error ? 'pair-error' : undefined}
            autoComplete="off"
            spellCheck={false}
            required
          />
        </label>
        <label className="field">
          <span className="field__label">{t('pairing.name')}</span>
          <input className="field__input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('pairing.namePlaceholder')} />
        </label>
        {error && (
          <p id="pair-error" className="field__error" role="alert">
            {error}
          </p>
        )}

        <div className="dialog__footer">
          <Button variant="secondary" onClick={() => ref.current?.close()}>
            {t('common.close')}
          </Button>
          <Button variant="primary" type="submit" disabled={busy}>
            {t('pairing.add')}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
