import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEMO_FOLDER, ROOT, t, type EngineState, type FileItem, type Observable, type PendingDevice } from '@synkka/core';
import { useDebounced, useNow, useObservable, useSync } from './hooks';
import { isRealEngine, isTauri } from './platform';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { FileTable } from './components/FileTable';
import { SidePanel } from './components/SidePanel';
import { ConflictDialog } from './components/ConflictDialog';
import { PairingDialog } from './components/PairingDialog';
import { Button, Icon } from './components/primitives';

type Crumb = { id: string; name: string };

export function App({ engine }: { engine?: Observable<EngineState> }) {
  const sync = useSync();
  const now = useNow();
  const engineState = useObservable(() => engine ?? { subscribe: (l) => (l({ state: 'ready' }), () => {}) }, [engine]);
  const overview = useObservable(() => sync.overview(), [sync]);

  // The browser mock has one designed folder; the real engine starts at the folder list.
  const [stack, setStack] = useState<Crumb[]>(() =>
    isRealEngine ? [{ id: ROOT, name: t('nav.allFiles') }] : [{ id: ROOT, name: t('nav.allFiles') }, { id: DEMO_FOLDER, name: 'Asiakasprojekti' }],
  );
  const current = stack[stack.length - 1];
  const files = useObservable(() => sync.list(current.id), [sync, current.id]) ?? [];

  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim().toLocaleLowerCase('fi'), 150);
  const visible = useMemo(
    () => (debounced ? files.filter((f) => f.name.toLocaleLowerCase('fi').includes(debounced)) : files),
    [files, debounced],
  );

  const [conflictId, setConflictId] = useState<string | null>(null);
  const [pairing, setPairing] = useState<{ prefill?: PendingDevice } | null>(null);
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

  const open = (f: FileItem) => {
    setQuery('');
    setStack((s) => [...s, { id: f.id, name: f.name }]);
  };

  const addFolder = async () => {
    if (!isTauri) return;
    const { open: pick } = await import('@tauri-apps/plugin-dialog');
    const path = await pick({ directory: true, title: t('folders.choose') });
    if (typeof path !== 'string') return;
    const label = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
    await sync.addFolder(path, label);
    setStack((s) => s.slice(0, 1));
    setToast(t('folders.added'));
  };

  const atRoot = stack.length === 1;

  return (
    <div className="app">
      <Sidebar onAddFolder={addFolder} />
      <main className="main">
        <TopBar query={query} onQuery={setQuery} overview={overview} />
        {engineState?.state === 'starting' && (
          <div className="banner" role="status">
            <Icon name="sync" size={16} strokeWidth={2.2} />
            {t('engine.starting')}
          </div>
        )}
        {engineState?.state === 'error' && (
          <div className="banner banner--error" role="alert">
            <Icon name="alertTriangle" size={16} strokeWidth={2.2} />
            {t('engine.error', { error: engineState.error })}
          </div>
        )}
        <div className="content">
          <section className="files" aria-labelledby="folder-title">
            <div className="files__head">
              <div className="files__title">
                {!atRoot && (
                  <nav className="crumbs small" aria-label={t('nav.allFiles')}>
                    {stack.slice(0, -1).map((c, i) => (
                      <span key={c.id}>
                        <button type="button" className="crumbs__link" onClick={() => setStack((s) => s.slice(0, i + 1))}>
                          {c.name}
                        </button>
                        <span className="muted" aria-hidden="true">
                          {' / '}
                        </span>
                      </span>
                    ))}
                  </nav>
                )}
                <h1 id="folder-title">{current.name}</h1>
              </div>
              {atRoot && isRealEngine && (
                <div className="files__actions">
                  <Button size="sm" icon="plus" onClick={addFolder}>
                    {t('folders.add')}
                  </Button>
                </div>
              )}
            </div>
            <FileTable
              files={visible}
              now={now}
              onResolve={setConflictId}
              onOpen={open}
              label={current.name}
              empty={engineState?.state === 'ready' ? t(atRoot ? 'folders.none' : 'folders.empty') : undefined}
            />
          </section>
          <SidePanel now={now} onPair={(prefill) => setPairing({ prefill })} />
        </div>
      </main>

      {conflictId && <ConflictDialog conflictId={conflictId} onClose={closeDialog} onResolved={resolved} />}
      {pairing && (
        <PairingDialog
          initialId={pairing.prefill?.deviceId}
          initialName={pairing.prefill?.name}
          onClose={() => setPairing(null)}
          onDone={(msg) => setToast(msg)}
        />
      )}

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
