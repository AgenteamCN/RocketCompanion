/**
 * BotTunnelManager.ts
 * Manages isolated virtual loopback tunnels between WASM `BotDirector` (`BotWeightLoader`)
 * and `AuthoritativeServerHost` without spawning a separate `BotInferenceWorker`.
 */

import { ExperimentalBotAgent, ensureBotWeightsLoaded } from '../../ai/BotWeightLoader.ts';
import { DEFAULT_CAR_CONTROLS } from '../../ai/experimental/experimentalMultiCarObsPipeline.ts';
import { BallStateView, CarStateView } from '../../physics/RocketSimStateViews.ts';
import { InputPacketCodec, type CarControlsInput } from '../protocol/InputPacketCodec.ts';
import type { WorkerRoomStateSummary } from '../server/HostWorkerMessageRouter.ts';
import type { BotTunnelHostServerPort } from '../server/hostLoopbackFrameDecodePipeline.ts';

export interface BotTunnelManagerOptions {
  forceInProcess?: boolean;
}

export interface RegisteredBotTunnelInfo {
  sessionId: string;
  carIndex: number;
  team: 0 | 1;
  botType: string;
}

export interface RoomStateRosterPlayerLike {
  sessionId?: string;
  isBot?: boolean;
  carIndex?: number;
  entityId?: number;
  team?: number;
  botType?: string;
}

export interface RoomStateLike {
  pads?: unknown;
  players?: readonly RoomStateRosterPlayerLike[];
  roster?: {
    players?: readonly RoomStateRosterPlayerLike[];
  };
}

class InProcessBotTunnelRecord {
  readonly agent: ExperimentalBotAgent;
  kickoffStep = 0;
  staggered = false;
  lastServerTick = -1;
  maxCommittedTick = -1;
  readonly committedControls = new Map<number, CarControlsInput>();

  constructor(botType: string, carIndex: number, team: 0 | 1) {
    this.agent = new ExperimentalBotAgent(botType, carIndex, team);
    void ensureBotWeightsLoaded(botType);
  }

  syncIdentity(carIndex: number, team: 0 | 1, botType: string): void {
    this.agent.carIndex = carIndex;
    this.agent.team = team;
    if (this.agent.botType !== botType) {
      this.agent.setBotType(botType);
    }
  }

  stepSessionHistory(
    stateSnapshot: Float32Array,
    serverTick: number,
    matchState: string,
    carIndex: number,
    isPrimaryKickoffCar: boolean,
    pads: readonly unknown[],
    activeCars: ReadonlyArray<{ carIndex: number; team: 0 | 1 }>,
    redundantTicks: number
  ): {
    targetTick: number;
    history: Array<{ tick: number; carIndex: number; controls: CarControlsInput }>;
  } {
    if (
      matchState !== 'playing' ||
      this.maxCommittedTick < serverTick - 16 ||
      this.maxCommittedTick > serverTick + 16
    ) {
      this.maxCommittedTick = serverTick - 1;
      this.committedControls.clear();
    }

    const deltaTicks =
      this.lastServerTick >= 0 && serverTick > this.lastServerTick
        ? Math.min(16, serverTick - this.lastServerTick)
        : 1;
    this.lastServerTick = serverTick;

    let ctrl: CarControlsInput = DEFAULT_CAR_CONTROLS;
    const baseKickoffStep = this.kickoffStep;

    if (matchState !== 'playing') {
      this.kickoffStep = 0;
      this.staggered = false;
      this.agent.reset();
      ctrl =
        matchState === 'replay' ? { ...DEFAULT_CAR_CONTROLS, jump: true } : DEFAULT_CAR_CONTROLS;
    } else {
      const ko = this.agent.getKickoffControls(stateSnapshot, baseKickoffStep, isPrimaryKickoffCar);
      if (ko) {
        ctrl = ko as CarControlsInput;
        this.agent.overrideControls(ko);
      } else if (this.agent.tickSkipCounter <= 0) {
        ctrl = this.agent.decideSync(stateSnapshot, pads, activeCars) as CarControlsInput;
        this.agent.tickSkipCounter = this.staggered
          ? Math.max(0, this.agent.tickSkip - deltaTicks)
          : (carIndex % this.agent.tickSkip) + 1;
        this.staggered = true;
      } else {
        this.agent.tickSkipCounter = Math.max(0, this.agent.tickSkipCounter - deltaTicks);
        ctrl = this.agent.action as CarControlsInput;
      }
      this.kickoffStep += deltaTicks;
    }

    const horizonTicks = Math.max(2, Math.min(8, Number(redundantTicks) || 6));
    const targetTick = serverTick + horizonTicks;
    const startCommitTick = Math.max(serverTick, this.maxCommittedTick + 1);
    for (let t = startCommitTick; t <= targetTick; t++) {
      let tickCtrl: CarControlsInput = ctrl || DEFAULT_CAR_CONTROLS;
      const k = t - serverTick;
      if (matchState === 'playing' && baseKickoffStep + k < 168) {
        const koTick = this.agent.getKickoffControls(
          stateSnapshot,
          baseKickoffStep + k,
          isPrimaryKickoffCar
        );
        if (koTick) {
          tickCtrl = koTick as CarControlsInput;
        }
      }
      this.committedControls.set(t, { ...tickCtrl });
      this.maxCommittedTick = t;
    }

    for (const oldTick of this.committedControls.keys()) {
      if (oldTick < serverTick - 4) {
        this.committedControls.delete(oldTick);
      }
    }

    const history: Array<{ tick: number; carIndex: number; controls: CarControlsInput }> = [];
    for (let t = serverTick; t <= targetTick; t++) {
      history.push({
        tick: t,
        carIndex,
        controls: this.committedControls.get(t) || ctrl || DEFAULT_CAR_CONTROLS,
      });
    }

    return { targetTick, history };
  }
}

export async function prewarmBotInferenceWorker(): Promise<boolean> {
  await Promise.all([ensureBotWeightsLoaded('nexto'), ensureBotWeightsLoaded('necto')]);
  return true;
}

const sBallView = new BallStateView();
const sCarView = new CarStateView();

export class BotTunnelManager {
  hostServer: BotTunnelHostServerPort | null;
  options: BotTunnelManagerOptions;
  registeredTunnels = new Map<string, RegisteredBotTunnelInfo>();
  private readonly runtimeRecords = new Map<string, InProcessBotTunnelRecord>();
  lastSteppedServerTick = -1;
  lastSteppedMatchState = '';
  cachedPads: readonly unknown[] = [];

  constructor(
    hostServer: BotTunnelHostServerPort | null = null,
    options: BotTunnelManagerOptions = {}
  ) {
    this.hostServer = hostServer;
    this.options = options;
  }

  init(): void {
    void ensureBotWeightsLoaded('nexto');
  }

  syncFromRoomState(roomState: RoomStateLike | null | undefined): void {
    if (Array.isArray(roomState?.pads) && roomState.pads.length > 0) {
      this.cachedPads = roomState.pads;
    }

    const players = roomState?.roster?.players || roomState?.players || [];
    const activeBotMap = new Map<string, RegisteredBotTunnelInfo>();

    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const sid = p?.sessionId;
      const isBot = Boolean(p?.isBot || sid === 'bot' || String(sid || '').startsWith('bot_'));
      if (!isBot || !sid) continue;
      const carIndex = p.carIndex ?? p.entityId ?? -1;
      if (carIndex < 0 || carIndex >= 8) continue;
      const botType = p.botType || 'nexto';
      if (botType !== 'heuristic') {
        void ensureBotWeightsLoaded(botType);
      }
      activeBotMap.set(sid, {
        sessionId: sid,
        carIndex,
        team: p.team === 1 ? 1 : 0,
        botType,
      });
    }

    for (const [sid, info] of activeBotMap.entries()) {
      if (!this.registeredTunnels.has(sid)) {
        this.registeredTunnels.set(sid, info);
        if (this.hostServer?.isWorker && this.hostServer?.worker) {
          this.hostServer._postCommand('registerChannel', { channelId: sid });
        } else if (this.hostServer?.fallbackDataHandler) {
          this.hostServer.fallbackDataHandler.registerChannel(sid, { send: () => {} });
        }
      } else {
        this.registeredTunnels.set(sid, info);
      }
    }

    for (const sid of Array.from(this.registeredTunnels.keys())) {
      if (!activeBotMap.has(sid)) {
        this.registeredTunnels.delete(sid);
        this.runtimeRecords.delete(sid);
      }
    }
  }

  onServerPhysicsFrame(
    stateSnapshot: Float32Array,
    serverTick: number,
    matchState = 'playing'
  ): void {
    if (!stateSnapshot || this.registeredTunnels.size === 0) return;
    if (serverTick === this.lastSteppedServerTick && matchState === this.lastSteppedMatchState) {
      return;
    }
    this.lastSteppedServerTick = serverTick;
    this.lastSteppedMatchState = matchState;

    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const bots = Array.from(this.registeredTunnels.values());
    const lastRoom = this.hostServer?.lastRoomState as RoomStateLike | null | undefined;
    const rosterPlayers = lastRoom?.roster?.players || lastRoom?.players || [];
    const activeCars: Array<{ carIndex: number; team: 0 | 1 }> = [];
    for (let i = 0; i < rosterPlayers.length; i++) {
      const p = rosterPlayers[i];
      const cIdx = p?.carIndex ?? p?.entityId ?? -1;
      if (cIdx >= 0 && cIdx < 8) {
        activeCars.push({ carIndex: cIdx, team: p.team === 1 ? 1 : 0 });
      }
    }
    if (activeCars.length === 0) {
      for (let i = 0; i < bots.length; i++) {
        activeCars.push({ carIndex: bots[i].carIndex, team: bots[i].team });
      }
    }

    sBallView.attach(stateSnapshot);
    const closestCarPerTeam: Record<0 | 1, number> = { 0: -1, 1: -1 };
    const closestDistPerTeam: Record<0 | 1, number> = { 0: Infinity, 1: Infinity };

    if (matchState === 'playing') {
      for (let i = 0; i < activeCars.length; i++) {
        const entry = activeCars[i];
        sCarView.attachCar(stateSnapshot, entry.carIndex);
        if (sCarView.isDemoed) continue;
        const d = Math.hypot(sCarView.posX - sBallView.posX, sCarView.posY - sBallView.posY);
        if (d < closestDistPerTeam[entry.team]) {
          closestDistPerTeam[entry.team] = d;
          closestCarPerTeam[entry.team] = entry.carIndex;
        }
      }
    }

    for (let i = 0; i < bots.length; i++) {
      const bot = bots[i];
      let record = this.runtimeRecords.get(bot.sessionId);
      if (!record) {
        record = new InProcessBotTunnelRecord(bot.botType, bot.carIndex, bot.team);
        this.runtimeRecords.set(bot.sessionId, record);
      } else {
        record.syncIdentity(bot.carIndex, bot.team, bot.botType);
      }

      const isPrimaryKickoffCar = closestCarPerTeam[bot.team] === bot.carIndex;
      const { targetTick, history } = record.stepSessionHistory(
        stateSnapshot,
        serverTick,
        matchState,
        bot.carIndex,
        isPrimaryKickoffCar,
        this.cachedPads,
        activeCars,
        10
      );

      const packetBytes = InputPacketCodec.encode(bot.carIndex, targetTick, history, nowMs, [], []);
      if (this.hostServer?.isWorker && this.hostServer.worker) {
        this.hostServer._postCommand('channel_packet', {
          channelId: bot.sessionId,
          packet: packetBytes,
          timestamp: nowMs,
        });
      } else if (this.hostServer?.fallbackDataHandler) {
        this.hostServer.fallbackDataHandler.handleIncomingPacket(bot.sessionId, packetBytes, nowMs);
      }
    }
  }

  destroy(): void {
    this.registeredTunnels.clear();
    this.runtimeRecords.clear();
  }
}

export default BotTunnelManager;
