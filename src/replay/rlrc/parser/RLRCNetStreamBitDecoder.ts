/**
 * RLRCNetStreamBitDecoder.ts
 * Decodes Part 2 UE3 NetStream bitframes into RLRCNetStreamFrameInput[]
 * using deterministic class hierarchy lookup, version-aware attribute decoding,
 * speculative unknown-property bitwidth probing, and 34-pad boost pickup tracking.
 */

import { RLRCBoostPadSpatialTracker } from '../catalog/RLRCBoostPadSpatialTracker.ts';
import type { RLRCBoostPadPickupEvent, RLRCVec3 } from '../RLRCReplayTypes.ts';
import { RLRCBitReader } from './RLRCBitReader.ts';
import {
  buildRLRCClassNetCacheLookup,
  buildRLRCSpawnTrajectoryLookup,
  type RLRCResolvedClassNetCacheNode,
} from './RLRCClassNetCacheBuilder.ts';
import { isRLRCVersionAtLeast, type RLRCVersionTriplet } from './RLRCProductAndPlatformDecoder.ts';
import type { RLRCParsedReplayHeaderAndBookmarks } from './RLRCReplayHeaderAndBookmarkParser.ts';
import {
  isValidRLRCFrameHeader,
  RLRCUnknownPropertyBitProber,
  type RLRCFramePropertyTraceEntry,
} from './RLRCUnknownPropertyBitProber.ts';

export type { RLRCResolvedClassNetCacheNode };

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

export interface RLRCNetStreamDecodeOutput {
  readonly frames: RLRCNetStreamFrameInput[];
  readonly boostPadEvents30Hz: readonly RLRCBoostPadPickupEvent[];
}

export function decodeRLRCNetStreamFrames(
  parsedHeader: RLRCParsedReplayHeaderAndBookmarks
): RLRCNetStreamDecodeOutput {
  const objToNode = buildRLRCClassNetCacheLookup(parsedHeader);
  const spawns = buildRLRCSpawnTrajectoryLookup(parsedHeader.objects);
  const br = new RLRCBitReader(parsedHeader.netstreamBytes);
  const maxChannels = parsedHeader.maxChannels || 1023;
  const netVersion = parsedHeader.netVersion ?? 0;
  const vectorMaxBits = netVersion >= 7 ? 22 : 20;
  const expectedFrames = parsedHeader.header.sourceFrameCount || 0;
  const isLan = String(parsedHeader.header.matchType || '').toLowerCase() === 'lan';
  const isRl223 = String(parsedHeader.buildVersion || '') >= '221120.42953.406184';
  const extendedCamSettings =
    (parsedHeader.minorVersion ?? 0) >= 34 ||
    netVersion >= 12 ||
    parsedHeader.objects.includes('TAGame.CameraSettingsActor_TA:FreeLookAnchorYaw');

  const version: RLRCVersionTriplet = {
    major: parsedHeader.majorVersion ?? 868,
    minor: parsedHeader.minorVersion ?? 32,
    net: netVersion,
    isLan,
    isRl223,
    extendedCamSettings,
  };
  const doParseNewActorName =
    isRLRCVersionAtLeast(version, 868, 20, 0) ||
    (isRLRCVersionAtLeast(version, 868, 14, 0) && !isLan);

  const prober = new RLRCUnknownPropertyBitProber({
    br,
    objects: parsedHeader.objects,
    objToNode,
    spawns,
    maxChannels,
    vectorMaxBits,
    expectedFrames,
    version,
  });

  const activeActorObjectIds = new Map<number, number>();
  const carPositionsByActorId = new Map<number, RLRCVec3>();
  const padTracker = new RLRCBoostPadSpatialTracker();
  const frames: RLRCNetStreamFrameInput[] = [];
  let prevTime: number | null = null;
  let lastFrameTrace: RLRCFramePropertyTraceEntry[] = [];

  for (let frameIdx = 0; frameIdx < expectedFrames; frameIdx++) {
    if (br.bitsRemaining < 64) break;
    const frameStartBitPos = br.saveBitPos();
    const frameStartActors = new Map(activeActorObjectIds);
    const frameStartCars = new Map(carPositionsByActorId);

    const time = br.readF32();
    const delta = br.readF32();
    if (time === 0 && delta === 0) break;
    if (!isValidRLRCFrameHeader(time, delta, prevTime)) {
      throw prober.formatDiagnosticError(
        frameIdx,
        lastFrameTrace,
        `Invalid frame header (time=${time}, delta=${delta}) at bit ${frameStartBitPos}`
      );
    }

    const decodeCurrentFrame = (allowResyncRetry: boolean): boolean => {
      const newActors: RLRCNetStreamNewActorInput[] = [];
      const updatedActors: RLRCNetStreamUpdatedActorInput[] = [];
      const deletedActors: number[] = [];
      const frameTrace: RLRCFramePropertyTraceEntry[] = [];
      const pendingPickups: Array<{
        pickupActorId: number;
        instigatorActorId: number | null;
        pickedUpByte: number;
      }> = [];

      try {
        while (br.readBool()) {
          const actorId = br.readBitsMax(maxChannels);
          const isOpen = br.readBool();

          if (isOpen) {
            const isNew = br.readBool();
            if (isNew) {
              const nameId = doParseNewActorName ? br.readI32() : -1;
              br.readBit();
              const objectId = br.readI32();
              const objectName = parsedHeader.objects[objectId] || '';
              const spawn = spawns[objectId] ?? 'None';
              const initialLocation =
                spawn === 'Location' || spawn === 'LocationAndRotation'
                  ? br.readCompressedVector(vectorMaxBits, 1.0)
                  : null;
              const initialRotation =
                spawn === 'LocationAndRotation' ? br.readRotationShort() : null;

              activeActorObjectIds.set(actorId, objectId);
              if (initialLocation && objectName.includes('Car')) {
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
              const actorClassName = parsedHeader.objects[objId!] || '';

              while (br.readBool()) {
                const streamId = br.readBitsMax(node.maxStreamId);
                const propObjId = node.props.get(streamId);
                if (propObjId === undefined) {
                  throw new Error(
                    `Unknown streamId=${streamId} on actor=${actorId} (${actorClassName}) at frame ${frameIdx}`
                  );
                }
                const propertyName = parsedHeader.objects[propObjId] || '';
                const beforeBitPos = br.saveBitPos();
                const snapshotBeforeProp = new Map(activeActorObjectIds);
                const decoded = prober.decodeOrProbeProperty(
                  propertyName,
                  actorId,
                  node,
                  frameIdx,
                  time,
                  activeActorObjectIds
                );
                const afterBitPos = br.saveBitPos();
                frameTrace.push({
                  actorId,
                  actorClassName,
                  propName: propertyName,
                  streamId,
                  beforeBitPos,
                  afterBitPos,
                  activeActorsSnapshot: snapshotBeforeProp,
                });

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

        if (frameIdx + 1 < expectedFrames && br.bitsRemaining >= 64) {
          const peekPos = br.saveBitPos();
          const nextTime = br.readF32();
          const nextDelta = br.readF32();
          br.restoreBitPos(peekPos);
          if (!isValidRLRCFrameHeader(nextTime, nextDelta, time)) {
            throw new Error(
              `Next frame ${frameIdx + 1} header misaligned (time=${nextTime}, delta=${nextDelta})`
            );
          }
        }
      } catch (err) {
        if (
          allowResyncRetry &&
          frameTrace.length > 0 &&
          prober.tryResyncFrameByStructDelta(frameIdx, time, frameTrace)
        ) {
          br.restoreBitPos(frameStartBitPos + 64);
          activeActorObjectIds.clear();
          for (const [k, v] of frameStartActors) activeActorObjectIds.set(k, v);
          carPositionsByActorId.clear();
          for (const [k, v] of frameStartCars) carPositionsByActorId.set(k, v);
          return decodeCurrentFrame(false);
        }
        throw prober.formatDiagnosticError(
          frameIdx,
          frameTrace.length > 0 ? frameTrace : lastFrameTrace,
          err instanceof Error ? err.message : String(err)
        );
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
      lastFrameTrace = frameTrace;
      prevTime = time;
      return true;
    };

    decodeCurrentFrame(true);
  }

  return {
    frames,
    boostPadEvents30Hz: padTracker.getRecordedEvents(),
  };
}
