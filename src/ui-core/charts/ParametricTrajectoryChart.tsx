import React, { useMemo, useId, useState, useRef } from 'react';
import { TrendingUp, ArrowDown, Clock, MoveVertical } from 'lucide-react';
import { UI_RADIUS } from '../tokens/radius';
import { UI_THEME } from '../tokens/colors';

export const ALPHA_COMPONENT_ID = 'Alpha:ParametricTrajectoryChart' as const;

export interface ParametricTrajectoryChartProps {
  p1x: number;
  p1y: number;
  p2x: number;
  p2y: number;
  durationMs: number;
  dropDistance: number;
  title?: string;
  unit?: string;
  width?: number;
  height?: number;
  showMetrics?: boolean;
  isLight?: boolean;
  className?: string;
}

export function computeParametricTrajectoryExtrema(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  durationMs: number,
  dropDistance: number
) {
  const clampX1 = Math.min(1, Math.max(0, p1x));
  const clampX2 = Math.min(1, Math.max(0, p2x));

  const evalX = (u: number) => {
    const om = 1.0 - u;
    return 3 * om * om * u * clampX1 + 3 * om * u * u * clampX2 + u * u * u;
  };

  const evalY = (u: number) => {
    const om = 1.0 - u;
    return 3 * om * om * u * p1y + 3 * om * u * u * p2y + u * u * u;
  };

  // Analytical derivative dy/du = 3 * (A*u^2 + B*u + C)
  const A = 1.0 - 3.0 * p2y + 3.0 * p1y;
  const B = 2.0 * (p2y - 2.0 * p1y);
  const C = p1y;

  const candidateU = [0.0, 1.0];

  if (Math.abs(A) < 1e-7) {
    if (Math.abs(B) > 1e-7) {
      const u = -C / B;
      if (u > 0.0 && u < 1.0) candidateU.push(u);
    }
  } else {
    const disc = B * B - 4.0 * A * C;
    if (disc >= 0) {
      const sqrtDisc = Math.sqrt(disc);
      const u1 = (-B - sqrtDisc) / (2.0 * A);
      const u2 = (-B + sqrtDisc) / (2.0 * A);
      if (u1 > 0.0 && u1 < 1.0) candidateU.push(u1);
      if (u2 > 0.0 && u2 < 1.0) candidateU.push(u2);
    }
  }

  let minY = 0.0;
  let maxY = 1.0;
  let uForMinY = 0.0;
  let uForMaxY = 1.0;

  for (const u of candidateU) {
    const yVal = evalY(u);
    if (yVal < minY) {
      minY = yVal;
      uForMinY = u;
    }
    if (yVal > maxY) {
      maxY = yVal;
      uForMaxY = u;
    }
  }

  const peakRiseUu = minY < 0 ? -minY * dropDistance : 0;
  const peakTimeMs = evalX(uForMinY) * durationMs;
  const lowestPlungeUu = maxY > 1.0 ? -maxY * dropDistance : -dropDistance;
  const lowestTimeMs = evalX(uForMaxY) * durationMs;
  const finalDropUu = -dropDistance;

  return {
    minY,
    maxY,
    uForMinY,
    uForMaxY,
    peakRiseUu,
    peakTimeMs,
    lowestPlungeUu,
    lowestTimeMs,
    finalDropUu,
    evalX,
    evalY,
  };
}

/**
 * ParametricTrajectoryChart
 * Parametric 2D trajectory canvas chart (`OrbTrajectoryChart` successor):
 * - Instance-isolated SVG gradient IDs (`useId()`)
 * - Analytical derivative extrema solver (`dy/du = 0`)
 * - Interactive time-axis crosshair (`0ms .. durationMs`) with live displacement & velocity readout
 */
export const ParametricTrajectoryChart: React.FC<ParametricTrajectoryChartProps> = React.memo(({
  p1x,
  p1y,
  p2x,
  p2y,
  durationMs,
  dropDistance,
  title = 'Parametric Vertical Trajectory & Extrema',
  unit = 'uu',
  width = 340,
  height = 172,
  showMetrics = true,
  isLight = false,
  className = '',
}) => {
  const instanceId = useId().replace(/:/g, '');
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverSampleIdx, setHoverSampleIdx] = useState<number | null>(null);

  const extrema = useMemo(
    () => computeParametricTrajectoryExtrema(p1x, p1y, p2x, p2y, durationMs, dropDistance),
    [p1x, p1y, p2x, p2y, durationMs, dropDistance]
  );

  const paddingL = 44;
  const paddingR = 24;
  const paddingT = 22;
  const paddingB = 26;

  const innerW = width - paddingL - paddingR;
  const innerH = height - paddingT - paddingB;

  const topDeltaY = Math.max(30, extrema.peakRiseUu * 1.18);
  const bottomDeltaY = Math.min(-dropDistance * 1.15, extrema.lowestPlungeUu * 1.15);
  const rangeY = Math.max(1, topDeltaY - bottomDeltaY);

  const mapX = (tMs: number) =>
    paddingL + Math.min(1, Math.max(0, tMs / Math.max(1, durationMs))) * innerW;
  const mapY = (deltaY: number) =>
    paddingT + (1.0 - (deltaY - bottomDeltaY) / rangeY) * innerH;

  // Precompute 80 trajectory samples with time & displacement
  const samples = useMemo(() => {
    const count = 80;
    const arr: Array<{ tMs: number; deltaY: number; sx: number; sy: number }> = [];
    for (let i = 0; i <= count; i++) {
      const u = i / count;
      const tMs = extrema.evalX(u) * durationMs;
      const deltaY = -extrema.evalY(u) * dropDistance;
      arr.push({
        tMs,
        deltaY,
        sx: mapX(tMs),
        sy: mapY(deltaY),
      });
    }
    return arr;
  }, [extrema, durationMs, dropDistance, width, height]);

  const pathD = samples.reduce((acc, pt, idx) => {
    return idx === 0
      ? `M ${pt.sx.toFixed(1)},${pt.sy.toFixed(1)}`
      : `${acc} L ${pt.sx.toFixed(1)},${pt.sy.toFixed(1)}`;
  }, '');

  const yBaselineScreen = mapY(0);
  const yFinalScreen = mapY(-dropDistance);
  const peakScreen = {
    x: mapX(extrema.peakTimeMs),
    y: mapY(extrema.peakRiseUu),
  };
  const endScreen = {
    x: mapX(durationMs),
    y: yFinalScreen,
  };

  const hasPeak = extrema.peakRiseUu > 0.5;
  const hoveredSample =
    hoverSampleIdx !== null && samples[hoverSampleIdx] ? samples[hoverSampleIdx] : null;

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = width / Math.max(1, rect.width);
    const px = (e.clientX - rect.left) * scaleX;
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < samples.length; i++) {
      const d = Math.abs(samples[i].sx - px);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    setHoverSampleIdx(bestIdx);
  };

  return (
    <div
      data-alpha-id={ALPHA_COMPONENT_ID}
      data-component="parametric-trajectory-chart"
      className={`relative w-full ${UI_RADIUS.card} border flex flex-col select-none overflow-hidden p-3 gap-2 transition-colors ${
        isLight
          ? `bg-white ${UI_THEME.light.border} ${UI_THEME.light.textPrimary} shadow-2xs`
          : `bg-neutral-900/90 ${UI_THEME.dark.border} ${UI_THEME.dark.textPrimary}`
      } ${className}`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap font-mono text-[11px]">
        <div className="flex items-center gap-1.5 font-bold">
          <MoveVertical className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span>{title}</span>
        </div>

        {hoveredSample ? (
          <span className="px-2 py-0.5 rounded border text-[10px] font-bold bg-emerald-500/15 text-emerald-500 border-emerald-500/30 tabular-nums">
            t = {hoveredSample.tMs.toFixed(0)}ms · ΔY ={' '}
            {hoveredSample.deltaY >= 0
              ? `+${hoveredSample.deltaY.toFixed(1)}`
              : hoveredSample.deltaY.toFixed(1)}{' '}
            {unit}
          </span>
        ) : (
          <span className="px-1.5 py-0.5 rounded border text-[9px] font-bold bg-amber-500/10 text-amber-500 border-amber-500/30">
            {hasPeak ? `Peak Leap (+${extrema.peakRiseUu.toFixed(1)} ${unit})` : 'Direct Drop'}
          </span>
        )}
      </div>

      {/* Responsive Aspect-Correct SVG Plot */}
      <div
        className={`w-full rounded-lg border flex items-center justify-center overflow-hidden ${
          isLight ? 'bg-neutral-50/90 border-neutral-200/80' : 'bg-neutral-950/80 border-neutral-800'
        }`}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto max-h-[210px] overflow-visible cursor-crosshair"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverSampleIdx(null)}
        >
          <defs>
            <linearGradient id={`trajStroke-${instanceId}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="40%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>

            <linearGradient id={`trajArea-${instanceId}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.03" />
            </linearGradient>
          </defs>

          {/* Shaded Area Under Curve */}
          <path
            d={`${pathD} L ${endScreen.x.toFixed(1)},${yBaselineScreen.toFixed(1)} L ${mapX(0).toFixed(1)},${yBaselineScreen.toFixed(1)} Z`}
            fill={`url(#trajArea-${instanceId})`}
          />

          {/* Baseline (0 uu) */}
          <line
            x1={paddingL - 6}
            y1={yBaselineScreen}
            x2={width - paddingR + 6}
            y2={yBaselineScreen}
            stroke={isLight ? '#94a3b8' : '#64748b'}
            strokeWidth="1.2"
            strokeDasharray="3 3"
          />
          <text
            x={paddingL - 8}
            y={yBaselineScreen + 3}
            fontSize="9"
            textAnchor="end"
            fill={isLight ? '#475569' : '#94a3b8'}
            className="font-mono font-bold"
          >
            0 {unit}
          </text>

          {/* Final Drop Line (-dropDistance) */}
          <line
            x1={paddingL - 6}
            y1={yFinalScreen}
            x2={width - paddingR + 6}
            y2={yFinalScreen}
            stroke={isLight ? '#cbd5e1' : '#334155'}
            strokeWidth="1"
            strokeDasharray="2 2"
          />
          <text
            x={paddingL - 8}
            y={yFinalScreen + 3}
            fontSize="9"
            textAnchor="end"
            fill={isLight ? '#64748b' : '#64748b'}
            className="font-mono"
          >
            -{dropDistance.toFixed(0)}
          </text>

          {/* Trajectory Curve */}
          <path
            d={pathD}
            fill="none"
            stroke={`url(#trajStroke-${instanceId})`}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Start Point */}
          <circle cx={mapX(0)} cy={yBaselineScreen} r="3.5" fill="#f59e0b" />

          {/* Peak Leap Callout */}
          {hasPeak && (
            <g>
              <line
                x1={peakScreen.x}
                y1={yBaselineScreen}
                x2={peakScreen.x}
                y2={peakScreen.y}
                stroke="#f59e0b"
                strokeWidth="1"
                strokeDasharray="2 2"
                opacity="0.75"
              />
              <circle
                cx={peakScreen.x}
                cy={peakScreen.y}
                r="4.5"
                fill="#f59e0b"
                stroke={isLight ? '#ffffff' : '#18181b'}
                strokeWidth="1.5"
              />
              <text
                x={Math.min(width - 60, Math.max(paddingL + 35, peakScreen.x))}
                y={Math.max(12, peakScreen.y - 7)}
                fontSize="9"
                textAnchor="middle"
                fill="#f59e0b"
                className="font-mono font-bold"
              >
                +{extrema.peakRiseUu.toFixed(1)} {unit} ({extrema.peakTimeMs.toFixed(0)}ms)
              </text>
            </g>
          )}

          {/* End Drop Point */}
          <circle
            cx={endScreen.x}
            cy={endScreen.y}
            r="4.5"
            fill="#38bdf8"
            stroke={isLight ? '#ffffff' : '#18181b'}
            strokeWidth="1.5"
          />

          {/* Interactive Hover Crosshair */}
          {hoveredSample && (
            <g>
              <line
                x1={hoveredSample.sx}
                y1={paddingT}
                x2={hoveredSample.sx}
                y2={height - paddingB}
                stroke={isLight ? 'rgba(15,23,42,0.35)' : 'rgba(255,255,255,0.35)'}
                strokeDasharray="2 2"
                strokeWidth="1"
              />
              <circle
                cx={hoveredSample.sx}
                cy={hoveredSample.sy}
                r="4.5"
                fill="#10b981"
                stroke={isLight ? '#ffffff' : '#09090b'}
                strokeWidth="1.5"
              />
            </g>
          )}

          {/* X Axis Time Labels */}
          <text
            x={mapX(0)}
            y={height - 8}
            fontSize="9"
            textAnchor="start"
            fill={isLight ? '#64748b' : '#94a3b8'}
            className="font-mono"
          >
            0ms
          </text>
          <text
            x={mapX(durationMs / 2)}
            y={height - 8}
            fontSize="9"
            textAnchor="middle"
            fill={isLight ? '#64748b' : '#94a3b8'}
            className="font-mono"
          >
            {(durationMs / 2).toFixed(0)}ms
          </text>
          <text
            x={mapX(durationMs)}
            y={height - 8}
            fontSize="9"
            textAnchor="end"
            fill={isLight ? '#64748b' : '#94a3b8'}
            className="font-mono"
          >
            {durationMs.toFixed(0)}ms
          </text>
        </svg>
      </div>

      {/* Summary Metrics Chips */}
      {showMetrics && (
        <div className="grid grid-cols-4 gap-1.5 w-full font-mono text-[10px]">
          <div
            className={`p-1.5 rounded-lg border flex flex-col items-center ${
              isLight ? 'bg-amber-500/10 border-amber-300/60' : 'bg-amber-500/10 border-amber-500/30'
            }`}
          >
            <span className="text-[9px] text-neutral-400 flex items-center gap-0.5">
              <TrendingUp className="h-2.5 w-2.5 text-amber-500" />
              Peak Lift
            </span>
            <span className="font-bold text-amber-500 tabular-nums">
              +{extrema.peakRiseUu.toFixed(1)} {unit}
            </span>
          </div>

          <div
            className={`p-1.5 rounded-lg border flex flex-col items-center ${
              isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-950/60 border-neutral-800'
            }`}
          >
            <span className="text-[9px] text-neutral-400 flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5 text-amber-400" />
              Peak Time
            </span>
            <span className="font-bold tabular-nums">{extrema.peakTimeMs.toFixed(1)} ms</span>
          </div>

          <div
            className={`p-1.5 rounded-lg border flex flex-col items-center ${
              isLight ? 'bg-sky-500/10 border-sky-300/60' : 'bg-sky-500/10 border-sky-500/30'
            }`}
          >
            <span className="text-[9px] text-neutral-400 flex items-center gap-0.5">
              <ArrowDown className="h-2.5 w-2.5 text-sky-500" />
              Final Drop
            </span>
            <span className="font-bold text-sky-500 tabular-nums">
              -{dropDistance.toFixed(1)} {unit}
            </span>
          </div>

          <div
            className={`p-1.5 rounded-lg border flex flex-col items-center ${
              isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-950/60 border-neutral-800'
            }`}
          >
            <span className="text-[9px] text-neutral-400 flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5 text-neutral-400" />
              Duration
            </span>
            <span className="font-bold tabular-nums">{durationMs.toFixed(0)} ms</span>
          </div>
        </div>
      )}
    </div>
  );
});

ParametricTrajectoryChart.displayName = 'ParametricTrajectoryChart';
