/**
 * src/network/server/match/MatchSystemControlSubController.ts
 * Stateful SubController owning authoritative System Control Mode transitions
 * (SYS_CTRL_STATE_ONLY, SYS_CTRL_INTERVENE_WILL_RESUME, SYS_CTRL_PHYSICS_RESUME),
 * homologous Training / Freeplay ruleset configuration, and server replay timeline stepping.
 */

import { SYSTEM_CONTROL_SIGNALS } from '../../../physics/RocketSimConstants.ts';
import { REPLAY_BUFFER_MODES } from '../../../replay/ReplayRingBuffer.ts';
import {
  interpolateReplaySnapshots,
  encodeReplayDirectorTelemetryIntoState,
} from '../../../replay/ReplayFrameInterpolator.ts';
import type { ReplayDirectorCameraSubController } from '../../../replay/ReplayDirectorCameraSubController.ts';
import { analyzeReplayTouchTimeline } from '../../../replay/ReplayTouchTimelineAnalyzer.ts';
import {
  ensureSuffixCameraPlan,
  resolveTouchLookaheadForFrame,
  computeDramaticSlowMoFactor,
} from '../../../replay/replayTouchLookaheadPipeline.ts';
import type { SuffixDirectorTrajectoryPlan } from '../../../replay/ReplayDirectorTrajectoryPlanner.ts';
import type {
  DirectorCameraState,
  ReplaySessionState,
  ReplayTimelineFrameEntry,
} from '../../../replay/replayDirectorStateTypes.ts';
import { normalizeReplayDirectorCarEntry } from '../../../replay/replayDirectorCarRosterPipeline.ts';
import { MATCH_TICK_RATE, type MatchPlayerSlot } from './matchLoadoutAndSpawnPipeline.ts';
import type { MatchDomainState } from './MatchDomainState.ts';
import type { MatchCommandQueueSubController } from './MatchCommandQueueSubController.ts';
import type { LifecyclePhysicsSnapshotPort } from './matchLifecyclePipeline.ts';

export type ServerReplayTimelineState = ReplaySessionState;

function computeReplaySlowMo(
  s: ServerReplayTimelineState,
  d: DirectorCameraState,
  c: number
): number {
  return computeDramaticSlowMoFactor(
    {
      disableSlowMo: s.disableSlowMo,
      playbackSpeed: s.playbackSpeed,
      isScrubbing: s.isScrubbing,
      lastScoringTouchFrameIdx: d.lastScoringTouchFrameIdx ?? -1,
      goalLineFrameIdx: d.goalLineFrameIdx ?? -1,
    },
    c
  );
}

function syncReplaySuffixPlan(
  s: ServerReplayTimelineState,
  cam: ReplayDirectorCameraSubController
): SuffixDirectorTrajectoryPlan | null {
  const d = cam.state;
  const plan = ensureSuffixCameraPlan(s.activeFrames, {
    isNetworkStreamed: false,
    streamedFramesReceived: 0,
    expectedDurationTicks: s.expectedDurationTicks,
    cachedPlan: s.cachedSuffixCameraPlan,
    scoringTeam: s.scoringTeam,
    scorerCarIndex: d.scorerCarIndex ?? s.scorerCarIndex ?? 0,
    goalLineFrameIdx: d.goalLineFrameIdx ?? -1,
    touchEvents: d.touchEvents || [],
    carTeamResolver: s.carTeamResolver,
    lateralBias: d.lateralBias,
    initialSettledCarPos: d.initialSettledCarPos,
  });
  s.cachedSuffixCameraPlan = plan;
  cam.setSuffixCameraPlan(plan);
  return plan;
}

export function initServerGoalReplaySession(p: {
  baseState: ServerReplayTimelineState;
  extracted: ReplayTimelineFrameEntry[];
  players: Map<string, MatchPlayerSlot>;
  scoringTeam: number;
  scorerCarIndex: number;
  prevRetainedSeq: number;
  enableDramaticReplaySlowMo: boolean;
  directorCamera: ReplayDirectorCameraSubController;
}): { sessionState: ServerReplayTimelineState; replayTicksRemaining: number } {
  const {
    baseState,
    extracted,
    players,
    scoringTeam,
    scorerCarIndex,
    prevRetainedSeq,
    enableDramaticReplaySlowMo,
    directorCamera,
  } = p;
  const carEntries = Array.from(players.values())
    .filter((c) => c && c.role !== 'spectator' && typeof c.entityId === 'number' && c.entityId >= 0)
    .sort((a, b) => a.entityId - b.entityId)
    .map((c) =>
      normalizeReplayDirectorCarEntry(
        {
          carIndex: c.entityId,
          name: c.name,
          username: c.name,
          team: c.team ?? c.entityId % 2,
          isBot: Boolean(c.isBot),
          isLocalPlayer: !c.isBot && c.entityId === 0,
          botType: c.botType || null,
          visualId: c.visualId,
          hitboxId: c.hitboxId,
          colorSlot: c.colorSlot,
          colorHex: c.colorHex,
          paintFinish: c.paintFinish,
          boostVisual: c.boostVisual,
          boostAudio: c.boostAudio,
          anthemId: c.anthemId,
        },
        c.entityId,
        c.team ?? c.entityId % 2
      )
    );
  const carTeamResolver = (idx: number) => {
    for (const c of players.values()) if (c.entityId === idx) return c.team ?? idx % 2;
    return idx % 2;
  };
  const sessionState: ServerReplayTimelineState = {
    ...baseState,
    activeFrames: extracted,
    expectedDurationTicks: extracted.length,
    scoringTeam,
    scorerCarIndex,
    carTeamResolver,
    hasRetainedReplay: true,
    retainedReplaySeq: prevRetainedSeq + 1,
    carEntries,
    isActive: true,
  };
  directorCamera.reset(false, false, false);
  directorCamera.onTimelineAnalyzed(
    analyzeReplayTouchTimeline(extracted, {
      scoringTeam,
      isNetworkStreamed: false,
      watchAllTouches: false,
      carTeamResolver,
      scorerCarIndex,
    })
  );
  syncReplaySuffixPlan(sessionState, directorCamera);

  let replayTicksRemaining = extracted.length;
  if (enableDramaticReplaySlowMo && extracted.length > 1) {
    let simCursor = 0,
      estTicks = 0;
    const maxIdx = extracted.length - 1;
    while (simCursor < maxIdx && estTicks < maxIdx * 3) {
      simCursor += Math.max(
        0.1,
        computeReplaySlowMo(sessionState, directorCamera.state, simCursor)
      );
      estTicks++;
    }
    replayTicksRemaining = Math.max(extracted.length, estTicks);
  }
  return { sessionState, replayTicksRemaining };
}

export function stepServerGoalReplaySession(p: {
  sessionState: ServerReplayTimelineState;
  directorCamera: ReplayDirectorCameraSubController;
  enableDramaticReplaySlowMo: boolean;
  replayInterpolatedBuffer: Float32Array | null;
}): { baseIdx: number; blendedSnap: Float32Array | null } {
  const {
    sessionState: s,
    directorCamera: cam,
    enableDramaticReplaySlowMo,
    replayInterpolatedBuffer,
  } = p;
  const frames = s.activeFrames,
    total = frames.length;
  const slowMo = enableDramaticReplaySlowMo
    ? computeReplaySlowMo(s, cam.state, s.cursorFloat)
    : 1.0;
  const nextCursor = Math.min(total - 1, s.cursorFloat + Math.max(0, s.playbackSpeed * slowMo));
  s.cursorFloat = nextCursor;
  const baseIdx = Math.max(0, Math.min(total - 1, Math.floor(nextCursor)));
  const nextIdx = Math.min(total - 1, baseIdx + 1);
  const alpha = Math.max(0, Math.min(1, nextCursor - baseIdx));

  const prevEntry = frames[baseIdx] || null,
    nextEntry = frames[nextIdx] || prevEntry;
  const prevSnap = prevEntry?.snapshot || null,
    currSnap = nextEntry?.snapshot || prevSnap;
  const suffixPlan = syncReplaySuffixPlan(s, cam),
    d = cam.state;

  const { resolvedScorerCarIndex } = cam.syncForPlaybackStep({
    baseIdx,
    nextIdx,
    alpha,
    useCsvPose: false,
    cursorFloat: nextCursor,
    isPaused: false,
    isScrubbing: false,
    prevEntry,
    nextEntry,
    currFrame: currSnap,
    suffixPlan,
    scorerCarIndex: s.scorerCarIndex,
    resolveTouchLookaheadForFrame: (idx, fb) =>
      resolveTouchLookaheadForFrame(
        {
          suffixPlan,
          goalLineFrameIdx: d.goalLineFrameIdx ?? -1,
          scorerCarIndex: d.scorerCarIndex ?? s.scorerCarIndex ?? 0,
          touchEvents: d.touchEvents || [],
          reboundEvents: d.reboundEvents || [],
          scoringTeam: s.scoringTeam,
          watchAllTouches: false,
        },
        idx,
        fb
      ),
  });
  s.scorerCarIndex = resolvedScorerCarIndex;

  let blendedSnap: Float32Array | null = null;
  if (currSnap) {
    blendedSnap = interpolateReplaySnapshots(
      prevSnap || currSnap,
      currSnap,
      alpha,
      replayInterpolatedBuffer || undefined
    );
    encodeReplayDirectorTelemetryIntoState(
      blendedSnap,
      d,
      total > 1 ? nextCursor / (total - 1) : 1
    );
  }
  if (nextCursor >= total - 1) s.isActive = false;
  return { baseIdx, blendedSnap };
}

export interface SystemControlPhysicsManagerPort {
  currentTick: number;
  sim?: {
    setUnlimitedBoost?: (enabled: boolean) => void;
    restoreCompactState?: (
      snapshot: Float32Array | number[],
      opts?: { overrideTick?: number }
    ) => void;
    restoreState?: (snapshot: Float32Array | number[], opts?: { overrideTick?: number }) => void;
    loadCompactState?: (snapshot: Float32Array | number[]) => void;
    loadState?: (snapshot: Float32Array | number[]) => void;
    syncToStateObject?: () => void;
    saveCompactState?: () => Float32Array;
    saveState?: () => Float32Array;
  } | null;
  applySignal: (signal: number | string, payload?: Record<string, unknown>) => void;
  getActiveCarMask?: () => number;
}

export interface SystemControlReplayBufferPort {
  configureMode: (mode: string, capacityTicks?: number | null) => void;
}

export interface MatchSystemControlHostPort {
  readonly domain: MatchDomainState;
  readonly commandQueue: MatchCommandQueueSubController;
  readonly physicsManager: SystemControlPhysicsManagerPort | null | undefined;
  readonly replayBuffer: SystemControlReplayBufferPort | null | undefined;
  encodeFramePacket(physicsSnapshot: LifecyclePhysicsSnapshotPort | null): Uint8Array;
}

export interface TrainingRulesetConfigOptions {
  unlimitedBoost?: boolean;
  disableGoalReset?: boolean;
  goalReplayEnabled?: boolean;
  celebrationTicks?: number;
  fifoDurationSeconds?: number;
}

export type TrainingRulesetOptions = TrainingRulesetConfigOptions;

export class MatchSystemControlSubController {
  readonly host: MatchSystemControlHostPort;
  isStateOnlyMode = false;
  interveneTargetTick = -1;
  interveneCountdownSeconds = 0;
  interveneRemainingTicks = -1;
  lastSystemControlSignal = 0;
  systemControlSignalHistory: Array<{
    signalType: number;
    frameId: number;
    param1: number;
    param2: number;
  }> = [];

  constructor(host: MatchSystemControlHostPort) {
    this.host = host;
  }

  private emitSysSignal(sig: number, frameId: number, p1 = 0, p2 = 0, retire: number[] = []): void {
    this.host.commandQueue.retireSignalTypes(retire, true);
    this.lastSystemControlSignal = sig;
    this.systemControlSignalHistory.push({ signalType: sig, frameId, param1: p1, param2: p2 });
    if (this.systemControlSignalHistory.length > 64) this.systemControlSignalHistory.shift();
    this.host.commandQueue.dispatchSignal(sig, frameId, p1, p2);
  }

  private loadSimSnapshot(snap?: Float32Array | number[] | null, tick?: number): void {
    const pm = this.host.physicsManager;
    if (!pm) return;
    if (snap && pm.sim) {
      const opts = typeof tick === 'number' && tick >= 0 ? { overrideTick: tick } : undefined;
      if (typeof pm.sim.restoreCompactState === 'function') pm.sim.restoreCompactState(snap, opts);
      else if (typeof pm.sim.restoreState === 'function') pm.sim.restoreState(snap, opts);
      else if (typeof pm.sim.loadCompactState === 'function') pm.sim.loadCompactState(snap);
      else if (typeof pm.sim.loadState === 'function') pm.sim.loadState(snap);
      pm.sim.syncToStateObject?.();
    }
    if (typeof tick === 'number' && tick >= 0) pm.currentTick = tick;
  }

  configureTrainingRuleset(o: TrainingRulesetConfigOptions = {}): void {
    const { domain, physicsManager, replayBuffer } = this.host;
    domain.applyTrainingRulesetOptions(o);
    if (o.unlimitedBoost !== undefined)
      physicsManager?.sim?.setUnlimitedBoost?.(Boolean(o.unlimitedBoost));
    if (typeof o.fifoDurationSeconds === 'number' && o.fifoDurationSeconds > 0 && replayBuffer) {
      replayBuffer.configureMode(
        REPLAY_BUFFER_MODES.COUNTUP_FIFO,
        Math.round(o.fifoDurationSeconds * MATCH_TICK_RATE)
      );
    }
  }

  enterStateOnlyMode(snap?: Float32Array | number[] | null, cursorTick?: number): void {
    const { domain, physicsManager } = this.host;
    this.isStateOnlyMode = true;
    this.interveneTargetTick = this.interveneRemainingTicks = -1;
    domain.applySystemControlState('state_only', cursorTick);
    this.loadSimSnapshot(snap, cursorTick);
    physicsManager?.applySignal(SYSTEM_CONTROL_SIGNALS.SYS_CTRL_STATE_ONLY, {
      cursorTick: domain.matchTick,
    });
    this.emitSysSignal(
      SYSTEM_CONTROL_SIGNALS.SYS_CTRL_STATE_ONLY,
      domain.matchTick,
      typeof cursorTick === 'number' ? cursorTick : domain.matchTick,
      0,
      [
        SYSTEM_CONTROL_SIGNALS.SYS_CTRL_INTERVENE_WILL_RESUME,
        SYSTEM_CONTROL_SIGNALS.SYS_CTRL_PHYSICS_RESUME,
      ]
    );
  }

  beginInterveneCountdown(sec = 3, snap?: Float32Array | number[] | null): number {
    const { domain, physicsManager } = this.host;
    const clampedSec = Math.max(0.25, Number.isFinite(sec) ? sec : 3);
    const ticks = Math.max(1, Math.round(clampedSec * MATCH_TICK_RATE));
    this.isStateOnlyMode = true;
    this.interveneCountdownSeconds = Math.ceil(clampedSec);
    this.interveneRemainingTicks = ticks;
    this.interveneTargetTick = domain.applySystemControlState('intervene', ticks);
    this.loadSimSnapshot(snap, domain.matchTick);
    physicsManager?.applySignal(SYSTEM_CONTROL_SIGNALS.SYS_CTRL_INTERVENE_WILL_RESUME, {
      targetResumeTick: this.interveneTargetTick,
      countdownSeconds: this.interveneCountdownSeconds,
    });
    this.emitSysSignal(
      SYSTEM_CONTROL_SIGNALS.SYS_CTRL_INTERVENE_WILL_RESUME,
      domain.matchTick,
      this.interveneTargetTick,
      this.interveneCountdownSeconds,
      [SYSTEM_CONTROL_SIGNALS.SYS_CTRL_STATE_ONLY, SYSTEM_CONTROL_SIGNALS.SYS_CTRL_PHYSICS_RESUME]
    );
    return this.interveneTargetTick;
  }

  resumePhysicsFromState(snap?: Float32Array | number[] | null, resumeTick?: number): void {
    const { domain, physicsManager } = this.host;
    this.isStateOnlyMode = false;
    this.interveneTargetTick = this.interveneRemainingTicks = -1;
    domain.applySystemControlState('resume', resumeTick);
    this.loadSimSnapshot(snap, resumeTick);
    physicsManager?.applySignal(SYSTEM_CONTROL_SIGNALS.SYS_CTRL_PHYSICS_RESUME, {
      resumeTick: domain.matchTick,
    });
    if (domain.isTrainingMode) physicsManager?.sim?.setUnlimitedBoost?.(true);
    this.emitSysSignal(
      SYSTEM_CONTROL_SIGNALS.SYS_CTRL_PHYSICS_RESUME,
      domain.matchTick,
      domain.matchTick,
      domain.isTrainingMode ? 1 : 0,
      [
        SYSTEM_CONTROL_SIGNALS.SYS_CTRL_STATE_ONLY,
        SYSTEM_CONTROL_SIGNALS.SYS_CTRL_INTERVENE_WILL_RESUME,
      ]
    );
  }

  stepStateOnlyFrameIfActive(): Uint8Array | null {
    if (!this.isStateOnlyMode) return null;
    const { domain, physicsManager } = this.host;
    if (this.interveneRemainingTicks > 0) {
      this.interveneRemainingTicks--;
      domain.matchTick += 1;
      if (physicsManager) physicsManager.currentTick = domain.matchTick;
      if (this.interveneRemainingTicks <= 0) {
        this.resumePhysicsFromState(null, domain.matchTick);
        return null;
      }
    }
    const sim = physicsManager?.sim;
    const rawSnap = sim?.saveCompactState
      ? sim.saveCompactState()
      : sim?.saveState
        ? sim.saveState()
        : null;
    return this.host.encodeFramePacket(
      rawSnap
        ? {
            activeCarMask: physicsManager?.getActiveCarMask?.() || 1,
            stateSnapshot: rawSnap,
            acknowledgedControls: [],
            isReplaySlice: true,
          }
        : null
    );
  }

  clear(): void {
    this.isStateOnlyMode = false;
    this.interveneTargetTick = this.interveneRemainingTicks = -1;
    this.interveneCountdownSeconds = 0;
  }
}
