/**
 * staticTrainingVariationMath.ts
 * Applies BakkesMod / Kevpert training variations and quick overrides to a
 * StaticTrainingShotConfig, and converts EditorFreeCam between Rocket League UE3
 * and Three.js FreeCameraController coordinates.
 */

import {
  CAR_GROUND_MIN_Z,
  BALL_GROUND_MIN_Z,
  ARENA_MAX_X,
  ARENA_MAX_Y,
  ARENA_MAX_Z,
  type StaticTrainingShotConfig,
} from './ShotGizmoMath.ts';
import {
  resolveEffectiveRecommendedVariation,
  type StaticTrainingVariationConfig,
  type StaticTrainingQuickVariationToggles,
} from '../../../ui-core/config/staticTrainingVariationTypes.ts';
import type { StaticTrainingEditorFreeCam } from '../../../ui-core/config/staticTrainingPackTypes.ts';

function randRange(minVal: number, maxVal: number): number {
  const lo = Math.min(minVal, maxVal);
  const hi = Math.max(minVal, maxVal);
  if (Math.abs(hi - lo) < 1e-6) return lo;
  return lo + Math.random() * (hi - lo);
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function normalizeAngleRad(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export interface ApplyVariationInput {
  shot: StaticTrainingShotConfig;
  toggles: StaticTrainingQuickVariationToggles;
  customVariation: StaticTrainingVariationConfig;
  recommendedVariation?: StaticTrainingVariationConfig | null;
  sourcePackType?: 'RCSPack' | 'RCSPackE' | 'RLRCSPack';
  isPlayOrTestSession: boolean;
  /**
   * When true (User Preferred Team is Orange, team === 1), rotates the shot by 180 deg
   * around the world Z axis (`(x, y, z) -> (-x, -y, z)`, `yaw -> yaw + PI`) so the
   * Orange player attacks the Blue (-Y) goal.
   */
  invertForOrangeTeam?: boolean;
  /**
   * When true (`isShotMirrored` toggled via `[F]` with `enableFToMirror` ON), reflects
   * the shot horizontally across the longitudinal center plane `X = 0`.
   */
  mirrorHorizontal?: boolean;
}

/**
 * Produces an effective `StaticTrainingShotConfig` with active Training Variations
 * and Quick Toggles applied for the current shot attempt.
 */
export function applyTrainingVariationsToShot(
  input: ApplyVariationInput
): StaticTrainingShotConfig {
  const {
    shot,
    toggles,
    customVariation,
    recommendedVariation,
    sourcePackType,
    isPlayOrTestSession,
    invertForOrangeTeam = false,
    mirrorHorizontal = false,
  } = input;

  const baseCar = shot.car;
  const baseBall = shot.ball;
  const baseCarLoc = baseCar.location || baseCar.pos || [0, -2400, CAR_GROUND_MIN_Z];
  const baseBallLoc = baseBall.location || baseBall.pos || [0, 0, BALL_GROUND_MIN_Z];

  let carLocX = baseCarLoc[0];
  let carLocY = baseCarLoc[1];
  let carLocZ = baseCarLoc[2];
  let carHeadingYaw = baseCar.headingYaw;
  let carHeadingPitch = baseCar.headingPitch;
  let carAirRoll = baseCar.airRoll;
  let carSpeed = baseCar.speed;
  let carSpeedYaw = baseCar.speedYaw;
  let carSnapToGround = baseCar.snapToGround;
  let carUnlimitedBoost = baseCar.unlimitedBoost;
  let carInitialBoost = baseCar.initialBoost;

  let ballLocX = baseBallLoc[0];
  let ballLocY = baseBallLoc[1];
  let ballLocZ = baseBallLoc[2];
  let ballSpeed = baseBall.speed;
  let ballSpeedYaw = baseBall.speedYaw;
  let ballSpeedPitch = baseBall.speedPitch;
  let ballStartRotationRoll = baseBall.startRotationRoll;
  let ballRandomAngularVelocity = baseBall.randomAngularVelocity;
  let ballAvX = baseBall.angularVelocity?.[0] ?? 0;
  let ballAvY = baseBall.angularVelocity?.[1] ?? 0;
  let ballAvZ = baseBall.angularVelocity?.[2] ?? 0;

  let nextEditorFreeCam: StaticTrainingEditorFreeCam | undefined = shot.editorFreeCam
    ? {
        ...shot.editorFreeCam,
        location: [
          shot.editorFreeCam.location[0],
          shot.editorFreeCam.location[1],
          shot.editorFreeCam.location[2],
        ],
      }
    : undefined;

  // 1. Apply Angular Velocity Disable Quick Toggles (applies in both Play and Preview)
  const isRLRCSPack = sourcePackType === 'RLRCSPack';
  if (
    toggles.disableAllRandomAngularVelocity ||
    (isRLRCSPack && toggles.disableRLRCSPackAngularVelocity)
  ) {
    ballRandomAngularVelocity = false;
    ballAvX = 0;
    ballAvY = 0;
    ballAvZ = 0;
  }

  // Only apply team invert, horizontal mirror, and stochastic variations during Play or Single-Shot Test
  if (!isPlayOrTestSession) {
    return {
      ...shot,
      car: {
        ...baseCar,
        location: [carLocX, carLocY, carLocZ],
      },
      ball: {
        ...baseBall,
        location: [ballLocX, ballLocY, ballLocZ],
        randomAngularVelocity: ballRandomAngularVelocity,
        angularVelocity: [ballAvX, ballAvY, ballAvZ],
      },
      ...(nextEditorFreeCam ? { editorFreeCam: nextEditorFreeCam } : {}),
    };
  }

  // 1B. Apply Preferred Team Invert (180 deg rotation around Z axis when user prefers Orange team)
  if (invertForOrangeTeam) {
    carLocX = -carLocX;
    carLocY = -carLocY;
    carHeadingYaw = normalizeAngleRad(carHeadingYaw + Math.PI);
    carSpeedYaw = normalizeAngleRad((carSpeedYaw ?? baseCar.headingYaw) + Math.PI);

    ballLocX = -ballLocX;
    ballLocY = -ballLocY;
    ballSpeedYaw = normalizeAngleRad(ballSpeedYaw + Math.PI);
    ballAvX = -ballAvX;
    ballAvY = -ballAvY;

    if (nextEditorFreeCam) {
      nextEditorFreeCam = {
        ...nextEditorFreeCam,
        location: [
          -nextEditorFreeCam.location[0],
          -nextEditorFreeCam.location[1],
          nextEditorFreeCam.location[2],
        ],
        yaw: normalizeAngleRad(nextEditorFreeCam.yaw + Math.PI),
      };
    }
  }

  // 1C. Apply Horizontal Mirror across X = 0 when [F] mirror is active
  if (mirrorHorizontal && toggles.enableFToMirror !== false) {
    const priorHeadingYaw = carHeadingYaw;
    carLocX = -carLocX;
    carHeadingYaw = normalizeAngleRad(Math.PI - priorHeadingYaw);
    carSpeedYaw = normalizeAngleRad(Math.PI - (carSpeedYaw ?? priorHeadingYaw));
    carAirRoll = -(carAirRoll || 0);

    ballLocX = -ballLocX;
    ballSpeedYaw = normalizeAngleRad(Math.PI - ballSpeedYaw);
    if (typeof ballStartRotationRoll === 'number') {
      ballStartRotationRoll = -ballStartRotationRoll;
    }
    ballAvY = -ballAvY;
    ballAvZ = -ballAvZ;

    if (nextEditorFreeCam) {
      nextEditorFreeCam = {
        ...nextEditorFreeCam,
        location: [
          -nextEditorFreeCam.location[0],
          nextEditorFreeCam.location[1],
          nextEditorFreeCam.location[2],
        ],
        yaw: normalizeAngleRad(Math.PI - nextEditorFreeCam.yaw),
        roll: -(nextEditorFreeCam.roll || 0),
      };
    }
  }

  const activeVar: StaticTrainingVariationConfig | null = toggles.enableCustomVariationOverride
    ? customVariation
    : resolveEffectiveRecommendedVariation(
        recommendedVariation,
        Boolean(toggles.applyNewKevpertBind)
      );

  if (activeVar) {
    // --- Ball Variance ---
    if (!toggles.disableBallVariance) {
      const [spdMinPct, spdMaxPct] = activeVar.ballSpeedModifierPct;
      if (Math.abs(spdMinPct) > 1e-4 || Math.abs(spdMaxPct) > 1e-4) {
        const pctDelta = randRange(spdMinPct, spdMaxPct) / 100;
        ballSpeed = clamp(ballSpeed * (1 + pctDelta), 0, 4000);
      }

      const [xyMin, xyMax] = activeVar.ballLocationModifierXY;
      if (Math.abs(xyMin) > 1e-4 || Math.abs(xyMax) > 1e-4) {
        const maxBallY = Math.max(
          ARENA_MAX_Y,
          Math.abs(ballLocY) + Math.max(Math.abs(xyMin), Math.abs(xyMax))
        );
        ballLocX = clamp(ballLocX + randRange(xyMin, xyMax), -ARENA_MAX_X, ARENA_MAX_X);
        ballLocY = clamp(ballLocY + randRange(xyMin, xyMax), -maxBallY, maxBallY);
      }

      const [zMin, zMax] = activeVar.ballHeightModifierZ;
      if (Math.abs(zMin) > 1e-4 || Math.abs(zMax) > 1e-4) {
        ballLocZ = clamp(ballLocZ + randRange(zMin, zMax), BALL_GROUND_MIN_Z, ARENA_MAX_Z);
      }

      const [rotMinDeg, rotMaxDeg] = activeVar.ballRotationModifierDeg;
      if (Math.abs(rotMinDeg) > 1e-4 || Math.abs(rotMaxDeg) > 1e-4) {
        const yawDeltaRad = (randRange(rotMinDeg, rotMaxDeg) * Math.PI) / 180;
        const pitchDeltaRad = (randRange(rotMinDeg, rotMaxDeg) * 0.5 * Math.PI) / 180;
        ballSpeedYaw += yawDeltaRad;
        ballSpeedPitch = clamp(
          ballSpeedPitch + pitchDeltaRad,
          -Math.PI / 2 + 0.05,
          Math.PI / 2 - 0.05
        );
      }

      const [spinMin, spinMax] = activeVar.ballSpinModifier;
      const allowSpin =
        !toggles.disableAllRandomAngularVelocity &&
        !(isRLRCSPack && toggles.disableRLRCSPackAngularVelocity);
      if (allowSpin && (Math.abs(spinMin) > 1e-4 || Math.abs(spinMax) > 1e-4)) {
        ballAvX = clamp(ballAvX + randRange(spinMin, spinMax) * 6, -6, 6);
        ballAvY = clamp(ballAvY + randRange(spinMin, spinMax) * 6, -6, 6);
        ballAvZ = clamp(ballAvZ + randRange(spinMin, spinMax) * 6, -6, 6);
      }
    }

    // --- Vehicle Variance ---
    if (!toggles.disableVehicleVariance) {
      if (activeVar.vehicleSpeedRange) {
        const [vMin, vMax] = activeVar.vehicleSpeedRange;
        carSpeed = clamp(randRange(vMin, vMax), 0, 2300);
      }

      const [carLocMin, carLocMax] = activeVar.vehicleLocationModifier;
      if (Math.abs(carLocMin) > 1e-4 || Math.abs(carLocMax) > 1e-4) {
        const maxCarY = Math.max(
          ARENA_MAX_Y,
          Math.abs(carLocY) + Math.max(Math.abs(carLocMin), Math.abs(carLocMax))
        );
        carLocX = clamp(carLocX + randRange(carLocMin, carLocMax), -ARENA_MAX_X, ARENA_MAX_X);
        carLocY = clamp(carLocY + randRange(carLocMin, carLocMax), -maxCarY, maxCarY);
      }

      const [carRotMinDeg, carRotMaxDeg] = activeVar.vehicleRotationModifierDeg;
      if (Math.abs(carRotMinDeg) > 1e-4 || Math.abs(carRotMaxDeg) > 1e-4) {
        const yawOffsetRad = (randRange(carRotMinDeg, carRotMaxDeg) * Math.PI) / 180;
        carHeadingYaw += yawOffsetRad;
        if (baseCar.speedFollowsHeading !== false) {
          carSpeedYaw = carHeadingYaw;
        }
      }
    }

    // --- Boost Limit & Ground Spawn Overrides ---
    if (activeVar.forceSpawnVehicleOnGround) {
      carSnapToGround = true;
      carLocZ = CAR_GROUND_MIN_Z;
      carHeadingPitch = 0;
      carAirRoll = 0;
    }

    if (activeVar.forceUnlimitedBoost) {
      carUnlimitedBoost = true;
      carInitialBoost = 100;
    } else if (
      activeVar.boostLimitOverride !== null &&
      activeVar.boostLimitOverride !== undefined
    ) {
      carUnlimitedBoost = false;
      carInitialBoost = clamp(Number(activeVar.boostLimitOverride), 0, 100);
    }
  }

  // 2. Override Unlimited Boost as 100 (default ON: top HUD shows INF while arena & bottom-right gauge consume from 100)
  if (
    carUnlimitedBoost &&
    toggles.overrideUnlimitedBoostAs100 !== false &&
    !activeVar?.forceUnlimitedBoost
  ) {
    carUnlimitedBoost = false;
    carInitialBoost = 100;
  }

  // 3. Apply Quick "More Boost" (0..100 added to initialBoost, clamped to max 100)
  if (!carUnlimitedBoost && toggles.moreBoostAmount > 0) {
    carInitialBoost = clamp(carInitialBoost + Number(toggles.moreBoostAmount), 0, 100);
  }

  return {
    ...shot,
    car: {
      ...baseCar,
      location: [carLocX, carLocY, carLocZ],
      headingYaw: carHeadingYaw,
      headingPitch: carHeadingPitch,
      airRoll: carAirRoll,
      speed: carSpeed,
      speedYaw: carSpeedYaw,
      snapToGround: carSnapToGround,
      unlimitedBoost: carUnlimitedBoost,
      initialBoost: carInitialBoost,
    },
    ball: {
      ...baseBall,
      location: [ballLocX, ballLocY, ballLocZ],
      speed: ballSpeed,
      speedYaw: ballSpeedYaw,
      speedPitch: ballSpeedPitch,
      startRotationRoll: ballStartRotationRoll,
      randomAngularVelocity: ballRandomAngularVelocity,
      angularVelocity: [ballAvX, ballAvY, ballAvZ],
    },
    ...(nextEditorFreeCam ? { editorFreeCam: nextEditorFreeCam } : {}),
  };
}

/**
 * Converts a shot's `editorFreeCam` (in Rocket League Unreal UU `[X, Y, Z]` and radians `pitch, yaw`)
 * into Three.js `FreeCameraController` `position: [x, y, z]` and `lookAt: [tx, ty, tz]`.
 * If `editorFreeCam` is Rocket League's unmoved default overview, orients toward the midpoint of car and ball.
 */
export function computeThreeJsFreeCamPoseFromShot(
  shot: StaticTrainingShotConfig & {
    editorFreeCam?: StaticTrainingEditorFreeCam;
  }
): {
  position: [number, number, number];
  lookAt: [number, number, number];
} | null {
  const cam = shot.editorFreeCam;
  if (!cam || !Array.isArray(cam.location)) return null;

  const rlX = Number(cam.location[0]) || 0;
  const rlY = Number(cam.location[1]) || 0;
  const rlZ = Math.max(24, Number(cam.location[2]) || 300);

  // Three.js coordinates: (x = rlX, y = rlZ, z = rlY)
  const posThree: [number, number, number] = [rlX, rlZ, rlY];

  if (cam.isDefaultOverview) {
    const cLoc = shot.car.location || shot.car.pos || [0, -2400, CAR_GROUND_MIN_Z];
    const bLoc = shot.ball.location || shot.ball.pos || [0, 0, BALL_GROUND_MIN_Z];
    const midX = (cLoc[0] + bLoc[0]) * 0.5;
    const midY = (cLoc[2] + bLoc[2]) * 0.5;
    const midZ = (cLoc[1] + bLoc[1]) * 0.5;
    return {
      position: posThree,
      lookAt: [midX, midY, midZ],
    };
  }

  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const fwdRlX = Math.cos(cam.yaw) * cp;
  const fwdRlY = Math.sin(cam.yaw) * cp;
  const fwdRlZ = sp;

  const dist = 1000;
  return {
    position: posThree,
    lookAt: [posThree[0] + fwdRlX * dist, posThree[1] + fwdRlZ * dist, posThree[2] + fwdRlY * dist],
  };
}

/**
 * Converts a Three.js `FreeCamStateSnapshot` back into `StaticTrainingEditorFreeCam` (Unreal UU + radians).
 */
export function extractShotEditorFreeCamFromSnapshot(snapshot: {
  eyeUnreal: [number, number, number];
  yawUnrealDeg: number;
  pitchUnrealDeg: number;
}): StaticTrainingEditorFreeCam {
  const [x, y, z] = snapshot.eyeUnreal;
  // Note: in buildCameraPoseStateSnapshot, yawUnrealDeg = atan2(fwd.x, fwd.z), where fwd.x = rlX, fwd.z = rlY.
  // In standard RL coordinates, yaw = atan2(rlY, rlX) = 90deg - atan2(rlX, rlY).
  const rlYawDeg = 90 - Number(snapshot.yawUnrealDeg || 0);
  const rlPitchDeg = Number(snapshot.pitchUnrealDeg || 0);
  return {
    location: [
      clamp(Math.round(x), -ARENA_MAX_X, ARENA_MAX_X),
      clamp(Math.round(y), -ARENA_MAX_Y, ARENA_MAX_Y),
      clamp(Math.round(z), 24, ARENA_MAX_Z),
    ],
    pitch: clamp((rlPitchDeg * Math.PI) / 180, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05),
    yaw: normalizeAngleRad((rlYawDeg * Math.PI) / 180),
    roll: 0,
    isDefaultOverview: false,
  };
}
