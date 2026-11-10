import React from 'react';
import { Compass, Gauge, CircleDot, Camera } from 'lucide-react';
import type { EditSubMode, StaticTrainingHudShot } from '../stores/hudTransientTypes';
import {
  useStaticTrainingPackStore,
  getActiveEditItemVariable,
} from '../stores/staticTrainingPackStore';

export type StaticTrainingShotWithTimeout = StaticTrainingHudShot & {
  timeoutSeconds?: number;
};

export interface StaticTrainingPackHUDProps {
  isLight?: boolean;
  shotIndex?: number;
  shot?: StaticTrainingShotWithTimeout;
  editSubMode?: EditSubMode;
  onSelectSubMode?: (mode: EditSubMode) => void;
  isTrajectoryTesting?: boolean;
  className?: string;
}

const MODE_ICONS: { id: EditSubMode; title: string; icon: React.ReactNode }[] = [
  { id: 'car-heading', title: 'Car Heading', icon: <Compass className="h-4 w-4" /> },
  { id: 'car-speed', title: 'Car Speed', icon: <Gauge className="h-4 w-4" /> },
  { id: 'ball-speed', title: 'Ball Speed', icon: <CircleDot className="h-4 w-4" /> },
  { id: 'free-cam', title: 'Free Camera', icon: <Camera className="h-4 w-4" /> },
];

/**
 * [L5A HUD] StaticTrainingPackHUD
 * Streamlined top-center floating banner displayed during Static Training Pack Edit/Play sessions:
 * - Left: `#01` shot number
 * - Center: 3 or 4 Edit Sub-Mode icons (Car Speed icon automatically hides when `speedFollowsHeading` is ON),
 *   or timer/countdown in Play Mode / Single-Shot Test [G]
 * - Right: 2 rows (Row 1 = BOOST INF / %; Row 2 = HAS FLIP / NO FLIP)
 * - Bottom shortcut bar: `9/0 Cycle Selection · T Simulate · F Switch Side · V to Move Down · O/P Boost · [/] Speed · Up/Down Time`
 */
export const StaticTrainingPackHUD: React.FC<StaticTrainingPackHUDProps> = React.memo(({
  isLight = false,
  shotIndex: propShotIndex,
  shot: propShot,
  editSubMode: propEditSubMode,
  onSelectSubMode,
  isTrajectoryTesting: propIsTrajectoryTesting,
  className = '',
}) => {
  const activePack = useStaticTrainingPackStore((s) => s.activePack);
  const sessionMode = useStaticTrainingPackStore((s) => s.sessionMode);
  const storeShotIndex = useStaticTrainingPackStore((s) => s.currentShotIndex);
  const storeEditSubMode = useStaticTrainingPackStore((s) => s.editSubMode);
  const isEditingItem = useStaticTrainingPackStore((s) => s.isEditingItem);
  const editVarVersion = useStaticTrainingPackStore((s) => s.editVarVersion);
  const downCounterEnabled = useStaticTrainingPackStore((s) => s.downCounterEnabled);
  const remainingTimeoutSec = useStaticTrainingPackStore((s) => s.remainingTimeoutSec);
  const activeCountdownSec = useStaticTrainingPackStore((s) => s.activeCountdownSec);
  const isShotLaunched = useStaticTrainingPackStore((s) => s.isShotLaunched);
  const isOvertimeWaitGround = useStaticTrainingPackStore((s) => s.isOvertimeWaitGround);
  const isReplayActive = useStaticTrainingPackStore((s) => s.isReplayActive);
  const storeTrajectoryTesting = useStaticTrainingPackStore(
    (s) => s.isFreeCamTrajectoryTesting
  );
  const isTestingSingleShot = useStaticTrainingPackStore((s) => s.isTestingSingleShot);
  const isShotMirrored = useStaticTrainingPackStore((s) => s.isShotMirrored);
  const setEditSubMode = useStaticTrainingPackStore((s) => s.setEditSubMode);

  void editVarVersion;

  if (!propShot && (!activePack || isReplayActive)) return null;

  const items = activePack?.items || [];
  const safeIdx =
    propShotIndex !== undefined
      ? propShotIndex
      : Math.max(0, Math.min(Math.max(0, items.length - 1), storeShotIndex));

  const shot: StaticTrainingShotWithTimeout | null =
    propShot ||
    (sessionMode === 'edit' && isEditingItem && getActiveEditItemVariable()) ||
    items[safeIdx] ||
    null;

  if (!shot) return null;

  const editSubMode = propEditSubMode ?? storeEditSubMode;
  const isTrajectoryTesting = propIsTrajectoryTesting ?? storeTrajectoryTesting;
  const handleSelectSubMode = onSelectSubMode ?? setEditSubMode;

  const totalShotsCount = Math.max(1, items.length);
  const shotNumberText = `#${String(safeIdx + 1).padStart(2, '0')} / ${String(totalShotsCount).padStart(2, '0')}`;
  const isUnlimitedBoost = Boolean(shot.car.unlimitedBoost);
  const boostAmount = Math.round(shot.car.initialBoost ?? 100);
  const hasFlip = Boolean(shot.car.snapToGround || shot.car.hasFlip !== false);
  const speedFollowsHeading = shot.car.speedFollowsHeading !== false;
  const visibleModeIcons = speedFollowsHeading
    ? MODE_ICONS.filter((m) => m.id !== 'car-speed')
    : MODE_ICONS;

  const normalTextColor = isLight ? 'text-neutral-900' : 'text-neutral-100';
  const showPlayTimer = !propShot && (sessionMode === 'play' || isTestingSingleShot);

  return (
    <div
      data-ui-element="static-training-pack-hud"
      data-alpha-id="Alpha:StaticTrainingPackHUD"
      className={`absolute top-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none select-none flex flex-col items-center gap-1.5 ${className}`}
    >
      <div
        className={`px-4 py-2 rounded-xl border font-mono text-xs flex items-center gap-4 shadow-lg ${
          isLight
            ? 'bg-white/95 border-neutral-300 text-neutral-900'
            : 'bg-neutral-950/92 border-neutral-700/80 text-neutral-100'
        }`}
      >
        {/* 1. Shot Number (#14 / 99) */}
        <span className="text-base font-extrabold tracking-tight text-cyan-500 dark:text-cyan-400">
          {shotNumberText}
        </span>

        <span className="opacity-30">|</span>

        {/* 2. Center: 3 or 4 Edit Sub-Mode Icons (or Play / Single-Shot Test Timer) */}
        {showPlayTimer ? (
          <div className="flex items-center gap-3">
            <span
              className={`font-bold tabular-nums ${
                isOvertimeWaitGround || remainingTimeoutSec <= 0
                  ? isLight
                    ? 'text-black'
                    : 'text-neutral-600'
                  : remainingTimeoutSec <= 3
                  ? 'text-rose-400'
                  : 'text-emerald-400'
              }`}
            >
              {`${Math.max(0, remainingTimeoutSec).toFixed(1)}s`}
            </span>

            {!isShotLaunched && downCounterEnabled && activeCountdownSec > 0 && (
              <span className="text-amber-300 font-bold animate-pulse text-[11px]">
                {`COUNTDOWN ${activeCountdownSec}...`}
              </span>
            )}
            {isShotMirrored && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-bold">
                MIRRORED [F]
              </span>
            )}
            {isTestingSingleShot && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-bold">
                TEST SHOT [G]
              </span>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5 pointer-events-auto">
              {visibleModeIcons.map((m) => {
                const active = editSubMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleSelectSubMode?.(m.id)}
                    title={m.title}
                    className={`p-1.5 rounded-lg border transition-all flex items-center justify-center cursor-pointer ${
                      active
                        ? isLight
                          ? 'bg-amber-500 border-amber-600 text-white shadow-sm scale-105'
                          : 'bg-amber-400/25 border-amber-400 text-amber-300 shadow-sm scale-105'
                        : isLight
                        ? 'bg-neutral-100/70 hover:bg-neutral-200 border-neutral-200 text-neutral-400 opacity-60 hover:opacity-100'
                        : 'bg-neutral-900/60 hover:bg-neutral-800 border-neutral-800 text-neutral-500 opacity-55 hover:opacity-100'
                    }`}
                  >
                    {m.icon}
                  </button>
                );
              })}
              {isTrajectoryTesting && (
                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 border border-sky-400/40 text-sky-300 font-bold animate-pulse">
                  TRAJ TEST [T]
                </span>
              )}
            </div>

            {typeof shot.timeoutSeconds === 'number' && (
              <>
                <span className="opacity-30">|</span>
                <div
                  className="flex items-center gap-1.5 text-xs font-bold tabular-nums"
                  title="Shot Time Limit (Up/Down Arrow Keys)"
                >
                  <span className="opacity-60 text-[10px]">TIME</span>
                  <span className={`text-sm font-extrabold ${normalTextColor}`}>
                    {Math.round(shot.timeoutSeconds ?? 10)}s
                  </span>
                </div>
              </>
            )}
          </>
        )}

        <span className="opacity-30">|</span>

        {/* 3. Right Side: Two Rows (Row 1 = Boost, Row 2 = Flip) */}
        <div className="flex flex-col items-end justify-center leading-tight min-w-[72px]">
          <div className="flex items-center gap-1.5 text-[11px] font-bold">
            <span className="opacity-60 text-[10px]">BOOST</span>
            {isUnlimitedBoost ? (
              <span className="text-purple-500 dark:text-purple-400 font-extrabold">INF</span>
            ) : boostAmount <= 0 ? (
              <span className="text-rose-500 font-extrabold">0</span>
            ) : (
              <span className={`font-extrabold ${normalTextColor}`}>{boostAmount}</span>
            )}
          </div>
          <div className="text-[10px] font-extrabold tracking-wider mt-0.5">
            {hasFlip ? (
              <span className={normalTextColor}>HAS FLIP</span>
            ) : (
              <span className="text-orange-500 dark:text-orange-400">NO FLIP</span>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Concise Shortcut Line */}
      {!showPlayTimer && (
        <div
          className={`px-3 py-1 rounded-lg border font-mono text-[10px] shadow-xs ${
            isLight
              ? 'bg-neutral-100/95 border-neutral-300 text-neutral-700'
              : 'bg-neutral-900/90 border-neutral-800 text-neutral-300'
          }`}
        >
          9/0 Cycle Selection · T Simulate · F Switch Side · V to Move Down · O/P Boost · [/] Speed · Up/Down Time
        </div>
      )}
    </div>
  );
});

StaticTrainingPackHUD.displayName = 'StaticTrainingPackHUD';
