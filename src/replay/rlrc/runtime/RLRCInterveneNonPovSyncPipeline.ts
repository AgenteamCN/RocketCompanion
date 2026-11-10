/**
 * RLRCInterveneNonPovSyncPipeline.ts
 * Per-tick non-POV car synchronization and live physics step pipeline for RLRC intervention:
 * - Drives the 4 non-POV intervention modes ('disappear' | 'no-input' | 'follow-state' | 'bot-takeover')
 * - Dynamically adds/removes non-POV car entities as entityActive transitions occur
 * - Synchronizes interpolator and RingBuffer recordings after each live intervention physics tick
 */

import { patchWasmCarTransientState } from '../../../physics/CarTransientStateReconstructor.ts';
import { SIM_OFFSETS } from '../../../physics/RocketSimConstants.ts';
import type { ReplayAcknowledgedControlEntry } from '../../ReplayRingBuffer.ts';
import {
  RLRC_MAX_PLAYER_SLOTS,
  type RLRCFrame120Hz,
  type RLRCInterveneLaunchConfig,
  type RLRCNonPovInterventionMode,
  type RLRCPlayerSlotMeta,
  type RLRCSynthesizedCarControls,
  type RLRCTeamIndex,
} from '../RLRCReplayTypes.ts';
import {
  DEFAULT_NEUTRAL_CAR_CONTROLS,
  clampCarPositionZForHitbox,
  type RLRCPrerollRingBufferPort,
} from './RLRCInterveneFrameStateBuilder.ts';
import {
  applySlotControls,
  buildReconstructedCarTransientState,
  deactivateInterveneSlotEntity,
  ensureInterveneSlotEntityActive,
  writeCarRigidBodyState,
  type RLRCInterveneArenaPort,
  type RLRCInterveneBotDecisionPort,
  type RLRCInterveneEnvironmentPort,
  type RLRCIntervenePhysicsPort,
} from './RLRCInterveneTargetFrameApplier.ts';

export type * from './RLRCInterveneTargetFrameApplier.ts';

export function applyNonPovModeChangeToRuntime(params: {
  readonly env: RLRCInterveneEnvironmentPort;
  readonly mode: RLRCNonPovInterventionMode;
  readonly povSlotIndex: number;
  readonly slotActiveTracker: Uint8Array;
}): void {
  const { env, mode, povSlotIndex, slotActiveTracker } = params;
  const sim = env.getPhysics();
  const arena = env.getArena?.();
  if (mode === 'disappear' && sim) {
    for (let slot = 0; slot < RLRC_MAX_PLAYER_SLOTS; slot++) {
      if (slot !== povSlotIndex) {
        deactivateInterveneSlotEntity(sim, arena, slotActiveTracker, slot);
      }
    }
  } else if (mode === 'bot-takeover') {
    env.getBotPort?.()?.resetAllBots?.();
  }
}

export function restorePovVehicleOnExitIntervene(
  env: RLRCInterveneEnvironmentPort,
  povSlotIndex: number
): void {
  const povMeta = env.getRoster().find((r) => r.slotIndex === povSlotIndex);
  if (povMeta) {
    env
      .getArena?.()
      ?.rebuildSlotVehicle?.(
        povMeta.slotIndex,
        povMeta.team,
        povMeta.hitboxId,
        povMeta.visualId,
        povMeta.primaryColorHex
      );
  }
}

export function stepNonPovCarsBeforePhysics(params: {
  readonly sim: RLRCIntervenePhysicsPort;
  readonly arena: RLRCInterveneArenaPort | null | undefined;
  readonly botPort: RLRCInterveneBotDecisionPort | null | undefined;
  readonly roster: readonly RLRCPlayerSlotMeta[];
  readonly followFrame: RLRCFrame120Hz | null;
  readonly povSlotIndex: number;
  readonly nonPovMode: RLRCNonPovInterventionMode;
  readonly slotActiveTracker: Uint8Array;
  readonly latestControlSnapshot: Map<number, RLRCSynthesizedCarControls>;
  readonly dt: number;
}): void {
  const {
    sim,
    arena,
    botPort,
    roster,
    followFrame,
    povSlotIndex,
    nonPovMode,
    slotActiveTracker,
    latestControlSnapshot,
    dt,
  } = params;

  for (let slot = 0; slot < RLRC_MAX_PLAYER_SLOTS; slot++) {
    if (slot === povSlotIndex) continue;

    if (nonPovMode === 'disappear') {
      if (slotActiveTracker[slot] !== 0) {
        deactivateInterveneSlotEntity(sim, arena, slotActiveTracker, slot);
      }
      continue;
    }

    if (nonPovMode === 'no-input') {
      if (slotActiveTracker[slot] !== 0) {
        applySlotControls(sim, slot, DEFAULT_NEUTRAL_CAR_CONTROLS);
        latestControlSnapshot.set(slot, DEFAULT_NEUTRAL_CAR_CONTROLS);
      }
      continue;
    }

    const carFrame = followFrame?.cars[slot];
    const meta = roster.find((r) => r.slotIndex === slot);
    const team: RLRCTeamIndex = meta?.team ?? (slot < 3 ? 0 : 1);
    const hitboxId = meta?.hitboxId ?? 'hitbox-octane';

    if (nonPovMode === 'follow-state') {
      if (!carFrame) {
        if (slotActiveTracker[slot] !== 0) {
          applySlotControls(sim, slot, DEFAULT_NEUTRAL_CAR_CONTROLS);
          latestControlSnapshot.set(slot, DEFAULT_NEUTRAL_CAR_CONTROLS);
        }
        continue;
      }
      if (!carFrame.entityActive) {
        deactivateInterveneSlotEntity(sim, arena, slotActiveTracker, slot);
        continue;
      }
      ensureInterveneSlotEntityActive(sim, arena, slotActiveTracker, slot, team, hitboxId);
      const ctrl = carFrame.controls || DEFAULT_NEUTRAL_CAR_CONTROLS;
      applySlotControls(sim, slot, ctrl);
      latestControlSnapshot.set(slot, ctrl);
      continue;
    }

    if (nonPovMode === 'bot-takeover') {
      if (slotActiveTracker[slot] === 0 && carFrame?.entityActive) {
        ensureInterveneSlotEntityActive(sim, arena, slotActiveTracker, slot, team, hitboxId);
      }
      if (slotActiveTracker[slot] !== 0) {
        const botCtrl =
          botPort?.decideControlsForSlot?.(slot, team, sim.state, dt) ??
          DEFAULT_NEUTRAL_CAR_CONTROLS;
        applySlotControls(sim, slot, botCtrl);
        latestControlSnapshot.set(slot, botCtrl);
      }
    }
  }
}

export function syncFollowStateNonPovAfterStep(params: {
  readonly sim: RLRCIntervenePhysicsPort;
  readonly arena: RLRCInterveneArenaPort | null | undefined;
  readonly roster: readonly RLRCPlayerSlotMeta[];
  readonly nextFrame: RLRCFrame120Hz | null;
  readonly povSlotIndex: number;
  readonly slotActiveTracker: Uint8Array;
  readonly latestControlSnapshot?: Map<number, RLRCSynthesizedCarControls>;
}): void {
  const { sim, arena, roster, nextFrame, povSlotIndex, slotActiveTracker, latestControlSnapshot } =
    params;
  if (!nextFrame) return;

  for (let slot = 0; slot < RLRC_MAX_PLAYER_SLOTS; slot++) {
    if (slot === povSlotIndex) continue;
    const car = nextFrame.cars[slot];
    if (!car || !car.entityActive) {
      deactivateInterveneSlotEntity(sim, arena, slotActiveTracker, slot);
      continue;
    }
    const meta = roster.find((r) => r.slotIndex === slot);
    const team: RLRCTeamIndex = meta?.team ?? (slot < 3 ? 0 : 1);
    const hitboxId = meta?.hitboxId ?? 'hitbox-octane';
    ensureInterveneSlotEntityActive(sim, arena, slotActiveTracker, slot, team, hitboxId);
    const safePos = clampCarPositionZForHitbox(car.rigidBody.position, car.isOnGround, hitboxId);
    writeCarRigidBodyState(sim, slot, car, safePos);
    const ctrl = car.controls || DEFAULT_NEUTRAL_CAR_CONTROLS;
    applySlotControls(sim, slot, ctrl);
    latestControlSnapshot?.set(slot, ctrl);
    patchWasmCarTransientState(sim, slot, buildReconstructedCarTransientState(car), false);
  }
}

export function collectLiveAcknowledgedControls(
  latestControlSnapshot: ReadonlyMap<number, RLRCSynthesizedCarControls>
): ReplayAcknowledgedControlEntry[] {
  const entries: ReplayAcknowledgedControlEntry[] = [];
  for (let slot = 0; slot < RLRC_MAX_PLAYER_SLOTS; slot++) {
    const ctrl = latestControlSnapshot.get(slot) ?? DEFAULT_NEUTRAL_CAR_CONTROLS;
    entries.push({ carIndex: slot, controls: { ...ctrl } });
  }
  return entries;
}

export function prepareInterveneStepBeforePhysics(params: {
  readonly env: RLRCInterveneEnvironmentPort;
  readonly sim: RLRCIntervenePhysicsPort;
  readonly followIdx: number;
  readonly povSlotIndex: number;
  readonly nonPovMode: RLRCNonPovInterventionMode;
  readonly playerControls: RLRCSynthesizedCarControls;
  readonly dt: number;
  readonly slotActiveTracker: Uint8Array;
  readonly latestControlSnapshot: Map<number, RLRCSynthesizedCarControls>;
  readonly prevStepStateBuffer: Float32Array | null;
}): Float32Array | null {
  const {
    env,
    sim,
    followIdx,
    povSlotIndex,
    nonPovMode,
    playerControls,
    dt,
    slotActiveTracker,
    latestControlSnapshot,
  } = params;
  let prevBuf = params.prevStepStateBuffer;

  if (sim.state) {
    if (!prevBuf || prevBuf.length !== sim.state.length) {
      prevBuf = new Float32Array(sim.state.length);
    }
    prevBuf.set(sim.state);
  }

  latestControlSnapshot.clear();
  applySlotControls(sim, povSlotIndex, playerControls);
  latestControlSnapshot.set(povSlotIndex, playerControls);

  const frames = env.getFrames120Hz();
  stepNonPovCarsBeforePhysics({
    sim,
    arena: env.getArena?.(),
    botPort: env.getBotPort?.(),
    roster: env.getRoster(),
    followFrame: followIdx >= 0 && followIdx < frames.length ? frames[followIdx] : null,
    povSlotIndex,
    nonPovMode,
    slotActiveTracker,
    latestControlSnapshot,
    dt,
  });

  return prevBuf;
}

export function finalizeInterveneStepAfterPhysics(params: {
  readonly env: RLRCInterveneEnvironmentPort;
  readonly sim: RLRCIntervenePhysicsPort;
  readonly followIdx: number;
  readonly povSlotIndex: number;
  readonly nonPovMode: RLRCNonPovInterventionMode;
  readonly recordedTick: number;
  readonly recordToRingBuffer: boolean;
  readonly slotActiveTracker: Uint8Array;
  readonly latestControlSnapshot: Map<number, RLRCSynthesizedCarControls>;
  readonly prevStepStateBuffer: Float32Array | null;
}): void {
  const {
    env,
    sim,
    followIdx,
    povSlotIndex,
    nonPovMode,
    recordedTick,
    recordToRingBuffer,
    slotActiveTracker,
    latestControlSnapshot,
    prevStepStateBuffer,
  } = params;
  const arena = env.getArena?.();

  if (nonPovMode === 'follow-state') {
    const frames = env.getFrames120Hz();
    const nextIdx = followIdx + 1;
    syncFollowStateNonPovAfterStep({
      sim,
      arena,
      roster: env.getRoster(),
      nextFrame: nextIdx >= 0 && nextIdx < frames.length ? frames[nextIdx] : null,
      povSlotIndex,
      slotActiveTracker,
      latestControlSnapshot,
    });
  }

  if (sim.state) {
    sim.state[SIM_OFFSETS.TICK] = recordedTick;
    if (arena?.interpolator) {
      arena.interpolator.prevState.set(prevStepStateBuffer ?? arena.interpolator.currState);
      arena.interpolator.currState.set(sim.state);
    } else {
      arena?.syncInterpolatorToState?.(sim.state, prevStepStateBuffer ?? undefined);
    }
    if (recordToRingBuffer) {
      const acknowledgedControls = collectLiveAcknowledgedControls(latestControlSnapshot);
      const slot = env
        .getRingBuffer?.()
        ?.recordFrame?.(recordedTick, sim.state, { acknowledgedControls });
      if (slot?.snapshot) slot.snapshot[SIM_OFFSETS.TICK] = recordedTick;
    }
  }
}
