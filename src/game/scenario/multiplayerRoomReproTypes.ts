/**
 * multiplayerRoomReproTypes.ts
 * Telemetry and diagnostic schemas for reproducing Multiplayer Host-a-Room and
 * Join-a-Room issues (Host AuthoritativeServerWorker timeline snap loop & input
 * starvation, entry vehicle pose & front/rear wheel height asymmetry, P2PWebRTCChannel
 * signaling & readonly measuredRttMs TypeError, and Client match entry failure).
 */

export type ReproRole = 'host' | 'client';
export type ReproRosterMode = '2p' | '2p2ai' | '3p3ai';

export interface ReproUrlConfig {
  readonly role: ReproRole | null;
  readonly rosterMode: ReproRosterMode;
  readonly roomCode: string;
  readonly speedMultiplier: number;
  readonly peerIndex: number;
  readonly bridgeSignalingAfterProbe: boolean;
}

export interface ReproSimCarPoseSample {
  readonly idx: number;
  readonly active: boolean;
  readonly team: number;
  readonly pos: readonly [number, number, number];
  readonly vel: readonly [number, number, number];
  readonly fwdZ: number;
  readonly upZ: number;
  readonly quat: readonly [number, number, number, number];
  readonly onGround: boolean;
  readonly contacts: readonly [boolean, boolean, boolean, boolean];
  readonly sus: readonly [number, number, number, number];
  readonly frontRearSusDelta: number;
}

export interface ReproMeshCarPoseSample {
  readonly idx: number;
  readonly preset: string;
  readonly hitbox: string;
  readonly meshY: number;
  readonly rot: readonly [number, number, number];
  readonly wheelHeightsY: readonly number[];
  readonly frontRearWheelHeightDeltaY: number;
}

export interface ReproNameTagSample {
  readonly carIndex: number;
  readonly name: string;
  readonly team: number;
  readonly isBot: boolean;
}

export interface ReproBallTrajectorySample {
  readonly isActive: boolean;
  readonly predictionCount: number;
  readonly maxObservedPredictionCount: number;
  readonly collapseToCatchupCount: number;
  readonly ballPosZ: number;
  readonly ballSpeed: number;
}

export interface ReproPoseAnomalyItem {
  readonly carIndex: number;
  readonly kind:
    | 'lobby_ghost_car_suspended_or_tilted'
    | 'front_rear_wheel_height_asymmetry'
    | 'chassis_pitch_tilt_on_ground'
    | 'lobby_diagnostic_probe_missing_or_misnamed'
    | 'host_car_takeover_or_reassigned'
    | 'missing_match_participant_car'
    | 'fallback_generic_car_name'
    | 'trajectory_prediction_reset_collapse';
  readonly description: string;
}

export interface ReproPoseProbeSnapshot {
  readonly stage: string;
  readonly role: ReproRole;
  readonly rosterMode: ReproRosterMode;
  readonly elapsedMs: number;
  readonly simTick: number;
  readonly matchMode: string;
  readonly matchPhase: string;
  readonly isLobbyDualWorld: boolean;
  readonly playerCarIndex: number;
  readonly simCars: readonly ReproSimCarPoseSample[];
  readonly meshCars: readonly ReproMeshCarPoseSample[];
  readonly nameTagEntries: readonly ReproNameTagSample[];
  readonly replayRosterNames: readonly ReproNameTagSample[];
  readonly ballTrajectory: ReproBallTrajectorySample;
  readonly anomalies: readonly ReproPoseAnomalyItem[];
}

export interface ReproReconcilerDesyncSample {
  readonly elapsedMs: number;
  readonly currentDelta: number;
  readonly targetDelta: number;
  readonly rollbackDepth: number;
  readonly serverTick: number;
  readonly rawLog: string;
}

export interface ReproInputStarvationSample {
  readonly elapsedMs: number;
  readonly carIndex: number;
  readonly tick: number;
  readonly totalStarvations: number;
  readonly rawLog: string;
}

export interface ReproHandshakeDiagnosticSnapshot {
  readonly role: ReproRole;
  readonly channelRole: string | null;
  readonly hasOwnIsHostProperty: boolean;
  readonly channelIsHostValue: boolean | undefined;
  readonly isCrossTab: boolean;
  readonly transportMode: string | null;
  readonly dataChannelReadyState: string | null;
  readonly measuredRttGetterOnly: boolean;
  readonly reconcilerHardSnapCount: number;
  readonly reconcilerCorrections: number;
  readonly reconcilerLobbyDualWorldMode: boolean;
  readonly hostRegisteredClientPeers: number;
}

export interface ReproRoleSummaryReport {
  readonly role: ReproRole;
  readonly peerIndex: number;
  readonly rosterMode: ReproRosterMode;
  readonly roomCode: string;
  readonly speedMultiplier: number;
  readonly elapsedMs: number;
  readonly reconcilerSnapLogCount: number;
  readonly inputStarvationLogCount: number;
  readonly readonlyRttTypeErrorCount: number;
  readonly enteredMatch: boolean;
  readonly finalMatchMode: string;
  readonly finalMatchPhase: string;
  readonly rawCrossTabJoinedBeforeBridge: boolean;
  readonly bridgedDataChannelOpened: boolean;
  readonly handshakeDiagnostics: ReproHandshakeDiagnosticSnapshot;
  readonly poseProbes: readonly ReproPoseProbeSnapshot[];
  readonly reconcilerSamples: readonly ReproReconcilerDesyncSample[];
  readonly starvationSamples: readonly ReproInputStarvationSample[];
  readonly caughtErrors: readonly string[];
}

export type ReproStreamEvent =
  | {
      readonly type: 'lifecycle';
      readonly role: ReproRole;
      readonly rosterMode: ReproRosterMode;
      readonly elapsedMs: number;
      readonly message: string;
    }
  | {
      readonly type: 'pose_probe';
      readonly probe: ReproPoseProbeSnapshot;
    }
  | {
      readonly type: 'reconciler_snap';
      readonly role: ReproRole;
      readonly rosterMode: ReproRosterMode;
      readonly sample: ReproReconcilerDesyncSample;
    }
  | {
      readonly type: 'input_starvation';
      readonly role: ReproRole;
      readonly rosterMode: ReproRosterMode;
      readonly sample: ReproInputStarvationSample;
    }
  | {
      readonly type: 'runtime_error';
      readonly role: ReproRole;
      readonly rosterMode: ReproRosterMode;
      readonly elapsedMs: number;
      readonly errorText: string;
    }
  | {
      readonly type: 'handshake_probe';
      readonly role: ReproRole;
      readonly rosterMode: ReproRosterMode;
      readonly elapsedMs: number;
      readonly diagnostics: ReproHandshakeDiagnosticSnapshot;
    }
  | {
      readonly type: 'role_summary';
      readonly summary: ReproRoleSummaryReport;
    };

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
  readonly dataChannel?: { readonly readyState?: string } | null;
  readonly acceptAnswerToken?: (answerToken: string) => Promise<boolean>;
}

export interface ReproProbeRuntimeView {
  readonly stop?: () => void;
  readonly renderFrame?: (timestamp?: number) => boolean;
  readonly pipeline?: {
    readonly executeSimulationOnly?: (timestamp: number) => void;
  } | null;
  readonly clockScheduler?: { gl?: unknown } | null;
  readonly renderSubsystem?: { update?: (ctx: { shouldSkipGpuRender?: boolean }) => void } | null;
  readonly setupAudio?: () => Promise<void>;
  readonly setupBot?: () => Promise<void>;
  readonly ballTrajectoryPredictor?: {
    readonly isActive?: boolean;
    readonly predictionCount?: number;
    readonly update?: (
      currentTick: number,
      liveBallPos: unknown,
      viewportWidth: number,
      viewportHeight: number,
      physics: unknown
    ) => void;
  } | null;
  readonly physics?: {
    readonly getHeaderView?: () => { readonly tickCount: number };
    readonly isCarSlotActive?: (carIndex: number) => boolean;
    readonly getCarStateView?: (carIndex: number) => ReproProbeCarView | null;
    readonly getBallStateView?: () => ReproProbeBallView | null;
    readonly setBallState?: (state: Record<string, unknown> | Float32Array | number[]) => unknown;
    readonly sim?: {
      readonly getHeaderView?: () => { readonly tickCount: number };
      readonly isCarSlotActive?: (carIndex: number) => boolean;
      readonly getCarStateView?: (carIndex: number) => ReproProbeCarView | null;
      readonly getBallStateView?: () => ReproProbeBallView | null;
      readonly setBallState?: (state: Record<string, unknown> | Float32Array | number[]) => unknown;
    } | null;
  } | null;
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
  } | null;
  readonly multiplayerSession?: {
    readonly hostController?: {
      readonly offerToken?: string;
      readonly channel?: ReproInspectableWebRtcChannel | null;
      readonly peerChannels?: ReadonlyMap<string, ReproInspectableWebRtcChannel>;
      readonly getConnectedPeerList?: () => ReadonlyArray<unknown>;
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
    readonly lobbyDualWorldMode?: boolean;
  } | null;
  readonly networkManager?: {
    readonly isLobbyDualWorldActive?: () => boolean;
    readonly sessionCoordinator?: {
      readonly authoritativeServer?: {
        readonly sim?: {
          readonly setBallState?: (
            state: Record<string, unknown> | Float32Array | number[]
          ) => unknown;
        } | null;
      } | null;
    } | null;
  } | null;
}
