/**
 * ReplayFileExporter.ts
 * Manages full-match 448-float + 8-car controls + 64B Incident + 64B Signal RC Replay retention,
 * V2 Multi-Track Chunked Binary Container (.rcreplay.gz) background GZIP export with spinning UI feedback,
 * persistent post-match QuickNotification lifecycle, and multi-timeline file parsing for the Replay Viewer.
 */

import { STATE_BUFFER_FLOATS } from '../physics/RocketSimConstants.ts';
import {
  useQuickNotificationStore,
  useReplayViewerStore,
  quickNotification,
  pushOngoingNotification,
  completeOngoingNotification,
  dismissOngoingNotification,
} from '../game/runtimeUiPort.ts';
import {
  RC_REPLAY_MAGIC_V2,
  RC_REPLAY_VERSION_V2,
  RC_REPLAY_STATE_INPUT_STRIDE,
} from './container/RCReplayBinarySchema.ts';
import { materializeFramesFromBinaryTracks } from './container/RCReplayTrackMaterializer.ts';
import { packAndCompressReplayInBackground } from './container/RCReplayCompressionWorkerClient.ts';
import {
  extractReplayTracksFromMatchOptions,
  decompressAndParseRCReplayFile,
  buildStateReplayExportPayload,
  type RetainedMatchReplay,
  type ReplayRawFrameSlotItem,
  type RetainCompletedMatchReplayOptions,
  type ParsedRCReplayResult,
  type ExportStateReplayOptions,
} from './container/RCReplayFileParser.ts';

export type {
  RetainedMatchReplay,
  ReplayRawFrameSlotItem,
  RetainCompletedMatchReplayOptions,
  ParsedRCReplayResult,
  ExportStateReplayOptions,
};

export const MATCH_REPLAY_NOTIFICATION_ID = 'match-replay-export';
export const MATCH_REPLAY_SAVING_TASK_ID = 'match-replay-saving-task';
export const MAX_MATCH_REPLAY_FRAMES = 100800; // Up to 14 minutes (5+7m OT) @ 120Hz

let _retainedMatchReplay: RetainedMatchReplay | null = null;
let _isExportingReplay = false;

/**
 * Retains a completed match's full 3-track replay data (State+Input, Incidents, Signals)
 * in host/local memory until the next match starts, and triggers a persistent QuickNotification
 * allowing compressed V2 Binary RC Replay export at any time.
 */
export function retainCompletedMatchReplayAndNotify(
  options: RetainCompletedMatchReplayOptions = {}
): RetainedMatchReplay | null {
  const tracks = extractReplayTracksFromMatchOptions(options);
  if (!tracks || tracks.frameCount === 0) return null;

  let winner = options.winner;
  if (!winner) {
    if (
      options.winnerTeam === 0 ||
      options.winnerTeam === 'BLUE' ||
      options.winnerTeam === 'blue'
    ) {
      winner = 'blue';
    } else if (
      options.winnerTeam === 1 ||
      options.winnerTeam === 'ORANGE' ||
      options.winnerTeam === 'orange'
    ) {
      winner = 'orange';
    } else if (
      options.winnerTeam === 2 ||
      options.winnerTeam === 'DRAW' ||
      options.winnerTeam === 'draw'
    ) {
      winner = 'draw';
    } else {
      const b = Number(options.blueScore ?? 0);
      const o = Number(options.orangeScore ?? 0);
      winner = b > o ? 'blue' : o > b ? 'orange' : 'draw';
    }
  } else {
    winner = String(winner).toLowerCase();
  }

  const blueScore = Number(options.blueScore ?? 0);
  const orangeScore = Number(options.orangeScore ?? 0);
  const mode = options.mode || options.gameMode || 'exhibition';
  const createdAtIso = options.createdAtIso || new Date().toISOString();

  const materialized = materializeFramesFromBinaryTracks(tracks, {
    mode,
    winner,
    blueScore,
    orangeScore,
    winReason: options.winReason ?? 0,
    durationSeconds: options.durationSeconds ?? 300,
  });

  const normalizedRoster = Array.isArray(options.roster)
    ? options.roster
    : Array.isArray(options.roster?.players)
      ? options.roster.players
      : [];
  const normalizedLoadouts = Array.isArray(options.loadouts) ? options.loadouts : normalizedRoster;

  useReplayViewerStore.getState().updateLiveTelemetry({ hasRetainedMatch: true });
  _retainedMatchReplay = {
    magic: RC_REPLAY_MAGIC_V2,
    version: RC_REPLAY_VERSION_V2,
    stateFloats: STATE_BUFFER_FLOATS,
    tickRate: 120,
    frameCount: tracks.frameCount,
    incidentCount: tracks.incidentCount,
    signalCount: tracks.signalCount,
    durationSec: Number((tracks.frameCount / 120).toFixed(2)),
    durationSeconds: options.durationSeconds ?? 300,
    winner,
    blueScore,
    orangeScore,
    winReason: options.winReason ?? 0,
    mode,
    arenaPreset: options.arenaPreset ?? 0,
    roster: normalizedRoster,
    loadouts: normalizedLoadouts,
    createdAtIso,
    frames: materialized.frames,
    frameSlots: materialized.frameSlots,
    incidents: materialized.incidents,
    signals: materialized.signals,
    timelines: materialized.timelines,
    stateInputBytes: tracks.stateInputBytes,
    incidentBytes: tracks.incidentBytes,
    signalBytes: tracks.signalBytes,
  };

  if (options.suppressNotification) {
    return _retainedMatchReplay;
  }

  const winnerLabel =
    winner === 'blue' ? 'Blue Wins' : winner === 'orange' ? 'Orange Wins' : 'Match Complete';

  try {
    useQuickNotificationStore.getState().pushNotification({
      id: MATCH_REPLAY_NOTIFICATION_ID,
      type: 'persistent',
      tone: 'info',
      icon: 'download',
      duration: 0,
      content: `${winnerLabel} (${blueScore}-${orangeScore}) · Export RC Replay (${_retainedMatchReplay.durationSec}s)?`,
      buttons: [
        {
          key: 'export-rcreplay',
          label: 'Export .rcreplay.gz',
          icon: 'download',
          color: 'sky',
          dismissOnClick: false,
          onClick: () => {
            exportRetainedMatchReplayFile();
          },
        },
      ],
    });
  } catch (err) {
    console.warn('[ReplayFileExporter] Failed to push persistent replay notification:', err);
  }

  return _retainedMatchReplay;
}

/**
 * Returns the currently retained match replay buffer (if any).
 */
export function getRetainedMatchReplay(): RetainedMatchReplay | null {
  return _retainedMatchReplay;
}

/**
 * Clears the retained match replay buffer and dismisses the persistent notification.
 * Called ONLY when the next match begins.
 */
export function clearRetainedMatchReplayOnMatchStart(): void {
  _retainedMatchReplay = null;
  useReplayViewerStore.getState().updateLiveTelemetry({ hasRetainedMatch: false });
  try {
    useQuickNotificationStore.getState().dismissNotification(MATCH_REPLAY_NOTIFICATION_ID);
  } catch (err) {
    console.warn('[ReplayFileExporter] Failed to dismiss match replay notification:', err);
  }
}

/**
 * Asynchronously packs and GZIP-compresses the replay in a background Worker (without blocking the main thread),
 * shows a spinning ongoing status in the foreground UI while saving, and triggers browser download.
 */
export async function exportRetainedMatchReplayFile(
  replayObj: RetainedMatchReplay | null = _retainedMatchReplay
): Promise<boolean> {
  if (!replayObj) return false;
  const hasFrames = Array.isArray(replayObj.frames) && replayObj.frames.length > 0;
  const hasRawTracks =
    replayObj.stateInputBytes instanceof Uint8Array &&
    replayObj.stateInputBytes.byteLength >= RC_REPLAY_STATE_INPUT_STRIDE;
  if (!hasFrames && !hasRawTracks) return false;
  if (_isExportingReplay) return false;

  _isExportingReplay = true;
  const notifStore = useQuickNotificationStore.getState();

  try {
    notifStore.pushOngoingNotification({
      id: MATCH_REPLAY_SAVING_TASK_ID,
      content: 'Saving & compressing RC Replay (.rcreplay.gz) in background...',
      icon: 'loader-2',
      isSpinningIcon: true,
      tone: 'info',
    });
  } catch (err) {
    console.warn('[ReplayFileExporter] Failed to push ongoing export notification:', err);
  }

  try {
    const packedResult = await packAndCompressReplayInBackground(replayObj);
    const stamp = (replayObj.createdAtIso || new Date().toISOString())
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const modeSlug = replayObj.mode || replayObj.gameMode || 'match';
    const bScore = replayObj.blueScore ?? 0;
    const oScore = replayObj.orangeScore ?? 0;
    const baseFilename = `rc-replay-${modeSlug}-${bScore}-${oScore}-${stamp}`;

    const isGzip = Boolean(packedResult.compressed);
    const filename = isGzip ? `${baseFilename}.rcreplay.gz` : `${baseFilename}.rcreplay`;
    const mimeType = isGzip ? 'application/gzip' : 'application/octet-stream';
    const blob = new Blob([packedResult.buffer], { type: mimeType });

    if (typeof document !== 'undefined') {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    const kbSize = ((packedResult.compressedByteLength || blob.size) / 1024).toFixed(1);
    try {
      notifStore.completeOngoingNotification(MATCH_REPLAY_SAVING_TASK_ID, {
        content: `RC Replay saved (${kbSize} KB)`,
        icon: 'check-circle-2',
        tone: 'success',
        autoDismissMs: 2200,
      });
    } catch (err) {
      console.warn('[ReplayFileExporter] Failed to complete ongoing export notification:', err);
    }

    return true;
  } catch (err) {
    console.warn('[ReplayFileExporter] Background replay export failed:', err);
    try {
      notifStore.dismissOngoingNotification(MATCH_REPLAY_SAVING_TASK_ID);
    } catch (dismissErr) {
      console.warn(
        '[ReplayFileExporter] Failed to dismiss ongoing export notification after failure:',
        dismissErr
      );
    }
    return false;
  } finally {
    _isExportingReplay = false;
  }
}

/**
 * Parses an uploaded .rcreplay.gz or .rcreplay File/ArrayBuffer into
 * 3 parallel timelines (State+Input, Incidents, Signals) and per-frame snapshots + slots.
 */
export async function parseRCReplayFile(
  fileOrBuffer:
    ArrayBuffer | Uint8Array | Blob | { arrayBuffer?: () => Promise<ArrayBuffer> } | unknown
): Promise<ParsedRCReplayResult> {
  return decompressAndParseRCReplayFile(fileOrBuffer);
}

/**
 * Parses an uploaded replay File with UI loading state and QuickNotification feedback.
 */
export async function parseUploadedReplayFileWithFeedback(
  file: File,
  onInitializeSession: (result: ParsedRCReplayResult) => void
): Promise<void> {
  const store = useReplayViewerStore.getState();
  store.setErrorMessage(null);
  store.updateLiveTelemetry({ isLoadingReplay: true });
  const ongoingId = 'replay-viewer-load';
  pushOngoingNotification({
    id: ongoingId,
    content: `Loading replay "${file.name}"...`,
    icon: 'loader-2',
    isSpinningIcon: true,
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const result = await parseRCReplayFile(file);
    if (!result.frames || result.frames.length === 0) {
      throw new Error('Replay file contains 0 frames.');
    }
    onInitializeSession(result);
    completeOngoingNotification(ongoingId, {
      content: `Loaded replay "${file.name}" (${result.frames.length} frames).`,
      tone: 'info',
      duration: 2400,
    });
  } catch (err: unknown) {
    console.error('[StandaloneReplayViewerController] Failed to parse uploaded replay file:', err);
    const msg = err instanceof Error ? err.message : 'Failed to parse replay file.';
    dismissOngoingNotification(ongoingId);
    store.updateLiveTelemetry({ isLoadingReplay: false });
    store.setErrorMessage(msg);
    quickNotification.error(msg);
  }
}

export const MAX_REWINDER_FRAMES = 3600; // 30 seconds @ 120Hz FIFO rolling window

/**
 * Normalizes in-memory rewinder frame entries and exports a compressed V2 RC Replay file.
 */
export async function exportStateReplayFile(
  rewinderFrames: ReplayRawFrameSlotItem[],
  options: ExportStateReplayOptions = {}
): Promise<boolean> {
  const payload = buildStateReplayExportPayload(rewinderFrames, options);
  if (!payload) return false;
  return exportRetainedMatchReplayFile(payload);
}
