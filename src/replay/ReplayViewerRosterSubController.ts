/**
 * ReplayViewerRosterSubController.ts
 * Pure replay roster extraction pipeline and stateful POV / loadout SubController
 * for StandaloneReplayViewerController.
 */

import { MAX_CARS } from '../physics/RocketSimConstants.ts';
import { normalizeVisualId, resolveVehicleHitboxId } from '../ui-core/config/vehicleConstants.ts';
import { getMaterialsConfig } from '../ui-core/config/materialsConfig.ts';
import { resolveBotFallbackColorForTeam } from '../ui-core/config/botsLoadoutConfig.ts';
import {
  setNameTagRuntimeState,
  useSpatialAudioStore,
  useAppStore,
  hudStore,
} from '../game/runtimeUiPort.ts';
import { gameAudio } from '../audio/GameAudioEngineFacade.ts';
import {
  resolveReplayRosterData,
  type ReplayRosterEntry,
  type ReplayRosterMetaItem,
  type ReplayRosterSignalItem,
  type ReplayRosterMetadataLike,
  type ReplayRosterExtractionInput,
  type ReplayRosterResolutionResult,
} from './ReplayViewerRosterResolver.ts';

export type {
  ReplayRosterEntry,
  ReplayRosterMetaItem,
  ReplayRosterSignalItem,
  ReplayRosterMetadataLike,
  ReplayRosterExtractionInput,
  ReplayRosterResolutionResult,
};

export interface ReplayViewerRosterRuntimePort {
  playerCarIndex?: number;
  selectedPreset?: string;
  physics?: {
    numCars: number;
    isCarSlotActive?: (carIndex: number) => boolean;
    removeCar?: (carIndex: number) => void;
    addCarAtSlot?: (carIndex: number, team: number, hitboxId: string) => void;
    addCar?: (team: number, hitboxId: string) => void;
    setCarTeam?: (carIndex: number, team: number) => void;
    setCarHitbox?: (carIndex: number, hitboxId: string) => void;
  } | null;
  arena?: {
    playerCarIndex?: number;
    cars?: Array<{ visible?: boolean } | null | undefined>;
    ensureOpponent?: () => void;
    ensureCar?: (carIndex: number, team: number, visualId: string) => void;
    swapCarVisual?: (carIndex: number, visualId: string) => void;
    setCarTeam?: (carIndex: number, team: number) => void;
    setCarColor?: (carIndex: number, colorHex: string) => void;
    setCarLoadout?: (carIndex: number, loadout: Record<string, unknown>) => void;
  } | null;
  keyboard?: { ballControlEnabled?: boolean } | null;
  camera?: { resetView?: () => void } | null;
  flipResetVisual?: { dispose?: () => void } | null;
  getFlipResetVisual?: (carIndex: number) => { play?: () => void } | null;
  releaseGoalReplayCameraOverride?: () => void;
  options?: {
    gameAudio?: {
      setCarBoostAudioVariation?: (carIndex: number, boostAudio: string) => void;
      silenceAll?: () => void;
      play?: (cue: string, volume?: number) => void;
    } | null;
  } | null;
}

export interface ReplayViewerRosterModePort {
  directorPreview?: { isReplayActive?: boolean; goalScorerCarIndex?: number } | null;
  isGoalReplayActive?: () => boolean;
  setReplayCameraMode?: (mode: string) => void;
}

export interface ReplayTakenOverUserLoadoutSnapshot {
  readonly povCarIndex: number;
  readonly povTeam: number;
  readonly userVisualId: string;
  readonly userHitboxId: string;
  readonly colorHex: string;
  readonly paintFinish: string;
  readonly boostVisual: string;
  readonly boostAudio: string;
  readonly userAnthemId: string;
  readonly playerName: string;
}

export function buildTakenOverUserLoadoutSnapshot(
  resolvedRoster: ReadonlyArray<ReplayRosterEntry>,
  fallbackTeam: number,
  fallbackPreset: string | undefined,
  carIndex: number
): ReplayTakenOverUserLoadoutSnapshot {
  const povCarIndex = Number.isInteger(carIndex) ? carIndex : 0;
  const povEntry = resolvedRoster.find((e) => e.carIndex === povCarIndex) || null;
  const povTeam = povEntry ? (povEntry.team === 1 ? 1 : 0) : fallbackTeam === 1 ? 1 : 0;

  const appState = useAppStore.getState?.() || null;
  const userVisualId = normalizeVisualId(appState?.activeCar || fallbackPreset || 'fennec');
  const userHitboxId = resolveVehicleHitboxId(userVisualId);

  const usedTeammateColorSlots = new Set<number>();
  for (const e of resolvedRoster) {
    if (e.carIndex !== povCarIndex && e.team === povTeam && typeof e.colorSlot === 'number') {
      usedTeammateColorSlots.add(e.colorSlot);
    }
  }
  const userColor = resolveBotFallbackColorForTeam(povTeam, usedTeammateColorSlots);
  const matCfg = getMaterialsConfig();
  return {
    povCarIndex,
    povTeam,
    userVisualId,
    userHitboxId,
    colorHex: userColor.colorHex,
    paintFinish: matCfg?.paintFinish || 'metallic',
    boostVisual: matCfg?.boostVisual || 'cartoon',
    boostAudio: matCfg?.boostAudio || 'standard',
    userAnthemId: useSpatialAudioStore.getState?.()?.selectedAnthem || 'random',
    playerName: povEntry?.name || 'Player',
  };
}

export class ReplayViewerRosterSubController {
  public resolvedRoster: ReplayRosterEntry[] = [];
  public slotKeyToCarIndex: Record<number, number> = {};
  public localTeam = 0;
  public activePovCarIndex = 0;
  public activePovSlotKey = 1;
  public activePovTeam = 0;
  public isTakenOverLoadoutApplied = false;
  public activeTakenOverAnthemId = 'none';

  clear(): void {
    this.resolvedRoster = [];
    this.slotKeyToCarIndex = {};
    this.localTeam = 0;
    this.activePovCarIndex = 0;
    this.activePovSlotKey = 1;
    this.activePovTeam = 0;
    this.isTakenOverLoadoutApplied = false;
    this.activeTakenOverAnthemId = 'none';
  }

  private _syncNameTagsAndHudTeam(takenOverIdx: number | null, takenOverTeam: number): void {
    if (this.resolvedRoster.length > 0) {
      setNameTagRuntimeState({
        isMultiplayerOrMultiCarMode: this.resolvedRoster.length > 1,
        carEntries: this.resolvedRoster.map((e) => ({
          carIndex: e.carIndex,
          name: e.name,
          username: e.name,
          team: e.carIndex === takenOverIdx ? takenOverTeam : e.team,
          isBot: e.carIndex === takenOverIdx ? false : !e.isSelf,
          isLocalPlayer: e.carIndex === (takenOverIdx ?? this.activePovCarIndex),
        })),
      });
    }
    hudStore.getState().setMatchState({ localTeam: takenOverTeam });
  }

  resolveAndApplyToArena(
    input: ReplayRosterExtractionInput,
    runtime: ReplayViewerRosterRuntimePort | null
  ): void {
    const resolved = resolveReplayRosterData(input);
    this.resolvedRoster = resolved.resolvedRoster;
    this.localTeam = resolved.localTeam;
    this.slotKeyToCarIndex = resolved.slotKeyToCarIndex;
    this.activePovCarIndex = resolved.activePovCarIndex;
    this.activePovSlotKey = resolved.activePovSlotKey;
    this.activePovTeam = resolved.activePovTeam;

    const physics = runtime?.physics ?? null;
    if (physics) {
      const activeSet = new Set(this.resolvedRoster.map((e) => e.carIndex));
      for (let c = MAX_CARS - 1; c >= 0; c--) {
        if (!activeSet.has(c) && physics.isCarSlotActive?.(c)) {
          physics.removeCar?.(c);
        }
      }
      for (const e of this.resolvedRoster) {
        if (typeof physics.addCarAtSlot === 'function') {
          physics.addCarAtSlot(e.carIndex, e.team, e.hitboxId);
        } else {
          while (physics.numCars <= e.carIndex && typeof physics.addCar === 'function') {
            physics.addCar(e.team, e.hitboxId);
          }
          physics.setCarTeam?.(e.carIndex, e.team);
        }
      }
    }

    this.applyRecordedLoadoutsToArena(runtime);
  }

  applyRecordedLoadoutsToArena(runtime: ReplayViewerRosterRuntimePort | null): void {
    const allEntries = this.resolvedRoster;
    if (allEntries.length === 0) return;
    const { physics, arena, keyboard, options } = runtime ?? {};
    const audio = options?.gameAudio || gameAudio;

    if (physics) {
      for (const e of allEntries) {
        physics.setCarTeam?.(e.carIndex, e.team);
        physics.setCarHitbox?.(e.carIndex, e.hitboxId);
      }
    }

    if (arena) {
      if (allEntries.length > 1) {
        arena.ensureOpponent?.();
      }
      const activeSet = new Set(allEntries.map((e) => e.carIndex));
      for (const e of allEntries) {
        arena.ensureCar?.(e.carIndex, e.team, e.visualId);
        arena.setCarTeam?.(e.carIndex, e.team);
        arena.setCarColor?.(e.carIndex, e.colorHex);
        arena.setCarLoadout?.(e.carIndex, {
          name: e.name,
          colorHex: e.colorHex,
          paintFinish: e.paintFinish,
          boostVisual: e.boostVisual,
          boostAudio: e.boostAudio,
        });
        audio?.setCarBoostAudioVariation?.(e.carIndex, e.boostAudio);
        if (arena.cars?.[e.carIndex]) {
          arena.cars[e.carIndex]!.visible = true;
        }
      }
      if (Array.isArray(arena.cars)) {
        for (let c = 0; c < arena.cars.length; c++) {
          if (!activeSet.has(c) && arena.cars[c]) {
            arena.cars[c]!.visible = false;
          }
        }
      }
      arena.playerCarIndex = this.activePovCarIndex;
    }

    if (runtime) {
      runtime.playerCarIndex = this.activePovCarIndex;
    }
    if (keyboard) {
      keyboard.ballControlEnabled = false;
    }

    this.isTakenOverLoadoutApplied = false;
    this._syncNameTagsAndHudTeam(null, this.activePovTeam);
  }

  restoreRecordedLoadoutsIfNeeded(runtime: ReplayViewerRosterRuntimePort | null): void {
    if (this.isTakenOverLoadoutApplied && this.resolvedRoster.length > 0) {
      this.applyRecordedLoadoutsToArena(runtime);
    }
  }

  applyUserLoadoutToTakenOverCar(
    runtime: ReplayViewerRosterRuntimePort | null,
    carIndex = this.activePovCarIndex
  ): void {
    if (!runtime) return;
    const snap = buildTakenOverUserLoadoutSnapshot(
      this.resolvedRoster,
      this.activePovTeam,
      runtime.selectedPreset,
      carIndex
    );
    this.activePovTeam = snap.povTeam;

    const { physics, arena, flipResetVisual, options } = runtime;
    physics?.setCarTeam?.(snap.povCarIndex, snap.povTeam);
    physics?.setCarHitbox?.(snap.povCarIndex, snap.userHitboxId);

    if (arena) {
      arena.ensureCar?.(snap.povCarIndex, snap.povTeam, snap.userVisualId);
      arena.setCarTeam?.(snap.povCarIndex, snap.povTeam);
      arena.setCarColor?.(snap.povCarIndex, snap.colorHex);
      arena.setCarLoadout?.(snap.povCarIndex, {
        name: snap.playerName,
        colorHex: snap.colorHex,
        paintFinish: snap.paintFinish,
        boostVisual: snap.boostVisual,
        boostAudio: snap.boostAudio,
      });
      if (arena.cars?.[snap.povCarIndex]) {
        flipResetVisual?.dispose?.();
        try {
          runtime.getFlipResetVisual?.(snap.povCarIndex);
        } catch {
          // Ignore visual re-init failure
        }
      }
    }

    const audio = options?.gameAudio || gameAudio;
    audio?.setCarBoostAudioVariation?.(snap.povCarIndex, snap.boostAudio);

    this.isTakenOverLoadoutApplied = true;
    this.activeTakenOverAnthemId = snap.userAnthemId;
    this._syncNameTagsAndHudTeam(snap.povCarIndex, snap.povTeam);
  }

  selectPovSlot(
    slotKey: number,
    runtime: ReplayViewerRosterRuntimePort | null,
    freeplayMode: ReplayViewerRosterModePort | null,
    wasIntervening: boolean
  ): { activePovCarIndex: number; activePovSlotKey: number; activePovTeam: number } | null {
    const key = Number(slotKey);
    const entry =
      this.resolvedRoster.find((e) => e.slotKey === key) ||
      (typeof this.slotKeyToCarIndex?.[key] === 'number'
        ? this.resolvedRoster.find((e) => e.carIndex === this.slotKeyToCarIndex[key])
        : null);
    if (!entry) return null;

    if (wasIntervening && this.isTakenOverLoadoutApplied) {
      this.applyRecordedLoadoutsToArena(runtime);
    }

    this.activePovCarIndex = entry.carIndex;
    this.activePovSlotKey = entry.slotKey;
    this.activePovTeam = entry.team === 1 ? 1 : 0;

    if (runtime) {
      const { arena, camera } = runtime;
      runtime.playerCarIndex = entry.carIndex;
      if (arena) {
        arena.playerCarIndex = entry.carIndex;
      }
      if (freeplayMode?.directorPreview?.isReplayActive || freeplayMode?.isGoalReplayActive?.()) {
        if (freeplayMode.directorPreview) {
          freeplayMode.directorPreview.goalScorerCarIndex = entry.carIndex;
        }
        freeplayMode.setReplayCameraMode?.('pov');
        runtime.releaseGoalReplayCameraOverride?.();
        hudStore.getState().setReplayState({ replayCameraMode: 'pov' });
      }
      camera?.resetView?.();
    }

    if (wasIntervening) {
      this.applyUserLoadoutToTakenOverCar(runtime, this.activePovCarIndex);
    } else {
      this._syncNameTagsAndHudTeam(null, this.activePovTeam);
    }

    return {
      activePovCarIndex: this.activePovCarIndex,
      activePovSlotKey: this.activePovSlotKey,
      activePovTeam: this.activePovTeam,
    };
  }
}
