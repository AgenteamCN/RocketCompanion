import type * as THREE from 'three';
import { normalizeVisualId } from '../../ui-core/config/vehicleConstants.ts';
import {
  getVehicleDescriptor,
  hasVehicleDescriptor,
} from '../../ui-core/config/vehicleTunerConfig.ts';
import { DEFAULT_TEAM_COLORS } from './ArenaConstants.ts';
import { applyVehiclePaint } from './VehiclePaint.ts';
import type { CarLoadoutConfig } from './ArenaVehicleLoadoutManager.ts';
import {
  applySlotCarGhostOpacity,
  type VehicleSlotRegistryState,
  type VehicleVisualInput,
} from './arenaVehicleSlotPipeline.ts';

export interface VehicleCosmeticRegistryState extends VehicleSlotRegistryState {
  onEnsureOpponentSun?: () => void;
  addCar(
    teamIndex?: number,
    visualOrOptions?: VehicleVisualInput,
    targetIndex?: number | null
  ): THREE.Group;
}

export function setRegistrySlotCarTeam(
  state: VehicleCosmeticRegistryState,
  carIndex: number,
  teamIndex: number
): void {
  if (typeof carIndex !== 'number' || carIndex < 0) return;
  const prevTeam = state.carTeams[carIndex];
  state.carTeams[carIndex] = teamIndex;
  if (prevTeam === teamIndex) return;
  const teamColor = state.carLoaders.teamColors?.[teamIndex] ?? DEFAULT_TEAM_COLORS[teamIndex % 2];
  const customColor = state.carColors[carIndex];
  if (state.cars[carIndex] && (customColor === undefined || customColor === null)) {
    applyVehiclePaint(
      state.cars[carIndex],
      state.vehiclePresets[carIndex],
      teamColor,
      state.carPaintFinishes[carIndex] || null
    );
    state.onRenderTreeChanged?.();
  }
}

export function ensureRegistrySlotCar(
  state: VehicleCosmeticRegistryState,
  carIndex: number,
  teamIndex: number | null = null,
  visualOrOptions: VehicleVisualInput = 'fennec'
): THREE.Group | null {
  if (typeof carIndex !== 'number' || carIndex < 0) return null;
  const resolvedTeam =
    typeof teamIndex === 'number' ? teamIndex : (state.carTeams[carIndex] ?? carIndex % 2);
  let visual = 'fennec';
  if (visualOrOptions && typeof visualOrOptions === 'object') {
    visual =
      visualOrOptions.visual ||
      visualOrOptions.preset ||
      state.vehiclePresets[carIndex] ||
      'fennec';
  } else if (typeof visualOrOptions === 'string' && visualOrOptions.length > 0) {
    visual = visualOrOptions;
  } else if (state.vehiclePresets[carIndex]) {
    visual = state.vehiclePresets[carIndex]!;
  }
  visual = normalizeVisualId(visual);

  if (!state.cars[carIndex]) {
    state.addCar(resolvedTeam, visual, carIndex);
  } else {
    if (state.vehiclePresets[carIndex] !== visual) {
      state.swapCarVisual(carIndex, visual);
    }
    if (typeof teamIndex === 'number') {
      setRegistrySlotCarTeam(state, carIndex, teamIndex);
    }
  }
  if (state.cars[carIndex]) {
    state.cars[carIndex]!.visible = true;
  }
  return state.cars[carIndex];
}

export function setRegistrySlotCarColor(
  state: VehicleSlotRegistryState,
  carIndex: number,
  colorVal: string | number | null | undefined
): void {
  const num = typeof colorVal === 'string' ? parseInt(colorVal.replace('#', ''), 16) : colorVal;
  if (state.carColors[carIndex] === num) return;
  state.carColors[carIndex] = num;
  const carRoot = state.cars[carIndex];
  if (!carRoot) return;
  applyVehiclePaint(
    carRoot,
    state.vehiclePresets[carIndex],
    num,
    state.carPaintFinishes[carIndex] || null
  );
  state.onRenderTreeChanged?.();
}

export function setRegistrySlotCarPaintFinish(
  state: VehicleSlotRegistryState,
  carIndex: number,
  paintFinish: string | null
): void {
  if (typeof carIndex !== 'number' || carIndex < 0) return;
  const normalized = paintFinish === 'metallic' || paintFinish === 'matte' ? paintFinish : null;
  if (state.carPaintFinishes[carIndex] === normalized) return;
  state.carPaintFinishes[carIndex] = normalized;
  const carRoot = state.cars[carIndex];
  if (!carRoot) return;
  const teamIndex = state.carTeams[carIndex] ?? carIndex % 2;
  const activeColor =
    state.carColors[carIndex] ??
    state.carLoaders.teamColors?.[teamIndex] ??
    DEFAULT_TEAM_COLORS[teamIndex % 2];
  applyVehiclePaint(carRoot, state.vehiclePresets[carIndex], activeColor, normalized);
  state.onRenderTreeChanged?.();
}

export function setRegistrySlotCarBoostVisual(
  state: VehicleSlotRegistryState,
  carIndex: number,
  boostVisual: string | null
): void {
  if (typeof carIndex !== 'number' || carIndex < 0) return;
  const normalized = boostVisual === 'cartoon' || boostVisual === 'gold-rush' ? boostVisual : null;
  state.carBoostVisuals[carIndex] = normalized;
  const emitters = state.carBoosts[carIndex];
  if (Array.isArray(emitters)) {
    for (const emitter of emitters) {
      emitter.setBoostVisual(normalized);
    }
  }
}

export function setRegistrySlotCarLoadout(
  state: VehicleSlotRegistryState,
  carIndex: number,
  loadout: CarLoadoutConfig | null | undefined = {}
): void {
  if (typeof carIndex !== 'number' || carIndex < 0 || !loadout) return;
  if (loadout.visualId || loadout.visual) {
    const targetVisual = (loadout.visualId || loadout.visual)!;
    if (state.cars[carIndex] && state.vehiclePresets[carIndex] !== targetVisual) {
      state.swapCarVisual(carIndex, targetVisual);
    }
  }
  if (loadout.paintFinish !== undefined) {
    setRegistrySlotCarPaintFinish(state, carIndex, loadout.paintFinish);
  }
  if (loadout.colorHex !== undefined && loadout.colorHex !== null) {
    setRegistrySlotCarColor(state, carIndex, loadout.colorHex);
  }
  if (loadout.boostVisual !== undefined) {
    setRegistrySlotCarBoostVisual(state, carIndex, loadout.boostVisual);
  }
  if (loadout.boostAudio !== undefined) {
    state.carBoostAudios[carIndex] = loadout.boostAudio || null;
  }
}

export function clearAllRegistryGhostOpacities(state: VehicleSlotRegistryState): void {
  for (let i = 0; i < state.cars.length; i++) {
    if (state.cars[i]) applySlotCarGhostOpacity(state, i, false, 1.0);
  }
}

export async function ensureRegistryOpponentCar(
  state: VehicleCosmeticRegistryState,
  ensureOpponentSunFn?: () => void,
  defaultVisual = 'fennec'
): Promise<void> {
  if (!state.cars[1]) {
    const id = String(defaultVisual || 'fennec').toLowerCase();
    const desc = hasVehicleDescriptor(id) ? getVehicleDescriptor(id) : null;
    if (
      desc?.modelUrl &&
      !state.customVehicleAssets.has(id) &&
      state.carLoaders.loadCustomGlbCarAsset
    ) {
      try {
        state.customVehicleAssets.set(id, await state.carLoaders.loadCustomGlbCarAsset(id));
      } catch (err) {
        console.warn(`Opponent "${id}" asset load skipped:`, err);
      }
    }
    (ensureOpponentSunFn ?? state.onEnsureOpponentSun)?.();
    state.addCar(1, id, 1);
  }
}
