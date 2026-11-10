import * as THREE from 'three';
import { VehicleBoostEmitter } from '../vehicle/boost/vehicleBoostEmitter.ts';
import { DemolitionEffect } from '../DemolitionEffect.ts';
import { getWheelSpecsForVisual } from '../VehicleSuspensionSystem.ts';
import { normalizeVisualId } from '../../ui-core/config/vehicleConstants.ts';
import { hasVehicleDescriptor } from '../../ui-core/config/vehicleTunerConfig.ts';
import { DEFAULT_TEAM_COLORS, OCTANE_BOOST_OUTLETS } from './ArenaConstants.ts';
import {
  buildVehicleModel,
  buildVehicleWheels,
  removeCarMeshes,
  type createDefaultVehicleLoaders,
} from './VehicleFactory.ts';
import { applyVehiclePaint, type TraversableMaterialNode } from './VehiclePaint.ts';
import {
  disposeObjectGeometryAndMaterials,
  type VehicleWheelSet,
  type WheelSpecTuple,
} from './ArenaVehicleLoadoutManager.ts';

export interface SuspensionUnitVisual {
  group?: THREE.Group;
  top?: THREE.Vector3;
  botZ?: number;
  spring?: THREE.Object3D;
  built?: number;
  bodyLen?: number;
  shaft?: THREE.Object3D;
  body?: THREE.Object3D;
  innerZ: number;
  armFore?: THREE.Object3D;
  foreRoot?: THREE.Object3D | THREE.Vector3;
  armAft?: THREE.Object3D;
  aftRoot?: THREE.Object3D | THREE.Vector3;
}

export interface VehicleVisualOptions {
  visual?: string;
  preset?: string;
  targetIndex?: number;
}

export type VehicleVisualInput = string | VehicleVisualOptions;

export interface VehicleSlotRegistryState {
  scene: THREE.Scene;
  cars: Array<THREE.Group | null>;
  vehiclePresets: Array<string | null>;
  carHitboxes: Array<THREE.LineSegments | THREE.Object3D | null>;
  carSuspension: Array<SuspensionUnitVisual[] | null>;
  carWheels: Array<VehicleWheelSet | null>;
  carWheelSpecs: Array<WheelSpecTuple[] | null>;
  wheelSpin: Array<number[]>;
  carBoosts: Array<VehicleBoostEmitter[] | null>;
  carDemolitions: Array<DemolitionEffect | null>;
  carColors: Array<number | null | undefined>;
  carPaintFinishes: Array<string | null>;
  carBoostVisuals: Array<string | null>;
  carBoostAudios: Array<string | null>;
  carTeams: number[];
  customVehicleAssets: Map<string, unknown>;
  carLoaders: ReturnType<typeof createDefaultVehicleLoaders>;
  onRenderTreeChanged?: () => void;
  isCarHitboxVisibleForSlot(slot: number): boolean;
  _ensureAsyncCustomAsset(visual: string, slot: number): void;
  removeCar(carIndex: number): boolean;
  swapCarVisual(carIndex: number, newVisual: VehicleVisualInput): boolean;
}

export function resolveVehicleVisualAndTargetSlot(
  visualOrOptions: VehicleVisualInput | undefined,
  targetIndex: number | null,
  fallbackVisual = 'fennec'
): { visual: string; resolvedTargetIndex: number | null } {
  let visual = fallbackVisual;
  let resolvedTargetIndex = targetIndex;
  if (visualOrOptions && typeof visualOrOptions === 'object') {
    visual = visualOrOptions.visual || visualOrOptions.preset || fallbackVisual;
    if (typeof visualOrOptions.targetIndex === 'number') {
      resolvedTargetIndex = visualOrOptions.targetIndex;
    }
  } else if (typeof visualOrOptions === 'string' && visualOrOptions.length > 0) {
    visual = visualOrOptions;
  }
  return { visual: normalizeVisualId(visual), resolvedTargetIndex };
}

export function resolveWheelSpecsForPreset(
  visual: string,
  carLoaders: ReturnType<typeof createDefaultVehicleLoaders>
): WheelSpecTuple[] {
  const specs = getWheelSpecsForVisual(visual) as WheelSpecTuple[];
  if (
    !visual.startsWith('hitbox-') &&
    !hasVehicleDescriptor(visual) &&
    carLoaders.wheelSpecs?.game
  ) {
    return carLoaders.wheelSpecs.game as WheelSpecTuple[];
  }
  return specs;
}

export function applySlotPaintWithFallback(
  state: VehicleSlotRegistryState,
  slot: number,
  fallbackTeamColor: number
): void {
  const carRoot = state.cars[slot];
  if (!carRoot) return;
  const activeColor = state.carColors[slot] ?? fallbackTeamColor;
  applyVehiclePaint(
    carRoot,
    state.vehiclePresets[slot],
    activeColor,
    state.carPaintFinishes[slot] || null
  );
}

export function mountCarIntoRegistrySlot(
  state: VehicleSlotRegistryState,
  teamIndex = 0,
  visualOrOptions: VehicleVisualInput = 'fennec',
  targetIndex: number | null = null
): THREE.Group {
  const { visual, resolvedTargetIndex } = resolveVehicleVisualAndTargetSlot(
    visualOrOptions,
    targetIndex,
    'fennec'
  );
  const carRoot = new THREE.Group();
  const slot =
    typeof resolvedTargetIndex === 'number' && resolvedTargetIndex >= 0
      ? resolvedTargetIndex
      : state.cars.length;

  while (state.cars.length < slot) {
    const idx = state.cars.length;
    state.cars[idx] = null;
    state.vehiclePresets[idx] = null;
    state.carHitboxes[idx] = null;
    state.carWheels[idx] = null;
    state.carWheelSpecs[idx] = null;
    state.wheelSpin[idx] = [0, 0, 0, 0];
    state.carSuspension[idx] = [];
    state.carBoosts[idx] = null;
    state.carDemolitions[idx] = null;
  }
  if (state.cars[slot]) state.removeCar(slot);

  const isBot = slot !== 0;
  const resolvedTeam = typeof teamIndex === 'number' ? teamIndex : slot % 2;
  const teamColor =
    state.carLoaders.teamColors?.[resolvedTeam] ?? DEFAULT_TEAM_COLORS[resolvedTeam % 2];

  state._ensureAsyncCustomAsset(visual, slot);

  const { carModel, carHitbox, boostOutlets } = buildVehicleModel(
    visual,
    teamColor,
    isBot,
    state.customVehicleAssets,
    state.carLoaders,
    state.isCarHitboxVisibleForSlot(slot)
  );
  carRoot.add(carModel, carHitbox);

  const wheelSpecs = resolveWheelSpecsForPreset(visual, state.carLoaders);
  const wheels = buildVehicleWheels(
    carRoot,
    visual,
    teamColor,
    wheelSpecs,
    state.customVehicleAssets,
    state.carLoaders
  ) as VehicleWheelSet;

  const defaultOutlets = OCTANE_BOOST_OUTLETS.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const arenaScene = state.scene;
  const emitters = (boostOutlets || defaultOutlets).map(
    (pos: THREE.Vector3, p: number) =>
      new VehicleBoostEmitter(arenaScene, carRoot, pos, p === 0, isBot)
  );
  const activeBoostVisual = state.carBoostVisuals[slot] || null;
  if (activeBoostVisual) {
    for (const emitter of emitters) emitter.setBoostVisual(activeBoostVisual);
  }

  const demoEffect = new DemolitionEffect();
  if (demoEffect.object) arenaScene.add(demoEffect.object);

  state.carTeams[slot] = resolvedTeam;
  state.carHitboxes[slot] = carHitbox;
  state.carWheels[slot] = wheels;
  state.carWheelSpecs[slot] = wheelSpecs;
  state.wheelSpin[slot] = [0, 0, 0, 0];
  state.carSuspension[slot] = [];
  state.carBoosts[slot] = emitters;
  state.carDemolitions[slot] = demoEffect;
  state.cars[slot] = carRoot;
  state.vehiclePresets[slot] = visual;

  arenaScene.add(carRoot);
  applySlotPaintWithFallback(state, slot, teamColor);
  state.onRenderTreeChanged?.();
  return carRoot;
}

export function rebuildRegistrySlotVisual(
  state: VehicleSlotRegistryState,
  carIndex: number,
  newVisual: VehicleVisualInput
): boolean {
  if (carIndex < 0 || carIndex >= state.cars.length) return false;
  const carRoot = state.cars[carIndex];
  if (!carRoot) return false;
  const rawVisual =
    newVisual && typeof newVisual === 'object'
      ? newVisual.visual || newVisual.preset || 'fennec'
      : String(newVisual || 'fennec');
  const resolvedVisual = normalizeVisualId(rawVisual);

  const isBot = carIndex !== 0;
  const teamIndex = state.carTeams[carIndex] ?? carIndex % 2;
  const teamColor =
    state.carColors[carIndex] ??
    state.carLoaders.teamColors?.[teamIndex] ??
    DEFAULT_TEAM_COLORS[teamIndex % 2];

  state._ensureAsyncCustomAsset(resolvedVisual, carIndex);
  removeCarMeshes(carRoot, true);

  const { carModel, carHitbox, boostOutlets } = buildVehicleModel(
    resolvedVisual,
    teamColor,
    isBot,
    state.customVehicleAssets,
    state.carLoaders,
    state.isCarHitboxVisibleForSlot(carIndex)
  );
  carRoot.add(carModel, carHitbox);
  state.carHitboxes[carIndex] = carHitbox;

  const wheelSpecs = resolveWheelSpecsForPreset(resolvedVisual, state.carLoaders);
  state.carWheelSpecs[carIndex] = wheelSpecs;
  state.carWheels[carIndex] = buildVehicleWheels(
    carRoot,
    resolvedVisual,
    teamColor,
    wheelSpecs,
    state.customVehicleAssets,
    state.carLoaders
  ) as VehicleWheelSet;

  const emitterList = state.carBoosts[carIndex];
  if (emitterList && boostOutlets) {
    for (let p = 0; p < emitterList.length && p < boostOutlets.length; p++) {
      const outlet = boostOutlets[p];
      emitterList[p]?.setNozzleOffset(outlet.x, outlet.y, outlet.z);
    }
  }

  state.vehiclePresets[carIndex] = resolvedVisual;
  applySlotPaintWithFallback(state, carIndex, teamColor);
  state.onRenderTreeChanged?.();
  return true;
}

export function disposeAndRemoveRegistrySlot(
  state: VehicleSlotRegistryState,
  carIndex: number
): boolean {
  if (carIndex < 0 || carIndex >= state.cars.length) return false;
  const carRoot = state.cars[carIndex];
  if (carRoot) {
    state.scene.remove(carRoot);
    disposeObjectGeometryAndMaterials(carRoot);
  }

  const demo = state.carDemolitions[carIndex];
  if (demo) {
    if (demo.object) state.scene.remove(demo.object);
    demo.dispose();
  }
  const boostList = state.carBoosts[carIndex];
  if (boostList) {
    for (const emitter of boostList) emitter.dispose();
  }

  state.cars[carIndex] = null;
  state.vehiclePresets[carIndex] = null;
  state.carHitboxes[carIndex] = null;
  state.carSuspension[carIndex] = null;
  state.carWheels[carIndex] = null;
  state.carWheelSpecs[carIndex] = null;
  state.carBoosts[carIndex] = null;
  state.carDemolitions[carIndex] = null;

  state.onRenderTreeChanged?.();
  return true;
}

export function applySlotCarGhostOpacity(
  state: VehicleSlotRegistryState,
  carIndex: number,
  isGhost = true,
  opacity = 0.7
): boolean {
  const carRoot = state.cars[carIndex];
  if (!carRoot) return false;
  const clampedOpacity = Math.max(0.1, Math.min(1.0, opacity));
  carRoot.traverse((node: TraversableMaterialNode) => {
    if (!node.material) return;
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
  state.onRenderTreeChanged?.();
  return true;
}
