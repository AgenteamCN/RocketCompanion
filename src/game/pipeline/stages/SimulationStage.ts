import type { CameraManager } from '../../../camera/CameraManager.ts';
import type { CameraTransformLike } from '../../../audio/SpatialAudioSource.ts';
import type { AuthoritativeServerHost } from '../../../network/server/AuthoritativeServerHost.ts';
import type { PredictionReconciler } from '../../../network/client/PredictionReconciler.ts';
import type { PhysicsStateInterpolator } from '../../../physics/PhysicsStateInterpolator.ts';
import type { ReplayTimelineController } from '../../../replay/ReplayTimelineController.ts';
import type { FrameContext, PipelineStage } from '../FramePipeline.ts';
import {
  CarActionEventSynthesizer,
  type CarActionDebounceState,
  type CarActionSynthesizerRuntimePort,
  dispatchCarActionTickEffects,
} from './CarActionEventSynthesizer.ts';
import {
  type ActiveModeSimulationPort,
  type SimulationMatchStateSnapshot,
  evaluateSimulationFrameFlags,
} from './simulationFrameClassifierPipeline.ts';
import { stepNetworkReconciliationAndReplayStream } from './simulationNetworkReconcilePipeline.ts';

export type { CarActionDebounceState };

export interface SimulationStageRuntimePort extends CarActionSynthesizerRuntimePort {
  interpolator: PhysicsStateInterpolator | null;
  match: {
    state: SimulationMatchStateSnapshot;
  } | null;
  camera: CameraManager | null;
  podiumController: { isActive: boolean } | null;
  replayTimelineController: ReplayTimelineController | null;
  modeManager: {
    getActiveMode(): ActiveModeSimulationPort | null;
  } | null;
  networkManager: {
    diagnosticDumpMaxFrames?: number;
    rosterSyncCoordinator?: {
      lastRosterSnapshot?: {
        players?: Array<{
          carIndex?: number;
          entityId?: number;
          team?: number | string;
          [key: string]: unknown;
        }>;
      } | null;
    } | null;
    sessionCoordinator: {
      authoritativeServer: AuthoritativeServerHost | null;
      networkReconciler: PredictionReconciler | null;
      clientReplayOverflowPaused?: boolean;
    };
    diagnosticsProbe: {
      testCarAudioEnabled?: boolean;
      diagnosticsFleetController?: {
        enabled: boolean;
        applyToAuthority(serverOrSim: unknown, tick: number): void;
      } | null;
    };
  } | null;
  profiler: { mark(): void } | null;
  pollInputs(commitPhysicsStep?: boolean): boolean;
}

const CUSTOM_STEP_MODES = new Set([
  'freeplay',
  'replay-viewer',
  'kickoff-training',
  'dev-test-lab',
  'exp-multi-bots',
  'static-training-pack',
]);

/**
 * SimulationStage.ts
 * Advances deterministic 120Hz physics accumulator, network reconciliation,
 * and delegates vehicle action debounce & incident synthesis to CarActionEventSynthesizer.
 */
export class SimulationStage implements PipelineStage {
  public runtime: SimulationStageRuntimePort;
  public readonly actionSynthesizer = new CarActionEventSynthesizer();
  private _lastRecordedClientReplayTick = -1;
  private _pendingGoalScored = false;

  constructor(runtime: SimulationStageRuntimePort) {
    this.runtime = runtime;
  }

  public resetActionStates(): void {
    this._pendingGoalScored = false;
    this.actionSynthesizer.reset();
  }

  public getCarActionState(carIdx: number): CarActionDebounceState {
    return this.actionSynthesizer.debounceRegistry.getCarActionState(carIdx);
  }

  public execute(context: FrameContext): void {
    const {
      match,
      interpolator,
      physics,
      modeManager,
      networkManager,
      camera,
      podiumController,
      replayTimelineController,
      profiler,
    } = this.runtime;
    if (!match || !interpolator || !physics) return;

    const { timestamp, activeCar } = context;
    const matchState = match.state;
    const activeMode = modeManager?.getActiveMode() ?? null;
    const session = networkManager?.sessionCoordinator ?? null;
    const reconciler = session?.networkReconciler ?? null;
    const server = session?.authoritativeServer ?? null;
    const fleet = networkManager?.diagnosticsProbe?.diagnosticsFleetController ?? null;

    const flags = evaluateSimulationFrameFlags({
      matchState,
      activeMode,
      isPodiumControllerActive: Boolean(podiumController?.isActive),
      hasReconciler: Boolean(reconciler),
      hasServer: Boolean(server),
    });

    context.isPodiumActive = flags.isPodiumActive;
    context.isMatchActive = flags.isMatchActive;

    if (flags.shouldHoldAccumulator) {
      if (!flags.isGoalReplay && !podiumController?.isActive) {
        interpolator.sync(timestamp);
      }
    } else {
      const modeName = matchState.mode;
      const isCustomStepMode = CUSTOM_STEP_MODES.has(modeName);
      interpolator.update(
        timestamp,
        () => {
          this.runtime.pollInputs();
          if (activeCar >= 0 && !this.runtime.playerControls?.jump) {
            this.actionSynthesizer.debounceRegistry.notifyLocalJumpReleased(activeCar);
          }
          if (fleet?.enabled && !reconciler) {
            const cTick = Math.floor(physics.getHeaderView().tickCount);
            fleet.applyToAuthority(physics, cTick);
          }
          if (isCustomStepMode) {
            return modeManager?.getActiveMode()?.onBeforePhysicsTick?.();
          }
        },
        modeName === 'kickoff-training'
          ? () => modeManager?.getActiveMode()?.onStepPhysicsTick?.()
          : isCustomStepMode
            ? () => {
                physics.step(1);
                modeManager?.getActiveMode()?.onAfterPhysicsTick?.();
                return true;
              }
            : undefined
      );
    }

    if (reconciler) {
      context.goalScored = matchState.phase === 'goal';
    } else {
      if (physics.pollGoal() !== 0) {
        this._pendingGoalScored = true;
      }
      context.goalScored = Boolean(this._pendingGoalScored);
      if (!context.isSimulationOnly) {
        this._pendingGoalScored = false;
      }
    }

    if (reconciler && !flags.isLocalDirectorPreview) {
      this._lastRecordedClientReplayTick = stepNetworkReconciliationAndReplayStream({
        timestamp,
        physics,
        interpolator,
        camera,
        matchState,
        flags,
        reconciler,
        server,
        replayTimelineController,
        rosterCapturePort: this.runtime,
        diagnosticDumpMaxFrames: networkManager?.diagnosticDumpMaxFrames || 36000,
        fleetController: fleet,
        sessionStateTarget: session,
        lastRecordedClientReplayTick: this._lastRecordedClientReplayTick,
      });
    }

    if (flags.shouldSynthesizeTickEvents) {
      const camTransform: CameraTransformLike | null | undefined =
        camera && 'camera' in camera ? camera.camera : camera;
      const tickRes = this.actionSynthesizer.stepTickEvents({
        physics,
        playerCarIndex: this.runtime.playerCarIndex ?? 0,
        playerControls: this.runtime.playerControls,
        networkReconciler: reconciler,
        testCarAudioEnabled: Boolean(networkManager?.diagnosticsProbe?.testCarAudioEnabled),
        isMatchEnded: flags.isMatchEnded,
        matchPhase: matchState.phase ?? 'playing',
        clientGoalIncidentLatched: Boolean(this.runtime._clientGoalIncidentLatched),
        camera: camTransform,
      });
      this.runtime._clientGoalIncidentLatched = tickRes.nextClientGoalIncidentLatched;
      dispatchCarActionTickEffects(tickRes, {
        ballTrajectoryPredictor: this.runtime.ballTrajectoryPredictor,
        activeMode: modeManager?.getActiveMode() ?? null,
        getFlipResetVisual: (carIndex) => this.runtime.getFlipResetVisual?.(carIndex) ?? null,
        arena: this.runtime.arena,
      });
    }

    if (profiler && !context.isSimulationOnly) {
      profiler.mark();
    }
  }
}
