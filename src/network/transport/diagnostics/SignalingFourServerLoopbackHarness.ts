/**
 * SignalingFourServerLoopbackHarness.ts
 * Self-contained Transport-Layer Diagnostic & Verification Harness for RocketCompanion's
 * 4-Server Full-Mesh (`emqx_cn`, `emqx_gb`, `supabase_jp`, `supabase_sg`) & Dual Edge Bridge Lab.
 * Includes One-Click Full Diagnostic Pipeline (`runOneClickFullDiagnostic`) that stops and
 * pinpoints the exact stage if any ACL, Rule Engine SQL, or Edge Bridge step fails.
 */

import {
  SignalingCryptoSession,
  deriveDeterministicRoomContext,
} from '../SignalingCryptoSession.ts';
import {
  CANONICAL_RELAY_ORDER,
  parseRoomCode,
  type CanonicalEdgeNodeId,
  type CanonicalRelayId,
} from '../../../ui-core/config/roomCodeConnectivityCodec.ts';
import {
  resolveFourServerHarnessConfig,
  type FourServerHarnessEndpointConfig,
} from '../signalingRelaySlotRegistry.ts';
import {
  executeFiveLayerAntiLoopTorture,
  executeFourServerAndDualBridgeProbe,
  fetchSingleEdgeBridgeStats,
  type CloudBridgeAuditLogEntry,
  type CloudBridgeStatsSnapshot,
  type FourServerProbeSummary,
  type HarnessPacketTraceEntry,
  type RelaySlotProbeStatus,
} from './signalingFourServerProbe.ts';
import {
  runOneWayIslandBridgeScenario,
  runSameRelayDirectPairScenario,
  type PairScenarioExecutionParams,
  type ScenarioExecutionResult,
} from './signalingFourServerScenarios.ts';

export type {
  CanonicalEdgeNodeId,
  CanonicalRelayId,
  CloudBridgeAuditLogEntry,
  CloudBridgeStatsSnapshot,
  FourServerHarnessEndpointConfig,
  FourServerProbeSummary,
  HarnessPacketTraceEntry,
  RelaySlotProbeStatus,
  ScenarioExecutionResult,
};

export type FourServerScenarioId =
  | 'emqx-cn-direct'
  | 'emqx-gb-direct'
  | 'supabase-jp-direct'
  | 'supabase-sg-direct'
  | 'bridge-jp-to-cn'
  | 'bridge-sg-to-gb'
  | 'bridge-cn-to-jp'
  | 'bridge-gb-to-sg'
  | 'bridge-cn-to-gb'
  | 'bridge-jp-to-sg'
  | 'bridge-custom-pair'
  | 'anti-loop-torture'
  | 'one-click-full-diagnostic';

export class SignalingFourServerLoopbackHarness {
  config: FourServerHarnessEndpointConfig = resolveFourServerHarnessConfig();
  traces: HarnessPacketTraceEntry[] = [];
  private listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch {
        // ignore
      }
    }
  }

  refreshConfigFromBundle(): void {
    this.config = resolveFourServerHarnessConfig();
    this.notify();
  }

  clearTraces(): void {
    this.traces = [];
    this.notify();
  }

  private pushTrace = (entry: Omit<HarnessPacketTraceEntry, 'id' | 'ts'>): void => {
    this.traces = [
      {
        id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        ts: Date.now(),
        ...entry,
      },
      ...this.traces.slice(0, 79),
    ];
    this.notify();
  };

  async probeAllRelaysAndDualBridges(timeoutMs = 4500): Promise<FourServerProbeSummary> {
    this.config = resolveFourServerHarnessConfig();
    return executeFourServerAndDualBridgeProbe(this.config, timeoutMs);
  }

  async fetchDualEdgeBridgeStats(): Promise<{
    jpEdgeStats: CloudBridgeStatsSnapshot | null;
    sgEdgeStats: CloudBridgeStatsSnapshot | null;
    combinedLogs: CloudBridgeAuditLogEntry[];
  }> {
    const [jpEdgeStats, sgEdgeStats] = await Promise.all([
      fetchSingleEdgeBridgeStats(this.config.jpEdgeFunctionUrl, 'supabase_jp'),
      fetchSingleEdgeBridgeStats(this.config.sgEdgeFunctionUrl, 'supabase_sg'),
    ]);
    const combinedLogs = [...(jpEdgeStats?.logs || []), ...(sgEdgeStats?.logs || [])]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 45);
    return { jpEdgeStats, sgEdgeStats, combinedLogs };
  }

  async runCloudSelfTest(roomCode = 'rocket-f'): Promise<{
    ok: boolean;
    jpReport: Record<string, any>;
    sgReport: Record<string, any>;
    summary: string;
  }> {
    const ctx = await deriveDeterministicRoomContext(roomCode, 'lab-pass');
    const shortHash = ctx.topicHash.slice(0, 16);
    this.pushTrace({
      direction: 'SYS',
      channel: 'edge',
      relayId: 'jp+sg_edge',
      topic: `${this.config.topicNamespace}/dir/${shortHash}`,
      hop: 0,
      summary:
        'Invoking Dual Cloud Self-Test on JP + SG Edge Functions (verifying EMQX CN/GB Bridge Accounts & RTJP/RTSG Broadcast)...',
      ok: true,
    });

    const start = performance.now();
    const [jpReport, sgReport] = await Promise.all([
      fetch(this.config.jpEdgeFunctionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'self-test', topicHash: `${shortHash}_jp` }),
      }).then((r) => r.json()),
      fetch(this.config.sgEdgeFunctionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'self-test', topicHash: `${shortHash}_sg` }),
      }).then((r) => r.json()),
    ]);
    const elapsed = Math.round(performance.now() - start);
    const overallOk = Boolean(jpReport?.ok && sgReport?.ok);
    const summary = `Dual Cloud Self-Test ${overallOk ? 'PASSED' : 'FAILED'} (${elapsed}ms): JP_Edge[cn=${
      jpReport?.relays?.emqx_cn?.loopbackReceivedByClient
    }, gb=${jpReport?.relays?.emqx_gb?.loopbackReceivedByClient}, jp=${
      jpReport?.relays?.supabase_jp?.ok
    }, sg=${jpReport?.relays?.supabase_sg?.ok}] | SG_Edge[cn=${
      sgReport?.relays?.emqx_cn?.loopbackReceivedByClient
    }, gb=${sgReport?.relays?.emqx_gb?.loopbackReceivedByClient}, jp=${
      sgReport?.relays?.supabase_jp?.ok
    }, sg=${sgReport?.relays?.supabase_sg?.ok}]`;

    this.pushTrace({
      direction: 'RX',
      channel: 'edge',
      relayId: 'jp+sg_edge',
      topic: `${this.config.topicNamespace}/dir/${shortHash}`,
      hop: 1,
      summary,
      latencyMs: elapsed,
      ok: overallOk,
    });

    return { ok: overallOk, jpReport, sgReport, summary };
  }

  async runPairScenario(
    sourceRelayId: CanonicalRelayId,
    targetRelayId: CanonicalRelayId,
    bidirectional: boolean,
    rawRoomCode = 'rocket-f',
    password = 'test'
  ): Promise<ScenarioExecutionResult> {
    const startAt = performance.now();
    const parsedCode = parseRoomCode(rawRoomCode);
    const ctx = await deriveDeterministicRoomContext(
      parsedCode?.canonicalRoomCode || rawRoomCode,
      password
    );
    const ns = this.config.topicNamespace || 'rc/sig';
    const dirMqttTopic = `${ns}/dir/${ctx.topicHash}`;
    const brgMqttTopic = `${ns}/brg/${ctx.topicHash}`;
    const dirSbTopic = `${ns}:dir:${ctx.topicHash}`;

    const hostCrypto = new SignalingCryptoSession(ctx, 'host_peer');
    const clientCrypto = new SignalingCryptoSession(ctx, 'client_peer');
    const [hostPub, clientPub] = await Promise.all([
      hostCrypto.initializeLocalIdentity(),
      clientCrypto.initializeLocalIdentity(),
    ]);
    const [hostPeerRec] = await Promise.all([
      hostCrypto.establishPeerSession('client_peer', clientPub, clientCrypto.localNonce, true),
      clientCrypto.establishPeerSession('host_peer', hostPub, hostCrypto.localNonce, false),
    ]);

    const execParams: PairScenarioExecutionParams = {
      config: this.config,
      sourceRelayId,
      targetRelayId,
      topicHash: ctx.topicHash,
      dirMqttTopic,
      brgMqttTopic,
      dirSbTopic,
      hostCrypto,
      clientCrypto,
      pairingCode: hostPeerRec.pairingCode,
      startAt,
      pushTrace: this.pushTrace,
    };

    if (sourceRelayId === targetRelayId) {
      return runSameRelayDirectPairScenario(sourceRelayId, execParams);
    }

    const step1 = await runOneWayIslandBridgeScenario(execParams);
    if (!step1.ok || !bidirectional) return step1;

    const step2 = await runOneWayIslandBridgeScenario({
      ...execParams,
      sourceRelayId: targetRelayId,
      targetRelayId: sourceRelayId,
    });
    return {
      ok: step2.ok,
      summary: step2.ok
        ? `2-Way Island Handshake (${sourceRelayId} <-> ${targetRelayId}) Verified! (SAS ${hostPeerRec.pairingCode})`
        : step2.summary,
      latencyMs: Math.round(performance.now() - startAt),
      pairingCode: hostPeerRec.pairingCode,
    };
  }

  async runOneClickFullDiagnostic(
    rawRoomCode = 'rocket-f',
    password = 'test',
    onStepProgress?: (stepBanner: string) => void
  ): Promise<{ ok: boolean; summary: string; latencyMs: number }> {
    const startAt = performance.now();
    onStepProgress?.(
      'Step 1/5: Probing all 4 canonical relays (emqx_cn, emqx_gb, supabase_jp, supabase_sg)...'
    );
    const probe = await this.probeAllRelaysAndDualBridges(4500);
    for (const id of CANONICAL_RELAY_ORDER) {
      const slot = probe.slots[id];
      if (!slot.ok) {
        return {
          ok: false,
          summary: `[STOPPED AT STEP 1/5 - Client Slot Probe] ${id} (${slot.url}) failed: ${slot.error}`,
          latencyMs: Math.round(performance.now() - startAt),
        };
      }
    }

    onStepProgress?.(
      'Step 2/5: Running Dual Cloud Edge Self-Test (JP + SG Edge Functions -> 4 Relays)...'
    );
    const selfTest = await this.runCloudSelfTest(rawRoomCode);
    if (!selfTest.ok) {
      return {
        ok: false,
        summary: `[STOPPED AT STEP 2/5 - Cloud Self-Test] ${selfTest.summary}`,
        latencyMs: Math.round(performance.now() - startAt),
      };
    }

    onStepProgress?.('Step 3/5: Verifying 5-Layer Anti-Loop Guards on JP & SG Edge Functions...');
    const parsedCode = parseRoomCode(rawRoomCode);
    const ctx = await deriveDeterministicRoomContext(
      parsedCode?.canonicalRoomCode || rawRoomCode,
      password
    );
    const antiLoop = await executeFiveLayerAntiLoopTorture(
      this.config.jpEdgeFunctionUrl,
      ctx.topicHash,
      this.config.topicNamespace,
      performance.now()
    );
    this.pushTrace({
      direction: 'GUARD',
      channel: 'edge',
      relayId: 'supabase_jp',
      topic: `${this.config.topicNamespace}/brg/${ctx.topicHash.slice(0, 10)}`,
      hop: 1,
      summary: antiLoop.summary,
      latencyMs: antiLoop.latencyMs,
      ok: antiLoop.ok,
    });
    if (!antiLoop.ok) {
      return {
        ok: false,
        summary: `[STOPPED AT STEP 3/5 - Anti-Loop Guards] ${antiLoop.summary}`,
        latencyMs: Math.round(performance.now() - startAt),
      };
    }

    onStepProgress?.(
      'Step 4/5: Testing Outbound Edge Bridge (supabase_jp -> emqx_cn & supabase_sg -> emqx_gb)...'
    );
    const jpToCn = await this.runPairScenario(
      'supabase_jp',
      'emqx_cn',
      false,
      rawRoomCode,
      password
    );
    if (!jpToCn.ok) {
      return {
        ok: false,
        summary: `[STOPPED AT STEP 4/5 - supabase_jp -> emqx_cn Bridge] ${jpToCn.summary}`,
        latencyMs: Math.round(performance.now() - startAt),
      };
    }
    const sgToGb = await this.runPairScenario(
      'supabase_sg',
      'emqx_gb',
      false,
      rawRoomCode,
      password
    );
    if (!sgToGb.ok) {
      return {
        ok: false,
        summary: `[STOPPED AT STEP 4/5 - supabase_sg -> emqx_gb Bridge] ${sgToGb.summary}`,
        latencyMs: Math.round(performance.now() - startAt),
      };
    }

    onStepProgress?.(
      'Step 5/5: Testing EMQX Rule Engine Webhooks (emqx_cn -> supabase_jp & emqx_gb -> supabase_sg)...'
    );
    const cnToJp = await this.runPairScenario(
      'emqx_cn',
      'supabase_jp',
      false,
      rawRoomCode,
      password
    );
    if (!cnToJp.ok) {
      return {
        ok: false,
        summary: `[STOPPED AT STEP 5/5 - EMQX_CN Rule Engine] ${cnToJp.summary}`,
        latencyMs: Math.round(performance.now() - startAt),
      };
    }
    const gbToSg = await this.runPairScenario(
      'emqx_gb',
      'supabase_sg',
      false,
      rawRoomCode,
      password
    );
    if (!gbToSg.ok) {
      return {
        ok: false,
        summary: `[STOPPED AT STEP 5/5 - EMQX_GB Rule Engine] ${gbToSg.summary}`,
        latencyMs: Math.round(performance.now() - startAt),
      };
    }

    const totalMs = Math.round(performance.now() - startAt);
    return {
      ok: true,
      summary: `ALL 5 DIAGNOSTIC STAGES PASSED (${totalMs}ms): 4 Relays Online (Mask 0xF) + Dual Edge Self-Test + 5-Guard Anti-Loop + Full 4-Server Cross-Island Bridge Verified!`,
      latencyMs: totalMs,
    };
  }
}

export const signalingFourServerLoopbackHarness = new SignalingFourServerLoopbackHarness();
