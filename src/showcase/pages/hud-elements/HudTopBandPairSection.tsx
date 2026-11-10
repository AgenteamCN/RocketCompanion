import React from 'react';
import { Badge } from '../../../ui-core/primitives/Badge';
import { SectionErrorBoundary } from '../../components/SectionErrorBoundary';
import { StepperScoreboardHUD } from '../../../ui-core/hud/StepperScoreboardHUD';
import { EdgePlayerHudStrip } from '../../../ui-core/hud/EdgePlayerHudStrip';
import {
  resolveSkipIndicatorConfig,
  type EdgeSkipIndicatorConfig,
  type HudTransientChannel,
} from '../../../ui-core/stores/hudTransientTypes';

export interface HudTopBandPairSectionProps {
  isLight: boolean;
  edgeSkipReady: Record<number, boolean>;
  toggleEdgeSkipReady: (slotKey: 1 | 2 | 3 | 4 | 5 | 6) => void;
  edgeSkipConfig: EdgeSkipIndicatorConfig;
  setEdgeSkipConfig: React.Dispatch<React.SetStateAction<EdgeSkipIndicatorConfig>>;
  transientChannel: HudTransientChannel;
}

export const HudTopBandPairSection: React.FC<HudTopBandPairSectionProps> = ({
  isLight,
  edgeSkipReady,
  toggleEdgeSkipReady,
  edgeSkipConfig,
  setEdgeSkipConfig,
  transientChannel,
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <SectionErrorBoundary title="5A.1 StepperScoreboardHUD" isLight={isLight}>
        <section
          id="hud-5a-1-scoreboard"
          className={`p-5 rounded-3xl border flex flex-col gap-4 scroll-mt-24 ${
            isLight
              ? 'bg-white border-neutral-200 text-neutral-900 shadow-xs'
              : 'bg-neutral-900/80 border-neutral-800 text-neutral-100 shadow-lg'
          }`}
        >
          <div className="flex items-center justify-between border-b pb-2.5 border-neutral-200 dark:border-neutral-800 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="amber" size="sm" isLight={isLight}>
                5A.1
              </Badge>
              <h2 className="text-sm font-bold font-mono">
                StepperScoreboardHUD (`top-0` Snap to Top · Top square bottom round)
              </h2>
            </div>
            <Badge variant="primary" size="sm" isLight={isLight}>
              Double Chin `-mt-[6px] pt-[9px]` Anti-glitch
            </Badge>
          </div>
          <p className="text-xs opacity-75">
            Main scoreboard and score blocks are pinned to the top edge (
            <code className="font-mono">rounded-t-none border-t-0</code>), Bottom Rounded Corner (
            <code className="font-mono">rounded-b-[6px]</code>); Single Chin (
            <code className="font-mono">z-20</code>) and OVERTIME Double Chin (
            <code className="font-mono">z-10</code>) Reserve extra hidden space at the top to fit the top rounded corners, Eliminate rounded corner seam artifacts.
          </p>
          <div
            className={`relative h-[156px] rounded-2xl border overflow-hidden flex flex-col items-center justify-start ${
              isLight ? 'bg-slate-200/80 border-neutral-300' : 'bg-neutral-950 border-neutral-800'
            }`}
          >
            <StepperScoreboardHUD
              isLight={isLight}
              leftScore={2}
              rightScore={2}
              seconds={0}
              isOvertime={true}
              overtimeChinOpen={true}
              bestOf={5}
              leftSeriesWins={2}
              rightSeriesWins={1}
            />
          </div>
        </section>
      </SectionErrorBoundary>

      <SectionErrorBoundary title="5A.2 EdgePlayerHudStrip" isLight={isLight}>
        <section
          id="hud-5a-2-edge-strip"
          className={`p-5 rounded-3xl border flex flex-col gap-4 scroll-mt-24 ${
            isLight
              ? 'bg-white border-neutral-200 text-neutral-900 shadow-xs'
              : 'bg-neutral-900/80 border-neutral-800 text-neutral-100 shadow-lg'
          }`}
        >
          <div className="flex items-center justify-between border-b pb-2.5 border-neutral-200 dark:border-neutral-800 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="amber" size="sm" isLight={isLight}>
                5A.2
              </Badge>
              <h2 className="text-sm font-bold font-mono">
                EdgePlayerHudStrip (Symmetric single-side rounded bar)
              </h2>
            </div>
            <Badge variant="primary" size="sm" isLight={isLight}>
              subscribeRoster · 120Hz Ref
            </Badge>
          </div>
          <p className="text-xs opacity-75">
            Left-pinned right-rounded corner (<code className="font-mono">rounded-r-[9px]</code>),
            Right-aligned left-rounded corner (<code className="font-mono">rounded-l-[9px]</code>),
            with under-card tucked Skip Replay drawer (slides out from beneath player card · see{' '}
            <a href="#hud-5a-2-skip-inspector" className="text-emerald-500 underline">
              5A.2++ Workbench
            </a>{' '}
            below).
          </p>
          <div className="flex flex-col gap-1.5 font-mono text-[11px]">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-bold text-emerald-500">
                Skip Replay / Ready (Under-Card Push Drawer):
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {([1, 2, 3, 4, 5, 6] as const).map((k) => (
                  <label
                    key={k}
                    className="inline-flex items-center gap-1 cursor-pointer select-none px-1.5 py-0.5 rounded border border-neutral-400/30"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(edgeSkipReady[k])}
                      onChange={() => toggleEdgeSkipReady(k)}
                      className="accent-emerald-500 cursor-pointer"
                    />
                    <span>#{k}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 flex-wrap text-[10px]">
              <label className="flex items-center gap-1">
                <span className="opacity-75">size:</span>
                <input
                  type="range"
                  min={10}
                  max={32}
                  step={1}
                  value={edgeSkipConfig.sizePx}
                  onChange={(e) =>
                    setEdgeSkipConfig((p) => ({
                      ...resolveSkipIndicatorConfig(p),
                      sizePx: Number(e.target.value),
                    }))
                  }
                  className="w-11 accent-emerald-500 cursor-pointer"
                />
                <span className="tabular-nums font-bold">{edgeSkipConfig.sizePx}px</span>
              </label>
              <label className="flex items-center gap-1">
                <span className="opacity-75">weight:</span>
                <input
                  type="range"
                  min={1.0}
                  max={3.8}
                  step={0.1}
                  value={edgeSkipConfig.strokeWidth}
                  onChange={(e) =>
                    setEdgeSkipConfig((p) => ({
                      ...resolveSkipIndicatorConfig(p),
                      strokeWidth: Number(e.target.value),
                    }))
                  }
                  className="w-11 accent-emerald-500 cursor-pointer"
                />
                <span className="tabular-nums font-bold">
                  {edgeSkipConfig.strokeWidth.toFixed(1)}
                </span>
              </label>
              <label className="flex items-center gap-1">
                <span className="opacity-75">Glow:</span>
                <input
                  type="range"
                  min={0}
                  max={16}
                  step={1}
                  value={edgeSkipConfig.glowBlurPx}
                  onChange={(e) =>
                    setEdgeSkipConfig((p) => ({
                      ...resolveSkipIndicatorConfig(p),
                      glowBlurPx: Number(e.target.value),
                    }))
                  }
                  className="w-10 accent-emerald-500 cursor-pointer"
                />
                <span className="tabular-nums font-bold">{edgeSkipConfig.glowBlurPx}px</span>
              </label>
              <label
                className="flex items-center gap-1"
                title="Protrude length past player card"
              >
                <span className="opacity-75">ext:</span>
                <input
                  type="range"
                  min={24}
                  max={64}
                  step={1}
                  value={edgeSkipConfig.protrudeWidthPx}
                  onChange={(e) =>
                    setEdgeSkipConfig((p) => ({
                      ...resolveSkipIndicatorConfig(p),
                      protrudeWidthPx: Number(e.target.value),
                    }))
                  }
                  className="w-10 accent-emerald-500 cursor-pointer"
                />
                <span className="tabular-nums font-bold">
                  {edgeSkipConfig.protrudeWidthPx}px
                </span>
              </label>
              <div className="flex items-center gap-1">
                {(['#22C55E', '#10B981', '#84CC16', '#38BDF8', '#FFFFFF'] as const).map(
                  (hex, i) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() =>
                        setEdgeSkipConfig((p) => ({
                          ...resolveSkipIndicatorConfig(p),
                          color: hex,
                          glowColor: hex,
                        }))
                      }
                      title={`#${i + 1} Color: ${hex}`}
                      className={`w-3.5 h-3.5 rounded-full cursor-pointer border transition-transform ${
                        edgeSkipConfig.color.toUpperCase() === hex
                          ? 'scale-125 border-white ring-1 ring-emerald-500'
                          : 'border-black/30 opacity-80 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  )
                )}
              </div>
            </div>
          </div>
          <div
            className={`relative h-[156px] rounded-2xl border overflow-hidden flex items-center justify-between ${
              isLight ? 'bg-slate-200/80 border-neutral-300' : 'bg-neutral-950 border-neutral-800'
            }`}
          >
            <EdgePlayerHudStrip
              side="left"
              teamColor="#2563EB"
              barColor="#3B82F6"
              isLight={isLight}
              viewMode="spectator"
              skipIndicatorConfig={edgeSkipConfig}
              onSelectSlot={toggleEdgeSkipReady}
              players={transientChannel.getRoster().leftPlayers}
              subscribeRoster={transientChannel.subscribeRoster}
            />
            <EdgePlayerHudStrip
              side="right"
              teamColor="#EA580C"
              barColor="#F97316"
              isLight={isLight}
              viewMode="spectator"
              skipIndicatorConfig={edgeSkipConfig}
              onSelectSlot={toggleEdgeSkipReady}
              players={transientChannel.getRoster().rightPlayers}
              subscribeRoster={transientChannel.subscribeRoster}
            />
          </div>
        </section>
      </SectionErrorBoundary>
    </div>
  );
};
