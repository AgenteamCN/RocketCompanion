/**
 * signalingFourServerProbe.ts
 * Concurrent connectivity probing, Cloud Self-Test runner, and 5-Layer Anti-Loop Guard
 * verification for RocketCompanion's 4-Server Full-Mesh (`emqx_cn`, `emqx_gb`,
 * `supabase_jp`, `supabase_sg`) + Dual Edge Function (`jp` & `sg`) architecture.
 */

import { MqttWebSocketClient } from '../MqttWebSocketClient.ts';
import { SupabaseRealtimeSignalingClient } from '../SupabaseRealtimeSignalingClient.ts';
import {
  CANONICAL_RELAY_ORDER,
  RELAY_SLOT_BITS,
  formatCustomRoomCode,
  generateRandomRoomCode,
  type CanonicalEdgeNodeId,
  type CanonicalRelayId,
} from '../../../ui-core/config/roomCodeConnectivityCodec.ts';
import type {
  CanonicalRelaySlotEndpoint,
  FourServerHarnessEndpointConfig,
} from '../signalingRelaySlotRegistry.ts';

export interface HarnessPacketTraceEntry {
  id: string;
  ts: number;
  direction: 'TX' | 'RX' | 'BRG' | 'GUARD' | 'SYS';
  channel: 'dir' | 'brg' | 'edge' | 'crypto';
  relayId: string;
  topic: string;
  hop: number;
  summary: string;
  latencyMs?: number;
  ok: boolean;
}

export interface CloudBridgeAuditLogEntry {
  id: string;
  ts: number;
  edgeNode?: CanonicalEdgeNodeId;
  event: string;
  topicHash: string;
  comingFrom: string;
  targets: string[];
  hop: number;
  msgId: string;
  status: string;
  detail?: string;
  latencyMs?: number;
}

export interface CloudBridgeStatsSnapshot {
  ok: boolean;
  edgeNode: CanonicalEdgeNodeId;
  totalForwardedCount: number;
  totalDroppedLoopCount: number;
  totalRateLimitedCount: number;
  dedupCacheSize: number;
  warmMqttConnections: number;
  logs: CloudBridgeAuditLogEntry[];
}

export interface RelaySlotProbeStatus {
  id: CanonicalRelayId;
  label: string;
  bit: number;
  protocol: 'mqtt' | 'supabase';
  url: string;
  username: string;
  edgeNodeId: CanonicalEdgeNodeId;
  edgeFunctionBridgeUrl: string;
  ok: boolean;
  rttMs: number;
  error: string | null;
}

export interface FourServerProbeSummary {
  slots: Record<CanonicalRelayId, RelaySlotProbeStatus>;
  computedMask: number;
  sampleRandomCode: string;
  sampleCustomCode: string;
  jpEdgeStats: CloudBridgeStatsSnapshot | null;
  sgEdgeStats: CloudBridgeStatsSnapshot | null;
  combinedLogs: CloudBridgeAuditLogEntry[];
}

export async function fetchSingleEdgeBridgeStats(
  edgeUrl: string,
  fallbackNodeId: CanonicalEdgeNodeId
): Promise<CloudBridgeStatsSnapshot | null> {
  const base = String(edgeUrl || '').trim();
  if (!base) return null;
  try {
    const resp = await fetch(`${base}?action=logs`, { method: 'GET' });
    if (!resp.ok) return null;
    const data = await resp.json();
    const edgeNode = (data.edgeNode || fallbackNodeId) as CanonicalEdgeNodeId;
    const rawLogs: CloudBridgeAuditLogEntry[] = Array.isArray(data.logs) ? data.logs : [];
    return {
      ok: Boolean(data.ok),
      edgeNode,
      totalForwardedCount: Number(data.stats?.totalForwardedCount ?? 0),
      totalDroppedLoopCount: Number(data.stats?.totalDroppedLoopCount ?? 0),
      totalRateLimitedCount: Number(data.stats?.totalRateLimitedCount ?? 0),
      dedupCacheSize: Number(data.stats?.dedupCacheSize ?? 0),
      warmMqttConnections: Number(data.stats?.warmMqttConnections ?? 0),
      logs: rawLogs.map((item) => ({ ...item, edgeNode: item.edgeNode || edgeNode })),
    };
  } catch {
    return null;
  }
}

async function probeSingleCanonicalSlot(
  slot: CanonicalRelaySlotEndpoint,
  ns: string,
  probeHash: string,
  timeoutMs: number
): Promise<RelaySlotProbeStatus> {
  const start = performance.now();
  const baseInfo = {
    id: slot.id,
    label: slot.label,
    bit: slot.bit,
    protocol: slot.protocol,
    url: slot.url,
    username: slot.username,
    edgeNodeId: slot.edgeNodeId,
    edgeFunctionBridgeUrl: slot.edgeFunctionBridgeUrl,
  };

  if (!slot.url) {
    return {
      ...baseInfo,
      ok: false,
      rttMs: 0,
      error: 'Relay endpoint not configured in active profile',
    };
  }

  if (slot.protocol === 'mqtt') {
    const client = new MqttWebSocketClient(slot.url, {
      relayId: slot.id,
      relayLabel: slot.label,
      topic: `${ns}/dir/${probeHash}`,
      bridgeTopic: `${ns}/brg/${probeHash}`,
      username: slot.username,
      password: slot.password,
    });
    try {
      await client.connect(timeoutMs);
      const rttMs = client.loopbackRttMs || Math.max(1, Math.round(performance.now() - start));
      client.close();
      return { ...baseInfo, ok: true, rttMs, error: null };
    } catch (err: any) {
      client.close();
      return {
        ...baseInfo,
        ok: false,
        rttMs: Math.max(1, Math.round(performance.now() - start)),
        error: err?.message || String(err),
      };
    }
  }

  const client = new SupabaseRealtimeSignalingClient(slot.url, {
    relayId: slot.id,
    relayLabel: slot.label,
    topicHash: probeHash,
    channelTopic: `${ns}:dir:${probeHash}`,
    bridgeTopic: `${ns}/brg/${probeHash}`,
    anonKey: slot.authToken,
    edgeFunctionBridgeUrl: slot.edgeFunctionBridgeUrl,
  });
  try {
    await client.connect(timeoutMs);
    const rttMs = client.loopbackRttMs || Math.max(1, Math.round(performance.now() - start));
    client.close();
    return { ...baseInfo, ok: true, rttMs, error: null };
  } catch (err: any) {
    client.close();
    return {
      ...baseInfo,
      ok: false,
      rttMs: Math.max(1, Math.round(performance.now() - start)),
      error: err?.message || String(err),
    };
  }
}

export async function executeFourServerAndDualBridgeProbe(
  cfg: FourServerHarnessEndpointConfig,
  timeoutMs = 4500
): Promise<FourServerProbeSummary> {
  const probeHash = `probe_${Math.random().toString(36).slice(2, 9)}`;
  const ns = cfg.topicNamespace || 'rc/sig';

  const [cnRes, gbRes, jpRes, sgRes, jpEdgeStats, sgEdgeStats] = await Promise.all([
    probeSingleCanonicalSlot(cfg.slots.emqx_cn, ns, probeHash, timeoutMs),
    probeSingleCanonicalSlot(cfg.slots.emqx_gb, ns, probeHash, timeoutMs),
    probeSingleCanonicalSlot(cfg.slots.supabase_jp, ns, probeHash, timeoutMs),
    probeSingleCanonicalSlot(cfg.slots.supabase_sg, ns, probeHash, timeoutMs),
    fetchSingleEdgeBridgeStats(cfg.jpEdgeFunctionUrl, 'supabase_jp'),
    fetchSingleEdgeBridgeStats(cfg.sgEdgeFunctionUrl, 'supabase_sg'),
  ]);

  const slots: Record<CanonicalRelayId, RelaySlotProbeStatus> = {
    emqx_cn: cnRes,
    emqx_gb: gbRes,
    supabase_jp: jpRes,
    supabase_sg: sgRes,
  };

  let mask = 0;
  for (const id of CANONICAL_RELAY_ORDER) {
    if (slots[id].ok) {
      mask |= RELAY_SLOT_BITS[id];
    }
  }

  const combinedLogs = [...(jpEdgeStats?.logs || []), ...(sgEdgeStats?.logs || [])]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 45);

  return {
    slots,
    computedMask: mask,
    sampleRandomCode: generateRandomRoomCode(mask, 128),
    sampleCustomCode: formatCustomRoomCode('rocket', mask),
    jpEdgeStats,
    sgEdgeStats,
    combinedLogs,
  };
}

export async function executeFiveLayerAntiLoopTorture(
  edgeFunctionBridgeUrl: string,
  topicHash: string,
  ns: string,
  startAt: number
): Promise<{ ok: boolean; summary: string; latencyMs: number }> {
  const dupMsgId = `dup_torture_${Date.now()}`;
  const syntheticBridgeUser = `${'cn'}${'rcedgebridge'}_probe`;
  const syntheticClientUser = 'rc_client_probe';

  const [r1, r2, r3, r4, r5] = await Promise.all([
    // Guard 1: Bridge account loop prevention
    fetch(edgeFunctionBridgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: syntheticBridgeUser,
        topic: `${ns}/brg/${topicHash}`,
        payload: { type: 'loop_attack_1' },
      }),
    }).then((r) => r.json()),
    // Guard 2: Physical topic split (dir/+ rejected)
    fetch(edgeFunctionBridgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: syntheticClientUser,
        topic: `${ns}/dir/${topicHash}`,
        payload: { type: 'loop_attack_2' },
      }),
    }).then((r) => r.json()),
    // Guard 3: Strict canonical source filter (legacy 'emqx_1' rejected)
    fetch(edgeFunctionBridgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-rc-source-relay': 'emqx_1' },
      body: JSON.stringify({
        comingFrom: 'emqx_1',
        topic: `${ns}/brg/${topicHash}`,
        payload: { type: 'legacy_source_attack' },
      }),
    }).then((r) => r.json()),
    // Guard 4: Hop TTL (_brgHop >= 1 rejected)
    fetch(edgeFunctionBridgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: syntheticClientUser,
        comingFrom: 'emqx_cn',
        topic: `${ns}/brg/${topicHash}`,
        payload: { type: 'loop_attack_3', _brgHop: 1 },
      }),
    }).then((r) => r.json()),
    // Guard 5a: Valid seed message with _brgMsgId
    fetch(edgeFunctionBridgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-rc-source-relay': 'emqx_cn' },
      body: JSON.stringify({
        username: syntheticClientUser,
        comingFrom: 'emqx_cn',
        topic: `${ns}/brg/${topicHash}`,
        payload: { type: 'dedup_seed', _brgMsgId: dupMsgId },
      }),
    }).then((r) => r.json()),
  ]);

  // Guard 5b: Replay with identical _brgMsgId dropped
  const r6 = await fetch(edgeFunctionBridgeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-rc-source-relay': 'emqx_cn' },
    body: JSON.stringify({
      username: syntheticClientUser,
      comingFrom: 'emqx_cn',
      topic: `${ns}/brg/${topicHash}`,
      payload: { type: 'dedup_seed', _brgMsgId: dupMsgId },
    }),
  }).then((r) => r.json());

  const g1 = r1?.ignored === 'bridge_user_loop_prevented';
  const g2 = r2?.ignored === 'not_bridge_topic';
  const g3 = r3?.ignored === 'invalid_source_relay';
  const g4 = r4?.ignored === 'hop_limit_exceeded';
  const g5 = r5?.bridged === true && r6?.ignored === 'duplicate_msg_id';
  const allOk = g1 && g2 && g3 && g4 && g5;
  const latencyMs = Math.round(performance.now() - startAt);

  const summary = `Anti-Loop 5-Guard Check: [1.BridgeUser=${g1 ? 'BLOCKED' : 'FAIL'}] [2.DirTopic=${
    g2 ? 'BLOCKED' : 'FAIL'
  }] [3.LegacyId=${g3 ? 'BLOCKED' : 'FAIL'}] [4.HopTTL=${g4 ? 'BLOCKED' : 'FAIL'}] [5.MsgIdDedup=${
    g5 ? 'BLOCKED' : 'FAIL'
  }]`;

  return { ok: allOk, summary, latencyMs };
}
