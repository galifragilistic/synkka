import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEMO_FOLDER, t } from '@synkka/core';
import { useDebounced, useNow, useObservable, useSync } from './hooks';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { FileTable } from './components/FileTable';
import { SidePanel } from './components/SidePanel';
import { ConflictDialog } from './components/ConflictDialog';
import { Button, Icon } from './components/primitives';

export function App() {
  const sync = useSync();
  const now = useNow();
  const overview = useObservable(() => sync.overview(), [sync]);
  const files = useObservable(() => sync.list(DEMO_FOLDER), [sync]) ?? [];

  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim().toLocaleLowerCase('fi'), 150);
  const visible = useMemo(
    () => (debounced ? files.filter((f) => f.name.toLocaleLowerCase('fi').includes(debounced)) : files),
    [files, debounced],
  );

  const [conflictId, setConflictId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const closeDialog = useCallback(() => setConflictId(null), []);
  const resolved = useCallback(() => {
    setConflictId(null);
    setToast(t('conflict.resolvedToast'));
  }, []);

  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <TopBar query={query} onQuery={setQuery} overview={overview} />
        <div className="content">
          <section className="files" aria-labelledby="folder-title">
            <div className="files__head">
              <div className="files__title">
                <div className="muted small">
                  {t('nav.allFiles')} / Projektit
                </div>
                <h1 id="folder-title">Asiakasprojekti</h1>
              </div>
              {/* Sharing dialog and folder creation are not designed yet (spec §7). */}
              <div className="files__actions">
                <Button size="sm">{t('actions.shareFolder')}</Button>
                <Button size="sm">{t('actions.newFolder')}</Button>
              </div>
            </div>
            <FileTable files={visible} now={now} onResolve={setConflictId} />
          </section>
          <SidePanel now={now} />
        </div>
      </main>

      {conflictId && <ConflictDialog conflictId={conflictId} onClose={closeDialog} onResolved={resolved} />}

      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div className="toast">
            <Icon name="checkCircle" size={18} strokeWidth={2.2} />
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
