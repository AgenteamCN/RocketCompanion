import type { FrameContext } from '../pipeline/FramePipeline.ts';
import type { ReplayTimelineController } from '../../replay/ReplayTimelineController.ts';
import type { ReplayRingBuffer } from '../../replay/ReplayRingBuffer.ts';
import type { StandaloneReplayViewerController } from '../../replay/StandaloneReplayViewerController.ts';
import type { FreeplayRewinderController } from '../../replay/FreeplayRewinderController.ts';
import type { RetainedMatchReplay } from '../../replay/ReplayFileExporter.ts';
import type { ImportedDiagnosticPatternInput } from '../../replay/ReplayDirectorStatePipeline.ts';
import type { NameTagTunerArenaController } from './NameTagTunerArenaController.ts';
import type {
  PodiumCelebrationController,
  PodiumCelebrationControls,
} from './PodiumCelebrationController.ts';
import type { ExperimentalMultiBotsRosterController } from './experimental-multi-bots/ExperimentalMultiBotsRosterController.ts';
import type { ExperimentalMultiBotsMatchLifecycleController } from './experimental-multi-bots/ExperimentalMultiBotsMatchLifecycleController.ts';
import type {
  DirectorPatternPreviewOptions,
  DirectorPreviewSubController,
  ReferenceFreeCamOptions,
} from './freeplay/DirectorPreviewSubController.ts';
import type { FreeplayGoalAndTouchSubController } from './freeplay/FreeplayGoalAndTouchSubController.ts';
import type { GoalReplayRuntimePort } from './shared/GoalReplaySessionCoordinator.ts';

export interface ModeReplaySessionPort {
  isReplayActive: boolean;
  replayCameraMode: 'director' | 'pov';
  replayPovCarIndex?: number;
  replayController: ReplayTimelineController;
  replayRingBuffer: ReplayRingBuffer;
}

export interface GameModePhysicsEvent {
  type?: number;
  tick?: number;
  carIndex?: number;
  team?: number;
  [key: string]: unknown;
}

export interface GameModeRuntimePort extends GoalReplayRuntimePort {
  physics?:
    | (NonNullable<GoalReplayRuntimePort['physics']> & {
        numCars: number;
        isUnlimitedBoost?: boolean;
        controlsView?: Float32Array | null;
        getHeaderView?: () => { tickCount: number } | null;
        getBallStateView?: () => { posX: number; posY: number; posZ: number } | null;
        getCarStateView?: (carIndex: number) => unknown;
        getCarState?: (carIndex: number) => Float32Array | null;
        setCarState?: (carIndex: number, state: Float32Array) => boolean | void;
        setBallState?: (state: Float32Array) => boolean | void;
        getCarUnlimitedBoost?: (carIndex: number) => boolean;
        setUnlimitedBoost: (unlimited: boolean) => void;
        setCarTeam?: (carIndex: number, team: number) => void;
        removeCar?: (carIndex: number) => void;
        addCar?: (team: number, preset: string) => number | void;
        resetKickoff?: (seed?: number, preserveMomentum?: boolean) => void;
        resetGoalLatch?: () => void;
        clearEvents?: () => void;
        saveCompactState: () => Float32Array;
        setControls?: (
          carIndex: number,
          controls: PodiumCelebrationControls | Record<string, unknown>
        ) => void;
        step?: (ticks?: number) => void;
        configureCars: (
          playerPreset: string,
          opponentPreset?: string | boolean,
          playerTeam?: number
        ) => void;
        setSimulationFrozen?: (frozen: boolean, resumeTick?: number, maskInputs?: boolean) => void;
        setCarLinearFactorAndGravity?: (
          carIndex: number,
          fx: number,
          fy: number,
          fz: number,
          g: number
        ) => void;
        setCarCollisionMask?: (
          carIndex: number,
          collideCars: boolean,
          collideBall: boolean
        ) => void;
        setPossessionReportingEnabled?: (enabled: boolean) => void;
      })
    | null;
  arena?:
    | (NonNullable<GoalReplayRuntimePort['arena']> & {
        isLobbyMode?: boolean;
        carVisual?: string;
        carTeams?: ArrayLike<number>;
        scene?: unknown;
        ball?: { children?: Array<{ quaternion: { identity: () => void } }> } | null;
        cars?: Array<{ visible: boolean }>;
        carDemolitions?: Array<{ stop?: () => void } | null | undefined>;
        setCarTeam?: (carIndex: number, team: number) => void;
        ensureCar?: (carIndex: number, team: number, preset: string) => void;
        ensureOpponent?: () => void;
        resetCarBoosts?: (carIndex: number) => void;
        resetBallTrail?: () => void;
        clearAllGhostOpacities?: () => void;
        resetAllCarEffects?: () => void;
      })
    | null;
  camera?:
    | (NonNullable<GoalReplayRuntimePort['camera']> & {
        isFreeCam?: boolean;
        setFreeCam: (enabled: boolean) => void;
        setEditorOverride?: (enabled: boolean) => void;
        getFreeCamStateSnapshot?: () => {
          eyeUnreal: [number, number, number];
          yawUnrealDeg: number;
          pitchUnrealDeg: number;
        } | null;
      })
    | null;
  interpolator?:
    | (NonNullable<GoalReplayRuntimePort['interpolator']> & {
        sync: (timestamp?: number) => void;
        setTrainingPhysicsRate?: (rateHz: number) => void;
      })
    | null;
  match?: {
    state: {
      mode?: string;
      phase?: string;
      paused?: boolean;
      scorer?: number;
      scorerCarIndex?: number;
      winner?: number | string;
      winReason?: string;
      countdown?: number;
      countdownValue?: number;
      [key: string]: unknown;
    };
  } | null;
  keyboard?: { ballControlEnabled?: boolean; read?: () => PodiumCelebrationControls } | null;
  gamepad?: { active?: () => boolean; read?: () => PodiumCelebrationControls } | null;
  audioSubsystem?: {
    audio?: { play?: (cue: string, volume?: number) => void } | null;
    resetAudio?: () => void;
  } | null;
  ballTrajectoryPredictor?:
    | (NonNullable<GoalReplayRuntimePort['ballTrajectoryPredictor']> & {
        forcePredictAnyMovement?: boolean;
        clear?: () => void;
        clearStaticPreview?: () => void;
      })
    | null;
  authoritativeServer?: {
    sim: {
      resetKickoff?: (seed?: number) => void;
      pollGoal?: () => void;
      saveCompactState: () => Float32Array;
      getHeaderView: () => { tickCount: number };
      restoreState?: (snapshot: Float32Array) => Promise<void> | void;
    };
    clientInputBuffer?: { clear?: () => void } | null;
    lastReceivedControls?: { clear?: () => void } | null;
    fallbackManager?: {
      domain?: { goalBufferTicks?: number; players?: Map<unknown, Record<string, unknown>> };
    } | null;
    pauseMatch: (paused: boolean) => void;
    stop?: () => void;
    setCarControls?: (
      carIndex: number,
      controls: PodiumCelebrationControls | Record<string, unknown>
    ) => void;
    startTrainingMode?: (options: Record<string, unknown>) => void;
  } | null;
  networkReconciler?:
    | (NonNullable<GoalReplayRuntimePort['networkReconciler']> & {
        replayPlaybackMode?: boolean;
        lobbyDualWorldMode?: boolean;
        historyBuffer?: {
          lastRemoteControls?: Map<
            number,
            { controls?: PodiumCelebrationControls } & PodiumCelebrationControls
          >;
        };
        setReplayPlaybackMode?: (enabled: boolean) => void;
        syncTimeline: (snapshot: Float32Array, tick: number) => void;
        sampleAndPredictInput?: (
          carIndex: number,
          controls: PodiumCelebrationControls
        ) => PodiumCelebrationControls | null;
        dispose?: () => void;
      })
    | null;
  inputPoller?: { latchJumpSuppression?: () => void } | null;
  networkManager?:
    (NonNullable<GoalReplayRuntimePort['networkManager']> & { voteSkipReplay?: () => void }) | null;
  modeManager?: {
    [key: string]: unknown;
    modes?: Map<string, BaseGameMode>;
    getActiveMode?: () => BaseGameMode | null;
    setMode?: (modeId: string) => void;
  } | null;
  gameModeManager?: { modes?: Map<string, BaseGameMode> } | null;
  simulationStage?: { resetActionStates?: () => void } | null;
  botCoordinator?: {
    isBotMatch: boolean;
    isBotPaused: boolean;
    botControls: PodiumCelebrationControls;
    resetBotState?: () => void;
  } | null;
  boostBloom?: { clear?: () => void } | null;
  flipResetVisuals?:
    | Map<number, { update?: (dt: number, active: boolean) => void; stopVisual?: () => void }>
    | Array<
        | { update?: (dt: number, active: boolean) => void; stopVisual?: () => void }
        | null
        | undefined
      >
    | null;
  openOverlays?: Set<string>;
  trainingOptions?: {
    boostOption?: string;
    disableGoalReset?: boolean;
    freeplayReplayDurationSeconds?: number;
    gameSpeed?: number;
    [key: string]: unknown;
  } | null;
  teamAssignment?: { playerTeam: number; opponentTeam: number } | null;
  neutralControls?: PodiumCelebrationControls;
  playerControls?: PodiumCelebrationControls;
  botControls?: PodiumCelebrationControls;
  playerCarIndex?: number;
  playerThrottle?: number;
  replayPovCarIndex?: number | null;
  replayTimelineController?: ReplayTimelineController | null;
  podiumController?: PodiumCelebrationController | null;
  isBotMatch?: boolean;
  isBotPaused?: boolean;
  isCursorBrowsing?: boolean;
  selectedPreset?: string;
  loadoutCoordinator?: { restoreLocalPlayerFreeplayLoadout?: (carIndex?: number) => void } | null;
  changePlayerVehicle?: (preset: string, hitbox?: string | null) => void;
  setCarColor?: (carIndex: number, colorHex: number | string, broadcast?: boolean) => void;
  syncPlayerMaterialsLoadout?: () => void;
  [key: string]: unknown;
}

export interface BaseGameMode {
  goalReplayPhase?: string;
  replayController?: ReplayTimelineController;
  replayRingBuffer?: ReplayRingBuffer;
  goalReplayTimelineController?: ReplayTimelineController | null;
  standaloneReplayViewer?: StandaloneReplayViewerController;
  rewinderController?: (FreeplayRewinderController & { isScrubbing?: boolean }) | null;
  nameTagTunerController?: NameTagTunerArenaController;
  podiumController?: PodiumCelebrationController | null;
  rosterController?: ExperimentalMultiBotsRosterController;
  replaySession?: ModeReplaySessionPort;
  lifecycleController?: ExperimentalMultiBotsMatchLifecycleController;
  directorPreview?: DirectorPreviewSubController;
  goalAndTouch?: FreeplayGoalAndTouchSubController;
  isTestingSingleShot?: boolean;
  isFreeCamTrajectoryTesting?: boolean;
  isGoalReplayActive?(): boolean;
  setReplayCameraMode?(_val: string): void;
  onBeforePhysicsTick?(): boolean;
  onStepPhysicsTick?(): boolean;
  onAfterPhysicsTick?(): void;
  onPhysicsEvent?(_event: GameModePhysicsEvent | null | undefined): void;
  skipGoalReplay?(): void;
  expireBall?(): boolean;
  applyRosterAndStartMatch?(): Promise<void> | void;
  _applyCameraCarIndex?(_carIdx?: number): void;
  _publishSpawnedCarsTelemetry?(): void;
  getCarControls?(_carIndex: number): PodiumCelebrationControls | Record<string, unknown> | null;
  resetToCleanFreeplay?(): void;
  importDirectorDiagnosticPattern?(
    _file: unknown,
    _opts?: DirectorPatternPreviewOptions
  ): Promise<ImportedDiagnosticPatternInput | boolean | null>;
  startDirectorPatternPreview?(
    _pattern?: ImportedDiagnosticPatternInput | null,
    _opts?: DirectorPatternPreviewOptions
  ): boolean;
  enterDirectorReferenceFreeCamFromHere?(_opts?: ReferenceFreeCamOptions): boolean;
  exitDirectorReferenceFreeCam?(): boolean;
  exitDirectorPatternPreview?(): boolean;
  exportRecentHighlightReplay?(
    _durationSeconds?: number,
    _suppressNotification?: boolean
  ): RetainedMatchReplay | null;
  syncExternalGhostWorld?(
    _worldId: string,
    _prev: Float32Array | number[],
    _curr: Float32Array | number[],
    _opts?: Record<string, unknown>
  ): void;
}

function latchKickoffInputSuppression(
  inputPort:
    | {
        inputPoller?: { latchJumpSuppression?: () => void } | null;
        neutralControls?: PodiumCelebrationControls;
        playerControls?: PodiumCelebrationControls;
        playerThrottle?: number;
      }
    | null
    | undefined
): void {
  if (!inputPort) return;
  inputPort.inputPoller?.latchJumpSuppression?.();
  if (inputPort.neutralControls) {
    inputPort.playerControls = { ...inputPort.neutralControls };
    inputPort.playerThrottle = 0;
  }
}

export class BaseGameMode<TRuntime = GameModeRuntimePort> {
  public id: string;
  public runtime: TRuntime;
  constructor(
    id: string,
    runtime: TRuntime | GameModeRuntimePort | Record<string, unknown> | null
  ) {
    this.id = id;
    this.runtime = runtime as TRuntime;
  }
  public onEnter(): void {}
  public update(_context: FrameContext): void {}
  public onGoal(..._args: unknown[]): void {}
  public onResetKickoff(_seed = -1): void {}
  public onLeave(): void {}
  protected resetKickoffPresentationAndAudio(
    options: { resetCamera?: boolean; resetBots?: boolean } = {}
  ): void {
    const r = this.runtime as GameModeRuntimePort | null;
    if (!r) return;
    r.ballTrajectoryPredictor?.clear?.();
    latchKickoffInputSuppression(r);
    r.audioSubsystem?.resetAudio?.();
    if (options.resetBots) {
      r.botCoordinator?.resetBotState?.();
      if (r.flipResetVisuals && typeof r.flipResetVisuals.values === 'function') {
        for (const v of r.flipResetVisuals.values()) v?.update?.(0, false);
      }
    }
    r.arena?.resetBallTrail?.();
    if (options.resetCamera !== false) r.camera?.resetView?.();
    r.interpolator?.sync?.();
  }
  protected syncPlayerTeamAndFreeplayLoadout(
    freeplayTeam: 0 | 1,
    options: { resetPlayerCarIndex?: boolean; restoreLoadout?: boolean } = {}
  ): void {
    const r = this.runtime as GameModeRuntimePort | null;
    if (!r) return;
    if (options.resetPlayerCarIndex) {
      r.playerCarIndex = 0;
      if (r.arena) r.arena.playerCarIndex = 0;
    }
    const playerIdx = r.playerCarIndex ?? 0;
    if (r.teamAssignment) {
      r.teamAssignment.playerTeam = freeplayTeam;
      r.teamAssignment.opponentTeam = freeplayTeam === 0 ? 1 : 0;
    }
    r.physics?.setCarTeam?.(playerIdx, freeplayTeam);
    r.arena?.setCarTeam?.(playerIdx, freeplayTeam);
    if (options.restoreLoadout)
      r.loadoutCoordinator?.restoreLocalPlayerFreeplayLoadout?.(playerIdx);
  }
}
