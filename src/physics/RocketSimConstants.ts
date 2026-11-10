/**
 * RocketSimConstants.ts
 * Linear memory offsets, strides, and unified 3-category hexadecimal event table
 * for RocketSim WebAssembly physics simulation and authoritative networking.
 */

export const SIM_OFFSETS = Object.freeze({
  TICK: 0,
  GOAL: 1,
  NUM_CARS: 2,
  NUM_PADS: 3,
  BALL: 4,
  CARS: 22,
});

export const EXTENDED_STATE_OFFSETS = Object.freeze({
  IS_BALL_SLEEPING: 410,
  IS_SIMULATION_FROZEN: 411,
  POSSESSION_STATE: 412,
  POSSESSION_BLUE_POINTS: 413,
  POSSESSION_ORANGE_POINTS: 414,
  POSSESSION_DURATION: 415,
  CAR_JUMP_AIR_BASE: 416,
  CAR_JUMP_AIR_STRIDE: 4,
  CAR_IS_JUMPING_OFFSET: 0,
  CAR_AIR_TIME_OFFSET: 1,
  CAR_JUMP_TIME_OFFSET: 2,
  CAR_AIR_TIME_SINCE_JUMP_OFFSET: 3,
});

export const GAME_STATE_BUFFER_FLOATS = 448;
export const STATE_BUFFER_FLOATS = GAME_STATE_BUFFER_FLOATS;

export const ARENA_PRESETS = Object.freeze({
  STANDARD_ARENA: 0,
  THROWBACK_STADIUM: 1,
});

export const CAR_STATE_OFFSETS = Object.freeze({
  POS: 0,
  FWD: 3,
  RIGHT: 6,
  UP: 9,
  VEL: 12,
  ANG_VEL: 15,
  BOOST: 18,
  ON_GROUND: 19,
  SUPERSONIC: 20,
  DEMOED: 21,
  HAS_FLIP_OR_JUMP: 22,
  IS_BOOSTING: 23,
  IS_FLIPPING: 24,
  WHEELS: 25,
  GROUND_NORMAL: 37,
});

export const BALL_STATE_OFFSETS = Object.freeze({
  POS: 0,
  ROT_MAT: 3,
  FWD: 3,
  RIGHT: 6,
  UP: 9,
  VEL: 12,
  ANG_VEL: 15,
});

export const CAR_STATE_STRIDE = 40;
export const BALL_STATE_STRIDE = 18;
export const CONTROLS_STRIDE = 8;
export const MAX_CARS = 8;
export const PHYSICS_TICK_RATE = 120;
export const FIXED_TIMESTEP = 1 / PHYSICS_TICK_RATE;
export const MAX_PHYSICS_SUBSTEPS = 12;

export const NUM_BOOST_PADS = 34;
export const BOOST_PAD_STATE_STRIDE = 2;
export const BOOST_PAD_STATES_OFFSET = SIM_OFFSETS.CARS + MAX_CARS * CAR_STATE_STRIDE;
export const BOOST_PAD_TIMEOUT_BIG = 10.0;
export const BOOST_PAD_TIMEOUT_SMALL = 4.0;
export const BOOST_PAD_OFFSETS = Object.freeze({
  IS_ACTIVE: 0,
  COOLDOWN: 1,
});

export const CONTROLS_OFFSETS = Object.freeze({
  THROTTLE: 0,
  STEER: 1,
  PITCH: 2,
  YAW: 3,
  ROLL: 4,
  JUMP: 5,
  BOOST: 6,
  HANDBRAKE: 7,
});

export const GRAVITY_Z = -650;
export const BALL_COLLISION_RADIUS = 91.25;
export const BALL_REST_Z = 93.15;
export const BALL_GROUND_CONTACT_MAX_Z = BALL_COLLISION_RADIUS + 2.0;
export const BALL_MAX_SPEED = 4000;

export const STANDARD_GOAL_VOLUME_BOX = Object.freeze({
  halfWidthX: 892.755,
  minY: 5120.0,
  maxY: 6000.0,
  minZ: 0.0,
  maxZ: 642.775,
});

export const THROWBACK_GOAL_VOLUME_BOX = Object.freeze({
  halfWidthX: 940.0,
  minY: 4922.0,
  maxY: 5460.0,
  minZ: 0.0,
  maxZ: 640.0,
});

export const BALL_CONTROL_MODES = Object.freeze([
  'takePossession',
  'startDribble',
  'passBall',
  'launchBall',
]);

export const INCIDENT_EVENT_TYPES = Object.freeze({
  NONE: 0x00,
  CAR_BALL_HIT: 0x01,
  CAR_CAR_BUMP: 0x02,
  CAR_CAR_COLLISION: 0x02,
  CAR_CAR_DEMO: 0x03,
  BALL_WORLD_HIT: 0x04,
  BALL_GOALPOST_HIT: 0x05,
  CAR_JUMP: 0x06,
  CAR_DOUBLE_JUMP: 0x07,
  CAR_DODGE: 0x08,
  CAR_SUPERSONIC_ENTER: 0x09,
  BOOST_PICKUP: 0x0a,
  BOOST_SPAWN: 0x0b,
  CAR_BOOST_START: 0x0c,
  BOOST_START: 0x0c,
  CAR_BOOST_STOP: 0x0d,
  BOOST_END: 0x0d,
  GOAL_SCORED: 0x0e,
  FLIP_RESET_GAINED: 0x0f,
  BALL_STATE_CHANGE: 0x10,
  POSSESSION_CHANGE: 0x11,
});

export const SYSTEM_CONTROL_SIGNALS = Object.freeze({
  SYS_CTRL_STATE_ONLY: 0xa0,
  SYS_CTRL_INTERVENE_WILL_RESUME: 0xa1,
  SYS_CTRL_TAKEOVER_COUNTDOWN: 0xa1,
  SYS_CTRL_PHYSICS_RESUME: 0xa2,
});

export const SIGNAL_EVENT_TYPES = Object.freeze({
  MATCH_START: 0x80,
  MATCH_STARTED: 0x80,
  KICKOFF_WILL_START: 0x81,
  KICKOFF_PREPARE: 0x81,
  KICKOFF_START: 0x82,
  KICKOFF_GO: 0x82,
  COUNTDOWN_TICK: 0x83,
  MATCH_PAUSED: 0x84,
  MATCH_PAUSE: 0x84,
  MATCH_WILL_RESUME: 0x85,
  MATCH_RESUMED: 0x86,
  MATCH_RESUME: 0x86,
  MATCH_UNPAUSED: 0x86,
  GOAL_REPLAY_WILL_START: 0x87,
  GOAL_REPLAY_START: 0x88,
  GOAL_REPLAY_WILL_END: 0x89,
  GOAL_REPLAY_END: 0x8a,
  OVERTIME_START: 0x8b,
  TIME_ALERT_60S: 0x8c,
  TIME_ALERT_30S: 0x8d,
  PLAYER_JOINED: 0x8e,
  PLAYER_ENTER_ARENA: 0x8e,
  PLAYER_LEFT: 0x8f,
  PLAYER_LEAVE_ARENA: 0x8f,
  FORFEIT_VOTE: 0x90,
  SCORE_UPDATED: 0x91,
  BALL_RESET: 0x92,
  ROUND_STARTED: 0x93,
  MATCH_CREATED: 0x94,
  MATCH_INITIALIZED: 0x95,
  MATCH_PREPARE: 0x96,
  MATCH_ENDED: 0x97,
  MATCH_DESTROYED: 0x98,
  SERVER_DESTROYED: 0x98,
  PODIUM_START: 0x99,
  PLAYER_LOADOUT_UPDATED: 0x9a,
  PLAYER_SLOT_UPDATED: 0x9b,
  DEMOLITION: 0x9c,
  CLOCK_UPDATED_SECONDS: 0x9d,
  COUNTDOWN_10S: 0x9e,
  COMMAND_ACK: 0x9f,
  ...SYSTEM_CONTROL_SIGNALS,
  FLIP_RESET_GAINED: 0x0f,
});

export const MATCH_SIGNALS = SIGNAL_EVENT_TYPES;

export const CLIENT_COMMAND_TYPES = Object.freeze({
  CMD_READY_ACK: 0xc0,
  READY_TO_START: 0xc0,
  CMD_ARENA_LOADED_ACK: 0xc1,
  ARENA_INITIALIZED: 0xc1,
  CMD_SET_LOADOUT: 0xc2,
  SELECT_LOADOUT: 0xc2,
  CMD_SWITCH_ROLE_TEAM: 0xc3,
  SWITCH_TEAM_ROLE: 0xc3,
  CMD_VOTE_SKIP_REPLAY: 0xc4,
  SKIP_REPLAY_VOTE: 0xc4,
  CMD_VOTE_REMATCH: 0xc5,
  REMATCH_VOTE: 0xc5,
  CMD_REQUEST_PAUSE: 0xc6,
  PAUSE_REQUEST: 0xc6,
  CMD_VOTE_FORFEIT: 0xc7,
  FORFEIT_VOTE: 0xc7,
  CMD_REJOIN_CLAIM: 0xc8,
  RECONNECT_CLAIM: 0xc8,
  CMD_SYS_STATE_ONLY: 0xc9,
  CMD_SYS_INTERVENE_COUNTDOWN: 0xca,
  CMD_SYS_PHYSICS_RESUME: 0xcb,
});

export function isIncidentEvent(code: number | null | undefined): boolean {
  return typeof code === 'number' && code >= 0x01 && code <= 0x3f;
}

export function isServerSignal(code: number | null | undefined): boolean {
  return typeof code === 'number' && (code === 0x0f || (code >= 0x80 && code <= 0xbf));
}

export function isSystemControlSignal(code: number | null | undefined): boolean {
  return typeof code === 'number' && code >= 0xa0 && code <= 0xaf;
}

export function isClientCommand(code: number | null | undefined): boolean {
  return typeof code === 'number' && code >= 0xc0 && code <= 0xff;
}

export const SURFACE_SUBTYPES = Object.freeze({
  NONE: 0,
  FLOOR: 1,
  CEILING: 2,
  SIDE_WALL: 3,
  BACKBOARD: 4,
  CORNER_45: 5,
  RAMP_GROUND: 6,
  RAMP_CEILING: 7,
  GOALPOST: 8,
  CROSSBAR: 9,
  OTHER_CURVE: 10,
});

export const PHYSICS_EVENT_TYPES = Object.freeze({
  ...INCIDENT_EVENT_TYPES,
  ...SIGNAL_EVENT_TYPES,
  CAR_DEMO: 0x03,
  CAR_ACTION: 0x3e,
});

export const CAR_ACTION_SUBTYPES = Object.freeze({
  NONE: 0,
  SINGLE_JUMP: 1,
  DOUBLE_JUMP: 2,
  DODGE: 3,
});

export const FLIP_RESET_OBJECT_TYPES = Object.freeze({
  NONE: 0,
  BALL: 1,
  CAR: 2,
  WORLD: 3,
});

export const FLIP_RESET_SUBTYPES = Object.freeze({
  NONE: 0,
  BALL: 1,
  CAR: 2,
  CEILING: 3,
  BACKBOARD: 4,
  SIDE_WALL: 5,
  CORNER_45: 6,
  RAMP_GROUND: 7,
  RAMP_CEILING: 8,
  GOALPOST: 9,
  CROSSBAR: 10,
  FLOOR: 11,
  DROPSHOT_TILE: 12,
  OTHER_WORLD: 13,
});

export const FLIP_RESET_SUBTYPE_LABELS: Readonly<Record<number, string>> = Object.freeze({
  [FLIP_RESET_SUBTYPES.NONE]: 'none',
  [FLIP_RESET_SUBTYPES.BALL]: 'ball',
  [FLIP_RESET_SUBTYPES.CAR]: 'car',
  [FLIP_RESET_SUBTYPES.CEILING]: 'ceiling',
  [FLIP_RESET_SUBTYPES.BACKBOARD]: 'backboard',
  [FLIP_RESET_SUBTYPES.SIDE_WALL]: 'side_wall',
  [FLIP_RESET_SUBTYPES.CORNER_45]: 'corner_45',
  [FLIP_RESET_SUBTYPES.RAMP_GROUND]: 'ramp_ground',
  [FLIP_RESET_SUBTYPES.RAMP_CEILING]: 'ramp_ceiling',
  [FLIP_RESET_SUBTYPES.GOALPOST]: 'goalpost',
  [FLIP_RESET_SUBTYPES.CROSSBAR]: 'crossbar',
  [FLIP_RESET_SUBTYPES.FLOOR]: 'floor',
  [FLIP_RESET_SUBTYPES.DROPSHOT_TILE]: 'dropshot_tile',
  [FLIP_RESET_SUBTYPES.OTHER_WORLD]: 'other_world',
});

export function getFlipResetObjectCode(subType = 0, flags = 0): number {
  const flagObj = (Number(flags) >>> 4) & 0xf;
  if (
    flagObj === FLIP_RESET_OBJECT_TYPES.BALL ||
    flagObj === FLIP_RESET_OBJECT_TYPES.CAR ||
    flagObj === FLIP_RESET_OBJECT_TYPES.WORLD
  ) {
    return flagObj;
  }
  const st = Number(subType) | 0;
  if (st === FLIP_RESET_SUBTYPES.BALL) return FLIP_RESET_OBJECT_TYPES.BALL;
  if (st === FLIP_RESET_SUBTYPES.CAR) return FLIP_RESET_OBJECT_TYPES.CAR;
  if (st >= FLIP_RESET_SUBTYPES.CEILING && st <= FLIP_RESET_SUBTYPES.OTHER_WORLD) {
    return FLIP_RESET_OBJECT_TYPES.WORLD;
  }
  return FLIP_RESET_OBJECT_TYPES.NONE;
}

export function getFlipResetObjectName(subType = 0, flags = 0): string {
  const code = getFlipResetObjectCode(subType, flags);
  if (code === FLIP_RESET_OBJECT_TYPES.BALL) return 'ball';
  if (code === FLIP_RESET_OBJECT_TYPES.CAR) return 'car';
  if (code === FLIP_RESET_OBJECT_TYPES.WORLD) return 'world';
  return 'none';
}

export interface FlipResetEventLike {
  type?: number | string;
  isBallFlipReset?: boolean;
  resetSubType?: number | string;
  subType?: number | string;
  resetObjectCode?: number | string;
  flags?: number;
  resetObjectType?: string;
}

export function isBallFlipResetEvent(ev: FlipResetEventLike | null | undefined): boolean {
  if (!ev || typeof ev !== 'object') return false;
  if (typeof ev.isBallFlipReset === 'boolean') return ev.isBallFlipReset;
  const subType = Number(ev.resetSubType ?? ev.subType ?? 0);
  if (subType > 0) return subType === FLIP_RESET_SUBTYPES.BALL;
  const objCode = Number(ev.resetObjectCode ?? (Number(ev.flags ?? 0) >>> 4) & 0xf);
  if (objCode > 0) return objCode === FLIP_RESET_OBJECT_TYPES.BALL;
  if (typeof ev.resetObjectType === 'string') return ev.resetObjectType === 'ball';
  return false;
}

export const PHYSICS_EVENT_FLAGS = Object.freeze({
  INITIAL_TOUCH: 1 << 0,
  SUPERSONIC: 1 << 1,
  FLIP: 1 << 2,
  ON_GROUND: 1 << 3,
});

export const EVENT_BUFFER_CAPACITY = 256;
export const EVENT_SIZE_BYTES = 64;
export const EVENT_SIZE_WORDS = 16;
export const EVENT_HEADER_BYTES = 16;
export const EVENT_HEADER_WORDS = 4;
export const EVENT_TOTAL_BUFFER_BYTES =
  EVENT_HEADER_BYTES + EVENT_BUFFER_CAPACITY * EVENT_SIZE_BYTES;

export const BALL_PRED_MAX_SECONDS = 5.0;
export const BALL_PRED_MAX_TICKS = 600;
export const BALL_PRED_STRIDE = 9;

export const DIAGNOSTIC_PROBE_SLOTS = Object.freeze([6, 7]);

export function isDiagnosticProbeSlot(carIndex: number): boolean {
  return carIndex === 6 || carIndex === 7;
}

export const KICKOFF_SPAWN_PRESETS = Object.freeze([
  {
    team0: { x: 2048, y: -2560, z: 17, yaw: 2.35619449 },
    team1: { x: -2048, y: 2560, z: 17, yaw: -0.78539816 },
  },
  {
    team0: { x: -2048, y: -2560, z: 17, yaw: 0.78539816 },
    team1: { x: 2048, y: 2560, z: 17, yaw: -2.35619449 },
  },
  {
    team0: { x: 256, y: -3840, z: 17, yaw: 1.57079633 },
    team1: { x: -256, y: 3840, z: 17, yaw: -1.57079633 },
  },
  {
    team0: { x: -256, y: -3840, z: 17, yaw: 1.57079633 },
    team1: { x: 256, y: 3840, z: 17, yaw: -1.57079633 },
  },
  {
    team0: { x: 0, y: -4608, z: 17, yaw: 1.57079633 },
    team1: { x: 0, y: 4608, z: 17, yaw: -1.57079633 },
  },
]);

export const RESPAWN_SPAWN_PRESETS = Object.freeze([
  {
    id: 'far-left',
    slotIndex: 0,
    name: 'Far Left',
    label: 'Far Left',
    team0: { x: 2688, y: -4608, z: 17, yaw: Math.PI / 2 },
    team1: { x: -2688, y: 4608, z: 17, yaw: -Math.PI / 2 },
  },
  {
    id: 'inner-left',
    slotIndex: 1,
    name: 'Inner Left',
    label: 'Inner Left',
    team0: { x: 2304, y: -4608, z: 17, yaw: Math.PI / 2 },
    team1: { x: -2304, y: 4608, z: 17, yaw: -Math.PI / 2 },
  },
  {
    id: 'inner-right',
    slotIndex: 2,
    name: 'Inner Right',
    label: 'Inner Right',
    team0: { x: -2304, y: -4608, z: 17, yaw: Math.PI / 2 },
    team1: { x: 2304, y: 4608, z: 17, yaw: -Math.PI / 2 },
  },
  {
    id: 'far-right',
    slotIndex: 3,
    name: 'Far Right',
    label: 'Far Right',
    team0: { x: -2688, y: -4608, z: 17, yaw: Math.PI / 2 },
    team1: { x: 2688, y: 4608, z: 17, yaw: -Math.PI / 2 },
  },
]);

export function getDesiredRespawnPose(team = 0, slotIndex = 0) {
  const clampedSlot = Math.max(0, Math.min(3, Math.trunc(slotIndex)));
  const entry = RESPAWN_SPAWN_PRESETS[clampedSlot] || RESPAWN_SPAWN_PRESETS[0];
  return Number(team) === 1 ? entry.team1 : entry.team0;
}
