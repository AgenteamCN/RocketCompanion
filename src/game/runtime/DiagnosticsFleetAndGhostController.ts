import {
  DiagnosticsTestVehicleController,
  DEFAULT_DIAGNOSTIC_FLEET,
} from '../../network/diagnostics/DiagnosticsTestVehicles.ts';
import {
  ZERO_G_ANCHOR_MODES,
  configureZeroGVehiclePhysics,
  sampleDiagnosticFleetTelemetry,
  type DiagnosticVehicleSpec,
} from '../../network/diagnostics/ZeroGDiagnosticLab.ts';
import { configureClientLobbyDiagnosticProbes } from '../../network/client/NetworkTelemetryCollector.ts';
import {
  networkDiagnosticsStore,
  getNameTagRuntimeState,
  setNameTagRuntimeState,
  type NameTagCarEntry,
} from '../runtimeUiPort.ts';
import {
  LobbyGhostIsolationController,
  type LobbyGhostModeConfigResult,
  type LobbyGhostModeOptions,
  type NetworkDiagnosticsHostPort,
} from './LobbyGhostIsolationController.ts';

export type { LobbyGhostModeConfigResult, LobbyGhostModeOptions, NetworkDiagnosticsHostPort };

export interface DiagnosticFleetSpawnOptions {
  anchorMode?: string | null;
}

export function mergeDiagnosticProbeNameTagEntries(
  existingEntries: readonly NameTagCarEntry[] | null | undefined
): NameTagCarEntry[] {
  const mergedEntries: NameTagCarEntry[] = Array.isArray(existingEntries)
    ? [...existingEntries]
    : [];
  if (!mergedEntries.some((entry) => entry.carIndex === 6)) {
    mergedEntries.push({ carIndex: 6, name: 'Boost', team: 0 });
  }
  if (!mergedEntries.some((entry) => entry.carIndex === 7)) {
    mergedEntries.push({ carIndex: 7, name: 'Roll', team: 1 });
  }
  return mergedEntries;
}

export interface DiagnosticFleetWorldSnapshot {
  readonly isBlockedByMatchPhase: boolean;
  readonly physics: ReturnType<NetworkDiagnosticsHostPort['getPhysics']>;
  readonly arena: ReturnType<NetworkDiagnosticsHostPort['getArena']>;
  readonly interpolator: ReturnType<NetworkDiagnosticsHostPort['getInterpolator']>;
  readonly channel: ReturnType<NetworkDiagnosticsHostPort['getNetworkChannel']>;
  readonly authoritativeServer: ReturnType<NetworkDiagnosticsHostPort['getAuthoritativeServer']>;
  readonly reconciler: ReturnType<NetworkDiagnosticsHostPort['getNetworkReconciler']>;
}

export type DiagnosticFleetSpawnDecision =
  | { readonly kind: 'blocked' }
  | { readonly kind: 'delegate-remote-channel'; readonly anchorMode: string }
  | {
      readonly kind: 'spawn-local';
      readonly anchorMode: string;
      readonly configureAuthoritativePhysics: boolean;
      readonly syncTimelineWithServer: boolean;
    };

export function resolveDiagnosticFleetSpawnDecision(
  snapshot: DiagnosticFleetWorldSnapshot,
  requestedAnchorMode: string | null | undefined,
  existingAnchorMode: string | null | undefined
): DiagnosticFleetSpawnDecision {
  if (snapshot.isBlockedByMatchPhase) {
    return { kind: 'blocked' };
  }
  const anchorMode = requestedAnchorMode || existingAnchorMode || ZERO_G_ANCHOR_MODES.Z_HOVER;
  if (snapshot.channel && !snapshot.authoritativeServer) {
    return { kind: 'delegate-remote-channel', anchorMode };
  }
  const isLocalServerSim = Boolean(
    snapshot.authoritativeServer && !snapshot.authoritativeServer.isWorker
  );
  return {
    kind: 'spawn-local',
    anchorMode,
    configureAuthoritativePhysics: isLocalServerSim,
    syncTimelineWithServer: Boolean(isLocalServerSim && snapshot.reconciler),
  };
}

export class DiagnosticsFleetAndGhostController extends LobbyGhostIsolationController {
  private readonly readPort: () => NetworkDiagnosticsHostPort;
  public readonly ghostIsolation: LobbyGhostIsolationController;
  public diagnosticsFleetController: DiagnosticsTestVehicleController | null = null;

  constructor(portOrProvider: NetworkDiagnosticsHostPort | (() => NetworkDiagnosticsHostPort)) {
    const port = typeof portOrProvider === 'function' ? portOrProvider() : portOrProvider;
    super(port);
    this.readPort = typeof portOrProvider === 'function' ? portOrProvider : () => portOrProvider;
    this.ghostIsolation = this;
  }

  public captureWorldSnapshot(
    portOverride?: NetworkDiagnosticsHostPort
  ): DiagnosticFleetWorldSnapshot {
    const port = portOverride ?? this.readPort();
    return {
      isBlockedByMatchPhase: port.isMatchPhaseBlockingDiagnosticsFleet(),
      physics: port.getPhysics(),
      arena: port.getArena(),
      interpolator: port.getInterpolator(),
      channel: port.getNetworkChannel(),
      authoritativeServer: port.getAuthoritativeServer(),
      reconciler: port.getNetworkReconciler(),
    };
  }

  public async spawnDiagnosticTestFleet(
    options: DiagnosticFleetSpawnOptions = {},
    portOverride?: NetworkDiagnosticsHostPort
  ): Promise<DiagnosticsTestVehicleController | null> {
    const snapshot = this.captureWorldSnapshot(portOverride);
    const decision = resolveDiagnosticFleetSpawnDecision(
      snapshot,
      options.anchorMode,
      this.diagnosticsFleetController?.anchorMode
    );

    if (decision.kind === 'blocked') return null;
    if (decision.kind === 'delegate-remote-channel') {
      snapshot.channel?.sendDiagnosticFleetToggle?.(true, decision.anchorMode);
      return null;
    }

    const { anchorMode } = decision;
    const { physics, arena, authoritativeServer, reconciler, interpolator } = snapshot;

    if (!this.diagnosticsFleetController) {
      this.diagnosticsFleetController = new DiagnosticsTestVehicleController(
        [...DEFAULT_DIAGNOSTIC_FLEET],
        { anchorMode }
      );
    }
    this.diagnosticsFleetController.anchorMode = anchorMode;
    this.diagnosticsFleetController.enabled = true;

    if (arena) {
      for (const spec of DEFAULT_DIAGNOSTIC_FLEET) {
        arena.vehicleRegistry.ensureCar(spec.carIndex, spec.team, 'fennec');
        if (arena.cars[spec.carIndex]) arena.cars[spec.carIndex].visible = true;
      }
    }

    if (physics) {
      this.diagnosticsFleetController.configurePhysics(physics, anchorMode);
    }
    if (authoritativeServer) {
      if (decision.configureAuthoritativePhysics) {
        this.diagnosticsFleetController.configurePhysics(authoritativeServer, anchorMode);
      }
      authoritativeServer.configureDiagnosticFleet?.(true, anchorMode);
    }
    if (decision.syncTimelineWithServer && authoritativeServer && reconciler) {
      const compactState = authoritativeServer.sim.saveCompactState();
      const serverTick = Math.floor(authoritativeServer.sim.getHeaderView().tickCount);
      reconciler.syncTimeline(compactState, serverTick);
    }
    interpolator?.sync?.();
    return this.diagnosticsFleetController;
  }

  public despawnDiagnosticTestFleet(portOverride?: NetworkDiagnosticsHostPort): void {
    const { physics, authoritativeServer, arena } = this.captureWorldSnapshot(portOverride);

    if (this.diagnosticsFleetController) {
      this.diagnosticsFleetController.enabled = false;
      if (physics) this.diagnosticsFleetController.releasePhysics(physics);
    } else if (physics) {
      const temporaryController = new DiagnosticsTestVehicleController([
        ...DEFAULT_DIAGNOSTIC_FLEET,
      ]);
      temporaryController.releasePhysics(physics);
    }
    if (authoritativeServer && arena?.isLobbyMode) {
      if (!authoritativeServer.isWorker && this.diagnosticsFleetController) {
        this.diagnosticsFleetController.releasePhysics(authoritativeServer);
      }
      authoritativeServer.configureDiagnosticFleet?.(false);
    }
    for (const spec of DEFAULT_DIAGNOSTIC_FLEET) {
      if (arena?.cars?.[spec.carIndex]) arena.cars[spec.carIndex].visible = false;
      arena?.resetCarBoosts?.(spec.carIndex);
      arena?.carDemolitions?.[spec.carIndex]?.stop?.();
    }
  }

  public async ensureClientLobbyDiagnosticProbes(
    portOverride?: NetworkDiagnosticsHostPort
  ): Promise<void> {
    const port = portOverride ?? this.readPort();
    const { physics, reconciler, arena } = this.captureWorldSnapshot(port);

    if (physics) {
      const alreadySyncedProbes = Boolean(
        reconciler?.isTimelineSynchronized &&
        typeof physics.isCarSlotActive === 'function' &&
        physics.isCarSlotActive(6) &&
        physics.isCarSlotActive(7)
      );
      if (alreadySyncedProbes) {
        configureClientLobbyDiagnosticProbes(physics);
      } else {
        configureZeroGVehiclePhysics(physics, [...DEFAULT_DIAGNOSTIC_FLEET]);
      }
    }

    if (arena?.vehicleRegistry) {
      arena.vehicleRegistry.ensureCar(6, 0, 'fennec');
      arena.vehicleRegistry.ensureCar(7, 1, 'fennec');
      for (const definition of DEFAULT_DIAGNOSTIC_FLEET as readonly (DiagnosticVehicleSpec & {
        colorHex?: string;
      })[]) {
        const carIndex = definition.carIndex;
        const carMesh = arena.cars?.[carIndex];
        if (carMesh) {
          carMesh.visible = true;
          if (definition.colorHex) carMesh.setCustomBodyColor?.(definition.colorHex);
        }
        port.ensureFlipResetVisual(carIndex);
      }
    }

    try {
      const currentNameTags = getNameTagRuntimeState?.();
      const updatedEntries = mergeDiagnosticProbeNameTagEntries(currentNameTags?.carEntries);
      setNameTagRuntimeState?.({
        isMultiplayerOrMultiCarMode: true,
        carEntries: updatedEntries,
      });
    } catch {
      // Ignore name tag state update errors in headless environments
    }

    networkDiagnosticsStore?.syncZeroGFleetState?.(true);
  }

  public sampleDiagnosticFleetTelemetry(
    portOverride?: NetworkDiagnosticsHostPort
  ): ReturnType<typeof sampleDiagnosticFleetTelemetry> {
    const { physics, authoritativeServer, reconciler } = this.captureWorldSnapshot(portOverride);
    if (!physics) return [];
    const serverStateBuffer =
      authoritativeServer?.fallbackSim?.state ||
      (authoritativeServer?.isWorker ? authoritativeServer?.cachedSnapshot : null) ||
      reconciler?.lastParsedPacket?.stateSnapshot ||
      null;
    return sampleDiagnosticFleetTelemetry(physics, serverStateBuffer, [
      ...DEFAULT_DIAGNOSTIC_FLEET,
    ]);
  }
}
