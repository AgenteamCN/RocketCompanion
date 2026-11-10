import {
  useAppStore,
  hudStore,
  getNameTagRuntimeState,
  setNameTagRuntimeState,
  type RuntimeTunerPort,
} from '../runtimeUiPort.ts';
import {
  getPreferredColorHex,
  getPreferredFreeplayTeam,
  garageSettingsStore,
} from '../../ui-core/config/vehiclePresets.ts';
import { getMaterialsConfig } from '../../ui-core/config/materialsConfig.ts';
import { getVehicleDescriptor } from '../../ui-core/config/vehicleTunerConfig.ts';
import type { RocketSimPhysicsEngine } from '../../physics/RocketSimPhysicsEngine.ts';
import type { ArenaWorld } from '../../entities/ArenaWorld.ts';
import type { MaterialsConfigLike } from './onlineLobbyTransitionPipeline.ts';
import {
  isOnlineSessionOrBotMatchActive,
  type RuntimeDomainPortOwner,
} from './GoalBarrierRuntimeBridge.ts';

export type PlayerLoadoutDomainPort = Pick<
  RuntimeDomainPortOwner,
  | 'playerCarIndex'
  | 'selectedPreset'
  | 'selectedHitbox'
  | 'teamAssignment'
  | 'arena'
  | 'physics'
  | 'networkManager'
  | 'botCoordinator'
  | 'loadoutCoordinator'
  | 'modeManager'
  | 'match'
>;

export type PlayerLoadoutTunerSlice = Pick<
  RuntimeTunerPort,
  | 'getInitialVehiclePreset'
  | 'changePlayerVehicle'
  | 'applyPlayerColorChoice'
  | 'syncInitialFreeplayTeamAndColor'
  | 'syncMaterialsConfig'
  | 'applyCustomVehicleTuner'
  | 'importCustomVehicleGlb'
  | 'applyVehicleAlignPreset'
>;

export function resolveInitialVehiclePresetId(
  garagePreset: string | undefined,
  selectedPreset: string
): string | null {
  return garagePreset || selectedPreset || null;
}

export function resolveOnlineAssignedTeamColorHex(
  requestedHex: string,
  localTeamStr: string | undefined,
  isBotMatch: boolean
): string {
  const assignedTeam: 0 | 1 | null =
    localTeamStr === 'orange' ? 1 : localTeamStr === 'blue' ? 0 : isBotMatch ? 0 : null;
  if (assignedTeam === 0 || assignedTeam === 1) {
    return getPreferredColorHex(null, assignedTeam);
  }
  return requestedHex;
}

export function resolveCustomVehicleHitboxOverride(
  selectedPreset: string,
  vehicleId: string,
  hitboxPreset: string | null | undefined,
  selectedHitbox: string | null
): string | null {
  const desc = getVehicleDescriptor(vehicleId);
  if (
    selectedPreset !== vehicleId ||
    (!hitboxPreset && !desc?.threeWheels && vehicleId !== 'trioctane-threewheel')
  ) {
    return null;
  }
  const isThreeWheels = Boolean(
    desc?.threeWheels || vehicleId === 'trioctane-threewheel' || hitboxPreset === 'hitbox-psyclops'
  );
  return isThreeWheels
    ? 'hitbox-psyclops'
    : hitboxPreset || desc?.hitboxPreset || selectedHitbox || 'hitbox-octane';
}

function syncPlayerTeamInNameTagState(playerIdx: number, team: number): void {
  const ntState = getNameTagRuntimeState();
  if (Array.isArray(ntState?.carEntries) && ntState.carEntries.length > 0) {
    setNameTagRuntimeState({
      carEntries: ntState.carEntries.map((c) => (c.carIndex === playerIdx ? { ...c, team } : c)),
    });
  }
}

function applyLocalPlayerTeamToWorld(
  playerIdx: number,
  team: 0 | 1,
  teamAssignment: { playerTeam: number; opponentTeam: number } | null,
  syncOpponentTeam: boolean,
  physics: RocketSimPhysicsEngine | null,
  fallbackSim: { setCarTeam?(carIndex: number, team: number): void } | null | undefined,
  arena: ArenaWorld | null
): number | undefined {
  const prevTeam = teamAssignment?.playerTeam;
  if (teamAssignment) {
    teamAssignment.playerTeam = team;
    if (syncOpponentTeam) {
      teamAssignment.opponentTeam = team === 0 ? 1 : 0;
    }
  }
  arena?.vehicleRegistry.setCarTeam(playerIdx, team);
  physics?.setCarTeam?.(playerIdx, team);
  fallbackSim?.setCarTeam?.(playerIdx, team);
  hudStore.getState().setMatchState({ localTeam: team });
  return prevTeam;
}

export function createPlayerLoadoutRuntimeBridge(
  domain: PlayerLoadoutDomainPort
): PlayerLoadoutTunerSlice {
  const { loadoutCoordinator, networkManager, botCoordinator } = domain;
  const getFallbackSim = () => networkManager.sessionCoordinator.authoritativeServer?.fallbackSim;

  return {
    getInitialVehiclePreset: () => {
      const garagePrefs = garageSettingsStore?.get?.() as { vehiclePreset?: string } | null;
      return resolveInitialVehiclePresetId(garagePrefs?.vehiclePreset, domain.selectedPreset);
    },
    changePlayerVehicle: (carId) => loadoutCoordinator.changePlayerVehicle(carId),
    applyPlayerColorChoice: (hex) => {
      const playerIdx = domain.playerCarIndex ?? 0;
      const activeMode = domain.modeManager?.activeMode;
      const replayViewer = activeMode?.standaloneReplayViewer;
      if (replayViewer?.hasLoadedReplay) {
        if (!replayViewer.isActive) replayViewer._applyUserLoadoutToTakenOverCar?.(playerIdx);
        return;
      }

      const isActiveOnlineRoom = isOnlineSessionOrBotMatchActive(domain);
      const currentMode = domain.match?.state?.mode;
      if (
        (currentMode === 'freeplay' || currentMode === 'static-training-pack') &&
        !isActiveOnlineRoom
      ) {
        const freeplayTeam = getPreferredFreeplayTeam();
        const prevTeam = applyLocalPlayerTeamToWorld(
          playerIdx,
          freeplayTeam,
          domain.teamAssignment,
          false,
          domain.physics,
          getFallbackSim(),
          domain.arena
        );
        syncPlayerTeamInNameTagState(playerIdx, freeplayTeam);
        loadoutCoordinator.setCarColor(playerIdx, hex);
        if (currentMode === 'static-training-pack' && prevTeam !== freeplayTeam) {
          (activeMode as { reloadCurrentShot?: () => void } | null)?.reloadCurrentShot?.();
        }
        return;
      }

      const effectiveHex = isActiveOnlineRoom
        ? resolveOnlineAssignedTeamColorHex(
            hex,
            useAppStore.getState().onlineSession?.localTeam,
            botCoordinator.isBotMatch
          )
        : hex;
      loadoutCoordinator.setCarColor(playerIdx, effectiveHex);
    },
    syncInitialFreeplayTeamAndColor: (targetHex, freeplayTeam) => {
      const playerIdx = domain.playerCarIndex ?? 0;
      if (targetHex) loadoutCoordinator.setCarColor(playerIdx, targetHex);
      const currentMode = domain.match?.state?.mode || useAppStore.getState().matchMode;
      if (!currentMode || currentMode === 'freeplay') {
        applyLocalPlayerTeamToWorld(
          playerIdx,
          freeplayTeam,
          domain.teamAssignment,
          true,
          domain.physics,
          getFallbackSim(),
          domain.arena
        );
      }
    },
    syncMaterialsConfig: (materialsConfig = null) => {
      const config = (materialsConfig || getMaterialsConfig()) as MaterialsConfigLike;
      loadoutCoordinator.syncPlayerMaterialsLoadout(config);
      const { arena } = domain;
      arena?.vehicleRegistry.refreshCustomVehicle();
      arena?.markRenderTreeChanged?.();
    },
    applyCustomVehicleTuner: (vehicleId, hitboxPreset) => {
      const { arena, physics } = domain;
      arena?.vehicleRegistry.refreshCustomVehicle(vehicleId);
      const resolvedHitbox = resolveCustomVehicleHitboxOverride(
        domain.selectedPreset,
        vehicleId,
        hitboxPreset,
        domain.selectedHitbox
      );
      if (resolvedHitbox) {
        domain.selectedHitbox = resolvedHitbox;
        physics?.setCarHitbox?.(domain.playerCarIndex ?? 0, resolvedHitbox);
      }
      arena?.markRenderTreeChanged?.();
    },
    importCustomVehicleGlb: async (vehicleId, arrayBuffer, fileName, alignPreset) =>
      domain.arena?.vehicleRegistry.loadout.importCustomVehicleGlb(
        vehicleId,
        arrayBuffer,
        fileName,
        alignPreset
      ),
    applyVehicleAlignPreset: (vehicleId, alignPreset) =>
      Boolean(
        domain.arena?.vehicleRegistry.loadout.applyVehicleAlignPreset(vehicleId, alignPreset)
      ),
  };
}
