import { applyReplayFrameToEngine } from '../../../replay/ReplayFrameInterpolator.ts';
import {
  type ReplayDirectorRosterRuntimePort,
  captureRuntimeReplayCarEntries,
} from '../../../replay/replayDirectorCarRosterPipeline.ts';
import type { CameraManager } from '../../../camera/CameraManager.ts';
import type { AuthoritativeServerHost } from '../../../network/server/AuthoritativeServerHost.ts';
import type { PredictionReconciler } from '../../../network/client/PredictionReconciler.ts';
import type { PhysicsStateInterpolator } from '../../../physics/PhysicsStateInterpolator.ts';
import type { RocketSimPhysicsEngine } from '../../../physics/RocketSimPhysicsEngine.ts';
import type { ReplayTimelineController } from '../../../replay/ReplayTimelineController.ts';
import type {
  SimulationFrameExecutionFlags,
  SimulationMatchStateSnapshot,
} from './simulationFrameClassifierPipeline.ts';

export function hasPhysicsStatePositionNaN(physics: RocketSimPhysicsEngine): boolean {
  const st = physics.state;
  if (!st) return false;
  if (!Number.isFinite(st[4]) || !Number.isFinite(st[5]) || !Number.isFinite(st[6])) {
    return true;
  }
  const nCars = Math.min(physics.numCars || 1, 8);
  for (let c = 0; c < nCars; c++) {
    if (typeof physics.isCarSlotActive === 'function' && !physics.isCarSlotActive(c)) {
      continue;
    }
    const cOff = 22 + c * 40;
    if (
      !Number.isFinite(st[cOff]) ||
      !Number.isFinite(st[cOff + 1]) ||
      !Number.isFinite(st[cOff + 2])
    ) {
      return true;
    }
  }
  return false;
}

function recordClientDiagnosticReplayFrame(
  physics: RocketSimPhysicsEngine,
  maxFrames: number
): { recorded: boolean; overflowPaused: boolean } {
  const curFrames = physics.getReplayFrameCount?.() ?? 0;
  if (curFrames >= maxFrames) {
    physics.setReplayRecordingActive?.(false);
    return { recorded: false, overflowPaused: true };
  }
  if (physics.getReplayRecordingActive?.() !== false) {
    physics.recordReplayFrame?.();
    return { recorded: true, overflowPaused: false };
  }
  return { recorded: false, overflowPaused: false };
}

export interface NetworkReconcileStepInput {
  readonly timestamp: number;
  readonly physics: RocketSimPhysicsEngine;
  readonly interpolator: PhysicsStateInterpolator;
  readonly camera: CameraManager | null;
  readonly matchState: SimulationMatchStateSnapshot;
  readonly flags: SimulationFrameExecutionFlags;
  readonly reconciler: PredictionReconciler;
  readonly server: AuthoritativeServerHost | null;
  readonly replayTimelineController: ReplayTimelineController | null;
  readonly rosterCapturePort: ReplayDirectorRosterRuntimePort;
  readonly diagnosticDumpMaxFrames: number;
  readonly fleetController: {
    enabled: boolean;
    applyToAuthority(serverOrSim: unknown, tick: number): void;
  } | null;
  readonly sessionStateTarget: { clientReplayOverflowPaused?: boolean } | null;
  readonly lastRecordedClientReplayTick: number;
}

export function stepNetworkReconciliationAndReplayStream(input: NetworkReconcileStepInput): number {
  const {
    timestamp,
    physics,
    interpolator,
    camera,
    matchState,
    flags,
    reconciler,
    server,
    replayTimelineController,
    rosterCapturePort,
    diagnosticDumpMaxFrames,
    fleetController,
    sessionStateTarget,
  } = input;

  let nextRecordedTick = input.lastRecordedClientReplayTick;
  const now = performance.now();

  if (server) {
    if (fleetController?.enabled && !server.isWorker) {
      const sTick = Math.floor(server.sim?.getHeaderView?.()?.tickCount ?? 0);
      fleetController.applyToAuthority(server, sTick);
    }
    server.update();
  }

  const tickBeforeReconcile = Math.floor(physics.getHeaderView().tickCount);
  reconciler.reconcile(now);
  if (
    matchState.paused ||
    flags.isMatchEnded ||
    flags.isGoalReplay ||
    reconciler.replayPlaybackMode ||
    matchState.phase === 'prepare'
  ) {
    reconciler.flushPendingControlPackets?.(now);
  }
  const tickAfterReconcile = Math.floor(physics.getHeaderView().tickCount);

  if (!flags.isGoalReplay && !reconciler.replayPlaybackMode && physics.state) {
    if (hasPhysicsStatePositionNaN(physics)) {
      physics.restoreCompactState?.(physics.state, { preserveEngineTick: true });
      interpolator.sync(timestamp);
      camera?.resetView();
    } else {
      interpolator.currState.set(physics.state);
      if (
        tickAfterReconcile !== tickBeforeReconcile ||
        (reconciler.metrics.lastCorrectionDelta > 0.05 && !reconciler.enableSmoothing)
      ) {
        interpolator.prevState.set(physics.state);
      }
    }
  }

  if (
    reconciler.replayPlaybackMode &&
    Array.isArray(reconciler.drainedReplayPackets) &&
    reconciler.drainedReplayPackets.length > 0
  ) {
    const s = replayTimelineController?.sessionState;
    const isCustomScrubbing = Boolean(
      s && (s.isScrubbing || s.isPaused || Math.abs((s.playbackSpeed ?? 1.0) - 1.0) > 0.01)
    );
    for (let i = 0; i < reconciler.drainedReplayPackets.length; i++) {
      const pkt = reconciler.drainedReplayPackets[i];
      if (!pkt || !pkt.stateSnapshot) continue;
      if (flags.isGoalReplay && replayTimelineController) {
        if (!replayTimelineController.sessionState.isActive) {
          const carEntries = captureRuntimeReplayCarEntries(rosterCapturePort, {
            frameBuffer: pkt.stateSnapshot,
            defaultTeam: matchState.scorer ?? 0,
          });
          replayTimelineController.beginReplaySession({
            scoringTeam: matchState.scorer ?? 0,
            scorerCarIndex: matchState.scorerCarIndex ?? 0,
            carEntries,
            isNetworkStreamed: true,
          });
        }
        const recordedReplayTick = Math.floor(
          Number(pkt.stateSnapshot[0]) > 0 ? pkt.stateSnapshot[0] : pkt.serverTick || 0
        );
        replayTimelineController.appendStreamedReplayFrame?.(
          pkt.stateSnapshot,
          recordedReplayTick,
          pkt.acknowledgedControls
        );
      }
      if ((!isCustomScrubbing || !flags.isGoalReplay) && !flags.isLocalReplayControllerStepping) {
        applyReplayFrameToEngine(physics, pkt.stateSnapshot, interpolator);
        if (!matchState.paused && !flags.isMatchEnded && sessionStateTarget) {
          const recOut = recordClientDiagnosticReplayFrame(physics, diagnosticDumpMaxFrames);
          sessionStateTarget.clientReplayOverflowPaused = recOut.overflowPaused;
        }
      }
    }
    reconciler.drainedReplayPackets.length = 0;
  } else if (
    sessionStateTarget &&
    !matchState.paused &&
    !flags.isMatchEnded &&
    !flags.isGoalReplay &&
    !reconciler.replayPlaybackMode &&
    tickAfterReconcile !== nextRecordedTick
  ) {
    const recOut = recordClientDiagnosticReplayFrame(physics, diagnosticDumpMaxFrames);
    sessionStateTarget.clientReplayOverflowPaused = recOut.overflowPaused;
    if (recOut.recorded) {
      nextRecordedTick = tickAfterReconcile;
    }
  }

  return nextRecordedTick;
}
