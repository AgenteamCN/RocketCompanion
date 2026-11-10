/**
 * src/network/server/match/matchCommandAndSignalPipeline.ts
 * Pure data pipelines and narrow-interface helpers for authoritative match signal dispatch,
 * piggybacked ACK retirement, and frame phase gate evaluation.
 */

import { MATCH_SIGNALS } from '../../protocol/GlobalPayloadCodec.ts';
import { SYSTEM_CONTROL_SIGNALS } from '../../../physics/RocketSimConstants.ts';
import {
  MATCH_STATES,
  type MatchState,
  type MatchPlayerSlot,
  type MatchSpectatorSlot,
  type ActiveMatchSignal,
  type ReplaySignalLogEntry,
  type RosterSessionManagerPort,
} from './matchLoadoutAndSpawnPipeline.ts';
import type { FramePhaseGateAction } from './MatchRosterPolicyState.ts';

export interface ClientCommandPayload {
  commandId?: number;
  commandType: number;
  param1?: number;
  param2?: number;
  stateSnapshot?: Float32Array | number[] | null;
}

export type ClientReliableCommand = ClientCommandPayload;

export interface RoleSwitchDataHandlerPort {
  sendPacket: (sessionId: string, packet: string | Uint8Array) => void;
  broadcast?: (packet: string | Uint8Array, filter?: (id: string) => boolean) => void;
}

export interface ControlPacketPayload {
  type?: string | number;
  playerName?: string;
  clientName?: string;
  role?: string;
  preferredTeam?: number | null;
  visualId?: string | number;
  carVisual?: string | number;
  hitboxId?: string | number | null;
  carHitbox?: string | number | null;
  colorSlot?: number | null;
  slotId?: number | null;
  blueColorSlot?: number | null;
  orangeColorSlot?: number | null;
  paintFinish?: string | number;
  boostVisual?: string | number;
  boostAudio?: string | number;
  anthemId?: string;
  commandId?: number;
  commandType?: number;
  param1?: number;
  param2?: number;
  ready?: boolean;
  matchSequence?: number;
  rtt?: number;
  sendTime?: number;
  stateSnapshot?: Float32Array | number[] | null;
}

export interface CommandQueuePhysicsPort {
  jumpSuppressedCarIndices?: Set<number>;
  sim?: {
    getReplayFrameCount?: () => number;
    pushSignalEvent?: (...args: number[]) => void;
    saveCompactState?: () => Float32Array;
    saveState?: () => Float32Array;
  } | null;
}

export interface CommandQueueSessionPort extends RosterSessionManagerPort {
  signalBuffer?: {
    nextSignalId?: number;
    retireSignal?: (signalId: number) => void;
    retireByType?: (signalType: number) => void;
  } | null;
  getSession?: (
    sessionId: string
  ) =>
    | { role?: string; entityId: number; rttMs?: number; updateRtt?: (rtt: number) => void }
    | null
    | undefined;
}

export interface CommandQueueReplayBufferPort {
  size?: number;
  capacity?: number;
}

const ENTITY_SCOPED_SIGNALS = new Set<number>([
  MATCH_SIGNALS.PLAYER_JOINED,
  MATCH_SIGNALS.PLAYER_LEFT,
  MATCH_SIGNALS.PLAYER_SLOT_UPDATED,
  MATCH_SIGNALS.PLAYER_LOADOUT_UPDATED,
  MATCH_SIGNALS.DEMOLITION,
  MATCH_SIGNALS.FLIP_RESET_GAINED,
]);

const NON_REPLAY_WIRE_SIGNALS = new Set<number>([
  MATCH_SIGNALS.CLOCK_UPDATED_SECONDS,
  MATCH_SIGNALS.COMMAND_ACK,
  MATCH_SIGNALS.FLIP_RESET_GAINED,
  SYSTEM_CONTROL_SIGNALS.SYS_CTRL_STATE_ONLY,
  SYSTEM_CONTROL_SIGNALS.SYS_CTRL_INTERVENE_WILL_RESUME,
  SYSTEM_CONTROL_SIGNALS.SYS_CTRL_PHYSICS_RESUME,
]);

export function evaluateDomainStepFrameGate(
  s: {
    state: MatchState;
    matchTick: number;
    clockDuration: number;
    podiumDelayTicks: number;
    kickoffWillStartAt: number;
    prepareTimeoutTicks: number;
    startCountdownTicks: number;
    willResumeUntilTick: number;
    goalBufferTicks: number;
    isTrainingMode: boolean;
    trainingGoalReplayEnabled: boolean;
    completeKickoffToPlaying(): void;
  },
  phase: 'pre' | 'post' | 'ended_podium_tick',
  physicsTick?: number,
  hasPhysics = true
): { action: FramePhaseGateAction; clockDuration: number } {
  const clockDuration = s.clockDuration;
  const st = s.state;
  if (phase === 'ended_podium_tick') {
    const ready =
      st === MATCH_STATES.ENDED && !(s.podiumDelayTicks > 0 && --s.podiumDelayTicks > 0);
    return { action: ready ? 'ended_or_podium' : 'none', clockDuration };
  }
  if (phase === 'post') {
    if (hasPhysics && typeof physicsTick === 'number') s.matchTick = physicsTick;
    else if (!hasPhysics) s.matchTick++;
    if (
      st === MATCH_STATES.KICKOFF &&
      s.kickoffWillStartAt > 0 &&
      s.matchTick >= s.kickoffWillStartAt
    ) {
      s.completeKickoffToPlaying();
      return { action: 'kickoff_started', clockDuration };
    }
    return { action: 'none', clockDuration };
  }
  if (st === MATCH_STATES.ENDED || st === MATCH_STATES.PODIUM) {
    return { action: 'ended_or_podium', clockDuration };
  }
  if (st === MATCH_STATES.PREPARE || st === MATCH_STATES.COUNTDOWN) {
    s.matchTick++;
    const act =
      st === MATCH_STATES.PREPARE
        ? --s.prepareTimeoutTicks <= 0
          ? 'start_from_prepare'
          : 'encode_null'
        : --s.startCountdownTicks <= 0
          ? 'initiate_prepare_from_countdown'
          : 'encode_null';
    return { action: act, clockDuration };
  }
  if (st === MATCH_STATES.LOBBY) return { action: 'lobby', clockDuration };
  if (st === MATCH_STATES.PAUSED && s.willResumeUntilTick > 0) {
    return {
      action: ++s.matchTick >= s.willResumeUntilTick ? 'resume_from_pause' : 'encode_null',
      clockDuration,
    };
  }
  if (st === MATCH_STATES.GOAL_SCORED && --s.goalBufferTicks <= 0) {
    return {
      action:
        s.isTrainingMode && !s.trainingGoalReplayEnabled
          ? 'reset_training_play'
          : 'begin_goal_replay',
      clockDuration,
    };
  }
  if (st === MATCH_STATES.REPLAY) {
    s.matchTick++;
    return { action: 'replay', clockDuration };
  }
  return { action: 'none', clockDuration };
}

export function createAndRecordMatchSignal(p: {
  signalType: number;
  frameId: number;
  param1: number;
  param2: number;
  currentNextSignalId: number;
  shouldSuppressCountdown: boolean;
  sessionManager: CommandQueueSessionPort | null | undefined;
  physicsManager: CommandQueuePhysicsPort | null | undefined;
  replayBuffer: CommandQueueReplayBufferPort | null | undefined;
  replaySignalLog: ReplaySignalLogEntry[];
  currentFrameSignals: ReplaySignalLogEntry[];
  activeSignals: Map<string | number, ActiveMatchSignal>;
}): { signal: ActiveMatchSignal | null; nextSignalId: number } {
  const {
    signalType,
    frameId,
    param1,
    param2,
    currentNextSignalId,
    sessionManager: sm,
    physicsManager: pm,
    replayBuffer: rb,
  } = p;
  if (
    p.shouldSuppressCountdown &&
    (signalType === MATCH_SIGNALS.TIME_ALERT_60S ||
      signalType === MATCH_SIGNALS.TIME_ALERT_30S ||
      signalType === MATCH_SIGNALS.COUNTDOWN_10S)
  ) {
    return { signal: null, nextSignalId: currentNextSignalId };
  }

  const nextSignalId =
    (Math.max(currentNextSignalId || 0, sm?.signalBuffer?.nextSignalId || 0) % 65535) + 1;
  if (sm?.signalBuffer) sm.signalBuffer.nextSignalId = nextSignalId;
  const signalObj: ActiveMatchSignal = {
    signalId: nextSignalId,
    signalType,
    frameId,
    param1,
    param2,
    ackedPeers: new Set<string>(),
    remainingRedundancy: signalType === MATCH_SIGNALS.KICKOFF_WILL_START ? 480 : 180,
  };

  if (!NON_REPLAY_WIRE_SIGNALS.has(signalType)) {
    const wasmIdx = pm?.sim?.getReplayFrameCount?.() ?? rb?.size ?? 0;
    const logEntry: ReplaySignalLogEntry = {
      signalId: nextSignalId,
      signalType,
      frameId,
      param1,
      param2,
      frameIndex: wasmIdx,
      recordedAt: Date.now(),
    };
    p.replaySignalLog.push(logEntry);
    if (p.replaySignalLog.length > (rb?.capacity || 18000)) p.replaySignalLog.shift();
    if (Array.isArray(p.currentFrameSignals)) p.currentFrameSignals.push(logEntry);
    if (signalType >= 0x80 && typeof pm?.sim?.pushSignalEvent === 'function') {
      const p1 = Number(param1 || 0) >>> 0;
      const p2 = Number(param2 || 0) >>> 0;
      pm.sim.pushSignalEvent(
        signalType,
        frameId >>> 0,
        Number(param1 || 0),
        Number(param2 || 0),
        0,
        0,
        0,
        0,
        p1 & 0xffff,
        (p1 >>> 16) & 0xffff,
        p2,
        nextSignalId >>> 0,
        0,
        wasmIdx >>> 0
      );
    }
  }

  const mapKey =
    signalType === MATCH_SIGNALS.COMMAND_ACK
      ? `ack_${param1}_${param2}`
      : ENTITY_SCOPED_SIGNALS.has(signalType)
        ? `sig_${signalType}_ent_${param1}`
        : signalType;
  p.activeSignals.set(mapKey, signalObj);
  return { signal: signalObj, nextSignalId };
}

export function applyClientSignalAcksToActiveSignals(
  sessionId: string,
  acks: Array<{ signalId: number; signalType?: number }>,
  activeSignals: Map<string | number, ActiveMatchSignal>,
  players: Map<string, MatchPlayerSlot>,
  spectators: Map<string, MatchSpectatorSlot>
): void {
  const expected = new Set<string>();
  for (const [sid, p] of players.entries()) if (!p.isBot) expected.add(sid);
  for (const sid of spectators.keys()) expected.add(sid);

  for (let i = 0; i < acks.length; i++) {
    const ack = acks[i];
    if (!ack || typeof ack.signalId !== 'number') continue;
    for (const [key, sObj] of activeSignals.entries()) {
      if (
        sObj.signalId === ack.signalId &&
        (!ack.signalType || sObj.signalType === ack.signalType)
      ) {
        sObj.ackedPeers.add(sessionId);
        if (sObj.signalType !== MATCH_SIGNALS.KICKOFF_WILL_START && expected.size > 0) {
          let allAcked = true;
          for (const pid of expected) {
            if (!sObj.ackedPeers.has(pid)) {
              allAcked = false;
              break;
            }
          }
          if (allAcked) activeSignals.delete(key);
        }
      }
    }
  }
}
