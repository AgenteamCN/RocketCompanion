/**
 * BallTrajectoryPredictor.ts
 * High-performance 3D visual subsystem for Ball Trajectory Prediction (WASM BallPredTracker @ 120Hz).
 */

import type * as THREE from 'three';

import {
  loadSavedTrajectorySettings,
  saveTrajectorySettings,
} from '../ui-core/config/trainingDefaults.ts';
import {
  resolveBallTrajectoryActivation,
  type BallTrajectoryOverride,
  type ResolvedBallTrajectoryActivation,
} from './trajectory/ballTrajectoryPolicy.ts';
import type { LiveBallPositionLike } from './trajectory/ballTrajectoryGeometryPipeline.ts';
import {
  DEFAULT_TRAJECTORY_SETTINGS,
  buildBallTrajectoryTelemetrySnapshot,
  buildTubeRenderParams,
  computeStaticPreviewScrollOffset,
  hideTubeRenderer,
  isTubeRendererVisible,
  renderTrajectoryTubeFrame,
  resolvePatternElapsedTicks,
  shouldPublishTrajectoryTelemetry,
  type BallTrajectoryTelemetrySnapshot,
  type TrajectorySettingsConfig,
} from './trajectory/ballTrajectoryTelemetryPipeline.ts';
import { BallTrajectoryTubeRenderer } from './trajectory/BallTrajectoryTubeRenderer.ts';
import {
  BallTrajectorySamplingController,
  type TrajectoryBallLaunchState,
  type TrajectoryPhysicsPort,
} from './trajectory/BallTrajectorySamplingController.ts';

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

export class BallTrajectoryPredictor {
  public ballRadius: number;
  public forcePredictAnyMovement = false;
  public maxTicks = 600;
  public physics: TrajectoryPhysicsPort | null;
  public scene: THREE.Scene | null | undefined;
  public readonly sampler: BallTrajectorySamplingController;
  public tubeRenderer: BallTrajectoryTubeRenderer | null;
  public settings: TrajectorySettingsConfig;
  public trajectoryOverride: BallTrajectoryOverride = null;
  public runtimeOverride: BallTrajectoryOverride = null;
  public onTelemetry: ((telemetry: BallTrajectoryTelemetrySnapshot) => void) | null;

  private readonly _suppressionSources = new Set<string>();
  private _isGoalReplayActive = false;
  private _isPodiumActive = false;
  private _lastTelemetryPublishMs = 0;

  constructor(
    scene: THREE.Scene | null | undefined,
    initialSettings: Partial<TrajectorySettingsConfig> = {},
    ballRadius = 91.25,
    physics: TrajectoryPhysicsPort | null = null,
    onTelemetry: ((telemetry: BallTrajectoryTelemetrySnapshot) => void) | null = null
  ) {
    this.scene = scene;
    this.ballRadius = Number(ballRadius) || 91.25;
    this.physics = physics;
    this.onTelemetry = onTelemetry;
    this.settings = {
      ...DEFAULT_TRAJECTORY_SETTINGS,
      ...(loadSavedTrajectorySettings() as Partial<TrajectorySettingsConfig>),
      ...initialSettings,
    };
    this.sampler = new BallTrajectorySamplingController(600);
    this.tubeRenderer = new BallTrajectoryTubeRenderer(scene);
    this.syncMaterialProperties();
  }

  public get rawPredictedPoints(): Float32Array {
    return this.sampler.rawPredictedPoints;
  }
  public get predictionCount(): number {
    return this.sampler.predictionCount;
  }
  public get impactTick(): number {
    return this.sampler.impactTick;
  }
  public get isActive(): boolean {
    return this.sampler.isActive;
  }
  public get anomalyRecorder() {
    return this.sampler.anomalyRecorder;
  }

  public notifyCarBallHit(tick?: number): void {
    this.sampler.notifyCarBallHit(tick);
  }

  public notifyBallStateReset(): void {
    this.sampler.notifyBallStateReset();
  }

  public resetAnomalyCapture(): void {
    this.sampler.anomalyRecorder.resetLatchedAnomaly();
  }

  public setTrajectoryOverride(override: BallTrajectoryOverride): void {
    this.trajectoryOverride = override;
    if (!this.isPredictionAllowed().allowed) this.clear();
  }

  public setRuntimeOverride(override: BallTrajectoryOverride): void {
    this.runtimeOverride = override;
    if (!this.isPredictionAllowed().allowed) this.clear();
  }

  public acquireTemporarySuppression(source: string = 'default'): void {
    if (source) this._suppressionSources.add(source);
    this.clear();
  }

  public releaseTemporarySuppression(source: string | null = null): void {
    const sources = this._suppressionSources;
    if (source) sources.delete(source);
    else sources.clear();
  }

  public setSceneContext(ctx: { isGoalReplayActive?: boolean; isPodiumActive?: boolean }): void {
    if (ctx.isGoalReplayActive !== undefined) {
      this._isGoalReplayActive = Boolean(ctx.isGoalReplayActive);
    }
    if (ctx.isPodiumActive !== undefined) {
      this._isPodiumActive = Boolean(ctx.isPodiumActive);
    }
    const clearNeeded =
      !this.isPredictionAllowed().allowed &&
      (this.isActive || isTubeRendererVisible(this.tubeRenderer));
    if (clearNeeded) this.clear();
  }

  public isPredictionAllowed(): ResolvedBallTrajectoryActivation {
    return resolveBallTrajectoryActivation({
      enabled: Boolean(this.settings.enabled),
      forcePredictAnyMovement: Boolean(this.forcePredictAnyMovement),
      staticPreviewActive: Boolean(this.sampler.staticPreviewActive),
      isGoalReplayActive: this._isGoalReplayActive,
      isPodiumActive: this._isPodiumActive,
      suppressionSourcesCount: this._suppressionSources.size,
      systemOverride: this.trajectoryOverride,
      runtimeOverride: this.runtimeOverride,
    });
  }

  public isTemporarilySuppressed(): boolean {
    const activation = this.isPredictionAllowed();
    return Boolean(
      activation.suppressedByOverride ||
      this._suppressionSources.size > 0 ||
      this._isGoalReplayActive ||
      this._isPodiumActive
    );
  }

  public setBallRadius(radius: number): void {
    if (Number.isFinite(radius) && radius > 0) {
      this.ballRadius = radius;
      this.syncMaterialProperties();
    }
  }

  public setPhysicsEngine(physics: TrajectoryPhysicsPort | null): void {
    this.physics = physics;
    if (physics && physics.ballRadius) this.setBallRadius(physics.ballRadius);
  }

  public syncMaterialProperties(): void {
    const renderer = this.tubeRenderer;
    if (renderer) renderer.syncUniforms(buildTubeRenderParams(this.ballRadius, this.settings));
  }

  public updateSettings(newSettings: Partial<TrajectorySettingsConfig>): void {
    this.settings = { ...this.settings, ...newSettings };
    this.syncMaterialProperties();
    if (!this.settings.enabled) this.clear();
    saveTrajectorySettings(this.settings);
  }

  public setStaticPreviewTrajectory(
    physics: TrajectoryPhysicsPort | null = null,
    ballLaunchState: TrajectoryBallLaunchState | null = null
  ): number {
    const phys = physics || this.physics;
    if (this.isTemporarilySuppressed() || !phys || !phys.getBallState || !phys.setBallState) {
      this.clearStaticPreview();
      return 0;
    }
    const count = this.sampler.setStaticPreviewTrajectory(
      phys,
      ballLaunchState,
      this.settings.predictionTicks
    );
    if (count <= 0) hideTubeRenderer(this.tubeRenderer);
    return count;
  }

  public clearStaticPreview(): void {
    this.clear();
  }

  private _publishTelemetry(
    frameStartMs: number,
    geometryBuildTimeUs: number,
    remainingSlices: number,
    primitiveCount: number,
    ballSpeedUu: number
  ): void {
    if (!this.onTelemetry) return;
    const currentMs = nowMs();
    if (!shouldPublishTrajectoryTelemetry(currentMs, this._lastTelemetryPublishMs)) return;
    this._lastTelemetryPublishMs = currentMs;
    this.onTelemetry(
      buildBallTrajectoryTelemetrySnapshot({
        frameStartMs,
        nowMs: currentMs,
        geometryBuildTimeUs,
        remainingSlices,
        primitiveCount,
        ballSpeedUu,
        samplerMetrics: this.sampler,
        anomalySummary: this.sampler.anomalyRecorder.getSummary(),
      })
    );
  }

  public update(
    currentTick: number,
    liveBallPosition: LiveBallPositionLike | null = null,
    _renderWidth: number | null = null,
    _renderHeight: number | null = null,
    physics: TrajectoryPhysicsPort | null = null
  ): void {
    const frameStartMs = nowMs();
    const activation = this.isPredictionAllowed();
    if (!activation.allowed) {
      if (activation.suppressedByOverride && this.isActive) this.clear();
      else hideTubeRenderer(this.tubeRenderer);
      return;
    }

    const phys = physics || this.physics;
    const predCount = this.sampler.predictionCount;

    if (this.sampler.staticPreviewActive && this.isActive && predCount > 1) {
      const scrollOffset = computeStaticPreviewScrollOffset(frameStartMs);
      const tGeom0 = nowMs();
      const prims = renderTrajectoryTubeFrame(
        this.tubeRenderer,
        this.sampler,
        this.ballRadius,
        this.settings,
        0,
        -scrollOffset,
        false,
        liveBallPosition
      );
      this.sampler.markStaticPreviewUpdate();
      this._publishTelemetry(frameStartMs, (nowMs() - tGeom0) * 1000.0, predCount, prims, 0);
      return;
    }

    if (!phys) return;

    const stateBuf = phys.state;
    const isSleeping =
      typeof phys.isBallSleeping === 'function' ? Boolean(phys.isBallSleeping()) : false;
    if (isSleeping || !stateBuf) {
      if (this.isActive) this.clear();
      this.sampler.markSleeping();
      this._publishTelemetry(frameStartMs, 0, 0, 0, 0);
      return;
    }

    const ballSpeedUu = Math.hypot(stateBuf[16], stateBuf[17], stateBuf[18]);
    const awake = this.sampler.stepLivePrediction(
      phys,
      stateBuf,
      currentTick,
      this.forcePredictAnyMovement,
      this.settings
    );
    if (!awake) {
      hideTubeRenderer(this.tubeRenderer);
      this._publishTelemetry(frameStartMs, 0, 0, 0, ballSpeedUu);
      return;
    }

    const liveCount = this.sampler.predictionCount;
    const elapsed = Math.floor(currentTick - this.sampler.impactTick);
    if (!this.isActive || liveCount <= 1 || elapsed < 0) {
      hideTubeRenderer(this.tubeRenderer);
      return;
    }
    if (elapsed >= liveCount) {
      this.clear();
      return;
    }

    const patternElapsed = resolvePatternElapsedTicks(
      currentTick,
      this.sampler.patternAnchorTick,
      elapsed
    );
    const tGeom0 = nowMs();
    const prims = renderTrajectoryTubeFrame(
      this.tubeRenderer,
      this.sampler,
      this.ballRadius,
      this.settings,
      elapsed,
      patternElapsed,
      Boolean(this.settings.dynamicMode),
      liveBallPosition
    );
    this._publishTelemetry(
      frameStartMs,
      (nowMs() - tGeom0) * 1000.0,
      Math.max(0, liveCount - elapsed),
      prims,
      ballSpeedUu
    );
  }

  public clear(): void {
    this.sampler.clear();
    hideTubeRenderer(this.tubeRenderer);
  }

  public dispose(): void {
    this.clear();
    this._suppressionSources.clear();
    if (this.tubeRenderer) {
      this.tubeRenderer.dispose(this.scene);
      this.tubeRenderer = null;
    }
  }
}

export default BallTrajectoryPredictor;
