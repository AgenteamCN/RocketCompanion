/**
 * RLReplayToRLRCConverter.ts
 * End-to-end pipeline converting a binary Rocket League .replay file (or serialized RLRC container)
 * into a 120Hz RLRC replay packet with roster filtering, vehicle loadout resolution,
 * 34-pad boost cooldown state machine, Hermite/SLERP resampling, inverse control synthesis,
 * and binary Track 0/1 container packing.
 */

import { buildBoostPadCooldownTimeline120Hz } from './catalog/RLRCBoostPadSpatialCatalog.ts';
import { resolveRLRCVehicleLoadout } from './catalog/RLRCVehicleLoadoutCatalog.ts';
import {
  buildRLRCContainerPacket,
  deserializeRLRCBinaryContainer,
  isBinaryRLRCContainer,
  serializeRLRCBinaryContainer,
} from './container/RLRCBinaryContainerCodec.ts';
import {
  createLazyTrack0FramesView,
  packRLRCFramesToTrack0Bytes,
} from './container/RLRCTrack0TimelineBatchPacker.ts';
import { decodeRLRCNetStreamFrames } from './parser/RLRCNetStreamBitDecoder.ts';
import { extractNetStreamRigidBodyAndBoostTimeline } from './parser/RLRCNetStreamRigidBodyAndBoostExtractor.ts';
import { extractRLRCNetStreamRosterAndLifecycle } from './parser/RLRCNetStreamRosterAndLifecycleExtractor.ts';
import { parseRLRCReplayHeaderAndBookmarks } from './parser/RLRCReplayHeaderAndBookmarkParser.ts';
import {
  RLRC_FIXED_DT,
  RLRC_TICK_RATE,
  type RLRCBookmarkRecord,
  type RLRCContainerPacket,
  type RLRCFrame120Hz,
  type RLRCInterpolationMethod,
  type RLRCParserOutput,
  type RLRCPlayerSlotMeta,
  type RLRCReplayHeaderMeta,
} from './RLRCReplayTypes.ts';
import { resampleRLRCReplayTo120Hz } from './synthesis/RLRCHermiteSlerpResampler.ts';
import { synthesizeControlsForTimeline120Hz } from './synthesis/RLRCInverseControlSynthesizer.ts';

export interface RLRCConverterOptions {
  readonly interpolationMethod?: RLRCInterpolationMethod;
  readonly synthesizeControls?: boolean;
  readonly includeKeyframeBookmarks?: boolean;
  readonly retainParserOutput?: boolean;
}

export interface RLRCConvertedReplaySession {
  readonly header: RLRCReplayHeaderMeta;
  readonly roster: readonly RLRCPlayerSlotMeta[];
  readonly bookmarks: readonly RLRCBookmarkRecord[];
  readonly frames120Hz: readonly RLRCFrame120Hz[];
  readonly containerPacket: RLRCContainerPacket;
  readonly parserOutput: RLRCParserOutput | null;
  readonly interpolationMethod: RLRCInterpolationMethod;
}

function mergeAndEnrichBookmarks30Hz(
  headerBookmarks: readonly RLRCBookmarkRecord[],
  demolishBookmarks: readonly RLRCBookmarkRecord[],
  roster: readonly RLRCPlayerSlotMeta[],
  includeKeyframes: boolean
): RLRCBookmarkRecord[] {
  const slotByLowerName = new Map<string, RLRCPlayerSlotMeta>();
  for (const player of roster) {
    slotByLowerName.set(player.userName.trim().toLowerCase(), player);
  }

  const combined: RLRCBookmarkRecord[] = [];
  for (const bm of headerBookmarks) {
    if (!includeKeyframes && bm.kind === 'ue-keyframe') continue;
    if ((bm.kind === 'goal' || bm.kind === 'save') && bm.slotIndex < 0) {
      const colonIdx = bm.label.indexOf(':');
      const afterColon = colonIdx >= 0 ? bm.label.slice(colonIdx + 1).trim() : bm.label.trim();
      const playerRaw = afterColon.replace(/\s*\((Blue|Orange)\)\s*$/i, '').trim();
      const matched = slotByLowerName.get(playerRaw.toLowerCase());
      if (matched) {
        combined.push({
          ...bm,
          slotIndex: matched.slotIndex,
          team: matched.team,
        });
        continue;
      }
    }
    combined.push(bm);
  }

  for (const dm of demolishBookmarks) {
    combined.push(dm);
  }

  combined.sort((a, b) => a.sourceFrame30Hz - b.sourceFrame30Hz);
  return combined;
}

export function buildRLRCSessionFromParserOutput(
  parserOutput: RLRCParserOutput,
  options: RLRCConverterOptions = {}
): RLRCConvertedReplaySession {
  const method: RLRCInterpolationMethod = options.interpolationMethod ?? 'hermite-clamped';
  const synthesizeControls = options.synthesizeControls !== false;
  const nfs = parserOutput.networkFrames;

  let boostPadCooldownsByFrame120Hz: readonly Float32Array[] | undefined;
  if (nfs.length > 0) {
    const t0 = nfs[0].timeSeconds;
    const tEnd = nfs[nfs.length - 1].timeSeconds;
    const dur = Math.max(0, tEnd - t0);
    const count120 = Math.max(1, Math.round(dur * RLRC_TICK_RATE) + 1);
    const timestamps = new Float64Array(count120);
    for (let f = 0; f < count120; f++) {
      timestamps[f] = Math.min(tEnd, t0 + f * RLRC_FIXED_DT);
    }
    const alignedPadEvents = parserOutput.boostPadEvents.map((ev) => {
      const nf = nfs[ev.sourceFrame30Hz];
      return nf && Math.abs(nf.timeSeconds - ev.timeSeconds) > 1e-4
        ? { ...ev, timeSeconds: nf.timeSeconds }
        : ev;
    });
    boostPadCooldownsByFrame120Hz = buildBoostPadCooldownTimeline120Hz(
      alignedPadEvents,
      timestamps
    );
  }

  const resampled = resampleRLRCReplayTo120Hz(parserOutput, {
    method,
    boostPadCooldownsByFrame120Hz,
    deferTrack0Packing: true,
  });

  if (synthesizeControls && resampled.frames120Hz.length > 0) {
    synthesizeControlsForTimeline120Hz(resampled.frames120Hz);
  }

  const stateInputTrackBytes = packRLRCFramesToTrack0Bytes(resampled.frames120Hz);
  const containerPacket = buildRLRCContainerPacket({
    header: resampled.header,
    roster: resampled.roster,
    bookmarks: resampled.bookmarks,
    frames120Hz: resampled.frames120Hz,
    stateInputTrackBytes,
  });
  const lazyFrames120Hz = createLazyTrack0FramesView(stateInputTrackBytes);

  return {
    header: resampled.header,
    roster: resampled.roster,
    bookmarks: resampled.bookmarks,
    frames120Hz: lazyFrames120Hz,
    containerPacket,
    parserOutput: options.retainParserOutput ? parserOutput : null,
    interpolationMethod: method,
  };
}

export function convertRLReplayBufferToRLRC(
  bytesOrBuffer: Uint8Array | ArrayBuffer,
  options: RLRCConverterOptions = {}
): RLRCConvertedReplaySession {
  const u8 = bytesOrBuffer instanceof Uint8Array ? bytesOrBuffer : new Uint8Array(bytesOrBuffer);

  if (isBinaryRLRCContainer(u8)) {
    const deserialized = deserializeRLRCBinaryContainer(u8);
    return {
      header: deserialized.header,
      roster: deserialized.roster,
      bookmarks: deserialized.bookmarks,
      frames120Hz: createLazyTrack0FramesView(deserialized.stateInputTrackBytes),
      containerPacket: {
        header: deserialized.header,
        roster: deserialized.roster,
        bookmarks: deserialized.bookmarks,
        stateInputTrackBytes: deserialized.stateInputTrackBytes,
        bookmarkTrackBytes: deserialized.bookmarkTrackBytes,
      },
      parserOutput: null,
      interpolationMethod: options.interpolationMethod ?? 'hermite-clamped',
    };
  }

  const parsedHeader = parseRLRCReplayHeaderAndBookmarks(u8, {
    includeKeyframes: options.includeKeyframeBookmarks !== false,
  });

  let decodedNetStream: ReturnType<typeof decodeRLRCNetStreamFrames> | null =
    decodeRLRCNetStreamFrames(parsedHeader);
  const keyframeSet30Hz = new Set<number>(parsedHeader.keyframes.map((kf) => kf.frame));

  const rosterAndLifecycle = extractRLRCNetStreamRosterAndLifecycle({
    objects: parsedHeader.objects,
    frames: decodedNetStream.frames,
    keyframeIndices30Hz: keyframeSet30Hz,
    loadoutResolver: resolveRLRCVehicleLoadout,
  });

  const boostPadEvents = decodedNetStream.boostPadEvents30Hz;
  const rigidBodyTimeline = extractNetStreamRigidBodyAndBoostTimeline({
    frames: decodedNetStream.frames,
    objects: parsedHeader.objects,
    names: parsedHeader.names,
    keyframeIndices: keyframeSet30Hz,
    roster: rosterAndLifecycle.roster,
    slotByPriActorId: rosterAndLifecycle.slotIndexByPriActorId,
    boostPadEvents,
  });

  decodedNetStream.frames.length = 0;
  decodedNetStream = null;

  const mergedBookmarks = mergeAndEnrichBookmarks30Hz(
    parsedHeader.bookmarks,
    rigidBodyTimeline.demolishBookmarks,
    rosterAndLifecycle.roster,
    options.includeKeyframeBookmarks !== false
  );

  const parserOutput: RLRCParserOutput = {
    header: parsedHeader.header,
    roster: rosterAndLifecycle.roster,
    networkFrames: rigidBodyTimeline.networkFrames,
    lifeSegments: rosterAndLifecycle.lifeSegments,
    boostPadEvents,
    bookmarks: mergedBookmarks,
  };

  return buildRLRCSessionFromParserOutput(parserOutput, options);
}

export function exportRLRCSessionToBinaryBytes(session: RLRCConvertedReplaySession): Uint8Array {
  return serializeRLRCBinaryContainer(session.containerPacket);
}
