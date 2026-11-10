/**
 * kickoffGhostPrecomputePipeline.ts
 * Pure pipeline for KickoffTrainingMode:
 * - Isolated WASM ghost physics engine initialization and PPO timeline precomputation
 * - Kickoff spawn coordinate mirroring and suspension settling clamping
 * - Dual-car (same-side partner / opposite opponent) and single-car kickoff spawn reset
 */

import { MATCH_SIGNALS } from '../../physics/RocketSimConstants.ts';
import { RocketSimPhysicsEngine } from '../../physics/RocketSimPhysicsEngine.ts';
import { KICKOFF_SPAWNS } from '../../ui-core/config/trainingDefaults.ts';
import {
  CPP_SPAWN_INDEX_MAP,
  getSameSidePartnerSpawnIndex,
  makeKickoffRawCarState,
  controlsToMultiDiscrete,
  multiDiscreteToOverlayKeys,
  multiDiscreteToKeyString,
  areMultiDiscreteActionsEqual,
} from '../../ai/kickoffEpisodePrimitives.ts';
import {
  KickoffV2SafeTensorsAgent,
  KICKOFF_V1_SETTLE_TICKS,
} from '../../ai/KickoffV2SafeTensorsAgent.ts';

export type KickoffGhostPlacement = 'same' | 'opposite';

export interface KickoffSpawnPoint {
  name?: string;
  x: number;
  y: number;
  yaw?: number;
}

export interface KickoffCarControls {
  throttle: number;
  steer: number;
  pitch: number;
  yaw: number;
  roll: number;
  jump: boolean;
  boost: boolean;
  handbrake: boolean;
}

export interface KickoffPhysicsPort {
  readonly numCars: number;
  setUnlimitedBoost(enabled: boolean): void;
  removeCar?(carIndex: number): void;
  addCar(teamIndex: number, hitboxType: string): void;
  getCarState(carIndex: number): Float32Array;
  setCarState(carIndex: number, state: Float32Array): void;
  setControls(carIndex: number, controls: KickoffCarControls): void;
  resetKickoffAtSpawn?(cppSpawnIdx: number, settleTicks: number): void;
  resetKickoff(spawnIndex: number): void;
  stepSilent(ticks: number): void;
  clearEvents(): void;
}

export interface KickoffArenaSpawnPort {
  cars?: Array<{ visible: boolean } | null>;
  ensureOpponent?(): void;
  setCarColor?(carIndex: number, colorHex: number): void;
  resetBallTrail?(): void;
}

export interface KickoffSpawnResetInput {
  physics: KickoffPhysicsPort;
  arena?: KickoffArenaSpawnPort | null;
  spawnIndex: number;
  playerCarIndex: number;
  selectedHitbox: string;
  neutralControls: KickoffCarControls;
  ghostModeEnabled: boolean;
  ghostPlacement: KickoffGhostPlacement;
  settleImmediate: boolean;
}

export interface KickoffSpawnResetResult {
  aiTeamSign: 1 | -1;
  preSettleCar0State: Float32Array | null;
  preSettleCar1State: Float32Array | null;
}

export interface KickoffGhostPrecomputeResult {
  timeline: ReturnType<KickoffV2SafeTensorsAgent['precomputeTimeline']>;
  aiTouchTick: number | null;
}

export async function createIsolatedKickoffGhostSim(): Promise<RocketSimPhysicsEngine> {
  const sim = new RocketSimPhysicsEngine();
  await sim.init({
    collisionData: RocketSimPhysicsEngine.cachedCollisionData,
    freshInstance: true,
    isolated: true,
  });
  sim.configureCars('octane', false, 0);
  sim.setUnlimitedBoost(false);
  return sim;
}

export function precomputeKickoffGhostTimeline(
  ghostSim: RocketSimPhysicsEngine,
  ghostAgent: KickoffV2SafeTensorsAgent,
  spawnIndex: number,
  ghostPrevState: Float32Array,
  ghostCurrState: Float32Array,
  maxSteps: number = 95
): KickoffGhostPrecomputeResult {
  const timeline = ghostAgent.precomputeTimeline(ghostSim, spawnIndex, maxSteps);
  ghostPrevState.set(ghostSim.state);
  ghostCurrState.set(ghostSim.state);
  return {
    timeline,
    aiTouchTick: timeline.touchTick ?? null,
  };
}

export function clampKickoffSettledCarInPhysics(
  physics: KickoffPhysicsPort,
  carIdx: number,
  spawn: KickoffSpawnPoint,
  teamSign: number = 1,
  preSettleState: Float32Array | null = null
): void {
  if (carIdx >= physics.numCars) return;
  const settled = new Float32Array(physics.getCarState(carIdx));
  if (preSettleState && preSettleState.length >= 12) {
    settled[0] = preSettleState[0];
    settled[1] = preSettleState[1];
    for (let k = 3; k <= 11; k++) settled[k] = preSettleState[k];
  } else if (Math.abs(spawn.x) < 500.0) {
    settled[0] = spawn.x * teamSign;
    settled[3] = 0.0;
    settled[4] = 1.0 * teamSign;
    settled[6] = -1.0 * teamSign;
    settled[7] = 0.0;
    settled[8] = 0.0;
    settled[9] = 0.0;
  }
  for (let k = 12; k <= 17; k++) settled[k] = 0.0;
  physics.setCarState(carIdx, settled);
}

export function clampKickoffSettledPlayerAndPartnerCars(
  physics: KickoffPhysicsPort,
  playerCarIdx: number,
  spawnIndex: number,
  spawn: KickoffSpawnPoint,
  ghostModeEnabled: boolean,
  ghostPlacement: KickoffGhostPlacement,
  preSettleCar0State: Float32Array | null,
  preSettleCar1State: Float32Array | null
): void {
  clampKickoffSettledCarInPhysics(physics, playerCarIdx, spawn, 1, preSettleCar0State);
  if (!ghostModeEnabled && physics.numCars >= 2) {
    if (ghostPlacement === 'opposite') {
      const s0 = new Float32Array(physics.getCarState(playerCarIdx));
      const s1 = new Float32Array(physics.getCarState(1));
      s1[0] = -s0[0];
      s1[1] = -s0[1];
      s1[2] = s0[2];
      s1[3] = -s0[3];
      s1[4] = -s0[4];
      s1[5] = s0[5];
      s1[6] = -s0[6];
      s1[7] = -s0[7];
      s1[8] = s0[8];
      s1[9] = -s0[9];
      s1[10] = -s0[10];
      s1[11] = s0[11];
      for (let k = 12; k <= 17; k++) s1[k] = 0.0;
      physics.setCarState(1, s1);
    } else {
      const partnerIdx = getSameSidePartnerSpawnIndex(spawnIndex) ?? 4;
      const partnerSpawn = KICKOFF_SPAWNS[partnerIdx] || KICKOFF_SPAWNS[4];
      clampKickoffSettledCarInPhysics(physics, 1, partnerSpawn, 1, preSettleCar1State);
    }
  }
}

export function resetKickoffSpawnInPhysics(input: KickoffSpawnResetInput): KickoffSpawnResetResult {
  const {
    physics,
    arena,
    spawnIndex,
    playerCarIndex,
    selectedHitbox,
    neutralControls,
    ghostModeEnabled,
    ghostPlacement,
    settleImmediate,
  } = input;

  const spawn = KICKOFF_SPAWNS[spawnIndex] || KICKOFF_SPAWNS[0];
  const cppSpawnIdx = CPP_SPAWN_INDEX_MAP[spawnIndex] ?? 0;
  let aiTeamSign: 1 | -1 = 1;
  let preSettleCar0State: Float32Array | null = null;
  let preSettleCar1State: Float32Array | null = null;

  physics.setUnlimitedBoost(false);

  while (physics.numCars > 0 && typeof physics.removeCar === 'function') {
    physics.removeCar(physics.numCars - 1);
  }
  physics.addCar(0, selectedHitbox);

  if (!ghostModeEnabled) {
    arena?.ensureOpponent?.();

    if (ghostPlacement === 'opposite') {
      physics.addCar(1, 'default');
      aiTeamSign = -1;
      arena?.setCarColor?.(1, 0xf97316);

      if (typeof physics.resetKickoffAtSpawn === 'function') {
        physics.resetKickoffAtSpawn(cppSpawnIdx, 0);
        preSettleCar0State = new Float32Array(physics.getCarState(0));
        if (settleImmediate) {
          physics.resetKickoffAtSpawn(cppSpawnIdx, KICKOFF_V1_SETTLE_TICKS);
          clampKickoffSettledPlayerAndPartnerCars(
            physics,
            playerCarIndex,
            spawnIndex,
            spawn,
            ghostModeEnabled,
            ghostPlacement,
            preSettleCar0State,
            preSettleCar1State
          );
        }
      } else {
        physics.resetKickoff(-1);
        const raw0 = makeKickoffRawCarState(spawn.x, spawn.y);
        physics.setCarState(0, raw0);
        preSettleCar0State = new Float32Array(raw0);
        if (settleImmediate) {
          physics.stepSilent(KICKOFF_V1_SETTLE_TICKS);
          clampKickoffSettledPlayerAndPartnerCars(
            physics,
            playerCarIndex,
            spawnIndex,
            spawn,
            ghostModeEnabled,
            ghostPlacement,
            preSettleCar0State,
            preSettleCar1State
          );
        }
      }
      physics.setControls(0, neutralControls);
      physics.setControls(1, neutralControls);
    } else {
      const partnerIdx = getSameSidePartnerSpawnIndex(spawnIndex) ?? 4;
      const partnerSpawn = KICKOFF_SPAWNS[partnerIdx] || KICKOFF_SPAWNS[4];
      physics.addCar(0, 'default');
      aiTeamSign = 1;
      arena?.setCarColor?.(1, 0x38bdf8);

      if (typeof physics.resetKickoffAtSpawn === 'function') {
        physics.resetKickoffAtSpawn(cppSpawnIdx, 0);
      } else {
        physics.resetKickoff(-1);
        physics.setCarState(0, makeKickoffRawCarState(spawn.x, spawn.y));
      }
      physics.setCarState(1, makeKickoffRawCarState(partnerSpawn.x, partnerSpawn.y));
      preSettleCar0State = new Float32Array(physics.getCarState(0));
      preSettleCar1State = new Float32Array(physics.getCarState(1));
      physics.setControls(0, neutralControls);
      physics.setControls(1, neutralControls);

      if (settleImmediate) {
        physics.stepSilent(KICKOFF_V1_SETTLE_TICKS);
        clampKickoffSettledCarInPhysics(physics, 0, spawn, 1, preSettleCar0State);
        clampKickoffSettledCarInPhysics(physics, 1, partnerSpawn, 1, preSettleCar1State);
      }
    }
  } else {
    if (arena?.cars?.[1]) arena.cars[1].visible = false;
    if (typeof physics.resetKickoffAtSpawn === 'function') {
      physics.resetKickoffAtSpawn(cppSpawnIdx, 0);
      preSettleCar0State = new Float32Array(physics.getCarState(playerCarIndex));
      if (settleImmediate) {
        physics.resetKickoffAtSpawn(cppSpawnIdx, KICKOFF_V1_SETTLE_TICKS);
        clampKickoffSettledCarInPhysics(physics, playerCarIndex, spawn, 1, preSettleCar0State);
      }
      physics.setControls(playerCarIndex, neutralControls);
    } else {
      physics.resetKickoff(-1);
      const rawState = makeKickoffRawCarState(spawn.x, spawn.y);
      physics.setCarState(playerCarIndex, rawState);
      preSettleCar0State = new Float32Array(rawState);
      physics.setControls(playerCarIndex, neutralControls);

      if (settleImmediate) {
        physics.stepSilent(KICKOFF_V1_SETTLE_TICKS);
        clampKickoffSettledCarInPhysics(physics, playerCarIndex, spawn, 1, preSettleCar0State);
      }
    }
  }

  physics.clearEvents();
  return {
    aiTeamSign,
    preSettleCar0State,
    preSettleCar1State,
  };
}

export interface KickoffDecisionRequirement {
  stepIdx: number;
  requiredAction: number[];
  requiredKeys: ReturnType<typeof multiDiscreteToOverlayKeys>;
  requiredKeyStr: string;
}

export function evaluateKickoffDecisionRequirement(
  episodeTick: number,
  ticksPerDecision: number,
  timeline: KickoffGhostPrecomputeResult['timeline'] | null
): KickoffDecisionRequirement {
  const stepIdx = Math.floor(episodeTick / ticksPerDecision);
  const steps = timeline?.steps;
  const stepData =
    steps?.[stepIdx] || (steps && steps.length > 0 ? steps[steps.length - 1] : undefined);
  const requiredAction = stepData ? stepData.action : [1, 1, 1, 0, 0, 0];
  const requiredKeys = (
    stepData ? stepData.keys : multiDiscreteToOverlayKeys(requiredAction)
  ) as ReturnType<typeof multiDiscreteToOverlayKeys>;
  const requiredKeyStr = stepData ? stepData.keyStr : multiDiscreteToKeyString(requiredAction);
  return { stepIdx, requiredAction, requiredKeys, requiredKeyStr };
}

export function stepKickoffAgentControls(
  agent: KickoffV2SafeTensorsAgent,
  sim: RocketSimPhysicsEngine,
  carIndex: number,
  invertTeam: boolean,
  episodeTick: number,
  ticksPerDecision: number,
  prevRawControls: KickoffCarControls
): { rawControls: KickoffCarControls; sanitizedControls: KickoffCarControls } {
  const rawControls =
    episodeTick % ticksPerDecision === 0
      ? (agent.actDeterministic(sim, carIndex, invertTeam) as KickoffCarControls)
      : prevRawControls;
  const sanitizedControls = agent.sanitizeAndRecordTickControls(
    sim,
    carIndex,
    rawControls
  ) as KickoffCarControls;
  sim.setControls(carIndex, sanitizedControls);
  return { rawControls, sanitizedControls };
}

export function detectKickoffPlayerFirstTouch(
  physics: {
    readonly numCars: number;
    getBallStateView(): {
      posX: number;
      posY: number;
      posZ: number;
      velX: number;
      velY: number;
      velZ: number;
    };
    getCarStateView(carIndex: number): { posX: number; posY: number; posZ: number };
  },
  ghostModeEnabled: boolean
): boolean {
  const pBall = physics.getBallStateView();
  if (Math.hypot(pBall.velX, pBall.velY, pBall.velZ) <= 1.0) return false;
  if (!ghostModeEnabled && physics.numCars >= 2) {
    const pCar = physics.getCarStateView(0);
    return (
      Math.hypot(pCar.posX - pBall.posX, pCar.posY - pBall.posY, pCar.posZ - pBall.posZ) <= 235.0
    );
  }
  return true;
}

export function scheduleKickoffCountdownSignal(
  physics:
    | {
        getHeaderView?(): { tickCount?: number } | null;
        pushSignalEvent?(signal: number, ...args: number[]): void;
        setSimulationFrozen?(frozen: boolean, carIdx?: number, freezeBall?: boolean): void;
      }
    | null
    | undefined,
  waitTicks: number
): number {
  physics?.setSimulationFrozen?.(false, 0, true);
  const curTick = Math.floor(physics?.getHeaderView?.()?.tickCount ?? 0);
  physics?.pushSignalEvent?.(
    MATCH_SIGNALS.KICKOFF_WILL_START,
    curTick,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    curTick + waitTicks
  );
  return Math.min(4, Math.ceil(waitTicks / 120));
}

export function stepKickoffGhostSimTick(
  ghostSim: RocketSimPhysicsEngine,
  ghostAgent: KickoffV2SafeTensorsAgent,
  episodeTick: number,
  ticksPerDecision: number,
  prevRawControls: KickoffCarControls,
  ghostPrevState: Float32Array,
  ghostCurrState: Float32Array
): { rawControls: KickoffCarControls; sanitizedControls: KickoffCarControls; ballView: unknown } {
  const step = stepKickoffAgentControls(
    ghostAgent,
    ghostSim,
    0,
    false,
    episodeTick,
    ticksPerDecision,
    prevRawControls
  );
  ghostPrevState.set(ghostCurrState);
  ghostSim.stepSilent(1);
  ghostCurrState.set(ghostSim.state);
  return { ...step, ballView: ghostSim.getBallStateView() };
}

export interface KickoffPreTickEvaluation extends KickoffDecisionRequirement {
  playerAction: number[];
  playerKeys: ReturnType<typeof multiDiscreteToOverlayKeys>;
  isMatching: boolean;
  isAnyKeyPressed: boolean;
}

export function evaluateKickoffPreTickInput(
  playerControls: unknown,
  episodeTick: number,
  ticksPerDecision: number,
  timeline: KickoffGhostPrecomputeResult['timeline'] | null
): KickoffPreTickEvaluation {
  const playerAction = controlsToMultiDiscrete(playerControls as never);
  const playerKeys = multiDiscreteToOverlayKeys(playerAction);
  const req = evaluateKickoffDecisionRequirement(episodeTick, ticksPerDecision, timeline);
  return {
    ...req,
    playerAction,
    playerKeys,
    isMatching: areMultiDiscreteActionsEqual(playerAction, req.requiredAction),
    isAnyKeyPressed: !areMultiDiscreteActionsEqual(playerAction, [1, 1, 1, 0, 0, 0]),
  };
}
