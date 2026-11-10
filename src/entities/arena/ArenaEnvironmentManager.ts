import * as THREE from 'three';
import {
  createDriftwoodsManager,
  type DriftwoodsMaterialManager,
} from '../stadium/driftwoods/DriftwoodsMaterialManager.ts';
import {
  setExperimentalWallFxRuntimeConfig,
  updateShadowRuntimeConfig,
  type ExperimentalWallFxConfig,
  type ShadowConfig,
} from '../../ui-core/config/atmosphereFxConfig.ts';
import type { DriftwoodsTunerConfig } from '../../ui-core/config/driftwoodsConfig.ts';
import type { SkyboxConfig } from '../../ui-core/config/skyboxConfig.ts';
import type {
  GoalBarrierDecomposition,
  GoalBarrierTargetGoal,
} from '../../ui-core/config/goalBarrierConfig.ts';
import {
  updateBallVisualConfig,
  type BallVisualConfig,
} from '../../ui-core/config/ballVisualConfig.ts';
import { updateBallGoalEffect } from './BallGoalRimShader.ts';
import {
  loadThrowbackStadiumField,
  loadThrowbackCollisionOverlay,
} from '../stadium/ThrowbackStadiumLoader.ts';
import { loadArenaStadiumMeshes } from './ArenaAssetLoader.ts';
import { interpolatePhysicsTransform, unrealToThreeCoords } from './ArenaMath.ts';
import { updateSkyboxConfig } from './ArenaSky.ts';
import { EXTENDED_STATE_OFFSETS } from '../../physics/RocketSimConstants.ts';
import type { BallStateView, NumericStateBuffer } from '../../physics/RocketSimStateViews.ts';
import type { SpeedTrail } from '../SpeedTrail.ts';
import type { GoalBarrierVisual } from './GoalBarrierVisual.ts';
import type { GoalVolumeHitboxVisual } from './GoalVolumeHitboxVisual.ts';
import type { ArenaLightingManager } from './ArenaLighting.ts';
import type { TraversableMaterialNode } from './VehiclePaint.ts';

export interface ArenaEnvironmentHost {
  scene: THREE.Scene;
  ball: THREE.Group;
  ballRadius: number;
  ballVelocity: THREE.Vector3;
  ballSpeedTrail: SpeedTrail;
  sky: THREE.Mesh;
  lighting: ArenaLightingManager;
  goalBarrierVisual: GoalBarrierVisual;
  goalVolumeHitboxVisual: GoalVolumeHitboxVisual;
  indicatorRing: THREE.Mesh;
  indicatorHeightRing: THREE.Mesh;
  cars: Array<THREE.Group | null>;
  pA: THREE.Vector3;
  pB: THREE.Vector3;
  qA: THREE.Quaternion;
  qB: THREE.Quaternion;
  _currBallView: BallStateView;
  _prevBallView: BallStateView;
  markRenderTreeChanged(): void;
}

export function createBallGroundIndicatorRings(
  scene: THREE.Scene,
  ballRadius: number
): { indicatorRing: THREE.Mesh; indicatorHeightRing: THREE.Mesh } {
  const ringRadius = ballRadius * 1.15;
  const ringGeom = new THREE.RingGeometry(ringRadius * 0.92, ringRadius, 48);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 16777215,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  });
  const indicatorRing = new THREE.Mesh(ringGeom, ringMat);
  const indicatorHeightRing = new THREE.Mesh(ringGeom, ringMat);
  for (const r of [indicatorRing, indicatorHeightRing]) {
    r.rotation.x = -Math.PI / 2;
    r.renderOrder = 2;
    scene.add(r);
  }
  return { indicatorRing, indicatorHeightRing };
}

/**
 * ArenaEnvironmentManager.ts
 * Manages stadium geometry switching (Driftwoods vs. Throwback), collision overlay meshes,
 * Driftwoods shader tuner synchronization, skybox/wall FX runtime config updates,
 * goal barrier visuals, ball ground indicator rings, and shadow receive flags across arena vehicles.
 */
export class ArenaEnvironmentManager {
  public readonly arena: ArenaEnvironmentHost;
  public stadiumVisible = true;
  public driftwoodsStadiumVisible = true;
  public driftwoodsStadium: THREE.Group | null = null;
  public driftwoodsManager: DriftwoodsMaterialManager | null = null;
  public pendingDriftwoodsConfig: Partial<DriftwoodsTunerConfig> | null = null;
  public throwbackStadium: THREE.Group | null = null;
  public throwbackCollisionOverlay: THREE.Group | null = null;
  public isThrowbackStadiumActive = false;
  public collisionOverlayRequested = false;

  constructor(arena: ArenaEnvironmentHost) {
    this.arena = arena;
  }

  public async loadArena(): Promise<void> {
    const h = this.arena;
    const meshes = await loadArenaStadiumMeshes();
    if (meshes.driftwoodsStadium) {
      this.driftwoodsStadium = meshes.driftwoodsStadium;
      this.driftwoodsManager = createDriftwoodsManager(this.driftwoodsStadium);
      if (this.pendingDriftwoodsConfig) {
        this.driftwoodsManager.applyConfig(this.pendingDriftwoodsConfig);
      }
      const teamCols = this.driftwoodsManager.getResolvedTeamColors?.();
      if (teamCols) {
        h.goalBarrierVisual?.setTeamColors?.(teamCols.blue, teamCols.orange);
      }
      this.driftwoodsStadiumVisible = true;
      if (!this.driftwoodsStadium.parent) {
        h.scene.add(this.driftwoodsStadium);
      }
      this.driftwoodsStadium.visible = Boolean(
        this.stadiumVisible && !this.isThrowbackStadiumActive
      );
    }
    h.markRenderTreeChanged();
  }

  public async setThrowbackStadiumActive(
    enabled: boolean,
    showCollisionOverlay = false
  ): Promise<void> {
    const h = this.arena;
    const next = Boolean(enabled);
    this.isThrowbackStadiumActive = next;
    h.goalVolumeHitboxVisual?.setArenaPreset(next);
    if (next) {
      if (!this.throwbackStadium) {
        this.throwbackStadium = await loadThrowbackStadiumField();
      }
      if (this.throwbackStadium && !this.throwbackStadium.parent) {
        h.scene.add(this.throwbackStadium);
      }
      if (this.throwbackStadium) {
        this.throwbackStadium.visible = Boolean(this.stadiumVisible);
      }
      if (this.driftwoodsStadium) {
        this.driftwoodsStadium.visible = false;
      }
      await this.setThrowbackCollisionVisible(showCollisionOverlay);
    } else {
      if (this.throwbackStadium) this.throwbackStadium.visible = false;
      if (this.throwbackCollisionOverlay) this.throwbackCollisionOverlay.visible = false;
      if (this.driftwoodsStadium) {
        this.driftwoodsStadium.visible = Boolean(this.stadiumVisible);
      }
      this.collisionOverlayRequested = Boolean(showCollisionOverlay);
    }
    h.markRenderTreeChanged();
  }

  public async setThrowbackCollisionVisible(visible: boolean): Promise<void> {
    const h = this.arena;
    const next = Boolean(visible);
    this.collisionOverlayRequested = next;
    if (next && this.isThrowbackStadiumActive) {
      if (!this.throwbackCollisionOverlay) {
        this.throwbackCollisionOverlay = await loadThrowbackCollisionOverlay();
      }
      if (this.throwbackCollisionOverlay && !this.throwbackCollisionOverlay.parent) {
        h.scene.add(this.throwbackCollisionOverlay);
      }
    }
    if (this.throwbackCollisionOverlay) {
      this.throwbackCollisionOverlay.visible = Boolean(next && this.isThrowbackStadiumActive);
    }
    h.markRenderTreeChanged();
  }

  public updateDriftwoodsTuner(config: Partial<DriftwoodsTunerConfig> | null | undefined): void {
    if (!config) return;
    this.pendingDriftwoodsConfig = config;
    this.driftwoodsManager?.applyConfig(config);
    const teamCols = this.driftwoodsManager?.getResolvedTeamColors?.();
    if (teamCols) {
      this.arena.goalBarrierVisual?.setTeamColors?.(teamCols.blue, teamCols.orange);
    }
  }

  public setStadiumVisible(visible: boolean): void {
    const h = this.arena;
    if (this.stadiumVisible !== visible) {
      this.stadiumVisible = visible;
      if (h.sky) {
        visible ? h.scene.add(h.sky) : h.sky.removeFromParent?.();
      }
      const activeStadium = this.isThrowbackStadiumActive
        ? this.throwbackStadium
        : this.driftwoodsStadium;
      if (activeStadium) {
        activeStadium.visible = Boolean(visible);
      }
      h.scene.background = new THREE.Color(visible ? 4679561 : 0);
      h.markRenderTreeChanged();
    }
    if (this.isThrowbackStadiumActive && this.driftwoodsStadium) {
      this.driftwoodsStadium.visible = false;
    }
  }

  public updateExperimentalWallConfig(patch: Partial<ExperimentalWallFxConfig>): void {
    setExperimentalWallFxRuntimeConfig(patch);
    this.driftwoodsManager?.updateExperimentalWallConfig?.(patch);
  }

  public updateSkyboxConfig(patch: Partial<SkyboxConfig>): void {
    updateSkyboxConfig(patch);
    if (patch && typeof patch.enabled === 'boolean' && this.arena.sky) {
      this.arena.sky.visible = Boolean(patch.enabled);
    }
  }

  public updateShadowConfig(
    patch: Partial<ShadowConfig>,
    renderer: THREE.WebGLRenderer | null = null
  ): void {
    const h = this.arena;
    updateShadowRuntimeConfig(patch);
    h.lighting?.updateShadowConfig?.(patch, renderer);
    if (patch && typeof patch.carsReceiveShadows === 'boolean' && Array.isArray(h.cars)) {
      const receive = Boolean(patch.carsReceiveShadows);
      for (const carRoot of h.cars) {
        if (!carRoot) continue;
        carRoot.traverse?.((node: TraversableMaterialNode) => {
          if (node.isMesh && node.castShadow) {
            node.receiveShadow = receive;
            if (node.material) {
              for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
                if (m) m.needsUpdate = true;
              }
            }
          }
        });
      }
    }
  }

  public updateBallVisualConfig(patch: Partial<BallVisualConfig>): void {
    const h = this.arena;
    updateBallVisualConfig(patch, h.ball, [h.indicatorRing, h.indicatorHeightRing]);
    h.markRenderTreeChanged();
  }

  public updateGoalBarrier(
    decomposition: GoalBarrierDecomposition | null | undefined,
    targetGoal: GoalBarrierTargetGoal = 'both',
    enabled = false,
    opacity = 0.55
  ): void {
    this.arena.goalBarrierVisual?.updateConfig(decomposition, targetGoal, enabled, opacity);
    this.arena.markRenderTreeChanged();
  }

  public stepBallAndEnvironmentVisuals(
    prevState: NumericStateBuffer | null,
    currState: NumericStateBuffer | null,
    alpha: number,
    actualDelta: number
  ): void {
    const h = this.arena;
    const currBall = h._currBallView.attach(currState);
    const prevBall = h._prevBallView.attach(prevState);
    const isHidden = (s: NumericStateBuffer | null, bv: BallStateView): boolean => {
      if (!s) return false;
      const flags =
        s.length > EXTENDED_STATE_OFFSETS.IS_BALL_SLEEPING
          ? Math.round(Number(s[EXTENDED_STATE_OFFSETS.IS_BALL_SLEEPING]) || 0)
          : 0;
      return (flags & 2) !== 0 || bv.posZ < -100;
    };

    const currHidden = isHidden(currState, currBall);
    const isRespawning = !currHidden && (!h.ball.visible || isHidden(prevState, prevBall));
    h.ball.visible = !currHidden;
    h.indicatorRing.visible = !currHidden;
    h.indicatorHeightRing.visible = !currHidden;
    if (currHidden) {
      h.ballVelocity.set(0, 0, 0);
      h.ballSpeedTrail?.reset?.();
      h.goalBarrierVisual?.update?.(actualDelta);
      return;
    }

    if (isRespawning) h.ballSpeedTrail?.reset?.();
    interpolatePhysicsTransform(
      h.ball,
      isRespawning ? currBall : prevBall,
      currBall,
      isRespawning ? 1 : alpha,
      undefined,
      h.pA,
      h.pB,
      h.qA,
      h.qB
    );
    unrealToThreeCoords(h.ballVelocity, currBall.velX, currBall.velY, currBall.velZ);
    h.ballSpeedTrail?.update(h.ball.position, h.ballVelocity, actualDelta);

    const ballPos = h.ball.position;
    updateBallGoalEffect(h.ball, Boolean(this.isThrowbackStadiumActive), actualDelta);
    this.driftwoodsManager?.updateBallProximity?.(ballPos, h.ballVelocity, actualDelta);
    h.goalBarrierVisual?.update?.(actualDelta);
    h.indicatorRing.position.set(ballPos.x, 2, ballPos.z);
    h.indicatorHeightRing.position.set(ballPos.x, 2, ballPos.z);
    const height = Math.max(0, ballPos.y - h.ballRadius);
    const scale = 0.86 - 0.68 * Math.min(1, height / 1600);
    h.indicatorHeightRing.scale.set(scale, scale, 1);
  }

  public disposeEnvironmentMeshes(): void {
    const h = this.arena;
    const disposeMaterialSlot = (
      material: THREE.Material | THREE.Material[] | null | undefined
    ) => {
      if (!material) return;
      for (const mat of Array.isArray(material) ? material : [material]) mat?.dispose?.();
    };
    for (const item of [h.sky, h.indicatorRing, h.indicatorHeightRing]) {
      item?.geometry?.dispose?.();
      disposeMaterialSlot(item?.material);
    }
    for (const obj of [h.ball, this.driftwoodsStadium]) {
      obj?.traverse?.((node: TraversableMaterialNode) => {
        node.geometry?.dispose?.();
        disposeMaterialSlot(node.material);
      });
    }
    if (h.scene) {
      while (h.scene.children?.length > 0) {
        h.scene.remove(h.scene.children[0]);
      }
    }
  }
}
