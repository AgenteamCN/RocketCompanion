import { RocketSimPhysicsEngine } from '../../physics/RocketSimPhysicsEngine.ts';
import { loadRocketSimWasmModule } from '../../physics/RocketSimWasm.ts';
import { PhysicsEngineManager } from './PhysicsEngineManager.ts';
import { NetworkInputBuffer, MAX_INPUT_BUFFER_TICKS } from './NetworkInputBuffer.ts';
import { EstablishedSessionManager } from './EstablishedSessionManager.ts';
import { MatchSessionAdmin, type AdminPhysicsManagerPort } from './match/MatchSessionAdmin.ts';
import { NetworkDataHandler } from './NetworkDataHandler.ts';
import { HOST_WORKER_MSG_TYPES, createWorkerEnvelope } from '../protocol/HostWorkerProtocol.ts';
import {
  routeProtocolMessageInWorker,
  buildWorkerRoomStateSummary,
  type WorkerRouterContext,
  type WorkerProtocolIncomingMessage,
  type HostWorkerInitOptions,
} from './HostWorkerMessageRouter.ts';
import { WorkerDirectBotPortBridge } from './workerReplayAndDiagnosticsRouter.ts';
import type { DiagnosticsTestVehicleController } from '../diagnostics/DiagnosticsTestVehicles.ts';
import type { AuthoritativePhysicsSimPort } from './authoritativePhysicsStepPipeline.ts';

export interface AuthoritativeWorkerIncomingEvent extends HostWorkerInitOptions {
  type?: string;
  seq?: number;
  port?: MessagePort;
  ports?: readonly MessagePort[];
  collisionData?: unknown;
  payload?: HostWorkerInitOptions | Uint8Array;
  data?: AuthoritativeWorkerIncomingEvent;
}

let sim: RocketSimPhysicsEngine | null = null;
let physicsManager: PhysicsEngineManager | null = null;
let inputBuffer: NetworkInputBuffer | null = null;
let sessionManager: EstablishedSessionManager | null = null;
let matchManager: MatchSessionAdmin | null = null;
let dataHandler: NetworkDataHandler | null = null;
let diagnosticsController: DiagnosticsTestVehicleController | null = null;
const botPortBridge = new WorkerDirectBotPortBridge();

let isRunning = false;
let loopTimer: ReturnType<typeof setTimeout> | null = null;
let lastTickTime = -1;
let accumulator = 0;
const fixedTimestep = 1.0 / 120.0;

function postWorkerMessage(msg: unknown, transfer: Transferable[] = []): void {
  if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
    const workerSelf = self as unknown as {
      postMessage(message: unknown, transfer?: Transferable[]): void;
    };
    if (transfer && transfer.length > 0) {
      workerSelf.postMessage(msg, transfer);
    } else {
      workerSelf.postMessage(msg);
    }
  }
}

function sendToMain(channelId: string, packet: Uint8Array | ArrayBuffer | string): void {
  let transferBuffer: ArrayBufferLike | null = null;
  let copy: Uint8Array | string = packet as Uint8Array | string;

  if (packet instanceof Uint8Array || packet instanceof ArrayBuffer) {
    copy = new Uint8Array(packet);
    transferBuffer = copy.buffer;
  }

  try {
    if (transferBuffer) {
      postWorkerMessage({ type: 'channel_packet', channelId, packet: copy }, [
        transferBuffer as ArrayBuffer,
      ]);
    } else {
      postWorkerMessage({ type: 'channel_packet', channelId, packet: copy });
    }
  } catch (err) {
    console.warn(
      '[AuthoritativeServerWorker] postMessage with transferBuffer failed, retrying without transferBuffer:',
      err
    );
    postWorkerMessage({ type: 'channel_packet', channelId, packet: copy });
  }
}

function isVirtualBotChannelId(channelId: string): boolean {
  return channelId === 'bot' || String(channelId || '').startsWith('bot_');
}

function registerWorkerChannel(channelId: string): void {
  if (!dataHandler) return;
  if (isVirtualBotChannelId(channelId)) {
    dataHandler.registerChannel(channelId, {
      isVirtualBot: true,
      send: () => {},
      postMessage: () => {},
    });
    return;
  }
  dataHandler.registerChannel(channelId, {
    send: (packet) => sendToMain(channelId, packet),
    postMessage: (packet) => sendToMain(channelId, packet),
  });
}

function unregisterWorkerChannel(channelId: string): void {
  if (!dataHandler) return;
  dataHandler.unregisterChannel(channelId);
  matchManager?.roster.removePlayerSession(channelId);
}

let lastSyncedRoomSignature = '';

function computeRoomSyncSignature(): string {
  if (!matchManager) return '';
  const { domain } = matchManager;
  let rosterSig = '';
  for (const [sid, p] of domain.players.entries()) {
    rosterSig += `${sid}:${p?.entityId ?? -1}:${p?.team ?? 0}:${p?.isBot ? 1 : 0}:${p?.botType ?? ''}:${p?.visualId ?? ''}:${p?.hitboxId ?? ''}:${p?.colorSlot ?? 0}:${p?.paintFinish ?? ''}:${p?.boostVisual ?? ''}:${p?.boostAudio ?? ''}:${p?.ready ? 1 : 0}:${p?.arenaLoaded ? 1 : 0};`;
  }
  return `${domain.state}|${domain.botFillMode}|${domain.defaultBotType}|${domain.gameMode}|${domain.clockDuration}|${rosterSig}`;
}

function syncWorkerRoomStateIfNeeded(
  emitFn: (msg: unknown, transfer?: Transferable[]) => void = postWorkerMessage,
  force = false
): void {
  if (!matchManager || !physicsManager) return;
  const sig = computeRoomSyncSignature();
  if (!force && sig === lastSyncedRoomSignature) return;
  lastSyncedRoomSignature = sig;
  const summary = buildWorkerRoomStateSummary(matchManager, physicsManager);
  if (summary) {
    emitFn(createWorkerEnvelope(HOST_WORKER_MSG_TYPES.ROOM_STATE_SYNC, summary, 0));
  }
}

function tick(): void {
  if (!isRunning || !matchManager) return;
  const globalPayloadBytes = matchManager.lifecycle.stepFrame();
  syncWorkerRoomStateIfNeeded(postWorkerMessage, false);
  if (botPortBridge.botPort && matchManager.domain.externalBotTunnels) {
    botPortBridge.step(matchManager, sim, physicsManager, dataHandler, registerWorkerChannel);
  }
  if (globalPayloadBytes && globalPayloadBytes.length > 0 && dataHandler) {
    dataHandler.dispatchFrameToSessions(globalPayloadBytes);
  }
}

function startLoop(): void {
  if (isRunning) return;
  isRunning = true;
  lastTickTime = performance.now();
  accumulator = 0;

  const loop = () => {
    if (!isRunning) return;
    const now = performance.now();
    const dt = Math.min((now - lastTickTime) / 1000.0, 0.25);
    lastTickTime = now;
    accumulator += dt;

    while (accumulator >= fixedTimestep) {
      accumulator -= fixedTimestep;
      tick();
    }

    loopTimer = setTimeout(loop, 2);
  };

  loopTimer = setTimeout(loop, 0);
}

function stopLoop(): void {
  isRunning = false;
  if (loopTimer) {
    clearTimeout(loopTimer);
    loopTimer = null;
  }
}

export function getAuthoritativeWorkerState() {
  return {
    sim,
    physicsManager,
    inputBuffer,
    sessionManager,
    matchManager,
    dataHandler,
    isRunning,
  };
}

export async function handleAuthoritativeWorkerMessage(
  eventOrData: AuthoritativeWorkerIncomingEvent | MessageEvent<AuthoritativeWorkerIncomingEvent>,
  customPostMessage: ((msg: unknown, transfer?: Transferable[]) => void) | null = null
): Promise<void> {
  const raw: AuthoritativeWorkerIncomingEvent =
    eventOrData && 'data' in eventOrData && eventOrData.data !== undefined
      ? (eventOrData.data as AuthoritativeWorkerIncomingEvent)
      : ((eventOrData || {}) as AuthoritativeWorkerIncomingEvent);
  const { type, ...rest } = raw;
  const data: AuthoritativeWorkerIncomingEvent =
    raw.payload && typeof raw.payload === 'object' && !(raw.payload instanceof Uint8Array)
      ? { ...rest, ...raw.payload }
      : rest;
  const emit = customPostMessage || postWorkerMessage;

  const workerCtx: WorkerRouterContext = {
    sim: sim as unknown as AuthoritativePhysicsSimPort | null,
    physicsManager,
    sessionManager,
    matchManager,
    dataHandler,
    diagnosticsController,
    registerWorkerChannel,
    unregisterWorkerChannel,
    emit: (msg, transfer = []) => emit(msg, transfer),
    postEnvelope: (envelope, transfer = []) => emit(envelope, transfer),
  };

  if (
    type !== 'prewarm' &&
    type !== 'init' &&
    type !== HOST_WORKER_MSG_TYPES.WORKER_INIT &&
    type !== 'destroy' &&
    type !== HOST_WORKER_MSG_TYPES.WORKER_DESTROY &&
    type !== 'attach_bot_port' &&
    type !== 'detach_bot_port' &&
    routeProtocolMessageInWorker(workerCtx, raw as unknown as WorkerProtocolIncomingMessage)
  ) {
    if (workerCtx.diagnosticsController) {
      diagnosticsController = workerCtx.diagnosticsController;
    }
    if (type !== 'channel_packet' && type !== 'clientInput') {
      syncWorkerRoomStateIfNeeded(emit, false);
    }
    return;
  }

  switch (type) {
    case 'prewarm': {
      try {
        if (data.collisionData) {
          RocketSimPhysicsEngine.cachedCollisionData =
            data.collisionData as typeof RocketSimPhysicsEngine.cachedCollisionData;
        }
        await loadRocketSimWasmModule();
        emit({ type: 'prewarmed' });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        emit({ type: 'prewarm_error', error: errMsg });
      }
      break;
    }

    case 'attach_bot_port': {
      const eventPorts = eventOrData && 'ports' in eventOrData ? eventOrData.ports : undefined;
      const port = data.port || raw.port || eventPorts?.[0];
      if (port) {
        botPortBridge.attach(port, dataHandler, registerWorkerChannel);
      }
      break;
    }

    case 'detach_bot_port': {
      botPortBridge.detach();
      break;
    }

    case 'init':
    case HOST_WORKER_MSG_TYPES.WORKER_INIT: {
      try {
        const hostVisualId = data.hostVisualId || 'octane';
        const hostColorSlot = data.hostColorSlot ?? 0;
        sim = new RocketSimPhysicsEngine();
        await sim.init(data.wasmInitOptions || {});

        inputBuffer = new NetworkInputBuffer(MAX_INPUT_BUFFER_TICKS);
        physicsManager = new PhysicsEngineManager({
          sim: sim as unknown as AuthoritativePhysicsSimPort,
          inputBuffer,
        });
        sessionManager = new EstablishedSessionManager(physicsManager);
        matchManager = new MatchSessionAdmin({
          physicsManager: physicsManager as unknown as AdminPhysicsManagerPort,
          sessionManager,
          isHost: true,
          externalBotTunnels:
            data.externalBotTunnels !== undefined ? Boolean(data.externalBotTunnels) : true,
          roomId: data.roomId || 'local_room',
          gameMode: data.gameMode || '3v3',
          botFillMode: data.botFillMode || 'no_bots',
          matchDurationSeconds: data.durationSeconds ?? 300,
          maxOvertimeSeconds: data.maxOvertimeSeconds || 360,
          lobbyMode: Boolean(data.lobbyMode),
          skipReplayByDefault:
            data.skipReplayByDefault !== undefined ? Boolean(data.skipReplayByDefault) : false,
        });
        dataHandler = new NetworkDataHandler({
          matchManager,
          sessionManager,
          physicsManager,
        });
        matchManager.dataHandler = dataHandler;
        diagnosticsController =
          (matchManager.diagnosticsController as unknown as DiagnosticsTestVehicleController | null) ||
          null;

        physicsManager.registerCarEntity(0, 0, data.hostHitboxId || hostVisualId);
        const resolvedHostName =
          data.hostPlayerName && data.hostPlayerName !== 'Host'
            ? data.hostPlayerName
            : `Player${Math.floor(1000 + Math.random() * 9000)}`;
        matchManager.roster.assignPlayerSlot(
          'host',
          resolvedHostName,
          'player',
          0,
          {
            visualId: hostVisualId,
            hitboxId: data.hostHitboxId || null,
            colorSlot: hostColorSlot,
            blueColorSlot: data.hostBlueColorSlot ?? null,
            orangeColorSlot: data.hostOrangeColorSlot ?? null,
            paintFinish: data.hostPaintFinish || 'metallic',
            boostVisual: data.hostBoostVisual || 'cartoon',
            boostAudio: data.hostBoostAudio || 'rush',
          },
          hostColorSlot
        );
        registerWorkerChannel('host');

        if (data.isBotMatch || (data.numCars ?? 0) >= 2) {
          const rolledBot = matchManager.roster.rollBotLoadoutForTeam(1);
          const botVisualId = data.botVisualId || rolledBot.visualId;
          physicsManager.registerCarEntity(1, 1, String(rolledBot.hitboxId || botVisualId));
          if (data.isBotMatch) {
            physicsManager.setDirectCarControls(1, {
              throttle: 0,
              steer: 0,
              pitch: 0,
              yaw: 0,
              roll: 0,
              jump: false,
              boost: false,
              handbrake: false,
            });
          }
          matchManager.roster.assignPlayerSlot(
            'bot',
            data.botPlayerName || 'AI Bot',
            'player',
            1,
            { ...rolledBot, visualId: botVisualId },
            rolledBot.colorSlot
          );
        }

        if (data.initialState) {
          sim.restoreState(data.initialState);
        }

        if (data.startAsMatch) {
          matchManager.lifecycle.startMatch(data.durationSeconds);
        } else if (data.lobbyMode) {
          matchManager.lifecycle.enterLobbyMode(data.lobbyOptions || data);
        } else {
          matchManager.lifecycle.startTrainingMode({
            ...(data.trainingOptions || {}),
            initialState: data.initialState,
            resetKickoff: !data.initialState && data.resetKickoff !== false,
          });
        }

        if (data.autoStartLoop !== false) {
          startLoop();
        }

        const snap = sim.saveCompactState ? sim.saveCompactState() : sim.saveState();
        const tickCount = Math.floor(sim.getHeaderView().tickCount);
        const roomSummary = buildWorkerRoomStateSummary(matchManager, physicsManager);
        lastSyncedRoomSignature = computeRoomSyncSignature();

        emit({
          type: 'initialized',
          result: { snapshot: snap, tickCount, roomState: roomSummary },
        });
        emit(
          createWorkerEnvelope(
            HOST_WORKER_MSG_TYPES.WORKER_READY,
            { snapshot: snap, tickCount, roomState: roomSummary },
            raw.seq || 0
          )
        );
      } catch (err: unknown) {
        console.error('[AuthoritativeServerWorker] Init failed:', err);
        const errMsg = err instanceof Error ? err.message : String(err);
        emit({ type: 'error', error: errMsg });
      }
      break;
    }

    case 'destroy':
    case HOST_WORKER_MSG_TYPES.WORKER_DESTROY: {
      stopLoop();
      botPortBridge.detach();
      matchManager?.destroy();
      sessionManager?.destroy();
      dataHandler?.destroy();
      sim = null;
      physicsManager = null;
      inputBuffer = null;
      sessionManager = null;
      matchManager = null;
      dataHandler = null;
      diagnosticsController = null;
      lastSyncedRoomSignature = '';
      break;
    }

    default:
      break;
  }
}

if (typeof self !== 'undefined') {
  self.onmessage = (event: MessageEvent) => handleAuthoritativeWorkerMessage(event);
}
