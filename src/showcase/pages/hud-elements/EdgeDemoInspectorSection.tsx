import React, { useMemo } from 'react';
import { createScopedSyncedState } from '../../stores/crossClientSync';
import { Sliders, RotateCcw } from 'lucide-react';
import {
  DEFAULT_DEMO_INDICATOR_CONFIG,
  resolveDemoIndicatorConfig,
  type EdgeDemoIndicatorConfig,
  type HudRosterViewMode,
} from '../../../ui-core/stores/hudTransientTypes';
import { BombEmojiSvg } from '../../../ui-core/primitives/svg/packagedSvgDefinitions';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import { Badge } from '../../../ui-core/primitives/Badge';
import {
  DEMO_COLOR_SWATCHES,
  EdgeDemoStagePreview,
  buildDemoPreviewRosters,
} from './EdgeDemoStagePreview';

const useState = createScopedSyncedState('hud-5a-2-demo-inspector');

export interface EdgeDemoInspectorSectionProps {
  isLight: boolean;
}

const ALL_SLOTS = [1, 2, 3, 4, 5, 6] as const;
const VIEW_MODES: HudRosterViewMode[] = ['player-live', 'goal-replay', 'spectator'];
const SIZE_PRESETS = [12, 14, 16, 18, 20, 22, 24];

export const EdgeDemoInspectorSection: React.FC<EdgeDemoInspectorSectionProps> = React.memo(
  ({ isLight }) => {
    const [rawDemoCfg, setDemoCfg] = useState<EdgeDemoIndicatorConfig>(
      { ...DEFAULT_DEMO_INDICATOR_CONFIG },
      'demoCfg'
    );
    const demoCfg = resolveDemoIndicatorConfig(rawDemoCfg);
    const [persistentDemo, setPersistentDemo] = useState(true, 'persistentDemo');
    const [respawnRemSec, setRespawnRemSec] = useState(1.8, 'respawnRemSec');
    const [viewMode, setViewMode] = useState<HudRosterViewMode>('player-live', 'viewMode');
    const [demoSlots, setDemoSlots] = useState<Record<1 | 2 | 3 | 4 | 5 | 6, boolean>>(
      { 1: false, 2: true, 3: false, 4: true, 5: true, 6: false },
      'demoSlots'
    );

    const updateDemoCfg = (patch: Partial<EdgeDemoIndicatorConfig>) => {
      setDemoCfg((prev) => resolveDemoIndicatorConfig(patch, resolveDemoIndicatorConfig(prev)));
    };

    const toggleSlotDemo = (k: 1 | 2 | 3 | 4 | 5 | 6) => {
      setDemoSlots((prev) => ({ ...prev, [k]: !prev[k] }));
    };

    const [leftPlayers, rightPlayers] = useMemo(
      () => buildDemoPreviewRosters(persistentDemo, demoSlots, respawnRemSec),
      [persistentDemo, demoSlots, respawnRemSec]
    );

    const respawnStageLabel =
      respawnRemSec > 2.0
        ? 'stage 1 · White (3.0s~2.0s)'
        : respawnRemSec > 1.0
        ? 'stage 2 · Yellow (2.0s~1.0s)'
        : 'stage 3 · Red (1.0s~0.0s)';

    const activeRedBtn = 'bg-red-600 text-white border-red-600 font-bold';

    return (
      <section id="hud-5a-2-demo-inspector" className="flex flex-col gap-4 scroll-mt-24">
        <div className="flex items-center gap-2 border-b pb-2 border-neutral-200 dark:border-neutral-800 flex-wrap">
          <div className="h-6 w-6 rounded-md bg-red-500/10 text-red-500 flex items-center justify-center font-bold text-xs font-mono">
            5A.2+
          </div>
          <h2 className="text-base font-bold tracking-tight">
            EdgePlayerHudStrip · Explosion status persistent preview Bomb SVG size/Parameter independent workbench
          </h2>
          <Badge variant="danger" size="sm" isLight={isLight}>
            Persistent Demolished Preview · Decoupled SVG Config
          </Badge>
          <span className="text-xs font-mono text-neutral-500">
            Independently lock display of slot position after explosion · Live Adjustment Bomb SVG Pixel Size/weight/Outer Glow
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          <EdgeDemoStagePreview
            isLight={isLight}
            viewMode={viewMode}
            demoCfg={demoCfg}
            leftPlayers={leftPlayers}
            rightPlayers={rightPlayers}
            toggleSlotDemo={toggleSlotDemo}
          />

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
                  <Sliders className="h-4 w-4 text-red-500" />
                  <span className="text-xs font-bold font-mono tracking-wide">
                    CONFIGURATION PANEL: DEMOLISHED SLOT & BOMB SVG
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDemoCfg({ ...DEFAULT_DEMO_INDICATOR_CONFIG })}
                  className="px-2 py-0.5 rounded-lg border border-neutral-400/40 text-[11px] font-mono cursor-pointer hover:bg-neutral-500/10 flex items-center gap-1"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>reset to default</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 py-1">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-semibold">Persistent explosion status display:</span>
                  <ToggleSwitch
                    checked={persistentDemo}
                    onCheckedChange={setPersistentDemo}
                    isLight={isLight}
                  />
                </div>

                <div className="flex items-center gap-1 font-mono text-xs">
                  <span className="text-[11px] opacity-75">Exploded Slot:</span>
                  {ALL_SLOTS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => toggleSlotDemo(k)}
                      className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border cursor-pointer transition-all ${
                        demoSlots[k]
                          ? 'bg-red-600 text-white border-red-500 shadow-2xs'
                          : 'border-neutral-400/40 opacity-65 hover:opacity-100'
                      }`}
                    >
                      #{k}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 font-mono text-xs">
                  {VIEW_MODES.map((m) => (
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
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-neutral-100 dark:border-neutral-800/60">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Exploded Icon Style & size (`sizePx`)</span>
                    <div className="flex items-center gap-1 font-mono">
                      <input
                        type="number"
                        min={8}
                        max={36}
                        step={1}
                        value={demoCfg.sizePx}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isNaN(v)) {
                            updateDemoCfg({ sizePx: Math.max(8, Math.min(36, v)) });
                          }
                        }}
                        className={`w-14 px-1.5 py-0.5 rounded border text-xs font-bold text-center tabular-nums ${
                          isLight
                            ? 'bg-neutral-50 border-neutral-300 text-neutral-900'
                            : 'bg-neutral-950 border-neutral-700 text-white'
                        }`}
                      />
                      <span className="text-xs opacity-70">px</span>
                    </div>
                  </div>
                  <SliderControl
                    label="Bomb SVG / Cross Size (Size)"
                    value={demoCfg.sizePx}
                    min={10}
                    max={28}
                    step={1}
                    unit="px"
                    colorScheme="orange"
                    isLight={isLight}
                    onChange={(v) => updateDemoCfg({ sizePx: v })}
                  />
                  <div className="flex items-center gap-1 flex-wrap font-mono text-[11px]">
                    {SIZE_PRESETS.map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => updateDemoCfg({ sizePx: sz })}
                        className={`px-2 py-0.5 rounded border cursor-pointer transition-all ${
                          demoCfg.sizePx === sz
                            ? activeRedBtn
                            : 'border-neutral-400/40 opacity-75 hover:opacity-100'
                        }`}
                      >
                        {sz}px
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Indicator Type (Variant)</span>
                    <div className="flex items-center gap-1 font-mono text-xs">
                      <button
                        type="button"
                        onClick={() => updateDemoCfg({ variant: 'bomb-svg' })}
                        className={`px-2.5 py-0.5 rounded-lg border cursor-pointer flex items-center gap-1 ${
                          demoCfg.variant === 'bomb-svg' ? activeRedBtn : 'border-neutral-400/40 opacity-80'
                        }`}
                      >
                        <BombEmojiSvg size={12} color="currentColor" strokeWidth={2} />
                        <span>Bomb SVG</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => updateDemoCfg({ variant: 'cross' })}
                        className={`px-2.5 py-0.5 rounded-lg border cursor-pointer ${
                          demoCfg.variant === 'cross' ? activeRedBtn : 'border-neutral-400/40 opacity-80'
                        }`}
                      >
                        x Classic Red X
                      </button>
                    </div>
                  </div>

                  <SliderControl
                    label="SVG Line Weight (Stroke Width)"
                    value={demoCfg.strokeWidth}
                    min={0.8}
                    max={3.2}
                    step={0.1}
                    unit=""
                    colorScheme="orange"
                    isLight={isLight}
                    onChange={(v) => updateDemoCfg({ strokeWidth: v })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-neutral-100 dark:border-neutral-800/60">
                <SliderControl
                  label="Outer glow blur radius (Glow Blur)"
                  value={demoCfg.glowBlurPx}
                  min={0}
                  max={20}
                  step={1}
                  unit="px"
                  colorScheme="amber"
                  isLight={isLight}
                  onChange={(v) => updateDemoCfg({ glowBlurPx: v })}
                />

                <SliderControl
                  label={`Bottom respawn progress bar (${respawnStageLabel})`}
                  value={respawnRemSec}
                  min={0.1}
                  max={3.0}
                  step={0.1}
                  unit="s"
                  colorScheme="emerald"
                  isLight={isLight}
                  onChange={setRespawnRemSec}
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800/60 flex-wrap">
                <span className="text-xs font-semibold">Primary and glow color scheme (Color & Glow):</span>
                <div className="flex items-center gap-2 flex-wrap">
                  {DEMO_COLOR_SWATCHES.map((sw) => (
                    <button
                      key={sw.hex}
                      type="button"
                      onClick={() => updateDemoCfg({ color: sw.hex, glowColor: sw.hex })}
                      className={`px-2 py-0.5 rounded-lg text-[11px] font-mono border cursor-pointer flex items-center gap-1.5 transition-all ${
                        demoCfg.color.toUpperCase() === sw.hex
                          ? 'ring-2 ring-red-500 font-bold'
                          : 'opacity-80 hover:opacity-100'
                      }`}
                      style={{ borderColor: `${sw.hex}88` }}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full border border-black/20"
                        style={{ backgroundColor: sw.hex }}
                      />
                      <span>{sw.label}</span>
                    </button>
                  ))}
                  <input
                    type="color"
                    value={demoCfg.color}
                    onChange={(e) =>
                      updateDemoCfg({ color: e.target.value, glowColor: e.target.value })
                    }
                    className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                    title="Custom Color"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }
);

EdgeDemoInspectorSection.displayName = 'EdgeDemoInspectorSection';
