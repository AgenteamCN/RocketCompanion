import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  ballTrajectoryTunerStore,
  INITIAL_BALL_TRAJECTORY_ANOMALY_SUMMARY,
  useBallTrajectoryTunerStore,
} from '../../../stores/ballTrajectoryTunerStore';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';

export interface BallTrajectoryAnomalyDebugCardProps {
  isLight?: boolean;
}

export const BallTrajectoryAnomalyDebugCard: React.FC<
  BallTrajectoryAnomalyDebugCardProps
> = ({ isLight = false }) => {
  const { telemetry, notifyAnomalyAlerts } = useBallTrajectoryTunerStore();
  const [copied, setCopied] = useState(false);

  const summary = telemetry.anomalySummary ?? INITIAL_BALL_TRAJECTORY_ANOMALY_SUMMARY;
  const latest = summary.latestSample;

  const cardBg = isLight
    ? 'bg-neutral-50/90 border-neutral-200 text-neutral-800'
    : 'bg-neutral-850/60 border-neutral-700/60 text-neutral-200';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  const handleCopy = async () => {
    const ok = await ballTrajectoryTunerStore.copyAnomalyJson(true);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  };

  return (
    <div
      className={`p-2.5 rounded-xl border flex flex-col gap-2 ${
        summary.hasLatchedAnomaly
          ? 'border-amber-500/50 bg-amber-950/20'
          : cardBg
      }`}
    >
      <div className="flex items-center justify-between border-b border-neutral-500/20 pb-1.5">
        <div className="flex items-center gap-1.5">
          {summary.hasLatchedAnomaly ? (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          )}
          <div className="flex flex-col">
            <span className="font-bold text-[11px]">
              Dual-Space Anomaly Capture &amp; Export (Space A vs Space B)
            </span>
            <span className={`text-[9px] ${mutedText}`}>
              Captures non-car-hit recomputes, Space A baseline, Space B resync, &amp; 90-tick buffer
            </span>
          </div>
        </div>
        <span
          className={`font-mono text-[9px] px-1.5 py-0.5 rounded border font-semibold ${
            summary.hasLatchedAnomaly
              ? 'text-amber-300 border-amber-500/50 bg-amber-500/20'
              : 'text-emerald-400 border-emerald-500/40 bg-emerald-500/15'
          }`}
        >
          {summary.hasLatchedAnomaly
            ? `LATCHED (#${latest?.sequenceNumber ?? 1})`
            : 'ARMED (WATCHING)'}
        </span>
      </div>

      {/* Space A Baseline & Counters */}
      <div className="grid grid-cols-4 gap-1.5 font-mono text-[10px]">
        <div className="p-1.5 rounded-lg bg-black/20 border border-white/5 flex flex-col">
          <span className={mutedText}>Space A Anchor</span>
          <span className="font-bold text-sky-400 truncate">
            {summary.spaceAAnchorTick >= 0 ? `t=${summary.spaceAAnchorTick}` : 'Idle'}
          </span>
        </div>
        <div className="p-1.5 rounded-lg bg-black/20 border border-white/5 flex flex-col">
          <span className={mutedText}>Saved Samples</span>
          <span className="font-bold text-amber-400">{summary.capturedCount}</span>
        </div>
        <div className="p-1.5 rounded-lg bg-black/20 border border-white/5 flex flex-col">
          <span className={mutedText}>Non-Car Syncs</span>
          <span className="font-bold text-rose-400">{summary.totalNonCarRecomputes}</span>
        </div>
        <div className="p-1.5 rounded-lg bg-black/20 border border-white/5 flex flex-col">
          <span className={mutedText}>Seam Resyncs</span>
          <span className="font-bold text-purple-400">{summary.totalWasmSeamResyncs}</span>
        </div>
      </div>

      {/* Latest Captured Sample Details */}
      {latest ? (
        <div className="p-2 rounded-lg bg-black/25 border border-amber-500/25 flex flex-col gap-1 font-mono text-[10px]">
          <div className="flex items-center justify-between">
            <span className="font-bold text-amber-300">
              #{latest.sequenceNumber} [{latest.triggerKind}] @ {latest.seamRegion}
            </span>
            <span className={mutedText}>
              t={latest.anomalyTick} (+{latest.ticksSinceSpaceAAnchor}t from Space A)
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 pt-0.5">
            <div>
              <span className={mutedText}>Step posErr: </span>
              <span className="text-rose-400 font-bold">
                {latest.posErrorUu.toFixed(3)} UU
              </span>
            </div>
            <div>
              <span className={mutedText}>Step dVel: </span>
              <span className="text-amber-400 font-bold">
                {latest.velErrorUuPerSec.toFixed(2)} UU/s
              </span>
            </div>
            <div>
              <span className={mutedText}>Car Gap: </span>
              <span className="text-emerald-400 font-bold">
                {latest.closestCarSurfaceGapUu.toFixed(0)} UU
              </span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <span className={mutedText}>vs Space A: </span>
              <span className="text-sky-400 font-bold">
                {latest.spaceADirectPosErrorUu.toFixed(2)} UU
              </span>
            </div>
            <div>
              <span className={mutedText}>Tail Err: </span>
              <span className="text-purple-400 font-bold">
                {latest.tailContinuityErrorUu.toFixed(2)} UU
              </span>
            </div>
            <div>
              <span className={mutedText}>Speed: </span>
              <span className="text-neutral-200 font-bold">
                {latest.liveSpeedUuPerSec.toFixed(0)} UU/s
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className={`px-2 py-1.5 rounded-lg bg-black/15 border border-white/5 text-[10px] ${mutedText}`}>
          No non-car-hit trajectory deviation latched yet. Space A updates automatically on every Car-Ball Hit.
        </div>
      )}

      {/* Toast Notification Toggle */}
      <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-black/15 border border-white/5">
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold">Popup Alert on Non-Car Recompute</span>
          <span className={`text-[9px] ${mutedText}`}>
            Show toast notification with one-click Export &amp; Reset when triggered
          </span>
        </div>
        <ToggleSwitch
          checked={notifyAnomalyAlerts}
          onChange={(enabled) => ballTrajectoryTunerStore.setNotifyAnomalyAlerts(enabled)}
          isLight={isLight}
        />
      </div>

      {/* Export / Copy / Reset Action Bar */}
      <div className="grid grid-cols-4 gap-1.5 pt-0.5">
        <button
          type="button"
          onClick={() => ballTrajectoryTunerStore.exportAnomalyJson(true)}
          className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg font-semibold text-[10px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 transition-colors cursor-pointer"
          title="Export Dual-Space Space A / Space B & 90-tick rolling buffer to JSON"
        >
          <Download className="h-3 w-3" />
          <span>Export ({summary.capturedCount})</span>
        </button>

        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg font-semibold text-[10px] bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 transition-colors cursor-pointer"
          title="Copy full anomaly diagnostic JSON bundle to clipboard"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          <span>{copied ? 'Copied' : 'Copy JSON'}</span>
        </button>

        <button
          type="button"
          onClick={() => ballTrajectoryTunerStore.resetAnomalyAndArmNext()}
          className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg font-semibold text-[10px] border transition-colors cursor-pointer ${
            summary.hasLatchedAnomaly
              ? 'bg-amber-500/30 hover:bg-amber-500/40 text-amber-200 border-amber-400/50'
              : 'bg-neutral-500/15 hover:bg-neutral-500/25 text-neutral-300 border-neutral-500/30'
          }`}
          title="Unlatch current anomaly and arm recorder for the next occurrence"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Reset &amp; Arm</span>
        </button>

        <button
          type="button"
          onClick={() => ballTrajectoryTunerStore.clearAnomalySamples()}
          className="flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg font-semibold text-[10px] bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition-colors cursor-pointer"
          title="Clear all saved anomaly samples and reset counters"
        >
          <Trash2 className="h-3 w-3" />
          <span>Clear All</span>
        </button>
      </div>
    </div>
  );
};
