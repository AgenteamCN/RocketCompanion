/**
 * RLRCPlaybackEntityLifecyclePipeline.ts
 * Pure helper pipeline for RLRC Replay playback arena/physics entity spawn, despawn,
 * visibility toggling, and interpolator prev/curr state buffer synchronization.
 */

import {
  BALL_STATE_STRIDE,
  CAR_STATE_STRIDE,
  SIM_OFFSETS,
} from '../../../physics/RocketSimConstants.ts';
import {
  RLRC_MAX_PLAYER_SLOTS,
  type RLRCCarFrameState120Hz,
  type RLRCPlayerSlotMeta,
  type RLRCSynthesizedCarControls,
} from '../RLRCReplayTypes.ts';
import {
  NEUTRAL_RLRC_CAR_CONTROLS,
  writeCarFrameToSlice,
  writeParkedCarSlice,
} from './RLRCFrameStateSliceWriter.ts';

export interface RLRCPlaybackPhysicsPort {
  readonly state: Float32Array;
  readonly numCars?: number;
  isCarSlotActive?: (slot: number) => boolean;
  addCarAtSlot?: (slot: number, team: number, hitboxId: string) => number;
  removeCar?: (slot: number) => boolean;
  setCarTeam?: (slot: number, team: number) => boolean;
  setCarHitbox?: (slot: number, hitboxId: string) => boolean;
  setBallState?: (ballSlice: Float32Array) => boolean;
  setCarState?: (slot: number, carSlice: Float32Array) => boolean;
  setControls?: (slot: number, controls: RLRCSynthesizedCarControls) => void;
}

export interface RLRCPlaybackArenaPort {
  playerCarIndex?: number;
  ball?: { visible?: boolean } | null;
  indicatorRing?: { visible?: boolean } | null;
  indicatorHeightRing?: { visible?: boolean } | null;
  ballSpeedTrail?: { reset?: () => void } | null;
  cars?: Array<{ visible?: boolean } | null | undefined>;
  ensureOpponent?: () => Promise<void> | void;
  ensureCar?: (slot: number, team: number, visualId: string) => unknown;
  removeCar?: (slot: number) => boolean;
  setCarTeam?: (slot: number, team: number) => void;
  setCarColor?: (slot: number, colorHex: string) => void;
  setCarLoadout?: (slot: number, loadout: Record<string, unknown>) => void;
  resetCarBoosts?: (slot: number | null) => void;
  resetBoostPads?: () => void;
  carDemolitions?: Array<{ stop?: () => void } | null | undefined>;
  supersonicWheelTrailSystem?: { resetCar?: (slot: number | null) => void } | null;
}

export interface RLRCPlaybackRuntimePort {
  playerCarIndex?: number;
  playerControls?: RLRCSynthesizedCarControls | Record<string, unknown> | null;
  playerThrottle?: number;
  _lastHudSlotCarMap?: Record<number, number> | null;
  physics?: RLRCPlaybackPhysicsPort | null;
  arena?: RLRCPlaybackArenaPort | null;
  interpolator?: { prevState: Float32Array; currState: Float32Array; alpha: number } | null;
  keyboard?: { ballControlEnabled?: boolean } | null;
}

const DEFAULT_TEAM_HEX: readonly [string, string] = ['#38bdf8', '#fb923c'];

export function syncPlaybackBallVisibility(
  arena: RLRCPlaybackArenaPort | null | undefined,
  visible: boolean,
  resetTrail: boolean
): void {
  if (!arena) return;
  if (arena.ball) arena.ball.visible = visible;
  if (arena.indicatorRing) arena.indicatorRing.visible = visible;
  if (arena.indicatorHeightRing) arena.indicatorHeightRing.visible = visible;
  if (resetTrail) arena.ballSpeedTrail?.reset?.();
}

export function resetPlaybackCarVisibility(
  arena: RLRCPlaybackArenaPort | null | undefined,
  slot: number,
  visible: boolean,
  stopDemolition = true
): void {
  if (!arena) return;
  if (arena.cars?.[slot]) arena.cars[slot]!.visible = visible;
  if (!visible) arena.resetCarBoosts?.(slot);
  if (stopDemolition) arena.carDemolitions?.[slot]?.stop?.();
  arena.supersonicWheelTrailSystem?.resetCar?.(slot);
}

export function spawnPlaybackSlotEntity(
  slot: number,
  simPort: RLRCPlaybackRuntimePort,
  meta: RLRCPlayerSlotMeta | undefined
): void {
  const team = meta?.team === 1 ? 1 : 0;
  const hitboxId = meta?.hitboxId || 'hitbox-octane';
  const visualId = meta?.visualId || 'fennec';
  const colorHex = meta?.primaryColorHex || DEFAULT_TEAM_HEX[team];

  simPort.physics?.addCarAtSlot?.(slot, team, hitboxId);
  simPort.physics?.setCarTeam?.(slot, team);
  simPort.physics?.setCarHitbox?.(slot, hitboxId);

  const arena = simPort.arena;
  if (!arena) return;
  if (slot === 1) void arena.ensureOpponent?.();
  arena.ensureCar?.(slot, team, visualId);
  arena.setCarTeam?.(slot, team);
  arena.setCarColor?.(slot, colorHex);
  arena.setCarLoadout?.(slot, { name: meta?.userName || `Player ${slot + 1}`, colorHex });
  resetPlaybackCarVisibility(arena, slot, true, true);
}

export function despawnPlaybackSlotEntity(
  slot: number,
  simPort: RLRCPlaybackRuntimePort,
  carFrame: RLRCCarFrameState120Hz | null,
  hasRosterEntry: boolean
): void {
  const sim = simPort.physics;
  const offset = SIM_OFFSETS.CARS + slot * CAR_STATE_STRIDE;
  if (sim?.isCarSlotActive?.(slot)) sim.removeCar?.(slot);
  if (sim?.state && offset + CAR_STATE_STRIDE <= sim.state.length) {
    const dst = sim.state.subarray(offset, offset + CAR_STATE_STRIDE);
    if (carFrame && hasRosterEntry) writeCarFrameToSlice(carFrame, dst);
    else writeParkedCarSlice(slot, dst);
  }
  sim?.setControls?.(slot, NEUTRAL_RLRC_CAR_CONTROLS);
  resetPlaybackCarVisibility(simPort.arena, slot, false, false);
}

export function syncPlaybackInterpolatorBuffers(params: {
  readonly simState: Float32Array;
  readonly prev: Float32Array;
  readonly curr: Float32Array;
  readonly interpolator: RLRCPlaybackRuntimePort['interpolator'];
  readonly frameIndex120Hz: number;
  readonly lastAppliedFrameIndex: number;
  readonly smoothStep: boolean;
  readonly ballChanged: boolean;
  readonly changedSlotMask: number;
}): void {
  const {
    simState,
    prev,
    curr,
    interpolator,
    frameIndex120Hz,
    lastAppliedFrameIndex,
    smoothStep,
    ballChanged,
    changedSlotMask,
  } = params;
  const canInterpolate =
    smoothStep &&
    lastAppliedFrameIndex >= 0 &&
    Math.abs(frameIndex120Hz - lastAppliedFrameIndex) <= 4;

  if (canInterpolate) {
    if (frameIndex120Hz !== lastAppliedFrameIndex) prev.set(curr);
    curr.set(simState);
    if (ballChanged && SIM_OFFSETS.BALL + BALL_STATE_STRIDE <= prev.length) {
      prev.set(
        curr.subarray(SIM_OFFSETS.BALL, SIM_OFFSETS.BALL + BALL_STATE_STRIDE),
        SIM_OFFSETS.BALL
      );
    }
    for (let slot = 0; changedSlotMask !== 0 && slot < RLRC_MAX_PLAYER_SLOTS; slot++) {
      if ((changedSlotMask & (1 << slot)) !== 0) {
        const offset = SIM_OFFSETS.CARS + slot * CAR_STATE_STRIDE;
        if (offset + CAR_STATE_STRIDE <= prev.length) {
          prev.set(curr.subarray(offset, offset + CAR_STATE_STRIDE), offset);
        }
      }
    }
  } else {
    prev.set(simState);
    curr.set(simState);
  }

  if (interpolator) {
    interpolator.prevState.set(
      prev.subarray(0, Math.min(interpolator.prevState.length, prev.length))
    );
    interpolator.currState.set(
      curr.subarray(0, Math.min(interpolator.currState.length, curr.length))
    );
    if (!canInterpolate) interpolator.alpha = 0;
  }
}
