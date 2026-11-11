/**
 * ReachabilityVisualizer.ts
 * High-performance, decoupled Three.js 3D orchestrator for WASM `rc_trajectory_mesh`:
 * 1. Ground/Surface Reachability Isochrones (GroundReachabilityRenderer)
 * 2. Aerial 3D Spacetime Funnel / Horn & Discrete Isochrone Bubbles (AerialReachabilityRenderer)
 * 3. Real-time Optimal Intercept Point 3D Orthogonal Cross (InterceptCrossRenderer)
 */

import * as THREE from 'three';
import type { RocketSimWasmModule } from '../physics/RocketSimWasm.ts';
import {
  preloadGroundReachabilityLut,
  ensureWasmGroundReachabilityLutLoaded,
} from './reachability/groundReachabilityLut.ts';
import { GroundReachabilityRenderer } from './reachability/GroundReachabilityRenderer.ts';
import { AerialReachabilityRenderer } from './reachability/AerialReachabilityRenderer.ts';
import { InterceptCrossRenderer } from './reachability/InterceptCrossRenderer.ts';

import type { BallTrajectoryPredictor } from './BallTrajectoryPredictor.ts';

const REACH_FLAG_SHOW_GROUND = 1 << 0;
const REACH_FLAG_GROUND_ANALYTICAL = 1 << 1;
const REACH_FLAG_SHOW_AERIAL = 1 << 2;
const REACH_FLAG_AERIAL_BUBBLES = 1 << 3;
const REACH_FLAG_AERIAL_SHOW_RINGS = 1 << 4;
const REACH_FLAG_AERIAL_SHOW_RAILS = 1 << 5;
const REACH_FLAG_INCLUDE_JUMP_IMPULSE = 1 << 6;
const REACH_FLAG_SHOW_INTERCEPT = 1 << 7;
const REACH_FLAG_CROSS_TRAJECTORY_ORIENT = 1 << 8;
const REACH_FLAG_SHOW_CLOSEST_FALLBACK = 1 << 9;

export interface ReachabilityVisualizerConfig {
  enabled?: boolean;
  targetCarIndex?: number;
  showGround?: boolean;
  groundMode?: string;
  groundFillOpacity?: number;
  showAerial?: boolean;
  aerialMode?: string;
  aerialOpacity?: number;
  aerialShowRings?: boolean;
  aerialShowRails?: boolean;
  includeJumpImpulse?: boolean;
  showIntercept?: boolean;
  crossArmLength?: number;
  crossThickness?: number;
  crossOrientation?: string;
  showClosestWhenUnreachable?: boolean;
  edgeCrossColor?: string;
  midCrossColor?: string;
  centerCrossColor?: string;
  unreachableCrossColor?: string;
  [key: string]: unknown;
}

export interface ReachabilityVisualizerOptions {
  getConfig?: (() => ReachabilityVisualizerConfig | null | undefined) | null;
  onTelemetry?: ((telemetry: Record<string, unknown>) => void) | null;
}

export interface ReachabilityCarStateView {
  isDemoed?: boolean;
  posX: number;
  posY: number;
  posZ: number;
  velX: number;
  velY: number;
  velZ: number;
  fwdX: number;
  fwdY: number;
  fwdZ: number;
  rightX: number;
  rightY: number;
  rightZ: number;
  upX: number;
  upY: number;
  upZ: number;
  angVelX: number;
  angVelY: number;
  angVelZ: number;
  boost: number;
  isOnGround?: boolean;
  forwardSpeed?: number;
}

export interface ReachabilityPhysicsPort {
  module?: RocketSimWasmModule | null;
  getCarStateView?: (carIdx: number) => ReachabilityCarStateView | null | undefined;
  getBallStateView?: () => { velX: number; velY: number; velZ: number } | null | undefined;
  updateBallPrediction?: (seconds?: number) => number;
  updateBallPredictionIncremental?: (seconds?: number) => number;
}

export interface ReachabilityFrameSource {
  physics?: ReachabilityPhysicsPort | null;
  playerCarIndex?: number;
  interpolator?: {
    getCurrCarStateView?: (carIdx: number) => ReachabilityCarStateView | null | undefined;
  } | null;
  arena?: {
    cars?: Array<THREE.Object3D | null | undefined>;
  } | null;
}

function createReachabilityRenderers(
  scene: THREE.Scene | null,
  ballTrajectoryPredictor: BallTrajectoryPredictor | null
): {
  rootGroup: THREE.Group;
  groundRenderer: GroundReachabilityRenderer;
  aerialRenderer: AerialReachabilityRenderer;
  interceptRenderer: InterceptCrossRenderer;
} {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'reachability-visualizer-root';
  rootGroup.visible = false;
  if (scene) {
    scene.add(rootGroup);
  }
  const groundRenderer = new GroundReachabilityRenderer(rootGroup);
  const aerialRenderer = new AerialReachabilityRenderer(rootGroup);
  const interceptRenderer = new InterceptCrossRenderer(rootGroup, ballTrajectoryPredictor);
  return { rootGroup, groundRenderer, aerialRenderer, interceptRenderer };
}

function resolveCarStateView(
  frameSource: ReachabilityFrameSource | null | undefined,
  phys: ReachabilityPhysicsPort,
  targetIdx: number
): ReachabilityCarStateView | null {
  if (frameSource && frameSource.interpolator) {
    const getInterpView = frameSource.interpolator.getCurrCarStateView;
    if (typeof getInterpView === 'function') {
      const view = getInterpView.call(frameSource.interpolator, targetIdx);
      if (view) return view;
    }
  }
  if (typeof phys.getCarStateView === 'function') {
    return phys.getCarStateView(targetIdx) || null;
  }
  return null;
}

function disposeSceneNodeResources(scene: THREE.Scene | null, rootGroup: THREE.Group): void {
  if (scene) {
    scene.remove(rootGroup);
  }
  rootGroup.traverse((node: THREE.Object3D) => {
    const meshNode = node as THREE.Mesh<
      THREE.BufferGeometry | undefined,
      THREE.Material | THREE.Material[] | undefined
    >;
    if (meshNode.geometry) {
      meshNode.geometry.dispose();
    }
    if (meshNode.material) {
      if (Array.isArray(meshNode.material)) {
        for (const mat of meshNode.material) {
          if (mat) mat.dispose();
        }
      } else {
        meshNode.material.dispose();
      }
    }
  });
}

function packReachabilityFlags(config: ReachabilityVisualizerConfig): number {
  let flags = 0;
  if (config.showGround) flags |= REACH_FLAG_SHOW_GROUND;
  if (config.groundMode === 'analytical') flags |= REACH_FLAG_GROUND_ANALYTICAL;
  if (config.showAerial) flags |= REACH_FLAG_SHOW_AERIAL;
  if (config.aerialMode === 'bubbles') flags |= REACH_FLAG_AERIAL_BUBBLES;
  if (config.aerialShowRings !== false) flags |= REACH_FLAG_AERIAL_SHOW_RINGS;
  if (config.aerialShowRails !== false) flags |= REACH_FLAG_AERIAL_SHOW_RAILS;
  if (config.includeJumpImpulse !== false) flags |= REACH_FLAG_INCLUDE_JUMP_IMPULSE;
  if (config.showIntercept) flags |= REACH_FLAG_SHOW_INTERCEPT;
  if (config.crossOrientation === 'trajectory') flags |= REACH_FLAG_CROSS_TRAJECTORY_ORIENT;
  if (config.showClosestWhenUnreachable) flags |= REACH_FLAG_SHOW_CLOSEST_FALLBACK;
  return flags >>> 0;
}

export class ReachabilityVisualizer {
  public _lastTelemetryPublishMs: number;
  public aerialGroup: THREE.Group;
  public aerialRenderer: AerialReachabilityRenderer;
  public ballTrajectoryPredictor: BallTrajectoryPredictor | null;
  public getConfig: (() => ReachabilityVisualizerConfig | null | undefined) | null;
  public groundGroup: THREE.Group;
  public groundRenderer: GroundReachabilityRenderer;
  public interceptGroup: THREE.Group;
  public interceptRenderer: InterceptCrossRenderer;
  public onTelemetry: ((telemetry: Record<string, unknown>) => void) | null;
  public physics: ReachabilityPhysicsPort | null;
  public rootGroup: THREE.Group;
  public scene: THREE.Scene | null;

  constructor(
    scene: THREE.Scene | null,
    physics: ReachabilityPhysicsPort | null = null,
    ballTrajectoryPredictor: BallTrajectoryPredictor | null = null,
    options: ReachabilityVisualizerOptions = {}
  ) {
    this.scene = scene;
    this.physics = physics;
    this.ballTrajectoryPredictor = ballTrajectoryPredictor;
    this.getConfig = options.getConfig || null;
    this.onTelemetry = options.onTelemetry || null;

    const renderers = createReachabilityRenderers(scene, ballTrajectoryPredictor);
    this.rootGroup = renderers.rootGroup;
    this.groundRenderer = renderers.groundRenderer;
    this.aerialRenderer = renderers.aerialRenderer;
    this.interceptRenderer = renderers.interceptRenderer;

    this.groundGroup = this.groundRenderer.group;
    this.aerialGroup = this.aerialRenderer.group;
    this.interceptGroup = this.interceptRenderer.group;

    this._lastTelemetryPublishMs = 0;

    preloadGroundReachabilityLut();
  }

  private _syncBallPredictionForIntercept(
    wasmModule: RocketSimWasmModule,
    phys: ReachabilityPhysicsPort,
    currentTick: number
  ): number {
    const btp = this.ballTrajectoryPredictor;
    if (btp?.isTemporarilySuppressed?.()) {
      return 0;
    }

    const meshHeaderWord = wasmModule._physics_getTrajectoryMeshHeaderPtr() >> 2;
    const rawPtsWord = wasmModule._physics_getTrajectoryRawPointsPtr() >> 2;
    const heapU32 = wasmModule.HEAPU32;
    const heapF32 = wasmModule.HEAPF32;

    if (btp && btp.isActive && btp.predictionCount > 1) {
      const count = Math.min(600, btp.predictionCount);
      heapF32.set(btp.rawPredictedPoints.subarray(0, count * 3), rawPtsWord);
      heapU32[meshHeaderWord + 5] = count;
      return Math.max(0, Math.floor(currentTick - btp.impactTick));
    }

    const bv = phys.getBallStateView?.();
    if (bv) {
      const bSpd = Math.hypot(bv.velX, bv.velY, bv.velZ);
      if (bSpd > 15.0 && typeof phys.updateBallPrediction === 'function') {
        const cnt =
          typeof phys.updateBallPredictionIncremental === 'function'
            ? phys.updateBallPredictionIncremental(3.0)
            : phys.updateBallPrediction(3.0);
        if (cnt > 1) {
          wasmModule._physics_buildTrajectoryMesh(
            0,
            50,
            20,
            0,
            18.25,
            0.35,
            6,
            1,
            0,
            104,
            0,
            0,
            0,
            0,
            0
          );
          return 0;
        }
      }
    }

    heapU32[meshHeaderWord + 5] = 0;
    return 0;
  }

  /**
   * Per-frame update called from GameRenderSubsystem.
   */
  update(
    frameSource: ReachabilityFrameSource | null | undefined,
    currentTick: number,
    renderWidth: number,
    renderHeight: number
  ): void {
    const config = this.getConfig ? this.getConfig() : null;
    if (!config || !config.enabled) {
      if (this.rootGroup.visible) {
        this.rootGroup.visible = false;
      }
      return;
    }

    const phys = (frameSource && frameSource.physics) || this.physics;
    const wasmModule = phys?.module;
    if (!phys || !wasmModule) return;

    const configuredIdx = config.targetCarIndex !== undefined ? config.targetCarIndex : -1;
    const fallbackPlayerIdx =
      frameSource && frameSource.playerCarIndex !== undefined ? frameSource.playerCarIndex : 0;
    const targetIdx = configuredIdx >= 0 ? configuredIdx : fallbackPlayerIdx;

    const carView = resolveCarStateView(frameSource, phys, targetIdx);
    if (!carView || carView.isDemoed) {
      this.rootGroup.visible = false;
      return;
    }

    this.rootGroup.visible = true;
    ensureWasmGroundReachabilityLutLoaded(wasmModule);

    const elapsedTicks = config.showIntercept
      ? this._syncBallPredictionForIntercept(wasmModule, phys, currentTick)
      : 0;
    const flags = packReachabilityFlags(config);
    const armLen = Math.max(15.0, Math.min(500.0, Number(config.crossArmLength) || 50.0));

    const t0 = performance.now();
    wasmModule._physics_updateReachabilityAndIntercept(targetIdx, elapsedTicks, flags, armLen);
    const tWasmDone = performance.now();

    const headerBaseWord = wasmModule._physics_getReachabilityHeaderPtr() >> 2;
    const heapU32 = wasmModule.HEAPU32;
    const heapF32 = wasmModule.HEAPF32;

    const groundVisible = heapU32[headerBaseWord + 0] !== 0;
    const aerialVisible = heapU32[headerBaseWord + 1] !== 0;
    const aerialMode = heapU32[headerBaseWord + 2];
    const carForwardSpeed = heapF32[headerBaseWord + 4];
    const carBoostAmount = heapF32[headerBaseWord + 5];

    this.groundRenderer.updateFromWasm(wasmModule, groundVisible, config);
    const t1 = performance.now();
    this.aerialRenderer.updateFromWasm(wasmModule, aerialVisible, aerialMode, config);
    const t2 = performance.now();
    const interceptRes = this.interceptRenderer.updateFromWasm(
      wasmModule,
      headerBaseWord,
      config,
      renderWidth,
      renderHeight
    );
    const t3 = performance.now();

    if (this.onTelemetry && t3 - this._lastTelemetryPublishMs > 65.0) {
      this._lastTelemetryPublishMs = t3;
      const wasmUs = (tWasmDone - t0) * 1000.0;
      const groundUs = (t1 - tWasmDone) * 1000.0;
      const aerialUs = (t2 - t1) * 1000.0;
      const interceptUs = (t3 - t2) * 1000.0;
      this.onTelemetry({
        computeTimeUs: wasmUs + groundUs + aerialUs + interceptUs,
        groundComputeUs: groundUs + wasmUs * 0.25,
        aerialComputeUs: aerialUs + wasmUs * 0.45,
        interceptComputeUs: interceptUs + wasmUs * 0.3,
        isOnGround: Boolean(carView.isOnGround),
        boostAmount: carBoostAmount,
        forwardSpeed: carView.forwardSpeed !== undefined ? carView.forwardSpeed : carForwardSpeed,
        interceptStatus: interceptRes.status,
        interceptTimeSec: interceptRes.timeSec,
        interceptDistance: interceptRes.distance,
        interceptMargin: interceptRes.margin,
        interceptCentrality: interceptRes.centrality,
        interceptPaceStatus: interceptRes.paceStatus,
        interceptMinBoost: interceptRes.minBoost,
        interceptPos: [
          Math.round(interceptRes.rx),
          Math.round(interceptRes.ry),
          Math.round(interceptRes.rz),
        ],
      });
    }
  }

  dispose(): void {
    disposeSceneNodeResources(this.scene, this.rootGroup);
  }
}

export default ReachabilityVisualizer;
