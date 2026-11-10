import { hudStore, setNameTagRuntimeState, useAppStore } from '../../runtimeUiPort.ts';
import {
  captureRuntimeReplayCarEntries,
  type NormalizedReplayDirectorCarEntry,
  type ReplayCarEntryRuntimePort,
} from '../../../replay/replayDirectorCarRosterPipeline.ts';
import { extractGoalReplayFrames } from '../../../replay/ReplayPlaybackState.ts';
import type { ReplayRingBuffer, ReplayRingBufferSlot } from '../../../replay/ReplayRingBuffer.ts';
import type { ReplayTimelineController } from '../../../replay/ReplayTimelineController.ts';
import { EXPIRE_REPLAY_LOOKBACK_TICKS } from '../shared/goalAndBallTouchPipeline.ts';
import {
  beginGoalReplaySession,
  bindGoalReplayHudCallbacks,
  type GoalReplayRuntimePort,
} from '../shared/GoalReplaySessionCoordinator.ts';
import {
  applyReplayControllerFrameAndDirectorCamera,
  type GoalReplayCameraMode,
} from '../shared/goalReplayHudPipeline.ts';
import { prepareDirectorPatternPreviewRoster } from './directorPreviewPipeline.ts';

export interface GoalReplayIncidentInput {
  goalIncidentTick: number;
  lastTouchTick: number;
  lastKickoffStartTick: number;
  scoringTeam?: number;
  scorerCarIndex: number;
  scorerName: string;
  ballSpeedKph: number | null;
  replayType?: 'goal' | 'expire';
}

export interface PreparedFreeplayGoalReplayData {
  scoringTeam: number;
  scorerCarIndex: number;
  scorerName: string;
  ballSpeedKph: number | null;
  extractedFrames: Array<ReplayRingBufferSlot | ReturnType<typeof extractGoalReplayFrames>[number]>;
  carEntries: NormalizedReplayDirectorCarEntry[];
}

export function resolveFreeplayGoalScoringTeam(
  explicitScoringTeam: number | undefined,
  ballPosY: number | undefined,
  playerTeam: number
): number {
  if (explicitScoringTeam === 0 || explicitScoringTeam === 1) {
    return explicitScoringTeam;
  }
  if (typeof ballPosY === 'number' && Math.abs(ballPosY) > 100) {
    return ballPosY >= 0 ? 0 : 1;
  }
  return playerTeam;
}

export function prepareFreeplayGoalReplaySessionData(params: {
  runtime: GoalReplayRuntimePort | null | undefined;
  ringBuffer: ReplayRingBuffer;
  playerTeam: number;
  isStandaloneReplayLoaded: boolean;
  explicitCarEntries?: unknown[] | null;
  incident: GoalReplayIncidentInput;
  currentTick: number;
  ballPosY?: number;
}): PreparedFreeplayGoalReplayData | null {
  const {
    runtime: scenePort,
    ringBuffer,
    playerTeam,
    isStandaloneReplayLoaded,
    explicitCarEntries,
    incident,
    currentTick,
    ballPosY,
  } = params;
  const scoringTeam = resolveFreeplayGoalScoringTeam(incident.scoringTeam, ballPosY, playerTeam);
  const scorerCarIndex = incident.scorerCarIndex;
  const scorerName = incident.scorerName || 'Player';
  const goalTick = incident.goalIncidentTick > 0 ? incident.goalIncidentTick : currentTick;
  const extractedFrames =
    incident.replayType === 'expire'
      ? ringBuffer.getFramesInTickRange(
          Math.max(incident.lastKickoffStartTick, goalTick - EXPIRE_REPLAY_LOOKBACK_TICKS),
          currentTick
        )
      : extractGoalReplayFrames({
          ringBuffer,
          engine: null,
          goalIncidentTick: goalTick,
          scorerTouchTick: incident.lastTouchTick,
          lookbackSeconds: 10.0,
          touchLookbackSeconds: 7.0,
          postGoalTicks: Math.max(0, currentTick - goalTick),
          lastKickoffWillStartTick: incident.lastKickoffStartTick,
        });
  if (!Array.isArray(extractedFrames) || extractedFrames.length === 0) return null;

  const resolvedPlayerTeam: 0 | 1 = playerTeam === 1 ? 1 : 0;
  const fallbackCarName = incident.replayType === 'expire' ? 'Player' : scorerName;
  const capturedEntries = captureRuntimeReplayCarEntries(
    scenePort as unknown as ReplayCarEntryRuntimePort,
    {
      frameBuffer: extractedFrames[0].snapshot,
      explicitEntries:
        (explicitCarEntries as NormalizedReplayDirectorCarEntry[] | undefined) ?? undefined,
      defaultTeam: resolvedPlayerTeam,
    }
  );
  const carEntries = capturedEntries.map((entry) =>
    entry.carIndex === scorerCarIndex
      ? {
          ...entry,
          name: entry.name || fallbackCarName,
          username: entry.username || fallbackCarName,
          team: isStandaloneReplayLoaded ? entry.team : resolvedPlayerTeam,
        }
      : entry
  );
  return {
    scoringTeam,
    scorerCarIndex,
    scorerName,
    ballSpeedKph: incident.ballSpeedKph,
    extractedFrames,
    carEntries,
  };
}

export function ensureFreeplayModeBeforePatternPreview(scenePort: {
  match?: { state?: { mode?: string; phase?: string } | null } | null;
  modeManager?: { setMode?: (modeId: string) => void } | null;
}): void {
  const appState = useAppStore.getState();
  if (appState.isOpen) appState.closeMenu();
  const matchState = scenePort.match?.state;
  if (matchState && matchState.mode !== 'freeplay') {
    matchState.mode = 'freeplay';
    matchState.phase = 'playing';
    appState.setMatchMode('freeplay');
    if (scenePort.modeManager?.setMode) {
      scenePort.modeManager.setMode('freeplay');
    }
  }
}

export function activateFreeplayPatternPreviewScene(params: {
  scenePort: GoalReplayRuntimePort & {
    keyboard?: { ballControlEnabled?: boolean } | null;
  };
  replayController: ReplayTimelineController;
  savedCar0: NormalizedReplayDirectorCarEntry | null;
  fallbackScorerName: string;
  startPaused: boolean;
  restart: boolean;
}): ReturnType<typeof prepareDirectorPatternPreviewRoster> {
  const { scenePort, replayController, savedCar0, fallbackScorerName, startPaused, restart } =
    params;
  const roster = prepareDirectorPatternPreviewRoster(
    scenePort,
    replayController,
    savedCar0,
    fallbackScorerName
  );
  setNameTagRuntimeState({
    isMultiplayerOrMultiCarMode: roster.numCars > 1,
    carEntries: roster.effectiveCarEntries,
  });
  replayController.startPreviewSession({
    loop: true,
    startPaused,
    restart,
  });
  if (scenePort.match?.state) scenePort.match.state.phase = 'replay';
  if (scenePort.keyboard) scenePort.keyboard.ballControlEnabled = false;
  if (scenePort.acquireGoalReplayCameraOverride) {
    scenePort.acquireGoalReplayCameraOverride('freeplay-goal-replay');
  }
  if (scenePort.ballTrajectoryPredictor?.acquireTemporarySuppression) {
    scenePort.ballTrajectoryPredictor.acquireTemporarySuppression('freeplay-goal-replay');
  }
  applyReplayControllerFrameAndDirectorCamera(
    scenePort,
    replayController,
    roster.scoringTeam,
    roster.scorerCarIndex
  );
  return roster;
}

export function prepareAndLaunchFreeplayGoalReplay(params: {
  scenePort:
    | (GoalReplayRuntimePort & {
        physics?:
          | (NonNullable<GoalReplayRuntimePort['physics']> & {
              getBallStateView?: () => { posY: number } | null;
              getHeaderView?: () => { tickCount: number } | null;
            })
          | null;
        keyboard?: { ballControlEnabled?: boolean } | null;
        arena?:
          | (NonNullable<GoalReplayRuntimePort['arena']> & {
              carTeams?: ArrayLike<number>;
              setCarTeam?: (carIndex: number, team: number) => void;
            })
          | null;
      })
    | null;
  ringBuffer: ReplayRingBuffer;
  replayController: ReplayTimelineController;
  playerTeam: number;
  isStandaloneReplayLoaded: boolean;
  explicitCarEntries?: unknown[] | null;
  incident: GoalReplayIncidentInput;
}): { prepared: PreparedFreeplayGoalReplayData; totalFrames: number } | null {
  const {
    scenePort,
    ringBuffer,
    replayController,
    playerTeam,
    isStandaloneReplayLoaded,
    explicitCarEntries,
    incident,
  } = params;
  const sim = scenePort?.physics;
  if (!sim || ringBuffer.size === 0) return null;
  const currentTick = Math.floor(
    (sim.getHeaderView ? sim.getHeaderView()?.tickCount : undefined) ?? 0
  );
  const prepared = prepareFreeplayGoalReplaySessionData({
    runtime: scenePort,
    ringBuffer,
    playerTeam,
    isStandaloneReplayLoaded,
    explicitCarEntries,
    incident,
    currentTick,
    ballPosY: sim.getBallStateView ? sim.getBallStateView()?.posY : undefined,
  });
  if (!prepared) return null;

  const isExpireReplay = incident.replayType === 'expire';
  if (!isStandaloneReplayLoaded && scenePort?.arena?.setCarTeam) {
    scenePort.arena.setCarTeam(prepared.scorerCarIndex, playerTeam);
  }
  const totalFrames = replayController.beginReplaySession({
    scoringTeam: prepared.scoringTeam,
    scorerCarIndex: prepared.scorerCarIndex,
    carEntries: prepared.carEntries,
    carTeamResolver: (carIdx: number) =>
      carIdx === prepared.scorerCarIndex
        ? playerTeam
        : (scenePort?.arena?.carTeams?.[carIdx] ?? carIdx % 2),
    frames: prepared.extractedFrames,
    disableSlowMo: isExpireReplay,
    watchAllTouches: isExpireReplay,
  });

  if (scenePort?.match?.state) scenePort.match.state.phase = 'replay';
  if (scenePort?.keyboard) scenePort.keyboard.ballControlEnabled = false;

  beginGoalReplaySession(scenePort, replayController, {
    cameraMode: 'director',
    source: 'freeplay-goal-replay',
    syncHud: false,
    scoringTeam: prepared.scoringTeam,
    scorerCarIndex: prepared.scorerCarIndex,
    initialSnapshot: prepared.extractedFrames[0].snapshot,
  });

  setNameTagRuntimeState({ carEntries: prepared.carEntries });
  replayController.sessionState.carEntries = prepared.carEntries;
  return { prepared, totalFrames };
}

export function bindFreeplayGoalReplayHudState(params: {
  scenePort: GoalReplayRuntimePort | null;
  replayController: ReplayTimelineController;
  totalFrames: number;
  scorerName: string;
  scoringTeam: number;
  ballSpeedKph: number | null;
  getCameraMode: () => GoalReplayCameraMode;
  setCameraMode: (nextMode: GoalReplayCameraMode) => void;
  getScoringTeam: () => number;
  getScorerCarIndex: () => number;
}): void {
  const {
    scenePort,
    replayController,
    totalFrames,
    scorerName,
    scoringTeam,
    ballSpeedKph,
    getCameraMode,
    setCameraMode,
    getScoringTeam,
    getScorerCarIndex,
  } = params;
  hudStore.getState().setMatchState({
    matchPhase: 'replay',
    replayScorerName: scorerName,
    replayScorerTeam: scoringTeam,
    replayBallSpeedKph: ballSpeedKph,
    replayAssistName: null,
  });
  bindGoalReplayHudCallbacks({
    runtime: scenePort,
    replayController,
    source: 'freeplay-goal-replay',
    totalFrames,
    scorerName,
    scorerTeam: scoringTeam,
    ballSpeedKph,
    assistName: null,
    getCameraMode,
    setCameraMode,
    getScoringTeam,
    getScorerCarIndex,
  });
}
