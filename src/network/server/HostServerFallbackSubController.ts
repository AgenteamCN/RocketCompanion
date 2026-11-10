import { RocketSimPhysicsEngine } from '../../physics/RocketSimPhysicsEngine.ts';
import { PhysicsEngineManager } from './PhysicsEngineManager.ts';
import { NetworkInputBuffer, MAX_INPUT_BUFFER_TICKS } from './NetworkInputBuffer.ts';
import { EstablishedSessionManager } from './EstablishedSessionManager.ts';
import { MatchSessionAdmin, type AdminPhysicsManagerPort } from './match/MatchSessionAdmin.ts';
import { NetworkDataHandler } from './NetworkDataHandler.ts';
import { deliverToHostLoopback, type HostLoopbackChannelPort } from './HostLoopbackChannel.ts';
import { HOST_WORKER_MSG_TYPES, type WorkerEnvelope } from '../protocol/HostWorkerProtocol.ts';
import {
  buildWorkerRoomStateSummary,
  routeProtocolMessageInWorker,
  type WorkerRoomStateSummary,
  type HostWorkerInitOptions,
  type WorkerProtocolIncomingMessage,
} from './HostWorkerMessageRouter.ts';
import {
  retainCompletedMatchReplayAndNotify,
  clearRetainedMatchReplayOnMatchStart,
} from '../../replay/ReplayFileExporter.ts';
import type { AuthoritativePhysicsSimPort } from './authoritativePhysicsStepPipeline.ts';

export type { HostWorkerInitOptions };

export interface FallbackStepResult {
  snapshot: Float32Array;
  serverTick: number;
  roomState: WorkerRoomStateSummary | null;
  matchState: string;
}

export function buildWorkerInitEnvelopePayload(
  options: HostWorkerInitOptions
): HostWorkerInitOptions {
  const cachedCollision =
    options.wasmInitOptions?.collisionData ||
    RocketSimPhysicsEngine.cachedCollisionData ||
    undefined;
  return {
    roomId: options.roomId || 'local_room',
    gameMode: options.gameMode || '3v3',
    botFillMode: options.botFillMode || 'no_bots',
    defaultBotType: (options.defaultBotType || options.botType) as string | undefined,
    externalBotTunnels: true,
    initialState: options.initialState,
    wasmInitOptions: cachedCollision
      ? { ...(options.wasmInitOptions || {}), collisionData: cachedCollision }
      : options.wasmInitOptions,
    hostPlayerName:
      options.hostPlayerName && options.hostPlayerName !== 'Host'
        ? options.hostPlayerName
        : `Player${Math.floor(1000 + Math.random() * 9000)}`,
    hostVisualId: options.hostVisualId || 'octane',
    hostHitboxId: options.hostHitboxId || null,
    hostColorSlot: options.hostColorSlot ?? 0,
    hostPaintFinish: options.hostPaintFinish || 'matte',
    hostBoostVisual: options.hostBoostVisual || 'cartoon',
    hostBoostAudio: options.hostBoostAudio || 'rush',
    isBotMatch: Boolean(options.isBotMatch),
    botPlayerName: options.botPlayerName || 'AI Bot',
    botVisualId: options.botVisualId || 'octane',
    numCars: options.numCars || (options.isBotMatch ? 2 : 1),
    startAsMatch: Boolean(options.startAsMatch),
    lobbyMode: Boolean(options.lobbyMode),
    lobbyOptions: options.lobbyOptions || null,
    durationSeconds: options.durationSeconds ?? 300,
    skipReplayByDefault:
      options.skipReplayByDefault !== undefined ? Boolean(options.skipReplayByDefault) : false,
    trainingOptions: options.trainingOptions || null,
  };
}

let prewarmedServerWorker: Worker | null = null;
let prewarmServerWorkerPromise: Promise<boolean> | null = null;

/**
 * Pre-spawns an idle AuthoritativeServerWorker and warms its TypeScript module graph,
 * RocketSim WASM instance, and arena collision mesh cache in the background right after
 * Free Play starts, eliminating on-demand module/WASM/mesh requests when hosting a server.
 */
export function prewarmAuthoritativeServerWorker(): Promise<boolean> {
  if (typeof Worker === 'undefined') return Promise.resolve(false);
  if (prewarmedServerWorker) return Promise.resolve(true);
  if (prewarmServerWorkerPromise) return prewarmServerWorkerPromise;

  prewarmServerWorkerPromise = new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean, worker: Worker | null) => {
      if (settled) return;
      settled = true;
      prewarmServerWorkerPromise = null;
      if (ok && worker) prewarmedServerWorker = worker;
      else {
        try {
          worker?.terminate();
        } catch (_e) {}
      }
      resolve(ok);
    };

    try {
      const worker = new Worker(new URL('./AuthoritativeServerWorker.ts', import.meta.url), {
        type: 'module',
      });
      const timer = setTimeout(() => {
        worker.removeEventListener('message', onMsg);
        finish(false, worker);
      }, 15000);

      const onMsg = (ev: MessageEvent) => {
        const t = ev?.data?.type;
        if (t === 'prewarmed' || t === 'prewarm_error') {
          clearTimeout(timer);
          worker.removeEventListener('message', onMsg);
          finish(t === 'prewarmed', worker);
        }
      };

      worker.addEventListener('message', onMsg);
      worker.onerror = () => {
        clearTimeout(timer);
        worker.removeEventListener('message', onMsg);
        finish(false, worker);
      };

      worker.postMessage({
        type: 'prewarm',
        collisionData: RocketSimPhysicsEngine.cachedCollisionData || undefined,
      });
    } catch (_err) {
      finish(false, null);
    }
  });

  return prewarmServerWorkerPromise;
}

export interface WorkerReadyResult {
  snapshot?: Float32Array | number[] | null;
  tickCount?: number;
  roomState?: WorkerRoomStateSummary | null;
  [key: string]: unknown;
}

export interface WorkerSpawnCallbacks {
  options: HostWorkerInitOptions;
  getWorker: () => Worker | null;
  setWorker: (w: Worker | null) => void;
  onMessage: (data: unknown) => void;
  sendInitEnvelope: (payload: HostWorkerInitOptions) => void;
  onWorkerReady: (res: WorkerReadyResult) => void;
  onFallbackToMainThread: (err: unknown) => Promise<void>;
}

export function spawnAuthoritativeWorkerWithRetry(cb: WorkerSpawnCallbacks): Promise<void> {
  const maxAttempts = 3;
  return new Promise((resolve, reject) => {
    let settled = false;
    let attempt = 0;

    const fallback = (err: unknown) => {
      if (settled) return;
      settled = true;
      console.warn(
        '[HostServerWorker] Worker initialization failed after retries, falling back to in-memory:',
        err
      );
      try {
        cb.getWorker()?.terminate();
      } catch (_e) {}
      cb.setWorker(null);
      cb.onFallbackToMainThread(err).then(resolve).catch(reject);
    };

    const trySpawn = () => {
      if (settled) return;
      attempt++;
      try {
        try {
          cb.getWorker()?.terminate();
        } catch (_e) {}
        cb.setWorker(null);

        let workerInstance: Worker;
        if (attempt === 1 && prewarmedServerWorker) {
          workerInstance = prewarmedServerWorker;
          prewarmedServerWorker = null;
        } else {
          workerInstance = new Worker(new URL('./AuthoritativeServerWorker.ts', import.meta.url), {
            type: 'module',
          });
        }
        cb.setWorker(workerInstance);
        workerInstance.onmessage = (event) => cb.onMessage(event.data);

        const handleInitFailure = (err: unknown) => {
          if (settled || cb.getWorker() !== workerInstance) return;
          if (attempt < maxAttempts) {
            console.warn(
              `[HostServerWorker] Worker bootstrap error on attempt ${attempt}/${maxAttempts}, retrying in 150ms...`,
              err
            );
            setTimeout(trySpawn, 150 * attempt);
          } else {
            fallback(err);
          }
        };

        workerInstance.onerror = (err) => {
          if (!settled) {
            err?.preventDefault?.();
            handleInitFailure(err);
          } else {
            console.error('[HostServerWorker] Runtime worker error:', err);
          }
        };

        const initListener = (event: MessageEvent) => {
          const msg = event.data;
          if (
            !settled &&
            (msg?.type === 'initialized' || msg?.type === HOST_WORKER_MSG_TYPES.WORKER_READY)
          ) {
            settled = true;
            cb.onWorkerReady(msg.result || msg.payload || {});
            workerInstance.removeEventListener('message', initListener);
            resolve();
          } else if (!settled && msg?.type === 'error') {
            workerInstance.removeEventListener('message', initListener);
            handleInitFailure(new Error(msg.error));
          }
        };

        workerInstance.addEventListener('message', initListener);
        cb.sendInitEnvelope(buildWorkerInitEnvelopePayload(cb.options));
      } catch (err) {
        fallback(err);
      }
    };

    trySpawn();
  });
}

export class HostServerFallbackSubController {
  sim: RocketSimPhysicsEngine | null = null;
  inputBuffer: NetworkInputBuffer | null = null;
  physicsManager: PhysicsEngineManager | null = null;
  sessionManager: EstablishedSessionManager | null = null;
  matchManager: MatchSessionAdmin | null = null;
  dataHandler: NetworkDataHandler | null = null;

  async init(
    options: HostWorkerInitOptions,
    hostChannel: HostLoopbackChannelPort | null
  ): Promise<FallbackStepResult> {
    console.warn(
      '[HostServerWorker:Fallback] Operating in synchronous main-thread fallback mode (WebWorker disabled)'
    );
    const hostVisualId = options.hostVisualId || 'octane';
    const hostColorSlot = options.hostColorSlot ?? 0;

    this.sim = new RocketSimPhysicsEngine();
    const wasmInitOpts = { ...(options.wasmInitOptions || {}), isolated: true };
    if (!wasmInitOpts.collisionData && RocketSimPhysicsEngine.cachedCollisionData) {
      wasmInitOpts.collisionData = RocketSimPhysicsEngine.cachedCollisionData;
    }
    await this.sim.init(wasmInitOpts);
    this.inputBuffer = new NetworkInputBuffer(MAX_INPUT_BUFFER_TICKS);
    this.physicsManager = new PhysicsEngineManager({
      sim: this.sim as unknown as AuthoritativePhysicsSimPort,
      inputBuffer: this.inputBuffer,
    });
    this.sessionManager = new EstablishedSessionManager(this.physicsManager);
    this.matchManager = new MatchSessionAdmin({
      physicsManager: this.physicsManager as unknown as AdminPhysicsManagerPort,
      sessionManager: this.sessionManager,
      isHost: true,
      externalBotTunnels: true,
      roomId: options.roomId || 'local_room',
      gameMode: options.gameMode || '3v3',
      botFillMode: options.botFillMode || 'no_bots',
      defaultBotType: (options.defaultBotType || options.botType || 'nexto') as string,
      matchDurationSeconds: options.durationSeconds ?? 300,
      lobbyMode: Boolean(options.lobbyMode),
      skipReplayByDefault:
        options.skipReplayByDefault !== undefined ? Boolean(options.skipReplayByDefault) : false,
      onClearRetainedReplay: clearRetainedMatchReplayOnMatchStart,
      onRetainCompletedReplay: retainCompletedMatchReplayAndNotify,
    });
    this.dataHandler = new NetworkDataHandler({
      matchManager: this.matchManager,
      sessionManager: this.sessionManager,
      physicsManager: this.physicsManager,
    });
    this.matchManager.dataHandler = this.dataHandler;

    this.physicsManager.registerCarEntity(0, 0, options.hostHitboxId || hostVisualId);
    this.matchManager.roster.assignPlayerSlot(
      'host',
      options.hostPlayerName && options.hostPlayerName !== 'Host'
        ? options.hostPlayerName
        : `Player${Math.floor(1000 + Math.random() * 9000)}`,
      'player',
      0,
      {
        visualId: hostVisualId,
        hitboxId: options.hostHitboxId || null,
        colorSlot: hostColorSlot,
        blueColorSlot: options.hostBlueColorSlot ?? null,
        orangeColorSlot: options.hostOrangeColorSlot ?? null,
        paintFinish: options.hostPaintFinish || 'metallic',
        boostVisual: options.hostBoostVisual || 'cartoon',
        boostAudio: options.hostBoostAudio || 'rush',
      },
      hostColorSlot
    );

    if (options.isBotMatch || (options.numCars ?? 0) >= 2) {
      const rolledBot = this.matchManager.roster.rollBotLoadoutForTeam(1);
      const botVisualId = options.botVisualId || rolledBot.visualId;
      this.physicsManager.registerCarEntity(1, 1, String(rolledBot.hitboxId || botVisualId));
      if (options.isBotMatch) {
        this.physicsManager.setDirectCarControls(1, {
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
      this.matchManager.roster.assignPlayerSlot(
        'bot',
        options.botPlayerName || 'AI Bot',
        'player',
        1,
        { ...rolledBot, visualId: botVisualId },
        rolledBot.colorSlot
      );
    }

    this.dataHandler.registerChannel('host', {
      send: (packet) => deliverToHostLoopback(hostChannel, packet),
    });

    if (options.initialState) this.sim.restoreState(options.initialState);

    if (options.startAsMatch) {
      this.matchManager.lifecycle.startMatch(options.durationSeconds);
    } else if (options.lobbyMode) {
      this.matchManager.lifecycle.enterLobbyMode(options.lobbyOptions || options);
    } else {
      this.matchManager.lifecycle.startTrainingMode({
        ...(options.trainingOptions || {}),
        initialState: options.initialState,
        resetKickoff: !options.initialState && options.resetKickoff !== false,
      });
    }

    const snap =
      typeof this.sim.saveCompactState === 'function'
        ? this.sim.saveCompactState()
        : this.sim.saveState();
    const serverTick = Math.floor(this.sim.getHeaderView().tickCount);
    const roomState = buildWorkerRoomStateSummary(this.matchManager, this.physicsManager);
    return { snapshot: snap, serverTick, roomState, matchState: this.matchManager.lifecycle.state };
  }

  step(): FallbackStepResult | null {
    if (!this.matchManager || !this.dataHandler || !this.sim) return null;
    const globalPayloadBytes = this.matchManager.lifecycle.stepFrame();
    if (globalPayloadBytes && globalPayloadBytes.length > 0) {
      this.dataHandler.dispatchFrameToSessions(globalPayloadBytes);
    }
    const snap =
      typeof this.sim.saveCompactState === 'function'
        ? this.sim.saveCompactState()
        : this.sim.saveState();
    const serverTick = Math.floor(this.sim.getHeaderView().tickCount);
    const roomState = buildWorkerRoomStateSummary(this.matchManager, this.physicsManager);
    return { snapshot: snap, serverTick, roomState, matchState: this.matchManager.lifecycle.state };
  }

  routeEnvelope(
    envelope: WorkerEnvelope,
    onReplyEnvelope: (replyEnv: WorkerEnvelope) => void
  ): boolean {
    if (!this.matchManager) return false;
    return routeProtocolMessageInWorker(
      {
        sim: this.sim as unknown as AuthoritativePhysicsSimPort,
        physicsManager: this.physicsManager,
        sessionManager: this.sessionManager,
        matchManager: this.matchManager,
        dataHandler: this.dataHandler,
        postEnvelope: onReplyEnvelope,
      },
      envelope as unknown as WorkerProtocolIncomingMessage
    );
  }

  destroy(): void {
    if (this.matchManager) {
      this.matchManager.destroy();
      this.sessionManager?.destroy();
      this.dataHandler?.destroy();
      this.physicsManager = null;
      this.inputBuffer = null;
      this.sessionManager = null;
      this.matchManager = null;
      this.dataHandler = null;
      this.sim = null;
    }
  }
}
