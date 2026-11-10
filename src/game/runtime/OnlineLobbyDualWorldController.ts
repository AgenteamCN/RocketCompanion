import {
  CAR_COLOR_SLOTS,
  normalizeVisualId,
  resolveVehicleHitboxId,
} from '../../ui-core/config/vehicleConstants.ts';
import {
  getPreferredColorSlot,
  loadStoredColorPrefs,
} from '../../ui-core/config/vehiclePresets.ts';
import { getMaterialsConfig } from '../../ui-core/config/materialsConfig.ts';
import { releasePodiumLocksOnEngine } from '../../replay/podiumFormationPipeline.ts';
import { useAppStore, hudStore, networkDiagnosticsStore } from '../runtimeUiPort.ts';
import type { ArenaWorld } from '../../entities/ArenaWorld.ts';
import type { RocketSimPhysicsEngine } from '../../physics/RocketSimPhysicsEngine.ts';
import type { PhysicsStateInterpolator } from '../../physics/PhysicsStateInterpolator.ts';
import type { CameraManager } from '../../camera/CameraManager.ts';
import type { PredictionReconciler } from '../../network/client/PredictionReconciler.ts';
import type { AuthoritativeServerHost } from '../../network/server/AuthoritativeServerHost.ts';
import type { NetworkDiagnosticsProbe } from './NetworkDiagnosticsProbe.ts';
import type { OnlineRosterSnapshotPayload } from './OnlineRosterSyncCoordinator.ts';
import {
  ensureValidClientLobbyLocalCarPose,
  resetLobbyWorldPhysicsPose,
  type LocalVehicleLoadoutState,
  type MaterialsConfigLike,
} from './onlineLobbyTransitionPipeline.ts';

export interface OnlineLobbyWorldHostPort {
  readonly physics: RocketSimPhysicsEngine | null;
  readonly arena: ArenaWorld | null;
  readonly interpolator: PhysicsStateInterpolator | null;
  readonly camera: CameraManager | null;
  readonly cameraSubsystem?: { cameraDynamics: object | null } | null;
  playerCarIndex: number;
  selectedPreset: string;
  selectedHitbox: string | null;
  selectedColorSlot: number | null;
  getFlipResetVisual?(carIndex: number): unknown;
}

export class OnlineLobbyDualWorldController {
  private readonly world: OnlineLobbyWorldHostPort;

  constructor(world: OnlineLobbyWorldHostPort) {
    this.world = world;
  }

  public getLocalLoadout(): LocalVehicleLoadoutState {
    const { selectedPreset, selectedHitbox, selectedColorSlot } = this.world;
    return { selectedPreset, selectedHitbox, selectedColorSlot };
  }

  public configureArenaLobbyFlags(
    isLobbyMode: boolean,
    isHostLobby: boolean,
    playerCarIndex?: number
  ): void {
    const arena = this.world.arena;
    if (!arena) return;
    if (typeof playerCarIndex === 'number') arena.playerCarIndex = playerCarIndex;
    arena.isLobbyMode = isLobbyMode;
    arena.isHostLobby = isHostLobby;
  }

  public activateClientDualWorld(
    reconciler: PredictionReconciler | null,
    diagnosticsProbe: NetworkDiagnosticsProbe
  ): void {
    if (!reconciler) return;
    reconciler.hostLobbyMode = false;
    reconciler.setLobbyDualWorldMode?.(true);
    reconciler.setMatchTelemetryActive?.(true, true);
    diagnosticsProbe.ensureLobbyRemoteGhostWorld();
  }

  public hideNonZeroArenaCars(): void {
    const cars = this.world.arena?.cars;
    if (!cars) return;
    if (cars[0]) cars[0].visible = true;
    for (let i = 1; i < cars.length; i++) {
      if (cars[i]) cars[i].visible = false;
    }
  }

  public isolateNonLocalLobbyCars(localCarIndex: number): void {
    const { physics, arena } = this.world;
    for (let slotIndex = 0; slotIndex < 6; slotIndex++) {
      if (slotIndex !== localCarIndex) {
        if (physics?.isCarSlotActive?.(slotIndex)) physics.removeCar?.(slotIndex);
        if (arena?.cars?.[slotIndex]) arena.cars[slotIndex].visible = false;
      } else if (arena?.cars?.[slotIndex]) {
        arena.cars[slotIndex].visible = true;
      }
    }
  }

  public focusCameraOnCar(carIndex: number): void {
    const targetCarMesh = this.world.arena?.cars?.[carIndex];
    if (!targetCarMesh || !this.world.arena) return;
    targetCarMesh.visible = true;
    this.world.getFlipResetVisual?.(carIndex);
    this.world.camera?.update?.(
      targetCarMesh,
      this.world.arena.ball,
      0,
      this.world.cameraSubsystem?.cameraDynamics ?? {}
    );
  }

  public configureClientLobbyLocalCar(
    carIndex: number,
    team: number,
    visualId: string,
    forceReset: boolean
  ): void {
    const physics = this.world.physics;
    if (!physics) return;
    if (typeof physics.addCarAtSlot === 'function') {
      physics.addCarAtSlot(carIndex, team, visualId);
    } else if (physics.numCars <= carIndex) {
      while (physics.numCars <= carIndex) {
        physics.addCar(physics.numCars % 2, visualId);
      }
    } else {
      physics.setCarHitbox?.(carIndex, visualId);
    }
    this.isolateNonLocalLobbyCars(carIndex);
    physics.setCarTeam?.(carIndex, team);
    physics.setCarCollisionMask?.(carIndex, true, false);
    physics.setCarLinearFactorAndGravity?.(carIndex, 1, 1, 1, 1);
    ensureValidClientLobbyLocalCarPose(physics, carIndex, team, forceReset);
  }

  public async prepareClientJoinLobbyWorld(
    localVisualId: string,
    diagnosticsProbe: NetworkDiagnosticsProbe
  ): Promise<void> {
    const { physics, arena, interpolator } = this.world;
    this.world.playerCarIndex = 1;
    physics?.setUnlimitedBoost?.(true);
    diagnosticsProbe.setTestCarAudioEnabled(true, true);
    await arena?.vehicleRegistry.ensureOpponent();
    this.configureArenaLobbyFlags(true, false, 1);
    this.configureClientLobbyLocalCar(1, 1, localVisualId, true);
    physics?.setBallState?.({ pos: [0, 0, 93.15], vel: [0, 0, 0], angVel: [0, 0, 0] });
    await diagnosticsProbe.ensureClientLobbyDiagnosticProbes();
    this.focusCameraOnCar(1);
    interpolator?.sync?.(performance.now());
  }

  public async activateHostLobbyGhostAndFleet(
    isMatchLobby: boolean,
    authoritativeServer: AuthoritativeServerHost | null,
    diagnosticsProbe: NetworkDiagnosticsProbe,
    applyRosterSnapshot: (roster: OnlineRosterSnapshotPayload | null) => Promise<void>
  ): Promise<void> {
    this.configureArenaLobbyFlags(isMatchLobby, isMatchLobby);
    if (isMatchLobby) {
      diagnosticsProbe.configureLobbyGhostMode(true, { hostInteractsWithBall: true });
    } else {
      diagnosticsProbe.configureLobbyGhostMode(false);
    }
    const initialRoster = (
      authoritativeServer?.lastRoomState as { roster?: OnlineRosterSnapshotPayload } | null
    )?.roster;
    if (initialRoster) await applyRosterSnapshot(initialRoster);
    if (isMatchLobby) {
      await diagnosticsProbe.spawnDiagnosticTestFleet();
      networkDiagnosticsStore?.syncZeroGFleetState?.(true);
    }
  }

  public applyFreeplayTeamAndColorOnStop(): void {
    const { physics, arena } = this.world;
    const loadout = this.getLocalLoadout();
    const visualId = normalizeVisualId(loadout.selectedPreset || 'fennec');
    const hitboxId = loadout.selectedHitbox || resolveVehicleHitboxId(visualId);
    const freeplayPrefs = loadStoredColorPrefs();
    const freeplayTeam: 0 | 1 = freeplayPrefs.primaryTeam === 'orange' ? 1 : 0;
    const freeplayColorSlot = getPreferredColorSlot(freeplayPrefs, freeplayTeam);
    const freeplayColorHex = CAR_COLOR_SLOTS[freeplayColorSlot]?.hex || '#ffc107';
    const matCfg = getMaterialsConfig() as MaterialsConfigLike | null;

    if (physics && physics.numCars > 1) {
      physics.configureCars(hitboxId, false, freeplayTeam);
    } else {
      physics?.setCarTeam?.(0, freeplayTeam);
      physics?.setCarHitbox?.(0, hitboxId);
    }
    arena?.vehicleRegistry.ensureCar(0, freeplayTeam, visualId);
    arena?.vehicleRegistry.swapCarVisual(0, visualId);
    arena?.vehicleRegistry.setCarTeam(0, freeplayTeam);
    arena?.vehicleRegistry.setCarColor(0, freeplayColorHex);
    arena?.vehicleRegistry.setCarLoadout(0, {
      visualId,
      colorHex: freeplayColorHex,
      paintFinish: matCfg?.paintFinish || 'metallic',
      boostVisual: matCfg?.boostVisual || 'cartoon',
      boostAudio: matCfg?.boostAudio || 'standard',
    });
    this.world.selectedColorSlot = freeplayColorSlot;
    hudStore?.getState?.()?.setMatchState?.({ localTeam: freeplayTeam });
  }

  public async restoreParticipantAndArenaState(
    reconciler: PredictionReconciler | null,
    isHost: boolean
  ): Promise<{ resolvedLocalCarIndex: number; localTeam: 0 | 1 }> {
    const { physics, arena } = this.world;
    const loadout = this.getLocalLoadout();
    const resolvedLocalCarIndex = isHost
      ? 0
      : typeof reconciler?.localCarIndex === 'number' && reconciler.localCarIndex >= 0
        ? reconciler.localCarIndex
        : typeof this.world.playerCarIndex === 'number' && this.world.playerCarIndex > 0
          ? this.world.playerCarIndex
          : 1;

    this.world.playerCarIndex = resolvedLocalCarIndex;
    if (reconciler) reconciler.localCarIndex = resolvedLocalCarIndex;
    releasePodiumLocksOnEngine(physics);

    const uiOnline = useAppStore?.getState?.()?.onlineSession;
    const localTeam: 0 | 1 =
      uiOnline?.localTeam === 'orange'
        ? 1
        : uiOnline?.localTeam === 'blue'
          ? 0
          : isHost
            ? 0
            : ((resolvedLocalCarIndex % 2) as 0 | 1);

    const localVisualId =
      loadout.selectedPreset ||
      reconciler?.carVisualPresets?.get?.(resolvedLocalCarIndex) ||
      'fennec';
    const localHitboxId = loadout.selectedHitbox || localVisualId;
    const localColorSlot = loadout.selectedColorSlot ?? (localTeam === 0 ? 3 : 0);
    const matCfg = getMaterialsConfig() as MaterialsConfigLike | null;

    if (physics) {
      if (typeof physics.addCarAtSlot === 'function') {
        physics.addCarAtSlot(resolvedLocalCarIndex, localTeam, localHitboxId);
      } else {
        while (physics.numCars <= resolvedLocalCarIndex) {
          physics.addCar(physics.numCars % 2, localHitboxId);
        }
        physics.setCarHitbox?.(resolvedLocalCarIndex, localHitboxId);
      }
      physics.setCarTeam?.(resolvedLocalCarIndex, localTeam);
      physics.setCarLinearFactorAndGravity?.(resolvedLocalCarIndex, 1, 1, 1, 1);
    }
    reconciler?.setCarVisualPreset?.(resolvedLocalCarIndex, localVisualId);

    if (arena) {
      this.configureArenaLobbyFlags(true, isHost, resolvedLocalCarIndex);
      arena.vehicleRegistry.ensureCar(resolvedLocalCarIndex, localTeam, localVisualId);
      arena.vehicleRegistry.swapCarVisual(resolvedLocalCarIndex, localVisualId);
      const slotObj =
        (typeof localColorSlot === 'number' &&
          localColorSlot >= 0 &&
          localColorSlot < CAR_COLOR_SLOTS.length &&
          (CAR_COLOR_SLOTS[localColorSlot] ||
            CAR_COLOR_SLOTS.find((s) => s.id === localColorSlot))) ||
        null;
      if (slotObj?.hex) arena.vehicleRegistry.setCarColor(resolvedLocalCarIndex, slotObj.hex);
      arena.vehicleRegistry.setCarLoadout(resolvedLocalCarIndex, {
        colorHex: slotObj?.hex || undefined,
        paintFinish: matCfg?.paintFinish || 'metallic',
        boostVisual: matCfg?.boostVisual || 'gold-rush',
        boostAudio: matCfg?.boostAudio || 'rush',
      });
    }

    return { resolvedLocalCarIndex, localTeam };
  }

  public async finalizeLobbyReturnWorldAndProbes(options: {
    isHost: boolean;
    localCarIndex: number;
    localTeam: 0 | 1;
    fromServerRoster?: boolean;
    reconciler: PredictionReconciler | null;
    authoritativeServer: AuthoritativeServerHost | null;
    diagnosticsProbe: NetworkDiagnosticsProbe;
    isStillInLobby: () => boolean;
    syncHostLobbyNotification: () => void;
  }): Promise<boolean> {
    const {
      isHost,
      localCarIndex,
      localTeam,
      fromServerRoster,
      reconciler,
      authoritativeServer,
      diagnosticsProbe,
      isStillInLobby,
      syncHostLobbyNotification,
    } = options;
    const { physics, arena, camera, interpolator } = this.world;

    if (arena) {
      this.configureArenaLobbyFlags(true, isHost, localCarIndex);
      this.isolateNonLocalLobbyCars(localCarIndex);
    }
    reconciler?.resetTimelineState?.();

    if (isHost) {
      if (reconciler) reconciler.hostLobbyMode = true;
      resetLobbyWorldPhysicsPose(physics, 0, localTeam, true);
      if (!fromServerRoster) {
        authoritativeServer?.enterLobbyMode?.({
          ghostCars: true,
          hostInteractsWithBall: true,
          enableDiagnosticsFleet: true,
        });
      }
      reconciler?.setMatchTelemetryActive?.(true, true);
      diagnosticsProbe.configureLobbyGhostMode(true, {
        hostInteractsWithBall: true,
        syncServerLobby: !fromServerRoster,
      });
      await diagnosticsProbe.spawnDiagnosticTestFleet();
      if (!isStillInLobby()) return false;
      networkDiagnosticsStore?.syncZeroGFleetState?.(true);
      syncHostLobbyNotification();
    } else {
      resetLobbyWorldPhysicsPose(physics, localCarIndex, localTeam, false);
      this.activateClientDualWorld(reconciler, diagnosticsProbe);
      await diagnosticsProbe.ensureClientLobbyDiagnosticProbes();
      if (!isStillInLobby()) return false;
    }

    camera?.setFocusedCarIndex?.(localCarIndex);
    camera?.resetView?.();
    interpolator?.sync?.(performance.now());
    return true;
  }
}
