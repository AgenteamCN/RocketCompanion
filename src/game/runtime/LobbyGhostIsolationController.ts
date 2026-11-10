import { setLobbyGhostCarIsolation } from '../../network/diagnostics/ZeroGDiagnosticLab.ts';
import {
  LobbyGhostCarCoordinator,
  DEFAULT_GHOST_OPACITY,
  type CarCollisionMaskEntry,
} from '../../network/server/LobbyGhostCarCoordinator.ts';
import { MultiWorldGhostRenderer } from '../modes/MultiWorldGhostRenderer.ts';
import type { ArenaWorld } from '../../entities/ArenaWorld.ts';
import type { RocketSimPhysicsEngine } from '../../physics/RocketSimPhysicsEngine.ts';
import type { PhysicsStateInterpolator } from '../../physics/PhysicsStateInterpolator.ts';
import type { CameraManager } from '../../camera/CameraManager.ts';
import type { AuthoritativeServerHost } from '../../network/server/AuthoritativeServerHost.ts';
import type { PredictionReconciler } from '../../network/client/PredictionReconciler.ts';
import type { DeterminismHarness } from '../../physics/DeterminismHarness.ts';
import type { NetworkSessionChannelLike } from './onlineLobbyTransitionPipeline.ts';

export interface LobbyGhostModeOptions {
  interactWithBall?: boolean;
  hostInteractsWithBall?: boolean;
  ghostOpacity?: number;
  syncServerLobby?: boolean;
  [key: string]: unknown;
}

export interface LobbyGhostModeConfigResult {
  enabled?: boolean;
  lobbyModeActive?: boolean;
  hostCarIndex?: number;
  broadcastHostOnly?: boolean;
  mode: string;
  ghostOpacity: number;
  cars: CarCollisionMaskEntry[];
}

export interface NetworkDiagnosticsHostPort {
  getPhysics(): RocketSimPhysicsEngine | null;
  getArena(): ArenaWorld | null;
  getInterpolator(): PhysicsStateInterpolator | null;
  getCamera(): CameraManager | null;
  getAuthoritativeServer(): AuthoritativeServerHost | null;
  getNetworkChannel(): NetworkSessionChannelLike | null;
  getNetworkReconciler(): PredictionReconciler | null;
  getPlayerCarIndex(): number;
  isMatchPhaseBlockingDiagnosticsFleet(): boolean;
  ensureFlipResetVisual(carIndex: number): void;
  notifyDeterminismHarnessReady(harness: DeterminismHarness, showHUD: boolean): void;
}

export function resolveLobbyGhostActiveCarIndices(
  enabled: boolean,
  numCars: number,
  isCarSlotActive?: ((slotIndex: number) => boolean) | null
): number[] {
  const activeIndices: number[] = [];
  if (!enabled) {
    for (let slotIndex = 0; slotIndex < 8; slotIndex++) activeIndices.push(slotIndex);
    return activeIndices;
  }

  const boundedNumCars = Math.min(Math.max(1, numCars || 1), 8);
  for (let slotIndex = 0; slotIndex < 8; slotIndex++) {
    const slotActive =
      typeof isCarSlotActive === 'function'
        ? isCarSlotActive(slotIndex)
        : slotIndex < boundedNumCars;
    if (slotActive || slotIndex < boundedNumCars) {
      activeIndices.push(slotIndex);
    }
  }
  if (activeIndices.length === 0) activeIndices.push(0);
  return activeIndices;
}

/**
 * Self-contained domain controller owning multi-world ghost rendering and lobby ghost car collision masks.
 */
export class LobbyGhostIsolationController {
  private readonly context: NetworkDiagnosticsHostPort;
  public readonly lobbyGhostCoordinator: LobbyGhostCarCoordinator;
  public multiWorldGhostRenderer: MultiWorldGhostRenderer | null = null;
  public lobbyGhostMode = false;

  constructor(context: NetworkDiagnosticsHostPort) {
    this.context = context;
    this.lobbyGhostCoordinator = new LobbyGhostCarCoordinator();
  }

  public ensureMultiWorldGhostRenderer(): MultiWorldGhostRenderer | null {
    const arena = this.context.getArena();
    if (!this.multiWorldGhostRenderer && arena) {
      this.multiWorldGhostRenderer = new MultiWorldGhostRenderer(arena);
    }
    return this.multiWorldGhostRenderer;
  }

  public ensureLobbyRemoteGhostWorld(): MultiWorldGhostRenderer | null {
    const ghostRenderer = this.ensureMultiWorldGhostRenderer();
    if (ghostRenderer) {
      ghostRenderer.ensureWorld('lobby-remote', {
        paletteIndex: 0,
        opacity: 0.55,
        showCar: true,
        showBall: true,
      });
      ghostRenderer.setVisible(true);
    }
    return ghostRenderer;
  }

  public setLobbyGhostIsolationMode(enabled = true, interactWithBall = false): boolean {
    const playerIdx = this.context.getPlayerCarIndex() ?? 0;
    const physics = this.context.getPhysics();
    const authoritativeServer = this.context.getAuthoritativeServer();
    this.lobbyGhostMode = Boolean(enabled);
    if (physics) setLobbyGhostCarIsolation(physics, playerIdx, enabled, interactWithBall);
    if (authoritativeServer) {
      setLobbyGhostCarIsolation(authoritativeServer, playerIdx, enabled, interactWithBall);
    }
    return this.lobbyGhostMode;
  }

  public configureLobbyGhostMode(
    enabled = true,
    optionsOrInteractWithBall: boolean | LobbyGhostModeOptions = {}
  ): LobbyGhostModeConfigResult {
    const physics = this.context.getPhysics();
    const arena = this.context.getArena();
    const authoritativeServer = this.context.getAuthoritativeServer();

    const options: LobbyGhostModeOptions =
      typeof optionsOrInteractWithBall === 'boolean'
        ? {
            interactWithBall: optionsOrInteractWithBall,
            hostInteractsWithBall: optionsOrInteractWithBall,
          }
        : optionsOrInteractWithBall || {};
    const opacity = options.ghostOpacity ?? DEFAULT_GHOST_OPACITY;
    const hostInteractsWithBall = options.hostInteractsWithBall ?? true;

    const activeIndices = resolveLobbyGhostActiveCarIndices(
      Boolean(enabled),
      physics?.numCars || 1,
      typeof physics?.isCarSlotActive === 'function'
        ? (slotIndex: number) => physics.isCarSlotActive(slotIndex)
        : null
    );

    this.lobbyGhostMode = Boolean(enabled);

    const configResult = this.lobbyGhostCoordinator.configureLobbyMode(physics, activeIndices, {
      ...options,
      enabled,
      hostInteractsWithBall,
      ghostOpacity: opacity,
    }) as LobbyGhostModeConfigResult;

    if (authoritativeServer && options.syncServerLobby !== false) {
      authoritativeServer.setLobbyMode?.(enabled, {
        ...options,
        hostInteractsWithBall,
        ghostOpacity: opacity,
      });
    }

    if (!enabled) {
      arena?.vehicleRegistry.clearAllGhostOpacities();
    } else if (arena && Array.isArray(configResult?.cars)) {
      for (const entry of configResult.cars) {
        arena.vehicleRegistry.setCarGhostOpacity(entry.carIndex, entry.isGhost, entry.opacity);
      }
    }

    this.ensureMultiWorldGhostRenderer()?.setVisible(Boolean(enabled));

    if (!enabled && arena?.cars) {
      const visibleCarCount = Math.min(physics?.numCars || 1, arena.cars.length);
      for (let carIndex = 0; carIndex < visibleCarCount; carIndex++) {
        if (arena.cars[carIndex]) arena.cars[carIndex].visible = true;
      }
    }

    return configResult;
  }

  public applyCarGhostCollision(
    carIndex: number,
    interactWithBall = false,
    interactWithCars = false,
    opacity = DEFAULT_GHOST_OPACITY
  ): CarCollisionMaskEntry {
    const physics = this.context.getPhysics();
    const authoritativeServer = this.context.getAuthoritativeServer();
    const arena = this.context.getArena();
    const entry = this.lobbyGhostCoordinator.applyCarCollisionMask(
      physics,
      carIndex,
      interactWithBall,
      interactWithCars,
      opacity
    );
    authoritativeServer?.setGhostCarConfig?.(carIndex, interactWithBall, interactWithCars, opacity);
    arena?.vehicleRegistry.setCarGhostOpacity(carIndex, entry.isGhost, entry.opacity);
    return entry;
  }
}
