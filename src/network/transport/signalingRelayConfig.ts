/**
 * signalingRelayConfig.ts
 * Signaling configuration, CredentialBundleManager delegation, and LocalStorage persistence
 * for Multi-Relay E2EE Signaling and Host Offers.
 *
 * Enforces strict source mutex:
 *   - When `imported-bundle` is active, public and custom brokers are completely bypassed.
 *   - When `custom` is configured (and no imported bundle is active), only the custom relay is used.
 *   - When neither is set (or `?nokey=1` is active without custom/imported bundle), falls back to parameter-supplied Public Fallback Broker (default empty, No SLA).
 */

import { credentialBundleManager } from './CredentialBundleManager.ts';
import { PUBLIC_FALLBACK_RELAY_SPEC } from './credentialBundlePersistence.ts';
import {
  PUBLIC_FALLBACK_BROKER_URL,
  type SignalingProtocolType,
  type SignalingRelayCredentials,
  type SignalingRelaySpec,
} from './credentialBundleTypes.ts';

export type { SignalingRelaySpec, SignalingRelayCredentials };

export const SIGNALING_STORAGE_KEYS = Object.freeze({
  SIGNALING_URL: 'signaling-url',
  SIGNALING_MANUAL_PAIRING: 'signaling-manual-pairing',
  ALLOW_SPECTATOR_DAISY_CHAIN: 'allow-spectator-daisy-chain',
  ACTIVE_HOST: 'active-host',
});

function readSignalingStorage(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch (err) {
    console.warn(`[signalingRelayConfig] Error reading key "${key}" from localStorage:`, err);
    return null;
  }
}

function writeSignalingStorage(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch (err) {
    console.warn(`[signalingRelayConfig] Error writing key "${key}" to localStorage:`, err);
  }
}

function removeSignalingStorage(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch (err) {
    console.warn(`[signalingRelayConfig] Error removing key "${key}" from localStorage:`, err);
  }
}

export const DEFAULT_SIGNALING_URL = PUBLIC_FALLBACK_BROKER_URL;
export const SIGNALING_ROOM_PREFIX = '';
export const SIGNALING_TOPIC_NAMESPACE = 'rc/sig';
export const DEFAULT_EDGE_FUNCTION_BRIDGE_URL = '';

export function getSignalingRoomPrefix(): string {
  return credentialBundleManager.getRoomPrefix() || SIGNALING_ROOM_PREFIX;
}

export function getSignalingTopicNamespace(): string {
  return credentialBundleManager.getTopicNamespace() || SIGNALING_TOPIC_NAMESPACE;
}

export function getEdgeFunctionBridgeUrl(): string {
  const active = credentialBundleManager.getActiveProfile();
  const explicit =
    active?.signaling?.edgeFunctionBridgeUrl ||
    active?.signaling?.edgeBridgeUrl ||
    active?.signaling?.relays?.find((r) => r.edgeFunctionBridgeUrl)?.edgeFunctionBridgeUrl;
  if (explicit) return explicit;
  const sbRelay = active?.signaling?.relays?.find((r) => r.protocol === 'supabase' && r.url);
  if (sbRelay?.url) {
    try {
      const origin = new URL(
        sbRelay.url.replace(/^wss:\/\//i, 'https://').replace(/^ws:\/\//i, 'http://')
      ).origin;
      return `${origin}/functions/v1/signaling-bridge`;
    } catch {
      // ignore invalid URL
    }
  }
  return DEFAULT_EDGE_FUNCTION_BRIDGE_URL;
}

export const DEFAULT_SIGNALING_RELAYS: readonly Readonly<SignalingRelaySpec>[] = Object.freeze([
  PUBLIC_FALLBACK_RELAY_SPEC,
]);

let _memoryManualPairing: boolean | null = null;
let _memoryAllowDaisyChain: boolean | null = null;

export function detectSignalingProtocol(url: string | null | undefined): SignalingProtocolType {
  const clean = String(url || '')
    .trim()
    .toLowerCase();
  const matchedRelay = credentialBundleManager
    .getRelays()
    .find((relay) => relay.url.toLowerCase() === clean);
  if (matchedRelay?.protocol) {
    return matchedRelay.protocol;
  }
  if (clean.includes('supabase.co') || clean.includes('/realtime/v1')) {
    return 'supabase';
  }
  if (
    clean.endsWith('/mqtt') ||
    clean.includes('/mqtt?') ||
    clean.includes(':8084') ||
    clean.includes(':8083')
  ) {
    return 'mqtt';
  }
  return 'ws';
}

export function resolveSignalingRelayCredentials(
  url: string | null | undefined,
  overrideCredentials: { username?: string; password?: string; authToken?: string } | null = null
): SignalingRelayCredentials {
  const normalizedUrl = String(url || '').trim();
  const bundleRelays = credentialBundleManager.getRelays();
  const matchedRelay = bundleRelays.find((relay) => relay.url === normalizedUrl);

  return {
    username: overrideCredentials?.username ?? (matchedRelay?.username || ''),
    password: overrideCredentials?.password ?? (matchedRelay?.password || ''),
    authToken: overrideCredentials?.authToken ?? matchedRelay?.authToken,
  };
}

export function getSignalingUrl(): string {
  return credentialBundleManager.getDefaultSignalingUrl() || DEFAULT_SIGNALING_URL;
}

export function setSignalingUrl(url: string | null | undefined): void {
  if (credentialBundleManager.isImportedBundleActive()) {
    return;
  }
  const clean = url && typeof url === 'string' && url.trim() ? url.trim() : '';
  if (clean) {
    const existing = credentialBundleManager.getCustomRelayConfig();
    credentialBundleManager.setCustomRelayConfig({
      url: clean,
      protocol: detectSignalingProtocol(clean),
      username: existing?.username || '',
      password: existing?.password || '',
      authToken: existing?.authToken || '',
    });
  } else {
    credentialBundleManager.setCustomRelayConfig(null);
  }
}

export function getSignalingRelays(): SignalingRelaySpec[] {
  return credentialBundleManager.getRelays();
}

export function getManualPairingConfirmationEnabled(): boolean {
  if (_memoryManualPairing !== null) return _memoryManualPairing;
  const stored = readSignalingStorage(SIGNALING_STORAGE_KEYS.SIGNALING_MANUAL_PAIRING);
  return stored === 'true' || stored === '1';
}

export function setManualPairingConfirmationEnabled(enabled: boolean): void {
  const normalized = Boolean(enabled);
  _memoryManualPairing = normalized;
  writeSignalingStorage(
    SIGNALING_STORAGE_KEYS.SIGNALING_MANUAL_PAIRING,
    normalized ? 'true' : 'false'
  );
}

export function getAllowSpectatorDaisyChain(): boolean {
  if (_memoryAllowDaisyChain !== null) return _memoryAllowDaisyChain;
  const stored = readSignalingStorage(SIGNALING_STORAGE_KEYS.ALLOW_SPECTATOR_DAISY_CHAIN);
  if (stored === null || stored === undefined) return true;
  return stored !== 'false' && stored !== '0';
}

export function setAllowSpectatorDaisyChain(enabled: boolean): void {
  const normalized = Boolean(enabled);
  _memoryAllowDaisyChain = normalized;
  writeSignalingStorage(
    SIGNALING_STORAGE_KEYS.ALLOW_SPECTATOR_DAISY_CHAIN,
    normalized ? 'true' : 'false'
  );
}

export function saveActiveHostOffer(offerInfo: Record<string, any>): void {
  writeSignalingStorage(
    SIGNALING_STORAGE_KEYS.ACTIVE_HOST,
    JSON.stringify({
      ...offerInfo,
      timestamp: offerInfo.timestamp ?? Date.now(),
    })
  );
}

export function loadActiveHostOffer(): Record<string, any> | null {
  const raw = readSignalingStorage(SIGNALING_STORAGE_KEYS.ACTIVE_HOST);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[signalingRelayConfig] Failed to parse active host offer:', err);
    return null;
  }
}

export function clearActiveHostOffer(): void {
  removeSignalingStorage(SIGNALING_STORAGE_KEYS.ACTIVE_HOST);
}
