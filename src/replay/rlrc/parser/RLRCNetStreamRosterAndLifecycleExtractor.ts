/**
 * RLRCNetStreamRosterAndLifecycleExtractor.ts
 * Roster slot assignment (0..5 grouped by Blue 0..2 then Orange 3..5), spectator filtering,
 * loadout/camera resolution, and car entity lifecycle tracking.
 */

import type { RLRCPlayerCameraSettings, RLRCTeamIndex } from '../RLRCReplayTypes.ts';
import {
  assembleRLRCRosterAndLifecycleResult,
  defaultResolveRLRCLoadout,
  extractActiveActorId,
  extractClientLoadoutBodyIds,
  parseRLRCCameraSettingsAttr,
  parseRLRCRestingRigidBodySample,
  type RLRCFrameLifecycleSnapshot,
  type RLRCFrameSlotLifecycleEntry,
  type RLRCPriCandidateRecord,
  type RLRCRosterAndLifecycleExtractionResult,
  type RLRCVehicleLoadoutResolverFn,
} from './RLRCNetStreamRosterConsolidatorPipeline.ts';

export type {
  RLRCFrameLifecycleSnapshot,
  RLRCFrameSlotLifecycleEntry,
  RLRCRosterAndLifecycleExtractionResult,
  RLRCVehicleLoadoutResolverFn,
};

export type RLRCDecodedNewActor = Readonly<Record<string, unknown>>;
export type RLRCDecodedUpdatedActor = Readonly<Record<string, unknown>>;

export interface RLRCDecodedNetworkFrameInput {
  readonly time: number;
  readonly delta?: number;
  readonly newActors?: readonly RLRCDecodedNewActor[];
  readonly updatedActors?: readonly RLRCDecodedUpdatedActor[];
  readonly deletedActors?: readonly number[];
  readonly new_actors?: readonly RLRCDecodedNewActor[];
  readonly updated_actors?: readonly RLRCDecodedUpdatedActor[];
  readonly deleted_actors?: readonly number[];
}

export interface RLRCRosterAndLifecycleExtractionInput {
  readonly objects: readonly string[];
  readonly names?: readonly string[];
  readonly frames: readonly RLRCDecodedNetworkFrameInput[];
  readonly keyframeIndices30Hz?: ReadonlySet<number> | readonly number[];
  readonly loadoutResolver?: RLRCVehicleLoadoutResolverFn;
}

interface CarRecord {
  readonly cid: number;
  readonly pid: number;
  readonly hide: boolean;
  readonly f0: number;
  readonly t0: number;
}

export class RLRCNetStreamRosterAndLifecycleExtractor {
  private readonly resolveLoadout: RLRCVehicleLoadoutResolverFn;

  public constructor(loadoutResolver?: RLRCVehicleLoadoutResolverFn) {
    this.resolveLoadout = loadoutResolver ?? defaultResolveRLRCLoadout;
  }

  public extract(
    input: RLRCRosterAndLifecycleExtractionInput
  ): RLRCRosterAndLifecycleExtractionResult {
    const { objects, frames } = input;
    const resolve = input.loadoutResolver ?? this.resolveLoadout;
    const kfSet: ReadonlySet<number> =
      input.keyframeIndices30Hz instanceof Set
        ? input.keyframeIndices30Hz
        : new Set(input.keyframeIndices30Hz ?? []);

    const types = new Map<number, string>();
    const teams = new Map<number, RLRCTeamIndex>();
    const pris = new Map<number, RLRCPriCandidateRecord>();
    const cams = new Map<number, RLRCPlayerCameraSettings>();
    const priByCam = new Map<number, number>();
    const cars = new Map<number, CarRecord>();
    const rawSegs: (readonly [number, number, number, number, number, number])[] = [];
    const framePairs: (readonly [number, number])[][] = new Array(frames.length);

    const getPri = (id: number, f0: number): RLRCPriCandidateRecord => {
      let p = pris.get(id);
      if (!p) {
        p = {
          id,
          f0,
          name: '',
          team: -1,
          pt: 0,
          spec: false,
          b0: 0,
          b1: 0,
          cid: -1,
          cars: new Set(),
          samples: [],
        };
        pris.set(id, p);
      }
      return p;
    };

    const closeRaw = (c: CarRecord, ef: number, et: number): void => {
      if (c.pid >= 0 && !c.hide && ef >= c.f0) {
        rawSegs.push([c.pid, c.cid, c.f0, ef, c.t0, Math.max(c.t0, et)]);
      }
    };

    for (let fi = 0; fi < frames.length; fi++) {
      const fr = frames[fi];
      const t = Number(fr.time ?? 0);
      const pFi = Math.max(0, fi - 1);
      const pT = Number(frames[pFi]?.time ?? t);

      for (const did of fr.deletedActors ?? fr.deleted_actors ?? []) {
        const c = cars.get(did);
        if (c) {
          closeRaw(c, pFi, pT);
          cars.delete(did);
        }
        types.delete(did);
        teams.delete(did);
        cams.delete(did);
        priByCam.delete(did);
      }

      for (const na of fr.newActors ?? fr.new_actors ?? []) {
        const aid = Number(na.actorId ?? na.actor_id ?? -1);
        const oid = Number(na.objectId ?? na.object_id ?? -1);
        const oName = objects[oid] ?? '';
        if (aid < 0) continue;
        types.set(aid, oName);
        if (oName.includes('Teams.Team0')) teams.set(aid, 0);
        else if (oName.includes('Teams.Team1')) teams.set(aid, 1);
        else if (oName.includes('PRI_TA')) getPri(aid, fi);
        else if (oName.includes('Archetypes.Car.')) {
          const prev = cars.get(aid);
          if (prev) closeRaw(prev, pFi, pT);
          cars.set(aid, { cid: aid, pid: -1, hide: false, f0: fi, t0: t });
        }
      }

      for (const ua of fr.updatedActors ?? fr.updated_actors ?? []) {
        const aid = Number(ua.actorId ?? ua.actor_id ?? -1);
        const oid = Number(ua.objectId ?? ua.object_id ?? -1);
        const prop = objects[oid] ?? '';
        const attr = ua.attribute as Record<string, unknown> | undefined;
        if (aid < 0 || !attr || typeof attr !== 'object') continue;
        const aType = types.get(aid) ?? '';

        if (prop.endsWith(':PlayerName')) {
          const s = typeof attr.String === 'string' ? attr.String.trim() : '';
          if (s) pris.set(aid, { ...getPri(aid, fi), name: s });
        } else if (prop.endsWith('PlayerReplicationInfo:Team')) {
          const tid = extractActiveActorId(attr);
          const tm = teams.get(tid) ?? ((types.get(tid) ?? '').includes('Team1') ? 1 : 0);
          pris.set(aid, { ...getPri(aid, fi), team: tid >= 0 ? tm : -1 });
        } else if (prop.endsWith(':RespawnTimeRemaining') || prop.endsWith(':PawnType')) {
          const pt = Number(attr.Byte ?? attr.Int ?? 0);
          if (prop.endsWith(':PawnType')) {
            pris.set(aid, { ...getPri(aid, fi), pt, spec: pt === 1 || pt === 3 });
          }
        } else if (prop.endsWith(':bIsSpectator')) {
          pris.set(aid, { ...getPri(aid, fi), spec: Boolean(attr.Boolean) });
        } else if (prop.endsWith(':ClientLoadouts') || prop.endsWith(':ClientLoadout')) {
          const p = getPri(aid, fi);
          const { b0, b1 } = extractClientLoadoutBodyIds(attr, p.b0, p.b1);
          pris.set(aid, { ...p, b0, b1 });
        } else if (prop.endsWith(':PersistentCamera')) {
          const cid = extractActiveActorId(attr);
          if (cid >= 0) {
            const p = getPri(aid, fi);
            pris.set(aid, { ...p, cid, cam: cams.get(cid) ?? p.cam });
            priByCam.set(cid, aid);
          }
        } else if (prop.endsWith(':ProfileSettings') || prop.endsWith(':CameraSettings')) {
          const cam = parseRLRCCameraSettingsAttr(attr);
          if (!cam) continue;
          if (aType.includes('CameraSettingsActor')) {
            cams.set(aid, cam);
            const pid = priByCam.get(aid);
            if (pid !== undefined) pris.set(pid, { ...getPri(pid, fi), cam });
          } else {
            pris.set(aid, { ...getPri(aid, fi), cam });
          }
        } else if (
          prop === 'Engine.Pawn:PlayerReplicationInfo' ||
          prop === 'Engine.Actor:bHidden' ||
          prop.endsWith(':ReplicatedRBState')
        ) {
          const prev = cars.get(aid) ?? { cid: aid, pid: -1, hide: false, f0: fi, t0: t };
          let { pid, hide, f0, t0 } = prev;
          if (prop === 'Engine.Pawn:PlayerReplicationInfo') {
            pid = extractActiveActorId(attr);
            if (pid >= 0) getPri(pid, fi).cars.add(aid);
          } else if (prop === 'Engine.Actor:bHidden') {
            if (!aType.includes('Archetypes.Car.') && !cars.has(aid)) continue;
            hide = Boolean(attr.Boolean);
          } else {
            if (!aType.includes('Archetypes.Car.') && !cars.has(aid)) continue;
            const rb = parseRLRCRestingRigidBodySample(attr);
            if (rb && pid >= 0) {
              const s = getPri(pid, fi).samples;
              if (s.length < 64) s.push(rb);
            }
            continue;
          }
          const wasAct = prev.pid >= 0 && !prev.hide;
          const nowAct = pid >= 0 && !hide;
          if (wasAct && !nowAct) closeRaw(prev, pFi, pT);
          else if (!wasAct && nowAct) {
            f0 = fi;
            t0 = t;
          } else if (wasAct && nowAct && prev.pid !== pid) {
            closeRaw(prev, pFi, pT);
            f0 = fi;
            t0 = t;
          }
          cars.set(aid, { cid: aid, pid, hide, f0, t0 });
        }
      }

      const pairs: (readonly [number, number])[] = [];
      for (const c of cars.values()) {
        if (c.pid >= 0 && !c.hide) pairs.push([c.cid, c.pid]);
      }
      framePairs[fi] = pairs;
    }

    if (frames.length > 0) {
      const lFi = frames.length - 1;
      const lT = Number(frames[lFi].time ?? 0);
      for (const c of cars.values()) {
        if (c.pid >= 0 && !c.hide) closeRaw(c, lFi, lT);
      }
    }

    for (const [cid, cam] of cams.entries()) {
      const pid = priByCam.get(cid);
      const p = pid !== undefined ? pris.get(pid) : undefined;
      if (p && !p.cam) pris.set(p.id, { ...p, cam });
    }
    for (const [pid, p] of pris.entries()) {
      if (!p.cam && p.cid >= 0 && cams.has(p.cid)) {
        pris.set(pid, { ...p, cam: cams.get(p.cid) });
      }
    }

    return assembleRLRCRosterAndLifecycleResult({
      pris,
      rawSegs,
      framePairs,
      frames,
      kfSet,
      resolve,
    });
  }
}

export function extractRLRCNetStreamRosterAndLifecycle(
  input: RLRCRosterAndLifecycleExtractionInput
): RLRCRosterAndLifecycleExtractionResult {
  return new RLRCNetStreamRosterAndLifecycleExtractor(input.loadoutResolver).extract(input);
}
