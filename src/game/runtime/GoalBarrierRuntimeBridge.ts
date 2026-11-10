import type * as THREE from 'three';
import {
  useAppStore,
  type GoalBarrierDecompositionPort,
  type GoalBarrierRectPort,
  type GraphicsSettingsPort,
} from '../runtimeUiPort.ts';
import {
  isFreeplayConfigScopeActive,
  isTrainingGoalBarrierScopeActive,
} from '../../ui-core/config/trainingDefaults.ts';
import type { RocketSimPhysicsEngine } from '../../physics/RocketSimPhysicsEngine.ts';
import type { PhysicsStateInterpolator } from '../../physics/PhysicsStateInterpolator.ts';
import type { RuntimeMatchState } from './RuntimeMatchState.ts';
import type { ArenaWorld } from '../../entities/ArenaWorld.ts';
import type { CameraManager } from '../../camera/CameraManager.ts';
import type { KeyboardMouseController } from '../../input/KeyboardMouseController.ts';
import type { GamepadController } from '../../input/GamepadController.ts';
import type { BallTrajectoryPredictor } from '../../entities/BallTrajectoryPredictor.ts';
import type { MultiplayerSessionManager } from '../../network/transport/MultiplayerSessionManager.ts';
import type { ReplayTimelineController } from '../../replay/ReplayTimelineController.ts';
import type { AuthoritativeServerHost } from '../../network/server/AuthoritativeServerHost.ts';
import type { RuntimeNetworkManager } from './RuntimeNetworkManager.ts';
import type { RuntimeBotCoordinator } from './RuntimeBotCoordinator.ts';
import type { RuntimeDOMEventManager } from './RuntimeDOMEventManager.ts';
import type { RuntimeLoadoutCoordinator } from './RuntimeLoadoutCoordinator.ts';
import type { MountedGameUIHandle } from './RuntimeSceneBootstrap.ts';

interface StandaloneReplayViewerCarLoadoutPort {
  hasLoadedReplay?: boolean;
  isActive?: boolean;
  _applyUserLoadoutToTakenOverCar?(carIndex: number): void;
}

export interface FreeplayModeCleanupPort {
  nameTagTunerController?: { isActive?: boolean; exitTunerArena(): void } | null;
  directorPreview?: { isReplayActive?: boolean } | null;
  isGoalReplayActive?(): boolean;
  exitDirectorPatternPreview?(): void;
  rewinderController?: { isBlockingLivePhysics?: boolean; clearBuffer?(): void } | null;
  resetToCleanFreeplay?(): void;
}

export interface TrainingOptionsPort {
  boostOption?: string;
  disableGoalReset?: boolean;
  showCarHitbox?: boolean;
  showAllCarHitboxes?: boolean;
  [key: string]: unknown;
}

export interface RuntimeDomainPortOwner {
  readonly physics: RocketSimPhysicsEngine | null;
  readonly interpolator: PhysicsStateInterpolator | null;
  readonly match: RuntimeMatchState | null;
  readonly arena: ArenaWorld | null;
  readonly camera: CameraManager | null;
  readonly renderer: THREE.WebGLRenderer | null;
  readonly profiler: unknown;
  readonly keyboard: KeyboardMouseController | null;
  readonly gamepad: GamepadController | null;
  readonly gameUI: MountedGameUIHandle | null;
  readonly ballTrajectoryPredictor: BallTrajectoryPredictor | null;
  readonly multiplayerSession: MultiplayerSessionManager | null;
  readonly replayTimelineController: ReplayTimelineController | null;
  readonly networkManager: RuntimeNetworkManager;
  readonly botCoordinator: RuntimeBotCoordinator;
  readonly domEventManager: RuntimeDOMEventManager;
  readonly loadoutCoordinator: RuntimeLoadoutCoordinator;
  readonly modeManager: {
    activeMode?: {
      id?: string;
      onEnter?(): void;
      applyRosterAndStartMatch?(): Promise<void> | void;
      skipGoalReplay?(): void;
      standaloneReplayViewer?: StandaloneReplayViewerCarLoadoutPort;
    } | null;
    modes?: Map<string, unknown>;
    getActiveMode?(): {
      id?: string;
      onEnter?(): void;
      applyRosterAndStartMatch?(): Promise<void> | void;
      skipGoalReplay?(): void;
    } | null;
    setMode?(modeId: string): void;
  } | null;
  trainingOptions: TrainingOptionsPort;
  readonly teamAssignment: { playerTeam: number; opponentTeam: number } | null;
  readonly playerCarIndex: number;
  readonly matchDurationSeconds: number;
  readonly selectedPreset: string;
  selectedHitbox: string | null;
  activeGraphicsSettings: GraphicsSettingsPort | null;
  bloomEnabled: boolean;
  resetKickoff(seed?: number): void;
}

export type GameplayScopePort = Pick<
  RuntimeDomainPortOwner,
  'botCoordinator' | 'modeManager' | 'match'
>;

export type GoalBarrierDomainPort = Pick<
  RuntimeDomainPortOwner,
  | 'arena'
  | 'physics'
  | 'interpolator'
  | 'networkManager'
  | 'botCoordinator'
  | 'modeManager'
  | 'match'
  | 'trainingOptions'
>;

export interface CachedGoalBarrierState {
  readonly decomposition: GoalBarrierDecompositionPort;
  readonly targetGoal: 'blue' | 'orange' | 'both';
  readonly enabled: boolean;
  readonly opacity: number;
  readonly chunks: Uint8Array[];
}

export interface GoalBarrierPhysicsMeta {
  [key: string]: unknown;
  readonly enabled: boolean;
  readonly targetGoal: 'blue' | 'orange' | 'both';
  readonly rects: GoalBarrierRectPort[];
}

export interface GameplaySettingsInput {
  readonly unlimitedBoost: boolean;
  readonly goalRestart: boolean;
  readonly showCarHitbox: boolean;
  readonly showAllCarHitboxes?: boolean;
}

export interface TrainingRulesetPayload {
  [key: string]: unknown;
  readonly unlimitedBoost: boolean;
  readonly disableGoalReset: boolean;
  readonly goalReplayEnabled: boolean;
  readonly fifoDurationSeconds: number;
}

export function isOnlineSessionOrBotMatchActive(scope: GameplayScopePort): boolean {
  const onlineSession = useAppStore.getState().onlineSession;
  return Boolean(
    onlineSession?.isHosting ||
    onlineSession?.signalingConnected ||
    onlineSession?.roomId ||
    scope.botCoordinator.isBotMatch
  );
}

export function resolveActiveGameplayModeId(
  scope: GameplayScopePort,
  overrideMode?: string | null
): string {
  const activeModeId = scope.modeManager?.activeMode?.id;
  const matchModeId = scope.match?.state?.mode;
  return (
    overrideMode || activeModeId || matchModeId || useAppStore.getState().matchMode || 'freeplay'
  );
}

export function buildGoalBarrierPhysicsPayload(
  cached: CachedGoalBarrierState,
  effectiveEnabled: boolean
): { readonly meta: GoalBarrierPhysicsMeta | null; readonly activeChunks: Uint8Array[] } {
  const meta: GoalBarrierPhysicsMeta | null = effectiveEnabled
    ? {
        enabled: cached.decomposition.mergedRects.length > 0,
        targetGoal: cached.targetGoal,
        rects: cached.decomposition.mergedRects,
      }
    : null;
  return { meta, activeChunks: effectiveEnabled ? cached.chunks : [] };
}

export function buildTrainingOptionsPatch(
  prevOptions: TrainingOptionsPort | undefined,
  gameplayConfig: GameplaySettingsInput
): TrainingOptionsPort {
  return {
    ...prevOptions,
    boostOption: gameplayConfig.unlimitedBoost ? 'unlimited' : 'standard',
    disableGoalReset: !gameplayConfig.goalRestart,
    showCarHitbox: gameplayConfig.showCarHitbox,
    showAllCarHitboxes: Boolean(gameplayConfig.showAllCarHitboxes),
  };
}

export function buildTrainingRulesetPayload(
  unlimitedBoost: boolean,
  disableGoalReset: boolean
): TrainingRulesetPayload {
  return {
    unlimitedBoost,
    disableGoalReset,
    goalReplayEnabled: !disableGoalReset,
    fifoDurationSeconds: 30,
  };
}

export function resolveEffectiveTrainingScopeFlags(
  trainingOptions: TrainingOptionsPort | undefined,
  storeGameplay: { unlimitedBoost?: boolean; goalRestart?: boolean } | undefined
): { readonly unlimitedBoost: boolean; readonly disableGoalReset: boolean } {
  const unlimitedBoost =
    trainingOptions?.boostOption !== undefined
      ? trainingOptions.boostOption === 'unlimited'
      : Boolean(storeGameplay?.unlimitedBoost);
  const disableGoalReset =
    trainingOptions?.disableGoalReset !== undefined
      ? Boolean(trainingOptions.disableGoalReset)
      : !Boolean(storeGameplay?.goalRestart ?? true);
  return { unlimitedBoost, disableGoalReset };
}

function applyTrainingBoostAndRulesetToEngines(
  physics: RocketSimPhysicsEngine | null,
  server: AuthoritativeServerHost | null,
  unlimitedBoost: boolean,
  disableGoalReset: boolean
): void {
  physics?.setUnlimitedBoost?.(unlimitedBoost);
  if (!server) return;
  server.sim?.setUnlimitedBoost?.(unlimitedBoost);
  server.configureTrainingRuleset?.(buildTrainingRulesetPayload(unlimitedBoost, disableGoalReset));
}

export class GoalBarrierRuntimeBridge {
  private readonly readPort: () => GoalBarrierDomainPort;
  private cachedGoalBarrier: CachedGoalBarrierState | null = null;
  private appliedGoalBarrierEffectiveEnabled = false;

  constructor(portOrProvider: GoalBarrierDomainPort | (() => GoalBarrierDomainPort)) {
    this.readPort = typeof portOrProvider === 'function' ? portOrProvider : () => portOrProvider;
  }

  public applyEffectiveGoalBarrier(modeOverride?: string | null, forcePhysicsUpdate = false): void {
    const cached = this.cachedGoalBarrier;
    if (!cached) return;
    const domain = this.readPort();
    const { arena, physics, interpolator, networkManager } = domain;
    const effectiveEnabled = Boolean(
      cached.enabled &&
      isTrainingGoalBarrierScopeActive(
        resolveActiveGameplayModeId(domain, modeOverride),
        isOnlineSessionOrBotMatchActive(domain)
      )
    );
    arena?.environment.updateGoalBarrier(
      cached.decomposition as unknown as Parameters<
        ArenaWorld['environment']['updateGoalBarrier']
      >[0],
      cached.targetGoal,
      effectiveEnabled,
      cached.opacity
    );
    if (
      (forcePhysicsUpdate || effectiveEnabled !== this.appliedGoalBarrierEffectiveEnabled) &&
      physics?.setGoalBarrierChunks
    ) {
      this.appliedGoalBarrierEffectiveEnabled = effectiveEnabled;
      const { meta, activeChunks } = buildGoalBarrierPhysicsPayload(cached, effectiveEnabled);
      physics.setGoalBarrierChunks(activeChunks, meta);
      const fallbackSim = networkManager.sessionCoordinator.authoritativeServer?.fallbackSim;
      fallbackSim?.setGoalBarrierChunks?.(activeChunks, meta);
      interpolator?.sync?.();
    }
  }

  public syncGoalBarrier(
    decomposition: GoalBarrierDecompositionPort,
    targetGoal: 'blue' | 'orange' | 'both',
    enabled: boolean,
    opacity: number,
    chunks: unknown,
    updatePhysicsChunks: boolean
  ): void {
    const nextChunks = updatePhysicsChunks
      ? Array.isArray(chunks)
        ? (chunks as Uint8Array[])
        : []
      : (this.cachedGoalBarrier?.chunks ?? []);
    this.cachedGoalBarrier = {
      decomposition,
      targetGoal,
      enabled,
      opacity,
      chunks: nextChunks,
    };
    this.applyEffectiveGoalBarrier(null, updatePhysicsChunks);
  }

  public applyGameplaySettings(gameplayConfig: GameplaySettingsInput): void {
    const domain = this.readPort();
    const { arena, physics, networkManager } = domain;
    const showAll = Boolean(gameplayConfig.showAllCarHitboxes);
    if (domain.trainingOptions) {
      domain.trainingOptions = buildTrainingOptionsPatch(domain.trainingOptions, gameplayConfig);
    }
    if (
      isFreeplayConfigScopeActive(
        resolveActiveGameplayModeId(domain),
        isOnlineSessionOrBotMatchActive(domain)
      )
    ) {
      applyTrainingBoostAndRulesetToEngines(
        physics,
        networkManager.sessionCoordinator.authoritativeServer,
        gameplayConfig.unlimitedBoost,
        !gameplayConfig.goalRestart
      );
    }
    arena?.vehicleRegistry.setCarHitboxesVisible(
      gameplayConfig.showCarHitbox,
      showAll,
      arena.playerCarIndex ?? 0
    );
  }

  public reconcileTrainingScopeForMode(modeId?: string): void {
    const domain = this.readPort();
    this.applyEffectiveGoalBarrier(modeId, false);
    if (
      isFreeplayConfigScopeActive(
        resolveActiveGameplayModeId(domain, modeId),
        isOnlineSessionOrBotMatchActive(domain)
      )
    ) {
      const { unlimitedBoost, disableGoalReset } = resolveEffectiveTrainingScopeFlags(
        domain.trainingOptions,
        useAppStore.getState().gameplay
      );
      applyTrainingBoostAndRulesetToEngines(
        domain.physics,
        domain.networkManager.sessionCoordinator.authoritativeServer,
        unlimitedBoost,
        disableGoalReset
      );
    }
  }
}
