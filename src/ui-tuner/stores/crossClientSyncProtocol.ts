import { isKeyInActiveTabScope } from './tabSyncScopeRegistry';

export interface ViteHotTransport {
  send?: (event: string, payload: Record<string, unknown>) => void;
  on?: <T = unknown>(event: string, cb: (data: T) => void) => void;
}

export function getViteHot(): ViteHotTransport | undefined {
  if (typeof import.meta === 'undefined') return undefined;
  return (import.meta as unknown as { hot?: ViteHotTransport }).hot;
}

export function sendSyncTransportEvent(
  bc: BroadcastChannel | null,
  event: string,
  payload: Record<string, unknown>
): void {
  const hot = getViteHot();
  if (hot && typeof hot.send === 'function') {
    hot.send(event, payload);
    return;
  }
  if (bc) {
    try {
      bc.postMessage({ event, payload });
    } catch {
      // ignore broadcast errors
    }
  }
}

export interface SyncTransportCallbacks {
  clientId: string;
  isPaused: () => boolean;
  getMirrorEntries: () => Array<[string, unknown]>;
  hasMirrorKey: (key: string) => boolean;
  onIncomingEntries: (rawEntries: Record<string, unknown>) => void;
  onIncomingReset: (scopePrefix?: string) => void;
  onConnect: (entriesToSeed: Record<string, unknown>) => void;
  onDisconnect: () => void;
  encodeForWire: (entries: Record<string, unknown>) => Record<string, unknown>;
}

export function attachSyncTransportListeners(
  callbacks: SyncTransportCallbacks
): BroadcastChannel | null {
  const hot = getViteHot();
  if (hot && typeof hot.on === 'function') {
    hot.on(
      'rc-ui-tuner:sync-patch',
      (data: { senderId?: string; entries?: Record<string, unknown> }) => {
        if (!data || data.senderId === callbacks.clientId || !data.entries) return;
        callbacks.onIncomingEntries(data.entries);
      }
    );
    hot.on(
      'rc-ui-tuner:sync-snapshot',
      (data: { targetId?: string; entries?: Record<string, unknown> }) => {
        if (!data || !data.entries) return;
        if (data.targetId && data.targetId !== callbacks.clientId) return;
        callbacks.onIncomingEntries(data.entries);
      }
    );
    hot.on(
      'rc-ui-tuner:sync-reset',
      (data: { senderId?: string; scopePrefix?: string }) => {
        if (!data || data.senderId === callbacks.clientId) return;
        if (callbacks.isPaused()) return;
        callbacks.onIncomingReset(data.scopePrefix);
      }
    );
    hot.on('vite:ws:connect', () => {
      const seedEntries: Record<string, unknown> = {};
      for (const [k, v] of callbacks.getMirrorEntries()) {
        seedEntries[k] = v;
      }
      callbacks.onConnect(seedEntries);
      sendSyncTransportEvent(null, 'rc-ui-tuner:sync-request', {
        senderId: callbacks.clientId,
      });
    });
    hot.on('vite:ws:disconnect', () => {
      callbacks.onDisconnect();
    });
    sendSyncTransportEvent(null, 'rc-ui-tuner:sync-request', {
      senderId: callbacks.clientId,
    });
    return null;
  }

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const bc = new BroadcastChannel('rc-ui-tuner-ws-fallback');
      bc.onmessage = (ev) => {
        const msg = ev.data;
        if (!msg || !msg.payload) return;
        const { event, payload } = msg;
        if (payload.senderId === callbacks.clientId) return;
        if (event === 'rc-ui-tuner:sync-patch' && payload.entries) {
          callbacks.onIncomingEntries(payload.entries);
        } else if (event === 'rc-ui-tuner:sync-reset') {
          if (!callbacks.isPaused()) {
            callbacks.onIncomingReset(payload.scopePrefix);
          }
        } else if (event === 'rc-ui-tuner:sync-seed' && payload.entries) {
          const filtered: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(payload.entries)) {
            if (!callbacks.hasMirrorKey(k)) filtered[k] = v;
          }
          if (Object.keys(filtered).length > 0) {
            callbacks.onIncomingEntries(filtered);
          }
        } else if (event === 'rc-ui-tuner:sync-request') {
          const entriesList = callbacks.getMirrorEntries();
          if (entriesList.length > 0) {
            bc.postMessage({
              event: 'rc-ui-tuner:sync-snapshot',
              payload: {
                targetId: payload.senderId,
                senderId: callbacks.clientId,
                entries: callbacks.encodeForWire(Object.fromEntries(entriesList)),
              },
            });
          }
        } else if (
          event === 'rc-ui-tuner:sync-snapshot' &&
          payload.targetId === callbacks.clientId &&
          payload.entries
        ) {
          callbacks.onIncomingEntries(payload.entries);
        }
      };
      sendSyncTransportEvent(bc, 'rc-ui-tuner:sync-request', {
        senderId: callbacks.clientId,
      });
      return bc;
    } catch {
      return null;
    }
  }
  return null;
}

export function buildExportedLayerParameters(
  mirrorEntries: Iterable<[string, unknown]>,
  activeTab: string,
  options?: { scopePrefix?: string; includeDomControls?: boolean }
) {
  const includeDom = options?.includeDomControls ?? true;
  const controls: Record<string, string | number | boolean> = {};
  if (includeDom && typeof document !== 'undefined') {
    const root = document.querySelector('main') ?? document.body;
    const nodes = root.querySelectorAll('[data-tuner-label]');
    nodes.forEach((el) => {
      const label = el.getAttribute('data-tuner-label');
      const rawVal = el.getAttribute('data-tuner-value');
      if (!label || rawVal === null) return;
      let parsed: string | number | boolean = rawVal;
      if (rawVal === 'true') parsed = true;
      else if (rawVal === 'false') parsed = false;
      else if (/^-?\d+(\.\d+)?$/.test(rawVal)) parsed = Number(rawVal);
      const key =
        label in controls ? `${label} (${Object.keys(controls).length + 1})` : label;
      controls[key] = parsed;
    });
  }
  const syncedState: Record<string, unknown> = {};
  const prefix = options?.scopePrefix;
  for (const [k, v] of mirrorEntries) {
    if (isKeyInActiveTabScope(k, activeTab, prefix)) {
      syncedState[k] = v;
    }
  }
  return {
    activeTab,
    exportedAt: new Date().toISOString(),
    controls,
    syncedState,
  };
}
