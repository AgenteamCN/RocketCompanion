import { decodeReplayDirectorTelemetryFromState } from '../../../replay/ReplayFrameInterpolator.ts';
import {
  captureRuntimeReplayCarEntries,
  type ReplayCarEntryRuntimePort,
} from '../../../replay/replayDirectorCarRosterPipeline.ts';
import {
  beginGoalReplaySession,
  stepGoalReplaySessionFrame,
  type GoalReplayCameraMode,
  type GoalReplayFrameContextPort,
  type GoalReplayRuntimePort,
  type GoalReplayTimelineControllerPort,
} from './GoalReplaySessionCoordinator.ts';

export function stepNetworkStreamedGoalReplayFrame(params: {
  runtime: GoalReplayRuntimePort | null | undefined;
  replayController: GoalReplayTimelineControllerPort;
  context?: GoalReplayFrameContextPort | null;
  source?: string;
  isUnlimitedBoost?: boolean;
  syncCarAudioControls?: boolean;
  syncBoostToHud?: boolean;
  getCameraMode: () => GoalReplayCameraMode;
  setCameraMode: (mode: GoalReplayCameraMode) => void;
  getScoringTeam: () => number;
  setScoringTeam?: (team: number) => void;
  getScorerCarIndex: () => number;
  setScorerCarIndex?: (carIndex: number) => void;
  getPovCarIndex?: () => number | null;
  setPovCarIndex?: (carIndex: number | null) => void;
}): void {
  const {
    runtime: scenePort,
    replayController,
    context,
    source = 'freeplay-goal-replay',
    isUnlimitedBoost = false,
    syncCarAudioControls = true,
    syncBoostToHud = true,
    getCameraMode,
    setCameraMode,
    getScoringTeam,
    setScoringTeam,
    getScorerCarIndex,
    setScorerCarIndex,
    getPovCarIndex,
    setPovCarIndex,
  } = params;
  if (!replayController.sessionState?.isActive) {
    const scoringTeam = scenePort?.match?.state?.scorer ?? 0;
    const scorerCarIndex = scenePort?.match?.state?.scorerCarIndex ?? 0;
    const carEntries = captureRuntimeReplayCarEntries(
      scenePort as unknown as ReplayCarEntryRuntimePort,
      { defaultTeam: scoringTeam }
    );
    const totalFrames = replayController.beginReplaySession({
      scoringTeam,
      scorerCarIndex,
      carEntries,
      isNetworkStreamed: Boolean(scenePort?.networkReconciler ?? true),
    });
    setScoringTeam?.(scoringTeam);
    setScorerCarIndex?.(scorerCarIndex);
    setCameraMode('director');
    setPovCarIndex?.(null);
    if (scenePort) scenePort.replayPovCarIndex = null;
    beginGoalReplaySession(scenePort, replayController, {
      cameraMode: 'director',
      source,
      syncHud: true,
      totalFrames,
      getCameraMode,
      setCameraMode,
      getScoringTeam,
      getScorerCarIndex,
      getPovCarIndex: () =>
        getPovCarIndex ? getPovCarIndex() : (scenePort?.replayPovCarIndex ?? null),
      setPovCarIndex: (carIdx) => {
        setPovCarIndex?.(carIdx);
        if (scenePort) scenePort.replayPovCarIndex = carIdx;
      },
    });
  }
  if (typeof scenePort?.replayPovCarIndex === 'number' && scenePort.replayPovCarIndex >= 0) {
    setCameraMode('pov');
    setPovCarIndex?.(scenePort.replayPovCarIndex);
  } else if (
    scenePort?.isGoalReplayCameraOverrideActive?.() &&
    getCameraMode() === 'pov' &&
    scenePort.replayPovCarIndex === null
  ) {
    setCameraMode('director');
    setPovCarIndex?.(null);
  }
  const cameraMode = getCameraMode() || 'director';
  const s = replayController.sessionState;
  const isCustomScrubbing = Boolean(
    s?.isScrubbing || s?.isPaused || Math.abs((s?.playbackSpeed ?? 1.0) - 1.0) > 0.01
  );
  const networkStreamSnapshot = !isCustomScrubbing
    ? (scenePort?.networkReconciler?.lastParsedPacket?.stateSnapshot ?? null)
    : null;
  const embedded = networkStreamSnapshot
    ? decodeReplayDirectorTelemetryFromState(networkStreamSnapshot)
    : null;
  const scorerCarIdx = s?.scorerCarIndex ?? getScorerCarIndex();
  const resolvedPovCarIdx = getPovCarIndex
    ? getPovCarIndex()
    : typeof scenePort?.replayPovCarIndex === 'number' && scenePort.replayPovCarIndex >= 0
      ? scenePort.replayPovCarIndex
      : scorerCarIdx;
  stepGoalReplaySessionFrame({
    runtime: scenePort,
    replayController,
    context,
    dt: context?.dt ?? 1 / 120,
    source,
    cameraMode,
    scoringTeam: s?.scoringTeam ?? getScoringTeam(),
    scorerCarIndex: scorerCarIdx,
    povCarIndex: cameraMode === 'pov' ? resolvedPovCarIdx : null,
    applyToEngine: isCustomScrubbing,
    dispatchEvents: false,
    syncCarAudioControls,
    syncBoostToHud,
    emitWillEndSignal: false,
    syncHudProgress: true,
    isUnlimitedBoost,
    networkStreamSnapshot,
    overrideProgress: embedded && typeof embedded.progress === 'number' ? embedded.progress : null,
  });
}
