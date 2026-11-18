import { formatBytes, formatModified, t, type FileItem } from '@synkka/core';
import { Icon } from './primitives';
import { SyncStatusBadge } from './SyncStatusBadge';

function FileRow({ file, now, onResolve, onOpen, onDetails }: {
  file: FileItem; now: Date; onResolve: (id: string) => void; onOpen: (f: FileItem) => void; onDetails: (f: FileItem) => void;
}) {
  const isFolder = file.kind === 'folder';
  const size =
    isFolder && file.childCount !== undefined
      ? t('table.items', { count: file.childCount })
      : file.sizeBytes !== undefined
        ? formatBytes(file.sizeBytes)
        : '';
  return (
    <div className="ftable__row" role="row">
      <div className="ftable__name" role="cell">
        <span className={`icon-tile ${isFolder ? 'icon-tile--folder' : ''}`} aria-hidden="true">
          <Icon name={isFolder ? 'folder' : 'file'} size={18} />
        </span>
        {isFolder ? (
          <button type="button" className="ftable__open ellipsis" onClick={() => onOpen(file)}>
            {file.name}
          </button>
        ) : (
          <button
            type="button"
            className="ftable__open ellipsis"
            aria-haspopup="dialog"
            title={t('fileInfo.details', { name: file.name })}
            onClick={() => onDetails(file)}
          >
            {file.name}
          </button>
        )}
      </div>
      <div role="cell">
        <SyncStatusBadge file={file} onResolve={onResolve} />
      </div>
      <span className="muted small" role="cell">{formatModified(file.modifiedAt, now)}</span>
      <span className="muted small ftable__size" role="cell">{size}</span>
    </div>
  );
}

export function FileTable({
  files, now, onResolve, onOpen, onDetails, label, empty,
}: {
  onDetails: (f: FileItem) => void;
  files: FileItem[];
  now: Date;
  onResolve: (id: string) => void;
  onOpen: (f: FileItem) => void;
  label: string;
  empty?: string;
}) {
  return (
    <div className="card ftable-scroll">
      <div className="ftable" role="table" aria-label={label}>
        <div className="ftable__row ftable__head" role="row">
          <span role="columnheader">{t('table.name')}</span>
          <span role="columnheader">{t('table.status')}</span>
          <span role="columnheader">{t('table.modified')}</span>
          <span role="columnheader" className="ftable__size">{t('table.size')}</span>
        </div>
        {files.map((f) => (
          <FileRow key={f.id} file={f} now={now} onResolve={onResolve} onOpen={onOpen} onDetails={onDetails} />
        ))}
        {files.length === 0 && empty && <p className="ftable__empty muted">{empty}</p>}
      </div>
    </div>
  );
}
