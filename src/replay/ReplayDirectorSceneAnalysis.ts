/**
 * ReplayDirectorSceneAnalysis.ts
 * 3D entity extraction, camera orientation angles, NDC screen-space projection,
 * and scene framing analysis for Replay Director Camera diagnostics.
 */

import { SIM_OFFSETS, CAR_STATE_STRIDE, MAX_CARS } from '../physics/RocketSimConstants.ts';
import { DEFAULT_REPLAY_DIRECTOR_FOV_DEG } from '../ui-core/config/replayDirectorConfig.ts';
import type { EmbeddedReplayDirectorTelemetry } from './ReplayFrameInterpolator.ts';
import type { ResolvedTouchLookahead } from './ReplayTouchTimelineAnalyzer.ts';

export interface CameraAnglesFromPose {
  distanceToTarget: number;
  forwardUnreal: [number, number, number];
  yawDeg: number;
  pitchDeg: number;
}

export interface ExtractedBallEntity {
  pos: [number, number, number];
  vel: [number, number, number];
  speedUu: number;
  speedKph: number;
}

export interface ExtractedCarEntity {
  carIndex: number;
  team: number;
  name?: string;
  visualId?: string;
  hitboxId?: string;
  pos: [number, number, number];
  vel: [number, number, number];
  fwd: [number, number, number];
  up: [number, number, number];
  speedUu: number;
  boost: number;
  boostPct?: number;
  onGround: boolean;
  supersonic: boolean;
  demoed: boolean;
  isBoosting: boolean;
  distToBall: number;
}

export interface ExtractedFrameEntities {
  tick: number;
  ball: ExtractedBallEntity;
  cars: ExtractedCarEntity[];
}

export interface ScreenNdcProjectionResult {
  distanceUu: number;
  viewDepthZ: number;
  inFront: boolean;
  inFrustum: boolean;
  inSafeFrame85: boolean;
  ndc: [number, number];
  screenPct: [number, number];
  viewAngleFromCenterDeg: number;
  horizOffsetDeg: number;
  vertOffsetDeg: number;
  hFovDeg: number;
  vFovDeg: number;
}

export interface CarRosterMetaLookupEntry {
  carIndex?: number;
  team?: number;
  name?: string;
  username?: string;
  visualId?: string;
  hitboxId?: string | null;
}

export function round3(val: unknown): number {
  return typeof val === 'number' && Number.isFinite(val) ? Number(val.toFixed(3)) : 0;
}

export function round4(val: unknown): number {
  return typeof val === 'number' && Number.isFinite(val) ? Number(val.toFixed(4)) : 0;
}

export function vec3Round3(x: number, y: number, z: number): [number, number, number] {
  return [round3(x), round3(y), round3(z)];
}

export function resolveEmbeddedLookahead(
  embedded: EmbeddedReplayDirectorTelemetry,
  fallbackScorerCarIndex: number
): ResolvedTouchLookahead {
  return {
    primaryCarIndex:
      embedded.activeTouchCarIndex >= 0 ? embedded.activeTouchCarIndex : fallbackScorerCarIndex,
    nextCarIndex: embedded.nextTouchCarIndex,
    nextTouchBlend: embedded.nextTouchBlend,
    nextTouchBallPos: embedded.nextTouchBallPos,
    interceptorCarIndex: embedded.interceptorCarIndex ?? -1,
    interceptorBlend: embedded.interceptorBlend ?? 0,
    postGoalElapsedSec: embedded.postGoalElapsedSec ?? 0,
    plannedPose: null,
  };
}

export function computeViewAngleToPointDeg(
  pose:
    | {
        eyeX: number;
        eyeY: number;
        eyeZ: number;
        targetX: number;
        targetY: number;
        targetZ: number;
      }
    | null
    | undefined,
  pt: ArrayLike<number> | null | undefined
): number {
  if (!pose || !pt) return 0;
  const fx = pose.targetX - pose.eyeX,
    fy = pose.targetY - pose.eyeY,
    fz = pose.targetZ - pose.eyeZ;
  const fl = Math.hypot(fx, fy, fz);
  const vx = pt[0] - pose.eyeX,
    vy = pt[1] - pose.eyeY,
    vz = pt[2] - pose.eyeZ;
  const vl = Math.hypot(vx, vy, vz);
  if (fl < 1e-4 || vl < 1e-4) return 0;
  const dot = Math.max(-1, Math.min(1, (fx * vx + fy * vy + fz * vz) / (fl * vl)));
  return round3((Math.acos(dot) * 180) / Math.PI);
}

export function computeCameraAnglesFromPose(pose: {
  eyeX?: number;
  eyeY?: number;
  eyeZ?: number;
  targetX?: number;
  targetY?: number;
  targetZ?: number;
}): CameraAnglesFromPose {
  const dx = (pose.targetX || 0) - (pose.eyeX || 0);
  const dy = (pose.targetY || 0) - (pose.eyeY || 0);
  const dz = (pose.targetZ || 0) - (pose.eyeZ || 0);
  const dist = Math.hypot(dx, dy, dz) || 1;
  const dirX = dx / dist,
    dirY = dy / dist,
    dirZ = dz / dist;
  return {
    distanceToTarget: round3(dist),
    forwardUnreal: [round4(dirX), round4(dirY), round4(dirZ)],
    yawDeg: round3((Math.atan2(dirX, dirY) * 180) / Math.PI),
    pitchDeg: round3((Math.asin(Math.max(-1, Math.min(1, dirZ))) * 180) / Math.PI),
  };
}

export function extractFrameEntities(
  snap: ArrayLike<number> | null | undefined,
  carTeamResolver?: ((carIndex: number) => number) | null,
  carEntries?: ReadonlyArray<CarRosterMetaLookupEntry> | null
): ExtractedFrameEntities {
  if (!snap || snap.length < SIM_OFFSETS.BALL + 18) {
    return { tick: 0, ball: { pos: [0, 0, 0], vel: [0, 0, 0], speedUu: 0, speedKph: 0 }, cars: [] };
  }
  const entryMap = new Map<number, CarRosterMetaLookupEntry>();
  if (Array.isArray(carEntries)) {
    for (const e of carEntries) {
      if (e && typeof e.carIndex === 'number') entryMap.set(e.carIndex, e);
    }
  }
  const tick = Math.round(snap[SIM_OFFSETS.TICK] || 0);
  const bx = snap[SIM_OFFSETS.BALL] || 0,
    by = snap[SIM_OFFSETS.BALL + 1] || 0,
    bz = snap[SIM_OFFSETS.BALL + 2] || 0;
  const bvx = snap[SIM_OFFSETS.BALL + 12] || 0,
    bvy = snap[SIM_OFFSETS.BALL + 13] || 0,
    bvz = snap[SIM_OFFSETS.BALL + 14] || 0;
  const bSpeed = Math.hypot(bvx, bvy, bvz);

  const numCars = Math.min(MAX_CARS, Math.max(0, Math.round(snap[SIM_OFFSETS.NUM_CARS] || 0)));
  const cars: ExtractedCarEntity[] = [];
  for (let c = 0; c < numCars; c++) {
    const base = SIM_OFFSETS.CARS + c * CAR_STATE_STRIDE;
    if (snap.length < base + 25) break;
    const cx = snap[base] || 0,
      cy = snap[base + 1] || 0,
      cz = snap[base + 2] || 0;
    const fx = snap[base + 3] || 0,
      fy = snap[base + 4] || 0,
      fz = snap[base + 5] || 0;
    const ux = snap[base + 9] || 0,
      uy = snap[base + 10] || 0,
      uz = snap[base + 11] || 0;
    const vx = snap[base + 12] || 0,
      vy = snap[base + 13] || 0,
      vz = snap[base + 14] || 0;
    const speedUu = Math.hypot(vx, vy, vz);
    const meta = entryMap.get(c) || null;
    const resolvedTeam =
      typeof meta?.team === 'number'
        ? meta.team
        : typeof carTeamResolver === 'function'
          ? carTeamResolver(c)
          : c % 2;
    cars.push({
      carIndex: c,
      team: resolvedTeam,
      ...(meta?.name || meta?.username ? { name: meta.name || meta.username } : {}),
      ...(meta?.visualId ? { visualId: meta.visualId } : {}),
      ...(meta?.hitboxId ? { hitboxId: meta.hitboxId } : {}),
      pos: vec3Round3(cx, cy, cz),
      vel: vec3Round3(vx, vy, vz),
      fwd: [round4(fx), round4(fy), round4(fz)],
      up: [round4(ux), round4(uy), round4(uz)],
      speedUu: round3(speedUu),
      boost: round3(snap[base + 18] || 0),
      onGround: snap[base + 19] >= 0.5,
      supersonic: snap[base + 20] >= 0.5,
      demoed: snap[base + 21] > 0,
      isBoosting: snap[base + 23] >= 0.5,
      distToBall: round3(Math.hypot(cx - bx, cy - by, cz - bz)),
    });
  }

  return {
    tick,
    ball: {
      pos: vec3Round3(bx, by, bz),
      vel: vec3Round3(bvx, bvy, bvz),
      speedUu: round3(bSpeed),
      speedKph: Math.round(bSpeed * 0.036),
    },
    cars,
  };
}

export function projectPointToCameraScreenNdc(
  eyeUnreal: ArrayLike<number>,
  forwardUnreal: ArrayLike<number>,
  fovDeg: number = DEFAULT_REPLAY_DIRECTOR_FOV_DEG,
  aspect: number = 16 / 9,
  pointUnreal: ArrayLike<number> = [0, 0, 0]
): ScreenNdcProjectionResult {
  const vx = (pointUnreal[0] ?? 0) - (eyeUnreal[0] ?? 0);
  const vy = (pointUnreal[1] ?? 0) - (eyeUnreal[1] ?? 0);
  const vz = (pointUnreal[2] ?? 0) - (eyeUnreal[2] ?? 0);
  const distUu = Math.hypot(vx, vy, vz);

  let fx = forwardUnreal[0] ?? 0,
    fy = forwardUnreal[1] ?? 1,
    fz = forwardUnreal[2] ?? 0;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl;
  fy /= fl;
  fz /= fl;

  let rx = -fy,
    ry = fx;
  const rl = Math.hypot(rx, ry);
  if (rl > 1e-4) {
    rx /= rl;
    ry /= rl;
  } else {
    rx = 1;
    ry = 0;
  }
  const horiz = Math.hypot(fx, fy) || 1e-4;
  const ux = (-fx * fz) / horiz,
    uy = (-fy * fz) / horiz,
    uz = horiz;

  const camX = vx * rx + vy * ry;
  const camY = vx * ux + vy * uy + vz * uz;
  const camZ = vx * fx + vy * fy + vz * fz;

  const hFovDeg = Math.max(10, Math.min(170, Number(fovDeg) || DEFAULT_REPLAY_DIRECTOR_FOV_DEG));
  const tanHalfFovH = Math.tan((hFovDeg * 0.5 * Math.PI) / 180) || 1;
  const tanHalfFovV = tanHalfFovH / Math.max(0.25, Number(aspect) || 16 / 9);
  const vFovDeg = (Math.atan(tanHalfFovV) * 2 * 180) / Math.PI;

  const inFront = camZ > 1.0;
  const depthForProj = Math.max(1.0, Math.abs(camZ));
  const ndcX = camX / (depthForProj * tanHalfFovH);
  const ndcY = camY / (depthForProj * tanHalfFovV);
  const inFrustum = inFront && Math.abs(ndcX) <= 1.0 && Math.abs(ndcY) <= 1.0;
  const inSafeFrame85 = inFront && Math.abs(ndcX) <= 0.85 && Math.abs(ndcY) <= 0.85;
  const cosAngle = distUu > 1e-4 ? Math.max(-1, Math.min(1, camZ / distUu)) : 1;

  return {
    distanceUu: round3(distUu),
    viewDepthZ: round3(camZ),
    inFront,
    inFrustum,
    inSafeFrame85,
    ndc: [round4(ndcX), round4(ndcY)],
    screenPct: [round3((ndcX * 0.5 + 0.5) * 100), round3((0.5 - ndcY * 0.5) * 100)],
    viewAngleFromCenterDeg: round3((Math.acos(cosAngle) * 180) / Math.PI),
    horizOffsetDeg: round3((Math.atan2(camX, depthForProj) * 180) / Math.PI),
    vertOffsetDeg: round3((Math.atan2(camY, depthForProj) * 180) / Math.PI),
    hFovDeg: round3(hFovDeg),
    vFovDeg: round3(vFovDeg),
  };
}

export interface SceneFramingSnapshotInput {
  ball?: { pos?: number[] };
  lookahead?: { activeTouchCarIndex?: number; nextTouchCarIndex?: number };
  cars?: ExtractedCarEntity[];
}

export function computeCameraSceneFramingAnalysis(
  eyeUnreal: ArrayLike<number>,
  forwardUnreal: ArrayLike<number>,
  fovDeg: number,
  aspect: number,
  snap: SceneFramingSnapshotInput | null | undefined,
  scoringTeam: number = 0
) {
  const ballPos: number[] = snap?.ball?.pos || [0, 0, 93];
  const lookahead = snap?.lookahead || {};
  const cars: ExtractedCarEntity[] = Array.isArray(snap?.cars) ? snap.cars : [];
  const focusCar =
    cars.find((c) => c.carIndex === lookahead.activeTouchCarIndex) || cars[0] || null;
  const nextCar =
    (lookahead.nextTouchCarIndex ?? -1) >= 0
      ? cars.find((c) => c.carIndex === lookahead.nextTouchCarIndex) || null
      : null;

  const goalSignY = scoringTeam === 0 ? 1.0 : -1.0;
  const goalCenterPos: [number, number, number] = [0, goalSignY * 5120.0, 321.0];
  const toGoalX = -ballPos[0];
  const toGoalY = goalSignY * Math.max(420.0, (goalSignY * 5420.0 - ballPos[1]) * goalSignY);
  const dirNorm = Math.hypot(toGoalX, toGoalY) || 1.0;
  const ugX = toGoalX / dirNorm,
    ugY = toGoalY / dirNorm,
    usX = -ugY,
    usY = ugX;

  const relBallX = eyeUnreal[0] - ballPos[0],
    relBallY = eyeUnreal[1] - ballPos[1],
    relBallZ = eyeUnreal[2] - ballPos[2];
  const backDistBehindBallUu = -(relBallX * ugX + relBallY * ugY);
  const signedLateralOffsetFromCorridorUu = relBallX * usX + relBallY * usY;
  const inferredLateralBias = signedLateralOffsetFromCorridorUu >= 0 ? 1.0 : -1.0;

  let relFocusCar: Record<string, unknown> | null = null;
  let impliedRayCarWeight: number | null = null;
  let impliedRayBallWeight: number | null = null;

  const unitTo = (pt: ArrayLike<number>): [number, number, number, number] => {
    const dx = pt[0] - eyeUnreal[0],
      dy = pt[1] - eyeUnreal[1],
      dz = pt[2] - eyeUnreal[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    return [dx / l, dy / l, dz / l, l];
  };

  const uBall = unitTo(ballPos);
  if (focusCar) {
    const cPos = focusCar.pos;
    const uCar = unitTo(cPos);
    const diffX = uCar[0] - uBall[0],
      diffY = uCar[1] - uBall[1],
      diffZ = uCar[2] - uBall[2];
    const diffSq = diffX * diffX + diffY * diffY + diffZ * diffZ;
    let rawCarWeight = 0.5;
    if (diffSq > 1e-5) {
      rawCarWeight =
        ((forwardUnreal[0] - uBall[0]) * diffX +
          (forwardUnreal[1] - uBall[1]) * diffY +
          (forwardUnreal[2] - uBall[2]) * diffZ) /
        diffSq;
    }
    impliedRayCarWeight = round4(Math.max(0, Math.min(1, rawCarWeight)));
    impliedRayBallWeight = round4(1 - impliedRayCarWeight);

    relFocusCar = {
      carIndex: focusCar.carIndex,
      team: focusCar.team,
      worldPosUnreal: cPos,
      distanceFromCameraUu: round3(uCar[3]),
      offsetFromCarUnreal: vec3Round3(
        eyeUnreal[0] - cPos[0],
        eyeUnreal[1] - cPos[1],
        eyeUnreal[2] - cPos[2]
      ),
      backDistBehindFocusCarAlongCorridorUu: round3(
        -((eyeUnreal[0] - cPos[0]) * ugX + (eyeUnreal[1] - cPos[1]) * ugY)
      ),
      carBehindBallAlongCorridorUu: round3(
        (ballPos[0] - cPos[0]) * ugX + (ballPos[1] - cPos[1]) * ugY
      ),
      carSideOfBallAlongCorridorUu: round3(
        (cPos[0] - ballPos[0]) * usX + (cPos[1] - ballPos[1]) * usY
      ),
      carToBallDistanceUu: focusCar.distToBall,
    };
  }

  const ballScreen = projectPointToCameraScreenNdc(
    eyeUnreal,
    forwardUnreal,
    fovDeg,
    aspect,
    ballPos
  );
  const focusCarScreen = focusCar
    ? projectPointToCameraScreenNdc(eyeUnreal, forwardUnreal, fovDeg, aspect, focusCar.pos)
    : null;
  const nextCarScreen = nextCar
    ? projectPointToCameraScreenNdc(eyeUnreal, forwardUnreal, fovDeg, aspect, nextCar.pos)
    : null;
  const goalCenterScreen = projectPointToCameraScreenNdc(
    eyeUnreal,
    forwardUnreal,
    fovDeg,
    aspect,
    goalCenterPos
  );

  const perCarVisibility = cars.map((c) => {
    const proj = projectPointToCameraScreenNdc(eyeUnreal, forwardUnreal, fovDeg, aspect, c.pos);
    const isNearOccluder =
      c.carIndex !== (focusCar?.carIndex ?? -1) &&
      proj.inFront &&
      proj.distanceUu < 480 &&
      proj.viewAngleFromCenterDeg < 18;
    return {
      carIndex: c.carIndex,
      team: c.team,
      isFocusCar: c.carIndex === (focusCar?.carIndex ?? -1),
      isNextTouchCar: c.carIndex === (lookahead.nextTouchCarIndex ?? -1),
      posUnreal: c.pos,
      velUnreal: c.vel,
      distToBallUu: c.distToBall,
      ...proj,
      isNearOccluder,
    };
  });

  const visibleCarIndices = perCarVisibility.filter((c) => c.inFrustum).map((c) => c.carIndex);
  const occludingCarIndices = perCarVisibility
    .filter((c) => c.isNearOccluder)
    .map((c) => c.carIndex);

  return {
    corridorDecomposition: {
      corridorForwardUnitXY: [round4(ugX), round4(ugY)] as [number, number],
      corridorLateralUnitXY: [round4(usX), round4(usY)] as [number, number],
      backDistBehindBallUu: round3(backDistBehindBallUu),
      signedLateralOffsetFromCorridorUu: round3(signedLateralOffsetFromCorridorUu),
      lateralSideDistMagnitudeUu: round3(Math.abs(signedLateralOffsetFromCorridorUu)),
      inferredLateralBias,
      heightAboveGroundUu: round3(eyeUnreal[2]),
      heightAboveBallUu: round3(relBallZ),
      distanceToGoalLineUu: round3(Math.abs(goalSignY * 5120.0 - eyeUnreal[1])),
      impliedRayCarWeight,
      impliedRayBallWeight,
    },
    relativeToBall: {
      worldPosUnreal: ballPos,
      distanceFromCameraUu: ballScreen.distanceUu,
      offsetFromBallUnreal: vec3Round3(relBallX, relBallY, relBallZ),
    },
    relativeToFocusCar: relFocusCar,
    screenComposition: {
      ball: ballScreen,
      focusCar: focusCarScreen,
      nextTouchCar: nextCarScreen,
      scoringGoalCenter: goalCenterScreen,
      visibleCarIndices,
      visibleCarCount: visibleCarIndices.length,
      occludingCarIndices,
    },
    allCarsScreenProjections: perCarVisibility,
  };
}
