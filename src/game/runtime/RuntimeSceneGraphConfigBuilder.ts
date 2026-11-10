import type * as THREE from 'three';
import {
  syncMaterialsToGame,
  type applyVisualMaterialsConfig,
} from '../../effects/ThemeMaterialPipeline.ts';
import { FlipResetVisual } from '../../effects/FlipResetVisual.ts';
import type { ArenaWorld } from '../../entities/ArenaWorld.ts';
import type { CameraManager } from '../../camera/CameraManager.ts';
import type { BoostBloom } from '../../effects/BoostBloom.ts';
import type { SupersonicSpeedLinesPass } from '../../effects/SupersonicSpeedLinesPass.ts';
import type { EffectComposer } from '../../effects/PostprocessingPipeline.ts';
import type { CorePhysicsBundle } from './RuntimeSceneBootstrap.ts';
import type {
  MountedGameUIHandle,
  RuntimeSceneCallbackHost,
  SceneGraphFactoryConfig,
  SceneGraphRuntimeCallbacks,
} from './RuntimePostprocessingAndSessionBootstrap.ts';

export type { CorePhysicsBundle };

export function ensureRuntimeFlipResetVisual(
  flipResetVisuals: Map<number, FlipResetVisual>,
  arena: ArenaWorld | null,
  carIndex: number
): FlipResetVisual | null {
  let visual = flipResetVisuals.get(carIndex) ?? null;
  const carRoot = arena?.cars?.[carIndex];
  if (!visual && carRoot) {
    visual = new FlipResetVisual(carRoot);
    flipResetVisuals.set(carIndex, visual);
  }
  return visual;
}

export function resolveRuntimeContainer(container?: HTMLElement | null): HTMLElement | null {
  if (container) return container;
  return typeof document !== 'undefined'
    ? (document.querySelector('#app') as HTMLElement | null)
    : null;
}

function executeFreeplayBallControlAction(
  target: RuntimeSceneCallbackHost,
  actionId: string
): void {
  const activeMode = target.modeManager?.getActiveMode?.() as {
    nameTagTunerController?: { isActive?: boolean };
  } | null;
  const modeName = target.match?.state.mode;
  if (
    (modeName === 'freeplay' || modeName === 'online-warmup') &&
    !activeMode?.nameTagTunerController?.isActive &&
    target.physics?.controlBall(target.playerCarIndex, actionId)
  ) {
    if (target.authoritativeServer) {
      target.authoritativeServer.sim?.controlBall?.(target.playerCarIndex, actionId);
      const snap =
        typeof target.physics.saveCompactState === 'function'
          ? target.physics.saveCompactState()
          : target.physics.saveState();
      target.authoritativeServer.sim?.restoreState?.(snap);
      const curTick = Math.floor(target.physics.getHeaderView?.()?.tickCount ?? 0);
      target.networkReconciler?.syncTimeline?.(snap, curTick);
    }
    target.interpolator?.syncBall();
    target.arena?.resetBallTrail?.();
    target.ballTrajectoryPredictor?.notifyBallStateReset?.();
  }
}

export function buildRuntimeSceneGraphConfig(
  target: RuntimeSceneCallbackHost,
  onProgress: ((progress: number, message?: string) => void) | null = null
): SceneGraphFactoryConfig {
  if (!target.physics || !target.interpolator) {
    throw new Error('[GameRuntime] setupPhysics must complete before setupScene.');
  }

  const callbacks: SceneGraphRuntimeCallbacks = {
    diagnosticsProbe: target.networkManager.diagnosticsProbe,
    sessionCoordinator: target.networkManager.sessionCoordinator,
    rosterSyncCoordinator: target.networkManager.rosterSyncCoordinator,
    loadoutCoordinator: target.loadoutCoordinator,
    onResetKickoff() {
      target.resetKickoff();
    },
    onBallControl(actionId: string) {
      executeFreeplayBallControlAction(target, actionId);
    },
    onKickoffSpawnSelect(spawnIndex: number) {
      if (target.match?.state?.mode === 'kickoff-training') {
        const activeMode = target.modeManager?.getActiveMode?.() as {
          selectSpawn?(idx: number): void;
        } | null;
        activeMode?.selectSpawn?.(spawnIndex);
      }
    },
    onEnsurePlayerFlipResetVisual(carIndex: number) {
      target.getFlipResetVisual(carIndex);
    },
    onSyncInitialMaterials(
      arena: ArenaWorld,
      applyFn: typeof applyVisualMaterialsConfig,
      materials: Record<string, unknown> | undefined
    ) {
      target.arena = arena;
      target.applyVisualMaterialsConfig = applyFn;
      syncMaterialsToGame(
        target as unknown as Parameters<typeof syncMaterialsToGame>[0],
        materials
      );
    },
    onUpdateViewport(
      renderer: THREE.WebGLRenderer,
      camera: CameraManager,
      composer: EffectComposer,
      boostBloom: BoostBloom,
      speedLinesPass: SupersonicSpeedLinesPass | null,
      gfx: Record<string, unknown>
    ) {
      target.renderer = renderer;
      target.camera = camera;
      target.composer = composer;
      target.boostBloom = boostBloom;
      target.speedLinesPass = speedLinesPass;
      target.activeGraphicsSettings = gfx;
      target.domEventManager.updateViewport();
    },
    onMountOrAttachGameUI(container: HTMLElement): MountedGameUIHandle | null {
      if (target.options?.gameUI) {
        target.options.gameUI.attachToRuntime?.(target);
        return target.options.gameUI;
      }
      if (typeof target.options?.mountUI === 'function') {
        return target.options.mountUI(container, target);
      }
      return null;
    },
    onDisposeHeadlessBloomOcclusion() {
      target.bloomOcclusion.dispose();
    },
  };

  return {
    container: target.container,
    physics: target.physics,
    interpolator: target.interpolator,
    selectedPreset: target.selectedPreset,
    teamAssignment: target.teamAssignment,
    playerCarIndex: target.playerCarIndex,
    options: target.options,
    onProgress,
    callbacks,
  };
}
