/**
 * src/network/server/match/MatchGoalReplaySubController.ts
 * Stateful SubController owning post-goal replay slice extraction/playback,
 * dramatic slow-motion timeline stepping, director camera telemetry encoding,
 * and server-filled bot inference agents.
 */

import { MATCH_SIGNALS } from '../../protocol/GlobalPayloadCodec.ts';
import { extractGoalReplayFrames } from '../../../replay/ReplayPlaybackState.ts';
import { ReplayDirectorCameraSubController } from '../../../replay/ReplayDirectorCameraSubController.ts';
import {
  createInitialReplaySessionState,
  type DirectorCameraState,
  type ReplaySessionState,
  type ReplayTimelineFrameEntry,
} from '../../../replay/replayDirectorStateTypes.ts';
import {
  ExperimentalBotAgent,
  ensureExperimentalEngine,
} from '../../../ai/experimental/ExperimentalBotAgent.ts';
import { DEFAULT_CAR_CONTROLS } from '../../../ai/experimental/experimentalMultiCarObsPipeline.ts';
import {
  MATCH_STATES,
  GOAL_REPLAY_DURATION_TICKS,
  KICKOFF_TOTAL_TICKS,
} from './matchLoadoutAndSpawnPipeline.ts';
import {
  initServerGoalReplaySession,
  stepServerGoalReplaySession,
  type ServerReplayTimelineState,
} from './MatchSystemControlSubController.ts';
import type { MatchDomainState } from './MatchDomainState.ts';
import type { MatchCommandQueueSubController } from './MatchCommandQueueSubController.ts';
import type { ReplayRingBuffer } from '../../../replay/ReplayRingBuffer.ts';
import type { LifecyclePhysicsSnapshotPort } from './matchLifecyclePipeline.ts';

export type { ServerReplayTimelineState };

export interface ServerReplayTimelineHandle {
  sessionState: ReplaySessionState;
  directorCamera: ReplayDirectorCameraSubController;
  readonly directorCameraState: DirectorCameraState;
  readonly frames: ReplayTimelineFrameEntry[];
  readonly ActiveWindowCount: number;
  endReplaySession: () => void;
}

export interface ServerBotAgentPort {
  carIndex: number;
  team: number;
  botType: string;
  ready: boolean;
  isReady?: boolean;
  tickSkip: number;
  tickSkipCounter: number;
  action: Record<string, number | boolean>;
  reset?: () => void;
  overrideControls: (controls: Record<string, number | boolean>) => void;
  decideSync: (
    state: unknown,
    pads: unknown[],
    activeCars: Array<{ carIndex: number; team: number }>
  ) => Record<string, number | boolean>;
}

export interface ServerBotAgentRecord {
  agent: ServerBotAgentPort;
  kickoffStep: number;
  staggered: boolean;
}

export interface MatchGoalReplayLifecycleActionsPort {
  resetTrainingPlay(): void;
  startKickoffSequence(countdownTicks?: number): void;
  endMatch(forcedWinner?: number | null, winReason?: number): void;
}

export interface GoalReplayPhysicsManagerPort {
  sim?: {
    state?: { ball?: unknown } | null;
    boostPads?: unknown[];
    syncToStateObject?: () => void;
    saveCompactState?: () => Float32Array;
  } | null;
  applySignal: (signal: number | string, payload?: Record<string, unknown>) => void;
  getActiveCarMask?: () => number;
  setDirectCarControls: (carIndex: number, controls: Record<string, number | boolean>) => void;
}

export interface MatchGoalReplayHostPort {
  readonly domain: MatchDomainState;
  readonly commandQueue: MatchCommandQueueSubController;
  readonly actions: MatchGoalReplayLifecycleActionsPort;
  readonly replayBuffer: ReplayRingBuffer | null | undefined;
  readonly physicsManager: GoalReplayPhysicsManagerPort | null | undefined;
}

export interface MatchGoalReplayOptions {
  goalReplayLookbackSeconds?: number;
  goalReplayPostGoalSeconds?: number;
  enableDramaticReplaySlowMo?: boolean;
}

const REPLAY_RETIRE_SIGNALS = [
  MATCH_SIGNALS.KICKOFF_WILL_START,
  MATCH_SIGNALS.KICKOFF_START,
  MATCH_SIGNALS.TIME_ALERT_60S,
  MATCH_SIGNALS.TIME_ALERT_30S,
  MATCH_SIGNALS.COUNTDOWN_10S,
  MATCH_SIGNALS.SCORE_UPDATED,
  MATCH_SIGNALS.GOAL_REPLAY_WILL_START,
];

export class MatchGoalReplaySubController {
  readonly host: MatchGoalReplayHostPort;
  readonly directorCamera = new ReplayDirectorCameraSubController();
  sessionState: ReplaySessionState = createInitialReplaySessionState();
  replayController: ServerReplayTimelineHandle | null = null;
  activeReplayFrames: Array<Float32Array | { snapshot?: Float32Array | null }> | null = null;
  activeReplayCursor = 0;
  replayInterpolatedBuffer: Float32Array | null = null;
  replayTicksRemaining = -1;
  lastGoalIncidentFrame = -1;
  lastScoringTeam = 0;
  lastScorerCarIndex = 0;
  lastScorerTouchFrame = -1;
  lastGoalBallSpeedKph = 100;
  goalReplayLookbackSeconds: number;
  goalReplayPostGoalSeconds: number;
  enableDramaticReplaySlowMo: boolean;
  serverBotAgents = new Map<string, ServerBotAgentRecord>();

  constructor(host: MatchGoalReplayHostPort, opts: MatchGoalReplayOptions = {}) {
    this.host = host;
    this.goalReplayLookbackSeconds = opts.goalReplayLookbackSeconds ?? 10.0;
    this.goalReplayPostGoalSeconds = opts.goalReplayPostGoalSeconds ?? 3.0;
    this.enableDramaticReplaySlowMo = opts.enableDramaticReplaySlowMo ?? true;
    const self = this;
    this.replayController = {
      get sessionState() {
        return self.sessionState;
      },
      directorCamera: this.directorCamera,
      get directorCameraState() {
        return self.directorCamera.state;
      },
      get frames() {
        return self.sessionState.activeFrames;
      },
      get ActiveWindowCount() {
        return self.sessionState.activeFrames.length;
      },
      endReplaySession: () => {
        self.sessionState.isActive = false;
      },
    };
  }

  recordGoalIncident(
    tick: number,
    team: number,
    carIdx: number,
    touchTick: number,
    kph: number
  ): void {
    this.lastGoalIncidentFrame = tick;
    this.lastScoringTeam = team;
    this.lastScorerCarIndex = carIdx;
    this.lastScorerTouchFrame = touchTick;
    this.lastGoalBallSpeedKph = kph;
  }

  buildReplaySkipAckControls(): Array<{
    carIndex: number;
    controls: Record<string, number | boolean>;
  }> {
    const { domain, commandQueue } = this.host;
    const out: Array<{ carIndex: number; controls: Record<string, number | boolean> }> = [];
    for (const [sid, p] of domain.players.entries()) {
      if (!p || p.role === 'spectator' || typeof p.entityId !== 'number' || p.entityId < 0)
        continue;
      out.push({
        carIndex: p.entityId,
        controls: {
          ...DEFAULT_CAR_CONTROLS,
          jump: Boolean(
            commandQueue.skipReplayVotes.has(sid) || (!domain.externalBotTunnels && p.isBot)
          ),
        },
      });
    }
    return out;
  }

  beginGoalReplay(): void {
    const { domain, commandQueue, actions, replayBuffer, physicsManager } = this.host;
    if (domain.isTrainingMode && !domain.trainingGoalReplayEnabled) {
      actions.resetTrainingPlay();
      return;
    }
    if (!domain.isTrainingMode && domain.skipReplayByDefault) {
      this.finishGoalReplay();
      return;
    }
    domain.state = MATCH_STATES.REPLAY;
    commandQueue.retireSignalTypes(REPLAY_RETIRE_SIGNALS);
    const extracted = extractGoalReplayFrames({
      ringBuffer: replayBuffer as never,
      engine: (physicsManager?.sim || null) as never,
      durationTicks: GOAL_REPLAY_DURATION_TICKS,
      goalIncidentTick: this.lastGoalIncidentFrame >= 0 ? this.lastGoalIncidentFrame : null,
      scorerTouchTick: this.lastScorerTouchFrame >= 0 ? this.lastScorerTouchFrame : undefined,
      lookbackSeconds: this.goalReplayLookbackSeconds ?? 10.0,
      postGoalSeconds: this.goalReplayPostGoalSeconds ?? 3.0,
      lastKickoffWillStartTick: domain.lastKickoffWillStartFrame ?? -1,
      signalLog: commandQueue.replaySignalLog as never,
    }) as ReplayTimelineFrameEntry[];
    this.activeReplayFrames = extracted;
    if (extracted && extracted.length > 0) {
      const init = initServerGoalReplaySession({
        baseState: createInitialReplaySessionState(),
        extracted,
        players: domain.players,
        scoringTeam: this.lastScoringTeam ?? 0,
        scorerCarIndex: this.lastScorerCarIndex ?? 0,
        prevRetainedSeq: this.sessionState.retainedReplaySeq || 0,
        enableDramaticReplaySlowMo: this.enableDramaticReplaySlowMo !== false,
        directorCamera: this.directorCamera,
      });
      this.sessionState = init.sessionState;
      this.replayTicksRemaining = init.replayTicksRemaining;
    } else {
      this.sessionState.isActive = false;
      this.replayTicksRemaining = GOAL_REPLAY_DURATION_TICKS;
    }
    this.activeReplayCursor = 0;
    physicsManager?.applySignal(MATCH_SIGNALS.GOAL_REPLAY_START);
    const meta =
      ((this.lastScoringTeam ?? 0) & 0x1) |
      (((this.lastScorerCarIndex ?? 0) & 0xff) << 1) |
      (((this.lastGoalBallSpeedKph ?? 100) & 0xffff) << 16);
    commandQueue.dispatchSignal(
      MATCH_SIGNALS.GOAL_REPLAY_START,
      domain.matchTick,
      this.replayTicksRemaining,
      meta
    );
  }

  finishGoalReplay(): void {
    const { domain, commandQueue, actions, physicsManager } = this.host;
    this.sessionState.isActive = false;
    this.activeReplayFrames = null;
    this.activeReplayCursor = 0;
    physicsManager?.applySignal(MATCH_SIGNALS.GOAL_REPLAY_END);
    commandQueue.dispatchSignal(MATCH_SIGNALS.GOAL_REPLAY_END, domain.matchTick, 0, 0);
    if (domain.isTrainingMode) {
      actions.resetTrainingPlay();
      return;
    }
    const pendingEnd = domain.consumePendingMatchEndAfterGoal();
    if (pendingEnd.shouldEnd) {
      actions.endMatch(pendingEnd.winner ?? (domain.blueScore > domain.orangeScore ? 0 : 1), 0);
      return;
    }
    commandQueue.dispatchSignal(
      MATCH_SIGNALS.ROUND_STARTED,
      domain.matchTick,
      domain.blueScore + domain.orangeScore + 1,
      0
    );
    actions.startKickoffSequence(KICKOFF_TOTAL_TICKS);
  }

  stepReplayTick(): {
    finished: boolean;
    replayPhysicsSnapshot: LifecyclePhysicsSnapshotPort | null;
  } {
    const { physicsManager } = this.host;
    this.replayTicksRemaining--;
    let replayPhysicsSnapshot: LifecyclePhysicsSnapshotPort | null = null;
    const ackControls = this.buildReplaySkipAckControls();
    const s = this.sessionState;

    if (s.isActive && s.activeFrames.length > 0) {
      const { baseIdx, blendedSnap } = stepServerGoalReplaySession({
        sessionState: s,
        directorCamera: this.directorCamera,
        enableDramaticReplaySlowMo: this.enableDramaticReplaySlowMo !== false,
        replayInterpolatedBuffer: this.replayInterpolatedBuffer,
      });
      this.activeReplayCursor = baseIdx;
      if (blendedSnap) {
        this.replayInterpolatedBuffer = blendedSnap;
        replayPhysicsSnapshot = {
          activeCarMask: physicsManager?.getActiveCarMask?.() || 0,
          stateSnapshot: blendedSnap,
          acknowledgedControls: ackControls,
          isReplaySlice: true,
        };
      }
    }

    if (this.replayTicksRemaining <= 0 || !s.isActive) {
      this.finishGoalReplay();
      return { finished: true, replayPhysicsSnapshot };
    }
    return { finished: false, replayPhysicsSnapshot };
  }

  stepServerFilledBots(): void {
    const { domain, physicsManager } = this.host;
    if (!physicsManager?.sim || domain.externalBotTunnels) return;
    const st = domain.state;
    if (
      st !== MATCH_STATES.PLAYING &&
      st !== MATCH_STATES.KICKOFF &&
      st !== MATCH_STATES.GOAL_SCORED
    )
      return;

    let hasFilledBots = false;
    for (const p of domain.players.values()) {
      if (p.isBot && typeof p.entityId === 'number' && p.entityId >= 0) {
        hasFilledBots = true;
        break;
      }
    }
    if (!hasFilledBots) return;

    const sim = physicsManager.sim;
    sim.syncToStateObject?.();
    if (!sim.state?.ball) return;

    if (st === MATCH_STATES.KICKOFF) {
      for (const rec of this.serverBotAgents.values()) {
        rec.kickoffStep = 0;
        rec.agent?.reset?.();
      }
      for (const p of domain.players.values()) {
        if (p.isBot && typeof p.entityId === 'number' && p.entityId >= 0) {
          physicsManager.setDirectCarControls(p.entityId, { ...DEFAULT_CAR_CONTROLS } as Record<
            string,
            number | boolean
          >);
        }
      }
      return;
    }

    const pads = sim.boostPads || [];
    const activeCars: Array<{ carIndex: number; team: number }> = [];
    for (const p of domain.players.values()) {
      if (typeof p.entityId === 'number' && p.entityId >= 0)
        activeCars.push({ carIndex: p.entityId, team: p.team === 1 ? 1 : 0 });
    }

    for (const [sid, p] of domain.players.entries()) {
      if (!p.isBot || typeof p.entityId !== 'number' || p.entityId < 0) continue;
      let rec = this.serverBotAgents.get(sid);
      const botTeam = p.team === 1 ? 1 : 0,
        botType = p.botType || 'nexto';
      if (
        !rec ||
        rec.agent.carIndex !== p.entityId ||
        rec.agent.team !== botTeam ||
        rec.agent.botType !== botType
      ) {
        ensureExperimentalEngine(botType);
        rec = {
          agent: new ExperimentalBotAgent(
            botType,
            p.entityId,
            botTeam
          ) as unknown as ServerBotAgentPort,
          kickoffStep: 0,
          staggered: false,
        };
        this.serverBotAgents.set(sid, rec);
      }
      if (!rec.agent.isReady && !rec.agent.ready && botType !== 'heuristic') {
        physicsManager.setDirectCarControls(p.entityId, { ...DEFAULT_CAR_CONTROLS } as Record<
          string,
          number | boolean
        >);
        continue;
      }
      let ctrl: Record<string, number | boolean>;
      if (rec.kickoffStep < 24) {
        ctrl = { ...DEFAULT_CAR_CONTROLS, throttle: 1.0, boost: true };
        rec.agent.overrideControls(ctrl);
      } else if (rec.agent.tickSkipCounter <= 0) {
        ctrl = rec.agent.decideSync(sim.state, pads, activeCars);
        rec.agent.tickSkipCounter = rec.staggered
          ? rec.agent.tickSkip - 1
          : (p.entityId % rec.agent.tickSkip) + 1;
        rec.staggered = true;
      } else {
        rec.agent.tickSkipCounter--;
        ctrl = rec.agent.action;
      }
      rec.kickoffStep++;
      physicsManager.setDirectCarControls(p.entityId, ctrl || DEFAULT_CAR_CONTROLS);
    }
  }

  resetForMatchStart(): void {
    this.lastGoalIncidentFrame = this.replayTicksRemaining = -1;
    this.activeReplayFrames = null;
    this.activeReplayCursor = 0;
  }

  clear(): void {
    this.sessionState.isActive = false;
    this.activeReplayFrames = null;
    this.activeReplayCursor = 0;
    this.serverBotAgents.clear();
  }
}
