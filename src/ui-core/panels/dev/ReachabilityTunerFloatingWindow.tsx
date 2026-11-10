import React, { useState } from 'react';
import {
  Crosshair,
  Compass,
  Wind,
  RotateCcw,
  Activity,
  Copy,
  Check,
} from 'lucide-react';
import {
  reachabilityStore,
  useReachabilityStore,
  type GroundReachabilityMode,
  type AerialReachabilityMode,
  type InterceptCrossOrientation,
} from '../../stores/reachabilityStore';
import { ToggleSwitch } from '../../primitives/ToggleSwitch';
import { SliderControl } from '../../primitives/SliderControl';
import { SegmentedSwitch } from '../../primitives/SegmentedSwitch';
import type { StandardSurfaceProps, SurfaceMeta } from '../../manifest/surfaceMetaTypes';

export const SURFACE_META: SurfaceMeta = {
  id: 'reachability-tuner',
  title: 'Reachability & Intercept Tuner',
  layer: 'floating-dev',
  menuGroup: 'active-tuners',
  defaultSizing: {
    width: 470,
    height: 600,
    minHeight: 200,
    mode: 'adaptive',
  },
};

export interface ReachabilityTunerFloatingWindowProps extends StandardSurfaceProps {
  active?: boolean;
}

export const ReachabilityTunerFloatingWindow: React.FC<ReachabilityTunerFloatingWindowProps> = ({
  isLight = false,
}) => {
  const { config, telemetry } = useReachabilityStore();
  const [copiedJson, setCopiedJson] = useState(false);

  const cardBg = isLight
    ? 'bg-neutral-50/90 border-neutral-200 text-neutral-800'
    : 'bg-neutral-850/60 border-neutral-700/60 text-neutral-200';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  const isReachable = telemetry.interceptStatus === 'reachable';
  const isFallback = telemetry.interceptStatus === 'closest-fallback';
  const centralityPct = Math.round((telemetry.interceptCentrality ?? 0) * 100);

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard?.writeText(JSON.stringify(config, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 1800);
    } catch (err) {
      console.warn('[ReachabilityTuner] Failed to copy JSON config:', err);
    }
  };

  const paceBadge = !isReachable
    ? { label: 'UNREACHABLE', cls: 'text-rose-400' }
    : telemetry.interceptPaceStatus === 'sweet-spot'
      ? { label: `CORE ${centralityPct}% (SWEET SPOT)`, cls: 'text-emerald-400' }
      : telemetry.interceptPaceStatus === 'overshoot'
        ? { label: `EDGE ${centralityPct}% (TOO FAST)`, cls: 'text-rose-400' }
        : {
            label: `HORN ${centralityPct}% (CATCHING)`,
            cls: centralityPct >= 40 ? 'text-amber-400' : 'text-rose-400',
          };

  const btnTone = isLight
    ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
    : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-600 text-neutral-300';

  return (
    <div className="flex flex-col gap-2.5 select-none text-xs">
      <div className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${cardBg}`}>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-xs">Reachability & Intercept System</span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded border font-semibold ${
                config.enabled
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                  : 'bg-neutral-500/15 border-neutral-500/30 text-neutral-400'
              }`}
            >
              {config.enabled ? 'ACTIVE' : 'DISABLED'}
            </span>
          </div>
          <span className={`text-[10px] mt-0.5 truncate ${mutedText}`}>
            Default off · Optimal 3D Cross (50 UU / 5 UU) · Horn Centrality Color
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleCopyJson}
            title="Copy current ReachabilityConfig JSON to clipboard"
            className={`px-2 py-1 rounded-lg border text-[10px] font-mono flex items-center gap-1 transition-colors cursor-pointer ${
              copiedJson
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                : btnTone
            }`}
          >
            {copiedJson ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            <span>{copiedJson ? 'Copied' : 'Copy JSON'}</span>
          </button>
          <button
            type="button"
            onClick={() => reachabilityStore.resetConfig()}
            title="Reset parameters to defaults"
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${btnTone}`}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <ToggleSwitch
            checked={config.enabled}
            onChange={(val) => reachabilityStore.updateConfig({ enabled: val })}
            isLight={isLight}
          />
        </div>
      </div>

      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex items-center justify-between border-b border-neutral-500/20 pb-1.5">
          <div className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-emerald-400" />
            <span className="font-bold text-[11px]">Live 120Hz Telemetry & Compute Cost</span>
          </div>
          <span className="font-mono text-[10px] text-emerald-400 font-semibold">
            {config.enabled ? `${telemetry.computeTimeUs.toFixed(1)} µs/frame` : '0.0 µs (Idle)'}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px]">
          {[
            {
              label: 'Surface State',
              val: telemetry.isOnGround ? 'ON GROUND' : 'AIRBORNE',
              cls: telemetry.isOnGround ? 'text-emerald-400' : 'text-amber-400',
            },
            {
              label: 'Live Boost',
              val: `${telemetry.boostAmount.toFixed(1)} / 100`,
              cls: 'text-amber-400',
            },
            {
              label: 'Intercept ETA',
              val:
                telemetry.interceptStatus === 'none'
                  ? '—'
                  : `${telemetry.interceptTimeSec.toFixed(2)}s (${isReachable ? 'HIT' : 'GAP'})`,
              cls: isReachable
                ? centralityPct >= 70
                  ? 'text-emerald-400'
                  : centralityPct >= 35
                    ? 'text-amber-400'
                    : 'text-rose-400'
                : isFallback
                  ? 'text-rose-400'
                  : 'text-neutral-400',
            },
          ].map((item) => (
            <div key={item.label} className="p-1.5 rounded-lg bg-black/20 border border-white/5 flex flex-col">
              <span className={mutedText}>{item.label}</span>
              <span className={`font-bold ${item.cls}`}>{item.val}</span>
            </div>
          ))}
        </div>

        {config.enabled && config.showIntercept && telemetry.interceptStatus !== 'none' && (
          <div className="flex flex-col gap-1 text-[10px] font-mono pt-0.5 px-0.5">
            <div className="flex items-center justify-between">
              <span className={`font-semibold ${paceBadge.cls}`}>{paceBadge.label}</span>
              <span className="text-sky-400">Min Boost: {telemetry.interceptMinBoost.toFixed(0)}</span>
            </div>
            <span className={mutedText}>
              Cross XYZ: [{telemetry.interceptPos[0]}, {telemetry.interceptPos[1]}, {telemetry.interceptPos[2]}]
            </span>
          </div>
        )}
      </div>

      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-emerald-400 shrink-0" />
            <div className="flex flex-col">
              <span className="font-bold text-[11px]">1. Ground Reachability (Boost = 0)</span>
              <span className={`text-[10px] ${mutedText}`}>1s / 2s / 3s surface contours · Auto-hides when airborne</span>
            </div>
          </div>
          <ToggleSwitch checked={config.showGround} onChange={(val) => reachabilityStore.updateConfig({ showGround: val })} isLight={isLight} />
        </div>

        {config.showGround && (
          <div className="flex flex-col gap-2 pt-1 border-t border-neutral-500/20">
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[11px] ${mutedText}`}>Solver Engine</span>
              <SegmentedSwitch
                value={config.groundMode}
                onChange={(v) => reachabilityStore.updateConfig({ groundMode: v as GroundReachabilityMode })}
                options={[
                  { value: 'lut', label: 'WASM 3D LUT (1.4µs)' },
                  { value: 'analytical', label: 'Analytical' },
                ]}
                isLight={isLight}
              />
            </div>

            <SliderControl
              label="Ground Fan Opacity"
              value={Math.round(config.groundFillOpacity * 100)}
              min={4}
              max={50}
              step={1}
              unit="%"
              onChange={(val) => reachabilityStore.updateConfig({ groundFillOpacity: val / 100 })}
              isLight={isLight}
            />
          </div>
        )}
      </div>

      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wind className="h-4 w-4 text-amber-400 shrink-0" />
            <div className="flex flex-col">
              <span className="font-bold text-[11px]">2. Aerial 3D Spacetime Horn (Boost-Driven)</span>
              <span className={`text-[10px] ${mutedText}`}>Continuous 0–3s interception corridor driven by live Boost</span>
            </div>
          </div>
          <ToggleSwitch checked={config.showAerial} onChange={(val) => reachabilityStore.updateConfig({ showAerial: val })} isLight={isLight} />
        </div>

        {config.showAerial && (
          <div className="flex flex-col gap-2 pt-1 border-t border-neutral-500/20">
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[11px] ${mutedText}`}>3D Geometry Mode</span>
              <SegmentedSwitch
                value={config.aerialMode}
                onChange={(v) => reachabilityStore.updateConfig({ aerialMode: v as AerialReachabilityMode })}
                options={[
                  { value: 'funnel', label: 'Continuous Horn' },
                  { value: 'bubbles', label: '1s/2s/3s Bubbles' },
                ]}
                isLight={isLight}
              />
            </div>

            <SliderControl
              label="Horn Mesh Opacity"
              value={Math.round(config.aerialOpacity * 100)}
              min={5}
              max={65}
              step={1}
              unit="%"
              onChange={(val) => reachabilityStore.updateConfig({ aerialOpacity: val / 100 })}
              isLight={isLight}
            />

            <div className="flex items-center justify-between py-0.5">
              <span className={`text-[11px] ${mutedText}`}>Show 1s/2s/3s Rings & Guide Rails</span>
              <ToggleSwitch
                checked={config.aerialShowRings}
                onChange={(val) => reachabilityStore.updateConfig({ aerialShowRings: val, aerialShowRails: val })}
                isLight={isLight}
              />
            </div>

            <div className="flex items-center justify-between py-0.5">
              <div className="flex flex-col">
                <span className={`text-[11px] ${mutedText}`}>Include Min 1st-Jump Impulse (328 UU/s)</span>
                <span className="text-[9px] text-neutral-500">Default on: predicts ground-to-air using lowest tap-jump velocity</span>
              </div>
              <ToggleSwitch checked={config.includeJumpImpulse} onChange={(val) => reachabilityStore.updateConfig({ includeJumpImpulse: val })} isLight={isLight} />
            </div>
          </div>
        )}
      </div>

      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-sky-400 shrink-0" />
            <div className="flex flex-col">
              <span className="font-bold text-[11px]">3. Optimal Intercept 3D Cross</span>
              <span className={`text-[10px] ${mutedText}`}>Red (Edge/Low Tol) → Yellow (Catching) → Green (Horn Center)</span>
            </div>
          </div>
          <ToggleSwitch checked={config.showIntercept} onChange={(val) => reachabilityStore.updateConfig({ showIntercept: val })} isLight={isLight} />
        </div>

        {config.showIntercept && (
          <div className="flex flex-col gap-2 pt-1 border-t border-neutral-500/20">
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[11px] ${mutedText}`}>Orthogonal Axes</span>
              <SegmentedSwitch
                value={config.crossOrientation}
                onChange={(v) => reachabilityStore.updateConfig({ crossOrientation: v as InterceptCrossOrientation })}
                options={[
                  { value: 'world', label: 'World XYZ' },
                  { value: 'trajectory', label: 'Ball Tangent' },
                ]}
                isLight={isLight}
              />
            </div>

            {(
              [
                { key: 'crossArmLength', label: 'Cross Arm Length', min: 20, max: 380, step: 5 },
                { key: 'crossThickness', label: 'Cross Line Thickness', min: 1, max: 36, step: 1 },
              ] as const
            ).map((s) => (
              <SliderControl
                key={s.key}
                label={s.label}
                value={config[s.key]}
                min={s.min}
                max={s.max}
                step={s.step}
                unit=" UU"
                onChange={(val) => reachabilityStore.updateConfig({ [s.key]: val })}
                isLight={isLight}
              />
            ))}

            <div className="flex items-center justify-between py-0.5">
              <span className={`text-[11px] ${mutedText}`}>Show Closest Point When Unreachable</span>
              <ToggleSwitch
                checked={config.showClosestWhenUnreachable}
                onChange={(val) => reachabilityStore.updateConfig({ showClosestWhenUnreachable: val })}
                isLight={isLight}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReachabilityTunerFloatingWindow;
