/**
 * runtimeDomainPortTypes.ts
 * Domain-partitioned GameRuntime -> UI bridge port interfaces (`cameraPort`, `matchPort`,
 * `tunerPort`, `replayPort`), plus tuner, telemetry, and diagnostic buffer port contracts.
 */

import type {
  GraphicsSettingsPort,
  PacingTelemetryRecorderPort,
} from './runtimeUiStorePortTypes.ts';
import type {
  RLRCBookmarkRecord,
  RLRCNonPovInterventionMode,
  RLRCPlayerSlotMeta,
} from '../replay/rlrc/RLRCReplayTypes.ts';

export type { RLRCBookmarkRecord, RLRCNonPovInterventionMode, RLRCPlayerSlotMeta };

export interface HostOnlineWarmupPortOptions {
  roomId: string;
  password?: string;
  playerName?: string;
  roomType?: string;
  gameMode?: string;
  botFillMode?: string;
  durationSeconds?: number;
  lobbyMode?: boolean;
}

export interface JoinOnlineWarmupPortOptions {
  roomId: string;
  password?: string;
  playerName?: string;
}

export interface PerCarBoostConfigPort {
  unlimitedBoost?: boolean;
  boostCollectable?: boolean;
  rechargeBoostEnabled?: boolean;
  rechargeBoostPerSecond?: number;
  rechargeBoostDelay?: number;
}

export interface UnderDevelopmentConfigPort {
  stadiumPreset?: string;
  threeWheelsEnabled?: boolean;
  showThrowbackCollisionOverlay?: boolean;
  perCarBoostConfigs?: Record<number, PerCarBoostConfigPort>;
}

export interface GoalBarrierRectPort {
  [key: string]: unknown;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface GoalBarrierDecompositionPort {
  mergedRects: GoalBarrierRectPort[];
  [key: string]: unknown;
}

export interface PerfTelemetryLatencyBreakdownPort {
  rttMs: number;
  extraRttMs: number;
  uplinkMs: number;
  downlinkMs: number;
  extraUplinkMs: number;
  extraDownlinkMs: number;
  baseLatency: number;
  extraLatency: number;
}

export interface PerfTelemetrySamplerPort {
  getProfiler: () => unknown;
  getRenderer: () => unknown;
  getInterpolator: () => unknown;
  getPhysicsRate: () => number;
  getNetworkLatencyInfo: () => PerfTelemetryLatencyBreakdownPort;
}

export interface WasmReplayTracksPort {
  frameCount: number;
  [key: string]: unknown;
}

export interface DiagnosticBufferRuntimeContext {
  isOnlineSession: boolean;
  isLobby: boolean;
  matchState: string;
  isHosting: boolean;
  localPlayerCarIndex: number;
  activeCarMask: number;
  clientFrames: number;
  clientRecordingActive: boolean;
  clientOverflowPaused: boolean;
  maxClientFrames: number;
  autoPauseOnOverflow: boolean;
  recorder: PacingTelemetryRecorderPort | null;
  serverFrames: number;
  blueScore: number;
  orangeScore: number;
  durationSeconds: number;
  arenaPreset: number;
  roster: unknown[];
}

export interface RuntimeCameraPort {
  applyPovSettings(cameraConfig: Record<string, unknown>): void;
  setFreeCam(enabled: boolean): void;
  setFreeCamFov(fov: number): void;
  resetFreeCamOverview(): void;
  setDiagnosticObservationTarget(targetCarIndex: number): number;
}

export interface RuntimeMatchPort {
  getMatchMode(): string;
  isOnlineOrServerActive(): boolean;
  isBotMatch(): boolean;
  getPlayerCarIndex(): number;
  getMatchDurationSeconds(): number;
  syncPausedAndInputState(graphicsOverride?: GraphicsSettingsPort | null): void;
  handleOverlayChange(overlayName: string, isOpen: boolean): void;
  openMainMenu(): void;
  startExpMultiBots(): void;
  startKickoffTraining(): void;
  startReplayViewer(): void;
  startStaticTrainingPack(): void;
  startDevTestLab(): void;
  restartMatch(): Promise<void>;
  returnToFreeplay(unlimitedBoost: boolean): void;
  resetKickoff(): void;
  hostOnlineWarmup(options: HostOnlineWarmupPortOptions): Promise<boolean>;
  joinOnlineWarmup(options: JoinOnlineWarmupPortOptions): Promise<boolean>;
  approvePendingPeer(peerId: string): void;
  declinePendingPeer(peerId: string): void;
  leaveOnlineServer(): Promise<void>;
  returnToOnlineLobby(): Promise<void>;
  pauseOnlineMatch(pause: boolean, resumeCountdownSeconds?: number): void;
  removeRemotePlayer(carIndex: number): Promise<void>;
  reconnectSignaling(): Promise<void>;
  forceStartOnlineMatch(durationSeconds?: number): void;
  setOnlineGameMode(gameMode: '1v1' | '2v2' | '3v3'): void;
  setOnlineMatchDuration(durationSeconds: number): void;
  setOnlineBotFillMode(botFillMode: 'no_bots' | 'auto_fill' | 'bots_vs_humans' | 'custom'): void;
  addOnlineBot(team?: number | null): void;
  setClientReady(ready: boolean): void;
  voteRematch(ready: boolean): void;
  switchOnlineRoleOrTeam(role: 'player' | 'spectator', team: number): void;
  setClockPacingMode(mode: string): void;
  setClockPacingPriority(priority: string): void;
  setClockPacingParams(params: Record<string, unknown> | null): void;
  setInputBufferTarget(target: number): void;
  setInputBufferThresholds(minOffset: number, maxOffset: number): void;
  syncInitialClockPacing(state: {
    clockPacingMode: string;
    clockPacingPriority: string;
    inputBufferTarget: number;
    inputBufferThreshold: [number, number];
    customClockPacingParams: Record<string, unknown> | null;
  }): void;
}

export interface RuntimeTunerPort {
  getInitialVehiclePreset(): string | null;
  changePlayerVehicle(carId: string): void;
  applyPlayerColorChoice(hex: string): void;
  syncInitialFreeplayTeamAndColor(targetHex: string | null, freeplayTeam: 0 | 1): void;
  applyGraphicsSettings(graphicsConfig: GraphicsSettingsPort): void;
  applyGameplaySettings(gameplayConfig: {
    unlimitedBoost: boolean;
    goalRestart: boolean;
    showCarHitbox: boolean;
    showAllCarHitboxes?: boolean;
  }): void;
  applyTrajectorySettings(trajectoryConfig: Record<string, unknown>): void;
  syncMaterialsConfig(materialsConfig?: Record<string, unknown> | null): void;
  applyBoostPadTuner(boostPadConfig: Record<string, unknown>): void;
  applyDriftwoodsTuner(driftwoodsConfig: Record<string, unknown>): void;
  applyInputBindings(bindings: Record<string, unknown>): void;
  ensureDeterminismHarness(): Promise<unknown>;
  simulateBoostPadCollect(padIndex: number | 'all'): void;
  simulateBoostPadRefill(padIndex: number | 'all', duration?: number): void;
  applyExperimentalWallConfig(wallConfig: Record<string, unknown>): void;
  applyShadowConfig(shadowConfig: Record<string, unknown>): void;
  markArenaRenderTreeChanged(): void;
  applyBoostParticleConfig(particleConfig: {
    bloomEnabled?: boolean;
    [key: string]: unknown;
  }): void;
  applySkyboxConfig(skyboxConfig: Record<string, unknown>): void;
  applyBallVisualConfig(ballConfig: Record<string, unknown>): void;
  applyCustomVehicleTuner(vehicleId: string, hitboxPreset?: string | null): void;
  importCustomVehicleGlb?(
    vehicleId: string,
    arrayBuffer: ArrayBuffer,
    fileName?: string,
    alignPreset?: string
  ): Promise<unknown>;
  applyVehicleAlignPreset?(vehicleId: string, alignPreset: string): boolean;
  applyUnderDevelopmentConfig(
    config: UnderDevelopmentConfigPort,
    patch: Partial<UnderDevelopmentConfigPort>
  ): Promise<void>;
  syncGoalBarrier(
    decomposition: GoalBarrierDecompositionPort,
    targetGoal: 'blue' | 'orange' | 'both',
    enabled: boolean,
    opacity: number,
    chunks: unknown,
    updatePhysicsChunks: boolean
  ): void;
  reconcileTrainingScopeForMode?(modeId?: string): void;
  createPerfTelemetrySampler(): PerfTelemetrySamplerPort;
}

export interface RuntimeReplayPort {
  seekReplayNormalized(progress01: number): {
    progress: number;
    frameIndex: number;
    totalFrames: number;
    isPaused: boolean;
  } | null;
  toggleReplayPause(): { isPaused: boolean; isPersistent: boolean } | null;
  cycleReplaySpeed(): number | null;
  voteOrSkipReplay(): void;
  prepareForReplayViewerEntry(): void;
  getDiagnosticSessionHandles(): { reconciler: unknown; channel: unknown };
  getDiagnosticBufferContext(): DiagnosticBufferRuntimeContext;
  setDiagnosticMaxCapacity(frames: number): void;
  setDiagnosticAutoPauseOverflow(enabled: boolean): void;
  setDiagnosticRecordingActive(recordingActive: boolean): void;
  clearDiagnosticBuffers(): void;
  extractClientReplayTracks(): WasmReplayTracksPort | null;
  extractServerReplaySlots(): Float32Array[];
  retainAndExportStandaloneClientReplay(isLobby: boolean): number;
  toggleZeroGFleet(enabled: boolean, anchorMode: string): Promise<void>;
  setZeroGAnchorMode(anchorMode: string): Promise<void>;
  sampleZeroGFleetTelemetry(): unknown[];
  setTestCarAudioEnabled(enabled: boolean): void;
  setLobbyGhostModeEnabled(enabled: boolean): void;
  dumpNextPacket(): void;
  dumpLatestPacket(): void;
  triggerBurstDrop(count: number): void;
}

export interface GameRuntimeUiBridgePort {
  readonly cameraPort: RuntimeCameraPort;
  readonly matchPort: RuntimeMatchPort;
  readonly tunerPort: RuntimeTunerPort;
  readonly replayPort: RuntimeReplayPort;
}
