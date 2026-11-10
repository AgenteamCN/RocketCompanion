import type { CameraManager } from '../../../camera/CameraManager.ts';
import type {
  ArenaBoostPadDescriptor,
  BallStateObjectInput,
  CarControlsInput,
  CarStateObjectInput,
  NumericBufferLike,
  RestoreSnapshotOptions,
} from '../../../physics/RocketSimSnapshotSerializer.ts';
import type {
  ArenaHeaderView,
  BallStateView,
  CarStateView,
} from '../../../physics/RocketSimStateViews.ts';
import type { PossessionStatsSnapshot } from '../../../physics/PhysicsPossessionTracker.ts';
import type { ReplayRingBuffer } from '../../../replay/ReplayRingBuffer.ts';
import type { ReplayTimelineController } from '../../../replay/ReplayTimelineController.ts';
import type * as THREE from 'three';
import type { BaseGameMode, GameModeRuntimePort } from '../BaseGameMode.ts';
import type { MultiWorldGhostArenaPort } from '../MultiWorldGhostRenderer.ts';
import type { PodiumCelebrationController } from '../PodiumCelebrationController.ts';

export type SubsystemLabTabId =
  | 'probes'
  | 'multi-ghost'
  | 'kickoff-duel'
  | '90s-match'
  | 'state-replay'
  | 'goal-replay'
  | 'demolish-respawn'
  | string;
export type IsolationLabTabId = SubsystemLabTabId;

export interface LabCarControls extends CarControlsInput {
  throttle: number;
  steer: number;
  pitch: number;
  yaw: number;
  roll: number;
  jump: boolean;
  boost: boolean;
  handbrake: boolean;
}

export interface LabPhysicsEnginePort {
  isInitialized?: boolean;
  numCars: number;
  state: Float32Array;
  ballOnGround?: boolean;
  addCar: (team: number, hitboxType?: string) => number;
  removeCar?: (carIndex: number) => boolean | void;
  setCarTeam?: (carIndex: number, team: number) => boolean | void;
  setCarState: (
    carIndex: number,
    carState: number | ArrayLike<number> | CarStateObjectInput | null | undefined,
    ...extraCoords: number[]
  ) => boolean | void;
  getCarState: (carIndex: number) => Float32Array;
  getCarStateView: (carIndex?: number) => CarStateView;
  setBallState: (
    ballState: number | ArrayLike<number> | BallStateObjectInput | null | undefined
  ) => boolean | void;
  getBallStateView: () => BallStateView;
  getHeaderView?: () => ArenaHeaderView;
  setControls: (carIndex: number, controls?: CarControlsInput | null) => void;
  setCarControls?: (carIndex: number, controls?: CarControlsInput | null) => void;
  setUnlimitedBoost: (enabled: boolean) => void;
  getCarUnlimitedBoost?: (carIndex: number) => boolean;
  setSimulationFrozen?: (frozen: boolean, freezeCarIndex?: number, freezeBall?: boolean) => void;
  setCarLinearFactorAndGravity?: (
    carIndex: number,
    lx: number,
    ly: number,
    lz: number,
    gravityScale: number
  ) => void;
  setCarCollisionMask?: (
    carIndex: number,
    collideWithBall: boolean,
    collideWithCars: boolean
  ) => void;
  resetGoalLatch?: () => void;
  resetKickoff: (seed?: number, preservePossessionScore?: boolean) => void;
  resetKickoffAtSpawn: (spawnIndex: number, settleTicks?: number) => void;
  clearEvents?: () => void;
  clearReplayBuffer?: () => void;
  recordReplayFrame?: () => void;
  getReplayFrameCount?: () => number;
  getReplayFrameByIndex?: (index: number) => Float32Array | null;
  getReplayFrameByOffset?: (ticksAgo: number) => Float32Array | null;
  getReplayControlsByIndex?: (index: number) => Uint8Array | null;
  getReplayIncidentTrackBytes?: () => Uint8Array | null;
  getReplaySignalTrackBytes?: () => Uint8Array | null;
  step: (ticks?: number) => void;
  getPads: () => ArenaBoostPadDescriptor[];
  isBallScored?: (ballView?: { posX: number; posY: number; posZ: number }) => boolean;
  saveCompactState: (targetBuffer?: Float32Array | null) => Float32Array;
  restoreState: (
    buffer: NumericBufferLike | null | undefined,
    options?: RestoreSnapshotOptions
  ) => boolean | void;
  configureCars: (
    playerPreset: string,
    opponentPreset?: string | boolean,
    playerTeam?: number
  ) => void;
  setPossessionReportingEnabled?: (enabled: boolean) => void;
  resetPossessionStats?: () => void;
  getPossessionStats?: () => PossessionStatsSnapshot;
  respawnCarAtPreset?: (carIndex: number, team: number, slotIndex: number) => void;
  demolishCar?: (carIndex: number, timerSeconds?: number) => void;
  isCarDemolished?: (carIndex: number) => boolean;
  getCarDemolishTimer?: (carIndex: number) => number;
  setCarRespawnSelection?: (carIndex: number, slotIndex: number) => void;
  getCarRespawnSelection?: (carIndex: number) => number;
  carMutators?: {
    setCarDemoSpawnSelection?: (carIndex?: number, slotIndex?: number) => boolean;
    getCarDemoSpawnSelection?: (carIndex?: number) => number;
    getCarDemoRespawnTimer?: (carIndex?: number) => number;
    respawnCar?: (carIndex: number, seed?: number, boostAmount?: number) => boolean;
  };
}

export interface LabWheelObject {
  steer?: { position?: { x?: number; y?: number; z?: number } };
  position?: { x?: number; y?: number; z?: number };
}

export interface LabArenaPort {
  scene?: THREE.Scene | null;
  vehicleRegistry?: MultiWorldGhostArenaPort['vehicleRegistry'];
  playerCarIndex?: number;
  cars: Array<{ visible: boolean }>;
  carDemolitions?: Array<{ stop?: () => void } | undefined>;
  respawnGhostPreview?: {
    wheels?: LabWheelObject[] & { threeWheels?: boolean };
    update?: (currState: Float32Array, dt?: number) => void;
  } | null;
  ensureOpponent?: () => Promise<void> | void;
  ensureCar?: (slotIndex: number, team: number, visualId?: string) => void;
  setCarTeam?: (carIndex: number, team: number) => void;
  swapCarVisual?: (carIndex: number, visualId: string) => boolean | void;
  setCarVisual?: (carIndex: number, visualId: string) => void;
  resetCarBoosts?: (carIndex: number) => void;
  resetAllCarEffects?: () => void;
  clearAllGhostOpacities?: () => void;
  resetBallTrail?: () => void;
}

export interface LabInterpolatorPort {
  alpha: number;
  prevState: Float32Array;
  currState: Float32Array;
  sync: (timestamp?: number) => void;
  setTrainingPhysicsRate?: (hz: number) => void;
  getCarView?: (
    carIndex: number,
    arena?: LabArenaPort | null
  ) => { pos?: [number, number, number] | Float32Array | number[] } | null;
}

export interface LabAudioPort {
  play?: (cueId: string, volume?: number, cooldownMs?: number) => void;
  handleEvent?: (event: Record<string, unknown>, camera?: CameraManager | null) => void;
  resetIncidentDebounceState?: () => void;
  setCarBoostAudioVariation?: (carIndex: number, variation: string) => void;
}

export interface LabModeManagerPort {
  [key: string]: unknown;
  modes?: Map<string, BaseGameMode & { rewinderController?: { attach?: () => void } | null }>;
}

export interface LabRuntimePort {
  [key: string]: unknown;
  physics: LabPhysicsEnginePort | null;
  arena: LabArenaPort | null;
  interpolator: LabInterpolatorPort | null;
  camera: CameraManager | null;
  playerCarIndex: number;
  isBotMatch: boolean;
  playerControls: LabCarControls;
  neutralControls: LabCarControls;
  _clientGoalIncidentLatched?: boolean;
  openOverlays?: Set<string>;
  replayTimelineController?: ReplayTimelineController | null;
  podiumController?: PodiumCelebrationController | null;
  flipResetVisuals?: Array<{ stopVisual?: () => void } | null | undefined> | null;
  boostBloom?: { clear?: () => void } | null;
  ballTrajectoryPredictor?: { clear?: () => void } | null;
  keyboard?: { ballControlEnabled?: boolean } | null;
  modeManager?: LabModeManagerPort | null;
  gameModeManager?: LabModeManagerPort | null;
  simulationStage?: { resetActionStates?: () => void } | null;
  match?: {
    state: {
      [key: string]: unknown;
      mode?: string;
      phase?: string;
      paused?: boolean;
      countdown?: number;
    };
  } | null;
  authoritativeServer?:
    | (NonNullable<GameModeRuntimePort['authoritativeServer']> & {
        matchAdmin?: { replayBuffer?: ReplayRingBuffer | null } | null;
      })
    | null;
  options?: { gameAudio?: LabAudioPort | null } | null;
  audioSubsystem?: { resetAudio?: () => void } | null;
  releaseGoalReplayCameraOverride: (source?: string | null) => void;
  acquireGoalReplayCameraOverride?: (source?: string) => void;
  setHudState?: (patch: Record<string, unknown>) => void;
}

export interface LabFrameUpdateContext {
  dt?: number;
  alpha?: number;
  activeCar?: number;
  activeCarIndex?: number;
  playerCarView?: { boost: number; isBoosting: boolean } | null;
  [key: string]: unknown;
}

export interface LabTabContext {
  readonly runtime: LabRuntimePort;
  getSwitchEpoch(): number;
  bumpSwitchEpoch?(): number;
  ensureSinglePlayerCarOnly(resetKickoff?: boolean): void;
  isPodiumActive(): boolean;
  enterPodiumShowcase(winningTeam?: number): void;
  exitPodiumShowcase(): void;
}

export interface LabTabController {
  readonly tabId: SubsystemLabTabId;
  onActivate(ctx: LabTabContext): void;
  onDeactivate(): void;
  onPhysicsTick(dt: number): boolean;
  onAfterPhysicsTick?(): void;
  onRenderFrame?(frameCtx: LabFrameUpdateContext): void;
}
