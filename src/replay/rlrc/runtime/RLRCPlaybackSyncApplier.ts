/**
 * RLRCPlaybackSyncApplier.ts
 * Stateful 120Hz physics state, slot lifecycle, and HUD POV slot synchronizer for RLRC Replay playback.
 */

import {
  SIM_OFFSETS,
  BALL_STATE_STRIDE,
  CAR_STATE_STRIDE,
  EXTENDED_STATE_OFFSETS,
  MAX_CARS,
  NUM_BOOST_PADS,
} from '../../../physics/RocketSimConstants.ts';
import {
  RLRC_MAX_PLAYER_SLOTS,
  type RLRCFrame120Hz,
  type RLRCPlayerSlotMeta,
  type RLRCSynthesizedCarControls,
  type RLRCTeamIndex,
} from '../RLRCReplayTypes.ts';
import {
  NEUTRAL_RLRC_CAR_CONTROLS,
  computeRLRCTeamSlotKeyMapping,
  findRLRCCarBySlot,
  writeBallFrameToSlice,
  writeBoostPadCooldownsToStateBuffer,
  writeCarFrameToSlice,
  type RLRCPovSlotResolution,
} from './RLRCFrameStateSliceWriter.ts';
import {
  despawnPlaybackSlotEntity,
  resetPlaybackCarVisibility,
  spawnPlaybackSlotEntity,
  syncPlaybackBallVisibility,
  syncPlaybackInterpolatorBuffers,
  type RLRCPlaybackArenaPort,
  type RLRCPlaybackPhysicsPort,
  type RLRCPlaybackRuntimePort,
} from './RLRCPlaybackEntityLifecyclePipeline.ts';

export type { RLRCPovSlotResolution } from './RLRCFrameStateSliceWriter.ts';
export type {
  RLRCPlaybackArenaPort,
  RLRCPlaybackPhysicsPort,
  RLRCPlaybackRuntimePort,
} from './RLRCPlaybackEntityLifecyclePipeline.ts';

export interface RLRCFrameSyncOptions {
  readonly smoothStep?: boolean;
  readonly activePovSlotIndex?: number;
  readonly excludedSlotMask?: number;
  readonly syncBall?: boolean;
  readonly syncBoostPads?: boolean;
}

export interface RLRCFrameSyncSummary {
  readonly frameIndex120Hz: number;
  readonly activeSlotMask: number;
  readonly spawnedSlotMask: number;
  readonly removedSlotMask: number;
  readonly activeCarCount: number;
}

export class RLRCPlaybackSyncApplier {
  private readonly _rosterBySlot = new Map<number, RLRCPlayerSlotMeta>();
  private _orderedRoster: readonly RLRCPlayerSlotMeta[] = [];
  private _slotKeyToCarIndex: Record<number, number> = {};
  private _carIndexToSlotKey: Record<number, number> = {};
  private readonly _activeSlotFlags = new Uint8Array(MAX_CARS);
  private readonly _scratchBallSlice = new Float32Array(BALL_STATE_STRIDE);
  private readonly _scratchCarSlice = new Float32Array(CAR_STATE_STRIDE);
  private _prevStateBuffer: Float32Array | null = null;
  private _currStateBuffer: Float32Array | null = null;
  private _lastBallActive: boolean | null = null;
  private _lastAppliedFrameIndex = -1;

  public configureRoster(
    roster: readonly RLRCPlayerSlotMeta[],
    simPort: RLRCPlaybackRuntimePort | null
  ): void {
    this._rosterBySlot.clear();
    this._orderedRoster = roster;
    this.resetLifecycleTracking();
    for (const meta of roster) {
      if (meta.slotIndex >= 0 && meta.slotIndex < RLRC_MAX_PLAYER_SLOTS) {
        this._rosterBySlot.set(meta.slotIndex, meta);
      }
    }
    const defaultTeam: RLRCTeamIndex = roster[0]?.team === 1 ? 1 : 0;
    const mapping = computeRLRCTeamSlotKeyMapping(roster, defaultTeam);
    this._slotKeyToCarIndex = mapping.slotKeyToCarIndex;
    this._carIndexToSlotKey = mapping.carIndexToSlotKey;
    if (simPort) simPort._lastHudSlotCarMap = mapping.slotKeyToCarIndex;

    const sim = simPort?.physics;
    const arena = simPort?.arena;
    if (sim) {
      for (let slot = MAX_CARS - 1; slot >= 0; slot--) {
        if (sim.isCarSlotActive?.(slot)) sim.removeCar?.(slot);
      }
    }
    if (arena?.cars) {
      for (let slot = 0; slot < arena.cars.length; slot++) {
        resetPlaybackCarVisibility(arena, slot, false);
      }
    }
    syncPlaybackBallVisibility(arena, true, true);
    arena?.resetBoostPads?.();
  }

  public resolvePovSlotForHudKey(
    slotKey: number,
    simPort?: RLRCPlaybackRuntimePort | null
  ): RLRCPovSlotResolution | null {
    if (this._orderedRoster.length === 0) return null;
    const clampedKey = Math.max(1, Math.min(6, Math.round(slotKey) || 1)) as 1 | 2 | 3 | 4 | 5 | 6;
    const mappedSlot = simPort?._lastHudSlotCarMap?.[clampedKey];
    const applierSlot = this._slotKeyToCarIndex[clampedKey];
    const targetSlotIndex =
      typeof mappedSlot === 'number' && this._rosterBySlot.has(mappedSlot)
        ? mappedSlot
        : typeof applierSlot === 'number' && this._rosterBySlot.has(applierSlot)
          ? applierSlot
          : clampedKey - 1;
    const meta = this._rosterBySlot.get(targetSlotIndex) ?? this._orderedRoster[0];
    if (!meta) return null;

    const team: RLRCTeamIndex = meta.team === 1 ? 1 : 0;
    const updated = computeRLRCTeamSlotKeyMapping(this._orderedRoster, team);
    this._slotKeyToCarIndex = updated.slotKeyToCarIndex;
    this._carIndexToSlotKey = updated.carIndexToSlotKey;
    if (simPort) simPort._lastHudSlotCarMap = updated.slotKeyToCarIndex;
    const resolvedSlotKey = Math.max(
      1,
      Math.min(6, updated.carIndexToSlotKey[meta.slotIndex] ?? clampedKey)
    ) as 1 | 2 | 3 | 4 | 5 | 6;

    return {
      slotIndex: meta.slotIndex,
      slotKey: resolvedSlotKey,
      team,
      slotKeyToCarIndex: updated.slotKeyToCarIndex,
      carIndexToSlotKey: updated.carIndexToSlotKey,
    };
  }

  public getSlotKeyForCarIndex(slotIndex: number): 1 | 2 | 3 | 4 | 5 | 6 {
    const mapped = this._carIndexToSlotKey[slotIndex];
    return Math.max(1, Math.min(6, mapped ?? slotIndex + 1)) as 1 | 2 | 3 | 4 | 5 | 6;
  }

  public resetLifecycleTracking(): void {
    this._activeSlotFlags.fill(0);
    this._lastBallActive = null;
    this._lastAppliedFrameIndex = -1;
    this._prevStateBuffer?.fill(0);
    this._currStateBuffer?.fill(0);
  }

  public getLastAppliedFrameIndex = (): number => this._lastAppliedFrameIndex;
  public isSlotCurrentlyActive = (slot: number): boolean =>
    slot >= 0 && slot < MAX_CARS && this._activeSlotFlags[slot] === 1;

  public applyFrame120Hz(
    frame: RLRCFrame120Hz,
    simPort: RLRCPlaybackRuntimePort | null,
    options: RLRCFrameSyncOptions = {}
  ): RLRCFrameSyncSummary {
    let activeSlotMask = 0;
    let spawnedSlotMask = 0;
    let removedSlotMask = 0;
    let activeCarCount = 0;
    if (!simPort?.physics) {
      return {
        frameIndex120Hz: frame.frameIndex120Hz,
        activeSlotMask,
        spawnedSlotMask,
        removedSlotMask,
        activeCarCount,
      };
    }

    const sim = simPort.physics;
    const arena = simPort.arena;
    const excludedMask = options.excludedSlotMask ?? 0;
    const explicitPov = options.activePovSlotIndex;
    const povSlot =
      typeof explicitPov === 'number' && explicitPov >= 0
        ? explicitPov
        : Math.max(0, simPort.playerCarIndex ?? 0);
    if (typeof explicitPov === 'number' && explicitPov >= 0) {
      simPort.playerCarIndex = explicitPov;
      if (arena) arena.playerCarIndex = explicitPov;
    }
    if (simPort.keyboard?.ballControlEnabled) simPort.keyboard.ballControlEnabled = false;

    const ballActive = Boolean(frame.ball.entityActive);
    const ballChanged = this._lastBallActive !== null && this._lastBallActive !== ballActive;
    this._lastBallActive = ballActive;

    if (options.syncBall !== false) {
      writeBallFrameToSlice(frame.ball, this._scratchBallSlice);
      sim.setBallState?.(this._scratchBallSlice);
      if (sim.state.length >= SIM_OFFSETS.BALL + BALL_STATE_STRIDE) {
        sim.state.set(this._scratchBallSlice, SIM_OFFSETS.BALL);
      }
      if (sim.state.length > EXTENDED_STATE_OFFSETS.IS_BALL_SLEEPING) {
        sim.state[EXTENDED_STATE_OFFSETS.IS_BALL_SLEEPING] =
          (ballActive ? 0 : 2) | (frame.ball.rigidBody.sleeping ? 1 : 0);
      }
      syncPlaybackBallVisibility(arena, ballActive, !ballActive || ballChanged);
    }

    let maxSlot = Math.max(1, this._rosterBySlot.size);
    let povControls: RLRCSynthesizedCarControls = NEUTRAL_RLRC_CAR_CONTROLS;

    for (let slot = 0; slot < RLRC_MAX_PLAYER_SLOTS; slot++) {
      if ((excludedMask & (1 << slot)) !== 0) {
        if (sim.isCarSlotActive?.(slot)) {
          activeSlotMask |= 1 << slot;
          activeCarCount++;
          maxSlot = Math.max(maxSlot, slot + 1);
        }
        continue;
      }

      const carFrame = findRLRCCarBySlot(frame.cars, slot);
      const wantActive = Boolean(carFrame?.entityActive);
      const wasActive = this._activeSlotFlags[slot] === 1 && (sim.isCarSlotActive?.(slot) ?? true);

      if (wantActive && !wasActive) {
        spawnPlaybackSlotEntity(slot, simPort, this._rosterBySlot.get(slot));
        this._activeSlotFlags[slot] = 1;
        spawnedSlotMask |= 1 << slot;
      } else if (!wantActive && (wasActive || (sim.isCarSlotActive?.(slot) ?? false))) {
        despawnPlaybackSlotEntity(slot, simPort, carFrame, this._rosterBySlot.has(slot));
        this._activeSlotFlags[slot] = 0;
        removedSlotMask |= 1 << slot;
      }

      if (wantActive && carFrame) {
        const controls = carFrame.controls || NEUTRAL_RLRC_CAR_CONTROLS;
        writeCarFrameToSlice(carFrame, this._scratchCarSlice);
        sim.setCarState?.(slot, this._scratchCarSlice);
        const offset = SIM_OFFSETS.CARS + slot * CAR_STATE_STRIDE;
        if (sim.state.length >= offset + CAR_STATE_STRIDE) {
          sim.state.set(this._scratchCarSlice, offset);
        }
        sim.setControls?.(slot, controls);
        if (slot === povSlot) povControls = controls;
        if (arena?.cars?.[slot]) arena.cars[slot]!.visible = true;
        activeSlotMask |= 1 << slot;
        activeCarCount++;
        maxSlot = Math.max(maxSlot, slot + 1);
      } else if (!wantActive && carFrame && this._rosterBySlot.has(slot)) {
        writeCarFrameToSlice(carFrame, this._scratchCarSlice);
        const offset = SIM_OFFSETS.CARS + slot * CAR_STATE_STRIDE;
        if (sim.state.length >= offset + CAR_STATE_STRIDE) {
          sim.state.set(this._scratchCarSlice, offset);
        }
        maxSlot = Math.max(maxSlot, slot + 1);
      }
    }

    if ((excludedMask & (1 << povSlot)) === 0) {
      if (simPort.playerControls && typeof simPort.playerControls === 'object') {
        Object.assign(simPort.playerControls, povControls);
      } else {
        simPort.playerControls = { ...povControls };
      }
      simPort.playerThrottle = Number(povControls.throttle) || 0;
    }

    sim.state[SIM_OFFSETS.TICK] = Math.max(16, frame.frameIndex120Hz + 16);
    sim.state[SIM_OFFSETS.NUM_CARS] = maxSlot;
    sim.state[SIM_OFFSETS.NUM_PADS] = NUM_BOOST_PADS;
    if (options.syncBoostPads !== false && frame.boostPadCooldowns) {
      this.applyBoostPadCooldowns(frame.boostPadCooldowns, sim.state);
    }

    const stateLength = sim.state.length;
    if (!this._prevStateBuffer || this._prevStateBuffer.length !== stateLength) {
      this._prevStateBuffer = new Float32Array(stateLength);
      this._currStateBuffer = new Float32Array(stateLength);
    }
    syncPlaybackInterpolatorBuffers({
      simState: sim.state,
      prev: this._prevStateBuffer,
      curr: this._currStateBuffer!,
      interpolator: simPort.interpolator,
      frameIndex120Hz: frame.frameIndex120Hz,
      lastAppliedFrameIndex: this._lastAppliedFrameIndex,
      smoothStep: Boolean(options.smoothStep),
      ballChanged,
      changedSlotMask: spawnedSlotMask | removedSlotMask,
    });

    this._lastAppliedFrameIndex = frame.frameIndex120Hz;
    return {
      frameIndex120Hz: frame.frameIndex120Hz,
      activeSlotMask,
      spawnedSlotMask,
      removedSlotMask,
      activeCarCount,
    };
  }

  public applyBoostPadCooldowns(
    cooldowns: Float32Array | ArrayLike<number>,
    stateBuffer: Float32Array
  ): void {
    writeBoostPadCooldownsToStateBuffer(cooldowns, stateBuffer);
  }
}
