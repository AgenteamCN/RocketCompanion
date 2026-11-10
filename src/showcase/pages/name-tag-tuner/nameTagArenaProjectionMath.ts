import {
  computeAdaptiveNameTagWidthPx,
  formatNameTagDisplayText,
  resolveNameTagCornerRadiusPx,
  resolveNameTagFontFamilyCss,
  type NameTagConfig,
} from '../../../ui-core/config/nameTagConfig';
import type { NameTagPillRenderCard2D } from '../../../ui-core/config/nameTagPillRenderer';

export interface KickoffCarSpawn {
  carIndex: number;
  slotCode: string;
  slotName: string;
  team: 0 | 1;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface KickoffSlotPair {
  name: string;
  team0: { x: number; y: number; z: number; yaw: number };
  team1: { x: number; y: number; z: number; yaw: number };
}

export const KICKOFF_SLOT_PAIRS: KickoffSlotPair[] = [
  {
    name: 'Diagonal Right',
    team0: { x: 2048, y: 17, z: -2560, yaw: 2.35619449 },
    team1: { x: -2048, y: 17, z: 2560, yaw: -0.78539816 },
  },
  {
    name: 'Diagonal Left',
    team0: { x: -2048, y: 17, z: -2560, yaw: 0.78539816 },
    team1: { x: 2048, y: 17, z: 2560, yaw: -2.35619449 },
  },
  {
    name: 'Back Right',
    team0: { x: 256, y: 17, z: -3840, yaw: 1.57079633 },
    team1: { x: -256, y: 17, z: 3840, yaw: -1.57079633 },
  },
  {
    name: 'Back Left',
    team0: { x: -256, y: 17, z: -3840, yaw: 1.57079633 },
    team1: { x: 256, y: 17, z: 3840, yaw: -1.57079633 },
  },
  {
    name: 'Far Back Center',
    team0: { x: 0, y: 17, z: -4608, yaw: 1.57079633 },
    team1: { x: 0, y: 17, z: 4608, yaw: -1.57079633 },
  },
];

export const CLASSIC_BALL_RADIUS = 95;

export function buildKickoffCars(slotIndices: [number, number, number]): KickoffCarSpawn[] {
  const cars: KickoffCarSpawn[] = [];
  for (let i = 0; i < 3; i++) {
    const pair = KICKOFF_SLOT_PAIRS[slotIndices[i]];
    cars.push({
      carIndex: i,
      slotCode: `B${i + 1}`,
      slotName: pair.name,
      team: 0,
      x: pair.team0.x,
      y: pair.team0.y,
      z: pair.team0.z,
      yaw: pair.team0.yaw,
    });
  }
  for (let i = 0; i < 3; i++) {
    const pair = KICKOFF_SLOT_PAIRS[slotIndices[i]];
    cars.push({
      carIndex: i + 3,
      slotCode: `O${i + 1}`,
      slotName: pair.name,
      team: 1,
      x: pair.team1.x,
      y: pair.team1.y,
      z: pair.team1.z,
      yaw: pair.team1.yaw,
    });
  }
  return cars;
}

export function buildSinglePillCard2D(
  carIndex: number,
  rawName: string,
  team: 0 | 1,
  boostAmount: number,
  centerX: number,
  centerY: number,
  screenUnitScale: number,
  viewZDepthUu: number,
  cameraDistanceSq: number,
  config: NameTagConfig,
  boostBorderVisible = config.boostBorderEnabled,
): NameTagPillRenderCard2D {
  const displayText = formatNameTagDisplayText(rawName, config.maxChars);
  const baseWidth = computeAdaptiveNameTagWidthPx(displayText, config);
  const baseHeight = config.pillHeight;
  const renderScale = (config.cardRenderScale || 100) / 100;
  const unit = Math.max(0.18, screenUnitScale * renderScale);

  const width = Math.max(24, baseWidth * unit);
  const height = Math.max(14, baseHeight * unit);
  const radius = resolveNameTagCornerRadiusPx(width, height, config.cornerRadius * unit);
  const borderW = Math.max(0, config.borderWidth * unit);
  const left = centerX - width * 0.5;
  const top = centerY - height * 0.5;

  const halfStroke = borderW * 0.5;
  const outerLeft = left - halfStroke;
  const outerTop = top - halfStroke;
  const outerWidth = width + borderW;
  const outerHeight = height + borderW;
  const outerRight = outerLeft + outerWidth;
  const outerBottom = outerTop + outerHeight;
  const outerRadius = radius + halfStroke;

  const isBlue = team === 0;
  const bgColor = isBlue ? config.blueBgColor : config.orangeBgColor;
  const borderColor = isBlue ? config.blueBorderColor : config.orangeBorderColor;
  const textColor = isBlue ? config.blueTextColor : config.orangeTextColor;
  const boostBorderColor =
    config.boostBorderColorMode === 'shared'
      ? config.sharedBoostBorderColor
      : isBlue
        ? config.blueBoostBorderColor
        : config.orangeBoostBorderColor;

  return {
    carIndex,
    cameraDistanceSq,
    viewZDepthUu,
    displayText,
    centerX,
    centerY,
    left,
    top,
    width,
    height,
    radius,
    borderW,
    screenUnitScale: unit,
    outerLeft,
    outerTop,
    outerRight,
    outerBottom,
    outerWidth,
    outerHeight,
    outerRadius,
    fontPx: Math.max(8, config.fontSize * unit),
    fontWeight: config.fontWeight,
    fontFamilyCss: resolveNameTagFontFamilyCss(config.fontFamily),
    opacity: config.opacity,
    bgOpacity: config.bgOpacity,
    bgColor,
    borderColor,
    textColor,
    boostBorderVisible,
    boostFraction: Math.max(0, Math.min(1, boostAmount / 100)),
    boostBorderColor,
  };
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraBasis {
  pos: Vec3;
  target: Vec3;
  forward: Vec3;
  right: Vec3;
  up: Vec3;
  fovDeg: number;
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function len3(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

function norm3(v: Vec3): Vec3 {
  const l = len3(v) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function buildCameraBasis(pos: Vec3, target: Vec3, fovDeg: number): CameraBasis {
  const forward = norm3(sub3(target, pos));
  const worldUp: Vec3 = { x: 0, y: 1, z: 0 };
  const right = norm3(cross3(forward, worldUp));
  const up = norm3(cross3(right, forward));
  return { pos, target, forward, right, up, fovDeg };
}

export function resolveNameTagCameraBasis(
  povCar: KickoffCarSpawn | null,
  ballWorld: Vec3,
  cameraFovDeg: number,
): CameraBasis {
  if (povCar) {
    const toBall = norm3({ x: -povCar.x, y: 0, z: -povCar.z });
    const camPos: Vec3 = {
      x: povCar.x - toBall.x * 290,
      y: povCar.y + 112,
      z: povCar.z - toBall.z * 290,
    };
    const camTarget: Vec3 = {
      x: ballWorld.x,
      y: ballWorld.y - 12,
      z: ballWorld.z,
    };
    return buildCameraBasis(camPos, camTarget, cameraFovDeg);
  }
  return buildCameraBasis(
    { x: -1950, y: 720, z: -2600 },
    { x: 0, y: 80, z: 0 },
    cameraFovDeg,
  );
}

export const resolveNamePlateCameraBasis = resolveNameTagCameraBasis;

export function projectWorldPoint(
  world: Vec3,
  cam: CameraBasis,
  width: number,
  height: number,
): {
  x: number;
  y: number;
  viewZ: number;
  euclidean: number;
  offAxisDeg: number;
  visible: boolean;
} {
  const rel = sub3(world, cam.pos);
  const viewZ = dot3(rel, cam.forward);
  const euclidean = len3(rel);
  if (viewZ <= 10) {
    return { x: 0, y: 0, viewZ, euclidean, offAxisDeg: 90, visible: false };
  }
  const camX = dot3(rel, cam.right);
  const camY = dot3(rel, cam.up);
  const halfTan = Math.tan(((cam.fovDeg * Math.PI) / 180) * 0.5);
  const aspect = width / Math.max(1, height);
  const ndcX = camX / (viewZ * halfTan * aspect);
  const ndcY = camY / (viewZ * halfTan);
  const x = (ndcX * 0.5 + 0.5) * width;
  const y = (-ndcY * 0.5 + 0.5) * height;
  const cosAng = Math.max(-1, Math.min(1, viewZ / Math.max(1e-4, euclidean)));
  const offAxisDeg = (Math.acos(cosAng) * 180) / Math.PI;
  return {
    x,
    y,
    viewZ,
    euclidean,
    offAxisDeg,
    visible: Math.abs(ndcX) <= 1.35 && Math.abs(ndcY) <= 1.35,
  };
}
