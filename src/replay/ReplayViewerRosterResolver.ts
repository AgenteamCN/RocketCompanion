/**
 * ReplayViewerRosterResolver.ts
 * Pure replay roster extraction, team classification, loadout unpacking,
 * and slot key assignment for the Standalone Replay Viewer.
 */

import { SIM_OFFSETS, MAX_CARS, MATCH_SIGNALS } from '../physics/RocketSimConstants.ts';
import { assignTeamSlotKeys } from './container/RCReplayTimelineParser.ts';
import {
  unpackLoadoutSignalParam2,
  getCarColorSlotById,
  normalizeVisualId,
  resolveVehicleHitboxId,
} from '../ui-core/config/vehicleConstants.ts';

export interface ReplayRosterEntry {
  carIndex: number;
  team: number;
  name: string | null;
  botType: string | null;
  isSelf: boolean;
  visualId: string;
  hitboxId: string;
  colorSlot: number;
  colorHex: string;
  paintFinish: string;
  boostVisual: string;
  boostAudio: string;
  anthemId: string;
  slotKey: number;
}

export interface ReplayRosterMetaItem {
  carIndex?: number;
  entityId?: number;
  team?: number | string;
  visualId?: string;
  hitboxId?: string;
  colorSlot?: number;
  colorHex?: string;
  paintFinish?: string;
  boostVisual?: string;
  boostAudio?: string;
  anthemId?: string;
  isPlayer?: boolean;
  isSelf?: boolean;
  isLocal?: boolean;
  isLocalPlayer?: boolean;
  name?: string | null;
  username?: string | null;
  botType?: string | null;
  [key: string]: unknown;
}

export interface ReplayRosterSignalItem {
  signalType?: number;
  param1?: number;
  param2?: number;
  [key: string]: unknown;
}

export interface ReplayRosterMetadataLike {
  roster?: ReplayRosterMetaItem[];
  loadouts?: ReplayRosterMetaItem[];
  [key: string]: unknown;
}

export interface ReplayRosterExtractionInput {
  firstFrame?: Float32Array | null;
  metadata?: ReplayRosterMetadataLike | null;
  recordedSignals?: ReplayRosterSignalItem[] | null;
}

export interface ReplayRosterResolutionResult {
  resolvedRoster: ReplayRosterEntry[];
  localTeam: number;
  slotKeyToCarIndex: Record<number, number>;
  activePovCarIndex: number;
  activePovSlotKey: number;
  activePovTeam: number;
}

export function extractActiveCarIndicesFromReplayFrame(
  input: ReplayRosterExtractionInput | Float32Array | null | undefined
): number[] {
  const normalizedInput: ReplayRosterExtractionInput =
    input instanceof Float32Array ? { firstFrame: input } : input || {};
  const { firstFrame, metadata, recordedSignals } = normalizedInput;
  const indices = new Set<number>();

  const rawRoster = Array.isArray(metadata?.roster)
    ? metadata.roster
    : Array.isArray(metadata?.loadouts)
      ? metadata.loadouts
      : null;
  if (rawRoster) {
    for (const r of rawRoster) {
      const cIdx = typeof r?.carIndex === 'number' ? r.carIndex : r?.entityId;
      if (typeof cIdx === 'number' && cIdx >= 0 && cIdx < MAX_CARS) {
        indices.add(cIdx);
      }
    }
  }
  const hasExplicitRoster = indices.size > 0;

  if (Array.isArray(recordedSignals)) {
    for (const ev of recordedSignals) {
      if (
        ev.signalType === MATCH_SIGNALS.PLAYER_JOINED ||
        ev.signalType === MATCH_SIGNALS.PLAYER_LOADOUT_UPDATED
      ) {
        const cIdx = Number(ev.param1);
        if (Number.isInteger(cIdx) && cIdx >= 0 && cIdx < MAX_CARS) {
          indices.add(cIdx);
        }
      }
    }
  }

  if (firstFrame && !hasExplicitRoster) {
    for (let c = 0; c < MAX_CARS; c++) {
      const base = SIM_OFFSETS.CARS + c * 40;
      const posX = firstFrame[base + 0] || 0;
      const posY = firstFrame[base + 1] || 0;
      const posZ = firstFrame[base + 2] || 0;
      const demoed = firstFrame[base + 29] || 0;
      const fwdLen = Math.hypot(
        firstFrame[base + 3] || 0,
        firstFrame[base + 4] || 0,
        firstFrame[base + 5] || 0
      );
      const isParkedOrUnspawned =
        posZ < -100 || posX <= -5000 || (demoed >= 0.5 && Math.hypot(posX, posY, posZ) < 1e-3);
      if (fwdLen > 0.5 && !isParkedOrUnspawned) {
        indices.add(c);
      }
    }
    const rawNum = Math.max(
      1,
      Math.min(MAX_CARS, Math.round(firstFrame[SIM_OFFSETS.NUM_CARS] || 1))
    );
    if (indices.size < rawNum) {
      for (let c = 0; c < rawNum && indices.size < rawNum; c++) {
        indices.add(c);
      }
    }
  }

  if (indices.size === 0) {
    indices.add(0);
  }
  return Array.from(indices).sort((a, b) => a - b);
}

export function resolveReplayRosterData(
  input: ReplayRosterExtractionInput
): ReplayRosterResolutionResult {
  const { firstFrame, metadata, recordedSignals } = input;
  const activeCarIndices = extractActiveCarIndicesFromReplayFrame(input);

  const rosterByCar = new Map<number, ReplayRosterMetaItem>();
  const rawRoster = Array.isArray(metadata?.roster)
    ? metadata.roster
    : Array.isArray(metadata?.loadouts)
      ? metadata.loadouts
      : [];

  for (const item of rawRoster) {
    if (!item || typeof item !== 'object') continue;
    const cIdx =
      typeof item.carIndex === 'number'
        ? item.carIndex
        : typeof item.entityId === 'number'
          ? item.entityId
          : -1;
    if (cIdx >= 0 && cIdx < MAX_CARS) {
      rosterByCar.set(cIdx, item);
    }
  }

  const joinedTeamByCar = new Map<number, number>();
  const signalLoadoutByCar = new Map<number, ReturnType<typeof unpackLoadoutSignalParam2>>();
  if (Array.isArray(recordedSignals)) {
    for (const ev of recordedSignals) {
      const cIdx = Number(ev.param1);
      if (!Number.isInteger(cIdx) || cIdx < 0 || cIdx >= MAX_CARS) continue;
      if (ev.signalType === MATCH_SIGNALS.PLAYER_JOINED) {
        joinedTeamByCar.set(cIdx, (Number(ev.param2) & 0xff) === 1 ? 1 : 0);
      } else if (ev.signalType === MATCH_SIGNALS.PLAYER_LOADOUT_UPDATED) {
        signalLoadoutByCar.set(cIdx, unpackLoadoutSignalParam2(ev.param2 ?? 0));
      }
    }
  }

  const blueEntries: ReplayRosterEntry[] = [];
  const orangeEntries: ReplayRosterEntry[] = [];
  let detectedLocalTeam: number | null = null;

  for (const carIndex of activeCarIndices) {
    const metaItem = rosterByCar.get(carIndex) || null;
    const sigLoadout = signalLoadoutByCar.get(carIndex) || null;
    const base = SIM_OFFSETS.CARS + carIndex * 40;
    const initY = firstFrame ? firstFrame[base + 1] || 0 : 0;

    let team = 0;
    if (metaItem && (metaItem.team === 1 || metaItem.team === 'orange')) {
      team = 1;
    } else if (metaItem && (metaItem.team === 0 || metaItem.team === 'blue')) {
      team = 0;
    } else if (joinedTeamByCar.has(carIndex)) {
      team = joinedTeamByCar.get(carIndex) ?? 0;
    } else if (Math.abs(initY) > 50) {
      team = initY > 0 ? 1 : 0;
    } else {
      team = carIndex % 2;
    }

    const visualId = normalizeVisualId(metaItem?.visualId || sigLoadout?.visualId || 'fennec');
    const hitboxId = metaItem?.hitboxId || sigLoadout?.hitboxId || resolveVehicleHitboxId(visualId);
    const defaultColorSlot = team === 0 ? 3 : 0;
    const colorSlot =
      typeof metaItem?.colorSlot === 'number'
        ? metaItem.colorSlot
        : typeof sigLoadout?.colorSlot === 'number'
          ? sigLoadout.colorSlot
          : defaultColorSlot;
    const swatch = getCarColorSlotById(colorSlot);
    const colorHex = metaItem?.colorHex || swatch.hex;
    const paintFinish = metaItem?.paintFinish || sigLoadout?.paintFinish || 'metallic';
    const boostVisual = metaItem?.boostVisual || sigLoadout?.boostVisual || 'gold-rush';
    const boostAudio = metaItem?.boostAudio || sigLoadout?.boostAudio || 'rush';
    const anthemId = metaItem?.anthemId || 'none';
    const isSelf = Boolean(
      metaItem?.isPlayer || metaItem?.isSelf || metaItem?.isLocal || metaItem?.isLocalPlayer
    );
    if (isSelf && detectedLocalTeam === null) {
      detectedLocalTeam = team;
    }

    const entry: ReplayRosterEntry = {
      carIndex,
      team,
      name: metaItem?.name || metaItem?.username || null,
      botType: metaItem?.botType || null,
      isSelf,
      visualId,
      hitboxId,
      colorSlot,
      colorHex,
      paintFinish,
      boostVisual,
      boostAudio,
      anthemId,
      slotKey: 1,
    };

    if (team === 1) {
      orangeEntries.push(entry);
    } else {
      blueEntries.push(entry);
    }
  }

  const localTeam = detectedLocalTeam === 1 ? 1 : 0;
  const leftEntries = localTeam === 1 ? orangeEntries : blueEntries;
  const rightEntries = localTeam === 1 ? blueEntries : orangeEntries;
  const { leftSlotKeys, rightSlotKeys, slotKeyToCarIndex } = assignTeamSlotKeys(
    leftEntries,
    rightEntries
  );

  const allEntries = [...leftEntries, ...rightEntries];
  const botCounts: Record<string, number> = {};
  for (const e of allEntries) {
    if (e.botType) {
      const k = String(e.botType).toLowerCase();
      botCounts[k] = (botCounts[k] || 0) + 1;
    }
  }

  leftEntries.forEach((e, idx) => {
    e.slotKey = leftSlotKeys[idx] ?? idx + 1;
    if (!e.name) {
      if (e.botType) {
        const bt = String(e.botType);
        const cap = bt.charAt(0).toUpperCase() + bt.slice(1).toLowerCase();
        e.name = (botCounts[bt.toLowerCase()] || 0) > 1 ? `${cap} #${e.slotKey}` : cap;
      } else {
        e.name =
          allEntries.length === 1 ? 'Player' : `${e.team === 1 ? 'Orange' : 'Blue'} #${e.slotKey}`;
      }
    }
  });

  rightEntries.forEach((e, idx) => {
    e.slotKey = rightSlotKeys[idx] ?? idx + 4;
    if (!e.name) {
      if (e.botType) {
        const bt = String(e.botType);
        const cap = bt.charAt(0).toUpperCase() + bt.slice(1).toLowerCase();
        e.name = (botCounts[bt.toLowerCase()] || 0) > 1 ? `${cap} #${e.slotKey}` : cap;
      } else {
        e.name = `${e.team === 1 ? 'Orange' : 'Blue'} #${e.slotKey}`;
      }
    }
  });

  const selfEntry = allEntries.find((e) => e.isSelf) || allEntries[0] || null;
  const activePovCarIndex = selfEntry ? selfEntry.carIndex : 0;
  const activePovSlotKey = selfEntry ? selfEntry.slotKey : 1;
  const activePovTeam = selfEntry?.team === 1 ? 1 : 0;

  return {
    resolvedRoster: allEntries,
    localTeam,
    slotKeyToCarIndex: slotKeyToCarIndex as Record<number, number>,
    activePovCarIndex,
    activePovSlotKey,
    activePovTeam,
  };
}
