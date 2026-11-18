import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { t, type SyncOverview } from '@synkka/core';
import { useSync } from './hooks';
import { isTauri } from './platform';
import { pill } from './components/TopBar';

/** Keeps the menu bar menu in step with the sync state and runs its pause/resume item. */
export function useTray(overview: SyncOverview | undefined) {
  const sync = useSync();

  useEffect(() => {
    if (!isTauri) return;
    const off = listen<string>('tray-action', (e) => {
      void (e.payload === 'resume' ? sync.resume() : sync.pause());
    });
    return () => void off.then((f) => f());
  }, [sync]);

  const status = pill(overview).text;
  const paused = !!overview?.paused;
  useEffect(() => {
    if (!isTauri || !status) return;
    invoke('tray_update', {
      texts: {
        status,
        paused,
        toggle: t(paused ? 'tray.resume' : 'tray.pause'),
        open: t('tray.open'),
        launchAtLogin: t('tray.launchAtLogin'),
        quit: t('tray.quit'),
      },
    }).catch(() => {});
  }, [status, paused]);
}
