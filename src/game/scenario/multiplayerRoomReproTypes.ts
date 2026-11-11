/**
 * multiplayerRoomReproTypes.ts
 * Telemetry and diagnostic schemas for reproducing Multiplayer Host-a-Room and
 * Join-a-Room issues (Host AuthoritativeServerWorker timeline snap loop & input
 * starvation, entry vehicle pose & front/rear wheel height asymmetry, P2PWebRTCChannel
 * signaling & readonly measuredRttMs TypeError, and Client match entry failure).
 */

export type ReproRole = 'host' | 'client';
export type ReproRosterMode = '2p' | '3p3ai';

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

export interface ReproPoseAnomalyItem {
  readonly carIndex: number;
  readonly kind:
    | 'lobby_ghost_car_suspended_or_tilted'
    | 'front_rear_wheel_height_asymmetry'
    | 'chassis_pitch_tilt_on_ground';
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
  readonly simCars: readonly ReproSimCarPoseSample[];
  readonly meshCars: readonly ReproMeshCarPoseSample[];
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
