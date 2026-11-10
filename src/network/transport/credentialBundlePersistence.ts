/**
 * credentialBundlePersistence.ts
 * LocalStorage persistence and environment detection helpers for signaling credential profiles
 * and custom self-hosted relay overrides.
 */

import {
  PUBLIC_FALLBACK_BROKER_URL,
  type CustomRelayConfig,
  type SignalingProfilePayload,
  type SignalingProtocolType,
  type SignalingRelaySpec,
} from './credentialBundleTypes.ts';

export const CREDENTIAL_BUNDLE_STORAGE_KEY = 'rc-signaling-credential-profile-v1';
export const CUSTOM_RELAY_STORAGE_KEY = 'rc-signaling-custom-relay-v1';
export const LEGACY_SIGNALING_URL_KEY = 'signaling-url';
export const DEV_PROFILE_ENDPOINT = '/__rc_dev_profile';

export const PUBLIC_FALLBACK_RELAY_SPEC: Readonly<SignalingRelaySpec> = Object.freeze({
  id: 'public_fallback',
  label: 'Public Fallback Broker (Unverified / No SLA)',
  protocol: 'mqtt',
  url: PUBLIC_FALLBACK_BROKER_URL,
  username: '',
  password: '',
  staggerDelayMs: 0,
  connectTimeoutMs: 5000,
  keepAliveSeconds: 30,
});

export function resolvePublicFallbackBrokerUrl(): string {
  try {
    if (typeof window !== 'undefined' && window.location?.search) {
      const params = new URLSearchParams(window.location.search);
      const queryUrl = (params.get('publicBroker') || params.get('broker') || '').trim();
      if (queryUrl) {
        return queryUrl;
      }
    }
  } catch {
    // Ignore URL query parsing errors
  }

  try {
    const envUrl = String((import.meta as any).env?.VITE_PUBLIC_FALLBACK_BROKER_URL || '').trim();
    if (envUrl) {
      return envUrl;
    }
  } catch {
    // Ignore env resolution errors
  }

  return PUBLIC_FALLBACK_BROKER_URL;
}

export function isNoKeySimulationEnabled(): boolean {
  try {
    if (typeof window === 'undefined' || !window.location?.search) return false;
    const params = new URLSearchParams(window.location.search);
    const val = (params.get('nokey') || params.get('noKey') || '').trim().toLowerCase();
    return val === '1' || val === 'true' || val === 'yes';
  } catch {
    return false;
  }
}

export function inferProtocolFromUrl(url: string): SignalingProtocolType {
  const clean = String(url || '')
    .trim()
    .toLowerCase();
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

export function readPersistedProfile(): SignalingProfilePayload | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(CREDENTIAL_BUNDLE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SignalingProfilePayload;
    if (!parsed || !Array.isArray(parsed.signaling?.relays)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePersistedProfile(profile: SignalingProfilePayload | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!profile) {
      localStorage.removeItem(CREDENTIAL_BUNDLE_STORAGE_KEY);
    } else {
      localStorage.setItem(CREDENTIAL_BUNDLE_STORAGE_KEY, JSON.stringify(profile));
    }
  } catch {
    // Ignore storage write error
  }
}

export function readPersistedCustomRelay(): CustomRelayConfig | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(CUSTOM_RELAY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CustomRelayConfig;
      if (parsed && typeof parsed.url === 'string' && parsed.url.trim()) {
        return {
          url: parsed.url.trim(),
          protocol: parsed.protocol || inferProtocolFromUrl(parsed.url),
          username: parsed.username || '',
          password: parsed.password || '',
          authToken: parsed.authToken || '',
        };
      }
    }
    const legacyUrl = localStorage.getItem(LEGACY_SIGNALING_URL_KEY);
    if (legacyUrl && legacyUrl.trim()) {
      return {
        url: legacyUrl.trim(),
        protocol: inferProtocolFromUrl(legacyUrl),
        username: '',
        password: '',
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function writePersistedCustomRelay(config: CustomRelayConfig | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!config || !config.url.trim()) {
      localStorage.removeItem(CUSTOM_RELAY_STORAGE_KEY);
      localStorage.removeItem(LEGACY_SIGNALING_URL_KEY);
    } else {
      const normalized: CustomRelayConfig = {
        url: config.url.trim(),
        protocol: config.protocol || inferProtocolFromUrl(config.url),
        username: config.username || '',
        password: config.password || '',
        authToken: config.authToken || '',
      };
      localStorage.setItem(CUSTOM_RELAY_STORAGE_KEY, JSON.stringify(normalized));
      localStorage.setItem(LEGACY_SIGNALING_URL_KEY, normalized.url);
    }
  } catch {
    // Ignore storage write error
  }
}
