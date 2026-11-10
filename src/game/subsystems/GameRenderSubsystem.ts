import type * as THREE from 'three';
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { useAppStore } from '../runtimeUiPort.ts';
import type { ArenaWorld } from '../../entities/ArenaWorld.ts';
import type { BoostBloom } from '../../effects/BoostBloom.ts';
import type { SupersonicSpeedLinesPass } from '../../effects/SupersonicSpeedLinesPass.ts';
import type { BallTrajectoryPredictor } from '../../entities/BallTrajectoryPredictor.ts';
import type { ReachabilityVisualizer } from '../../entities/ReachabilityVisualizer.ts';
import type { RocketSimPhysicsEngine } from '../../physics/RocketSimPhysicsEngine.ts';
import type { FrameContext } from '../pipeline/FramePipeline.ts';

export interface RenderSubsystemRuntimePort {
  renderer: THREE.WebGLRenderer | null;
  composer: EffectComposer | null;
  arena: ArenaWorld | null;
  speedLinesPass: SupersonicSpeedLinesPass | null;
  physics: RocketSimPhysicsEngine | null;
  ballTrajectoryPredictor: BallTrajectoryPredictor | null;
  reachabilityVisualizer: ReachabilityVisualizer | null;
  gameUI: unknown;
  bloomEnabled: boolean;
  boostBloom: BoostBloom | null;
  bloomOcclusion: {
    applyBloomOccluders(): void;
    restoreBloomMaterials(): void;
  };
  profiler: { mark(): void } | null;
}

/**
 * GameRenderSubsystem.ts
 * Encapsulates Three.js rendering passes, BoostBloom occluders,
 * supersonic speed lines, and composer execution.
 */
export class GameRenderSubsystem {
  public runtime: RenderSubsystemRuntimePort;
  public lastBloomActive = true;

  constructor(runtime: RenderSubsystemRuntimePort) {
    this.runtime = runtime;
  }

  public update(context: FrameContext): void {
    const r = this.runtime;
    const {
      dt,
      isMatchActive,
      isSupersonic,
      isInputEnabled,
      cameraVelocity,
      isGoalReplayActive,
      isPodiumActive,
      hasActiveFlipResetBloom,
    } = context;

    const activeCamera = r.arena?.camera;
    if (!r.renderer || !r.composer || !activeCamera) return;

    r.arena?.prepareBallSpeedTrail?.(activeCamera);

    if (r.speedLinesPass) {
      r.speedLinesPass.update(
        dt,
        Boolean(isSupersonic && isInputEnabled && isMatchActive),
        cameraVelocity,
        activeCamera
      );
    }

    const domCanvas = r.renderer.domElement;
    const winWidth = domCanvas?.clientWidth || window.innerWidth;
    const winHeight = domCanvas?.clientHeight || window.innerHeight;
    const curTick = r.physics?.getHeaderView()?.tickCount ?? 0;
    const effectiveGoalReplayActive = Boolean(r.arena?.isGoalReplayActive || isGoalReplayActive);
    if (r.ballTrajectoryPredictor) {
      r.ballTrajectoryPredictor.setSceneContext?.({
        isGoalReplayActive: effectiveGoalReplayActive,
        isPodiumActive,
      });
      r.ballTrajectoryPredictor.update(
        curTick,
        r.arena?.ball?.position,
        winWidth,
        winHeight,
        r.physics
      );
    }
    if (r.reachabilityVisualizer) {
      r.reachabilityVisualizer.update(r, curTick, winWidth, winHeight);
    }

    const appState = useAppStore.getState();
    const isTransparentPreviewRoute =
      appState.activeRoute === 'trajectory' || appState.activeRoute === 'camera';
    const isLiveMenuOpen = Boolean(
      r.gameUI && appState.isOpen && !appState.isLivePreviewCollapsed && !isTransparentPreviewRoute
    );
    const isDocHidden = typeof document !== 'undefined' && document.hidden;
    const powerSave =
      appState.graphics?.menuPowerSave || (appState.pauseRenderingOnMenu ? 'freeze' : '30');
    const isExtremeFreeze = powerSave === 'freeze' || powerSave === 'extreme';
    const shouldSkipGpuRender =
      Boolean(context.shouldSkipGpuRender) || isDocHidden || (isLiveMenuOpen && isExtremeFreeze);
    context.shouldSkipGpuRender = shouldSkipGpuRender;

    if (shouldSkipGpuRender) {
      return;
    }

    const isBloomActive =
      r.bloomEnabled !== false && Boolean(r.arena?.boostBloomActive || hasActiveFlipResetBloom);
    if (isBloomActive && r.arena && r.boostBloom) {
      activeCamera.layers.set(0);
      r.bloomOcclusion.applyBloomOccluders();
      try {
        r.boostBloom.render(r.arena.scene, activeCamera);
      } finally {
        r.bloomOcclusion.restoreBloomMaterials();
      }
    } else if (this.lastBloomActive) {
      r.boostBloom?.clear?.();
    }
    this.lastBloomActive = isBloomActive;

    if (r.profiler) r.profiler.mark();

    if (r.renderer.shadowMap && (r.arena?.lighting?.shouldRenderShadowMap?.() ?? true)) {
      r.renderer.shadowMap.needsUpdate = true;
    }
    r.composer.render(dt);
  }

  public dispose(): void {}
}
