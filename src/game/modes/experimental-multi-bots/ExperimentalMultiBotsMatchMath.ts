import type { ExperimentalBotAgent } from '../../../ai/BotWeightLoader.ts';
import { getExperimentalBotPolicyMeta } from '../../../ai/experimental/botpackSharedBallPredPipeline.ts';
import type { CarControls } from '../../../ai/experimental/experimentalMultiCarObsPipeline.ts';
import { KICKOFF_SPAWN_PRESETS } from '../../../physics/RocketSimConstants.ts';
import { assignTeamSlotKeys } from '../../../replay/container/RCReplayTimelineParser.ts';
import { gameAudio } from '../../../audio/GameAudioEngineFacade.ts';
import type { BallStateViewLike, CarStateViewLike } from '../shared/goalAndBallTouchPipeline.ts';
import type { MatchStateData } from '../../runtime/RuntimeMatchState.ts';
import type { PodiumCelebrationController } from '../PodiumCelebrationController.ts';

export type { CarControls, BallStateViewLike, CarStateViewLike };

export const MAX_GOAL_LOOKBACK_SECONDS = 10.0;
export const SCORER_TOUCH_LOOKBACK_SECONDS = 7.0;

export const KICKOFF_SLOT_PERMUTATIONS: ReadonlyArray<ReadonlyArray<number>> = [
  [0, 1, 2, 3, 4],
  [1, 0, 3, 2, 4],
  [0, 2, 4, 1, 3],
  [1, 3, 4, 0, 2],
  [2, 3, 4, 0, 1],
];

export interface ExpModeAudioPort {
  play?: (cueName: string, volume?: number, maxDurationMs?: number) => void;
  setCarBoostAudioVariation?: (carIndex: number, boostAudio: string) => void;
}

export interface ExpPhysicsEnginePort {
  state: Float32Array;
  numCars: number;
  ballOnGround?: boolean;
  getHeaderView?: () => { tickCount: number } | null;
  getBallStateView: () => BallStateViewLike;
  getCarStateView: (carIndex: number) => CarStateViewLike | null;
  getPads: () => unknown;
  setControls: (carIndex: number, controls: CarControls) => void;
  setBallState: (
    state:
      | {
          pos: [number, number, number];
          vel: [number, number, number];
          angVel: [number, number, number];
        }
      | Float32Array
  ) => boolean | void;
  getBallState?: () => Float32Array | ArrayLike<number>;
  setCarState: (carIndex: number, state: Record<string, unknown> | Float32Array) => boolean | void;
  setCarTeam?: (carIndex: number, team: 0 | 1) => void;
  setCarHitbox?: (carIndex: number, hitboxId: string) => void;
  addCar: (team: number, preset: string) => number | void;
  removeCar: (carIndex: number) => void;
  resetGoalLatch?: () => void;
  resetKickoff: (seed?: number, mirror?: boolean) => void;
  getCarUnlimitedBoost?: (carIndex: number) => boolean;
  setUnlimitedBoost: (unlimited: boolean) => void;
  setPossessionReportingEnabled?: (enabled: boolean) => void;
  resetPossessionStats?: () => void;
  setSimulationFrozen?: (frozen: boolean, freezeCarIdx?: number, freezeBall?: boolean) => void;
  pushSignalEvent?: (...args: number[]) => void;
  isBallScored?: (bView: BallStateViewLike) => boolean;
}

export interface ExpInterpolatorCarViewPort {
  boost: number;
  velX: number;
  velY: number;
  velZ: number;
  fwdX: number;
  fwdY: number;
  fwdZ: number;
  isJumping?: boolean | number;
  isBoosting: number | boolean;
}

export interface ExpModeRuntimePort {
  physics?: ExpPhysicsEnginePort | null;
  arena?: {
    playerCarIndex?: number;
    cars?: Array<{ visible: boolean }>;
    carDemolitions?: Array<{ stop?: () => void } | null | undefined>;
    supersonicWheelTrailSystem?: {
      clear?: () => void;
      resetCar?: (carIndex: number) => void;
    } | null;
    lighting?: { updateSunIntensities?: (scale?: number) => void } | null;
    ensureOpponent?: () => Promise<void> | void;
    ensureCar?: (carIndex: number, team: 0 | 1, visualId: string) => void;
    setCarTeam?: (carIndex: number, team: 0 | 1) => void;
    setCarColor?: (carIndex: number, colorHex: string) => void;
    setCarLoadout?: (carIndex: number, loadout: Record<string, unknown>) => void;
    resetCarBoosts?: (carIndex: number) => void;
  } | null;
  interpolator?: {
    currState: Float32Array;
    prevState: Float32Array;
    alpha: number;
    setTrainingPhysicsRate?: (rateHz: number) => void;
    sync?: () => void;
    getCurrCarStateView?: (carIndex: number) => ExpInterpolatorCarViewPort | null;
  } | null;
  ballTrajectoryPredictor?: { clear?: () => void } | null;
  camera?: { resetView?: () => void } | null;
  match?: { state?: MatchStateData | null } | null;
  audioSubsystem?: { resetAudio?: () => void } | null;
  loadoutCoordinator?: { restoreLocalPlayerFreeplayLoadout?: (carIndex?: number) => void } | null;
  teamAssignment?: { playerTeam?: number; opponentTeam?: number } | null;
  options?: { gameAudio?: ExpModeAudioPort | null } | null;
  podiumController?: PodiumCelebrationController | null;
  playerCarIndex: number;
  playerControls: CarControls;
  neutralControls: CarControls;
  playerThrottle?: number;
  selectedPreset?: string;
  selectedHitbox?: string;
  selectedColorSlot?: number | null;
  _localSkipReplayReady?: boolean;
  releaseGoalReplayCameraOverride: (source?: string | null) => void;
}

export interface ExpSpawnedCarEntry {
  carIndex: number;
  keyNumber: number;
  team: 0 | 1;
  teamSlotIndex: number;
  isPlayer: boolean;
  botType: string;
  visualId: string;
  hitboxId: string;
  colorSlot: number;
  colorHex: string;
  colorName: string;
  paintFinish: string;
  boostVisual: string;
  boostAudio: string;
  anthemId: string;
  label: string;
  name?: string;
  agent: ExperimentalBotAgent | null;
  [key: string]: unknown;
}

export interface ExpActiveCarRef {
  carIndex: number;
  team: 0 | 1;
}

export interface ExpReplayCarEntry {
  carIndex: number;
  name: string;
  username: string;
  team: 0 | 1;
  isBot: boolean;
  isLocalPlayer: boolean;
  botType?: string | null;
  visualId?: string;
  hitboxId?: string;
  colorSlot?: number;
  colorHex?: string | null;
  paintFinish?: string;
  boostVisual?: string;
  boostAudio?: string;
  anthemId?: string;
}

export interface ExpExportedRosterEntry {
  carIndex: number;
  team: 0 | 1;
  name: string;
  isPlayer: boolean;
  botType: string | null;
  visualId: string;
  hitboxId: string;
  colorSlot: number;
  colorHex: string | null;
  paintFinish: string;
  boostVisual: string;
  boostAudio: string;
  anthemId: string;
  [key: string]: unknown;
}

export interface ExpTeamTouchRecord {
  carIndex: number;
  team: 0 | 1;
  tick: number;
  playerName: string;
}

export interface ExpReplaySignal {
  [key: string]: unknown;
  signalId: number;
  signalType: number;
  frameId: number;
  param1: number;
  param2: number;
}

export interface ExpGoalIncidentMeta {
  goalIncidentTick: number;
  goalScoringTeam: 0 | 1;
  goalScorerCarIndex: number;
  goalScorerName: string | null;
  goalScorerTouchTick: number;
  goalAssistName: string | null;
  goalBallSpeedKph: number | null;
  lastKickoffStartTick: number;
}

export function getExpModeAudio(
  runtime: ExpModeRuntimePort | null | undefined
): ExpModeAudioPort | null {
  return runtime?.options?.gameAudio || (gameAudio as ExpModeAudioPort);
}

export function getExpCarDisplayName(
  entry: Partial<ExpSpawnedCarEntry> | null | undefined,
  spawnedCars: ReadonlyArray<Partial<ExpSpawnedCarEntry>> = []
): string {
  if (!entry) return 'Player';
  if (entry.isPlayer) return 'Player';
  const rawType = String(entry.botType || 'bot');
  const meta = getExperimentalBotPolicyMeta(rawType);
  const baseName =
    meta?.shortName || rawType.charAt(0).toUpperCase() + rawType.slice(1).toLowerCase();
  const sameBotCount = Array.isArray(spawnedCars)
    ? spawnedCars.filter((c) => !c.isPlayer && c.botType === entry.botType).length
    : 1;
  return sameBotCount > 1 ? `${baseName} #${entry.keyNumber}` : baseName;
}

export function buildExpCarEntriesForReplay(
  spawnedCars: ReadonlyArray<ExpSpawnedCarEntry>
): ExpReplayCarEntry[] {
  if (!Array.isArray(spawnedCars) || spawnedCars.length === 0) return [];
  return spawnedCars.map((c) => {
    const displayName = c.name || getExpCarDisplayName(c, spawnedCars);
    const teamNum: 0 | 1 = c.team === 1 ? 1 : 0;
    return {
      carIndex: c.carIndex,
      name: displayName,
      username: displayName,
      team: teamNum,
      isBot: !c.isPlayer,
      isLocalPlayer: Boolean(c.isPlayer),
      botType: c.botType || null,
      visualId: c.visualId || 'octane',
      hitboxId: c.hitboxId || 'hitbox-octane',
      colorSlot: c.colorSlot ?? (teamNum === 0 ? 3 : 0),
      colorHex: c.colorHex || null,
      paintFinish: c.paintFinish || 'metallic',
      boostVisual: c.boostVisual || 'cartoon',
      boostAudio: c.boostAudio || 'standard',
      anthemId: c.anthemId || 'none',
    };
  });
}

export function buildExpRosterForExport(
  spawnedCars: ReadonlyArray<ExpSpawnedCarEntry>
): ExpExportedRosterEntry[] {
  if (!Array.isArray(spawnedCars)) return [];
  return spawnedCars.map((c) => ({
    carIndex: c.carIndex,
    team: c.team,
    name: c.name || getExpCarDisplayName(c, spawnedCars),
    isPlayer: Boolean(c.isPlayer),
    botType: c.botType || null,
    visualId: c.visualId || 'octane',
    hitboxId: c.hitboxId || 'hitbox-octane',
    colorSlot: c.colorSlot ?? (c.team === 0 ? 3 : 0),
    colorHex: c.colorHex || null,
    paintFinish: c.paintFinish || 'metallic',
    boostVisual: c.boostVisual || 'cartoon',
    boostAudio: c.boostAudio || 'standard',
    anthemId: c.anthemId || 'none',
  }));
}

export function computeKickoffSpawnPlacement(
  entry: Pick<ExpSpawnedCarEntry, 'team' | 'teamSlotIndex'>,
  permutationSeed: number,
  unlimitedBoost: boolean
): {
  pos: [number, number, number];
  vel: [number, number, number];
  angVel: [number, number, number];
  rot: [number, number, number];
  fwd: [number, number, number];
  right: [number, number, number];
  up: [number, number, number];
  isOnGround: boolean;
  isSupersonic: boolean;
  isDemoed: boolean;
  hasFlipOrJump: boolean;
  isBoosting: boolean;
  isFlipping: boolean;
  boost: number;
} {
  const perm = KICKOFF_SLOT_PERMUTATIONS[permutationSeed % KICKOFF_SLOT_PERMUTATIONS.length];
  const presetIdx = perm[entry.teamSlotIndex % perm.length] ?? 0;
  const preset = KICKOFF_SPAWN_PRESETS[presetIdx] || KICKOFF_SPAWN_PRESETS[0];
  const coord = entry.team === 0 ? preset.team0 : preset.team1;
  const cy = Math.cos(coord.yaw);
  const sy = Math.sin(coord.yaw);

  return {
    pos: [coord.x, coord.y, coord.z],
    vel: [0, 0, 0],
    angVel: [0, 0, 0],
    rot: [0, coord.yaw, 0],
    fwd: [cy, sy, 0],
    right: [-sy, cy, 0],
    up: [0, 0, 1],
    isOnGround: true,
    isSupersonic: false,
    isDemoed: false,
    hasFlipOrJump: true,
    isBoosting: false,
    isFlipping: false,
    boost: unlimitedBoost ? 100 : 33.33,
  };
}

export function resolveSlotKeyTargetCarEntry(
  spawnedCars: ReadonlyArray<ExpSpawnedCarEntry>,
  localTeam: number,
  keyNum: number
): ExpSpawnedCarEntry | null {
  const isLocalOrange = localTeam === 1;
  const blueCars = spawnedCars.filter((c) => c.team === 0);
  const orangeCars = spawnedCars.filter((c) => c.team === 1);
  const leftCars = isLocalOrange ? orangeCars : blueCars;
  const rightCars = isLocalOrange ? blueCars : orangeCars;
  const { slotKeyToCarIndex } = assignTeamSlotKeys(leftCars, rightCars);
  const mappedCarIdx = slotKeyToCarIndex[keyNum];
  return typeof mappedCarIdx === 'number'
    ? spawnedCars.find((c) => c.carIndex === mappedCarIdx) || null
    : spawnedCars.find((c) => c.keyNumber === keyNum) || null;
}

export function resolveGoalAttribution(
  scoringTeam: 0 | 1,
  lastTouchByTeam: Record<0 | 1, ExpTeamTouchRecord | null>,
  prevTouchByTeam: Record<0 | 1, ExpTeamTouchRecord | null>,
  spawnedCars: ReadonlyArray<ExpSpawnedCarEntry>
): {
  scorerCarIndex: number;
  scorerName: string;
  scorerTouchTick: number;
  assistName: string | null;
  scorerAnthemId: string | null;
} {
  const lastTeamTouch = lastTouchByTeam[scoringTeam];
  const prevTeamTouch = prevTouchByTeam[scoringTeam];

  let scorerCarIndex = 0;
  let scorerName = scoringTeam === 0 ? 'Blue' : 'Orange';
  let scorerTouchTick = -1;

  if (lastTeamTouch) {
    scorerCarIndex = lastTeamTouch.carIndex;
    scorerName = lastTeamTouch.playerName;
    scorerTouchTick = lastTeamTouch.tick;
  } else {
    const fallbackEntry = spawnedCars.find((c) => c.team === scoringTeam) || spawnedCars[0];
    scorerCarIndex = fallbackEntry ? fallbackEntry.carIndex : 0;
    scorerName = fallbackEntry
      ? getExpCarDisplayName(fallbackEntry, spawnedCars)
      : scoringTeam === 0
        ? 'Blue'
        : 'Orange';
    scorerTouchTick = -1;
  }

  const scorerEntry = spawnedCars.find((c) => c.carIndex === scorerCarIndex) || null;
  const assistName =
    prevTeamTouch &&
    lastTeamTouch &&
    prevTeamTouch.carIndex !== lastTeamTouch.carIndex &&
    lastTeamTouch.tick - prevTeamTouch.tick <= 720
      ? prevTeamTouch.playerName
      : null;

  return {
    scorerCarIndex,
    scorerName,
    scorerTouchTick,
    assistName,
    scorerAnthemId: scorerEntry?.anthemId || null,
  };
}
