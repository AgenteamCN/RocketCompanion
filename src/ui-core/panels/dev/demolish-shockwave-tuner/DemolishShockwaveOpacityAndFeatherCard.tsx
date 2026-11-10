import React from 'react';
import { Eye, Sliders } from 'lucide-react';
import {
  setDemolishShockwaveConfig,
  type DemolishOpacityKey,
  type DemolishShockwaveConfig,
} from '../../../config/demolishShockwaveConfig';

export interface DemolishShockwaveOpacityAndFeatherCardProps {
  config: DemolishShockwaveConfig;
  normT: number;
  isLight: boolean;
}

const OPACITY_KEY_LABELS = [
  '0: Initial Blast Opacity',
  '1: Post-1st Expansion Hold',
  '2: Mid-Plume Dissipation',
  '3: Final Vanish',
] as const;

export const DemolishShockwaveOpacityAndFeatherCard: React.FC<
  DemolishShockwaveOpacityAndFeatherCardProps
> = ({ config, normT, isLight }) => {
  const cardBg = isLight
    ? 'bg-neutral-50 border-neutral-200 text-neutral-900'
    : 'bg-neutral-900/60 border-neutral-700/60 text-neutral-100';
  const inputCls = isLight
    ? 'bg-white border-neutral-300 text-neutral-900'
    : 'bg-neutral-950 border-neutral-700 text-neutral-100';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  const updateOpacityKey = (
    index: 0 | 1 | 2 | 3,
    patch: Partial<DemolishOpacityKey>
  ) => {
    const next: [
      DemolishOpacityKey,
      DemolishOpacityKey,
      DemolishOpacityKey,
      DemolishOpacityKey,
    ] = [
      { ...config.opacityKeys[0] },
      { ...config.opacityKeys[1] },
      { ...config.opacityKeys[2] },
      { ...config.opacityKeys[3] },
    ];
    next[index] = {
      ...next[index],
      ...patch,
      t:
        index === 0
          ? 0.0
          : index === 3
            ? 1.0
            : Math.max(0.01, Math.min(0.99, patch.t ?? next[index].t)),
      opacity: Math.max(
        0,
        Math.min(100, patch.opacity ?? next[index].opacity)
      ),
    };
    setDemolishShockwaveConfig({ opacityKeys: next });
  };

  const opacityGradientStops = config.opacityKeys
    .map(
      (k) =>
        `rgba(251, 191, 36, ${(k.opacity / 100).toFixed(2)}) ${(k.t * 100).toFixed(1)}%`
    )
    .join(', ');

  return (
    <div className="flex flex-col gap-2">
      <div className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5 text-sky-400 shrink-0" />
            <span className="font-semibold text-[11px]">
              [ Opacity Evolution (Post-1st Expansion -&gt; Plume Fade) ]
            </span>
          </div>
          <span className={`text-[10px] font-mono ${mutedText}`}>0%..100%</span>
        </div>

        <div
          className="relative h-3.5 w-full rounded border border-neutral-700 overflow-hidden my-0.5 bg-neutral-950"
          style={{
            backgroundImage: `linear-gradient(to right, ${opacityGradientStops})`,
          }}
        >
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-emerald-400 shadow-[0_0_4px_#10b981]"
            style={{
              left: `${Math.min(100, Math.max(0, normT * 100)).toFixed(1)}%`,
            }}
          />
        </div>

        {([0, 1, 2, 3] as const).map((idx) => {
          const keyItem = config.opacityKeys[idx];
          const isFixedEndpoint = idx === 0 || idx === 3;
          return (
            <div
              key={idx}
              className="flex items-center justify-between gap-2 text-[11px]"
            >
              <span className="w-40 truncate">{OPACITY_KEY_LABELS[idx]}</span>
              <div className="flex items-center gap-1">
                <span className={`text-[10px] font-mono ${mutedText}`}>t=</span>
                {isFixedEndpoint ? (
                  <span className="w-12 text-right font-mono text-[11px] px-1">
                    {keyItem.t.toFixed(2)}
                  </span>
                ) : (
                  <input
                    type="number"
                    step={0.01}
                    min={0.01}
                    max={0.99}
                    value={keyItem.t}
                    onChange={(e) =>
                      updateOpacityKey(idx, {
                        t: parseFloat(e.target.value) || 0,
                      })
                    }
                    className={`w-14 px-1 py-0.5 rounded border font-mono text-right text-[11px] ${inputCls}`}
                  />
                )}
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step={2}
                  min={0}
                  max={100}
                  value={keyItem.opacity}
                  onChange={(e) => {
                    const parsed = parseFloat(e.target.value);
                    updateOpacityKey(idx, {
                      opacity: Number.isFinite(parsed) ? parsed : 0,
                    });
                  }}
                  className={`w-16 px-1.5 py-0.5 rounded border font-mono text-right text-[11px] ${inputCls}`}
                />
                <span className={`text-[10px] font-mono ${mutedText}`}>%</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${cardBg}`}>
        <div className="flex items-center gap-1.5">
          <Sliders className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span className="font-semibold text-[11px]">
            [ Radial Feather, Burst Glow &amp; Tail Opacity Cutoff ]
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <label className="flex items-center justify-between gap-1">
            <span className={mutedText}>Inner Feather %:</span>
            <input
              type="number"
              step={1}
              min={1}
              max={60}
              value={config.featherPct}
              onChange={(e) =>
                setDemolishShockwaveConfig({
                  featherPct: Math.max(
                    1,
                    Math.min(60, parseFloat(e.target.value) || 45)
                  ),
                })
              }
              className={`w-14 px-1 py-0.5 rounded border font-mono text-right text-[11px] ${inputCls}`}
            />
          </label>
          <label className="flex items-center justify-between gap-1">
            <span className={mutedText}>Outer Feather %:</span>
            <input
              type="number"
              step={1}
              min={1}
              max={45}
              value={config.outerFeatherPct}
              onChange={(e) =>
                setDemolishShockwaveConfig({
                  outerFeatherPct: Math.max(
                    1,
                    Math.min(45, parseFloat(e.target.value) || 25)
                  ),
                })
              }
              className={`w-14 px-1 py-0.5 rounded border font-mono text-right text-[11px] ${inputCls}`}
            />
          </label>
          <label className="flex items-center justify-between gap-1">
            <span className={mutedText}>Glow End (t):</span>
            <input
              type="number"
              step={0.02}
              min={0.05}
              max={0.9}
              value={config.glowEndNormT}
              onChange={(e) =>
                setDemolishShockwaveConfig({
                  glowEndNormT: Math.max(
                    0.05,
                    Math.min(0.9, parseFloat(e.target.value) || 0.35)
                  ),
                })
              }
              className={`w-14 px-1 py-0.5 rounded border font-mono text-right text-[11px] ${inputCls}`}
            />
          </label>
          <label className="flex items-center justify-between gap-1">
            <span className={mutedText}>Glow Strength:</span>
            <input
              type="number"
              step={0.05}
              min={0}
              max={3.0}
              value={config.glowStrength}
              onChange={(e) =>
                setDemolishShockwaveConfig({
                  glowStrength: Math.max(
                    0,
                    Math.min(3.0, parseFloat(e.target.value) || 0)
                  ),
                })
              }
              className={`w-14 px-1 py-0.5 rounded border font-mono text-right text-[11px] ${inputCls}`}
            />
          </label>
          <label className="flex items-center justify-between gap-1 col-span-2">
            <span className={mutedText}>Tail Smoke Opacity Fade Start (t):</span>
            <input
              type="number"
              step={0.02}
              min={0.2}
              max={0.98}
              value={config.fadeStartNormT}
              onChange={(e) =>
                setDemolishShockwaveConfig({
                  fadeStartNormT: Math.max(
                    0.2,
                    Math.min(0.98, parseFloat(e.target.value) || 0.75)
                  ),
                })
              }
              className={`w-16 px-1 py-0.5 rounded border font-mono text-right text-[11px] ${inputCls}`}
            />
          </label>
        </div>
      </div>
    </div>
  );
};
