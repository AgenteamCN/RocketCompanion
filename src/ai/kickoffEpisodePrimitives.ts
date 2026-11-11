/**
 * kickoffEpisodePrimitives.ts
 * Spawn constants, MultiDiscrete action conversions, CarJumpAirTimeTracker,
 * and WASM-backed Kickoff V1 (`ko_v1`) & V2 (`ko_v2`) agents.
 */

import { KICKOFF_SPAWNS } from '../ui-core/config/trainingDefaults.ts';
import {
  DEFAULT_CAR_CONTROLS,
  type CarControls,
} from './experimental/experimentalMultiCarObsPipeline.ts';
import {
  ensureExperimentalEngine,
  syncBotWeightsToWasmModule,
} from './experimental/ExperimentalBotAgent.ts';
import type { ParsedSafeTensorsModel } from './experimental/botpackSharedBallPredPipeline.ts';
import type { RocketSimWasmModule } from '../physics/core.d.ts';

export const KICKOFF_SETTLE_TICKS = 30;
export const KICKOFF_V1_SETTLE_TICKS = 60;
export const TICKS_PER_DECISION = 4;
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

export interface KickoffAgentSimPort {
  module?: RocketSimWasmModule | null;
  getCarStateView?: (carIndex?: number) => any;
  getBallStateView?: () => any;
}

export interface KickoffSpawnResettableEngine extends KickoffAgentSimPort {
  numCars?: number;
  addCar?: (team: number, hitboxType?: string) => number;
  resetKickoffAtSpawn?: (cppSpawnIndex: number, settleTicks: number) => boolean | void;
  resetKickoff: (seed?: number) => void;
  getCarState: (carIndex: number) => ArrayLike<number>;
  setCarState: (carIndex: number, state: Float32Array) => boolean | void;
  setControls: (carIndex: number, controls: KickoffCarControls) => void;
  stepSilent: (ticks: number) => void;
  clearEvents: () => void;
}

export interface KickoffTimelineNoteBar {
  key: string;
  startTick: number;
  endTick: number;
  startStep: number;
  endStep: number;
}

export interface KickoffTimelineStep {
  step: number;
  startTick: number;
  endTick: number;
  action: number[];
  controls: CarControls;
  keys: Record<string, boolean>;
  keyStr: string;
}

export interface KickoffPrecomputedTimeline {
  spawnIndex: number;
  steps: KickoffTimelineStep[];
  noteBars: KickoffTimelineNoteBar[];
  touchTick: number;
  touchStep: number;
}

export const preloadKickoffPPOWeights = (): Promise<ParsedSafeTensorsModel | null> =>
  ensureExperimentalEngine('ko_v1');
export const preloadKickoffV1BestWeights = (): Promise<ParsedSafeTensorsModel | null> =>
  ensureExperimentalEngine('ko_v2');

export function getSameSidePartnerSpawnIndex(spawnIndex: number): number | null {
  const idx = Math.max(0, Math.min(4, spawnIndex | 0));
  return idx === 2 ? null : 4 - idx;
}

const JUMP_MIN_TIME = 0.025;
const JUMP_RESET_TIME_PAD = 1.0 / 40.0;
const JUMP_MAX_TIME = 0.2;
const TICK_TIME = 1.0 / 120.0;

export class CarJumpAirTimeTracker {
  public isJumping = false;
  public hasJumped = false;
  public jumpTime = 0.0;
  public airTime = 0.0;
  public lastJumpControl = false;

  public reset(): void {
    this.isJumping = false;
    this.hasJumped = false;
    this.jumpTime = 0.0;
    this.airTime = 0.0;
    this.lastJumpControl = false;
  }

  public stepTick(jumpControlBool: boolean, isOnGroundPostTick: boolean): void {
    const jumpPressed = Boolean(jumpControlBool) && !this.lastJumpControl;
    const isOnGround = Boolean(isOnGroundPostTick);
    if (
      isOnGround &&
      !this.isJumping &&
      !(this.hasJumped && this.jumpTime < JUMP_MIN_TIME + JUMP_RESET_TIME_PAD)
    ) {
      this.hasJumped = false;
      this.jumpTime = 0.0;
    }
    if (this.isJumping) {
      this.isJumping =
        this.jumpTime < JUMP_MIN_TIME ||
        (Boolean(jumpControlBool) && this.jumpTime < JUMP_MAX_TIME);
    } else if (isOnGround && jumpPressed) {
      this.isJumping = true;
      this.jumpTime = 0.0;
    }
    if (this.isJumping) this.hasJumped = true;
    if (this.isJumping || this.hasJumped) this.jumpTime = Math.fround(this.jumpTime + TICK_TIME);
    this.airTime = isOnGround ? 0.0 : Math.fround(this.airTime + TICK_TIME);
    this.lastJumpControl = Boolean(jumpControlBool);
  }
}

export function makeKickoffRawCarState(
  sx: number,
  sy: number,
  out = new Float32Array(40)
): Float32Array {
  out.fill(0);
  out[0] = sx;
  out[1] = sy;
  out[2] = 17.0;
  if (Math.abs(sx) < 500.0) {
    out[4] = 1.0;
    out[6] = -1.0;
  } else {
    const s2 = Math.fround(Math.SQRT1_2);
    const sgn = sx > 0 ? -1.0 : 1.0;
    out[3] = sgn * s2;
    out[4] = s2;
    out[6] = -s2;
    out[7] = sgn * s2;
  }
  out[11] = 1.0;
  out[18] = Math.fround(100.0 / 3.0);
  out[19] = 1.0;
  out[22] = 1.0;
  return out;
}

export function resetEngineToKickoffSpawn(
  simTarget: KickoffSpawnResettableEngine,
  spawnIndex = 0,
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
    if ((simTarget.numCars ?? 0) === 0 && typeof simTarget.addCar === 'function')
      simTarget.addCar(0, hitboxType);
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

  simTarget.resetKickoff(-1);
  const preState = makeKickoffRawCarState(spawn.x, spawn.y);
  simTarget.setCarState(carIndex, preState);
  simTarget.setControls(carIndex, { ...DEFAULT_CAR_CONTROLS });
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
  const thr = (act[0] | 0) - 1;
  const str = (act[1] | 0) - 1;
  const rol = (act[2] | 0) - 1;
  return {
    throttle: thr,
    pitch: -thr,
    steer: str,
    yaw: str,
    roll: rol,
    jump: act[3] === 1,
    boost: act[4] === 1,
    handbrake: act[5] === 1,
  };
}

export function controlsToMultiDiscrete(
  c: Partial<KickoffCarControls> | null | undefined
): [number, number, number, number, number, number] {
  const thr = Number(c?.throttle || 0),
    ptc = Number(c?.pitch || 0);
  const st = Number(c?.steer || 0),
    yw = Number(c?.yaw || 0),
    rl = Number(c?.roll || 0);
  return [
    thr > 0.3 || ptc < -0.3 ? 2 : thr < -0.3 || ptc > 0.3 ? 0 : 1,
    st > 0.3 || yw > 0.3 ? 2 : st < -0.3 || yw < -0.3 ? 0 : 1,
    rl > 0.3 ? 2 : rl < -0.3 ? 0 : 1,
    c?.jump ? 1 : 0,
    c?.boost ? 1 : 0,
    c?.handbrake ? 1 : 0,
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

export function formatDiscreteActionKeys(
  act?: ArrayLike<number> | null,
  ctrl?: Partial<CarControls> | null
): string {
  const r = act && act.length >= 5 ? act : ctrl ? controlsToMultiDiscrete(ctrl) : null;
  if (!r) return 'Coast';
  const keys: string[] = [];
  if (r[0] === 2) keys.push('W');
  else if (r[0] === 0) keys.push('S');
  if (r[1] === 0) keys.push('A');
  else if (r[1] === 2) keys.push('D');
  if (r[2] === 0) keys.push('Q');
  else if (r[2] === 2) keys.push('E');
  if (r[3] === 1) keys.push('Jump');
  if (r[4] === 1) keys.push('Boost');
  if (r[5] === 1) keys.push('Drift');
  return keys.length > 0 ? keys.join('+') : 'Coast';
}

export function areMultiDiscreteActionsEqual(
  a?: ArrayLike<number> | null,
  b?: ArrayLike<number> | null
): boolean {
  if (!a || !b || a.length !== 6 || b.length !== 6) return false;
  for (let i = 0; i < 6; i++) if (a[i] !== b[i]) return false;
  return true;
}

const LANE_KEYS = ['Shift', 'Q', 'A', 'W', 'S', 'D', 'E', 'Boost', 'Jump'] as const;

export function buildKickoffTimelineNoteBars(
  steps: ReadonlyArray<{
    step: number;
    startTick: number;
    endTick: number;
    keys: Record<string, boolean>;
  }>
): KickoffTimelineNoteBar[] {
  const noteBars: KickoffTimelineNoteBar[] = [];
  for (const lane of LANE_KEYS) {
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
    if (activeBar) noteBars.push(activeBar);
  }
  return noteBars;
}

function stepWasmKickoffSlot(
  sim: KickoffAgentSimPort,
  policyId: 3 | 4,
  carIndex: number,
  isOrange: boolean,
  outAct: number[]
): KickoffCarControls {
  const mod = sim.module;
  const modelKey = policyId === 3 ? 'ko_v1' : 'ko_v2';
  if (mod && syncBotWeightsToWasmModule(mod, modelKey)) {
    mod._physics_configureBotSlot(carIndex, policyId, isOrange ? 1 : 0, 1);
    mod._physics_stepBotInferenceMask(1 << carIndex, 0);
    const outPtr = mod._physics_getBotBatchOutputPtr();
    if (outPtr) {
      const packed = mod.HEAP32[(outPtr >> 2) + 68 + carIndex * 8 + 5];
      if (packed >= 0) {
        outAct[0] = packed & 3;
        outAct[1] = (packed >> 2) & 3;
        outAct[2] = (packed >> 4) & 3;
        outAct[3] = (packed >> 6) & 1;
        outAct[4] = (packed >> 7) & 1;
        outAct[5] = (packed >> 8) & 1;
        return multiDiscreteToControls(outAct);
      }
    }
  }
  return { ...DEFAULT_CAR_CONTROLS };
}

function readWasmPrecomputedTimeline(
  sim: KickoffAgentSimPort,
  policyId: 3 | 4,
  spawnIndex: number,
  maxSteps: number
): KickoffPrecomputedTimeline | null {
  const mod = sim.module;
  const modelKey = policyId === 3 ? 'ko_v1' : 'ko_v2';
  if (!mod?._physics_precomputeBotKickoffTimeline || !syncBotWeightsToWasmModule(mod, modelKey))
    return null;
  const stepCount = mod._physics_precomputeBotKickoffTimeline(policyId, spawnIndex, maxSteps);
  const tlPtr = mod._physics_getBotKickoffTimelinePtr?.() ?? 0;
  if (stepCount <= 0 || !tlPtr) return null;
  const u32 = mod.HEAPU32,
    u8 = mod.HEAPU8;
  const hdrWord = tlPtr >> 2;
  const steps: KickoffTimelineStep[] = [];
  for (let i = 0; i < stepCount; i++) {
    const byteOff = tlPtr + 16 + i * 52,
      wOff = byteOff >> 2;
    const action = [
      u8[byteOff + 12],
      u8[byteOff + 13],
      u8[byteOff + 14],
      u8[byteOff + 15],
      u8[byteOff + 16],
      u8[byteOff + 17],
    ];
    steps.push({
      step: u32[wOff],
      startTick: u32[wOff + 1],
      endTick: u32[wOff + 2],
      action,
      controls: multiDiscreteToControls(action),
      keys: multiDiscreteToOverlayKeys(action),
      keyStr: multiDiscreteToKeyString(action),
    });
  }
  return {
    spawnIndex,
    steps,
    noteBars: buildKickoffTimelineNoteBars(steps),
    touchTick: u32[hdrWord + 2],
    touchStep: u32[hdrWord + 3],
  };
}

export class KickoffV2SafeTensorsAgent {
  public prevActionVec = new Float32Array(6);
  public act: number[] = [1, 1, 1, 0, 0, 0];
  public channelMode: string;

  constructor(options: { channelMode?: string } = {}) {
    this.channelMode = options.channelMode || 'keyboard_coupled';
  }

  public reset(): void {
    this.prevActionVec.fill(0);
    this.act = [1, 1, 1, 0, 0, 0];
  }

  public resetTracker(): void {
    this.reset();
  }

  public actDeterministic(
    sim: KickoffAgentSimPort,
    carIndex = 0,
    isOrange = false
  ): KickoffCarControls {
    return stepWasmKickoffSlot(sim, 4, carIndex, isOrange, this.act);
  }

  public sanitizeAndRecordTickControls(
    sim: KickoffAgentSimPort,
    carIndex: number,
    rawCtrl: KickoffCarControls
  ): KickoffCarControls {
    const cs = sim.getCarStateView?.(carIndex),
      bs = sim.getBallStateView?.();
    const ctrl = { ...rawCtrl };
    if (cs && !cs.isOnGround) {
      ctrl.handbrake = false;
      if (this.channelMode === 'ground_air_separated') ctrl.throttle = 0;
    }
    if (cs?.isFlipping && ctrl.boost && bs) {
      const dx = bs.posX - cs.posX,
        dy = bs.posY - cs.posY,
        dz = bs.posZ - cs.posZ;
      if ((dx * cs.fwdX + dy * cs.fwdY + dz * cs.fwdZ) / (Math.hypot(dx, dy, dz) + 1e-6) < 0.25)
        ctrl.boost = false;
    }
    const g = Boolean(cs?.isOnGround);
    this.prevActionVec[0] = g ? rawCtrl.throttle : -rawCtrl.pitch;
    this.prevActionVec[1] = g ? rawCtrl.steer : rawCtrl.yaw;
    this.prevActionVec[2] = g ? 0.0 : ctrl.roll;
    this.prevActionVec[3] = ctrl.jump ? 1.0 : 0.0;
    this.prevActionVec[4] = ctrl.boost ? 1.0 : 0.0;
    this.prevActionVec[5] = g && ctrl.handbrake ? 1.0 : 0.0;
    return ctrl;
  }

  public precomputeTimeline(
    ghostEngine: KickoffSpawnResettableEngine,
    spawnIndex = 0,
    maxSteps = 95
  ): KickoffPrecomputedTimeline {
    const wasmTl = readWasmPrecomputedTimeline(ghostEngine, 4, spawnIndex, maxSteps);
    if (wasmTl) return wasmTl;
    resetEngineToKickoffSpawn(ghostEngine, spawnIndex, {
      settleTicks: KICKOFF_V1_SETTLE_TICKS,
      recreateArena: false,
    });
    return {
      spawnIndex,
      steps: [],
      noteBars: [],
      touchTick: maxSteps * TICKS_PER_DECISION,
      touchStep: maxSteps,
    };
  }
}

export class KickoffPPOAgent {
  public obsBuffer = new Float32Array(OBS_V3_DIM);
  public tracker = new CarJumpAirTimeTracker();
  private _lastAct: number[] = [1, 1, 1, 0, 0, 0];

  public resetTracker(): void {
    this.tracker.reset();
    this._lastAct = [1, 1, 1, 0, 0, 0];
  }

  public buildObsV3(
    engine: KickoffAgentSimPort,
    carIndex = 0,
    outObs = this.obsBuffer,
    teamSign = 1
  ): Float32Array {
    stepWasmKickoffSlot(engine, 3, carIndex, teamSign < 0, this._lastAct);
    return outObs;
  }

  public actDeterministic(_obs?: Float32Array): number[] {
    return [...this._lastAct];
  }

  public precomputeTimeline(
    ghostEngine: KickoffSpawnResettableEngine,
    spawnIndex = 0,
    maxSteps = 95
  ): KickoffPrecomputedTimeline {
    const wasmTl = readWasmPrecomputedTimeline(ghostEngine, 3, spawnIndex, maxSteps);
    if (wasmTl) return wasmTl;
    resetEngineToKickoffSpawn(ghostEngine, spawnIndex, {
      settleTicks: KICKOFF_SETTLE_TICKS,
      recreateArena: false,
    });
    return {
      spawnIndex,
      steps: [],
      noteBars: [],
      touchTick: maxSteps * TICKS_PER_DECISION,
      touchStep: maxSteps,
    };
  }
}

export function classifyBallOutcome(
  ballX: number,
  ballY: number,
  ballVx: number,
  ballVy: number
): string {
  if (ballY >= 5100) return 'ORANGE GOAL (+Y)';
  if (ballY <= -5100) return 'BLUE GOAL (-Y)';
  if (Math.hypot(ballVx, ballVy) < 40 && Math.abs(ballY) < 80) {
    return Math.abs(ballX) > 150
      ? ballX > 0
        ? 'Side Pinch (+X)'
        : 'Side Pinch (-X)'
      : 'Dead-Ball Neutral (0,0)';
  }
  if (ballVy > 180 || ballY > 120) return 'Toward Orange (+Y)';
  if (ballVy < -180 || ballY < -120) return 'Toward Blue (-Y)';
  if (Math.abs(ballVx) > 200) return ballVx > 0 ? 'Lateral Right (+X)' : 'Lateral Left (-X)';
  return 'Midfield Neutral';
}
