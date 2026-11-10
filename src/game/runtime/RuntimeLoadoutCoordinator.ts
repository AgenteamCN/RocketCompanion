import {
  CAR_COLOR_SLOTS,
  normalizeVisualId,
  resolveVehicleHitboxId,
} from '../../ui-core/config/vehicleConstants.ts';
import {
  garageSettingsStore,
  getPreferredColorHex,
  getPreferredColorSlot,
  getPreferredFreeplayTeam,
  loadStoredColorPrefs,
} from '../../ui-core/config/vehiclePresets.ts';
import { getMaterialsConfig } from '../../ui-core/config/materialsConfig.ts';
import { gameAudio } from '../../audio/GameAudioEngineFacade.ts';
import { FlipResetVisual } from '../../effects/FlipResetVisual.ts';
import { useAppStore, getNameTagRuntimeState, setNameTagRuntimeState } from '../runtimeUiPort.ts';
import type { ArenaWorld } from '../../entities/ArenaWorld.ts';
import type { EntityManager } from '../../entities/EntityManager.ts';
import type { RocketSimPhysicsEngine } from '../../physics/RocketSimPhysicsEngine.ts';
import type { CameraManager } from '../../camera/CameraManager.ts';
import type { MaterialsConfigLike } from './onlineLobbyTransitionPipeline.ts';

export interface LocalPlayerLoadoutSyncRequest {
  carIndex: number;
  visualId: string;
  hitboxId: string;
  colorSlotId: number;
  paintFinish: string;
  boostVisual: string;
  boostAudio: string;
  updateVisualPreset?: boolean;
  broadcastColorHex?: string | null;
}

export interface ActiveModeLoadoutPort {
  id?: string;
  humanPlayerCarIndex?: number;
  spawnedCars?: Record<number, Record<string, unknown>>;
  _publishSpawnedCarsTelemetry?(): void;
  rosterController?: {
    humanPlayerCarIndex?: number;
    spawnedCars?: Record<number, Record<string, unknown>>;
    publishSpawnedCarsTelemetry?(): void;
  } | null;
  standaloneReplayViewer?: { isActive?: boolean };
}

export interface RuntimeLoadoutHostPort {
  readonly arena: ArenaWorld | null;
  readonly entityManager: EntityManager | null;
  readonly physics: RocketSimPhysicsEngine | null;
  readonly camera: CameraManager | null;
  readonly modeManager: { activeMode?: ActiveModeLoadoutPort | null } | null;
  readonly networkManager?: {
    syncLocalPlayerLoadout(request: LocalPlayerLoadoutSyncRequest): void;
  } | null;
  readonly playerCarIndex: number;
  readonly teamAssignment?: { playerTeam: number; opponentTeam: number } | null;
  readonly flipResetVisuals?: Map<number, FlipResetVisual>;
  selectedPreset: string;
  selectedHitbox: string | null;
  selectedColorSlot: number | null;
}

/**
 * RuntimeLoadoutCoordinator
 * Autonomous SubController owning player vehicle preset swapping, car color slot syncing,
 * personal materials deduplication (`lastSyncedPersonalMaterialsKey`), network loadout broadcasts,
 * and restoration of the local player's single-car Freeplay loadout on mode transitions.
 */
export class RuntimeLoadoutCoordinator {
  private readonly host: RuntimeLoadoutHostPort;
  private lastSyncedPersonalMaterialsKey = '';

  constructor(host: RuntimeLoadoutHostPort) {
    this.host = host;
  }

  private rebindFlipResetVisual(carIndex: number): void {
    const h = this.host;
    const carRoot = h.arena?.cars?.[carIndex];
    if (!carRoot) return;
    const prevFx = h.flipResetVisuals?.get?.(carIndex);
    prevFx?.dispose?.();
    h.flipResetVisuals?.delete?.(carIndex);
    try {
      h.flipResetVisuals?.set?.(carIndex, new FlipResetVisual(carRoot));
    } catch (err) {
      console.warn('[GameRuntime] FlipResetVisual re-bind skipped:', err);
    }
  }

  public changePlayerVehicle(visualId: string, hitboxId: string | null = null): void {
    const h = this.host;
    const normalizedVisual = normalizeVisualId(visualId);
    const resolvedHitboxId = hitboxId || resolveVehicleHitboxId(normalizedVisual);
    h.selectedPreset = normalizedVisual;
    h.selectedHitbox = resolvedHitboxId;
    const activeMode = h.modeManager?.activeMode ?? null;
    if (activeMode?.standaloneReplayViewer?.isActive) {
      return;
    }
    const expMode = activeMode?.id === 'exp-multi-bots' ? activeMode : null;
    const targetCarIdx =
      expMode && typeof expMode.humanPlayerCarIndex === 'number' && expMode.humanPlayerCarIndex >= 0
        ? expMode.humanPlayerCarIndex
        : h.playerCarIndex;

    if (h.entityManager) {
      h.entityManager.hotSwapVehicle(targetCarIdx, {
        visual: normalizedVisual,
        hitbox: resolvedHitboxId,
      });
    } else {
      h.arena?.vehicleRegistry.swapCarVisual(targetCarIdx, normalizedVisual);
      h.physics?.setCarHitbox?.(targetCarIdx, resolvedHitboxId);
    }

    if (h.arena?.cars?.[targetCarIdx]) {
      this.rebindFlipResetVisual(targetCarIdx);
      h.camera?.update?.(h.arena.cars[h.playerCarIndex], h.arena.ball, 0, {});
    }

    const colorSlotId = h.selectedColorSlot ?? 0;
    const matCfg = getMaterialsConfig();
    const paintFinish = matCfg?.paintFinish || 'metallic';
    const boostVisual = matCfg?.boostVisual || 'cartoon';
    const boostAudio = matCfg?.boostAudio || 'standard';
    h.arena?.vehicleRegistry.setCarLoadout(targetCarIdx, { paintFinish, boostVisual, boostAudio });
    gameAudio?.setCarBoostAudioVariation?.(targetCarIdx, boostAudio);

    if (expMode) {
      const entry = expMode.spawnedCars?.[targetCarIdx];
      if (entry) {
        entry.visualId = normalizedVisual;
        entry.hitboxId = resolvedHitboxId;
        entry.paintFinish = paintFinish;
        entry.boostVisual = boostVisual;
        entry.boostAudio = boostAudio;
        expMode._publishSpawnedCarsTelemetry?.();
      }
    }

    const ntState = getNameTagRuntimeState();
    if (Array.isArray(ntState?.carEntries) && ntState.carEntries.length > 0) {
      setNameTagRuntimeState({
        carEntries: ntState.carEntries.map((c) =>
          c.carIndex === targetCarIdx
            ? {
                ...c,
                visualId: normalizedVisual,
                hitboxId: resolvedHitboxId,
                paintFinish,
                boostVisual,
                boostAudio,
              }
            : c
        ),
      });
    }

    h.networkManager?.syncLocalPlayerLoadout({
      carIndex: h.playerCarIndex,
      visualId: normalizedVisual,
      hitboxId: resolvedHitboxId,
      colorSlotId,
      paintFinish,
      boostVisual,
      boostAudio,
      updateVisualPreset: true,
    });
  }

  public setCarColor(carIndex: number, colorVal: number | string, broadcast = true): void {
    const h = this.host;
    const activeMode = h.modeManager?.activeMode ?? null;
    if (!activeMode?.standaloneReplayViewer?.isActive) {
      h.arena?.vehicleRegistry.setCarColor(carIndex, colorVal);
    }
    if (!broadcast) return;

    const hex =
      typeof colorVal === 'number'
        ? '#' + colorVal.toString(16).padStart(6, '0')
        : String(colorVal);
    const slot =
      CAR_COLOR_SLOTS.find((s) => s.hex.toLowerCase() === hex.toLowerCase()) || CAR_COLOR_SLOTS[0];
    h.selectedColorSlot = slot.id;

    const activeVisual = h.selectedPreset || 'fennec';
    const activeHitbox = h.selectedHitbox || resolveVehicleHitboxId(activeVisual);
    const matCfg = getMaterialsConfig();
    const paintFinish = matCfg?.paintFinish || 'metallic';
    const boostVisual = matCfg?.boostVisual || 'cartoon';
    const boostAudio = matCfg?.boostAudio || 'standard';

    h.networkManager?.syncLocalPlayerLoadout({
      carIndex,
      visualId: activeVisual,
      hitboxId: activeHitbox,
      colorSlotId: slot.id,
      paintFinish,
      boostVisual,
      boostAudio,
      broadcastColorHex: hex,
    });
  }

  public syncPlayerMaterialsLoadout(materialsConfig: MaterialsConfigLike | null = null): void {
    const h = this.host;
    const matCfg = materialsConfig || getMaterialsConfig();
    const paintFinish = matCfg?.paintFinish || 'metallic';
    const boostVisual = matCfg?.boostVisual || 'cartoon';
    const boostAudio = matCfg?.boostAudio || 'standard';

    const activeMode = h.modeManager?.activeMode ?? null;
    if (activeMode?.standaloneReplayViewer?.isActive) {
      return;
    }

    const expMode = activeMode?.id === 'exp-multi-bots' ? activeMode : null;
    const expHumanCarIdx = expMode?.rosterController?.humanPlayerCarIndex;
    const targetCarIdx =
      typeof expHumanCarIdx === 'number' && expHumanCarIdx >= 0 ? expHumanCarIdx : h.playerCarIndex;

    h.arena?.vehicleRegistry.setCarLoadout(targetCarIdx, {
      paintFinish,
      boostVisual,
      boostAudio,
    });
    gameAudio?.setCarBoostAudioVariation?.(targetCarIdx, boostAudio);

    if (expMode) {
      const entry = expMode.rosterController?.spawnedCars?.[targetCarIdx];
      if (entry) {
        entry.paintFinish = paintFinish;
        entry.boostVisual = boostVisual;
        entry.boostAudio = boostAudio;
        expMode.rosterController?.publishSpawnedCarsTelemetry?.();
      }
    }

    const nextKey = `${paintFinish}:${boostVisual}:${boostAudio}`;
    if (this.lastSyncedPersonalMaterialsKey === nextKey) return;
    this.lastSyncedPersonalMaterialsKey = nextKey;

    const activeVisual = h.selectedPreset || 'fennec';
    const activeHitbox = h.selectedHitbox || resolveVehicleHitboxId(activeVisual);
    const colorSlotId = h.selectedColorSlot ?? 0;

    h.networkManager?.syncLocalPlayerLoadout({
      carIndex: h.playerCarIndex,
      visualId: activeVisual,
      hitboxId: activeHitbox,
      colorSlotId,
      paintFinish,
      boostVisual,
      boostAudio,
    });
  }

  /**
   * Restores the local player's saved Freeplay vehicle preset, hitbox, preferred team,
   * color slot, paint finish, boost visual, and boost audio onto `carIndex` (default 0).
   */
  public restoreLocalPlayerFreeplayLoadout(carIndex = 0): void {
    const h = this.host;
    const appCar = useAppStore?.getState?.()?.activeCar;
    const garagePrefs = garageSettingsStore?.get?.() as { vehiclePreset?: string } | null;
    const visualId = normalizeVisualId(
      h.selectedPreset || appCar || garagePrefs?.vehiclePreset || 'fennec'
    );
    const hitboxId = h.selectedHitbox || resolveVehicleHitboxId(visualId);
    h.selectedPreset = visualId;
    h.selectedHitbox = hitboxId;

    const freeplayPrefs = loadStoredColorPrefs();
    const freeplayTeam = getPreferredFreeplayTeam(freeplayPrefs);
    const freeplayColorSlot = getPreferredColorSlot(freeplayPrefs, freeplayTeam);
    const freeplayColorHex = getPreferredColorHex(freeplayPrefs, freeplayTeam);
    h.selectedColorSlot = freeplayColorSlot;

    if (h.teamAssignment) {
      h.teamAssignment.playerTeam = freeplayTeam;
      h.teamAssignment.opponentTeam = freeplayTeam === 0 ? 1 : 0;
    }

    const matCfg = getMaterialsConfig();
    const paintFinish = matCfg?.paintFinish || 'metallic';
    const boostVisual = matCfg?.boostVisual || 'cartoon';
    const boostAudio = matCfg?.boostAudio || 'standard';

    h.physics?.setCarTeam?.(carIndex, freeplayTeam);
    h.physics?.setCarHitbox?.(carIndex, hitboxId);

    if (h.entityManager) {
      h.entityManager.hotSwapVehicle(carIndex, {
        visual: visualId,
        hitbox: hitboxId,
      });
    }

    if (h.arena) {
      h.arena.vehicleRegistry.ensureCar(carIndex, freeplayTeam, visualId);
      if (h.arena.vehiclePresets?.[carIndex] !== visualId) {
        h.arena.vehicleRegistry.swapCarVisual(carIndex, visualId);
      }
      h.arena.vehicleRegistry.setCarTeam(carIndex, freeplayTeam);
      h.arena.vehicleRegistry.setCarColor(carIndex, freeplayColorHex);
      h.arena.vehicleRegistry.setCarLoadout(carIndex, {
        visualId,
        colorHex: freeplayColorHex,
        paintFinish,
        boostVisual,
        boostAudio,
      });
      if (h.arena.cars?.[carIndex]) {
        h.arena.cars[carIndex].visible = true;
      }
    }

    this.rebindFlipResetVisual(carIndex);
    gameAudio?.setCarBoostAudioVariation?.(carIndex, boostAudio);
  }
}
