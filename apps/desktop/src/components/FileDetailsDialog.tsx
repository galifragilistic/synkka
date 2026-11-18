import { useEffect, useRef, useState } from 'react';
import { formatBytes, formatWhen, t, type FileDetails } from '@synkka/core';
import { useSync } from '../hooks';
import { openPath, revealLabel, revealPath } from '../platform';
import { Button, Icon, IconButton } from './primitives';
import { SyncStatusBadge } from './SyncStatusBadge';

/** File details (not designed yet: uses the conflict dialog's modal and card patterns). */
export function FileDetailsDialog({
  fileId, onClose, onResolve, onError,
}: {
  fileId: string;
  onClose: () => void;
  onResolve: (conflictId: string) => void;
  onError: (message: string) => void;
}) {
  const sync = useSync();
  const ref = useRef<HTMLDialogElement>(null);
  const [info, setInfo] = useState<FileDetails>();

  useEffect(() => {
    sync.fileInfo(fileId).then(setInfo, (e) => {
      onError(String(e?.message ?? e));
      onClose();
    });
  }, [sync, fileId, onClose, onError]);

  useEffect(() => {
    if (info && ref.current && !ref.current.open) ref.current.showModal();
  }, [info]);

  if (!info) return null;
  const isFile = info.kind === 'file';
  const run = (fn: () => Promise<void>) => fn().catch((e) => onError(t('fileInfo.openFailedDesktop', { error: String(e?.message ?? e) })));

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="file-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current.close();
      }}
    >
      <div className="dialog__body">
        <div className="dialog__head">
          <h2 id="file-title">{t(isFile ? 'fileInfo.title' : 'fileInfo.folderTitle')}</h2>
          <IconButton icon="close" label={t('common.close')} onClick={() => ref.current?.close()} />
        </div>

        <div className="file-hero">
          <span className={`icon-tile icon-tile--40 ${isFile ? '' : 'icon-tile--folder'}`} aria-hidden="true">
            <Icon name={isFile ? 'file' : 'folder'} size={20} />
          </span>
          <span className="file-hero__text">
            <strong className="file-hero__name">{info.name}</strong>
            <SyncStatusBadge
              file={{ id: info.id, name: info.name, kind: info.kind, state: info.state, progress: info.progress, conflictId: info.conflictId, modifiedAt: info.modifiedAt }}
              onResolve={(id) => {
                ref.current?.close();
                onResolve(id);
              }}
            />
          </span>
        </div>

        <dl className="details">
          {info.sizeBytes !== undefined && (
            <>
              <dt>{t('fileInfo.size')}</dt>
              <dd>{formatBytes(info.sizeBytes)}</dd>
            </>
          )}
          {isFile && (
            <>
              <dt>{t('fileInfo.modified')}</dt>
              <dd>{formatWhen(info.modifiedAt)}</dd>
            </>
          )}
          {info.modifiedBy && (
            <>
              <dt>{t('fileInfo.modifiedBy')}</dt>
              <dd>{info.modifiedBy}</dd>
            </>
          )}
          <dt>{t('fileInfo.folder')}</dt>
          <dd>{info.folderLabel}</dd>
          <dt>{t('fileInfo.location')}</dt>
          <dd className="details__path">{info.absolutePath ?? t('fileInfo.notHere')}</dd>
          {info.availableOn.length > 0 && (
            <>
              <dt>{t('fileInfo.availableOn')}</dt>
              <dd>
                <ul className="plain-list details__devices">
                  {info.availableOn.map((d) => (
                    <li key={d} className="status status--synced">
                      <Icon name="checkCircle" size={16} strokeWidth={2.4} />
                      <span className="details__device">{d}</span>
                    </li>
                  ))}
                </ul>
              </dd>
            </>
          )}
        </dl>

        <div className="dialog__footer">
          {(isFile ? info.parentAbsolutePath : info.absolutePath) && revealPath && (
            <Button icon="folder" onClick={() => run(() => revealPath!(info.absolutePath ?? info.parentAbsolutePath!))}>
              {revealLabel}
            </Button>
          )}
          {isFile && info.absolutePath && openPath && (
            <Button variant="primary" icon="file" onClick={() => run(() => openPath!(info.absolutePath!))}>
              {t('fileInfo.open')}
            </Button>
          )}
        </div>
      </div>
    </dialog>
  );
}
