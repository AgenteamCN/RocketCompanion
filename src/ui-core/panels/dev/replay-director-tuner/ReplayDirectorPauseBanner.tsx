import React from 'react';
import { Play, Pause, FastForward } from 'lucide-react';
import { useHudStore } from '../../../stores/hudStore';

export interface ReplayDirectorPauseBannerProps {
  isGoalReplayActive: boolean;
  effectivePaused: boolean;
  effectiveSpeed: number;
  isLight?: boolean;
  onTogglePauseScrub: () => void;
  onCycleSpeed: () => void;
}

export const ReplayDirectorPauseBanner: React.FC<ReplayDirectorPauseBannerProps> = ({
  isGoalReplayActive,
  effectivePaused,
  effectiveSpeed,
  isLight = false,
  onTogglePauseScrub,
  onCycleSpeed,
}) => {
  const replayCameraMode = useHudStore((s) => s.replayCameraMode);
  const replayScorerName = useHudStore((s) => s.replayScorerName);
  const replayScorerTeam = useHudStore((s) => s.replayScorerTeam);
  const replayBallSpeedKph = useHudStore((s) => s.replayBallSpeedKph);
  const replayAssistName = useHudStore((s) => s.replayAssistName);
  const onToggleCameraMode = useHudStore((s) => s.onReplayToggleCameraMode);

  const subPanelBg = isLight
    ? 'bg-white border-neutral-200'
    : 'bg-neutral-900/60 border-neutral-800/80';

  return (
    <div
      data-testid="replay-director-pause-indicator"
      className={`px-2.5 py-1.5 rounded-lg border flex flex-col gap-1 font-mono text-[10px] ${
        isGoalReplayActive
          ? effectivePaused
            ? 'bg-amber-500/15 border-amber-500/45 text-amber-200'
            : 'bg-emerald-500/12 border-emerald-500/35 text-emerald-200'
          : subPanelBg
      }`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full shrink-0 ${
              isGoalReplayActive
                ? effectivePaused
                  ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                  : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                : 'bg-neutral-500'
            }`}
          />
          <span className="font-extrabold tracking-wider uppercase text-[10px]">
            {isGoalReplayActive
              ? effectivePaused
                ? 'GOAL REPLAY PAUSED'
                : 'GOAL REPLAY LIVE'
              : 'GOAL REPLAY PAUSE [P] READY'}
          </span>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            disabled={!isGoalReplayActive}
            onClick={onTogglePauseScrub}
            className={`px-2 py-0.5 rounded border text-[10px] font-bold flex items-center gap-1 ${
              isGoalReplayActive
                ? 'border-neutral-600 bg-neutral-800 hover:bg-neutral-700 text-neutral-100 cursor-pointer'
                : 'border-neutral-800 bg-neutral-900/50 text-neutral-500 opacity-60 cursor-not-allowed'
            }`}
          >
            {effectivePaused ? (
              <Play className="h-2.5 w-2.5 text-emerald-400" />
            ) : (
              <Pause className="h-2.5 w-2.5 text-amber-400" />
            )}
            <span>{effectivePaused ? '[P] Play' : '[P] Pause'}</span>
          </button>

          {onToggleCameraMode && (
            <button
              type="button"
              disabled={!isGoalReplayActive}
              onClick={() => onToggleCameraMode?.()}
              className={`px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase ${
                isGoalReplayActive
                  ? 'border-neutral-600 bg-neutral-800 hover:bg-neutral-700 text-amber-300 cursor-pointer'
                  : 'border-neutral-800 bg-neutral-900/50 text-neutral-500 opacity-60 cursor-not-allowed'
              }`}
            >
              Cam: {replayCameraMode === 'director' ? 'Director' : 'POV'}
            </button>
          )}

          <button
            type="button"
            disabled={!isGoalReplayActive}
            onClick={onCycleSpeed}
            className={`px-1.5 py-0.5 rounded border text-[10px] font-bold flex items-center gap-1 ${
              isGoalReplayActive
                ? 'border-neutral-600 bg-neutral-800 hover:bg-neutral-700 text-sky-300 cursor-pointer'
                : 'border-neutral-800 bg-neutral-900/50 text-neutral-500 opacity-60 cursor-not-allowed'
            }`}
          >
            <FastForward className="h-2.5 w-2.5" />
            <span>{effectiveSpeed}x</span>
          </button>
        </div>
      </div>

      {(replayScorerName || typeof replayBallSpeedKph === 'number') && isGoalReplayActive && (
        <div className="flex items-center gap-2 flex-wrap text-[9.5px] pt-0.5 border-t border-neutral-700/40">
          {replayScorerName && (
            <span>
              Scorer:{' '}
              <b
                className={
                  replayScorerTeam === 0
                    ? 'text-sky-400'
                    : replayScorerTeam === 1
                      ? 'text-amber-400'
                      : ''
                }
              >
                {replayScorerName}
              </b>
            </span>
          )}
          {typeof replayBallSpeedKph === 'number' && (
            <span>
              Speed: <b className="text-emerald-400">{replayBallSpeedKph} KM/H</b>
            </span>
          )}
          {replayAssistName && (
            <span>
              Assist: <b>{replayAssistName}</b>
            </span>
          )}
        </div>
      )}
    </div>
  );
};
