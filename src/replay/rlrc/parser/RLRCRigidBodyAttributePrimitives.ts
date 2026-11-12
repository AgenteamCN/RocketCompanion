/**
 * RLRCRigidBodyAttributePrimitives.ts
 * PRI/car slot lookup table, vehicle control/active flag appliers, and boost/pickup attribute
 * decoders for RLRC 30Hz network stream rigid-body and boost extraction.
 */

import {
  RLRC_MAX_PLAYER_SLOTS,
  type RLRCNetStreamExtractorInput,
  type RLRCTeamIndex,
} from '../RLRCReplayTypes.ts';
import {
  decodeReplicatedAxisByte,
  extractActorIdFromAttr,
  isComponentActiveByte,
  normalizeReplicatedBoostAmount,
  numAttr,
  recAttr,
  type RLRCPlayerSlotTrackingState,
} from './RLRCNetStreamAttributeDecoders.ts';

export interface RLRCDecodedBoostAttribute {
  readonly boostAmount: number;
  readonly grantCount: number | null;
}

export interface RLRCDecodedPickupAttribute {
  readonly instigatorCarActorId: number;
  readonly pickedUp: boolean;
}

export interface RLRCMatchFrameScoreAndClockState {
  secondsRemaining: number;
  isOvertime: boolean;
  roundCountdownNumber: number;
  blueScore: number;
  orangeScore: number;
  lastDemolishTime: number;
  lastDemolishSlot: number;
}

export class RLRCNetStreamPriSlotTable {
  public readonly carPriById = new Map<number, number>();
  public readonly lastPriByCarId = new Map<number, number>();
  public readonly playerNameByPriId = new Map<number, string>();
  public readonly playerTeamByPriId = new Map<number, RLRCTeamIndex>();
  public readonly slotByPriId = new Map<number, number>();
  public readonly slotByPlayerName = new Map<string, number>();

  constructor(input: RLRCNetStreamExtractorInput) {
    for (const member of input.roster ?? []) {
      if (member.slotIndex >= 0 && member.slotIndex < RLRC_MAX_PLAYER_SLOTS) {
        this.slotByPlayerName.set(member.userName, member.slotIndex);
        if (member.priActorId >= 0) {
          this.slotByPriId.set(member.priActorId, member.slotIndex);
          this.playerNameByPriId.set(member.priActorId, member.userName);
          this.playerTeamByPriId.set(member.priActorId, member.team);
        }
      }
    }
    for (const [priId, slotIdx] of input.slotByPriActorId?.entries() ?? []) {
      if (slotIdx >= 0 && slotIdx < RLRC_MAX_PLAYER_SLOTS) {
        this.slotByPriId.set(priId, slotIdx);
      }
    }
  }

  public resolveSlotForPri(priId: number, nameHint?: string): number {
    const existingSlot = this.slotByPriId.get(priId);
    if (existingSlot !== undefined) return existingSlot;
    const playerName = nameHint ?? this.playerNameByPriId.get(priId);
    if (!playerName) return -1;
    const byNameSlot = this.slotByPlayerName.get(playerName);
    if (byNameSlot !== undefined) {
      this.slotByPriId.set(priId, byNameSlot);
      return byNameSlot;
    }
    if (this.slotByPlayerName.size >= RLRC_MAX_PLAYER_SLOTS) return -1;
    const nextSlot = this.slotByPlayerName.size;
    this.slotByPlayerName.set(playerName, nextSlot);
    this.slotByPriId.set(priId, nextSlot);
    return nextSlot;
  }

  public resolveSlotForCar(carActorId: number, slots: readonly { carId: number }[]): number {
    const priId = this.carPriById.get(carActorId);
    if (priId !== undefined && this.slotByPriId.has(priId)) {
      return this.slotByPriId.get(priId)!;
    }
    return slots.findIndex((slotState) => slotState.carId === carActorId);
  }

  public bindCarPriAndResolveSlot(carActorId: number, priId: number): number {
    this.carPriById.set(carActorId, priId);
    this.lastPriByCarId.set(carActorId, priId);
    return this.resolveSlotForPri(priId);
  }

  public applyPriProperty(
    propertyName: string,
    actorId: number,
    rawAttribute: unknown,
    attributeRecord: Record<string, unknown> | null,
    actorTypeById: ReadonlyMap<number, string>
  ): boolean {
    if (propertyName.endsWith(':PlayerName')) {
      const playerName = attributeRecord?.String;
      if (typeof playerName === 'string' && playerName) {
        this.playerNameByPriId.set(actorId, playerName);
        this.resolveSlotForPri(actorId, playerName);
      }
      return true;
    }
    if (propertyName.endsWith('PlayerReplicationInfo:Team')) {
      const teamType = actorTypeById.get(extractActorIdFromAttr(rawAttribute)) ?? '';
      if (teamType.includes('Team0')) this.playerTeamByPriId.set(actorId, 0);
      else if (teamType.includes('Team1')) this.playerTeamByPriId.set(actorId, 1);
      return true;
    }
    return false;
  }
}

export function decodeReplicatedBoostAttribute(raw: unknown): RLRCDecodedBoostAttribute | null {
  const boostAmount = normalizeReplicatedBoostAmount(raw);
  if (boostAmount === null) return null;
  const outer = recAttr(raw);
  const boostObj = recAttr(outer?.ReplicatedBoost) ?? outer;
  const grantRaw = boostObj?.grant_count ?? boostObj?.grantCount;
  return {
    boostAmount,
    grantCount:
      typeof grantRaw === 'number' && Number.isFinite(grantRaw) ? Math.trunc(grantRaw) : null,
  };
}

export function decodeReplicatedPickupAttribute(raw: unknown): RLRCDecodedPickupAttribute | null {
  const outer = recAttr(raw);
  const pickupObj =
    recAttr(
      outer?.PickupNew ??
        outer?.Pickup ??
        outer?.NewReplicatedPickupData ??
        outer?.ReplicatedPickupData
    ) ?? outer;
  if (!pickupObj) return null;
  const pickedRaw = pickupObj.pickedUp ?? pickupObj.picked_up;
  let pickedUp = false;
  if (typeof pickedRaw === 'boolean') pickedUp = pickedRaw;
  else if (typeof pickedRaw === 'number' && Number.isFinite(pickedRaw))
    pickedUp = (pickedRaw & 0xff) !== 0 && (pickedRaw & 0xff) !== 255;
  else return null;

  let instigatorCarActorId = -1;
  const instigatorRaw = pickupObj.instigator ?? pickupObj.instigator_id ?? pickupObj.instigatorId;
  const instigatorObj = recAttr(instigatorRaw);
  if (typeof instigatorRaw === 'number' && Number.isFinite(instigatorRaw)) {
    instigatorCarActorId = Math.trunc(instigatorRaw);
  } else if (
    instigatorObj &&
    instigatorObj.active !== false &&
    typeof instigatorObj.actor === 'number'
  ) {
    instigatorCarActorId = Math.trunc(instigatorObj.actor);
  }
  return { instigatorCarActorId, pickedUp };
}

export function applyComponentActiveByteToSlotState(
  slotState: RLRCPlayerSlotTrackingState,
  actorType: string,
  rawAttribute: unknown,
  timeSeconds: number,
  frameIdx = -1,
  isKeyframe = false
): void {
  const outer = recAttr(rawAttribute);
  const byteVal =
    typeof rawAttribute === 'number' && Number.isFinite(rawAttribute)
      ? Math.trunc(rawAttribute) & 0xff
      : typeof outer?.Byte === 'number' && Number.isFinite(outer.Byte)
        ? Math.trunc(outer.Byte) & 0xff
        : null;
  const isActive = isComponentActiveByte(rawAttribute);
  if (isActive === null) return;
  if (actorType.includes('Boost')) {
    slotState.boostActive = isActive;
  } else if (actorType.includes('DoubleJump')) {
    const evenPulse =
      !isActive &&
      !isKeyframe &&
      byteVal !== null &&
      slotState.lastDoubleJumpByte >= 0 &&
      byteVal !== slotState.lastDoubleJumpByte;
    if (byteVal !== null) slotState.lastDoubleJumpByte = byteVal;
    slotState.doubleJumpActive = isActive || evenPulse;
    slotState.doubleJumpOneShotFrame = evenPulse ? frameIdx : -1;
    if (slotState.doubleJumpActive) slotState.flippedInAir = true;
  } else if (actorType.includes('Dodge')) {
    const evenPulse =
      !isActive &&
      !isKeyframe &&
      byteVal !== null &&
      slotState.lastDodgeByte >= 0 &&
      byteVal !== slotState.lastDodgeByte;
    if (byteVal !== null) slotState.lastDodgeByte = byteVal;
    slotState.dodgeActive = isActive || evenPulse;
    slotState.dodgeOneShotFrame = evenPulse ? frameIdx : -1;
    if (slotState.dodgeActive) slotState.flippedInAir = true;
  } else if (actorType.includes('Jump')) {
    const evenPulse =
      !isActive &&
      !isKeyframe &&
      byteVal !== null &&
      slotState.lastJumpByte >= 0 &&
      byteVal !== slotState.lastJumpByte;
    if (byteVal !== null) slotState.lastJumpByte = byteVal;
    slotState.jumpActive = isActive || evenPulse;
    slotState.jumpOneShotFrame = evenPulse ? frameIdx : -1;
    if (slotState.jumpActive) slotState.lastJumpTimeSeconds = timeSeconds;
  }
}

export function applyVehicleControlAndComponentProperty(params: {
  readonly propertyName: string;
  readonly actorId: number;
  readonly ownerCarActorId: number;
  readonly actorType: string;
  readonly rawAttribute: unknown;
  readonly attributeRecord: Record<string, unknown> | null;
  readonly frameIdx: number;
  readonly timeSeconds: number;
  readonly isKeyframe?: boolean;
  readonly componentCarById: Map<number, number>;
  readonly slots: readonly RLRCPlayerSlotTrackingState[];
  readonly boostAnchorsBySlot: readonly Map<number, number>[];
  readonly resolveSlotForCar: (carActorId: number) => number;
}): boolean {
  const {
    propertyName,
    actorId,
    ownerCarActorId,
    actorType,
    rawAttribute,
    attributeRecord,
    frameIdx,
    timeSeconds,
    isKeyframe = false,
    componentCarById,
    slots,
    boostAnchorsBySlot,
    resolveSlotForCar,
  } = params;

  if (propertyName === 'TAGame.CarComponent_TA:Vehicle') {
    const vehicleActorId = extractActorIdFromAttr(rawAttribute);
    if (vehicleActorId >= 0) componentCarById.set(actorId, vehicleActorId);
    return true;
  }
  if (propertyName.includes(':ReplicatedBoost')) {
    const boostAmount = normalizeReplicatedBoostAmount(rawAttribute);
    const slotIdx = resolveSlotForCar(ownerCarActorId);
    if (boostAmount !== null && slotIdx >= 0) {
      slots[slotIdx].boostAmount = boostAmount;
      boostAnchorsBySlot[slotIdx].set(frameIdx, boostAmount);
    }
    return true;
  }
  if (propertyName.endsWith(':ReplicatedThrottle')) {
    const throttle = decodeReplicatedAxisByte(rawAttribute);
    const slotIdx = resolveSlotForCar(actorId);
    if (throttle !== null && slotIdx >= 0) slots[slotIdx].throttle = throttle;
    return true;
  }
  if (propertyName.endsWith(':ReplicatedSteer')) {
    const steer = decodeReplicatedAxisByte(rawAttribute);
    const slotIdx = resolveSlotForCar(actorId);
    if (steer !== null && slotIdx >= 0) slots[slotIdx].steer = steer;
    return true;
  }
  if (propertyName.endsWith(':bReplicatedHandbrake')) {
    const slotIdx = resolveSlotForCar(actorId);
    if (slotIdx >= 0) slots[slotIdx].handbrake = Boolean(attributeRecord?.Boolean);
    return true;
  }
  if (propertyName.endsWith(':DodgeTorque')) {
    const slotIdx = resolveSlotForCar(ownerCarActorId);
    const loc = recAttr(attributeRecord?.Location) ?? attributeRecord;
    if (slotIdx >= 0 && loc) {
      const tx = numAttr(loc.x);
      const ty = numAttr(loc.y);
      const slotState = slots[slotIdx];
      slotState.dodgePitch = Math.max(-1, Math.min(1, ty / 2.24));
      slotState.dodgeYaw = Math.max(-1, Math.min(1, tx / 2.6));
      slotState.dodgeRoll = slotState.dodgeYaw;
      if (!isKeyframe && !slotState.dodgeActive && Math.hypot(tx, ty) > 0.05) {
        slotState.dodgeActive = true;
        slotState.dodgeOneShotFrame = frameIdx;
        slotState.flippedInAir = true;
      }
    }
    return true;
  }
  if (propertyName.endsWith(':DoubleJumpImpulse')) {
    const slotIdx = resolveSlotForCar(ownerCarActorId);
    if (slotIdx >= 0 && !isKeyframe) {
      const slotState = slots[slotIdx];
      if (!slotState.doubleJumpActive) {
        slotState.doubleJumpActive = true;
        slotState.doubleJumpOneShotFrame = frameIdx;
        slotState.flippedInAir = true;
      }
    }
    return true;
  }
  if (propertyName.endsWith(':ReplicatedActive')) {
    const slotIdx = resolveSlotForCar(ownerCarActorId);
    if (slotIdx >= 0) {
      applyComponentActiveByteToSlotState(
        slots[slotIdx],
        actorType,
        rawAttribute,
        timeSeconds,
        frameIdx,
        isKeyframe
      );
    }
    return true;
  }
  return false;
}

export function applyScoreAndClockPropertyToMatchState(
  matchState: RLRCMatchFrameScoreAndClockState,
  propertyName: string,
  actorType: string,
  attributeRecord: Record<string, unknown> | null,
  isKeyframe: boolean
): boolean {
  if (propertyName === 'Engine.TeamInfo:Score') {
    const scoreVal = Math.max(0, Math.trunc(numAttr(attributeRecord?.Int)));
    if (actorType.includes('Team0')) matchState.blueScore = scoreVal;
    else if (actorType.includes('Team1')) matchState.orangeScore = scoreVal;
    return true;
  }
  if (propertyName.endsWith(':SecondsRemaining') && !isKeyframe) {
    matchState.secondsRemaining = Math.max(
      0,
      Math.trunc(numAttr(attributeRecord?.Int, matchState.secondsRemaining))
    );
    return true;
  }
  if (propertyName.endsWith(':bOverTime')) {
    matchState.isOvertime = Boolean(attributeRecord?.Boolean ?? matchState.isOvertime);
    return true;
  }
  if (propertyName.endsWith(':ReplicatedRoundCountDownNumber') && !isKeyframe) {
    matchState.roundCountdownNumber = Math.max(0, Math.trunc(numAttr(attributeRecord?.Int)));
    return true;
  }
  return false;
}
