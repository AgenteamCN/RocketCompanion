import * as THREE from 'three';
import {
  DEFAULT_NAME_TAG_CONFIG,
  NAME_TAG_FAR_CALIBRATION_DEPTH_UU,
  NAME_TAG_NEAR_CALIBRATION_DEPTH_UU,
  NAME_TAG_REFERENCE_DEPTH_UU,
  computeAdaptiveNameTagWidthPx,
  computeOffscreenDistanceScale,
  resolveCarSlotCode,
  resolveNameTagCornerRadiusPx,
  resolveNameTagFontFamilyCss,
  resolveNameTagVariantParams,
  type NameTagAerialClimbTriggerReason,
  type NameTagCarTelemetry,
  type NameTagCardVariantParams,
  type NameTagConfig,
} from '../../ui-core/config/nameTagConfig.ts';
import {
  clampRayToRoiBoundary2D,
  computeOffscreenRoiBounds2D,
  resolveCarColorPalette,
  type NameTagOffscreenIndicatorCard2D,
} from '../../ui-core/config/nameTagOffscreenRenderer.ts';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  roundMetric,
  type VisibleNameTagCard2D,
} from './VehicleNameTagCanvasRenderer.ts';

export const REFERENCE_TAN_HALF_FOV = Math.tan(THREE.MathUtils.degToRad(40));
export const REFERENCE_VIEWPORT_HEIGHT_PX = 1080;
export const SCREEN_SCALE_MULTIPLIER = 2.4;
export const SLOT_CODES = ['B1', 'B2', 'B3', 'O1', 'O2', 'O3', 'P7', 'P8'];

export interface CarProjectionConfigParams {
  config: NameTagConfig;
  variant: NameTagCardVariantParams;
  viewportWidthPx: number;
  viewportHeightPx: number;
  tanHalfFov: number;
  fovScale: number;
  scaleFactor: number;
  distanceScaleExponent: number;
  nearScaleMultiplier: number;
  farScaleMultiplier: number;
  pillHeightPx: number;
  globalWorldOffsetUu: number;
  globalScreenOffsetPx: number;
  fontFamilyCss: string;
  fontWeight: number;
  cardOpacity: number;
  effectiveBgOpacity: number;
  rawBorderWidth: number;
  rawFontSize: number;
  maxChars: number;
  measuredMaxRefTextWidthPx: number | undefined;
}

const finiteOr = (val: unknown, fb: number): number =>
  Number.isFinite(Number(val)) ? Number(val) : fb;

export function buildCarProjectionConfigParams(
  config: NameTagConfig,
  isSingleChar: boolean,
  vw: number,
  vh: number,
  tanHalfFov: number,
  measureCtx: CanvasRenderingContext2D | null
): CarProjectionConfigParams {
  const D = DEFAULT_NAME_TAG_CONFIG;
  const v = resolveNameTagVariantParams(config, isSingleChar);
  const fontFamilyCss = resolveNameTagFontFamilyCss(v.fontFamily || D.fontFamily);
  const fontWeight = v.fontWeight || D.fontWeight;
  const rawFontSize = Math.max(1, finiteOr(v.fontSize, D.fontSize));
  const maxChars = Math.max(1, Math.round(finiteOr(v.maxChars, D.maxChars)));

  let measuredMaxRefTextWidthPx: number | undefined;
  if (measureCtx) {
    measureCtx.font = `${fontWeight} ${rawFontSize}px ${fontFamilyCss}`;
    measuredMaxRefTextWidthPx = measureCtx.measureText('M'.repeat(maxChars)).width;
  }

  return {
    config,
    variant: v,
    viewportWidthPx: vw,
    viewportHeightPx: vh,
    tanHalfFov,
    fovScale: tanHalfFov / REFERENCE_TAN_HALF_FOV,
    scaleFactor: Math.max(0.001, finiteOr(v.cameraScaleFactor, D.cameraScaleFactor)),
    distanceScaleExponent: finiteOr(v.distanceScaleExponent, D.distanceScaleExponent),
    nearScaleMultiplier: Math.max(0.01, finiteOr(v.nearScaleMultiplier, D.nearScaleMultiplier)),
    farScaleMultiplier: Math.max(0.01, finiteOr(v.farScaleMultiplier, D.farScaleMultiplier)),
    pillHeightPx: Math.max(4, finiteOr(v.pillHeight, D.pillHeight)),
    globalWorldOffsetUu: finiteOr(v.verticalOffsetUu, D.verticalOffsetUu),
    globalScreenOffsetPx: finiteOr(v.screenVerticalOffsetPx, D.screenVerticalOffsetPx),
    fontFamilyCss,
    fontWeight,
    cardOpacity: Math.max(0.01, Math.min(1.0, Number(v.opacity) || D.opacity)),
    effectiveBgOpacity: Math.max(0.0, Math.min(1.0, Number(v.bgOpacity) ?? D.bgOpacity)),
    rawBorderWidth: Math.max(0, finiteOr(v.borderWidth, D.borderWidth)),
    rawFontSize,
    maxChars,
    measuredMaxRefTextWidthPx,
  };
}

export interface ProjectSingleCarInput {
  carIndex: number;
  carMesh: THREE.Object3D;
  rawName: string;
  displayText: string;
  team: 0 | 1;
  shouldHideFocusedCar: boolean;
  boostAmount: number;
  boostBorderVisible: boolean;
  boostFraction: number;
  boostBorderColorHex: string;
  offscreenAudienceVisible: boolean;
  isDoubleJumpedAndClimbing: boolean;
  aerialClimbGlowVisible: boolean;
  aerialClimbTriggerReason?: NameTagAerialClimbTriggerReason;
  carAltitudeUu?: number;
  carVelZUu?: number;
  carPitchFwdZ?: number;
  carJumpHoldMs?: number;
  povCarPosition?: THREE.Vector3 | null;
  liveCarColorHex?: string | null;
  activeCamera: THREE.PerspectiveCamera | null | undefined;
  cameraRightVector: THREE.Vector3;
  cameraUpVector: THREE.Vector3;
  cameraForwardVector: THREE.Vector3;
  projVector: THREE.Vector3;
  measureCtx: CanvasRenderingContext2D | null;
  params: CarProjectionConfigParams;
}

export interface ProjectedCarResult {
  behindCamera: boolean;
  isOffscreen: boolean;
  cameraDistanceSq: number;
  spritePosX: number;
  spritePosY: number;
  spritePosZ: number;
  baseWidthWorld: number;
  baseHeightWorld: number;
  carPillWidthPx: number;
  effectiveCornerRadiusPx: number;
  telemetry: NameTagCarTelemetry | null;
  card2D: VisibleNameTagCard2D | null;
  offscreenIndicator2D: NameTagOffscreenIndicatorCard2D | null;
}

export function projectCarNameTag(input: ProjectSingleCarInput): ProjectedCarResult | null {
  const {
    carIndex,
    carMesh,
    rawName,
    displayText,
    team,
    shouldHideFocusedCar,
    boostAmount,
    boostBorderVisible,
    boostFraction,
    boostBorderColorHex,
    offscreenAudienceVisible,
    isDoubleJumpedAndClimbing,
    aerialClimbGlowVisible,
    aerialClimbTriggerReason,
    carAltitudeUu,
    carVelZUu,
    carPitchFwdZ,
    carJumpHoldMs,
    activeCamera,
    cameraRightVector,
    cameraUpVector,
    cameraForwardVector,
    projVector,
    measureCtx,
    params: P,
  } = input;
  const {
    config,
    variant,
    viewportWidthPx: vw,
    viewportHeightPx: vh,
    tanHalfFov,
    pillHeightPx,
    fontFamilyCss,
    fontWeight,
    cardOpacity,
    effectiveBgOpacity,
    rawBorderWidth,
    rawFontSize,
  } = P;

  const ov = variant.carOverrides?.[carIndex];
  const ovOn = Boolean(ov?.enabled);
  const effWorldUu = ovOn ? Number(ov.worldOffsetUu) : P.globalWorldOffsetUu;
  const effScreenPx = ovOn ? Number(ov.screenOffsetPx) : P.globalScreenOffsetPx;
  const carScaleMult = ovOn ? Number(ov.scaleMultiplier) || 1.0 : 1.0;

  const upUu = effWorldUu * 0.45;
  const wx = carMesh.position.x + cameraUpVector.x * upUu;
  const wy = carMesh.position.y + effWorldUu * 0.55 + cameraUpVector.y * upUu;
  const wz = carMesh.position.z + cameraUpVector.z * upUu;

  let cameraDistanceSq = 0;
  let euclideanDistanceUu = NAME_TAG_REFERENCE_DEPTH_UU;
  let rawForwardDepthUu = NAME_TAG_REFERENCE_DEPTH_UU;
  let viewZDepthUu = NAME_TAG_REFERENCE_DEPTH_UU;
  let offAxisAngleDeg = 0;
  let behindCamera = false;
  let dx = 0;
  let dy = 0;
  let dz = 0;

  if (activeCamera?.position) {
    dx = wx - activeCamera.position.x;
    dy = wy - activeCamera.position.y;
    dz = wz - activeCamera.position.z;
    cameraDistanceSq = dx * dx + dy * dy + dz * dz;
    euclideanDistanceUu = Math.max(1, Math.sqrt(cameraDistanceSq));
    if (activeCamera.quaternion) {
      rawForwardDepthUu =
        dx * cameraForwardVector.x + dy * cameraForwardVector.y + dz * cameraForwardVector.z;
      if (rawForwardDepthUu <= 1) behindCamera = true;
      viewZDepthUu = Math.max(10, rawForwardDepthUu);
      offAxisAngleDeg = THREE.MathUtils.radToDeg(
        Math.acos(Math.max(-1, Math.min(1, rawForwardDepthUu / euclideanDistanceUu)))
      );
    } else {
      viewZDepthUu = euclideanDistanceUu;
    }
  }

  const activeDepthUu = variant.depthMetric === 'euclidean' ? euclideanDistanceUu : viewZDepthUu;
  const screenOffsetWorldUu =
    effScreenPx * ((2 * activeDepthUu * tanHalfFov) / REFERENCE_VIEWPORT_HEIGHT_PX);
  const bx = wx + cameraUpVector.x * screenOffsetWorldUu;
  const by = wy + cameraUpVector.y * screenOffsetWorldUu;
  const bz = wz + cameraUpVector.z * screenOffsetWorldUu;

  const curvedDepthUu =
    NAME_TAG_REFERENCE_DEPTH_UU *
    Math.pow(Math.max(10, activeDepthUu) / NAME_TAG_REFERENCE_DEPTH_UU, P.distanceScaleExponent);
  const lerpT = Math.max(
    0,
    Math.min(
      1,
      (activeDepthUu - NAME_TAG_NEAR_CALIBRATION_DEPTH_UU) /
        (NAME_TAG_FAR_CALIBRATION_DEPTH_UU - NAME_TAG_NEAR_CALIBRATION_DEPTH_UU)
    )
  );
  const effScaleMult =
    (P.nearScaleMultiplier + (P.farScaleMultiplier - P.nearScaleMultiplier) * lerpT) * carScaleMult;
  const baseHeightWorld =
    curvedDepthUu * P.fovScale * SCREEN_SCALE_MULTIPLIER * effScaleMult * P.scaleFactor;
  const baseWidthWorld = baseHeightWorld * (CANVAS_WIDTH / CANVAS_HEIGHT);
  const halfH = baseHeightWorld * (pillHeightPx / CANVAS_HEIGHT) * 0.5;

  if (measureCtx) measureCtx.font = `${fontWeight} ${rawFontSize}px ${fontFamilyCss}`;
  const measuredTextW = measureCtx ? measureCtx.measureText(displayText).width : undefined;
  const carPillWidthPx = computeAdaptiveNameTagWidthPx(
    displayText,
    variant,
    measuredTextW,
    P.measuredMaxRefTextWidthPx
  );
  const effectiveCornerRadiusPx = resolveNameTagCornerRadiusPx(
    carPillWidthPx,
    pillHeightPx,
    variant.cornerRadius
  );

  const screenUnitScale =
    (vh * (baseHeightWorld / Math.max(1, 2 * viewZDepthUu * tanHalfFov))) / CANVAS_HEIGHT;
  const screenPillHeightPx = pillHeightPx * screenUnitScale;
  const screenPillWidthPx = carPillWidthPx * screenUnitScale;
  const spritePosX = bx + cameraUpVector.x * halfH;
  const spritePosY = by + cameraUpVector.y * halfH;
  const spritePosZ = bz + cameraUpVector.z * halfH;

  let isOffscreen = behindCamera;
  let card2D: VisibleNameTagCard2D | null = null;
  let offscreenIndicator2D: NameTagOffscreenIndicatorCard2D | null = null;
  const palette = resolveCarColorPalette(carIndex, team, config, input.liveCarColorHex);
  const effBoostColor =
    config.circleColorMode === 'car-primary' ? palette.boostColor : boostBorderColorHex;
  const slotCodeText = resolveCarSlotCode(carIndex, team, config.slotCodes);

  if (!shouldHideFocusedCar && activeCamera?.projectionMatrix) {
    if (!behindCamera) {
      projVector.set(spritePosX, spritePosY, spritePosZ).project(activeCamera);
      if (projVector.z >= -1 && projVector.z <= 1) {
        const centerX = (projVector.x * 0.5 + 0.5) * vw;
        const centerY = (-projVector.y * 0.5 + 0.5) * vh;
        const width = screenPillWidthPx;
        const height = screenPillHeightPx;
        const borderW = Math.max(0, rawBorderWidth * screenUnitScale);
        const halfB = borderW * 0.5;
        const left = centerX - width * 0.5;
        const top = centerY - height * 0.5;
        const radius = effectiveCornerRadiusPx * screenUnitScale;

        if (left + width < 0 || left > vw || top + height < 0 || top > vh) {
          isOffscreen = true;
        } else {
          card2D = {
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
            screenUnitScale,
            outerLeft: left - halfB,
            outerTop: top - halfB,
            outerRight: left + width + halfB,
            outerBottom: top + height + halfB,
            outerWidth: width + borderW,
            outerHeight: height + borderW,
            outerRadius: radius + halfB,
            fontPx: Math.max(1, rawFontSize * screenUnitScale),
            fontWeight,
            fontFamilyCss,
            opacity: cardOpacity,
            bgOpacity: effectiveBgOpacity,
            bgColor: palette.bgColor,
            borderColor: palette.borderColor,
            textColor: palette.textColor,
            boostBorderVisible,
            boostFraction,
            boostBorderColor: effBoostColor,
            aerialClimbGlowVisible: false,
          };
        }
      } else {
        isOffscreen = true;
      }
    }

    if (isOffscreen && offscreenAudienceVisible) {
      const rightComp =
        dx * cameraRightVector.x + dy * cameraRightVector.y + dz * cameraRightVector.z;
      const upComp = dx * cameraUpVector.x + dy * cameraUpVector.y + dz * cameraUpVector.z;
      const dirX = !behindCamera ? (projVector.x * 0.5 + 0.5) * vw - vw * 0.5 : rightComp;
      const dirY = !behindCamera
        ? (-projVector.y * 0.5 + 0.5) * vh - vh * 0.5
        : Math.max(Math.abs(rightComp) * 0.35 + 80, -upComp);

      const clamped = clampRayToRoiBoundary2D(
        dirX,
        dirY,
        vw,
        vh,
        computeOffscreenRoiBounds2D(vw, vh, config)
      );
      const distFromPov = input.povCarPosition
        ? Math.max(1, carMesh.position.distanceTo(input.povCarPosition))
        : euclideanDistanceUu;
      const distScale = computeOffscreenDistanceScale(distFromPov, config);
      const rawOffBorderW = finiteOr(
        config.offscreenBorderWidthPx,
        DEFAULT_NAME_TAG_CONFIG.offscreenBorderWidthPx
      );

      offscreenIndicator2D = {
        carIndex,
        team,
        cameraDistanceSq,
        centerX: clamped.centerX,
        centerY: clamped.centerY,
        angleRad: clamped.angleRad,
        circleRadiusPx: Math.max(1, config.offscreenCircleRadiusPx * distScale),
        arrowLengthPx: Math.max(0, config.offscreenArrowLengthPx * distScale),
        arrowBaseWidthPx: Math.max(0, config.offscreenArrowBaseWidthPx * distScale),
        arrowGapPx: Math.max(0, config.offscreenArrowGapPx * distScale),
        borderW: Math.max(0, rawOffBorderW * 0.65 * distScale),
        opacity: cardOpacity,
        bgOpacity: effectiveBgOpacity,
        bgColor: palette.bgColor,
        borderColor: palette.borderColor,
        textColor: palette.textColor,
        labelText: config.offscreenShowSlotCode ? slotCodeText : undefined,
        fontFamilyCss,
        fontWeight,
        showBoostCircle: config.offscreenShowBoostCircle,
        showArrow: config.offscreenShowArrow,
        boostBorderVisible,
        boostFraction,
        boostBorderColor: effBoostColor,
        aerialClimbGlowVisible,
      };
    }
  }

  const r1 = (n: number) => roundMetric(n, 1);
  const telemetry: NameTagCarTelemetry | null =
    carIndex < 6
      ? {
          carIndex,
          slotCode: SLOT_CODES[carIndex] || `#${carIndex + 1}`,
          name: rawName,
          team,
          visible: !shouldHideFocusedCar && !isOffscreen,
          boostAmount: r1(boostAmount),
          boostBorderVisible,
          isOffscreen,
          isDoubleJumpedAndClimbing,
          aerialClimbTriggerReason: aerialClimbTriggerReason ?? 'none',
          carAltitudeUu: r1(carAltitudeUu ?? carMesh.position.y),
          carVelZUu: r1(carVelZUu ?? 0),
          carPitchFwdZ: roundMetric(carPitchFwdZ ?? 0, 3),
          carJumpHoldMs: Math.round(carJumpHoldMs ?? 0),
          carWorldPos: [r1(carMesh.position.x), r1(carMesh.position.y), r1(carMesh.position.z)],
          anchorWorldPos: [r1(bx), r1(by), r1(bz)],
          spriteWorldPos: [r1(spritePosX), r1(spritePosY), r1(spritePosZ)],
          euclideanDistanceUu: r1(euclideanDistanceUu),
          viewZDepthUu: r1(rawForwardDepthUu),
          activeDepthUu: r1(activeDepthUu),
          offAxisAngleDeg: roundMetric(offAxisAngleDeg, 2),
          worldScaleWidthUu: r1(baseWidthWorld),
          worldScaleHeightUu: r1(baseHeightWorld),
          screenPillWidthPx: r1(screenPillWidthPx),
          screenPillHeightPx: r1(screenPillHeightPx),
          effectiveScaleMultiplier: roundMetric(effScaleMult, 3),
          effectiveWorldOffsetUu: r1(effWorldUu),
          effectiveScreenOffsetPx: r1(effScreenPx),
          totalWorldVerticalOffsetUu: r1(effWorldUu + screenOffsetWorldUu),
        }
      : null;

  return {
    behindCamera,
    isOffscreen,
    cameraDistanceSq,
    spritePosX,
    spritePosY,
    spritePosZ,
    baseWidthWorld,
    baseHeightWorld,
    carPillWidthPx,
    effectiveCornerRadiusPx,
    telemetry,
    card2D,
    offscreenIndicator2D,
  };
}
