/**
 * src/network/server/match/matchLoadoutAndSpawnPipeline.ts
 * Pure data pipelines and constants for server match state, color/loadout resolution,
 * kickoff spawn placement, and RTT aggregation.
 */

import {
  CAR_STATE_OFFSETS,
  CAR_STATE_STRIDE,
  KICKOFF_SPAWN_PRESETS,
} from '../../../physics/RocketSimConstants.ts';
import {
  CAR_COLOR_SLOTS,
  encodeVisualIdIndex,
  decodeVisualIdIndex,
  resolveHitboxIndex,
  decodeHitboxIndex,
  decodePaintFinishIndex,
  decodeBoostVisualIndex,
  decodeBoostAudioIndex,
  getCarColorSlotById,
  packLoadoutSignalParam2,
  unpackLoadoutCommandParam1,
  unpackLoadoutCommandParam2,
} from '../../../ui-core/config/vehicleConstants.ts';

export const MATCH_TICK_RATE = 120;
export const DEFAULT_MATCH_DURATION_SECONDS = 300;
export const KICKOFF_COUNTDOWN_SECONDS = 3;
export const KICKOFF_TOTAL_TICKS = 480; // 4.0s @ 120Hz (1s buffer + 3s countdown)
export const GOAL_CELEBRATION_TICKS = 360; // 3.0s @ 120Hz
export const GOAL_REPLAY_DURATION_TICKS = 360; // 3.0s @ 120Hz
export const PAUSE_RESUME_COUNTDOWN_TICKS = 600; // 5.0s @ 120Hz
export const DEFAULT_MAX_OVERTIME_SECONDS = 360; // 6 min clock before possession tie-breaker

export const MATCH_STATES = Object.freeze({
  LOBBY: 'lobby',
  PREPARE: 'prepare',
  COUNTDOWN: 'countdown',
  KICKOFF: 'kickoff',
  KICKOFF_COUNTDOWN: 'kickoff',
  PLAYING: 'playing',
  GOAL_SCORED: 'goal_scored',
  REPLAY: 'replay',
  GOAL_REPLAY: 'replay',
  PAUSED: 'paused',
  ENDED: 'ended',
  PODIUM: 'podium',
});

export type MatchState = (typeof MATCH_STATES)[keyof typeof MATCH_STATES];

export interface PlayerLoadoutOptions {
  visualId?: string | number;
  visualIndex?: number;
  hitboxId?: string | number | null;
  hitboxIndex?: number | null;
  colorSlot?: number | null;
  blueColorSlot?: number | null;
  orangeColorSlot?: number | null;
  paintFinish?: string | number;
  boostVisual?: string | number;
  boostAudio?: string | number;
  anthemId?: string;
  botType?: string;
}

export type ExtraLoadoutConfig = PlayerLoadoutOptions;

export interface MatchPlayerSlot {
  sessionId: string;
  entityId: number;
  carIndex: number;
  team: number;
  preferredTeam?: number;
  name: string;
  role: string;
  spawnSlot: number;
  visualId: string;
  visualIndex: number;
  hitboxId: string;
  hitboxIndex: number;
  colorSlot: number;
  blueColorSlot: number | null;
  orangeColorSlot: number | null;
  colorHex: string;
  paintFinish: string;
  boostVisual: string;
  boostAudio: string;
  anthemId: string;
  ready: boolean;
  arenaLoaded: boolean;
  isBot: boolean;
  botType?: string;
  pendingVisualId?: string | null;
  pingMs?: number;
}

export interface DisconnectedPlayerSlot extends MatchPlayerSlot {
  disconnectedAtTick: number;
}

export interface MatchSpectatorSlot {
  sessionId: string;
  name: string;
  role: 'spectator';
  ready: boolean;
  arenaLoaded: boolean;
  pingMs?: number;
}

export interface ActiveMatchSignal {
  signalId: number;
  signalType: number;
  frameId: number;
  param1: number;
  param2: number;
  ackedPeers: Set<string>;
  remainingRedundancy: number;
}

export interface ReplaySignalLogEntry {
  signalId: number;
  signalType: number;
  frameId: number;
  param1: number;
  param2: number;
  frameIndex: number;
  recordedAt: number;
}

export interface UserRttSummary {
  players: Array<number | null>;
  spectators: Array<{ id: number; rtt: number }>;
}

export interface MatchRosterMetadataEntry {
  carIndex: number;
  entityId: number;
  sessionId: string;
  name: string;
  team: number;
  role: string;
  isBot: boolean;
  botType?: string;
  visualId: string;
  visualIndex: number;
  hitboxId: string;
  hitboxIndex: number;
  colorSlot: number;
  colorHex: string;
  paintFinish: string;
  boostVisual: string;
  boostAudio: string;
  anthemId: string;
}

export interface RosterSnapshotPlayerEntry {
  sessionId: string;
  entityId: number;
  carIndex: number;
  team: number;
  preferredTeam: number;
  name: string;
  spawnSlot: number;
  visualId: string;
  visualIndex: number;
  hitboxId: string;
  hitboxIndex: number;
  colorSlot: number;
  colorHex: string | null;
  paintFinish: string;
  boostVisual: string;
  boostAudio: string;
  anthemId: string;
  isBot: boolean;
  botType?: string;
  ready: boolean;
  arenaLoaded: boolean;
  pingMs: number;
}

export interface RosterSnapshotSpectatorEntry {
  sessionId: string;
  name: string;
  role: 'spectator';
  pingMs: number;
}

export interface RosterSnapshot {
  players: RosterSnapshotPlayerEntry[];
  spectators: RosterSnapshotSpectatorEntry[];
  gameMode: string;
  botFillMode: string;
  durationSeconds: number;
  clockSeconds: number;
  score: { blue: number; orange: number };
}

export interface RosterSessionEntryPort {
  role?: string;
  entityId: number;
  team?: number;
  playerName?: string;
  rttMs?: number;
  deferPhysicsRegistration?: boolean;
}

export interface RosterSessionManagerPort {
  getSession?: (sessionId: string) => RosterSessionEntryPort | null | undefined;
  getAllSessions?: () => Iterable<RosterSessionEntryPort>;
}

export interface SimSpawnPort {
  setCarState?: (carIndex: number, state: Float32Array) => void;
  setCarTeam?: (carIndex: number, team: number) => void;
}

export interface RosterSnapshotSource {
  players: Map<string, MatchPlayerSlot>;
  spectators: Map<string, MatchSpectatorSlot>;
  sessionManager?: RosterSessionManagerPort | null;
  gameMode: string;
  botFillMode: string;
  clockDuration: number;
  clockSecondsRemaining: number;
  blueScore?: number;
  orangeScore?: number;
}

export function resolveDefaultColorSlotForTeam(team: number): number {
  return team === 0 ? 3 : 0; // 3 = Sky Blue, 0 = Flame Red
}

export function isColorSlotValidForTeam(colorSlot: unknown, team: number): colorSlot is number {
  if (typeof colorSlot !== 'number' || colorSlot < 0 || colorSlot >= CAR_COLOR_SLOTS.length)
    return false;
  if (team !== 0 && team !== 1) return true;
  const slotObj =
    CAR_COLOR_SLOTS[colorSlot] ||
    CAR_COLOR_SLOTS.find((s: { id: number; team: number }) => s.id === colorSlot);
  return Boolean(slotObj && slotObj.team === team);
}

export function resolveTeamMatchedColorSlot(
  requestedColorSlot: unknown,
  assignedTeam = 0,
  blueColorSlot: number | null = null,
  orangeColorSlot: number | null = null
): number {
  const normalizedTeam = assignedTeam === 1 ? 1 : 0;
  if (isColorSlotValidForTeam(requestedColorSlot, normalizedTeam)) return requestedColorSlot;
  const teamPreferred = normalizedTeam === 0 ? blueColorSlot : orangeColorSlot;
  if (isColorSlotValidForTeam(teamPreferred, normalizedTeam)) return teamPreferred;
  return resolveDefaultColorSlotForTeam(normalizedTeam);
}

export function resolveColorHexForSlot(colorSlot: unknown, team = 0): string {
  const normalizedTeam = team === 1 ? 1 : 0;
  if (isColorSlotValidForTeam(colorSlot, normalizedTeam)) {
    const slotObj = getCarColorSlotById(colorSlot);
    if (slotObj?.hex) return slotObj.hex;
  }
  const fallbackSlot = resolveDefaultColorSlotForTeam(normalizedTeam);
  return getCarColorSlotById(fallbackSlot)?.hex || (normalizedTeam === 0 ? '#42a5f5' : '#ff7043');
}

export interface NormalizedSlotLoadoutResult {
  normalizedLoadout: PlayerLoadoutOptions;
  requestedVisual: string;
  visualIndex: number;
  requestedHitboxId: string;
  requestedHitboxIndex: number;
  requestedPaintFinish: string;
  requestedBoostVisual: string;
  requestedBoostAudio: string;
  requestedAnthemId: string;
}

export function resolveNormalizedSlotLoadout(
  loadoutOptions: PlayerLoadoutOptions | string | number = {},
  colorSlotArg: number | null = null,
  isBotSession = false
): NormalizedSlotLoadoutResult {
  const nl: PlayerLoadoutOptions =
    typeof loadoutOptions === 'string' || typeof loadoutOptions === 'number'
      ? { visualId: loadoutOptions, colorSlot: colorSlotArg }
      : loadoutOptions || {};
  const requestedVisual = decodeVisualIdIndex(nl.visualId ?? nl.visualIndex ?? 'octane');
  const requestedHitboxIndex = resolveHitboxIndex(nl.hitboxId ?? nl.hitboxIndex ?? requestedVisual);
  return {
    normalizedLoadout: nl,
    requestedVisual,
    visualIndex: encodeVisualIdIndex(requestedVisual),
    requestedHitboxId: decodeHitboxIndex(requestedHitboxIndex),
    requestedHitboxIndex,
    requestedPaintFinish: decodePaintFinishIndex(nl.paintFinish ?? 'metallic'),
    requestedBoostVisual: decodeBoostVisualIndex(nl.boostVisual ?? 'light-wave'),
    requestedBoostAudio: decodeBoostAudioIndex(nl.boostAudio ?? 'standard'),
    requestedAnthemId: nl.anthemId || (isBotSession ? 'TrainStation' : 'random'),
  };
}

export function resolveCosmeticsPatchForExistingPlayerSlot(
  existing: MatchPlayerSlot,
  r: NormalizedSlotLoadoutResult
): Partial<MatchPlayerSlot> {
  const nl = r.normalizedLoadout,
    patch: Partial<MatchPlayerSlot> = {};
  if (nl.visualId !== undefined || nl.visualIndex !== undefined) {
    patch.visualId = r.requestedVisual;
    patch.visualIndex = r.visualIndex;
  }
  if (
    nl.hitboxId !== undefined ||
    nl.hitboxIndex !== undefined ||
    nl.visualId !== undefined ||
    nl.visualIndex !== undefined
  ) {
    patch.hitboxId = r.requestedHitboxId;
    patch.hitboxIndex = r.requestedHitboxIndex;
  }
  if (nl.colorSlot !== undefined && nl.colorSlot !== null) {
    const s = resolveTeamMatchedColorSlot(
      nl.colorSlot,
      existing.team,
      nl.blueColorSlot ?? existing.blueColorSlot,
      nl.orangeColorSlot ?? existing.orangeColorSlot
    );
    patch.colorSlot = s;
    patch.colorHex = resolveColorHexForSlot(s, existing.team);
    if (existing.team === 0) patch.blueColorSlot = s;
    else patch.orangeColorSlot = s;
  }
  if (nl.paintFinish !== undefined) patch.paintFinish = r.requestedPaintFinish;
  if (nl.boostVisual !== undefined) patch.boostVisual = r.requestedBoostVisual;
  if (nl.boostAudio !== undefined) patch.boostAudio = r.requestedBoostAudio;
  if (nl.anthemId !== undefined) patch.anthemId = r.requestedAnthemId;
  if (nl.botType !== undefined) patch.botType = nl.botType;
  return patch;
}

export function resolveUpdatedPlayerLoadout(
  player: MatchPlayerSlot,
  sessionId: string,
  visualIdOrPackedParam1: string | number,
  colorSlotOrPackedParam2: number | null = null,
  explicitHitbox: string | number | null = null,
  extraLoadout: Record<string, string | number | undefined> | null = null
): { patch: Partial<MatchPlayerSlot>; packedLoadout: number } {
  const {
    visualId,
    visualIndex,
    hitboxIndex: upHbIdx,
  } = unpackLoadoutCommandParam1(visualIdOrPackedParam1);
  const hitboxIndex = explicitHitbox != null ? resolveHitboxIndex(explicitHitbox) : upHbIdx;
  const hitboxId = decodeHitboxIndex(hitboxIndex);

  let colorSlot = player.colorSlot,
    blueColorSlot = player.blueColorSlot,
    orangeColorSlot = player.orangeColorSlot;
  let paintFinish = player.paintFinish || 'metallic',
    boostVisual = player.boostVisual || 'light-wave',
    boostAudio = player.boostAudio || 'rush';

  if (typeof colorSlotOrPackedParam2 === 'number') {
    const up2 = unpackLoadoutCommandParam2(colorSlotOrPackedParam2);
    if (up2.colorSlot >= 0 && up2.colorSlot < CAR_COLOR_SLOTS.length) {
      if (isColorSlotValidForTeam(up2.colorSlot, player.team)) {
        colorSlot = up2.colorSlot;
        if (player.team === 0) blueColorSlot = colorSlot;
        else if (player.team === 1) orangeColorSlot = colorSlot;
      } else {
        colorSlot = resolveTeamMatchedColorSlot(
          up2.colorSlot,
          player.team,
          blueColorSlot,
          orangeColorSlot
        );
      }
    } else {
      console.warn(
        `[MatchRosterSubController] Invalid colorSlot ${up2.colorSlot} for "${sessionId}".`
      );
    }
    if (up2.hasExtendedCosmetics) {
      paintFinish = up2.paintFinish;
      boostVisual = up2.boostVisual;
      boostAudio = up2.boostAudio;
    }
  }
  if (extraLoadout && typeof extraLoadout === 'object') {
    if (extraLoadout.paintFinish !== undefined)
      paintFinish = decodePaintFinishIndex(extraLoadout.paintFinish);
    if (extraLoadout.boostVisual !== undefined)
      boostVisual = decodeBoostVisualIndex(extraLoadout.boostVisual);
    if (extraLoadout.boostAudio !== undefined)
      boostAudio = decodeBoostAudioIndex(extraLoadout.boostAudio);
  }

  return {
    patch: {
      visualId,
      visualIndex,
      hitboxId,
      hitboxIndex,
      colorSlot,
      blueColorSlot,
      orangeColorSlot,
      colorHex: resolveColorHexForSlot(colorSlot, player.team),
      paintFinish,
      boostVisual,
      boostAudio,
    },
    packedLoadout: packLoadoutSignalParam2(visualIndex, colorSlot, hitboxIndex, {
      paintFinish,
      boostVisual,
      boostAudio,
    }),
  };
}

export function computeNormalizedTeamSpawnSlots(players: Iterable<MatchPlayerSlot>): void {
  const usedByTeam: [Set<number>, Set<number>] = [new Set(), new Set()];
  const ordered = Array.from(players)
    .filter((p) => p && typeof p.entityId === 'number' && p.entityId >= 0)
    .sort((a, b) => a.entityId - b.entityId);
  for (const p of ordered) {
    const used = usedByTeam[p.team === 1 ? 1 : 0];
    let slot =
      typeof p.spawnSlot === 'number' && p.spawnSlot >= 0
        ? p.spawnSlot % KICKOFF_SPAWN_PRESETS.length
        : 0;
    if (used.has(slot)) {
      slot = 0;
      while (used.has(slot) && slot < KICKOFF_SPAWN_PRESETS.length) slot++;
      slot %= KICKOFF_SPAWN_PRESETS.length;
    }
    used.add(slot);
    p.spawnSlot = slot;
  }
}

export function buildKickoffCarStateArray(
  c: { x: number; y: number; z: number; yaw: number },
  boostAmount: number
): Float32Array {
  const cy = Math.cos(c.yaw),
    sy = Math.sin(c.yaw),
    s = new Float32Array(CAR_STATE_STRIDE);
  s[CAR_STATE_OFFSETS.POS] = c.x;
  s[CAR_STATE_OFFSETS.POS + 1] = c.y;
  s[CAR_STATE_OFFSETS.POS + 2] = c.z;
  s[CAR_STATE_OFFSETS.FWD] = cy;
  s[CAR_STATE_OFFSETS.FWD + 1] = sy;
  s[CAR_STATE_OFFSETS.FWD + 2] = 0;
  s[CAR_STATE_OFFSETS.RIGHT] = -sy;
  s[CAR_STATE_OFFSETS.RIGHT + 1] = cy;
  s[CAR_STATE_OFFSETS.RIGHT + 2] = 0;
  s[CAR_STATE_OFFSETS.UP] = 0;
  s[CAR_STATE_OFFSETS.UP + 1] = 0;
  s[CAR_STATE_OFFSETS.UP + 2] = 1;
  s[CAR_STATE_OFFSETS.BOOST] = boostAmount;
  s[CAR_STATE_OFFSETS.ON_GROUND] = 1;
  s[CAR_STATE_OFFSETS.HAS_FLIP_OR_JUMP] = 1;
  return s;
}

export function buildSpawnPresetCarState(
  spawnSlot: number,
  team: number,
  boostAmount: number
): Float32Array | null {
  const preset = KICKOFF_SPAWN_PRESETS[spawnSlot] || KICKOFF_SPAWN_PRESETS[0];
  const coord = team === 0 ? preset.team0 : preset.team1;
  return coord ? buildKickoffCarStateArray(coord, boostAmount) : null;
}

export function applyKickoffSpawnsToSim(
  sim: SimSpawnPort | null | undefined,
  activeCarIndices: Set<number> | null | undefined,
  players: Iterable<MatchPlayerSlot>,
  boostAmount: number
): void {
  computeNormalizedTeamSpawnSlots(players);
  if (!sim || typeof sim.setCarState !== 'function') return;
  for (const p of players) {
    if (typeof p.entityId !== 'number' || p.entityId < 0) continue;
    if (
      activeCarIndices instanceof Set &&
      activeCarIndices.size > 0 &&
      !activeCarIndices.has(p.entityId)
    )
      continue;
    sim.setCarTeam?.(p.entityId, p.team ?? 0);
    const carState = buildSpawnPresetCarState(p.spawnSlot, p.team ?? 0, boostAmount);
    if (carState) sim.setCarState(p.entityId, carState);
  }
}

export function collectSessionUserRtt(
  sm: RosterSessionManagerPort | null | undefined
): UserRttSummary {
  const players: Array<number | null> = [null, null, null, null, null, null];
  const spectators: Array<{ id: number; rtt: number }> = [];
  if (!sm || typeof sm.getAllSessions !== 'function') return { players, spectators };
  for (const s of sm.getAllSessions()) {
    if (s.role === 'player' && s.entityId >= 0 && s.entityId < 6) {
      players[s.entityId] = Math.round(s.rttMs || 0);
    } else if (s.role === 'spectator') {
      spectators.push({ id: spectators.length, rtt: Math.round(s.rttMs || 0) });
    }
  }
  return { players, spectators };
}
