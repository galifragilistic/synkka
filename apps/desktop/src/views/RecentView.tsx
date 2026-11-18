import { t, type FileItem } from '@synkka/core';
import { useObservable, useSync } from '../hooks';
import { FileTable } from '../components/FileTable';

/** "Viimeisimmät": most recently changed files across all synced folders. */
export function RecentView({
  now, filter, onDetails, onResolve,
}: {
  now: Date;
  filter: (items: FileItem[]) => FileItem[];
  onDetails: (f: FileItem) => void;
  onResolve: (conflictId: string) => void;
}) {
  const sync = useSync();
  const recent = useObservable(() => sync.recent(50), [sync]) ?? [];
  return (
    <section className="files" aria-labelledby="view-title">
      <div className="files__head">
        <h1 id="view-title">{t('nav.recent')}</h1>
      </div>
      <FileTable
        files={filter(recent)}
        now={now}
        onResolve={onResolve}
        onOpen={() => {}}
        onDetails={onDetails}
        label={t('nav.recent')}
        empty={t('views.recentEmpty')}
      />
    </section>
  );
}
