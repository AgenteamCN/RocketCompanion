import { create } from 'zustand';

export type SignalingProfileSource = 'public' | 'custom' | 'dev-private' | 'imported-bundle';

export interface SignalingRelayProbeViewItem {
  id: string;
  label: string;
  protocol: 'mqtt' | 'ws' | 'supabase';
  ok: boolean;
  rttMs: number;
  error?: string;
}

export interface SignalingProfileExportSnapshot {
  suggestedFileName: string;
  serializedJson: string;
  pinCode: string;
  windowMinutes: number;
  expiresAtMs: number;
}

export interface CustomRelayInputPayload {
  url: string;
  username?: string;
  password?: string;
}

export interface RelayCredentialOverrideInput {
  emqxCnUsername?: string;
  emqxCnPassword?: string;
  emqxGbUsername?: string;
  emqxGbPassword?: string;
}

export type SignalingRelayMatchPolicyMode = 'smart-prune' | 'keep-all-probed';

export interface SignalingProfileBridgeCallbacks {
  onImportBundle?: (rawContent: string, pinCode: string) => Promise<void>;
  onExportBundle?: (options: {
    pinCode?: string;
    windowMinutes?: number;
    credentialOverrides?: RelayCredentialOverrideInput;
  }) => Promise<SignalingProfileExportSnapshot>;
  onClearBundle?: () => void;
  onSaveCustomRelay?: (payload: CustomRelayInputPayload | null) => void;
  onVerifyRelays?: () => Promise<SignalingRelayProbeViewItem[]>;
  onSetRelayMatchPolicy?: (policy: SignalingRelayMatchPolicyMode) => void;
}

export interface SignalingProfileStoreState {
  loaded: boolean;
  source: SignalingProfileSource;
  profileHash: string;
  shortHash: string;
  relayCount: number;
  relayLabels: string[];
  turnServerCount: number;
  customUrl: string;
  customUsername: string;
  noKeySimulationActive: boolean;
  hostMask: number;
  relayMatchPolicy: SignalingRelayMatchPolicyMode;
  hasProbedOnce: boolean;
  isBusy: boolean;
  isProbing: boolean;
  statusMessage: string | null;
  errorMessage: string | null;
  probeResults: SignalingRelayProbeViewItem[];
  lastExport: SignalingProfileExportSnapshot | null;
  bridge: SignalingProfileBridgeCallbacks;

  syncStatus: (patch: {
    loaded: boolean;
    source: SignalingProfileSource;
    profileHash: string;
    shortHash?: string;
    relayCount: number;
    relayLabels: string[];
    turnServerCount: number;
    customUrl?: string;
    customUsername?: string;
    noKeySimulationActive?: boolean;
  }) => void;
  registerBridge: (bridge: SignalingProfileBridgeCallbacks) => void;
  clearMessages: () => void;
  importBundle: (rawContent: string, pinCode: string) => Promise<boolean>;
  exportBundle: (options?: {
    pinCode?: string;
    windowMinutes?: number;
    credentialOverrides?: RelayCredentialOverrideInput;
  }) => Promise<SignalingProfileExportSnapshot | null>;
  clearProfile: () => void;
  saveCustomRelay: (payload: CustomRelayInputPayload | null) => void;
  setRelayMatchPolicy: (policy: SignalingRelayMatchPolicyMode) => void;
  verifyRelays: () => Promise<number>;
}

function computeBitmaskFromProbeItems(items: SignalingRelayProbeViewItem[]): number {
  const slotBits = [0b1000, 0b0100, 0b0010, 0b0001];
  let mask = 0;
  for (let i = 0; i < items.length && i < 4; i++) {
    if (items[i].ok) {
      mask |= slotBits[i];
    }
  }
  return mask & 0x0f;
}

export const useSignalingProfileStore = create<SignalingProfileStoreState>((set, get) => ({
  loaded: false,
  source: 'public',
  profileHash: '',
  shortHash: 'publ',
  relayCount: 1,
  relayLabels: ['Public Fallback Broker (Unverified / No SLA)'],
  turnServerCount: 0,
  customUrl: '',
  customUsername: '',
  noKeySimulationActive: false,
  hostMask: 0x0f,
  relayMatchPolicy: 'smart-prune',
  hasProbedOnce: false,
  isBusy: false,
  isProbing: false,
  statusMessage: null,
  errorMessage: null,
  probeResults: [],
  lastExport: null,
  bridge: {},

  syncStatus: (patch) => {
    const shortHash =
      patch.shortHash ||
      (patch.profileHash ? patch.profileHash.slice(0, 4).toLowerCase() : 'publ');
    set({
      loaded: patch.loaded,
      source: patch.source,
      profileHash: patch.profileHash,
      shortHash,
      relayCount: patch.relayCount,
      relayLabels: patch.relayLabels,
      turnServerCount: patch.turnServerCount,
      customUrl: patch.customUrl ?? get().customUrl,
      customUsername: patch.customUsername ?? get().customUsername,
      noKeySimulationActive: patch.noKeySimulationActive ?? get().noKeySimulationActive,
    });
  },

  registerBridge: (bridge) => {
    set((state) => ({
      bridge: { ...state.bridge, ...bridge },
    }));
  },

  clearMessages: () => {
    set({ statusMessage: null, errorMessage: null });
  },

  importBundle: async (rawContent, pinCode) => {
    const { onImportBundle } = get().bridge;
    if (!onImportBundle) {
      set({ errorMessage: 'Credential bundle bridge is not initialized.' });
      return false;
    }
    set({ isBusy: true, errorMessage: null, statusMessage: null });
    try {
      await onImportBundle(rawContent, pinCode);
      set({
        isBusy: false,
        probeResults: [],
        hasProbedOnce: false,
        statusMessage:
          'Imported .rctbnspib bundle active. Public & Custom brokers are now locked out.',
        errorMessage: null,
      });
      void get().verifyRelays();
      return true;
    } catch (err: any) {
      set({
        isBusy: false,
        errorMessage: err?.message || 'Failed to decrypt .rctbnspib bundle.',
        statusMessage: null,
      });
      return false;
    }
  },

  exportBundle: async (options = {}) => {
    const { onExportBundle } = get().bridge;
    if (!onExportBundle) {
      set({ errorMessage: 'Credential bundle export bridge is not initialized.' });
      return null;
    }
    set({ isBusy: true, errorMessage: null, statusMessage: null });
    try {
      const result = await onExportBundle(options);
      set({
        isBusy: false,
        lastExport: result,
        statusMessage: `Exported ${result.suggestedFileName} (valid for ${result.windowMinutes}m).`,
        errorMessage: null,
      });
      return result;
    } catch (err: any) {
      set({
        isBusy: false,
        errorMessage: err?.message || 'Failed to export .rctbnspib bundle.',
        statusMessage: null,
      });
      return null;
    }
  },

  clearProfile: () => {
    get().bridge.onClearBundle?.();
    set({
      probeResults: [],
      hasProbedOnce: false,
      lastExport: null,
      statusMessage: 'Deleted imported signaling bundle. Reverted to fallback configuration.',
      errorMessage: null,
    });
  },

  saveCustomRelay: (payload) => {
    if (get().source === 'imported-bundle') {
      set({
        errorMessage:
          'Cannot configure custom relay while an imported .rctbnspib bundle is active. Delete the imported bundle first.',
      });
      return;
    }
    try {
      get().bridge.onSaveCustomRelay?.(payload);
      set({
        probeResults: [],
        hasProbedOnce: false,
        statusMessage:
          payload && payload.url.trim()
            ? 'Saved custom self-hosted signaling server.'
            : 'Cleared custom server. Reverted to default public fallback state.',
        errorMessage: null,
      });
      void get().verifyRelays();
    } catch (err: any) {
      set({
        errorMessage: err?.message || 'Failed to update custom signaling configuration.',
      });
    }
  },

  setRelayMatchPolicy: (policy) => {
    set({ relayMatchPolicy: policy });
    get().bridge.onSetRelayMatchPolicy?.(policy);
  },

  verifyRelays: async () => {
    const { onVerifyRelays } = get().bridge;
    if (!onVerifyRelays) return get().hostMask;
    set({ isProbing: true, errorMessage: null });
    try {
      const results = await onVerifyRelays();
      const reachable = results.filter((r) => r.ok).length;
      const computedMask = computeBitmaskFromProbeItems(results);
      set({
        isProbing: false,
        hasProbedOnce: true,
        probeResults: results,
        hostMask: computedMask,
        statusMessage: `Verified ${reachable}/${results.length} signaling relay(s) reachable (mask 0x${computedMask.toString(16)}).`,
      });
      return computedMask;
    } catch (err: any) {
      set({
        isProbing: false,
        hasProbedOnce: true,
        hostMask: 0,
        errorMessage: err?.message || 'Signaling relay probe failed.',
      });
      return 0;
    }
  },
}));

export const signalingProfileStore = {
  getState: () => useSignalingProfileStore.getState(),
  subscribe: useSignalingProfileStore.subscribe,
};
