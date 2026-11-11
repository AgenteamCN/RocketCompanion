/**
 * WasmAudioDirectorBridge.ts
 * Zero-copy C-ABI memory bridge between TypeScript audio configurations / WebAudio nodes
 * and the Rust `rc_audio_director` WebAssembly state machine (`AudioFrameCuePod`,
 * `AudioDirectorConfigPod`, and `AudioListenerStatePod`).
 */

import { audioConfig } from '../ui-core/config/audioConfig.ts';
import { getEngineAudioTuningConfig } from '../ui-core/config/engineAudioConfig.ts';
import { AUDIO_ATTENUATION_CATEGORIES } from '../ui-core/config/spatialAttenuationPresets.ts';
import {
  spatialAttenuationProfiles,
  type AttenuationCurveType,
} from '../ui-core/config/spatialAttenuationProfiles.ts';
import { getAudioContext } from './audioContext.ts';
import { listenerManager, type CameraTransformLike } from './SpatialAudioSource.ts';

export interface WasmBallAudioTarget {
  initialized: boolean;
  context?: AudioContext | null;
  ballRollingBuffer: AudioBuffer | null;
  ballFlyingBuffer: AudioBuffer | null;
  rollingSource: AudioBufferSourceNode | null;
  flyingSource: AudioBufferSourceNode | null;
  rollingGain: GainNode | null;
  flyingGain: GainNode | null;
  ballPanner?: PannerNode | null;
  position?: { x: number; y: number; z: number };
  _lastPanX?: number;
  _lastPanY?: number;
  _lastPanZ?: number;
  _lastTargetRollingGain?: number;
  _smoothedRollingGain?: number;
  _lastWrittenRollingGain?: number;
  _smoothedRollingRate?: number;
  _lastRollingRate?: number;
  _lastTargetFlyingGain?: number;
  _smoothedFlyingGain?: number;
  _lastWrittenFlyingGain?: number;
  _smoothedFlyingRate?: number;
  _lastFlyingRate?: number;
  _wasRolling?: boolean;
  _wasFallingDownward?: boolean;
  _startLoops: () => void;
  silenceAll: () => void;
}

export interface WasmAudioPhysicsModule {
  HEAPF32: Float32Array;
  HEAPU32: Uint32Array;
  _physics_stepAudioDirector(dtSec: number): number;
  _physics_getAudioCuePtr(): number;
  _physics_getAudioCueSize(): number;
  _physics_getAudioConfigPtr(): number;
  _physics_getAudioConfigSize(): number;
  _physics_getAudioListenerPtr(): number;
  _physics_setAudioListenerState(
    posX: number,
    posY: number,
    posZ: number,
    fwdX: number,
    fwdY: number,
    fwdZ: number,
    upX: number,
    upY: number,
    upZ: number,
    activeCarIndex: number,
    effectiveNumCars: number,
    flags: number
  ): void;
  _physics_resetAudioDirector(activeCarIndex: number): void;
  _physics_triggerAudioCarAction(carIndex: number, actionCode: number): void;
}

export const AUDIO_CUE_BALL_WORD_OFFSET = 10;
export const AUDIO_CUE_STADIUM_WORD_OFFSET = 18;
export const AUDIO_CUE_CARS_WORD_OFFSET = 22;
export const AUDIO_CUE_CAR_STRIDE_WORDS = 20;

function encodeCurveType(curve: AttenuationCurveType): number {
  switch (curve) {
    case 'linear':
      return 0;
    case 'smoothstep':
      return 1;
    case 'power':
    case 'exponential':
      return 2;
    case 'custom-bezier':
    case 'bezier':
      return 3;
    case 'inverse':
      return 4;
    default:
      return 1;
  }
}

/**
 * Synchronizes `audioConfig`, `engineAudioConfig`, and `spatialAttenuationProfiles`
 * into the 1408-byte `AudioDirectorConfigPod` in WASM linear memory.
 */
export function syncWasmAudioDirectorConfig(mod: WasmAudioPhysicsModule | null | undefined): void {
  if (!mod || typeof mod._physics_getAudioConfigPtr !== 'function') return;
  const ptr = mod._physics_getAudioConfigPtr();
  if (!ptr) return;

  const f32 = mod.HEAPF32;
  const u32 = mod.HEAPU32;
  const base = ptr >>> 2;
  const cfg = audioConfig.config;

  f32[base + 0] = Number(cfg.masterVolume ?? 1.0);
  f32[base + 1] = Number(cfg.engineVolume ?? 1.0);
  f32[base + 2] = Number(cfg.vehicleSelfVolume ?? 1.0);
  f32[base + 3] = Number(cfg.boostVolume ?? 1.0);
  f32[base + 4] = Number(cfg.boostStartVolume ?? 1.0);
  f32[base + 5] = Number(cfg.boostLoopVolume ?? 1.0);
  f32[base + 6] = Number(cfg.boostReleaseVolume ?? 1.0);
  f32[base + 7] = Number(cfg.boostCollectVolume ?? 1.0);
  f32[base + 8] = Number(cfg.supersonicEnterVolume ?? 1.0);
  f32[base + 9] = Number(cfg.supersonicLoopVolume ?? 1.0);
  f32[base + 10] = Number(cfg.jumpVolume ?? 1.0);
  f32[base + 11] = Number(cfg.doubleJumpVolume ?? 1.0);
  f32[base + 12] = Number(cfg.dodgeVolume ?? 1.0);
  f32[base + 13] = Number(cfg.flipResetVolume ?? 1.0);
  f32[base + 14] = Number(cfg.wheelImpactVolume ?? 1.0);
  f32[base + 15] = Number(cfg.ballCollisionVolume ?? 1.0);
  f32[base + 16] = Number(cfg.carBallHitVolume ?? 1.0);
  f32[base + 17] = Number(cfg.carCarCollisionVolume ?? 1.0);
  f32[base + 18] = Number(cfg.carDemoVolume ?? 1.0);
  f32[base + 19] = Number(cfg.ballFloorHitVolume ?? 1.0);
  f32[base + 20] = Number(cfg.ballNetHitVolume ?? 1.0);
  f32[base + 21] = Number(cfg.ballRampHitVolume ?? 1.0);
  f32[base + 22] = Number(cfg.goalpostHitVolume ?? 1.0);
  f32[base + 23] = Number(cfg.goalpostSmallHitVolume ?? 1.0);
  f32[base + 24] = Number(cfg.goalScoredVolume ?? 1.0);
  f32[base + 25] = Number(cfg.ballRollingVolume ?? 1.0);
  f32[base + 26] = Number(cfg.ballFlyingVolume ?? 1.0);
  f32[base + 27] = Number(cfg.arenaAcousticScale ?? 1.0);
  f32[base + 28] = Number(cfg.carBallHitImpulseThreshold ?? 80.0);
  f32[base + 29] = Number(cfg.ballGroundHitThreshold ?? 140.0);
  f32[base + 30] = Number(cfg.ballWallHitThreshold ?? 140.0);
  f32[base + 31] = Number(cfg.goalpostHitThreshold ?? 160.0);
  f32[base + 32] = Number(cfg.carBallHitCooldownMs ?? 35.0);
  f32[base + 33] = Number(cfg.incidentCooldownMs ?? 40.0);
  f32[base + 34] = Number(cfg.goalpostHitCooldownMs ?? 60.0);
  f32[base + 35] = 1.0;

  const eng = getEngineAudioTuningConfig();
  const eb = base + 36;
  f32[eb + 0] = eng.idleRPM;
  f32[eb + 1] = eng.redlineRPM;
  f32[eb + 2] = eng.rpmDropRate;
  f32[eb + 3] = eng.baseAccelRiseRate;
  f32[eb + 4] = eng.boostOverdriveMultiplier;
  f32[eb + 5] = eng.reverseAccelRiseRate;
  f32[eb + 6] = eng.revLimitCutoffRPM;
  f32[eb + 7] = eng.revLimiterBounceDrop;
  f32[eb + 8] = eng.revLimiterBounceDuration;
  f32[eb + 9] = eng.upshiftLandingRPM;
  f32[eb + 10] = eng.downshiftTriggerRPM;
  f32[eb + 11] = eng.downshiftRevMatchPeakRPM;
  f32[eb + 12] = eng.gearDecayFactorBase;
  f32[eb + 13] = eng.reverseGearDecayFactorBase;
  f32[eb + 14] = eng.flywheelAgility;
  f32[eb + 15] = eng.backfireTriggerRPM;
  f32[eb + 16] = eng.backfireRpmDrop;
  f32[eb + 17] = eng.backfireCooldownSec;
  f32[eb + 18] = eng.backfireVolume;
  f32[eb + 19] = eng.gainSmoothingTimeMs;
  f32[eb + 20] = eng.airborneRevQuotaDurationSec;
  f32[eb + 21] = eng.maxThrottleSpeedUU;
  f32[eb + 22] = eng.supersonicSpeedUU;
  f32[eb + 23] = eng.shiftLockSteerThreshold;
  f32[eb + 24] = eng.wallDecelDipThresholdUU;
  f32[eb + 25] = eng.zeroSpeedThresholdUU;
  f32[eb + 26] = eng.idleVolume;
  f32[eb + 27] = eng.sliceRmsAutoNormStrength;
  f32[eb + 28] = eng.freqTiltDb;
  f32[eb + 29] = eng.eqBandGainsDb[0] ?? 0;
  f32[eb + 30] = eng.eqBandGainsDb[1] ?? 0;
  f32[eb + 31] = eng.eqBandGainsDb[2] ?? 0;
  f32[eb + 32] = eng.eqBandGainsDb[3] ?? 0;
  f32[eb + 33] = eng.eqBandGainsDb[4] ?? 0;
  u32[eb + 34] = eng.maxGears | 0;

  let engFlags = 0;
  if (eng.autoUpshiftEnabled) engFlags |= 1 << 0;
  if (eng.autoDownshiftEnabled) engFlags |= 1 << 1;
  if (eng.airborneAutoNeutralEnabled) engFlags |= 1 << 2;
  if (eng.velocityCoupledGearsEnabled) engFlags |= 1 << 3;
  if (eng.supersonicTurnRevBounceEnabled) engFlags |= 1 << 4;
  if (eng.zeroSpeedResetEnabled) engFlags |= 1 << 5;
  if (eng.engineEqEnabled) engFlags |= 1 << 6;
  if (eng.crossfadeCurveType === 'equal-sine') engFlags |= 1 << 7;
  if (eng.decelMode === 'reverse-filter') engFlags |= 1 << 8;
  if (eng.landingRevRecoveryMode === 'instant-speed-match') engFlags |= 1 << 9;
  u32[eb + 35] = engFlags >>> 0;

  const ab = base + 72;
  for (let i = 0; i < AUDIO_ATTENUATION_CATEGORIES.length; i++) {
    const cat = AUDIO_ATTENUATION_CATEGORIES[i];
    const p = spatialAttenuationProfiles.getProfile(cat);
    const off = ab + i * 10;
    f32[off + 0] = p.minDistanceUU;
    f32[off + 1] = p.maxDistanceUU;
    f32[off + 2] = p.minGainFloor;
    u32[off + 3] = encodeCurveType(p.curveType);
    f32[off + 4] = p.curveExponent;
    f32[off + 5] = p.bezierPoints.x1;
    f32[off + 6] = p.bezierPoints.y1;
    f32[off + 7] = p.bezierPoints.x2;
    f32[off + 8] = p.bezierPoints.y2;
    u32[off + 9] = p.cullBeyondMax ? 1 : 0;
  }
}

export interface WasmListenerSyncInput {
  readonly camera: CameraTransformLike | null | undefined;
  readonly activeCarIndex: number;
  readonly effectiveNumCars: number;
  readonly isAudibleActive: boolean;
  readonly isLobbyDualWorld: boolean;
  readonly testCarAudioEnabled: boolean;
}

/**
 * Updates WebAudio `listenerManager` from camera and pushes the RocketSim UU listener
 * state into WASM via `_physics_setAudioListenerState`.
 */
export function syncWasmAudioListenerState(
  mod: WasmAudioPhysicsModule,
  input: WasmListenerSyncInput
): void {
  if (input.camera) {
    listenerManager.updateFromCamera(input.camera);
  }
  const hasListener = listenerManager.hasListener;
  const posX = listenerManager.position.x;
  const posY = listenerManager.position.z;
  const posZ = listenerManager.position.y;

  let flags = 0;
  if (input.isAudibleActive) flags |= 1 << 0;
  if (hasListener) flags |= 1 << 1;
  if (audioConfig.get('spatialAudio') !== false) flags |= 1 << 2;
  if (input.isLobbyDualWorld) flags |= 1 << 3;
  if (input.testCarAudioEnabled) flags |= 1 << 4;
  if (audioConfig.get('muteSignalAudioInGoalReplay') !== false) flags |= 1 << 5;

  mod._physics_setAudioListenerState(
    posX,
    posY,
    posZ,
    listenerManager.forward.x,
    listenerManager.forward.y,
    listenerManager.forward.z,
    listenerManager.up.x,
    listenerManager.up.y,
    listenerManager.up.z,
    input.activeCarIndex,
    input.effectiveNumCars,
    flags
  );
}

/**
 * Applies `BallAcousticLoopPod` directly from WASM `HEAPF32` to `BallAudioEmitter` WebAudio nodes.
 */
export function applyWasmBallCueToEmitter(
  ballEngine: WasmBallAudioTarget,
  f32: Float32Array,
  cueWordBase: number,
  isAudibleActive: boolean
): void {
  if (!isAudibleActive || !ballEngine.initialized) {
    ballEngine.silenceAll();
    return;
  }
  if (
    (ballEngine.ballRollingBuffer && !ballEngine.rollingSource) ||
    (ballEngine.ballFlyingBuffer && !ballEngine.flyingSource)
  ) {
    ballEngine._startLoops();
  }
  const ctx = ballEngine.context || getAudioContext();
  if (!ctx) return;

  const bOff = cueWordBase + AUDIO_CUE_BALL_WORD_OFFSET;
  const panX = f32[bOff + 0];
  const panY = f32[bOff + 1];
  const panZ = f32[bOff + 2];
  const rollGain = f32[bOff + 4];
  const rollRate = f32[bOff + 5];
  const flyGain = f32[bOff + 6];
  const flyRate = f32[bOff + 7];

  if (ballEngine.position) {
    ballEngine.position.x = panX * 100;
    ballEngine.position.y = panY * 100;
    ballEngine.position.z = panZ * 100;
  }

  if (ballEngine.ballPanner) {
    if (
      ballEngine._lastPanX === undefined ||
      Math.abs(panX - ballEngine._lastPanX) > 1e-4 ||
      Math.abs(panY - (ballEngine._lastPanY ?? 0)) > 1e-4 ||
      Math.abs(panZ - (ballEngine._lastPanZ ?? 0)) > 1e-4
    ) {
      ballEngine._lastPanX = panX;
      ballEngine._lastPanY = panY;
      ballEngine._lastPanZ = panZ;
      if (ballEngine.ballPanner.positionX) {
        ballEngine.ballPanner.positionX.value = panX;
        ballEngine.ballPanner.positionY.value = panY;
        ballEngine.ballPanner.positionZ.value = panZ;
      } else if (typeof ballEngine.ballPanner.setPosition === 'function') {
        ballEngine.ballPanner.setPosition(panX, panY, panZ);
      }
    }
  }

  if (ballEngine.rollingGain) {
    ballEngine._lastTargetRollingGain = rollGain;
    ballEngine._smoothedRollingGain = rollGain;
    if (
      ballEngine._lastWrittenRollingGain === undefined ||
      Math.abs(rollGain - ballEngine._lastWrittenRollingGain) > 1e-4 ||
      (rollGain === 0 && ballEngine._lastWrittenRollingGain !== 0)
    ) {
      ballEngine._lastWrittenRollingGain = rollGain;
      ballEngine.rollingGain.gain.value = rollGain;
    }
  }
  if (ballEngine.rollingSource?.playbackRate && rollGain > 0) {
    ballEngine._smoothedRollingRate = rollRate;
    if (
      ballEngine._lastRollingRate === undefined ||
      Math.abs(rollRate - ballEngine._lastRollingRate) > 1e-3
    ) {
      ballEngine._lastRollingRate = rollRate;
      ballEngine.rollingSource.playbackRate.value = rollRate;
    }
  }

  if (ballEngine.flyingGain) {
    ballEngine._lastTargetFlyingGain = flyGain;
    ballEngine._smoothedFlyingGain = flyGain;
    if (
      ballEngine._lastWrittenFlyingGain === undefined ||
      Math.abs(flyGain - ballEngine._lastWrittenFlyingGain) > 1e-4 ||
      (flyGain === 0 && ballEngine._lastWrittenFlyingGain !== 0)
    ) {
      ballEngine._lastWrittenFlyingGain = flyGain;
      ballEngine.flyingGain.gain.value = flyGain;
    }
  }
  if (ballEngine.flyingSource?.playbackRate && flyGain > 0) {
    ballEngine._smoothedFlyingRate = flyRate;
    if (
      ballEngine._lastFlyingRate === undefined ||
      Math.abs(flyRate - ballEngine._lastFlyingRate) > 1e-3
    ) {
      ballEngine._lastFlyingRate = flyRate;
      ballEngine.flyingSource.playbackRate.value = flyRate;
    }
  }
  ballEngine._wasRolling = rollGain > 0;
  ballEngine._wasFallingDownward = flyGain > 0;
}
