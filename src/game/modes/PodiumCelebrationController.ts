/**
 * PodiumCelebrationController.ts
 * Post-Match Podium Showcase & Celebration Controller.
 *
 * Orchestrates Rocket League-style post-match podium celebrations:
 * - Arranges active cars on symmetrical V-formation pedestals facing the showcase camera.
 * - Locks horizontal X/Y translation via `engine.setCarLinearFactorAndGravity(carIndex, 0, 0, 1, 1)`
 *   so vehicles cannot drive off the podium while retaining Z-axis jumping, double-jumping,
 *   dodging, air-roll spins, and boost plume effects.
 * - Drives celebratory AI bot stunts and smooth Podium Showcase camera framing.
 */

import * as THREE from 'three';
import { FIXED_TIMESTEP, MAX_PHYSICS_SUBSTEPS } from '../../physics/RocketSimConstants.ts';
import {
  PODIUM_CAMERA_POSE,
  applyPodiumFormationToEngine,
  releasePodiumLocksOnEngine,
  type PodiumCapablePhysicsEngine,
  type PodiumFormationSpot,
} from '../../replay/podiumFormationPipeline.ts';
import type { CameraManager } from '../../camera/CameraManager.ts';

export type { PodiumFormationSpot };

export type PodiumCelebrationControls = {
  throttle: number;
  steer: number;
  pitch: number;
  yaw: number;
  roll: number;
  jump: boolean;
  boost: boolean;
  handbrake: boolean;
};

export interface PodiumFrameContextPort {
  dt?: number;
  activeCar?: number;
}

export interface PodiumCelebrationRuntimePort {
  physics?:
    | (PodiumCapablePhysicsEngine & {
        controlsView?: Float32Array | null;
        getCarState?: (carIndex: number) => Float32Array | null;
        setControls?: (carIndex: number, controls: PodiumCelebrationControls) => void;
        step?: (ticks?: number) => void;
      })
    | null;
  interpolator?: {
    currState: Float32Array;
    prevState: Float32Array;
    alpha: number;
    sync?: (timestamp?: number) => void;
  } | null;
  arena?: {
    playerCarIndex?: number;
    cars?: Array<{ visible: boolean } | null | undefined>;
    resetBallTrail?: () => void;
  } | null;
  authoritativeServer?: {
    setCarControls?: (carIndex: number, controls: PodiumCelebrationControls) => void;
    matchAdmin?: unknown;
  } | null;
  modeManager?: {
    modes?: unknown;
    getActiveMode?: () => {
      id?: string;
      rosterController?: {
        spawnedCars?: Array<{ carIndex?: number; team?: number }>;
        carControlsMap?: Map<number, PodiumCelebrationControls>;
      } | null;
    } | null;
  } | null;
  keyboard?: { ballControlEnabled?: boolean; read?: () => PodiumCelebrationControls } | null;
  gamepad?: { active?: () => boolean; read?: () => PodiumCelebrationControls } | null;
  botCoordinator?: {
    isBotMatch: boolean;
    botControls: PodiumCelebrationControls;
  } | null;
  networkReconciler?: {
    historyBuffer?: {
      lastRemoteControls?: Map<
        number,
        { controls?: PodiumCelebrationControls } & PodiumCelebrationControls
      >;
    };
    sampleAndPredictInput?: (
      carIndex: number,
      controls: PodiumCelebrationControls
    ) => PodiumCelebrationControls | null;
  } | null;
  simulationStage?: { resetActionStates?: () => void } | null;
  audioSubsystem?: { resetAudio?: () => void } | null;
  playerControls?: PodiumCelebrationControls;
  playerThrottle?: number;
}

const NEUTRAL_PODIUM_CONTROLS: PodiumCelebrationControls = Object.freeze({
  throttle: 0,
  steer: 0,
  pitch: 0,
  yaw: 0,
  roll: 0,
  jump: false,
  boost: false,
  handbrake: false,
});

export class PodiumCelebrationController {
  public runtime: PodiumCelebrationRuntimePort | null;
  public isActive = false;
  public winningTeam = 0;
  public winReason = 'SCORE';
  public elapsedSeconds = 0;
  public accumulator = 0;
  public podiumTick = 0;
  public podiumCarSpots: Map<number, PodiumFormationSpot> | null = null;

  private readonly _cameraPos = new THREE.Vector3();
  private readonly _cameraLookAt = new THREE.Vector3();

  constructor(runtime: PodiumCelebrationRuntimePort | null) {
    this.runtime = runtime;
  }

  private _resolveCarTeam(carIndex: number): number {
    const r = this.runtime;
    const spawnedCars = r?.modeManager?.getActiveMode?.()?.rosterController?.spawnedCars;
    if (Array.isArray(spawnedCars)) {
      const entry = spawnedCars.find(
        (c: { carIndex?: number; team?: number }) => c.carIndex === carIndex
      );
      if (entry && (entry.team === 0 || entry.team === 1)) {
        return entry.team;
      }
    }
    return carIndex % 2;
  }

  public enterPodium(winningTeam: number | string = 0, winReason = 'SCORE'): void {
    const r = this.runtime;
    const resolvedTeam: 0 | 1 | 2 =
      winningTeam === 'ORANGE' || winningTeam === 1
        ? 1
        : winningTeam === 'DRAW' || winningTeam === 2
          ? 2
          : 0;

    this.isActive = true;
    this.winningTeam = resolvedTeam;
    this.winReason = winReason || 'SCORE';
    this.elapsedSeconds = 0;
    this.accumulator = 0;
    this.podiumTick = 0;

    if (r?.physics) {
      this.podiumCarSpots = applyPodiumFormationToEngine(r.physics, resolvedTeam, (c: number) =>
        this._resolveCarTeam(c) === 1 ? 1 : 0
      );
      r.interpolator?.sync?.();
      const numCars = Math.min(r.physics.numCars || 0, 6);
      for (let c = 0; c < numCars; c++) {
        if (r.arena?.cars?.[c]) {
          r.arena.cars[c]!.visible = true;
        }
      }
    } else {
      this.podiumCarSpots = null;
    }
    r?.arena?.resetBallTrail?.();
  }

  public exitPodium(): void {
    if (!this.isActive) return;
    this.isActive = false;
    this.elapsedSeconds = 0;
    this.accumulator = 0;
    this.podiumTick = 0;
    this.podiumCarSpots = null;

    const r = this.runtime;
    if (r?.physics) {
      releasePodiumLocksOnEngine(r.physics);
      const neutral: PodiumCelebrationControls = { ...NEUTRAL_PODIUM_CONTROLS };
      const numCars = Math.min(r.physics.numCars || 0, 8);
      for (let c = 0; c < numCars; c++) {
        r.physics.setControls?.(c, neutral);
        r.authoritativeServer?.setCarControls?.(c, neutral);
      }
      if (r.physics.controlsView) {
        r.physics.controlsView.fill(0);
      }
      r.playerControls = { ...neutral };
      if (r.botCoordinator) {
        r.botCoordinator.botControls = { ...neutral };
      }
      r.playerThrottle = 0;
    }

    const activeMode = r?.modeManager?.getActiveMode?.();
    activeMode?.rosterController?.carControlsMap?.clear?.();

    r?.simulationStage?.resetActionStates?.();
    r?.audioSubsystem?.resetAudio?.();
    r?.interpolator?.sync?.();
  }

  private _computeBotCelebrationControls(tick: number, carIndex = 1): PodiumCelebrationControls {
    const phase = (tick + carIndex * 45) % 240;
    const isJumpPulse = phase === 10 || phase === 11 || phase === 32 || phase === 33;
    const isAirborneSpin = phase > 12 && phase < 150;
    const isBoosting = isAirborneSpin && phase % 18 < 9;

    return {
      throttle: 1.0,
      steer: Math.sin(tick * 0.05 + carIndex),
      pitch: isAirborneSpin ? 0.55 : 0.0,
      yaw: isAirborneSpin ? 0.85 : 0.0,
      roll: isAirborneSpin ? (carIndex % 2 === 0 ? 1.0 : -1.0) : 0.0,
      jump: isJumpPulse,
      boost: isBoosting,
      handbrake: false,
    };
  }

  private _clampPodiumCarsToPedestals(
    engine:
      | (PodiumCapablePhysicsEngine & { getCarState?: (c: number) => Float32Array | null })
      | null
      | undefined
  ): void {
    const spots = this.podiumCarSpots;
    if (!engine || !spots || typeof engine.getCarState !== 'function') return;

    const numCars = Math.min(engine.numCars || 0, 6);
    for (let c = 0; c < numCars; c++) {
      const spot = spots.get(c);
      if (!spot) continue;
      const carSlice = engine.getCarState(c);
      if (!carSlice) continue;

      const dx = Math.abs(carSlice[0] - spot.x);
      const dy = Math.abs(carSlice[1] - spot.y);
      const z = carSlice[2];
      const vz = carSlice[14];

      if (dx > 2.0 || dy > 2.0 || z > 165.0) {
        carSlice[0] = spot.x;
        carSlice[1] = spot.y;
        carSlice[12] = 0.0;
        carSlice[13] = 0.0;
        if (z > 165.0) {
          carSlice[2] = 165.0;
          if (vz > 0) carSlice[14] = 0.0;
        }
        engine.setCarState?.(c, carSlice);
      }
    }
  }

  public update(context?: PodiumFrameContextPort | null): void {
    const r = this.runtime;
    const sim = r?.physics;
    if (!r || !sim) return;

    if (!this.isActive) {
      this.enterPodium(0, 'SCORE');
    }

    const dt = Math.min(Math.max(context?.dt ?? FIXED_TIMESTEP, 0), 0.1);
    this.elapsedSeconds += dt;
    this.accumulator += dt;

    const kbReading = r.keyboard?.read?.() || NEUTRAL_PODIUM_CONTROLS;
    const padReading = r.gamepad?.read?.() || NEUTRAL_PODIUM_CONTROLS;
    const activeDevice = r.gamepad?.active?.() ? 'gamepad' : 'keyboard';
    const playerControls = activeDevice === 'gamepad' ? padReading : kbReading;

    r.playerControls = playerControls;
    r.playerThrottle = playerControls.throttle || 0;

    let substeps = Math.floor(this.accumulator / FIXED_TIMESTEP);
    this.accumulator = Math.max(0, this.accumulator - substeps * FIXED_TIMESTEP);
    if (substeps > MAX_PHYSICS_SUBSTEPS) {
      substeps = MAX_PHYSICS_SUBSTEPS;
    }

    const numCars = Math.min(sim.numCars || 1, 6);
    const localCarIndex =
      typeof context?.activeCar === 'number' ? context.activeCar : (r.arena?.playerCarIndex ?? 0);
    const localCarTeam = this._resolveCarTeam(localCarIndex);
    const isLocalWinner = this.winningTeam === 2 || localCarTeam === this.winningTeam;
    const effectivePlayerControls = isLocalWinner
      ? playerControls
      : { ...playerControls, throttle: 0, steer: 0 };

    const activeMode = r.modeManager?.getActiveMode?.();
    const carControlsMap = activeMode?.rosterController?.carControlsMap;
    const isExpMultiBots = activeMode?.id === 'exp-multi-bots' || Boolean(carControlsMap);
    if (isExpMultiBots && carControlsMap) {
      carControlsMap.set(localCarIndex, effectivePlayerControls);
    }

    const isBotMatch = Boolean(r.botCoordinator?.isBotMatch);

    for (let i = 0; i < substeps; i++) {
      this.podiumTick++;

      for (let c = 0; c < numCars; c++) {
        if (c === localCarIndex) continue;
        if ((isBotMatch && c === 1) || isExpMultiBots) {
          const botTeam = this._resolveCarTeam(c);
          const isBotWinner = this.winningTeam === 2 || botTeam === this.winningTeam;
          const rawBotCtrl = this._computeBotCelebrationControls(this.podiumTick, c);
          const botCtrl = isBotWinner ? rawBotCtrl : { ...rawBotCtrl, throttle: 0, steer: 0 };
          if (c === 1 && r.botCoordinator) {
            r.botCoordinator.botControls = botCtrl;
          }
          if (isExpMultiBots && carControlsMap) {
            carControlsMap.set(c, botCtrl);
          }
          sim.setControls?.(c, botCtrl);
          r.authoritativeServer?.setCarControls?.(c, botCtrl);
        } else if (r.networkReconciler?.historyBuffer?.lastRemoteControls) {
          const remote = r.networkReconciler.historyBuffer.lastRemoteControls.get(c);
          const remoteCtrl = remote?.controls ? remote.controls : remote || NEUTRAL_PODIUM_CONTROLS;
          sim.setControls?.(c, remoteCtrl);
        }
      }

      if (r.interpolator) {
        r.interpolator.prevState.set(r.interpolator.currState);
      }

      if (r.networkReconciler?.sampleAndPredictInput) {
        const predicted =
          r.networkReconciler.sampleAndPredictInput(localCarIndex, effectivePlayerControls) ||
          effectivePlayerControls;
        sim.setControls?.(localCarIndex, predicted);
        sim.step?.(1);
      } else {
        sim.setControls?.(localCarIndex, effectivePlayerControls);
        sim.step?.(1);
      }

      this._clampPodiumCarsToPedestals(sim);

      if (r.interpolator && sim.state) {
        r.interpolator.currState.set(sim.state);
      }
    }

    if (r.interpolator) {
      r.interpolator.alpha = Math.min(1.0, this.accumulator / FIXED_TIMESTEP);
    }
  }

  public updateCamera(cameraManager: CameraManager | null | undefined, dt = 0.016): void {
    const cam = cameraManager?.camera;
    if (!cam) return;

    const sway = Math.sin(this.elapsedSeconds * 0.45) * 55.0;
    const desiredX = PODIUM_CAMERA_POSE.eyeX + sway;
    const desiredY = PODIUM_CAMERA_POSE.eyeZ;
    const desiredZ = PODIUM_CAMERA_POSE.eyeY;

    const targetX = PODIUM_CAMERA_POSE.targetX;
    const targetY = PODIUM_CAMERA_POSE.targetZ;
    const targetZ = PODIUM_CAMERA_POSE.targetY;

    const blend = Math.min(1.0, Math.max(0.08, dt * 6.0));
    if (this.elapsedSeconds <= dt * 1.5) {
      this._cameraPos.set(desiredX, desiredY, desiredZ);
      this._cameraLookAt.set(targetX, targetY, targetZ);
    } else {
      this._cameraPos.x += (desiredX - this._cameraPos.x) * blend;
      this._cameraPos.y += (desiredY - this._cameraPos.y) * blend;
      this._cameraPos.z += (desiredZ - this._cameraPos.z) * blend;
      this._cameraLookAt.set(targetX, targetY, targetZ);
    }

    if (cam.up) {
      cam.up.set(0, 1, 0);
    }
    cam.position.copy(this._cameraPos);
    cam.lookAt(this._cameraLookAt);
  }
}

export default PodiumCelebrationController;
