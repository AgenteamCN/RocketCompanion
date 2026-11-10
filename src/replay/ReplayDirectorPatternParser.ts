/**
 * ReplayDirectorPatternParser.ts
 * Decompresses and parses imported Replay Director diagnostic containers (.rcgr.gz, .csv, .json).
 */

import { REPLAY_TICK_RATE } from './ReplayRingBuffer.ts';
import {
  INCIDENT_EVENT_TYPES,
  PHYSICS_EVENT_TYPES,
  MATCH_SIGNALS,
} from '../physics/RocketSimConstants.ts';
import { resolveGoalExplosionFrameIndex } from './ReplayDirectorGazeSolver.ts';
import { deserializeRCReplayBinaryContainer } from './container/RCReplayBinaryDecoder.ts';
import { isBinaryRCReplayContainer } from './container/RCReplayBinarySchema.ts';
import { round3 } from './ReplayDirectorSceneAnalysis.ts';
import { resolveGoalReplayWindowBounds } from './ReplayPlaybackState.ts';
import { parseDirectorDiagnosticPatternCsv } from './ReplayDirectorCsvParser.ts';
import {
  parseDirectorDiagnosticPatternJson,
  type ParsedDirectorDiagnosticPattern,
} from './ReplayDirectorLegacyFormatParser.ts';
import {
  normalizeReplayDirectorCarEntry,
  type RawReplayCarEntryLike,
} from './replayDirectorCarRosterPipeline.ts';

export type { ParsedDirectorDiagnosticPattern };

async function decompressBytesIfGzip(bytesOrBuffer: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  const u8 = bytesOrBuffer instanceof Uint8Array ? bytesOrBuffer : new Uint8Array(bytesOrBuffer);
  if (u8.byteLength >= 2 && u8[0] === 0x1f && u8[1] === 0x8b) {
    if (typeof DecompressionStream !== 'undefined') {
      const ds = new DecompressionStream('gzip');
      if (typeof Blob !== 'undefined' && typeof Blob.prototype.stream === 'function') {
        const decompressedStream = new Blob([u8 as BlobPart]).stream().pipeThrough(ds);
        const buf = await new Response(decompressedStream).arrayBuffer();
        return new Uint8Array(buf);
      }
      const readPromise = new Response(ds.readable).arrayBuffer();
      const writer = ds.writable.getWriter();
      await writer.write(u8 as BufferSource);
      await writer.close();
      const buf = await readPromise;
      return new Uint8Array(buf);
    }
  }
  return u8;
}

/**
 * Parses a decompressed V2 RCREPLAY / RCGR binary container (`Uint8Array`) into replay frames,
 * full multi-car 3D snapshots, and Director Camera telemetry.
 */
export function parseDirectorDiagnosticContainerBytes(
  bytesOrBuffer: Uint8Array | ArrayBuffer,
  fileName: string = 'imported.rcgr.gz'
): ParsedDirectorDiagnosticPattern | null {
  const u8 = bytesOrBuffer instanceof Uint8Array ? bytesOrBuffer : new Uint8Array(bytesOrBuffer);
  if (!isBinaryRCReplayContainer(u8)) return null;

  const decoded = deserializeRCReplayBinaryContainer(u8);
  if (!decoded || !Array.isArray(decoded.frameSlots) || decoded.frameSlots.length === 0) {
    return null;
  }

  const dMeta = (decoded.metadata?.directorReplayMeta || null) as {
    recordedDirectorFrames?: Array<Record<string, number>> | null;
    carEntries?: RawReplayCarEntryLike[] | null;
    scoringTeam?: number;
    scorerCarIndex?: number;
    goalLineFrameIdx?: number;
    lastScoringTouchFrameIdx?: number;
    selectedReplayFrameIndex?: number;
    lateralBias?: number;
    touchTimeline?: Array<{
      replayFrameIndex?: number;
      frameId?: number;
      carIndex?: number;
      team?: number;
      ballPos?: number[];
    }>;
    initialSettledCarPos?: { carIndex?: number; x: number; y: number; z: number } | null;
    directorConfig?: Record<string, unknown> | null;
    anomalyPeaks?: Record<string, unknown> | null;
    trajectorySmoothnessSummary?: Record<string, unknown> | null;
  } | null;
  const recordedRows = Array.isArray(dMeta?.recordedDirectorFrames)
    ? dMeta.recordedDirectorFrames
    : null;

  const rawMetaEntries: RawReplayCarEntryLike[] =
    Array.isArray(dMeta?.carEntries) && dMeta.carEntries.length > 0
      ? dMeta.carEntries
      : Array.isArray(decoded.metadata?.roster) && decoded.metadata.roster.length > 0
        ? (decoded.metadata.roster as RawReplayCarEntryLike[])
        : Array.isArray(decoded.metadata?.loadouts)
          ? (decoded.metadata.loadouts as RawReplayCarEntryLike[])
          : [];
  const rawLoadouts: RawReplayCarEntryLike[] = Array.isArray(decoded.metadata?.loadouts)
    ? (decoded.metadata.loadouts as RawReplayCarEntryLike[])
    : [];
  const carEntries = rawMetaEntries.map((entry: RawReplayCarEntryLike, idx: number) => {
    const carIdx = typeof entry?.carIndex === 'number' ? entry.carIndex : idx;
    const loadoutMatch =
      rawLoadouts.find((l: RawReplayCarEntryLike) => l && l.carIndex === carIdx) ||
      rawLoadouts[idx] ||
      null;
    const merged: RawReplayCarEntryLike = loadoutMatch ? { ...loadoutMatch, ...entry } : entry;
    return normalizeReplayDirectorCarEntry(merged, carIdx, merged?.team ?? carIdx % 2);
  });

  const rosterTeamMap = new Map<number, number>();
  for (const c of carEntries) {
    if (typeof c?.carIndex === 'number' && typeof c?.team === 'number') {
      rosterTeamMap.set(c.carIndex, c.team);
    }
  }
  const resolveCarTeam = (carIdx: number): number =>
    rosterTeamMap.has(carIdx) ? (rosterTeamMap.get(carIdx) ?? carIdx % 2) : carIdx % 2;

  let inferredScoringTeam =
    typeof dMeta?.scoringTeam === 'number'
      ? dMeta.scoringTeam
      : decoded.metadata?.winner === 'orange'
        ? 1
        : 0;
  let inferredScorerCarIndex = typeof dMeta?.scorerCarIndex === 'number' ? dMeta.scorerCarIndex : 0;

  let sourceFrameSlots = decoded.frameSlots;

  // When importing a full-match .rcreplay.gz container (no directorReplayMeta and not already a goal-replay slice),
  // automatically locate the latest goal and extract its Goal Replay window.
  if (!dMeta && decoded.metadata?.mode !== 'goal-replay' && decoded.frameSlots.length > 400) {
    let goalTick = -1;
    let hasExplicitScorer = false;

    const allIncidents = Array.isArray(decoded.timelines?.incidents)
      ? decoded.timelines.incidents
      : Array.isArray(decoded.incidents)
        ? decoded.incidents
        : decoded.frameSlots.flatMap((s) => (Array.isArray(s?.incidents) ? s.incidents : []));
    for (let i = allIncidents.length - 1; i >= 0; i--) {
      const inc = allIncidents[i];
      if (inc && inc.type === INCIDENT_EVENT_TYPES.GOAL_SCORED) {
        goalTick = typeof inc.tick === 'number' ? inc.tick : -1;
        if (typeof inc.team === 'number') {
          inferredScoringTeam = inc.team;
        }
        if (typeof inc.carIndex === 'number' && inc.carIndex >= 0) {
          inferredScorerCarIndex = inc.carIndex;
          hasExplicitScorer = true;
        }
        break;
      }
    }

    const allSignals: Array<{
      signalType?: number;
      type?: number;
      frameId?: number;
      tick?: number;
      primaryId?: number;
      secondaryId?: number;
    }> = Array.isArray(decoded.timelines?.signals)
      ? decoded.timelines.signals
      : Array.isArray(decoded.signals)
        ? decoded.signals
        : decoded.frameSlots.flatMap((s) => (Array.isArray(s?.signals) ? s.signals : []));
    if (goalTick < 0) {
      for (let i = allSignals.length - 1; i >= 0; i--) {
        const sig = allSignals[i];
        if (
          sig &&
          (sig.signalType === MATCH_SIGNALS.GOAL_REPLAY_WILL_START ||
            sig.signalType === MATCH_SIGNALS.SCORE_UPDATED) &&
          typeof sig.frameId === 'number'
        ) {
          goalTick = sig.frameId;
          if (typeof sig.primaryId === 'number' && (sig.primaryId === 0 || sig.primaryId === 1)) {
            inferredScoringTeam = sig.primaryId;
          }
          if (typeof sig.secondaryId === 'number' && sig.secondaryId >= 0) {
            inferredScorerCarIndex = sig.secondaryId;
            hasExplicitScorer = true;
          }
          break;
        }
      }
    }

    if (goalTick < 0) {
      for (let i = decoded.frameSlots.length - 1; i >= 0; i--) {
        const snap = decoded.frameSlots[i]?.snapshot;
        if (!snap || snap.length <= 6) continue;
        if (Math.abs((snap[302] || 0) - 1337.5) <= 0.01) continue;
        const by = snap[5] || 0;
        const bx = snap[4] || 0;
        const bz = snap[6] || 0;
        if (Math.abs(by) >= 5120 && Math.abs(bx) < 893 && bz < 643) {
          inferredScoringTeam = by > 0 ? 0 : 1;
          let entryIdx = i;
          while (entryIdx > 0) {
            const prevSnap = decoded.frameSlots[entryIdx - 1]?.snapshot;
            if (!prevSnap || Math.abs(prevSnap[5] || 0) < 5120) break;
            entryIdx--;
          }
          goalTick = decoded.frameSlots[entryIdx]?.tick ?? -1;
          break;
        }
      }
    }

    if (goalTick >= 0) {
      let scorerTouchTick = -1;
      for (let i = allIncidents.length - 1; i >= 0; i--) {
        const inc = allIncidents[i];
        if (!inc) continue;
        const tTick = typeof inc.tick === 'number' ? inc.tick : -1;
        if (tTick < 0 || tTick > goalTick) continue;
        if (
          inc.type === INCIDENT_EVENT_TYPES.CAR_BALL_HIT ||
          inc.type === PHYSICS_EVENT_TYPES.CAR_BALL_HIT ||
          inc.type === 0x01
        ) {
          const hitCar = inc.carIndex ?? inc.primaryId ?? -1;
          const hitTeam =
            typeof inc.team === 'number' ? inc.team : hitCar >= 0 ? resolveCarTeam(hitCar) : -1;
          if (hitTeam === inferredScoringTeam) {
            if (!hasExplicitScorer && hitCar >= 0) {
              inferredScorerCarIndex = hitCar;
              hasExplicitScorer = true;
            }
            if (hitCar === inferredScorerCarIndex || scorerTouchTick < 0) {
              scorerTouchTick = tTick;
              if (hitCar === inferredScorerCarIndex) break;
            }
          }
        }
      }

      let kickoffTick = -1;
      for (let i = allSignals.length - 1; i >= 0; i--) {
        const sig = allSignals[i];
        if (
          sig &&
          sig.signalType === MATCH_SIGNALS.KICKOFF_WILL_START &&
          typeof sig.frameId === 'number' &&
          sig.frameId <= goalTick
        ) {
          kickoffTick = sig.frameId;
          break;
        }
      }

      const newestTick = decoded.frameSlots[decoded.frameSlots.length - 1]?.tick ?? goalTick + 180;
      const postGoalTicks = Math.min(360, Math.max(60, newestTick - goalTick));
      const bounds = resolveGoalReplayWindowBounds({
        goalIncidentTick: goalTick,
        scorerTouchTick,
        lookbackSeconds: 10.0,
        touchLookbackSeconds: 7.0,
        postGoalTicks,
        lastKickoffWillStartTick: kickoffTick,
        signalLog: allSignals,
      });

      const extracted = decoded.frameSlots.filter((slot) => {
        if (!slot || typeof slot.tick !== 'number') return false;
        const snap = slot.snapshot;
        if (snap && snap.length > 302 && Math.abs((snap[302] || 0) - 1337.5) <= 0.01) {
          return false;
        }
        return slot.tick >= bounds.effectiveStartFrame && slot.tick <= bounds.effectiveEndFrame;
      });

      if (extracted.length > 0) {
        sourceFrameSlots = extracted;
      }
    }
  }

  const scoringTeam = inferredScoringTeam;
  const scorerCarIndex = inferredScorerCarIndex;
  const rawGoalLineFrameIdx =
    typeof dMeta?.goalLineFrameIdx === 'number' ? dMeta.goalLineFrameIdx : -1;
  const lastScoringTouchFrameIdx =
    typeof dMeta?.lastScoringTouchFrameIdx === 'number' ? dMeta.lastScoringTouchFrameIdx : -1;
  const selectedCursorIndex =
    typeof dMeta?.selectedReplayFrameIndex === 'number' ? dMeta.selectedReplayFrameIndex : 0;

  const activeFrames = sourceFrameSlots.map((slot, i) => ({
    ...slot,
    timestamp: i / REPLAY_TICK_RATE,
    recordedCsvRow: recordedRows && recordedRows[i] ? recordedRows[i] : null,
  }));

  const goalLineFrameIdx = resolveGoalExplosionFrameIndex(
    activeFrames,
    scoringTeam === 0 ? 1.0 : -1.0,
    rawGoalLineFrameIdx
  );

  const touchEvents = Array.isArray(dMeta?.touchTimeline)
    ? dMeta.touchTimeline.map((t) => ({
        frameIndex: t.replayFrameIndex ?? 0,
        tick: t.frameId ?? 0,
        carIndex: t.carIndex ?? 0,
        team: t.team ?? 0,
        ballX: t.ballPos?.[0] ?? 0,
        ballY: t.ballPos?.[1] ?? 0,
        ballZ: t.ballPos?.[2] ?? 0,
      }))
    : [];

  return {
    format: 'rcgr',
    fileName,
    activeFrames,
    scoringTeam,
    scorerCarIndex,
    selectedCursorIndex,
    lateralBias: dMeta?.lateralBias || 1.0,
    touchEvents,
    lastScoringTouchFrameIdx,
    goalLineFrameIdx,
    initialSettledCarPos: dMeta?.initialSettledCarPos || null,
    hasRecordedCsvRows: Boolean(recordedRows && recordedRows.length > 0),
    directorConfig: dMeta?.directorConfig || null,
    carEntries,
    anomalyPeaks: dMeta?.anomalyPeaks || null,
    summary: dMeta?.trajectorySmoothnessSummary || {
      totalFrames: activeFrames.length,
      durationSec: round3(activeFrames.length / REPLAY_TICK_RATE),
      startFrameId: activeFrames[0]?.tick ?? 0,
      endFrameId: activeFrames[activeFrames.length - 1]?.tick ?? 0,
      maxEyeStepUu: 0,
      maxTargetStepUu: 0,
      maxYawStepDeg: 0,
      maxEyeAccelUu: 0,
      maxPreGoalCarViewAngleDeg: 0,
      maxPreGoalBallViewAngleDeg: 0,
    },
  };
}

/**
 * Auto-detects CSV vs JSON format and parses a Director Diagnostic Pattern text.
 */
export function parseDirectorDiagnosticPatternText(
  text: string | Uint8Array | ArrayBuffer,
  fileName: string = 'imported-pattern.csv'
): ParsedDirectorDiagnosticPattern | null {
  if (text instanceof Uint8Array || text instanceof ArrayBuffer) {
    return parseDirectorDiagnosticContainerBytes(text, fileName);
  }
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{')) {
    return parseDirectorDiagnosticPatternJson(trimmed, fileName);
  }
  return parseDirectorDiagnosticPatternCsv(trimmed, fileName);
}

/**
 * Universal async parser that accepts `.rcgr.gz`, `.rcreplay.gz`, raw binary `Uint8Array`/`ArrayBuffer`,
 * `File`/`Blob`, or legacy `.csv`/`.json` text.
 */
export async function parseDirectorDiagnosticInput(
  input: unknown,
  fileName: string = 'imported.rcgr.gz'
): Promise<ParsedDirectorDiagnosticPattern | null> {
  if (!input) return null;
  if (typeof input === 'string') {
    return parseDirectorDiagnosticPatternText(input, fileName);
  }
  let rawBytes: Uint8Array | null = null;
  let resolvedName = fileName;
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    const maybeFile = input as File;
    if (typeof maybeFile.name === 'string' && maybeFile.name) {
      resolvedName = maybeFile.name;
    }
    const buf = await input.arrayBuffer();
    rawBytes = new Uint8Array(buf);
  } else if (input instanceof ArrayBuffer) {
    rawBytes = new Uint8Array(input);
  } else if (input instanceof Uint8Array) {
    rawBytes = input;
  } else if (
    typeof input === 'object' &&
    Array.isArray((input as { activeFrames?: unknown }).activeFrames)
  ) {
    return input as ParsedDirectorDiagnosticPattern;
  }
  if (!rawBytes || rawBytes.byteLength === 0) return null;

  const decompressed = await decompressBytesIfGzip(rawBytes);
  if (isBinaryRCReplayContainer(decompressed)) {
    return parseDirectorDiagnosticContainerBytes(decompressed, resolvedName);
  }
  const text = new TextDecoder().decode(decompressed);
  return parseDirectorDiagnosticPatternText(text, resolvedName);
}
