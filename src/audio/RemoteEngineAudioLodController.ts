/**
 * RemoteEngineAudioLodController.ts
 * Multi-car engine voice allocation: wakes the closest remote engines, keeps their spatial buses
 * positioned, and forwards Rust `CarAcousticLoopPod` values (or the local bench path) per slot.
 */

import { getSpatialAttenuationProfile } from '../ui-core/config/spatialAttenuationProfiles.ts';
import { getAudioSettings } from '../ui-core/config/audioConfig.ts';
import { getAudioContext, getMasterAudioInput } from './audioContext.ts';
import {
  SpatialAudioSource,
  listenerManager,
  type SpatialVector3Like,
} from './SpatialAudioSource.ts';
import { TurtleModemEngineSynth } from './TurtleModemEngineSynth.ts';
import type { CarStateView } from '../physics/RocketSimStateViews.ts';
import type { WasmCarAcousticCue } from './wasmCarCueReader.ts';

export const MAX_AUDIBLE_REMOTE_ENGINES = 3;

export interface EngineSynthSlotEntry {
  synth: TurtleModemEngineSynth | null;
  spatialBus: SpatialAudioSource | null;
  spatial: boolean;
  position: { x: number; y: number; z: number };
  wasDemoed: boolean;
  prevForwardSpeed: number;
  dormant?: boolean;
  distanceUU?: number;
}

export interface MultiCarEngineUpdateInput {
  activeCar: number;
  effectiveNumCars: number;
  isAudibleActive: boolean;
  curBoost: number;
  carCues?: readonly WasmCarAcousticCue[] | null;
  activeCarMesh: { visible?: boolean; position?: SpatialVector3Like | null } | null | undefined;
  arenaCars:
    | ArrayLike<{ visible?: boolean; position?: SpatialVector3Like | null } | null | undefined>
    | null
    | undefined;
  playerControls:
    { throttle?: number; steer?: number; boost?: boolean; handbrake?: boolean } | null | undefined;
  resolveCarView: (carIndex: number) => CarStateView | null;
}

export class RemoteEngineAudioLodController {
  engineSynths: EngineSynthSlotEntry[] = [];
  private _awake = new Set<number>();

  resetAll(activeCar = 0): void {
    this._awake.clear();
    for (let i = 0; i < this.engineSynths.length; i++) {
      const e = this.engineSynths[i];
      const prim = i === activeCar;
      e.wasDemoed = false;
      e.prevForwardSpeed = 0;
      e.dormant = !prim;
      e.distanceUU = 0;
      e.synth?.setDormant?.(!prim);
      e.synth?.reset?.();
      e.synth?.silence?.();
      e.spatialBus?.setEnabled?.(false);
      if (prim) e.synth?.playEntitySpawnSfx?.(false);
    }
  }

  countActiveAwakeSynths(): number {
    let c = 0;
    for (const e of this.engineSynths) if (e?.synth?.active && !e.synth.dormant) c++;
    return c;
  }

  updateFrame(inp: MultiCarEngineUpdateInput): void {
    const {
      activeCar,
      effectiveNumCars,
      isAudibleActive,
      curBoost,
      activeCarMesh,
      arenaCars,
      playerControls,
      resolveCarView,
      carCues = null,
    } = inp;
    const ctx = getAudioContext();
    const master = getMasterAudioInput();
    while (this.engineSynths.length < Math.max(2, effectiveNumCars)) {
      const idx = this.engineSynths.length;
      const sp = idx !== activeCar;
      const bus = ctx && master && sp ? new SpatialAudioSource(ctx, master, 'engine_other') : null;
      const synth =
        ctx && master
          ? new TurtleModemEngineSynth(ctx, bus ? bus.input : master, { isPrimaryListener: !sp })
          : null;
      if (bus) bus.distanceGainEnabled = false;
      if (synth && sp) synth.setDormant(true);
      this.engineSynths.push({
        synth,
        spatialBus: bus,
        spatial: sp,
        position: { x: 0, y: 0, z: 0 },
        wasDemoed: false,
        prevForwardSpeed: 0,
        dormant: sp,
        distanceUU: 0,
      });
    }

    const prof = getSpatialAttenuationProfile('engine_other');
    const maxD = prof.maxDistanceUU;
    const wakeD = Math.max(prof.minDistanceUU + 50, maxD - 100);
    const lp = listenerManager.position;
    const cands: Array<{ idx: number; dist: number; awake: boolean }> = [];

    for (let i = 0; i < this.engineSynths.length; i++) {
      const e = this.engineSynths[i];
      const cv = i < effectiveNumCars ? resolveCarView(i) : null;
      if (!cv) {
        e.distanceUU = Infinity;
        continue;
      }
      const mp =
        i === activeCar
          ? activeCarMesh?.position
          : arenaCars?.[i]?.visible
            ? arenaCars?.[i]?.position
            : null;
      e.position.x = mp ? mp.x : cv.posX;
      e.position.y = mp ? mp.y : cv.posZ;
      e.position.z = mp ? mp.z : cv.posY;
      if (i === activeCar) {
        e.distanceUU = 0;
        continue;
      }
      const dist = listenerManager.hasListener
        ? Math.hypot(e.position.x - lp.x, e.position.y - lp.y, e.position.z - lp.z)
        : 0;
      e.distanceUU = dist;
      if (!isAudibleActive || cv.isDemoed) continue;
      const awake = this._awake.has(i);
      if (dist <= (awake ? maxD : wakeD)) cands.push({ idx: i, dist, awake });
    }

    cands.sort((a, b) => a.dist - (a.awake ? 60 : 0) - (b.dist - (b.awake ? 60 : 0)));
    this._awake.clear();
    for (let k = 0; k < Math.min(MAX_AUDIBLE_REMOTE_ENGINES, cands.length); k++)
      this._awake.add(cands[k].idx);

    const s = getAudioSettings();
    const vol = (s.engineVolume ?? 0.8) * (s.masterVolume ?? 1.0);

    for (let i = 0; i < this.engineSynths.length; i++) {
      const e = this.engineSynths[i];
      const prim = i === activeCar;
      const cv = i < effectiveNumCars ? resolveCarView(i) : null;
      if (e.synth) e.synth.isPrimaryListener = prim;
      if (!cv) {
        e.dormant = !prim;
        e.synth?.setDormant?.(!prim);
        e.synth?.silence();
        e.spatialBus?.setEnabled(false);
        continue;
      }
      const cue = carCues?.[i] ?? null;
      const demo = Boolean(cv.isDemoed);
      const dormantByCue = cue ? (cue.packedFlags & (1 << 1)) !== 0 : false;
      const dorm = cue
        ? dormantByCue || !isAudibleActive
        : !prim && (!isAudibleActive || demo || !this._awake.has(i));
      e.dormant = dorm;
      e.synth?.setDormant?.(dorm);
      if (dorm) {
        e.wasDemoed = demo;
        e.prevForwardSpeed = cv.forwardSpeed;
        e.spatialBus?.setEnabled(false);
        continue;
      }
      if (e.wasDemoed && !demo) {
        e.synth?.resetToZeroSpeedState?.();
        e.synth?.playEntitySpawnSfx?.(false);
      }
      e.wasDemoed = demo;
      const fwd = cv.forwardSpeed;
      const boost = Boolean(
        (cv.isBoosting && !demo) || (prim && playerControls?.boost && curBoost > 0.001)
      );
      const thr =
        prim && playerControls
          ? boost
            ? 1
            : Number(playerControls.throttle) || 0
          : boost
            ? 1
            : Math.abs(fwd - e.prevForwardSpeed) > 1.5
              ? fwd > e.prevForwardSpeed
                ? 1
                : -1
              : 0;
      e.prevForwardSpeed = fwd;
      e.spatialBus?.setPosition(e.position);
      e.spatialBus?.setEnabled(!demo && isAudibleActive);
      e.synth?.setVolume(vol);
      if (cue) {
        e.synth?.updateFromWasmCue(cue, Math.hypot(cv.velX, cv.velY, cv.velZ));
      } else {
        e.synth?.update({
          speedUU: Math.hypot(cv.velX, cv.velY, cv.velZ),
          forwardSpeedUU: fwd,
          throttleInput: thr,
          isBoosting: boost,
          isOnGround: Boolean(cv.isOnGround || cv.getWheelContact(0)),
          alive: !demo,
          audible: isAudibleActive,
          dormant: false,
          distanceUU: e.distanceUU ?? 0,
        });
      }
    }
  }

  dispose(): void {
    this._awake.clear();
    for (const e of this.engineSynths) {
      e.synth?.dispose?.();
      e.spatialBus?.dispose?.();
    }
    this.engineSynths.length = 0;
  }
}
