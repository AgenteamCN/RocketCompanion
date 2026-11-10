/**
 * src/network/server/match/matchLifecyclePipeline.ts
 * Pure data pipelines and narrow-interface helpers for match lifecycle transitions,
 * lobby physics arena configuration, incident/clock signal dispatch, and frame encoding.
 */

import { MATCH_SIGNALS, GlobalPayloadCodec } from '../../protocol/GlobalPayloadCodec.ts';
import { FLIP_RESET_SUBTYPES, isBallFlipResetEvent } from '../../../physics/RocketSimConstants.ts';
import { packLoadoutSignalParam2 } from '../../../ui-core/config/vehicleConstants.ts';
import { releasePodiumLocksOnEngine } from '../../../replay/podiumFormationPipeline.ts';
import {
  MATCH_STATES,
  KICKOFF_TOTAL_TICKS,
  type MatchPlayerSlot,
  type MatchState,
  type ActiveMatchSignal,
  type ReplaySignalLogEntry,
  type RosterSessionManagerPort,
  type UserRttSummary,
} from './matchLoadoutAndSpawnPipeline.ts';
import type { MatchDomainState } from './MatchDomainState.ts';

export interface SignalDispatcherPort {
  dispatchSignal(
    signalType: number,
    frameId: number,
    param1?: number,
    param2?: number
  ): ActiveMatchSignal | unknown;
  retireSignalTypes?(signalTypes: number[], retireBuffer?: boolean): void;
}

export interface LifecyclePhysicsManagerPort {
  currentTick: number;
  isRecordingFullReplay?: boolean;
  inputBuffer?: {
    lobbyMode?: boolean;
    setLobbyMode: (enabled: boolean) => void;
    registerCar?: (entityId: number) => void;
  } | null;
  sim?: {
    setCarLinearFactorAndGravity?: (
      carIndex: number,
      lx: number,
      ly: number,
      lz: number,
      gravityScale: number
    ) => void;
    setUnlimitedBoost?: (enabled: boolean) => void;
    setReplayRecordingActive?: (enabled: boolean) => void;
    restoreState?: (snapshot: Float32Array | number[]) => void;
    getHeaderView?: () => { tickCount?: number } | null;
    getBallStateView?: () => { velX: number; velY: number; velZ: number } | null;
    saveCompactState?: () => Float32Array;
    saveState?: () => Float32Array;
  } | null;
  isPaused?: boolean;
  restoreSolidCollisions?: () => void;
  resetKickoff: (mode: number) => void;
  applySignal: (signal: number | string, payload?: Record<string, unknown>) => void;
  stepAuthoritativeTick: () => LifecyclePhysicsSnapshotPort;
  resetBallToCenter: () => void;
  unregisterCarEntity: (entityId: number) => void;
  registerCarEntity: (entityId: number, team: number, hitboxOrVisual: string) => void;
  setInputMask: (masked: boolean) => void;
  setLobbyGhostMode: (enabled: boolean, options: Record<string, unknown>) => void;
  getPossessionStats?: () => {
    bluePoints?: number;
    blueFrames?: number;
    orangePoints?: number;
    orangeFrames?: number;
    team?: number;
  } | null;
  isBallOnGround: () => boolean;
  resetGoalLatch?: () => void;
  getActiveCarMask?: () => number;
}

export interface LifecycleDiagnosticsPort {
  enabled: boolean;
  configurePhysics: (pm: LifecyclePhysicsManagerPort) => void;
  releasePhysics: (pm: LifecyclePhysicsManagerPort) => void;
  applyToAuthority: (pm: LifecyclePhysicsManagerPort, tick: number) => void;
}

export interface LifecycleIncidentEntry {
  type?: number;
  subType?: number;
  carIndex?: number;
  primaryId?: number;
  secondaryId?: number;
  resetWheelCount?: number;
  flags?: number;
  [key: string]: unknown;
}

export interface LifecyclePhysicsSnapshotPort {
  tick?: number;
  goalScored?: boolean;
  kickoffTouched?: boolean;
  stateSnapshot?: Float32Array | null;
  goalTeam?: number;
  scoringTeam?: number;
  scorerCarIndex?: number;
  scorerTouchTick?: number;
  isReplaySlice?: boolean;
  incidents?: LifecycleIncidentEntry[] | null;
  acknowledgedControls?: Array<{
    carIndex: number;
    controls: Record<string, number | boolean>;
  }> | null;
  activeCarMask?: number;
}

export interface LifecycleGoalReplayPort {
  lastScorerCarIndex?: number;
  goalReplayPostGoalSeconds?: number;
  recordGoalIncident: (
    matchTick: number,
    scoringTeam: number,
    scorerCarIndex: number,
    scorerTouchTick: number,
    ballSpeedKph: number
  ) => void;
}

export interface LifecycleReplayBufferPort {
  size: number;
  configureMode: (mode: string, capacityTicks?: number | null) => void;
  recordFrame: (
    tick: number,
    stateSnapshot: Float32Array | null | undefined,
    signals: ReplaySignalLogEntry[],
    reserved: null,
    incidents: LifecycleIncidentEntry[] | null | undefined,
    acknowledgedControls: unknown
  ) => void;
}

export function emitRosterJoinAndLoadoutSignals(
  dispatcher: SignalDispatcherPort,
  players: Iterable<MatchPlayerSlot>,
  matchTick: number
): void {
  for (const p of players) {
    if (typeof p.entityId === 'number' && p.entityId >= 0) {
      dispatcher.dispatchSignal(MATCH_SIGNALS.PLAYER_JOINED, matchTick, p.entityId, p.team ?? 0);
      dispatcher.dispatchSignal(
        MATCH_SIGNALS.PLAYER_LOADOUT_UPDATED,
        matchTick,
        p.entityId,
        packLoadoutSignalParam2(
          p.visualIndex ?? p.visualId ?? 'octane',
          p.colorSlot ?? 0,
          p.hitboxIndex ?? p.hitboxId ?? 'hitbox-octane',
          {
            paintFinish: p.paintFinish || 'metallic',
            boostVisual: p.boostVisual || 'cartoon',
            boostAudio: p.boostAudio || 'rush',
          }
        )
      );
    }
  }
}

export function configureLobbyPhysicsArena(params: {
  physicsManager: LifecyclePhysicsManagerPort | null | undefined;
  sessionManager: RosterSessionManagerPort | null | undefined;
  diagnosticsController: LifecycleDiagnosticsPort | null | undefined;
  players: Map<string, MatchPlayerSlot>;
  applyRosterKickoffSpawns: () => void;
  options: Record<string, unknown>;
}): void {
  const {
    physicsManager: pm,
    sessionManager: sm,
    diagnosticsController: dc,
    players,
    options: o,
  } = params;
  if (!pm) return;
  pm.inputBuffer?.setLobbyMode?.(true);
  releasePodiumLocksOnEngine(pm.sim as never);
  pm.resetBallToCenter?.();
  const deferRemote = o.deferRemotePlayers !== false;

  for (const [sid, p] of players.entries()) {
    if (typeof p.entityId !== 'number' || p.entityId < 0) continue;
    const isRemotePeer = deferRemote && sid !== 'host',
      session = sm?.getSession?.(sid);
    if (p.isBot || isRemotePeer) {
      pm.unregisterCarEntity(p.entityId);
      if (!p.isBot && isRemotePeer) {
        pm.inputBuffer?.registerCar?.(p.entityId);
        if (session) session.deferPhysicsRegistration = true;
      }
    } else {
      if (session) session.deferPhysicsRegistration = false;
      pm.registerCarEntity(
        p.entityId,
        p.team ?? p.entityId % 2,
        p.hitboxId || p.visualId || 'octane'
      );
      pm.sim?.setCarLinearFactorAndGravity?.(p.entityId, 1, 1, 1, 1);
    }
  }

  params.applyRosterKickoffSpawns();
  pm.setInputMask(false);
  pm.isPaused = false;
  pm.sim?.setUnlimitedBoost?.(true);
  pm.setLobbyGhostMode(o.ghostCars !== false, {
    mode: o.mode || o.ghostMode || 'ghost_passthrough',
    hostCarIndex: o.hostCarIndex ?? 0,
    hostInteractsWithBall: o.hostInteractsWithBall ?? true,
    broadcastHostOnly: o.broadcastHostOnly ?? false,
    ghostOpacity: o.ghostOpacity ?? o.opacity ?? 0.7,
    ...o,
  });
  if (dc && o.enableDiagnosticsFleet !== false) {
    dc.enabled = true;
    dc.configurePhysics(pm);
  }
}

export function dispatchFlipResetIncidents(
  incidents: LifecycleIncidentEntry[] | null | undefined,
  matchTick: number,
  dispatcher: SignalDispatcherPort
): void {
  if (!Array.isArray(incidents) || incidents.length === 0) return;
  for (let i = 0; i < incidents.length; i++) {
    const inc = incidents[i];
    if (!inc || inc.type !== 0x0f || !isBallFlipResetEvent(inc as never)) continue;
    if ((inc.resetWheelCount ?? 0) <= 0 && ((inc.flags ?? 0) & 0xff00) === 0) continue;
    const carIdx =
      typeof inc.carIndex === 'number' && inc.carIndex >= 0 ? inc.carIndex : (inc.primaryId ?? 0);
    dispatcher.dispatchSignal(0x0f, matchTick, carIdx, inc.subType || FLIP_RESET_SUBTYPES.BALL);
  }
}

export function dispatchCountdownClockSecondSignals(
  dispatcher: SignalDispatcherPort,
  matchTick: number,
  sec: number
): void {
  dispatcher.dispatchSignal(MATCH_SIGNALS.CLOCK_UPDATED_SECONDS, matchTick, sec, 0);
  if (sec === 60) dispatcher.dispatchSignal(MATCH_SIGNALS.TIME_ALERT_60S, matchTick, 60, 0);
  else if (sec === 30) dispatcher.dispatchSignal(MATCH_SIGNALS.TIME_ALERT_30S, matchTick, 30, 0);
  else if (sec <= 10 && sec >= 1)
    dispatcher.dispatchSignal(MATCH_SIGNALS.COUNTDOWN_10S, matchTick, sec, 0);
}

export function resolvePossessionTieBreakWinner(
  physicsManager: LifecyclePhysicsManagerPort | null | undefined
): number {
  const s = physicsManager?.getPossessionStats?.();
  if (!s) return 0;
  const b = s.bluePoints ?? s.blueFrames ?? 0,
    o = s.orangePoints ?? s.orangeFrames ?? 0;
  return b > o ? 0 : o > b ? 1 : s.team === 2 ? 1 : 0;
}

export function advancePlayingClockState(params: {
  domain: MatchDomainState;
  physicsManager: LifecyclePhysicsManagerPort | null | undefined;
  physicsSnapshot: LifecyclePhysicsSnapshotPort | null | undefined;
  commandQueue: SignalDispatcherPort;
  onStartOvertimeKickoff: (countdownTicks: number) => void;
  onEndMatch: (forcedWinner: number | null, winReason: number) => void;
}): void {
  const { domain: d, physicsManager: pm, physicsSnapshot: snap, commandQueue: cq } = params;
  if (d.state !== MATCH_STATES.PLAYING) return;
  if (
    !d.clockStarted &&
    (!pm ||
      snap?.kickoffTouched ||
      (d.kickoffStartedAtTick >= 0 && d.matchTick - d.kickoffStartedAtTick >= 600))
  ) {
    d.clockStarted = true;
  }
  if (d.clockStarted && d.matchTick % 120 === 0) {
    const step = d.advanceClockTickSecond();
    if (step.mode === 'training')
      cq.dispatchSignal(MATCH_SIGNALS.CLOCK_UPDATED_SECONDS, d.matchTick, step.seconds, 2);
    else if (step.mode === 'regulation')
      dispatchCountdownClockSecondSignals(cq, d.matchTick, step.seconds);
    else if (step.mode === 'overtime') {
      cq.dispatchSignal(MATCH_SIGNALS.CLOCK_UPDATED_SECONDS, d.matchTick, step.seconds, 1);
      if (step.overtimeExpired) params.onEndMatch(resolvePossessionTieBreakWinner(pm), 1);
    }
  }
  if (
    !d.isTrainingMode &&
    !d.isOvertime &&
    d.clockSecondsRemaining === 0 &&
    (pm ? pm.isBallOnGround() : true)
  ) {
    if (d.blueScore === d.orangeScore) {
      d.pendingOvertimeAfterGoal = true;
      params.onStartOvertimeKickoff(KICKOFF_TOTAL_TICKS);
      const sim = pm?.sim;
      if (snap && sim)
        snap.stateSnapshot = sim.saveCompactState?.() ?? sim.saveState?.() ?? snap.stateSnapshot;
    } else {
      params.onEndMatch(null, 0);
    }
  }
}

export interface GoalScoredResolutionResult {
  scoringTeam: number;
  celebrationTicks: number;
  ignoredGoal?: boolean;
  blueScore: number;
  orangeScore: number;
  pendingOvertimeAfterGoal: boolean;
  pendingMatchEndAfterGoal: boolean;
  pendingMatchWinner: number | null;
}

export function evaluateGoalScoredOutcome(params: {
  domain: MatchDomainState;
  physicsSnapshot: LifecyclePhysicsSnapshotPort;
  physicsManager: LifecyclePhysicsManagerPort | null | undefined;
  goalReplayController: LifecycleGoalReplayPort;
  commandController: SignalDispatcherPort;
}): GoalScoredResolutionResult {
  const {
    domain: d,
    physicsSnapshot: snap,
    physicsManager: pm,
    goalReplayController: gr,
    commandController: cq,
  } = params;
  const {
    matchTick: t,
    isTrainingMode,
    isOvertime,
    clockSecondsRemaining,
    skipReplayByDefault,
  } = d;
  let {
    blueScore,
    orangeScore,
    pendingOvertimeAfterGoal,
    pendingMatchEndAfterGoal,
    pendingMatchWinner,
  } = d;

  const scoringTeam = snap.goalTeam ?? snap.scoringTeam ?? 0;
  if (isTrainingMode && d.trainingDisableGoalReset) {
    pm?.resetGoalLatch?.();
    return {
      scoringTeam,
      celebrationTicks: 0,
      ignoredGoal: true,
      blueScore,
      orangeScore,
      pendingOvertimeAfterGoal,
      pendingMatchEndAfterGoal,
      pendingMatchWinner,
    };
  }

  const bv = pm?.sim?.getBallStateView?.();
  const kph = bv ? Math.max(1, Math.round(Math.hypot(bv.velX, bv.velY, bv.velZ) * 0.036)) : 100;
  gr.recordGoalIncident(t, scoringTeam, snap.scorerCarIndex ?? 0, snap.scorerTouchTick ?? -1, kph);
  cq.retireSignalTypes?.([
    MATCH_SIGNALS.KICKOFF_WILL_START,
    MATCH_SIGNALS.KICKOFF_START,
    MATCH_SIGNALS.TIME_ALERT_60S,
    MATCH_SIGNALS.TIME_ALERT_30S,
    MATCH_SIGNALS.COUNTDOWN_10S,
  ]);

  const emitGoalSignals = (ticks: number, emitReplayWillStart: boolean) => {
    if (scoringTeam === 0) blueScore++;
    else orangeScore++;
    cq.dispatchSignal(MATCH_SIGNALS.SCORE_UPDATED, t, blueScore, orangeScore);
    if (emitReplayWillStart) {
      const meta =
        (scoringTeam & 0x1) | (((gr.lastScorerCarIndex ?? 0) & 0xff) << 8) | ((kph & 0xffff) << 16);
      cq.dispatchSignal(MATCH_SIGNALS.GOAL_REPLAY_WILL_START, t, meta, t + ticks);
    }
  };

  if (isTrainingMode) {
    pm?.setInputMask(false);
    const celebrationTicks = Math.max(1, Math.round(d.trainingGoalCelebrationTicks ?? 150));
    if (d.trainingGoalReplayEnabled) emitGoalSignals(celebrationTicks, true);
    return {
      scoringTeam,
      celebrationTicks,
      blueScore,
      orangeScore,
      pendingOvertimeAfterGoal,
      pendingMatchEndAfterGoal,
      pendingMatchWinner,
    };
  }

  const celebrationTicks = Math.max(1, Math.round((gr.goalReplayPostGoalSeconds ?? 3.0) * 120));
  emitGoalSignals(celebrationTicks, !skipReplayByDefault);

  if (isOvertime) {
    pendingMatchEndAfterGoal = true;
    pendingMatchWinner = scoringTeam;
  } else if (clockSecondsRemaining === 0) {
    if (blueScore === orangeScore) pendingOvertimeAfterGoal = true;
    else {
      pendingMatchEndAfterGoal = true;
      pendingMatchWinner = blueScore > orangeScore ? 0 : 1;
    }
  }

  return {
    scoringTeam,
    celebrationTicks,
    blueScore,
    orangeScore,
    pendingOvertimeAfterGoal,
    pendingMatchEndAfterGoal,
    pendingMatchWinner,
  };
}

export function encodeMatchGlobalFramePacket(params: {
  state: MatchState;
  matchTick: number;
  physicsSnapshot: LifecyclePhysicsSnapshotPort | null | undefined;
  physicsManager: LifecyclePhysicsManagerPort | null | undefined;
  sessionManager?: RosterSessionManagerPort | null;
  replayBuffer: LifecycleReplayBufferPort | null | undefined;
  commandController: {
    currentFrameSignals: ReplaySignalLogEntry[];
    activeSignals: Map<string | number, ActiveMatchSignal>;
    sampleRttIfDue: (tick: number) => UserRttSummary | null;
    stepFrameSignalRedundancy: () => void;
  };
}): Uint8Array {
  const {
    state,
    matchTick,
    physicsSnapshot: snap,
    physicsManager: pm,
    replayBuffer: rb,
    commandController: cq,
  } = params;
  const sigs = cq.currentFrameSignals;
  const isReplayOrPaused =
    state === MATCH_STATES.REPLAY ||
    Boolean(snap?.isReplaySlice) ||
    (state === MATCH_STATES.PAUSED && sigs.length === 0);

  if (rb && !isReplayOrPaused && (snap || sigs.length > 0)) {
    rb.recordFrame(
      matchTick,
      snap?.stateSnapshot ?? null,
      sigs,
      null,
      snap?.incidents ?? null,
      snap?.acknowledgedControls ?? null
    );
    sigs.length = 0;
  } else if (sigs.length > 0) {
    sigs.length = 0;
  }

  const bytes = GlobalPayloadCodec.encode({
    physics: snap
      ? {
          tick: matchTick,
          activeCarMask: snap.activeCarMask ?? pm?.getActiveCarMask?.(),
          stateSnapshot: snap.stateSnapshot || new Float32Array(0),
          acknowledgedControls: snap.acknowledgedControls || undefined,
        }
      : null,
    signals: Array.from(cq.activeSignals.values()),
    allUserRtt: cq.sampleRttIfDue(matchTick),
  });
  cq.stepFrameSignalRedundancy();
  return bytes;
}
