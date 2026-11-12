import { audioConfig, registerAudioDiagnosticsProvider } from '../ui-core/config/audioConfig.ts';
import { subscribeEngineAudioTuningConfig } from '../ui-core/config/engineAudioConfig.ts';
import { spatialAttenuationProfiles } from '../ui-core/config/spatialAttenuationProfiles.ts';
import { getAudioSlotPool, registerAudioEngine } from './audioContext.ts';
import { VehicleAudioManager } from './VehicleAudioManager.ts';
import type {
  PhysicsImpactAudioEvent,
  VehicleAudioUpdateContext,
} from './vehicleAudioContracts.ts';
import { SignalAudioEngine } from './SignalAudioEngine.ts';
import { loadAudioAssets, applyBoostVariationBuffers } from './audioAssetLoader.ts';
import {
  stadiumSpatialAudioEngine,
  type StadiumSpatialAudioEngine,
} from './StadiumSpatialAudioEngine.ts';
import {
  AudioMenuPreviewPlayer,
  type IncidentAudioBuffers,
  type PreviewAudioBufferOptions,
} from './AudioMenuPreviewPlayer.ts';
import {
  applyWasmBallCueToEmitter,
  syncWasmAudioDirectorConfig,
  syncWasmAudioListenerState,
  type WasmAudioPhysicsModule,
  type WasmListenerSyncInput,
} from './WasmAudioDirectorBridge.ts';
import { BallAudioPort } from './BallAudioPort.ts';
import { dispatchWasmOneShotSlots } from './wasmAudioOneShotDispatcher.ts';
import { INCIDENT_EVENT_TYPES, PHYSICS_EVENT_TYPES } from '../physics/RocketSimConstants.ts';
import './audioDebug.ts';

export type { PhysicsImpactAudioEvent, PreviewAudioBufferOptions };

function createEmptyIncidentBuffers(): IncidentAudioBuffers {
  return {
    ballHit: [],
    vehicleAccent: null,
    vehicleDetail: [],
    sidewallHit: [],
    carDemo: [],
    carCollision: null,
    goalpost: null,
    boostCollect: null,
    goalScored: null,
    supersonic: null,
    jump: [],
    doubleJump: [],
    dodge: [],
    reset: null,
    wheelImpact: [],
    groundHit: [],
    crossbarPing: [],
    crossbarPingSmall: [],
    boostStart: null,
    boostRelease: null,
    supersonicEnter: [],
  };
}

export class GameAudioEngineFacade {
  _lastBoostVariationKey: string;
  ballEngine: BallAudioPort;
  incidentEngine: {
    buffers: IncidentAudioBuffers;
    setBuffers: (bufs: Partial<IncidentAudioBuffers>) => void;
    handleEvent: (event: PhysicsImpactAudioEvent | null | undefined, camera?: unknown) => void;
  };
  loaded: boolean;
  loading: boolean;
  readonly previewPlayer: AudioMenuPreviewPlayer;
  signalEngine: SignalAudioEngine;
  stadiumSpatialEngine: StadiumSpatialAudioEngine;
  vehicleManager: VehicleAudioManager;
  private _lastSyncedWasmModule: WasmAudioPhysicsModule | null = null;
  private _wasmConfigDirty = true;

  constructor() {
    const vehicleManager = new VehicleAudioManager();
    const signalEngine = new SignalAudioEngine();
    const stadiumSpatialEngine = stadiumSpatialAudioEngine;

    this.ballEngine = new BallAudioPort();

    const incidentBuffers = createEmptyIncidentBuffers();
    this.incidentEngine = {
      buffers: incidentBuffers,
      setBuffers: (bufs: Partial<IncidentAudioBuffers>) => {
        this.incidentEngine.buffers = { ...this.incidentEngine.buffers, ...bufs };
      },
      handleEvent: (event: PhysicsImpactAudioEvent | null | undefined) => {
        if (!event) return;
        const t = event.type;
        if (
          t === INCIDENT_EVENT_TYPES.CAR_JUMP ||
          t === INCIDENT_EVENT_TYPES.CAR_DOUBLE_JUMP ||
          t === INCIDENT_EVENT_TYPES.CAR_DODGE ||
          t === PHYSICS_EVENT_TYPES.CAR_ACTION ||
          t === INCIDENT_EVENT_TYPES.CAR_SUPERSONIC_ENTER ||
          t === INCIDENT_EVENT_TYPES.CAR_BOOST_START ||
          t === INCIDENT_EVENT_TYPES.CAR_BOOST_STOP ||
          t === INCIDENT_EVENT_TYPES.FLIP_RESET_GAINED ||
          t === 'wheel_impact' ||
          t === 0x12
        ) {
          this.vehicleManager.handleCarEvent(event);
          return;
        }
        const pool = getAudioSlotPool();
        if (!pool) return;
        const bufs = this.incidentEngine.buffers;
        if (t === INCIDENT_EVENT_TYPES.CAR_BALL_HIT && bufs.ballHit[0]) {
          pool.playBuffer(bufs.ballHit[0], { position: event, category: 'car_ball_hit' });
        } else if (
          (t === INCIDENT_EVENT_TYPES.CAR_CAR_BUMP ||
            t === INCIDENT_EVENT_TYPES.CAR_CAR_COLLISION) &&
          (bufs.vehicleDetail[0] || bufs.carCollision)
        ) {
          pool.playBuffer(bufs.vehicleDetail[0] || bufs.carCollision, {
            position: event,
            category: 'car_bump',
          });
        } else if (
          t === INCIDENT_EVENT_TYPES.CAR_CAR_DEMO &&
          (bufs.carDemo[0] || bufs.carCollision)
        ) {
          pool.playBuffer(bufs.carDemo[0] || bufs.carCollision, {
            position: event,
            category: 'demolish',
          });
        } else if (t === INCIDENT_EVENT_TYPES.BALL_GOALPOST_HIT && bufs.crossbarPing[0]) {
          pool.playBuffer(bufs.crossbarPing[0], {
            position: event,
            category: 'goalpost_ping_large',
          });
        } else if (t === INCIDENT_EVENT_TYPES.BALL_WORLD_HIT && bufs.groundHit[0]) {
          pool.playBuffer(bufs.groundHit[0], { position: event, category: 'world_surface' });
        } else if (t === INCIDENT_EVENT_TYPES.BOOST_PICKUP && bufs.boostCollect) {
          pool.playBuffer(bufs.boostCollect, { position: event, category: 'boost_pickup' });
        } else if (t === INCIDENT_EVENT_TYPES.GOAL_SCORED && bufs.goalScored) {
          pool.playBuffer(bufs.goalScored, { position: event, category: 'goal_explosion' });
        }
      },
    };

    this.vehicleManager = vehicleManager;
    this.signalEngine = signalEngine;
    this.stadiumSpatialEngine = stadiumSpatialEngine;
    this.stadiumSpatialEngine.init();
    this.previewPlayer = new AudioMenuPreviewPlayer({
      preload: () => this.preload(),
    });

    this.loading = false;
    this.loaded = false;
    this._lastBoostVariationKey = `${audioConfig.get('boostStartVariation')}|${audioConfig.get('boostLoopVariation')}|${audioConfig.get('boostEndVariation')}`;

    registerAudioEngine(this);
    registerAudioDiagnosticsProvider({
      previewBoostVariation: (variationId, phase) =>
        this.previewPlayer.previewBoostVariation(variationId, phase),
      previewAudioDetail: (detailKey) => this.previewPlayer.previewAudioDetail(detailKey),
      stopAudioDetailPreview: () => this.previewPlayer.stopAudioDetailPreview(),
    });

    audioConfig.subscribe(() => {
      this._wasmConfigDirty = true;
      const spatialEnabled = audioConfig.get('spatialAudio') !== false;
      const panModel: PanningModelType = spatialEnabled
        ? audioConfig.get('spatialPanningModel') || 'equalpower'
        : 'equalpower';
      this.vehicleManager.updatePanningModel(panModel);
      this.ballEngine.updatePanningModel(panModel);
      const slotPool = getAudioSlotPool();
      if (slotPool) slotPool.updatePanningModel(panModel);

      const nextBoostKey = `${audioConfig.get('boostStartVariation')}|${audioConfig.get('boostLoopVariation')}|${audioConfig.get('boostEndVariation')}`;
      if (nextBoostKey !== this._lastBoostVariationKey) {
        this._lastBoostVariationKey = nextBoostKey;
        const s = audioConfig.get('boostStartVariation');
        const l = audioConfig.get('boostLoopVariation');
        const e = audioConfig.get('boostEndVariation');
        const selfIdx = this.vehicleManager.activeCarIndex ?? 0;
        this.setCarBoostAudioVariation(selfIdx, s && s === l && l === e ? String(s) : null);
      }

      if (this.loaded) {
        applyBoostVariationBuffers(this);
        this.previewPlayer.syncBoostBuffers(this.vehicleManager.buffers);
      }
    });
    subscribeEngineAudioTuningConfig(() => {
      this._wasmConfigDirty = true;
    });
    spatialAttenuationProfiles.subscribe(() => {
      this._wasmConfigDirty = true;
    });
  }

  previewBoostVariation(variationId = 'rush', phase = 'start'): void {
    if (!variationId) return;
    this.previewPlayer.previewBoostVariation(variationId, phase);
  }

  async preload(
    onProgress: ((completed: number, total: number, url: string) => void) | null = null
  ) {
    if (this.loaded || this.loading || typeof window === 'undefined') return;
    this.loading = true;
    try {
      this.stadiumSpatialEngine.prewarm();
      await loadAudioAssets(this, onProgress);
      this.previewPlayer.syncLoadedBuffers(
        this.incidentEngine.buffers,
        this.vehicleManager.buffers,
        this.signalEngine.signalBuffers,
        this.ballEngine.ballRollingBuffer,
        this.ballEngine.ballFlyingBuffer
      );
      this.loaded = true;
    } finally {
      this.loading = false;
    }
  }

  /**
   * Executes a single zero-copy WASM `_physics_stepAudioDirector` pass for the frame,
   * binding `HEAPF32` / `HEAPU32` over `AudioFrameCuePod` to update ball loops and
   * dispatch discrete one-shot cues. Returns the word offset of `AudioFrameCuePod` in `HEAPF32`/`HEAPU32`.
   */
  stepWasmAudioDirector(
    mod: WasmAudioPhysicsModule | null | undefined,
    dtSec: number,
    listenerInput: WasmListenerSyncInput
  ): number {
    if (!mod || typeof mod._physics_stepAudioDirector !== 'function') return 0;

    if (this._wasmConfigDirty || this._lastSyncedWasmModule !== mod) {
      syncWasmAudioDirectorConfig(mod);
      this._lastSyncedWasmModule = mod;
      this._wasmConfigDirty = false;
    }

    syncWasmAudioListenerState(mod, listenerInput);
    const cuePtr = mod._physics_stepAudioDirector(dtSec);
    if (!cuePtr) return 0;

    const cueWordBase = cuePtr >>> 2;
    const f32 = mod.HEAPF32;
    const u32 = mod.HEAPU32;

    applyWasmBallCueToEmitter(this.ballEngine, f32, cueWordBase, listenerInput.isAudibleActive);
    if (listenerInput.isAudibleActive) {
      dispatchWasmOneShotSlots(u32, f32, cueWordBase, this.incidentEngine, this.vehicleManager);
    }

    return cueWordBase;
  }

  resetWasmAudioDirector(mod: WasmAudioPhysicsModule | null | undefined, activeCarIndex = 0): void {
    if (mod && typeof mod._physics_resetAudioDirector === 'function') {
      mod._physics_resetAudioDirector(activeCarIndex);
    }
  }

  handleEvent(event: PhysicsImpactAudioEvent | null | undefined, camera: unknown = null) {
    if (!event) return;
    this.incidentEngine.handleEvent(event, camera);
  }

  updateVehicles(context: VehicleAudioUpdateContext) {
    this.vehicleManager.update(context);
  }

  setCarBoostAudioVariation(carIndex: number, variationId: string | null = null) {
    if (!Number.isFinite(carIndex) || carIndex < 0) return;
    this.vehicleManager.setCarBoostAudioVariation(carIndex, variationId);
  }

  handleSignal(signalType: string) {
    if (!signalType) return;
    this.signalEngine.handleSignal(signalType);
  }

  play(key: string, volMult: number = 1.0, minInterval: number = 0) {
    if (!key) return;
    this.signalEngine.play(key, volMult, minInterval);
  }

  silenceAll() {
    this.ballEngine.silenceAll();
    this.vehicleManager.silenceAll();
    const pool = getAudioSlotPool();
    if (pool) pool.silenceAll();
  }

  resetIncidentDebounceState() {
    if (this.vehicleManager._lastFlipResetMsByCar) {
      this.vehicleManager._lastFlipResetMsByCar.clear();
    }
    this.vehicleManager._lastBoostEdgeMsByCar.clear();
    this.vehicleManager._lastJumpActionMsByCar.clear();
    this.vehicleManager._lastSupersonicEnterMsByCar.clear();
    this.vehicleManager._lastWheelLandingMsByCar.clear();
    this.vehicleManager._landingStateByCar.clear();
  }
}

export const gameAudio = new GameAudioEngineFacade();
