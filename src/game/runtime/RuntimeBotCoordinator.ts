import { getTeamAssignment } from '../../physics/RocketSimMeshLoader.ts';
import { CAR_COLOR_SLOTS, resolveVehicleHitboxId } from '../../ui-core/config/vehicleConstants.ts';
import {
  garageSettingsStore,
  getPreferredColorSlot,
  loadStoredColorPrefs,
} from '../../ui-core/config/vehiclePresets.ts';
import { botSettingsStore } from '../../ui-core/config/trainingDefaults.ts';
import { preloadKickoffPPOWeights } from '../../ai/kickoffPPOWeights.ts';
import { preloadKickoffV1BestWeights } from '../../ai/KickoffV2SafeTensorsAgent.ts';
import { preloadGroundReachabilityLut } from '../../entities/reachability/groundReachabilityLut.ts';
import { ensureExperimentalEngine } from '../../ai/experimental/ExperimentalBotAgent.ts';
import { BOTPACK_9700488_POLICIES } from '../../ai/experimental/botpack9700488Specs.ts';
import { ensureWasmSimdMatVec } from '../../ai/experimental/wasmSimdMatVec.ts';
import { AuthoritativeServerHost } from '../../network/server/AuthoritativeServerHost.ts';
import { NEUTRAL_CAR_CONTROLS } from '../../network/client/PredictionHistoryBuffer.ts';
import { yieldIdleSlice } from '../../loader/frameBudgetScheduler.ts';
import { networkDiagnosticsStore, hudStore, useAppStore } from '../runtimeUiPort.ts';
import type { RocketSimPhysicsEngine } from '../../physics/RocketSimPhysicsEngine.ts';
import type { RuntimeMatchState } from './RuntimeMatchState.ts';
import type { ArenaWorld } from '../../entities/ArenaWorld.ts';
import type { PhysicsStateInterpolator } from '../../physics/PhysicsStateInterpolator.ts';
import type { CarControlsInput } from '../../network/protocol/GlobalPayloadCodec.ts';
import type { RuntimeNetworkManager } from './RuntimeNetworkManager.ts';
import type { NetworkSessionChannelLike } from './onlineLobbyTransitionPipeline.ts';

export const BOT_CAR_INDEX = 1;

export interface BotAgentLike {
  id?: string;
  name?: string;
  option: { name?: string; tickSkip: number; [key: string]: unknown };
  preloadAll(
    onProgress?: ((completed?: number, total?: number, name?: string) => void) | null
  ): Promise<unknown>;
  getKickoffControls?(state: unknown, step: number): CarControlsInput | null | undefined;
  overrideControls?(controls: CarControlsInput): void;
  decide(
    state: unknown,
    pads?: unknown,
    carIndex?: number,
    team?: number
  ): Promise<CarControlsInput>;
  reset(): void;
  select(botId: string): void;
  load(): Promise<unknown>;
  setDifficulty?(diff: string): void;
  setCarIndex?(idx: number): void;
  setTeam?(team: number): void;
  destroy?(): void;
}

export interface RuntimeBotCoordinatorHostPort {
  bot: BotAgentLike | null;
  readonly physics: RocketSimPhysicsEngine | null;
  readonly match: RuntimeMatchState | null;
  readonly arena: ArenaWorld | null;
  readonly interpolator: PhysicsStateInterpolator | null;
  readonly trainingOptions: { boostOption?: string; [key: string]: unknown } | null;
  readonly audioSubsystem: {
    resetMatchClockTracking(durationSeconds?: number): void;
    resetAudio(): void;
  } | null;
  readonly networkManager: RuntimeNetworkManager | null;
  readonly loadoutCoordinator?: {
    restoreLocalPlayerFreeplayLoadout(carIndex?: number): void;
  } | null;
  playerCarIndex: number;
  matchDurationSeconds: number;
  resetKickoff(seed?: number): void;
}

/**
 * RuntimeBotCoordinator
 * Stateful SubController owning single-player bot AI state, decision scheduling,
 * authoritative bot control stepping, and local bot match lifecycle.
 */
export class RuntimeBotCoordinator {
  public readonly runtime: RuntimeBotCoordinatorHostPort;
  public botControls: CarControlsInput;
  public botTickSkip = 0;
  public isBotDeciding = false;
  public botDecisionEpoch = 0;
  public botKickoffStep = 0;
  public isBotPaused = false;
  public isBotMatch = false;

  constructor(runtime: RuntimeBotCoordinatorHostPort) {
    this.runtime = runtime;
    this.botControls = { ...NEUTRAL_CAR_CONTROLS };
  }

  public async setupBot(
    onProgress: ((completed?: number, total?: number, name?: string) => void) | null = null
  ): Promise<void> {
    const botpackIds = BOTPACK_9700488_POLICIES.map((p) => p.id);
    const totalSteps = 6 + botpackIds.length;
    let completedSteps = 0;
    const report = (label: string) => {
      completedSteps++;
      onProgress?.(completedSteps, totalSteps, label);
    };
    const runStep = async (
      factory: () => Promise<unknown>,
      label: string,
      description: string
    ): Promise<void> => {
      await yieldIdleSlice(20);
      try {
        await factory();
      } catch (err: unknown) {
        console.warn(`[GameRuntime] ${description} preload deferred or failed:`, err);
      }
      report(label);
    };

    await ensureWasmSimdMatVec().catch(() => false);

    await runStep(
      () => AuthoritativeServerHost.prewarmWorkers(),
      'server_and_bot_workers',
      'Worker prewarm'
    );
    await runStep(
      () => preloadGroundReachabilityLut(),
      'ground_reachability_lut',
      'Ground reachability LUT'
    );
    await runStep(() => preloadKickoffPPOWeights(), 'ko_v1', 'Kickoff v1 PPO weights');
    await runStep(() => preloadKickoffV1BestWeights(), 'ko_v2', 'Kickoff v2 SafeTensors');
    await runStep(() => ensureExperimentalEngine('nexto'), 'nexto', 'Nexto SafeTensors');
    await runStep(() => ensureExperimentalEngine('necto'), 'necto', 'Necto SafeTensors');

    for (const policyId of botpackIds) {
      await yieldIdleSlice(24);
      try {
        await ensureExperimentalEngine(policyId);
      } catch (err: unknown) {
        console.warn(`[GameRuntime] Botpack policy "${policyId}" preload warning:`, err);
      }
      report(policyId);
    }
  }

  /**
   * Advances authoritative bot controls for single-player bot matches hosted on an AuthoritativeServerHost.
   */
  public stepAuthoritativeBotControls(isKickoff: boolean): void {
    const r = this.runtime;
    const server = r.networkManager?.sessionCoordinator.authoritativeServer;
    if (
      !server ||
      !r.physics ||
      !this.isBotMatch ||
      r.match?.state?.mode !== 'match' ||
      this.isBotPaused
    ) {
      return;
    }

    if (isKickoff) {
      this.botKickoffStep = 0;
      this.botControls = { ...NEUTRAL_CAR_CONTROLS };
      server.setCarControls(BOT_CAR_INDEX, this.botControls);
      r.physics.setControls(BOT_CAR_INDEX, this.botControls);
      return;
    }

    const kickoffControls = r.bot?.getKickoffControls?.(r.physics.state, this.botKickoffStep) as
      CarControlsInput | null | undefined;
    if (kickoffControls) {
      this.botControls = kickoffControls;
      r.bot?.overrideControls?.(kickoffControls);
    } else if (this.botTickSkip <= 0) {
      this.scheduleBotDecision();
    }
    this.botKickoffStep++;
    if (!kickoffControls && this.botTickSkip > 0) {
      this.botTickSkip--;
    }
    server.setCarControls(BOT_CAR_INDEX, this.botControls);
    r.physics.setControls(BOT_CAR_INDEX, this.botControls);
  }

  public scheduleBotDecision(): void {
    const r = this.runtime;
    if (this.isBotDeciding || !this.isBotMatch || !r.bot || !r.physics) return;
    this.isBotDeciding = true;
    const epoch = this.botDecisionEpoch;
    const pads = r.physics.getPads();
    const teamAssignment = getTeamAssignment(false) as {
      playerTeam: number;
      opponentTeam: number;
      botTeam?: number;
    };
    const botTeam = teamAssignment.botTeam ?? teamAssignment.opponentTeam;

    r.bot
      .decide(r.physics.state, pads, BOT_CAR_INDEX, botTeam)
      .then((controls: CarControlsInput) => {
        if (epoch === this.botDecisionEpoch && r.bot) {
          this.botControls = controls;
          this.botTickSkip = r.bot.option.tickSkip;
          this.isBotDeciding = false;
          const server = r.networkManager?.sessionCoordinator.authoritativeServer;
          if (server && this.isBotMatch) {
            server.setCarControls(BOT_CAR_INDEX, controls);
          }
        }
      })
      .catch((err: unknown) => {
        if (epoch === this.botDecisionEpoch) {
          this.isBotDeciding = false;
          this.isBotPaused = true;
          if (r.match) {
            r.match.state.paused = true;
          }
          console.warn(
            '[GameRuntime] Bot opponent stopped responding:',
            err instanceof Error ? err.message : err
          );
        }
      });
  }

  public resetBotState(): void {
    const r = this.runtime;
    if (r.bot) r.bot.reset();
    this.botDecisionEpoch++;
    this.botTickSkip = 0;
    this.isBotDeciding = false;
    this.botControls = { ...NEUTRAL_CAR_CONTROLS };
    this.botKickoffStep = 0;
  }

  public async startBotMatch(
    botId: string = this.runtime.bot?.id || 'nexto',
    durationSeconds = 300
  ): Promise<void> {
    const r = this.runtime;
    const net = r.networkManager;
    if (!r.physics || !net) return;
    const session = net.sessionCoordinator;
    this.isBotMatch = true;
    if (botId && r.bot) {
      this.resetBotState();
      r.bot.select(botId);
      botSettingsStore.save({ botId });
    }
    await Promise.all([r.bot?.load(), r.arena?.vehicleRegistry.ensureOpponent()]);
    if (r.arena?.cars?.[1]) {
      r.arena.cars[1].visible = true;
    }
    r.physics.configureCars('default', true);
    r.physics.setUnlimitedBoost(false);
    this.isBotPaused = false;

    if (session.authoritativeServer) {
      session.authoritativeServer.destroy?.();
      session.authoritativeServer = null;
    }

    const initialSnapshot = r.physics.saveCompactState();
    const garagePrefs = garageSettingsStore.get() as { vehiclePreset?: string } | null;
    const presetId = useAppStore?.getState?.()?.activeCar || garagePrefs?.vehiclePreset || 'fennec';
    const storedPrefs = loadStoredColorPrefs();
    const preferredBlueSlot = getPreferredColorSlot(storedPrefs, 0);
    const preferredOrangeSlot = getPreferredColorSlot(storedPrefs, 1);
    const hostColorSlot = preferredBlueSlot;
    const hostColorHex = CAR_COLOR_SLOTS[hostColorSlot]?.hex || '#42a5f5';
    r.arena?.vehicleRegistry.setCarColor(0, hostColorHex);

    const server = new AuthoritativeServerHost(null, {
      snapshotInterval: 1,
      initialState: Array.from(initialSnapshot),
      hostPlayerName: 'Player',
      hostVisualId: presetId,
      hostColorSlot,
      hostBlueColorSlot: preferredBlueSlot,
      hostOrangeColorSlot: preferredOrangeSlot,
      roomId: 'local_bot_match',
      isBotMatch: true,
      startAsMatch: true,
      skipReplayByDefault: false,
      botPlayerName: r.bot?.name || 'AI Bot',
      numCars: 2,
      durationSeconds,
    });
    session.authoritativeServer = server;
    await server.init();
    server.sim.setUnlimitedBoost(false);

    const prevChannel = session.networkChannel;
    const nextChannel = server.channel as NetworkSessionChannelLike;
    session.networkChannel = nextChannel;
    if (
      typeof prevChannel?.extraUplinkMs === 'number' ||
      typeof prevChannel?.extraDownlinkMs === 'number'
    ) {
      const up = prevChannel?.extraUplinkMs ?? 0;
      const down = prevChannel?.extraDownlinkMs ?? 0;
      if (up > 0 || down > 0) {
        if (typeof nextChannel.setAsymmetricLatency === 'function') {
          nextChannel.setAsymmetricLatency(up, down);
        } else {
          nextChannel.extraUplinkMs = up;
          nextChannel.extraDownlinkMs = down;
        }
      }
    } else {
      session.reconcilerBinder.applyInitialChannelLatency(nextChannel, true);
    }

    r.playerCarIndex = 0;
    if (r.arena) r.arena.playerCarIndex = 0;

    const serverSnap = server.sim.saveCompactState();
    const serverTick = Math.floor(server.sim.getHeaderView().tickCount);
    r.physics.restoreState?.(serverSnap);
    r.interpolator?.sync?.(performance.now());

    const reconciler = session.reconcilerBinder.createPredictionReconciler(
      nextChannel,
      0,
      presetId,
      {},
      true
    );
    session.networkReconciler = reconciler;
    reconciler.setCarVisualPreset(1, 'fennec');
    reconciler.syncTimeline(serverSnap, serverTick);
    networkDiagnosticsStore.setSession(reconciler, nextChannel, r);

    r.matchDurationSeconds = durationSeconds;
    r.audioSubsystem?.resetMatchClockTracking(durationSeconds);
    r.match?.start();

    hudStore.getState().setMatchState({
      matchPhase: 'kickoff',
      remainingSeconds: durationSeconds,
      overtimeSeconds: 0,
      isOvertime: false,
      blueScore: 0,
      orangeScore: 0,
      winner: null,
      kickoffCountdown: 3,
    });
    useAppStore?.getState?.()?.setMatchMode?.('match');
  }

  public leaveBotMatch(): void {
    const r = this.runtime;
    const net = r.networkManager;
    const session = net?.sessionCoordinator;
    this.isBotMatch = false;
    this.resetBotState();
    r.audioSubsystem?.resetAudio();
    net?.signalCoordinator?.resetSignalState?.();
    net?.diagnosticsProbe.configureLobbyGhostMode(false);
    if (session) {
      session.networkChannel = session.reconcilerBinder.disposeSessionTransports(
        session.authoritativeServer,
        session.networkChannel,
        session.networkReconciler
      );
      session.authoritativeServer = null;
      session.networkReconciler = null;
      session.lobbyDualWorld.hideNonZeroArenaCars();
    }
    r.playerCarIndex = 0;
    if (r.arena) r.arena.playerCarIndex = 0;
    if (r.match) {
      r.match.leave();
      r.match.state.phase = 'freeplay';
      r.match.state.overtime = false;
      r.match.state.winner = null;
      r.match.state.countdown = 0;
    }
    this.isBotPaused = false;
    const freeplayPrefs = loadStoredColorPrefs();
    const freeplayTeam = freeplayPrefs.primaryTeam === 'orange' ? 1 : 0;
    const garagePrefs = garageSettingsStore.get() as { vehiclePreset?: string } | null;
    const presetId = useAppStore?.getState?.()?.activeCar || garagePrefs?.vehiclePreset || 'fennec';
    const playerHitbox = resolveVehicleHitboxId(presetId);
    r.physics?.configureCars(playerHitbox, false, freeplayTeam);
    if (r.loadoutCoordinator) {
      r.loadoutCoordinator.restoreLocalPlayerFreeplayLoadout(0);
    } else {
      const freeplayColorSlot = getPreferredColorSlot(freeplayPrefs, freeplayTeam);
      const freeplayColorHex = CAR_COLOR_SLOTS[freeplayColorSlot]?.hex || '#ffc107';
      r.arena?.vehicleRegistry.setCarTeam(0, freeplayTeam);
      r.arena?.vehicleRegistry.setCarColor(0, freeplayColorHex);
    }
    r.physics?.setUnlimitedBoost(r.trainingOptions?.boostOption === 'unlimited');
    r.resetKickoff();
    r.interpolator?.sync?.(performance.now());
    hudStore.getState().setMatchState({
      kickoffCountdown: 0,
      matchPhase: 'freeplay',
      localTeam: freeplayTeam,
      blueScore: 0,
      orangeScore: 0,
      remainingSeconds: 300,
      overtimeSeconds: 0,
      isOvertime: false,
      winner: null,
    });
    if (useAppStore && typeof useAppStore.getState === 'function') {
      useAppStore.getState().setMatchMode('freeplay');
      useAppStore.getState().setOnlineSession({
        isHosting: false,
        roomId: '',
        signalingConnected: false,
        connectedPeers: [],
        roomType: 'warmup',
        isReady: false,
      });
    }
  }
}
