import type { SpatialAudioTunerConfig } from '../ui-core/config/spatialAudioConfig.ts';
import type {
  NameTagBoostBorderOverride,
  NameTagCarEntry,
  NameTagConfig,
  NameTagRuntimeState,
  NameTagTelemetrySnapshot,
} from '../ui-core/config/nameTagConfig.ts';
import type {
  EditSubMode,
  StaticTrainingPackMetadata,
  StaticTrainingShotItem,
} from '../ui-core/config/staticTrainingPackTypes.ts';
import type {
  DirectorCameraState,
  ReplaySessionState,
} from '../replay/replayDirectorStateTypes.ts';
import type { AppState } from '../ui-core/stores/appStoreTypes.ts';
import type { HudStoreState } from '../ui-core/stores/hudStore.ts';
import type {
  BgmUploadedTrack,
  SpatialAudioStoreState,
} from '../ui-core/stores/spatialAudioStore.ts';
import type { SubsystemIsolationLabState } from '../ui-core/stores/subsystemIsolationLabTypes.ts';
import type { RewinderState } from '../ui-core/stores/rewinderStore.ts';
import type { ReplayViewerStoreState } from '../ui-core/stores/replayViewerStore.ts';
import type { ReplayToRcsImporterStoreState } from '../ui-core/stores/replayToRcsImporterStore.ts';
import type { ExperimentalMultiBotsState } from '../ui-core/stores/experimentalMultiBotsStore.ts';
import type { ExperimentalMultiBotsSlotConfig } from '../ui-core/stores/experimentalMultiBotsRosterUtils.ts';
import type {
  ActiveStaticTrainingPackBundle,
  StaticTrainingPackStoreState,
} from '../ui-core/stores/staticTrainingPackStore.ts';
import type { StaticTrainingBallCamTunerState } from '../ui-core/stores/staticTrainingBallCamTunerStore.ts';
import type { KickoffTrainingState } from '../ui-core/stores/kickoffTrainingStore.ts';
import type { ReferenceOverlayState } from '../ui-core/stores/referenceOverlayStore.ts';
import type {
  QuickNotificationItem,
  QuickNotificationStore,
} from '../ui-core/stores/notificationTypes.ts';

export type {
  NameTagBoostBorderOverride,
  NameTagCarEntry,
  NameTagConfig,
  NameTagRuntimeState,
  NameTagTelemetrySnapshot,
  EditSubMode,
  StaticTrainingPackMetadata,
  StaticTrainingShotItem,
};

type PortOverride<T, U> = Omit<T, keyof U> & U & Record<string, unknown>;

export interface OnlinePeerEntryPort {
  id?: string;
  peerId?: string;
  carIndex: number;
  name?: string;
  playerName?: string;
  isHost?: boolean;
  isBot?: boolean;
  team?: 'blue' | 'orange' | 'spectator' | number;
  role?: 'player' | 'spectator';
  vehiclePreset?: string;
  colorHex?: string;
  materialsConfig?: Record<string, unknown> | null;
  selectedAnthem?: string;
  isReady?: boolean;
  pingMs?: number;
  [key: string]: unknown;
}

export type OnlineSessionPortState = PortOverride<
  Partial<AppState['onlineSession']>,
  {
    role?: string;
    status?: string;
    peers?: OnlinePeerEntryPort[];
    connectedPeers?: OnlinePeerEntryPort[];
    roomType?: 'warmup' | 'match' | string;
    gameMode?: '1v1' | '2v2' | '3v3' | string;
    botFillMode?: 'no_bots' | 'auto_fill' | 'bots_vs_humans' | 'custom' | string;
    localRole?: 'player' | 'spectator' | string;
    localTeam?: 'blue' | 'orange' | 'spectator' | 'neutral' | string;
    localPeerId?: string;
  }
>;

export interface GraphicsSettingsPort extends Partial<Omit<AppState['graphics'], 'menuPowerSave'>> {
  resolutionScale?: number;
  antialias?: boolean;
  menuPowerSave?: string;
}

export type GameplaySettingsPort = Partial<AppState['gameplay']>;

export type AppStorePortState = PortOverride<
  Partial<AppState>,
  {
    isMenuOpen?: boolean;
    activeOverlay?: string;
    cameraMode?: string;
    touchInputAgent?: AppState['touchInputAgent'] | boolean | string;
    graphics?: GraphicsSettingsPort;
    gameplay?: GameplaySettingsPort;
    audio?: Partial<AppState['audio']> & Record<string, unknown>;
    telemetry?: Partial<AppState['telemetry']> & {
      pauseTelemetryInPowerSave?: boolean;
      [key: string]: unknown;
    };
    camera?: Record<string, unknown>;
    trajectory?: Record<string, unknown>;
    materials?: Record<string, unknown>;
    boostPadTuner?: Record<string, unknown>;
    driftwoodsTuner?: Record<string, unknown>;
    customClockPacingParams?: Record<string, unknown>;
    onlineSession: OnlineSessionPortState;
    bridge?: Record<string, (...args: unknown[]) => unknown>;
    openMenu: (route?: string) => void;
    closeMenu: () => void;
    toggleMenu: () => void;
    goBack: () => void;
    setActiveOverlay?: (overlay: string) => void;
    setMatchMode: (mode: string) => void;
    setFreeCam: (enabled: boolean) => void;
    toggleFreeCam: () => boolean | void;
    setLivePreviewCollapsed: (collapsed: boolean) => void;
    setOnlineSession: (patch: Partial<OnlineSessionPortState> | Record<string, unknown>) => void;
    setBridge?: (bridge: Record<string, unknown>) => void;
    resolveEffectiveClockPacingParams?: (...args: unknown[]) => Record<string, unknown>;
  }
>;

export type HudStorePortState = PortOverride<
  Partial<HudStoreState>,
  {
    matchPhase: string;
    replayProgress: number;
    choreographySignal?: string | null;
    scoreBlue: number;
    scoreOrange: number;
    localTeam: number;
    boost: number;
    speedKph: number;
    onReplaySkip?: (() => void) | null;
    setMatchState: (patch?: Record<string, unknown>) => void;
    setReplayState: (patch?: Record<string, unknown>) => void;
    clearReplayState: () => void;
    setChoreographySignal: (signal: string | null) => void;
    setBallCamActive: (active: boolean) => void;
    setOnToggleBallCam: (fn: (() => void) | null) => void;
    setCameraFocusState: (mode: string, carIndex?: number) => void;
    setBoost: (boost: number, isZeroG?: boolean, unlimited?: boolean) => void;
    setCarSpeed: (speedUuPerSec: number, speedKph?: number, isSupersonic?: boolean) => void;
    setHasFlip?: (
      hasFlip: boolean,
      flipStatus?: string,
      flipRemainingSeconds?: number,
      flipsRemaining?: number
    ) => void;
    setDemoRespawnState: (
      isDemolished: boolean,
      remainingSeconds: number,
      durationSeconds?: number
    ) => void;
    syncBindings: (bindings: Record<string, unknown>) => void;
  }
>;

export type BgmTrackEntryPort = BgmUploadedTrack & Record<string, unknown>;

export type SpatialAudioStorePortState = PortOverride<
  SpatialAudioStoreState,
  {
    previewSource: string | null;
    bgmTracks: BgmTrackEntryPort[];
    tunerConfig: Partial<SpatialAudioTunerConfig>;
    registerRuntimeCallbacks: (callbacks: Record<string, unknown>) => void;
    setGoalReplaySkipped: (skipped?: boolean) => void;
    setActiveGoalAnthemId: (id?: string | null) => void;
    setPreviewingAnthemId: (id?: string | null, source?: string | null) => void;
    setAnthemTransitionState: (linearPhase?: number, blend?: number) => void;
    setBgmPlaybackState: (patch?: Record<string, unknown>) => void;
    setBgmTransitionState: (linearPhase?: number, blend?: number) => void;
  }
>;

export type SubsystemIsolationLabStorePortState = PortOverride<
  SubsystemIsolationLabState,
  {
    activeTab: string;
    selectedTab: string;
    probeCameraTarget: string;
    ghostWorldCount: number;
    incidentOpponentMode: string;
    incidentControlledCar: number;
    incidentSpeedMultiplier: number;
    kickoffDuelBlueModel: string;
    kickoffDuelOrangeModel: string;
    kickoffDuelChannelMode: string;
    kickoffDuelTouchWinner: string;
    kickoffDuelLiveBlueSteps: unknown[];
    kickoffDuelLiveOrangeSteps: unknown[];
    liveTelemetry: Record<string, unknown>;
    applyAndRestartLab: (tab?: string) => void;
    updateLiveTelemetry: (patch?: Record<string, unknown>) => void;
    setRuntimeHandlers: (handlers: Record<string, unknown>) => void;
  }
>;

export type RewinderStorePortState = PortOverride<
  RewinderState,
  {
    rewinderState: string;
    rewinderDownCounterSec: number;
    runtimeHandlers: Record<string, (...args: unknown[]) => unknown>;
    updateLiveTelemetry: (patch?: Record<string, unknown>) => void;
    setRuntimeHandlers: (handlers: Record<string, unknown>) => void;
  }
>;

export type ReplayViewerStorePortState = PortOverride<
  ReplayViewerStoreState,
  {
    viewerState: string;
    downCounterSec: number;
    updateLiveTelemetry: (patch?: Record<string, unknown>) => void;
    setRuntimeHandlers: (handlers: Record<string, unknown>) => void;
  }
>;

export type ReplayToRcsImporterStorePortState = PortOverride<
  ReplayToRcsImporterStoreState,
  {
    viewerState: string;
    downCounterSec: 0 | 1 | 2 | 3;
    updateLiveTelemetry: (patch?: Record<string, unknown>) => void;
    setRuntimeHandlers: (handlers: Record<string, unknown>) => void;
  }
>;

export type ExpMultiBotsSlotPort = PortOverride<
  ExperimentalMultiBotsSlotConfig,
  {
    botType: string;
    vehicleId?: string;
  }
>;

export type ExperimentalMultiBotsStorePortState = PortOverride<
  ExperimentalMultiBotsState,
  {
    blueSlots: ExpMultiBotsSlotPort[];
    orangeSlots: ExpMultiBotsSlotPort[];
    activeBotpackShowcaseModel: string | null;
    speedMultiplier: number;
    updateLiveTelemetry: (patch?: Record<string, unknown>) => void;
    setRuntimeHandlers: (handlers: Record<string, unknown>) => void;
  }
>;

export type ActiveStaticTrainingPackBundlePort = ActiveStaticTrainingPackBundle;

export type StaticTrainingPackStorePortState = PortOverride<
  StaticTrainingPackStoreState,
  {
    downCounterValue: number;
    replayType: string;
    liveTelemetry: { replayType?: string | null; [key: string]: unknown };
    cycleEditSubMode: (dir?: number) => void;
    updateLiveTelemetry: (patch?: Record<string, unknown>) => void;
    setRuntimeHandlers: (handlers: Record<string, unknown>) => void;
  }
>;

export type StaticTrainingBallCamTunerStorePortState = StaticTrainingBallCamTunerState &
  Record<string, unknown>;

export type KickoffTrainingStorePortState = PortOverride<
  KickoffTrainingState,
  {
    updateLiveState: (patch?: Record<string, unknown>) => void;
    setRuntimeHandlers: (handlers: Record<string, unknown>) => void;
  }
>;

export type ReferenceOverlayStorePortState = PortOverride<
  ReferenceOverlayState,
  {
    cameraLookPreset: string;
  }
>;

export type QuickNotificationTaskItemPort = Partial<QuickNotificationItem> & {
  id: string;
  [key: string]: unknown;
};

export type QuickNotificationStorePortState = PortOverride<
  QuickNotificationStore,
  {
    ongoingTasks: QuickNotificationTaskItemPort[];
    pushNotification: (config?: Record<string, unknown>) => string | void;
    dismissNotification: (id?: string) => void;
    pushOngoingNotification: (config?: Record<string, unknown>) => string;
    updateOngoingNotification: (
      idOrUpdates: string | Record<string, unknown>,
      updates?: Record<string, unknown>
    ) => void;
    dismissOngoingNotification: (id?: string) => void;
    completeOngoingNotification: (id?: string, summary?: unknown) => void;
  }
>;

export interface NetworkDiagnosticsMetricsPort {
  extraLatencyMs?: number;
  extraUplinkMs?: number;
  extraDownlinkMs?: number;
  adjustStepMs?: number;
  disconnectEvicted?: boolean;
  corrections?: number;
  mispredictions?: number;
  lastErrorUu?: number;
  maxErrorUu?: number;
  rttMs?: number;
  jitterMs?: number;
  inputBufferDepth?: number;
  [key: string]: unknown;
}

export interface NetworkDiagnosticsSnapshotPort {
  metrics?: NetworkDiagnosticsMetricsPort;
  [key: string]: unknown;
}

export interface NetworkDiagnosticsStoreMethods {
  setSession(reconciler: unknown, channel?: unknown, runtime?: unknown): void;
  toggleBurstDrop(): void;
  setExtraLatency?(latencyMs: number): void;
  setTestCarAudioEnabled?(enabled: boolean): void;
  setLobbyGhostMode?(enabled: boolean): void;
  syncZeroGFleetState(enabled: boolean): void;
  registerBridge?(bridge: Record<string, unknown>): void;
  updateDiagnosticBuffers?(snapshot: Record<string, unknown>): void;
}

export type NameTagRuntimeCarEntryPort = NameTagCarEntry & {
  username?: string;
  isLocalPlayer?: boolean;
};

export type NameTagRuntimeStatePort = Omit<NameTagRuntimeState, 'carEntries'> & {
  carEntries: NameTagRuntimeCarEntryPort[];
};

export interface ReplayTimelineControllerPort {
  ActiveWindowCount: number;
  sessionState?: Partial<ReplaySessionState>;
  directorCameraState?: DirectorCameraState;
  progress?: number;
  currentFrameIndex?: number;
  getTotalRecordedFrames?: () => number;
  togglePause?: () => boolean;
  cyclePlaybackSpeed?: () => number;
  seekToNormalized?: (progress01: number, interpolator?: unknown) => void;
  replanDirectorCameraTrajectory?: () => void;
  applyFrameToEngine?: (frameIndex: number, interpolator?: unknown) => void;
  getFrameBufferByIndex?: (frameIndex: number) => Float32Array | null;
  getFrameEntryByIndex?: (frameIndex: number) => unknown;
}

export type StoreListener<T = Record<string, unknown>> = (state: T, prevState: T) => void;

export interface StoreBoundTarget<T> {
  getState?: () => T;
  getSnapshot?: () => T;
  setState?: (
    partial:
      Partial<T> | Record<string, unknown> | ((state: T) => Partial<T> | Record<string, unknown>),
    replace?: boolean
  ) => T;
  subscribe?: (listener: StoreListener<T>) => () => boolean | void;
  [key: string]: unknown;
}

export type StoreProxy<T extends object, M extends object = Record<string, never>> = {
  _bind(store: unknown): void;
  getState(): T;
  setState(
    partial:
      Partial<T> | Record<string, unknown> | ((state: T) => Partial<T> | Record<string, unknown>),
    replace?: boolean
  ): T;
  subscribe(listener: StoreListener<T>): () => boolean | void;
  getSnapshot(): T;
} & M;

export interface PendingSubscriberEntry<T> {
  listener: StoreListener<T>;
  unsub: (() => boolean | void) | null;
}

export interface FloatingWindowEntryPort {
  id: string;
  minimized?: boolean;
  [key: string]: unknown;
}

export interface FloatingStoreSnapshotPort {
  windows: FloatingWindowEntryPort[];
  activeFlight?: { preset?: { id?: string } } | null;
  [key: string]: unknown;
}

export interface FloatingStorePort {
  _bound: {
    getSnapshot(): FloatingStoreSnapshotPort;
    subscribe(listener: StoreListener<FloatingStoreSnapshotPort>): () => boolean | void;
    openWindow?(id: string): unknown;
    closeWindow?(id: string): unknown;
    toggleWindow?(id: string): unknown;
    spawnWindow?(preset: Record<string, unknown>): unknown;
    setOpacity?(opacity: number): void;
    triggerBatchMinimize?(minimize?: boolean): void;
  } | null;
  _pendingSubscribers: Set<PendingSubscriberEntry<FloatingStoreSnapshotPort>>;
  _bind(store: unknown): void;
  getSnapshot(): FloatingStoreSnapshotPort;
  subscribe(listener: StoreListener<FloatingStoreSnapshotPort>): () => boolean | void;
  openWindow(id: string): unknown;
  closeWindow(id: string): unknown;
  toggleWindow(id: string): unknown;
}

export interface PacingTelemetryRecorderPort {
  count: number;
  reset?(config?: Record<string, unknown>): void;
  recordTick?(sample: Record<string, unknown>): void;
  getSummaryStats?(): {
    starvationCount?: number;
    hardResyncCount?: number;
    [key: string]: unknown;
  };
  toMetadataObject?(): Record<string, unknown>;
  toCsvString?(): string;
  [key: string]: unknown;
}

export interface HudTransientChannelPort {
  setRoster(patch: Record<string, unknown>): void;
  setMiniMap?(patch: unknown): void;
  [key: string]: unknown;
}
