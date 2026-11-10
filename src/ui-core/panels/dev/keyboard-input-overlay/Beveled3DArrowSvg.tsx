import React from 'react';
import type { CameraSpaceVec3 } from '../../../config/keyboardInputOverlayTelemetry';

export interface Beveled3DArrowSvgProps {
  /** Rotation angle in degrees (0 = pointing Up, 90 = pointing Right, 180 = Down, -90 = Left) */
  angleDeg: number;
  /** Optional 3D unit direction vector in camera view space [vx, vy, vz] (+x=right, +y=up, +z=out of screen, -z=into screen) */
  dir3d?: CameraSpaceVec3;
  /** Additional 2D rotation offset in degrees */
  rotationOffsetDeg?: number;
  /** Primary face color of the arrow (hex or CSS color) */
  color: string;
  /** Scale multiplier inside the keycap (unclamped for developer tuning, default 1.35) */
  scale?: number;
  /** 3D extrusion depth in SVG viewBox units (unclamped for developer tuning, default 1) */
  extrudeDepth?: number;
  /** Shadow / bevel contrast strength (default 0.4) */
  shadowIntensity?: number;
  /** Whether the parent keycap is currently pressed */
  isPressed?: boolean;
}

// Canonical 7-vertex blocky arrow contour in local (x, u) where +u points toward tip:
// 0: Tip (0, 8.5)
// 1: Right Wing Outer (5.6, 1.5)
// 2: Right Shaft Top (2.6, 1.5)
// 3: Right Shaft Base (2.6, -7.5)
// 4: Left Shaft Base (-2.6, -7.5)
// 5: Left Shaft Top (-2.6, 1.5)
// 6: Left Wing Outer (-5.6, 1.5)
const BASE_CONTOUR_2D: ReadonlyArray<readonly [number, number]> = [
  [0, 8.5],
  [5.6, 1.5],
  [2.6, 1.5],
  [2.6, -7.5],
  [-2.6, -7.5],
  [-2.6, 1.5],
  [-5.6, 1.5],
];

// Outward 2D edge normals (nx, nu) for each of the 7 perimeter walls (i -> (i+1)%7)
const EDGE_NORMALS_2D: ReadonlyArray<readonly [number, number]> = [
  [0.781, 0.625], // 0->1 Right tip slope
  [0, -1], // 1->2 Right wing underside
  [1, 0], // 2->3 Right shaft wall
  [0, -1], // 3->4 Shaft base / tail cap
  [-1, 0], // 4->5 Left shaft wall
  [0, -1], // 5->6 Left wing underside
  [-0.781, 0.625], // 6->0 Left tip slope
];

interface ProjectedFace {
  key: string;
  points: string;
  avgZ: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
}

function shadeHexOrColor(baseColor: string, brightnessDelta: number, shadowAlpha: number): string {
  const hex = baseColor.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const factor = 1 + brightnessDelta * (0.35 + shadowAlpha * 0.45);
    const nr = Math.max(0, Math.min(255, Math.round(r * factor)));
    const ng = Math.max(0, Math.min(255, Math.round(g * factor)));
    const nb = Math.max(0, Math.min(255, Math.round(b * factor)));
    return `rgb(${nr}, ${ng}, ${nb})`;
  }
  return baseColor;
}

/**
 * True 3D Extruded Blocky Arrow rendered in SVG with 3D perspective & painter's algorithm.
 * Rotates in full 3D camera space (including pointing into the screen -Z and out of the screen +Z).
 */
export const Beveled3DArrowSvg: React.FC<Beveled3DArrowSvgProps> = React.memo(
  ({
    angleDeg,
    dir3d,
    rotationOffsetDeg = 0,
    color,
    scale = 1.35,
    extrudeDepth = 1,
    shadowIntensity = 0.4,
    isPressed = false,
  }) => {
    const effScale = Number.isFinite(scale) ? Math.max(0, scale) : 1.35;
    if (effScale <= 0) return null;

    const rawDepth = Number.isFinite(extrudeDepth) ? Math.max(0, extrudeDepth) : 1;
    const halfZ = rawDepth * 1.65 * (isPressed ? 0.72 : 1.0);
    const shadowAlpha = Number.isFinite(shadowIntensity)
      ? Math.max(0, Math.min(1, shadowIntensity))
      : 0.4;

    // Resolve 3D unit vector in camera view space (+X = right, +Y = up, +Z = out of screen)
    const vz = dir3d ? Math.max(-1, Math.min(1, dir3d[2])) : 0;
    const rho = Math.sqrt(Math.max(0, 1 - vz * vz));
    const baseAngleDeg =
      dir3d && (dir3d[0] * dir3d[0] + dir3d[1] * dir3d[1] > 1e-6)
        ? (Math.atan2(dir3d[0], dir3d[1]) * 180) / Math.PI
        : angleDeg;
    const totalAngleRad = ((baseAngleDeg + rotationOffsetDeg) * Math.PI) / 180;
    const sinA = Math.sin(totalAngleRad);
    const cosA = Math.cos(totalAngleRad);

    // Project a local 3D point (x, u, z) into 2D SVG coordinates + camera depth Zc
    const projectPoint = (x: number, u: number, z: number): { sx: number; sy: number; zc: number } => {
      const xc = x * cosA + (u * rho - z * vz) * sinA;
      const yc = -x * sinA + (u * rho - z * vz) * cosA;
      const zc = u * vz + z * rho;

      const persp = 1 / (1 - Math.max(-20, Math.min(20, zc)) / 36);
      // Subtle oblique offset so 3D extrusion bevels remain visible even when flat in screen plane (vz = 0)
      const obliqueX = -z * 0.34;
      const obliqueY = -z * 0.48;

      return {
        sx: xc * persp + obliqueX,
        sy: -yc * persp + obliqueY,
        zc,
      };
    };

    const topVerts = BASE_CONTOUR_2D.map(([x, u]) => projectPoint(x, u, halfZ));
    const botVerts = BASE_CONTOUR_2D.map(([x, u]) => projectPoint(x, u, -halfZ));

    const fmtPts = (pts: ReadonlyArray<{ sx: number; sy: number }>) =>
      pts.map((p) => `${p.sx.toFixed(2)},${p.sy.toFixed(2)}`).join(' ');

    const faces: ProjectedFace[] = [];
    const strokeCol = `rgba(8, 10, 16, ${(0.35 + shadowAlpha * 0.55).toFixed(3)})`;

    // 1. Top Cap (+halfZ) & Bottom Cap (-halfZ)
    const topAvgZ = topVerts.reduce((acc, v) => acc + v.zc, 0) / topVerts.length;
    const botAvgZ = botVerts.reduce((acc, v) => acc + v.zc, 0) / botVerts.length;

    // Normal of +z cap in camera space is (-vz*sinA, -vz*cosA, rho)
    // Light source from top-left-front: L = (-0.38, 0.52, 0.76)
    const topLightDot = -vz * sinA * -0.38 + -vz * cosA * 0.52 + rho * 0.76;
    const botLightDot = -topLightDot;

    faces.push({
      key: 'cap-top',
      points: fmtPts(topVerts),
      avgZ: topAvgZ + 0.05,
      fill: shadeHexOrColor(color, topLightDot * 0.25, shadowAlpha),
      stroke: strokeCol,
      strokeWidth: 0.75,
    });

    if (halfZ > 0.02) {
      faces.push({
        key: 'cap-bot',
        points: fmtPts(botVerts),
        avgZ: botAvgZ - 0.05,
        fill: shadeHexOrColor(color, botLightDot * 0.45 - 0.35, shadowAlpha),
        stroke: strokeCol,
        strokeWidth: 0.75,
      });

      // 2. 7 Side Walls connecting Top Cap & Bottom Cap
      for (let i = 0; i < BASE_CONTOUR_2D.length; i++) {
        const next = (i + 1) % BASE_CONTOUR_2D.length;
        const quad = [topVerts[i], topVerts[next], botVerts[next], botVerts[i]];
        const avgZ = (quad[0].zc + quad[1].zc + quad[2].zc + quad[3].zc) * 0.25;

        const [nx, nu] = EDGE_NORMALS_2D[i];
        // Transform 2D edge normal (nx, nu, 0) into 3D camera view space
        const wnx = nx * cosA + nu * rho * sinA;
        const wny = -nx * sinA + nu * rho * cosA;
        const wnz = nu * vz;
        const wallLight = wnx * -0.38 + wny * 0.52 + wnz * 0.76;

        faces.push({
          key: `wall-${i}`,
          points: fmtPts(quad),
          avgZ,
          fill: shadeHexOrColor(color, wallLight * 0.55 - 0.18, shadowAlpha),
          stroke: strokeCol,
          strokeWidth: 0.65,
        });
      }
    }

    // Painter's sort back-to-front by average Zc in camera space
    faces.sort((a, b) => a.avgZ - b.avgZ);

    const highlightAlpha = Math.max(0, Math.min(0.9, shadowAlpha * 0.65));
    const frontCapVerts = topAvgZ >= botAvgZ ? topVerts : botVerts;

    return (
      <svg
        viewBox="-16 -16 32 32"
        className="w-full h-full overflow-visible pointer-events-none select-none"
        style={{
          transform: `scale(${effScale.toFixed(3)})`,
          filter:
            shadowAlpha > 0.02
              ? `drop-shadow(0px ${(1.6 * shadowAlpha).toFixed(1)}px ${(2.4 * shadowAlpha).toFixed(1)}px rgba(0,0,0,${(shadowAlpha * 0.72).toFixed(2)}))`
              : undefined,
        }}
      >
        {faces.map((f) => (
          <polygon
            key={f.key}
            points={f.points}
            fill={f.fill}
            stroke={f.stroke}
            strokeWidth={f.strokeWidth}
            strokeLinejoin="round"
          />
        ))}

        {/* Specular highlight ridge on the visible front-most cap's arrowhead */}
        {highlightAlpha > 0.02 && (
          <polyline
            points={`${frontCapVerts[6].sx.toFixed(2)},${frontCapVerts[6].sy.toFixed(2)} ${frontCapVerts[0].sx.toFixed(2)},${frontCapVerts[0].sy.toFixed(2)} ${frontCapVerts[1].sx.toFixed(2)},${frontCapVerts[1].sy.toFixed(2)}`}
            fill="none"
            stroke={`rgba(255, 255, 255, ${highlightAlpha.toFixed(3)})`}
            strokeWidth="0.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    );
  }
);

Beveled3DArrowSvg.displayName = 'Beveled3DArrowSvg';
export default Beveled3DArrowSvg;
