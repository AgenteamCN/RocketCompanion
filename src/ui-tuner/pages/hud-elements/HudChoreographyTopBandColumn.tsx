import React from 'react';
import { LayoutGrid, EyeOff, ShieldAlert } from 'lucide-react';
import { BombEmojiSvg } from '../../../ui-core/primitives/svg/packagedSvgDefinitions';
import {
  useHudChoreographySandbox,
  type FlipSimMode,
  type JumpPlacementOption,
} from './HudChoreographySandboxContext';

export type { FlipSimMode, JumpPlacementOption };

const ALL_SLOTS = [1, 2, 3, 4, 5, 6] as const;
const DEMO_SWATCHES = [
  { hex: '#EF4444', label: 'red' },
  { hex: '#F97316', label: 'Orange' },
  { hex: '#FACC15', label: 'Yellow' },
  { hex: '#38BDF8', label: 'Cyan' },
  { hex: '#FFFFFF', label: 'White' },
] as const;

const LAYOUT_STRATEGIES = [
  {
    key: 'reserve',
    label: 'Fixed Placeholder (recommended)',
    title: 'Fixed Placeholder (Reserved): top bar 56px Always Keep, 1-3 and 4-6 Position locked',
  },
  {
    key: 'collapse-local',
    label: 'Partial Flow',
    title: 'Partial Flow: Hide Top-Left Telemetry Left Column Only 1-3 Auto-move Up',
  },
  {
    key: 'collapse-symmetric',
    label: 'Symmetrical Flow',
    title: 'Symmetrical Flow: When Top-Left Telemetry Hidden, 1-3 and 4-6 Sync Move Up',
  },
] as const;

const FLIP_SIM_ITEMS = [
  { key: 'auto-drain', label: '150Step Decrement' },
  { key: 'grounded', label: 'Ground Fill' },
  { key: 'multi-flip', label: 'Multi(×2)' },
  { key: 'unlimited', label: 'Unlimited(∞)' },
  { key: 'expired', label: 'No Flip(0)' },
] as const;

export const HudChoreographyDemoAndPovControls: React.FC = () => {
  const {
    myTeamSide,
    slotExists,
    focusedSlot,
    handleSelectPov,
    handleTriggerDemo,
    opponentDemoCompact,
    handleToggleOpponentDemoCompact,
    persistentDemo,
    onTogglePersistentDemo,
    demoIndicatorConfig: demoCfg,
    onUpdateDemoIndicatorConfig: updateDemo,
  } = useHudChoreographySandbox();

  const isMyTeamOrange = myTeamSide === 'orange';

  return (
    <>
      <div className="flex items-center justify-between gap-1 flex-wrap text-xs font-mono">
        <div className="flex items-center gap-1">
          <span className="text-[11px] opacity-70">POV:</span>
          {ALL_SLOTS.map((k) => {
            if (!slotExists[k]) return null;
            const isSelected = focusedSlot === k;
            const isOrange = k <= 3 ? isMyTeamOrange : !isMyTeamOrange;
            const activeColor = isOrange ? 'bg-orange-600 text-white' : 'bg-blue-600 text-white';
            return (
              <button
                key={k}
                type="button"
                onClick={() => handleSelectPov(k)}
                className={`w-5 h-5 rounded text-[11px] font-bold cursor-pointer transition-all ${
                  isSelected
                    ? activeColor
                    : 'border border-neutral-400/40 opacity-75 hover:opacity-100'
                }`}
              >
                {k}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => handleSelectPov(null)}
            title="Empty POV (Free Cam): in Spectator Apply Instantly(0ms)Hide bottom dashboard, Immediately when reselecting player(0ms)restore"
            className={`px-1.5 h-5 rounded text-[11px] font-bold cursor-pointer transition-all flex items-center gap-0.5 ${
              focusedSlot === null
                ? 'bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-950'
                : 'border border-neutral-400/40 opacity-75 hover:opacity-100'
            }`}
          >
            <EyeOff className="h-3 w-3" />
            <span>Empty(0ms hidden)</span>
          </button>
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[11px] text-red-500 font-semibold flex items-center gap-0.5">
            <ShieldAlert className="h-3 w-3" />
            Explosion:
          </span>
          {ALL_SLOTS.map((k) => {
            if (!slotExists[k]) return null;
            return (
              <button
                key={k}
                type="button"
                onClick={() => handleTriggerDemo(k)}
                className="px-1.5 py-0.5 rounded bg-red-500/15 border border-red-500/40 text-red-500 hover:bg-red-500 hover:text-white cursor-pointer text-[10px]"
                title={`trigger #${k} Blasted (3.0s Progress Bar)`}
              >
                #{k}
              </button>
            );
          })}
          <button
            type="button"
            onClick={handleToggleOpponentDemoCompact}
            className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer border transition-colors ${
              opponentDemoCompact
                ? 'bg-red-500 text-white border-red-500 font-bold'
                : 'border-neutral-400/40 opacity-75'
            }`}
            title="Player Live On Opponent(4-6)Auto-spawn from right side after explosion1Compact vertical row arrangement (FIFO Auto-Reorder)"
          >
            Top Enemy Blast:{opponentDemoCompact ? 'On' : 'Original Position'}
          </button>
          <button
            type="button"
            onClick={onTogglePersistentDemo}
            className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer border transition-colors ${
              persistentDemo
                ? 'bg-amber-500 text-neutral-950 border-amber-500 font-bold shadow-2xs'
                : 'border-neutral-400/40 opacity-75 hover:opacity-100'
            }`}
            title="Enable explosion persistence (Permanent Blasted State)"
          >
            Permanent Explosion:{persistentDemo ? 'On(Persistent)' : 'Off(3s)'}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 p-2 rounded-xl border border-red-500/25 bg-red-500/5 text-xs font-mono">
        <div className="flex items-center justify-between gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold flex items-center gap-1 text-red-500">
            <BombEmojiSvg
              size={Math.min(18, Math.max(11, demoCfg.sizePx || 16))}
              color={demoCfg.color}
              strokeWidth={demoCfg.strokeWidth}
              glowColor={demoCfg.glowColor}
              glowBlurPx={demoCfg.glowBlurPx}
              glowIntensityPct={demoCfg.glowIntensityPct}
            />
            <span>Blown-up gray indicator (`#3F3F46`):</span>
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => updateDemo({ variant: 'bomb-svg' })}
              className={`px-2 py-0.5 rounded text-[10px] cursor-pointer flex items-center gap-1 transition-all ${
                demoCfg.variant === 'bomb-svg'
                  ? 'bg-red-600 text-white font-bold shadow-xs'
                  : 'border border-neutral-400/40 opacity-80'
              }`}
            >
              <BombEmojiSvg size={11} color="currentColor" strokeWidth={2} />
              <span>Bomb SVG</span>
            </button>
            <button
              type="button"
              onClick={() => updateDemo({ variant: 'cross' })}
              className={`px-2 py-0.5 rounded text-[10px] cursor-pointer transition-all ${
                demoCfg.variant === 'cross'
                  ? 'bg-red-600 text-white font-bold shadow-xs'
                  : 'border border-neutral-400/40 opacity-80'
              }`}
            >
              x Classic Red X
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap text-[10px]">
          <label className="flex items-center gap-1" title="Adjust Explosion SVG / Pixel size of red cross (10px ~ 28px)">
            <span className="opacity-75">size:</span>
            <input
              type="range"
              min={10}
              max={28}
              step={1}
              value={demoCfg.sizePx || 16}
              onChange={(e) => updateDemo({ sizePx: Number(e.target.value) })}
              className="w-14 accent-red-500 cursor-pointer"
            />
            <input
              type="number"
              min={8}
              max={32}
              step={1}
              value={demoCfg.sizePx || 16}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isNaN(v) && v >= 8 && v <= 36) {
                  updateDemo({ sizePx: v });
                }
              }}
              className="w-10 px-1 py-0.2 rounded border border-red-500/30 bg-transparent text-center font-bold tabular-nums"
            />
            <span className="opacity-70">px</span>
          </label>

          <label className="flex items-center gap-1">
            <span className="opacity-75">weight:</span>
            <input
              type="range"
              min={1.0}
              max={3.0}
              step={0.1}
              value={demoCfg.strokeWidth}
              onChange={(e) => updateDemo({ strokeWidth: Number(e.target.value) })}
              className="w-12 accent-red-500 cursor-pointer"
            />
            <span className="tabular-nums font-bold">{demoCfg.strokeWidth.toFixed(1)}</span>
          </label>

          <label className="flex items-center gap-1">
            <span className="opacity-75">Glow:</span>
            <input
              type="range"
              min={0}
              max={14}
              step={1}
              value={demoCfg.glowBlurPx}
              onChange={(e) => updateDemo({ glowBlurPx: Number(e.target.value) })}
              className="w-12 accent-red-500 cursor-pointer"
            />
            <span className="tabular-nums font-bold">{demoCfg.glowBlurPx}px</span>
          </label>

          <div className="flex items-center gap-1">
            {DEMO_SWATCHES.map((sw) => (
              <button
                key={sw.hex}
                type="button"
                onClick={() => updateDemo({ color: sw.hex, glowColor: sw.hex })}
                title={`color & Glow: ${sw.label} (${sw.hex})`}
                className={`w-3.5 h-3.5 rounded-full cursor-pointer border transition-transform ${
                  demoCfg.color.toUpperCase() === sw.hex
                    ? 'scale-125 border-white ring-1 ring-red-500'
                    : 'border-black/30 opacity-80 hover:opacity-100'
                }`}
                style={{ backgroundColor: sw.hex }}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export const HudChoreographyTopBandColumn: React.FC = () => {
  const {
    layoutStrategy,
    setLayoutStrategy,
    showTelemetryTopLeft,
    setShowTelemetryTopLeft,
    flipSimMode,
    onFlipSimModeChange,
    jumpPlacement,
    setJumpPlacement,
    showBallCam,
    setShowBallCam,
  } = useHudChoreographySandbox();

  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-xs font-bold font-mono flex items-center gap-1.5">
        <LayoutGrid className="h-3.5 w-3.5 text-emerald-500" />
        <span>3. Top bar equal three-way split (`HudTopSplitBand`) &amp; Bottom Gauge</span>
      </span>

      <div className="flex items-center justify-between gap-1 flex-wrap text-xs font-mono">
        <span className="text-[11px] opacity-75">Top bar hidden placeholder strategy:</span>
        <div className="flex items-center gap-1 flex-wrap">
          {LAYOUT_STRATEGIES.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setLayoutStrategy(item.key)}
              className={`px-2 py-0.5 rounded text-[11px] cursor-pointer transition-colors ${
                layoutStrategy === item.key
                  ? 'bg-emerald-500 text-neutral-950 font-bold'
                  : 'border border-neutral-400/40 opacity-85 hover:opacity-100'
              }`}
              title={item.title}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs font-mono gap-1 flex-wrap">
        <span className="text-[11px] opacity-75">top bar 56px Diagnostic Area:</span>
        <button
          type="button"
          onClick={() => setShowTelemetryTopLeft((v) => !v)}
          className={`px-2 py-0.5 rounded text-[11px] cursor-pointer transition-colors ${
            showTelemetryTopLeft
              ? 'bg-emerald-500 text-neutral-950 font-bold'
              : 'border border-neutral-400/40'
          }`}
        >
          top left Telemetry:{showTelemetryTopLeft ? 'Show' : 'hidden'}
        </button>
      </div>

      <div className="flex items-center justify-between gap-1 flex-wrap text-xs font-mono">
        <span className="text-[11px] opacity-75">Second Flip (1.25s/150Step):</span>
        <div className="flex items-center gap-1 flex-wrap">
          {FLIP_SIM_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onFlipSimModeChange(item.key)}
              className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer transition-colors ${
                flipSimMode === item.key
                  ? 'bg-emerald-500 text-neutral-950 font-bold'
                  : 'border border-neutral-400/40 opacity-80 hover:opacity-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs font-mono">
        <span className="text-[11px] opacity-75">Flip Align / BallCam:</span>
        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={() =>
              setJumpPlacement((p) =>
                p === 'top-left'
                  ? 'center-bottom-right'
                  : p === 'center-bottom-right'
                  ? 'center-bottom-left'
                  : 'top-left'
              )
            }
            className="px-2 py-0.5 rounded text-[11px] bg-emerald-500/15 border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-bold cursor-pointer"
            title="Toggle FlipIndicator Docking orientation relative to bottom speedometer (default: Left-aligned above speedometer) "
          >
            Flip:{jumpPlacement === 'top-left' ? 'Top-Left Aligned' : jumpPlacement === 'center-bottom-right' ? 'right' : 'left'}
          </button>
          <button
            type="button"
            onClick={() => setShowBallCam((v) => !v)}
            className={`px-2 py-0.5 rounded text-[11px] cursor-pointer ${
              showBallCam ? 'bg-red-500 text-white font-bold' : 'border border-neutral-400/40'
            }`}
          >
            BallCam:{showBallCam ? 'Show' : 'hidden'}
          </button>
        </div>
      </div>
    </div>
  );
};
