import { audioConfig, registerAudioDiagnosticsProvider } from '../ui-core/config/audioConfig.ts';
import { getAudioSlotPool, registerAudioEngine } from './audioContext.ts';
import { VehicleAudioManager, type VehicleAudioUpdateContext } from './VehicleAudioManager.ts';
import { IncidentAudioEngine } from './IncidentAudioEngine.ts';
import { SignalAudioEngine } from './SignalAudioEngine.ts';
import { loadAudioAssets, applyBoostVariationBuffers } from './audioAssetLoader.ts';
import {
  stadiumSpatialAudioEngine,
  type StadiumSpatialAudioEngine,
} from './StadiumSpatialAudioEngine.ts';
import {
  BallAudioEmitter,
  type BallMeshOrViewLike,
  type BallPhysicsStateLike,
} from './BallAudioEmitter.ts';
import {
  AudioMenuPreviewPlayer,
  type PreviewAudioBufferOptions,
} from './AudioMenuPreviewPlayer.ts';
import type { CameraTransformLike } from './SpatialAudioSource.ts';
import type { PhysicsImpactAudioEvent } from './WorldImpactAudioHandler.ts';
import './audioDebug.ts';

export type { PreviewAudioBufferOptions };

export class GameAudioEngineFacade {
  _lastBoostVariationKey: string;
  ballEngine: BallAudioEmitter;
  incidentEngine: IncidentAudioEngine;
  loaded: boolean;
  loading: boolean;
  readonly previewPlayer: AudioMenuPreviewPlayer;
  signalEngine: SignalAudioEngine;
  stadiumSpatialEngine: StadiumSpatialAudioEngine;
  vehicleManager: VehicleAudioManager;

  constructor() {
    const ballEngine = new BallAudioEmitter();
    const vehicleManager = new VehicleAudioManager();
    const incidentEngine = new IncidentAudioEngine(vehicleManager);
    const signalEngine = new SignalAudioEngine();
    const stadiumSpatialEngine = stadiumSpatialAudioEngine;

    this.ballEngine = ballEngine;
    this.vehicleManager = vehicleManager;
    this.incidentEngine = incidentEngine;
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
    this.incidentEngine.lastCarBallHitTimestamp = 0;
    this.incidentEngine.lastCarCollisionTimestamp = 0;
    this.incidentEngine.lastGoalScoredTimestamp = 0;
    this.incidentEngine.lastBoostPickupByPad.clear();
    this.incidentEngine.lastCarCollisionByPair.clear();
    this.incidentEngine.lastCarDemoByVictim.clear();
    this.incidentEngine.worldImpactHandler.lastGoalpostHitTimestamp = 0;
    this.incidentEngine.worldImpactHandler.lastBallWorldHitTimestamp = 0;
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
