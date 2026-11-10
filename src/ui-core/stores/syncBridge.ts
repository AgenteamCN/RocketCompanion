/**
 * [L0 Token Sync Bridge]
 * Lightweight, zero-transport synchronization bridge for L0–L6 stores.
 * In production host applications (such as RocketCompanion), this module acts as a
 * zero-overhead, zero-network pass-through. In RCUITuner, `src/showcase/stores/crossClientSync.ts`
 * attaches its multi-tab BroadcastChannel/WebSocket adapter via `attachSyncBridge(...)`.
 */

export interface SyncBridgeAdapter {
  has: (key: string) => boolean;
  get: <T>(key: string, fallback: T) => T;
  set: <T>(key: string, value: T) => void;
  registerDefault: <T>(key: string, defaultValue: T) => void;
  subscribeKey: <T>(key: string, listener: (value: T) => void) => () => void;
  onReset: (listener: (scopePrefix?: string) => void) => () => void;
  resetAll: (options?: { scopePrefix?: string; preserveKeys?: string[] }) => void;
  isApplyingRemote: () => boolean;
}

let activeAdapter: SyncBridgeAdapter | null = null;
const earlyDefaults = new Map<string, unknown>();
const earlySeeds = new Map<string, unknown>();
const earlyKeyListeners = new Map<string, Set<(value: any) => void>>();
const earlyResetListeners = new Set<(scopePrefix?: string) => void>();

export function attachSyncBridge(adapter: SyncBridgeAdapter): void {
  activeAdapter = adapter;
  for (const [key, defaultValue] of earlyDefaults.entries()) {
    adapter.registerDefault(key, defaultValue);
  }
  for (const [key, listeners] of earlyKeyListeners.entries()) {
    for (const listener of listeners) {
      adapter.subscribeKey(key, listener);
    }
  }
  for (const listener of earlyResetListeners) {
    adapter.onReset(listener);
  }
  for (const [key, seedValue] of earlySeeds.entries()) {
    const resolved = adapter.get(key, seedValue);
    if (!Object.is(resolved, seedValue)) {
      const listeners = earlyKeyListeners.get(key);
      if (listeners) {
        for (const listener of listeners) {
          listener(resolved);
        }
      }
    }
  }
}

export const syncBridge: SyncBridgeAdapter = {
  has: (key: string): boolean =>
    activeAdapter ? activeAdapter.has(key) : earlySeeds.has(key),

  get: <T>(key: string, fallback: T): T => {
    if (activeAdapter) {
      return activeAdapter.get(key, fallback);
    }
    earlySeeds.set(key, fallback);
    return fallback;
  },

  set: <T>(key: string, value: T): void => {
    earlySeeds.set(key, value);
    if (activeAdapter) {
      activeAdapter.set(key, value);
    }
  },

  registerDefault: <T>(key: string, defaultValue: T): void => {
    earlyDefaults.set(key, defaultValue);
    if (activeAdapter) {
      activeAdapter.registerDefault(key, defaultValue);
    }
  },

  subscribeKey: <T>(key: string, listener: (value: T) => void): (() => void) => {
    let set = earlyKeyListeners.get(key);
    if (!set) {
      set = new Set();
      earlyKeyListeners.set(key, set);
    }
    set.add(listener);
    const unsubAdapter = activeAdapter ? activeAdapter.subscribeKey(key, listener) : null;
    return () => {
      set?.delete(listener);
      unsubAdapter?.();
    };
  },

  onReset: (listener: (scopePrefix?: string) => void): (() => void) => {
    earlyResetListeners.add(listener);
    const unsubAdapter = activeAdapter ? activeAdapter.onReset(listener) : null;
    return () => {
      earlyResetListeners.delete(listener);
      unsubAdapter?.();
    };
  },

  resetAll: (options?: { scopePrefix?: string; preserveKeys?: string[] }): void => {
    if (activeAdapter) {
      activeAdapter.resetAll(options);
    } else {
      for (const listener of earlyResetListeners) {
        listener(options?.scopePrefix);
      }
    }
  },

  isApplyingRemote: (): boolean => (activeAdapter ? activeAdapter.isApplyingRemote() : false),
};
