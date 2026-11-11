import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { attachSyncBridge } from '../../ui-core/stores/syncBridge';
import {
  cloneSerializable,
  sanitizeSyncedValue,
  isSyncSerializable,
  encodeEntriesForWire,
  decodeEntriesFromWire,
} from './crossClientSyncCodec';
import {
  attachSyncTransportListeners,
  buildExportedLayerParameters,
  getViteHot,
  sendSyncTransportEvent,
} from './crossClientSyncProtocol';

export interface CrossClientSyncStatus {
  connected: boolean;
  transport: 'vite-ws' | 'broadcast-channel' | 'none';
  paused: boolean;
  clientId: string;
  lastSyncAt: number | null;
}

type KeyListener = (value: unknown) => void;
type ResetListener = (scopePrefix?: string) => void;

interface SyncBusSingleton {
  clientId: string;
  mirror: Map<string, unknown>;
  defaults: Map<string, unknown>;
  keyListeners: Map<string, Set<KeyListener>>;
  resetListeners: Set<ResetListener>;
  statusListeners: Set<() => void>;
  status: CrossClientSyncStatus;
  applyingRemoteCount: number;
  pendingOutgoing: Record<string, unknown>;
  pendingSeeds: Record<string, unknown>;
  flushScheduled: boolean;
  flushTimer: ReturnType<typeof setTimeout> | null;
  seedTimer: ReturnType<typeof setTimeout> | null;
  lastFlushTime: number;
  initialized: boolean;
  bc: BroadcastChannel | null;
}

const GLOBAL_BUS_KEY = '__RC_UI_TUNER_CROSS_CLIENT_SYNC_BUS_V3__';
const FLUSH_INTERVAL_MS = 16;

function getOrCreateBus(): SyncBusSingleton {
  const g = globalThis as Record<string, unknown>;
  if (g[GLOBAL_BUS_KEY]) {
    const existing = g[GLOBAL_BUS_KEY] as SyncBusSingleton;
    existing.defaults ??= new Map<string, unknown>();
    existing.resetListeners ??= new Set<ResetListener>();
    return existing;
  }
  const clientId = `${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36).slice(-4)}`;
  const hasViteHot = Boolean(getViteHot());
  const hasBC = !hasViteHot && typeof BroadcastChannel !== 'undefined';
  const enabled = Boolean(g.__RC_UI_TUNER_ENABLE_SYNC__);
  const bus: SyncBusSingleton = {
    clientId,
    mirror: new Map(),
    defaults: new Map(),
    keyListeners: new Map(),
    resetListeners: new Set(),
    statusListeners: new Set(),
    status: {
      connected: enabled && (hasViteHot || hasBC),
      transport: enabled ? (hasViteHot ? 'vite-ws' : hasBC ? 'broadcast-channel' : 'none') : 'none',
      paused: !enabled,
      clientId,
      lastSyncAt: null,
    },
    applyingRemoteCount: 0,
    pendingOutgoing: {},
    pendingSeeds: {},
    flushScheduled: false,
    flushTimer: null,
    seedTimer: null,
    lastFlushTime: 0,
    initialized: false,
    bc: null,
  };
  g[GLOBAL_BUS_KEY] = bus;
  return bus;
}

const bus = getOrCreateBus();

function updateStatus(patch: Partial<CrossClientSyncStatus>) {
  bus.status = { ...bus.status, ...patch };
  bus.statusListeners.forEach((fn) => fn());
}

function notifyKeyListeners(key: string, value: unknown) {
  bus.keyListeners.get(key)?.forEach((fn) => fn(value));
}

function applyIncomingEntries(rawEntries: Record<string, unknown>) {
  if (bus.status.paused) return;
  const entries = decodeEntriesFromWire(rawEntries);
  bus.applyingRemoteCount += 1;
  try {
    let changed = false;
    for (const [key, value] of Object.entries(entries)) {
      const prev = bus.mirror.get(key);
      bus.mirror.set(key, value);
      if (!Object.is(prev, value)) {
        changed = true;
        notifyKeyListeners(key, value);
      }
    }
    if (changed) updateStatus({ lastSyncAt: Date.now() });
  } finally {
    bus.applyingRemoteCount -= 1;
  }
}

function applyResetInternal(scopePrefix?: string, preserveKeys: string[] = ['app:activeTab']) {
  const preserveSet = new Set(preserveKeys);
  if (!scopePrefix) {
    bus.pendingOutgoing = {};
    bus.pendingSeeds = {};
  } else {
    for (const k of Object.keys(bus.pendingOutgoing)) {
      if (k.startsWith(scopePrefix)) delete bus.pendingOutgoing[k];
    }
    for (const k of Object.keys(bus.pendingSeeds)) {
      if (k.startsWith(scopePrefix)) delete bus.pendingSeeds[k];
    }
  }
  bus.applyingRemoteCount += 1;
  try {
    const allKeys = new Set<string>([
      ...bus.mirror.keys(),
      ...bus.defaults.keys(),
      ...bus.keyListeners.keys(),
    ]);
    for (const key of allKeys) {
      if (preserveSet.has(key) || (scopePrefix && !key.startsWith(scopePrefix))) continue;
      if (bus.defaults.has(key)) {
        const defaultVal = cloneSerializable(bus.defaults.get(key));
        bus.mirror.set(key, defaultVal);
        notifyKeyListeners(key, defaultVal);
      } else {
        bus.mirror.delete(key);
      }
    }
    bus.resetListeners.forEach((fn) => {
      try {
        fn(scopePrefix);
      } catch {
        // ignore listener errors
      }
    });
    updateStatus({ lastSyncAt: Date.now() });
  } finally {
    bus.applyingRemoteCount -= 1;
  }
}

function executeFlush() {
  bus.flushScheduled = false;
  if (bus.flushTimer !== null) {
    clearTimeout(bus.flushTimer);
    bus.flushTimer = null;
  }
  const keys = Object.keys(bus.pendingOutgoing);
  if (keys.length === 0 || bus.status.paused) {
    bus.pendingOutgoing = {};
    return;
  }
  const entries = encodeEntriesForWire(bus.pendingOutgoing);
  bus.pendingOutgoing = {};
  bus.lastFlushTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  updateStatus({ lastSyncAt: Date.now() });
  sendSyncTransportEvent(bus.bc, 'rc-ui-tuner:sync-patch', {
    senderId: bus.clientId,
    entries,
    ts: Date.now(),
  });
}

function scheduleFlush() {
  if (bus.status.paused || bus.flushScheduled) return;
  bus.flushScheduled = true;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const elapsed = now - bus.lastFlushTime;
  if (elapsed >= FLUSH_INTERVAL_MS) {
    queueMicrotask(executeFlush);
  } else {
    bus.flushTimer = setTimeout(executeFlush, Math.max(1, FLUSH_INTERVAL_MS - elapsed));
  }
}

function scheduleSeedFlush() {
  if (bus.status.paused || bus.seedTimer !== null) return;
  bus.seedTimer = setTimeout(() => {
    bus.seedTimer = null;
    if (Object.keys(bus.pendingSeeds).length === 0 || bus.status.paused) {
      bus.pendingSeeds = {};
      return;
    }
    const entries = encodeEntriesForWire(bus.pendingSeeds);
    bus.pendingSeeds = {};
    sendSyncTransportEvent(bus.bc, 'rc-ui-tuner:sync-seed', {
      senderId: bus.clientId,
      entries,
    });
  }, 20);
}

function initTransportOnce() {
  if (bus.initialized) return;
  bus.initialized = true;
  bus.bc = attachSyncTransportListeners({
    clientId: bus.clientId,
    isPaused: () => bus.status.paused,
    getMirrorEntries: () => Array.from(bus.mirror.entries()),
    hasMirrorKey: (k) => bus.mirror.has(k),
    onIncomingEntries: applyIncomingEntries,
    onIncomingReset: (scopePrefix) => applyResetInternal(scopePrefix),
    onConnect: (entriesToSeed) => {
      updateStatus({ connected: true, transport: 'vite-ws' });
      if (!bus.status.paused && Object.keys(entriesToSeed).length > 0) {
        Object.assign(bus.pendingSeeds, entriesToSeed);
        scheduleSeedFlush();
      }
    },
    onDisconnect: () => updateStatus({ connected: false }),
    encodeForWire: encodeEntriesForWire,
  });
}

export function setCrossClientSyncEnabled(enabled = true): void {
  (globalThis as Record<string, unknown>).__RC_UI_TUNER_ENABLE_SYNC__ = enabled;
  if (enabled) {
    const hasViteHot = Boolean(getViteHot());
    const hasBC = !hasViteHot && typeof BroadcastChannel !== 'undefined';
    updateStatus({
      paused: false,
      connected: hasViteHot || hasBC,
      transport: hasViteHot ? 'vite-ws' : hasBC ? 'broadcast-channel' : 'none',
    });
    initTransportOnce();
  } else {
    updateStatus({ paused: true, connected: false, transport: 'none' });
  }
}

if (Boolean((globalThis as Record<string, unknown>).__UI_STORYBOOK_ENABLE_SYNC__)) {
  initTransportOnce();
}

export interface ExportedLayerParameters {
  activeTab: string;
  exportedAt: string;
  controls: Record<string, string | number | boolean>;
  syncedState: Record<string, unknown>;
}

export const crossClientSync = {
  setEnabled: setCrossClientSyncEnabled,
  has: (key: string): boolean => bus.mirror.has(key),
  registerDefault: <T>(key: string, defaultValue: T): void => {
    if (isSyncSerializable(defaultValue)) {
      bus.defaults.set(key, cloneSerializable(defaultValue));
    }
  },
  get: <T>(key: string, fallback: T): T => {
    if (!bus.defaults.has(key) && isSyncSerializable(fallback)) {
      bus.defaults.set(key, cloneSerializable(fallback));
    }
    if (bus.mirror.has(key)) {
      const canonical = (bus.defaults.has(key) ? bus.defaults.get(key) : fallback) as T;
      return sanitizeSyncedValue(bus.mirror.get(key), canonical);
    }
    if (isSyncSerializable(fallback)) {
      bus.mirror.set(key, fallback);
      bus.pendingSeeds[key] = fallback;
      scheduleSeedFlush();
    }
    return fallback;
  },
  seed: <T>(key: string, value: T): void => {
    if (!bus.defaults.has(key) && isSyncSerializable(value)) {
      bus.defaults.set(key, cloneSerializable(value));
    }
    if (!bus.mirror.has(key) && isSyncSerializable(value)) {
      bus.mirror.set(key, value);
      bus.pendingSeeds[key] = value;
      scheduleSeedFlush();
    }
  },
  set: <T>(key: string, value: T): void => {
    if (!isSyncSerializable(value)) return;
    const prev = bus.mirror.get(key);
    bus.mirror.set(key, value);
    if (!Object.is(prev, value)) notifyKeyListeners(key, value);
    if (bus.applyingRemoteCount > 0 || bus.status.paused) return;
    bus.pendingOutgoing[key] = value;
    scheduleFlush();
  },
  subscribeKey: <T>(key: string, listener: (value: T) => void): (() => void) => {
    let set = bus.keyListeners.get(key);
    if (!set) {
      set = new Set<KeyListener>();
      bus.keyListeners.set(key, set);
    }
    const wrapped = listener as KeyListener;
    set.add(wrapped);
    return () => {
      set?.delete(wrapped);
      if (set && set.size === 0) bus.keyListeners.delete(key);
    };
  },
  onReset: (listener: ResetListener): (() => void) => {
    bus.resetListeners.add(listener);
    return () => bus.resetListeners.delete(listener);
  },
  resetAll: (options?: { scopePrefix?: string; preserveKeys?: string[] }): void => {
    const scopePrefix = options?.scopePrefix;
    applyResetInternal(scopePrefix, options?.preserveKeys ?? ['app:activeTab']);
    if (!bus.status.paused) {
      sendSyncTransportEvent(bus.bc, 'rc-ui-tuner:sync-reset', {
        senderId: bus.clientId,
        scopePrefix,
        ts: Date.now(),
      });
    }
  },
  exportParameters: (options?: {
    scopePrefix?: string;
    includeDomControls?: boolean;
  }): ExportedLayerParameters =>
    buildExportedLayerParameters(
      bus.mirror.entries(),
      String(bus.mirror.get('app:activeTab') ?? 'overview'),
      options
    ),
  getDiffEntries: (): Array<{ key: string; defaultValue: unknown; currentValue: unknown }> => {
    const out: Array<{ key: string; defaultValue: unknown; currentValue: unknown }> = [];
    for (const [key, currentValue] of bus.mirror.entries()) {
      if (!bus.defaults.has(key)) continue;
      const defaultValue = bus.defaults.get(key);
      if (!Object.is(currentValue, defaultValue)) out.push({ key, defaultValue, currentValue });
    }
    return out;
  },
  isApplyingRemote: (): boolean => bus.applyingRemoteCount > 0,
  getStatus: (): CrossClientSyncStatus => bus.status,
  subscribeStatus: (listener: () => void): (() => void) => {
    bus.statusListeners.add(listener);
    return () => bus.statusListeners.delete(listener);
  },
  setPaused: (paused: boolean): void => {
    if (bus.status.paused === paused) return;
    updateStatus({ paused });
    if (!paused) {
      sendSyncTransportEvent(bus.bc, 'rc-ui-tuner:sync-request', { senderId: bus.clientId });
    }
  },
  togglePaused: (): void => crossClientSync.setPaused(!bus.status.paused),
  requestSnapshot: (): void => {
    if (!bus.status.paused) {
      sendSyncTransportEvent(bus.bc, 'rc-ui-tuner:sync-request', { senderId: bus.clientId });
    }
  },
};

attachSyncBridge(crossClientSync);

export function useSyncedState<T>(
  key: string,
  initialValue: T | (() => T)
): [T, Dispatch<SetStateAction<T>>] {
  const defaultRef = useRef<{ initialized: boolean; value: T }>({
    initialized: false,
    value: undefined as unknown as T,
  });
  if (!defaultRef.current.initialized) {
    defaultRef.current.value =
      typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
    defaultRef.current.initialized = true;
    crossClientSync.registerDefault(key, defaultRef.current.value);
  }
  const [state, setLocalState] = useState<T>(() => {
    const resolved = defaultRef.current.value;
    if (crossClientSync.has(key)) {
      return sanitizeSyncedValue(crossClientSync.get<T>(key, resolved), resolved);
    }
    crossClientSync.seed(key, resolved);
    return resolved;
  });
  const normalizedState = sanitizeSyncedValue(state, defaultRef.current.value);
  const latestRef = useRef<T>(normalizedState);
  latestRef.current = normalizedState;
  useEffect(() => {
    const canonicalDefault = defaultRef.current.value;
    crossClientSync.registerDefault(key, canonicalDefault);
    if (crossClientSync.has(key)) {
      const currentMirrorVal = sanitizeSyncedValue(
        crossClientSync.get<T>(key, latestRef.current),
        canonicalDefault
      );
      if (!Object.is(currentMirrorVal, latestRef.current)) {
        latestRef.current = currentMirrorVal;
        setLocalState(currentMirrorVal);
      }
    }
    return crossClientSync.subscribeKey<T>(key, (rawNextVal) => {
      const nextVal = sanitizeSyncedValue(rawNextVal, canonicalDefault);
      if (!Object.is(nextVal, latestRef.current)) {
        latestRef.current = nextVal;
        setLocalState(nextVal);
      }
    });
  }, [key]);
  const setSyncedState: Dispatch<SetStateAction<T>> = useCallback(
    (action: SetStateAction<T>) => {
      const canonicalDefault = defaultRef.current.value;
      const rawBase = crossClientSync.has(key)
        ? crossClientSync.get<T>(key, latestRef.current)
        : latestRef.current;
      const base = sanitizeSyncedValue(rawBase, canonicalDefault);
      const rawNext =
        typeof action === 'function' ? (action as (prev: T) => T)(base) : action;
      const next = sanitizeSyncedValue(rawNext, canonicalDefault);
      latestRef.current = next;
      setLocalState(next);
      crossClientSync.set(key, next);
    },
    [key]
  );
  return [normalizedState, setSyncedState];
}

export function createScopedSyncedState(scope: string) {
  return function useScopedState<T>(
    initialValue: T | (() => T),
    explicitSubKey: string
  ): [T, Dispatch<SetStateAction<T>>] {
    return useSyncedState<T>(`${scope}:${explicitSubKey}`, initialValue);
  };
}

export function useCrossClientSyncStatus() {
  const status = useSyncExternalStore(
    crossClientSync.subscribeStatus,
    crossClientSync.getStatus
  );
  return {
    ...status,
    setPaused: crossClientSync.setPaused,
    togglePaused: crossClientSync.togglePaused,
    requestSnapshot: crossClientSync.requestSnapshot,
    resetAll: crossClientSync.resetAll,
    exportParameters: crossClientSync.exportParameters,
  };
}
