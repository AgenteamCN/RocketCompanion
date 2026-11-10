import { RuntimeBloomOcclusion } from './RuntimeBloomOcclusion.ts';
import { RuntimeBotCoordinator } from './RuntimeBotCoordinator.ts';
import { RuntimeNetworkManager } from './RuntimeNetworkManager.ts';
import { RuntimeDOMEventManager } from './RuntimeDOMEventManager.ts';
import { RuntimeInputPoller } from './RuntimeInputPoller.ts';
import { RuntimeLoadoutCoordinator } from './RuntimeLoadoutCoordinator.ts';
import {
  FramePipeline,
  InputStage,
  GameplayModeStage,
  AudioStage,
  RenderStage,
} from '../pipeline/FramePipeline.ts';
import { SimulationStage } from '../pipeline/stages/SimulationStage.ts';
import { PresentationStage } from '../pipeline/stages/PresentationStage.ts';
import { TelemetryStage } from '../pipeline/stages/TelemetryStage.ts';
import { GameAudioSubsystem } from '../subsystems/GameAudioSubsystem.ts';
import { GameCameraSubsystem } from '../subsystems/GameCameraSubsystem.ts';
import { GameRenderSubsystem } from '../subsystems/GameRenderSubsystem.ts';
import { GameModeManager } from '../modes/GameModeManager.ts';
import { disposeCoreSceneGraph } from './RuntimeSceneBootstrap.ts';
import {
  determinismStore,
  networkDiagnosticsStore,
  toggleFloatingPreset,
  NETWORK_MONITOR_PRESET,
  DUAL_ARENA_DETERMINISM_HARNESS_PRESET,
  type GraphicsSettingsPort,
} from '../runtimeUiPort.ts';
import { RenderClockScheduler } from '../RenderClockScheduler.ts';
import type { NetworkSessionChannelLike } from './onlineLobbyTransitionPipeline.ts';
import type { BotAgentLike } from './RuntimeBotCoordinator.ts';

export type {
  BotAgentLike,
  FramePipeline,
  GameAudioSubsystem,
  GameCameraSubsystem,
  GameModeManager,
  GameRenderSubsystem,
  RuntimeBloomOcclusion,
  RuntimeBotCoordinator,
  RuntimeDOMEventManager,
  RuntimeInputPoller,
  RuntimeLoadoutCoordinator,
  RuntimeNetworkManager,
  SimulationStage,
};

export type AudioSetupProgressFn = (loaded: number, total?: number, file?: string) => void;
export type BotSetupProgressFn = (completed?: number, total?: number, name?: string) => void;
export type ShaderSetupProgressFn = (progress: number, label?: string) => void;

export type RuntimeSubsystemHost = ConstructorParameters<typeof RuntimeBloomOcclusion>[0] &
  ConstructorParameters<typeof RuntimeBotCoordinator>[0] &
  ConstructorParameters<typeof RuntimeInputPoller>[0] &
  ConstructorParameters<typeof RuntimeNetworkManager>[0] &
  ConstructorParameters<typeof RuntimeDOMEventManager>[0] &
  ConstructorParameters<typeof RuntimeLoadoutCoordinator>[0] &
  ConstructorParameters<typeof GameAudioSubsystem>[0] &
  ConstructorParameters<typeof GameCameraSubsystem>[0] &
  ConstructorParameters<typeof GameRenderSubsystem>[0] &
  ConstructorParameters<typeof SimulationStage>[0] &
  ConstructorParameters<typeof FramePipeline>[0] &
  ConstructorParameters<typeof InputStage>[0] &
  ConstructorParameters<typeof GameplayModeStage>[0] &
  ConstructorParameters<typeof PresentationStage>[0] &
  ConstructorParameters<typeof AudioStage>[0] &
  ConstructorParameters<typeof RenderStage>[0] &
  ConstructorParameters<typeof TelemetryStage>[0] &
  Parameters<typeof disposeCoreSceneGraph>[0];

export interface AssembledRuntimeSubsystems {
  bloomOcclusion: RuntimeBloomOcclusion;
  botCoordinator: RuntimeBotCoordinator;
  inputPoller: RuntimeInputPoller;
  networkManager: RuntimeNetworkManager;
  domEventManager: RuntimeDOMEventManager;
  loadoutCoordinator: RuntimeLoadoutCoordinator;
  audioSubsystem: GameAudioSubsystem;
  cameraSubsystem: GameCameraSubsystem;
  renderSubsystem: GameRenderSubsystem;
  modeManager: GameModeManager;
  simulationStage: SimulationStage;
  pipeline: FramePipeline;
}

export function assembleRuntimeSubsystemsAndPipeline(
  target: RuntimeSubsystemHost
): AssembledRuntimeSubsystems {
  const bloomOcclusion = new RuntimeBloomOcclusion(target);
  const botCoordinator = new RuntimeBotCoordinator(target);
  const inputPoller = new RuntimeInputPoller(target);
  const networkManager = new RuntimeNetworkManager(target);
  const domEventManager = new RuntimeDOMEventManager(target);
  const loadoutCoordinator = new RuntimeLoadoutCoordinator(target);

  const audioSubsystem = new GameAudioSubsystem(target);
  const cameraSubsystem = new GameCameraSubsystem(target);
  const renderSubsystem = new GameRenderSubsystem(target);
  const modeManager = new GameModeManager(target);
  const simulationStage = new SimulationStage(target);

  const pipeline = new FramePipeline(target)
    .addStage(new InputStage(target))
    .addStage(simulationStage)
    .addStage(new GameplayModeStage(target))
    .addStage(new PresentationStage(target))
    .addStage(new AudioStage(target))
    .addStage(new RenderStage(target))
    .addStage(new TelemetryStage(target));

  return {
    bloomOcclusion,
    botCoordinator,
    inputPoller,
    networkManager,
    domEventManager,
    loadoutCoordinator,
    audioSubsystem,
    cameraSubsystem,
    renderSubsystem,
    modeManager,
    simulationStage,
    pipeline,
  };
}

export function createRuntimeClockScheduler(target: {
  renderer: { getContext(): WebGLRenderingContext | WebGL2RenderingContext } | null;
  profiler: { displayFrame(timestamp: number): void } | null;
  pipeline: FramePipeline;
  activeGraphicsSettings: GraphicsSettingsPort | null;
  renderFrame(timestamp: number): boolean;
}): RenderClockScheduler {
  const scheduler = new RenderClockScheduler(
    target.renderer?.getContext() ?? null,
    (t) => target.renderFrame(t),
    (t) => target.profiler?.displayFrame(t),
    (t) => target.pipeline.executeSimulationOnly(t)
  );
  if (target.activeGraphicsSettings) {
    scheduler.setFpsLimit(
      target.activeGraphicsSettings.limitFps ? (target.activeGraphicsSettings.maxFps ?? null) : null
    );
  }
  return scheduler;
}

export function createNeutralCarControls(): {
  throttle: number;
  steer: number;
  pitch: number;
  yaw: number;
  roll: number;
  jump: boolean;
  boost: boolean;
  handbrake: boolean;
} {
  return {
    throttle: 0,
    steer: 0,
    pitch: 0,
    yaw: 0,
    roll: 0,
    jump: false,
    boost: false,
    handbrake: false,
  };
}

export function notifyRuntimeSessionReady(
  target: RuntimeSubsystemHost,
  reconciler: RuntimeNetworkManager['sessionCoordinator']['networkReconciler'],
  channel: NetworkSessionChannelLike | null
): void {
  networkDiagnosticsStore.setSession(reconciler, channel, target);
}

export function notifyRuntimeNetworkHud(): void {
  toggleFloatingPreset(NETWORK_MONITOR_PRESET);
}

export function notifyRuntimeDeterminismHarnessReady(
  harness: NonNullable<RuntimeNetworkManager['diagnosticsProbe']['determinismHarness']>,
  showHUD = false
): void {
  determinismStore.setHarness(harness);
  if (showHUD) toggleFloatingPreset(DUAL_ARENA_DETERMINISM_HARNESS_PRESET);
}

export function destroyRuntimeSubsystems(
  target: RuntimeSubsystemHost & AssembledRuntimeSubsystems
): void {
  target.domEventManager.destroy();
  target.audioSubsystem.dispose();
  target.cameraSubsystem.dispose();
  target.renderSubsystem.dispose();
  target.bloomOcclusion.dispose();
  target.networkManager.diagnosticsProbe.determinismHarness?.destroy();
  target.networkManager.sessionCoordinator.authoritativeServer?.destroy();
  target.networkManager.sessionCoordinator.authoritativeServer = null;
  target.networkManager.sessionCoordinator.networkReconciler = null;
  disposeCoreSceneGraph(target);
}
