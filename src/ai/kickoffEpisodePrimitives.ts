/**
 * kickoffEpisodePrimitives.ts
 * Spawn constants, MultiDiscrete action conversions, and CarJumpAirTimeTracker
 * for KickoffPPOAgent and KickoffTrainingMode.
 */

import { KICKOFF_PPO_META, getKickoffPPOActorWeights } from './kickoffPPOWeights.ts';
import { KICKOFF_SPAWNS } from '../ui-core/config/trainingDefaults.ts';

export const KICKOFF_SETTLE_TICKS: number = KICKOFF_PPO_META.settleTicks || 30;
export const TICKS_PER_DECISION: number = KICKOFF_PPO_META.actionRepeat || 4;
export const OBS_V3_DIM = 75;
export const CPP_SPAWN_INDEX_MAP: readonly number[] = [0, 2, 4, 3, 1];

export interface KickoffCarControls {
  throttle: number;
  pitch: number;
  steer: number;
  yaw: number;
  roll: number;
  jump: boolean;
  boost: boolean;
  handbrake: boolean;
}

export interface KickoffOverlayKeys {
  [key: string]: boolean;
  Shift: boolean;
  Q: boolean;
  A: boolean;
  W: boolean;
  S: boolean;
  D: boolean;
  E: boolean;
  Boost: boolean;
  Jump: boolean;
}

export interface ResetKickoffSpawnOptions {
  carIndex?: number;
  settleTicks?: number;
  hitboxType?: string;
  recreateArena?: boolean;
}

export interface KickoffSpawnResettableEngine {
  numCars?: number;
  module?: {
    _physics_createArena?: () => number;
  } | null;
  addCar?: (team: number, hitboxType?: string) => number;
  resetKickoffAtSpawn?: (cppSpawnIndex: number, settleTicks: number) => boolean | void;
  resetKickoff: (seed?: number) => void;
  getCarState: (carIndex: number) => ArrayLike<number>;
  setCarState: (carIndex: number, state: Float32Array) => boolean | void;
  setControls: (carIndex: number, controls: KickoffCarControls) => void;
  stepSilent: (ticks: number) => void;
  clearEvents: () => void;
}

export function getSameSidePartnerSpawnIndex(spawnIndex: number): number | null {
  const idx = Math.max(0, Math.min(4, spawnIndex | 0));
  if (idx === 2) return null;
  return 4 - idx;
}

const JUMP_MIN_TIME = 0.025;
const JUMP_RESET_TIME_PAD = 1.0 / 40.0;
const JUMP_MAX_TIME = 0.2;
const TICK_TIME = 1.0 / 120.0;

export function getActorWeights(): ReturnType<typeof getKickoffPPOActorWeights> {
  return getKickoffPPOActorWeights();
}

export class CarJumpAirTimeTracker {
  public isJumping = false;
  public hasJumped = false;
  public jumpTime = 0.0;
  public airTime = 0.0;
  public lastJumpControl = false;

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.isJumping = false;
    this.hasJumped = false;
    this.jumpTime = 0.0;
    this.airTime = 0.0;
    this.lastJumpControl = false;
  }

  public stepTick(jumpControlBool: boolean, isOnGroundPostTick: boolean): void {
    const jumpPressed = !!jumpControlBool && !this.lastJumpControl;
    const isOnGround = !!isOnGroundPostTick;

    if (isOnGround && !this.isJumping) {
      if (!(this.hasJumped && this.jumpTime < JUMP_MIN_TIME + JUMP_RESET_TIME_PAD)) {
        this.hasJumped = false;
        this.jumpTime = 0.0;
      }
    }

    if (this.isJumping) {
      this.isJumping =
        this.jumpTime < JUMP_MIN_TIME ||
        (Boolean(jumpControlBool) && this.jumpTime < JUMP_MAX_TIME);
    } else if (isOnGround && jumpPressed) {
      this.isJumping = true;
      this.jumpTime = 0.0;
    }

    if (this.isJumping) {
      this.hasJumped = true;
    }

    if (this.isJumping || this.hasJumped) {
      this.jumpTime = Math.fround(this.jumpTime + TICK_TIME);
    }

    this.airTime = isOnGround ? 0.0 : Math.fround(this.airTime + TICK_TIME);
    this.lastJumpControl = !!jumpControlBool;
  }

  public update(isOnGroundPostTick: boolean, jumpControlBool: boolean): void {
    this.stepTick(jumpControlBool, isOnGroundPostTick);
  }
}

export function makeKickoffRawCarState(
  sx: number,
  sy: number,
  outArray: Float32Array = new Float32Array(40)
): Float32Array {
  outArray.fill(0);
  outArray[0] = sx;
  outArray[1] = sy;
  outArray[2] = 17.0;

  if (Math.abs(sx) < 500.0) {
    outArray[3] = 0.0;
    outArray[4] = 1.0;
    outArray[5] = 0.0;
    outArray[6] = -1.0;
    outArray[7] = 0.0;
    outArray[8] = 0.0;
    outArray[9] = 0.0;
    outArray[10] = 0.0;
    outArray[11] = 1.0;
  } else {
    const s2 = Math.fround(Math.SQRT1_2);
    const sgn = sx > 0 ? -1.0 : 1.0;
    outArray[3] = sgn * s2;
    outArray[4] = s2;
    outArray[5] = 0.0;
    outArray[6] = -s2;
    outArray[7] = sgn * s2;
    outArray[8] = 0.0;
    outArray[9] = 0.0;
    outArray[10] = 0.0;
    outArray[11] = 1.0;
  }

  outArray[18] = Math.fround(100.0 / 3.0);
  outArray[19] = 1.0;
  outArray[22] = 1.0;
  return outArray;
}

export function resetEngineToKickoffSpawn(
  simTarget: KickoffSpawnResettableEngine,
  spawnIndex: number = 0,
  options: ResetKickoffSpawnOptions = {}
): void {
  const {
    carIndex = 0,
    settleTicks = KICKOFF_SETTLE_TICKS,
    hitboxType = 'default',
    recreateArena = false,
  } = options;

  const spawn = KICKOFF_SPAWNS[spawnIndex] || KICKOFF_SPAWNS[0];
  const cppSpawnIdx = CPP_SPAWN_INDEX_MAP[spawnIndex] ?? 0;

  if (!recreateArena && typeof simTarget.resetKickoffAtSpawn === 'function') {
    if ((simTarget.numCars ?? 0) === 0 && typeof simTarget.addCar === 'function') {
      simTarget.addCar(0, hitboxType);
    }
    simTarget.resetKickoffAtSpawn(cppSpawnIdx, 0);
    const pre0 = new Float32Array(simTarget.getCarState(carIndex));
    if (settleTicks > 0) {
      simTarget.resetKickoffAtSpawn(cppSpawnIdx, settleTicks);
      const s0 = new Float32Array(simTarget.getCarState(carIndex));
      s0[0] = pre0[0];
      s0[1] = pre0[1];
      for (let k = 3; k <= 11; k++) s0[k] = pre0[k];
      for (let k = 12; k <= 17; k++) s0[k] = 0.0;
      simTarget.setCarState(carIndex, s0);
      simTarget.clearEvents();
    }
    return;
  }

  if (
    recreateArena &&
    simTarget.module &&
    typeof simTarget.module._physics_createArena === 'function'
  ) {
    simTarget.module._physics_createArena();
    simTarget.clearEvents();
    simTarget.addCar?.(0, hitboxType);
  }

  simTarget.resetKickoff(-1);
  const preState = makeKickoffRawCarState(spawn.x, spawn.y);
  simTarget.setCarState(carIndex, preState);
  simTarget.setControls(carIndex, {
    throttle: 0,
    steer: 0,
    pitch: 0,
    yaw: 0,
    roll: 0,
    jump: false,
    boost: false,
    handbrake: false,
  });

  if (settleTicks > 0) {
    simTarget.stepSilent(settleTicks);
    const settled = new Float32Array(simTarget.getCarState(carIndex));
    settled[0] = preState[0];
    settled[1] = preState[1];
    for (let k = 3; k <= 11; k++) settled[k] = preState[k];
    for (let k = 12; k <= 17; k++) settled[k] = 0.0;
    simTarget.setCarState(carIndex, settled);
    simTarget.clearEvents();
  }
}

export function multiDiscreteToControls(act: ArrayLike<number>): KickoffCarControls {
  const thrVal = (act[0] | 0) - 1;
  const strVal = (act[1] | 0) - 1;
  const rolVal = (act[2] | 0) - 1;
  return {
    throttle: thrVal,
    pitch: -thrVal,
    steer: strVal,
    yaw: strVal,
    roll: rolVal,
    jump: act[3] === 1,
    boost: act[4] === 1,
    handbrake: act[5] === 1,
  };
}

export function controlsToMultiDiscrete(
  controls: Partial<KickoffCarControls> | null | undefined
): [number, number, number, number, number, number] {
  const thr = Number(controls?.throttle || 0);
  const ptc = Number(controls?.pitch || 0);
  let ch0 = 1;
  if (thr > 0.3 || ptc < -0.3) ch0 = 2;
  else if (thr < -0.3 || ptc > 0.3) ch0 = 0;

  const st = Number(controls?.steer || 0);
  const yw = Number(controls?.yaw || 0);
  let ch1 = 1;
  if (st > 0.3 || yw > 0.3) ch1 = 2;
  else if (st < -0.3 || yw < -0.3) ch1 = 0;

  const rl = Number(controls?.roll || 0);
  let ch2 = 1;
  if (rl > 0.3) ch2 = 2;
  else if (rl < -0.3) ch2 = 0;

  return [
    ch0,
    ch1,
    ch2,
    controls?.jump ? 1 : 0,
    controls?.boost ? 1 : 0,
    controls?.handbrake ? 1 : 0,
  ];
}

export function multiDiscreteToOverlayKeys(act: ArrayLike<number>): KickoffOverlayKeys {
  return {
    Shift: act[5] === 1,
    Q: act[2] === 0,
    A: act[1] === 0,
    W: act[0] === 2,
    S: act[0] === 0,
    D: act[1] === 2,
    E: act[2] === 2,
    Boost: act[4] === 1,
    Jump: act[3] === 1,
  };
}

export function multiDiscreteToKeyString(act: ArrayLike<number>): string {
  const keys: string[] = [];
  if (act[5] === 1) keys.push('Shift');
  if (act[2] === 0) keys.push('Q');
  if (act[1] === 0) keys.push('A');
  if (act[0] === 2) keys.push('W');
  else if (act[0] === 0) keys.push('S');
  if (act[1] === 2) keys.push('D');
  if (act[2] === 2) keys.push('E');
  if (act[4] === 1) keys.push('Boost');
  if (act[3] === 1) keys.push('Jump');
  return keys.length > 0 ? keys.join(' + ') : 'None (Coast)';
}

export function areMultiDiscreteActionsEqual(
  a: ArrayLike<number> | null | undefined,
  b: ArrayLike<number> | null | undefined
): boolean {
  if (!a || !b || a.length !== 6 || b.length !== 6) return false;
  for (let i = 0; i < 6; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export interface KickoffTimelineNoteBar {
  key: string;
  startTick: number;
  endTick: number;
  startStep: number;
  endStep: number;
}

const KICKOFF_TIMELINE_LANE_KEYS = [
  'Shift',
  'Q',
  'A',
  'W',
  'S',
  'D',
  'E',
  'Boost',
  'Jump',
] as const;

export function buildKickoffTimelineNoteBars(
  steps: ReadonlyArray<{
    step: number;
    startTick: number;
    endTick: number;
    keys: Record<string, boolean>;
  }>
): KickoffTimelineNoteBar[] {
  const noteBars: KickoffTimelineNoteBar[] = [];
  for (const lane of KICKOFF_TIMELINE_LANE_KEYS) {
    let activeBar: KickoffTimelineNoteBar | null = null;
    for (const s of steps) {
      if (s.keys[lane]) {
        if (!activeBar) {
          activeBar = {
            key: lane,
            startTick: s.startTick,
            endTick: s.endTick,
            startStep: s.step,
            endStep: s.step + 1,
          };
        } else {
          activeBar.endTick = s.endTick;
          activeBar.endStep = s.step + 1;
        }
      } else if (activeBar) {
        noteBars.push(activeBar);
        activeBar = null;
      }
    }
    if (activeBar) {
      noteBars.push(activeBar);
    }
  }
  return noteBars;
}
