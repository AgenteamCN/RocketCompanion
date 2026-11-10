import React from 'react';
import { RotateCcw, Eye, ArrowLeftRight } from 'lucide-react';
import { type TakeoverVignetteConfig, type TakeoverVignetteRenderMode } from '../../../ui-core/hud/TakeoverVignetteOverlay';
import { DEFAULT_TAKEOVER_VIGNETTE, formatVignetteEndpointRgba, computeVignetteAxisOffsets } from '../../../ui-core/hud/takeoverVignetteMath';
import { CubicBezierCurveEditor, type CubicBezierPreset } from '../../../ui-core/charts/CubicBezierCurveEditor';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { SegmentedSwitch } from '../../../ui-core/primitives/SegmentedSwitch';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import { ColorSwatchInput } from '../../components/tuner/ColorSwatchInput';

export const VIGNETTE_BEZIER_PRESETS: CubicBezierPreset[] = [
  { name: 'Smooth Seamless (Default)', value: { p1x: 0.64, p1y: 0.0, p2x: 0.28, p2y: 1.0 } },
  { name: 'Classic Ease-Out', value: { p1x: 0.36, p1y: 0.0, p2x: 0.22, p2y: 1.0 } },
  { name: 'Calibrated Rect', value: { p1x: 0.28, p1y: 0.01, p2x: 0.0, p2y: 1.01 } },
  { name: 'Soft Gaussian Feather', value: { p1x: 0.42, p1y: 0.0, p2x: 0.58, p2y: 1.0 } },
  { name: 'Linear Falloff', value: { p1x: 0.33, p1y: 0.33, p2x: 0.67, p2y: 0.67 } },
];

export const VIGNETTE_COLOR_SWATCHES = ['#000000', '#090D16', '#0F172A', '#1E1B4B', '#042F2E', '#27120B'];

export interface TakeoverVignetteTunerCardProps {
  isLight: boolean;
  vignetteConfig: TakeoverVignetteConfig;
  setVignetteConfig: (
    val: TakeoverVignetteConfig | ((prev: TakeoverVignetteConfig) => TakeoverVignetteConfig)
  ) => void;
  alwaysPreviewVignette: boolean;
  setAlwaysPreviewVignette: (val: boolean | ((prev: boolean) => boolean)) => void;
}

export const TakeoverVignetteTunerCard: React.FC<TakeoverVignetteTunerCardProps> = ({
  isLight,
  vignetteConfig,
  setVignetteConfig,
  alwaysPreviewVignette,
  setAlwaysPreviewVignette,
}) => {
  const axisGeo = computeVignetteAxisOffsets(vignetteConfig);
  const activeRenderMode: TakeoverVignetteRenderMode =
    vignetteConfig.renderMode ?? 'sdf-smooth';

  const patchVignette = (patch: Partial<TakeoverVignetteConfig>) => {
    setVignetteConfig((prev) => ({ ...prev, ...patch }));
  };

  const subCardCls = `p-3.5 rounded-2xl border flex flex-col gap-3 ${
    isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-950/60 border-neutral-800'
  }`;

  const endpointCardCls = `p-3 rounded-2xl border flex flex-col gap-2.5 ${
    isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-950/60 border-neutral-800'
  }`;

  return (
    <div
      className={`p-5 rounded-3xl border flex flex-col gap-4 ${
        isLight
          ? 'bg-white border-neutral-200 text-neutral-900 shadow-xs'
          : 'bg-neutral-900/80 border-neutral-800 text-neutral-100 shadow-lg'
      }`}
    >
      <div className="flex items-center justify-between border-b pb-2.5 border-neutral-200 dark:border-neutral-800 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-sky-500" />
          <h3 className="text-sm font-bold font-mono">
            1. Seamless Rounded-Rect Vignette (Independent X/Y Depth - Feather - Curve)
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              setVignetteConfig((prev) => ({
                ...prev,
                innerColor: prev.color,
                innerIntensityPct: prev.intensityPct,
                color: prev.innerColor ?? '#000000',
                intensityPct: prev.innerIntensityPct ?? 0,
              }))
            }
            title="Swap Inner Opening RGBA (t=0) and Outer Edge RGBA (t=1)"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold border border-sky-500/40 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 cursor-pointer transition-colors"
          >
            <ArrowLeftRight className="h-3 w-3" />
            <span>Swap Inner/Outer RGBA</span>
          </button>
          <button
            type="button"
            onClick={() => setVignetteConfig({ ...DEFAULT_TAKEOVER_VIGNETTE })}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Vignette Default</span>
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <ToggleSwitch
          label="Enable Rounded-Rect Vignette Mask"
          checked={vignetteConfig.enabled}
          onCheckedChange={(v) => patchVignette({ enabled: v })}
          isLight={isLight}
        />
        <ToggleSwitch
          label="Pin Vignette Visible for Tuning"
          checked={alwaysPreviewVignette}
          onCheckedChange={setAlwaysPreviewVignette}
          isLight={isLight}
        />
      </div>

      {/* Render Engine Selector */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono font-bold text-sky-400">
            Vignette Compositing Engine (Zero Staircase Steps)
          </span>
          <span className="text-[10px] font-mono opacity-65">
            X: -{axisGeo.offsetX.toFixed(0)}px | Top: -{axisGeo.offsetTop.toFixed(0)}px | Bot: -{axisGeo.offsetBottom.toFixed(0)}px | vOffset: {axisGeo.verticalOffsetPx > 0 ? `+${axisGeo.verticalOffsetPx}` : axisGeo.verticalOffsetPx}px
          </span>
        </div>
        <SegmentedSwitch
          size="sm"
          fullWidth
          isLight={isLight}
          value={activeRenderMode}
          onValueChange={(v) => patchVignette({ renderMode: v as TakeoverVignetteRenderMode })}
          options={[
            { value: 'sdf-smooth', label: 'SDF + Dither (Safe)' },
            { value: 'css-inset', label: 'CSS Inset (Ref)' },
            { value: 'hybrid', label: 'Hybrid (SDF + CSS)' },
          ]}
        />
      </div>

      {/* Asymmetric Top/Bottom + Vertical Offset + Feather Controls */}
      <div className={subCardCls}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-mono font-bold text-amber-500">
            Symmetric X &amp; Asymmetric Top/Bottom Y Depth + Vertical Offset
          </span>
          <button
            type="button"
            onClick={() =>
              setVignetteConfig((prev) => ({
                ...prev,
                depthTopPct: prev.depthYPct ?? 15,
                depthBottomPct: prev.depthYPct ?? 15,
                verticalOffsetPx: 0,
              }))
            }
            className="px-2 py-0.5 rounded text-[10px] font-mono border border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 cursor-pointer"
          >
            Sync Top/Bottom &amp; Zero Offset
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SliderControl
            label="Vertical Depth (Y - Linked Master)"
            description="Default 15% (links Top & Bottom depth)"
            value={vignetteConfig.depthYPct ?? 15}
            min={0} max={140} step={1} unit="%"
            editable allowOutOfBoundsInput colorScheme="amber"
            onChange={(v) => patchVignette({ depthYPct: v, depthTopPct: v, depthBottomPct: v })}
            isLight={isLight}
          />
          <SliderControl
            label="Horizontal Depth (X - Left/Right)"
            description="Default 0% (symmetric side feathering)"
            value={vignetteConfig.depthXPct ?? 0}
            min={0} max={100} step={1} unit="%"
            editable allowOutOfBoundsInput
            onChange={(v) => patchVignette({ depthXPct: v })}
            isLight={isLight}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SliderControl
            label="Top Edge Depth (Y-Top)"
            description="Default 0% (lower = shorter top shadow)"
            value={vignetteConfig.depthTopPct ?? 0}
            min={0} max={140} step={1} unit="%"
            editable allowOutOfBoundsInput
            onChange={(v) => patchVignette({ depthTopPct: v })}
            isLight={isLight}
          />
          <SliderControl
            label="Bottom Edge Depth (Y-Bottom)"
            description="Default 35% (higher = taller bottom shadow)"
            value={vignetteConfig.depthBottomPct ?? 35}
            min={0} max={140} step={1} unit="%"
            editable allowOutOfBoundsInput colorScheme="amber"
            onChange={(v) => patchVignette({ depthBottomPct: v })}
            isLight={isLight}
          />
          <SliderControl
            label="Vertical Offset (Y Shift)"
            description="+px: shorter top & taller bottom"
            value={vignetteConfig.verticalOffsetPx ?? 0}
            min={-200} max={200} step={2} unit="px"
            editable allowOutOfBoundsInput colorScheme="amber"
            onChange={(v) => patchVignette({ verticalOffsetPx: v })}
            isLight={isLight}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SliderControl
            label="Feather Range (Blur)"
            description="Default 160px continuous transition span"
            value={vignetteConfig.blurPx ?? 160}
            min={20} max={350} step={2} unit="px"
            editable allowOutOfBoundsInput
            onChange={(v) => patchVignette({ blurPx: v })}
            isLight={isLight}
          />
          <SliderControl
            label="Corner Smoothness (Radius)"
            description="Default 0px rounded corner contour"
            value={vignetteConfig.cornerRadiusPx ?? 0}
            min={0} max={150} step={2} unit="px"
            editable allowOutOfBoundsInput
            onChange={(v) => patchVignette({ cornerRadiusPx: v })}
            isLight={isLight}
          />
        </div>
      </div>

      {/* Dual RGBA Endpoint Cards: Endpoint A (t=0 Inner Opening) -> Endpoint B (t=1 Outer Edge) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className={endpointCardCls}>
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-mono font-bold text-emerald-500">
              Endpoint A - Inner Opening RGBA (t=0)
            </span>
            <span className="text-[10px] font-mono opacity-75">
              {formatVignetteEndpointRgba(
                vignetteConfig.innerColor ?? '#000000',
                vignetteConfig.innerIntensityPct ?? 0
              )}
            </span>
          </div>
          <ColorSwatchInput
            label="Inner RGB Color (t=0)"
            description="Color inside the center opening rectangle"
            value={vignetteConfig.innerColor ?? '#000000'}
            onChange={(hex) => patchVignette({ innerColor: hex })}
            presets={VIGNETTE_COLOR_SWATCHES}
            isLight={isLight}
          />
          <SliderControl
            label="Inner Alpha / Opacity (t=0)"
            description="Default 0% (100% transparent center)"
            value={vignetteConfig.innerIntensityPct ?? 0}
            min={0} max={100} step={1} unit="%"
            editable allowOutOfBoundsInput
            onChange={(v) => patchVignette({ innerIntensityPct: v })}
            isLight={isLight}
          />
        </div>

        <div className={endpointCardCls}>
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-mono font-bold text-amber-500">
              Endpoint B - Outer Edge RGBA (t=1)
            </span>
            <span className="text-[10px] font-mono opacity-75">
              {formatVignetteEndpointRgba(vignetteConfig.color, vignetteConfig.intensityPct)}
            </span>
          </div>
          <ColorSwatchInput
            label="Outer Edge RGB Color (t=1)"
            description="Color at the 4 screen edges"
            value={vignetteConfig.color}
            onChange={(hex) => patchVignette({ color: hex })}
            presets={VIGNETTE_COLOR_SWATCHES}
            isLight={isLight}
          />
          <SliderControl
            label="Vignette Density / Opacity (t=1)"
            description="Default 85% darkening at outer perimeter"
            value={vignetteConfig.intensityPct}
            min={0} max={100} step={1} unit="%"
            editable allowOutOfBoundsInput colorScheme="amber"
            onChange={(v) => patchVignette({ intensityPct: v })}
            isLight={isLight}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SliderControl
          label="Clear Center Rect Distance (t=0)"
          description="Default 40% clear center opening scale"
          value={vignetteConfig.distancePct}
          min={0} max={95} step={1} unit="%"
          editable allowOutOfBoundsInput
          onChange={(v) => patchVignette({ distancePct: v })}
          isLight={isLight}
        />
        <SliderControl
          label="Outer Full-Density Reach (t=1)"
          description="Default 100% feather reach factor"
          value={vignetteConfig.outerReachPct}
          min={35} max={160} step={1} unit="%"
          editable allowOutOfBoundsInput
          onChange={(v) => patchVignette({ outerReachPct: v })}
          isLight={isLight}
        />
      </div>

      <CubicBezierCurveEditor
        title="Rounded-Rect Vignette Falloff Curve (t=0 Inner RGBA -> t=1 Outer RGBA)"
        p1x={vignetteConfig.curve.p1x}
        p1y={vignetteConfig.curve.p1y}
        p2x={vignetteConfig.curve.p2x}
        p2y={vignetteConfig.curve.p2y}
        presets={VIGNETTE_BEZIER_PRESETS}
        isLight={isLight}
        onChange={(nextCurve) => patchVignette({ curve: nextCurve })}
      />

      <div className="grid grid-cols-2 gap-3 pt-1">
        <SliderControl
          label="Vignette Fade-In"
          value={vignetteConfig.fadeInMs}
          min={0} max={1200} step={20} unit="ms"
          editable allowOutOfBoundsInput
          onChange={(v) => patchVignette({ fadeInMs: v })}
          isLight={isLight}
        />
        <SliderControl
          label="Vignette Fade-Out"
          value={vignetteConfig.fadeOutMs}
          min={0} max={1200} step={20} unit="ms"
          editable allowOutOfBoundsInput
          onChange={(v) => patchVignette({ fadeOutMs: v })}
          isLight={isLight}
        />
      </div>
    </div>
  );
};
