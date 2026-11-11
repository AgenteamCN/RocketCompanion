import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { EdgePlayerHudStrip } from '../../../ui-core/hud/EdgePlayerHudStrip';
import type {
  EdgeDemoIndicatorConfig,
  EdgePlayerSlotState,
  HudRosterViewMode,
} from '../../../ui-core/stores/hudTransientTypes';
import {
  BombEmojiSvg,
  buildSvgDropShadowFilter,
} from '../../../ui-core/primitives/svg/packagedSvgDefinitions';

export const DEMO_COLOR_SWATCHES = [
  { hex: '#EF4444', label: 'Crimson Red' },
  { hex: '#F97316', label: 'Flame Orange' },
  { hex: '#FACC15', label: 'Solar Yellow' },
  { hex: '#38BDF8', label: 'Cyan Glow' },
  { hex: '#A855F7', label: 'Neon Purple' },
  { hex: '#FFFFFF', label: 'Pure White' },
] as const;

export const DEMO_ROSTER_SPECS: Array<[
  1 | 2 | 3 | 4 | 5 | 6,
  'left' | 'right',
  string,
  number,
  number,
]> = [
  [1, 'left', 'You (Octane_99)', 85, 100],
  [2, 'left', 'Zen_Master_RL', 42, 110],
  [3, 'left', 'Vatira_KC', 100, 120],
  [4, 'right', 'Firstkiller_NA', 64, 130],
  [5, 'right', 'BeastMode_Fennec', 18, 140],
  [6, 'right', 'Daniel_SSG', 90, 150],
];

export function buildDemoPreviewRosters(
  persistentDemo: boolean,
  demoSlots: Record<1 | 2 | 3 | 4 | 5 | 6, boolean>,
  respawnRemSec: number
): [EdgePlayerSlotState[], EdgePlayerSlotState[]] {
  const all: EdgePlayerSlotState[] = DEMO_ROSTER_SPECS.map(
    ([slotKey, team, name, boostAmount, demolishedAtMs]) => ({
      slotKey,
      team,
      name,
      boostAmount,
      demolishedAtMs,
      exists: true,
      isSelf: slotKey === 1,
      isFocusedPov: slotKey === 1,
      isDemolished: persistentDemo && demoSlots[slotKey],
      demoRespawnRemainingSec:
        slotKey === 5 ? Math.max(0.2, respawnRemSec - 0.8) : respawnRemSec,
      demoRespawnTotalSec: 3.0,
    })
  );
  return [all.slice(0, 3), all.slice(3, 6)];
}

export interface EdgeDemoStagePreviewProps {
  isLight: boolean;
  viewMode: HudRosterViewMode;
  demoCfg: Required<EdgeDemoIndicatorConfig>;
  leftPlayers: EdgePlayerSlotState[];
  rightPlayers: EdgePlayerSlotState[];
  toggleSlotDemo: (k: 1 | 2 | 3 | 4 | 5 | 6) => void;
}

export const EdgeDemoStagePreview: React.FC<EdgeDemoStagePreviewProps> = React.memo(
  ({ isLight, viewMode, demoCfg, leftPlayers, rightPlayers, toggleSlotDemo }) => {
    const zoomedSizePx = Math.min(34, Math.round(demoCfg.sizePx * 1.45));

    return (
      <div
        className={`lg:col-span-5 p-5 rounded-3xl border flex flex-col justify-between gap-4 transition-all ${
          isLight
            ? 'bg-slate-200/80 border-neutral-300 shadow-inner'
            : 'bg-neutral-950 border-neutral-800/90 shadow-inner'
        }`}
      >
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className="font-bold text-red-500 flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>Stay on stage after explosion ({viewMode})</span>
          </span>
          <span className="opacity-75">
            size: <strong>{demoCfg.sizePx}px</strong> · weight:{' '}
            <strong>{demoCfg.strokeWidth.toFixed(1)}</strong>
          </span>
        </div>

        {/* Dual-side Strip Preview Stage */}
        <div className="relative h-[168px] rounded-2xl border border-black/15 dark:border-white/10 bg-black/20 overflow-hidden flex items-center justify-between py-2">
          <EdgePlayerHudStrip
            side="left"
            teamColor="#2563EB"
            barColor="#3B82F6"
            isLight={isLight}
            viewMode={viewMode}
            players={leftPlayers}
            demoIndicatorConfig={demoCfg}
            onSelectSlot={toggleSlotDemo}
          />
          <EdgePlayerHudStrip
            side="right"
            teamColor="#EA580C"
            barColor="#F97316"
            isLight={isLight}
            viewMode={viewMode}
            players={rightPlayers}
            demoIndicatorConfig={demoCfg}
            onSelectSlot={toggleSlotDemo}
          />
        </div>

        {/* Close-up Isolated Demolished Slot & Bomb SVG Specimen */}
        <div
          className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
            isLight
              ? 'bg-white/90 border-neutral-200/90 text-neutral-800'
              : 'bg-neutral-900/90 border-neutral-800 text-neutral-200'
          }`}
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-mono font-bold">
              Independent explosion icon close-up (1:1 &amp; 2x Reference)
            </span>
            <span className="text-[10px] font-mono opacity-65">
              Click card above or right #1~#6 Toggle corresponding slot explosion state
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* 1:1 Actual Size on #3F3F46 Demolished Pill */}
            <div
              className="px-3 h-[32px] rounded-lg flex items-center gap-2 font-mono text-xs"
              style={{
                backgroundColor: '#3F3F46',
                color: '#D4D4D8',
                boxShadow: `0 0 14px ${demoCfg.color}66, inset 0 0 0 1px ${demoCfg.color}BF`,
              }}
              title="1:1 Actual card height (32px) Rendering effect within"
            >
              <span className="text-[11px] opacity-85">1:1</span>
              {demoCfg.variant === 'bomb-svg' ? (
                <BombEmojiSvg
                  size={demoCfg.sizePx}
                  color={demoCfg.color}
                  strokeWidth={demoCfg.strokeWidth}
                  glowColor={demoCfg.glowColor}
                  glowBlurPx={demoCfg.glowBlurPx}
                  glowIntensityPct={demoCfg.glowIntensityPct}
                />
              ) : (
                <span
                  className="font-bold leading-none"
                  style={{
                    color: demoCfg.color,
                    fontSize: `${demoCfg.sizePx}px`,
                    filter: buildSvgDropShadowFilter(
                      demoCfg.glowColor,
                      demoCfg.glowBlurPx,
                      demoCfg.glowIntensityPct
                    ),
                  }}
                >
                  x
                </span>
              )}
            </div>

            {/* 2x Zoomed Specimen */}
            <div
              className="w-11 h-11 rounded-xl bg-[#27272A] border border-white/10 flex items-center justify-center"
              title="Zoom Inspection"
            >
              {demoCfg.variant === 'bomb-svg' ? (
                <BombEmojiSvg
                  size={zoomedSizePx}
                  color={demoCfg.color}
                  strokeWidth={demoCfg.strokeWidth}
                  glowColor={demoCfg.glowColor}
                  glowBlurPx={demoCfg.glowBlurPx}
                  glowIntensityPct={demoCfg.glowIntensityPct}
                />
              ) : (
                <span
                  className="font-bold leading-none"
                  style={{
                    color: demoCfg.color,
                    fontSize: `${zoomedSizePx}px`,
                    filter: buildSvgDropShadowFilter(
                      demoCfg.glowColor,
                      demoCfg.glowBlurPx,
                      demoCfg.glowIntensityPct
                    ),
                  }}
                >
                  x
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

EdgeDemoStagePreview.displayName = 'EdgeDemoStagePreview';
