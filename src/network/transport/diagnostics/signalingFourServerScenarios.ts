/**
 * signalingFourServerScenarios.ts
 * Dual-peer E2EE direct and cross-island bridge scenario runners across any pair of
 * canonical relay slots (`emqx_cn`, `emqx_gb`, `supabase_jp`, `supabase_sg`).
 */

import { MqttWebSocketClient } from '../MqttWebSocketClient.ts';
import { SupabaseRealtimeSignalingClient } from '../SupabaseRealtimeSignalingClient.ts';
import type { SignalingCryptoSession } from '../SignalingCryptoSession.ts';
import {
  RELAY_SLOT_BITS,
  resolveSignalingRouteDecision,
} from '../../../ui-core/config/roomCodeConnectivityCodec.ts';
import type {
  CanonicalRelayId,
  CanonicalRelaySlotEndpoint,
  FourServerHarnessEndpointConfig,
} from '../signalingRelaySlotRegistry.ts';
import type { HarnessPacketTraceEntry } from './signalingFourServerProbe.ts';

export type HarnessTraceEmitter = (entry: Omit<HarnessPacketTraceEntry, 'id' | 'ts'>) => void;

export interface PairScenarioExecutionParams {
  config: FourServerHarnessEndpointConfig;
  sourceRelayId: CanonicalRelayId;
  targetRelayId: CanonicalRelayId;
  topicHash: string;
  dirMqttTopic: string;
  brgMqttTopic: string;
  dirSbTopic: string;
  hostCrypto: SignalingCryptoSession;
  clientCrypto: SignalingCryptoSession;
  pairingCode: string;
  startAt: number;
  pushTrace: HarnessTraceEmitter;
}

export interface ScenarioExecutionResult {
  ok: boolean;
  summary: string;
  latencyMs: number;
  pairingCode: string;
}

function createSlotTransportClient(
  slot: CanonicalRelaySlotEndpoint,
  peerId: string,
  topicHash: string,
  dirMqttTopic: string,
  brgMqttTopic: string,
  dirSbTopic: string
): MqttWebSocketClient | SupabaseRealtimeSignalingClient {
  if (slot.protocol === 'mqtt') {
    return new MqttWebSocketClient(slot.url, {
      relayId: slot.id,
      relayLabel: slot.label,
      topic: dirMqttTopic,
      bridgeTopic: brgMqttTopic,
      peerId,
      username: slot.username,
      password: slot.password,
    });
  }

  return new SupabaseRealtimeSignalingClient(slot.url, {
    relayId: slot.id,
    relayLabel: slot.label,
    topicHash,
    channelTopic: dirSbTopic,
    bridgeTopic: brgMqttTopic,
    peerId,
    anonKey: slot.authToken,
    edgeFunctionBridgeUrl: slot.edgeFunctionBridgeUrl,
  });
}

export async function runSameRelayDirectPairScenario(
  relayId: CanonicalRelayId,
  params: PairScenarioExecutionParams
): Promise<ScenarioExecutionResult> {
  const {
    config,
    topicHash,
    dirMqttTopic,
    brgMqttTopic,
    dirSbTopic,
    hostCrypto,
    clientCrypto,
    pairingCode,
    startAt,
    pushTrace,
  } = params;
  const slot = config.slots[relayId];
  const topicLabel = slot.protocol === 'mqtt' ? dirMqttTopic : dirSbTopic;

  const hostClient = createSlotTransportClient(
    slot,
    'host_peer',
    topicHash,
    dirMqttTopic,
    brgMqttTopic,
    dirSbTopic
  );
  const joinClient = createSlotTransportClient(
    slot,
    'client_peer',
    topicHash,
    dirMqttTopic,
    brgMqttTopic,
    dirSbTopic
  );

  try {
    await Promise.all([hostClient.connect(5000), joinClient.connect(5000)]);
    const encryptedOffer = await clientCrypto.encryptForPeer('host_peer', {
      sdpType: 'offer',
      sdp: `v=0\r\no=- 49281 2 IN IP4 127.0.0.1\r\ns=RC-${relayId}-Direct-Offer`,
      iceCandidates: ['candidate:1 1 UDP 2122252543 192.0.2.10 54321 typ host'],
    });

    const roundtrip = await new Promise<{ ok: boolean; detail: string }>((resolve) => {
      const timer = setTimeout(
        () =>
          resolve({
            ok: false,
            detail: `[${relayId}] Timed out waiting for direct E2EE SDP Answer on ${topicLabel}`,
          }),
        5000
      );

      hostClient.on('message', async (frame: any) => {
        if (frame?.type !== 'e2ee_sdp_offer') return;
        const decrypted = await hostCrypto.decryptFromPeer('client_peer', frame.envelope);
        if (!decrypted || decrypted.sdpType !== 'offer') return;

        pushTrace({
          direction: 'RX',
          channel: 'dir',
          relayId,
          topic: topicLabel,
          hop: Number(frame._brgHop || 0),
          summary: `[${relayId}] Host decrypted E2EE SDP Offer (${decrypted.iceCandidates?.length} ICE candidate)`,
          ok: true,
        });

        const encryptedAnswer = await hostCrypto.encryptForPeer('client_peer', {
          sdpType: 'answer',
          sdp: `v=0\r\no=- 88312 2 IN IP4 127.0.0.1\r\ns=RC-${relayId}-Direct-Answer`,
          iceCandidates: ['candidate:2 1 UDP 2122252543 192.0.2.20 55123 typ host'],
        });

        hostClient.send({
          type: 'e2ee_sdp_answer',
          fromPeerId: 'host_peer',
          envelope: encryptedAnswer,
          timestamp: Date.now(),
        });
      });

      joinClient.on('message', async (frame: any) => {
        if (frame?.type !== 'e2ee_sdp_answer') return;
        const decrypted = await clientCrypto.decryptFromPeer('host_peer', frame.envelope);
        if (!decrypted || decrypted.sdpType !== 'answer') return;
        clearTimeout(timer);
        resolve({
          ok: true,
          detail: `Direct ${relayId} <-> ${relayId} E2EE SDP Offer/Answer + ICE verified on dir channel (0 bridge hop)!`,
        });
      });

      pushTrace({
        direction: 'TX',
        channel: 'dir',
        relayId,
        topic: topicLabel,
        hop: 0,
        summary: `[${relayId}] Client sent E2EE SDP Offer on ${topicLabel}`,
        ok: true,
      });

      joinClient.send({
        type: 'e2ee_sdp_offer',
        fromPeerId: 'client_peer',
        envelope: encryptedOffer,
        timestamp: Date.now(),
      });
    });

    const latencyMs = Math.round(performance.now() - startAt);
    pushTrace({
      direction: roundtrip.ok ? 'RX' : 'SYS',
      channel: 'dir',
      relayId,
      topic: topicLabel,
      hop: 0,
      summary: roundtrip.detail,
      latencyMs,
      ok: roundtrip.ok,
    });

    return { ok: roundtrip.ok, summary: roundtrip.detail, latencyMs, pairingCode };
  } finally {
    hostClient.close();
    joinClient.close();
  }
}

export async function runOneWayIslandBridgeScenario(
  params: PairScenarioExecutionParams
): Promise<ScenarioExecutionResult> {
  const {
    config,
    sourceRelayId,
    targetRelayId,
    topicHash,
    dirMqttTopic,
    brgMqttTopic,
    dirSbTopic,
    hostCrypto,
    clientCrypto,
    pairingCode,
    startAt,
    pushTrace,
  } = params;

  if (sourceRelayId === targetRelayId) {
    return runSameRelayDirectPairScenario(sourceRelayId, params);
  }

  const srcSlot = config.slots[sourceRelayId];
  const dstSlot = config.slots[targetRelayId];
  const dstTopicLabel = dstSlot.protocol === 'mqtt' ? dirMqttTopic : dirSbTopic;
  const route = resolveSignalingRouteDecision(
    RELAY_SLOT_BITS[targetRelayId],
    RELAY_SLOT_BITS[sourceRelayId]
  );

  const sender = createSlotTransportClient(
    srcSlot,
    'client_peer',
    topicHash,
    dirMqttTopic,
    brgMqttTopic,
    dirSbTopic
  );
  const receiver = createSlotTransportClient(
    dstSlot,
    'host_peer',
    topicHash,
    dirMqttTopic,
    brgMqttTopic,
    dirSbTopic
  );

  try {
    await Promise.all([
      sender.connect(5000),
      receiver.connect(5000),
      srcSlot.protocol === 'mqtt' && srcSlot.edgeFunctionBridgeUrl
        ? fetch(`${srcSlot.edgeFunctionBridgeUrl}?action=logs`, { method: 'GET' }).catch(() => null)
        : Promise.resolve(null),
    ]);
    const frameTag = `bridged_e2ee_${sourceRelayId}_to_${targetRelayId}_${Date.now()}`;
    const encryptedPayload = await clientCrypto.encryptForPeer('host_peer', {
      sdpType: 'offer',
      sdp: `v=0\r\ns=Cross-Island-${sourceRelayId}-to-${targetRelayId}`,
      routeMode: route.routeType,
    });

    const result = await new Promise<{ ok: boolean; detail: string }>((resolve) => {
      const timeoutMs = srcSlot.protocol === 'mqtt' ? 6500 : 7500;
      const timer = setTimeout(() => {
        const diagHint =
          srcSlot.protocol === 'mqtt'
            ? `[DIAGNOSIS: ${sourceRelayId} -> ${srcSlot.edgeNodeId} Edge Webhook] Timed out after ${timeoutMs}ms waiting on ${targetRelayId} (${dstTopicLabel}). ` +
              `${sourceRelayId} client published to "${brgMqttTopic}", but ${srcSlot.edgeNodeId} Edge Function did not forward it. ` +
              `Check EMQX Rule Engine SQL (FROM "${config.topicNamespace}/brg/+") and HTTP Action Header "x-rc-source-relay: ${sourceRelayId}" -> ${srcSlot.edgeFunctionBridgeUrl}.`
            : `[DIAGNOSIS: ${sourceRelayId} -> ${srcSlot.edgeNodeId} Edge -> ${targetRelayId}] Timed out after ${timeoutMs}ms waiting for 1-to-3 fanout on ${targetRelayId} (${dstTopicLabel}).`;
        resolve({ ok: false, detail: diagHint });
      }, timeoutMs);

      receiver.on('message', async (frame: any) => {
        if (frame?.type !== frameTag) return;
        const decrypted = await hostCrypto.decryptFromPeer('client_peer', frame.envelope);
        if (!decrypted) return;
        clearTimeout(timer);
        resolve({
          ok: true,
          detail: `${sourceRelayId} -> [${frame._brgVia || srcSlot.edgeNodeId} Edge 1-to-3] -> ${targetRelayId} verified (_brgHop=${frame._brgHop}, _brgFrom=${frame._brgFrom})!`,
        });
      });

      pushTrace({
        direction: 'BRG',
        channel: 'brg',
        relayId: `${sourceRelayId} -> ${targetRelayId}`,
        topic: brgMqttTopic,
        hop: 0,
        summary:
          srcSlot.protocol === 'mqtt'
            ? `${sourceRelayId} publishing to ${brgMqttTopic} (triggers EMQX Rule -> ${srcSlot.edgeNodeId} Edge -> ${targetRelayId})`
            : `${sourceRelayId} POSTing ${brgMqttTopic} to co-hosted ${srcSlot.edgeNodeId} Edge -> ${targetRelayId}`,
        ok: true,
      });

      const outPacket = {
        type: frameTag,
        fromPeerId: 'client_peer',
        envelope: encryptedPayload,
        _brgMsgId: `brg_${sourceRelayId}_${targetRelayId}_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 7)}`,
        timestamp: Date.now(),
      };

      if (sender instanceof SupabaseRealtimeSignalingClient) {
        void sender.sendBridge(outPacket).then((res) => {
          if (!res.ok) {
            clearTimeout(timer);
            resolve({
              ok: false,
              detail: `[DIAGNOSIS: ${sourceRelayId} Edge POST Failed] ${res.error || 'Unknown error'}`,
            });
          }
        });
      } else {
        sender.sendBridge(outPacket, brgMqttTopic, 1);
      }
    });

    const latencyMs = Math.round(performance.now() - startAt);
    pushTrace({
      direction: result.ok ? 'RX' : 'SYS',
      channel: 'dir',
      relayId: targetRelayId,
      topic: dstTopicLabel,
      hop: 1,
      summary: result.detail,
      latencyMs,
      ok: result.ok,
    });
    return { ok: result.ok, summary: result.detail, latencyMs, pairingCode };
  } finally {
    sender.close();
    receiver.close();
  }
}
