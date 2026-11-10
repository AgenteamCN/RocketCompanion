/**
 * CredentialBundleManager.ts
 * Stateful SubController managing signaling credential precedence:
 *   1. `imported-bundle` (.rctbnspib) — strictly disables Public & Custom overrides
 *   2. `dev-private` (unless `?nokey=1` simulation is active)
 *   3. `custom` (user-configured single self-hosted or public relay override, unverified / No SLA)
 *   4. `public` (parameter-supplied fallback via `?publicBroker=` or `VITE_PUBLIC_FALLBACK_BROKER_URL`, default empty, unverified / No SLA)
 */

import {
  computeProfileCanonicalHash,
  computeShortConfigHashSync,
  decryptRctbnspibBundle,
  encryptRctbnspibBundle,
} from './credentialBundleCryptoPipeline.ts';
import {
  DEV_PROFILE_ENDPOINT,
  PUBLIC_FALLBACK_RELAY_SPEC,
  inferProtocolFromUrl,
  isNoKeySimulationEnabled,
  readPersistedCustomRelay,
  readPersistedProfile,
  resolvePublicFallbackBrokerUrl,
  writePersistedCustomRelay,
  writePersistedProfile,
} from './credentialBundlePersistence.ts';
import {
  PUBLIC_FALLBACK_BROKER_URL,
  type CustomRelayConfig,
  type RctbnspibEncryptedEnvelope,
  type RctbnspibExportResult,
  type RelayCredentialOverrideOptions,
  type SignalingConfigSource,
  type SignalingProfilePayload,
  type SignalingProfileStatusSummary,
  type SignalingRelaySpec,
  type TurnIceServerSpec,
} from './credentialBundleTypes.ts';

export class CredentialBundleManager {
  private importedProfile: SignalingProfilePayload | null = null;
  private devPrivateProfile: SignalingProfilePayload | null = null;
  private customRelay: CustomRelayConfig | null = null;
  private listeners = new Set<(status: SignalingProfileStatusSummary) => void>();
  private devHydrationTriggered = false;

  constructor() {
    const persisted = readPersistedProfile();
    if (persisted && persisted.profileSource === 'imported-bundle') {
      this.importedProfile = persisted;
    }
    this.customRelay = readPersistedCustomRelay();
    this.tryHydrateDevProfile();
  }

  private tryHydrateDevProfile(): void {
    if (this.devHydrationTriggered) return;
    this.devHydrationTriggered = true;

    if (isNoKeySimulationEnabled()) {
      this.devPrivateProfile = null;
      this.notifyListeners();
      return;
    }

    const injected = (globalThis as Record<string, any>).__RC_DEV_PRIVATE_PROFILE__;
    if (
      injected &&
      Array.isArray(injected.signaling?.relays) &&
      injected.signaling.relays.length > 0
    ) {
      this.devPrivateProfile = {
        ...(injected as SignalingProfilePayload),
        profileSource: 'private',
      };
      this.notifyListeners();
      return;
    }

    const isDevEnv = Boolean((import.meta as any).env?.DEV);
    if (!isDevEnv || typeof fetch === 'undefined') return;

    fetch(DEV_PROFILE_ENDPOINT, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: SignalingProfilePayload | null) => {
        if (isNoKeySimulationEnabled()) return;
        if (data && Array.isArray(data.signaling?.relays) && data.signaling.relays.length > 0) {
          this.devPrivateProfile = {
            ...data,
            profileSource: 'private',
          };
          this.notifyListeners();
        }
      })
      .catch(() => {
        // Ignore dev endpoint absence
      });
  }

  subscribe(listener: (status: SignalingProfileStatusSummary) => void): () => void {
    this.listeners.add(listener);
    listener(this.getStatusSummary());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const summary = this.getStatusSummary();
    for (const listener of this.listeners) {
      try {
        listener(summary);
      } catch {
        // Ignore listener error
      }
    }
  }

  getActiveSource(): SignalingConfigSource {
    if (this.importedProfile && this.importedProfile.signaling.relays.length > 0) {
      return 'imported-bundle';
    }
    if (this.customRelay && this.customRelay.url.trim()) {
      return 'custom';
    }
    if (
      !isNoKeySimulationEnabled() &&
      this.devPrivateProfile &&
      this.devPrivateProfile.signaling.relays.length > 0
    ) {
      return 'dev-private';
    }
    return 'public';
  }

  isImportedBundleActive(): boolean {
    return this.getActiveSource() === 'imported-bundle';
  }

  hasLoadedProfile(): boolean {
    const src = this.getActiveSource();
    return src === 'imported-bundle' || src === 'dev-private';
  }

  getActiveProfile(): SignalingProfilePayload | null {
    const src = this.getActiveSource();
    if (src === 'imported-bundle') return this.importedProfile;
    if (src === 'dev-private') return this.devPrivateProfile;
    return null;
  }

  getCustomRelayConfig(): CustomRelayConfig | null {
    return this.customRelay ? { ...this.customRelay } : null;
  }

  setCustomRelayConfig(config: CustomRelayConfig | null): SignalingProfileStatusSummary {
    if (this.isImportedBundleActive()) {
      throw new Error(
        'Cannot modify custom server parameters while an imported .rctbnspib bundle is active. Delete the imported bundle first.'
      );
    }
    if (!config || !config.url.trim()) {
      this.customRelay = null;
      writePersistedCustomRelay(null);
    } else {
      this.customRelay = {
        url: config.url.trim(),
        protocol: config.protocol || inferProtocolFromUrl(config.url),
        username: (config.username || '').trim(),
        password: config.password || '',
        authToken: (config.authToken || '').trim(),
      };
      writePersistedCustomRelay(this.customRelay);
    }
    this.notifyListeners();
    return this.getStatusSummary();
  }

  getRelays(): SignalingRelaySpec[] {
    const source = this.getActiveSource();
    if (source === 'imported-bundle' && this.importedProfile) {
      return this.importedProfile.signaling.relays.slice(0, 4).map((r) => ({ ...r }));
    }
    if (source === 'dev-private' && this.devPrivateProfile) {
      return this.devPrivateProfile.signaling.relays.slice(0, 4).map((r) => ({ ...r }));
    }
    if (source === 'custom' && this.customRelay?.url) {
      const protocol = this.customRelay.protocol || inferProtocolFromUrl(this.customRelay.url);
      return [
        {
          id: 'custom_primary',
          label: 'Custom Self-Hosted Relay',
          protocol,
          url: this.customRelay.url,
          username: this.customRelay.username || '',
          password: this.customRelay.password || '',
          authToken: this.customRelay.authToken || undefined,
          staggerDelayMs: 0,
          connectTimeoutMs: 5000,
          keepAliveSeconds: 30,
        },
      ];
    }
    const fallbackUrl = resolvePublicFallbackBrokerUrl();
    return [
      {
        ...PUBLIC_FALLBACK_RELAY_SPEC,
        url: fallbackUrl,
        protocol: fallbackUrl
          ? inferProtocolFromUrl(fallbackUrl)
          : PUBLIC_FALLBACK_RELAY_SPEC.protocol,
      },
    ];
  }

  getDefaultSignalingUrl(): string {
    const relays = this.getRelays();
    return relays[0]?.url || resolvePublicFallbackBrokerUrl() || PUBLIC_FALLBACK_BROKER_URL;
  }

  getRoomPrefix(): string {
    const active = this.getActiveProfile();
    return active?.signaling?.roomPrefix || '';
  }

  getTopicNamespace(): string {
    const active = this.getActiveProfile();
    return active?.signaling?.topicNamespace || 'rc/sig';
  }

  getTurnIceServers(): TurnIceServerSpec[] {
    const active = this.getActiveProfile();
    if (!active?.turn?.iceServers) {
      return [];
    }
    return active.turn.iceServers.map((s) => ({ ...s }));
  }

  getConfigSyncSpec(): {
    brokerUrl: string;
    topicNamespace: string;
    clientUsername: string;
    clientPassword: string;
    devUsername?: string;
    devPassword?: string;
    source: SignalingConfigSource;
  } | null {
    const source = this.getActiveSource();
    if (source !== 'imported-bundle' && source !== 'dev-private') {
      return null;
    }
    const active = this.getActiveProfile();
    const cfg = active?.configSync;
    if (!cfg || !cfg.brokerUrl || !cfg.topicNamespace || !cfg.clientUsername) {
      return null;
    }
    return {
      brokerUrl: cfg.brokerUrl,
      topicNamespace: cfg.topicNamespace,
      clientUsername: cfg.clientUsername,
      clientPassword: cfg.clientPassword || '',
      ...(source === 'dev-private' && cfg.devUsername
        ? { devUsername: cfg.devUsername, devPassword: cfg.devPassword || '' }
        : {}),
      source,
    };
  }

  getStatusSummary(): SignalingProfileStatusSummary {
    const source = this.getActiveSource();
    const relays = this.getRelays();
    const activeProfile = this.getActiveProfile();
    const turnServers = activeProfile?.turn?.iceServers || [];
    const loaded = source === 'imported-bundle' || source === 'dev-private';

    const rawHash =
      activeProfile?.profileHash ||
      computeShortConfigHashSync({
        source,
        urls: relays.map((r) => r.url),
        namespace: this.getTopicNamespace(),
        roomPrefix: this.getRoomPrefix(),
      });
    const shortHash = rawHash.slice(0, 4).toLowerCase();

    return {
      loaded,
      source,
      profileHash: rawHash,
      shortHash,
      relayCount: relays.length,
      relayLabels: relays.map((r) => r.label || r.id),
      turnServerCount: turnServers.length,
      customUrl: this.customRelay?.url || '',
      customUsername: this.customRelay?.username || '',
      noKeySimulationActive: isNoKeySimulationEnabled(),
    };
  }

  async importEncryptedBundle(
    rawBundleTextOrObject: string | RctbnspibEncryptedEnvelope,
    pinCode: string
  ): Promise<SignalingProfileStatusSummary> {
    const decrypted = await decryptRctbnspibBundle(rawBundleTextOrObject, pinCode);
    const normalizedRelays = decrypted.signaling.relays.slice(0, 4);
    const normalizedProfile: SignalingProfilePayload = {
      ...decrypted,
      profileSource: 'imported-bundle',
      signaling: {
        ...decrypted.signaling,
        relays: normalizedRelays,
      },
      ...(decrypted.configSync?.brokerUrl && decrypted.configSync?.clientUsername
        ? {
            configSync: {
              brokerUrl: decrypted.configSync.brokerUrl,
              topicNamespace: decrypted.configSync.topicNamespace || '',
              clientUsername: decrypted.configSync.clientUsername,
              clientPassword: decrypted.configSync.clientPassword || '',
            },
          }
        : {}),
    };
    this.importedProfile = normalizedProfile;
    writePersistedProfile(normalizedProfile);
    this.notifyListeners();
    return this.getStatusSummary();
  }

  async exportActiveBundle(
    options: {
      pinCode?: string;
      windowMinutes?: number;
      credentialOverrides?: RelayCredentialOverrideOptions;
    } = {}
  ): Promise<RctbnspibExportResult> {
    const exportTarget = this.devPrivateProfile || this.importedProfile;
    if (!exportTarget || exportTarget.signaling.relays.length === 0) {
      throw new Error(
        'No active signaling profile is loaded to export. Start in local dev with a private profile first.'
      );
    }
    const ov = options.credentialOverrides;
    const minimizedRelays: SignalingRelaySpec[] = exportTarget.signaling.relays
      .slice(0, 4)
      .map((relay) => {
        const id = relay.id.trim().toLowerCase();
        if (relay.protocol === 'mqtt') {
          const username =
            id === 'emqx_cn' && ov?.emqxCnUsername?.trim()
              ? ov.emqxCnUsername.trim()
              : id === 'emqx_gb' && ov?.emqxGbUsername?.trim()
                ? ov.emqxGbUsername.trim()
                : relay.username || '';
          const password =
            id === 'emqx_cn' && ov?.emqxCnPassword
              ? ov.emqxCnPassword
              : id === 'emqx_gb' && ov?.emqxGbPassword
                ? ov.emqxGbPassword
                : relay.password || '';
          return {
            id: relay.id,
            label: relay.label,
            protocol: 'mqtt',
            url: relay.url,
            username,
            password,
            staggerDelayMs: relay.staggerDelayMs ?? 0,
            connectTimeoutMs: relay.connectTimeoutMs ?? 4500,
            keepAliveSeconds: relay.keepAliveSeconds ?? 30,
          };
        }
        return {
          id: relay.id,
          label: relay.label,
          protocol: relay.protocol,
          url: relay.url,
          username: '',
          password: '',
          authToken: relay.authToken || relay.password || undefined,
          staggerDelayMs: relay.staggerDelayMs ?? 0,
          connectTimeoutMs: relay.connectTimeoutMs ?? 4500,
          keepAliveSeconds: relay.keepAliveSeconds ?? 25,
        };
      });

    const sanitizedPayload: SignalingProfilePayload = {
      profileSource: 'imported-bundle',
      signaling: {
        defaultSignalingUrl: minimizedRelays[0]?.url || '',
        roomPrefix: exportTarget.signaling.roomPrefix || '',
        topicNamespace: exportTarget.signaling.topicNamespace || 'rc/sig',
        relays: minimizedRelays,
      },
      ...(exportTarget.turn?.iceServers?.length
        ? { turn: { iceServers: exportTarget.turn.iceServers } }
        : {}),
      ...(exportTarget.configSync?.brokerUrl && exportTarget.configSync?.clientUsername
        ? {
            configSync: {
              brokerUrl: exportTarget.configSync.brokerUrl,
              topicNamespace: exportTarget.configSync.topicNamespace || '',
              clientUsername: exportTarget.configSync.clientUsername,
              clientPassword: exportTarget.configSync.clientPassword || '',
            },
          }
        : {}),
    };

    const profileHash = await computeProfileCanonicalHash(sanitizedPayload);
    return encryptRctbnspibBundle(
      {
        ...sanitizedPayload,
        profileHash,
      },
      options
    );
  }

  clearImportedProfile(): SignalingProfileStatusSummary {
    writePersistedProfile(null);
    this.importedProfile = null;
    this.notifyListeners();
    return this.getStatusSummary();
  }
}

export const credentialBundleManager = new CredentialBundleManager();
