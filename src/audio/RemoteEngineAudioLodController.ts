import {
  TurtleModemEngineSynth,
  type EngineSynthTelemetryInput,
} from './TurtleModemEngineSynth.ts';
import { getAudioContext, getMasterAudioInput } from './audioContext.ts';
import { getAudioSettings } from '../ui-core/config/audioConfig.ts';
import {
  SpatialAudioSource,
  listenerManager,
  type SpatialVector3Like,
} from './SpatialAudioSource.ts';
import { isDistanceCulled, getArenaAcousticScale } from './SpatialAttenuationEvaluator.ts';
import { getSpatialAttenuationProfile } from '../ui-core/config/spatialAttenuationProfiles.ts';
import type { CarStateView } from '../physics/RocketSimStateViews.ts';

export const MAX_AUDIBLE_REMOTE_ENGINES = 3;
const REMOTE_WAKE_HYSTERESIS_UU = 100;

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

export interface PlayerEngineControlsLike {
  throttle?: number;
  steer?: number;
  boost?: boolean;
  handbrake?: boolean;
}

export interface ArenaCarMeshLike {
  visible?: boolean;
  position?: SpatialVector3Like | null;
}

export interface MultiCarEngineUpdateInput {
  activeCar: number;
  effectiveNumCars: number;
  isAudibleActive: boolean;
  curBoost: number;
  activeCarMesh: ArenaCarMeshLike | null | undefined;
  arenaCars: ArrayLike<ArenaCarMeshLike | null | undefined> | null | undefined;
  playerControls: PlayerEngineControlsLike | null | undefined;
  resolveCarView: (carIndex: number) => CarStateView | null;
}

interface RemoteCandidate {
  carIndex: number;
  distanceUU: number;
  wasAwake: boolean;
}

/**
 * Manages the multi-car TurtleModemEngineSynth pool, 3D SpatialAudioSource buses,
 * 'engine_other' distance culling with wake hysteresis, and Top-K closest remote vehicle budget.
 */
export class RemoteEngineAudioLodController {
  public engineSynths: EngineSynthSlotEntry[] = [];
  private _scratchSynthParams: EngineSynthTelemetryInput | null = null;
  private readonly _remoteCandidates: RemoteCandidate[] = [];
  private readonly _awakeRemoteIndices: Set<number> = new Set();

  public resetAll(activeCarIndex: number = 0): void {
    this._awakeRemoteIndices.clear();
    for (let i = 0; i < this.engineSynths.length; i++) {
      const eng = this.engineSynths[i];
      const isPrimary = i === activeCarIndex;
      eng.wasDemoed = false;
      eng.prevForwardSpeed = 0;
      eng.dormant = !isPrimary;
      eng.distanceUU = 0;
      eng.synth?.setDormant?.(!isPrimary);
      eng.synth?.reset?.();
      eng.synth?.silence?.();
      eng.spatialBus?.setEnabled?.(false);
      if (isPrimary) {
        eng.synth?.playEntitySpawnSfx?.(false);
      }
    }
  }

  public countActiveAwakeSynths(): number {
    let count = 0;
    for (let i = 0; i < this.engineSynths.length; i++) {
      const s = this.engineSynths[i]?.synth;
      if (s?.active && !s.dormant) {
        count++;
      }
    }
    return count;
  }

  public updateFrame(input: MultiCarEngineUpdateInput): void {
    const {
      activeCar,
      effectiveNumCars,
      isAudibleActive,
      curBoost,
      activeCarMesh,
      arenaCars,
      playerControls,
      resolveCarView,
    } = input;

    const audioCtx = getAudioContext();
    const masterInput = getMasterAudioInput();

    while (this.engineSynths.length < Math.max(2, effectiveNumCars)) {
      const carIndex = this.engineSynths.length;
      const isSpatial = carIndex !== activeCar;
      let spatialBus: SpatialAudioSource | null = null;
      let synth: TurtleModemEngineSynth | null = null;
      if (audioCtx && masterInput) {
        if (isSpatial) {
          spatialBus = new SpatialAudioSource(audioCtx, masterInput, 'engine_other');
          synth = new TurtleModemEngineSynth(audioCtx, spatialBus.input, {
            isPrimaryListener: false,
          });
          synth.setDormant(true);
        } else {
          synth = new TurtleModemEngineSynth(audioCtx, masterInput, {
            isPrimaryListener: true,
          });
        }
      }
      this.engineSynths.push({
        synth,
        spatialBus,
        spatial: isSpatial,
        position: { x: 0, y: 0, z: 0 },
        wasDemoed: false,
        prevForwardSpeed: 0,
        dormant: isSpatial,
        distanceUU: 0,
      });
    }

    // Pass 1: Resolve positions & distances and select Top-K closest non-culled remote vehicles
    const engineProfile = getSpatialAttenuationProfile('engine_other');
    const acousticScale = getArenaAcousticScale();
    const minDistUU = engineProfile.minDistanceUU * acousticScale;
    const maxDistUU = engineProfile.maxDistanceUU * acousticScale;
    const wakeCutoffUU = Math.max(
      minDistUU + 50,
      maxDistUU - REMOTE_WAKE_HYSTERESIS_UU * acousticScale
    );
    const hasListener = Boolean(listenerManager.hasListener);
    const lx = listenerManager.position.x;
    const ly = listenerManager.position.y;
    const lz = listenerManager.position.z;

    this._remoteCandidates.length = 0;

    for (let i = 0; i < this.engineSynths.length; i++) {
      const entry = this.engineSynths[i];
      const isThisActiveCar = i === activeCar;
      const carView = i < effectiveNumCars ? resolveCarView(i) : null;
      if (!carView) {
        entry.distanceUU = Infinity;
        continue;
      }

      if (isThisActiveCar && activeCarMesh?.position) {
        entry.position.x = activeCarMesh.position.x;
        entry.position.y = activeCarMesh.position.y;
        entry.position.z = activeCarMesh.position.z;
      } else if (arenaCars?.[i]?.visible && arenaCars?.[i]?.position) {
        const meshPos = arenaCars[i]!.position!;
        entry.position.x = meshPos.x;
        entry.position.y = meshPos.y;
        entry.position.z = meshPos.z;
      } else {
        entry.position.x = carView.posX;
        entry.position.y = carView.posZ;
        entry.position.z = carView.posY;
      }

      if (isThisActiveCar) {
        entry.distanceUU = 0;
        continue;
      }

      const distUU = hasListener
        ? Math.hypot(entry.position.x - lx, entry.position.y - ly, entry.position.z - lz)
        : 0;
      entry.distanceUU = distUU;

      if (!isAudibleActive || carView.isDemoed) continue;

      const wasAwake = this._awakeRemoteIndices.has(i);
      const culledByDist = isDistanceCulled(distUU, engineProfile);
      const withinHysteresis = wasAwake ? !culledByDist : !culledByDist && distUU <= wakeCutoffUU;

      if (withinHysteresis) {
        this._remoteCandidates.push({
          carIndex: i,
          distanceUU: distUU,
          wasAwake,
        });
      }
    }

    if (this._remoteCandidates.length > 1) {
      this._remoteCandidates.sort((a, b) => {
        // Hysteresis bias (-60 UU) for already-awake remote synths to avoid rapid slot swapping
        const effA = a.distanceUU - (a.wasAwake ? 60 : 0);
        const effB = b.distanceUU - (b.wasAwake ? 60 : 0);
        return effA - effB;
      });
    }

    this._awakeRemoteIndices.clear();
    const budgetCount = Math.min(MAX_AUDIBLE_REMOTE_ENGINES, this._remoteCandidates.length);
    for (let k = 0; k < budgetCount; k++) {
      this._awakeRemoteIndices.add(this._remoteCandidates[k].carIndex);
    }

    // Pass 2: Route buses and update each vehicle's powertrain synth
    if (activeCar >= 0 && activeCar < this.engineSynths.length) {
      const targetEntry = this.engineSynths[activeCar];
      if (targetEntry && targetEntry.spatial) {
        const prevPrimaryEntry = this.engineSynths.find((e) => e && !e.spatial);
        if (prevPrimaryEntry && prevPrimaryEntry !== targetEntry) {
          const tmpSynth = prevPrimaryEntry.synth;
          const tmpBus = prevPrimaryEntry.spatialBus;
          prevPrimaryEntry.synth = targetEntry.synth;
          prevPrimaryEntry.spatialBus = targetEntry.spatialBus;
          prevPrimaryEntry.spatial = true;
          targetEntry.synth = tmpSynth;
          targetEntry.spatialBus = tmpBus;
          targetEntry.spatial = false;
        }
      }
    }

    const settings = getAudioSettings();
    const engineVol = (settings.engineVolume ?? 0.8) * (settings.masterVolume ?? 1.0);

    for (let i = 0; i < this.engineSynths.length; i++) {
      const entry = this.engineSynths[i];
      const isThisActiveCar = i === activeCar;
      const carView = i < effectiveNumCars ? resolveCarView(i) : null;
      const isCarValid = Boolean(carView);

      if (entry.synth) {
        entry.synth.isPrimaryListener = isThisActiveCar;
      }

      if (entry.spatial === isThisActiveCar && entry.synth?.outputNode && masterInput) {
        entry.spatial = !isThisActiveCar;
        try {
          entry.synth.outputNode.disconnect();
          if (entry.spatial) {
            if (!entry.spatialBus && audioCtx) {
              entry.spatialBus = new SpatialAudioSource(audioCtx, masterInput, 'engine_other');
            }
            if (entry.spatialBus) {
              entry.synth.outputNode.connect(entry.spatialBus.input);
            }
          } else {
            entry.synth.outputNode.connect(masterInput);
          }
        } catch (e) {
          console.warn('[RemoteEngineAudioLodController] Spatial audio routing update failed:', e);
        }
      }

      if (!isCarValid || !carView) {
        const nextDormant = !isThisActiveCar;
        if (!entry.dormant || !nextDormant) {
          entry.dormant = nextDormant;
          entry.synth?.setDormant?.(nextDormant);
          entry.synth?.silence();
          entry.spatialBus?.setEnabled(false);
        }
        continue;
      }

      const isDemoedNow = Boolean(carView.isDemoed);
      const isAwakeRemote = this._awakeRemoteIndices.has(i);
      const isDormant = !isThisActiveCar && (!isAudibleActive || isDemoedNow || !isAwakeRemote);
      const wasDormant = entry.dormant;
      entry.dormant = isDormant;

      if (isDormant && wasDormant) {
        entry.wasDemoed = isDemoedNow;
        entry.prevForwardSpeed = carView.forwardSpeed;
        continue;
      }

      if (isDormant && !wasDormant) {
        entry.wasDemoed = isDemoedNow;
        entry.prevForwardSpeed = carView.forwardSpeed;
        entry.synth?.setDormant?.(true);
        entry.spatialBus?.setEnabled(false);
        continue;
      }

      if (!isDormant && wasDormant) {
        entry.synth?.setDormant?.(false);
      }

      if (entry.wasDemoed && !isDemoedNow) {
        entry.synth?.resetToZeroSpeedState?.();
        if (isThisActiveCar || !isDormant) {
          entry.synth?.playEntitySpawnSfx?.(false);
        }
      }
      entry.wasDemoed = isDemoedNow;

      const forwardSpeed = carView.forwardSpeed;
      const speedUU = Math.hypot(carView.velX, carView.velY, carView.velZ);
      const isOnGround = Boolean(
        carView.isOnGround ||
        carView.getWheelContact(0) ||
        carView.getWheelContact(1) ||
        carView.getWheelContact(2) ||
        carView.getWheelContact(3)
      );
      const alive = !isDemoedNow;
      const audible = isAudibleActive && !isDormant;

      let throttleInput = 0;
      let steerInput = 0;
      let handbrakeInput = false;
      let isBoostingNow = Boolean(carView.isBoosting && !isDemoedNow);
      if (isThisActiveCar && playerControls) {
        const rawThrottle = Number(playerControls.throttle) || 0;
        const boostActive = Boolean(playerControls.boost && curBoost > 0.001);
        isBoostingNow = boostActive || isBoostingNow;
        throttleInput = boostActive ? 1 : rawThrottle;
        steerInput = Number(playerControls.steer) || 0;
        handbrakeInput = Boolean(playerControls.handbrake);
      } else {
        const deltaFwd = forwardSpeed - entry.prevForwardSpeed;
        if (carView.isBoosting) {
          throttleInput = 1;
        } else if (Math.abs(deltaFwd) > 1.5) {
          throttleInput = deltaFwd > 0 ? 1 : -1;
        }
        const wheelSteer = Math.abs(carView.getWheelSteerAngle(0));
        steerInput = Math.min(1, wheelSteer / 0.12);
      }
      entry.prevForwardSpeed = forwardSpeed;
      const surfaceUpZ = Number.isFinite(carView.upZ) ? carView.upZ : 1.0;

      if (entry.spatialBus) {
        if (!isDormant) {
          entry.spatialBus.setPosition(entry.position);
        }
        entry.spatialBus.setEnabled(alive && audible);
      }

      if (entry.synth) {
        entry.synth.setVolume(engineVol);
        if (!this._scratchSynthParams) {
          this._scratchSynthParams = {
            speedUU: 0,
            forwardSpeedUU: 0,
            forwardSpeed: 0,
            throttleInput: 0,
            steerInput: 0,
            handbrakeInput: false,
            isBoosting: false,
            isOnGround: true,
            surfaceUpZ: 1.0,
            alive: true,
            audible: true,
            dormant: false,
            distanceUU: 0,
          };
        }
        this._scratchSynthParams.speedUU = speedUU;
        this._scratchSynthParams.forwardSpeedUU = forwardSpeed;
        this._scratchSynthParams.forwardSpeed = forwardSpeed;
        this._scratchSynthParams.throttleInput = throttleInput;
        this._scratchSynthParams.steerInput = steerInput;
        this._scratchSynthParams.handbrakeInput = handbrakeInput;
        this._scratchSynthParams.isBoosting = isBoostingNow;
        this._scratchSynthParams.isOnGround = isOnGround;
        this._scratchSynthParams.surfaceUpZ = surfaceUpZ;
        this._scratchSynthParams.alive = alive;
        this._scratchSynthParams.audible = audible;
        this._scratchSynthParams.dormant = isDormant;
        this._scratchSynthParams.distanceUU = entry.distanceUU ?? 0;
        entry.synth.update(this._scratchSynthParams);
      }
    }
  }

  public dispose(): void {
    this._awakeRemoteIndices.clear();
    this._remoteCandidates.length = 0;
    for (const eng of this.engineSynths) {
      eng.synth?.dispose?.();
      eng.spatialBus?.dispose?.();
    }
    this.engineSynths.length = 0;
  }
}
