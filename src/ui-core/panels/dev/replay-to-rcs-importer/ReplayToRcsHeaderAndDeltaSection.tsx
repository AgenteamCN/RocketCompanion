import React, { useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Database,
  Download,
  Loader2,
  Upload,
} from 'lucide-react';
import { useReplayToRcsImporterStore } from '../../../stores/replayToRcsImporterStore';

export interface ReplayToRcsHeaderAndDeltaSectionProps {
  isLight?: boolean;
  controlsDisabled: boolean;
}

export const ReplayToRcsHeaderAndDeltaSection: React.FC<ReplayToRcsHeaderAndDeltaSectionProps> = ({
  isLight = false,
  controlsDisabled,
}) => {
  const {
    totalFrames,
    sourceFrameCount,
    sourceRecordFps,
    incidentTrackCount,
    signalTrackCount,
    nativeEventTrackCount,
    keyframeTrackCount,
    trackDeltaSummary,
    errorMessage,
    isLoadingReplay,
    isExportingRcsPack,
    runtimeHandlers,
  } = useReplayToRcsImporterStore();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showDeltaDetails, setShowDeltaDetails] = useState(false);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".replay"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) {
            runtimeHandlers.onUploadRLReplayFile?.(file);
          }
        }}
      />

      {/* 1. Top Row: Import .replay File & Save as RCS Replay Pack (.rcreplay.gz) */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={isLoadingReplay}
          onClick={() => {
            if (isLoadingReplay) return;
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
              fileInputRef.current.click();
            }
          }}
          className={`py-2 px-3 rounded-xl font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-all shadow-xs ${
            isLoadingReplay
              ? isLight
                ? 'bg-neutral-800 text-white/80 border border-neutral-800 cursor-wait'
                : 'bg-neutral-200 text-neutral-950/80 border border-neutral-200 cursor-wait'
              : isLight
              ? 'bg-neutral-900 hover:bg-neutral-800 text-white border border-neutral-900 cursor-pointer active:scale-[0.985]'
              : 'bg-white hover:bg-neutral-200 text-neutral-950 border border-white cursor-pointer active:scale-[0.985]'
          }`}
        >
          {isLoadingReplay ? (
            <>
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              <span>Parsing .replay...</span>
            </>
          ) : (
            <>
              <Upload className="h-3.5 w-3.5 shrink-0" />
              <span>Import .replay File</span>
            </>
          )}
        </button>

        <button
          type="button"
          disabled={controlsDisabled || isExportingRcsPack}
          onClick={() => {
            if (controlsDisabled || isExportingRcsPack) return;
            runtimeHandlers.onExportRcsReplayPack?.();
          }}
          className={`py-2 px-3 rounded-xl border font-semibold text-xs inline-flex items-center justify-center gap-1.5 transition-all ${
            controlsDisabled || isExportingRcsPack
              ? isLight
                ? 'bg-neutral-100 border-neutral-200 text-neutral-400 opacity-45 cursor-not-allowed pointer-events-none'
                : 'bg-neutral-800/50 border-neutral-800 text-neutral-500 opacity-45 cursor-not-allowed pointer-events-none'
              : isLight
              ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800 cursor-pointer active:scale-95'
              : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200 cursor-pointer active:scale-95'
          }`}
        >
          {isExportingRcsPack ? (
            <>
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              <span>Saving Pack...</span>
            </>
          ) : (
            <>
              <Download className="h-3.5 w-3.5 shrink-0" />
              <span>Save RCS Pack (.gz)</span>
            </>
          )}
        </button>
      </div>

      {errorMessage && (
        <div
          className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-medium ${
            isLight
              ? 'bg-rose-50 border-rose-200 text-rose-700'
              : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
          }`}
        >
          {errorMessage}
        </div>
      )}

      {/* 3. Track Delta & Upsampling Telemetry Strip */}
      {trackDeltaSummary && (
        <div
          className={`rounded-xl border px-2.5 py-2 flex flex-col gap-1.5 ${
            isLight
              ? 'bg-neutral-100/80 border-neutral-200 text-neutral-700'
              : 'bg-white/[0.03] border-white/[0.08] text-neutral-300'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Database className="h-3.5 w-3.5 text-sky-400 shrink-0" />
              <span className="font-semibold text-[11px] truncate">
                {Math.round(sourceRecordFps || 30)}Hz ({sourceFrameCount}f) &rarr; 120Hz ({totalFrames}f) · Track Delta
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowDeltaDetails((prev) => !prev)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer ${
                isLight
                  ? 'bg-neutral-200/80 hover:bg-neutral-300 text-neutral-800'
                  : 'bg-white/[0.07] hover:bg-white/[0.12] text-neutral-200'
              }`}
            >
              <span>
                {trackDeltaSummary.mappedPropertyCount} Mapped / {trackDeltaSummary.trackDeltaOnlyPropertyCount} Delta
              </span>
              {showDeltaDetails ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
          </div>

          {showDeltaDetails && (
            <div className="pt-1 border-t border-white/[0.06] flex flex-col gap-1 text-[10px] opacity-90">
              <div className="flex items-center justify-between">
                <span>CRC32 Part1 / Part2:</span>
                <span className="font-mono">
                  {trackDeltaSummary.part1CrcValid ? 'PASS' : 'WARN'} /{' '}
                  {trackDeltaSummary.part2CrcValid ? 'PASS' : 'WARN'} · Map: {trackDeltaSummary.mapName}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Tracks 2–5 Events:</span>
                <span className="font-mono">
                  {incidentTrackCount} Inc · {signalTrackCount} Sig · {nativeEventTrackCount} Nat · {keyframeTrackCount} KF
                </span>
              </div>
              {trackDeltaSummary.unmappedPropertyNames.length > 0 && (
                <div className="max-h-24 overflow-y-auto pr-1 mt-0.5 font-mono text-[9.5px] leading-relaxed opacity-80">
                  <div className="font-sans font-semibold mb-0.5">
                    Retained in Track Delta ({trackDeltaSummary.unmappedPropertyNames.length} UE3 properties):
                  </div>
                  {trackDeltaSummary.unmappedPropertyNames.join(', ')}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
};
