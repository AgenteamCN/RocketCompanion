import React from 'react';
import { CircleDot, Disc, Palette } from 'lucide-react';
import {
  setDemolishShockwaveConfig,
  type DemolishColorKey,
  type DemolishInnerHoleKey,
  type DemolishOuterRadiusKey,
  type DemolishShockwaveConfig,
} from '../../../config/demolishShockwaveConfig';
import { DemolishShockwaveOpacityAndFeatherCard } from './DemolishShockwaveOpacityAndFeatherCard';

export interface DemolishShockwaveTracksSectionProps {
  config: DemolishShockwaveConfig;
  normT: number;
  isLight: boolean;
}

const OUTER_KEY_LABELS = [
  '0: Trigger Point',
  '1: Instant Burst',
  '2: Smoke Expansion',
  '3: Final Dissipate',
] as const;

const INNER_KEY_LABELS = [
  '0: Solid Initial',
  '1: Hold Fireball',
  '2: Core Burn-Through',
  '3: Complete Hollow',
] as const;

const COLOR_KEY_LABELS = [
  '0: Initial White Flash',
  '1: Blazing Golden Yellow',
  '2: Fiery Blast Orange',
  '3: Dark Red Ember',
  '4: Dense Carbon Smoke',
  '5: Residual Ash Fade',
] as const;

export const DemolishShockwaveTracksSection: React.FC<
  DemolishShockwaveTracksSectionProps
> = ({ config, normT, isLight }) => {
  const cardBg = isLight
    ? 'bg-neutral-50 border-neutral-200 text-neutral-900'
    : 'bg-neutral-900/60 border-neutral-700/60 text-neutral-100';
  const inputCls = isLight
    ? 'bg-white border-neutral-300 text-neutral-900'
    : 'bg-neutral-950 border-neutral-700 text-neutral-100';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  const updateOuterKey = (
    index: 0 | 1 | 2 | 3,
    patch: Partial<DemolishOuterRadiusKey>
  ) => {
    const next: [
      DemolishOuterRadiusKey,
      DemolishOuterRadiusKey,
      DemolishOuterRadiusKey,
      DemolishOuterRadiusKey,
    ] = [
      { ...config.outerKeys[0] },
      { ...config.outerKeys[1] },
      { ...config.outerKeys[2] },
      { ...config.outerKeys[3] },
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
      size: Math.max(1, Math.min(1200, patch.size ?? next[index].size)),
    };
    setDemolishShockwaveConfig({ outerKeys: next });
  };

  const updateInnerKey = (
    index: 0 | 1 | 2 | 3,
    patch: Partial<DemolishInnerHoleKey>
  ) => {
    const next: [
      DemolishInnerHoleKey,
      DemolishInnerHoleKey,
      DemolishInnerHoleKey,
      DemolishInnerHoleKey,
    ] = [
      { ...config.innerKeys[0] },
      { ...config.innerKeys[1] },
      { ...config.innerKeys[2] },
      { ...config.innerKeys[3] },
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
      innerHole: Math.max(
        0,
        Math.min(100, patch.innerHole ?? next[index].innerHole)
      ),
    };
    setDemolishShockwaveConfig({ innerKeys: next });
  };

  const updateColorKey = (
    index: 0 | 1 | 2 | 3 | 4 | 5,
    patch: Partial<DemolishColorKey>
  ) => {
    const next: [
      DemolishColorKey,
      DemolishColorKey,
      DemolishColorKey,
      DemolishColorKey,
      DemolishColorKey,
      DemolishColorKey,
    ] = [
      { ...config.colorKeys[0] },
      { ...config.colorKeys[1] },
      { ...config.colorKeys[2] },
      { ...config.colorKeys[3] },
      { ...config.colorKeys[4] },
      { ...config.colorKeys[5] },
    ];
    next[index] = {
      ...next[index],
      ...patch,
      t:
        index === 0
          ? 0.0
          : index === 5
            ? 1.0
            : Math.max(0.01, Math.min(0.99, patch.t ?? next[index].t)),
    };
    setDemolishShockwaveConfig({ colorKeys: next });
  };

  const gradientStops = config.colorKeys
    .map((k) => `${k.color} ${(k.t * 100).toFixed(1)}%`)
    .join(', ');

  return (
    <div className="flex flex-col gap-2">
      <div className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Disc className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span className="font-semibold text-[11px]">
              [ Outer Radius (Instant Burst -&gt; Slow Expansion) ]
            </span>
          </div>
          <span className={`text-[10px] font-mono ${mutedText}`}>
            Smoothstep Track
          </span>
        </div>

        {([0, 1, 2, 3] as const).map((idx) => {
          const keyItem = config.outerKeys[idx];
          const isFixedEndpoint = idx === 0 || idx === 3;
          return (
            <div
              key={idx}
              className="flex items-center justify-between gap-2 text-[11px]"
            >
              <span className="w-36 truncate">{OUTER_KEY_LABELS[idx]}</span>
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
                      updateOuterKey(idx, {
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
                  step={5}
                  min={1}
                  max={1200}
                  value={keyItem.size}
                  onChange={(e) =>
                    updateOuterKey(idx, {
                      size: parseFloat(e.target.value) || 1,
                    })
                  }
                  className={`w-16 px-1.5 py-0.5 rounded border font-mono text-right text-[11px] ${inputCls}`}
                />
                <span className={`text-[10px] font-mono ${mutedText}`}>UU</span>
              </div>
            </div>
          );
        })}

        <div className="grid grid-cols-2 gap-2 pt-1.5 mt-0.5 border-t border-neutral-800/80">
          <label className="flex items-center justify-between gap-1 text-[10px]">
            <span className={mutedText}>World Scale:</span>
            <input
              type="number"
              step={0.05}
              min={0.2}
              max={4.0}
              value={config.worldScale}
              onChange={(e) =>
                setDemolishShockwaveConfig({
                  worldScale: Math.max(
                    0.2,
                    Math.min(4.0, parseFloat(e.target.value) || 1.0)
                  ),
                })
              }
              className={`w-14 px-1 py-0.5 rounded border font-mono text-right text-[11px] ${inputCls}`}
            />
          </label>
          <label className="flex items-center justify-between gap-1 text-[10px]">
            <span className={mutedText}>Height Offset (UU):</span>
            <input
              type="number"
              step={4}
              min={-100}
              max={300}
              value={config.verticalOffsetUu}
              onChange={(e) =>
                setDemolishShockwaveConfig({
                  verticalOffsetUu: Math.max(
                    -100,
                    Math.min(300, parseFloat(e.target.value) || 0)
                  ),
                })
              }
              className={`w-14 px-1 py-0.5 rounded border font-mono text-right text-[11px] ${inputCls}`}
            />
          </label>
        </div>
      </div>

      <div className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <CircleDot className="h-3.5 w-3.5 text-rose-400 shrink-0" />
            <span className="font-semibold text-[11px]">
              [ Inner Hole % (Hold Solid Core -&gt; Burn-Through) ]
            </span>
          </div>
          <span className={`text-[10px] font-mono ${mutedText}`}>0%..100%</span>
        </div>

        {([0, 1, 2, 3] as const).map((idx) => {
          const keyItem = config.innerKeys[idx];
          const isFixedEndpoint = idx === 0 || idx === 3;
          return (
            <div
              key={idx}
              className="flex items-center justify-between gap-2 text-[11px]"
            >
              <span className="w-36 truncate">{INNER_KEY_LABELS[idx]}</span>
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
                      updateInnerKey(idx, {
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
                  step={1}
                  min={0}
                  max={100}
                  value={keyItem.innerHole}
                  onChange={(e) =>
                    updateInnerKey(idx, {
                      innerHole: parseFloat(e.target.value) || 0,
                    })
                  }
                  className={`w-16 px-1.5 py-0.5 rounded border font-mono text-right text-[11px] ${inputCls}`}
                />
                <span className={`text-[10px] font-mono ${mutedText}`}>%</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Palette className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span className="font-semibold text-[11px]">
              [ Color Evolution (White -&gt; Gold -&gt; Orange -&gt; Red -&gt; Smoke) ]
            </span>
          </div>
        </div>

        <div
          className="relative h-3.5 w-full rounded border border-neutral-700 overflow-hidden my-0.5"
          style={{ background: `linear-gradient(to right, ${gradientStops})` }}
        >
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-emerald-400 shadow-[0_0_4px_#10b981]"
            style={{
              left: `${Math.min(100, Math.max(0, normT * 100)).toFixed(1)}%`,
            }}
          />
        </div>

        {([0, 1, 2, 3, 4, 5] as const).map((idx) => {
          const keyItem = config.colorKeys[idx];
          const isFixedEndpoint = idx === 0 || idx === 5;
          return (
            <div
              key={idx}
              className="flex items-center justify-between gap-2 text-[11px]"
            >
              <span className="w-40 truncate">{COLOR_KEY_LABELS[idx]}</span>
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
                      updateColorKey(idx, {
                        t: parseFloat(e.target.value) || 0,
                      })
                    }
                    className={`w-14 px-1 py-0.5 rounded border font-mono text-right text-[11px] ${inputCls}`}
                  />
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-mono uppercase ${mutedText}`}>
                  {keyItem.color}
                </span>
                <input
                  type="color"
                  value={keyItem.color}
                  onChange={(e) =>
                    updateColorKey(idx, { color: e.target.value })
                  }
                  className="w-7 h-5 rounded border border-neutral-600 bg-transparent cursor-pointer"
                />
              </div>
            </div>
          );
        })}
      </div>

      <DemolishShockwaveOpacityAndFeatherCard
        config={config}
        normT={normT}
        isLight={isLight}
      />
    </div>
  );
};
