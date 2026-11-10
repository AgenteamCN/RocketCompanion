import type * as THREE from 'three';
import {
  createCorePhysicsBundle,
  createCoreSceneGraph,
  type CorePhysicsBundle,
  type MountedGameUIHandle,
  type SceneGraphBundle,
} from './runtime/RuntimeSceneBootstrap.ts';
import {
  buildRuntimeSceneGraphConfig,
  ensureRuntimeFlipResetVisual,
  resolveRuntimeContainer,
} from './runtime/RuntimeSceneGraphConfigBuilder.ts';
import { createGameRuntimeDomainPorts } from './runtime/DiagnosticReplayBufferBridge.ts';
import {
  assembleRuntimeSubsystemsAndPipeline,
  createNeutralCarControls,
  createRuntimeClockScheduler,
  destroyRuntimeSubsystems,
  notifyRuntimeDeterminismHarnessReady,
  notifyRuntimeNetworkHud,
  notifyRuntimeSessionReady,
  type AudioSetupProgressFn,
  type BotAgentLike,
  type BotSetupProgressFn,
  type FramePipeline,
  type GameAudioSubsystem,
  type GameCameraSubsystem,
  type GameModeManager,
  type GameRenderSubsystem,
  type RuntimeBloomOcclusion,
  type RuntimeBotCoordinator,
  type RuntimeDOMEventManager,
  type RuntimeInputPoller,
  type RuntimeLoadoutCoordinator,
  type RuntimeNetworkManager,
  type ShaderSetupProgressFn,
  type SimulationStage,
} from './runtime/RuntimeSubsystemAssembler.ts';
import type {
  GameRuntimeUiBridgePort,
  GraphicsSettingsPort,
  RuntimeCameraPort,
  RuntimeMatchPort,
  RuntimeReplayPort,
  RuntimeTunerPort,
} from './runtimeUiPort.ts';
import type { CarControlsInput } from '../network/protocol/GlobalPayloadCodec.ts';
import type { RenderClockScheduler } from './RenderClockScheduler.ts';
import { DEFAULT_TRAINING_SETTINGS } from '../ui-core/config/trainingDefaults.ts';
import type { FlipResetVisual } from '../effects/FlipResetVisual.ts';
import { PerformanceProfiler } from '../utils/PerformanceProfiler.ts';
import type { PodiumCelebrationController } from './modes/PodiumCelebrationController.ts';
import type { FreeplayRewinderController } from '../replay/FreeplayRewinderController.ts';
import type { StandaloneReplayViewerController } from '../replay/StandaloneReplayViewerController.ts';
import type { ReplayTimelineController } from '../replay/ReplayTimelineController.ts';
import type {
  MaterialsConfigLike,
  NetworkSessionChannelLike,
} from './runtime/onlineLobbyTransitionPipeline.ts';
import type { SignalAudioFacadeLike } from './runtime/RuntimeGoalReplaySignalSubController.ts';

export const PLAYER_CAR_INDEX = 0;
export const BOT_CAR_INDEX = 1;

export interface GameRuntimeOptions {
  CameraControllerClass?: new (aspect: number) => SceneGraphBundle['camera'];
  gameUI?: MountedGameUIHandle | null;
  mountUI?: (container: HTMLElement, runtime: GameRuntimeUiBridgePort) => MountedGameUIHandle;
  gameAudio?: SignalAudioFacadeLike;
  [key: string]: unknown;
}

export interface TrainingOptionsState {
  boostOption?: string;
  disableGoalReset?: boolean;
  showCarHitbox?: boolean;
  showAllCarHitboxes?: boolean;
  [key: string]: unknown;
}

export class GameRuntime implements GameRuntimeUiBridgePort {
  container: HTMLElement | null;
  options: GameRuntimeOptions;

  physics: CorePhysicsBundle['physics'] | null = null;
  interpolator: CorePhysicsBundle['interpolator'] | null = null;
  match: CorePhysicsBundle['match'] | null = null;
  bot: BotAgentLike | null = null;
  arena: SceneGraphBundle['arena'] = null;
  entityManager: SceneGraphBundle['entityManager'] = null;
  camera: SceneGraphBundle['camera'] | null = null;
  renderer: THREE.WebGLRenderer | null = null;
  composer: SceneGraphBundle['composer'] = null;
  boostBloom: SceneGraphBundle['boostBloom'] = null;
  bloomEnabled = false;
  speedLinesPass: SceneGraphBundle['speedLinesPass'] = null;
  applyVisualMaterialsConfig: unknown = null;
  flipResetVisuals = new Map<number, FlipResetVisual>();
  clockScheduler: RenderClockScheduler | null = null;

  keyboard: SceneGraphBundle['keyboard'] | null = null;
  gamepad: SceneGraphBundle['gamepad'] | null = null;
  gameUI: MountedGameUIHandle | null = null;
  profiler = new PerformanceProfiler();
  ballTrajectoryPredictor: SceneGraphBundle['ballTrajectoryPredictor'] = null;
  reachabilityVisualizer: SceneGraphBundle['reachabilityVisualizer'] = null;
  multiplayerSession: SceneGraphBundle['multiplayerSession'] | null = null;

  playerCarIndex = PLAYER_CAR_INDEX;
  neutralControls: CarControlsInput = createNeutralCarControls();
  playerControls: CarControlsInput;
  playerThrottle = 0;
  lastKickoffCountdownSec = -1;

  openOverlays = new Set<string>();
  isCursorBrowsing = false;
  bloomOcclusion: RuntimeBloomOcclusion;
  botCoordinator: RuntimeBotCoordinator;
  inputPoller: RuntimeInputPoller;
  networkManager: RuntimeNetworkManager;
  domEventManager: RuntimeDOMEventManager;
  loadoutCoordinator: RuntimeLoadoutCoordinator;
  trainingOptions: TrainingOptionsState;

  lastBloomActive = true;
  lastTimestamp = performance.now();
  activeGraphicsSettings: GraphicsSettingsPort | null = null;
  running = false;

  replayPovCarIndex: number | null = null;
  podiumController: PodiumCelebrationController | null = null;
  rewinderController: FreeplayRewinderController | null = null;
  standaloneReplayController: StandaloneReplayViewerController | null = null;
  replayTimelineController: ReplayTimelineController | null = null;
  cursorHintButton: HTMLButtonElement | null = null;
  isPaused = false;
  isWindowMinimized = false;
  isWindowFocused = true;
  isPowerSavingActive = false;
  teamAssignment: { playerTeam: number; opponentTeam: number } | null = null;
  matchDurationSeconds = 300;
  _lastHudSlotCarMap: Record<number, number> | null = null;
  _clientGoalIncidentLatched = false;
  _localSkipReplayReady = false;

  selectedPreset = 'fennec';
  selectedHitbox: string | null = null;
  selectedColorSlot: number | null = null;
  _lastTouchStateActive?: boolean;

  audioSubsystem: GameAudioSubsystem;
  cameraSubsystem: GameCameraSubsystem;
  renderSubsystem: GameRenderSubsystem;
  modeManager: GameModeManager;
  simulationStage: SimulationStage;
  pipeline: FramePipeline;

  readonly cameraPort: RuntimeCameraPort;
  readonly matchPort: RuntimeMatchPort;
  readonly tunerPort: RuntimeTunerPort;
  readonly replayPort: RuntimeReplayPort;

  constructor(container?: HTMLElement | null, options: GameRuntimeOptions = {}) {
    this.container = resolveRuntimeContainer(container);
    this.options = options;
    this.playerControls = { ...this.neutralControls };
    this.trainingOptions = { ...DEFAULT_TRAINING_SETTINGS };

    const subsystems = assembleRuntimeSubsystemsAndPipeline(this);
    this.bloomOcclusion = subsystems.bloomOcclusion;
    this.botCoordinator = subsystems.botCoordinator;
    this.inputPoller = subsystems.inputPoller;
    this.networkManager = subsystems.networkManager;
    this.domEventManager = subsystems.domEventManager;
    this.loadoutCoordinator = subsystems.loadoutCoordinator;
    this.audioSubsystem = subsystems.audioSubsystem;
    this.cameraSubsystem = subsystems.cameraSubsystem;
    this.renderSubsystem = subsystems.renderSubsystem;
    this.modeManager = subsystems.modeManager;
    this.simulationStage = subsystems.simulationStage;
    this.pipeline = subsystems.pipeline;

    const ports = createGameRuntimeDomainPorts(this);
    this.cameraPort = ports.cameraPort;
    this.matchPort = ports.matchPort;
    this.tunerPort = ports.tunerPort;
    this.replayPort = ports.replayPort;
  }

  get authoritativeServer() {
    return this.networkManager.sessionCoordinator.authoritativeServer;
  }
  get networkChannel() {
    return this.networkManager.sessionCoordinator.networkChannel;
  }
  get networkReconciler() {
    return this.networkManager.sessionCoordinator.networkReconciler;
  }
  get botControls(): CarControlsInput {
    return this.botCoordinator.botControls;
  }
  set botControls(v: CarControlsInput) {
    this.botCoordinator.botControls = v;
  }
  get isBotPaused(): boolean {
    return this.botCoordinator.isBotPaused;
  }
  get isBotMatch(): boolean {
    return this.botCoordinator.isBotMatch;
  }
  set isBotMatch(v: boolean) {
    this.botCoordinator.isBotMatch = v;
  }
  get engineSynths() {
    return this.audioSubsystem.engineSynths;
  }

  setupShaders(progressFn: ShaderSetupProgressFn | null = null): Promise<void> {
    return this.bloomOcclusion.setupShaders(progressFn);
  }

  setupAudio(progressFn: AudioSetupProgressFn | null = null): Promise<void> {
    return this.audioSubsystem.setupAudio(progressFn);
  }

  setupBot(progressFn: BotSetupProgressFn | null = null): Promise<void> {
    return this.botCoordinator.setupBot(progressFn);
  }

  pollInputs(commitPhysicsStep = true): boolean {
    return this.inputPoller.pollInputs(commitPhysicsStep);
  }

  isGoalReplayCameraOverrideActive = (): boolean =>
    this.cameraSubsystem.isGoalReplayCameraOverrideActive();

  acquireGoalReplayCameraOverride = (source = 'default'): void => {
    this.cameraSubsystem.acquireGoalReplayCameraOverride(source);
  };

  releaseGoalReplayCameraOverride = (source: string | null = null): void => {
    this.cameraSubsystem.releaseGoalReplayCameraOverride(source);
  };

  changePlayerVehicle = (visualId: string, hitboxId: string | null = null): void => {
    this.loadoutCoordinator.changePlayerVehicle(visualId, hitboxId);
  };

  setCarColor = (carIndex: number, colorVal: number | string, broadcast = true): void => {
    this.loadoutCoordinator.setCarColor(carIndex, colorVal, broadcast);
  };

  syncPlayerMaterialsLoadout = (materialsConfig: MaterialsConfigLike | null = null): void => {
    this.loadoutCoordinator.syncPlayerMaterialsLoadout(materialsConfig);
  };

  onSessionReady(
    reconciler: RuntimeNetworkManager['sessionCoordinator']['networkReconciler'],
    channel: NetworkSessionChannelLike | null
  ): void {
    notifyRuntimeSessionReady(this, reconciler, channel);
  }

  onShowNetworkHUD = notifyRuntimeNetworkHud;
  onDeterminismHarnessReady = notifyRuntimeDeterminismHarnessReady;

  async setupPhysics(options: Record<string, unknown> = {}): Promise<CorePhysicsBundle> {
    const bundle = await createCorePhysicsBundle({
      options,
      onPhysicsRateChange: (nextRate) => {
        this.networkManager.diagnosticsProbe.physicsRate = nextRate;
      },
    });
    this.physics = bundle.physics;
    this.interpolator = bundle.interpolator;
    this.match = bundle.match;
    this.selectedPreset = bundle.selectedPreset;
    this.teamAssignment = bundle.teamAssignment;
    this.playerCarIndex = bundle.playerCarIndex;
    this.bot = null;
    this.audioSubsystem.engineSynths = [];
    this.audioSubsystem.resetAudio();
    return bundle;
  }

  getFlipResetVisual(carIndex: number): FlipResetVisual | null {
    return ensureRuntimeFlipResetVisual(this.flipResetVisuals, this.arena, carIndex);
  }

  get flipResetVisual(): FlipResetVisual | null {
    return this.getFlipResetVisual(this.playerCarIndex);
  }

  async setupScene(
    onProgress: ((progress: number, message?: string) => void) | null = null
  ): Promise<void> {
    const sceneGraph = await createCoreSceneGraph(buildRuntimeSceneGraphConfig(this, onProgress));
    this.selectedPreset = sceneGraph.selectedPreset;
    this.teamAssignment = sceneGraph.teamAssignment;
    this.keyboard = sceneGraph.keyboard;
    this.gamepad = sceneGraph.gamepad;
    this.arena = sceneGraph.arena;
    this.entityManager = sceneGraph.entityManager;
    this.speedLinesPass = sceneGraph.speedLinesPass;
    this.applyVisualMaterialsConfig = sceneGraph.applyVisualMaterialsConfig;
    this.camera = sceneGraph.camera;
    this.cursorHintButton = sceneGraph.cursorHintButton;
    this.activeGraphicsSettings = sceneGraph.activeGraphicsSettings;
    this.ballTrajectoryPredictor = sceneGraph.ballTrajectoryPredictor;
    this.reachabilityVisualizer = sceneGraph.reachabilityVisualizer;
    this.multiplayerSession = sceneGraph.multiplayerSession;
    this.gameUI = sceneGraph.gameUI;
    this.renderer = sceneGraph.renderer;
    this.boostBloom = sceneGraph.boostBloom;
    this.composer = sceneGraph.composer;
    this.domEventManager.setupWindowEvents();
  }

  ignite(): void {
    this.boostBloom?.clear?.();
    if (this.renderer?.shadowMap) this.renderer.shadowMap.needsUpdate = true;
    this.composer?.render?.(0);
    this.lastTimestamp = performance.now();
    this.interpolator?.sync(this.lastTimestamp);
    this.start();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clockScheduler = createRuntimeClockScheduler(this);
    this.domEventManager.updateInteractionState();
    this.clockScheduler.start();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.clockScheduler?.stop();
  }

  renderFrame(timestamp = performance.now()): boolean {
    return this.pipeline.execute(timestamp);
  }

  resetKickoff(seed = -1): void {
    this.inputPoller?.latchJumpSuppression?.();
    this.playerControls = { ...this.neutralControls };
    this.playerThrottle = 0;
    this.modeManager.onResetKickoff(seed);
  }

  destroy(): void {
    this.stop();
    destroyRuntimeSubsystems(this);
  }

  dispose(): void {
    this.destroy();
  }
}
