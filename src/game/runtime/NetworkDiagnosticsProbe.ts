import { DeterminismHarness } from '../../physics/DeterminismHarness.ts';
import type { DiagnosticsTestVehicleController } from '../../network/diagnostics/DiagnosticsTestVehicles.ts';
import { networkDiagnosticsStore, type NameTagCarEntry } from '../runtimeUiPort.ts';
import {
  DiagnosticsFleetAndGhostController,
  type DiagnosticFleetSpawnOptions,
  type LobbyGhostModeConfigResult,
  type LobbyGhostModeOptions,
  type NetworkDiagnosticsHostPort,
} from './DiagnosticsFleetAndGhostController.ts';

export interface PhysicsRateOptions {
  min?: number;
  max?: number;
  round?: boolean;
}

export type {
  DiagnosticFleetSpawnOptions,
  LobbyGhostModeConfigResult,
  LobbyGhostModeOptions,
  NameTagCarEntry,
  NetworkDiagnosticsHostPort,
};

export function computeClampedPhysicsRate(rate: number, options: PhysicsRateOptions = {}): number {
  const minRate = Number.isFinite(options.min) ? Number(options.min) : 108;
  const maxRate = Number.isFinite(options.max) ? Number(options.max) : 132;
  const numericRate = Number(rate);
  const normalized = options.round ? Math.round(numericRate) : Math.round(numericRate * 100) / 100;
  return Math.max(minRate, Math.min(maxRate, normalized));
}

export function computeAdjustedExtraLatencyMs(
  currentChannelExtraMs: number | undefined,
  storeExtraMs: number | undefined,
  deltaLatencyMs: number
): number {
  const baseExtra =
    typeof currentChannelExtraMs === 'number' && Number.isFinite(currentChannelExtraMs)
      ? currentChannelExtraMs
      : typeof storeExtraMs === 'number' && Number.isFinite(storeExtraMs)
        ? storeExtraMs
        : 0;
  return Math.max(0, Math.min(500, Math.round(baseExtra + deltaLatencyMs)));
}

export interface NetworkLatencySnapshot {
  readonly currentChannelExtraMs: number | undefined;
  readonly storeExtraMs: number | undefined;
  readonly channelRttMs: number | undefined;
  readonly resolvedReconcilerRttMs: number | null;
}

export interface NetworkLatencyUpdateCommand {
  readonly newExtraLatencyMs: number;
  readonly effectiveRttMs: number;
}

export function resolveNetworkLatencyUpdateCommand(
  snapshot: NetworkLatencySnapshot,
  deltaLatencyMs: number
): NetworkLatencyUpdateCommand {
  const newExtraLatencyMs = computeAdjustedExtraLatencyMs(
    snapshot.currentChannelExtraMs,
    snapshot.storeExtraMs,
    deltaLatencyMs
  );
  const effectiveRttMs =
    snapshot.resolvedReconcilerRttMs ?? snapshot.channelRttMs ?? newExtraLatencyMs * 2;
  return {
    newExtraLatencyMs,
    effectiveRttMs,
  };
}

export class NetworkDiagnosticsProbe extends DiagnosticsFleetAndGhostController {
  private readonly readProbePort: () => NetworkDiagnosticsHostPort;
  public readonly fleetAndGhost: DiagnosticsFleetAndGhostController;
  determinismHarness: DeterminismHarness | null = null;
  diagnosticObservationTarget = 0;
  testCarAudioEnabled = false;
  physicsRate = 120;

  constructor(portOrProvider: NetworkDiagnosticsHostPort | (() => NetworkDiagnosticsHostPort)) {
    super(portOrProvider);
    this.readProbePort =
      typeof portOrProvider === 'function' ? portOrProvider : () => portOrProvider;
    this.fleetAndGhost = this;
  }

  setMultiWorldGhostVisible(visible: boolean): void {
    this.multiWorldGhostRenderer?.setVisible(Boolean(visible));
  }

  getPhysicsRate(portOverride?: NetworkDiagnosticsHostPort): number {
    const port = portOverride ?? this.readProbePort();
    return port.getInterpolator()?.physicsRate ?? this.physicsRate ?? 120;
  }

  setPhysicsRate(
    rate: number,
    options: PhysicsRateOptions = {},
    portOverride?: NetworkDiagnosticsHostPort
  ): number {
    const port = portOverride ?? this.readProbePort();
    const interpolator = port.getInterpolator();
    if (interpolator && typeof interpolator.setPhysicsRate === 'function') {
      const applied = interpolator.setPhysicsRate(rate, options);
      this.physicsRate = applied;
      return applied;
    }
    const clamped = computeClampedPhysicsRate(rate, options);
    this.physicsRate = clamped;
    return clamped;
  }

  adjustPhysicsRate(
    delta: number,
    options: PhysicsRateOptions = {},
    portOverride?: NetworkDiagnosticsHostPort
  ): number {
    const currentRate = this.getPhysicsRate(portOverride);
    const deltaNum = Number(delta);
    if (!Number.isFinite(deltaNum)) return currentRate;
    return this.setPhysicsRate(currentRate + deltaNum, options, portOverride);
  }

  setPhysicsTickScale(
    scale: number,
    options: PhysicsRateOptions = {},
    portOverride?: NetworkDiagnosticsHostPort
  ): number {
    const scaleNum = Number(scale);
    if (!Number.isFinite(scaleNum) || scaleNum <= 0) return this.getPhysicsRate(portOverride);
    return this.setPhysicsRate(120 * scaleNum, options, portOverride);
  }

  resetPhysicsRate(portOverride?: NetworkDiagnosticsHostPort): number {
    return this.setPhysicsRate(120, {}, portOverride);
  }

  dropPacketBurst(count: number | null = null, portOverride?: NetworkDiagnosticsHostPort): void {
    const port = portOverride ?? this.readProbePort();
    port.getNetworkChannel()?.forceDropNextInput?.(count ?? 5);
  }

  dumpNextNetworkPacket(portOverride?: NetworkDiagnosticsHostPort): Promise<unknown> {
    const port = portOverride ?? this.readProbePort();
    const reconciler = port.getNetworkReconciler();
    if (reconciler?.controlMessenger) {
      console.log(
        '%c[Network Packet Dump]%c Waiting for next incoming datagram...',
        'background:#1f6feb;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold',
        'color:#58a6ff'
      );
      return reconciler.controlMessenger.triggerDumpNextPacket();
    }
    console.warn('[Network Packet Dump] No active network prediction reconciler.');
    return Promise.resolve(null);
  }

  dumpLatestNetworkPacket(
    packet: Uint8Array | ArrayBuffer | null = null,
    portOverride?: NetworkDiagnosticsHostPort
  ): unknown {
    const port = portOverride ?? this.readProbePort();
    const reconciler = port.getNetworkReconciler();
    if (reconciler?.dumpPacket) return reconciler.dumpPacket(packet);
    console.warn('[Network Packet Dump] No active network prediction reconciler.');
    return null;
  }

  adjustNetworkLatency(deltaLatencyMs: number, portOverride?: NetworkDiagnosticsHostPort): number {
    const { channel, reconciler } = this.captureWorldSnapshot(portOverride);
    const storeExtra = networkDiagnosticsStore?.getSnapshot?.()?.metrics?.extraLatencyMs;
    const newLatency = computeAdjustedExtraLatencyMs(
      channel?.extraLatencyMs,
      storeExtra,
      deltaLatencyMs
    );

    networkDiagnosticsStore?.setExtraLatency?.(newLatency);
    if (channel) {
      if (typeof channel.setExtraLatency === 'function') {
        channel.setExtraLatency(newLatency);
      } else {
        channel.extraLatencyMs = newLatency;
      }
    }
    if (reconciler) {
      const command = resolveNetworkLatencyUpdateCommand(
        {
          currentChannelExtraMs: channel?.extraLatencyMs,
          storeExtraMs: storeExtra,
          channelRttMs: channel?.rttMs,
          resolvedReconcilerRttMs:
            typeof reconciler._resolveEffectiveRtt === 'function'
              ? reconciler._resolveEffectiveRtt()
              : null,
        },
        0
      );
      reconciler.leadTicks = reconciler.calculateLeadTicks(command.effectiveRttMs);
      reconciler.metrics.leadTicks = reconciler.leadTicks;
      reconciler.metrics.rttMs = command.effectiveRttMs;
      reconciler.notifyMetricsUpdated?.();
    }
    return newLatency;
  }

  adjustSimulatedLatency(
    direction: number,
    stepMs?: number,
    portOverride?: NetworkDiagnosticsHostPort
  ): number {
    const configuredStep =
      stepMs ?? networkDiagnosticsStore?.getSnapshot?.()?.metrics?.adjustStepMs ?? 50;
    return this.adjustNetworkLatency(direction * configuredStep, portOverride);
  }

  async spawnHeadlessCarEntity(portOverride?: NetworkDiagnosticsHostPort): Promise<void> {
    const { arena, physics, authoritativeServer, reconciler, interpolator } =
      this.captureWorldSnapshot(portOverride);

    await arena?.vehicleRegistry.ensureOpponent();
    if (arena?.cars?.[1]) arena.cars[1].visible = true;
    if (physics && physics.numCars < 2) physics.addCar(1, 'default');
    if (authoritativeServer) authoritativeServer.ensureCar(1, 1);
    if (authoritativeServer && reconciler) {
      const snapshot = authoritativeServer.sim.saveCompactState();
      const serverTick = Math.floor(authoritativeServer.sim.getHeaderView().tickCount);
      reconciler.syncTimeline(snapshot, serverTick);
    }
    interpolator?.sync?.();
  }

  async enableDeterminismHarness(
    showHUD = true,
    portOverride?: NetworkDiagnosticsHostPort
  ): Promise<DeterminismHarness | null> {
    const port = portOverride ?? this.readProbePort();
    const physics = port.getPhysics();
    if (!physics) return null;
    if (!this.determinismHarness) {
      this.determinismHarness = new DeterminismHarness(physics);
      await this.determinismHarness.init();
    }
    port.notifyDeterminismHarnessReady(this.determinismHarness, showHUD);
    return this.determinismHarness;
  }

  override despawnDiagnosticTestFleet(portOverride?: NetworkDiagnosticsHostPort): void {
    this.diagnosticObservationTarget = 0;
    super.despawnDiagnosticTestFleet(portOverride);
  }

  async toggleDiagnosticTestFleet(
    forceEnabled: boolean | null = null,
    anchorMode: string | null = null,
    portOverride?: NetworkDiagnosticsHostPort
  ): Promise<DiagnosticsTestVehicleController | null> {
    const nextEnabled =
      forceEnabled !== null
        ? Boolean(forceEnabled)
        : !Boolean(this.diagnosticsFleetController?.enabled);
    if (nextEnabled) return this.spawnDiagnosticTestFleet({ anchorMode }, portOverride);
    const { channel, authoritativeServer, arena } = this.captureWorldSnapshot(portOverride);
    if (channel && !authoritativeServer && arena?.isLobbyMode) {
      channel.sendDiagnosticFleetToggle?.(false, null);
    }
    this.despawnDiagnosticTestFleet(portOverride);
    return null;
  }

  setDiagnosticObservationTarget(
    targetCarIndex = 0,
    portOverride?: NetworkDiagnosticsHostPort
  ): number {
    const clampedIndex = Math.max(0, Math.min(7, Math.floor(Number(targetCarIndex) || 0)));
    this.diagnosticObservationTarget = clampedIndex;
    const port = portOverride ?? this.readProbePort();
    const camera = port.getCamera();
    if (clampedIndex > 0 && camera) camera.ballCam = false;
    return clampedIndex;
  }

  setTestCarAudioEnabled(enabled = false, syncStore = false): boolean {
    this.testCarAudioEnabled = Boolean(enabled);
    if (syncStore) networkDiagnosticsStore?.setTestCarAudioEnabled?.(this.testCarAudioEnabled);
    return this.testCarAudioEnabled;
  }

  toggleTestCarAudio(forceEnabled: boolean | null = null): boolean {
    const nextEnabled =
      forceEnabled !== null ? Boolean(forceEnabled) : !Boolean(this.testCarAudioEnabled);
    this.testCarAudioEnabled = nextEnabled;
    return nextEnabled;
  }
}
