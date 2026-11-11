import { audioConfig, registerAudioDiagnosticsProvider } from '../ui-core/config/audioConfig.ts';
import { getAudioSlotPool, registerAudioEngine } from './audioContext.ts';
import {
  VehicleAudioManager,
  type PhysicsImpactAudioEvent,
  type VehicleAudioUpdateContext,
} from './VehicleAudioManager.ts';
import { SignalAudioEngine } from './SignalAudioEngine.ts';
import {
  loadAudioAssets,
  applyBoostVariationBuffers,
  type BallAudioBuffers,
} from './audioAssetLoader.ts';
import {
  stadiumSpatialAudioEngine,
  type StadiumSpatialAudioEngine,
} from './StadiumSpatialAudioEngine.ts';
import {
  AudioMenuPreviewPlayer,
  type IncidentAudioBuffers,
  type PreviewAudioBufferOptions,
} from './AudioMenuPreviewPlayer.ts';
import type { CameraTransformLike } from './SpatialAudioSource.ts';
import { INCIDENT_EVENT_TYPES, PHYSICS_EVENT_TYPES } from '../physics/RocketSimConstants.ts';
import './audioDebug.ts';

export type { PhysicsImpactAudioEvent, PreviewAudioBufferOptions };

export interface BallMeshOrViewLike {
  position?: { x: number; y: number; z: number } | null;
  posX?: number;
  posY?: number;
  posZ?: number;
  velX?: number;
  velY?: number;
  velZ?: number;
  velocity?: { x?: number; y?: number; z?: number } | null;
}

export interface BallPhysicsStateLike {
  ballState?: {
    posX?: number;
    posY?: number;
    posZ?: number;
    velX?: number;
    velY?: number;
    velZ?: number;
  } | null;
  ballOnGround?: boolean;
  getBallOnGround?: () => boolean;
}

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
  ballEngine: {
    initialized: boolean;
    ballRollingBuffer: AudioBuffer | null;
    ballFlyingBuffer: AudioBuffer | null;
    rollingSource: AudioBufferSourceNode | null;
    flyingSource: AudioBufferSourceNode | null;
    rollingGain: GainNode | null;
    flyingGain: GainNode | null;
    init: (buffers?: BallAudioBuffers) => void;
    _startLoops: () => void;
    silenceAll: () => void;
    updatePanningModel: (model: PanningModelType | null | undefined) => void;
    update: (
      ballViewOrMesh: BallMeshOrViewLike | null | undefined,
      camera?: CameraTransformLike | null,
      physics?: BallPhysicsStateLike | null
    ) => void;
  };
  incidentEngine: {
    buffers: IncidentAudioBuffers;
    setBuffers: (bufs: Partial<IncidentAudioBuffers>) => void;
    handleEvent: (
      event: PhysicsImpactAudioEvent | null | undefined,
      camera?: unknown
    ) => void;
  };
  loaded: boolean;
  loading: boolean;
  readonly previewPlayer: AudioMenuPreviewPlayer;
  signalEngine: SignalAudioEngine;
  stadiumSpatialEngine: StadiumSpatialAudioEngine;
  vehicleManager: VehicleAudioManager;

  constructor() {
    const vehicleManager = new VehicleAudioManager();
    const signalEngine = new SignalAudioEngine();
    const stadiumSpatialEngine = stadiumSpatialAudioEngine;

    this.ballEngine = {
      initialized: true,
      ballRollingBuffer: null,
      ballFlyingBuffer: null,
      rollingSource: null,
      flyingSource: null,
      rollingGain: null,
      flyingGain: null,
      init: (buffers: BallAudioBuffers = {}) => {
        if (buffers.ballRolling) this.ballEngine.ballRollingBuffer = buffers.ballRolling;
        if (buffers.ballFlying) this.ballEngine.ballFlyingBuffer = buffers.ballFlying;
      },
      _startLoops: () => {},
      silenceAll: () => {},
      updatePanningModel: () => {},
      update: () => {},
    };

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

  handleEvent(
    event: PhysicsImpactAudioEvent | null | undefined,
    camera: CameraTransformLike | null = null
  ) {
    if (!event) return;
    this.incidentEngine.handleEvent(event, camera);
  }

  updateBallAudio(
    ballViewOrMesh: BallMeshOrViewLike | null | undefined,
    camera: CameraTransformLike | null | undefined,
    physics: BallPhysicsStateLike | null | undefined
  ) {
    this.ballEngine.update(ballViewOrMesh, camera, physics);
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

