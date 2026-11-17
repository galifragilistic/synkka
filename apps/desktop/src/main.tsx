import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import { createMockSyncService, cssVariables } from '@synkka/core';
import { SyncServiceContext } from './hooks';
import { App } from './App';
import './styles.css';

// Tokens → CSS custom properties (single source of truth: @synkka/core tokens).
for (const [name, value] of Object.entries(cssVariables())) {
  document.documentElement.style.setProperty(name, value);
}

// Mock backend until the real sync protocol exists. On Windows the "current device" is the PC.
const isWindows = /Windows/i.test(navigator.userAgent);
const service = createMockSyncService({ currentDeviceId: isWindows ? 'workpc' : 'macbook' });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SyncServiceContext.Provider value={service}>
      <App />
    </SyncServiceContext.Provider>
  </StrictMode>,
);
