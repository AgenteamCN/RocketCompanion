/**
 * themeConfig.ts
 * Centralized game theme configuration and reactive state pipeline.
 */

import { safeStorage, createLocalStorageStore, stringOrDefault, STORAGE_KEYS, UI_THEME_STORAGE_KEY } from './storageHelpers';

export type GameThemeId = 'realistic' | 'arcade';
export const THEMES: readonly GameThemeId[] = Object.freeze(['realistic', 'arcade']);
export const DEFAULT_THEME: GameThemeId = 'arcade';
export const THEME_STORAGE_KEY = STORAGE_KEYS.GAME_THEME;


export const themeSettingsStore = createLocalStorageStore<{ theme: GameThemeId }>(
  THEME_STORAGE_KEY,
  () => ({ theme: DEFAULT_THEME }),
  (target, source) => {
    target.theme = stringOrDefault(source.theme, THEMES, target.theme) as GameThemeId;
  }
);

let activeGameTheme: GameThemeId = themeSettingsStore.load().theme;
type GameThemeListener = (theme: GameThemeId) => void;
const gameThemeCallbacks: GameThemeListener[] = [];

export function applyThemeToDocument(): void {
  if (typeof document !== 'undefined' && document.documentElement?.dataset) {
    document.documentElement.dataset.gameTheme = activeGameTheme;
  }
}

export function getTheme(): GameThemeId {
  return activeGameTheme;
}

export function setTheme(theme: GameThemeId | string, options: { persist?: boolean } = {}): void {
  if (!THEMES.includes(theme as GameThemeId)) return;
  const nextTheme = theme as GameThemeId;
  const changed = nextTheme !== activeGameTheme;
  activeGameTheme = nextTheme;
  applyThemeToDocument();
  if (options.persist !== false) {
    themeSettingsStore.save({ theme: nextTheme });
  }
  if (changed) {
    for (const listener of gameThemeCallbacks) {
      try {
        listener(nextTheme);
      } catch (err) {
        console.error('[ThemeConfig] listener threw error:', err);
      }
    }
  }
}

export function onThemeChange(callback: GameThemeListener): () => void {
  if (!gameThemeCallbacks.includes(callback)) {
    gameThemeCallbacks.push(callback);
  }
  try {
    callback(activeGameTheme);
  } catch (err) {
    console.error('[ThemeConfig] callback threw error:', err);
  }
  return () => {
    const idx = gameThemeCallbacks.indexOf(callback);
    if (idx !== -1) gameThemeCallbacks.splice(idx, 1);
  };
}

export function getInitialTheme(): 'light' | 'dark' {
  const saved = safeStorage.get(UI_THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return 'light';
}
