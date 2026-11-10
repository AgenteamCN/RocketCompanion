/**
 * boostPadGeometry.ts
 * Pure symmetry and orientation angle calculation helpers for Rocket League's 34 boost pads (6 Big + 28 Small).
 */

export const NUM_BOOST_PADS = 34;
export const NUM_BIG_PADS = 6;
export const NUM_SMALL_PADS = 28;

export interface BoostPadRotationGroups {
  rotBigMid: number;
  rotBigCorner: number;
  rotSmallAxisY0: number;
  rotSmallAxisY1: number;
  rotSmallAxisY2: number;
  rotSmallAxisX0: number;
  rotSmallQuadA: number;
  rotSmallQuadB: number;
  rotSmallQuadC: number;
  rotSmallQuadD: number;
  rotSmallQuadE: number;
}

export const DEFAULT_ROTATION_GROUPS: Readonly<BoostPadRotationGroups> = Object.freeze({
  rotBigMid: 0,
  rotBigCorner: 45,
  rotSmallAxisY0: 0,
  rotSmallAxisY1: 0,
  rotSmallAxisY2: 0,
  rotSmallAxisX0: 90,
  rotSmallQuadA: 30,
  rotSmallQuadB: -30,
  rotSmallQuadC: 0,
  rotSmallQuadD: 45,
  rotSmallQuadE: -45,
});

export function computeAllPadRotations(
  groups: Partial<BoostPadRotationGroups> = DEFAULT_ROTATION_GROUPS
): number[] {
  const g: BoostPadRotationGroups = { ...DEFAULT_ROTATION_GROUPS, ...groups };
  const angles: number[] = new Array(34).fill(0);

  // Big Pads (0 to 5)
  angles[0] = g.rotBigMid;
  angles[1] = (g.rotBigMid + 180) % 360;
  angles[2] = g.rotBigCorner;
  angles[3] = (-g.rotBigCorner + 360) % 360;
  angles[4] = (180 - g.rotBigCorner + 360) % 360;
  angles[5] = (g.rotBigCorner + 180) % 360;

  // Small Pads (6 to 33)
  angles[6] = g.rotSmallAxisY0;
  angles[33] = (g.rotSmallAxisY0 + 180) % 360;

  angles[11] = g.rotSmallAxisY1;
  angles[28] = (g.rotSmallAxisY1 + 180) % 360;

  angles[17] = g.rotSmallAxisY2;
  angles[22] = (g.rotSmallAxisY2 + 180) % 360;

  angles[19] = g.rotSmallAxisX0;
  angles[20] = (g.rotSmallAxisX0 + 180) % 360;

  angles[7] = g.rotSmallQuadA;
  angles[8] = (-g.rotSmallQuadA + 360) % 360;
  angles[31] = (180 - g.rotSmallQuadA + 360) % 360;
  angles[32] = (g.rotSmallQuadA + 180) % 360;

  angles[9] = g.rotSmallQuadB;
  angles[10] = (-g.rotSmallQuadB + 360) % 360;
  angles[29] = (180 - g.rotSmallQuadB + 360) % 360;
  angles[30] = (g.rotSmallQuadB + 180) % 360;

  angles[12] = g.rotSmallQuadC;
  angles[13] = (-g.rotSmallQuadC + 360) % 360;
  angles[26] = (180 - g.rotSmallQuadC + 360) % 360;
  angles[27] = (g.rotSmallQuadC + 180) % 360;

  angles[14] = g.rotSmallQuadD;
  angles[15] = (-g.rotSmallQuadD + 360) % 360;
  angles[24] = (180 - g.rotSmallQuadD + 360) % 360;
  angles[25] = (g.rotSmallQuadD + 180) % 360;

  angles[16] = g.rotSmallQuadE;
  angles[18] = (-g.rotSmallQuadE + 360) % 360;
  angles[21] = (180 - g.rotSmallQuadE + 360) % 360;
  angles[23] = (g.rotSmallQuadE + 180) % 360;

  return angles;
}

export function exportRotationsAsCode(angles: number[]): string {
  const formatted = angles
    .map((a: number, i: number) => `  /* Pad ${String(i).padStart(2, ' ')} */ ${Number(a).toFixed(1)}`)
    .join(',\n');
  return `/**
 * Pre-computed Boost Pad Orientation Angles (Degrees)
 * 34 pads (0-5: Big 100-boost, 6-33: Small 12-boost)
 */
export const BOOST_PAD_ROTATIONS = Object.freeze([
${formatted}
]);
`;
}
