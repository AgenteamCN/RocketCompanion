/**
 * RLRCRCReplayV2PayloadPipeline.ts
 * Maps RLRC 120Hz container packets to/from RCREPLAY V2 binary payloads.
 */

import { INCIDENT_EVENT_TYPES, MATCH_SIGNALS } from '../../../physics/RocketSimConstants.ts';
import { unfilterAndUntransposeStateInputTrack } from '../../container/RCReplayBinaryDecoder.ts';
import {
  decodeIncidentFrom64Bytes,
  decodeSignalFrom64Bytes,
  encodeIncidentTo64Bytes,
  RC_REPLAY_EVENT_STRIDE,
  type DecodedIncidentEvent,
} from '../../container/RCReplayBinarySchema.ts';
import {
  RLRC_TICK_RATE,
  RLRC_TRACK0_FRAME_STRIDE_BYTES as STRIDE,
  type RLRCBookmarkRecord,
  type RLRCContainerPacket,
  type RLRCFrame120Hz,
  type RLRCPlayerSlotMeta,
  type RLRCReplayHeaderMeta,
  type RLRCTeamIndex,
} from '../RLRCReplayTypes.ts';
import {
  detectBallAndGoalAudioEdges,
  detectCarAndPadAudioEdges,
  detectCollisionAndDemoAudioEdges,
  detectMatchStateAndBookmarkAudioEdges,
  type AudioEdgeTrackerState,
  type RLRCSynthesizedAudioFrameBatch,
} from '../runtime/RLRCPlaybackAudioEdgeDetectorPipeline.ts';
import {
  restoreRLRCTrack0FromSanitizedStateInput,
  sanitizeRLRCTrack0AndSynthesizeSignals,
} from './RLRCRCReplayV2SignalAndTrackSanitizer.ts';
import {
  createLazyTrack0FramesView,
  decodeRLRCBookmarksFromTrack1Bytes,
  encodeRLRCBookmarksToTrack1Bytes,
} from './RLRCTrack0TimelineBatchPacker.ts';

export interface RLRCReplayV2ExportPayload {
  readonly mode: string;
  readonly arenaPreset: number;
  readonly tickRate: number;
  readonly frameCount: number;
  readonly durationSec: number;
  readonly durationSeconds: number;
  readonly winner: 'blue' | 'orange' | 'draw';
  readonly blueScore: number;
  readonly orangeScore: number;
  readonly winReason: number;
  readonly createdAtIso: string;
  readonly roster: ReadonlyArray<Record<string, unknown>>;
  readonly loadouts: ReadonlyArray<Record<string, unknown>>;
  readonly directorReplayMeta: {
    readonly rlrcHeader: RLRCReplayHeaderMeta;
  };
  readonly stateInputBytes: Uint8Array;
  readonly incidentBytes: Uint8Array;
  readonly signalBytes: Uint8Array;
  readonly nativeEventBytes: Uint8Array;
  readonly keyframeBytes: Uint8Array;
}

export interface DecodedRCREPLAYV2TracksForRLRC {
  readonly header: RLRCReplayHeaderMeta;
  readonly roster: readonly RLRCPlayerSlotMeta[];
  readonly bookmarks: readonly RLRCBookmarkRecord[];
  readonly stateInputTrackBytes: Uint8Array;
}

function synthesizeIncidentsFromRLRCFrames(packet: RLRCContainerPacket): Uint8Array {
  const frames = createLazyTrack0FramesView(packet.stateInputTrackBytes, 8);
  const n = frames.length;
  const specs: Array<{ frameIndex: number; inc: Partial<DecodedIncidentEvent> }> = [];
  if (n > 1) {
    const tracker: AudioEdgeTrackerState = {
      lastHitTick: -999,
      lastGoalTick: -999,
      lastOtTick: -999,
      lastCdNum: frames[0].roundCountdownNumber,
      lastBump: new Int32Array(8).fill(-999),
      lastDemo: new Int32Array(8).fill(-999),
      firedBm: new Set<number>(),
    };
    const ring: RLRCFrame120Hz[] = [frames[0]];
    let prev = frames[0];
    for (let f = 1; f < n; f++) {
      const cur = frames[f];
      const anc = ring[0] ?? prev;
      const batch: RLRCSynthesizedAudioFrameBatch = { discreteEvents: [], directCues: [] };
      detectCarAndPadAudioEdges(prev, cur, 0, batch);
      detectBallAndGoalAudioEdges(prev, anc, cur, tracker, batch);
      detectCollisionAndDemoAudioEdges(prev, anc, cur, tracker, batch);
      detectMatchStateAndBookmarkAudioEdges(prev, cur, packet.bookmarks, tracker, batch);
      for (const e of batch.discreteEvents) {
        const [x = 0, y = 0, z = 0] = e.pos ?? [0, 0, 0];
        const primaryId = e.eventType === INCIDENT_EVENT_TYPES.CAR_CAR_DEMO ? e.entityB : e.entityA;
        specs.push({
          frameIndex: f,
          inc: {
            type: e.eventType,
            tick: f,
            frameIndex: f,
            x,
            y,
            z,
            posX: x,
            posY: y,
            posZ: z,
            speed: e.value,
            relSpeed: e.value,
            impulse: e.value,
            normalRelVel: e.value,
            primaryId,
            secondaryId: e.entityB,
            carIndex: primaryId,
            subType: e.eventType === INCIDENT_EVENT_TYPES.BOOST_PICKUP && e.value >= 0.5 ? 1 : 0,
          },
        });
      }
      prev = cur;
      ring.push(cur);
      if (ring.length > 5) ring.shift();
    }
  }
  const hasGoalAt = new Set(
    specs
      .filter((s) => s.inc.type === INCIDENT_EVENT_TYPES.GOAL_SCORED)
      .map((s) => Math.floor(s.frameIndex / 60))
  );
  for (const bm of packet.bookmarks) {
    if (bm.kind !== 'goal' && bm.kind !== 'demolish') continue;
    const f = Math.max(0, Math.min(Math.max(0, n - 1), Math.trunc(bm.frameIndex120Hz)));
    if (bm.kind === 'goal' && hasGoalAt.has(Math.floor(f / 60))) continue;
    const c = Math.max(0, bm.slotIndex);
    const t = bm.team === 1 ? 1 : 0;
    const pos =
      bm.kind === 'demolish' && n > 0
        ? frames[f]?.cars[c]?.rigidBody.position
        : frames[f]?.ball.rigidBody.position;
    specs.push({
      frameIndex: f,
      inc: {
        type:
          bm.kind === 'goal' ? INCIDENT_EVENT_TYPES.GOAL_SCORED : INCIDENT_EVENT_TYPES.CAR_CAR_DEMO,
        tick: f,
        frameIndex: f,
        x: pos?.x ?? 0,
        y: pos?.y ?? 0,
        z: pos?.z ?? 0,
        carIndex: c,
        primaryId: c,
        team: t,
        secondaryId: t,
      },
    });
  }
  specs.sort((a, b) => a.frameIndex - b.frameIndex);
  const out = new Uint8Array(specs.length * RC_REPLAY_EVENT_STRIDE);
  for (let i = 0; i < specs.length; i++) {
    encodeIncidentTo64Bytes(specs[i].inc, out, i * RC_REPLAY_EVENT_STRIDE, specs[i].frameIndex);
  }
  return out;
}

export function mapRLRCPacketToRCReplayV2Payload(
  packet: RLRCContainerPacket
): RLRCReplayV2ExportPayload {
  const frameCount = Math.floor(packet.stateInputTrackBytes.byteLength / STRIDE);
  const incidentBytes = synthesizeIncidentsFromRLRCFrames(packet);
  const {
    sanitizedStateInputBytes,
    signalBytes,
    regulationDurationSeconds,
    rlrcNativeEvents,
    rlrcKeyframes,
  } = sanitizeRLRCTrack0AndSynthesizeSignals(packet);
  const nativeEventBytes = encodeRLRCBookmarksToTrack1Bytes(rlrcNativeEvents);
  const keyframeBytes = encodeRLRCBookmarksToTrack1Bytes(rlrcKeyframes);

  const roster = packet.roster.map((r) => ({
    ...r,
    carIndex: r.slotIndex,
    entityId: r.slotIndex,
    name: r.userName,
    username: r.userName,
    colorHex: r.primaryColorHex,
    isSelf: r.slotIndex === 0,
    isPlayer: r.slotIndex === 0,
  }));
  const blueScore = packet.header.blueScore ?? 0;
  const orangeScore = packet.header.orangeScore ?? 0;
  const winner = blueScore > orangeScore ? 'blue' : orangeScore > blueScore ? 'orange' : 'draw';

  return {
    mode: 'match',
    arenaPreset: 0,
    tickRate: RLRC_TICK_RATE,
    frameCount,
    durationSec: Number((frameCount / RLRC_TICK_RATE).toFixed(2)),
    durationSeconds: regulationDurationSeconds,
    winner,
    blueScore,
    orangeScore,
    winReason: 0,
    createdAtIso: packet.header.date || new Date().toISOString(),
    roster,
    loadouts: roster,
    directorReplayMeta: { rlrcHeader: packet.header },
    stateInputBytes: sanitizedStateInputBytes,
    incidentBytes,
    signalBytes,
    nativeEventBytes,
    keyframeBytes,
  };
}

export function extractRLRCTracksFromRCReplayV2Bytes(
  u8: Uint8Array
): DecodedRCREPLAYV2TracksForRLRC {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const metaLen = dv.getUint32(12, true);
  if (16 + metaLen > u8.byteLength) throw new Error('Corrupt RCREPLAY V2 metadata JSON length.');

  const env = JSON.parse(new TextDecoder().decode(u8.subarray(16, 16 + metaLen))) as {
    matchInfo?: Record<string, unknown>;
    tracks?: Record<
      string,
      { offset: number; byteLength: number; count: number; stride?: number; encoding?: string }
    >;
  };

  const m = env.matchInfo ?? {};
  const tracks = env.tracks ?? {};
  const st = tracks.stateInput ?? { offset: 0, byteLength: 0, count: 0 };
  const frameCount = Number(st.count ?? m.frameCount ?? 0);
  const stride = Number(st.stride || STRIDE);
  const rawTrackA =
    frameCount > 0 && st.byteLength > 0
      ? u8.subarray(st.offset, st.offset + st.byteLength)
      : new Uint8Array(0);
  const stateInputTrackBytes =
    st.encoding === 'xor-delta-bytetran-v1'
      ? unfilterAndUntransposeStateInputTrack(rawTrackA, frameCount, stride)
      : u8.slice(st.offset, st.offset + st.byteLength);

  const dirMeta = (m.directorReplayMeta ?? {}) as {
    rlrcHeader?: RLRCReplayHeaderMeta;
    rlrcBookmarks?: readonly RLRCBookmarkRecord[];
  };

  const rawRoster = Array.isArray(m.roster) ? m.roster : [];
  const roster: RLRCPlayerSlotMeta[] = rawRoster.map((e: Record<string, unknown>, idx: number) => {
    const slotIndex =
      typeof e.slotIndex === 'number'
        ? e.slotIndex
        : typeof e.carIndex === 'number'
          ? e.carIndex
          : idx;
    const team: RLRCTeamIndex = e.team === 1 || e.team === 'orange' ? 1 : 0;
    const pColor = e.primaryColorHex ?? e.colorHex;
    return {
      slotIndex,
      userName: String(e.userName ?? e.name ?? e.username ?? `Player ${slotIndex + 1}`),
      team,
      priActorId: typeof e.priActorId === 'number' ? e.priActorId : slotIndex + 1,
      bodyProductId: typeof e.bodyProductId === 'number' ? e.bodyProductId : 23,
      hitboxId: (typeof e.hitboxId === 'string'
        ? e.hitboxId
        : 'hitbox-octane') as RLRCPlayerSlotMeta['hitboxId'],
      visualId: (typeof e.visualId === 'string'
        ? e.visualId
        : 'fennec') as RLRCPlayerSlotMeta['visualId'],
      ...(typeof pColor === 'string' ? { primaryColorHex: pColor } : {}),
      ...(typeof e.accentColorHex === 'string' ? { accentColorHex: e.accentColorHex } : {}),
      ...(e.cameraSettings && typeof e.cameraSettings === 'object'
        ? { cameraSettings: e.cameraSettings as RLRCPlayerSlotMeta['cameraSettings'] }
        : {}),
    };
  });

  const header: RLRCReplayHeaderMeta = dirMeta.rlrcHeader ?? {
    replayId: String(m.replayId ?? 'RCREPLAY-V2'),
    replayName: String(m.mode ?? 'match'),
    mapName: 'Stadium_P',
    matchType: String(m.mode ?? 'match'),
    teamSize: Math.max(1, Math.ceil(Math.max(2, roster.length) / 2)),
    recordFps: 30,
    sourceFrameCount: Math.ceil(frameCount / 4),
    frameCount120Hz: frameCount,
    durationSeconds: Number(m.durationSeconds ?? m.durationSec ?? frameCount / RLRC_TICK_RATE),
    date: String(m.createdAtIso ?? ''),
    blueScore: Number(m.blueScore ?? 0),
    orangeScore: Number(m.orangeScore ?? 0),
    part1CrcValid: true,
    part2CrcValid: true,
  };

  const sigToc = tracks.signals;
  const sigSlice =
    sigToc && sigToc.count > 0 && sigToc.byteLength > 0
      ? u8.subarray(sigToc.offset, sigToc.offset + sigToc.byteLength)
      : undefined;
  restoreRLRCTrack0FromSanitizedStateInput(stateInputTrackBytes, roster.length, header, sigSlice);

  const navToc = tracks.nativeEvents;
  const kfToc = tracks.keyframes;
  const hasBinaryTracks4And5 = Boolean(
    (navToc && navToc.byteLength > 0) || (kfToc && kfToc.byteLength > 0)
  );
  const bookmarks: RLRCBookmarkRecord[] = [];
  if (hasBinaryTracks4And5) {
    if (navToc && navToc.byteLength > 0) {
      bookmarks.push(
        ...decodeRLRCBookmarksFromTrack1Bytes(
          u8.subarray(navToc.offset, navToc.offset + navToc.byteLength)
        )
      );
    }
    if (kfToc && kfToc.byteLength > 0) {
      bookmarks.push(
        ...decodeRLRCBookmarksFromTrack1Bytes(
          u8.subarray(kfToc.offset, kfToc.offset + kfToc.byteLength)
        )
      );
    }
    bookmarks.sort((a, b) => a.frameIndex120Hz - b.frameIndex120Hz);
  } else if (Array.isArray(dirMeta.rlrcBookmarks)) {
    bookmarks.push(...dirMeta.rlrcBookmarks);
  } else {
    const incToc = tracks.incidents;
    if (incToc && incToc.count > 0 && incToc.byteLength > 0) {
      const incSlice = u8.subarray(incToc.offset, incToc.offset + incToc.byteLength);
      for (let i = 0; i < incToc.count; i++) {
        const inc = decodeIncidentFrom64Bytes(incSlice, i * RC_REPLAY_EVENT_STRIDE);
        if (
          inc.type === INCIDENT_EVENT_TYPES.GOAL_SCORED ||
          inc.type === INCIDENT_EVENT_TYPES.CAR_CAR_DEMO
        ) {
          const f = Math.max(0, inc.frameIndex || inc.tick || 0);
          const isGoal = inc.type === INCIDENT_EVENT_TYPES.GOAL_SCORED;
          bookmarks.push({
            kind: isGoal ? 'goal' : 'demolish',
            frameIndex120Hz: f,
            sourceFrame30Hz: Math.floor(f / 4),
            timeSeconds: f / RLRC_TICK_RATE,
            slotIndex: inc.carIndex ?? 0,
            team: inc.team === 1 ? 1 : 0,
            label: isGoal ? 'Goal' : 'Demolish',
          });
        }
      }
    }
    if (sigSlice && sigToc) {
      for (let i = 0; i < sigToc.count; i++) {
        const sig = decodeSignalFrom64Bytes(sigSlice, i * RC_REPLAY_EVENT_STRIDE);
        if (
          sig.signalType !== MATCH_SIGNALS.KICKOFF_START &&
          sig.signalType !== MATCH_SIGNALS.KICKOFF_WILL_START
        ) {
          continue;
        }
        const f = Math.max(0, sig.frameIndex || sig.tick || 0);
        bookmarks.push({
          kind: 'kickoff',
          frameIndex120Hz: f,
          sourceFrame30Hz: sig.param1 || Math.floor(f / 4),
          timeSeconds: f / RLRC_TICK_RATE,
          slotIndex: sig.param2 ?? -1,
          team: -1,
          label: 'Kickoff',
        });
      }
    }
  }

  return { header, roster, bookmarks, stateInputTrackBytes };
}
