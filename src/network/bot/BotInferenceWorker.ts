/**
 * BotInferenceWorker.ts
 * Dedicated Web Worker for AI Bot Inference (Nexto / Necto / Heuristic).
 *
 * Runs completely outside AuthoritativeServerWorker so neural network
 * inference (EARL Perceiver / SafeTensors) never blocks or delays the 120Hz
 * authoritative physics loop. Produces standard binary InputPacketCodec
 * frames for each bot session, which BotTunnelManager feeds into the server's
 * NetworkDataHandler / EstablishedSessionManager over virtual loopback tunnels.
 */

import {
  ExperimentalBotAgent,
  ensureExperimentalEngine,
} from '../../ai/experimental/ExperimentalBotAgent.ts';
import { DEFAULT_CAR_CONTROLS } from '../../ai/experimental/experimentalMultiCarObsPipeline.ts';
import { BallStateView, CarStateView } from '../../physics/RocketSimStateViews.ts';
import {
  InputPacketCodec,
  type CarControlsInput,
  type ClientCommandEntry,
  type SignalAckEntry,
} from '../protocol/InputPacketCodec.ts';

export interface BoostPadCoordSpec {
  readonly pos: readonly [number, number, number];
  readonly isBig: boolean;
}

export interface BotSessionStepSpec {
  sessionId: string;
  carIndex?: number;
  entityId?: number;
  team?: number;
  botType?: string;
  acks?: SignalAckEntry[];
  commands?: ClientCommandEntry[];
}

export interface ActiveCarTopologyEntry {
  carIndex: number;
  team: number;
}

export interface BotInferenceBatchPayload {
  stateSnapshot?: Float32Array | null;
  serverTick?: number;
  matchState?: string;
  bots?: BotSessionStepSpec[];
  activeCars?: ActiveCarTopologyEntry[];
  pads?: readonly BoostPadCoordSpec[] | null;
  redundantTicks?: number;
  nowMs?: number;
}

export interface BotTunnelEncodedPacket {
  sessionId: string;
  carIndex: number;
  packetBytes: Uint8Array;
}

export const MAX_BOT_STEP_TICKS = 24;

class BotAgentRuntimeRecord {
  readonly agent: ExperimentalBotAgent;
  kickoffStep = 0;
  staggered = false;
  lastServerTick = -1;
  maxCommittedTick = -1;
  readonly committedControls = new Map<number, CarControlsInput>();

  constructor(botType: string, carIndex: number, team: 0 | 1) {
    this.agent = new ExperimentalBotAgent(botType, carIndex, team);
    ensureExperimentalEngine(botType);
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
    pads: readonly BoostPadCoordSpec[],
    activeCars: ActiveCarTopologyEntry[],
    redundantTicks: number,
    allowHeavyInference = true
  ): {
    targetTick: number;
    history: Array<{ tick: number; carIndex: number; controls: CarControlsInput }>;
    ranHeavyInference: boolean;
  } {
    if (
      matchState !== 'playing' ||
      this.maxCommittedTick < serverTick - MAX_BOT_STEP_TICKS ||
      this.maxCommittedTick > serverTick + MAX_BOT_STEP_TICKS
    ) {
      this.maxCommittedTick = serverTick - 1;
      this.committedControls.clear();
    }

    const deltaTicks =
      this.lastServerTick >= 0 && serverTick > this.lastServerTick
        ? Math.min(MAX_BOT_STEP_TICKS, serverTick - this.lastServerTick)
        : 1;
    this.lastServerTick = serverTick;

    let ctrl: CarControlsInput = DEFAULT_CAR_CONTROLS;
    let ranHeavyInference = false;
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
      } else {
        if (!this.staggered) {
          this.staggered = true;
          this.agent.tickSkipCounter = (carIndex * 2) % this.agent.tickSkip;
        } else {
          this.agent.tickSkipCounter = Math.max(0, this.agent.tickSkipCounter - deltaTicks);
        }

        if (this.agent.tickSkipCounter <= 0 && allowHeavyInference) {
          ctrl = this.agent.decideSync(
            stateSnapshot,
            pads as BoostPadCoordSpec[],
            activeCars
          ) as CarControlsInput;
          this.agent.tickSkipCounter = this.agent.tickSkip;
          ranHeavyInference = this.agent.botType !== 'heuristic';
        } else {
          ctrl = this.agent.action as CarControlsInput;
        }
      }
      this.kickoffStep += deltaTicks;
    }

    const horizonTicks = Math.max(
      2,
      Math.min(MAX_BOT_STEP_TICKS, Math.max(16, Number(redundantTicks) || 16))
    );
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
      const committed = this.committedControls.get(t) || ctrl || DEFAULT_CAR_CONTROLS;
      history.push({
        tick: t,
        carIndex,
        controls: committed,
      });
    }

    return { targetTick, history, ranHeavyInference };
  }
}

const DEFAULT_ARENA_BOOST_PADS: readonly BoostPadCoordSpec[] = Object.freeze([
  { pos: [-3584, 0, 73], isBig: true },
  { pos: [3584, 0, 73], isBig: true },
  { pos: [-3072, 4096, 73], isBig: true },
  { pos: [3072, 4096, 73], isBig: true },
  { pos: [-3072, -4096, 73], isBig: true },
  { pos: [3072, -4096, 73], isBig: true },
  { pos: [0, -4240, 70], isBig: false },
  { pos: [-1792, -4184, 70], isBig: false },
  { pos: [1792, -4184, 70], isBig: false },
  { pos: [-940, -3308, 70], isBig: false },
  { pos: [940, -3308, 70], isBig: false },
  { pos: [0, -2816, 70], isBig: false },
  { pos: [-3584, -2484, 70], isBig: false },
  { pos: [3584, -2484, 70], isBig: false },
  { pos: [-1788, -2300, 70], isBig: false },
  { pos: [1788, -2300, 70], isBig: false },
  { pos: [-2048, -1036, 70], isBig: false },
  { pos: [0, -1024, 70], isBig: false },
  { pos: [2048, -1036, 70], isBig: false },
  { pos: [-1024, 0, 70], isBig: false },
  { pos: [1024, 0, 70], isBig: false },
  { pos: [-2048, 1036, 70], isBig: false },
  { pos: [0, 1024, 70], isBig: false },
  { pos: [2048, 1036, 70], isBig: false },
  { pos: [-1788, 2300, 70], isBig: false },
  { pos: [1788, 2300, 70], isBig: false },
  { pos: [-3584, 2484, 70], isBig: false },
  { pos: [3584, 2484, 70], isBig: false },
  { pos: [0, 2816, 70], isBig: false },
  { pos: [-940, 3308, 70], isBig: false },
  { pos: [940, 3308, 70], isBig: false },
  { pos: [-1792, 4184, 70], isBig: false },
  { pos: [1792, 4184, 70], isBig: false },
  { pos: [0, 4240, 70], isBig: false },
]);

const botAgents = new Map<string, BotAgentRuntimeRecord>();
const sBallView = new BallStateView();
const sCarView = new CarStateView();
let cachedPads: readonly BoostPadCoordSpec[] = DEFAULT_ARENA_BOOST_PADS;
let directServerPort: MessagePort | null = null;

function postWorkerMessage(msg: Record<string, unknown>, transfer: Transferable[] = []): void {
  if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
    if (transfer && transfer.length > 0) {
      (self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage(
        msg,
        transfer
      );
    } else {
      self.postMessage(msg);
    }
  }
}

export function stepBotInferenceBatch(
  payload: BotInferenceBatchPayload = {}
): BotTunnelEncodedPacket[] {
  const {
    stateSnapshot,
    serverTick = 0,
    matchState = 'playing',
    bots = [],
    activeCars = [],
    pads = null,
    redundantTicks = 12,
    nowMs = Date.now(),
  } = payload;

  if (Array.isArray(pads) && pads.length > 0) {
    cachedPads = pads;
  }

  if (!stateSnapshot || !(stateSnapshot instanceof Float32Array) || bots.length === 0) {
    return [];
  }

  const activeBotSids = new Set(bots.map((b) => b.sessionId));
  for (const sid of Array.from(botAgents.keys())) {
    if (!activeBotSids.has(sid)) {
      botAgents.delete(sid);
    }
  }

  sBallView.attach(stateSnapshot);
  const closestCarPerTeam: Record<0 | 1, number> = { 0: -1, 1: -1 };
  const closestDistPerTeam: Record<0 | 1, number> = {
    0: Infinity,
    1: Infinity,
  };

  if (matchState === 'playing') {
    for (let i = 0; i < activeCars.length; i++) {
      const entry = activeCars[i];
      if (!entry || typeof entry.carIndex !== 'number' || entry.carIndex < 0 || entry.carIndex >= 8)
        continue;
      sCarView.attachCar(stateSnapshot, entry.carIndex);
      if (sCarView.isDemoed) continue;
      const d = Math.hypot(sCarView.posX - sBallView.posX, sCarView.posY - sBallView.posY);
      const t: 0 | 1 = entry.team === 1 ? 1 : 0;
      if (d < closestDistPerTeam[t]) {
        closestDistPerTeam[t] = d;
        closestCarPerTeam[t] = entry.carIndex;
      }
    }
  }

  const packets: BotTunnelEncodedPacket[] = [];
  let heavyInferencesThisBatch = 0;
  for (let i = 0; i < bots.length; i++) {
    const bot = bots[i];
    const sid = bot.sessionId;
    const carIndex = bot.carIndex ?? bot.entityId ?? 1;
    const team: 0 | 1 = bot.team === 1 ? 1 : 0;
    const botType = bot.botType || 'nexto';

    let record = botAgents.get(sid);
    if (!record) {
      record = new BotAgentRuntimeRecord(botType, carIndex, team);
      botAgents.set(sid, record);
    } else {
      record.syncIdentity(carIndex, team, botType);
    }

    const isPrimaryKickoffCar = closestCarPerTeam[team] === carIndex;
    const { targetTick, history, ranHeavyInference } = record.stepSessionHistory(
      stateSnapshot,
      serverTick,
      matchState,
      carIndex,
      isPrimaryKickoffCar,
      cachedPads,
      activeCars,
      redundantTicks,
      heavyInferencesThisBatch < 1
    );
    if (ranHeavyInference) {
      heavyInferencesThisBatch++;
    }

    const packetBytes = InputPacketCodec.encode(
      carIndex,
      targetTick,
      history,
      nowMs,
      bot.acks || [],
      bot.commands || []
    );

    packets.push({
      sessionId: sid,
      carIndex,
      packetBytes,
    });
  }

  return packets;
}

export interface BotWorkerMessageData extends BotInferenceBatchPayload {
  type?: string;
  botType?: string;
  port?: MessagePort | null;
}

export async function handleBotWorkerMessage(
  eventOrData:
    | { data?: BotWorkerMessageData; ports?: readonly MessagePort[] }
    | BotWorkerMessageData
    | null
    | undefined,
  customEmit: ((msg: Record<string, unknown>, transfer?: Transferable[]) => void) | null = null
): Promise<void> {
  const raw = eventOrData as { data?: BotWorkerMessageData; ports?: readonly MessagePort[] };
  const data: BotWorkerMessageData =
    raw?.data !== undefined ? raw.data : (eventOrData as BotWorkerMessageData) || {};
  const emit = customEmit || postWorkerMessage;

  switch (data.type) {
    case 'prewarm': {
      const botType = data.botType || 'nexto';
      await ensureExperimentalEngine(botType);
      emit({ type: 'prewarmed', botType });
      break;
    }

    case 'init': {
      const botType = data.botType || 'nexto';
      await ensureExperimentalEngine(botType);
      if (Array.isArray(data.pads) && data.pads.length > 0) {
        cachedPads = data.pads;
      }
      if (data.port || raw?.ports?.[0]) {
        const port = data.port || raw.ports![0];
        attachDirectServerPort(port);
      }
      emit({ type: 'initialized', botType });
      break;
    }

    case 'set_pads': {
      if (Array.isArray(data.pads) && data.pads.length > 0) {
        cachedPads = data.pads;
      }
      break;
    }

    case 'attach_port': {
      const port = data.port || raw?.ports?.[0];
      if (port) {
        attachDirectServerPort(port);
      }
      break;
    }

    case 'step_bots': {
      const packets = stepBotInferenceBatch(data);
      const transfers: Transferable[] = [];
      for (let i = 0; i < packets.length; i++) {
        if (packets[i].packetBytes?.buffer instanceof ArrayBuffer) {
          transfers.push(packets[i].packetBytes.buffer);
        }
      }
      emit(
        {
          type: 'bot_tunnel_packets',
          serverTick: data.serverTick || 0,
          packets,
        },
        transfers
      );
      break;
    }

    case 'reset': {
      botAgents.clear();
      break;
    }

    default:
      break;
  }
}

function attachDirectServerPort(port: MessagePort | null): void {
  if (!port) return;
  if (directServerPort && directServerPort !== port) {
    try {
      directServerPort.close?.();
    } catch (_e) {
      // Ignore close error
    }
  }
  directServerPort = port;
  const portEmit = (msg: Record<string, unknown>, transfer: Transferable[] = []) => {
    if (!directServerPort) return;
    try {
      if (transfer && transfer.length > 0) {
        directServerPort.postMessage(msg, transfer);
      } else {
        directServerPort.postMessage(msg);
      }
    } catch (_err) {
      directServerPort.postMessage(msg);
    }
  };
  directServerPort.onmessage = (ev) => handleBotWorkerMessage(ev, portEmit);
  directServerPort.start?.();
}

if (typeof self !== 'undefined') {
  self.onmessage = (event) => handleBotWorkerMessage(event);
}
