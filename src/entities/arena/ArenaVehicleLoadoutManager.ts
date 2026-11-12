import * as THREE from 'three';
import { applyVehiclePaint, type TraversableMaterialNode } from './VehiclePaint.ts';
import { DEFAULT_TEAM_COLORS, OCTANE_HITBOX_PRESET } from './ArenaConstants.ts';
import { getWheelSpecsForVisual } from '../VehicleSuspensionSystem.ts';
import { HITBOX_PRESETS } from '../../ui-core/config/vehiclePresets.ts';
import {
  getVehicleDescriptor,
  hasVehicleDescriptor,
} from '../../ui-core/config/vehicleTunerConfig.ts';
import {
  applyLiveVehicleDescriptorUpdate,
  getCachedCustomVehicleAsset,
} from '../vehicle/customGlbCarModel.ts';
import {
  applyVehicleAlignPresetToDescriptor,
  importCustomVehicleGlbBuffer,
  type CustomGlbImportResult,
} from '../vehicle/customGlbImporter.ts';
import { createCarHitboxWireframe } from './ArenaMath.ts';
import type { VehicleBoostEmitter } from '../vehicle/boost/vehicleBoostEmitter.ts';
import type { PerformanceBoostColorParams } from '../../ui-core/config/performanceBoostConfig.ts';

export interface VehicleWheelRig {
  steer: THREE.Group;
  spin: THREE.Group;
}
export type VehicleWheelSet = VehicleWheelRig[] & { threeWheels?: boolean };
export type WheelSpecTuple = [number, number, number];

export interface CarLoadoutConfig {
  visualId?: string | null;
  visual?: string | null;
  paintFinish?: string | null;
  colorHex?: string | number | null;
  boostVisual?: string | null;
  boostAudio?: string | null;
  isBot?: boolean;
  boostColorParams?: PerformanceBoostColorParams | null;
}

export interface VehicleLoadoutTarget {
  cars: Array<THREE.Group | null>;
  vehiclePresets: Array<string | null>;
  carHitboxes: Array<THREE.LineSegments | THREE.Object3D | null>;
  carWheels: Array<VehicleWheelSet | null>;
  carWheelSpecs: Array<WheelSpecTuple[] | null>;
  carBoosts: Array<VehicleBoostEmitter[] | null>;
  carTeams?: number[];
  customVehicleAssets: Map<string, unknown>;
  carLoaders: {
    teamColors?: number[];
    createProceduralSportWheel?: (
      radius: number,
      teamColor: number,
      wheelIndex: number
    ) => THREE.Object3D;
  };
  onRenderTreeChanged?: () => void;
  isCarHitboxVisibleForSlot(slot: number): boolean;
  swapCarVisual(carIndex: number, newVisual: string): boolean;
}

export function disposeObjectGeometryAndMaterials(root: THREE.Object3D): void {
  root.traverse?.((node: TraversableMaterialNode) => {
    let inSharedGlbShell = false;
    let p: THREE.Object3D | null = node;
    while (p) {
      if (p.name?.endsWith?.('-shell')) {
        inSharedGlbShell = true;
        break;
      }
      p = p.parent;
    }
    if (!inSharedGlbShell) {
      node.geometry?.dispose?.();
    }
    if (node.material) {
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const m of mats) m?.dispose?.();
    }
  });
}

/**
 * ArenaVehicleLoadoutManager.ts
 * Manages per-car cosmetic paint colors, paint finishes (metallic/matte),
 * boost emitter visual presets, ghost material opacity, live vehicle descriptor refresh,
 * and aggregate loadout configuration.
 */
export class ArenaVehicleLoadoutManager {
  public readonly registry: VehicleLoadoutTarget;
  public carColors: Array<number | null | undefined>;
  public carPaintFinishes: Array<string | null>;
  public carBoostVisuals: Array<string | null>;
  public carBoostAudios: Array<string | null>;

  constructor(registry: VehicleLoadoutTarget) {
    this.registry = registry;
    this.carColors = [];
    this.carPaintFinishes = [];
    this.carBoostVisuals = [];
    this.carBoostAudios = [];
  }

  public applySlotPaintOrColor(slot: number, fallbackTeamColor: number): void {
    const carRoot = this.registry.cars[slot];
    if (!carRoot) return;
    const activeColor =
      this.carColors[slot] !== undefined && this.carColors[slot] !== null
        ? this.carColors[slot]
        : fallbackTeamColor;
    applyVehiclePaint(
      carRoot,
      this.registry.vehiclePresets[slot],
      activeColor,
      this.carPaintFinishes[slot] || null
    );
    const emitters = this.registry.carBoosts?.[slot];
    if (Array.isArray(emitters)) {
      for (const emitter of emitters) {
        emitter?.setCarColor?.(activeColor);
      }
    }
  }

  public setCarColor(carIndex: number, colorVal: string | number | null | undefined): void {
    const num = typeof colorVal === 'string' ? parseInt(colorVal.replace('#', ''), 16) : colorVal;
    const emitters = this.registry.carBoosts?.[carIndex];
    if (Array.isArray(emitters)) {
      for (const emitter of emitters) {
        emitter?.setCarColor?.(num);
      }
    }
    if (this.carColors[carIndex] === num) return;
    this.carColors[carIndex] = num;
    const carRoot = this.registry.cars[carIndex];
    if (!carRoot) return;

    applyVehiclePaint(
      carRoot,
      this.registry.vehiclePresets?.[carIndex],
      num,
      this.carPaintFinishes?.[carIndex] || null
    );
    this.registry.onRenderTreeChanged?.();
  }

  public setCarPaintFinish(carIndex: number, paintFinish: string | null): void {
    if (typeof carIndex !== 'number' || carIndex < 0) return;
    const normalized = paintFinish === 'metallic' || paintFinish === 'matte' ? paintFinish : null;
    if (this.carPaintFinishes[carIndex] === normalized) return;
    this.carPaintFinishes[carIndex] = normalized;
    const carRoot = this.registry.cars?.[carIndex];
    if (!carRoot) return;
    const teamIndex = this.registry.carTeams?.[carIndex] ?? carIndex % 2;
    const activeColor =
      this.carColors?.[carIndex] !== undefined && this.carColors?.[carIndex] !== null
        ? this.carColors[carIndex]
        : (this.registry.carLoaders.teamColors?.[teamIndex] ?? DEFAULT_TEAM_COLORS[teamIndex % 2]);
    applyVehiclePaint(carRoot, this.registry.vehiclePresets?.[carIndex], activeColor, normalized);
    this.registry.onRenderTreeChanged?.();
  }

  public setCarBoostVisual(carIndex: number, boostVisual: string | null): void {
    if (typeof carIndex !== 'number' || carIndex < 0) return;
    const normalized =
      boostVisual === 'cartoon' ||
      boostVisual === 'gold-rush' ||
      boostVisual === 'light-beam' ||
      boostVisual === 'light-wave' ||
      boostVisual === 'custom'
        ? boostVisual
        : null;
    this.carBoostVisuals[carIndex] = normalized;
    const emitters = this.registry.carBoosts?.[carIndex];
    if (Array.isArray(emitters)) {
      for (const emitter of emitters) {
        emitter?.setBoostVisual?.(normalized);
      }
    }
  }

  public setCarLoadout(carIndex: number, loadout: CarLoadoutConfig | null | undefined = {}): void {
    if (typeof carIndex !== 'number' || carIndex < 0 || !loadout) return;
    if (loadout.visualId || loadout.visual) {
      const targetVisual = (loadout.visualId || loadout.visual)!;
      if (
        this.registry.cars?.[carIndex] &&
        this.registry.vehiclePresets?.[carIndex] !== targetVisual
      ) {
        this.registry.swapCarVisual(carIndex, targetVisual);
      }
    }
    if (loadout.paintFinish !== undefined) {
      this.setCarPaintFinish(carIndex, loadout.paintFinish);
    }
    if (loadout.colorHex !== undefined && loadout.colorHex !== null) {
      this.setCarColor(carIndex, loadout.colorHex);
    }
    if (loadout.isBot !== undefined) {
      const emitters = this.registry.carBoosts?.[carIndex];
      if (Array.isArray(emitters)) {
        for (const emitter of emitters) {
          emitter?.setIsBot?.(Boolean(loadout.isBot));
        }
      }
    }
    if (loadout.boostColorParams !== undefined) {
      const emitters = this.registry.carBoosts?.[carIndex];
      if (Array.isArray(emitters)) {
        for (const emitter of emitters) {
          emitter?.setBoostColorParams?.(loadout.boostColorParams);
        }
      }
    }
    if (loadout.boostVisual !== undefined) {
      this.setCarBoostVisual(carIndex, loadout.boostVisual);
    }
    if (loadout.boostAudio !== undefined) {
      this.carBoostAudios[carIndex] = loadout.boostAudio || null;
    }
  }

  public setCarGhostOpacity(carIndex: number, isGhost = true, opacity = 0.7): boolean {
    const carRoot = this.registry.cars?.[carIndex];
    if (!carRoot) return false;
    const clampedOpacity = Math.max(0.1, Math.min(1.0, opacity));
    carRoot.traverse?.((node: TraversableMaterialNode) => {
      if (!node?.material) return;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const mat of mats) {
        if (!mat) continue;
        if (mat.userData === undefined) mat.userData = {};
        if (mat.userData._origTransparent === undefined) {
          mat.userData._origTransparent = Boolean(mat.transparent);
          mat.userData._origOpacity = typeof mat.opacity === 'number' ? mat.opacity : 1.0;
        }
        if (isGhost && clampedOpacity < 1.0) {
          mat.transparent = true;
          mat.opacity = clampedOpacity;
        } else {
          mat.transparent = Boolean(mat.userData._origTransparent);
          mat.opacity = Number(mat.userData._origOpacity);
        }
        mat.needsUpdate = true;
      }
    });
    this.registry.onRenderTreeChanged?.();
    return true;
  }

  public clearAllGhostOpacities(): void {
    for (let i = 0; i < this.registry.cars.length; i++) {
      if (this.registry.cars[i]) this.setCarGhostOpacity(i, false, 1.0);
    }
  }

  public resetCarBoosts(carIndex: number | null = null): void {
    const boosts = this.registry.carBoosts;
    if (typeof carIndex === 'number') {
      const list = boosts?.[carIndex];
      if (Array.isArray(list)) {
        for (const emitter of list) emitter?.resetVisual?.();
      }
      return;
    }
    if (!Array.isArray(boosts)) return;
    for (const list of boosts) {
      if (Array.isArray(list)) {
        for (const emitter of list) emitter?.resetVisual?.();
      }
    }
  }

  public hasActiveBoostBloom(): boolean {
    const boosts = this.registry.carBoosts;
    if (!Array.isArray(boosts)) return false;
    for (const group of boosts) {
      if (
        Array.isArray(group) &&
        group.some((emitter: VehicleBoostEmitter) => emitter?.bloomActive)
      ) {
        return true;
      }
    }
    return false;
  }

  public refreshCustomVehicle(vehicleId?: string): void {
    const h = this.registry;
    const targetDescriptor = vehicleId ? getVehicleDescriptor(vehicleId) : null;

    for (let i = 0; i < h.cars.length; i++) {
      const carRoot = h.cars[i];
      if (!carRoot) continue;
      const preset = h.vehiclePresets[i];
      const teamIndex = h.carTeams?.[i] ?? i % 2;
      const teamColor =
        this.carColors[i] ??
        h.carLoaders.teamColors?.[teamIndex] ??
        DEFAULT_TEAM_COLORS[teamIndex % 2];
      const carDesc = hasVehicleDescriptor(preset || '')
        ? getVehicleDescriptor(preset || '')
        : preset === vehicleId
          ? targetDescriptor
          : null;
      const descIdLower = carDesc ? String(carDesc.id).toLowerCase() : '';
      let hasLoadedCustomAsset = Boolean(carDesc && h.customVehicleAssets.has(descIdLower));
      if (carDesc && !hasLoadedCustomAsset) {
        const cachedAsset = getCachedCustomVehicleAsset(descIdLower);
        if (cachedAsset) {
          h.customVehicleAssets.set(descIdLower, cachedAsset);
          hasLoadedCustomAsset = true;
        }
      }

      if (carDesc && hasLoadedCustomAsset) {
        const bodyMesh = carRoot.children?.find((c) => c.name === 'car-body-mesh');
        const hasInstantiatedShell = Boolean(bodyMesh?.getObjectByName?.(`${carDesc.id}-shell`));
        const currentThreeWheels = Boolean(h.carWheels[i]?.threeWheels);
        const desiredThreeWheels = Boolean(
          carDesc.threeWheels ||
          carDesc.id === 'trioctane-threewheel' ||
          carDesc.hitboxPreset === 'hitbox-psyclops'
        );
        if ((!hasInstantiatedShell || currentThreeWheels !== desiredThreeWheels) && preset) {
          h.swapCarVisual(i, preset);
          continue;
        }
        h.carWheelSpecs[i] = getWheelSpecsForVisual(preset) as WheelSpecTuple[];
        applyLiveVehicleDescriptorUpdate(
          carRoot,
          h.carHitboxes[i],
          h.carWheels[i],
          h.carBoosts[i],
          carDesc,
          teamColor,
          this.carPaintFinishes[i] || null
        );

        const oldHitbox = h.carHitboxes[i] as TraversableMaterialNode | null;
        if (oldHitbox) {
          carRoot.remove(oldHitbox);
          oldHitbox.geometry?.dispose?.();
          if (oldHitbox.material) {
            for (const m of Array.isArray(oldHitbox.material)
              ? oldHitbox.material
              : [oldHitbox.material]) {
              m?.dispose?.();
            }
          }
          const hbPreset =
            (HITBOX_PRESETS as Record<string, typeof OCTANE_HITBOX_PRESET>)[carDesc.hitboxPreset] ||
            OCTANE_HITBOX_PRESET;
          const nextHitbox = createCarHitboxWireframe(hbPreset);
          nextHitbox.name = 'car-hitbox-wireframe';
          nextHitbox.visible = h.isCarHitboxVisibleForSlot(i);
          carRoot.add(nextHitbox);
          h.carHitboxes[i] = nextHitbox;
        }
      } else if (h.carWheels[i] && h.carLoaders.createProceduralSportWheel) {
        applyVehiclePaint(carRoot, preset, teamColor, this.carPaintFinishes[i] || null);
        const specs = h.carWheelSpecs[i] || (getWheelSpecsForVisual(preset) as WheelSpecTuple[]);
        const wheels = h.carWheels[i]!;
        for (let w = 0; w < wheels.length; w++) {
          const spinGroup = wheels[w]?.spin;
          if (!spinGroup) continue;
          while (spinGroup.children.length > 0) {
            const oldChild = spinGroup.children[0];
            spinGroup.remove(oldChild);
            disposeObjectGeometryAndMaterials(oldChild);
          }
          const r = specs?.[w]?.[2] || 13.5;
          spinGroup.add(h.carLoaders.createProceduralSportWheel(r, teamColor, w));
        }
      }
    }
    h.onRenderTreeChanged?.();
  }

  public async importCustomVehicleGlb(
    vehicleId: string,
    arrayBuffer: ArrayBuffer,
    fileName = 'custom.glb',
    alignPreset = 'auto'
  ): Promise<CustomGlbImportResult> {
    const result = await importCustomVehicleGlbBuffer(
      vehicleId,
      arrayBuffer,
      fileName,
      alignPreset
    );
    const asset = getCachedCustomVehicleAsset(result.vehicleId);
    if (asset) {
      this.registry.customVehicleAssets.set(result.vehicleId, asset);
    }
    for (let i = 0; i < this.registry.cars.length; i++) {
      if (this.registry.cars[i] && this.registry.vehiclePresets[i] === result.vehicleId) {
        this.registry.swapCarVisual(i, result.vehicleId);
      }
    }
    this.refreshCustomVehicle(result.vehicleId);
    return result;
  }

  public applyVehicleAlignPreset(vehicleId: string, alignPreset: string): boolean {
    const targetId = String(vehicleId || '')
      .toLowerCase()
      .trim();
    const res = applyVehicleAlignPresetToDescriptor(targetId, alignPreset);
    if (!res) return false;
    const asset = getCachedCustomVehicleAsset(targetId);
    if (asset) {
      this.registry.customVehicleAssets.set(targetId, asset);
    }
    for (let i = 0; i < this.registry.cars.length; i++) {
      if (this.registry.cars[i] && this.registry.vehiclePresets[i] === targetId) {
        this.registry.swapCarVisual(i, targetId);
      }
    }
    this.refreshCustomVehicle(targetId);
    return true;
  }
}
