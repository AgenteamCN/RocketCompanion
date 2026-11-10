import { useSyncExternalStore } from 'react';
import { syncBridge } from './syncBridge';

export interface ExternalStoreCore<T> {
  getSnapshot: () => T;
  setState: (updater: T | ((prev: T) => T), shouldNotify?: boolean) => T;
  subscribe: (listener: () => void) => () => boolean;
  notify: () => void;
  getListenerCount: () => number;
}

export interface ExternalStoreOptions<T> {
  onNotify?: (state: T) => void;
  onFirstSubscribe?: (state: T, replaceState: (next: T) => void) => void;
}

export function createExternalStore<T>(
  initialState: T,
  options?: ExternalStoreOptions<T>
): ExternalStoreCore<T> {
  let state = initialState;
  const listeners = new Set<() => void>();

  const replaceState = (next: T) => {
    state = next;
  };

  const notify = () => {
    options?.onNotify?.(state);
    listeners.forEach((cb) => cb());
  };

  return {
    getSnapshot: () => state,
    setState: (updater, shouldNotify = true) => {
      state = typeof updater === 'function' ? (updater as (prev: T) => T)(state) : updater;
      if (shouldNotify) {
        notify();
      }
      return state;
    },
    subscribe: (listener: () => void) => {
      if (listeners.size === 0 && options?.onFirstSubscribe) {
        options.onFirstSubscribe(state, replaceState);
      }
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify,
    getListenerCount: () => listeners.size,
  };
}

export function useExternalStore<T>(core: ExternalStoreCore<T>): T;
export function useExternalStore<T, TSlice>(
  core: ExternalStoreCore<T>,
  selector: (state: T) => TSlice
): TSlice;
export function useExternalStore<T, TSlice = T>(
  core: ExternalStoreCore<T>,
  selector?: (state: T) => TSlice
): TSlice {
  const snapshot = useSyncExternalStore(core.subscribe, core.getSnapshot);
  return selector ? selector(snapshot) : (snapshot as unknown as TSlice);
}

export function createSyncedExternalStore<T>(
  syncKey: string,
  defaultState: T,
  normalize?: (raw: T) => T
): ExternalStoreCore<T> {
  const initialRaw = syncBridge.get<T>(syncKey, defaultState);
  const initialState = normalize ? normalize(initialRaw) : initialRaw;

  const core = createExternalStore<T>(initialState, {
    onNotify: (nextState) => {
      if (!syncBridge.isApplyingRemote()) {
        syncBridge.set(syncKey, nextState);
      }
    },
  });

  syncBridge.subscribeKey<T>(syncKey, (remote) => {
    if (remote === undefined || remote === null) return;
    core.setState(normalize ? normalize(remote) : remote);
  });

  return core;
}
