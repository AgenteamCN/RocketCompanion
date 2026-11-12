/**
 * multiplayerRoomReproTypes.ts
 * Telemetry and diagnostic schemas for reproducing Multiplayer Host-a-Room and
 * Join-a-Room issues (Host AuthoritativeServerWorker timeline snap loop & input
 * starvation, entry vehicle pose & front/rear wheel height asymmetry, P2PWebRTCChannel
 * signaling & readonly measuredRttMs TypeError, and Client match entry failure).
 */

import type {
  ReproGoalReplayKickoffFreezeDiagnosticSnapshot,
  ReproLobbyGoalResetDiagnosticSnapshot,
  ReproNetworkLatencyHudDiagnosticSnapshot,
  ReproPhysicsRateSweepDiagnosticSnapshot,
  ReproProbeId,
  ReproRole,
  ReproRosterMode,
} from './multiplayerRoomReproEdgeCaseTypes.ts';

export type { ReproRole, ReproRosterMode };

export interface ReproUrlConfig {
  readonly role: ReproRole | null;
  readonly rosterMode: ReproRosterMode;
  readonly roomCode: string;
  readonly speedMultiplier: number;
  readonly peerIndex: number;
  readonly bridgeSignalingAfterProbe: boolean;
  readonly enabledProbes: readonly ReproProbeId[];
  readonly latencyMs: number;
  readonly bandwidthKbps: number;
  readonly physicsHzSteps: readonly number[];
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

export interface ReproLobbyProbeDiagnosticSnapshot {
  readonly role: ReproRole;
  readonly rosterMode: ReproRosterMode;
  readonly elapsedMs: number;
  readonly fleetControllerEnabled: boolean;
  readonly serverActiveCarMask: number;
  readonly serverCar6BitActive: boolean;
  readonly serverCar7BitActive: boolean;
  readonly car6MeshVisible: boolean;
  readonly car7MeshVisible: boolean;
  readonly car6ResolvedNameTag: string | null;
  readonly car7ResolvedNameTag: string | null;
  readonly expectedCar6NameTag: 'Boost';
  readonly expectedCar7NameTag: 'Roll';
  readonly hostProbeNamesMismatch: boolean;
  readonly clientCannotSeeHostProbes: boolean;
}

export interface ReproRosterVisibilityAndNameTagSnapshot {
  readonly stage: string;
  readonly role: ReproRole;
  readonly rosterMode: ReproRosterMode;
  readonly elapsedMs: number;
  readonly uiLocalTeamDefault: string;
  readonly uiLobbyPeersPropPassed: boolean;
  readonly connectedPeerCount: number;
  readonly localPlayerCarIndex: number;
  readonly visibleCarIndices: readonly number[];
  readonly clientCar1Visible: boolean;
  readonly nameTagCarEntries: ReadonlyArray<{
    readonly carIndex: number;
    readonly name: string;
    readonly isBot: boolean;
  }>;
  readonly forcedGenericCarNamesDetected: boolean;
  readonly hostMissingClientVisibility: boolean;
}

export interface ReproHostTakeoverDiagnosticSnapshot {
  readonly rosterMode: ReproRosterMode;
  readonly elapsedMs: number;
  readonly maxPlayers: number;
  readonly botFillMode: string;
  readonly uiDefaultLocalTeam: string;
  readonly activeBotCountInMatch: number;
  readonly botFillRunsInMode: boolean;
  readonly neutralTeamSwitchMovesHostToSpectator: boolean;
  readonly botFillTakesOverCar0WhenHostNeutralSwitched: boolean;
  readonly hostLocalCarIndexStillZero: boolean;
  readonly car0AssignedEntityAfterNeutralSwitch: string | null;
}

export interface ReproTrajectoryPredictorOnlineSample {
  readonly sampleIndex: number;
  readonly elapsedMs: number;
  readonly simTick: number;
  readonly ballPosZ: number;
  readonly ballVelZ: number;
  readonly ballStateWriteRevision: number;
  readonly reconcilerCorrectionCount: number;
  readonly predictionCount: number;
  readonly maxPredictionTicks: number;
  readonly catchupTicksPerFrame: number;
  readonly lastUpdateMode: string;
}

export interface ReproTrajectoryPredictorDiagnosticSummary {
  readonly role: ReproRole;
  readonly rosterMode: ReproRosterMode;
  readonly predictorEnabled: boolean;
  readonly catchupTicksPerFrame: number;
  readonly maxPredictionTicks: number;
  readonly initialWriteRevision: number;
  readonly finalWriteRevision: number;
  readonly writeRevisionIncrementsDuringFlight: number;
  readonly fullResetCountDuringFlight: number;
  readonly minPredictionCountObserved: number;
  readonly maxPredictionCountObserved: number;
  readonly trajectoryCollapsedBelow30Ticks: boolean;
  readonly samples: readonly ReproTrajectoryPredictorOnlineSample[];
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
  readonly kickoffFallbackWarnCount: number;
  readonly enteredMatch: boolean;
  readonly finalMatchMode: string;
  readonly finalMatchPhase: string;
  readonly rawCrossTabJoinedBeforeBridge: boolean;
  readonly bridgedDataChannelOpened: boolean;
  readonly handshakeDiagnostics: ReproHandshakeDiagnosticSnapshot;
  readonly lobbyProbeDiagnostics: ReproLobbyProbeDiagnosticSnapshot | null;
  readonly lobbyGoalResetDiagnostics: ReproLobbyGoalResetDiagnosticSnapshot | null;
  readonly networkLatencyHudDiagnostics: ReproNetworkLatencyHudDiagnosticSnapshot | null;
  readonly rosterVisibilityProbes: readonly ReproRosterVisibilityAndNameTagSnapshot[];
  readonly hostTakeoverDiagnostics: ReproHostTakeoverDiagnosticSnapshot | null;
  readonly trajectoryDiagnostics: ReproTrajectoryPredictorDiagnosticSummary | null;
  readonly goalReplayKickoffDiagnostics: ReproGoalReplayKickoffFreezeDiagnosticSnapshot | null;
  readonly physicsRateSweepDiagnostics: ReproPhysicsRateSweepDiagnosticSnapshot | null;
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
      readonly type: 'lobby_probe_diag';
      readonly diag: ReproLobbyProbeDiagnosticSnapshot;
    }
  | {
      readonly type: 'lobby_goal_reset_diag';
      readonly diag: ReproLobbyGoalResetDiagnosticSnapshot;
    }
  | {
      readonly type: 'network_latency_hud_diag';
      readonly diag: ReproNetworkLatencyHudDiagnosticSnapshot;
    }
  | {
      readonly type: 'roster_visibility_probe';
      readonly probe: ReproRosterVisibilityAndNameTagSnapshot;
    }
  | {
      readonly type: 'host_takeover_diag';
      readonly diag: ReproHostTakeoverDiagnosticSnapshot;
    }
  | {
      readonly type: 'trajectory_diag';
      readonly summary: ReproTrajectoryPredictorDiagnosticSummary;
    }
  | {
      readonly type: 'goal_replay_kickoff_diag';
      readonly diag: ReproGoalReplayKickoffFreezeDiagnosticSnapshot;
    }
  | {
      readonly type: 'physics_rate_sweep_diag';
      readonly diag: ReproPhysicsRateSweepDiagnosticSnapshot;
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
