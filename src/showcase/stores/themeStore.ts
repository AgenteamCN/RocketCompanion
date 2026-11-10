import { useSyncExternalStore } from 'react';
import { AccentColor, ACCENT_THEMES, AccentThemeToken } from '../../ui-core/tokens/colors';
import { syncBridge as crossClientSync } from '../../ui-core/stores/syncBridge';
import { STORAGE_KEYS, safeStorage } from '../../ui-core/config/storageHelpers';
import { createExternalStore } from '../../ui-core/stores/createExternalStore';

export interface AccentThemeState {
  accent: AccentColor;
  tokens: AccentThemeToken;
}

const STORAGE_KEY = STORAGE_KEYS.ACCENT_THEME;

const getInitialAccent = (): AccentColor => {
  const saved = safeStorage.get(STORAGE_KEY);
  if (saved === 'amber' || saved === 'neutral' || saved === 'sky') {
    return saved;
  }
  return 'neutral';
};

const initialAccent = crossClientSync.get<AccentColor>('store:accent', getInitialAccent());

const core = createExternalStore<AccentThemeState>({
  accent: initialAccent,
  tokens: ACCENT_THEMES[initialAccent] || ACCENT_THEMES.neutral,
});

crossClientSync.registerDefault<AccentColor>('store:accent', 'neutral');

crossClientSync.onReset((scopePrefix) => {
  if (scopePrefix && !'store:accent'.startsWith(scopePrefix)) return;
  safeStorage.remove(STORAGE_KEY);
  if (core.getSnapshot().accent !== 'neutral') {
    core.setState({
      accent: 'neutral',
      tokens: ACCENT_THEMES.neutral,
    });
  }
});

crossClientSync.subscribeKey<AccentColor>('store:accent', (remoteAccent) => {
  if (remoteAccent !== 'amber' && remoteAccent !== 'neutral' && remoteAccent !== 'sky') return;
  if (core.getSnapshot().accent === remoteAccent) return;
  safeStorage.set(STORAGE_KEY, remoteAccent);
  core.setState({
    accent: remoteAccent,
    tokens: ACCENT_THEMES[remoteAccent] || ACCENT_THEMES.neutral,
  });
});

export const accentStore = {
  getSnapshot: core.getSnapshot,
  subscribe: core.subscribe,
  setAccent: (accent: AccentColor) => {
    safeStorage.set(STORAGE_KEY, accent);
    crossClientSync.set('store:accent', accent);
    core.setState({
      accent,
      tokens: ACCENT_THEMES[accent] || ACCENT_THEMES.neutral,
    });
  },
};

export const useAccentStore = () => {
  const snapshot = useSyncExternalStore(accentStore.subscribe, accentStore.getSnapshot);
  return {
    accent: snapshot.accent,
    tokens: snapshot.tokens,
    setAccent: accentStore.setAccent,
  };
};
