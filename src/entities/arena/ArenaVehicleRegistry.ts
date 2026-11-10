import * as THREE from 'three';
import type { VehicleBoostEmitter } from '../vehicle/boost/vehicleBoostEmitter.ts';
import type { DemolitionEffect } from '../DemolitionEffect.ts';
import { normalizeVisualId } from '../../ui-core/config/vehicleConstants.ts';
import {
  getVehicleDescriptor,
  hasVehicleDescriptor,
} from '../../ui-core/config/vehicleTunerConfig.ts';
import { createDefaultVehicleLoaders } from './VehicleFactory.ts';
import {
  ArenaVehicleLoadoutManager,
  disposeObjectGeometryAndMaterials,
  type CarLoadoutConfig,
  type VehicleWheelRig,
  type VehicleWheelSet,
  type WheelSpecTuple,
} from './ArenaVehicleLoadoutManager.ts';
import {
  applySlotCarGhostOpacity,
  disposeAndRemoveRegistrySlot,
  mountCarIntoRegistrySlot,
  rebuildRegistrySlotVisual,
  type SuspensionUnitVisual,
  type VehicleVisualInput,
  type VehicleVisualOptions,
} from './arenaVehicleSlotPipeline.ts';
import {
  clearAllRegistryGhostOpacities,
  ensureRegistryOpponentCar,
  ensureRegistrySlotCar,
  setRegistrySlotCarBoostVisual,
  setRegistrySlotCarColor,
  setRegistrySlotCarLoadout,
  setRegistrySlotCarPaintFinish,
  setRegistrySlotCarTeam,
} from './arenaVehicleCosmeticPipeline.ts';

export type {
  CarLoadoutConfig,
  SuspensionUnitVisual,
  VehicleVisualInput,
  VehicleVisualOptions,
  VehicleWheelRig,
  VehicleWheelSet,
  WheelSpecTuple,
};

export class ArenaVehicleRegistry {
  public scene: THREE.Scene;
  public onRenderTreeChanged?: () => void;
  public onEnsureOpponentSun?: () => void;
  public loadout: ArenaVehicleLoadoutManager;
  public cars: Array<THREE.Group | null>;
  public vehiclePresets: Array<string | null>;
  public carHitboxes: Array<THREE.LineSegments | THREE.Object3D | null>;
  public carHitboxesVisible: boolean;
  public allCarHitboxesVisible: boolean;
  public povCarIndex: number;
  public carSuspension: Array<SuspensionUnitVisual[] | null>;
  public carWheels: Array<VehicleWheelSet | null>;
  public carWheelSpecs: Array<WheelSpecTuple[] | null>;
  public wheelSpin: Array<number[]>;
  public carBoosts: Array<VehicleBoostEmitter[] | null>;
  public carDemolitions: Array<DemolitionEffect | null>;
  public carColors: Array<number | null | undefined>;
  public carPaintFinishes: Array<string | null>;
  public carBoostVisuals: Array<string | null>;
  public carBoostAudios: Array<string | null>;
  public carTeams: number[];
  public customVehicleAssets: Map<string, unknown>;
  public carLoaders: ReturnType<typeof createDefaultVehicleLoaders>;

  constructor(
    arenaScene: THREE.Scene,
    onRenderTreeChanged?: () => void,
    onEnsureOpponentSun?: () => void
  ) {
    this.scene = arenaScene;
    this.onRenderTreeChanged = onRenderTreeChanged;
    this.onEnsureOpponentSun = onEnsureOpponentSun;

    this.cars = [];
    this.vehiclePresets = [];
    this.carHitboxes = [];
    this.carHitboxesVisible = false;
    this.allCarHitboxesVisible = false;
    this.povCarIndex = 0;
    this.carSuspension = [];
    this.carWheels = [];
    this.carWheelSpecs = [];
    this.wheelSpin = [];
    this.carBoosts = [];
    this.carDemolitions = [];
    this.carTeams = [];

    this.customVehicleAssets = new Map<string, unknown>();
    this.carLoaders = createDefaultVehicleLoaders();
    this.loadout = new ArenaVehicleLoadoutManager(this);
    this.carColors = this.loadout.carColors;
    this.carPaintFinishes = this.loadout.carPaintFinishes;
    this.carBoostVisuals = this.loadout.carBoostVisuals;
    this.carBoostAudios = this.loadout.carBoostAudios;
  }

  isCarHitboxVisibleForSlot(slot: number): boolean {
    return Boolean(
      this.allCarHitboxesVisible || (this.carHitboxesVisible && slot === this.povCarIndex)
    );
  }

  get assets(): Map<string, unknown> {
    return this.customVehicleAssets;
  }

  setCustomVehicleAsset(vehicleId: string, asset: unknown): void {
    if (!vehicleId || !asset) return;
    const id = String(vehicleId).toLowerCase();
    this.customVehicleAssets.set(id, asset);
    for (let i = 0; i < this.cars.length; i++) {
      const carRoot = this.cars[i];
      if (carRoot && this.vehiclePresets[i] === id) {
        const body = carRoot.children.find((c) => c.name === 'car-body-mesh');
        if (!body?.getObjectByName(`${id}-shell`)) {
          this.swapCarVisual(i, id);
        }
      }
    }
  }

  _ensureAsyncCustomAsset(visual: string, _slot: number): void {
    const id = normalizeVisualId(visual);
    const desc = hasVehicleDescriptor(id) ? getVehicleDescriptor(id) : null;
    if (
      desc?.modelUrl &&
      !this.customVehicleAssets.has(id) &&
      this.carLoaders.loadCustomGlbCarAsset
    ) {
      this.carLoaders
        .loadCustomGlbCarAsset(id)
        .then((asset: unknown) => {
          this.setCustomVehicleAsset(id, asset);
        })
        .catch((err: unknown) => console.warn(`Lazy "${id}" asset load failed:`, err));
    }
  }

  addCar(
    teamIndex = 0,
    visualOrOptions: VehicleVisualInput = 'fennec',
    targetIndex: number | null = null
  ): THREE.Group {
    return mountCarIntoRegistrySlot(this, teamIndex, visualOrOptions, targetIndex);
  }

  ensureCar(
    carIndex: number,
    teamIndex: number | null = null,
    visualOrOptions: VehicleVisualInput = 'fennec'
  ): THREE.Group | null {
    return ensureRegistrySlotCar(this, carIndex, teamIndex, visualOrOptions);
  }

  setCarTeam(carIndex: number, teamIndex: number): void {
    setRegistrySlotCarTeam(this, carIndex, teamIndex);
  }

  swapCarVisual(carIndex: number, newVisual: VehicleVisualInput): boolean {
    return rebuildRegistrySlotVisual(this, carIndex, newVisual);
  }

  refreshCustomVehicle(vehicleId?: string): void {
    this.loadout.refreshCustomVehicle(vehicleId);
  }

  removeCar(carIndex: number): boolean {
    return disposeAndRemoveRegistrySlot(this, carIndex);
  }

  setCarColor(carIndex: number, colorVal: string | number | null | undefined): void {
    setRegistrySlotCarColor(this, carIndex, colorVal);
  }

  setCarPaintFinish(carIndex: number, paintFinish: string | null): void {
    setRegistrySlotCarPaintFinish(this, carIndex, paintFinish);
  }

  setCarBoostVisual(carIndex: number, boostVisual: string | null): void {
    setRegistrySlotCarBoostVisual(this, carIndex, boostVisual);
  }

  setCarLoadout(carIndex: number, loadout: CarLoadoutConfig | null | undefined = {}): void {
    setRegistrySlotCarLoadout(this, carIndex, loadout);
  }

  setCarHitboxesVisible(
    povVisible: boolean,
    allVisible: boolean = this.allCarHitboxesVisible,
    povCarIndex: number = this.povCarIndex
  ): void {
    this.carHitboxesVisible = Boolean(povVisible);
    this.allCarHitboxesVisible = Boolean(allVisible);
    this.syncCarHitboxesVisibility(povCarIndex);
  }

  syncCarHitboxesVisibility(povCarIndex: number = this.povCarIndex): void {
    this.povCarIndex = typeof povCarIndex === 'number' && povCarIndex >= 0 ? povCarIndex : 0;
    for (let i = 0; i < this.carHitboxes.length; i++) {
      const hitboxMesh = this.carHitboxes[i];
      if (hitboxMesh) {
        hitboxMesh.visible = this.isCarHitboxVisibleForSlot(i);
      }
    }
  }

  setCarGhostOpacity(carIndex: number, isGhost = true, opacity = 0.7): boolean {
    return applySlotCarGhostOpacity(this, carIndex, isGhost, opacity);
  }

  clearAllGhostOpacities(): void {
    clearAllRegistryGhostOpacities(this);
  }

  resetCarBoosts(carIndex: number | null = null): void {
    if (typeof carIndex === 'number') {
      const list = this.carBoosts[carIndex];
      if (Array.isArray(list)) {
        for (const emitter of list) emitter.resetVisual();
      }
      return;
    }
    for (const list of this.carBoosts) {
      if (Array.isArray(list)) {
        for (const emitter of list) emitter.resetVisual();
      }
    }
  }

  resetAllCarEffects(): void {
    this.resetCarBoosts();
    for (const demo of this.carDemolitions) {
      if (demo) {
        demo.wasDemolished = null;
        demo.stop();
      }
    }
  }

  async ensureOpponent(ensureOpponentSunFn?: () => void, defaultVisual = 'fennec'): Promise<void> {
    await ensureRegistryOpponentCar(this, ensureOpponentSunFn, defaultVisual);
  }

  hasActiveBoostBloom(): boolean {
    for (const group of this.carBoosts) {
      if (Array.isArray(group) && group.some((emitter) => emitter.bloomActive)) {
        return true;
      }
    }
    return false;
  }

  dispose(): void {
    for (const carList of this.carBoosts) {
      if (Array.isArray(carList)) {
        for (const emitter of carList) emitter.dispose();
      }
    }
    for (const car of this.cars) {
      if (car) {
        disposeObjectGeometryAndMaterials(car);
      }
    }
  }
}
