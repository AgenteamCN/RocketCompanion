/**
 * src/network/server/match/matchRosterPhysicsAndBotPipeline.ts
 * Pure data pipelines and narrow-interface helpers for player slot creation,
 * bot loadout rolling, bot fill policy execution, and roster car physics sync.
 */

import { KICKOFF_SPAWN_PRESETS } from '../../../physics/RocketSimConstants.ts';
import { MATCH_SIGNALS } from '../../protocol/GlobalPayloadCodec.ts';
import {
  encodeVisualIdIndex,
  resolveHitboxIndex,
  packLoadoutSignalParam2,
} from '../../../ui-core/config/vehicleConstants.ts';
import { rollRandomBotLoadout } from '../../../ui-core/config/botsLoadoutConfig.ts';
import {
  MATCH_STATES,
  isColorSlotValidForTeam,
  resolveTeamMatchedColorSlot,
  resolveColorHexForSlot,
  buildSpawnPresetCarState,
  type MatchPlayerSlot,
  type NormalizedSlotLoadoutResult,
  type PlayerLoadoutOptions,
} from './matchLoadoutAndSpawnPipeline.ts';

export interface RosterPhysicsSimPort {
  removeCar?: (carIndex: number) => void;
  isCarSlotActive?: (carIndex: number) => boolean;
  getCarState?: (carIndex: number) => unknown;
  setCarState?: (carIndex: number, state: Float32Array) => void;
  setCarTeam?: (carIndex: number, team: number) => void;
}

export interface RosterPhysicsManagerPort {
  activeCarIndices: Iterable<number>;
  sim?: RosterPhysicsSimPort | null;
  lobbyGhostCoordinator?: { lobbyModeActive?: boolean } | null;
  registerCarEntity: (entityId: number, team: number, hitboxOrVisual: string) => void;
  unregisterCarEntity: (entityId: number) => void;
  applySignal: (type: string, payload: Record<string, unknown>) => void;
  syncLobbyGhostMasks?: () => void;
}

export interface RosterSessionPort {
  getSession?: (sessionId: string) =>
    | {
        team?: number;
        playerName?: string;
        deferPhysicsRegistration?: boolean;
      }
    | null
    | undefined;
  registerSession: (sessionId: string, config: Record<string, unknown>) => void;
  unregisterSession?: (sessionId: string) => void;
}

export type SignalDispatchFn = (type: number, frame: number, p1?: number, p2?: number) => unknown;

export function createNewPlayerSlotInfo(
  sessionId: string,
  playerName: string,
  preferredTeam: number | null,
  currentPlayers: Iterable<MatchPlayerSlot>,
  r: NormalizedSlotLoadoutResult,
  isBotSession: boolean
): MatchPlayerSlot {
  const nl = r.normalizedLoadout;
  let t0 = 0,
    t1 = 0;
  const occ0 = new Set<number>(),
    occ1 = new Set<number>(),
    usedIds = new Set<number>();
  for (const p of currentPlayers) {
    usedIds.add(p.entityId);
    if (p.team === 0) {
      t0++;
      occ0.add(p.spawnSlot);
    } else {
      t1++;
      occ1.add(p.spawnSlot);
    }
  }
  let team = preferredTeam;
  if (team === 0 && t0 >= 5 && t1 < 5) team = 1;
  else if (team === 1 && t1 >= 5 && t0 < 5) team = 0;
  else if (team !== 0 && team !== 1) team = t0 <= t1 ? 0 : 1;

  let spawnSlot = 0;
  const targetOcc = team === 0 ? occ0 : occ1;
  while (targetOcc.has(spawnSlot) && spawnSlot < KICKOFF_SPAWN_PRESETS.length) spawnSlot++;

  let entityId = -1;
  for (let i = 0; i < 6; i++)
    if (!usedIds.has(i)) {
      entityId = i;
      break;
    }

  const blueSlot = isColorSlotValidForTeam(nl.blueColorSlot, 0)
    ? nl.blueColorSlot!
    : isColorSlotValidForTeam(nl.colorSlot, 0)
      ? nl.colorSlot!
      : null;
  const orangeSlot = isColorSlotValidForTeam(nl.orangeColorSlot, 1)
    ? nl.orangeColorSlot!
    : isColorSlotValidForTeam(nl.colorSlot, 1)
      ? nl.colorSlot!
      : null;
  const colorSlot = resolveTeamMatchedColorSlot(nl.colorSlot, team, blueSlot, orangeSlot);
  const ready = isBotSession || sessionId === 'host';

  return {
    sessionId,
    entityId,
    carIndex: entityId,
    team,
    name: playerName,
    role: 'player',
    spawnSlot,
    visualId: r.requestedVisual,
    visualIndex: encodeVisualIdIndex(r.requestedVisual),
    hitboxId: r.requestedHitboxId,
    hitboxIndex: r.requestedHitboxIndex,
    colorSlot,
    blueColorSlot: team === 0 ? colorSlot : blueSlot,
    orangeColorSlot: team === 1 ? colorSlot : orangeSlot,
    colorHex: resolveColorHexForSlot(colorSlot, team),
    paintFinish: r.requestedPaintFinish,
    boostVisual: r.requestedBoostVisual,
    boostAudio: r.requestedBoostAudio,
    anthemId: r.requestedAnthemId,
    ready,
    arenaLoaded: ready,
    isBot: isBotSession,
    botType: isBotSession ? nl.botType || 'nexto' : nl.botType,
  };
}

export function rollTeamBotLoadout(
  botsLoadoutConfig: Record<string, unknown> | null | undefined,
  players: Iterable<MatchPlayerSlot>,
  team = 0
): PlayerLoadoutOptions {
  const teamNum = team === 1 ? 1 : 0;
  const usedColorSlots = new Set<number>();
  for (const p of players) {
    if ((p.team === 1 ? 1 : 0) === teamNum && typeof p.colorSlot === 'number')
      usedColorSlots.add(p.colorSlot);
  }
  return rollRandomBotLoadout(
    botsLoadoutConfig as never,
    teamNum,
    usedColorSlots
  ) as PlayerLoadoutOptions;
}

export function syncRosterCarsWithPhysicsEngine(params: {
  players: Map<string, MatchPlayerSlot>;
  physicsManager: RosterPhysicsManagerPort | null | undefined;
  sessionManager: RosterSessionPort | null | undefined;
  lobbyPhysicsActive: boolean;
}): void {
  const { players, physicsManager, sessionManager, lobbyPhysicsActive } = params;
  if (!physicsManager) return;
  const rosterEntityIds = new Set<number>();
  for (const [sid, p] of players.entries()) {
    if (typeof p.entityId !== 'number' || p.entityId < 0) continue;
    rosterEntityIds.add(p.entityId);
    const session = sessionManager?.getSession?.(sid);
    if (session) session.deferPhysicsRegistration = false;
    const hb = p.hitboxId || p.visualId || 'octane';
    physicsManager.registerCarEntity(p.entityId, p.team === 1 ? 1 : 0, hb);
    physicsManager.applySignal('HOTSWAP_HITBOX', { carIndex: p.entityId, hitboxType: hb });
  }
  if (!lobbyPhysicsActive) {
    for (const activeIdx of Array.from(physicsManager.activeCarIndices)) {
      if (!rosterEntityIds.has(activeIdx)) physicsManager.unregisterCarEntity(activeIdx);
    }
    const sim = physicsManager.sim;
    if (sim && typeof sim.removeCar === 'function') {
      for (let slot = 0; slot < 8; slot++) {
        if (sim.isCarSlotActive?.(slot) && !rosterEntityIds.has(slot))
          physicsManager.unregisterCarEntity(slot);
      }
    }
  }
}

export function registerAssignedPlayerWithSessionAndPhysics(params: {
  sessionId: string;
  playerInfo: MatchPlayerSlot;
  state: string;
  lobbyMode: boolean;
  isTrainingMode: boolean;
  matchTick: number;
  sessionManager: RosterSessionPort | null | undefined;
  physicsManager: RosterPhysicsManagerPort | null | undefined;
  dispatchSignal: SignalDispatchFn;
}): void {
  const {
    sessionId,
    playerInfo: p,
    state,
    lobbyMode,
    isTrainingMode,
    matchTick,
    sessionManager,
    physicsManager,
    dispatchSignal,
  } = params;
  const deferLobbyPhysics =
    state === MATCH_STATES.LOBBY && Boolean(lobbyMode || isTrainingMode) && sessionId !== 'host';
  sessionManager?.registerSession(sessionId, {
    role: 'player',
    entityId: p.entityId,
    team: p.team,
    visualId: p.visualId,
    hitboxId: p.hitboxId,
    deferPhysicsRegistration: deferLobbyPhysics,
    playerName: p.name,
  });

  if (!deferLobbyPhysics && physicsManager && p.entityId >= 0) {
    physicsManager.registerCarEntity(p.entityId, p.team, p.hitboxId);
    physicsManager.applySignal('HOTSWAP_HITBOX', { carIndex: p.entityId, hitboxType: p.hitboxId });
    if (typeof physicsManager.sim?.getCarState === 'function') {
      const carState = buildSpawnPresetCarState(
        p.spawnSlot,
        p.team,
        state === MATCH_STATES.LOBBY || isTrainingMode ? 100.0 : 33.33
      );
      if (carState) physicsManager.sim.setCarState?.(p.entityId, carState);
    }
    if (state === MATCH_STATES.LOBBY && physicsManager.lobbyGhostCoordinator?.lobbyModeActive) {
      physicsManager.syncLobbyGhostMasks?.();
    }
  }

  dispatchSignal(MATCH_SIGNALS.PLAYER_JOINED, matchTick, p.entityId, p.team);
  dispatchSignal(
    MATCH_SIGNALS.PLAYER_LOADOUT_UPDATED,
    matchTick,
    p.entityId,
    packLoadoutSignalParam2(p.visualIndex, p.colorSlot, p.hitboxIndex, {
      paintFinish: p.paintFinish,
      boostVisual: p.boostVisual,
      boostAudio: p.boostAudio,
    })
  );
}

function findNextTeamSpawnSlot(
  players: Map<string, MatchPlayerSlot>,
  excludeSid: string,
  team: number
): number {
  const occupied = new Set<number>();
  for (const [sid, p] of players.entries()) {
    if (sid !== excludeSid && (p.team === 1 ? 1 : 0) === (team === 1 ? 1 : 0))
      occupied.add(p.spawnSlot);
  }
  let slot = 0;
  while (occupied.has(slot) && slot < KICKOFF_SPAWN_PRESETS.length) slot++;
  return slot;
}

export function resolveLobbyExistingPlayerTeamSwitchPatch(params: {
  sessionId: string;
  existing: MatchPlayerSlot;
  preferredTeam: number;
  requestedColorSlot?: number | null;
  players: Map<string, MatchPlayerSlot>;
  sessionManager: RosterSessionPort | null | undefined;
  physicsManager: RosterPhysicsManagerPort | null | undefined;
}): Partial<MatchPlayerSlot> {
  const {
    sessionId,
    existing,
    preferredTeam,
    requestedColorSlot,
    players,
    sessionManager,
    physicsManager,
  } = params;
  const nextSpawnSlot =
    findNextTeamSpawnSlot(players, sessionId, preferredTeam) % KICKOFF_SPAWN_PRESETS.length;
  const resolvedColorSlot = resolveTeamMatchedColorSlot(
    requestedColorSlot ?? existing.colorSlot,
    preferredTeam,
    existing.blueColorSlot,
    existing.orangeColorSlot
  );
  const s = sessionManager?.getSession?.(sessionId);
  if (s) s.team = preferredTeam;
  if (physicsManager?.sim && typeof existing.entityId === 'number' && existing.entityId >= 0) {
    physicsManager.sim.setCarTeam?.(existing.entityId, preferredTeam);
  }
  return {
    team: preferredTeam,
    spawnSlot: nextSpawnSlot,
    colorSlot: resolvedColorSlot,
    colorHex: resolveColorHexForSlot(resolvedColorSlot, preferredTeam),
  };
}

export function resolveInPlacePlayerTeamSwitchPatch(params: {
  sessionId: string;
  currentPlayer: MatchPlayerSlot;
  targetTeam: number;
  players: Map<string, MatchPlayerSlot>;
  state: string;
  isTrainingMode: boolean;
  matchTick: number;
  sessionManager: RosterSessionPort | null | undefined;
  physicsManager: RosterPhysicsManagerPort | null | undefined;
  dispatchSignal: SignalDispatchFn;
}): Partial<MatchPlayerSlot> {
  const {
    sessionId,
    currentPlayer: p,
    targetTeam,
    players,
    state,
    isTrainingMode,
    matchTick,
    sessionManager,
    physicsManager,
    dispatchSignal,
  } = params;
  const spawnSlot = findNextTeamSpawnSlot(players, sessionId, targetTeam);
  let resolvedColorSlot = p.colorSlot;
  const patch: Partial<MatchPlayerSlot> = {
    team: targetTeam,
    preferredTeam: targetTeam,
    spawnSlot,
  };
  if (targetTeam === 0 || targetTeam === 1) {
    resolvedColorSlot = resolveTeamMatchedColorSlot(
      null,
      targetTeam,
      p.blueColorSlot,
      p.orangeColorSlot
    );
    patch.colorSlot = resolvedColorSlot;
    patch.colorHex = resolveColorHexForSlot(resolvedColorSlot, targetTeam);
  }
  const s = sessionManager?.getSession?.(sessionId);
  if (s) s.team = targetTeam;

  if (
    state !== MATCH_STATES.LOBBY &&
    physicsManager?.sim &&
    (targetTeam === 0 || targetTeam === 1)
  ) {
    physicsManager.sim.setCarTeam?.(p.entityId, targetTeam);
    if (state === MATCH_STATES.KICKOFF && typeof physicsManager.sim.setCarState === 'function') {
      const carState = buildSpawnPresetCarState(
        spawnSlot,
        targetTeam,
        isTrainingMode ? 100.0 : 33.33
      );
      if (carState) physicsManager.sim.setCarState(p.entityId, carState);
    }
  }

  dispatchSignal(
    MATCH_SIGNALS.PLAYER_LOADOUT_UPDATED,
    matchTick,
    p.entityId,
    packLoadoutSignalParam2(
      p.visualIndex ?? encodeVisualIdIndex(p.visualId || 'octane'),
      resolvedColorSlot,
      p.hitboxIndex ?? resolveHitboxIndex(p.hitboxId || p.visualId || 'octane'),
      {
        paintFinish: p.paintFinish || 'metallic',
        boostVisual: p.boostVisual || 'light-wave',
        boostAudio: p.boostAudio || 'rush',
      }
    )
  );
  return patch;
}

export function executeBotFillPolicyOnRoster(params: {
  players: Map<string, MatchPlayerSlot>;
  botFillMode: string;
  maxPlayers: number;
  defaultBotType?: string;
  botsLoadoutConfig: Record<string, unknown> | null | undefined;
  removePlayerSession: (sid: string) => void;
  switchPlayerRoleOrTeam: (sid: string, role: string, team: number) => unknown;
  assignPlayerSlot: (
    sid: string,
    name: string,
    role: string,
    team: number,
    loadout: PlayerLoadoutOptions,
    colorSlot: number | null | undefined
  ) => unknown;
}): void {
  const {
    players,
    botFillMode,
    maxPlayers,
    defaultBotType = 'nexto',
    botsLoadoutConfig,
    removePlayerSession,
    switchPlayerRoleOrTeam,
    assignPlayerSlot,
  } = params;
  const maxPerTeam = Math.max(1, Math.floor(maxPlayers / 2));
  const botLabel = defaultBotType.charAt(0).toUpperCase() + defaultBotType.slice(1);

  for (const [sid, p] of Array.from(players.entries())) {
    if (p.isBot && String(sid).startsWith('bot_fill_')) removePlayerSession(sid);
  }

  let humanBlue = 0,
    humanOrange = 0;
  for (const p of players.values()) {
    if (!p.isBot) {
      if (p.team === 0) humanBlue++;
      else if (p.team === 1) humanOrange++;
    }
  }
  for (const [sid, p] of Array.from(players.entries())) {
    if (!p.isBot && (p.team === 2 || (p.team !== 0 && p.team !== 1))) {
      const resolvedTeam = botFillMode === 'bots_vs_humans' ? 0 : humanBlue <= humanOrange ? 0 : 1;
      if (resolvedTeam === 0) humanBlue++;
      else humanOrange++;
      switchPlayerRoleOrTeam(sid, 'player', resolvedTeam);
    }
  }

  if (botFillMode === 'no_bots') {
    for (const [sid, p] of Array.from(players.entries()))
      if (p.isBot && sid !== 'bot') removePlayerSession(sid);
    return;
  }
  if (botFillMode === 'custom') return;

  if (botFillMode === 'bots_vs_humans') {
    for (const [sid, p] of Array.from(players.entries()))
      if (!p.isBot && p.team !== 0) switchPlayerRoleOrTeam(sid, 'player', 0);
    let orangeCount = 0;
    for (const p of players.values()) if (p.team === 1) orangeCount++;
    let fillSeq = 1;
    while (orangeCount < maxPerTeam && players.size < maxPlayers) {
      const rolled = {
        ...rollTeamBotLoadout(botsLoadoutConfig, players.values(), 1),
        botType: defaultBotType,
      };
      assignPlayerSlot(
        `bot_fill_${fillSeq}`,
        `${botLabel} #${fillSeq}`,
        'player',
        1,
        rolled,
        rolled.colorSlot
      );
      fillSeq++;
      orangeCount++;
    }
    return;
  }

  if (botFillMode === 'auto_fill') {
    let blueCount = 0,
      orangeCount = 0;
    for (const p of players.values()) {
      if (p.team === 0) blueCount++;
      else if (p.team === 1) orangeCount++;
    }
    let fillSeq = 1;
    while (blueCount < maxPerTeam && players.size < maxPlayers) {
      const rolled = {
        ...rollTeamBotLoadout(botsLoadoutConfig, players.values(), 0),
        botType: defaultBotType,
      };
      assignPlayerSlot(
        `bot_fill_${fillSeq}`,
        `${botLabel} #${fillSeq}`,
        'player',
        0,
        rolled,
        rolled.colorSlot
      );
      fillSeq++;
      blueCount++;
    }
    while (orangeCount < maxPerTeam && players.size < maxPlayers) {
      const rolled = {
        ...rollTeamBotLoadout(botsLoadoutConfig, players.values(), 1),
        botType: defaultBotType,
      };
      assignPlayerSlot(
        `bot_fill_${fillSeq}`,
        `${botLabel} #${fillSeq}`,
        'player',
        1,
        rolled,
        rolled.colorSlot
      );
      fillSeq++;
      orangeCount++;
    }
  }
}
