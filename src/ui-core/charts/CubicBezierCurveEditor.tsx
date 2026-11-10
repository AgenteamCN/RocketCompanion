import React, { useId, useRef, useState } from 'react';
import { Spline } from 'lucide-react';
import { UI_RADIUS } from '../tokens/radius';
import { UI_THEME } from '../tokens/colors';

export const ALPHA_COMPONENT_ID = 'Alpha:CubicBezierCurveEditor' as const;

export interface CubicBezierValue {
  p1x: number;
  p1y: number;
  p2x: number;
  p2y: number;
}

export interface CubicBezierPreset {
  name: string;
  value: CubicBezierValue;
}

export const DEFAULT_BEZIER_PRESETS: CubicBezierPreset[] = [
  { name: 'Apple HIG', value: { p1x: 0.2, p1y: 0.8, p2x: 0.25, p2y: 1.0 } },
  { name: 'Orb Leap', value: { p1x: 0.0, p1y: -1.15, p2x: 0.0, p2y: 1.0 } },
  { name: 'Glow Collapse', value: { p1x: 0.0, p1y: -3.0, p2x: 0.0, p2y: 1.0 } },
  { name: 'Spring Overshoot', value: { p1x: 0.34, p1y: 1.56, p2x: 0.64, p2y: 1.0 } },
];

export interface CubicBezierCurveEditorProps {
  p1x: number;
  p1y: number;
  p2x: number;
  p2y: number;
  /**
   * Optional callback enabling direct interactive dragging of P1 and P2 handles on the graph!
   */
  onChange?: (next: CubicBezierValue) => void;
  title?: string;
  presets?: CubicBezierPreset[];
  width?: number;
  height?: number;
  isLight?: boolean;
  className?: string;
}

/**
 * CubicBezierCurveEditor
 * Interactive cubic Bezier curve editor features:
 * - Instance-isolated SVG gradient IDs via `useId()` (safe for multi-instance coexistence)
 * - Direct pointer dragging of P1 and P2 control point handles on the canvas
 * - Dynamic vertical auto-ranging for negative anticipation (`y < 0`) and positive overshoot (`y > 1`)
 * - Interactive phase probe (`t -> y(t)`) on hover
 */
export const CubicBezierCurveEditor: React.FC<CubicBezierCurveEditorProps> = React.memo(({
  p1x,
  p1y,
  p2x,
  p2y,
  onChange,
  title = 'Cubic-Bezier Easing Curve',
  presets = DEFAULT_BEZIER_PRESETS,
  width = 320,
  height = 176,
  isLight = false,
  className = '',
}) => {
  const instanceId = useId().replace(/:/g, '');
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<'p1' | 'p2' | null>(null);
  const [hoverU, setHoverU] = useState<number | null>(null);

  const paddingL = 38;
  const paddingR = 20;
  const paddingT = 22;
  const paddingB = 24;

  const innerW = width - paddingL - paddingR;
  const innerH = height - paddingT - paddingB;

  // Dynamic vertical scaling to accommodate overshoot (above 1 or below 0)
  const minY = Math.min(-0.25, p1y - 0.18, p2y - 0.18);
  const maxY = Math.max(1.25, p1y + 0.18, p2y + 0.18);
  const rangeY = Math.max(0.5, maxY - minY);

  const mapX = (x: number) => paddingL + Math.max(0, Math.min(1, x)) * innerW;
  const mapY = (y: number) => paddingT + (1.0 - (y - minY) / rangeY) * innerH;

  const unmapX = (px: number) => Math.max(0, Math.min(1, (px - paddingL) / innerW));
  const unmapY = (py: number) => {
    const norm = 1.0 - (py - paddingT) / innerH;
    return Math.max(-5.0, Math.min(3.0, minY + norm * rangeY));
  };

  const p0Screen = { x: mapX(0), y: mapY(0) };
  const p1Screen = { x: mapX(p1x), y: mapY(p1y) };
  const p2Screen = { x: mapX(p2x), y: mapY(p2y) };
  const p3Screen = { x: mapX(1), y: mapY(1) };

  const curvePath = [
    `M ${p0Screen.x.toFixed(1)},${p0Screen.y.toFixed(1)}`,
    `C ${p1Screen.x.toFixed(1)},${p1Screen.y.toFixed(1)}`,
    `${p2Screen.x.toFixed(1)},${p2Screen.y.toFixed(1)}`,
    `${p3Screen.x.toFixed(1)},${p3Screen.y.toFixed(1)}`,
  ].join(' ');

  const hasOvershootTop = p1y > 1.0 || p2y > 1.0;
  const hasOvershootBottom = p1y < 0.0 || p2y < 0.0;

  // Parametric evaluation for hover probe
  const evalBez = (u: number, c1: number, c2: number) => {
    const om = 1 - u;
    return 3 * om * om * u * c1 + 3 * om * u * u * c2 + u * u * u;
  };

  const probe =
    hoverU !== null
      ? {
          t: evalBez(hoverU, Math.max(0, Math.min(1, p1x)), Math.max(0, Math.min(1, p2x))),
          y: evalBez(hoverU, p1y, p2y),
        }
      : null;

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = width / Math.max(1, rect.width);
    const scaleY = height / Math.max(1, rect.height);
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;

    if (draggingHandle && onChange) {
      const nx = Number(unmapX(px).toFixed(2));
      const ny = Number(unmapY(py).toFixed(2));
      if (draggingHandle === 'p1') {
        onChange({ p1x: nx, p1y: ny, p2x, p2y });
      } else {
        onChange({ p1x, p1y, p2x: nx, p2y: ny });
      }
      return;
    }

    const uApprox = unmapX(px);
    setHoverU(uApprox);
  };

  return (
    <div
      data-alpha-id={ALPHA_COMPONENT_ID}
      data-component="cubic-bezier-curve-editor"
      className={`relative w-full ${UI_RADIUS.card} border flex flex-col select-none overflow-hidden p-3 gap-2 transition-colors ${
        isLight
          ? `bg-white ${UI_THEME.light.border} ${UI_THEME.light.textPrimary} shadow-2xs`
          : `bg-neutral-900/90 ${UI_THEME.dark.border} ${UI_THEME.dark.textPrimary}`
      } ${className}`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap font-mono text-[11px]">
        <div className="flex items-center gap-1.5 font-bold">
          <Spline className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span>{title}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded border text-[10px] font-semibold bg-amber-500/10 text-amber-500 border-amber-500/30 tabular-nums">
            cubic-bezier({p1x.toFixed(2)}, {p1y.toFixed(2)}, {p2x.toFixed(2)}, {p2y.toFixed(2)})
          </span>
          {(hasOvershootTop || hasOvershootBottom) && (
            <span className="px-1.5 py-0.5 rounded border text-[9px] font-bold bg-pink-500/15 text-pink-500 border-pink-500/30">
              {hasOvershootTop && hasOvershootBottom
                ? 'Bi-Overshoot'
                : hasOvershootTop
                ? 'Peak Overshoot'
                : 'Anticipation Leap'}
            </span>
          )}
        </div>
      </div>

      {/* Presets Strip (when editable) */}
      {onChange && presets.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap font-mono text-[10px]">
          <span className="text-neutral-400 mr-1">Presets:</span>
          {presets.map((pr) => (
            <button
              key={pr.name}
              type="button"
              onClick={() => onChange(pr.value)}
              className={`px-2 py-0.5 rounded border cursor-pointer transition-colors ${
                isLight
                  ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-700'
                  : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
              }`}
            >
              {pr.name}
            </button>
          ))}
        </div>
      )}

      {/* Aspect-Correct Responsive SVG */}
      <div
        className={`w-full rounded-lg border flex items-center justify-center overflow-hidden ${
          isLight ? 'bg-neutral-50/90 border-neutral-200/80' : 'bg-neutral-950/80 border-neutral-800'
        }`}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto max-h-[210px] overflow-visible touch-none"
          onPointerMove={handlePointerMove}
          onPointerUp={() => setDraggingHandle(null)}
          onPointerLeave={() => {
            setDraggingHandle(null);
            setHoverU(null);
          }}
        >
          <defs>
            <linearGradient id={`bezGrad-${instanceId}`} x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
          </defs>

          {/* 0..1 Unit Box */}
          <rect
            x={mapX(0)}
            y={mapY(1)}
            width={innerW}
            height={Math.max(1, mapY(0) - mapY(1))}
            fill={isLight ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.025)'}
            stroke={isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)'}
            strokeWidth="1"
            strokeDasharray="3 3"
          />

          {/* Baseline Y = 0.0 */}
          <line
            x1={paddingL - 8}
            y1={p0Screen.y}
            x2={width - paddingR + 6}
            y2={p0Screen.y}
            stroke={isLight ? '#94a3b8' : '#475569'}
            strokeWidth="1"
          />
          <text
            x={paddingL - 10}
            y={p0Screen.y + 3}
            fontSize="9"
            textAnchor="end"
            fill={isLight ? '#475569' : '#94a3b8'}
            className="font-mono font-semibold"
          >
            0.0
          </text>

          {/* Topline Y = 1.0 */}
          <line
            x1={paddingL - 8}
            y1={p3Screen.y}
            x2={width - paddingR + 6}
            y2={p3Screen.y}
            stroke={isLight ? '#94a3b8' : '#475569'}
            strokeWidth="1"
            strokeDasharray="2 2"
          />
          <text
            x={paddingL - 10}
            y={p3Screen.y + 3}
            fontSize="9"
            textAnchor="end"
            fill={isLight ? '#475569' : '#94a3b8'}
            className="font-mono font-semibold"
          >
            1.0
          </text>

          {/* Linear Diagonal Reference */}
          <line
            x1={p0Screen.x}
            y1={p0Screen.y}
            x2={p3Screen.x}
            y2={p3Screen.y}
            stroke={isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)'}
            strokeWidth="1"
            strokeDasharray="4 4"
          />

          {/* Tangent Handle Arms */}
          <line
            x1={p0Screen.x}
            y1={p0Screen.y}
            x2={p1Screen.x}
            y2={p1Screen.y}
            stroke="#f59e0b"
            strokeWidth="1.5"
            opacity="0.85"
          />
          <line
            x1={p3Screen.x}
            y1={p3Screen.y}
            x2={p2Screen.x}
            y2={p2Screen.y}
            stroke="#ec4899"
            strokeWidth="1.5"
            opacity="0.85"
          />

          {/* Main Cubic Bezier Curve */}
          <path
            d={curvePath}
            fill="none"
            stroke={`url(#bezGrad-${instanceId})`}
            strokeWidth="2.75"
            strokeLinecap="round"
          />

          {/* Hover Probe Crosshair */}
          {probe && !draggingHandle && (
            <g>
              <line
                x1={mapX(probe.t)}
                y1={paddingT}
                x2={mapX(probe.t)}
                y2={height - paddingB}
                stroke={isLight ? 'rgba(15,23,42,0.28)' : 'rgba(255,255,255,0.28)'}
                strokeDasharray="2 2"
                strokeWidth="1"
              />
              <circle
                cx={mapX(probe.t)}
                cy={mapY(probe.y)}
                r="4"
                fill="#10b981"
                stroke={isLight ? '#ffffff' : '#09090b'}
                strokeWidth="1.5"
              />
              <text
                x={Math.min(width - 65, Math.max(paddingL + 4, mapX(probe.t) + 6))}
                y={Math.max(14, mapY(probe.y) - 6)}
                fontSize="9"
                fill="#10b981"
                className="font-mono font-bold"
              >
                t={ (probe.t * 100).toFixed(0) }% → y={ probe.y.toFixed(2) }
              </text>
            </g>
          )}

          {/* Fixed Endpoints P0 and P3 */}
          <circle cx={p0Screen.x} cy={p0Screen.y} r="3.5" fill="#64748b" />
          <circle cx={p3Screen.x} cy={p3Screen.y} r="3.5" fill="#64748b" />

          {/* Control Point P1 (Draggable) */}
          <circle
            cx={p1Screen.x}
            cy={p1Screen.y}
            r={draggingHandle === 'p1' ? 6.5 : 5.5}
            fill="#f59e0b"
            stroke={isLight ? '#ffffff' : '#18181b'}
            strokeWidth="1.8"
            className={onChange ? 'cursor-grab active:cursor-grabbing' : ''}
            onPointerDown={(e) => {
              if (!onChange) return;
              e.stopPropagation();
              (e.target as Element).setPointerCapture(e.pointerId);
              setDraggingHandle('p1');
            }}
          />

          {/* Control Point P2 (Draggable) */}
          <circle
            cx={p2Screen.x}
            cy={p2Screen.y}
            r={draggingHandle === 'p2' ? 6.5 : 5.5}
            fill="#ec4899"
            stroke={isLight ? '#ffffff' : '#18181b'}
            strokeWidth="1.8"
            className={onChange ? 'cursor-grab active:cursor-grabbing' : ''}
            onPointerDown={(e) => {
              if (!onChange) return;
              e.stopPropagation();
              (e.target as Element).setPointerCapture(e.pointerId);
              setDraggingHandle('p2');
            }}
          />
        </svg>
      </div>

      {/* Footer Legend */}
      <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400 px-0.5">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />
            P1 ({p1x.toFixed(2)}, {p1y.toFixed(2)})
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-pink-500 inline-block" />
            P2 ({p2x.toFixed(2)}, {p2y.toFixed(2)})
          </span>
        </div>
        <span>{onChange ? 'Drag P1 / P2 handles or scrub curve' : 'Hover to probe t → y(t)'}</span>
      </div>
    </div>
  );
});

CubicBezierCurveEditor.displayName = 'CubicBezierCurveEditor';
