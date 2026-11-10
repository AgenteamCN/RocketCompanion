import {
  ExperimentalBotAgent,
  ensureExperimentalEngine,
} from '../../../ai/experimental/ExperimentalBotAgent.ts';
import {
  DEFAULT_CAR_CONTROLS,
  type CarControls,
} from '../../../ai/experimental/experimentalMultiCarObsPipeline.ts';
import { loadExperimentalPolicySafeTensors } from '../../../ai/experimental/SafeTensorsLoader.ts';
import { KickoffPPOAgent } from '../../../ai/KickoffPPOAgent.ts';
import { multiDiscreteToControls } from '../../../ai/kickoffEpisodePrimitives.ts';
import { preloadKickoffPPOWeights } from '../../../ai/kickoffPPOWeights.ts';
import {
  KickoffV2SafeTensorsAgent,
  formatDiscreteActionKeys,
} from '../../../ai/KickoffV2SafeTensorsAgent.ts';
import type {
  ArenaBoostPadDescriptor,
  CarControlsInput,
} from '../../../physics/RocketSimSnapshotSerializer.ts';
import type { BallStateView, CarStateView } from '../../../physics/RocketSimStateViews.ts';
import { KICKOFF_DUEL_SLOTS } from '../../../ui-core/config/kickoffDuelConfig.ts';

export const DUEL_ACTIVE_CARS: Array<{ carIndex: number; team: number }> = [
  { carIndex: 0, team: 0 },
  { carIndex: 1, team: 1 },
];

export interface KickoffSimulationEnginePort {
  numCars: number;
  state: Float32Array;
  addCar: (team: number, hitboxType?: string) => number;
  removeCar?: (carIndex: number) => boolean | void;
  setUnlimitedBoost: (enabled: boolean) => void;
  resetKickoffAtSpawn: (spawnIndex: number, settleTicks?: number) => void;
  getCarState: (carIndex: number) => Float32Array;
  setCarState: (carIndex: number, carState: Float32Array) => boolean | void;
  getCarStateView: (carIndex?: number) => CarStateView;
  getBallStateView: () => BallStateView;
  setControls: (carIndex: number, controls?: CarControlsInput | null) => void;
  getPads: () => ArenaBoostPadDescriptor[];
  step: (ticks?: number) => void;
}

export interface KickoffDuelAgentEnsemble {
  koV2Blue: KickoffV2SafeTensorsAgent;
  koV2Orange: KickoffV2SafeTensorsAgent;
  koV1Blue: KickoffPPOAgent;
  koV1Orange: KickoffPPOAgent;
  expBlue: ExperimentalBotAgent;
  expOrange: ExperimentalBotAgent;
  blueCtrl: CarControls;
  orangeCtrl: CarControls;
  blueAct: number[] | null;
  orangeAct: number[] | null;
}

export interface KickoffCarDecisionOutput {
  controls: CarControls;
  nextHelpers: KickoffDuelAgentEnsemble;
}

export interface KickoffStepTraceEntry {
  tick: number;
  timeSec: number;
  onGround: boolean;
  hasFlip: boolean;
  isFlipping: boolean;
  boostAmount: number;
  carPos: [number, number, number];
  carVel: [number, number, number];
  carSpeed: number;
  distToBall: number;
  discreteAct?: number[];
  keysLabel: string;
  controls: {
    throttle: number;
    steer: number;
    pitch: number;
    yaw: number;
    roll: number;
    jump: boolean;
    boost: boolean;
    handbrake: boolean;
  };
  prevAct0: number;
}

export async function ensureKickoffDuelModelsLoaded(
  modelIds: string[] = ['ko_v2', 'ko_v1', 'nexto', 'necto']
): Promise<void> {
  const uniqueIds = Array.from(new Set(modelIds));
  const tasks = uniqueIds.map((id) => {
    if (id === 'ko_v2') {
      return loadExperimentalPolicySafeTensors('ko_v2').catch((e) =>
        console.warn('[KickoffDuelLab] Failed to load ko_v2 SafeTensors:', e)
      );
    }
    if (id === 'ko_v1') {
      return preloadKickoffPPOWeights().catch((e) =>
        console.warn('[KickoffDuelLab] Failed to load ko_v1 SafeTensors:', e)
      );
    }
    if (id === 'nexto' || id === 'necto') {
      return ensureExperimentalEngine(id);
    }
    return Promise.resolve();
  });
  await Promise.all(tasks);
}

export function resetSimToKickoffSlotAndSettle(
  sim: KickoffSimulationEnginePort,
  slotIndex = 0
): void {
  const slot = KICKOFF_DUEL_SLOTS[slotIndex] || KICKOFF_DUEL_SLOTS[0];
  while (sim.numCars > 2 && typeof sim.removeCar === 'function') {
    sim.removeCar(sim.numCars - 1);
  }
  while (sim.numCars < 2) {
    sim.addCar(sim.numCars, 'octane');
  }
  sim.setUnlimitedBoost(false);

  sim.resetKickoffAtSpawn(slot.cppIdx, 0);
  const pre0 = new Float32Array(sim.getCarState(0));

  sim.resetKickoffAtSpawn(slot.cppIdx, 60);
  const s0 = new Float32Array(sim.getCarState(0));
  const s1 = new Float32Array(sim.getCarState(1));

  s0[0] = pre0[0];
  s0[1] = pre0[1];
  for (let k = 3; k <= 11; k++) s0[k] = pre0[k];
  for (let k = 12; k <= 17; k++) s0[k] = 0.0;
  sim.setCarState(0, s0);

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
  sim.setCarState(1, s1);

  sim.setControls(0, DEFAULT_CAR_CONTROLS);
  sim.setControls(1, DEFAULT_CAR_CONTROLS);
}

export function createKickoffDuelHelpers(
  channelMode = 'keyboard_coupled'
): KickoffDuelAgentEnsemble {
  return {
    koV2Blue: new KickoffV2SafeTensorsAgent({ channelMode }),
    koV2Orange: new KickoffV2SafeTensorsAgent({ channelMode }),
    koV1Blue: new KickoffPPOAgent(),
    koV1Orange: new KickoffPPOAgent(),
    expBlue: new ExperimentalBotAgent('nexto', 0, 0),
    expOrange: new ExperimentalBotAgent('nexto', 1, 1),
    blueCtrl: { ...DEFAULT_CAR_CONTROLS },
    orangeCtrl: { ...DEFAULT_CAR_CONTROLS },
    blueAct: [1, 1, 1, 0, 0, 0],
    orangeAct: [1, 1, 1, 0, 0, 0],
  };
}

export function resetKickoffDuelEnsemble(
  helpers: KickoffDuelAgentEnsemble
): KickoffDuelAgentEnsemble {
  helpers.koV2Blue.reset();
  helpers.koV2Orange.reset();
  helpers.koV1Blue.resetTracker();
  helpers.koV1Orange.resetTracker();
  helpers.expBlue.reset();
  helpers.expOrange.reset();
  return {
    ...helpers,
    blueCtrl: { ...DEFAULT_CAR_CONTROLS },
    orangeCtrl: { ...DEFAULT_CAR_CONTROLS },
    blueAct: [1, 1, 1, 0, 0, 0],
    orangeAct: [1, 1, 1, 0, 0, 0],
  };
}

export function decideCarControlsForModel(
  sim: KickoffSimulationEnginePort,
  modelId: string,
  carIndex: number,
  team: number,
  tick: number,
  helpers: KickoffDuelAgentEnsemble,
  options: { nextoScripted?: boolean; channelMode?: string } = {}
): KickoffCarDecisionOutput {
  const isOrange = team === 1;
  const teamSign = isOrange ? -1.0 : 1.0;
  const nextoScriptedKickoff = Boolean(options.nextoScripted);
  const channelMode = options.channelMode || 'keyboard_coupled';

  let blueCtrl = helpers.blueCtrl;
  let orangeCtrl = helpers.orangeCtrl;
  let blueAct = helpers.blueAct;
  let orangeAct = helpers.orangeAct;

  if (modelId === 'ko_v2') {
    const agent = carIndex === 0 ? helpers.koV2Blue : helpers.koV2Orange;
    agent.channelMode = channelMode;
    if (tick % 4 === 0) {
      const rawCtrl = agent.actDeterministic(sim, carIndex, isOrange);
      if (carIndex === 0) {
        blueCtrl = rawCtrl;
        blueAct = [...agent.act];
      } else {
        orangeCtrl = rawCtrl;
        orangeAct = [...agent.act];
      }
    }
    const raw = carIndex === 0 ? blueCtrl : orangeCtrl;
    const sanitized = agent.sanitizeAndRecordTickControls(sim, carIndex, raw);
    return {
      controls: sanitized,
      nextHelpers: {
        ...helpers,
        blueCtrl,
        orangeCtrl,
        blueAct,
        orangeAct,
      },
    };
  }

  if (modelId === 'ko_v1') {
    const agent = carIndex === 0 ? helpers.koV1Blue : helpers.koV1Orange;
    if (tick % 4 === 0) {
      const obs = agent.buildObsV3(sim, carIndex, agent.obsBuffer, teamSign);
      const act = agent.actDeterministic(obs);
      const ctrl = multiDiscreteToControls(act);
      if (carIndex === 0) {
        blueCtrl = ctrl;
        blueAct = [...act];
      } else {
        orangeCtrl = ctrl;
        orangeAct = [...act];
      }
    }
    const ctrl = carIndex === 0 ? blueCtrl : orangeCtrl;
    const cv = sim.getCarStateView(carIndex);
    agent.tracker.stepTick(Boolean(ctrl.jump), Boolean(cv.isOnGround));
    return {
      controls: ctrl,
      nextHelpers: {
        ...helpers,
        blueCtrl,
        orangeCtrl,
        blueAct,
        orangeAct,
      },
    };
  }

  if (modelId === 'nexto' || modelId === 'necto') {
    const bot = carIndex === 0 ? helpers.expBlue : helpers.expOrange;
    if (bot.botType !== modelId) {
      bot.setBotType(modelId);
    }
    const kickoffStepArg = modelId === 'nexto' && nextoScriptedKickoff ? tick : 999;
    if (tick % 8 === 0) {
      const ctrl = bot.decideSync(sim.state, sim.getPads(), DUEL_ACTIVE_CARS, kickoffStepArg);
      if (carIndex === 0) {
        blueCtrl = ctrl;
        blueAct = null;
      } else {
        orangeCtrl = ctrl;
        orangeAct = null;
      }
    }
    const ctrl = carIndex === 0 ? blueCtrl : orangeCtrl;
    return {
      controls: ctrl,
      nextHelpers: {
        ...helpers,
        blueCtrl,
        orangeCtrl,
        blueAct,
        orangeAct,
      },
    };
  }

  return {
    controls: { ...DEFAULT_CAR_CONTROLS },
    nextHelpers: helpers,
  };
}

export function buildCarStepTraceEntry(
  sim: KickoffSimulationEnginePort,
  modelId: string,
  carIndex: number,
  tick: number,
  helpers: KickoffDuelAgentEnsemble,
  ctrl: CarControls
): KickoffStepTraceEntry {
  const cs = sim.getCarStateView(carIndex);
  const bs = sim.getBallStateView();
  const speed = Math.hypot(cs.velX, cs.velY, cs.velZ);
  const distToBall = Math.hypot(cs.posX - bs.posX, cs.posY - bs.posY, cs.posZ - bs.posZ);
  const act = carIndex === 0 ? helpers.blueAct : helpers.orangeAct;
  const ko2Agent = carIndex === 0 ? helpers.koV2Blue : helpers.koV2Orange;
  const prevAct0 =
    modelId === 'ko_v2'
      ? Number((ko2Agent.prevActionVec[0] ?? 0).toFixed(3))
      : Number((cs.isOnGround ? ctrl.throttle : -ctrl.pitch).toFixed(3));

  return {
    tick,
    timeSec: Number((tick / 120).toFixed(3)),
    onGround: Boolean(cs.isOnGround),
    hasFlip: Boolean(cs.hasFlipOrJump),
    isFlipping: Boolean(cs.isFlipping),
    boostAmount: Math.round(Number(cs.boost ?? 0)),
    carPos: [
      Math.round(cs.posX * 10) / 10,
      Math.round(cs.posY * 10) / 10,
      Math.round(cs.posZ * 10) / 10,
    ],
    carVel: [Math.round(cs.velX), Math.round(cs.velY), Math.round(cs.velZ)],
    carSpeed: Math.round(speed),
    distToBall: Math.round(distToBall),
    discreteAct: act ? act.slice(0, 5) : undefined,
    keysLabel: formatDiscreteActionKeys(act, ctrl),
    controls: {
      throttle: Number((ctrl.throttle ?? 0).toFixed(3)),
      steer: Number((ctrl.steer ?? 0).toFixed(3)),
      pitch: Number((ctrl.pitch ?? 0).toFixed(3)),
      yaw: Number((ctrl.yaw ?? 0).toFixed(3)),
      roll: Number((ctrl.roll ?? 0).toFixed(3)),
      jump: Boolean(ctrl.jump),
      boost: Boolean(ctrl.boost),
      handbrake: Boolean(ctrl.handbrake),
    },
    prevAct0,
  };
}

export function triggerBrowserDownload(filename: string, content: string, mimeType: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function convertStepTracesToCsv(
  seriesList: Array<{
    modelId: string;
    role: string;
    slotCode: string;
    channelMode: string;
    steps: KickoffStepTraceEntry[];
  }>
): string {
  const header = [
    'model',
    'role',
    'slot',
    'channel_mode',
    'tick',
    'time_sec',
    'on_ground',
    'has_flip',
    'is_flipping',
    'boost_amt',
    'car_x',
    'car_y',
    'car_z',
    'car_speed',
    'dist_to_ball',
    'keys',
    'throttle',
    'steer',
    'pitch',
    'yaw',
    'roll',
    'jump',
    'boost',
    'handbrake',
    'prev_act_0',
  ].join(',');
  const rows = [header];
  for (const series of seriesList) {
    for (const s of series.steps || []) {
      rows.push(
        [
          series.modelId,
          series.role,
          series.slotCode,
          series.channelMode,
          s.tick,
          s.timeSec,
          s.onGround ? 1 : 0,
          s.hasFlip ? 1 : 0,
          s.isFlipping ? 1 : 0,
          s.boostAmount,
          s.carPos?.[0] ?? 0,
          s.carPos?.[1] ?? 0,
          s.carPos?.[2] ?? 0,
          s.carSpeed,
          s.distToBall,
          `"${s.keysLabel || ''}"`,
          s.controls?.throttle ?? 0,
          s.controls?.steer ?? 0,
          s.controls?.pitch ?? 0,
          s.controls?.yaw ?? 0,
          s.controls?.roll ?? 0,
          s.controls?.jump ? 1 : 0,
          s.controls?.boost ? 1 : 0,
          s.controls?.handbrake ? 1 : 0,
          s.prevAct0 ?? 0,
        ].join(',')
      );
    }
  }
  return rows.join('\n');
}
