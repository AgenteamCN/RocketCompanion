/**
 * RLRCNetStreamRigidBodyAndBoostExtractor.ts
 * Extracts 30Hz ball and 6-slot vehicle rigid-body samples, component active flags,
 * demolish bookmarks, and continuous reconstructed boost amounts from decoded NetStream frames.
 */

import {
  RLRC_MAX_PLAYER_SLOTS,
  type RLRCBasis3x3,
  type RLRCBookmarkRecord,
  type RLRCNetStreamExtractorInput,
  type RLRCNetStreamExtractorOutput,
  type RLRCNetStreamRawFrame,
  type RLRCRigidBodySample,
  type RLRCSourceNetworkFrame,
} from '../RLRCReplayTypes.ts';
import { RLRCBallLifecycleExtractor } from './RLRCBallLifecycleExtractor.ts';
import { reconstructContinuousBoostTimeline30Hz } from './RLRCBoostTimelineReconstructor.ts';
import {
  applyCarRigidBodySampleToSlot,
  bindCarPawnToSlotState,
  buildDemolishBookmarkRecord,
  buildSourceNetworkFrameSnapshot,
  createInitialPlayerSlotTrackingStates,
  deactivatePlayerSlotState,
} from './RLRCFrameSnapshotAndBookmarkBuilder.ts';
import {
  extractActorIdFromAttr,
  extractRigidBodySample,
  extractVec3,
  numAttr,
  recAttr,
} from './RLRCNetStreamAttributeDecoders.ts';
import {
  applyScoreAndClockPropertyToMatchState,
  applyVehicleControlAndComponentProperty,
  RLRCNetStreamPriSlotTable,
  type RLRCMatchFrameScoreAndClockState,
} from './RLRCRigidBodyAttributePrimitives.ts';

export type {
  RLRCBasis3x3,
  RLRCNetStreamExtractorInput,
  RLRCNetStreamExtractorOutput,
  RLRCNetStreamRawFrame,
};

export class RLRCNetStreamRigidBodyAndBoostExtractor {
  public run(input: RLRCNetStreamExtractorInput): RLRCNetStreamExtractorOutput {
    const actorTypeById = new Map<number, string>();
    const componentCarById = new Map<number, number>();
    const carRbById = new Map<number, RLRCRigidBodySample>();
    const carRbFrameById = new Map<number, number>();
    const priTable = new RLRCNetStreamPriSlotTable(input);
    const ballLifecycle = new RLRCBallLifecycleExtractor();

    const slots = createInitialPlayerSlotTrackingStates();
    const restingSamplesBySlotIndex = Array.from(
      { length: RLRC_MAX_PLAYER_SLOTS },
      (): RLRCRigidBodySample[] => []
    );
    const boostAnchorsBySlot = Array.from(
      { length: RLRC_MAX_PLAYER_SLOTS },
      () => new Map<number, number>()
    );
    const spawnFramesBySlot = Array.from(
      { length: RLRC_MAX_PLAYER_SLOTS },
      () => new Set<number>()
    );

    const resolveSlotForCar = (carActorId: number): number =>
      priTable.resolveSlotForCar(carActorId, slots);
    const deactivateSlotByCar = (carActorId: number, clearCarId = false): void => {
      for (const slotState of slots) {
        if (slotState.carId === carActorId) {
          deactivatePlayerSlotState(slotState, clearCarId);
        }
      }
    };

    const networkFrames: RLRCSourceNetworkFrame[] = [];
    const demolishBookmarks: RLRCBookmarkRecord[] = [];
    const matchState: RLRCMatchFrameScoreAndClockState = {
      secondsRemaining: 300,
      isOvertime: false,
      roundCountdownNumber: 0,
      blueScore: 0,
      orangeScore: 0,
      lastDemolishTime: -1e9,
      lastDemolishSlot: -1,
    };
    const startTimeSeconds = input.frames.length > 0 ? input.frames[0].time : 0;

    for (let frameIdx = 0; frameIdx < input.frames.length; frameIdx++) {
      const frame = input.frames[frameIdx];
      const timeSeconds = numAttr(frame.time);
      const deltaSeconds = numAttr(frame.delta, 1 / 30);
      const isKeyframe = input.keyframeIndices?.has(frameIdx) ?? false;

      ballLifecycle.beginFrame();
      for (const slotState of slots) {
        slotState.rbUpdated = false;
        if (
          slotState.isDemolished &&
          slotState.demolishFrameIndex >= 0 &&
          frameIdx - slotState.demolishFrameIndex > 95
        ) {
          slotState.isDemolished = false;
          slotState.demolishFrameIndex = -1;
        }
        if (slotState.jumpOneShotFrame >= 0 && slotState.jumpOneShotFrame < frameIdx) {
          slotState.jumpActive = false;
          slotState.jumpOneShotFrame = -1;
        }
        if (slotState.doubleJumpOneShotFrame >= 0 && slotState.doubleJumpOneShotFrame < frameIdx) {
          slotState.doubleJumpActive = false;
          slotState.doubleJumpOneShotFrame = -1;
        }
        if (slotState.dodgeOneShotFrame >= 0 && slotState.dodgeOneShotFrame < frameIdx) {
          slotState.dodgeActive = false;
          slotState.dodgeOneShotFrame = -1;
        }
      }

      for (const deletedId of frame.deleted_actors ?? []) {
        actorTypeById.delete(deletedId);
        priTable.carPriById.delete(deletedId);
        componentCarById.delete(deletedId);
        carRbById.delete(deletedId);
        carRbFrameById.delete(deletedId);
        deactivateSlotByCar(deletedId, true);
        ballLifecycle.onActorDeleted(deletedId);
      }

      for (const newActor of frame.new_actors ?? []) {
        const objectTypeName = input.objects[newActor.object_id] ?? '';
        const actorId = newActor.actor_id;
        actorTypeById.set(actorId, objectTypeName);
        const initLoc = newActor.initial_trajectory?.location
          ? extractVec3(newActor.initial_trajectory.location)
          : undefined;
        ballLifecycle.onActorSpawned(
          actorId,
          objectTypeName,
          initLoc,
          frameIdx,
          isKeyframe,
          frame.new_actors
        );
      }

      for (const updatedActor of frame.updated_actors ?? []) {
        const actorId = updatedActor.actor_id;
        const propertyName = input.objects[updatedActor.object_id] ?? '';
        const rawAttribute = updatedActor.attribute;
        const actorType = actorTypeById.get(actorId) ?? '';
        const attributeRecord = recAttr(rawAttribute);
        const ownerCarActorId = componentCarById.get(actorId) ?? actorId;

        if (
          priTable.applyPriProperty(
            propertyName,
            actorId,
            rawAttribute,
            attributeRecord,
            actorTypeById
          ) ||
          applyScoreAndClockPropertyToMatchState(
            matchState,
            propertyName,
            actorType,
            attributeRecord,
            isKeyframe
          ) ||
          applyVehicleControlAndComponentProperty({
            propertyName,
            actorId,
            ownerCarActorId,
            actorType,
            rawAttribute,
            attributeRecord,
            frameIdx,
            timeSeconds,
            isKeyframe,
            componentCarById,
            slots,
            boostAnchorsBySlot,
            resolveSlotForCar,
          })
        ) {
          continue;
        }

        if (propertyName === 'Engine.Pawn:PlayerReplicationInfo') {
          const priId = extractActorIdFromAttr(rawAttribute);
          if (priId < 0) {
            priTable.carPriById.delete(actorId);
            deactivateSlotByCar(actorId, true);
          } else {
            const slotIdx = priTable.bindCarPriAndResolveSlot(actorId, priId);
            if (
              slotIdx >= 0 &&
              bindCarPawnToSlotState({
                slotState: slots[slotIdx],
                actorId,
                frameIdx,
                isHidden: ballLifecycle.isActorHidden(actorId),
                sameFrameRb:
                  carRbFrameById.get(actorId) === frameIdx ? carRbById.get(actorId) : undefined,
                initLoc: ballLifecycle.getInitialLocation(actorId),
              })
            ) {
              spawnFramesBySlot[slotIdx].add(frameIdx);
            }
          }
        } else if (propertyName === 'Engine.Actor:bHidden') {
          const isHidden = ballLifecycle.onActorHiddenChanged(actorId, actorType, rawAttribute);
          const slotIdx = resolveSlotForCar(actorId);
          if (actorType.includes('Car') && slotIdx >= 0 && slots[slotIdx].carId === actorId) {
            if (isHidden) {
              deactivatePlayerSlotState(slots[slotIdx]);
            } else {
              if (!slots[slotIdx].entityActive) {
                spawnFramesBySlot[slotIdx].add(frameIdx);
              }
              slots[slotIdx].entityActive = true;
              slots[slotIdx].isDemolished = false;
            }
          }
        } else if (propertyName.endsWith(':ReplicatedRBState')) {
          const rbSample = extractRigidBodySample(rawAttribute);
          if (!rbSample) continue;
          const updatedRb: RLRCRigidBodySample = { ...rbSample, rbUpdated: true };
          if (actorType.includes('Ball')) {
            ballLifecycle.onBallRigidBodySample(actorId, rbSample, frameIdx, networkFrames);
          } else if (actorType.includes('Car')) {
            carRbById.set(actorId, updatedRb);
            carRbFrameById.set(actorId, frameIdx);
            const slotIdx = resolveSlotForCar(actorId);
            if (slotIdx >= 0 && !ballLifecycle.isActorHidden(actorId)) {
              applyCarRigidBodySampleToSlot({
                slotState: slots[slotIdx],
                slotIdx,
                actorId,
                frameIdx,
                timeSeconds,
                rbSample,
                updatedRb,
                networkFrames,
                restingSamples: restingSamplesBySlotIndex[slotIdx],
              });
            }
          }
        } else if (propertyName.includes(':ReplicatedDemolish')) {
          const { victimSlot, bookmark } = buildDemolishBookmarkRecord({
            attrRecord: attributeRecord,
            actorId,
            frameIdx,
            timeSeconds,
            startTimeSeconds,
            isKeyframe,
            lastDemolishSlot: matchState.lastDemolishSlot,
            lastDemolishTime: matchState.lastDemolishTime,
            carPriById: priTable.carPriById,
            lastPriByCarId: priTable.lastPriByCarId,
            slotByPriId: priTable.slotByPriId,
            playerNameByPriId: priTable.playerNameByPriId,
            playerTeamByPriId: priTable.playerTeamByPriId,
            resolveSlotForCar,
          });
          if (bookmark) {
            if (victimSlot >= 0) deactivatePlayerSlotState(slots[victimSlot], false, frameIdx);
            demolishBookmarks.push(bookmark);
            matchState.lastDemolishTime = timeSeconds;
            matchState.lastDemolishSlot = victimSlot;
          }
        } else if (
          propertyName.endsWith(':ReplicatedExplosionData') ||
          propertyName.endsWith(':ReplicatedExplosionDataExtended')
        ) {
          ballLifecycle.onBallExplosion(actorId, rawAttribute, frameIdx, isKeyframe);
        }
      }

      const ballSnapshot = ballLifecycle.buildFrameBallState();
      networkFrames.push(
        buildSourceNetworkFrameSnapshot({
          frameIdx,
          timeSeconds,
          deltaSeconds,
          secondsRemaining: matchState.secondsRemaining,
          isOvertime: matchState.isOvertime,
          roundCountdownNumber: matchState.roundCountdownNumber,
          blueScore: matchState.blueScore,
          orangeScore: matchState.orangeScore,
          ballSnapshot,
          slots,
        })
      );
    }

    reconstructContinuousBoostTimeline30Hz(
      networkFrames,
      { anchorsBySlot: boostAnchorsBySlot, spawnFramesBySlot },
      input.boostPadEvents
    );

    const restingSamplesBySlot = new Map<number, readonly RLRCRigidBodySample[]>();
    for (let slotIndex = 0; slotIndex < RLRC_MAX_PLAYER_SLOTS; slotIndex++) {
      if (restingSamplesBySlotIndex[slotIndex].length > 0) {
        restingSamplesBySlot.set(slotIndex, restingSamplesBySlotIndex[slotIndex]);
      }
    }

    return {
      networkFrames,
      demolishBookmarks,
      goalExplosionFrames: ballLifecycle.getGoalExplosionFrames(),
      restingSamplesBySlot,
    };
  }
}

export const extractNetStreamRigidBodyAndBoostTimeline = (
  input: RLRCNetStreamExtractorInput
): RLRCNetStreamExtractorOutput => new RLRCNetStreamRigidBodyAndBoostExtractor().run(input);
