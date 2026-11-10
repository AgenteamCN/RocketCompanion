/**
 * replayDirectorCarRosterPipeline.ts
 * Pure & runtime-bridged pipeline for capturing, normalizing, serializing, and restoring
 * per-car vehicle models (visualId), collision hitboxes (hitboxId), team assignments,
 * and cosmetic loadouts across Goal Replay Director sessions, exports (.rcgr.gz / .csv / .json),
 * and 3D Arena Previews.
 */

import { MAX_CARS, SIM_OFFSETS, CAR_STATE_STRIDE } from '../physics/RocketSimConstants.ts';
import {
  normalizeVisualId,
  resolveVehicleHitboxId,
  decodeHitboxIndex,
  getCarColorSlotById,
} from '../ui-core/config/vehicleConstants.ts';
import type { ReplayCarRosterEntry } from './replayDirectorStateTypes.ts';

export interface NormalizedReplayDirectorCarEntry extends ReplayCarRosterEntry {
  [key: string]: unknown;
  carIndex: number;
  name: string;
  username: string;
  team: 0 | 1;
  isBot: boolean;
  isLocalPlayer: boolean;
  botType: string | null;
  visualId: string;
  hitboxId: string;
  colorSlot: number;
  colorHex: string | null;
  paintFinish: string;
  boostVisual: string;
  boostAudio: string;
  anthemId: string;
}

export interface RawReplayCarEntryLike {
  carIndex?: number;
  entityId?: number;
  team?: number | string;
  name?: string;
  username?: string;
  isBot?: boolean;
  isLocalPlayer?: boolean;
  isPlayer?: boolean;
  isSelf?: boolean;
  isLocal?: boolean;
  botType?: string | null;
  visualId?: string;
  visual?: string;
  preset?: string;
  hitboxId?: string | null;
  hitboxIndex?: number;
  colorSlot?: number;
  colorHex?: string | null;
  paintFinish?: string | null;
  boostVisual?: string | null;
  boostAudio?: string | null;
  anthemId?: string | null;
}

export interface ReplayDirectorRosterRuntimePort {
  playerCarIndex?: number;
  selectedPreset?: string;
  selectedHitbox?: string;
  selectedColorSlot?: number | null;
  activeBotName?: string;
  physics?: {
    state?: Float32Array | null;
    numCars?: number;
    _carSpecs?: Array<{ team?: number; hitboxIndex?: number } | null | undefined>;
    isCarSlotActive?: (carIndex: number) => boolean;
    removeCar?: (carIndex: number) => void;
    addCarAtSlot?: (carIndex: number, team: number, hitboxId: string) => void;
    addCar?: (team: number, hitboxId: string) => void;
    setCarTeam?: (carIndex: number, team: number) => void;
    setCarHitbox?: (carIndex: number, hitboxId: string) => void;
  } | null;
  arena?: {
    carVisual?: string;
    vehiclePresets?: ArrayLike<string | null | undefined>;
    carTeams?: ArrayLike<number | null | undefined>;
    carColors?: ArrayLike<string | number | null | undefined>;
    carPaintFinishes?: ArrayLike<string | null | undefined>;
    carBoostVisuals?: ArrayLike<string | null | undefined>;
    carBoostAudios?: ArrayLike<string | null | undefined>;
    cars?: ArrayLike<{ visible?: boolean } | null | undefined>;
    ensureOpponent?: () => void;
    ensureCar?: (carIndex: number, team: number, visualId: string) => void;
    swapCarVisual?: (carIndex: number, visualId: string) => void;
    setCarTeam?: (carIndex: number, team: number) => void;
    setCarColor?: (carIndex: number, hex: string) => void;
    setCarLoadout?: (carIndex: number, loadout: Record<string, unknown>) => void;
  } | null;
  options?: {
    gameAudio?: {
      setCarBoostAudioVariation?: (carIndex: number, variation: string) => void;
    } | null;
  } | null;
  audioSubsystem?: {
    gameAudio?: {
      setCarBoostAudioVariation?: (carIndex: number, variation: string) => void;
    } | null;
    resetAudio?: () => void;
  } | null;
  networkManager?: {
    rosterSyncCoordinator?: {
      lastRosterSnapshot?: { players?: RawReplayCarEntryLike[] } | null;
    } | null;
  } | null;
  authoritativeServer?: {
    lastRoomState?:
      | { roster?: { players?: RawReplayCarEntryLike[] } | RawReplayCarEntryLike[] | null }
      | Record<string, unknown>
      | null;
    fallbackManager?: { domain?: { players?: Map<unknown, RawReplayCarEntryLike> } | null } | null;
  } | null;
  replayTimelineController?: {
    sessionState?: {
      carEntries?: RawReplayCarEntryLike[] | null;
      importedCarEntries?: RawReplayCarEntryLike[] | null;
    } | null;
  } | null;
}

export type ReplayCarEntryRuntimePort = ReplayDirectorRosterRuntimePort;

export interface CaptureReplayCarEntriesOptions {
  numCars?: number;
  frameBuffer?: ArrayLike<number> | null;
  explicitEntries?: ReadonlyArray<RawReplayCarEntryLike> | null;
  defaultTeam?: number;
}

function toHexColorString(colorVal: unknown): string | null {
  if (typeof colorVal === 'string' && colorVal.trim().length > 0) {
    const trimmed = colorVal.trim();
    return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  }
  if (typeof colorVal === 'number' && Number.isFinite(colorVal) && colorVal >= 0) {
    return `#${(Math.trunc(colorVal) & 0xffffff).toString(16).padStart(6, '0')}`;
  }
  return null;
}

function indexEntriesByCar(
  list: ReadonlyArray<RawReplayCarEntryLike> | unknown
): Map<number, RawReplayCarEntryLike> {
  const map = new Map<number, RawReplayCarEntryLike>();
  if (!Array.isArray(list)) return map;
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const cIdx = typeof item.carIndex === 'number' ? item.carIndex : item.entityId;
    if (typeof cIdx === 'number' && cIdx >= 0 && cIdx < MAX_CARS) map.set(cIdx, item);
  }
  return map;
}

export function normalizeReplayDirectorCarEntry(
  raw: RawReplayCarEntryLike | null | undefined,
  fallbackIndex = 0,
  fallbackTeam?: number | string
): NormalizedReplayDirectorCarEntry {
  const carIndex =
    typeof raw?.carIndex === 'number' && raw.carIndex >= 0
      ? raw.carIndex
      : typeof raw?.entityId === 'number' && raw.entityId >= 0
        ? raw.entityId
        : fallbackIndex;
  const rawTeam = raw?.team;
  const team: 0 | 1 =
    rawTeam === 1 || rawTeam === 'orange'
      ? 1
      : rawTeam === 0 || rawTeam === 'blue'
        ? 0
        : typeof fallbackTeam === 'number'
          ? fallbackTeam === 1
            ? 1
            : 0
          : ((carIndex % 2) as 0 | 1);

  const isLocalPlayer = Boolean(
    raw?.isLocalPlayer ??
    raw?.isPlayer ??
    raw?.isSelf ??
    raw?.isLocal ??
    (carIndex === 0 && !raw?.isBot)
  );
  const isBot =
    raw?.isBot !== undefined
      ? Boolean(raw.isBot)
      : raw?.isPlayer !== undefined || raw?.isSelf !== undefined
        ? !isLocalPlayer
        : carIndex !== 0;

  const visualId = normalizeVisualId(raw?.visualId || raw?.visual || raw?.preset || 'fennec');
  const hitboxId =
    typeof raw?.hitboxId === 'string' && raw.hitboxId.length > 0
      ? resolveVehicleHitboxId(raw.hitboxId)
      : typeof raw?.hitboxIndex === 'number'
        ? decodeHitboxIndex(raw.hitboxIndex)
        : resolveVehicleHitboxId(visualId);

  const colorSlot =
    typeof raw?.colorSlot === 'number' && Number.isFinite(raw.colorSlot)
      ? raw.colorSlot
      : team === 0
        ? 3
        : 0;
  const colorHex = toHexColorString(raw?.colorHex) || getCarColorSlotById(colorSlot)?.hex || null;
  const paintFinish =
    raw?.paintFinish === 'matte' || raw?.paintFinish === 'metallic' ? raw.paintFinish : 'metallic';
  const boostVisual =
    raw?.boostVisual === 'cartoon' || raw?.boostVisual === 'gold-rush'
      ? raw.boostVisual
      : 'cartoon';
  const boostAudio =
    typeof raw?.boostAudio === 'string' && raw.boostAudio.length > 0 ? raw.boostAudio : 'standard';
  const anthemId =
    typeof raw?.anthemId === 'string' && raw.anthemId.length > 0 ? raw.anthemId : 'none';
  const botType = typeof raw?.botType === 'string' && raw.botType.length > 0 ? raw.botType : null;
  const resolvedName = raw?.name || raw?.username || (isLocalPlayer ? 'Player' : `Car ${carIndex}`);

  return {
    carIndex,
    name: String(resolvedName),
    username: String(raw?.username || resolvedName),
    team,
    isBot,
    isLocalPlayer,
    botType,
    visualId,
    hitboxId,
    colorSlot,
    colorHex,
    paintFinish,
    boostVisual,
    boostAudio,
    anthemId,
  };
}

export function captureRuntimeReplayCarEntries(
  runtime: ReplayDirectorRosterRuntimePort | null | undefined,
  options: CaptureReplayCarEntriesOptions = {}
): NormalizedReplayDirectorCarEntry[] {
  const frameBuffer = options.frameBuffer || runtime?.physics?.state || null;
  const headerCars = frameBuffer
    ? Math.min(MAX_CARS, Math.max(0, Math.round(frameBuffer[SIM_OFFSETS.NUM_CARS] || 0)))
    : 0;
  const numCars = Math.min(
    MAX_CARS,
    Math.max(
      1,
      options.numCars ||
        headerCars ||
        runtime?.physics?.numCars ||
        (Array.isArray(options.explicitEntries) ? options.explicitEntries.length : 0) ||
        1
    )
  );

  const explicitByCar = indexEntriesByCar(options.explicitEntries);
  const rawRoster =
    runtime?.networkManager?.rosterSyncCoordinator?.lastRosterSnapshot?.players ||
    runtime?.networkManager?.rosterSyncCoordinator?.lastRosterSnapshot ||
    (
      runtime?.authoritativeServer?.lastRoomState as
        | { roster?: { players?: RawReplayCarEntryLike[] } | RawReplayCarEntryLike[] }
        | null
        | undefined
    )?.roster ||
    null;
  const rosterByCar = indexEntriesByCar(rawRoster);
  const serverPlayers = runtime?.authoritativeServer?.fallbackManager?.domain?.players;
  if (serverPlayers instanceof Map) {
    for (const p of serverPlayers.values()) {
      if (p && typeof p.entityId === 'number' && p.entityId >= 0 && !rosterByCar.has(p.entityId)) {
        rosterByCar.set(p.entityId, p);
      }
    }
  }

  const ntByCar = indexEntriesByCar(
    runtime?.replayTimelineController?.sessionState?.carEntries ||
      runtime?.replayTimelineController?.sessionState?.importedCarEntries
  );
  const playerCarIndex = typeof runtime?.playerCarIndex === 'number' ? runtime.playerCarIndex : 0;
  const entries: NormalizedReplayDirectorCarEntry[] = [];

  for (let c = 0; c < numCars; c++) {
    const exp = explicitByCar.get(c) || null;
    const ros = rosterByCar.get(c) || null;
    const nt = ntByCar.get(c) || null;
    const spec = runtime?.physics?._carSpecs?.[c] || null;
    const arena = runtime?.arena;
    const arenaTeam = arena?.carTeams?.[c];
    const initY =
      frameBuffer && frameBuffer.length >= SIM_OFFSETS.CARS + c * CAR_STATE_STRIDE + 3
        ? frameBuffer[SIM_OFFSETS.CARS + c * CAR_STATE_STRIDE + 1] || 0
        : 0;

    const fallbackTeam: 0 | 1 =
      typeof arenaTeam === 'number'
        ? arenaTeam === 1
          ? 1
          : 0
        : typeof spec?.team === 'number'
          ? spec.team === 1
            ? 1
            : 0
          : c === playerCarIndex && typeof options.defaultTeam === 'number'
            ? options.defaultTeam === 1
              ? 1
              : 0
            : Math.abs(initY) > 50
              ? initY > 0
                ? 1
                : 0
              : ((c % 2) as 0 | 1);

    const isLocal = c === playerCarIndex;
    const specHitbox =
      typeof spec?.hitboxIndex === 'number' ? decodeHitboxIndex(spec.hitboxIndex) : null;
    const liveVisual =
      arena?.vehiclePresets?.[c] ||
      (isLocal ? runtime?.selectedPreset || arena?.carVisual : null) ||
      null;
    const rawVisual =
      exp?.visualId || ros?.visualId || liveVisual || nt?.visualId || specHitbox || 'fennec';
    const liveHitbox =
      (isLocal && runtime?.selectedHitbox ? runtime.selectedHitbox : null) ||
      specHitbox ||
      (liveVisual ? resolveVehicleHitboxId(liveVisual) : null);
    const rawHitbox =
      exp?.hitboxId ||
      ros?.hitboxId ||
      liveHitbox ||
      nt?.hitboxId ||
      resolveVehicleHitboxId(rawVisual);

    const merged: RawReplayCarEntryLike = {
      ...nt,
      ...ros,
      ...exp,
      carIndex: c,
      team: exp?.team ?? ros?.team ?? fallbackTeam ?? nt?.team,
      name:
        exp?.name ||
        ros?.name ||
        ros?.username ||
        nt?.name ||
        nt?.username ||
        (isLocal
          ? 'Player'
          : c === 1 && runtime?.activeBotName
            ? runtime.activeBotName
            : `Car ${c}`),
      isLocalPlayer: exp?.isLocalPlayer ?? ros?.isSelf ?? nt?.isLocalPlayer ?? isLocal,
      isBot: exp?.isBot ?? (ros ? Boolean(ros.isBot) : (nt?.isBot ?? !isLocal)),
      visualId: rawVisual,
      hitboxId: rawHitbox,
      colorSlot:
        exp?.colorSlot ??
        ros?.colorSlot ??
        (isLocal && typeof runtime?.selectedColorSlot === 'number'
          ? runtime.selectedColorSlot
          : undefined) ??
        nt?.colorSlot,
      colorHex:
        exp?.colorHex || ros?.colorHex || toHexColorString(arena?.carColors?.[c]) || nt?.colorHex,
      paintFinish:
        exp?.paintFinish ||
        ros?.paintFinish ||
        arena?.carPaintFinishes?.[c] ||
        nt?.paintFinish ||
        'metallic',
      boostVisual:
        exp?.boostVisual ||
        ros?.boostVisual ||
        arena?.carBoostVisuals?.[c] ||
        nt?.boostVisual ||
        'cartoon',
      boostAudio:
        exp?.boostAudio ||
        ros?.boostAudio ||
        arena?.carBoostAudios?.[c] ||
        nt?.boostAudio ||
        'standard',
      anthemId: exp?.anthemId || ros?.anthemId || nt?.anthemId || 'none',
    };

    entries.push(normalizeReplayDirectorCarEntry(merged, c, fallbackTeam));
  }

  return entries;
}

export function applyReplayCarEntriesToRuntime(
  runtime: ReplayDirectorRosterRuntimePort | null | undefined,
  carEntries: ReadonlyArray<ReplayCarRosterEntry> | null | undefined,
  numCars: number,
  frameBuffer?: ArrayLike<number> | null
): NormalizedReplayDirectorCarEntry[] {
  const safeNumCars = Math.min(MAX_CARS, Math.max(1, numCars || 1));
  const entryMap = indexEntriesByCar(carEntries);
  const normalizedEntries: NormalizedReplayDirectorCarEntry[] = [];

  for (let c = 0; c < safeNumCars; c++) {
    let fallbackTeam = c % 2;
    if (frameBuffer && frameBuffer.length >= SIM_OFFSETS.CARS + c * CAR_STATE_STRIDE + 3) {
      const y = frameBuffer[SIM_OFFSETS.CARS + c * CAR_STATE_STRIDE + 1] || 0;
      if (Math.abs(y) > 50) fallbackTeam = y > 0 ? 1 : 0;
    }
    normalizedEntries.push(
      normalizeReplayDirectorCarEntry(entryMap.get(c) || null, c, fallbackTeam)
    );
  }

  const sim = runtime?.physics;
  if (sim) {
    for (let c = MAX_CARS - 1; c >= safeNumCars; c--) {
      if (sim.isCarSlotActive?.(c)) sim.removeCar?.(c);
    }
    for (const e of normalizedEntries) {
      if (typeof sim.addCarAtSlot === 'function') {
        sim.addCarAtSlot(e.carIndex, e.team, e.hitboxId);
      } else {
        while ((sim.numCars ?? 0) <= e.carIndex && typeof sim.addCar === 'function') {
          sim.addCar(e.team, e.hitboxId);
        }
        sim.setCarTeam?.(e.carIndex, e.team);
        sim.setCarHitbox?.(e.carIndex, e.hitboxId);
      }
    }
  }

  const arena = runtime?.arena;
  const audio = runtime?.options?.gameAudio || runtime?.audioSubsystem?.gameAudio || null;
  if (arena) {
    if (safeNumCars > 1) arena.ensureOpponent?.();
    for (const e of normalizedEntries) {
      arena.ensureCar?.(e.carIndex, e.team, e.visualId);
      if (arena.vehiclePresets?.[e.carIndex] !== e.visualId)
        arena.swapCarVisual?.(e.carIndex, e.visualId);
      arena.setCarTeam?.(e.carIndex, e.team);
      if (e.colorHex) arena.setCarColor?.(e.carIndex, e.colorHex);
      arena.setCarLoadout?.(e.carIndex, {
        visualId: e.visualId,
        name: e.name,
        colorHex: e.colorHex,
        paintFinish: e.paintFinish,
        boostVisual: e.boostVisual,
        boostAudio: e.boostAudio,
      });
      audio?.setCarBoostAudioVariation?.(e.carIndex, e.boostAudio);
      const carMesh = arena.cars?.[e.carIndex];
      if (carMesh) carMesh.visible = true;
    }
    if (Array.isArray(arena.cars)) {
      for (let c = safeNumCars; c < arena.cars.length; c++) {
        const extraMesh = arena.cars[c];
        if (extraMesh) extraMesh.visible = false;
      }
    }
  }

  return normalizedEntries;
}
