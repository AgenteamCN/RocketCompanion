import React, { useMemo, useRef, useState } from 'react';
import { Activity, Check, Compass, Copy } from 'lucide-react';
import { DEFAULT_NAME_TAG_CONFIG, computeOffscreenDistanceScale, type NameTagConfig } from '../../../config/nameTagConfig';
import { useNameTagTunerStore } from '../../../stores/nameTagTunerStore';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';

export interface NameTagOffscreenCurveTunerSectionProps {
  isLight?: boolean;
  config?: NameTagConfig;
  updateConfig?: (partial: Partial<NameTagConfig>) => void;
}

const CURVE_EXPONENT_PRESETS = [
  { label: 'Calibrated (0.45)', exponent: 0.45, desc: 'Calibrated default near falloff' },
  { label: 'Balanced (0.75)', exponent: 0.75, desc: 'Perspective-like non-linear falloff' },
  { label: 'Linear (1.00)', exponent: 1.0, desc: 'Uniform linear size reduction' },
  { label: 'Slow Near (1.35)', exponent: 1.35, desc: 'Retains size longer in mid-field' },
];

const EDGE_ANGLE_PRESETS = [
  { label: 'Left Edge (0°)', deg: 0 },
  { label: 'Bottom Edge (90°)', deg: 90 },
  { label: 'Right Edge (180°)', deg: 180 },
  { label: 'Top Edge (270°)', deg: 270 },
];

export const NameTagOffscreenCurveTunerSection: React.FC<NameTagOffscreenCurveTunerSectionProps> = ({
  isLight = false,
  config: propConfig,
  updateConfig: propUpdateConfig,
}) => {
  const store = useNameTagTunerStore();
  const config = propConfig ?? store.config;
  const updateConfig = propUpdateConfig ?? store.updateConfig;

  const [copiedJson, setCopiedJson] = useState(false);
  const [showExportPreview, setShowExportPreview] = useState(false);
  const scrubTrackRef = useRef<HTMLDivElement | null>(null);
  const scrubDragRef = useRef({ active: false, lastX: 0, angle: config.offscreenDistanceSimAngleDeg || 0 });

  const subCardBg = isLight ? 'border-neutral-200 bg-neutral-100/75' : 'border-neutral-800 bg-neutral-900/50';
  const muted = isLight ? 'text-neutral-500' : 'text-neutral-400';

  const nearUu = Number(config.offscreenDistanceNearUu) || DEFAULT_NAME_TAG_CONFIG.offscreenDistanceNearUu;
  const farUu = Math.max(nearUu + 1, Number(config.offscreenDistanceFarUu) || DEFAULT_NAME_TAG_CONFIG.offscreenDistanceFarUu);
  const simDistUu = Number(config.offscreenDistanceSimDistanceUu) || DEFAULT_NAME_TAG_CONFIG.offscreenDistanceSimDistanceUu;
  const simAngleDeg = (((Number(config.offscreenDistanceSimAngleDeg) || 0) % 360) + 360) % 360;

  const currentSimScale = useMemo(() => computeOffscreenDistanceScale(simDistUu, config), [simDistUu, config]);
  const currentSimRadiusPx = Math.round(config.offscreenCircleRadiusPx * currentSimScale * 10) / 10;

  const svgPoints = useMemo(() => {
    const plotW = 264;
    const plotH = 68;
    const maxDist = Math.max(farUu * 1.12, 8000);
    const pts: string[] = [];
    for (let i = 0; i <= 48; i++) {
      const d = (i / 48) * maxDist;
      const sc = computeOffscreenDistanceScale(d, config);
      pts.push(`${(8 + (d / maxDist) * plotW).toFixed(1)},${(8 + (1 - Math.max(0, Math.min(1.2, sc))) * plotH).toFixed(1)}`);
    }
    return {
      polyline: pts.join(' '),
      simX: 8 + Math.min(1, Math.max(0, simDistUu / maxDist)) * plotW,
      simY: 8 + (1 - Math.max(0, Math.min(1.2, currentSimScale))) * plotH,
      nearX: 8 + Math.min(1, Math.max(0, nearUu / maxDist)) * plotW,
      farX: 8 + Math.min(1, Math.max(0, farUu / maxDist)) * plotW,
    };
  }, [nearUu, farUu, simDistUu, currentSimScale, config]);

  const curveExportJson = useMemo(
    () =>
      JSON.stringify(
        {
          offscreenDistanceScaleEnabled: config.offscreenDistanceScaleEnabled,
          offscreenCircleRadiusPx: config.offscreenCircleRadiusPx,
          offscreenBorderWidthPx: config.offscreenBorderWidthPx,
          offscreenDistanceMinScale: config.offscreenDistanceMinScale,
          offscreenDistanceNearUu: config.offscreenDistanceNearUu,
          offscreenDistanceFarUu: config.offscreenDistanceFarUu,
          offscreenDistanceCurveExponent: config.offscreenDistanceCurveExponent,
          anonymizePlayerNames: config.anonymizePlayerNames,
          cardDisplayMode: config.cardDisplayMode,
          circleColorMode: config.circleColorMode,
          slotCodes: config.slotCodes,
        },
        null,
        2
      ),
    [config]
  );

  const handleCopyCurveJson = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) navigator.clipboard.writeText(curveExportJson).catch(() => {});
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 1800);
  };

  const handleScrubDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubDragRef.current = { active: true, lastX: e.clientX, angle: simAngleDeg };
    if (!config.offscreenDistanceSimEnabled) updateConfig({ offscreenDistanceSimEnabled: true });
  };

  const handleScrubMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubDragRef.current.active) return;
    const trackW = scrubTrackRef.current?.clientWidth || 240;
    const dx = e.clientX - scrubDragRef.current.lastX;
    scrubDragRef.current.lastX = e.clientX;
    const nextAngle = (((scrubDragRef.current.angle + (dx / Math.max(80, trackW)) * 360) % 360) + 360) % 360;
    scrubDragRef.current.angle = nextAngle;
    updateConfig({ offscreenDistanceSimAngleDeg: Math.round(nextAngle), offscreenDistanceSimEnabled: true });
  };

  const handleScrubUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (scrubDragRef.current.active) {
      scrubDragRef.current.active = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    }
  };

  const thumbNorm = (((simAngleDeg % 360) + 360) % 360) / 360;
  const btnInactive = isLight
    ? 'bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-100'
    : 'border-neutral-700 text-neutral-400 hover:bg-neutral-800';

  return (
    <div className="flex flex-col gap-2 pt-2 border-t border-neutral-200/70 dark:border-neutral-800">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-[11px] flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-teal-500" />
          <span>Off-Screen Distance Non-Linear Size Curve Tuner &amp; 360° Ground Simulator</span>
        </span>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] ${muted}`}>Distance Scaling</span>
          <ToggleSwitch checked={config.offscreenDistanceScaleEnabled} onChange={(v) => updateConfig({ offscreenDistanceScaleEnabled: v })} isLight={isLight} />
        </div>
      </div>

      <div className={`p-2 rounded-lg border flex flex-col gap-2 ${subCardBg}`}>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className={muted}>
              Curve Preview (100% Radius {config.offscreenCircleRadiusPx}px → Far Min {Math.round(config.offscreenDistanceMinScale * 100)}%):
            </span>
            <span className="font-mono font-bold text-teal-400">
              @{simDistUu} UU → {Math.round(currentSimScale * 100)}% ({currentSimRadiusPx}px)
            </span>
          </div>

          <svg viewBox="0 0 280 84" className="w-full h-20 rounded border border-neutral-800 bg-neutral-950/80">
            {[8, 42, 76].map((yPos) => (
              <line key={yPos} x1="8" y1={yPos} x2="272" y2={yPos} stroke="currentColor" strokeOpacity="0.12" strokeDasharray="3 3" />
            ))}
            <line x1={svgPoints.nearX} y1="6" x2={svgPoints.nearX} y2="78" stroke="#38bdf8" strokeOpacity="0.45" strokeDasharray="2 2" />
            <line x1={svgPoints.farX} y1="6" x2={svgPoints.farX} y2="78" stroke="#fb923c" strokeOpacity="0.45" strokeDasharray="2 2" />
            <polyline fill="none" stroke="#14b8a6" strokeWidth="2.2" points={svgPoints.polyline} />
            <circle cx={svgPoints.simX} cy={svgPoints.simY} r="4.2" fill="#facc15" stroke="#0f172a" strokeWidth="1.5" />
          </svg>

          <div className="grid grid-cols-4 gap-1 pt-0.5">
            {CURVE_EXPONENT_PRESETS.map((preset) => {
              const isSelected = Math.abs(config.offscreenDistanceCurveExponent - preset.exponent) < 0.04;
              return (
                <button
                  key={preset.label}
                  type="button"
                  title={preset.desc}
                  onClick={() => updateConfig({ offscreenDistanceCurveExponent: preset.exponent, offscreenDistanceScaleEnabled: true })}
                  className={`px-1.5 py-0.5 rounded border text-[9px] font-mono cursor-pointer truncate transition-colors ${
                    isSelected ? 'bg-teal-500/20 border-teal-400 text-teal-300 font-bold' : btnInactive
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <SliderControl
            label="Min Far Scale (Floor Ratio)"
            value={config.offscreenDistanceMinScale}
            min={0.15}
            max={1.0}
            step={0.05}
            unit="x"
            onChange={(v) => updateConfig({ offscreenDistanceMinScale: v })}
            isLight={isLight}
          />
          <SliderControl
            label="Non-Linear Curve Exponent (γ)"
            value={config.offscreenDistanceCurveExponent}
            min={0.15}
            max={3.0}
            step={0.05}
            onChange={(v) => updateConfig({ offscreenDistanceCurveExponent: v })}
            isLight={isLight}
          />
          <SliderControl
            label="Near Full-Size Distance (100%)"
            value={config.offscreenDistanceNearUu}
            min={100}
            max={3000}
            step={50}
            unit="UU"
            onChange={(v) => updateConfig({ offscreenDistanceNearUu: v })}
            isLight={isLight}
          />
          <SliderControl
            label="Far Min-Size Distance"
            value={config.offscreenDistanceFarUu}
            min={1000}
            max={12000}
            step={100}
            unit="UU"
            onChange={(v) => updateConfig({ offscreenDistanceFarUu: v })}
            isLight={isLight}
          />
        </div>

        <div className="flex flex-col gap-1.5 pt-1.5 border-t border-neutral-200/70 dark:border-neutral-800">
          <div className="flex items-center justify-between gap-2 text-[10px]">
            <span className="font-semibold flex items-center gap-1.5">
              <Compass className="h-3.5 w-3.5 text-amber-500" />
              <span>Simulate Ground Dashed Distance Line &amp; 360° Screen-Edge Circle</span>
            </span>
            <div className="flex items-center gap-1.5">
              <span className={`font-mono text-[9px] ${muted}`}>
                {config.offscreenDistanceSimEnabled ? `ACTIVE (${simDistUu} UU · ${simAngleDeg}°)` : 'SIMULATOR OFF'}
              </span>
              <ToggleSwitch checked={config.offscreenDistanceSimEnabled} onChange={(v) => updateConfig({ offscreenDistanceSimEnabled: v })} isLight={isLight} />
            </div>
          </div>

          <SliderControl
            label="Simulated Car Distance (3D Ground Dashed Line + Ring)"
            value={simDistUu}
            min={200}
            max={10000}
            step={50}
            unit="UU"
            onChange={(v) => updateConfig({ offscreenDistanceSimDistanceUu: v, offscreenDistanceSimEnabled: true })}
            isLight={isLight}
          />

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className={muted}>360° Screen Orbit Scrub (Drag Left/Right to Orbit Screen):</span>
              <span className="font-mono font-bold text-[10px]">{simAngleDeg}°</span>
            </div>

            <div
              ref={scrubTrackRef}
              onPointerDown={handleScrubDown}
              onPointerMove={handleScrubMove}
              onPointerUp={handleScrubUp}
              onPointerCancel={handleScrubUp}
              className="relative h-6 rounded-md border border-neutral-700 bg-neutral-950/80 hover:border-teal-400 cursor-ew-resize flex items-center px-2 select-none"
            >
              <div className="w-full border-t border-dashed border-neutral-500/50 pointer-events-none" />
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-mono opacity-45 pointer-events-none">
                Drag Left / Right to Orbit Screen 0°–360°
              </span>
              <div
                style={{ left: `calc(${(thumbNorm * 100).toFixed(1)}% - 10px)` }}
                className="absolute h-4 w-5 rounded bg-teal-500 border border-white shadow-xs flex items-center justify-center pointer-events-none"
              >
                <div className="h-2 w-0.5 bg-white/90 rounded-full" />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1 pt-0.5">
              {EDGE_ANGLE_PRESETS.map((preset) => {
                const isSelected = Math.abs(simAngleDeg - preset.deg) <= 2;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => updateConfig({ offscreenDistanceSimAngleDeg: preset.deg, offscreenDistanceSimEnabled: true })}
                    className={`px-1 py-0.5 rounded border text-[9px] font-mono cursor-pointer truncate transition-colors ${
                      isSelected ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold' : btnInactive
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-200/70 dark:border-neutral-800">
            <span className={`text-[10px] ${muted}`}>Export Tuned Distance Curve Parameters:</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowExportPreview((p) => !p)}
                className={`px-2 py-0.5 rounded border text-[9px] font-mono cursor-pointer ${btnInactive}`}
              >
                {showExportPreview ? 'Hide JSON' : 'View JSON'}
              </button>
              <button
                type="button"
                onClick={handleCopyCurveJson}
                className={`px-2 py-0.5 rounded border text-[9px] font-mono font-bold flex items-center gap-1 cursor-pointer ${
                  copiedJson
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                    : 'bg-teal-500/20 border-teal-400 text-teal-200 hover:bg-teal-500/30'
                }`}
              >
                {copiedJson ? (
                  <>
                    <Check className="h-3 w-3" />
                    <span>Copied Curve JSON!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy Curve Data</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {showExportPreview && (
            <pre className="p-1.5 rounded border border-neutral-800 bg-neutral-950 text-neutral-300 text-[9px] font-mono overflow-x-auto select-all">
              {curveExportJson}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};
