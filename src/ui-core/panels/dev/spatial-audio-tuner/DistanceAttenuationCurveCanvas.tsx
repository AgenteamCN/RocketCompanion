import React, { useRef, useState, useMemo } from 'react';
import type { SpatialAttenuationProfile } from '../../../config/spatialAttenuationProfiles';
import {
  evaluateAttenuationProfileGain,
  solveAttenuationIsoRadiusUU,
  type SpatialAudioVisualizerTelemetry,
} from '../../../config/spatialAudioVisualizerConfig';

export interface DistanceAttenuationCurveCanvasProps {
  isLight: boolean;
  profile: SpatialAttenuationProfile;
  telemetry: SpatialAudioVisualizerTelemetry;
  onUpdateProfile: (patch: Partial<SpatialAttenuationProfile>) => void;
}

type DragTarget = 'rMin' | 'rMax' | 'powerMid' | 'bz1' | 'bz2' | null;

export const DistanceAttenuationCurveCanvas: React.FC<
  DistanceAttenuationCurveCanvasProps
> = ({ isLight, profile, telemetry, onUpdateProfile }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);

  const plotMaxUU = useMemo(
    () => Math.max(5500, Math.min(15000, Math.ceil((profile.maxDistanceUU * 1.15) / 500) * 500)),
    [profile.maxDistanceUU]
  );

  const r50UU = useMemo(() => solveAttenuationIsoRadiusUU(profile, 0.5), [profile]);

  const { curvePath, fillPath } = useMemo(() => {
    const steps = 80;
    const pts: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const dist = (i / steps) * plotMaxUU;
      const g = evaluateAttenuationProfileGain(dist, profile);
      const x = ((dist / plotMaxUU) * 100).toFixed(2);
      const y = ((1 - g) * 100).toFixed(2);
      pts.push(`${i === 0 ? 'M' : 'L'} ${x} ${y}`);
    }
    const line = pts.join(' ');
    return {
      curvePath: line,
      fillPath: `${line} L 100 100 L 0 100 Z`,
    };
  }, [profile, plotMaxUU]);

  const xMinPct = Math.max(0, Math.min(100, (profile.minDistanceUU / plotMaxUU) * 100));
  const x50Pct = Math.max(0, Math.min(100, (r50UU / plotMaxUU) * 100));
  const xMaxPct = Math.max(0, Math.min(100, (profile.maxDistanceUU / plotMaxUU) * 100));
  const yFloorPct = (1 - profile.minGainFloor) * 100;

  const liveX = Math.max(0, Math.min(100, (telemetry.distanceUU / plotMaxUU) * 100));
  const liveY = (1 - (telemetry.isCulled ? 0 : telemetry.gain)) * 100;

  const isBezier =
    profile.curveType === 'custom-bezier' || profile.curveType === 'bezier';
  const isPower =
    profile.curveType === 'power' || profile.curveType === 'exponential';

  const spanPct = Math.max(1, xMaxPct - xMinPct);
  const bz1XPct = xMinPct + profile.bezierPoints.x1 * spanPct;
  const bz1YPct =
    profile.bezierPoints.y1 * yFloorPct;
  const bz2XPct = xMinPct + profile.bezierPoints.x2 * spanPct;
  const bz2YPct =
    profile.bezierPoints.y2 * yFloorPct;

  const midDistUU = 0.5 * (profile.minDistanceUU + profile.maxDistanceUU);
  const midGain = evaluateAttenuationProfileGain(midDistUU, profile);
  const midXPct = 0.5 * (xMinPct + xMaxPct);
  const midYPct = (1 - midGain) * 100;

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragTarget || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const distUU = Math.round((normX * plotMaxUU) / 25) * 25;
    const gainVal = 1 - normY;

    if (dragTarget === 'rMin') {
      const nextMin = Math.max(0, Math.min(profile.maxDistanceUU - 100, distUU));
      onUpdateProfile({ minDistanceUU: nextMin });
    } else if (dragTarget === 'rMax') {
      const nextMax = Math.max(profile.minDistanceUU + 100, Math.min(20000, distUU));
      onUpdateProfile({ maxDistanceUU: nextMax });
    } else if (dragTarget === 'powerMid') {
      const floor = profile.minGainFloor;
      const targetNorm = Math.max(
        0.03,
        Math.min(0.97, (gainVal - floor) / Math.max(0.05, 1 - floor))
      );
      // At t = 0.5, (1 - 0.5)^p = targetNorm => p = ln(targetNorm) / ln(0.5)
      const p = Math.max(0.25, Math.min(4.5, Math.log(targetNorm) / Math.log(0.5)));
      onUpdateProfile({ curveExponent: Number(p.toFixed(2)) });
    } else if (dragTarget === 'bz1') {
      const u = Math.max(
        0.02,
        Math.min(0.98, (normX * 100 - xMinPct) / Math.max(1, spanPct))
      );
      const v = Math.max(0, Math.min(1, (normY * 100) / Math.max(1, yFloorPct)));
      onUpdateProfile({
        bezierPoints: {
          ...profile.bezierPoints,
          x1: Number(u.toFixed(2)),
          y1: Number(v.toFixed(2)),
        },
      });
    } else if (dragTarget === 'bz2') {
      const u = Math.max(
        0.02,
        Math.min(0.98, (normX * 100 - xMinPct) / Math.max(1, spanPct))
      );
      const v = Math.max(0, Math.min(1, (normY * 100) / Math.max(1, yFloorPct)));
      onUpdateProfile({
        bezierPoints: {
          ...profile.bezierPoints,
          x2: Number(u.toFixed(2)),
          y2: Number(v.toFixed(2)),
        },
      });
    }
  };

  const stopDrag = () => setDragTarget(null);

  return (
    <div
      className={`flex flex-col gap-1.5 p-2.5 rounded-xl border ${
        isLight
          ? 'bg-neutral-100/80 border-neutral-200'
          : 'bg-neutral-900/75 border-neutral-800'
      }`}
    >
      <div className="flex items-center justify-between text-[10px] font-mono">
        <span className={isLight ? 'text-neutral-600' : 'text-neutral-400'}>
          MODEL: <strong className="text-sky-400 uppercase">{profile.curveType}</strong>
          {isPower ? ` (p = ${profile.curveExponent.toFixed(2)})` : ''}
          {' · '}drag handles on graph
        </span>
        <span className="text-emerald-400 font-semibold">
          R_min {profile.minDistanceUU} · R_50% {Math.round(r50UU)} · R_max{' '}
          {profile.maxDistanceUU} UU
        </span>
      </div>

      <div
        className={`relative h-36 w-full rounded-lg border overflow-hidden select-none ${
          isLight
            ? 'bg-white border-neutral-200'
            : 'bg-neutral-950 border-neutral-800'
        }`}
      >
        <svg
          ref={svgRef}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="w-full h-full overflow-visible touch-none"
          onPointerMove={handlePointerMove}
          onPointerUp={stopDrag}
          onPointerLeave={stopDrag}
        >
          {/* Horizontal 50% Gain Reference */}
          <line
            x1="0"
            y1="50"
            x2="100"
            y2="50"
            stroke="#38bdf8"
            strokeOpacity="0.2"
            strokeDasharray="2 2"
            strokeWidth="0.8"
            vectorEffect="non-scaling-stroke"
          />

          {/* Arena Scale Reference Lines (Half-field 5120 UU & Full-field 10240 UU) */}
          {[2000, 5120, 10240].map((refUU) => {
            if (refUU >= plotMaxUU) return null;
            const xPct = (refUU / plotMaxUU) * 100;
            return (
              <line
                key={refUU}
                x1={xPct}
                y1="0"
                x2={xPct}
                y2="100"
                stroke="currentColor"
                strokeOpacity="0.1"
                strokeDasharray="2 3"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          {/* Shaded Area under Attenuation Curve */}
          <path d={fillPath} fill="rgba(56, 189, 248, 0.1)" />

          {/* R_min Inner Core Boundary (Draggable) */}
          <line
            x1={xMinPct}
            y1="0"
            x2={xMinPct}
            y2="100"
            stroke="#10b981"
            strokeWidth="1.5"
            strokeDasharray="3 2"
            vectorEffect="non-scaling-stroke"
          />

          {/* R_50% Half-Power Iso-Ring Marker */}
          <line
            x1={x50Pct}
            y1="50"
            x2={x50Pct}
            y2="100"
            stroke="#38bdf8"
            strokeWidth="1.5"
            strokeDasharray="2 2"
            vectorEffect="non-scaling-stroke"
          />

          {/* R_max Outer Cutoff Boundary (Draggable) */}
          <line
            x1={xMaxPct}
            y1="0"
            x2={xMaxPct}
            y2="100"
            stroke={profile.cullBeyondMax && profile.minGainFloor <= 1e-5 ? '#f43f5e' : '#f59e0b'}
            strokeWidth="1.5"
            strokeDasharray="3 2"
            vectorEffect="non-scaling-stroke"
          />

          {/* Main Attenuation Curve Path */}
          <path
            d={curvePath}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
          />

          {/* Live 3D Arena Operating Point Dot */}
          <circle
            cx={liveX}
            cy={liveY}
            r="3.2"
            fill={telemetry.isCulled ? '#f43f5e' : '#facc15'}
            stroke="#090d16"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />

          {/* Draggable R_min Handle */}
          <circle
            cx={xMinPct}
            cy="8"
            r="3.5"
            fill="#10b981"
            className="cursor-ew-resize"
            onPointerDown={(e) => {
              e.stopPropagation();
              (e.target as Element).setPointerCapture?.(e.pointerId);
              setDragTarget('rMin');
            }}
          />

          {/* Draggable R_max Handle */}
          <circle
            cx={xMaxPct}
            cy="8"
            r="3.5"
            fill={profile.cullBeyondMax && profile.minGainFloor <= 1e-5 ? '#f43f5e' : '#f59e0b'}
            className="cursor-ew-resize"
            onPointerDown={(e) => {
              e.stopPropagation();
              (e.target as Element).setPointerCapture?.(e.pointerId);
              setDragTarget('rMax');
            }}
          />

          {/* Draggable Power Curve Midpoint Handle */}
          {isPower && (
            <circle
              cx={midXPct}
              cy={midYPct}
              r="4"
              fill="#f59e0b"
              stroke="#ffffff"
              strokeWidth="1"
              className="cursor-ns-resize"
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.target as Element).setPointerCapture?.(e.pointerId);
                setDragTarget('powerMid');
              }}
            />
          )}

          {/* Draggable Cubic-Bezier Handles */}
          {isBezier && (
            <>
              <line
                x1={xMinPct}
                y1="0"
                x2={bz1XPct}
                y2={bz1YPct}
                stroke="#f59e0b"
                strokeOpacity="0.6"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <line
                x1={xMaxPct}
                y1={yFloorPct}
                x2={bz2XPct}
                y2={bz2YPct}
                stroke="#a855f7"
                strokeOpacity="0.6"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={bz1XPct}
                cy={bz1YPct}
                r="3.8"
                fill="#f59e0b"
                className="cursor-move"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  setDragTarget('bz1');
                }}
              />
              <circle
                cx={bz2XPct}
                cy={bz2YPct}
                r="3.8"
                fill="#a855f7"
                className="cursor-move"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  setDragTarget('bz2');
                }}
              />
            </>
          )}
        </svg>

        {/* Axis Overlays */}
        <span className="absolute top-1 left-1.5 text-[9px] font-mono text-emerald-400 pointer-events-none">
          100% (0 dB)
        </span>
        <span className="absolute top-[44%] left-1.5 text-[9px] font-mono text-sky-400/80 pointer-events-none">
          50% (-6 dB)
        </span>
        <span className="absolute bottom-1 left-1.5 text-[9px] font-mono text-neutral-500 pointer-events-none">
          0 UU
        </span>
        <span className="absolute bottom-1 right-1.5 text-[9px] font-mono text-neutral-400 pointer-events-none">
          {plotMaxUU} UU
        </span>
      </div>
    </div>
  );
};
