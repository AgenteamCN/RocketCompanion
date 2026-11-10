/**
 * src/network/server/LobbyGhostCarCoordinator.ts
 * Pure Worker-safe Coordinator for Lobby Ghost Car Broadphase Filtering,
 * Client Dual-World Warmup Snapshot Synthesis, and Authoritative Physics Signal Transitions.
 */

import {
  SIM_OFFSETS,
  BALL_STATE_STRIDE,
  CAR_STATE_STRIDE,
  MAX_CARS,
} from '../../physics/RocketSimConstants.ts';
import { MATCH_SIGNALS } from '../protocol/GlobalPayloadCodec.ts';
import {
  applyPodiumFormationToEngine,
  releasePodiumLocksOnEngine,
} from '../../replay/podiumFormationPipeline.ts';

export const DEFAULT_GHOST_OPACITY = 0.7;

export const LOBBY_COLLISION_MODES = Object.freeze({
  SOLID_COMPETITIVE: 'solid_competitive',
  GHOST_PASSTHROUGH: 'ghost_passthrough',
  HOST_ONLY_BALL: 'host_only_ball',
  DUAL_WORLD_ISOLATED: 'dual_world_isolated',
});

export interface LobbyGhostCarSimPort {
  setCarCollisionMask?(
    carIndex: number,
    interactWithBall: boolean,
    interactWithCars: boolean
  ): unknown;
  setReplayRecordingActive?(active: boolean): void;
  clearReplayBuffer?(): void;
  setSimulationFrozen?(frozen: boolean, mode: number, lockCars: boolean): void;
  setCarHitbox?(carIndex: number, config: string): void;
}

export interface CarCollisionMaskEntry {
  carIndex: number;
  interactWithBall: boolean;
  interactWithCars: boolean;
  isGhost: boolean;
  opacity: number;
}

export interface LobbyGhostCoordinatorOptions {
  hostCarIndex?: number;
  ghostOpacity?: number;
  mode?: string;
  lobbyModeActive?: boolean;
  broadcastHostOnly?: boolean;
}

export interface LobbyModeConfig extends LobbyGhostCoordinatorOptions {
  enabled?: boolean;
  interactWithBall?: boolean;
  interactWithCars?: boolean;
  hostInteractsWithBall?: boolean;
  localCarIndex?: number;
}

export type LobbyGhostConfigOptions = LobbyModeConfig;

export interface PhysicsSignalData extends LobbyGhostConfigOptions {
  kickoffWillStartAt?: number;
  param1?: number;
  untilFrame?: number;
  forceReset?: boolean;
  seed?: number;
  winner?: number;
  targetResumeTick?: number;
  paused?: boolean;
  masked?: boolean;
  carIndex?: number;
  interactWithBall?: boolean;
  interactWithCars?: boolean;
  opacity?: number;
  hitboxType?: string;
  [key: string]: unknown;
}

export interface PhysicsSignalTransitionResult {
  isPaused: boolean;
  isRecordingFullReplay: boolean;
  isMasked: boolean;
  maskUntilFrame: number;
}

export interface MergeDualWorldOptions {
  localCarIndex?: number;
  localSourceCarIndex?: number;
  hostCarIndex?: number;
  primaryBallSource?: 'host' | 'local';
  useLocalBall?: boolean;
  hostCarIndices?: number[];
}

export function evaluatePhysicsSignalTransition(
  signalType: number | string,
  data: PhysicsSignalData,
  state: PhysicsSignalTransitionResult,
  actions: {
    sim: LobbyGhostCarSimPort | null | undefined;
    lobbyModeActive: boolean;
    resetGoalLatch(): void;
    restoreSolidCollisions(): void;
    resetKickoff(seed: number): void;
    resetBallToCenter(): void;
    clearInputBuffer(): void;
    setCarCollisionMask(
      carIndex: number,
      interactWithBall: boolean,
      interactWithCars: boolean,
      opacity?: number
    ): void;
    setLobbyGhostMode(enabled: boolean, config: LobbyGhostConfigOptions): void;
  }
): PhysicsSignalTransitionResult {
  let { isPaused, isRecordingFullReplay, isMasked, maskUntilFrame } = state;
  const setMask = (masked: boolean, until = -1) => {
    isMasked = masked;
    maskUntilFrame = until;
  };
  const setReplayAndFreeze = (rec: boolean, frozen: boolean) => {
    isRecordingFullReplay = rec;
    actions.sim?.setReplayRecordingActive?.(rec);
    actions.sim?.setSimulationFrozen?.(frozen, 0, frozen);
  };

  switch (signalType) {
    case MATCH_SIGNALS.MATCH_STARTED:
    case MATCH_SIGNALS.KICKOFF_WILL_START:
      actions.resetGoalLatch();
      releasePodiumLocksOnEngine(actions.sim as never);
      if (actions.lobbyModeActive) actions.restoreSolidCollisions();
      if (signalType === MATCH_SIGNALS.MATCH_STARTED) actions.sim?.clearReplayBuffer?.();
      setReplayAndFreeze(true, false);
      if (signalType === MATCH_SIGNALS.KICKOFF_WILL_START) {
        setMask(true, data.kickoffWillStartAt ?? data.param1 ?? data.untilFrame ?? -1);
      }
      break;
    case 'KICKOFF_RESET':
    case MATCH_SIGNALS.KICKOFF_START:
      actions.resetGoalLatch();
      releasePodiumLocksOnEngine(actions.sim as never);
      if (actions.lobbyModeActive) actions.restoreSolidCollisions();
      setReplayAndFreeze(true, false);
      setMask(false);
      if (signalType === 'KICKOFF_RESET' || data.forceReset) actions.resetKickoff(data.seed || 0);
      break;
    case MATCH_SIGNALS.MATCH_ENDED:
      isPaused = false;
      isRecordingFullReplay = false;
      actions.sim?.setReplayRecordingActive?.(false);
      setMask(true);
      break;
    case MATCH_SIGNALS.PODIUM_START:
      isPaused = false;
      isRecordingFullReplay = false;
      actions.sim?.setReplayRecordingActive?.(false);
      setMask(false);
      applyPodiumFormationToEngine(actions.sim as never, data.winner ?? data.param1 ?? 0);
      break;
    case MATCH_SIGNALS.GOAL_REPLAY_START:
    case MATCH_SIGNALS.SYS_CTRL_STATE_ONLY:
      actions.resetGoalLatch();
      setReplayAndFreeze(false, true);
      if (signalType === MATCH_SIGNALS.SYS_CTRL_STATE_ONLY) {
        isPaused = true;
        setMask(true);
      }
      break;
    case MATCH_SIGNALS.SYS_CTRL_INTERVENE_WILL_RESUME:
      isPaused = true;
      setReplayAndFreeze(false, true);
      setMask(true, data.targetResumeTick ?? data.param1 ?? -1);
      break;
    case MATCH_SIGNALS.GOAL_REPLAY_END:
    case MATCH_SIGNALS.SYS_CTRL_PHYSICS_RESUME:
      actions.resetGoalLatch();
      isPaused = false;
      setReplayAndFreeze(true, false);
      if (signalType === MATCH_SIGNALS.SYS_CTRL_PHYSICS_RESUME) {
        setMask(false);
        actions.clearInputBuffer();
      }
      break;
    case MATCH_SIGNALS.MATCH_PAUSED:
    case 'PAUSE_SIMULATION': {
      const paused = signalType === MATCH_SIGNALS.MATCH_PAUSED ? true : Boolean(data.paused);
      isPaused = paused;
      actions.sim?.setSimulationFrozen?.(paused, 0, paused);
      break;
    }
    case MATCH_SIGNALS.MATCH_RESUMED:
      isPaused = false;
      actions.sim?.setSimulationFrozen?.(false, 0, false);
      break;
    case 'BALL_RESET':
    case MATCH_SIGNALS.BALL_RESET:
      actions.resetGoalLatch();
      actions.resetBallToCenter();
      break;
    case 'INPUT_MASK':
      setMask(Boolean(data.masked), data.untilFrame ?? -1);
      break;
    case 'GHOST_CAR_CONFIG':
      if (typeof data.carIndex === 'number') {
        actions.setCarCollisionMask(
          data.carIndex,
          data.interactWithBall ?? false,
          data.interactWithCars ?? false,
          data.opacity
        );
      } else {
        actions.setLobbyGhostMode(data.enabled ?? true, data);
      }
      break;
    case MATCH_SIGNALS.PLAYER_LOADOUT_UPDATED:
    case 'HOTSWAP_HITBOX':
      if (typeof data.carIndex === 'number' && data.hitboxType)
        actions.sim?.setCarHitbox?.(data.carIndex, data.hitboxType);
      break;
    default:
      break;
  }

  return { isPaused, isRecordingFullReplay, isMasked, maskUntilFrame };
}

export class LobbyGhostCarCoordinator {
  hostCarIndex: number;
  ghostOpacity: number;
  mode: string;
  lobbyModeActive: boolean;
  broadcastHostOnly: boolean;
  carMaskRegistry = new Map<number, CarCollisionMaskEntry>();

  constructor(options: LobbyGhostCoordinatorOptions = {}) {
    this.hostCarIndex = options.hostCarIndex ?? 0;
    this.ghostOpacity =
      typeof options.ghostOpacity === 'number'
        ? Math.max(0.1, Math.min(1.0, options.ghostOpacity))
        : DEFAULT_GHOST_OPACITY;
    this.mode = options.mode || LOBBY_COLLISION_MODES.GHOST_PASSTHROUGH;
    this.lobbyModeActive = Boolean(options.lobbyModeActive);
    this.broadcastHostOnly = Boolean(options.broadcastHostOnly);
  }

  applyCarCollisionMask(
    sim: LobbyGhostCarSimPort | null | undefined,
    carIndex: number,
    interactWithBall = true,
    interactWithCars = true,
    opacity?: number
  ): CarCollisionMaskEntry {
    const ballFlag = Boolean(interactWithBall);
    const carFlag = Boolean(interactWithCars);
    const isGhost = !ballFlag || !carFlag;
    const resolvedOpacity =
      typeof opacity === 'number'
        ? Math.max(0.1, Math.min(1.0, opacity))
        : isGhost
          ? this.ghostOpacity
          : 1.0;

    const entry: CarCollisionMaskEntry = {
      carIndex,
      interactWithBall: ballFlag,
      interactWithCars: carFlag,
      isGhost,
      opacity: resolvedOpacity,
    };
    this.carMaskRegistry.set(carIndex, entry);

    if (sim && typeof sim.setCarCollisionMask === 'function') {
      sim.setCarCollisionMask(carIndex, ballFlag, carFlag);
    }
    return entry;
  }

  configureLobbyMode(
    sim: LobbyGhostCarSimPort | null | undefined,
    activeCarIndices: Iterable<number> | null | undefined,
    config: LobbyModeConfig = {}
  ) {
    if (config.enabled !== undefined) {
      this.lobbyModeActive = Boolean(config.enabled);
    } else {
      this.lobbyModeActive = true;
    }
    if (config.mode) {
      this.mode = config.mode;
    }
    if (typeof config.hostCarIndex === 'number') {
      this.hostCarIndex = config.hostCarIndex;
    }
    if (typeof config.ghostOpacity === 'number') {
      this.ghostOpacity = Math.max(0.1, Math.min(1.0, config.ghostOpacity));
    }
    if (config.broadcastHostOnly !== undefined) {
      this.broadcastHostOnly = Boolean(config.broadcastHostOnly);
    }

    if (!this.lobbyModeActive) {
      return this.restoreSolidCollisions(sim, activeCarIndices);
    }

    const indices = activeCarIndices ? Array.from(activeCarIndices) : [];
    for (let i = 0; i < indices.length; i++) {
      const cIdx = indices[i];
      if (this.mode === LOBBY_COLLISION_MODES.HOST_ONLY_BALL) {
        const isHostCar = cIdx === this.hostCarIndex;
        this.applyCarCollisionMask(sim, cIdx, isHostCar, false);
      } else if (this.mode === LOBBY_COLLISION_MODES.GHOST_PASSTHROUGH) {
        const interactBall =
          config.interactWithBall !== undefined
            ? Boolean(config.interactWithBall)
            : cIdx === this.hostCarIndex && config.hostInteractsWithBall !== false;
        const interactCars = Boolean(config.interactWithCars);
        this.applyCarCollisionMask(sim, cIdx, interactBall, interactCars);
      } else if (this.mode === LOBBY_COLLISION_MODES.DUAL_WORLD_ISOLATED) {
        const isLocalWarmupCar =
          typeof config.localCarIndex === 'number'
            ? cIdx === config.localCarIndex
            : cIdx === this.hostCarIndex;
        this.applyCarCollisionMask(sim, cIdx, isLocalWarmupCar, false);
      } else {
        this.applyCarCollisionMask(sim, cIdx, true, true);
      }
    }

    return this.getSnapshotConfig();
  }

  restoreSolidCollisions(
    sim: LobbyGhostCarSimPort | null | undefined,
    activeCarIndices?: Iterable<number> | null
  ) {
    this.lobbyModeActive = false;
    this.broadcastHostOnly = false;
    const indices = new Set<number>([
      ...(activeCarIndices ? Array.from(activeCarIndices) : []),
      ...this.carMaskRegistry.keys(),
    ]);
    for (const cIdx of indices) {
      this.applyCarCollisionMask(sim, cIdx, true, true, 1.0);
    }
    return this.getSnapshotConfig();
  }

  shouldMaskRemoteLobbyInput(carIndex: number): boolean {
    if (!this.lobbyModeActive || !this.broadcastHostOnly) return false;
    return carIndex !== this.hostCarIndex;
  }

  getCarGhostState(carIndex: number): CarCollisionMaskEntry {
    return (
      this.carMaskRegistry.get(carIndex) || {
        carIndex,
        interactWithBall: true,
        interactWithCars: true,
        isGhost: false,
        opacity: 1.0,
      }
    );
  }

  mergeDualWorldSnapshots(
    localWarmupSnapshot: Float32Array | null | undefined,
    remoteAuthoritativeSnapshot: Float32Array | null | undefined,
    options: MergeDualWorldOptions = {}
  ): Float32Array {
    if (!localWarmupSnapshot && !remoteAuthoritativeSnapshot) {
      return new Float32Array(448);
    }
    if (!remoteAuthoritativeSnapshot) {
      return new Float32Array(localWarmupSnapshot!);
    }
    if (!localWarmupSnapshot) {
      return new Float32Array(remoteAuthoritativeSnapshot);
    }

    const localCarIndex = options.localCarIndex ?? 1;
    const localSourceCarIndex = options.localSourceCarIndex ?? 0;
    const hostCarIndex = options.hostCarIndex ?? this.hostCarIndex ?? 0;
    const primaryBallSource = options.useLocalBall ? 'local' : options.primaryBallSource || 'host';

    const merged = new Float32Array(remoteAuthoritativeSnapshot);

    const requiredCars = Math.max(
      Math.round(merged[SIM_OFFSETS.NUM_CARS] || 1),
      hostCarIndex + 1,
      localCarIndex + 1
    );
    merged[SIM_OFFSETS.NUM_CARS] = Math.min(MAX_CARS, requiredCars);

    if (primaryBallSource === 'local') {
      merged.set(
        localWarmupSnapshot.subarray(SIM_OFFSETS.BALL, SIM_OFFSETS.BALL + BALL_STATE_STRIDE),
        SIM_OFFSETS.BALL
      );
    }

    const srcCarStart = SIM_OFFSETS.CARS + localSourceCarIndex * CAR_STATE_STRIDE;
    const dstCarStart = SIM_OFFSETS.CARS + localCarIndex * CAR_STATE_STRIDE;
    if (
      srcCarStart + CAR_STATE_STRIDE <= localWarmupSnapshot.length &&
      dstCarStart + CAR_STATE_STRIDE <= merged.length
    ) {
      merged.set(
        localWarmupSnapshot.subarray(srcCarStart, srcCarStart + CAR_STATE_STRIDE),
        dstCarStart
      );
    }

    if (Array.isArray(options.hostCarIndices)) {
      for (const hIdx of options.hostCarIndices) {
        const hStart = SIM_OFFSETS.CARS + hIdx * CAR_STATE_STRIDE;
        if (hStart + CAR_STATE_STRIDE <= remoteAuthoritativeSnapshot.length) {
          merged.set(
            remoteAuthoritativeSnapshot.subarray(hStart, hStart + CAR_STATE_STRIDE),
            hStart
          );
        }
      }
    }

    return merged;
  }

  getSnapshotConfig() {
    const cars: CarCollisionMaskEntry[] = [];
    for (const entry of this.carMaskRegistry.values()) {
      cars.push({ ...entry });
    }
    return {
      lobbyModeActive: this.lobbyModeActive,
      mode: this.mode,
      hostCarIndex: this.hostCarIndex,
      ghostOpacity: this.ghostOpacity,
      broadcastHostOnly: this.broadcastHostOnly,
      cars,
    };
  }
}

export default LobbyGhostCarCoordinator;
