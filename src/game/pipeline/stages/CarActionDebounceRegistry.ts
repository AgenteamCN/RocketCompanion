import {
  INCIDENT_EVENT_TYPES,
  isBallFlipResetEvent,
  isDiagnosticProbeSlot,
} from '../../../physics/RocketSimConstants.ts';
import { eventStreamStore } from '../../runtimeUiPort.ts';
import { gameAudio } from '../../../audio/GameAudioEngineFacade.ts';
import type { RocketSimPhysicsEngine } from '../../../physics/RocketSimPhysicsEngine.ts';
import type { PhysicsEventRecord } from '../../../physics/PhysicsEventReader.ts';
import type { CarControlsInput } from '../../../network/protocol/GlobalPayloadCodec.ts';
import type { CameraTransformLike } from '../../../audio/SpatialAudioSource.ts';

export interface CarActionDebounceState {
  boostLatched: boolean;
  boostHysteresisUntilTick: number;
  hasSingleJumped: boolean;
  jumpReleasedSinceSingleJump: boolean;
  hasAirJumped: boolean;
  lastBoostTick: number;
  lastJumpTick: number;
  lastAirJumpTick: number;
  lastFlipResetTick: number;
  lastFlipResetTimeMs: number;
  localEdgeInitialized: boolean;
  prevLocalJumping: boolean;
  prevLocalFlipping: boolean;
  remoteEdgeInitialized: boolean;
  prevRemoteOnGround: boolean;
  prevRemoteJumping: boolean;
  prevRemoteFlipping: boolean;
  prevRemoteBoosting: boolean;
  prevRemoteSupersonic: boolean;
}

export interface CarActionPhysicsEventPayload {
  type: number;
  carIndex?: number;
  primaryId?: number;
  secondaryId?: number;
  x?: number;
  y?: number;
  z?: number;
  speed?: number;
  impulse?: number;
  tick?: number;
  isGoalBarrierHit?: boolean;
}

export interface CarEdgeSynthesisContext {
  physics: RocketSimPhysicsEngine;
  playerCarIndex: number;
  playerControls: Partial<CarControlsInput> | null | undefined;
  networkReconciler: { lobbyDualWorldMode?: boolean } | null | undefined;
  testCarAudioEnabled: boolean;
  camera: CameraTransformLike | null | undefined;
  readonly emittedModeEvents: CarActionPhysicsEventPayload[];
}

export class CarActionDebounceRegistry {
  private readonly _carActionStates = new Map<number, CarActionDebounceState>();

  public reset(): void {
    this._carActionStates.clear();
  }

  public getCarActionState(carIdx: number): CarActionDebounceState {
    let st = this._carActionStates.get(carIdx);
    if (!st) {
      st = {
        boostLatched: false,
        boostHysteresisUntilTick: -100,
        hasSingleJumped: false,
        jumpReleasedSinceSingleJump: true,
        hasAirJumped: false,
        lastBoostTick: -100,
        lastJumpTick: -100,
        lastAirJumpTick: -100,
        lastFlipResetTick: -1000,
        lastFlipResetTimeMs: -1000,
        localEdgeInitialized: false,
        prevLocalJumping: false,
        prevLocalFlipping: false,
        remoteEdgeInitialized: false,
        prevRemoteOnGround: true,
        prevRemoteJumping: false,
        prevRemoteFlipping: false,
        prevRemoteBoosting: false,
        prevRemoteSupersonic: false,
      };
      this._carActionStates.set(carIdx, st);
    }
    return st;
  }

  public notifyLocalJumpReleased(playerCarIndex: number): void {
    if (playerCarIndex >= 0) {
      this.getCarActionState(playerCarIndex).jumpReleasedSinceSingleJump = true;
    }
  }

  public syncPreTickCarStatesAndRemoteEdges(
    ctx: CarEdgeSynthesisContext,
    currentTick: number
  ): void {
    const {
      physics,
      playerCarIndex,
      playerControls,
      networkReconciler,
      testCarAudioEnabled,
      camera,
    } = ctx;

    for (let c = 0; c < 8; c++) {
      if (typeof physics.isCarSlotActive === 'function' && !physics.isCarSlotActive(c)) {
        continue;
      }
      const st = this.getCarActionState(c);
      const cv = physics.getCarStateView?.(c);
      const isLocal = c === playerCarIndex;
      const ctrlBase = c * 8;
      const jumpCtrl = isLocal
        ? Boolean(playerControls?.jump)
        : physics.controlsView
          ? physics.controlsView[ctrlBase + 5] >= 0.5
          : false;
      const boostCtrl = isLocal
        ? Boolean(playerControls?.boost)
        : physics.controlsView
          ? physics.controlsView[ctrlBase + 6] >= 0.5
          : false;
      const hasBoostFuel = (cv?.boost ?? 0) > 0.1 || Boolean(physics.isUnlimitedBoost);

      if (!jumpCtrl) {
        st.jumpReleasedSinceSingleJump = true;
      }
      if (cv?.isOnGround && !cv?.isJumping && !cv?.isFlipping) {
        st.hasSingleJumped = false;
        st.hasAirJumped = false;
      }
      if (boostCtrl && hasBoostFuel && !cv?.isDemoed) {
        st.boostHysteresisUntilTick = Math.max(st.boostHysteresisUntilTick, currentTick + 12);
      }
      if (!boostCtrl && !cv?.isBoosting && currentTick >= st.boostHysteresisUntilTick) {
        st.boostLatched = false;
      }

      if (networkReconciler && !isLocal && cv) {
        if (isDiagnosticProbeSlot(c) && !testCarAudioEnabled) {
          continue;
        }
        if (networkReconciler.lobbyDualWorldMode && c !== 6 && c !== 7) {
          continue;
        }
        const curOnGround = Boolean(cv.isOnGround);
        const curJumping = Boolean(cv.isJumping);
        const curFlipping = Boolean(cv.isFlipping);
        const curBoosting = Boolean(cv.isBoosting);
        const curSupersonic = Boolean(cv.isSupersonic);

        if (!st.remoteEdgeInitialized) {
          st.remoteEdgeInitialized = true;
        } else if (gameAudio) {
          const emitRemoteEdge = (type: number) => {
            const evt = {
              type,
              carIndex: c,
              primaryId: c,
              x: cv.posX ?? 0,
              y: cv.posY ?? 0,
              z: cv.posZ ?? 0,
              speed: Math.hypot(cv.velX ?? 0, cv.velY ?? 0, cv.velZ ?? 0),
              impulse: 0,
              tick: currentTick,
            };
            eventStreamStore.addEvent(evt);
            gameAudio.handleEvent(evt, camera);
          };
          if (!st.prevRemoteJumping && curJumping) {
            emitRemoteEdge(INCIDENT_EVENT_TYPES.CAR_JUMP);
          }
          if (!st.prevRemoteFlipping && curFlipping) {
            emitRemoteEdge(INCIDENT_EVENT_TYPES.CAR_DODGE);
          }
          if (!st.prevRemoteBoosting && curBoosting) {
            emitRemoteEdge(INCIDENT_EVENT_TYPES.CAR_BOOST_START);
          } else if (st.prevRemoteBoosting && !curBoosting) {
            emitRemoteEdge(INCIDENT_EVENT_TYPES.CAR_BOOST_STOP);
          }
          if (!st.prevRemoteSupersonic && curSupersonic) {
            emitRemoteEdge(INCIDENT_EVENT_TYPES.CAR_SUPERSONIC_ENTER);
          }
        }
        st.prevRemoteOnGround = curOnGround;
        st.prevRemoteJumping = curJumping;
        st.prevRemoteFlipping = curFlipping;
        st.prevRemoteBoosting = curBoosting;
        st.prevRemoteSupersonic = curSupersonic;
      }
    }
  }

  public shouldAcceptCarActionIncident(
    event: PhysicsEventRecord,
    evtCarIdx: number,
    currentTick: number,
    ctx: CarEdgeSynthesisContext
  ): boolean {
    const { physics, playerCarIndex, playerControls, networkReconciler } = ctx;
    const isLocal = evtCarIdx === playerCarIndex;
    if (
      networkReconciler &&
      !isLocal &&
      (event.type === INCIDENT_EVENT_TYPES.CAR_BOOST_START ||
        event.type === INCIDENT_EVENT_TYPES.BOOST_START ||
        event.type === INCIDENT_EVENT_TYPES.CAR_BOOST_STOP ||
        event.type === INCIDENT_EVENT_TYPES.BOOST_END ||
        event.type === INCIDENT_EVENT_TYPES.CAR_JUMP ||
        event.type === INCIDENT_EVENT_TYPES.CAR_DOUBLE_JUMP ||
        event.type === INCIDENT_EVENT_TYPES.CAR_DODGE ||
        event.type === INCIDENT_EVENT_TYPES.CAR_SUPERSONIC_ENTER)
    ) {
      return false;
    }

    const st = this.getCarActionState(evtCarIdx);
    const cv = physics.getCarStateView?.(evtCarIdx);
    const ctrlBase = evtCarIdx * 8;
    const jumpCtrl = isLocal
      ? Boolean(playerControls?.jump)
      : physics.controlsView
        ? physics.controlsView[ctrlBase + 5] >= 0.5
        : false;
    const boostCtrl = isLocal
      ? Boolean(playerControls?.boost)
      : physics.controlsView
        ? physics.controlsView[ctrlBase + 6] >= 0.5
        : false;
    const hasBoostFuel = (cv?.boost ?? 0) > 0.1 || Boolean(physics.isUnlimitedBoost);

    if (
      event.type === INCIDENT_EVENT_TYPES.CAR_BOOST_START ||
      event.type === INCIDENT_EVENT_TYPES.BOOST_START
    ) {
      if (isLocal && !boostCtrl && currentTick >= st.boostHysteresisUntilTick) {
        return false;
      }
      if (st.boostLatched || (event.tick > 0 && Math.abs(event.tick - st.lastBoostTick) < 12)) {
        return false;
      }
      st.boostLatched = true;
      st.lastBoostTick = event.tick || currentTick;
      st.boostHysteresisUntilTick = Math.max(st.boostHysteresisUntilTick, currentTick + 12);
    } else if (
      event.type === INCIDENT_EVENT_TYPES.CAR_BOOST_STOP ||
      event.type === INCIDENT_EVENT_TYPES.BOOST_END
    ) {
      if (!st.boostLatched) {
        return false;
      }
      if (
        isLocal &&
        !cv?.isDemoed &&
        ((boostCtrl && hasBoostFuel) || currentTick < st.boostHysteresisUntilTick)
      ) {
        return false;
      }
      st.boostLatched = false;
      st.boostHysteresisUntilTick = -100;
    } else if (event.type === INCIDENT_EVENT_TYPES.CAR_JUMP) {
      if (isLocal && !jumpCtrl) {
        return false;
      }
      if (st.hasSingleJumped || (event.tick > 0 && Math.abs(event.tick - st.lastJumpTick) < 6)) {
        return false;
      }
      st.hasSingleJumped = true;
      st.jumpReleasedSinceSingleJump = !jumpCtrl;
      st.lastJumpTick = event.tick || currentTick;
    } else if (
      event.type === INCIDENT_EVENT_TYPES.CAR_DOUBLE_JUMP ||
      event.type === INCIDENT_EVENT_TYPES.CAR_DODGE
    ) {
      if (isLocal && (!jumpCtrl || !st.jumpReleasedSinceSingleJump)) {
        return false;
      }
      if (st.hasAirJumped || (event.tick > 0 && Math.abs(event.tick - st.lastAirJumpTick) < 6)) {
        return false;
      }
      st.hasAirJumped = true;
      st.jumpReleasedSinceSingleJump = false;
      st.lastAirJumpTick = event.tick || currentTick;
    }
    return true;
  }

  public shouldAcceptFlipResetIncident(
    event: PhysicsEventRecord,
    targetCarIdx: number,
    physics: RocketSimPhysicsEngine,
    emittedModeEvents: CarActionPhysicsEventPayload[]
  ): boolean {
    const st = this.getCarActionState(targetCarIdx);
    const cv = physics.getCarStateView?.(targetCarIdx);

    if (!isBallFlipResetEvent(event)) {
      if (!cv?.isFlipping) {
        st.hasAirJumped = false;
      }
      st.jumpReleasedSinceSingleJump = true;
      emittedModeEvents.push(event);
      return false;
    }

    const nowMs = performance.now();
    const tickDelta =
      event.tick > 0 && st.lastFlipResetTick > 0
        ? Math.abs(event.tick - st.lastFlipResetTick)
        : Infinity;
    const timeDeltaMs = nowMs - st.lastFlipResetTimeMs;
    if (tickDelta < 60 || timeDeltaMs < 500) {
      return false;
    }
    if (!cv?.isFlipping) {
      st.hasAirJumped = false;
    }
    st.jumpReleasedSinceSingleJump = true;
    st.lastFlipResetTick = event.tick || 0;
    st.lastFlipResetTimeMs = nowMs;
    return true;
  }

  public synthesizePostTickLocalFallbackEdges(
    ctx: CarEdgeSynthesisContext,
    currentTick: number
  ): void {
    const {
      physics,
      playerCarIndex,
      playerControls,
      networkReconciler,
      camera,
      emittedModeEvents,
    } = ctx;
    const localIdx = playerCarIndex ?? 0;
    if (
      !networkReconciler ||
      localIdx < 0 ||
      localIdx >= 8 ||
      (typeof physics.isCarSlotActive === 'function' && !physics.isCarSlotActive(localIdx))
    ) {
      return;
    }

    const st = this.getCarActionState(localIdx);
    const cv = physics.getCarStateView?.(localIdx);
    if (!cv) return;

    const curJumping = Boolean(cv.isJumping);
    const curFlipping = Boolean(cv.isFlipping);
    const risingJump = st.localEdgeInitialized ? !st.prevLocalJumping && curJumping : curJumping;
    const risingFlip = st.localEdgeInitialized ? !st.prevLocalFlipping && curFlipping : curFlipping;
    st.localEdgeInitialized = true;
    st.prevLocalJumping = curJumping;
    st.prevLocalFlipping = curFlipping;

    const emitLocalFallback = (type: number) => {
      const evt = {
        type,
        carIndex: localIdx,
        primaryId: localIdx,
        x: cv.posX ?? 0,
        y: cv.posY ?? 0,
        z: cv.posZ ?? 0,
        speed: Math.hypot(cv.velX ?? 0, cv.velY ?? 0, cv.velZ ?? 0),
        impulse: 0,
        tick: currentTick,
      };
      eventStreamStore.addEvent(evt);
      emittedModeEvents.push(evt);
      if (gameAudio) {
        gameAudio.handleEvent(evt, camera);
      }
    };

    const localJumpCtrl = Boolean(playerControls?.jump);
    if (
      localJumpCtrl &&
      risingJump &&
      !st.hasSingleJumped &&
      Math.abs(currentTick - st.lastJumpTick) >= 6
    ) {
      st.hasSingleJumped = true;
      st.jumpReleasedSinceSingleJump = false;
      st.lastJumpTick = currentTick;
      emitLocalFallback(INCIDENT_EVENT_TYPES.CAR_JUMP);
    }
    if (
      localJumpCtrl &&
      st.jumpReleasedSinceSingleJump &&
      risingFlip &&
      !st.hasAirJumped &&
      Math.abs(currentTick - st.lastAirJumpTick) >= 6
    ) {
      st.hasAirJumped = true;
      st.jumpReleasedSinceSingleJump = false;
      st.lastAirJumpTick = currentTick;
      emitLocalFallback(INCIDENT_EVENT_TYPES.CAR_DODGE);
    }
  }
}
