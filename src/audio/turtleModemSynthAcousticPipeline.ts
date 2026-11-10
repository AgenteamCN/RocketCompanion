/**
 * turtleModemSynthAcousticPipeline.ts
 * Pure acoustic gain calculation, backfire/spawn one-shot evaluation,
 * and telemetry payload assembly for TurtleModemEngineSynth.
 */

import {
  type EngineAudioPackId,
  type EngineAudioTuningConfig,
  type EngineDriveDirection,
  type publishEngineAudioTelemetry,
} from '../ui-core/config/engineAudioConfig.ts';
import { type LoadedEngineAudioPackAssets } from './EngineAudioLoopConditioner.ts';
import { EngineAudioEqualizer } from './EngineAudioEqualizer.ts';
import {
  normalizePowertrainTelemetry,
  stepManualBenchKinematics,
  type NormalizedPowertrainTelemetry,
  type PowertrainTelemetryInput,
} from './EnginePhysicsKinematics.ts';
import { type TurtleModemDrivetrainModel } from './TurtleModemDrivetrainModel.ts';
import {
  TurtleModemGranularVoiceGraph,
  type GranularGraphUpdateResult,
} from './TurtleModemGranularVoiceGraph.ts';

export const REMOTE_HIBERNATE_GRACE_SEC = 15.0;

export interface EngineSynthTelemetryInput extends PowertrainTelemetryInput {
  dormant?: boolean;
  distanceUU?: number;
}

export interface BackfirePopDecision {
  buffer: AudioBuffer;
  nextPopIndex: number;
  gain: number;
  playbackRate: number;
}

export interface EngineSynthTelemetrySnapshotInput {
  packId: EngineAudioPackId;
  voiceGraph: TurtleModemGranularVoiceGraph;
  assets: LoadedEngineAudioPackAssets | null;
  drivetrain: TurtleModemDrivetrainModel;
  graphResult: GranularGraphUpdateResult;
  rawSpeedUU: number;
  lastPopIndex: number;
  backfireCount: number;
  entitySpawnCount: number;
}

export function createEngineSynthOutputNodes(
  ctx: AudioContext,
  destination: AudioNode,
  isPrimary: boolean
) {
  const lowpassNode = ctx.createBiquadFilter();
  lowpassNode.type = 'lowpass';
  lowpassNode.frequency.value = 18000;
  lowpassNode.Q.value = 0.707;
  const equalizer = new EngineAudioEqualizer(ctx, lowpassNode);
  const outputNode = ctx.createGain();
  outputNode.gain.value = 0;
  lowpassNode.connect(outputNode);
  outputNode.connect(destination);
  const voiceGraph = new TurtleModemGranularVoiceGraph(
    ctx,
    lowpassNode,
    equalizer,
    isPrimary ? 'primary-full' : 'remote-lod'
  );
  return { lowpassNode, equalizer, outputNode, voiceGraph };
}

export interface EngineSynthManualBenchState {
  active: boolean;
  throttle: boolean;
  boost: boolean;
  reverse: boolean;
  airborne: boolean;
  speedUU: number;
}

export function createInitialManualBenchState(): EngineSynthManualBenchState {
  return {
    active: false,
    throttle: false,
    boost: false,
    reverse: false,
    airborne: false,
    speedUU: 0,
  };
}

export function applyManualBenchPatch(
  bench: EngineSynthManualBenchState,
  patch: Partial<Omit<EngineSynthManualBenchState, 'speedUU'>>
): void {
  if (patch.active !== undefined) bench.active = patch.active;
  if (patch.throttle !== undefined) bench.throttle = patch.throttle;
  if (patch.boost !== undefined) bench.boost = patch.boost;
  if (patch.reverse !== undefined) bench.reverse = patch.reverse;
  if (patch.airborne !== undefined) bench.airborne = patch.airborne;
}

export function resolveEngineSynthKinematicsFrame(
  speedOrTelemetry: number | EngineSynthTelemetryInput,
  legacyIsAccelerating: boolean,
  computedDt: number,
  cfg: EngineAudioTuningConfig,
  isPrimaryListener: boolean,
  manualBench: EngineSynthManualBenchState,
  currentDriveDirection: EngineDriveDirection
): NormalizedPowertrainTelemetry {
  const norm = normalizePowertrainTelemetry(speedOrTelemetry, legacyIsAccelerating, computedDt);
  if (!isPrimaryListener || !manualBench.active) {
    manualBench.speedUU = norm.rawSpeedUU;
    return norm;
  }
  const bench = stepManualBenchKinematics(
    cfg,
    manualBench.speedUU,
    manualBench.throttle,
    manualBench.boost,
    manualBench.reverse,
    manualBench.airborne,
    currentDriveDirection,
    norm.dt
  );
  manualBench.speedUU = bench.manualSpeedUU;
  return {
    ...norm,
    isOnGround: bench.isOnGround,
    throttleInput: bench.throttleInput,
    isBoosting: bench.isBoosting,
    rawSpeedUU: bench.rawSpeedUU,
    forwardSpeedUU: bench.forwardSpeedUU,
  };
}

export function stepEngineSynthDrivetrain(
  drivetrain: TurtleModemDrivetrainModel,
  cfg: EngineAudioTuningConfig,
  frame: NormalizedPowertrainTelemetry
) {
  return drivetrain.step(
    cfg,
    frame.rawSpeedUU,
    frame.forwardSpeedUU,
    frame.throttleInput,
    frame.isOnGround,
    frame.dt,
    {
      steerInput: frame.steerInput,
      handbrakeInput: frame.handbrakeInput,
      isBoosting: frame.isBoosting,
      surfaceUpZ: frame.surfaceUpZ,
    }
  );
}

export function stepRemoteHibernateTimer(
  shouldPlay: boolean,
  isPrimaryListener: boolean,
  dormant: boolean,
  nowSec: number,
  inactiveSinceSec: number,
  graphBuilt: boolean
): { nextInactiveSinceSec: number; shouldTeardown: boolean } {
  if (shouldPlay) return { nextInactiveSinceSec: -1, shouldTeardown: false };
  if (!isPrimaryListener || dormant) {
    if (inactiveSinceSec < 0) return { nextInactiveSinceSec: nowSec, shouldTeardown: false };
    if (graphBuilt && nowSec - inactiveSinceSec >= REMOTE_HIBERNATE_GRACE_SEC) {
      return { nextInactiveSinceSec: inactiveSinceSec, shouldTeardown: true };
    }
  }
  return { nextInactiveSinceSec: inactiveSinceSec, shouldTeardown: false };
}

export function speedUuToKmh(rawSpeed: number): number {
  return Number.isFinite(rawSpeed) && rawSpeed > 0 ? rawSpeed * 0.036 : 0;
}

export function computeEngineSynthMasterGain(
  shouldPlay: boolean,
  engineVolume: number,
  isUnderStrain: boolean
): number {
  if (!shouldPlay) return 0;
  return Math.min(1.2, engineVolume * 0.42 * (isUnderStrain ? 1.08 : 1.0));
}

export function isDrivetrainStationaryNeutral(
  drivetrain: TurtleModemDrivetrainModel,
  idleRPM: number
): boolean {
  return (
    drivetrain.isOnGround &&
    drivetrain.driveDirection === 'stopped' &&
    drivetrain.smoothThrottle < 0.01 &&
    drivetrain.currentRPM <= idleRPM + 15
  );
}

export function stepEngineSynthVoiceGraph(
  voiceGraph: TurtleModemGranularVoiceGraph,
  assets: LoadedEngineAudioPackAssets | null,
  drivetrain: TurtleModemDrivetrainModel,
  cfg: EngineAudioTuningConfig,
  nowSec: number,
  shouldPlay: boolean,
  dtSec?: number
): GranularGraphUpdateResult | null {
  if (!voiceGraph.graphBuilt || !voiceGraph.sliceChannels.length) {
    if (assets && shouldPlay) voiceGraph.build(assets);
    if (!voiceGraph.graphBuilt) return null;
  }
  return voiceGraph.update({
    cfg,
    now: nowSec,
    dtSec,
    tau: Math.max(0.003, cfg.gainSmoothingTimeMs / 1000),
    currentRPM: drivetrain.currentRPM,
    smoothThrottle: drivetrain.smoothThrottle,
    isUnderStrain: drivetrain.isUnderStrain,
    isStationaryNeutral: isDrivetrainStationaryNeutral(drivetrain, cfg.idleRPM),
  });
}

export function evaluateBackfirePopTrigger(
  assets: LoadedEngineAudioPackAssets | null,
  cfg: EngineAudioTuningConfig,
  nowSec: number,
  lastBackfireTimeSec: number,
  lastPopIndex: number,
  engineVolume: number,
  forceAudition: boolean,
  canPlayNormally: boolean
): BackfirePopDecision | null {
  const pops = assets?.popBuffers;
  if (!pops?.length || (!forceAudition && !canPlayNormally)) return null;
  if (
    !forceAudition &&
    nowSec - lastBackfireTimeSec < Math.max(0.15, cfg.backfireCooldownSec ?? 0.65)
  ) {
    return null;
  }
  let idx = 0;
  if (pops.length > 1) {
    do {
      idx = Math.floor(Math.random() * pops.length);
    } while (idx === lastPopIndex);
  }
  const gain = Math.max(
    0,
    Math.min(1.5, cfg.backfireVolume * (forceAudition ? 0.9 : engineVolume))
  );
  const playbackRate = 0.94 + Math.random() * 0.12;
  return { buffer: pops[idx], nextPopIndex: idx, gain, playbackRate };
}

export function evaluateEntitySpawnSfxTrigger(
  assets: LoadedEngineAudioPackAssets | null,
  cfg: EngineAudioTuningConfig,
  nowSec: number,
  lastEntitySpawnTimeSec: number,
  engineVolume: number,
  forceAudition: boolean,
  canPlayNormally: boolean
): { buffer: AudioBuffer; gain: number } | null {
  if (!forceAudition && (!cfg.entitySpawnSfxEnabled || !canPlayNormally)) return null;
  const spawnBuf = assets?.entitySpawnBuffer;
  if (!spawnBuf) return null;
  if (!forceAudition && nowSec - lastEntitySpawnTimeSec < 0.15) return null;
  const vol = cfg.entitySpawnSfxVolume * (forceAudition ? 0.9 : Math.max(0.35, engineVolume));
  return { buffer: spawnBuf, gain: Math.max(0, Math.min(1.5, vol)) };
}

export function playEngineSynthOneShotBuffer(
  ctx: AudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
  gainVal: number,
  rate = 1.0
): void {
  if (gainVal <= 0.001) return;
  try {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gainVal;
    src.connect(g);
    g.connect(destination);
    src.start(ctx.currentTime);
    src.onended = () => {
      try {
        src.disconnect();
        g.disconnect();
      } catch {
        /* ignore */
      }
    };
  } catch {
    /* ignore */
  }
}

export function buildEngineSynthTelemetryPayload(
  input: EngineSynthTelemetrySnapshotInput
): Parameters<typeof publishEngineAudioTelemetry>[0] {
  const { drivetrain: dtModel, graphResult, voiceGraph, assets } = input;
  return {
    packId: input.packId,
    loaded: voiceGraph.graphBuilt,
    loadedSlicesCount: voiceGraph.sliceChannels.length,
    totalSlicesCount: assets?.slices.length ?? 40,
    currentRPM: dtModel.currentRPM,
    targetRPM: dtModel.targetRPM,
    currentGear: dtModel.currentGear,
    isNeutral: dtModel.isNeutral,
    isOnGround: dtModel.isOnGround,
    driveDirection: dtModel.driveDirection,
    speedUU: input.rawSpeedUU,
    speedKmh: speedUuToKmh(input.rawSpeedUU),
    forwardAccelUU: dtModel.smoothForwardAccelUU,
    airborneRevQuotaRemainingSec: dtModel.airborneThrottleQuotaSec,
    isShiftLocked: dtModel.isShiftLocked,
    isUnderStrain: dtModel.isUnderStrain,
    isInOverdrive: dtModel.isInOverdrive,
    isBoosting: dtModel.isBoosting,
    throttleLoad: dtModel.wasAccelerating ? 1 : 0,
    smoothThrottle: dtModel.smoothThrottle,
    isRevLimiting: dtModel.revLimiterTimer > 0,
    lowerSliceIndex: graphResult.lowerSliceIndex,
    upperSliceIndex: graphResult.upperSliceIndex,
    lowerSliceFreqHz: graphResult.lowerSliceFreqHz,
    upperSliceFreqHz: graphResult.upperSliceFreqHz,
    activeEqCompensationDb: graphResult.activeEqCompensationDb,
    idleWeight: graphResult.effectiveIdleGain,
    filterCutoffHz: graphResult.filterCutoffHz,
    lastBackfireIndex: input.lastPopIndex,
    backfireCount: input.backfireCount,
    entitySpawnCount: input.entitySpawnCount,
  };
}
