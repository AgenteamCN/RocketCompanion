import React, { useState, useEffect, useRef } from 'react';
import {
  Check,
  Download,
  Copy,
  Crosshair,
  Upload,
} from 'lucide-react';
import { getReplayDirectorConfig, subscribeReplayDirectorConfig } from '../../../config/replayDirectorConfig';
import { getActiveReplayTimelineController, subscribeActiveReplayTimelineController, exportActiveReplayDirectorDiagnosticPattern, importActiveReplayDirectorDiagnosticPattern, buildActiveReplayDirectorWindowDiagnostic } from '../../../stores/replayDirectorStore';
import { useHudStore } from '../../../stores/hudStore';
import { useAppStore } from '../../../stores/appStore';
import { useSubsystemIsolationLabStore } from '../../../stores/subsystemIsolationLabStore';
import { Badge } from '../../../primitives/Badge';
import { Button } from '../../../primitives/Button';
import { ReplayDirectorSnapshotAndKeyframePanel } from './ReplayDirectorSnapshotAndKeyframePanel';
import { ReplayDirectorPauseBanner } from './ReplayDirectorPauseBanner';

export interface ReplayDirectorOrientationCardProps {
  isLight?: boolean;
}

export const ReplayDirectorOrientationCard: React.FC<ReplayDirectorOrientationCardProps> = ({
  isLight = false,
}) => {
  const [copiedWindowSnap, setCopiedWindowSnap] = useState(false);
  const [exportedFileMsg, setExportedFileMsg] = useState<string | null>(null);
  const [, setTickRevision] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const matchPhase = useHudStore((s) => s.matchPhase);
  const replayFrameIndex = useHudStore((s) => s.replayFrameIndex);
  const replayPaused = useHudStore((s) => s.replayPaused);
  const replayPersistent = useHudStore((s) => s.replayPersistent);
  const replaySpeed = useHudStore((s) => s.replaySpeed);
  const onReplayTogglePause = useHudStore((s) => s.onReplayTogglePause);
  const onReplayCycleSpeed = useHudStore((s) => s.onReplayCycleSpeed);

  const devGoalReplayPhase = useSubsystemIsolationLabStore((s) => s.goalReplayPhase);
  const devGoalReplayCursor = useSubsystemIsolationLabStore((s) => s.goalReplayPlaybackCursor);
  const devGoalReplayPaused = useSubsystemIsolationLabStore((s) => s.goalReplayPaused);
  const devGoalReplaySpeed = useSubsystemIsolationLabStore((s) => s.goalReplaySpeed);
  const devRuntimeHandlers = useSubsystemIsolationLabStore((s) => s.runtimeHandlers);

  useEffect(() => {
    const bumpRevision = () => {
      setTickRevision((r) => r + 1);
    };
    const unsubCtrl = subscribeActiveReplayTimelineController(bumpRevision);
    const unsubConfig = subscribeReplayDirectorConfig(bumpRevision);
    const unsubApp = useAppStore.subscribe(bumpRevision);
    return () => {
      unsubCtrl();
      unsubConfig();
      unsubApp();
    };
  }, []);

  const activeCtrl = getActiveReplayTimelineController();
  const isDevLabReplaying = devGoalReplayPhase === 'replaying';
  const isHudGoalReplay = matchPhase === 'replay';
  const isGoalReplayActive = Boolean(
    (activeCtrl && activeCtrl.sessionState?.isActive) || isHudGoalReplay || isDevLabReplaying
  );
  const hasRetainedReplay = Boolean(
    activeCtrl && ((activeCtrl.ActiveWindowCount ?? 0) > 0 || activeCtrl.sessionState?.hasRetainedReplay)
  );
  const isImportedPreview = Boolean(activeCtrl?.sessionState?.isImportedPreview);
  const canExportReplay = Boolean(isGoalReplayActive || hasRetainedReplay);
  const isPausePlayScrubActive = Boolean(
    isGoalReplayActive &&
      (activeCtrl?.sessionState?.isPersistent ||
        activeCtrl?.sessionState?.isPaused ||
        activeCtrl?.sessionState?.isScrubbing ||
        replayPersistent ||
        replayPaused ||
        devGoalReplayPaused)
  );

  const liveSnapshot =
    activeCtrl && (activeCtrl.sessionState?.isActive || hasRetainedReplay)
      ? activeCtrl.getCurrentFrameDiagnosticSnapshot()
      : null;

  const effectiveFrameIdx =
    liveSnapshot?.replayFrameIndex ??
    (isDevLabReplaying ? devGoalReplayCursor : replayFrameIndex) ??
    0;
  const effectiveFrameId = liveSnapshot?.frameId ?? effectiveFrameIdx;
  const effectivePaused =
    activeCtrl?.sessionState?.isPaused ?? (isDevLabReplaying ? devGoalReplayPaused : replayPaused);
  const effectiveSpeed =
    activeCtrl?.sessionState?.playbackSpeed ?? (isDevLabReplaying ? devGoalReplaySpeed : replaySpeed) ?? 1.0;

  const handleTogglePauseScrub = () => {
    if (isDevLabReplaying && devRuntimeHandlers.onGoalReplayTogglePause) {
      devRuntimeHandlers.onGoalReplayTogglePause();
    } else if (isGoalReplayActive && onReplayTogglePause) {
      onReplayTogglePause();
    } else if (activeCtrl && activeCtrl.sessionState?.isActive) {
      activeCtrl.togglePause();
    }
    setTickRevision((r) => r + 1);
  };

  const handleCycleSpeed = () => {
    if (isDevLabReplaying && devRuntimeHandlers.onGoalReplayCycleSpeed) {
      devRuntimeHandlers.onGoalReplayCycleSpeed();
    } else if (isGoalReplayActive && onReplayCycleSpeed) {
      onReplayCycleSpeed();
    } else if (activeCtrl && activeCtrl.sessionState?.isActive) {
      activeCtrl.cyclePlaybackSpeed();
    }
    setTickRevision((r) => r + 1);
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = await importActiveReplayDirectorDiagnosticPattern(file, {
        fileName: file.name,
        autoStartPreview: true,
        useRecordedCsvCamera: false,
      });
      if (parsed) {
        setExportedFileMsg(
          `Imported ${file.name} (${parsed.activeFrames?.length || 0} frames) - 3D Preview active`
        );
      } else {
        setExportedFileMsg(`Failed to parse ${file.name}: invalid .rcgr.gz / CSV / JSON`);
      }
      setTimeout(() => setExportedFileMsg(null), 4000);
      setTickRevision((r) => r + 1);
    } catch (err) {
      console.warn('[ReplayDirectorTuner] Failed to read imported replay file:', err);
    }
  };

  const handleExportContainer = () => {
    if (!canExportReplay) return;
    const res = exportActiveReplayDirectorDiagnosticPattern('rcgr');
    if (res?.filename) {
      setExportedFileMsg(`Exported ${res.filename}`);
      setTimeout(() => setExportedFileMsg(null), 3200);
    }
  };

  const handleCopyWindowDiagnostic = () => {
    if (!canExportReplay || !liveSnapshot) return;
    const windowDiag = buildActiveReplayDirectorWindowDiagnostic(15) || {
      schema: 'RocketCompanion.ReplayDirectorFrameWindowDiagnostic.v1',
      exportedAt: new Date().toISOString(),
      directorConfig: { ...getReplayDirectorConfig() },
      selectedFrameDiagnostic: liveSnapshot,
    };
    const json = JSON.stringify(windowDiag, null, 2);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(json).catch((err) => {
        console.warn('[ReplayDirectorTuner] Failed to copy window diagnostic JSON to clipboard:', err);
      });
    }
    setCopiedWindowSnap(true);
    setTimeout(() => setCopiedWindowSnap(false), 1800);
  };

  const showStatusMessage = (msg: string, durationMs = 3000) => {
    setExportedFileMsg(msg);
    setTimeout(() => setExportedFileMsg(null), durationMs);
  };

  const cardBg = isLight
    ? 'bg-neutral-50 border-neutral-200 text-neutral-800'
    : 'bg-neutral-850/60 border-neutral-700/60 text-neutral-200';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  return (
    <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".rcgr.gz,.rcreplay.gz,.gz,.rcgr,.rcreplay,.csv,.json,application/gzip,text/csv,application/json"
        onChange={handleImportFileChange}
        className="hidden"
      />

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Crosshair className="h-3.5 w-3.5 text-sky-400 shrink-0" />
          <span className="font-semibold text-[11px] truncate">
            Goal Replay Container (.rcgr.gz) &amp; Window Diagnostics
          </span>
        </div>
        <Badge
          variant={
            isImportedPreview && isGoalReplayActive
              ? 'sky'
              : isPausePlayScrubActive || hasRetainedReplay
                ? 'emerald'
                : isGoalReplayActive
                  ? 'amber'
                  : 'neutral'
          }
          size="sm"
          isLight={isLight}
          className="font-mono text-[9.5px] uppercase shrink-0"
        >
          {isImportedPreview && isGoalReplayActive
            ? 'RCGR PREVIEW ACTIVE'
            : isImportedPreview
              ? 'RCGR LOADED · READY'
              : isPausePlayScrubActive
                ? 'GOAL REPLAY PAUSED [P]'
                : isGoalReplayActive
                  ? 'GOAL REPLAY LIVE [P]'
                  : hasRetainedReplay
                    ? 'LAST REPLAY · EXPORT READY'
                    : 'IMPORT .RCGR.GZ OR SCORE'}
        </Badge>
      </div>

      {/* Relocated Goal Replay Pause & Playback Indicator Banner inside Replay Director Tuner */}
      <ReplayDirectorPauseBanner
        isGoalReplayActive={isGoalReplayActive}
        effectivePaused={effectivePaused}
        effectiveSpeed={effectiveSpeed}
        isLight={isLight}
        onTogglePauseScrub={handleTogglePauseScrub}
        onCycleSpeed={handleCycleSpeed}
      />

      {canExportReplay ? (
        <ReplayDirectorSnapshotAndKeyframePanel
          isLight={isLight}
          onStatusMessage={showStatusMessage}
          onRequestRefresh={() => setTickRevision((r) => r + 1)}
        />
      ) : (
        <p className={`text-[10px] leading-snug ${mutedText}`}>
          Import any <b>.rcgr.gz</b> Goal Replay container (or legacy CSV/JSON) to immediately
          preview all cars, orientations, name tags, and camera paths in the 3D Arena, or score a
          Goal Replay to export.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="primary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            isLight={isLight}
            className="gap-1 px-2.5 py-1 text-[10px] font-bold"
            title="Import a .rcgr.gz (or .rcreplay.gz / .csv / .json) Goal Replay file to preview and scrub in the 3D Arena"
          >
            <Upload className="h-3 w-3 shrink-0" />
            <span>Import .rcgr.gz</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            disabled={!canExportReplay}
            onClick={handleExportContainer}
            isLight={isLight}
            className="gap-1 px-2.5 py-1 text-[10px] font-bold"
            title={
              canExportReplay
                ? 'Export Gzip-compressed .rcgr.gz containing full 8-car 448-float physics, orientations, name tags, directorConfig, and camera trajectory'
                : 'Available once a Goal Replay is active or imported'
            }
          >
            <Download className="h-3 w-3 text-emerald-400 shrink-0" />
            <span>Export .rcgr.gz</span>
          </Button>
        </div>

        <Button
          variant="secondary"
          size="sm"
          disabled={!canExportReplay || !liveSnapshot}
          onClick={handleCopyWindowDiagnostic}
          isLight={isLight}
          className="gap-1 px-2 py-1 text-[10px]"
          title="Copy self-contained 31-frame window diagnostic (#id ±15 frames) + directorConfig + anomalyPeaks + touchTimeline to clipboard"
        >
          {copiedWindowSnap ? (
            <>
              <Check className="h-3 w-3 text-emerald-400 shrink-0" />
              <span>Copied Window #{effectiveFrameId} ±15f!</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3 text-amber-400 shrink-0" />
              <span>Copy Window (#{effectiveFrameId} ±15f)</span>
            </>
          )}
        </Button>
      </div>

      {exportedFileMsg && (
        <div className="text-[10px] font-mono text-emerald-400 px-1 truncate">
          <Check className="h-3 w-3 inline mr-1" /> {exportedFileMsg}
        </div>
      )}
    </div>
  );
};
