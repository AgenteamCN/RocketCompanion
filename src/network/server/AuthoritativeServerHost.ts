import {
  createBoostPadEdgeTracker,
  type BoostPadEdgeTracker,
} from '../protocol/boostPadBitmaskPipeline.ts';
import type { CarControlsInput } from '../protocol/GlobalPayloadCodec.ts';
import { createHostSimProxy, type HostSimRestoreStateResult } from './HostSimProxy.ts';
import { createDefaultHostChannel } from './HostLoopbackChannel.ts';
import {
  HOST_WORKER_MSG_TYPES as MSG,
  createWorkerEnvelope,
  type WorkerEnvelope,
} from '../protocol/HostWorkerProtocol.ts';
import type { WorkerRoomStateSummary } from './HostWorkerMessageRouter.ts';
import {
  HostServerFallbackSubController,
  spawnAuthoritativeWorkerWithRetry,
  prewarmAuthoritativeServerWorker,
} from './HostServerFallbackSubController.ts';
import {
  HostClientChannelRegistry,
  applyAuthoritativeHostSyncedSnapshot,
  buildNotifyPlayerJoinedPayload,
  normalizeHostLoadoutCommandPayload,
  resolveAuthoritativeHostConstructorArgs,
  syncHostReplayBufferBeforeEnvelope,
  type AuthoritativeServerHostOptions,
  type HostClientChannelPort,
  type HostWorkerEnvelopeMessage,
} from './HostClientChannelRegistry.ts';
import { createBotTunnelHostPort } from './hostLoopbackFrameDecodePipeline.ts';
import { ReplayRingBuffer, REPLAY_BUFFER_MODES as RBM } from '../../replay/ReplayRingBuffer.ts';
import { BotTunnelManager, prewarmBotInferenceWorker } from '../bot/BotTunnelManager.ts';
import { yieldIdleSlice } from '../../loader/frameBudgetScheduler.ts';
import type { ArenaHeaderView } from '../../physics/RocketSimStateViews.ts';
import type { ExtraLoadoutConfig } from './match/matchLoadoutAndSpawnPipeline.ts';
import type { AuthoritativePhysicsSimPort } from './authoritativePhysicsStepPipeline.ts';

export type { AuthoritativeServerHostOptions, HostClientChannelPort, HostWorkerEnvelopeMessage };

export class AuthoritativeServerHost {
  static async prewarmWorkers(): Promise<{ serverWorker: boolean; botWorker: boolean }> {
    const serverWorker = await prewarmAuthoritativeServerWorker().catch(() => false);
    await yieldIdleSlice(24);
    const botWorker = await prewarmBotInferenceWorker().catch(() => false);
    return { serverWorker, botWorker };
  }

  options: AuthoritativeServerHostOptions;
  channelRegistry: HostClientChannelRegistry;
  isWorker: boolean;
  worker: Worker | null = null;
  botTunnelManager: BotTunnelManager;
  fallbackSubController = new HostServerFallbackSubController();
  active = false;
  cachedSnapshot = new Float32Array(448);
  boostPadEdgeTracker: BoostPadEdgeTracker = createBoostPadEdgeTracker();
  hostReplayRingBuffer: ReplayRingBuffer;
  lastServerTick = 0;
  lastGoal = 0;
  lastRoomState: Partial<WorkerRoomStateSummary> | null = null;
  headerViewInstance: ArenaHeaderView | null = null;
  sim: ReturnType<typeof createHostSimProxy>;
  _seenReplaySignalIds = new Set<string>();
  _loggedFallbackSend?: boolean;

  constructor(
    ch: HostClientChannelPort | AuthoritativeServerHostOptions | null = null,
    opts: AuthoritativeServerHostOptions = {}
  ) {
    const resolved = resolveAuthoritativeHostConstructorArgs(ch, opts);
    this.options = resolved.options;
    this.isWorker = typeof Worker !== 'undefined' && !this.options.forceFallback;
    this.botTunnelManager = new BotTunnelManager(createBotTunnelHostPort(this), {
      forceInProcess: Boolean(this.options.forceFallback),
    });
    this.hostReplayRingBuffer = new ReplayRingBuffer({
      mode: this.options.startAsMatch ? RBM.COUNTDOWN_MATCH : RBM.COUNTUP_FIFO,
      capacityTicks: this.options.replayCapacityTicks ?? undefined,
    });
    this.sim = createHostSimProxy(this);
    const initialChannel = resolved.channel || createDefaultHostChannel(this);
    this.channelRegistry = new HostClientChannelRegistry(initialChannel);
  }

  get fallbackSim(): AuthoritativePhysicsSimPort | null {
    return this.fallbackSubController.sim as unknown as AuthoritativePhysicsSimPort | null;
  }
  get fallbackPhysics() {
    return this.fallbackSubController.physicsManager;
  }
  get fallbackManager() {
    return this.fallbackSubController.matchManager;
  }
  get fallbackDataHandler() {
    return this.fallbackSubController.dataHandler;
  }
  get hostChannel(): HostClientChannelPort {
    return this.channelRegistry.hostChannel;
  }
  get channel(): HostClientChannelPort {
    return this.channelRegistry.hostChannel;
  }
  set channel(ch: HostClientChannelPort) {
    if (ch && ch !== this.channelRegistry.hostChannel) {
      this.channelRegistry.hostChannel = ch;
      this.addClientChannel(ch, 'host');
    }
  }

  async init(): Promise<this> {
    if (!this.isWorker) {
      return this._initFallback();
    }
    await spawnAuthoritativeWorkerWithRetry({
      options: this.options,
      getWorker: () => this.worker,
      setWorker: (w) => {
        this.worker = w;
      },
      onMessage: (d) =>
        this.channelRegistry.handleWorkerMessage(this, d as HostWorkerEnvelopeMessage),
      sendInitEnvelope: (p) => this.sendEnvelope(MSG.WORKER_INIT, p),
      onWorkerReady: (r) =>
        applyAuthoritativeHostSyncedSnapshot(this, r.snapshot, r.tickCount, r.roomState),
      onFallbackToMainThread: async () => {
        this.isWorker = false;
        await this._initFallback();
      },
    });
    return this;
  }

  async _initFallback(): Promise<this> {
    const res = await this.fallbackSubController.init(
      this.options,
      this.channelRegistry.hostChannel
    );
    applyAuthoritativeHostSyncedSnapshot(this, res.snapshot, res.serverTick, res.roomState);
    return this;
  }

  sendEnvelope(
    type: string,
    payload: AuthoritativeServerHostOptions = {},
    transfer: Transferable[] = [],
    seqOverride: number | null = null
  ): WorkerEnvelope {
    syncHostReplayBufferBeforeEnvelope(this, type, payload);
    const seq = seqOverride ?? ++this.channelRegistry.reqId;
    const envelope = createWorkerEnvelope(type, payload, seq);
    if (this.isWorker && this.worker) {
      this.worker.postMessage(envelope, transfer);
    } else {
      this.fallbackSubController.routeEnvelope(envelope, (replyEnv) =>
        this.channelRegistry.handleWorkerMessage(this, replyEnv)
      );
    }
    return envelope;
  }

  _postCommand(
    type: string,
    data: Record<string, unknown> = {},
    transfer: Transferable[] = []
  ): void {
    if (this.isWorker && this.worker) {
      this.worker.postMessage({ type, ...data }, transfer);
    } else {
      this.fallbackSubController.routeEnvelope(createWorkerEnvelope(type, data, 0), (r) =>
        this.channelRegistry.handleWorkerMessage(this, r)
      );
    }
  }

  _sendRequest(
    type: string,
    data: Record<string, unknown> = {}
  ): Promise<HostSimRestoreStateResult> {
    const { reqId, promise } = this.channelRegistry.allocatePendingRequest(
      (val) => (val || {}) as HostSimRestoreStateResult
    );
    this._postCommand(type, { reqId, ...data });
    return promise;
  }

  addClientChannel(
    ch: HostClientChannelPort | null | undefined,
    id: string | null = null
  ): string | null {
    return this.channelRegistry.addClientChannel(
      ch,
      id,
      this.isWorker,
      this.worker,
      (t, d) => this._postCommand(t, d),
      this.fallbackDataHandler
    );
  }

  ensureCar(carIndex: number, team = 1, visualId = 'octane'): void {
    this._postCommand('ensureCar', { carIndex, team, visualId });
  }
  removeCar(carIndex: number): void {
    this._postCommand('removeCar', { carIndex });
  }
  setCarControls(carIndex: number, controls: CarControlsInput): void {
    this._postCommand('setCarControls', { carIndex, controls });
  }
  pauseMatch(paused = true): void {
    this._postCommand('pauseMatch', { paused: Boolean(paused) });
  }
  notifyPlayerJoined(...args: Parameters<typeof buildNotifyPlayerJoinedPayload>): void {
    this._postCommand('notifyPlayerJoined', buildNotifyPlayerJoinedPayload(...args));
  }
  forceStartMatch(durationSeconds?: number): void {
    syncHostReplayBufferBeforeEnvelope(this, MSG.MATCH_START_REQUEST, {});
    this._postCommand('forceStartMatch', { durationSeconds });
  }
  setGameMode(gameMode: string, durationSeconds: number | null = null): void {
    this._postCommand('setGameMode', { gameMode, durationSeconds });
  }
  setBotFillMode(botFillMode: string, botType?: string): void {
    this._postCommand('setBotFillMode', { botFillMode, botType });
  }
  addBotPlayer(
    team = 1,
    botName: string | null = null,
    visualId: string | ExtraLoadoutConfig = 'octane',
    botType?: string
  ): void {
    this._postCommand('addBotPlayer', { team, botName, visualId, botType });
  }
  setLoadout(...args: Parameters<typeof normalizeHostLoadoutCommandPayload>): void {
    this._postCommand('setLoadout', normalizeHostLoadoutCommandPayload(...args));
  }
  switchRoleTeam(sessionId: string | null, role: string, team: number): void {
    this._postCommand('switchRoleTeam', { sessionId, role, team });
  }

  startTrainingMode(opts: AuthoritativeServerHostOptions = {}): void {
    this.hostReplayRingBuffer?.configureMode?.(RBM.COUNTUP_FIFO, opts.replayCapacityTicks || null);
    this._postCommand('startTrainingMode', opts);
  }

  configureTrainingRuleset(opts: AuthoritativeServerHostOptions = {}): void {
    if (typeof opts.fifoDurationSeconds === 'number' && opts.fifoDurationSeconds > 0) {
      this.hostReplayRingBuffer?.configureMode(
        RBM.COUNTUP_FIFO,
        Math.round(opts.fifoDurationSeconds * 120)
      );
    }
    this._postCommand('configureTrainingRuleset', opts);
  }

  enterStateOnlyMode(s?: Float32Array | number[] | null, cursorTick?: number): void {
    this._postCommand('enterStateOnlyMode', {
      stateSnapshot: s ? Array.from<number>(s) : null,
      cursorTick,
    });
  }
  beginInterveneCountdown(countdownSeconds = 3, s?: Float32Array | number[] | null): void {
    this._postCommand('beginInterveneCountdown', {
      countdownSeconds,
      stateSnapshot: s ? Array.from<number>(s) : null,
    });
  }
  resumePhysicsFromState(s?: Float32Array | number[] | null, resumeTick?: number): void {
    this._postCommand('resumePhysicsFromState', {
      stateSnapshot: s ? Array.from<number>(s) : null,
      resumeTick,
    });
  }

  setLobbyMode(enabled = true, opts: AuthoritativeServerHostOptions = {}): WorkerEnvelope {
    if (enabled) {
      this.hostReplayRingBuffer?.configureMode?.(
        RBM.COUNTUP_FIFO,
        opts.replayCapacityTicks || null
      );
    }
    return this.sendEnvelope(MSG.LOBBY_MODE_SET, { enabled: Boolean(enabled), ...opts });
  }

  enterLobbyMode(opts: AuthoritativeServerHostOptions = {}): WorkerEnvelope {
    return this.setLobbyMode(true, { forceEnterLobby: true, ...opts });
  }

  setGhostCarConfig(
    carIndex: number,
    interactWithBall = false,
    interactWithCars = false,
    opacity?: number
  ): WorkerEnvelope {
    return this.sendEnvelope(MSG.GHOST_CAR_CONFIG, {
      carIndex,
      interactWithBall: Boolean(interactWithBall),
      interactWithCars: Boolean(interactWithCars),
      opacity,
    });
  }

  requestFullReplayExport(): Promise<unknown> {
    const { reqId, promise } = this.channelRegistry.allocatePendingRequest();
    this.sendEnvelope(MSG.REPLAY_FULL_EXPORT_REQUEST, { reqId }, [], reqId);
    return promise;
  }

  configureDiagnosticFleet(enabled = true, anchorMode = 'z_hover'): void {
    this._postCommand('configureDiagnosticFleet', { enabled: Boolean(enabled), anchorMode });
  }

  update(): void {
    if (!this.isWorker) {
      const res = this.fallbackSubController.step();
      if (res) {
        applyAuthoritativeHostSyncedSnapshot(
          this,
          res.snapshot,
          res.serverTick,
          res.roomState,
          res.matchState
        );
      }
    }
  }

  destroy(): void {
    this.active = false;
    this.botTunnelManager?.destroy?.();
    if (this.isWorker && this.worker) {
      this.sendEnvelope(MSG.WORKER_DESTROY, {});
      try {
        this.worker.terminate();
      } catch (err) {
        console.warn('[HostServerWorker] Error terminating worker:', err);
      }
      this.worker = null;
    }
    this.fallbackSubController.destroy();
    this.channelRegistry.destroy();
  }
}

export default AuthoritativeServerHost;
