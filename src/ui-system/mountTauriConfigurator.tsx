/**
 * src/ui-system/mountTauriConfigurator.tsx
 * Lightweight React mount entry for the Tauri pre-launch Configurator window (`?configurator=1`).
 * Skips 3D WebGL engine initialization so the Configurator opens instantaneously with zero GPU overhead.
 */

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Layer1TauriConfiguratorRecipe } from '../ui-core/recipes/Layer1TauriConfiguratorRecipe.tsx';
import '../styles/ui-system.css';

export function mountTauriConfigurator(host: HTMLElement): Root {
  document.documentElement.classList.add('dark');
  document.documentElement.dataset.theme = 'dark';

  let rootEl = host.querySelector<HTMLElement>('#tauri-configurator-root');
  if (!rootEl) {
    rootEl = document.createElement('div');
    rootEl.id = 'tauri-configurator-root';
    rootEl.className =
      'dark w-full h-full flex items-center justify-center p-4 bg-neutral-950 text-neutral-100 select-none overflow-auto';
    host.innerHTML = '';
    host.appendChild(rootEl);
  }

  const root = createRoot(rootEl);
  root.render(
    <div className="w-full max-w-[660px] my-auto">
      <Layer1TauriConfiguratorRecipe isLight={false} />
    </div>
  );
  return root;
}
