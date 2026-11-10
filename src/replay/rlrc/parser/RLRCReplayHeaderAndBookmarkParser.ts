/**
 * RLRCReplayHeaderAndBookmarkParser.ts
 * Parses .replay Part 1 header properties, Part 2 keyframes/tick_marks/tables,
 * dual CRC32 checksums, and delegates bookmark/goal/highlight extraction to
 * RLRCBookmarkGoalAndHighlightExtractor.
 */

import {
  RLRC_TICK_RATE,
  type RLRCBookmarkRecord,
  type RLRCReplayHeaderMeta,
} from '../RLRCReplayTypes.ts';
import {
  buildRLRCBookmarksFromHeaderAndPart2,
  estimateSourceFrameTimeSeconds,
  extractGoalsHighlightsAndStatsFromHeaderProps,
  type RLRCBookmarkBuildOptions,
  type RLRCGoalHeaderEntry,
  type RLRCHighlightHeaderEntry,
  type RLRCKeyFrameEntry,
  type RLRCPlayerStatHeaderEntry,
  type RLRCTickMarkEntry,
} from './RLRCBookmarkGoalAndHighlightExtractor.ts';
import {
  computeRLReplayCrc32,
  readUE3PropertyTree,
  readUE3Table,
  RLRCByteReader,
} from './RLRCByteReaderAndCrc32.ts';

export type {
  RLRCBookmarkBuildOptions,
  RLRCGoalHeaderEntry,
  RLRCHighlightHeaderEntry,
  RLRCKeyFrameEntry,
  RLRCPlayerStatHeaderEntry,
  RLRCTickMarkEntry,
};

export interface RLRCDebugInfoEntry {
  frame: number;
  user: string;
  text: string;
}

export interface RLRCClassIndexEntry {
  className: string;
  objectIndex: number;
}

export interface RLRCNetCacheProperty {
  objectInd: number;
  streamId: number;
}

export interface RLRCNetCacheNode {
  objectInd: number;
  parentId: number;
  cacheId: number;
  properties: readonly RLRCNetCacheProperty[];
}

export interface RLRCParsedReplayHeaderAndBookmarks {
  header: RLRCReplayHeaderMeta;
  part1Length: number;
  part1Crc: number;
  part1CrcValid: boolean;
  part2Length: number;
  part2Crc: number;
  part2CrcValid: boolean;
  majorVersion: number;
  minorVersion: number;
  netVersion: number;
  gameType: string;
  maxChannels: number;
  matchGuid: string;
  buildVersion: string;
  matchStartEpoch: string;
  properties: Readonly<Record<string, unknown>>;
  goals: readonly RLRCGoalHeaderEntry[];
  highlights: readonly RLRCHighlightHeaderEntry[];
  playerStats: readonly RLRCPlayerStatHeaderEntry[];
  levels: readonly string[];
  keyframes: readonly RLRCKeyFrameEntry[];
  netstreamBytes: Uint8Array;
  debugInfo: readonly RLRCDebugInfoEntry[];
  tickMarks: readonly RLRCTickMarkEntry[];
  packages: readonly string[];
  objects: readonly string[];
  names: readonly string[];
  classIndices: readonly RLRCClassIndexEntry[];
  netCache: readonly RLRCNetCacheNode[];
  bookmarks: readonly RLRCBookmarkRecord[];
}

export function parseRLRCReplayHeaderAndBookmarks(
  buffer: ArrayBuffer | Uint8Array,
  options?: RLRCBookmarkBuildOptions
): RLRCParsedReplayHeaderAndBookmarks {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.byteLength < 32) throw new Error('Invalid .replay: buffer < 32B.');

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const part1Length = view.getUint32(0, true);
  const part1Crc = view.getUint32(4, true);
  const p2Off = 8 + part1Length;
  if (p2Off + 8 > bytes.byteLength) throw new Error('Invalid .replay: Part 1 out of bounds.');

  const part1Slice = bytes.subarray(8, p2Off);
  const part1CrcValid = computeRLReplayCrc32(part1Slice) === part1Crc;

  const part2Length = view.getUint32(p2Off, true);
  const part2Crc = view.getUint32(p2Off + 4, true);
  if (p2Off + 8 + part2Length > bytes.byteLength) {
    throw new Error('Invalid .replay: Part 2 out of bounds.');
  }

  const part2Slice = bytes.subarray(p2Off + 8, p2Off + 8 + part2Length);
  const part2CrcValid = computeRLReplayCrc32(part2Slice) === part2Crc;

  const p1 = new RLRCByteReader(part1Slice);
  const majorVersion = p1.readI32();
  const minorVersion = p1.readI32();
  const netVersion = majorVersion > 865 && minorVersion > 17 ? p1.readI32() : 0;
  const gameType = p1.readUEString();
  const props = readUE3PropertyTree(p1);
  const { goals, highlights, playerStats } = extractGoalsHighlightsAndStatsFromHeaderProps(props);

  const p2 = new RLRCByteReader(part2Slice);
  const readStr = (r: RLRCByteReader): string => r.readUEString();
  const levels = readUE3Table(p2, readStr);
  const keyframes = readUE3Table(p2, (r) => ({
    time: r.readF32(),
    frame: r.readI32(),
    bitPosition: r.readI32(),
  }));
  const netstreamBytes = p2.readBytes(Math.max(0, p2.readI32()));
  const debugInfo = readUE3Table(p2, (r) => ({
    frame: r.readI32(),
    user: r.readUEString(),
    text: r.readUEString(),
  }));
  const tickMarks = readUE3Table(p2, (r) => ({
    description: r.readUEString(),
    frame: r.readI32(),
  }));
  const packages = readUE3Table(p2, readStr);
  const objects = readUE3Table(p2, readStr);
  const names = readUE3Table(p2, readStr);
  const classIndices = readUE3Table(p2, (r) => ({
    className: r.readUEString(),
    objectIndex: r.readI32(),
  }));
  const netCache = readUE3Table(p2, (r) => ({
    objectInd: r.readI32(),
    parentId: r.readI32(),
    cacheId: r.readI32(),
    properties: readUE3Table(r, (pr) => ({ objectInd: pr.readI32(), streamId: pr.readI32() })),
  }));

  const recordFps = Number(props.RecordFPS) || 30.0;
  const sourceFrameCount = Math.max(0, Math.trunc(Number(props.NumFrames) || 0));
  const totalSeconds = Number(props.TotalSecondsPlayed) || 0;
  const estEnd =
    sourceFrameCount > 0
      ? estimateSourceFrameTimeSeconds(
          sourceFrameCount - 1,
          keyframes,
          recordFps,
          options?.frameTimesSeconds
        ) - (keyframes[0]?.time ?? 0)
      : 0;
  const durationSeconds = totalSeconds > 0 ? totalSeconds : Math.max(0, estEnd);
  const frameCount120Hz = Math.max(0, Math.round(durationSeconds * RLRC_TICK_RATE));
  const blueScore =
    props.Team0Score !== undefined
      ? Number(props.Team0Score)
      : goals.filter((g) => g.playerTeam === 0).length;
  const orangeScore =
    props.Team1Score !== undefined
      ? Number(props.Team1Score)
      : goals.filter((g) => g.playerTeam === 1).length;

  return {
    header: {
      replayId: String(props.Id || ''),
      replayName: String(props.ReplayName || ''),
      mapName: String(props.MapName || ''),
      matchType: String(props.MatchType || ''),
      teamSize: Number(props.TeamSize) || 3,
      recordFps,
      sourceFrameCount,
      frameCount120Hz,
      durationSeconds,
      date: String(props.Date || ''),
      blueScore,
      orangeScore,
      part1CrcValid,
      part2CrcValid,
    },
    part1Length,
    part1Crc,
    part1CrcValid,
    part2Length,
    part2Crc,
    part2CrcValid,
    majorVersion,
    minorVersion,
    netVersion,
    gameType,
    maxChannels: Number(props.MaxChannels) || 2047,
    matchGuid: String(props.MatchGUID || ''),
    buildVersion: String(props.BuildVersion || ''),
    matchStartEpoch: String(props.MatchStartEpoch || '0'),
    properties: props,
    goals,
    highlights,
    playerStats,
    levels,
    keyframes,
    netstreamBytes,
    debugInfo,
    tickMarks,
    packages,
    objects,
    names,
    classIndices,
    netCache,
    bookmarks: buildRLRCBookmarksFromHeaderAndPart2(
      goals,
      tickMarks,
      keyframes,
      recordFps,
      options
    ),
  };
}

export const parseRLReplayBinaryContainer = parseRLRCReplayHeaderAndBookmarks;
