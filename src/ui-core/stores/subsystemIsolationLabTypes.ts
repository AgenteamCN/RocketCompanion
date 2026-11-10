export type KickoffDuelModelId = 'ko_v2' | 'ko_v1' | 'nexto' | 'necto';
export type KickoffDuelChannelMode = 'keyboard_coupled' | 'ground_air_separated';

export interface KickoffDuelSoloResult {
  modelId: KickoffDuelModelId;
  shortName: string;
  hasOpponentObs: boolean;
  slotTicks: number[];
  avgTicks: number;
  avgSec: number;
}

export interface KickoffDuelSlotResult {
  slotIndex: number;
  slotCode: string;
  touchTick: number;
  touchSec: number;
  winner: 'BLUE' | 'ORANGE' | 'TIE' | 'NONE';
  blueDist: number;
  orangeDist: number;
  endBallX: number;
  endBallY: number;
  endBallVy: number;
  outcome: string;
}

export interface KickoffDuelPairResult {
  pairId: string;
  label: string;
  category: 'cross' | 'self';
  blue: KickoffDuelModelId;
  orange: KickoffDuelModelId;
  blueWins: number;
  orangeWins: number;
  ties: number;
  slots: KickoffDuelSlotResult[];
}

export interface KickoffDuelActionStepTrace {
  tick: number;
  timeSec: number;
  onGround: boolean;
  hasFlip: boolean;
  isFlipping: boolean;
  boostAmount: number;
  carPos: [number, number, number];
  carVel: [number, number, number];
  carSpeed: number;
  distToBall: number;
  discreteAct?: number[];
  keysLabel: string;
  controls: { throttle: number; steer: number; pitch: number; yaw: number; roll: number; jump: boolean; boost: boolean; handbrake: boolean };
  prevAct0: number;
}

export type DevTestLabTab =
  | 'probes'
  | 'multi-ghost'
  | 'state-replay'
  | '90s-match'
  | 'goal-replay'
  | 'kickoff-duel'
  | 'demolish-respawn';
export type IncidentOpponentMode = 'stationary' | 'nexto';
export type IncidentControlledCar = 0 | 1;
export type IncidentSpeedMultiplier = 100 | 200 | 300 | 400 | 500;

export interface SubsystemIsolationLabState {
  activeTab: DevTestLabTab;
  selectedTab: DevTestLabTab;

  // Bench 1: Predictive & Non-Predictive Probes
  probesEnabled: boolean;
  probeOffsetX: number;
  probeOffsetY: number;
  probeOffsetZ: number;
  probeBaseAltitudeZ: number;
  probePeakAltitudeZ: number;
  probeHoldTolerance: number;
  probeHoldDurationTicks: number;
  probeBoostZ: number;
  probeBoostVz: number;
  probeBoostPhase: string;
  probeBoostHoldTicks: number;
  probeRollDir: number;
  probeCameraTarget: 'player' | 'boost_probe' | 'qe_probe';

  // Bench 2: Dual/Multi-World Same-Map Ghost Sandbox
  dualWorldEnabled: boolean;
  activeWorldIndex: number;
  ghostWorldCount: 2 | 3 | 4;
  ghostCarsPerWorld: number;
  ghostOpacity: number;
  syncOtherWorldBall: boolean;

  // Bench 4: 90s Incident & Overtime Match Sandbox
  incidentMatchActive: boolean;
  incidentOpponentMode: IncidentOpponentMode;
  incidentControlledCar: IncidentControlledCar;
  incidentSpeedMultiplier: IncidentSpeedMultiplier;
  incidentMatchDurationSec: number;
  incidentDisableGoalReplay: boolean;
  incidentKickoffTimeoutSec: number;
  incidentKickoffCountdownSec: number;
  incidentClockStarted: boolean;
  incidentTicksSinceKickoff: number;
  incidentPhase: string;
  incidentBlueScore: number;
  incidentOrangeScore: number;
  incidentRemainingSec: number;
  incidentOvertime: boolean;
  incidentPossessionTeam: number;
  incidentPossessionBluePts: number;
  incidentPossessionOrangePts: number;

  // Bench 5: Goal Incident Event & Goal Replay Test + Podium Celebration Test
  goalReplayLookbackSec: number;
  goalReplayPostGoalSec: number;
  goalReplayMuteSignalAudio: boolean;
  goalReplayPhase: 'live' | 'post-goal-delay' | 'replaying' | 'podium';
  goalReplayCurrentFrameId: number;
  goalReplayLastKickoffFrameId: number;
  goalReplayIncidentFrameId: number;
  goalReplayRequestedStartFrameId: number;
  goalReplayEffectiveStartFrameId: number;
  goalReplayEffectiveEndFrameId: number;
  goalReplayClampedByKickoff: boolean;
  goalReplayPlaybackCursor: number;
  goalReplayPlaybackTotal: number;
  goalReplayPaused: boolean;
  goalReplaySpeed: number;
  goalReplayRecordedBufferCount: number;
  podiumActive: boolean;
  podiumWinningTeam: 0 | 1 | 2;

  // Bench 6: 4-Model Kickoff Duel Lab + Action & Channel Diagnostics
  kickoffDuelBlueModel: KickoffDuelModelId;
  kickoffDuelOrangeModel: KickoffDuelModelId;
  kickoffDuelSlotIndex: number; // 0: DR, 1: DL, 2: BR, 3: BL, 4: CT
  kickoffDuelCutoffDelaySec: number; // 0.0 | 0.5
  kickoffDuelAutoCycle: boolean;
  kickoffDuelAutoCycleAllPairs: boolean;
  kickoffDuelSpeedMultiplier: IncidentSpeedMultiplier;
  kickoffDuelKoV2UseOpponentObs: boolean;
  kickoffDuelNextoScripted: boolean;
  kickoffDuelChannelMode: KickoffDuelChannelMode;
  kickoffDuelPhase: string;
  kickoffDuelCurrentTick: number;
  kickoffDuelTouchTick: number;
  kickoffDuelTouchWinner: 'BLUE' | 'ORANGE' | 'TIE' | 'NONE';
  kickoffDuelInputsCutOff: boolean;
  kickoffDuelBlueDist: number;
  kickoffDuelOrangeDist: number;
  kickoffDuelBallPos: [number, number, number];
  kickoffDuelBallVel: [number, number, number];
  kickoffDuelBallSpeed: number;
  kickoffDuelBallOutcome: string;
  kickoffDuelBenchmarkRunning: boolean;
  kickoffDuelSoloResults: KickoffDuelSoloResult[];
  kickoffDuelMatrixResults: KickoffDuelPairResult[];
  kickoffDuelLiveBlueSteps: KickoffDuelActionStepTrace[];
  kickoffDuelLiveOrangeSteps: KickoffDuelActionStepTrace[];
  kickoffDuelDiagnosticRunning: boolean;
  kickoffDuelDiagnosticSummary: string;

  // Bench 7: Demolish & Respawn Isolation Test (Left/Right Handedness + Ghost Wheel Verification)
  demolishRespawnTeam: 0 | 1;
  demolishRespawnVisualId: string;
  demolishRespawnFreezeTimer: boolean;
  demolishRespawnAutoHoldDemo: boolean;
  demolishRespawnTimerDurationSec: number;
  demolishRespawnSelectedSlot: number; // -1 random, 0 Far Left, 1 Inner Left, 2 Inner Right, 3 Far Right
  demolishRespawnObstacleEnabled: boolean;
  demolishRespawnObstacleSlot: number;
  demolishRespawnIsDemolished: boolean;
  demolishRespawnRemainingSec: number;
  demolishRespawnPreviewSlotLabel: string;
  demolishRespawnPreviewCoords: [number, number, number];
  demolishRespawnPreviewYawDeg: number;
  demolishRespawnCarActualPos: [number, number, number];
  demolishRespawnWheelLocalY: number[];
  demolishRespawnLastInputEdge: string;

  // Actions
  setSelectedTab: (tab: DevTestLabTab) => void;
  applyAndRestartLab: (tab?: DevTestLabTab) => void;
  setActiveTab: (tab: DevTestLabTab) => void;
  setProbesEnabled: (enabled: boolean) => void;
  setProbeOffsets: (offsetX: number, offsetY: number, offsetZ: number) => void;
  setProbeOffsetX: (offsetX: number) => void;
  setProbeOffsetY: (offsetY: number) => void;
  setProbeOffsetZ: (offsetZ: number) => void;
  setProbeAltitudes: (baseZ: number, peakZ: number) => void;
  setProbeBaseAltitudeZ: (baseZ: number) => void;
  setProbePeakAltitudeZ: (peakZ: number) => void;
  resetProbeParameters: () => void;
  setProbeCameraTarget: (target: 'player' | 'boost_probe' | 'qe_probe') => void;
  setDualWorldEnabled: (enabled: boolean) => void;
  switchActiveWorld: () => void;
  setActiveWorldIndex: (idx: number) => void;
  setGhostWorldCount: (count: 2 | 3 | 4) => void;
  setGhostCarsPerWorld: (carsCount: number) => void;
  setGhostOpacity: (opacity: number) => void;
  setIncidentOpponentMode: (mode: IncidentOpponentMode) => void;
  setIncidentControlledCar: (carIdx: IncidentControlledCar) => void;
  switchIncidentControlledCar: () => void;
  setIncidentSpeedMultiplier: (mult: IncidentSpeedMultiplier) => void;
  setIncidentDisableGoalReplay: (disable: boolean) => void;
  setGoalReplayLookbackSec: (sec: number) => void;
  setGoalReplayPostGoalSec: (sec: number) => void;
  setGoalReplayMuteSignalAudio: (mute: boolean) => void;
  setKickoffDuelModels: (blue: KickoffDuelModelId, orange: KickoffDuelModelId) => void;
  setKickoffDuelSlotIndex: (slotIndex: number) => void;
  setKickoffDuelCutoffDelaySec: (sec: number) => void;
  setKickoffDuelAutoCycle: (enabled: boolean) => void;
  setKickoffDuelAutoCycleAllPairs: (enabled: boolean) => void;
  setKickoffDuelSpeedMultiplier: (mult: IncidentSpeedMultiplier) => void;
  setKickoffDuelKoV2UseOpponentObs: (enabled: boolean) => void;
  setKickoffDuelNextoScripted: (enabled: boolean) => void;
  setKickoffDuelChannelMode: (mode: KickoffDuelChannelMode) => void;
  restartKickoffDuel: () => void;
  runKickoffDuelBenchmark: () => void;
  exportKickoffDuelDiagnostics: (format: 'json' | 'csv', scope: 'live' | 'all_models_all_slots') => void;
  setDemolishRespawnTeam: (team: 0 | 1) => void;
  setDemolishRespawnVisualId: (visualId: string) => void;
  setDemolishRespawnFreezeTimer: (freeze: boolean) => void;
  setDemolishRespawnAutoHoldDemo: (autoHold: boolean) => void;
  setDemolishRespawnTimerDurationSec: (sec: number) => void;
  setDemolishRespawnObstacleEnabled: (enabled: boolean) => void;
  setDemolishRespawnObstacleSlot: (slotIndex: number) => void;
  triggerDemolishNow: () => void;
  forceRespawnNow: () => void;
  simulateDemolishSteerEdge: (direction: 'left' | 'right' | 'random') => void;
  selectDemolishRespawnSlot: (slotIndex: number) => void;
  updateLiveTelemetry: (patch: Partial<SubsystemIsolationLabState>) => void;

  // Runtime handlers
  runtimeHandlers: {
    onTabChange?: (tab: DevTestLabTab) => void;
    onProbesConfigChange?: () => void;
    onProbeCameraChange?: (target: 'player' | 'boost_probe' | 'qe_probe') => void;
    onDualWorldConfigChange?: () => void;
    onSwitchWorld?: (idx: number) => void;
    onStartIncidentMatch?: (opponentMode: IncidentOpponentMode) => void;
    onIncidentControlModeChange?: (opponentMode: IncidentOpponentMode) => void;
    onIncidentControlledCarChange?: (carIdx: IncidentControlledCar) => void;
    onIncidentSpeedMultiplierChange?: (mult: IncidentSpeedMultiplier) => void;
    onTriggerIncidentAction?: (
      action: 'score_blue' | 'score_orange' | 'force_overtime' | 'pause_5s' | 'add_possession_blue' | 'reset_kickoff' | 'podium_blue' | 'podium_orange' | 'podium_draw' | 'exit_podium'
    ) => void;
    onGoalReplayTriggerScenario?: (
      scenario: 'instant_kickoff_goal' | 'normal_play_goal' | 'trigger_goal_now' | 'emit_kickoff_signal' | 'start_replay_now' | 'stop_replay' | 'clear_replay_buffer' | 'export_replay_json'
    ) => void;
    onGoalReplayTogglePause?: () => void;
    onGoalReplayCycleSpeed?: () => void;
    onGoalReplaySeekNormalized?: (progress01: number) => void;
    onEnterPodiumTest?: (winningTeam: 0 | 1 | 2) => void;
    onExitPodiumTest?: () => void;
    onKickoffDuelRestart?: (slotIndex?: number) => void;
    onKickoffDuelSpeedChange?: (mult: IncidentSpeedMultiplier) => void;
    onKickoffDuelRunBenchmark?: () => void;
    onKickoffDuelExportDiagnostics?: (format: 'json' | 'csv', scope: 'live' | 'all_models_all_slots') => void;
    onDemolishRespawnTriggerDemo?: () => void;
    onDemolishRespawnForceRespawn?: () => void;
    onDemolishRespawnSimulateSteer?: (direction: 'left' | 'right' | 'random') => void;
    onDemolishRespawnSelectSlot?: (slotIndex: number) => void;
    onDemolishRespawnConfigChange?: () => void;
  };
  setRuntimeHandlers: (handlers: Partial<SubsystemIsolationLabState['runtimeHandlers']>) => void;
}

