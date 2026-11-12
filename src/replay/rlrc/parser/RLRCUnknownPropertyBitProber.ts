/**
 * RLRCUnknownPropertyBitProber.ts
 * Speculative bit-stream synchronizer (Auto-Probing Bit Skimmer) and structured diagnostic
 * reporter for unknown UE3 properties or expanded structs in Rocket League .replay NetStreams.
 */

import type { RLRCBitReader } from './RLRCBitReader.ts';
import type { RLRCSpawnTrajectory } from './RLRCClassHierarchyCatalog.ts';
import type { RLRCResolvedClassNetCacheNode } from './RLRCClassNetCacheBuilder.ts';
import {
  isRLRCVersionAtLeast,
  type RLRCVersionTriplet,
} from './RLRCProductAndPlatformDecoder.ts';
import { decodeRLRCPropertyAttributeByType } from './RLRCPropertyAttributeDecoder.ts';
import {
  getRLRCHeuristicCandidateBitWidths,
  inferRLRCPropertyType,
  type RLRCPropertyType,
} from './RLRCPropertyTypeCatalog.ts';

export interface RLRCFramePropertyTraceEntry {
  readonly actorId: number;
  readonly actorClassName: string;
  readonly propName: string;
  readonly streamId: number;
  readonly beforeBitPos: number;
  readonly afterBitPos: number;
  readonly activeActorsSnapshot: ReadonlyMap<number, number>;
}

export interface RLRCProberContext {
  readonly br: RLRCBitReader;
  readonly objects: readonly string[];
  readonly objToNode: ReadonlyMap<number, RLRCResolvedClassNetCacheNode>;
  readonly spawns: readonly RLRCSpawnTrajectory[];
  readonly maxChannels: number;
  readonly vectorMaxBits: number;
  readonly expectedFrames: number;
  readonly version: RLRCVersionTriplet;
}

const STRUCT_EXPANSION_CANDIDATE_DELTAS: readonly number[] = Object.freeze([
  1, 2, 8, 9, 11, 14, 16, 24, 32, 33, 34, 40, 48, 64, 66, 72, 88, 96, 98, 100, 128, 160, 192, -8,
  -16, -32, -64, -98, -192,
]);

export function isValidRLRCFrameHeader(
  time: number,
  delta: number,
  prevTime: number | null,
  strictLookahead = false
): boolean {
  if (!Number.isFinite(time) || !Number.isFinite(delta)) return false;
  if (time === 0 && delta === 0) return true;
  if (time < 0 || time > 100000 || (time > 0 && time < 1e-10)) return false;
  if (delta < 0 || delta > (strictLookahead ? 2.0 : 30.0) || (delta > 0 && delta < 1e-10)) {
    return false;
  }
  if (prevTime !== null && prevTime > 0) {
    const maxStep = strictLookahead ? 20.0 : 120.0;
    if (time < prevTime - 0.05 || time > prevTime + maxStep) return false;
  }
  return true;
}

export class RLRCUnknownPropertyBitProber {
  public readonly learnedBitWidths = new Map<string, number>();
  public readonly learnedStructDeltas = new Map<string, number>();
  private readonly ctx: RLRCProberContext;
  private readonly doParseNewActorName: boolean;

  public constructor(ctx: RLRCProberContext) {
    this.ctx = ctx;
    this.doParseNewActorName =
      isRLRCVersionAtLeast(ctx.version, 868, 20, 0) ||
      (isRLRCVersionAtLeast(ctx.version, 868, 14, 0) && !ctx.version.isLan);
  }

  public decodeOrProbeProperty(
    propName: string,
    actorId: number,
    node: RLRCResolvedClassNetCacheNode,
    frameIdx: number,
    frameTime: number,
    activeActors: ReadonlyMap<number, number>
  ): { type: RLRCPropertyType; value: unknown } {
    const { br, objects, vectorMaxBits, version } = this.ctx;
    const knownType = inferRLRCPropertyType(propName);

    if (knownType !== 'Unknown') {
      const value = decodeRLRCPropertyAttributeByType(
        br,
        knownType,
        objects,
        vectorMaxBits,
        version
      );
      const extraDelta = this.learnedStructDeltas.get(propName);
      if (extraDelta !== undefined && extraDelta !== 0) {
        br.skipBits(extraDelta);
      }
      return { type: knownType, value };
    }

    const learnedWidth = this.learnedBitWidths.get(propName);
    if (learnedWidth !== undefined) {
      if (learnedWidth === -1) {
        return { type: 'String', value: br.readString() };
      }
      br.skipBits(learnedWidth);
      return { type: 'Unknown', value: learnedWidth };
    }

    const propStartBitPos = br.saveBitPos();
    const candidates = getRLRCHeuristicCandidateBitWidths(propName);

    for (const candidate of candidates) {
      br.restoreBitPos(propStartBitPos);
      this.learnedBitWidths.set(propName, candidate);
      try {
        if (candidate === -1) {
          br.readString();
        } else {
          br.skipBits(candidate);
        }
        if (
          this.validateLookaheadFromCurrentActor(
            node,
            frameIdx,
            frameTime,
            new Map(activeActors)
          )
        ) {
          br.restoreBitPos(propStartBitPos);
          if (candidate === -1) {
            return { type: 'String', value: br.readString() };
          }
          br.skipBits(candidate);
          return { type: 'Unknown', value: candidate };
        }
      } catch {
        // Candidate failed lookahead validation; continue probing next candidate.
      }
      this.learnedBitWidths.delete(propName);
    }

    br.restoreBitPos(propStartBitPos);
    const actorObjId = activeActors.get(actorId);
    const actorClassName = actorObjId !== undefined ? objects[actorObjId] || 'UnknownActor' : '';
    throw new Error(
      `[RLRC Decoder] Frame ${frameIdx} Actor ${actorId} (${actorClassName}) unknown property "${propName}" at bit ${propStartBitPos}; no candidate bitwidth synchronized subsequent frames.`
    );
  }

  public tryResyncFrameByStructDelta(
    frameIdx: number,
    frameTime: number,
    trace: readonly RLRCFramePropertyTraceEntry[]
  ): { readonly propName: string; readonly deltaBits: number } | null {
    const { br } = this.ctx;
    for (let i = trace.length - 1; i >= 0; i--) {
      const entry = trace[i];
      for (const deltaBits of STRUCT_EXPANSION_CANDIDATE_DELTAS) {
        const targetBitPos = entry.afterBitPos + deltaBits;
        if (targetBitPos <= entry.beforeBitPos || targetBitPos > br.totalBits) continue;
        const node = this.ctx.objToNode.get(entry.activeActorsSnapshot.get(entry.actorId) ?? -1);
        if (!node) continue;
        br.restoreBitPos(targetBitPos);
        this.learnedStructDeltas.set(entry.propName, deltaBits);
        try {
          if (
            this.validateLookaheadFromCurrentActor(
              node,
              frameIdx,
              frameTime,
              new Map(entry.activeActorsSnapshot)
            )
          ) {
            return { propName: entry.propName, deltaBits };
          }
        } catch {
          // Continue probing next delta
        }
        this.learnedStructDeltas.delete(entry.propName);
      }
    }
    return null;
  }

  public formatDiagnosticError(
    frameIdx: number,
    trace: readonly RLRCFramePropertyTraceEntry[],
    cause: string
  ): Error {
    const last = trace.length > 0 ? trace[trace.length - 1] : null;
    if (!last) {
      return new Error(`[RLRC Decoder] Frame ${frameIdx} misalignment: ${cause}`);
    }
    return new Error(
      `[RLRC Decoder] Frame ${frameIdx} Actor ${last.actorId} (${last.actorClassName}) unknown/misaligned property "${last.propName}" (streamId=${last.streamId}) at bit ${last.beforeBitPos}: ${cause}`
    );
  }

  private validateLookaheadFromCurrentActor(
    currentNode: RLRCResolvedClassNetCacheNode,
    frameIdx: number,
    frameTime: number,
    simActors: Map<number, number>
  ): boolean {
    this.consumeActorPropertiesLookahead(currentNode, simActors);
    this.consumeFrameActorsLookahead(simActors);

    const { br, expectedFrames } = this.ctx;
    const lookaheadCount = Math.min(2, Math.max(1, expectedFrames - frameIdx - 1));
    let prevTime = frameTime;

    for (let f = 0; f < lookaheadCount; f++) {
      if (br.bitsRemaining === 0) return true;
      if (br.bitsRemaining < 64) return false;
      const nextTime = br.readF32();
      const nextDelta = br.readF32();
      if (!isValidRLRCFrameHeader(nextTime, nextDelta, prevTime)) {
        return false;
      }
      if (nextTime === 0 && nextDelta === 0) return true;
      this.consumeFrameActorsLookahead(simActors);
      prevTime = nextTime;
    }

    if (frameIdx + lookaheadCount + 1 < expectedFrames && br.bitsRemaining >= 64) {
      const checkTime = br.readF32();
      const checkDelta = br.readF32();
      if (!isValidRLRCFrameHeader(checkTime, checkDelta, prevTime)) {
        return false;
      }
    }
    return true;
  }

  private consumeActorPropertiesLookahead(
    node: RLRCResolvedClassNetCacheNode,
    simActors: ReadonlyMap<number, number>
  ): void {
    const { br, objects, vectorMaxBits, version } = this.ctx;
    while (br.readBool()) {
      const streamId = br.readBitsMax(node.maxStreamId);
      const propObjId = node.props.get(streamId);
      if (propObjId === undefined) {
        throw new Error(`Invalid lookahead streamId=${streamId}`);
      }
      const propName = objects[propObjId] || '';
      const knownType = inferRLRCPropertyType(propName);
      if (knownType !== 'Unknown') {
        decodeRLRCPropertyAttributeByType(br, knownType, objects, vectorMaxBits, version);
        const extraDelta = this.learnedStructDeltas.get(propName);
        if (extraDelta !== undefined && extraDelta !== 0) {
          br.skipBits(extraDelta);
        }
      } else {
        const learned = this.learnedBitWidths.get(propName);
        if (learned === undefined) {
          const fallbackCandidates = getRLRCHeuristicCandidateBitWidths(propName);
          const firstFixed = fallbackCandidates.find((c) => c > 0) ?? 32;
          br.skipBits(firstFixed);
        } else if (learned === -1) {
          br.readString();
        } else {
          br.skipBits(learned);
        }
      }
      void simActors;
    }
  }

  private consumeFrameActorsLookahead(simActors: Map<number, number>): void {
    const { br, maxChannels, objects, objToNode, spawns, vectorMaxBits } = this.ctx;
    while (br.readBool()) {
      const actorId = br.readBitsMax(maxChannels);
      if (actorId >= maxChannels) {
        throw new Error(`Lookahead actorId=${actorId} out of range`);
      }
      const isOpen = br.readBool();
      if (isOpen) {
        const isNew = br.readBool();
        if (isNew) {
          if (this.doParseNewActorName) {
            const nameId = br.readI32();
            if (nameId < -1 || nameId > 100000) {
              throw new Error(`Invalid lookahead nameId=${nameId}`);
            }
          }
          br.readBit();
          const objectId = br.readI32();
          if (objectId < 0 || objectId >= objects.length) {
            throw new Error(`Lookahead objectId=${objectId} out of bounds`);
          }
          const spawn = spawns[objectId] ?? 'None';
          if (spawn === 'Location' || spawn === 'LocationAndRotation') {
            br.readCompressedVector(vectorMaxBits, 1.0);
          }
          if (spawn === 'LocationAndRotation') {
            br.readRotationShort();
          }
          simActors.set(actorId, objectId);
        } else {
          const objId = simActors.get(actorId);
          const node = objId !== undefined ? objToNode.get(objId) : undefined;
          if (!node) {
            throw new Error(`Lookahead missing actor=${actorId}`);
          }
          this.consumeActorPropertiesLookahead(node, simActors);
        }
      } else {
        simActors.delete(actorId);
      }
    }
  }
}
