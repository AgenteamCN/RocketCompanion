import {
  ActiveMenuRoute,
  ContainerTransitionMode,
  CameraConfig,
  GraphicsConfig,
  VisualMaterialsConfig,
  AudioConfig,
  GameplayConfig,
  BoostPadTunerConfig,
  TouchInputAgentMode,
  TelemetryConfig,
} from '../config/uiConfig';
import { type TrajectoryConfig } from '../config/trainingDefaults';
import {
  type ClockPacingMode,
  type ClockPacingPriority,
  type ClockPacingParams,
} from '../config/clockPacingConfig';
import {
  type DriftwoodsTunerConfig,
  type DriftwoodsPreset
} from '../config/driftwoodsConfig';
import { type StoredColorPrefs } from '../config/vehiclePresets';
import type { ExperimentalWallFxConfig, ShadowConfig } from '../config/atmosphereFxConfig';
import type { AnodizedPaintTuning, BoostParticleRuntimeConfig } from '../config/vehicleTunerConfig';
import type { SkyboxConfig } from '../config/skyboxConfig';
import type { BallVisualConfig } from '../config/ballVisualConfig';
import type { InputBindingsConfig } from '../config/inputBindingValidators';

export interface PerCarBoostDevConfig {
  unlimitedBoost: boolean;
  boostCollectable: boolean;
  rechargeBoostEnabled: boolean;
  rechargeBoostPerSecond: number;
  rechargeBoostDelay: number;
}

export interface UnderDevelopmentConfig {
  threeWheelsEnabled: boolean;
  stadiumPreset: 'standard' | 'throwback';
  showThrowbackCollisionOverlay: boolean;
  selectedBoostCarIndex: number;
  perCarBoostConfigs: Record<number, PerCarBoostDevConfig>;
}

export interface AppState {
  isOpen: boolean;
  activeRoute: ActiveMenuRoute;
  transitionMode: ContainerTransitionMode;
  activeCar: string;
  colorPrefs: StoredColorPrefs;
  theme: 'dark' | 'light';
  renderScale: number; // 25 to 100
  setRenderScale: (scale: number) => void;

  // Subsystem configs
  camera: CameraConfig;
  graphics: GraphicsConfig;
  audio: AudioConfig;
  gameplay: GameplayConfig;
  trajectory: TrajectoryConfig;
  materials: VisualMaterialsConfig;
  telemetry: TelemetryConfig;
  boostPadTuner: BoostPadTunerConfig;
  driftwoodsTuner: DriftwoodsTunerConfig;
  underDevelopment: UnderDevelopmentConfig;

  // Settings navigation & highlight pulse
  highlightSetting: string | null;
  settingsTargetTab: string;

  // Live Preview dock state
  isLivePreviewCollapsed: boolean;

  // Actions
  openMenu: (route?: ActiveMenuRoute) => void;
  closeMenu: () => void;
  toggleMenu: () => void;
  navigate: (route: ActiveMenuRoute) => void;
  goBack: () => void;
  setTransitionMode: (mode: ContainerTransitionMode) => void;
  setActiveCar: (carId: string) => void;
  setColorPrefs: (prefs: StoredColorPrefs) => void;
  setTheme: (theme: 'dark' | 'light') => void;

  // Subsystem setters
  developerMode: boolean;
  setDeveloperMode: (mode: boolean) => void;
  touchMode: boolean;
  touchHeadlessMode: boolean;
  touchInputAgent: TouchInputAgentMode;
  setTouchInputAgent: (agent: TouchInputAgentMode) => void;
  clockPacingMode: ClockPacingMode;
  setClockPacingMode: (mode: ClockPacingMode) => void;
  clockPacingPriority: ClockPacingPriority;
  setClockPacingPriority: (priority: ClockPacingPriority) => void;
  customClockPacingParams: ClockPacingParams;
  updateCustomClockPacingParams: (patch: Partial<ClockPacingParams>) => void;
  resetCustomClockPacingParams: () => void;
  inputBufferTarget: number;
  setInputBufferTarget: (target: number) => void;
  inputBufferThreshold: [number, number]; // [catchupOffset, skipOffset], e.g. [-2, 2]
  setInputBufferThreshold: (range: [number, number]) => void;
  resetGameplay: () => void;
  updateCamera: (patch: Partial<CameraConfig>) => void;
  resetCamera: () => void;
  updateGraphics: (patch: Partial<GraphicsConfig>) => void;
  updateAudio: (patch: Partial<AudioConfig>) => void;
  updateGameplay: (patch: Partial<GameplayConfig>) => void;
  updateTrajectory: (patch: Partial<TrajectoryConfig>) => void;
  updateMaterials: (patch: Partial<VisualMaterialsConfig>) => void;
  updateTelemetry: (patch: Partial<TelemetryConfig>) => void;
  updateBoostPadTuner: (patch: Partial<BoostPadTunerConfig>) => void;
  resetBoostPadTuner: () => void;
  updateDriftwoodsTuner: (patch: Partial<DriftwoodsTunerConfig>) => void;
  resetDriftwoodsTuner: () => void;
  applyDriftwoodsPreset: (preset: DriftwoodsPreset) => void;
  updateUnderDevelopment: (patch: Partial<UnderDevelopmentConfig>) => Promise<void>;

  // Free Camera developer fly-cam
  isFreeCam: boolean;
  freeCamFov: number;
  setFreeCam: (enabled: boolean) => void;
  toggleFreeCam: () => boolean;
  setFreeCamFov: (fov: number) => void;

  // Segmented control precision step: 1, 0.1, 0.01, 0.001, 0.0001
  precisionStep: number;
  setPrecisionStep: (step: number) => void;

  setLivePreviewCollapsed: (collapsed: boolean) => void;
  setHighlightSetting: (id: string | null) => void;
  clearHighlightSetting: () => void;
  setSettingsTargetTab: (tab: string) => void;

  // Match mode tracking
  matchMode: 'freeplay' | 'replay-viewer' | 'match' | 'online-warmup' | 'kickoff-training' | 'dev-test-lab' | 'exp-multi-bots' | 'static-training-pack';
  setMatchMode: (mode: 'freeplay' | 'replay-viewer' | 'match' | 'online-warmup' | 'kickoff-training' | 'dev-test-lab' | 'exp-multi-bots' | 'static-training-pack') => void;

  // Online warmup / multiplayer match session tracking
  onlineSession: {
    isHosting: boolean;
    roomId: string;
    password?: string;
    playerName: string;
    signalingConnected: boolean;
    signalingHealthLevel?: 'healthy' | 'degraded' | 'offline';
    hostMask?: number;
    activeRelayLabel?: string;
    pairingCode?: string;
    roomType?: 'warmup' | 'match';
    gameMode?: '1v1' | '2v2' | '3v3';
    botFillMode?: 'no_bots' | 'auto_fill' | 'bots_vs_humans' | 'custom';
    matchDurationSeconds?: number;
    localTeam?: 'blue' | 'neutral' | 'orange';
    isReady?: boolean;
    pendingPairingRequests?: {
      peerId: string;
      peerName: string;
      pairingCode: string;
      relayLabel?: string;
      role?: string;
    }[];
    connectedPeers: {
      id: string;
      name: string;
      pingMs: number;
      carIndex?: number;
      isBot?: boolean;
      team?: number;
      pairingCode?: string;
      allowSpectatorRelay?: boolean;
    }[];
  };
  setOnlineSession: (session: Partial<AppState['onlineSession']>) => void;

  // Runtime Bridge callbacks
  bridge: {
    onVehicleChange?: (carId: string) => void;
    onColorChange?: (hex: string, slotId?: number) => void;
    onResume?: () => void;
    onOverlayChange?: (isOpen: boolean) => void;
    onOpenGarage?: () => void;
    onOpenSettings?: (tab?: string) => void;
    onOpenPlay?: () => void;
    onRequestTouchOpenMenuConfirm?: () => void;
    onStartMatch?: (botId: string, durationSeconds?: number, teamSize?: 'standard' | 'double' | 'solo') => void;
    onStartKickoffTraining?: () => void;
    onStartReplayViewer?: () => void;
    onStartReplayToRcsImporter?: () => void;
    onStartStaticTrainingPack?: (sessionMode?: 'play' | 'edit') => void;
    onStartDevTestLab?: () => void;
    onStartExpMultiBots?: () => void;
    onRestartMatch?: () => void;
    onReturnToFreeplay?: () => void;
    onHostOnlineWarmup?: (opts: {
      roomId: string;
      password?: string;
      playerName: string;
      roomType?: 'warmup' | 'match';
      gameMode?: '1v1' | '2v2' | '3v3';
      botFillMode?: 'no_bots' | 'auto_fill' | 'bots_vs_humans' | 'custom';
      durationSeconds?: number;
      lobbyMode?: boolean;
      ghostMode?: 'automatically-enable' | 'manual';
    }) => Promise<boolean>;
    onJoinOnlineWarmup?: (opts: { roomId: string; password?: string; playerName: string }) => Promise<boolean>;
    onApprovePendingPeer?: (peerId: string) => void;
    onDeclinePendingPeer?: (peerId: string) => void;
    onLeaveOnlineServer?: () => Promise<void>;
    onRemovePlayer?: (carIndex: number) => Promise<void>;
    onReconnectSignaling?: () => Promise<void>;
    onForceStartOnlineMatch?: (durationSeconds?: number) => void;
    onSetOnlineGameMode?: (gameMode: '1v1' | '2v2' | '3v3') => void;
    onSetOnlineMatchDuration?: (durationSeconds: number) => void;
    onSetOnlineBotFillMode?: (botFillMode: 'no_bots' | 'auto_fill' | 'bots_vs_humans' | 'custom') => void;
    onAddOnlineBot?: (team?: number) => void;
    onSetClientReady?: (ready: boolean) => void;
    onVoteSkipReplay?: () => void;
    onVoteRematch?: (ready: boolean) => void;
    onSwitchOnlineRoleTeam?: (role: 'player' | 'spectator', team: number) => void;
    onReturnToOnlineLobby?: () => Promise<void> | void;
    onPauseOnlineMatch?: (pause: boolean, resumeCountdownSeconds?: number) => void;
    onResetBall?: () => void;
    onExportRecentTrainingReplay?: (durationSeconds?: number) => Promise<boolean> | boolean;
    onExportOnlineTrainingReplay?: (durationSeconds?: number) => Promise<boolean> | boolean;
    onCameraChange?: (config: CameraConfig) => void;
    onGraphicsChange?: (config: GraphicsConfig) => void;
    onAudioChange?: (config: AudioConfig) => void;
    onGameplayChange?: (config: GameplayConfig) => void;
    onTrajectoryChange?: (config: TrajectoryConfig) => void;
    onMaterialsChange?: (config: VisualMaterialsConfig) => void;
    onBoostPadTunerChange?: (config: BoostPadTunerConfig) => void;
    onDriftwoodsTunerChange?: (config: DriftwoodsTunerConfig) => void;
    onFreeCamToggle?: (enabled: boolean) => void;
    onFreeCamFovChange?: (fov: number) => void;
    onResetFreeCam?: () => void;
    onBindingsChange?: (bindings: InputBindingsConfig) => void;
    onClockPacingModeChange?: (mode: ClockPacingMode) => void;
    onClockPacingPriorityChange?: (priority: ClockPacingPriority) => void;
    onClockPacingParamsChange?: (params: ClockPacingParams) => void;
    onInputBufferTargetChange?: (target: number) => void;
    onInputBufferThresholdChange?: (range: [number, number]) => void;
    onEnsureDeterminism?: () => void;
    onEnsureNetworkDiagnostics?: () => void;
    onSimulateBoostPadCollect?: (padIndex: number | 'all') => void;
    onSimulateBoostPadRefill?: (padIndex: number | 'all', duration?: number) => void;
    onExperimentalWallConfigChange?: (config: ExperimentalWallFxConfig) => void;
    onShadowConfigChange?: (config: ShadowConfig) => void;
    onAnodizedPaintChange?: (config: AnodizedPaintTuning) => void;
    onBoostParticleConfigChange?: (config: BoostParticleRuntimeConfig) => void;
    onSkyboxConfigChange?: (config: SkyboxConfig) => void;
    onBallVisualConfigChange?: (config: BallVisualConfig) => void;
    onCustomVehicleTunerChange?: (vehicleId: string, hitboxPreset?: string) => void;
    onImportCustomVehicleGlb?: (
      vehicleId: string,
      arrayBuffer: ArrayBuffer,
      fileName?: string,
      alignPreset?: string,
    ) => Promise<unknown>;
    onApplyVehicleAlignPreset?: (vehicleId: string, alignPreset: string) => boolean;
    onUnderDevelopmentChange?: (config: UnderDevelopmentConfig, patch: Partial<UnderDevelopmentConfig>) => Promise<void> | void;
  };
  setBridge: (bridge: Partial<AppState['bridge']>) => void;
}
