import React from 'react';

export interface RetroTrapezoidKeycapProps {
  keyId: string;
  isPressed: boolean;
  sizePx: number;
  borderRadiusPx: number;
  trapezoidInsetXPct: number;
  trapezoidInsetYPct: number;
  pressShrinkXPct: number;
  pressShrinkYPct: number;
  bevelContrast: number;
  idleBgColor: string;
  pressedBgColor: string;
  onMouseDown?: () => void;
  onMouseUp?: () => void;
  onMouseLeave?: () => void;
  children?: React.ReactNode;
}

/**
 * Retro Mechanical Keycap with independent Horizontal & Vertical Trapezoid Bevel Geometry:
 * - Unpressed (Outward Convex / Raised):
 *   Top & Left trapezoids are bright specular lit; Bottom & Right trapezoids are dark shaded.
 * - Pressed (Inward Concave / Sunken):
 *   Top & Left trapezoids invert to deep inset shadows; Bottom & Right catch subtle rim light;
 *   inner top face contracts inward by `(trapezoidInsetXPct + pressShrinkXPct)` horizontally
 *   and `(trapezoidInsetYPct + pressShrinkYPct)` vertically.
 */
export const RetroTrapezoidKeycap: React.FC<RetroTrapezoidKeycapProps> = React.memo(
  ({
    keyId,
    isPressed,
    sizePx,
    borderRadiusPx,
    trapezoidInsetXPct,
    trapezoidInsetYPct,
    pressShrinkXPct,
    pressShrinkYPct,
    bevelContrast,
    idleBgColor,
    pressedBgColor,
    onMouseDown,
    onMouseUp,
    onMouseLeave,
    children,
  }) => {
    const ix = Math.max(
      0,
      Math.min(46, trapezoidInsetXPct + (isPressed ? pressShrinkXPct : 0))
    );
    const iy = Math.max(
      0,
      Math.min(46, trapezoidInsetYPct + (isPressed ? pressShrinkYPct : 0))
    );

    const x0 = ix;
    const x1 = 100 - ix;
    const y0 = iy;
    const y1 = 100 - iy;

    const c = Math.max(0, Math.min(1, bevelContrast));
    const faceColor = isPressed ? pressedBgColor : idleBgColor;

    // Convex raised when idle vs Concave sunken when pressed
    const topTrapOverlay = isPressed
      ? `rgba(0, 0, 0, ${(0.58 * c).toFixed(3)})`
      : `rgba(255, 255, 255, ${(0.38 * c).toFixed(3)})`;
    const leftTrapOverlay = isPressed
      ? `rgba(0, 0, 0, ${(0.44 * c).toFixed(3)})`
      : `rgba(255, 255, 255, ${(0.24 * c).toFixed(3)})`;
    const rightTrapOverlay = isPressed
      ? `rgba(255, 255, 255, ${(0.12 * c).toFixed(3)})`
      : `rgba(0, 0, 0, ${(0.34 * c).toFixed(3)})`;
    const bottomTrapOverlay = isPressed
      ? `rgba(255, 255, 255, ${(0.2 * c).toFixed(3)})`
      : `rgba(0, 0, 0, ${(0.5 * c).toFixed(3)})`;

    const clampedRadius = Math.max(0, Math.min(sizePx * 0.48, borderRadiusPx));
    const innerRadius = Math.max(
      0,
      clampedRadius * (1 - Math.max(ix, iy) / 100)
    );

    return (
      <div
        data-keycap-id={keyId}
        data-keycap-pressed={isPressed ? 'true' : 'false'}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        className="relative overflow-hidden select-none cursor-pointer transition-colors duration-75"
        style={{
          width: `${sizePx}px`,
          height: `${sizePx}px`,
          borderRadius: `${clampedRadius}px`,
          backgroundColor: faceColor,
          boxShadow: isPressed
            ? `inset 0 2px 5px rgba(0,0,0,${(0.65 * c).toFixed(2)}), 0 0 0 1px rgba(0,0,0,0.55)`
            : `0 2px 4px rgba(0,0,0,${(0.45 * c).toFixed(2)}), 0 0 0 1px rgba(0,0,0,0.45)`,
        }}
      >
        {/* 4 Trapezoid Bevel Slopes rendered in SVG 0..100 coordinate space */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          {/* Top Trapezoid */}
          <polygon
            points={`0,0 100,0 ${x1},${y0} ${x0},${y0}`}
            fill={topTrapOverlay}
          />
          {/* Left Trapezoid */}
          <polygon
            points={`0,0 ${x0},${y0} ${x0},${y1} 0,100`}
            fill={leftTrapOverlay}
          />
          {/* Right Trapezoid */}
          <polygon
            points={`100,0 100,100 ${x1},${y1} ${x1},${y0}`}
            fill={rightTrapOverlay}
          />
          {/* Bottom Trapezoid */}
          <polygon
            points={`0,100 ${x0},${y1} ${x1},${y1} 100,100`}
            fill={bottomTrapOverlay}
          />
          {/* Diagonal miter lines at the 4 corners */}
          <line
            x1="0"
            y1="0"
            x2={x0}
            y2={y0}
            stroke={`rgba(0,0,0,${(0.28 * c).toFixed(2)})`}
            strokeWidth="0.9"
          />
          <line
            x1="100"
            y1="0"
            x2={x1}
            y2={y0}
            stroke={`rgba(0,0,0,${(0.28 * c).toFixed(2)})`}
            strokeWidth="0.9"
          />
          <line
            x1="0"
            y1="100"
            x2={x0}
            y2={y1}
            stroke={`rgba(0,0,0,${(0.28 * c).toFixed(2)})`}
            strokeWidth="0.9"
          />
          <line
            x1="100"
            y1="100"
            x2={x1}
            y2={y1}
            stroke={`rgba(0,0,0,${(0.28 * c).toFixed(2)})`}
            strokeWidth="0.9"
          />
        </svg>

        {/* Inner Keycap Plateau / Dish */}
        <div
          className="absolute flex items-center justify-center pointer-events-none"
          style={{
            left: `${x0}%`,
            top: `${y0}%`,
            width: `${Math.max(8, x1 - x0)}%`,
            height: `${Math.max(8, y1 - y0)}%`,
            borderRadius: `${innerRadius.toFixed(1)}px`,
            backgroundColor: faceColor,
            boxShadow: isPressed
              ? `inset 0 1px 3px rgba(0,0,0,${(0.45 * c).toFixed(2)}), 0 0 0 1px rgba(0,0,0,${(0.35 * c).toFixed(2)})`
              : `inset 0 1px 0 rgba(255,255,255,${(0.32 * c).toFixed(2)}), 0 0 0 1px rgba(0,0,0,${(0.25 * c).toFixed(2)})`,
          }}
        >
          {/* Keycap Center Graphic (Icon or 3D Arrow) */}
          <div
            className="w-[74%] h-[74%] flex items-center justify-center"
            style={{
              transform: isPressed ? 'translateY(0.5px) scale(0.95)' : 'none',
            }}
          >
            {children}
          </div>
        </div>
      </div>
    );
  }
);

RetroTrapezoidKeycap.displayName = 'RetroTrapezoidKeycap';
export default RetroTrapezoidKeycap;
