import type {
  DiagnosticBufferRuntimeContext,
  PacingTelemetryRecorderPort,
  PerCarBoostConfigPort,
  PerfTelemetryLatencyBreakdownPort,
  UnderDevelopmentConfigPort,
} from '../runtimeUiPort.ts';
import type { PredictionReconciler } from '../../network/client/PredictionReconciler.ts';
import type { RuntimeMatchState } from './RuntimeMatchState.ts';
import type { NetworkSessionChannelLike } from './onlineLobbyTransitionPipeline.ts';

export interface UnderDevelopmentStadiumReloadSpec {
  readonly isThrowback: boolean;
  readonly manifestUrl: string;
  readonly arenaPresetIndex: 0 | 1;
  readonly hitboxId: string;
  readonly hasOpponent: boolean;
  readonly extraBotCount: number;
  readonly showCollisionOverlay: boolean;
}

export interface NormalizedPerCarBoostSpec {
  readonly unlimitedBoost: boolean;
  readonly boostCollectable: boolean;
  readonly rechargeEnabled: boolean;
  readonly rechargePerSecond: number;
  readonly rechargeDelay: number;
}

export interface CarBoostConfigurableSimPort {
  setCarUnlimitedBoost?(carIndex: number, enabled: boolean): void;
  setCarBoostCollectable?(carIndex: number, enabled: boolean): void;
  setCarBoostRecharge?(
    carIndex: number,
    enabled: boolean,
    perSecond: number,
    delaySeconds: number
  ): void;
}

export interface DiagnosticBufferSnapshotInputs {
  readonly hasReconciler: boolean;
  readonly hasAuthoritativeServer: boolean;
  readonly isArenaLobbyMode: boolean;
  readonly matchState: RuntimeMatchState['state'] | undefined;
  readonly localPlayerCarIndex: number;
  readonly clientFrames: number;
  readonly clientRecordingActive: boolean;
  readonly clientOverflowPaused: boolean;
  readonly diagnosticDumpMaxFrames: number | undefined;
  readonly diagnosticDumpPauseOnOverflow: boolean | undefined;
  readonly recorder: PacingTelemetryRecorderPort | null;
  readonly serverFrames: number;
  readonly activeCarMask: number;
  readonly arenaPreset: number;
  readonly rosterPlayers: Array<Record<string, unknown>> | undefined;
}

export function computeNetworkLatencyBreakdown(
  channel: (NetworkSessionChannelLike & { isLoopback?: boolean; measuredRttMs?: number }) | null,
  reconciler: PredictionReconciler | null
): PerfTelemetryLatencyBreakdownPort {
  if (!channel && !reconciler) {
    return {
      rttMs: 0,
      extraRttMs: 0,
      uplinkMs: 0,
      downlinkMs: 0,
      extraUplinkMs: 0,
      extraDownlinkMs: 0,
      baseLatency: 0,
      extraLatency: 0,
    };
  }
  if (reconciler && typeof reconciler._resolveLatencyBreakdown === 'function') {
    const b = reconciler._resolveLatencyBreakdown();
    return {
      rttMs: b.rttMs,
      extraRttMs: b.extraRttMs,
      uplinkMs: b.uplinkMs,
      downlinkMs: b.downlinkMs,
      extraUplinkMs: b.extraUplinkMs,
      extraDownlinkMs: b.extraDownlinkMs,
      baseLatency: b.rttMs,
      extraLatency: b.extraRttMs,
    };
  }
  const extraUplinkMs = Math.max(
    0,
    Math.round(Number(channel?.extraUplinkMs ?? channel?.extraLatencyMs ?? 0) || 0)
  );
  const extraDownlinkMs = Math.max(
    0,
    Math.round(Number(channel?.extraDownlinkMs ?? channel?.extraLatencyMs ?? 0) || 0)
  );
  const extraRttMs = extraUplinkMs + extraDownlinkMs;

  let rttMs = extraRttMs;
  if (!channel?.isLoopback) {
    if (typeof channel?.rttMs === 'number' && Number.isFinite(channel.rttMs) && channel.rttMs > 0) {
      rttMs = Math.round(channel.rttMs);
    } else if (
      typeof channel?.measuredRttMs === 'number' &&
      Number.isFinite(channel.measuredRttMs) &&
      channel.measuredRttMs > 0
    ) {
      rttMs = Math.round(channel.measuredRttMs);
    }
  }
  const baseRtt = Math.max(0, rttMs - extraRttMs);
  const baseUplink = Math.round(baseRtt * 0.5);
  const baseDownlink = Math.max(0, baseRtt - baseUplink);
  const uplinkMs = baseUplink + extraUplinkMs;
  const downlinkMs = baseDownlink + extraDownlinkMs;

  return {
    rttMs: uplinkMs + downlinkMs,
    extraRttMs,
    uplinkMs,
    downlinkMs,
    extraUplinkMs,
    extraDownlinkMs,
    baseLatency: uplinkMs + downlinkMs,
    extraLatency: extraRttMs,
  };
}

export function buildUnderDevelopmentStadiumReloadSpec(
  config: UnderDevelopmentConfigPort,
  prevCarCount: number,
  selectedHitbox: string | null
): UnderDevelopmentStadiumReloadSpec {
  const isThrowback = config.stadiumPreset === 'throwback';
  const normalizedCars = Math.max(1, prevCarCount || 1);
  return {
    isThrowback,
    manifestUrl: isThrowback
      ? '/arenamesh/throwback_stadium/manifest.json'
      : '/arenamesh/manifest.json',
    arenaPresetIndex: isThrowback ? 1 : 0,
    hitboxId: selectedHitbox || 'octane',
    hasOpponent: normalizedCars > 1,
    extraBotCount: Math.max(0, normalizedCars - 2),
    showCollisionOverlay: Boolean(config.showThrowbackCollisionOverlay),
  };
}

export function normalizePerCarBoostSpec(entry: PerCarBoostConfigPort): NormalizedPerCarBoostSpec {
  return {
    unlimitedBoost: Boolean(entry.unlimitedBoost),
    boostCollectable: Boolean(entry.boostCollectable),
    rechargeEnabled: Boolean(entry.rechargeBoostEnabled),
    rechargePerSecond: Number(entry.rechargeBoostPerSecond ?? 10.0),
    rechargeDelay: Number(entry.rechargeBoostDelay ?? 0.25),
  };
}

export function applyPerCarBoostSpecToSim(
  sim: CarBoostConfigurableSimPort | null | undefined,
  carIndex: number,
  spec: NormalizedPerCarBoostSpec
): void {
  if (!sim) return;
  sim.setCarUnlimitedBoost?.(carIndex, spec.unlimitedBoost);
  sim.setCarBoostCollectable?.(carIndex, spec.boostCollectable);
  sim.setCarBoostRecharge?.(
    carIndex,
    spec.rechargeEnabled,
    spec.rechargePerSecond,
    spec.rechargeDelay
  );
}

export function isLocalModeGoalReplaySkippable(modeName: string | undefined): boolean {
  return (
    modeName === 'exp-multi-bots' ||
    modeName === 'freeplay' ||
    modeName === 'replay-viewer' ||
    modeName === 'static-training-pack'
  );
}

export function buildDiagnosticBufferContextSnapshot(
  inputs: DiagnosticBufferSnapshotInputs
): DiagnosticBufferRuntimeContext {
  const phase = inputs.matchState?.phase;
  const maxClientFrames = Number(inputs.diagnosticDumpMaxFrames) || 36000;
  const autoPauseOnOverflow =
    inputs.diagnosticDumpPauseOnOverflow !== undefined
      ? Boolean(inputs.diagnosticDumpPauseOnOverflow)
      : true;
  const roster = Array.isArray(inputs.rosterPlayers) ? inputs.rosterPlayers : [];

  return {
    isOnlineSession: Boolean(inputs.hasReconciler || inputs.hasAuthoritativeServer),
    isLobby: Boolean(inputs.isArenaLobbyMode || phase === 'lobby'),
    matchState: String(phase || 'FREEPLAY'),
    isHosting: Boolean(inputs.hasAuthoritativeServer),
    localPlayerCarIndex: inputs.localPlayerCarIndex,
    activeCarMask: inputs.activeCarMask,
    clientFrames: inputs.clientFrames,
    clientRecordingActive: inputs.clientRecordingActive,
    clientOverflowPaused: inputs.clientOverflowPaused,
    maxClientFrames,
    autoPauseOnOverflow,
    recorder: inputs.recorder,
    serverFrames: inputs.serverFrames,
    blueScore: inputs.matchState?.blueScore ?? 0,
    orangeScore: inputs.matchState?.orangeScore ?? 0,
    durationSeconds: inputs.matchState?.durationSeconds ?? 300,
    arenaPreset: inputs.arenaPreset,
    roster,
  };
}

export function resolveDiagnosticRecorderResetSpec(
  pacingController:
    | { clockPacingMode?: string; clockPacingPriority?: string; clockPacingParams?: unknown }
    | null
    | undefined
): { readonly mode: string; readonly priority: string; readonly params: Record<string, unknown> } {
  return {
    mode: pacingController?.clockPacingMode || 'csts',
    priority: pacingController?.clockPacingPriority || 'balanced',
    params: (pacingController?.clockPacingParams as Record<string, unknown>) || {},
  };
}

export function resolveFocusedPlayerCarIndex(
  reconcilerLocalCarIndex: number | undefined,
  currentPlayerCarIndex: number | undefined,
  alwaysAssign = false
): number | null {
  const hasLocalCar = typeof reconcilerLocalCarIndex === 'number' && reconcilerLocalCarIndex >= 0;
  if (!hasLocalCar && !alwaysAssign) return null;
  if (hasLocalCar) return reconcilerLocalCarIndex!;
  return typeof currentPlayerCarIndex === 'number' && currentPlayerCarIndex >= 0
    ? currentPlayerCarIndex
    : 0;
}

export function collectActiveMatchParticipantMap(
  localIdx: number,
  presets: ReadonlyMap<number, string> | undefined,
  peers: ReadonlyArray<{ carIndex?: number; team?: number | string }>,
  remotePeerCarMap: ReadonlyMap<string, number> | undefined
): Map<number, number> {
  const activeMap = new Map<number, number>([[localIdx, localIdx % 2]]);
  if (presets instanceof Map) {
    for (const cIdx of presets.keys()) {
      if (typeof cIdx === 'number' && cIdx >= 0 && cIdx < 6 && !activeMap.has(cIdx)) {
        activeMap.set(cIdx, cIdx % 2);
      }
    }
  }
  for (const peer of peers) {
    if (typeof peer?.carIndex === 'number' && peer.carIndex >= 0 && peer.carIndex < 6) {
      activeMap.set(peer.carIndex, typeof peer.team === 'number' ? peer.team : peer.carIndex % 2);
    }
  }
  if (remotePeerCarMap instanceof Map) {
    for (const cIdx of remotePeerCarMap.values()) {
      if (typeof cIdx === 'number' && cIdx >= 0 && cIdx < 6 && !activeMap.has(cIdx)) {
        activeMap.set(cIdx, cIdx % 2);
      }
    }
  }
  return activeMap;
}

export function resolveExportedReplayRoster(
  exp: Record<string, unknown> | null,
  fallbackRoster: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  const r = exp?.roster as
    { players?: Array<Record<string, unknown>> } | Array<Record<string, unknown>> | undefined;
  if (Array.isArray(exp?.loadouts)) return exp.loadouts as Array<Record<string, unknown>>;
  if (!Array.isArray(r) && Array.isArray(r?.players)) return r.players;
  if (Array.isArray(r)) return r;
  return fallbackRoster;
}

export function mergeExportedHostMatchReplayPayload<
  T extends {
    durationSeconds: number;
    roster: Array<Record<string, unknown>>;
    loadouts: Array<Record<string, unknown>>;
    blueScore: number;
    orangeScore: number;
  },
>(basePayload: T, exp: Record<string, unknown> | null): T & Record<string, unknown> {
  const roster = resolveExportedReplayRoster(exp, basePayload.roster);
  return {
    ...basePayload,
    stateInputBytes: (exp?.stateInputBytes as Uint8Array) || undefined,
    incidentBytes: (exp?.incidentBytes as Uint8Array) || undefined,
    signalBytes: (exp?.signalBytes as Uint8Array) || undefined,
    gameMode: (exp?.gameMode as string) || '3v3',
    durationSeconds: (exp?.durationSeconds as number) ?? basePayload.durationSeconds,
    roster,
    loadouts: roster,
    blueScore: (exp?.blueScore as number) ?? basePayload.blueScore,
    orangeScore: (exp?.orangeScore as number) ?? basePayload.orangeScore,
  };
}
