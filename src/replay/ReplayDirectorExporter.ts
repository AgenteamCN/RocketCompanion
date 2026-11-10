/**
 * ReplayDirectorExporter.ts
 * Browser download helpers, gzip compression, and Reference Keyframe / RCGR export triggers.
 */

import {
  REPLAY_DIRECTOR_CONFIG,
  DEFAULT_REPLAY_DIRECTOR_FOV_DEG,
} from '../ui-core/config/replayDirectorConfig.ts';
import { serializeRCReplayBinaryContainer } from './container/RCReplayBinaryEncoder.ts';
import { packAndCompressReplayInBackground } from './container/RCReplayCompressionWorkerClient.ts';
import {
  round3,
  round4,
  computeCameraSceneFramingAnalysis,
} from './ReplayDirectorSceneAnalysis.ts';
import { wrapAngleDeltaDeg } from './replayDirectorElevationPipeline.ts';
import {
  buildDirectorFrameWindowDiagnostic,
  buildDirectorReplayContainerPayload,
  type DirectorPatternSerializerOptions,
  type DirectorSerializerControllerPort,
} from './ReplayDirectorPatternSerializer.ts';

import type { CurrentFrameDiagnosticSnapshot } from './replayDirectorSingleFramePipeline.ts';

export interface LiveCameraCaptureState {
  isFreeCam?: boolean;
  eyeUnreal?: [number, number, number] | number[];
  forwardUnreal?: [number, number, number] | number[];
  fovDeg?: number;
  aspect?: number;
}

export interface DirectorReferenceKeyframeOptions {
  liveCameraState?: LiveCameraCaptureState | null;
  fovDeg?: number;
  windowRadius?: number;
  note?: string;
  download?: boolean;
}

export interface DirectorExportControllerPort extends DirectorSerializerControllerPort {
  ActiveWindowCount: number;
  getTotalRecordedFrames: () => number;
  getCurrentFrameDiagnosticSnapshot: () => CurrentFrameDiagnosticSnapshot | null;
  buildDirectorDiagnosticPatternCsv: (options?: DirectorPatternSerializerOptions) => string;
}

async function compressBytesGzip(u8: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('gzip');
    if (typeof Blob !== 'undefined' && typeof Blob.prototype.stream === 'function') {
      const compressedStream = new Blob([u8 as BlobPart]).stream().pipeThrough(cs);
      const buf = await new Response(compressedStream).arrayBuffer();
      return new Uint8Array(buf);
    }
    const readPromise = new Response(cs.readable).arrayBuffer();
    const writer = cs.writable.getWriter();
    await writer.write(u8 as BufferSource);
    await writer.close();
    const buf = await readPromise;
    return new Uint8Array(buf);
  }
  return u8;
}

function triggerBrowserBlobDownload(blob: Blob, filename: string): void {
  if (typeof document !== 'undefined' && typeof URL !== 'undefined') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

/**
 * Exports the active or retained last Goal Replay Director Camera container (`.rcgr.gz` default, or legacy `csv`/`json`).
 */
export function exportReplayDirectorDiagnosticPattern(
  ctrl: DirectorExportControllerPort | null | undefined,
  format: string = 'rcgr',
  options: DirectorPatternSerializerOptions = {}
) {
  const totalFrames = ctrl
    ? ctrl.ActiveWindowCount > 0
      ? ctrl.ActiveWindowCount
      : ctrl.getTotalRecordedFrames()
    : 0;
  if (!ctrl || totalFrames <= 0) {
    return null;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const snap = ctrl.getCurrentFrameDiagnosticSnapshot();
  const frameTag = snap ? `frame-${snap.frameId}-idx-${snap.replayFrameIndex}` : 'replay';

  if (format === 'rcgr' || format === 'rcgr.gz') {
    const containerPayload = buildDirectorReplayContainerPayload(ctrl, options);
    if (!containerPayload) return null;
    const containerBytes = serializeRCReplayBinaryContainer(containerPayload);
    const filename = `goal-replay-${frameTag}-${stamp}.rcgr.gz`;

    if (typeof document !== 'undefined' && typeof Blob !== 'undefined') {
      packAndCompressReplayInBackground(containerPayload)
        .then((packedResult) => {
          const bytes = packedResult?.compressedBytes || packedResult?.buffer;
          if (!bytes) throw new Error('Empty compressed replay buffer');
          const blob = new Blob([bytes as BlobPart], { type: 'application/gzip' });
          triggerBrowserBlobDownload(blob, filename);
        })
        .catch(async () => {
          const gz = await compressBytesGzip(containerBytes);
          const blob = new Blob([gz as BlobPart], { type: 'application/gzip' });
          triggerBrowserBlobDownload(blob, filename);
        });
    }
    return {
      filename,
      containerBytes,
      directorReplayMeta: containerPayload.directorReplayMeta,
      payload: containerPayload.diagnosticPayload,
    };
  }

  if (format === 'csv') {
    const csv = ctrl.buildDirectorDiagnosticPatternCsv(options);
    if (!csv) return null;
    const filename = `replay-director-pattern-${frameTag}-${stamp}.csv`;
    if (typeof document !== 'undefined' && typeof Blob !== 'undefined') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      triggerBrowserBlobDownload(blob, filename);
    }
    return { filename, content: csv };
  }

  const payload = ctrl.buildDirectorDiagnosticPatternPayload?.(options);
  if (!payload) return null;
  const json = JSON.stringify(payload, null, 2);
  const filename = `replay-director-pattern-${frameTag}-${stamp}.json`;
  if (typeof document !== 'undefined' && typeof Blob !== 'undefined') {
    const blob = new Blob([json], { type: 'application/json' });
    triggerBrowserBlobDownload(blob, filename);
  }
  return { filename, payload, content: json };
}

export function buildDirectorReferenceKeyframePayload(
  ctrl: DirectorExportControllerPort | null | undefined,
  options: DirectorReferenceKeyframeOptions = {}
) {
  if (!ctrl) return null;
  const snap = ctrl.getCurrentFrameDiagnosticSnapshot();
  if (!snap) return null;

  const liveCam = options.liveCameraState || null;
  const autoEyeUnreal = snap.cameraPose.dampedEyeUnreal;
  const autoTargetUnreal = snap.cameraPose.dampedTargetUnreal;
  const autoForwardUnreal = snap.cameraPose.forwardUnreal;
  const autoDist = snap.cameraPose.distanceToTarget || 1000.0;

  const refEyeUnreal = Array.isArray(liveCam?.eyeUnreal)
    ? liveCam.eyeUnreal.map((v: number) => round3(v))
    : [...autoEyeUnreal];
  const refForwardUnreal = Array.isArray(liveCam?.forwardUnreal)
    ? liveCam.forwardUnreal.map((v: number) => round4(v))
    : [...autoForwardUnreal];
  const refLookAtTargetUnreal = [
    round3(refEyeUnreal[0] + refForwardUnreal[0] * autoDist),
    round3(refEyeUnreal[1] + refForwardUnreal[1] * autoDist),
    round3(refEyeUnreal[2] + refForwardUnreal[2] * autoDist),
  ];
  const refYawDeg = round3((Math.atan2(refForwardUnreal[0], refForwardUnreal[1]) * 180) / Math.PI);
  const refPitchDeg = round3(
    (Math.asin(Math.max(-1, Math.min(1, refForwardUnreal[2]))) * 180) / Math.PI
  );
  const refFovDeg = round3(
    Number(options.fovDeg ?? liveCam?.fovDeg ?? REPLAY_DIRECTOR_CONFIG.cameraFovDeg) ||
      DEFAULT_REPLAY_DIRECTOR_FOV_DEG
  );
  const refAspect = round4(Number(liveCam?.aspect) || 16 / 9);

  const scoringTeam = ctrl.sessionState?.scoringTeam ?? 0;
  const referenceAnalysis = computeCameraSceneFramingAnalysis(
    refEyeUnreal,
    refForwardUnreal,
    refFovDeg,
    refAspect,
    snap,
    scoringTeam
  );
  const autoCamAnalysis = computeCameraSceneFramingAnalysis(
    autoEyeUnreal,
    autoForwardUnreal,
    refFovDeg,
    refAspect,
    snap,
    scoringTeam
  );

  const eyeDeltaUnreal = [
    round3(refEyeUnreal[0] - autoEyeUnreal[0]),
    round3(refEyeUnreal[1] - autoEyeUnreal[1]),
    round3(refEyeUnreal[2] - autoEyeUnreal[2]),
  ];
  const eyeDeltaDistanceUu = round3(
    Math.hypot(eyeDeltaUnreal[0], eyeDeltaUnreal[1], eyeDeltaUnreal[2])
  );
  const yawDeltaDeg = round3(wrapAngleDeltaDeg(refYawDeg, snap.cameraPose.yawDeg));
  const pitchDeltaDeg = round3(refPitchDeg - snap.cameraPose.pitchDeg);

  const windowDiag = buildDirectorFrameWindowDiagnostic(ctrl, options.windowRadius ?? 15);

  return {
    schema: 'RocketCompanion.ReplayDirectorReferenceKeyframe.v1',
    exportedAt: new Date().toISOString(),
    sourceReplayFileName: ctrl.sessionState?.importedFileName || 'live-goal-replay',
    note:
      options.note ||
      'Standalone single-frame Director Camera guidance keyframe captured via Free Camera (Shift+F). Compare referenceCamera against currentDirectorAutoCam to see desired framing vs current algorithm output.',
    coordinateConventions: {
      unreal: 'X right, Y forward (toward Orange goal +5120), Z up (Unreal Units)',
      threeJs: 'X right, Y up, Z forward',
      screenNdc: 'X in [-1 left .. +1 right], Y in [-1 bottom .. +1 top], Z > 0 in front of camera',
    },
    frameContext: {
      frameId: snap.frameId,
      replayFrameIndex: snap.replayFrameIndex,
      totalReplayFrames: snap.totalReplayFrames,
      timestampInReplaySec: snap.timestampInReplaySec,
      progress: snap.progress,
      slowMoFactor: snap.slowMoFactor,
      scoringTeam: snap.scoringTeam,
      scoringTeamName: snap.scoringTeam === 0 ? 'BLUE' : 'ORANGE',
      scorerCarIndex: snap.scorerCarIndex,
      lookaheadState: snap.lookahead,
    },
    referenceCamera: {
      capturedFromFreeCam: Boolean(liveCam?.isFreeCam),
      fovDeg: refFovDeg,
      aspectRatio: refAspect,
      eyeUnreal: refEyeUnreal,
      lookAtTargetUnreal: refLookAtTargetUnreal,
      forwardUnreal: refForwardUnreal,
      eyeThreeJs: [refEyeUnreal[0], refEyeUnreal[2], refEyeUnreal[1]],
      lookAtTargetThreeJs: [
        refLookAtTargetUnreal[0],
        refLookAtTargetUnreal[2],
        refLookAtTargetUnreal[1],
      ],
      yawDeg: refYawDeg,
      pitchDeg: refPitchDeg,
      ...referenceAnalysis,
    },
    currentDirectorAutoCam: {
      eyeUnreal: autoEyeUnreal,
      lookAtTargetUnreal: autoTargetUnreal,
      forwardUnreal: autoForwardUnreal,
      rawUndampedEyeUnreal: snap.cameraPose.rawUndampedEyeUnreal,
      rawUndampedTargetUnreal: snap.cameraPose.rawUndampedTargetUnreal,
      yawDeg: snap.cameraPose.yawDeg,
      pitchDeg: snap.cameraPose.pitchDeg,
      distanceToTargetUu: snap.cameraPose.distanceToTarget,
      eyeStepUu: snap.cameraPose.eyeStepUu,
      yawStepDeg: snap.cameraPose.yawStepDeg,
      ...autoCamAnalysis,
    },
    deltaReferenceVsAutoCam: {
      eyeDeltaUnreal,
      eyeDeltaDistanceUu,
      yawDeltaDeg,
      pitchDeltaDeg,
      corridorBackDistDeltaUu: round3(
        referenceAnalysis.corridorDecomposition.backDistBehindBallUu -
          autoCamAnalysis.corridorDecomposition.backDistBehindBallUu
      ),
      corridorLateralOffsetDeltaUu: round3(
        referenceAnalysis.corridorDecomposition.signedLateralOffsetFromCorridorUu -
          autoCamAnalysis.corridorDecomposition.signedLateralOffsetFromCorridorUu
      ),
      heightDeltaUu: round3(refEyeUnreal[2] - autoEyeUnreal[2]),
      lateralBiasFlipped:
        referenceAnalysis.corridorDecomposition.inferredLateralBias !==
        autoCamAnalysis.corridorDecomposition.inferredLateralBias,
      impliedRayCarWeightDelta:
        referenceAnalysis.corridorDecomposition.impliedRayCarWeight !== null &&
        autoCamAnalysis.corridorDecomposition.impliedRayCarWeight !== null
          ? round4(
              referenceAnalysis.corridorDecomposition.impliedRayCarWeight -
                autoCamAnalysis.corridorDecomposition.impliedRayCarWeight
            )
          : null,
      ballViewAngleDeltaDeg: round3(
        referenceAnalysis.screenComposition.ball.viewAngleFromCenterDeg -
          autoCamAnalysis.screenComposition.ball.viewAngleFromCenterDeg
      ),
      focusCarViewAngleDeltaDeg:
        referenceAnalysis.screenComposition.focusCar && autoCamAnalysis.screenComposition.focusCar
          ? round3(
              referenceAnalysis.screenComposition.focusCar.viewAngleFromCenterDeg -
                autoCamAnalysis.screenComposition.focusCar.viewAngleFromCenterDeg
            )
          : null,
    },
    directorConfigAtCapture: { ...REPLAY_DIRECTOR_CONFIG },
    carEntries:
      windowDiag?.replayMetadata?.carEntries ||
      ctrl.sessionState?.carEntries ||
      ctrl.sessionState?.importedCarEntries ||
      [],
    entitiesAtFrame: {
      ball: snap.ball,
      cars: snap.cars,
      incidents: snap.incidents,
    },
    touchTimeline: windowDiag?.touchTimeline || [],
    surroundingWindowFrames: windowDiag?.windowFrames || [],
  };
}

/**
 * Exports a standalone Reference Keyframe Guidance JSON file (`director-ref-keyframe-frame-<id>.json`)
 * and optionally copies it to the clipboard.
 */
export function exportReplayDirectorReferenceKeyframe(
  ctrl: DirectorExportControllerPort | null | undefined,
  options: DirectorReferenceKeyframeOptions = {}
) {
  const payload = buildDirectorReferenceKeyframePayload(ctrl, options);
  if (!payload) return null;
  const json = JSON.stringify(payload, null, 2);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fId = payload.frameContext.frameId;
  const fIdx = payload.frameContext.replayFrameIndex;
  const filename = `director-ref-keyframe-frame-${fId}-idx-${fIdx}-${stamp}.json`;

  if (
    options.download !== false &&
    typeof document !== 'undefined' &&
    typeof Blob !== 'undefined'
  ) {
    const blob = new Blob([json], { type: 'application/json' });
    triggerBrowserBlobDownload(blob, filename);
  }
  return { filename, payload, content: json };
}
