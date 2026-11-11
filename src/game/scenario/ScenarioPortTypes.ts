/**
 * ScenarioPortTypes.ts
 * Structural port contracts for GameRuntime, AuthoritativeServerHost, BaseGameMode,
 * and MultiClientLoopbackSimulator consumed by declarative scenario scripts.
 */

import type { CarControlsInput } from '../../network/protocol/InputPacketCodec.ts';

export type PeerReplaySkipPolicy =
  | 'never'
  | 'immediate'
  | { mode: 'delayed_tick'; skipAfterReplayTicks: number; holdIntoKickoff?: boolean };

export interface VirtualPeerLoadoutSpec {
  peerId: string;
  playerName: string;
  carIndex: number;
  team: 0 | 1;
  visualId: string;
  hitboxId: string;
  colorSlot: number;
  paintFinish: 'matte' | 'metallic';
  boostVisual: 'gold-rush' | 'cartoon' | 'light-beam' | 'light-wave' | 'custom';
  boostAudio: 'rush' | 'standard' | 'flamethrower' | 'plasma';
  replaySkipPolicy?: PeerReplaySkipPolicy;
}

export interface MultiplayerLoopbackTelemetry {
  configuredCarCount: number;
  activePhysicalCars: number;
  visibleArenaCars: number;
  virtualPeersConnected: number;
  totalClientInputPacketsSent: number;
  totalClientInputBytesSent: number;
  totalServerFramePacketsReceived: number;
  totalServerFrameBytesReceived: number;
  totalSignalsDecoded: number;
  distinctSignalNames: string[];
  reconcilerCorrections: number;
  reconcilerSkippedCorrections: number;
  reconcilerHardSnaps: number;
  reconcilerMaxCorrectionDelta: number;
  loadoutsVerified: VirtualPeerLoadoutSpec[];
}

export type Vec3Tuple = [number, number, number];
export type Vec3Obj = { x: number; y: number; z: number };
export type KinematicPatch = {
  pos?: Vec3Tuple;
  vel?: Vec3Tuple;
  angVel?: Vec3Tuple;
  boost?: number;
  fwd?: Vec3Tuple;
  right?: Vec3Tuple;
  up?: Vec3Tuple;
  isOnGround?: boolean;
  isFlipping?: boolean;
  isSupersonic?: boolean;
};

export interface ScenarioActiveModePort {
  isReplayActive?: boolean;
  replayCameraMode?: string;
  goalResetTicks?: number;
  isGoalReplayActive?(): boolean;
  setReplayCameraMode?(mode: string): void;
  skipGoalReplay?(): void;
  resetToCleanFreeplay?(): void;
  directorPreview?: {
    isReplayActive?: boolean;
    replayCameraMode?: string;
    setReplayCameraMode?(m: string): void;
  } | null;
  standaloneReplayViewer?: {
    isActive?: boolean;
    hasLoadedReplay?: boolean;
    loadReplayFromBytes?(b: Uint8Array, name?: string): Promise<boolean> | boolean;
    handleLoadRetainedMatchReplay(): void;
    startPlayback?(): void;
    startPlaying(): void;
    beginInterventionPreRoll?(): void;
    selectPovCarSlot?(s: number): void;
    selectPovSlot?(s: number): void;
    rosterSubController?: {
      resolvedRoster: Array<{ slotKey: number; carIndex: number }>;
      activePovCarIndex: number;
    };
    takeoverSubController?: { cursor?: number; getViewerState?(): string };
  } | null;
  replayRingBuffer?: {
    capacityTicks?: number;
    mode?: string;
    appendSignal?(
      t: number,
      sig: { signalType: number; frameId: number; param1: number; param2: number }
    ): void;
    getFrames?(): ReadonlyArray<{
      signals?: ReadonlyArray<{ signalType?: number; type?: number }>;
    }>;
  } | null;
  goalAndTouch?: { goalResetTicks?: number; getEffectiveGoalResetTicks?(): number } | null;
  rewinderController?: {
    startNewRecording?(): void;
    stopRecording?(): void;
    seekFrame?(f: number): void;
    resumeFromCursor?(): void;
    _returnToLivePlayFromScrub?(): void;
  } | null;
}

export interface ScenarioServerPlayerEntry {
  sessionId: string;
  entityId: number;
  name: string;
  role: string;
  team: number;
  isBot?: boolean;
  botType?: string;
  visualId?: string;
  hitboxId?: string;
  colorSlot?: number;
  ready?: boolean;
  spawnSlot?: number;
}

export interface ScenarioAuthoritativeServerPort {
  active?: boolean;
  isWorker?: boolean;
  lastServerTick?: number;
  cachedSnapshot?: Float32Array;
  lastRoomState?: {
    phase?: string;
    matchState?: string;
    gameMode?: string;
    botFillMode?: string;
    score?: { blue?: number; orange?: number };
    players?: ScenarioServerPlayerEntry[];
    roster?: { players?: Array<Record<string, unknown>> };
  } | null;
  botTunnelManager?: {
    botPeers?: Map<
      string,
      {
        sessionId: string;
        carIndex: number;
        team: number;
        botType: string;
        agent?: { isReady?: boolean } | null;
      }
    >;
    registeredTunnels?: Map<
      string,
      { sessionId: string; carIndex: number; team: number; botType: string }
    >;
    syncFromRoomState?(rs: Record<string, unknown> | null): void;
  } | null;
  hostReplayRingBuffer?: {
    mode?: string;
    capacityTicks?: number;
    size?: number;
    getFrames?(): ReadonlyArray<{
      tick: number;
      signals?: ReadonlyArray<{ signalType?: number; type?: number }>;
    }>;
  } | null;
  enterStateOnlyMode?(snap: Float32Array | null, tick: number): void;
  beginInterveneCountdown?(seconds: number, snap: Float32Array | null): void;
  resumePhysicsFromState?(snap: Float32Array | null, tick: number): void;
  requestFullReplayExport?(): Promise<{ frameCount?: number; frames?: unknown[] } | null>;
  onRoomStateChange?(rs: unknown): void;
  setGameMode?(gameMode: string, durationSeconds?: number | null): void;
  setBotFillMode?(botFillMode: string, botType?: string): void;
  addBotPlayer?(
    team?: number,
    botName?: string | null,
    visualId?: string | Record<string, unknown>,
    botType?: string
  ): void;
  switchRoleTeam?(sessionId: string | null, role: string, team: number): void;
  initiateMatchPrepare?(durationSeconds?: number): void;
  forceStartMatch?(durationSeconds?: number): void;
  startMatch?(durationSeconds?: number): void;
  pauseMatch?(paused?: boolean): void;
  requestResumeWithCountdown?(countdownSeconds?: number): void;
  setSkipReplayByDefault?(enabled: boolean): void;
  setDisableGoalReset?(disabled: boolean): void;
  startTrainingMode?(opts?: Record<string, unknown>): void;
  configureTrainingRuleset?(opts?: Record<string, unknown>): void;
  fallbackSim?: {
    setBallState?(s: KinematicPatch): void;
    setCarState?(carIndex: number, s: KinematicPatch): void;
    saveCompactState?(): Float32Array;
    getCarStateView?(
      carIndex: number
    ): { isDemoed?: boolean | number; posZ?: number; isJumping?: boolean | number } | null;
  } | null;
  fallbackPhysics?: {
    activeCarIndices?: Set<number>;
    jumpSuppressedCarIndices?: Set<number>;
    inputBuffer?: { maxReceivedTickByCar?: Map<number, number> } | null;
    lastAcknowledgedControls?: Map<number, Record<string, unknown>>;
  } | null;
  fallbackManager?: {
    removePlayerSession(sid: string): void;
    buildRosterSnapshot(): unknown;
    destroy?(): void;
    physicsManager?: {
      activeCarIndices?: Set<number>;
      sim?: {
        getCarStateView?(carIndex: number): { posX: number; posY: number; posZ: number } | null;
      } | null;
    } | null;
    domain?: {
      phase?: string;
      state?: string;
      matchTick?: number;
      gameMode?: string;
      botFillMode?: string;
      scoreBlue?: number;
      scoreOrange?: number;
      blueScore?: number;
      orangeScore?: number;
      remainingSeconds?: number;
      clockSecondsRemaining?: number;
      clockStarted?: boolean;
      isOvertime?: boolean;
      pendingMatchEndAfterGoal?: boolean;
      goalBufferTicks?: number;
      skipReplayByDefault?: boolean;
      winner?: number | null;
      isTrainingMode?: boolean;
      stateOnlyMode?: boolean;
      interveneTargetTick?: number;
      trainingDisableGoalReset?: boolean;
      players?: Map<string, ScenarioServerPlayerEntry>;
    } | null;
    roster: {
      players: Map<string, ScenarioServerPlayerEntry>;
      addBotPlayer?(
        team?: number,
        name?: string | null,
        visualId?: string | Record<string, unknown> | null,
        botType?: string
      ): unknown;
      setBotFillMode?(mode: string, botType?: string): void;
      applyBotFillPolicy(): void;
      syncRosterPhysicsEntities(): void;
      applyRosterKickoffSpawns(): void;
    };
    commandQueue?: {
      skipReplayVotes?: Set<string>;
      replaySignalLog?: Array<{ signalType: number }>;
    } | null;
    goalReplay?: { finishGoalReplay?(): void } | null;
    replayBuffer?: { capacity?: number; mode?: string; size?: number } | null;
    trainingSession?: {
      activeCarSlots?: number[];
      maxExtraCars?: number;
      configureRuleset?(cfg?: Record<string, unknown>): void;
      spawnExtraCar?(opts?: Record<string, unknown>): {
        carIndex: number;
        evictedCarIndex: number | null;
      };
      clearExtraCars?(): void;
    } | null;
    systemControl?: { isStateOnlyMode?: boolean; lastSystemControlSignal?: number } | null;
  } | null;
}

export interface ScenarioRuntimePort {
  running?: boolean;
  playerCarIndex?: number;
  lastSystemControlSignal?: number;
  selectedPreset?: string;
  selectedHitbox?: string | null;
  _localSkipReplayReady?: boolean;
  trainingOptions?: {
    boostOption?: string;
    disableGoalReset?: boolean;
    [key: string]: unknown;
  } | null;
  ballTrajectoryPredictor?: {
    forcePredictAnyMovement?: boolean;
    setRuntimeOverride?(ov: { enabled: boolean } | null): void;
    updateSettings?(patch: { enabled?: boolean }): void;
    anomalyRecorder?: { tickHistory?: readonly unknown[] } | null;
  } | null;
  stop(): void;
  start?(): void;
  resetKickoff?(seed?: number): void;
  isGoalReplayCameraOverrideActive?(): boolean;
  replayTimelineController?: { setCameraMode?(mode: string): void } | null;
  podiumController?: { isActive?: boolean } | null;
  loadoutCoordinator?: {
    changePlayerVehicle(v: string, h?: string | null): void;
    setCarColor(i: number, c: number | string, b?: boolean): void;
  } | null;
  renderer?: {
    getContext?(): WebGLRenderingContext | WebGL2RenderingContext | null;
    info?: {
      programs?: unknown[];
      render?: { calls?: number; triangles?: number };
      memory?: { geometries?: number; textures?: number };
    };
  } | null;
  camera?: {
    mode?: string;
    currentMode?: string;
    isEditorOverrideActive?: boolean;
    isFreeCam?: boolean;
    camera?: { position?: Vec3Obj; quaternion?: Vec3Obj & { w: number } };
  } | null;
  keyboard?: { read?(): CarControlsInput } | null;
  inputStage?: { update?(ctx: unknown): void } | null;
  simulationStage?: {
    update?(ctx: unknown): void;
    getCarActionState?(carIdx: number): {
      boostLatched?: boolean;
      hasSingleJumped?: boolean;
      hasAirJumped?: boolean;
    };
  } | null;
  gameplayModeStage?: { update?(ctx: unknown): void } | null;
  presentationStage?: { update?(ctx: unknown): void } | null;
  audioStage?: { update?(ctx: unknown): void } | null;
  renderSubsystem?: { update?(ctx: unknown): void } | null;
  telemetryStage?: { update?(ctx: unknown): void } | null;
  interpolator?: { sync?(nowMs: number): void } | null;
  arena?: {
    isLobbyMode?: boolean;
    isHostLobby?: boolean;
    cars?: Array<({ visible: boolean; position?: Vec3Obj } & Record<string, unknown>) | null>;
    vehiclePresets?: Array<string | null>;
    carWheels?: Array<Array<{
      steer?: { position?: Vec3Obj; rotation?: { y: number } };
      spin?: { rotation?: { z: number } };
    }> | null>;
    carWheelSpecs?: Array<Array<Vec3Tuple> | null>;
    carHitboxes?: Array<{
      position?: Vec3Obj;
      geometry?: { parameters?: { width?: number; height?: number; depth?: number } };
    } | null>;
    vehicleRegistry?: {
      carWheelSpecs?: Array<Array<Vec3Tuple> | null>;
      carHitboxes?: Array<{
        position?: Vec3Obj;
        geometry?: { parameters?: { width?: number; height?: number; depth?: number } };
      } | null>;
    } | null;
    carBoosts?: Array<
      Array<{
        nozzleLocal?: Vec3Obj;
        offset?: Vec3Obj;
        physics?: { driveParticlesActive?: boolean; trailParticlesActive?: boolean };
        goldRush?: { driveParticlesActive?: boolean; trailParticlesActive?: boolean };
      }>
    >;
  } | null;
  authoritativeServer?: ScenarioAuthoritativeServerPort | null;
  networkReconciler?: {
    replayPlaybackMode?: boolean;
    localSkipReplayReady?: boolean;
    correctionCount?: number;
    skippedCorrectionCount?: number;
    hardSnapCount?: number;
    maxCorrectionDelta?: number;
    reconcile?(now?: number): void;
    syncTimeline?(s: Float32Array | null, t: number, n?: number): void;
  } | null;
  networkManager?: {
    isLobbyDualWorldActive?(): boolean;
    startOnlineServer?(opts?: Record<string, unknown>): Promise<unknown>;
    stopOnlineServer?(opts?: Record<string, unknown>): Promise<void> | void;
    forceStartOnlineMatch?(durationSeconds?: number): void;
    setOnlineGameMode?(gameMode?: string, durationSeconds?: number | null): void;
    setOnlineBotFillMode?(botFillMode?: string, botType?: string): void;
    addOnlineBot?(
      team?: number | null,
      botName?: string | null,
      visualId?: string | null,
      botType?: string
    ): void;
    setClientReady?(ready?: boolean): void;
    voteSkipReplay?(): void;
    diagnosticsProbe?: {
      lobbyGhostMode?: boolean;
      diagnosticsFleetController?: { enabled?: boolean } | null;
      spawnDiagnosticTestFleet?(): Promise<{ enabled?: boolean } | null>;
      sampleDiagnosticFleetTelemetry?(): {
        enabled?: boolean;
        car6?: { active?: boolean };
        car7?: { active?: boolean };
      } | null;
      despawnDiagnosticTestFleet?(): void;
      dumpLatestNetworkPacket?(): unknown;
    } | null;
    sessionCoordinator?: {
      hostOnlineServer?(opts: Record<string, unknown>): Promise<unknown>;
      stopOnlineServer?(opts?: { rebindLoopback?: boolean }): Promise<void> | void;
      enableNetworkPrediction?(
        enabled: boolean,
        opts?: { forceFallback?: boolean }
      ): Promise<unknown> | unknown;
    } | null;
  } | null;
  modeManager: { setActiveMode(mode: string): void; getActiveMode(): ScenarioActiveModePort };
  match?: {
    state?: {
      phase?: string;
      mode?: string;
      isOvertime?: boolean;
      overtime?: boolean;
      winner?: string | null;
      blueScore?: number;
      orangeScore?: number;
      score?: { blue?: number; orange?: number };
    } | null;
  } | null;
  physics?: {
    numCars: number;
    addCar?(team: number, preset: string): number | void;
    resetKickoff?(seed?: number): void;
    setControls?(carIndex: number, controls: Partial<CarControlsInput>): void;
    step?(ticks?: number): void;
    getCarStateView?(carIndex: number): {
      posX: number;
      posY: number;
      posZ: number;
      velX: number;
      velY: number;
      velZ: number;
      boost: number;
      isOnGround: boolean | number;
      isJumping?: boolean | number;
    } | null;
    setBallState?(s: KinematicPatch): void;
    setCarState?(carIndex: number, s: KinematicPatch): void;
    saveCompactState?(): Float32Array;
  } | null;
}

export interface ScenarioLoopbackSimulatorPort {
  isActive(): boolean;
  startSixCarLoopbackSession(durationSeconds?: number): Promise<void>;
  connectVirtualPeers?(specs: readonly VirtualPeerLoadoutSpec[]): Promise<void>;
  setPeerReplaySkipPolicy?(peerIdOrAll: string, policy: PeerReplaySkipPolicy): void;
  setPeerControlsOverride?(peerIdOrAll: string, controls: Partial<CarControlsInput> | null): void;
  broadcastClientCommand?(commandType: number, param1?: number, param2?: number): void;
  triggerForceStartMatch(durationSeconds?: number): void;
  collectTelemetry(): MultiplayerLoopbackTelemetry;
  stop(): Promise<void> | void;
}
