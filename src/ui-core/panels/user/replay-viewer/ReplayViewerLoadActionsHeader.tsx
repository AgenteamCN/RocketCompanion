import React, { useRef } from 'react';
import { Upload, Loader2, ClockCheck } from 'lucide-react';
import { quickNotification } from '../../../stores/quickNotificationStore';
import { triggerReplayFilePicker } from '../replayFilePicker';

export interface ReplayViewerLoadActionsHeaderProps {
  isLight: boolean;
  isLoadingReplay: boolean;
  loadRecentDisabled: boolean;
  hasRuntimeHandlers: boolean;
  onUploadFile?: (file: File) => void;
  onLoadRecent: () => void;
}

export const ReplayViewerLoadActionsHeader: React.FC<
  ReplayViewerLoadActionsHeaderProps
> = ({
  isLight,
  isLoadingReplay,
  loadRecentDisabled,
  hasRuntimeHandlers,
  onUploadFile,
  onLoadRecent,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".rcreplay,.rcreplay.gz,.rcgr,.rcgr.gz,.json,.gz,application/gzip,application/x-gzip,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) {
            onUploadFile?.(file);
          }
        }}
      />
      {/* 1. Top Row: 2 Buttons — Load Replay Files (Black Primary + Upload icon) & Load Recent (clock-check icon) */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={Boolean(isLoadingReplay)}
          onClick={() => {
            if (isLoadingReplay) return;
            if (hasRuntimeHandlers) {
              triggerReplayFilePicker((file) => {
                onUploadFile?.(file);
              });
            } else {
              quickNotification.info('Open local .rcreplay file picker.');
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
              <span>Loading Replay...</span>
            </>
          ) : (
            <>
              <Upload className="h-3.5 w-3.5 shrink-0" />
              <span>Load Replay Files</span>
            </>
          )}
        </button>

        <button
          type="button"
          disabled={loadRecentDisabled}
          onClick={() => {
            if (loadRecentDisabled) return;
            onLoadRecent();
          }}
          className={`py-2 px-3 rounded-xl border font-semibold text-xs inline-flex items-center justify-center gap-1.5 transition-all ${
            loadRecentDisabled
              ? isLight
                ? 'bg-neutral-100 border-neutral-200 text-neutral-400 opacity-45 cursor-not-allowed pointer-events-none'
                : 'bg-neutral-800/50 border-neutral-800 text-neutral-500 opacity-45 cursor-not-allowed pointer-events-none'
              : isLight
              ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800 cursor-pointer active:scale-95'
              : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200 cursor-pointer active:scale-95'
          }`}
        >
          <ClockCheck className="h-3.5 w-3.5 shrink-0" />
          <span>Load Recent</span>
        </button>
      </div>
    </>
  );
};
