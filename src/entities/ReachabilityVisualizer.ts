/**
 * ReachabilityVisualizer.ts
 * High-performance, decoupled Three.js 3D orchestrator for:
 * 1. Ground/Surface Reachability Isochrones (GroundReachabilityRenderer)
 * 2. Aerial 3D Spacetime Funnel / Horn & Discrete Isochrone Bubbles (AerialReachabilityRenderer)
 * 3. Real-time Optimal Intercept Point 3D Orthogonal Cross (InterceptCrossRenderer)
 */

import * as THREE from 'three';
import { preloadGroundReachabilityLut } from './reachability/groundReachabilityLut.ts';
import { GroundReachabilityRenderer } from './reachability/GroundReachabilityRenderer.ts';
import { AerialReachabilityRenderer } from './reachability/AerialReachabilityRenderer.ts';
import { InterceptCrossRenderer } from './reachability/InterceptCrossRenderer.ts';

import type { BallTrajectoryPredictor } from './BallTrajectoryPredictor.ts';

export interface ReachabilityVisualizerConfig {
  enabled?: boolean;
  targetCarIndex?: number;
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
  getCarStateView?: (carIdx: number) => ReachabilityCarStateView | null | undefined;
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

function resolveCarVisualGroup(
  frameSource: ReachabilityFrameSource | null | undefined,
  targetIdx: number
): THREE.Object3D | null {
  if (frameSource && frameSource.arena && Array.isArray(frameSource.arena.cars)) {
    return frameSource.arena.cars[targetIdx] || null;
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
    if (!phys) return;

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

    const carGroup = resolveCarVisualGroup(frameSource, targetIdx);
    const posX = carGroup ? carGroup.position.x : carView.posX;
    const posY = carGroup ? carGroup.position.z : carView.posY; // Three.js Z -> RocketSim Y
    const posZ = carGroup ? carGroup.position.y : carView.posZ; // Three.js Y -> RocketSim Z

    const carState = {
      posX,
      posY,
      posZ,
      velX: carView.velX,
      velY: carView.velY,
      velZ: carView.velZ,
      fwdX: carView.fwdX,
      fwdY: carView.fwdY,
      fwdZ: carView.fwdZ,
      rightX: carView.rightX,
      rightY: carView.rightY,
      rightZ: carView.rightZ,
      upX: carView.upX,
      upY: carView.upY,
      upZ: carView.upZ,
      angVelX: carView.angVelX,
      angVelY: carView.angVelY,
      angVelZ: carView.angVelZ,
      boost: carView.boost,
      isOnGround: Boolean(carView.isOnGround),
    };

    const t0 = performance.now();
    this.groundRenderer.update(carState, config);
    const t1 = performance.now();
    this.aerialRenderer.update(carState, config);
    const t2 = performance.now();
    const interceptRes = this.interceptRenderer.update(
      carState,
      config,
      currentTick,
      renderWidth,
      renderHeight,
      phys
    );
    const t3 = performance.now();

    if (this.onTelemetry && t3 - this._lastTelemetryPublishMs > 65.0) {
      this._lastTelemetryPublishMs = t3;
      const groundUs = (t1 - t0) * 1000.0;
      const aerialUs = (t2 - t1) * 1000.0;
      const interceptUs = (t3 - t2) * 1000.0;
      this.onTelemetry({
        computeTimeUs: groundUs + aerialUs + interceptUs,
        groundComputeUs: groundUs,
        aerialComputeUs: aerialUs,
        interceptComputeUs: interceptUs,
        isOnGround: carState.isOnGround,
        boostAmount: carState.boost,
        forwardSpeed: carView.forwardSpeed !== undefined ? carView.forwardSpeed : 0,
        interceptStatus: interceptRes.status,
        interceptTimeSec: interceptRes.timeSec,
        interceptDistance: interceptRes.distance,
        interceptMargin: interceptRes.margin,
        interceptCentrality: interceptRes.centrality !== undefined ? interceptRes.centrality : 0,
        interceptPaceStatus:
          interceptRes.paceStatus !== undefined ? interceptRes.paceStatus : 'none',
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
