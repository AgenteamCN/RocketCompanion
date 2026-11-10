import { useSubsystemIsolationLabStore } from '../../runtimeUiPort.ts';
import type { LabTabContext, LabTabController } from './LabTabTypes.ts';
import {
  parkDevTestLabProbes,
  setupDevTestLabProbes,
  updateDevTestLabProbeParameters,
} from './probeArenaSetupPipeline.ts';
import {
  PROBE_BOOST_SLOT,
  PROBE_QE_SLOT,
  type ProbeControllerState,
  stepDevTestLabProbes,
} from './probeKinematicsPipeline.ts';

export type ProbeCameraTarget = 'player' | 'boost_probe' | 'qe_probe';

export class ProbesLabTab implements LabTabController {
  readonly tabId = 'probes' as const;
  private ctx: LabTabContext | null = null;
  private probeState: ProbeControllerState | null = null;

  onActivate(ctx: LabTabContext): void {
    this.ctx = ctx;
    this.syncConfiguration(true);
  }

  onDeactivate(): void {
    const runtime = this.ctx?.runtime;
    if (runtime?.physics) {
      parkDevTestLabProbes(runtime.physics, runtime.arena);
    }
    this.probeState = null;
    this.applyCameraTarget('player');
    this.ctx = null;
  }

  onPhysicsTick(_dt: number): boolean {
    const physics = this.ctx?.runtime?.physics;
    const store = useSubsystemIsolationLabStore.getState();
    if (!store.probesEnabled || !physics) {
      return true;
    }

    if (!this.probeState) {
      this.syncConfiguration(false);
    }
    const stepOutput = stepDevTestLabProbes(physics, this.probeState);
    if (stepOutput) {
      this.probeState = stepOutput.nextState;
      if (this.probeState.tickCounter % 4 === 0) {
        const { telemetry } = stepOutput;
        store.updateLiveTelemetry({
          probeBoostZ: telemetry.posZ,
          probeBoostVz: telemetry.velZ,
          probeBoostPhase: telemetry.phase,
          probeBoostHoldTicks: telemetry.holdCounter,
          probeRollDir: telemetry.rollDir,
        });
      }
    }
    return true;
  }

  syncConfiguration(forceRestart = false): void {
    const runtime = this.ctx?.runtime;
    if (!runtime?.physics) return;
    const { physics, arena, interpolator } = runtime;
    const store = useSubsystemIsolationLabStore.getState();
    if (store.activeTab !== 'probes') return;

    if (store.probesEnabled) {
      if (!forceRestart && this.probeState && physics.numCars > PROBE_QE_SLOT) {
        this.probeState = updateDevTestLabProbeParameters(
          physics,
          this.probeState,
          store.probeBaseAltitudeZ,
          store.probePeakAltitudeZ,
          store.probeOffsetX,
          store.probeOffsetY,
          store.probeOffsetZ,
          arena
        );
      } else {
        this.probeState = setupDevTestLabProbes(
          physics,
          arena,
          store.probeBaseAltitudeZ,
          store.probePeakAltitudeZ,
          store.probeOffsetX,
          store.probeOffsetY,
          store.probeOffsetZ
        );
      }
      store.updateLiveTelemetry({
        probeBoostZ: this.probeState?.effectiveBaseZ ?? store.probeBaseAltitudeZ,
        probeBoostVz: 0,
        probeBoostPhase: 'CLIMB_TO_PEAK',
        probeBoostHoldTicks: 0,
        probeRollDir: 1,
      });
      interpolator?.sync();
    } else {
      parkDevTestLabProbes(physics, arena);
      this.probeState = null;
      if (store.probeCameraTarget !== 'player') {
        this.applyCameraTarget('player');
      }
    }
  }

  applyCameraTarget(target: ProbeCameraTarget): void {
    const runtime = this.ctx?.runtime;
    if (!runtime) return;
    const nextIdx =
      target === 'boost_probe' ? PROBE_BOOST_SLOT : target === 'qe_probe' ? PROBE_QE_SLOT : 0;
    runtime.playerCarIndex = nextIdx;
    if (runtime.arena) {
      runtime.arena.playerCarIndex = nextIdx;
    }
  }
}
