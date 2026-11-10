import React from 'react';

export type FloatingResizeHandleStyle =
  | 'corner-arc'
  | 'corner-arc-dots'
  | 'corner-double-arc'
  | 'corner-pill-arc'
  | 'corner-dots'
  | 'footer-carved-slot'
  | 'invisible-edges-and-corner'
  | 'both-slot-and-edges';

export type FloatingCornerArcColorMode = 'neutral' | 'amber' | 'sky' | 'emerald';

export interface CornerCurvedDraggerProps {
  styleVariant?: FloatingResizeHandleStyle;
  outerRadius?: number;
  concentric?: boolean;
  arcRadius?: number;
  inset?: number;
  sweepDeg?: number;
  strokeWidth?: number;
  idleOpacity?: number;
  colorMode?: FloatingCornerArcColorMode;
  isLight?: boolean;
  isActiveOrHovered?: boolean;
}

function describeCircularArc(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number
): string {
  const startRad = (startDeg * Math.PI) / 180;
  const endRad = (endDeg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(
    2
  )} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/**
 * [L4/L6 Decoupled Corner Dragger Primitive] CornerCurvedDragger
 * Renders a bottom-right resize grip that naturally follows the window's bottom-right corner radius:
 * - `corner-arc` (default): Single concentric circular arc dragger
 * - `corner-arc-dots`: 3 dots arranged along a concentric circular arc
 * - `corner-double-arc`: Dual concentric parallel circular arcs
 * - `corner-pill-arc`: High-visibility capsule-backed circular arc dragger
 * - `corner-dots`: Legacy right-angle 3-dots for baseline comparison
 */
export const CornerCurvedDragger: React.FC<CornerCurvedDraggerProps> = React.memo(({
  styleVariant = 'corner-arc',
  outerRadius = 16,
  concentric = true,
  arcRadius = 12,
  inset = 4,
  sweepDeg = 68,
  strokeWidth = 2.4,
  idleOpacity = 60,
  colorMode = 'neutral',
  isLight = false,
  isActiveOrHovered = false,
}) => {
  const effectiveRadius = concentric
    ? Math.max(4, outerRadius - inset)
    : Math.max(4, arcRadius);

  const boxSize = Math.max(24, Math.ceil(effectiveRadius + inset + 8));
  // Center of the bottom-right corner circle in [0..boxSize, 0..boxSize] coordinates
  const cx = boxSize - inset - effectiveRadius;
  const cy = boxSize - inset - effectiveRadius;

  const clampedSweep = Math.max(16, Math.min(90, sweepDeg));
  const startDeg = 45 - clampedSweep / 2;
  const endDeg = 45 + clampedSweep / 2;

  const toneClass =
    colorMode === 'amber'
      ? 'text-amber-500'
      : colorMode === 'sky'
      ? 'text-sky-500'
      : colorMode === 'emerald'
      ? 'text-emerald-500'
      : isActiveOrHovered
      ? 'text-amber-500'
      : isLight
      ? 'text-neutral-600'
      : 'text-neutral-300';

  const effectiveOpacity = isActiveOrHovered
    ? 1
    : Math.max(0.15, Math.min(1, idleOpacity / 100));

  if (styleVariant === 'corner-dots') {
    return (
      <svg
        width={boxSize}
        height={boxSize}
        viewBox={`0 0 ${boxSize} ${boxSize}`}
        fill="currentColor"
        style={{ opacity: effectiveOpacity }}
        className={`pointer-events-none transition-all duration-150 ${toneClass}`}
      >
        <circle cx={boxSize - 4.5} cy={boxSize - 4.5} r={1.25} />
        <circle cx={boxSize - 4.5} cy={boxSize - 9} r={1.25} />
        <circle cx={boxSize - 9} cy={boxSize - 4.5} r={1.25} />
      </svg>
    );
  }

  if (styleVariant === 'corner-arc-dots') {
    const dotRadius = Math.max(1.0, strokeWidth * 0.56);
    const angles = [startDeg, 45, endDeg];
    return (
      <svg
        width={boxSize}
        height={boxSize}
        viewBox={`0 0 ${boxSize} ${boxSize}`}
        fill="currentColor"
        style={{ opacity: effectiveOpacity }}
        className={`pointer-events-none transition-all duration-150 ${toneClass}`}
      >
        {angles.map((deg, idx) => {
          const rad = (deg * Math.PI) / 180;
          const x = cx + effectiveRadius * Math.cos(rad);
          const y = cy + effectiveRadius * Math.sin(rad);
          const r = idx === 1 ? dotRadius * 1.08 : dotRadius;
          return <circle key={deg} cx={x.toFixed(2)} cy={y.toFixed(2)} r={r.toFixed(2)} />;
        })}
      </svg>
    );
  }

  if (styleVariant === 'corner-double-arc') {
    const outerPath = describeCircularArc(cx, cy, effectiveRadius, startDeg, endDeg);
    const innerStep = Math.max(2.8, strokeWidth * 1.65);
    const innerR = Math.max(3, effectiveRadius - innerStep);
    const innerSweep = Math.max(20, clampedSweep - 12);
    const innerPath = describeCircularArc(
      cx,
      cy,
      innerR,
      45 - innerSweep / 2,
      45 + innerSweep / 2
    );

    return (
      <svg
        width={boxSize}
        height={boxSize}
        viewBox={`0 0 ${boxSize} ${boxSize}`}
        fill="none"
        style={{ opacity: effectiveOpacity }}
        className={`pointer-events-none transition-all duration-150 ${toneClass}`}
      >
        <path
          d={outerPath}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <path
          d={innerPath}
          stroke="currentColor"
          strokeWidth={Math.max(1.2, strokeWidth * 0.85)}
          strokeLinecap="round"
          opacity={0.82}
        />
      </svg>
    );
  }

  if (styleVariant === 'corner-pill-arc') {
    const arcPath = describeCircularArc(cx, cy, effectiveRadius, startDeg, endDeg);
    return (
      <svg
        width={boxSize}
        height={boxSize}
        viewBox={`0 0 ${boxSize} ${boxSize}`}
        fill="none"
        style={{ opacity: effectiveOpacity }}
        className={`pointer-events-none transition-all duration-150 ${toneClass}`}
      >
        <path
          d={arcPath}
          stroke="currentColor"
          strokeWidth={strokeWidth + 3.2}
          strokeLinecap="round"
          opacity={isLight ? 0.16 : 0.22}
        />
        <path
          d={arcPath}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // Default: 'corner-arc' (Single Concentric Corner Arc Dragger)
  const arcPath = describeCircularArc(cx, cy, effectiveRadius, startDeg, endDeg);
  return (
    <svg
      width={boxSize}
      height={boxSize}
      viewBox={`0 0 ${boxSize} ${boxSize}`}
      fill="none"
      style={{ opacity: effectiveOpacity }}
      className={`pointer-events-none transition-all duration-150 ${toneClass}`}
    >
      <path
        d={arcPath}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
});

CornerCurvedDragger.displayName = 'CornerCurvedDragger';
