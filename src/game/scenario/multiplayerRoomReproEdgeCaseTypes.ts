/**
 * multiplayerRoomReproEdgeCaseTypes.ts
 * Type contracts for selective probe execution, network/physics simulation
 * sweeps, runtime inspection ports, and the online investigation edge-case probes:
 * - Stage 1 (lobby-goal-reset): Client Lobby dual-world goal scored & ball reset
 * - Stage 2 (network-latency-hud): 50ms/50ms latency + bandwidth + tab-blur HUD ping
 * - Stage 3 (goal-replay-kickoff-freeze): 2-goal -> Replay -> KICKOFF_WILL_START/START
 * - Stage 4 (physics-rate-sweep): Variable physics step rate (60Hz..144Hz) & timeScale
 */

export type ReproRole = 'host' | 'client';
export type ReproRosterMode = '2p' | '2p2ai' | '3p3ai';

export type ReproProbeId =
  | 'lobby-probes'
  | 'lobby-goal-reset'
  | 'network-latency-hud'
  | 'trajectory'
  | 'goal-replay-director'
  | 'goal-replay-kickoff-freeze'
  | 'physics-rate-sweep'
  | 'host-takeover';

export const ALL_REPRO_PROBE_IDS: readonly ReproProbeId[] = Object.freeze([
  'lobby-probes',
  'lobby-goal-reset',
  'network-latency-hud',
  'trajectory',
  'goal-replay-director',
  'goal-replay-kickoff-freeze',
  'physics-rate-sweep',
  'host-takeover',
]);

export interface ReproLobbyGoalResetDiagnosticSnapshot {
  readonly role: ReproRole;
  readonly rosterMode: ReproRosterMode;
  readonly elapsedMs: number;
  readonly isLobbyDualWorld: boolean;
  readonly initialBallPos: [number, number, number];
  readonly injectedGoalPosY: number;
  readonly maxObservedAbsBallY: number;
  readonly postWaitBallPos: [number, number, number];
  readonly ticksObserved: number;
  readonly ballResetToCenterObserved: boolean;
  readonly ballStuckInGoal: boolean;
}

export interface ReproNetworkLatencyHudDiagnosticSnapshot {
  readonly role: ReproRole;
  readonly rosterMode: ReproRosterMode;
  readonly elapsedMs: number;
  readonly injectedUplinkMs: number;
  readonly injectedDownlinkMs: number;
  readonly targetBandwidthKbps: number;
  readonly channelRttMsBeforePing: number;
  readonly channelMeasuredRttMsAfterPing: number;
  readonly reconcilerRttMs: number;
  readonly pingsSentDelta: number;
  readonly pongsReceivedDelta: number;
  readonly bytesSent: number;
  readonly bytesReceived: number;
  readonly realizedThroughputKbps: number;
  readonly hudPeerPingBeforeBlurMs: number | null;
  readonly hudPeerPingDuringPowerSaveMs: number | null;
  readonly hudDroppedToHardcoded18Ms: boolean;
  readonly pingTraversedSimulator: boolean;
}

export interface ReproGoalTransitionSample {
  readonly goalIndex: number;
  readonly preGoalServerTick: number;
  readonly celebrationObserved: boolean;
  readonly replayObserved: boolean;
  readonly maxServerTickDuringReplay: number;
  readonly kickoffObserved: boolean;
  readonly serverTickAtKickoffWillStart: number;
  readonly tickRegressedAfterReplay: boolean;
  readonly playingResumed: boolean;
  readonly serverTickAtPlayingResumed: number;
  readonly kickoffFallbackWarnDelta: number;
  readonly reconcilerSnapDelta: number;
  readonly rollbackBudgetExhaustedDelta: number;
  readonly durationMs: number;
}

export interface ReproGoalReplayKickoffFreezeDiagnosticSnapshot {
  readonly role: ReproRole;
  readonly rosterMode: ReproRosterMode;
  readonly elapsedMs: number;
  readonly goalsAttempted: number;
  readonly goalsCompletedToPlaying: number;
  readonly anyTickRegressionDetected: boolean;
  readonly totalKickoffFallbackWarnings: number;
  readonly clientFrozenAfterReplay: boolean;
  readonly samples: ReproGoalTransitionSample[];
}

export interface ReproPhysicsRateStepSample {
  readonly targetHz: number;
  readonly durationMs: number;
  readonly startTick: number;
  readonly endTick: number;
  readonly realizedRateHz: number;
  readonly reconcilerTimeScale: number;
  readonly meanLeadTicks: number;
  readonly meanBufferTicks: number;
  readonly hardSnapDelta: number;
  readonly starvationDelta: number;
}

export interface ReproPhysicsRateSweepDiagnosticSnapshot {
  readonly role: ReproRole;
  readonly rosterMode: ReproRosterMode;
  readonly elapsedMs: number;
  readonly requestedHzSteps: number[];
  readonly minRealizedHz: number;
  readonly maxRealizedHz: number;
  readonly totalHardSnapsAcrossSweep: number;
  readonly totalStarvationsAcrossSweep: number;
  readonly steps: ReproPhysicsRateStepSample[];
}

export interface ReproProbeCarView {
  readonly isActive: boolean;
  readonly team: number;
  readonly posX: number;
  readonly posY: number;
  readonly posZ: number;
  readonly velX: number;
  readonly velY: number;
  readonly velZ: number;
  readonly fwdZ: number;
  readonly upZ: number;
  readonly quatX: number;
  readonly quatY: number;
  readonly quatZ: number;
  readonly quatW: number;
  readonly isOnGround: boolean | number;
  readonly getWheelContact: (wheelIndex: number) => boolean;
  readonly getWheelSusLength: (wheelIndex: number) => number;
}

export interface ReproProbeBallView {
  readonly posX: number;
  readonly posY: number;
  readonly posZ: number;
  readonly velX: number;
  readonly velY: number;
  readonly velZ: number;
}

export interface ReproTrajectoryObservationWindow {
  readonly maxObservedPredictionCount: number;
  readonly collapseToCatchupCount: number;
}

export interface ReproInspectableWebRtcChannel {
  readonly role?: string;
  readonly isHost?: boolean;
  readonly isCrossTab?: boolean;
  readonly transportMode?: string;
  readonly answerToken?: string;
  readonly rttMs?: number;
  readonly measuredRttMs?: number;
  readonly extraUplinkMs?: number;
  readonly extraDownlinkMs?: number;
  readonly dataChannel?: { readonly readyState?: string } | null;
  readonly acceptAnswerToken?: (answerToken: string) => Promise<boolean>;
  readonly setAsymmetricLatency?: (uplinkMs: number, downlinkMs: number) => void;
  readonly setExtraLatency?: (latencyMs: number) => void;
  readonly setJitter?: (jitterMs: number) => void;
  readonly setPacketLossRate?: (lossRate: number) => void;
  readonly transport?: {
    readonly sendPing?: () => void;
  } | null;
  readonly simulator?: {
    readonly rttMs?: number;
    readonly measuredRttMs?: number;
    readonly stats?: {
      readonly packetsSent?: number;
      readonly packetsReceived?: number;
      readonly packetsDropped?: number;
      readonly bytesSent?: number;
      readonly bytesReceived?: number;
      readonly pingsSent?: number;
      readonly pongsReceived?: number;
    };
  } | null;
}

export interface ReproProbePhysicsView {
  readonly state?: Float32Array | null;
  readonly ballStateWriteRevision?: number;
  readonly getActiveCarMask?: () => number;
  readonly getHeaderView?: () => { readonly tickCount: number };
  readonly isCarSlotActive?: (carIndex: number) => boolean;
  readonly getCarStateView?: (carIndex: number) => ReproProbeCarView | null;
  readonly getBallStateView?: () => ReproProbeBallView | null;
  readonly setBallState?: (state: Record<string, unknown> | Float32Array | number[]) => unknown;
  readonly sim?: ReproProbePhysicsView | null;
}

export interface ReproProbeRuntimeView {
  readonly stop?: () => void;
  readonly renderFrame?: (timestamp?: number) => boolean;
  readonly pipeline?: { readonly executeSimulationOnly?: (timestamp: number) => void } | null;
  readonly clockScheduler?: { gl?: unknown } | null;
  readonly renderSubsystem?: { update?: (ctx: { shouldSkipGpuRender?: boolean }) => void } | null;
  readonly setupAudio?: () => Promise<void>;
  readonly setupBot?: () => Promise<void>;
  readonly playerCarIndex?: number;
  readonly selectedPreset?: string;
  readonly selectedHitbox?: string | null;
  readonly selectedColorSlot?: number | null;
  readonly replayTimelineController?: unknown;
  readonly ballTrajectoryPredictor?: {
    forcePredictAnyMovement?: boolean;
    readonly isActive?: boolean;
    readonly predictionCount?: number;
    readonly settings?: {
      readonly enabled?: boolean;
      readonly predictionTicks?: number;
      readonly catchupTicksPerFrame?: number;
    };
    readonly sampler?: { readonly lastUpdateKind?: string };
    readonly updateSettings?: (patch: { enabled?: boolean }) => void;
    readonly setSceneContext?: (ctx: {
      isGoalReplayActive?: boolean;
      isPodiumActive?: boolean;
    }) => void;
    readonly update?: (
      currentTick: number,
      liveBallPos: unknown,
      viewportWidth: number,
      viewportHeight: number,
      physics: unknown
    ) => void;
  } | null;
  readonly physics?: ReproProbePhysicsView | null;
  readonly arena?: {
    readonly playerCarIndex?: number;
    readonly ball?: { readonly position?: unknown } | null;
    readonly cars?: ReadonlyArray<{
      readonly visible?: boolean;
      readonly position?: { readonly y?: number };
      readonly rotation?: { readonly x?: number; readonly y?: number; readonly z?: number };
    } | null>;
    readonly vehiclePresets?: ReadonlyArray<string | null>;
    readonly carHitboxes?: ReadonlyArray<{
      readonly userData?: { readonly hitboxId?: string };
    } | null>;
    readonly carWheels?: ReadonlyArray<ReadonlyArray<{
      readonly steer?: { readonly position?: { readonly y?: number } };
      readonly mount?: { readonly position?: { readonly y?: number } };
    } | null> | null>;
  } | null;
  readonly match?: {
    readonly state?: {
      readonly mode?: string;
      readonly phase?: string;
      readonly blueScore?: number;
      readonly orangeScore?: number;
    } | null;
  } | null;
  readonly matchPort?: {
    readonly hostOnlineWarmup?: (opts: {
      roomId: string;
      password?: string;
      playerName?: string;
      roomType?: string;
      gameMode?: string;
      botFillMode?: string;
      durationSeconds?: number;
      lobbyMode?: boolean;
    }) => Promise<boolean>;
    readonly joinOnlineWarmup?: (opts: {
      roomId: string;
      password?: string;
      playerName?: string;
    }) => Promise<boolean>;
    readonly forceStartOnlineMatch?: (durationSeconds?: number) => void;
    readonly switchOnlineRoleOrTeam?: (role?: string, team?: number) => void;
    readonly voteSkipOnlineReplay?: () => void;
  } | null;
  readonly multiplayerSession?: {
    readonly hostController?: {
      readonly offerToken?: string;
      readonly channel?: ReproInspectableWebRtcChannel | null;
      readonly peerChannels?: ReadonlyMap<string, ReproInspectableWebRtcChannel>;
      readonly getConnectedPeerList?: () => ReadonlyArray<{
        readonly id?: string;
        readonly carIndex?: number;
        readonly pingMs?: number;
      }>;
    } | null;
    readonly clientJoinNegotiator?: {
      readonly clientController?: {
        readonly answerToken?: string;
        readonly channel?: ReproInspectableWebRtcChannel | null;
      } | null;
    } | null;
  } | null;
  readonly networkReconciler?: {
    readonly hardSnapCount?: number;
    readonly correctionCount?: number;
    readonly rollbackBudgetExhaustedCount?: number;
    readonly lobbyDualWorldMode?: boolean;
    readonly replayPlaybackMode?: boolean;
    readonly lastAuthoritativeTick?: number;
    readonly currentTick?: number;
    readonly timeScale?: number;
    readonly metrics?: {
      readonly rttMs?: number;
      readonly leadTicks?: number;
      readonly bufferTicks?: number;
    } | null;
  } | null;
  readonly networkManager?: {
    readonly isLobbyDualWorldActive?: () => boolean;
    readonly voteSkipReplay?: () => void;
    readonly serverWorker?: {
      readonly postMessage?: (msg: Record<string, unknown>) => void;
    } | null;
    readonly diagnosticsProbe?: {
      readonly diagnosticsFleetController?: { readonly enabled?: boolean } | null;
      readonly spawnDiagnosticTestFleet?: (opts?: {
        anchorMode?: string | null;
      }) => Promise<unknown>;
    } | null;
    readonly rosterSyncCoordinator?: {
      readonly lastRosterSnapshot?: {
        readonly players?: ReadonlyArray<{
          readonly sessionId?: string;
          readonly entityId?: number;
          readonly name?: string;
          readonly isBot?: boolean;
          readonly team?: number;
        }>;
      } | null;
    } | null;
    readonly sessionCoordinator?: {
      readonly authoritativeServer?: {
        readonly sim?: ReproProbePhysicsView | null;
      } | null;
    } | null;
  } | null;
}
