/**
 * credentialBundleTypes.ts
 * Pure types and constants for signaling credentials, public fallback broker,
 * custom user relay override, private dev profile injection, and time-bound .rctbnspib encrypted bundles.
 */

export const RCTBNSPIB_FILE_EXTENSION = '.rctbnspib';
export const RCTBNSPIB_FORMAT_MAGIC = 'RCTBNSPIB_V1';
export const DEFAULT_RCTBNSPIB_WINDOW_MINUTES = 15;
export const PUBLIC_FALLBACK_BROKER_URL = '';

export type SignalingProtocolType = 'mqtt' | 'ws' | 'supabase';

export type SignalingConfigSource = 'public' | 'custom' | 'dev-private' | 'imported-bundle';

export interface SignalingRelaySpec {
  id: string;
  label: string;
  protocol: SignalingProtocolType;
  url: string;
  username: string;
  password: string;
  authToken?: string;
  edgeFunctionBridgeUrl?: string;
  staggerDelayMs: number;
  connectTimeoutMs: number;
  keepAliveSeconds: number;
}

export interface SignalingRelayCredentials {
  username: string;
  password: string;
  authToken?: string;
}

export interface CustomRelayConfig {
  url: string;
  protocol?: SignalingProtocolType;
  username?: string;
  password?: string;
  authToken?: string;
}

export interface TurnIceServerSpec {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface ConfigSyncProfileSpec {
  brokerUrl: string;
  topicNamespace: string;
  clientUsername: string;
  clientPassword: string;
  devUsername?: string;
  devPassword?: string;
}

export interface SignalingProfilePayload {
  profileSource: 'default' | 'private' | 'imported-bundle';
  profileHash?: string;
  signaling: {
    defaultSignalingUrl: string;
    roomPrefix?: string;
    topicNamespace?: string;
    edgeBridgeUrl?: string;
    edgeFunctionBridgeUrl?: string;
    relays: SignalingRelaySpec[];
  };
  turn?: {
    iceServers: TurnIceServerSpec[];
  };
  configSync?: ConfigSyncProfileSpec;
}

export interface RctbnspibEncryptedEnvelope {
  magic: typeof RCTBNSPIB_FORMAT_MAGIC;
  version: 1;
  windowMinutes: number;
  saltHex: string;
  ivHex: string;
  ciphertextBase64: string;
}

export interface RelayCredentialOverrideOptions {
  emqxCnUsername?: string;
  emqxCnPassword?: string;
  emqxGbUsername?: string;
  emqxGbPassword?: string;
}

export interface RctbnspibExportResult {
  envelope: RctbnspibEncryptedEnvelope;
  serializedJson: string;
  suggestedFileName: string;
  pinCode: string;
  windowMinutes: number;
  expiresInSeconds: number;
}

export interface SignalingProfileStatusSummary {
  loaded: boolean;
  source: SignalingConfigSource;
  profileHash: string;
  shortHash: string;
  relayCount: number;
  relayLabels: string[];
  turnServerCount: number;
  customUrl: string;
  customUsername: string;
  noKeySimulationActive: boolean;
}
