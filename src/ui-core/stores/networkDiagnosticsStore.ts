import { useSyncExternalStore } from "react";
import {
  NetworkStressSimulator,
  NETWORK_STRESS_PRESETS,
  CONNECTION_HEALTH_STATES,
} from "../config/networkStressConfig";
import {
  createInitialNetworkDiagnosticsState,
  type DiagnosticProbeTelemetry,
  type DiagnosticBufferSnapshot,
  type DiagnosticDumpExportOptions,
  type NetworkDiagnosticsBridge,
  type NetworkMetrics,
  type NetworkDiagnosticsState,
} from "./networkDiagnosticsTypes";
import {
  applyAsymmetricLatencyAndBuildPatch,
  applyBurstDropParamsAndBuildPatch,
  buildReconcilerTelemetryPatch,
} from "./networkDiagnosticsSnapshotBuilder";

export const ZERO_G_ANCHOR_MODES = Object.freeze({
  Z_HOVER: "z_hover",
  ZERO_G_LOCKED: "zero_g_locked",
});

export type {
  DiagnosticProbeTelemetry,
  DiagnosticBufferSnapshot,
  DiagnosticDumpExportOptions,
  NetworkDiagnosticsBridge,
  NetworkMetrics,
  NetworkDiagnosticsState,
};

const stressSim = new NetworkStressSimulator();

let state: NetworkDiagnosticsState = createInitialNetworkDiagnosticsState();

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((cb) => cb());
let isTriggeringBurstDrop = false;

const resolveChannel = () => state.channelRef || null;
const resolveReconciler = () => state.reconcilerRef || null;

function updateMetricsPatch(patch: Partial<NetworkMetrics>) {
  state = { ...state, metrics: { ...state.metrics, ...patch } };
  notify();
}

function attachReconcilerMetricsListener(reconciler: any) {
  if (!reconciler) return;

  const updateFn = (m: any) => {
    updateMetricsPatch(
      buildReconcilerTelemetryPatch(m, reconciler, resolveChannel(), stressSim, state)
    );
  };

  if (typeof reconciler.addMetricsListener === "function") {
    reconciler.addMetricsListener(updateFn);
  } else {
    const prev = reconciler.onMetricsUpdated;
    reconciler.onMetricsUpdated = (m: any) => {
      if (typeof prev === "function") {
        try {
          prev(m);
        } catch (err) {
          console.error("[networkDiagnosticsStore] Error in previous reconciler onMetricsUpdated:", err);
        }
      }
      updateFn(m);
    };
  }
}

export const networkDiagnosticsStore = {
  getState: () => state,
  getSnapshot: () => state,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  registerBridge: (bridgePatch: Partial<NetworkDiagnosticsBridge>) => {
    state = {
      ...state,
      bridge: {
        ...state.bridge,
        ...bridgePatch,
      },
    };
  },

  updateDiagnosticBuffers: (patch: Partial<DiagnosticBufferSnapshot>) => {
    updateMetricsPatch({
      diagnosticBuffers: {
        ...state.metrics.diagnosticBuffers,
        ...patch,
      },
    });
  },

  setSession: (reconciler: any, channel: any, bridgeOverride?: Partial<NetworkDiagnosticsBridge>) => {
    const isBridgeObject =
      bridgeOverride &&
      typeof bridgeOverride === "object" &&
      !("physics" in bridgeOverride) &&
      !("arena" in bridgeOverride);
    state = {
      ...state,
      reconcilerRef: reconciler,
      channelRef: channel,
      bridge: isBridgeObject ? { ...state.bridge, ...bridgeOverride } : state.bridge,
      metrics: {
        ...state.metrics,
        connected: Boolean(channel),
      },
    };
    if (channel) stressSim.syncToChannel(channel);
    attachReconcilerMetricsListener(reconciler);
    notify();
  },

  setAsymmetricLatency: (uplinkMs: number, downlinkMs: number) => {
    updateMetricsPatch(
      applyAsymmetricLatencyAndBuildPatch(
        uplinkMs,
        downlinkMs,
        stressSim,
        resolveChannel(),
        resolveReconciler(),
        state.metrics
      )
    );
  },

  setExtraUplinkLatency: (ms: number) => {
    networkDiagnosticsStore.setAsymmetricLatency(ms, state.metrics.extraDownlinkMs);
  },

  setExtraDownlinkLatency: (ms: number) => {
    networkDiagnosticsStore.setAsymmetricLatency(state.metrics.extraUplinkMs, ms);
  },

  setExtraLatency: (ms: number) => {
    const val = Math.max(0, Math.min(500, Math.round(ms)));
    networkDiagnosticsStore.setAsymmetricLatency(val, val);
  },

  setJitter: (ms: number) => {
    const val = Math.max(0, Math.min(200, Math.round(ms)));
    stressSim.setStress({ jitterMs: val }, resolveChannel());
    const health = stressSim.getHealthSnapshot({
      rttMs: state.metrics.rttMs,
      jitterMs: val,
      packetLossPct: state.metrics.packetLossPct,
      lastErrorUu: state.metrics.lastErrorUu,
    });
    updateMetricsPatch({ jitterMs: val, qualityScore: health.score, qualityGrade: health.grade });
    resolveReconciler()?.notifyMetricsUpdated?.();
  },

  adjustExtraLatency: (direction: number, stepMs?: number) => {
    const step = stepMs ?? state.metrics.adjustStepMs;
    networkDiagnosticsStore.setAsymmetricLatency(
      Math.max(0, Math.min(500, state.metrics.extraUplinkMs + direction * step)),
      Math.max(0, Math.min(500, state.metrics.extraDownlinkMs + direction * step))
    );
  },

  setAdjustStep: (stepMs: number) => updateMetricsPatch({ adjustStepMs: Math.max(1, stepMs) }),

  setPacketLoss: (pct: number) => {
    const val = Math.max(0, Math.min(100, pct));
    stressSim.setStress({ packetLossPct: val }, resolveChannel());
    const health = stressSim.getHealthSnapshot({
      rttMs: state.metrics.rttMs,
      jitterMs: state.metrics.jitterMs,
      packetLossPct: val,
      lastErrorUu: state.metrics.lastErrorUu,
    });
    updateMetricsPatch({ packetLossPct: val, qualityScore: health.score, qualityGrade: health.grade });
    resolveReconciler()?.notifyMetricsUpdated?.();
  },

  setBurstDropEnabled: (enabled: boolean) => {
    const nextEnabled = Boolean(enabled);
    updateMetricsPatch(
      applyBurstDropParamsAndBuildPatch(
        nextEnabled,
        state.metrics.burstPeriodMs || 2000,
        state.metrics.burstDurationMs || 0,
        stressSim,
        resolveChannel(),
        true
      )
    );
    resolveReconciler()?.notifyMetricsUpdated?.();
    return nextEnabled;
  },

  toggleBurstDrop: (forceEnabled?: boolean) => {
    const nextEnabled = forceEnabled !== undefined ? Boolean(forceEnabled) : !state.metrics.burstDropEnabled;
    return networkDiagnosticsStore.setBurstDropEnabled(nextEnabled);
  },

  setBurstPeriodMs: (periodMs: number) => {
    updateMetricsPatch(
      applyBurstDropParamsAndBuildPatch(
        state.metrics.burstDropEnabled,
        Number(periodMs) || 2000,
        state.metrics.burstDurationMs || 0,
        stressSim,
        resolveChannel()
      )
    );
  },

  setBurstDurationMs: (durationMs: number) => {
    const safePeriod = Math.max(1, Math.floor(state.metrics.burstPeriodMs || 2000));
    const safeDuration = Math.max(0, Math.min(safePeriod - 1, Math.floor(Number(durationMs) || 0)));
    updateMetricsPatch(
      applyBurstDropParamsAndBuildPatch(
        safeDuration > 0,
        safePeriod,
        safeDuration,
        stressSim,
        resolveChannel()
      )
    );
  },

  setBurstDurationPct: (pct: number) => {
    const safePct = Math.max(0, Math.min(99, Math.floor(Number(pct) || 0)));
    const safePeriod = Math.max(1, Math.floor(state.metrics.burstPeriodMs || 2000));
    const safeDuration = Math.max(0, Math.min(safePeriod - 1, Math.floor((safePct / 100) * safePeriod)));
    updateMetricsPatch({
      ...applyBurstDropParamsAndBuildPatch(
        safeDuration > 0,
        safePeriod,
        safeDuration,
        stressSim,
        resolveChannel()
      ),
      burstDurationPct: safePct,
    });
  },

  applyStressPreset: (presetId: string) => {
    const channel = resolveChannel();
    const preset = stressSim.applyPreset(presetId, channel);
    networkDiagnosticsStore.setAsymmetricLatency(preset.extraUplinkMs, preset.extraDownlinkMs);
    networkDiagnosticsStore.setJitter(preset.jitterMs);
    networkDiagnosticsStore.setPacketLoss(preset.packetLossPct);
    const health = stressSim.getHealthSnapshot({
      rttMs: Math.max(state.metrics.rttMs, preset.extraUplinkMs + preset.extraDownlinkMs),
      jitterMs: preset.jitterMs,
      packetLossPct: preset.packetLossPct,
      lastErrorUu: state.metrics.lastErrorUu,
    });
    updateMetricsPatch({
      stressPresetId: preset.id,
      impairmentPresetId: preset.id,
      qualityScore: health.score,
      qualityGrade: health.grade,
      healthState: health.healthState,
      packetAgeMs: health.packetAgeMs,
      neutralFallbackActive: health.neutralFallbackActive,
      disconnectEvicted: health.disconnectEvicted,
    });
    resolveReconciler()?.notifyMetricsUpdated?.();
  },

  applyImpairmentPreset: (presetId: string) => {
    networkDiagnosticsStore.applyStressPreset(presetId);
  },

  setVisualSmoothing: (enabled: boolean) => {
    const reconciler = resolveReconciler();
    if (reconciler) {
      if (typeof reconciler.setEnableSmoothing === "function") reconciler.setEnableSmoothing(enabled);
      else reconciler.enableSmoothing = enabled;
    }
    updateMetricsPatch({ visualSmoothing: enabled });
  },

  toggleZeroGFleet: async (forceEnabled?: boolean) => {
    const nextEnabled = forceEnabled !== undefined ? forceEnabled : !state.metrics.zeroGFleetEnabled;
    await state.bridge.onToggleZeroGFleet?.(nextEnabled, state.metrics.zeroGAnchorMode);
    const probeTelemetry = nextEnabled && state.bridge.onSampleZeroGFleetTelemetry
      ? (state.bridge.onSampleZeroGFleetTelemetry() || [])
      : [];
    updateMetricsPatch({
      zeroGFleetEnabled: nextEnabled,
      observationTarget: nextEnabled ? state.metrics.observationTarget : 0,
      probeTelemetry,
    });
  },

  setZeroGAnchorMode: async (anchorMode: string) => {
    await state.bridge.onSetZeroGAnchorMode?.(anchorMode);
    updateMetricsPatch({ zeroGAnchorMode: anchorMode });
  },

  setObservationTarget: (targetCarIndex: number) => {
    const idx = Math.max(0, Math.min(7, Math.floor(targetCarIndex)));
    state.bridge.onSetObservationTarget?.(idx);
    updateMetricsPatch({ observationTarget: idx });
  },

  syncZeroGFleetState: (enabled: boolean) => {
    const probeTelemetry = enabled && state.bridge.onSampleZeroGFleetTelemetry
      ? (state.bridge.onSampleZeroGFleetTelemetry() || [])
      : [];
    updateMetricsPatch({
      zeroGFleetEnabled: Boolean(enabled),
      probeTelemetry,
    });
  },

  setTestCarAudioEnabled: (enabled: boolean) => {
    const next = Boolean(enabled);
    state.bridge.onSetTestCarAudioEnabled?.(next);
    updateMetricsPatch({ testCarAudioEnabled: next });
    return next;
  },

  toggleTestCarAudio: (forceEnabled?: boolean) => {
    const next = forceEnabled !== undefined ? Boolean(forceEnabled) : !state.metrics.testCarAudioEnabled;
    return networkDiagnosticsStore.setTestCarAudioEnabled(next);
  },

  setLobbyGhostMode: (enabled: boolean) => {
    state.bridge.onSetLobbyGhostMode?.(enabled);
    updateMetricsPatch({ lobbyGhostMode: Boolean(enabled) });
  },

  setDiagnosticMaxCapacity: (frames: number) => {
    state.bridge.onSetDiagnosticMaxCapacity?.(frames);
    networkDiagnosticsStore.updateDiagnosticBuffers({
      maxClientFrames: frames,
      clientOverflowPaused:
        state.metrics.diagnosticBuffers.clientFrames < frames
          ? false
          : state.metrics.diagnosticBuffers.clientOverflowPaused,
    });
  },

  setDiagnosticAutoPauseOverflow: (enabled: boolean) => {
    state.bridge.onSetDiagnosticAutoPauseOverflow?.(enabled);
    networkDiagnosticsStore.updateDiagnosticBuffers({ autoPauseOnOverflow: enabled });
  },

  toggleDiagnosticRecordingPause: () => {
    const nextActive = !state.metrics.diagnosticBuffers.clientRecordingActive;
    state.bridge.onToggleDiagnosticRecordingPause?.(nextActive);
    networkDiagnosticsStore.updateDiagnosticBuffers({
      clientRecordingActive: nextActive,
      clientOverflowPaused: false,
    });
  },

  clearDiagnosticBuffers: () => {
    state.bridge.onClearDiagnosticBuffers?.();
    networkDiagnosticsStore.updateDiagnosticBuffers({
      clientFrames: 0,
      telemetryTicks: 0,
      serverFrames: 0,
      clientOverflowPaused: false,
      starvationCount: 0,
      hardResyncCount: 0,
    });
  },

  resetLatency: () => {
    networkDiagnosticsStore.setBurstDropEnabled(false);
    networkDiagnosticsStore.applyStressPreset(NETWORK_STRESS_PRESETS.IDEAL_LAN.id);
  },

  resetStats: () => {
    resolveReconciler()?.resetStats?.();
    stressSim.clearBlackout(resolveChannel());
    updateMetricsPatch({
      corrections: 0,
      mispredictions: 0,
      lastErrorUu: 0,
      maxErrorUu: 0,
      healthState: CONNECTION_HEALTH_STATES.HEALTHY,
      packetAgeMs: 0,
      neutralFallbackActive: false,
      disconnectEvicted: false,
    });
  },

  dumpNextPacket: () => {
    if (state.bridge.onDumpNextPacket) state.bridge.onDumpNextPacket();
    else if (state.reconcilerRef?.dumpNextPacket) state.reconcilerRef.dumpNextPacket();
  },

  dumpLatestPacket: () => {
    if (state.bridge.onDumpLatestPacket) state.bridge.onDumpLatestPacket();
    else if (state.reconcilerRef?.dumpPacketDiagnostics) state.reconcilerRef.dumpPacketDiagnostics();
  },

  triggerBurstDrop: (count?: number) => {
    if (isTriggeringBurstDrop) return;
    isTriggeringBurstDrop = true;
    try {
      const cnt = count ?? state.metrics.burstDropCount;
      if (state.bridge.onTriggerBurstDrop) state.bridge.onTriggerBurstDrop(cnt);
      else if (state.channelRef?.forceDropNextInput) state.channelRef.forceDropNextInput(cnt);
    } finally {
      isTriggeringBurstDrop = false;
    }
  },

  getDiagnosticDump: () => ({
    timestamp: new Date().toISOString(),
    ...state.metrics,
  }),

  copyDiagnostics: () => {
    const text = JSON.stringify(networkDiagnosticsStore.getDiagnosticDump(), null, 2);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch((err) => {
        console.warn("[networkDiagnosticsStore] Failed to copy diagnostics to clipboard:", err);
      });
    }
  },
};

export const useNetworkDiagnosticsData = () =>
  useSyncExternalStore(networkDiagnosticsStore.subscribe, networkDiagnosticsStore.getSnapshot);
