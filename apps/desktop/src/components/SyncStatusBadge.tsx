import { statusLabel, statusMeta, t, toPercent, type FileItem } from '@synkka/core';
import { Icon, ProgressBar } from './primitives';

/** Desktop status cell: icon + label always (spec §3). Conflict is an action. */
export function SyncStatusBadge({ file, onResolve }: { file: FileItem; onResolve?: (conflictId: string) => void }) {
  const meta = statusMeta(file.state);
  const label = statusLabel(file);
  const content = (
    <>
      <Icon name={meta.icon} size={16} strokeWidth={meta.icon === 'checkCircle' ? 2.4 : 2.2} />
      {label}
    </>
  );

  if (file.state === 'conflict' && file.conflictId && onResolve) {
    return (
      <button
        type="button"
        className={`status status--${file.state} status--link`}
        onClick={() => onResolve(file.conflictId!)}
        aria-haspopup="dialog"
      >
        {content}
      </button>
    );
  }

  if (meta.showProgress) {
    return (
      <div className="status-progress">
        <span className={`status status--${file.state}`}>{content}</span>
        <ProgressBar value={file.progress ?? 0} label={t('status.syncing', { pct: toPercent(file.progress ?? 0) })} />
      </div>
    );
  }

  return <span className={`status status--${file.state}`}>{content}</span>;
}
