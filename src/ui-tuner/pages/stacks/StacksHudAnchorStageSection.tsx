import React from 'react';
import { Crosshair } from 'lucide-react';
import {
  HudAnchorStage,
  HudRelativeAnchor,
  HudSlot,
  type HudSlotMode,
  HudZone,
} from '../../../ui-core/layout/HudAnchorStage';
import { SegmentedSwitch } from '../../../ui-core/primitives/SegmentedSwitch';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';

export interface StacksHudAnchorStageSectionProps {
  slotMode: HudSlotMode;
  onSlotModeChange: (mode: HudSlotMode) => void;
  showTopBand: boolean;
  onShowTopBandChange: (show: boolean) => void;
  showBoostSlot: boolean;
  onShowBoostSlotChange: (show: boolean) => void;
  showTopBandGuide: boolean;
  onShowTopBandGuideChange: (show: boolean) => void;
  isLight: boolean;
}

export const StacksHudAnchorStageSection: React.FC<StacksHudAnchorStageSectionProps> = React.memo(
  ({
    slotMode,
    onSlotModeChange,
    showTopBand,
    onShowTopBandChange,
    showBoostSlot,
    onShowBoostSlotChange,
    showTopBandGuide,
    onShowTopBandGuideChange,
    isLight,
  }) => {
    const stageStrategy = slotMode === 'reserve' ? 'reserve' : 'collapse-symmetric';

    return (
      <div
        id="l2-stacks-4-hud-anchor-stage"
        className={`scroll-mt-24 p-6 rounded-2xl border flex flex-col gap-4 transition-colors ${
          isLight ? 'bg-white border-neutral-200 shadow-xs' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-sm flex items-center gap-2">
              <Crosshair className="h-4 w-4 text-indigo-500" />
              <span>
                4. 3x3 grid anchor points and top bar height-aligned tripartite space
                (HudAnchorStage / HudTopSplitBand / HudZone / HudSlot / HudRelativeAnchor)
              </span>
            </span>
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono">
              pure L2 Geometric skeleton: top bar 56px Shared height (left Telemetry With right
              40×40 Stack Icon + Bubble Vertically centered, in Scorebug Stick to top top-0) ,
              Eliminate magic coordinate coupling
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <SegmentedSwitch
              size="sm"
              value={slotMode}
              onValueChange={(v) => onSlotModeChange(v as HudSlotMode)}
              isLight={isLight}
              options={[
                { value: 'reserve', label: 'reserve (Fixed Placeholder)' },
                { value: 'collapse', label: 'collapse (Flow fill)' },
              ]}
            />
            <ToggleSwitch
              label="show 56px Top bar guide"
              checked={showTopBandGuide}
              onCheckedChange={onShowTopBandGuideChange}
              isLight={isLight}
            />
            <ToggleSwitch
              label="Toggle top bar"
              checked={showTopBand}
              onCheckedChange={onShowTopBandChange}
              isLight={isLight}
            />
            <ToggleSwitch
              label="Boost Toggle dashboard"
              checked={showBoostSlot}
              onCheckedChange={onShowBoostSlotChange}
              isLight={isLight}
            />
          </div>
        </div>

        <div
          className={`relative w-full h-[340px] rounded-2xl border overflow-hidden font-mono text-xs ${
            isLight
              ? 'bg-neutral-100/90 border-neutral-300 text-neutral-800'
              : 'bg-neutral-950 border-neutral-800 text-neutral-200'
          }`}
        >
          {showTopBandGuide && (
            <div className="absolute top-0 inset-x-0 h-[56px] border-b border-dashed border-indigo-500/40 bg-indigo-500/5 pointer-events-none z-10 flex items-end justify-center pb-0.5">
              <span className="text-[9px] text-indigo-500 font-bold tracking-widest uppercase">
                HudTopSplitBand (56px Shared Vertical Space · items-center)
              </span>
            </div>
          )}

          <HudAnchorStage strategy={stageStrategy}>
            <HudZone anchor="top-left" flush>
              <HudSlot
                visible={showTopBand}
                mode={slotMode}
                reservedHeight={56}
                innerClassName="h-[56px] flex items-center pl-3"
              >
                <div className="h-[26px] px-2.5 rounded-md border border-emerald-500/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 flex items-center text-[10px] font-bold">
                  [Left Container] Telemetry (26px · Centered in 56px)
                </div>
              </HudSlot>

              <div className="px-3 py-3 rounded-r-lg border-y border-r border-blue-500/50 bg-blue-500/15 text-blue-600 dark:text-blue-300 text-[10px] font-bold">
                [Left Landmark] Team 1-3 Strip (Starts at y=56px)
              </div>
            </HudZone>

            <HudZone anchor="top-center" flush>
              <div className="px-4 py-1.5 rounded-b-md border-x border-b border-neutral-400 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-[10px] font-bold shadow-xs">
                [Center Container · top-0] Scorebug
              </div>
              <div className="-mt-[4px] pt-[6px] pb-1 px-3 rounded-b-md border-x border-b border-neutral-400 dark:border-neutral-700 bg-neutral-200 dark:bg-neutral-800 text-[9px]">
                Series Pips Banner (Tier 1)
              </div>
              <div className="-mt-[4px] pt-[6px] pb-1 px-3 rounded-b-md bg-red-600 text-white text-[9px] font-bold">
                Phase Drop-Banner (Tier 2 · OVERTIME)
              </div>
            </HudZone>

            <HudZone anchor="top-right" flush>
              <HudSlot
                visible={showTopBand}
                mode={slotMode}
                reservedHeight={56}
                innerClassName="h-[56px] flex items-center justify-end pr-3"
              >
                <div className="relative w-10 h-10 rounded-xl border border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-300 flex items-center justify-center text-[10px] font-bold">
                  Stack
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-500 text-neutral-950 text-[9px] flex items-center justify-center font-extrabold">
                    4
                  </span>
                </div>
              </HudSlot>

              <div className="px-3 py-3 rounded-l-lg border-y border-l border-orange-500/50 bg-orange-500/15 text-orange-600 dark:text-orange-300 text-[10px] font-bold">
                [Right Landmark] Team 4-6 Strip (Starts at y=56px)
              </div>
            </HudZone>

            <HudZone anchor="bottom-left">
              <div className="px-3 py-1.5 rounded-lg border border-neutral-400/50 bg-neutral-500/10 text-[10px] font-bold">
                [Bottom-Left] BallCam
              </div>
            </HudZone>

            <HudZone anchor="bottom-center">
              <HudRelativeAnchor
                placement="top"
                align="start"
                gap={8}
                floating
                attachment={
                  <div className="relative overflow-hidden px-2.5 py-1 rounded-md border border-emerald-500/60 bg-neutral-900/80 text-white text-[10px] font-bold">
                    <div className="absolute inset-y-0 left-0 w-[72%] bg-emerald-500/40" />
                    <span className="relative z-10">
                      FlipPill (top + align=start · 160-step fill)
                    </span>
                  </div>
                }
              >
                <div className="w-[260px] py-1.5 px-3 rounded-md border border-sky-500/50 bg-sky-500/15 text-sky-600 dark:text-sky-300 text-center text-[10px] font-bold">
                  [Bottom-Center] VelocityProgressBar
                </div>
              </HudRelativeAnchor>
            </HudZone>

            <HudZone anchor="bottom-right" flush className="pb-3">
              <div className="mb-2 px-3 py-1.5 rounded-l-md border-y border-l border-sky-500/50 bg-sky-500/15 text-sky-600 dark:text-sky-300 text-[10px] font-bold">
                [Notification] Above Reserved Boost Slot
              </div>
              <HudSlot visible={showBoostSlot} mode="reserve" innerClassName="pr-4">
                <div className="w-20 h-20 rounded-full border-2 border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-300 flex items-center justify-center text-center text-[10px] font-bold p-2">
                  Boost Slot (reserve)
                </div>
              </HudSlot>
            </HudZone>
          </HudAnchorStage>
        </div>
      </div>
    );
  }
);

StacksHudAnchorStageSection.displayName = 'StacksHudAnchorStageSection';
