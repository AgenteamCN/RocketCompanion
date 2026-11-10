import React from 'react';
import { Sliders, RotateCcw, Copy, Check } from 'lucide-react';
import {
  DEFAULT_SKIP_INDICATOR_CONFIG,
  type EdgeSkipIndicatorConfig,
  type EdgeSkipIndicatorVariant,
  type HudRosterViewMode,
} from '../../../ui-core/stores/hudTransientTypes';
import { ReplaySkipCheckSvg } from '../../../ui-core/primitives/svg/packagedSvgDefinitions';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import { createScopedSyncedState } from '../../stores/crossClientSync';
import { SkipReplayTimingAndPaletteControls } from './SkipReplayTimingAndPaletteControls';

export const VARIANT_OPTIONS: {
  id: EdgeSkipIndicatorVariant;
  label: string;
  defaultHex: string;
  tag: string;
}[] = [
  { id: 'check', label: 'Skip Replay Check', defaultHex: '#10B981', tag: 'READY' },
  { id: 'disconnect', label: 'Disconnect (WiFi-Off)', defaultHex: '#EF4444', tag: 'OFFLINE' },
  { id: 'packet-loss', label: 'Packet Loss Cubes', defaultHex: '#F97316', tag: 'PKT LOSS' },
  { id: 'latency', label: 'High Ping / Latency', defaultHex: '#F59E0B', tag: 'HIGH PING' },
  { id: 'waiting', label: 'Sync / Waiting Clock', defaultHex: '#38BDF8', tag: 'WAITING' },
];

const useState = createScopedSyncedState('hud-5a-2-skip-inspector');

export interface SkipReplayTunerControlsProps {
  isLight: boolean;
  skipCfg: Required<EdgeSkipIndicatorConfig>;
  copiedJson: boolean;
  toggleSlotSkip: (k: 1 | 2 | 3 | 4 | 5 | 6) => void;
  updateSkipCfg: (patch: Partial<EdgeSkipIndicatorConfig>) => void;
  setSkipCfg: (cfg: EdgeSkipIndicatorConfig) => void;
  handleCopyConfigJson: () => void;
}

export const SkipReplayTunerControls: React.FC<SkipReplayTunerControlsProps> = React.memo(
  ({
    isLight,
    skipCfg,
    copiedJson,
    toggleSlotSkip,
    updateSkipCfg,
    setSkipCfg,
    handleCopyConfigJson,
  }) => {
    const [viewMode, setViewMode] = useState<HudRosterViewMode>('goal-replay', 'viewMode');
    const [mixedAuxSlots, setMixedAuxSlots] = useState<boolean>(false, 'mixedAuxSlots');
    const [skipSlots] = useState<Record<1 | 2 | 3 | 4 | 5 | 6, boolean>>(
      { 1: true, 2: false, 3: true, 4: true, 5: true, 6: false },
      'skipSlots'
    );
    return (
      <div
        className={`lg:col-span-7 p-6 rounded-3xl border flex flex-col justify-between gap-4 transition-colors shadow-2xs ${
          isLight
            ? 'bg-white border-neutral-200/90 text-neutral-800'
            : 'bg-neutral-900/60 border-neutral-800 text-neutral-200'
        }`}
      >
        <div className="flex flex-col gap-3.5">
          <div className="flex items-center justify-between border-b pb-2.5 border-neutral-100 dark:border-neutral-800/70 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Sliders className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-bold font-mono tracking-wide">
                CONFIGURATION PANEL: SKIP REPLAY & AUXILIARY EXTENSION CARD
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopyConfigJson}
                className="px-2 py-0.5 rounded-lg border border-emerald-500/50 text-emerald-500 text-[11px] font-mono font-bold cursor-pointer hover:bg-emerald-500/10 flex items-center gap-1"
              >
                {copiedJson ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                <span>{copiedJson ? 'Copied' : 'Copy JSON'}</span>
              </button>
              <button
                type="button"
                onClick={() => setSkipCfg({ ...DEFAULT_SKIP_INDICATOR_CONFIG })}
                className="px-2 py-0.5 rounded-lg border border-neutral-400/40 text-[11px] font-mono cursor-pointer hover:bg-neutral-500/10 flex items-center gap-1"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset to Default</span>
              </button>
            </div>
          </div>

          {/* Row 1: Slot Switches + View Mode + Auto-Reset on Kickoff + Mixed Per-Slot Preview */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 py-1">
            <div className="flex items-center gap-1 font-mono text-xs">
              <span className="text-[11px] font-semibold">Slot Active:</span>
              {([1, 2, 3, 4, 5, 6] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggleSlotSkip(k)}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border cursor-pointer transition-all ${
                    skipSlots[k]
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-2xs'
                      : 'border-neutral-400/40 opacity-65 hover:opacity-100'
                  }`}
                >
                  #{k}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 font-mono text-xs">
              {(['player-live', 'goal-replay', 'spectator'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setViewMode(m)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] border cursor-pointer transition-all ${
                    viewMode === m
                      ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-bold'
                      : 'border-neutral-400/40 opacity-75'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-mono opacity-80">Reset on Kickoff:</span>
                <ToggleSwitch
                  checked={skipCfg.autoResetOnKickoff}
                  onCheckedChange={(v) => updateSkipCfg({ autoResetOnKickoff: v })}
                  isLight={isLight}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="text-[11px] font-mono opacity-80"
                  title="Preview per-slot mixed icons (Check, Disconnect, Packet Loss, High Ping, Waiting)"
                >
                  Mixed Aux Demo:
                </span>
                <ToggleSwitch
                  checked={mixedAuxSlots}
                  onCheckedChange={setMixedAuxSlots}
                  isLight={isLight}
                />
              </div>
            </div>
          </div>

          {/* Row 2: Icon Variant Selector */}
          <div className="flex flex-col gap-1.5 pt-2 border-t border-neutral-100 dark:border-neutral-800/60">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <span className="text-xs font-semibold">
                Extension Card Icon Variant (`variant` · Supports Skip Replay & Network Telemetry)
              </span>
              <span className="text-[10px] font-mono opacity-65">
                Click to switch icon or Shift+Click to also apply recommended semantic color
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap font-mono text-[11px]">
              {VARIANT_OPTIONS.map((opt) => {
                const active = skipCfg.variant === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={(e) => {
                      if (e.shiftKey) {
                        updateSkipCfg({
                          variant: opt.id,
                          color: opt.defaultHex,
                          glowColor: opt.defaultHex,
                        });
                      } else {
                        updateSkipCfg({ variant: opt.id });
                      }
                    }}
                    className={`px-2.5 py-1 rounded-xl border cursor-pointer flex items-center gap-1.5 transition-all ${
                      active
                        ? 'bg-emerald-600 text-white border-emerald-500 font-bold shadow-2xs'
                        : 'border-neutral-400/40 opacity-85 hover:opacity-100'
                    }`}
                  >
                    <ReplaySkipCheckSvg
                      variant={opt.id}
                      size={14}
                      color="currentColor"
                      strokeWidth={2.0}
                      glowBlurPx={0}
                      glowIntensityPct={0}
                    />
                    <span>{opt.label}</span>
                    <span className="text-[9px] px-1 py-0.2 rounded bg-black/20 opacity-80">
                      {opt.tag}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 3: Icon Size (sizePx) & SVG Stroke Weight (strokeWidth) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-neutral-100 dark:border-neutral-800/60">
            <div className="flex flex-col gap-1.5">
              <SliderControl
                label="Skip Icon Size (sizePx)"
                value={skipCfg.sizePx}
                min={10}
                max={32}
                step={1}
                defaultValue={24}
                unit="px"
                colorScheme="emerald"
                isLight={isLight}
                onChange={(v) => updateSkipCfg({ sizePx: v })}
              />
              <div className="flex items-center gap-1 flex-wrap font-mono text-[10px]">
                {[16, 18, 20, 22, 24, 26, 28, 30].map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => updateSkipCfg({ sizePx: sz })}
                    className={`px-1.5 py-0.5 rounded border cursor-pointer transition-all ${
                      skipCfg.sizePx === sz
                        ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                        : 'border-neutral-400/40 opacity-75 hover:opacity-100'
                    }`}
                  >
                    {sz}px
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <SliderControl
                label="Skip Icon Weight (strokeWidth)"
                value={skipCfg.strokeWidth}
                min={1.0}
                max={3.8}
                step={0.1}
                defaultValue={2.0}
                unit=""
                colorScheme="emerald"
                isLight={isLight}
                onChange={(v) => updateSkipCfg({ strokeWidth: v })}
              />
              <div className="flex items-center gap-1 flex-wrap font-mono text-[10px]">
                {[1.5, 1.8, 2.0, 2.2, 2.5, 3.0].map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => updateSkipCfg({ strokeWidth: w })}
                    className={`px-1.5 py-0.5 rounded border cursor-pointer transition-all ${
                      Math.abs(skipCfg.strokeWidth - w) < 0.05
                        ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                        : 'border-neutral-400/40 opacity-75 hover:opacity-100'
                    }`}
                  >
                    {w.toFixed(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Row 4: Card Protrude Length, Under-Card Tuck, Corner Radius */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-neutral-100 dark:border-neutral-800/60">
            <SliderControl
              label="Card Protrude Length (protrudeWidthPx)"
              value={skipCfg.protrudeWidthPx}
              min={24}
              max={72}
              step={1}
              defaultValue={34}
              unit="px"
              colorScheme="emerald"
              isLight={isLight}
              onChange={(v) => updateSkipCfg({ protrudeWidthPx: v })}
            />

            <SliderControl
              label="Under-Card Border Tuck (underlapPx)"
              value={skipCfg.underlapPx}
              min={0}
              max={28}
              step={1}
              defaultValue={20}
              unit="px"
              colorScheme="emerald"
              isLight={isLight}
              onChange={(v) => updateSkipCfg({ underlapPx: v })}
            />

            <SliderControl
              label="Outer Corner Radius (cardRadiusPx)"
              value={skipCfg.cardRadiusPx}
              min={0}
              max={18}
              step={1}
              defaultValue={9}
              unit="px"
              colorScheme="neutral"
              isLight={isLight}
              onChange={(v) => updateSkipCfg({ cardRadiusPx: v })}
            />
          </div>

          <SkipReplayTimingAndPaletteControls
            isLight={isLight}
            skipCfg={skipCfg}
            updateSkipCfg={updateSkipCfg}
          />
        </div>
      </div>
    );
  }
);

SkipReplayTunerControls.displayName = 'SkipReplayTunerControls';
