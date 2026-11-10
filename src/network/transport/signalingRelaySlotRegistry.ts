/**
 * signalingRelaySlotRegistry.ts
 * Canonical 4-server relay slot registry, bitmask definitions, ID normalization,
 * default endpoint resolution, and transport client instantiation for RocketCompanion's
 * 4-Server Full-Mesh Signaling and Dual Edge Bridge (JP + SG) architecture.
 *
 * All legacy relay IDs (emqx_1, emqx_2, supabase_1, supabase_2, private_emqx) are
 * deprecated and strictly rejected.
 */

import { credentialBundleManager } from './CredentialBundleManager.ts';
import { WebSocketSignalingClient } from './WebSocketSignalingClient.ts';
import { MqttWebSocketClient } from './MqttWebSocketClient.ts';
import {
  SupabaseRealtimeSignalingClient,
  deriveDefaultEdgeFunctionBridgeUrl,
} from './SupabaseRealtimeSignalingClient.ts';
import type { SignalingRelaySpec } from './signalingRelayConfig.ts';
import type { DeterministicRoomContext } from './SignalingCryptoSession.ts';
import {
  RELAY_SLOT_BITS,
  normalizeCanonicalRelayId,
  type CanonicalEdgeNodeId,
  type CanonicalRelayId,
} from '../../ui-core/config/roomCodeConnectivityCodec.ts';

export type { CanonicalEdgeNodeId, CanonicalRelayId };

export type RelayTransportClient =
  MqttWebSocketClient | WebSocketSignalingClient | SupabaseRealtimeSignalingClient;

export interface RelayTransportFactoryContext {
  role: string;
  peerId: string;
  roomId: string;
  playerName: string;
  roomContext: DeterministicRoomContext;
}

export function createSignalingRelayTransport(
  relay: SignalingRelaySpec,
  ctx: RelayTransportFactoryContext
): RelayTransportClient {
  if (relay.protocol === 'mqtt') {
    return new MqttWebSocketClient(relay.url, {
      relayId: relay.id,
      relayLabel: relay.label,
      topic: ctx.roomContext.mqttTopic,
      bridgeTopic: ctx.roomContext.mqttBridgeTopic,
      peerId: ctx.peerId,
      username: relay.username || '',
      password: relay.password || '',
      keepAliveSeconds: relay.keepAliveSeconds || 30,
    });
  }

  if (relay.protocol === 'supabase') {
    return new SupabaseRealtimeSignalingClient(relay.url, {
      relayId: relay.id,
      relayLabel: relay.label,
      channelTopic: ctx.roomContext.supabaseChannelTopic,
      bridgeTopic: ctx.roomContext.supabaseBridgeTopic,
      topicHash: ctx.roomContext.topicHash,
      peerId: ctx.peerId,
      anonKey: relay.authToken || relay.password || '',
      edgeFunctionBridgeUrl:
        relay.edgeFunctionBridgeUrl || deriveDefaultEdgeFunctionBridgeUrl(relay.url),
      keepAliveSeconds: relay.keepAliveSeconds || 25,
    });
  }

  return new WebSocketSignalingClient(relay.url, {
    relayId: relay.id,
    relayLabel: relay.label,
    roomId: ctx.roomId,
    workerRoomKey: ctx.roomContext.workerRoomKey,
    role: ctx.role,
    peerId: ctx.peerId,
    password: '',
    authToken: relay.authToken || relay.password || '',
    playerName: ctx.playerName,
  });
}

export const DEFAULT_JP_EDGE_BRIDGE_URL = '';
export const DEFAULT_SG_EDGE_BRIDGE_URL = '';

export interface CanonicalRelaySlotEndpoint {
  id: CanonicalRelayId;
  label: string;
  bit: number;
  protocol: 'mqtt' | 'supabase';
  url: string;
  username: string;
  password: string;
  authToken: string;
  edgeNodeId: CanonicalEdgeNodeId;
  edgeFunctionBridgeUrl: string;
}

export interface FourServerHarnessEndpointConfig {
  topicNamespace: string;
  jpEdgeFunctionUrl: string;
  sgEdgeFunctionUrl: string;
  slots: Record<CanonicalRelayId, CanonicalRelaySlotEndpoint>;
}

export function resolveCoHostedEdgeBridgeUrlForRelay(
  relayId: string | null | undefined,
  explicitEdgeUrl?: string | null
): string {
  if (explicitEdgeUrl && explicitEdgeUrl.trim()) {
    return explicitEdgeUrl.trim();
  }
  const canonical = normalizeCanonicalRelayId(relayId);
  const targetEdgeNode: CanonicalEdgeNodeId =
    canonical === 'emqx_gb' || canonical === 'supabase_sg' ? 'supabase_sg' : 'supabase_jp';
  const relays = credentialBundleManager.getRelays();
  const matchedEdgeRelay = relays.find((r) => normalizeCanonicalRelayId(r.id) === targetEdgeNode);
  if (matchedEdgeRelay?.edgeFunctionBridgeUrl) {
    return matchedEdgeRelay.edgeFunctionBridgeUrl;
  }
  if (matchedEdgeRelay?.url) {
    return deriveDefaultEdgeFunctionBridgeUrl(matchedEdgeRelay.url);
  }
  return targetEdgeNode === 'supabase_sg' ? DEFAULT_SG_EDGE_BRIDGE_URL : DEFAULT_JP_EDGE_BRIDGE_URL;
}

export function resolveFourServerHarnessConfig(): FourServerHarnessEndpointConfig {
  const relays = credentialBundleManager.getRelays();
  const findSlot = (id: CanonicalRelayId) =>
    relays.find((r) => normalizeCanonicalRelayId(r.id) === id);

  const cnSpec = findSlot('emqx_cn');
  const gbSpec = findSlot('emqx_gb');
  const jpSpec = findSlot('supabase_jp');
  const sgSpec = findSlot('supabase_sg');

  const rawNs = credentialBundleManager.getTopicNamespace();
  const topicNamespace = rawNs || 'rc/sig';

  const jpEdgeFunctionUrl =
    jpSpec?.edgeFunctionBridgeUrl ||
    cnSpec?.edgeFunctionBridgeUrl ||
    deriveDefaultEdgeFunctionBridgeUrl(jpSpec?.url || '') ||
    DEFAULT_JP_EDGE_BRIDGE_URL;
  const sgEdgeFunctionUrl =
    sgSpec?.edgeFunctionBridgeUrl ||
    gbSpec?.edgeFunctionBridgeUrl ||
    deriveDefaultEdgeFunctionBridgeUrl(sgSpec?.url || '') ||
    DEFAULT_SG_EDGE_BRIDGE_URL;

  const slots: Record<CanonicalRelayId, CanonicalRelaySlotEndpoint> = {
    emqx_cn: {
      id: 'emqx_cn',
      label: cnSpec?.label || 'EMQX_CN (Hangzhou)',
      bit: RELAY_SLOT_BITS.emqx_cn,
      protocol: 'mqtt',
      url: cnSpec?.url || '',
      username: cnSpec?.username || '',
      password: cnSpec?.password || '',
      authToken: '',
      edgeNodeId: 'supabase_jp',
      edgeFunctionBridgeUrl: jpEdgeFunctionUrl,
    },
    emqx_gb: {
      id: 'emqx_gb',
      label: gbSpec?.label || 'EMQX_GB (Asia-SE1)',
      bit: RELAY_SLOT_BITS.emqx_gb,
      protocol: 'mqtt',
      url: gbSpec?.url || '',
      username: gbSpec?.username || '',
      password: gbSpec?.password || '',
      authToken: '',
      edgeNodeId: 'supabase_sg',
      edgeFunctionBridgeUrl: sgEdgeFunctionUrl,
    },
    supabase_jp: {
      id: 'supabase_jp',
      label: jpSpec?.label || 'SUPABASE_JP (Tokyo RTJP)',
      bit: RELAY_SLOT_BITS.supabase_jp,
      protocol: 'supabase',
      url: jpSpec?.url || '',
      username: '',
      password: '',
      authToken: jpSpec?.authToken || jpSpec?.password || '',
      edgeNodeId: 'supabase_jp',
      edgeFunctionBridgeUrl: jpEdgeFunctionUrl,
    },
    supabase_sg: {
      id: 'supabase_sg',
      label: sgSpec?.label || 'SUPABASE_SG (Singapore RTSG)',
      bit: RELAY_SLOT_BITS.supabase_sg,
      protocol: 'supabase',
      url: sgSpec?.url || '',
      username: '',
      password: '',
      authToken: sgSpec?.authToken || sgSpec?.password || '',
      edgeNodeId: 'supabase_sg',
      edgeFunctionBridgeUrl: sgEdgeFunctionUrl,
    },
  };

  return {
    topicNamespace,
    jpEdgeFunctionUrl,
    sgEdgeFunctionUrl,
    slots,
  };
}
