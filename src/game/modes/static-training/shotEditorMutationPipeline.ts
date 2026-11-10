import {
  ARENA_MAX_X,
  ARENA_MAX_Y,
  ARENA_MAX_Z,
  BALL_GROUND_MIN_Z,
  CAR_GROUND_MIN_Z,
  type BallCamTunerParams,
  type EditorContinuousDeltas,
  type ShotBallConfig,
  type ShotCarConfig,
  type StaticTrainingEditorCameraPort,
  type StaticTrainingEditSubMode,
  type StaticTrainingShotConfig,
} from './ShotGizmoMath.ts';
import {
  computeThreeJsFreeCamPoseFromShot,
  extractShotEditorFreeCamFromSnapshot,
} from './staticTrainingVariationMath.ts';

export interface ShotDraftPatchResult {
  carPatch?: Partial<ShotCarConfig>;
  ballPatch?: Partial<ShotBallConfig>;
  nextBallSpeedZeroLatch: boolean;
}

export interface ShotMouseDragPatchResult {
  carPatch?: Partial<ShotCarConfig>;
  ballPatch?: Partial<ShotBallConfig>;
}

export const EDITOR_HELD_KEY_CODES: ReadonlySet<string> = new Set([
  'Space',
  'KeyV',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyQ',
  'KeyE',
  'KeyO',
  'KeyP',
  'BracketLeft',
  'BracketRight',
  'Backslash',
]);

export function applyShotDraftPatch(
  draft: StaticTrainingShotConfig,
  patch: { carPatch?: Partial<ShotCarConfig>; ballPatch?: Partial<ShotBallConfig> }
): void {
  if (patch.carPatch) draft.car = { ...draft.car, ...patch.carPatch };
  if (patch.ballPatch) draft.ball = { ...draft.ball, ...patch.ballPatch };
}

export function syncEditorCameraForSubMode(params: {
  subMode: StaticTrainingEditSubMode;
  camera: StaticTrainingEditorCameraPort;
  isTestingSingleShot: boolean;
  isEditingItem: boolean;
  shot: StaticTrainingShotConfig | null;
  tuner: BallCamTunerParams;
  releaseGoalReplayCameraOverride?: () => void;
  persistEditorFreeCam?: (
    editorFreeCam: NonNullable<StaticTrainingShotConfig['editorFreeCam']>
  ) => void;
}): void {
  const {
    subMode,
    camera,
    isTestingSingleShot,
    isEditingItem,
    shot,
    tuner,
    releaseGoalReplayCameraOverride,
    persistEditorFreeCam,
  } = params;

  if (isTestingSingleShot) {
    camera.setEditorOverride?.(false);
    releaseGoalReplayCameraOverride?.();
    if (camera.isFreeCam) camera.setFreeCam(false);
    return;
  }

  if (subMode === 'free-cam') {
    camera.setEditorOverride?.(false);
    releaseGoalReplayCameraOverride?.();
    const freePose = shot ? computeThreeJsFreeCamPoseFromShot(shot) : null;
    if (freePose && typeof camera.setFreeCamPose === 'function') {
      camera.setFreeCamPose(freePose.position, freePose.lookAt);
    } else {
      camera.setFreeCam(true);
    }
    return;
  }

  if (camera.isFreeCam) {
    if (isEditingItem && typeof camera.getFreeCamStateSnapshot === 'function') {
      const snap = camera.getFreeCamStateSnapshot();
      if (snap && Array.isArray(snap.eyeUnreal)) {
        persistEditorFreeCam?.(extractShotEditorFreeCamFromSnapshot(snap));
      }
    }
    camera.setFreeCam(false);
  }
  camera.setEditorOverride?.(true);
  if (shot) {
    camera.syncEditorShotCamera?.(subMode, shot, tuner);
  }
}

export function computeContinuousDeltasShotPatch(
  shot: StaticTrainingShotConfig,
  subMode: StaticTrainingEditSubMode,
  deltas: EditorContinuousDeltas,
  ballSpeedZeroLatch: boolean
): ShotDraftPatchResult {
  let nextLatch = ballSpeedZeroLatch;
  const { moveX, moveY, moveZ, rollDelta, boostDelta, speedDelta } = deltas;

  if (subMode === 'car-heading' || subMode === 'car-speed') {
    const baseLoc = shot.car.location || [0, -2400, CAR_GROUND_MIN_Z];
    const nextX = Math.max(-ARENA_MAX_X, Math.min(ARENA_MAX_X, baseLoc[0] + moveX));
    const nextY = Math.max(-ARENA_MAX_Y, Math.min(ARENA_MAX_Y, baseLoc[1] + moveY));
    let nextZ = baseLoc[2];
    let nextSnapToGround = shot.car.snapToGround;
    if (moveZ > 0) {
      nextSnapToGround = false;
      nextZ = Math.min(ARENA_MAX_Z, baseLoc[2] + moveZ);
    } else if (moveZ < 0) {
      nextZ = Math.max(CAR_GROUND_MIN_Z, baseLoc[2] + moveZ);
    }

    const nextAirRoll =
      rollDelta !== 0 ? Number((shot.car.airRoll + rollDelta).toFixed(4)) : shot.car.airRoll;

    let nextUnlimitedBoost = shot.car.unlimitedBoost;
    let nextInitialBoost = shot.car.initialBoost;
    if (boostDelta !== 0) {
      if (boostDelta < 0 && shot.car.unlimitedBoost) {
        nextUnlimitedBoost = false;
        nextInitialBoost = 100;
      } else if (!shot.car.unlimitedBoost) {
        nextInitialBoost = Math.max(
          0,
          Math.min(100, Number((shot.car.initialBoost + boostDelta).toFixed(2)))
        );
      }
    }

    let nextSpeed = shot.car.speed;
    let nextSpeedYaw = shot.car.speedYaw;
    let nextSpeedPitch = shot.car.speedPitch;
    if (speedDelta !== 0) {
      nextSpeed = Math.max(0, Math.min(2300, Number((shot.car.speed + speedDelta).toFixed(1))));
      if (shot.car.speedFollowsHeading !== false) {
        nextSpeedYaw = shot.car.headingYaw;
        nextSpeedPitch = nextSnapToGround ? 0 : shot.car.headingPitch;
      }
    }

    return {
      carPatch: {
        location: [nextX, nextY, nextZ],
        snapToGround: nextSnapToGround,
        airRoll: nextAirRoll,
        unlimitedBoost: nextUnlimitedBoost,
        initialBoost: nextInitialBoost,
        speed: nextSpeed,
        speedYaw: nextSpeedYaw,
        speedPitch: nextSpeedPitch,
      },
      nextBallSpeedZeroLatch: nextLatch,
    };
  }

  if (subMode === 'ball-speed') {
    const baseLoc = shot.ball.location || [0, 0, BALL_GROUND_MIN_Z];
    const nextX = Math.max(-ARENA_MAX_X, Math.min(ARENA_MAX_X, baseLoc[0] + moveX));
    const nextY = Math.max(-ARENA_MAX_Y, Math.min(ARENA_MAX_Y, baseLoc[1] + moveY));
    const nextZ =
      moveZ !== 0
        ? Math.max(BALL_GROUND_MIN_Z, Math.min(ARENA_MAX_Z, baseLoc[2] + moveZ))
        : baseLoc[2];

    let nextBallSpeed = shot.ball.speed;
    let nextKickoffState = shot.ball.kickoffState;

    if (speedDelta < 0) {
      if (shot.ball.speed > 0 && !ballSpeedZeroLatch) {
        const computedSpd = Math.max(0, Number((shot.ball.speed + speedDelta).toFixed(1)));
        nextBallSpeed = computedSpd;
        if (computedSpd === 0) {
          nextLatch = true;
        }
      }
    } else if (speedDelta > 0) {
      if (shot.ball.kickoffState) {
        nextKickoffState = false;
        nextBallSpeed = 0;
      } else {
        nextBallSpeed = Math.min(4000, Number((shot.ball.speed + speedDelta).toFixed(1)));
      }
    }

    return {
      ballPatch: {
        location: [nextX, nextY, nextZ],
        speed: nextBallSpeed,
        kickoffState: nextKickoffState,
      },
      nextBallSpeedZeroLatch: nextLatch,
    };
  }

  return { nextBallSpeedZeroLatch: nextLatch };
}

export function computeMouseDragShotPatch(
  shot: StaticTrainingShotConfig,
  subMode: StaticTrainingEditSubMode,
  dx: number,
  dy: number,
  sensitivity = 0.0045
): ShotMouseDragPatchResult {
  const clampPitch = (val: number): number =>
    Number(Math.max(-Math.PI * 0.48, Math.min(Math.PI * 0.48, val)).toFixed(4));

  if (subMode === 'car-heading') {
    const nextHeadingYaw = Number((shot.car.headingYaw + dx * sensitivity).toFixed(4));
    const nextHeadingPitch = shot.car.snapToGround
      ? shot.car.headingPitch
      : clampPitch(shot.car.headingPitch - dy * sensitivity);
    const followsHeading = shot.car.speedFollowsHeading !== false;
    return {
      carPatch: {
        headingYaw: nextHeadingYaw,
        headingPitch: nextHeadingPitch,
        ...(followsHeading
          ? { speedYaw: nextHeadingYaw, speedPitch: shot.car.snapToGround ? 0 : nextHeadingPitch }
          : {}),
      },
    };
  }

  if (subMode === 'car-speed') {
    const curSpeedYaw = Number(shot.car.speedYaw ?? shot.car.headingYaw) || 0;
    const curSpeedPitch = Number(shot.car.speedPitch) || 0;
    return {
      carPatch: {
        speedYaw: Number((curSpeedYaw + dx * sensitivity).toFixed(4)),
        speedPitch: clampPitch(curSpeedPitch - dy * sensitivity),
      },
    };
  }

  if (subMode === 'ball-speed') {
    return {
      ballPatch: {
        speedYaw: Number((shot.ball.speedYaw + dx * sensitivity).toFixed(4)),
        speedPitch: clampPitch(shot.ball.speedPitch - dy * sensitivity),
      },
    };
  }

  return {};
}

export function computeDiscreteEditKeyMutation(
  code: string,
  subMode: StaticTrainingEditSubMode,
  item: StaticTrainingShotConfig | null
): {
  carPatch?: Partial<ShotCarConfig>;
  ballPatch?: Partial<ShotBallConfig>;
  removeHeldKey?: string;
  setBallSpeedZeroLatch?: boolean;
} | null {
  if (code === 'Backslash') {
    if (subMode === 'car-heading' || subMode === 'car-speed') {
      return { carPatch: { speed: 0 } };
    }
    if (subMode === 'ball-speed') {
      return { ballPatch: { speed: 0, kickoffState: false } };
    }
  }
  if (!item) return null;

  if (code === 'KeyV' && (subMode === 'car-heading' || subMode === 'car-speed')) {
    const loc = item.car?.location || item.car?.pos || [0, -2400, CAR_GROUND_MIN_Z];
    if (loc[2] <= CAR_GROUND_MIN_Z + 1.5 && !item.car.snapToGround) {
      const carPatch: Partial<ShotCarConfig> = {
        location: [loc[0], loc[1], CAR_GROUND_MIN_Z],
        snapToGround: true,
        headingPitch: 0,
        airRoll: 0,
      };
      if (item.car.speedFollowsHeading !== false) {
        carPatch.speedPitch = 0;
      }
      return { carPatch };
    }
  }

  if (code === 'KeyP' && (subMode === 'car-heading' || subMode === 'car-speed')) {
    if (item.car.initialBoost >= 100 && !item.car.unlimitedBoost) {
      return {
        carPatch: { initialBoost: 100, unlimitedBoost: true },
        removeHeldKey: 'KeyP',
      };
    }
  }

  if (code === 'KeyO' && (subMode === 'car-heading' || subMode === 'car-speed')) {
    if (item.car.unlimitedBoost) {
      return { carPatch: { unlimitedBoost: false, initialBoost: 100 } };
    }
  }

  if (code === 'BracketLeft' && subMode === 'ball-speed') {
    if (item.ball.speed === 0 && !item.ball.kickoffState) {
      return {
        ballPatch: { kickoffState: true },
        setBallSpeedZeroLatch: true,
      };
    }
  }

  if (code === 'BracketRight' && subMode === 'ball-speed') {
    if (item.ball.kickoffState) {
      return {
        ballPatch: { kickoffState: false, speed: 0 },
        removeHeldKey: 'BracketRight',
      };
    }
  }

  return null;
}
