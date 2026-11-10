/**
 * replayDirectorElevationPipeline.ts
 * Pure mathematical solvers for Goal Replay Director Camera:
 * 1. Multi-bounce vertical trajectory envelope & valley bridging (eliminates head-nodding on bouncing balls).
 * 2. Car-grounded action-plane adaptive camera elevation & non-upward-pitch enforcement.
 * 3. Initial play-corridor basis & balanced open-interior lateral side-bias resolution.
 */

export interface BounceBridgedBallTrajectory {
  gazeEnvelopeZ: Float64Array;
  eyeEnvelopeZ: Float64Array;
  bouncePullbackUu: Float64Array;
  bounceTroughIndices: number[];
}

export interface BalancedLateralBiasInput {
  goalIdx: number;
  lastScoreTouchFrame: number;
  holdTicks: number;
  wxAxis: number;
  wyAxis: number;
  sbx: Float64Array;
  sby: Float64Array;
  smScx: Float64Array;
  smScy: Float64Array;
}

export interface InitialCorridorAndBiasResult {
  ux: number;
  uy: number;
  wxAxis: number;
  wyAxis: number;
  openSideX: number;
  resolvedLateralBias: number;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
}

export function wrapAngleDeltaDeg(a: number, b: number): number {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export function smooth1DZeroPhase(
  arr: ArrayLike<number> | null | undefined,
  alpha: number,
  passes: number = 2
): Float64Array {
  if (!arr || typeof arr.length !== 'number') return new Float64Array(0);
  const n = arr.length;
  if (n <= 1) return new Float64Array(arr);
  const cur = new Float64Array(arr);
  const nxt = new Float64Array(n);
  const a = clamp(alpha, 0.005, 0.99);
  for (let p = 0; p < passes; p++) {
    nxt[0] = cur[0];
    for (let i = 1; i < n; i++) {
      nxt[i] = nxt[i - 1] + (cur[i] - nxt[i - 1]) * a;
    }
    cur[n - 1] = nxt[n - 1];
    for (let i = n - 2; i >= 0; i--) {
      cur[i] = cur[i + 1] + (nxt[i] - cur[i + 1]) * a;
    }
  }
  return cur;
}

export function smoothTrajectoryWithVelocityCap(
  rawX: Float64Array,
  rawY: Float64Array,
  rawZ: Float64Array,
  maxStepUu: number = 16.5,
  alpha: number = 0.13,
  passes: number = 2
): { eyeX: Float64Array; eyeY: Float64Array; eyeZ: Float64Array } {
  const n = rawX.length;
  if (n === 0) {
    return { eyeX: new Float64Array(0), eyeY: new Float64Array(0), eyeZ: new Float64Array(0) };
  }

  const sx = smooth1DZeroPhase(rawX, alpha, passes);
  const sy = smooth1DZeroPhase(rawY, alpha, passes);
  const sz = smooth1DZeroPhase(rawZ, alpha, passes);

  const fwdX = new Float64Array(n),
    fwdY = new Float64Array(n),
    fwdZ = new Float64Array(n);
  fwdX[0] = sx[0];
  fwdY[0] = sy[0];
  fwdZ[0] = sz[0];
  for (let i = 1; i < n; i++) {
    const dx = sx[i] - fwdX[i - 1],
      dy = sy[i] - fwdY[i - 1],
      dz = sz[i] - fwdZ[i - 1];
    const dist = Math.hypot(dx, dy, dz);
    if (dist > maxStepUu && dist > 1e-6) {
      const s = maxStepUu / dist;
      fwdX[i] = fwdX[i - 1] + dx * s;
      fwdY[i] = fwdY[i - 1] + dy * s;
      fwdZ[i] = fwdZ[i - 1] + dz * s;
    } else {
      fwdX[i] = sx[i];
      fwdY[i] = sy[i];
      fwdZ[i] = sz[i];
    }
  }

  const bwdX = new Float64Array(n),
    bwdY = new Float64Array(n),
    bwdZ = new Float64Array(n);
  bwdX[n - 1] = sx[n - 1];
  bwdY[n - 1] = sy[n - 1];
  bwdZ[n - 1] = sz[n - 1];
  for (let i = n - 2; i >= 0; i--) {
    const dx = sx[i] - bwdX[i + 1],
      dy = sy[i] - bwdY[i + 1],
      dz = sz[i] - bwdZ[i + 1];
    const dist = Math.hypot(dx, dy, dz);
    if (dist > maxStepUu && dist > 1e-6) {
      const s = maxStepUu / dist;
      bwdX[i] = bwdX[i + 1] + dx * s;
      bwdY[i] = bwdY[i + 1] + dy * s;
      bwdZ[i] = bwdZ[i + 1] + dz * s;
    } else {
      bwdX[i] = sx[i];
      bwdY[i] = sy[i];
      bwdZ[i] = sz[i];
    }
  }

  const midX = new Float64Array(n),
    midY = new Float64Array(n),
    midZ = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    midX[i] = 0.5 * (fwdX[i] + bwdX[i]);
    midY[i] = 0.5 * (fwdY[i] + bwdY[i]);
    midZ[i] = 0.5 * (fwdZ[i] + bwdZ[i]);
  }

  const polAlpha = Math.min(0.16, alpha * 1.15);
  const polX = smooth1DZeroPhase(midX, polAlpha, 2);
  const polY = smooth1DZeroPhase(midY, polAlpha, 2);
  const polZ = smooth1DZeroPhase(midZ, polAlpha, 2);

  const eyeX = new Float64Array(n),
    eyeY = new Float64Array(n),
    eyeZ = new Float64Array(n);
  const firstClamped = clampPositionInsideArena(polX[0], polY[0], polZ[0]);
  eyeX[0] = firstClamped.x;
  eyeY[0] = firstClamped.y;
  eyeZ[0] = firstClamped.z;

  for (let i = 1; i < n; i++) {
    const cl = clampPositionInsideArena(polX[i], polY[i], polZ[i]);
    const dx = cl.x - eyeX[i - 1],
      dy = cl.y - eyeY[i - 1],
      dz = cl.z - eyeZ[i - 1];
    const dist = Math.hypot(dx, dy, dz);
    if (dist > maxStepUu && dist > 1e-6) {
      const s = maxStepUu / dist;
      const capped = clampPositionInsideArena(
        eyeX[i - 1] + dx * s,
        eyeY[i - 1] + dy * s,
        eyeZ[i - 1] + dz * s
      );
      eyeX[i] = capped.x;
      eyeY[i] = capped.y;
      eyeZ[i] = capped.z;
    } else {
      eyeX[i] = cl.x;
      eyeY[i] = cl.y;
      eyeZ[i] = cl.z;
    }
  }

  return { eyeX, eyeY, eyeZ };
}

export function computeAdaptiveDirectorEyeHeight(
  activeCarZ: number,
  baseHeightUu: number = 218.0,
  aerialSlope: number = 0.78,
  ballZ: number = 0.0
): number {
  const effectiveBallZ = ballZ > 0 ? ballZ : activeCarZ;
  const aerialW = smoothstep(85.0, 360.0, activeCarZ);
  const ceilingBallLift = Math.max(0.0, effectiveBallZ - 1050.0) * 0.24;
  const groundZ = Math.max(195.0, baseHeightUu) + effectiveBallZ * 0.035 + ceilingBallLift;
  const slope = clamp(aerialSlope, 0.45, 0.92);
  const aerialZ = 75.0 + activeCarZ * slope + effectiveBallZ * 0.14;
  return clamp(groundZ * (1.0 - aerialW) + aerialZ * aerialW, 195.0, 1240.0);
}

export function clampPositionInsideArena(
  rawX: number,
  rawY: number,
  rawZ: number
): { x: number; y: number; z: number } {
  const z = clamp(rawZ, 145.0, 1840.0);
  const roofBevelInset = Math.max(0.0, z - 1500.0) * 0.65;
  const maxX = 3720.0 - roofBevelInset;
  let x = clamp(rawX, -maxX, maxX);

  const goalPostCorridorW = 1.0 - smoothstep(920.0, 1480.0, Math.abs(x));
  const maxY = 4780.0 - goalPostCorridorW * 120.0 - roofBevelInset;
  let y = clamp(rawY, -maxY, maxY);

  const maxManhattan = 7450.0 - roofBevelInset * 1.2;
  const manhattan = Math.abs(x) + Math.abs(y);
  if (manhattan > maxManhattan) {
    const scale = maxManhattan / manhattan;
    x *= scale;
    y *= scale;
  }

  return { x, y, z };
}

export function clampNonUpwardDirectorRay(
  dx: number,
  dy: number,
  dz: number,
  maxUpwardSlope: number = 0.0
): [number, number, number] {
  const horiz = Math.hypot(dx, dy) || 1e-4;
  const clampedDz = Math.min(dz, horiz * maxUpwardSlope);
  const norm = Math.hypot(dx, dy, clampedDz) || 1.0;
  return [dx / norm, dy / norm, clampedDz / norm];
}

export function computeBounceBridgedBallTrajectory(
  bzArr: Float64Array,
  bvzArr: Float64Array,
  goalIdx: number
): BounceBridgedBallTrajectory {
  const n = bzArr.length;
  if (n === 0) {
    return {
      gazeEnvelopeZ: new Float64Array(0),
      eyeEnvelopeZ: new Float64Array(0),
      bouncePullbackUu: new Float64Array(0),
      bounceTroughIndices: [],
    };
  }

  const sbz = smooth1DZeroPhase(bzArr, 0.16, 2);
  const limit = Math.min(n - 1, Math.max(0, goalIdx));

  const bounceTroughIndices: number[] = [];
  for (let i = 2; i <= limit; i++) {
    const prevZ = bzArr[i - 1],
      currZ = bzArr[i],
      nextZ = bzArr[Math.min(n - 1, i + 1)];
    if (!(currZ <= prevZ && currZ <= nextZ)) continue;

    const vzBefore = bvzArr[Math.max(0, i - 1)] || (currZ - bzArr[Math.max(0, i - 2)]) * 60.0;
    const vzAfter =
      bvzArr[Math.min(n - 1, i + 1)] || (bzArr[Math.min(n - 1, i + 2)] - currZ) * 60.0;
    if (currZ < 320.0 && vzAfter - vzBefore > 95.0 && vzBefore < -55.0) {
      if (
        bounceTroughIndices.length === 0 ||
        i - bounceTroughIndices[bounceTroughIndices.length - 1] > 14
      ) {
        bounceTroughIndices.push(i);
      }
    }
  }

  const bridged = new Float64Array(sbz);
  const bouncePullbackUu = new Float64Array(n);
  for (let tIdx = 0; tIdx < bounceTroughIndices.length; tIdx++) {
    const b = bounceTroughIndices[tIdx];
    const left = Math.max(0, b - 24),
      right = Math.min(limit, b + 24);
    const zLeft = sbz[left],
      zRight = sbz[right],
      span = Math.max(1, right - left);
    for (let i = left; i <= right; i++) {
      const u = (i - left) / span;
      const chordZ = zLeft + (zRight - zLeft) * u;
      const w = Math.sin(u * Math.PI) * 0.45;
      const softZ = sbz[i] * (1.0 - w) + chordZ * w;
      if (softZ > bridged[i]) {
        bridged[i] = softZ;
        bouncePullbackUu[i] = Math.min(140.0, (softZ - sbz[i]) * 0.25);
      }
    }
  }

  const gazeEnvelopeZ = smooth1DZeroPhase(bridged, 0.14, 2);
  return {
    gazeEnvelopeZ,
    eyeEnvelopeZ: new Float64Array(gazeEnvelopeZ),
    bouncePullbackUu: smooth1DZeroPhase(bouncePullbackUu, 0.1, 2),
    bounceTroughIndices,
  };
}

export function resolveBalancedLateralBias({
  goalIdx,
  lastScoreTouchFrame,
  holdTicks,
  wxAxis,
  wyAxis,
  sbx,
  sby,
  smScx,
  smScy,
}: BalancedLateralBiasInput): number {
  const touchEnd = Math.min(goalIdx, Math.max(0, lastScoreTouchFrame + holdTicks));
  let sumWeight = 0,
    sumBallX = 0,
    sumCarRelV = 0;

  for (let i = 0; i <= goalIdx; i++) {
    const w = i <= touchEnd ? 4.0 : 1.0;
    sumWeight += w;
    sumBallX += sbx[i] * w;
    if (i <= touchEnd) {
      const bv = sbx[i] * wxAxis + sby[i] * wyAxis;
      const sv = smScx[i] * wxAxis + smScy[i] * wyAxis;
      sumCarRelV += (sv - bv) * w;
    }
  }

  const meanBallX = sumWeight > 0 ? sumBallX / sumWeight : 0;
  const interiorBiasV = -meanBallX * wxAxis;
  const offCenterW = smoothstep(320.0, 950.0, Math.abs(meanBallX));
  const carApproachV = sumWeight > 0 ? sumCarRelV / sumWeight : 0;
  const combinedV =
    interiorBiasV * (0.35 + 0.65 * offCenterW) + carApproachV * 0.25 * (1.0 - offCenterW);

  if (Math.abs(combinedV) > 1e-3) {
    return combinedV >= 0 ? 1.0 : -1.0;
  }
  const openCarV =
    ((smScx[0] ?? 0) - (sbx[0] ?? 0)) * wxAxis + ((smScy[0] ?? 0) - (sby[0] ?? 0)) * wyAxis;
  return openCarV >= 0 ? 1.0 : -1.0;
}

export function resolveInitialCorridorAndLateralBias(params: {
  goalIdx: number;
  goalY: number;
  goalSignY: number;
  lastScoreTouchFrame: number;
  holdTicks: number;
  sbx: Float64Array;
  sby: Float64Array;
  smScx: Float64Array;
  smScy: Float64Array;
}): InitialCorridorAndBiasResult {
  const { goalIdx, goalY, goalSignY, lastScoreTouchFrame, holdTicks, sbx, sby, smScx, smScy } =
    params;
  let sumStartX = 0,
    sumStartY = 0;
  const startWindow = Math.min(goalIdx + 1, 90);
  for (let i = 0; i < startWindow; i++) {
    sumStartX += 0.5 * (sbx[i] + smScx[i]);
    sumStartY += 0.5 * (sby[i] + smScy[i]);
  }
  const startX = sumStartX / Math.max(1, startWindow);
  const startY = sumStartY / Math.max(1, startWindow);

  let ux = (0.0 - startX) * 0.36;
  let uy = goalY - startY;
  if (uy * goalSignY < 600.0) uy = goalSignY * 1800.0;
  const uNorm = Math.hypot(ux, uy) || 1.0;
  ux /= uNorm;
  uy /= uNorm;
  const wxAxis = -uy;
  const wyAxis = ux;

  const resolvedLateralBias = resolveBalancedLateralBias({
    goalIdx,
    lastScoreTouchFrame,
    holdTicks,
    wxAxis,
    wyAxis,
    sbx,
    sby,
    smScx,
    smScy,
  });

  let sumBallX = 0;
  for (let i = 0; i <= goalIdx; i++) sumBallX += sbx[i];
  const openSideX = sumBallX / Math.max(1, goalIdx + 1) >= 0 ? -1.0 : 1.0;

  return { ux, uy, wxAxis, wyAxis, openSideX, resolvedLateralBias };
}
