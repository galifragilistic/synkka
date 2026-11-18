import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import { cssVariables } from '@synkka/core';
import { createAppService } from './platform';
import { SyncServiceContext } from './hooks';
import { App } from './App';
import './styles.css';

// Tokens → CSS custom properties (single source of truth: @synkka/core tokens).
for (const [name, value] of Object.entries(cssVariables())) {
  document.documentElement.style.setProperty(name, value);
}

// Tauri: bundled Syncthing engine. Browser preview: design mock.
const { service, engine } = createAppService();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SyncServiceContext.Provider value={service}>
      <App engine={engine} />
    </SyncServiceContext.Provider>
  </StrictMode>,
);
