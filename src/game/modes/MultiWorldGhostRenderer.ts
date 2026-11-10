/**
 * MultiWorldGhostRenderer.ts
 * Renders an arbitrary number of parallel Ghost Worlds (World 2, World 3, ..., World N)
 * inside the primary Three.js arena scene without duplicating stadium geometry or colliding
 * with local physics.
 */

import * as THREE from 'three';
import {
  type VehicleAssetStore,
  type VehicleLoaderCallbacks,
} from '../../entities/arena/VehicleFactory.ts';
import { updateCarSuspensionAndSteering } from '../../entities/VehicleSuspensionSystem.ts';
import { CarStateView, BallStateView } from '../../physics/RocketSimStateViews.ts';
import { SIM_OFFSETS, MAX_CARS } from '../../physics/RocketSimConstants.ts';
import {
  applyPaletteToGhostMaterials,
  buildHolographicGhostBallAndRing,
  buildHolographicGhostCarHierarchy,
  interpolateSignedTransform,
  resolveGhostWorldPalette,
  type GhostSuspensionList,
  type GhostWheelMountList,
  type GhostWheelSpecList,
  type GhostWorldPalette,
} from './shared/ghostWorldVisualsPipeline.ts';

export type MultiWorldWheelMountList = GhostWheelMountList;
export type MultiWorldWheelSpecList = GhostWheelSpecList;
export type MultiWorldSuspensionList = GhostSuspensionList;
export type { GhostWorldPalette };

export interface MultiWorldGhostArenaPort {
  scene?: THREE.Scene | null;
  vehicleRegistry?: {
    assets?: VehicleAssetStore;
    carLoaders?: VehicleLoaderCallbacks & {
      wheelSpecs?: { game?: MultiWorldWheelSpecList };
    };
  } | null;
  onRenderTreeChanged?: () => void;
}

export interface GhostCarSlotEntry {
  slotIndex: number;
  visual: string;
  root: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
  lineMaterials: THREE.LineBasicMaterial[];
  wheels: MultiWorldWheelMountList;
  wheelSpecs: MultiWorldWheelSpecList;
  suspension: MultiWorldSuspensionList;
  wheelSpin: number[];
  boostPlume: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  prevCarView: CarStateView;
  currCarView: CarStateView;
}

export interface GhostWorldEntry {
  worldId: string | number;
  worldIndex: number;
  palette: GhostWorldPalette;
  opacity: number;
  placement: 'same' | 'opposite';
  showCar: boolean;
  showBall: boolean;
  visible: boolean;
  cars: Array<GhostCarSlotEntry | null>;
  ballMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  ballRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  prevBallView: BallStateView;
  currBallView: BallStateView;
}

export interface GhostWorldUpdateOptions {
  paletteIndex?: number;
  palette?: GhostWorldPalette;
  opacity?: number;
  placement?: 'same' | 'opposite';
  showCar?: boolean;
  showBall?: boolean;
  visual?: string;
  excludeCarIndices?: Set<number> | number[];
  getCarControls?: (carIdx: number) => { throttle?: number } | null | undefined;
  carControls?: Array<{ throttle?: number } | null | undefined>;
  controls?: { throttle?: number } | null;
}

export class MultiWorldGhostRenderer {
  public arena: MultiWorldGhostArenaPort | null;
  public scene: THREE.Scene | null;
  public worlds = new Map<string | number, GhostWorldEntry>();
  public visible = false;
  public showCar = true;
  public showBall = true;
  public defaultOpacity = 0.45;
  public ghostPlacement: 'same' | 'opposite' = 'same';

  constructor(arena: MultiWorldGhostArenaPort | null) {
    this.arena = arena;
    this.scene = arena?.scene || null;
  }

  private _getTargetWorlds(worldId: string | number | null): GhostWorldEntry[] {
    if (worldId === null) return Array.from(this.worlds.values());
    const found = this.worlds.get(worldId);
    return found ? [found] : [];
  }

  private _buildGhostCarSlot(
    worldEntry: GhostWorldEntry,
    slotIndex: number,
    visual = 'fennec'
  ): GhostCarSlotEntry | null {
    if (!this.arena?.scene) return null;
    const scene = this.arena.scene as THREE.Scene;
    this.scene = scene;

    const built = buildHolographicGhostCarHierarchy({
      name: `ghost-world-${worldEntry.worldId}-car-${slotIndex}`,
      visual,
      palette: worldEntry.palette,
      opacity: worldEntry.opacity,
      registry: this.arena.vehicleRegistry,
    });
    built.root.visible = false;
    scene.add(built.root);

    const slotObj: GhostCarSlotEntry = {
      slotIndex,
      visual,
      root: built.root,
      materials: built.materials,
      lineMaterials: built.lineMaterials,
      wheels: built.wheels,
      wheelSpecs: built.wheelSpecs,
      suspension: [],
      wheelSpin: [0, 0, 0, 0],
      boostPlume: built.boostPlume,
      prevCarView: new CarStateView(),
      currCarView: new CarStateView(),
    };

    worldEntry.cars[slotIndex] = slotObj;
    this.arena.onRenderTreeChanged?.();
    return slotObj;
  }

  public ensureWorld(
    worldId: string | number = 'world-1',
    options: GhostWorldUpdateOptions = {}
  ): GhostWorldEntry | null {
    const existing = this.worlds.get(worldId);
    if (existing) return existing;
    if (!this.arena?.scene) return null;
    const scene = this.arena.scene as THREE.Scene;
    this.scene = scene;

    const worldIndex =
      typeof options.paletteIndex === 'number' ? options.paletteIndex : this.worlds.size;
    const placement = options.placement || this.ghostPlacement;
    const palette = options.palette || resolveGhostWorldPalette(worldIndex, placement);
    const opacity = typeof options.opacity === 'number' ? options.opacity : this.defaultOpacity;

    const builtBall = buildHolographicGhostBallAndRing({
      name: `ghost-world-${worldId}-ball`,
      palette,
      ballOpacity: opacity * 0.85,
      ringOpacity: opacity * 0.85,
    });
    builtBall.ballMesh.visible = false;
    builtBall.ballRing.visible = false;
    scene.add(builtBall.ballMesh, builtBall.ballRing);

    const worldEntry: GhostWorldEntry = {
      worldId,
      worldIndex,
      palette,
      opacity,
      placement,
      showCar: options.showCar !== undefined ? Boolean(options.showCar) : this.showCar,
      showBall: options.showBall !== undefined ? Boolean(options.showBall) : this.showBall,
      visible: this.visible,
      cars: new Array(MAX_CARS).fill(null),
      ballMesh: builtBall.ballMesh,
      ballRing: builtBall.ballRing,
      prevBallView: new BallStateView(),
      currBallView: new BallStateView(),
    };

    this.worlds.set(worldId, worldEntry);
    this._buildGhostCarSlot(worldEntry, 0, options.visual || 'fennec');
    this.arena.onRenderTreeChanged?.();
    return worldEntry;
  }

  public ensureBuilt(): GhostWorldEntry | null {
    return this.ensureWorld('world-1');
  }

  public get ghostCarMaterials(): THREE.MeshStandardMaterial[] {
    const mats: THREE.MeshStandardMaterial[] = [];
    for (const w of this.worlds.values()) {
      for (const c of w.cars) {
        if (c?.materials) mats.push(...c.materials);
      }
    }
    return mats;
  }

  public get ghostBallMesh(): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null {
    return this.worlds.get('world-1')?.ballMesh || null;
  }

  public setOpacity(opacity: number, worldId: string | number | null = null): void {
    const clamped = Math.max(0.05, Math.min(0.95, Number(opacity) || 0.45));
    if (worldId === null) this.defaultOpacity = clamped;
    for (const w of this._getTargetWorlds(worldId)) {
      w.opacity = clamped;
      for (const c of w.cars) {
        if (!c) continue;
        for (const mat of c.materials) mat.opacity = clamped;
        for (const lmat of c.lineMaterials) lmat.opacity = Math.min(0.95, clamped + 0.2);
        if (c.boostPlume?.material) c.boostPlume.material.opacity = Math.min(0.9, clamped + 0.2);
      }
      if (w.ballMesh?.material) w.ballMesh.material.opacity = clamped * 0.85;
      if (w.ballRing?.material) w.ballRing.material.opacity = clamped * 0.85;
    }
  }

  public setGhostPlacement(
    placement: string = 'same',
    worldId: string | number | null = null
  ): void {
    const next: 'same' | 'opposite' = placement === 'opposite' ? 'opposite' : 'same';
    if (worldId === null) this.ghostPlacement = next;
    for (const w of this._getTargetWorlds(worldId)) {
      w.placement = next;
      w.palette = resolveGhostWorldPalette(w.worldIndex, next);
      for (const c of w.cars) {
        if (!c) continue;
        applyPaletteToGhostMaterials(w.palette, c.materials, c.lineMaterials, c.boostPlume);
      }
      applyPaletteToGhostMaterials(w.palette, [], [], null, w.ballMesh, w.ballRing);
    }
  }

  public setEntityVisibility(
    showCar: boolean,
    showBall: boolean,
    worldId: string | number | null = null
  ): void {
    if (worldId === null) {
      this.showCar = Boolean(showCar);
      this.showBall = Boolean(showBall);
    }
    for (const w of this._getTargetWorlds(worldId)) {
      w.showCar = Boolean(showCar);
      w.showBall = Boolean(showBall);
    }
    this.setVisible(this.visible, worldId);
  }

  public setVisible(visible: boolean, worldId: string | number | null = null): void {
    if (worldId === null) this.visible = Boolean(visible);
    for (const w of this._getTargetWorlds(worldId)) {
      w.visible = Boolean(visible);
      if (!w.visible) {
        for (const c of w.cars) {
          if (c?.root) c.root.visible = false;
          if (c?.boostPlume) c.boostPlume.visible = false;
        }
        if (w.ballMesh) w.ballMesh.visible = false;
        if (w.ballRing) w.ballRing.visible = false;
      }
    }
  }

  public updateWorld(
    worldId: string | number,
    prevState: Float32Array | null | undefined,
    currState: Float32Array | null | undefined,
    alpha = 1.0,
    dt = 0.016,
    options: GhostWorldUpdateOptions = {}
  ): void {
    if (!prevState || !currState) return;
    const worldEntry = this.ensureWorld(worldId, options);
    if (!worldEntry || !worldEntry.visible) return;

    const xySign = worldEntry.placement === 'opposite' ? -1.0 : 1.0;
    const rawNumCars = Math.round(currState[SIM_OFFSETS.NUM_CARS] || 1);
    const numCars = Math.min(MAX_CARS, Math.max(0, rawNumCars));
    const excludeSet =
      options.excludeCarIndices instanceof Set
        ? options.excludeCarIndices
        : Array.isArray(options.excludeCarIndices)
          ? new Set(options.excludeCarIndices)
          : null;

    if (worldEntry.showCar) {
      for (let c = 0; c < MAX_CARS; c++) {
        if (c >= numCars || (excludeSet && excludeSet.has(c))) {
          const existingRoot = worldEntry.cars[c]?.root;
          if (existingRoot) existingRoot.visible = false;
          continue;
        }

        let slotObj = worldEntry.cars[c];
        if (!slotObj) slotObj = this._buildGhostCarSlot(worldEntry, c, 'fennec');
        if (!slotObj?.root) continue;

        const prevCar = slotObj.prevCarView.attachCar(prevState, c);
        const currCar = slotObj.currCarView.attachCar(currState, c);

        const isZeroedSlot =
          currCar.fwdX * currCar.fwdX + currCar.fwdY * currCar.fwdY + currCar.fwdZ * currCar.fwdZ <
          0.01;
        if (isZeroedSlot || currCar.posZ <= -200 || currCar.posX < -5000 || currCar.isDemoed) {
          slotObj.root.visible = false;
          continue;
        }

        slotObj.root.visible = true;
        interpolateSignedTransform(slotObj.root, prevCar, currCar, alpha, xySign);

        const ctrlForCar =
          typeof options.getCarControls === 'function'
            ? options.getCarControls(c)
            : Array.isArray(options.carControls)
              ? options.carControls[c]
              : options.controls;

        updateCarSuspensionAndSteering(
          slotObj.wheels,
          slotObj.wheelSpecs,
          slotObj.suspension,
          slotObj.wheelSpin,
          currCar,
          slotObj.visual || 'fennec',
          dt,
          ctrlForCar?.throttle ?? 0
        );

        if (slotObj.boostPlume) {
          const boosting = Boolean(currCar.isBoosting && currCar.boost > 0);
          slotObj.boostPlume.visible = boosting;
          if (boosting) {
            const pulse = 0.85 + 0.3 * Math.sin(performance.now() * 0.04 + c);
            slotObj.boostPlume.scale.set(pulse, 1, pulse);
          }
        }
      }
    } else {
      for (let c = 0; c < MAX_CARS; c++) {
        const existingRoot = worldEntry.cars[c]?.root;
        if (existingRoot) existingRoot.visible = false;
      }
    }

    const showWorldBall =
      options.showBall !== undefined ? Boolean(options.showBall) : worldEntry.showBall;
    if (worldEntry.ballMesh && showWorldBall) {
      const prevBall = worldEntry.prevBallView.attach(prevState);
      const currBall = worldEntry.currBallView.attach(currState);
      worldEntry.ballMesh.visible = true;
      interpolateSignedTransform(worldEntry.ballMesh, prevBall, currBall, alpha, xySign);

      const ballSpeed = Math.hypot(currBall.velX, currBall.velY, currBall.velZ);
      if (worldEntry.ballMesh.material) {
        worldEntry.ballMesh.material.opacity =
          ballSpeed > 10
            ? Math.min(0.85, worldEntry.opacity * 0.9)
            : Math.max(0.15, worldEntry.opacity * 0.45);
      }

      if (worldEntry.ballRing) {
        const bp = worldEntry.ballMesh.position;
        worldEntry.ballRing.position.set(bp.x, 2.2, bp.z);
        worldEntry.ballRing.visible = ballSpeed > 10;
      }
    } else {
      if (worldEntry.ballMesh) worldEntry.ballMesh.visible = false;
      if (worldEntry.ballRing) worldEntry.ballRing.visible = false;
    }
  }

  public update(
    prevState: Float32Array | null | undefined,
    currState: Float32Array | null | undefined,
    alpha = 1.0,
    dt = 0.016,
    ghostControls: { throttle?: number } | null = null,
    showBall?: boolean
  ): void {
    this.updateWorld('world-1', prevState, currState, alpha, dt, {
      controls: ghostControls,
      showBall,
    });
  }

  public removeWorld(worldId: string | number): void {
    const w = this.worlds.get(worldId);
    if (!w) return;
    if (this.scene) {
      for (const c of w.cars) {
        if (c?.root) this.scene.remove(c.root);
      }
      if (w.ballMesh) this.scene.remove(w.ballMesh);
      if (w.ballRing) this.scene.remove(w.ballRing);
    }
    this.worlds.delete(worldId);
  }

  public dispose(): void {
    for (const worldId of Array.from(this.worlds.keys())) {
      this.removeWorld(worldId);
    }
  }
}

export default MultiWorldGhostRenderer;
