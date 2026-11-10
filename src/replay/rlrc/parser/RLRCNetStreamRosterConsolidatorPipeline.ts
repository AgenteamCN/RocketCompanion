/**
 * RLRCNetStreamRosterConsolidatorPipeline.ts
 * Pure attribute parsers, catalog-backed loadout resolver, and final team-grouped
 * (Blue 0..2, Orange 3..5) roster/segment/frame-lifecycle consolidation pipeline.
 */

import { resolveRLRCVehicleLoadout } from '../catalog/RLRCVehicleLoadoutCatalog.ts';
import {
  RLRC_MAX_PLAYER_SLOTS,
  type RLRCPlayerCameraSettings,
  type RLRCPlayerSlotMeta,
  type RLRCRigidBodySample,
  type RLRCSourceEntityLifeSegment,
  type RLRCTeamIndex,
  type RLRCVehicleLoadoutResolution,
} from '../RLRCReplayTypes.ts';

export type RLRCVehicleLoadoutResolverFn = (
  bodyProductId: number | null | undefined,
  restingSamples?: readonly RLRCRigidBodySample[] | null
) => RLRCVehicleLoadoutResolution;

export interface RLRCPriCandidateRecord {
  readonly id: number;
  readonly f0: number;
  readonly name: string;
  readonly team: RLRCTeamIndex | -1;
  readonly pt: number;
  readonly spec: boolean;
  readonly b0: number;
  readonly b1: number;
  readonly cid: number;
  readonly cam?: RLRCPlayerCameraSettings;
  readonly cars: Set<number>;
  readonly samples: RLRCRigidBodySample[];
}

export interface RLRCFrameSlotLifecycleEntry {
  readonly slotIndex: number;
  readonly entityActive: boolean;
  readonly activeCarActorId: number;
  readonly priActorId: number;
}

export interface RLRCFrameLifecycleSnapshot {
  readonly sourceFrame30Hz: number;
  readonly timeSeconds: number;
  readonly deltaSeconds: number;
  readonly isKeyframe: boolean;
  readonly slots: readonly RLRCFrameSlotLifecycleEntry[];
  readonly activeCarActorToSlot: ReadonlyMap<number, number>;
}

export interface RLRCRosterAndLifecycleExtractionResult {
  readonly roster: readonly RLRCPlayerSlotMeta[];
  readonly spectators: readonly {
    readonly priActorId: number;
    readonly userName: string;
    readonly pawnType: number;
  }[];
  readonly lifeSegments: readonly RLRCSourceEntityLifeSegment[];
  readonly frameLifecycles: readonly RLRCFrameLifecycleSnapshot[];
  readonly slotIndexByUserName: ReadonlyMap<string, number>;
  readonly slotIndexByPriActorId: ReadonlyMap<number, number>;
}

export function defaultResolveRLRCLoadout(
  bodyId: number | null | undefined,
  samples?: readonly RLRCRigidBodySample[] | null
): RLRCVehicleLoadoutResolution {
  return resolveRLRCVehicleLoadout(bodyId, samples);
}

export function extractActiveActorId(attr: Record<string, unknown>): number {
  const activeActor = attr.ActiveActor as Record<string, unknown> | undefined;
  const actorId =
    activeActor && typeof activeActor === 'object' && activeActor.active !== false
      ? Number(activeActor.actor)
      : -1;
  return Number.isFinite(actorId) && actorId >= 0 ? Math.trunc(actorId) : -1;
}

function resolveBodyProductIdFromTeamSlot(slotValue: unknown): number {
  if (typeof slotValue === 'number' && Number.isFinite(slotValue) && slotValue > 0) {
    return Math.trunc(slotValue);
  }
  if (Array.isArray(slotValue)) {
    const first = Number(slotValue[0]);
    return Number.isFinite(first) && first > 0 ? Math.trunc(first) : 0;
  }
  if (slotValue && typeof slotValue === 'object') {
    const rec = slotValue as Record<string, unknown>;
    const body = Number(rec.body ?? rec.Body ?? rec.productId ?? 0);
    return Number.isFinite(body) && body > 0 ? Math.trunc(body) : 0;
  }
  return 0;
}

/**
 * Extracts Blue (`b0`) and Orange (`b1`) body product IDs from `TAGame.PRI_TA:ClientLoadouts`
 * or `ClientLoadout` attributes across both native `TeamLoadout` object structures
 * (`{ TeamLoadout: { blue: { body }, orange: { body } } }`) and array-based `Loadouts` formats.
 */
export function extractClientLoadoutBodyIds(
  attr: Record<string, unknown>,
  prevBlueBodyId: number,
  prevOrangeBodyId: number
): { readonly b0: number; readonly b1: number } {
  const container = (attr.TeamLoadout ?? attr.Loadouts ?? attr.Loadout ?? attr) as Record<
    string,
    unknown
  >;
  const blueBody = resolveBodyProductIdFromTeamSlot(
    container.blue ?? container.loadout ?? container.body
  );
  const orangeBody = resolveBodyProductIdFromTeamSlot(
    container.orange ?? container.loadout ?? container.body
  );
  return {
    b0: blueBody > 0 ? blueBody : prevBlueBodyId,
    b1: orangeBody > 0 ? orangeBody : prevOrangeBodyId,
  };
}

export function parseRLRCCameraSettingsAttr(
  attr: Record<string, unknown>
): RLRCPlayerCameraSettings | undefined {
  const raw = (attr.CamSettings ?? attr) as Record<string, unknown> | undefined;
  const fov = Number(raw?.fov ?? raw?.FOV ?? 110);
  if (!raw || !Number.isFinite(fov) || fov <= 0) {
    return undefined;
  }
  return {
    fov,
    height: Number(raw.height ?? raw.Height ?? 100) || 100,
    pitch: Number(raw.angle ?? raw.pitch ?? raw.Pitch ?? -3) || -3,
    distance: Number(raw.distance ?? raw.Distance ?? 270) || 270,
    stiffness: Number(raw.stiffness ?? raw.Stiffness ?? 0.4) || 0.4,
    swivelSpeed: Number(raw.swivel ?? raw.swivelSpeed ?? raw.SwivelSpeed ?? 5.0) || 5.0,
    transitionSpeed:
      Number(raw.transition ?? raw.transitionSpeed ?? raw.TransitionSpeed ?? 1.2) || 1.2,
  };
}

export function parseRLRCRestingRigidBodySample(
  attr: Record<string, unknown>
): RLRCRigidBodySample | null {
  const rb = (attr.RigidBody ?? attr) as Record<string, unknown> | undefined;
  const loc = rb?.location as Record<string, unknown> | undefined;
  const rot = rb?.rotation as Record<string, unknown> | undefined;
  if (!rb || !loc || !rot) {
    return null;
  }
  const x = Number(loc.x ?? 0);
  const y = Number(loc.y ?? 0);
  const z = Number(loc.z ?? 0);
  if (Math.abs(x) > 2500 || Math.abs(y) > 3500 || z < 15.5 || z > 20.5) {
    return null;
  }
  const lin = (rb.linear_velocity ?? rb.linearVelocity) as Record<string, unknown> | undefined;
  const vz = lin ? Number(lin.z ?? 0) : 0;
  if (Math.abs(vz) > 5.0) {
    return null;
  }
  return {
    sleeping: Boolean(rb.sleeping),
    position: { x, y, z },
    rotation: {
      x: Number(rot.x ?? 0),
      y: Number(rot.y ?? 0),
      z: Number(rot.z ?? 0),
      w: Number(rot.w ?? 1),
    },
    linearVelocity: {
      x: lin ? Number(lin.x ?? 0) : 0,
      y: lin ? Number(lin.y ?? 0) : 0,
      z: vz,
    },
    angularVelocity: { x: 0, y: 0, z: 0 },
  };
}

export function assembleRLRCRosterAndLifecycleResult(params: {
  readonly pris: ReadonlyMap<number, RLRCPriCandidateRecord>;
  readonly rawSegs: readonly (readonly [number, number, number, number, number, number])[];
  readonly framePairs: readonly (readonly (readonly [number, number])[])[];
  readonly frames: readonly { readonly time: number; readonly delta?: number }[];
  readonly kfSet: ReadonlySet<number>;
  readonly resolve: RLRCVehicleLoadoutResolverFn;
}): RLRCRosterAndLifecycleExtractionResult {
  const { pris, rawSegs, framePairs, frames, kfSet, resolve } = params;
  const merged = new Map<string, RLRCPriCandidateRecord>();
  const spectators: { priActorId: number; userName: string; pawnType: number }[] = [];

  for (const p of pris.values()) {
    const name = p.name.trim();
    if (!name) continue;
    const hasCar = p.cars.size > 0;
    const hasTeam = p.team === 0 || p.team === 1;
    if (!hasCar && (p.pt === 1 || p.pt === 3 || p.spec || !hasTeam)) {
      spectators.push({ priActorId: p.id, userName: name, pawnType: p.pt || 1 });
      continue;
    }
    const prev = merged.get(name);
    if (!prev) {
      merged.set(name, p);
    } else {
      for (const c of p.cars) prev.cars.add(c);
      for (const s of p.samples) {
        if (prev.samples.length < 64) prev.samples.push(s);
      }
      merged.set(name, {
        ...prev,
        team: prev.team === -1 && hasTeam ? p.team : prev.team,
        b0: prev.b0 || p.b0,
        b1: prev.b1 || p.b1,
        cam: prev.cam ?? p.cam,
      });
    }
  }

  // Group Blue (team 0) into slots 0..2 and Orange (team 1) into slots 3..5
  const candidates = [...merged.values()]
    .sort(
      (a, b) =>
        (a.cars.size > 0 ? 0 : 1) - (b.cars.size > 0 ? 0 : 1) ||
        (a.team === 1 ? 1 : 0) - (b.team === 1 ? 1 : 0) ||
        a.f0 - b.f0 ||
        a.id - b.id
    )
    .slice(0, RLRC_MAX_PLAYER_SLOTS);

  const roster: RLRCPlayerSlotMeta[] = [];
  const byName = new Map<string, number>();
  const byPri = new Map<number, number>();
  for (let slotIndex = 0; slotIndex < candidates.length; slotIndex++) {
    const c = candidates[slotIndex];
    const team: RLRCTeamIndex = c.team === 1 ? 1 : 0;
    const lo = resolve(team === 0 ? c.b0 || c.b1 : c.b1 || c.b0, c.samples);
    const userName = c.name.trim();
    roster.push({
      slotIndex,
      userName,
      team,
      priActorId: c.id,
      bodyProductId: lo.bodyProductId,
      hitboxId: lo.hitboxId,
      visualId: lo.visualId,
      ...(c.cam ? { cameraSettings: c.cam } : {}),
    });
    byName.set(userName, slotIndex);
    byPri.set(c.id, slotIndex);
  }
  for (const p of pris.values()) {
    const s = byName.get(p.name.trim());
    if (s !== undefined) byPri.set(p.id, s);
  }

  const lifeSegments: RLRCSourceEntityLifeSegment[] = [];
  for (const [
    pid,
    carActorId,
    startFrame30Hz,
    endFrame30Hz,
    startTimeSeconds,
    endTimeSeconds,
  ] of rawSegs) {
    const slotIndex = byPri.get(pid);
    if (slotIndex !== undefined) {
      lifeSegments.push({
        slotIndex,
        carActorId,
        startFrame30Hz,
        endFrame30Hz,
        startTimeSeconds,
        endTimeSeconds,
      });
    }
  }
  lifeSegments.sort((a, b) => a.startFrame30Hz - b.startFrame30Hz || a.slotIndex - b.slotIndex);

  const frameLifecycles: RLRCFrameLifecycleSnapshot[] = new Array(frames.length);
  for (let fi = 0; fi < frames.length; fi++) {
    const fr = frames[fi];
    const cSlot = new Int32Array(roster.length).fill(-1);
    const pSlot = new Int32Array(roster.length).fill(-1);
    const map = new Map<number, number>();
    for (const [cid, pid] of framePairs[fi]) {
      const s = byPri.get(pid);
      if (s === undefined || s < 0 || s >= roster.length) continue;
      if (cSlot[s] < 0 || cid > cSlot[s]) {
        cSlot[s] = cid;
        pSlot[s] = pid;
      }
      map.set(cid, s);
    }
    const slots: RLRCFrameSlotLifecycleEntry[] = new Array(roster.length);
    for (let s = 0; s < roster.length; s++) {
      const id = cSlot[s];
      slots[s] = {
        slotIndex: s,
        entityActive: id >= 0,
        activeCarActorId: id,
        priActorId: id >= 0 ? pSlot[s] : roster[s].priActorId,
      };
    }
    frameLifecycles[fi] = {
      sourceFrame30Hz: fi,
      timeSeconds: Number(fr.time ?? 0),
      deltaSeconds: Number(fr.delta ?? 0),
      isKeyframe: kfSet.has(fi),
      slots,
      activeCarActorToSlot: map,
    };
  }

  return {
    roster,
    spectators,
    lifeSegments,
    frameLifecycles,
    slotIndexByUserName: byName,
    slotIndexByPriActorId: byPri,
  };
}
