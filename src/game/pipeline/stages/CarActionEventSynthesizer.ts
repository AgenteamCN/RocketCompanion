import {
  PHYSICS_EVENT_TYPES,
  INCIDENT_EVENT_TYPES,
  isIncidentEvent,
  isBallFlipResetEvent,
} from '../../../physics/RocketSimConstants.ts';
import { eventStreamStore } from '../../runtimeUiPort.ts';
import { isEventLogEnabled } from '../../../ui-core/config/audioConfig.ts';
import { gameAudio } from '../../../audio/GameAudioEngineFacade.ts';
import {
  CarActionDebounceRegistry,
  type CarActionDebounceState,
  type CarActionPhysicsEventPayload,
  type CarEdgeSynthesisContext,
} from './CarActionDebounceRegistry.ts';
import type { RocketSimPhysicsEngine } from '../../../physics/RocketSimPhysicsEngine.ts';
import type { PhysicsEventRecord } from '../../../physics/PhysicsEventReader.ts';
import type { CarControlsInput } from '../../../network/protocol/GlobalPayloadCodec.ts';
import type { CameraManager } from '../../../camera/CameraManager.ts';
import type { CameraTransformLike } from '../../../audio/SpatialAudioSource.ts';

export type { CarActionDebounceState, CarActionPhysicsEventPayload };

export interface CarActionTickInput {
  readonly physics: RocketSimPhysicsEngine | null;
  readonly playerCarIndex: number;
  readonly playerControls: Partial<CarControlsInput> | null | undefined;
  readonly networkReconciler: { lobbyDualWorldMode?: boolean } | null | undefined;
  readonly testCarAudioEnabled: boolean;
  readonly isMatchEnded: boolean;
  readonly matchPhase: string;
  readonly clientGoalIncidentLatched: boolean;
  readonly camera: CameraTransformLike | null | undefined;
}

export interface CarActionTickResult {
  readonly nextClientGoalIncidentLatched: boolean;
  readonly emittedModeEvents: readonly CarActionPhysicsEventPayload[];
  readonly flipResetVisualCarIndices: readonly number[];
  readonly goalBarrierImpacts: ReadonlyArray<{ x?: number; y?: number; z?: number }>;
}

export interface CarActionSynthesizerRuntimePort {
  physics: RocketSimPhysicsEngine | null;
  playerCarIndex: number;
  playerControls: CarControlsInput;
  networkManager?: {
    sessionCoordinator?: {
      networkReconciler?: { lobbyDualWorldMode?: boolean } | null;
    } | null;
    diagnosticsProbe?: {
      testCarAudioEnabled?: boolean;
    } | null;
  } | null;
  match?: { state: { phase: string } } | null;
  _clientGoalIncidentLatched: boolean;
  camera: CameraManager | CameraTransformLike | null;
  arena: {
    triggerGoalBarrierImpact?(x?: number, y?: number, z?: number): void;
    carVisual?: string;
    vehiclePresets?: ArrayLike<string | null | undefined>;
    carTeams?: ArrayLike<number | null | undefined>;
    carColors?: ArrayLike<string | number | null | undefined>;
    carPaintFinishes?: ArrayLike<string | null | undefined>;
    carBoostVisuals?: ArrayLike<string | null | undefined>;
    carBoostAudios?: ArrayLike<string | null | undefined>;
    cars?: ArrayLike<{ visible?: boolean } | null | undefined>;
  } | null;
  ballTrajectoryPredictor?: { notifyCarBallHit?(tick?: number): void } | null;
  modeManager?: {
    getActiveMode?(): {
      standaloneReplayViewer?: { isActive?: boolean; isIntervening?: boolean } | null;
      rlrcReplaySession?: { isActive?: boolean; isIntervening?: boolean } | null;
      onPhysicsEvent?(event: CarActionPhysicsEventPayload): void;
    } | null;
  } | null;
  getFlipResetVisual?(carIndex: number): { play(): void } | null;
}

export interface CarActionDispatchTargets {
  readonly ballTrajectoryPredictor?: { notifyCarBallHit?(tick?: number): void } | null;
  readonly activeMode?: {
    onPhysicsEvent?(event: CarActionPhysicsEventPayload): void;
  } | null;
  readonly getFlipResetVisual?: (carIndex: number) => { play(): void } | null;
  readonly arena?: {
    triggerGoalBarrierImpact?(x?: number, y?: number, z?: number): void;
  } | null;
}

export function dispatchCarActionTickEffects(
  tickResult: CarActionTickResult,
  targets: CarActionDispatchTargets
): void {
  const { ballTrajectoryPredictor, activeMode, getFlipResetVisual, arena } = targets;
  for (let i = 0; i < tickResult.emittedModeEvents.length; i++) {
    const evt = tickResult.emittedModeEvents[i];
    if (evt?.type === INCIDENT_EVENT_TYPES.CAR_BALL_HIT) {
      ballTrajectoryPredictor?.notifyCarBallHit?.(evt.tick);
    }
    activeMode?.onPhysicsEvent?.(evt);
  }
  for (let i = 0; i < tickResult.flipResetVisualCarIndices.length; i++) {
    const visual = getFlipResetVisual?.(tickResult.flipResetVisualCarIndices[i]);
    visual?.play();
  }
  for (let i = 0; i < tickResult.goalBarrierImpacts.length; i++) {
    const imp = tickResult.goalBarrierImpacts[i];
    arena?.triggerGoalBarrierImpact?.(imp.x, imp.y, imp.z);
  }
}

/**
 * CarActionEventSynthesizer
 * Self-contained domain module owning per-vehicle action debounce state,
 * remote/local edge event synthesis, and native WASM physics incident dispatch.
 */
export class CarActionEventSynthesizer {
  public readonly debounceRegistry = new CarActionDebounceRegistry();
  private _lastSeenPhysicsTick = -1;

  public reset(): void {
    this.debounceRegistry.reset();
    this._lastSeenPhysicsTick = -1;
    gameAudio?.resetIncidentDebounceState?.();
  }

  public getCarActionState(carIdx: number): CarActionDebounceState {
    return this.debounceRegistry.getCarActionState(carIdx);
  }

  public notifyLocalJumpReleased(playerCarIndex: number): void {
    this.debounceRegistry.notifyLocalJumpReleased(playerCarIndex);
  }

  public stepTickEvents(input: Readonly<CarActionTickInput>): CarActionTickResult {
    const {
      physics,
      playerCarIndex,
      playerControls,
      networkReconciler,
      testCarAudioEnabled,
      isMatchEnded,
      matchPhase,
      camera,
    } = input;

    const emittedModeEvents: CarActionPhysicsEventPayload[] = [];
    const flipResetVisualCarIndices: number[] = [];
    const goalBarrierImpacts: Array<{ x?: number; y?: number; z?: number }> = [];

    if (!physics) {
      return {
        nextClientGoalIncidentLatched: input.clientGoalIncidentLatched,
        emittedModeEvents,
        flipResetVisualCarIndices,
        goalBarrierImpacts,
      };
    }

    let goalIncidentLatched = input.clientGoalIncidentLatched;
    const ballPosY = Math.abs(physics.getBallStateView?.()?.posY || 0);
    if (ballPosY < 5000 && matchPhase !== 'goal') {
      goalIncidentLatched = false;
    }

    const currentTick = Math.floor(physics.getHeaderView?.()?.tickCount ?? 0);
    if (this._lastSeenPhysicsTick >= 0 && this._lastSeenPhysicsTick - currentTick > 180) {
      this.reset();
    }
    this._lastSeenPhysicsTick = currentTick;

    const edgeCtx: CarEdgeSynthesisContext = {
      physics,
      playerCarIndex,
      playerControls,
      networkReconciler,
      testCarAudioEnabled,
      camera,
      emittedModeEvents,
    };

    this.debounceRegistry.syncPreTickCarStatesAndRemoteEdges(edgeCtx, currentTick);

    physics.readEvents((event: PhysicsEventRecord) => {
      if (!isIncidentEvent(event.type)) {
        return;
      }
      const evtCarIdx = event.carIndex ?? event.primaryId ?? -1;
      if ((evtCarIdx === 6 || evtCarIdx === 7) && !testCarAudioEnabled) {
        return;
      }
      if (
        networkReconciler?.lobbyDualWorldMode &&
        evtCarIdx >= 0 &&
        evtCarIdx < 65535 &&
        evtCarIdx !== playerCarIndex
      ) {
        return;
      }

      if (evtCarIdx >= 0 && evtCarIdx < 8) {
        if (
          !this.debounceRegistry.shouldAcceptCarActionIncident(
            event,
            evtCarIdx,
            currentTick,
            edgeCtx
          )
        ) {
          return;
        }
      }

      if (event.type === INCIDENT_EVENT_TYPES.GOAL_SCORED || event.type === 0x0e) {
        if (goalIncidentLatched || isMatchEnded || matchPhase === 'replay') {
          return;
        }
        goalIncidentLatched = true;
      }

      if (
        event.type === PHYSICS_EVENT_TYPES.FLIP_RESET_GAINED ||
        event.type === INCIDENT_EVENT_TYPES.FLIP_RESET_GAINED
      ) {
        if (networkReconciler && !networkReconciler.lobbyDualWorldMode) {
          return;
        }
        const targetCarIdx =
          typeof event.carIndex === 'number' && event.carIndex >= 0
            ? event.carIndex
            : playerCarIndex;
        if (
          !this.debounceRegistry.shouldAcceptFlipResetIncident(
            event,
            targetCarIdx,
            physics,
            emittedModeEvents
          )
        ) {
          return;
        }
      }

      if (isEventLogEnabled(event.type)) {
        console.log(`[Physics Incident 0x${event.type.toString(16).padStart(2, '0')}]`, event);
      }

      eventStreamStore.addEvent(event);
      emittedModeEvents.push(event);

      if (
        (event.type === PHYSICS_EVENT_TYPES.FLIP_RESET_GAINED ||
          event.type === INCIDENT_EVENT_TYPES.FLIP_RESET_GAINED) &&
        isBallFlipResetEvent(event)
      ) {
        const targetCarIdx =
          typeof event.carIndex === 'number' && event.carIndex >= 0
            ? event.carIndex
            : playerCarIndex;
        flipResetVisualCarIndices.push(targetCarIdx);
      }

      if (event.isGoalBarrierHit) {
        goalBarrierImpacts.push({ x: event.x, y: event.y, z: event.z });
      }

      if (gameAudio) {
        gameAudio.handleEvent(event, camera);
      }
    });

    this.debounceRegistry.synthesizePostTickLocalFallbackEdges(edgeCtx, currentTick);

    return {
      nextClientGoalIncidentLatched: goalIncidentLatched,
      emittedModeEvents,
      flipResetVisualCarIndices,
      goalBarrierImpacts,
    };
  }
}
