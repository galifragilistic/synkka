import { useEffect, useRef, useState } from 'react';
import {
  conflictOptions, ctaFor, DEFAULT_RESOLUTION, t,
  type Conflict, type ConflictResolution,
} from '@synkka/core';
import { useSync } from '../hooks';
import { Button, Icon, IconButton, RadioCard } from './primitives';

/**
 * Desktop conflict dialog. Not designed yet (spec §4): reuses the mobile radio-card
 * pattern in a ~480 px modal, as the spec suggests.
 */
export function ConflictDialog({
  conflictId, onClose, onResolved,
}: {
  conflictId: string;
  onClose: () => void;
  onResolved: () => void;
}) {
  const sync = useSync();
  const ref = useRef<HTMLDialogElement>(null);
  const [conflict, setConflict] = useState<Conflict>();
  const [choice, setChoice] = useState<ConflictResolution>(DEFAULT_RESOLUTION);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    sync.getConflict(conflictId).then(setConflict, onClose);
  }, [sync, conflictId, onClose]);

  useEffect(() => {
    const d = ref.current;
    if (d && conflict && !d.open) d.showModal();
  }, [conflict]);

  if (!conflict) return null;
  const options = conflictOptions(conflict);

  const submit = async () => {
    setBusy(true);
    try {
      await sync.resolve(conflict.id, choice);
      ref.current?.close();
      onResolved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="conflict-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current.close(); // click on backdrop
      }}
    >
      <div className="dialog__body">
        <div className="dialog__head">
          <h2 id="conflict-title">{t('conflict.title')}</h2>
          <IconButton icon="close" label={t('common.close')} onClick={() => ref.current?.close()} />
        </div>

        <div className="alert" role="note">
          <span className="alert__icon">
            <Icon name="alertTriangle" size={20} strokeWidth={2.2} />
          </span>
          <span className="alert__text">
            <strong>{conflict.fileName}</strong>
            <span>{t('conflict.explanation')}</span>
          </span>
        </div>

        <fieldset className="fieldset">
          <legend className="overline">{t('conflict.question')}</legend>
          {options.map((o) => (
            <RadioCard
              key={o.id}
              name="conflict-version"
              value={o.id}
              checked={choice === o.id}
              onChange={(v) => setChoice(v as ConflictResolution)}
              icon={o.icon}
              title={o.title}
              meta={o.meta}
            />
          ))}
        </fieldset>

        <p className="muted small note">{t('conflict.historyNote')}</p>

        <div className="dialog__footer">
          <Button variant="secondary" onClick={() => ref.current?.close()}>
            {t('conflict.decideLater')}
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {ctaFor(options, choice)}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
