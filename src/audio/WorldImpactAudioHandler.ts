import { audioConfig } from '../ui-core/config/audioConfig.ts';
import { getAudioSlotPool } from './audioContext.ts';
import { SURFACE_SUBTYPES } from '../physics/RocketSimConstants.ts';
import {
  calibrateWorldSurfaceModulation,
  calibrateGoalpostPingModulation,
  type PhysicsImpactAudioEvent,
} from './IncidentSpatialModulator.ts';

export type { PhysicsImpactAudioEvent };

export interface WorldImpactAudioBuffers {
  groundHit?: Array<AudioBuffer | null>;
  ballHit?: Array<AudioBuffer | null>;
  sidewallHit?: Array<AudioBuffer | null>;
  crossbarPing?: Array<AudioBuffer | null>;
  crossbarPingSmall?: Array<AudioBuffer | null>;
  goalpost?: AudioBuffer | null;
}

export class WorldImpactAudioHandler {
  buffers: WorldImpactAudioBuffers;
  lastBallWorldHitTimestamp: number;
  lastCrossbarPingIdx: number;
  lastCrossbarPingSmallIdx: number;
  lastGoalpostHitTimestamp: number;
  lastGroundHitSoundIdx: number;
  lastSidewallHitSoundIdx: number;

  constructor(buffers: WorldImpactAudioBuffers = {}) {
    this.buffers = buffers;
    this.lastBallWorldHitTimestamp = 0;
    this.lastGoalpostHitTimestamp = 0;
    this.lastGroundHitSoundIdx = -1;
    this.lastSidewallHitSoundIdx = -1;
    this.lastCrossbarPingIdx = -1;
    this.lastCrossbarPingSmallIdx = -1;
  }

  setBuffers(bufs: WorldImpactAudioBuffers): void {
    this.buffers = bufs;
  }

  handleBallWorldHit(
    event: PhysicsImpactAudioEvent | null | undefined,
    camera: unknown = null
  ): void {
    if (!event) return;

    if (
      event.isCrossbar ||
      event.surfaceTag === SURFACE_SUBTYPES.GOALPOST ||
      event.surfaceTag === SURFACE_SUBTYPES.CROSSBAR
    ) {
      this.handleBallGoalpostHit(event, camera);
      return;
    }

    const now = performance.now();
    const cooldownMs = audioConfig.get('incidentCooldownMs');
    if (now - this.lastBallWorldHitTimestamp < cooldownMs) return;

    // Audio shielding against weak rolling buzz
    const floorThreshold = audioConfig.get('ballGroundHitThreshold');
    const wallThreshold = audioConfig.get('ballWallHitThreshold');
    const isFloorSurface = event.surfaceTag === 1 || event.surfaceTag === SURFACE_SUBTYPES.FLOOR;
    const threshold = isFloorSurface ? floorThreshold : wallThreshold;
    const impactVal =
      typeof event.normalRelVel === 'number' && Number.isFinite(event.normalRelVel)
        ? event.normalRelVel
        : null;
    if (impactVal !== null && impactVal < threshold) return;

    this.lastBallWorldHitTimestamp = now;
    const pool = getAudioSlotPool();
    if (!pool) return;

    const master = audioConfig.get('masterVolume');
    const layerVol = audioConfig.get('ballCollisionVolume');

    // 1. Floor / Ground pitch: Normal collision using custom 1, 2, 3 (strictly NEVER vehicle-body-04)
    if (isFloorSurface) {
      const groundList =
        this.buffers.groundHit && this.buffers.groundHit.length > 0
          ? this.buffers.groundHit
          : this.buffers.ballHit
            ? this.buffers.ballHit.slice(0, 3)
            : [];
      if (!groundList || groundList.length === 0) return;
      let idx = Math.floor(Math.random() * groundList.length);
      if (groundList.length > 1 && idx === this.lastGroundHitSoundIdx) {
        idx = (idx + 1) % groundList.length;
      }
      this.lastGroundHitSoundIdx = idx;
      const mod = calibrateWorldSurfaceModulation(event, 'floor', floorThreshold);
      const floorVol = audioConfig.get('ballFloorHitVolume');
      const volume = Math.max(
        0,
        Math.min(5.0, floorVol * layerVol * master * mod.volumeGainMultiplier)
      );
      pool.playBuffer(groundList[idx], {
        volume,
        position: event,
        category: mod.category,
        distanceRadiusScale: mod.distanceRadiusScale,
        playbackRate: mod.playbackRate,
        priority: mod.priority,
      });
      return;
    }

    // 2. Field Net / Sidewalls / Ceiling / Backboard / Corner 45
    const isNetSurface =
      event.surfaceTag === SURFACE_SUBTYPES.SIDE_WALL ||
      event.surfaceTag === SURFACE_SUBTYPES.CEILING ||
      event.surfaceTag === SURFACE_SUBTYPES.BACKBOARD ||
      event.surfaceTag === SURFACE_SUBTYPES.CORNER_45 ||
      event.surfaceTag === 3 ||
      event.surfaceTag === 2 ||
      event.surfaceTag === 4 ||
      event.surfaceTag === 5;

    if (isNetSurface) {
      const sidewallList =
        this.buffers.sidewallHit && this.buffers.sidewallHit.length > 0
          ? this.buffers.sidewallHit
          : this.buffers.groundHit && this.buffers.groundHit.length > 0
            ? this.buffers.groundHit
            : this.buffers.ballHit?.slice(0, 3);
      if (sidewallList && sidewallList.length > 0) {
        let netIdx = Math.floor(Math.random() * sidewallList.length);
        if (sidewallList.length > 1 && netIdx === this.lastSidewallHitSoundIdx) {
          netIdx = (netIdx + 1) % sidewallList.length;
        }
        this.lastSidewallHitSoundIdx = netIdx;
        const mod = calibrateWorldSurfaceModulation(event, 'net', wallThreshold);
        const netVol = audioConfig.get('ballNetHitVolume');
        const netVolume = Math.max(
          0,
          Math.min(5.0, netVol * layerVol * master * mod.volumeGainMultiplier)
        );
        pool.playBuffer(sidewallList[netIdx], {
          volume: netVolume,
          position: event,
          category: mod.category,
          distanceRadiusScale: mod.distanceRadiusScale,
          playbackRate: mod.playbackRate,
          priority: mod.priority,
        });
      }
      return;
    }

    // 3. Ramps & Transition Curves
    const mod = calibrateWorldSurfaceModulation(event, 'ramp', wallThreshold);
    const rampVol = audioConfig.get('ballRampHitVolume');
    const volume = Math.max(
      0,
      Math.min(5.0, rampVol * layerVol * master * mod.volumeGainMultiplier)
    );
    const bufList =
      this.buffers.groundHit && this.buffers.groundHit.length > 0
        ? this.buffers.groundHit
        : this.buffers.ballHit
          ? this.buffers.ballHit.slice(0, 3)
          : this.buffers.sidewallHit;
    if (bufList && bufList.length > 0) {
      const idx = Math.floor(Math.random() * bufList.length);
      pool.playBuffer(bufList[idx], {
        volume,
        position: event,
        category: mod.category,
        distanceRadiusScale: mod.distanceRadiusScale,
        playbackRate: mod.playbackRate,
        priority: mod.priority,
      });
    }
  }

  handleBallGoalpostHit(event: PhysicsImpactAudioEvent, _camera: unknown = null): void {
    const now = performance.now();
    const cooldownMs = audioConfig.get('goalpostHitCooldownMs');
    if (now - this.lastGoalpostHitTimestamp < cooldownMs) return;

    const threshold = audioConfig.get('goalpostHitThreshold');
    const impactVal = Math.abs(event.normalRelVel || event.impulse || event.speed || 0);
    if (impactVal < threshold) return;

    this.lastGoalpostHitTimestamp = now;
    const pool = getAudioSlotPool();
    if (!pool) return;

    const mod = calibrateGoalpostPingModulation(event, threshold);
    const { isPingLarge } = mod;

    let bufList = isPingLarge ? this.buffers.crossbarPing : this.buffers.crossbarPingSmall;
    if (!bufList || bufList.length === 0) {
      bufList = this.buffers.crossbarPing || this.buffers.crossbarPingSmall;
    }

    let postBuf: AudioBuffer | null = null;
    if (bufList && bufList.length > 0) {
      const lastIdx = isPingLarge ? this.lastCrossbarPingIdx : this.lastCrossbarPingSmallIdx;
      let idx = Math.floor(Math.random() * bufList.length);
      if (bufList.length > 1 && idx === lastIdx) {
        idx = (lastIdx + 1 + Math.floor(Math.random() * (bufList.length - 1))) % bufList.length;
      }
      if (isPingLarge) {
        this.lastCrossbarPingIdx = idx;
      } else {
        this.lastCrossbarPingSmallIdx = idx;
      }
      postBuf = bufList[idx];
    } else {
      postBuf = this.buffers.goalpost || (this.buffers.ballHit && this.buffers.ballHit[3]) || null;
    }
    if (!postBuf) return;

    const master = audioConfig.get('masterVolume') ?? 1.0;
    const postVol = isPingLarge
      ? (audioConfig.get('goalpostHitVolume') ?? 1.0)
      : (audioConfig.get('goalpostSmallHitVolume') ?? audioConfig.get('goalpostHitVolume') ?? 1.0);
    const layerVol = audioConfig.get('ballCollisionVolume') ?? 1.0;
    const volume = Math.max(
      0,
      Math.min(5.0, postVol * layerVol * master * mod.volumeGainMultiplier)
    );

    pool.playBuffer(postBuf, {
      volume,
      position: event,
      category: mod.category,
      distanceRadiusScale: mod.distanceRadiusScale,
      playbackRate: mod.playbackRate,
      priority: mod.priority,
    });
  }
}
