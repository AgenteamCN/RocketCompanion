/**
 * RLRCNetStreamBitDecoder.ts
 * Decodes Part 2 UE3 NetStream bitframes into RLRCNetStreamFrameInput[]
 * and extracts 34-pad boost pickup events via RLRCBoostPadSpatialTracker.
 */

import { RLRCBoostPadSpatialTracker } from '../catalog/RLRCBoostPadSpatialTracker.ts';
import type { RLRCBoostPadPickupEvent, RLRCVec3 } from '../RLRCReplayTypes.ts';
import { RLRCBitReader } from './RLRCBitReader.ts';
import { decodeRLRCPropertyAttribute } from './RLRCPropertyAttributeDecoder.ts';
import type { RLRCParsedReplayHeaderAndBookmarks } from './RLRCReplayHeaderAndBookmarkParser.ts';

export interface RLRCNetStreamNewActorInput {
  readonly actor_id: number;
  readonly name_id: number;
  readonly object_id: number;
  readonly initial_trajectory?: {
    readonly location?: RLRCVec3;
    readonly rotation?: { yaw: number | null; pitch: number | null; roll: number | null };
  };
  readonly [key: string]: unknown;
}

export interface RLRCNetStreamUpdatedActorInput {
  readonly actor_id: number;
  readonly stream_id: number;
  readonly object_id: number;
  readonly attribute: Record<string, unknown>;
  readonly [key: string]: unknown;
}

export interface RLRCNetStreamFrameInput {
  readonly time: number;
  readonly delta: number;
  readonly new_actors: readonly RLRCNetStreamNewActorInput[];
  readonly updated_actors: readonly RLRCNetStreamUpdatedActorInput[];
  readonly deleted_actors: readonly number[];
}

export interface RLRCResolvedClassNetCacheNode {
  readonly objectInd: number;
  readonly parentId: number;
  readonly cacheId: number;
  readonly props: Map<number, number>;
  readonly maxStreamId: number;
}

export interface RLRCNetStreamDecodeOutput {
  readonly frames: RLRCNetStreamFrameInput[];
  readonly boostPadEvents30Hz: readonly RLRCBoostPadPickupEvent[];
}

export function buildRLRCClassNetCacheLookup(
  container: Pick<RLRCParsedReplayHeaderAndBookmarks, 'netCache' | 'objects'>
): Map<number, RLRCResolvedClassNetCacheNode> {
  const nodes: RLRCResolvedClassNetCacheNode[] = [];
  for (let i = 0; i < container.netCache.length; i++) {
    const nc = container.netCache[i];
    let parentIdx: number | null = null;
    if (i > 0) {
      if (nodes[i - 1].cacheId === nc.parentId || nodes[i - 1].maxStreamId === nc.parentId) {
        parentIdx = i - 1;
      } else {
        for (let j = i - 1; j >= 0; j--) {
          if (nodes[j].cacheId === nc.parentId || nodes[j].maxStreamId === nc.parentId) {
            parentIdx = j;
            break;
          }
        }
        if (parentIdx === null) parentIdx = i - 1;
      }
    }
    const props = new Map<number, number>();
    if (parentIdx !== null) {
      for (const [k, v] of nodes[parentIdx].props.entries()) props.set(k, v);
    }
    let maxSid = nc.cacheId;
    for (const p of nc.properties) props.set(p.streamId, p.objectInd);
    for (const sid of props.keys()) {
      if (sid + 1 > maxSid) maxSid = sid + 1;
    }
    nodes.push({
      objectInd: nc.objectInd,
      parentId: nc.parentId,
      cacheId: nc.cacheId,
      props,
      maxStreamId: maxSid,
    });
  }

  const nodeByObjectInd = new Map<number, RLRCResolvedClassNetCacheNode>();
  const nodeByClassName = new Map<string, RLRCResolvedClassNetCacheNode>();
  for (const node of nodes) {
    nodeByObjectInd.set(node.objectInd, node);
    const cname = container.objects[node.objectInd] || '';
    if (cname) nodeByClassName.set(cname, node);
  }

  const objToNode = new Map<number, RLRCResolvedClassNetCacheNode>();
  for (let oid = 0; oid < container.objects.length; oid++) {
    const exact = nodeByObjectInd.get(oid);
    if (exact) {
      objToNode.set(oid, exact);
      continue;
    }
    const oname = container.objects[oid] || '';
    const stripped = oname.replace(/\.Default__/g, '.');
    const byClass = nodeByClassName.get(stripped);
    if (byClass) {
      objToNode.set(oid, byClass);
      continue;
    }
    let best: RLRCResolvedClassNetCacheNode | null = null;
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].objectInd <= oid) {
        if (best === null || nodes[i].objectInd > best.objectInd) best = nodes[i];
      }
    }
    if (best) objToNode.set(oid, best);
  }
  return objToNode;
}

export function decodeRLRCNetStreamFrames(
  parsedHeader: RLRCParsedReplayHeaderAndBookmarks
): RLRCNetStreamDecodeOutput {
  const objToNode = buildRLRCClassNetCacheLookup(parsedHeader);
  const br = new RLRCBitReader(parsedHeader.netstreamBytes);
  const maxChannels = parsedHeader.maxChannels || 2047;
  const netVersion = parsedHeader.netVersion ?? 7;
  const vectorMaxBits = netVersion >= 7 ? 22 : 20;
  const expectedFrames = parsedHeader.header.sourceFrameCount || 0;
  const activeActorObjectIds = new Map<number, number>();
  const carPositionsByActorId = new Map<number, RLRCVec3>();
  const padTracker = new RLRCBoostPadSpatialTracker();
  const frames: RLRCNetStreamFrameInput[] = [];

  for (let frameIdx = 0; frameIdx < expectedFrames; frameIdx++) {
    if (br.bitsRemaining < 64) break;
    const time = br.readF32();
    const delta = br.readF32();
    if (!Number.isFinite(time) || !Number.isFinite(delta) || delta < -1.0 || delta > 60.0) {
      break;
    }

    const newActors: RLRCNetStreamNewActorInput[] = [];
    const updatedActors: RLRCNetStreamUpdatedActorInput[] = [];
    const deletedActors: number[] = [];
    const pendingPickups: Array<{
      pickupActorId: number;
      instigatorActorId: number | null;
      pickedUpByte: number;
    }> = [];

    while (br.readBool()) {
      const actorId = br.readBitsMax(maxChannels + 1);
      const isOpen = br.readBool();

      if (isOpen) {
        const isNew = br.readBool();
        if (isNew) {
          const nameId = br.readI32();
          br.readBit();
          const objectId = br.readI32();
          const objectName = parsedHeader.objects[objectId] || '';
          const hasInitialLoc = !objectName.includes('.TheWorld:');
          const initialLocation = hasInitialLoc
            ? br.readCompressedVector(vectorMaxBits, 1.0)
            : null;
          const hasInitialRot =
            objectName.includes('Archetypes.Ball.') || objectName.includes('Archetypes.Car.');
          const initialRotation = hasInitialRot ? br.readRotationShort() : null;

          activeActorObjectIds.set(actorId, objectId);
          if (initialLocation && objectName.includes('Archetypes.Car.')) {
            carPositionsByActorId.set(actorId, initialLocation);
          }
          newActors.push({
            actor_id: actorId,
            name_id: nameId,
            object_id: objectId,
            initial_trajectory: {
              location: initialLocation ?? undefined,
              rotation: initialRotation ?? undefined,
            },
          });
        } else {
          const objId = activeActorObjectIds.get(actorId);
          const node = objId !== undefined ? objToNode.get(objId) : undefined;
          if (!node) {
            throw new Error(
              `Missing ClassNetCache node for actor ${actorId} (objectId=${String(objId)}) at frame ${frameIdx}`
            );
          }

          while (br.readBool()) {
            const streamId = br.readBitsMax(node.maxStreamId);
            const propObjId = node.props.get(streamId);
            if (propObjId === undefined) {
              throw new Error(
                `Unknown streamId=${streamId} on actor=${actorId} (${parsedHeader.objects[objId!]}) at frame ${frameIdx}`
              );
            }
            const propertyName = parsedHeader.objects[propObjId] || '';
            const decoded = decodeRLRCPropertyAttribute(
              br,
              propertyName,
              parsedHeader.objects,
              vectorMaxBits
            );

            if (
              decoded.type === 'RigidBody' &&
              decoded.value &&
              typeof decoded.value === 'object'
            ) {
              const rb = decoded.value as { location?: RLRCVec3 };
              if (rb.location) {
                carPositionsByActorId.set(actorId, rb.location);
              }
            } else if (decoded.type === 'PickupNew' || decoded.type === 'Pickup') {
              const pk = decoded.value as { instigator: number | null; pickedUp: number };
              pendingPickups.push({
                pickupActorId: actorId,
                instigatorActorId: pk.instigator,
                pickedUpByte: pk.pickedUp,
              });
            }

            updatedActors.push({
              actor_id: actorId,
              stream_id: streamId,
              object_id: propObjId,
              attribute: { [decoded.type]: decoded.value },
            });
          }
        }
      } else {
        activeActorObjectIds.delete(actorId);
        carPositionsByActorId.delete(actorId);
        padTracker.deletePickupActor(actorId);
        deletedActors.push(actorId);
      }
    }

    for (let i = 0; i < pendingPickups.length; i++) {
      const pk = pendingPickups[i];
      const instigatorPos =
        pk.instigatorActorId !== null
          ? (carPositionsByActorId.get(pk.instigatorActorId) ?? null)
          : null;
      padTracker.registerPickupEvent({
        sourceFrame30Hz: frameIdx,
        timeSeconds: time,
        pickupActorId: pk.pickupActorId,
        pickedUpByte: pk.pickedUpByte,
        instigatorPosition: instigatorPos,
      });
    }

    frames.push({
      time,
      delta,
      new_actors: newActors,
      updated_actors: updatedActors,
      deleted_actors: deletedActors,
    });
  }

  return {
    frames,
    boostPadEvents30Hz: padTracker.getRecordedEvents(),
  };
}
