import { audioConfig } from '../ui-core/config/audioConfig.ts';
import {
  ANTHEM_SPECIFIC_CATEGORIES,
  resolvePlayableAnthemDef,
} from '../ui-core/config/anthemCatalogConfig.ts';
import { useSpatialAudioStore } from '../game/runtimeUiPort.ts';
import { subsystemState } from './audioContext.ts';
import { fetchAudioBuffer } from './audioAssetLoader.ts';
import type { VehicleAudioBuffers } from './VehicleAudioManager.ts';
import type { IncidentAudioBuffers } from './IncidentAudioEngine.ts';

export interface PreviewAudioBufferOptions {
  playbackRate?: number;
  loop?: boolean;
  offset?: number;
  maxDurationSec?: number;
}

export interface DetailPreviewSpec {
  readonly bufKey?: string;
  readonly poolKey?: string;
  readonly fallbackKey?: string;
  readonly volKey: string;
  readonly busKey?: string;
  readonly extraVolKey?: string;
  readonly scale?: number;
  readonly opts?: PreviewAudioBufferOptions;
}

export interface ResolvedPreviewSample {
  readonly buffer: AudioBuffer | null;
  readonly gain: number;
  readonly options?: PreviewAudioBufferOptions;
}

const BGM_PREVIEW_SAMPLE_URL =
  '/assets/audio/bgm/Hollywood Principle - Breathing Underwater (Ether Remix).m4a';
const BGM_PREVIEW_FALLBACK_URL =
  '/assets/audio/bgm/Mike Ault - Flying Forever (feat. Morgan Perry).m4a';
const SPECIFIC_ANTHEM_CATEGORIES = new Set(ANTHEM_SPECIFIC_CATEGORIES.map((c) => c.id));

const Loop120: PreviewAudioBufferOptions = { loop: true, maxDurationSec: 1.2 };
const Loop125: PreviewAudioBufferOptions = { loop: true, maxDurationSec: 1.25 };

const sig = (
  bufKey: string,
  volKey: string,
  opts?: PreviewAudioBufferOptions
): DetailPreviewSpec => ({
  bufKey,
  volKey,
  busKey: 'signalVolume',
  opts,
});
const ballPool = (poolKey: string, volKey: string): DetailPreviewSpec => ({
  poolKey,
  volKey,
  busKey: 'ballCollisionVolume',
});
const vehPool = (poolKey: string, volKey: string): DetailPreviewSpec => ({
  poolKey,
  volKey,
  busKey: 'vehicleSelfVolume',
});
const boostBuf = (
  bufKey: string,
  volKey: string,
  scale?: number,
  opts?: PreviewAudioBufferOptions
): DetailPreviewSpec => ({
  bufKey,
  volKey,
  busKey: 'boostVolume',
  extraVolKey: 'vehicleSelfVolume',
  scale,
  opts,
});

export const DETAIL_PREVIEW_SPECS: Readonly<Record<string, DetailPreviewSpec>> = {
  masterVolume: sig('match_start_go', 'matchStartGoVolume'),
  signalVolume: sig('match_countdown_321', 'countdown321Volume'),
  countdown321Volume: sig('match_countdown_321', 'countdown321Volume'),
  matchStartGoVolume: sig('match_start_go', 'matchStartGoVolume'),
  trainingCountdownVolume: sig('training_countdown', 'trainingCountdownVolume'),
  trainingBallExpireVolume: sig('training_ball_expire', 'trainingBallExpireVolume'),
  alert60sVolume: sig('match_60_seconds_left', 'alert60sVolume'),
  alert30sVolume: sig('match_30_seconds_left', 'alert30sVolume'),
  countdown10sVolume: sig('match_countdown_10s', 'countdown10sVolume'),
  overtimeVolume: sig('match_entering_overtime', 'overtimeVolume'),
  endgameVolume: sig('endgame', 'endgameVolume', { maxDurationSec: 2.2 }),
  ballCollisionVolume: ballPool('carBallHit', 'carBallHitVolume'),
  carBallHitVolume: ballPool('carBallHit', 'carBallHitVolume'),
  carBallAccentVolume: {
    bufKey: 'vehicle_accent',
    volKey: 'carBallAccentVolume',
    busKey: 'ballCollisionVolume',
    extraVolKey: 'carBallHitVolume',
  },
  carCarCollisionVolume: { poolKey: 'carCarDetail', volKey: 'carCarCollisionVolume' },
  carCarSfxCollisionVolume: {
    bufKey: 'car_collision',
    volKey: 'carCarSfxCollisionVolume',
    busKey: 'carCarCollisionVolume',
  },
  carDemoVolume: { poolKey: 'carDemo', fallbackKey: 'car_collision', volKey: 'carDemoVolume' },
  ballFloorHitVolume: ballPool('ballFloor', 'ballFloorHitVolume'),
  ballRampHitVolume: ballPool('ballRamp', 'ballRampHitVolume'),
  ballNetHitVolume: ballPool('ballNet', 'ballNetHitVolume'),
  goalpostHitVolume: ballPool('goalpostLarge', 'goalpostHitVolume'),
  goalpostSmallHitVolume: ballPool('goalpostSmall', 'goalpostSmallHitVolume'),
  boostCollectVolume: {
    bufKey: 'boost_collect',
    volKey: 'boostCollectVolume',
    busKey: 'boostVolume',
  },
  goalScoredVolume: { bufKey: 'sfx_goal_poof', volKey: 'goalScoredVolume' },
  flipResetVolume: { bufKey: 'reset', volKey: 'flipResetVolume', busKey: 'vehicleSelfVolume' },
  wheelImpactVolume: vehPool('wheelImpact', 'wheelImpactVolume'),
  boostVolume: boostBuf('boost_start', 'boostStartVolume'),
  boostStartVolume: boostBuf('boost_start', 'boostStartVolume'),
  boostLoopVolume: boostBuf('boost_loop', 'boostLoopVolume', undefined, Loop120),
  boostReleaseVolume: boostBuf('boost_release', 'boostReleaseVolume', 0.8),
  jumpVolume: vehPool('jump', 'jumpVolume'),
  doubleJumpVolume: vehPool('doubleJump', 'doubleJumpVolume'),
  dodgeVolume: vehPool('dodge', 'dodgeVolume'),
  supersonicEnterVolume: vehPool('supersonicEnter', 'supersonicEnterVolume'),
  supersonicLoopVolume: {
    bufKey: 'supersonic_loop',
    volKey: 'supersonicLoopVolume',
    busKey: 'vehicleSelfVolume',
    opts: Loop125,
  },
  supersonicStateVolume: {
    bufKey: 'sfx_state_supersonic',
    fallbackKey: 'supersonic_loop',
    volKey: 'supersonicStateVolume',
    scale: 0.75,
    opts: Loop125,
  },
  ballRollingVolume: { bufKey: 'ballrolling', volKey: 'ballRollingVolume', opts: Loop125 },
  ballFlyingVolume: { bufKey: 'ballflying', volKey: 'ballFlyingVolume', opts: Loop125 },
  errorNoBoostVolume: {
    bufKey: 'sfx_error_no_boost',
    volKey: 'errorNoBoostVolume',
    busKey: 'signalVolume',
    scale: 0.85,
  },
  uiClickVolume: {
    bufKey: 'sfx_error_no_boost',
    volKey: 'uiClickVolume',
    scale: 0.3,
    opts: { playbackRate: 2.0 },
  },
};

export class AudioPreviewBufferCatalog {
  readonly singleBuffers = new Map<string, AudioBuffer | null>();
  readonly bufferPools = new Map<string, Array<AudioBuffer | null>>();
  readonly variantCounters: Record<string, number> = {};
  private readonly anthemPreviewCache = new Map<string, AudioBuffer>();
  private cachedBgmPreviewBuffer: AudioBuffer | null = null;
  loaded = false;

  syncLoadedBuffers(
    incident: IncidentAudioBuffers,
    vehicle: VehicleAudioBuffers,
    signals: ReadonlyMap<string, AudioBuffer | null>,
    ballRolling: AudioBuffer | null,
    ballFlying: AudioBuffer | null
  ): void {
    this.loaded = true;
    const groundList = incident.groundHit.length
      ? incident.groundHit
      : incident.ballHit.slice(0, 3);
    const wheelList = vehicle.wheelImpact.length ? vehicle.wheelImpact : incident.wheelImpact;
    this.bufferPools.set('carBallHit', incident.ballHit);
    this.bufferPools.set('carCarDetail', incident.vehicleDetail);
    this.bufferPools.set('carDemo', incident.carDemo);
    this.bufferPools.set('ballFloor', groundList);
    this.bufferPools.set('ballRamp', groundList);
    this.bufferPools.set('ballNet', incident.sidewallHit);
    this.bufferPools.set('goalpostLarge', incident.crossbarPing);
    this.bufferPools.set('goalpostSmall', incident.crossbarPingSmall);
    this.bufferPools.set('wheelImpact', wheelList);
    this.bufferPools.set('jump', vehicle.jump);
    this.bufferPools.set('doubleJump', vehicle.doubleJump);
    this.bufferPools.set('dodge', vehicle.dodge);
    this.bufferPools.set('supersonicEnter', vehicle.supersonicEnter);

    this.singleBuffers.set('vehicle_accent', incident.vehicleAccent);
    this.singleBuffers.set('car_collision', incident.carCollision);
    this.singleBuffers.set('boost_collect', incident.boostCollect);
    this.singleBuffers.set('sfx_goal_poof', incident.goalScored);
    this.singleBuffers.set('reset', vehicle.reset || incident.reset);
    this.singleBuffers.set('boost_start', vehicle.boostStart);
    this.singleBuffers.set('boost_loop', vehicle.boostLoop);
    this.singleBuffers.set('boost_release', vehicle.boostRelease);
    this.singleBuffers.set('supersonic_loop', vehicle.supersonicLoop);
    this.singleBuffers.set('ballrolling', ballRolling);
    this.singleBuffers.set('ballflying', ballFlying);
    for (const [k, v] of signals.entries()) {
      this.singleBuffers.set(k, v);
    }
  }

  syncBoostBuffers(vehicle: VehicleAudioBuffers): void {
    this.singleBuffers.set('boost_start', vehicle.boostStart);
    this.singleBuffers.set('boost_loop', vehicle.boostLoop);
    this.singleBuffers.set('boost_release', vehicle.boostRelease);
  }

  nextPoolBuffer(
    key: string,
    list: Array<AudioBuffer | null> | null | undefined
  ): AudioBuffer | null {
    if (!Array.isArray(list) || list.length === 0) return null;
    const idx = (this.variantCounters[key] || 0) % list.length;
    this.variantCounters[key] = (idx + 1) % list.length;
    return list[idx] ?? null;
  }

  resolveDetailSample(detailKey: string): ResolvedPreviewSample | null {
    const spec = DETAIL_PREVIEW_SPECS[detailKey];
    if (!spec) return null;

    let buffer: AudioBuffer | null = null;
    if (spec.poolKey) {
      buffer = this.nextPoolBuffer(spec.poolKey, this.bufferPools.get(spec.poolKey));
    } else if (spec.bufKey) {
      buffer =
        this.singleBuffers.get(spec.bufKey) || subsystemState.buffers.get(spec.bufKey) || null;
    }
    if (!buffer && spec.fallbackKey) {
      buffer =
        this.singleBuffers.get(spec.fallbackKey) ||
        subsystemState.buffers.get(spec.fallbackKey) ||
        null;
    }

    const v = (k: string): number => Number(audioConfig.get(k) ?? 1.0);
    const gain =
      v(spec.volKey) *
      (spec.busKey ? v(spec.busKey) : 1.0) *
      (spec.extraVolKey ? v(spec.extraVolKey) : 1.0) *
      (spec.scale ?? 1.0);
    return { buffer, gain, options: spec.opts };
  }

  async resolveAnthemSuiteSample(ctx: AudioContext): Promise<ResolvedPreviewSample | null> {
    const store = useSpatialAudioStore.getState();
    const prefId =
      store.selectedAnthem && store.selectedAnthem !== 'none' ? store.selectedAnthem : 'random';
    const trimmed = prefId.trim();
    const resolved = SPECIFIC_ANTHEM_CATEGORIES.has(trimmed)
      ? resolvePlayableAnthemDef('random', { randomScope: 'specific', randomCategory: trimmed })
      : resolvePlayableAnthemDef(prefId, {
          randomScope: store.randomAnthemScope,
          randomCategory: store.randomAnthemCategory,
        });
    const cacheKey = resolved?.id || 'fallback';
    let buffer: AudioBuffer | null = this.anthemPreviewCache.get(cacheKey) ?? null;
    if (!buffer) {
      const url = resolved?.file
        ? `/${resolved.file.replace(/^\//, '')}`
        : BGM_PREVIEW_FALLBACK_URL;
      buffer = await fetchAudioBuffer(ctx, url, BGM_PREVIEW_FALLBACK_URL);
      if (buffer) this.anthemPreviewCache.set(cacheKey, buffer);
    }
    if (!buffer) return null;
    return {
      buffer,
      gain: Number(audioConfig.get('anthemVolume') ?? 1.0),
      options: { maxDurationSec: 2.2 },
    };
  }

  async resolveBgmSuiteSample(ctx: AudioContext): Promise<ResolvedPreviewSample | null> {
    if (!this.cachedBgmPreviewBuffer) {
      this.cachedBgmPreviewBuffer = await fetchAudioBuffer(
        ctx,
        BGM_PREVIEW_SAMPLE_URL,
        BGM_PREVIEW_FALLBACK_URL
      );
    }
    const buffer = this.cachedBgmPreviewBuffer;
    if (!buffer) return null;
    return {
      buffer,
      gain: Number(audioConfig.get('bgmBusVolume') ?? 1.0),
      options: { offset: buffer.duration > 16 ? 12.0 : 0.0, maxDurationSec: 2.2 },
    };
  }
}
