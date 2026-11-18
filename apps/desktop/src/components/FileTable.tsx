import { formatBytes, formatModified, t, type FileItem } from '@synkka/core';
import { Icon } from './primitives';
import { SyncStatusBadge } from './SyncStatusBadge';

function FileRow({ file, now, onResolve, onOpen }: { file: FileItem; now: Date; onResolve: (id: string) => void; onOpen: (f: FileItem) => void }) {
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
          <span className="ellipsis">{file.name}</span>
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
  files, now, onResolve, onOpen, label, empty,
}: {
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
          <FileRow key={f.id} file={f} now={now} onResolve={onResolve} onOpen={onOpen} />
        ))}
        {files.length === 0 && empty && <p className="ftable__empty muted">{empty}</p>}
      </div>
    </div>
  );
}
