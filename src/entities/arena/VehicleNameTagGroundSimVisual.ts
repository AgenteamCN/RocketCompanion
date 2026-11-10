import * as THREE from 'three';
import {
  DEFAULT_NAME_TAG_CONFIG,
  computeOffscreenDistanceScale,
  resolveCarSlotCode,
  resolveNameTagFontFamilyCss,
  type NameTagAerialClimbTriggerReason,
  type NameTagCarEntry,
  type NameTagConfig,
} from '../../ui-core/config/nameTagConfig.ts';
import {
  clampRayToRoiBoundary2D,
  computeOffscreenRoiBounds2D,
  resolveCarColorPalette,
  type NameTagOffscreenIndicatorCard2D,
} from '../../ui-core/config/nameTagOffscreenRenderer.ts';
import type { CarAerialClimbStatus } from './VehicleAerialClimbTracker.ts';

const GROUND_Y_UU = 4.0;
const RING_SEGMENTS = 72;

export interface ResolvedCarClimbSimulation {
  liveCarDoubleJumpedAndClimbing: boolean | undefined;
  aerialClimbTriggerReason: NameTagAerialClimbTriggerReason;
  effectiveCarEntry: NameTagCarEntry | undefined;
  activeClimbStatus: CarAerialClimbStatus | undefined;
}

export function resolveCarAerialClimbSimulation(params: {
  config: NameTagConfig;
  carIndex: number;
  focusedCarIndex: number;
  isTunerArenaActive: boolean;
  carEntry: NameTagCarEntry | undefined;
  carAerialClimbStatuses?: ArrayLike<CarAerialClimbStatus>;
  carAirborneFlipExhausted?: ArrayLike<number>;
  carVerticalVelZUu?: ArrayLike<number>;
}): ResolvedCarClimbSimulation {
  const {
    config,
    carIndex,
    focusedCarIndex,
    isTunerArenaActive,
    carEntry,
    carAerialClimbStatuses,
    carAirborneFlipExhausted,
    carVerticalVelZUu,
  } = params;

  const povClimbStatus =
    carAerialClimbStatuses &&
    focusedCarIndex >= 0 &&
    focusedCarIndex < carAerialClimbStatuses.length
      ? carAerialClimbStatuses[focusedCarIndex]
      : undefined;

  const selfClimbStatus =
    carAerialClimbStatuses && carIndex < carAerialClimbStatuses.length
      ? carAerialClimbStatuses[carIndex]
      : undefined;

  const usePovClimbSimulation = Boolean(config.aerialClimbSimulatePovInTuner && povClimbStatus);
  const activeClimbStatus = usePovClimbSimulation ? povClimbStatus : selfClimbStatus;

  let liveCarDoubleJumpedAndClimbing: boolean | undefined;
  let aerialClimbTriggerReason: NameTagAerialClimbTriggerReason = 'none';

  if (usePovClimbSimulation && activeClimbStatus) {
    liveCarDoubleJumpedAndClimbing = Boolean(activeClimbStatus.isClimbing);
    aerialClimbTriggerReason = activeClimbStatus.triggerReason;
  } else if (!isTunerArenaActive) {
    if (activeClimbStatus) {
      liveCarDoubleJumpedAndClimbing = Boolean(activeClimbStatus.isClimbing);
      aerialClimbTriggerReason = activeClimbStatus.triggerReason;
    } else if (
      carAirborneFlipExhausted &&
      carVerticalVelZUu &&
      carIndex < carAirborneFlipExhausted.length
    ) {
      const isLegacyClimbing =
        Boolean(carAirborneFlipExhausted[carIndex]) &&
        Number(carVerticalVelZUu[carIndex] || 0) >=
          (Number(config.aerialClimbMinVelZUu) || DEFAULT_NAME_TAG_CONFIG.aerialClimbMinVelZUu);
      liveCarDoubleJumpedAndClimbing = isLegacyClimbing;
      aerialClimbTriggerReason = isLegacyClimbing ? 'double-jump' : 'none';
    }
  } else if (selfClimbStatus?.isClimbing) {
    liveCarDoubleJumpedAndClimbing = true;
    aerialClimbTriggerReason = selfClimbStatus.triggerReason;
  } else if (
    Boolean(
      carEntry?.isDoubleJumpedAndClimbing ?? config.previewAerialClimbingFlags?.[carIndex % 6]
    )
  ) {
    aerialClimbTriggerReason = 'manual-override';
  }

  const effectiveCarEntry =
    usePovClimbSimulation && carEntry
      ? {
          ...carEntry,
          isDoubleJumpedAndClimbing: liveCarDoubleJumpedAndClimbing,
          aerialClimbTriggerReason,
        }
      : carEntry;

  return {
    liveCarDoubleJumpedAndClimbing,
    aerialClimbTriggerReason,
    effectiveCarEntry,
    activeClimbStatus,
  };
}

export function buildPovActionSimulationIndicator2D(params: {
  config: NameTagConfig;
  povCarMesh: THREE.Object3D | null | undefined;
  focusedCarIndex: number;
  focusedCarTeam: 0 | 1;
  liveBoostAmount: number | undefined;
  povClimbStatus: CarAerialClimbStatus | undefined;
  activeCamera: THREE.PerspectiveCamera | null | undefined;
  cameraUpVector: THREE.Vector3;
  projVector: THREE.Vector3;
  viewportWidthPx: number;
  viewportHeightPx: number;
}): NameTagOffscreenIndicatorCard2D | null {
  const {
    config,
    povCarMesh,
    focusedCarIndex,
    focusedCarTeam,
    liveBoostAmount,
    povClimbStatus,
    activeCamera,
    cameraUpVector,
    projVector,
    viewportWidthPx,
    viewportHeightPx,
  } = params;

  if (
    !config.aerialClimbSimulatePovInTuner ||
    !povCarMesh ||
    !povCarMesh.visible ||
    !activeCamera?.projectionMatrix
  ) {
    return null;
  }

  const D = DEFAULT_NAME_TAG_CONFIG;
  const worldOffsetUu = Number.isFinite(Number(config.verticalOffsetUu))
    ? Number(config.verticalOffsetUu)
    : D.verticalOffsetUu;
  const anchorX = povCarMesh.position.x + cameraUpVector.x * (worldOffsetUu * 0.45);
  const anchorY =
    povCarMesh.position.y + worldOffsetUu * 0.65 + cameraUpVector.y * (worldOffsetUu * 0.45);
  const anchorZ = povCarMesh.position.z + cameraUpVector.z * (worldOffsetUu * 0.45);

  projVector.set(anchorX, anchorY, anchorZ).project(activeCamera);
  if (projVector.z < -1 || projVector.z > 1) return null;

  const circleRadiusPx = Math.max(
    1,
    Number(config.offscreenCircleRadiusPx) || D.offscreenCircleRadiusPx
  );
  const arrowLengthPx = Math.max(
    0,
    Number(config.offscreenArrowLengthPx) ?? D.offscreenArrowLengthPx
  );
  const arrowGapPx = Math.max(0, Number(config.offscreenArrowGapPx) ?? D.offscreenArrowGapPx);
  const rawOffscreenBorderW = Number.isFinite(Number(config.offscreenBorderWidthPx))
    ? Number(config.offscreenBorderWidthPx)
    : D.offscreenBorderWidthPx;

  const screenX = (projVector.x * 0.5 + 0.5) * viewportWidthPx;
  const screenY =
    (-projVector.y * 0.5 + 0.5) * viewportHeightPx -
    (circleRadiusPx + arrowGapPx + arrowLengthPx + 10);

  const clampedX = Math.max(
    circleRadiusPx + 12,
    Math.min(viewportWidthPx - circleRadiusPx - 12, screenX)
  );
  const clampedY = Math.max(
    circleRadiusPx + 12,
    Math.min(viewportHeightPx - circleRadiusPx - arrowLengthPx - 16, screenY)
  );

  const palette = resolveCarColorPalette(focusedCarIndex, focusedCarTeam, config);
  const boostAmount = Number.isFinite(Number(liveBoostAmount))
    ? Math.max(0, Math.min(100, Number(liveBoostAmount)))
    : 100;
  const isClimbing = Boolean(povClimbStatus?.isClimbing);

  return {
    carIndex: focusedCarIndex,
    team: focusedCarTeam,
    cameraDistanceSq: 100,
    centerX: clampedX,
    centerY: clampedY,
    angleRad: Math.PI * 0.5,
    circleRadiusPx,
    arrowLengthPx,
    arrowBaseWidthPx: Math.max(
      0,
      Number(config.offscreenArrowBaseWidthPx) ?? D.offscreenArrowBaseWidthPx
    ),
    arrowGapPx,
    borderW: Math.max(0, rawOffscreenBorderW * 0.65),
    opacity: Math.max(0.01, Math.min(1, Number(config.opacity) || 1)),
    bgOpacity: Math.max(0, Math.min(1, Number(config.bgOpacity) ?? 0.88)),
    bgColor: palette.bgColor,
    borderColor: palette.borderColor,
    textColor: palette.textColor,
    labelText: config.offscreenShowSlotCode
      ? resolveCarSlotCode(focusedCarIndex, focusedCarTeam, config.slotCodes)
      : undefined,
    fontFamilyCss: resolveNameTagFontFamilyCss(config.fontFamily || D.fontFamily),
    fontWeight: config.fontWeight || D.fontWeight,
    showBoostCircle: true,
    showArrow: true,
    boostBorderVisible: true,
    boostFraction: boostAmount / 100,
    boostBorderColor: palette.boostColor,
    aerialClimbGlowVisible: Boolean(config.aerialClimbAlertEnabled && isClimbing),
  };
}

export function buildDistanceSimOffscreenIndicator2D(params: {
  config: NameTagConfig;
  viewportWidthPx: number;
  viewportHeightPx: number;
  povClimbStatus?: CarAerialClimbStatus;
}): NameTagOffscreenIndicatorCard2D | null {
  const { config, viewportWidthPx, viewportHeightPx, povClimbStatus } = params;
  if (!config.offscreenDistanceSimEnabled) return null;

  const D = DEFAULT_NAME_TAG_CONFIG;
  const simDistUu = Math.max(
    1,
    Number(config.offscreenDistanceSimDistanceUu) || D.offscreenDistanceSimDistanceUu
  );
  const simAngleDeg = (((Number(config.offscreenDistanceSimAngleDeg) || 0) % 360) + 360) % 360;
  const angleRadInput = (simAngleDeg * Math.PI) / 180;

  const dirX = -Math.cos(angleRadInput) * viewportWidthPx;
  const dirY = Math.sin(angleRadInput) * viewportHeightPx;
  const roi = computeOffscreenRoiBounds2D(viewportWidthPx, viewportHeightPx, config);
  const clamped = clampRayToRoiBoundary2D(dirX, dirY, viewportWidthPx, viewportHeightPx, roi);

  const distScale = computeOffscreenDistanceScale(simDistUu, config);
  const simTeam: 0 | 1 = 1;
  const simCarIndex = 3;
  const palette = resolveCarColorPalette(simCarIndex, simTeam, config);
  const rawOffscreenBorderW = Number.isFinite(Number(config.offscreenBorderWidthPx))
    ? Number(config.offscreenBorderWidthPx)
    : D.offscreenBorderWidthPx;

  return {
    carIndex: 99,
    team: simTeam,
    cameraDistanceSq: simDistUu * simDistUu,
    centerX: clamped.centerX,
    centerY: clamped.centerY,
    angleRad: clamped.angleRad,
    circleRadiusPx: Math.max(1, config.offscreenCircleRadiusPx * distScale),
    arrowLengthPx: Math.max(0, config.offscreenArrowLengthPx * distScale),
    arrowBaseWidthPx: Math.max(0, config.offscreenArrowBaseWidthPx * distScale),
    arrowGapPx: Math.max(0, config.offscreenArrowGapPx * distScale),
    borderW: Math.max(0, rawOffscreenBorderW * 0.65 * distScale),
    opacity: Math.max(0.01, Math.min(1, Number(config.opacity) || 1)),
    bgOpacity: Math.max(0, Math.min(1, Number(config.bgOpacity) ?? 0.88)),
    bgColor: palette.bgColor,
    borderColor: palette.borderColor,
    textColor: palette.textColor,
    labelText: config.offscreenShowSlotCode
      ? resolveCarSlotCode(simCarIndex, simTeam, config.slotCodes)
      : undefined,
    fontFamilyCss: resolveNameTagFontFamilyCss(config.fontFamily || D.fontFamily),
    fontWeight: config.fontWeight || D.fontWeight,
    showBoostCircle: config.offscreenShowBoostCircle,
    showArrow: config.offscreenShowArrow,
    boostBorderVisible: true,
    boostFraction: 0.78,
    boostBorderColor: palette.boostColor,
    aerialClimbGlowVisible: Boolean(
      config.aerialClimbAlertEnabled &&
      config.aerialClimbSimulatePovInTuner &&
      povClimbStatus?.isClimbing
    ),
  };
}

function createDashedLine(
  positions: Float32Array,
  material: THREE.LineDashedMaterial,
  renderOrder: number
): THREE.Line {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const line = new THREE.Line(geo, material);
  line.frustumCulled = false;
  line.renderOrder = renderOrder;
  return line;
}

export class VehicleNameTagGroundSimVisual {
  public readonly group: THREE.Group;
  private readonly forwardLine: THREE.Line;
  private readonly forwardPositions = new Float32Array(6);
  private readonly bearingLine: THREE.Line;
  private readonly bearingPositions = new Float32Array(6);
  private readonly distanceRing: THREE.Line;
  private readonly ringPositions = new Float32Array((RING_SEGMENTS + 1) * 3);
  private readonly targetMarker: THREE.Line;
  private readonly markerPositions = new Float32Array(25 * 3);

  constructor(parentGroup: THREE.Group) {
    this.group = new THREE.Group();
    this.group.name = 'nametag-ground-distance-sim';
    this.group.visible = false;

    const primaryMaterial = new THREE.LineDashedMaterial({
      color: 0x2dd4bf,
      dashSize: 90,
      gapSize: 55,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const bearingMaterial = new THREE.LineDashedMaterial({
      color: 0xfacc15,
      dashSize: 75,
      gapSize: 45,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const ringMaterial = new THREE.LineDashedMaterial({
      color: 0x38bdf8,
      dashSize: 110,
      gapSize: 70,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });

    this.forwardLine = createDashedLine(this.forwardPositions, primaryMaterial, 920);
    this.bearingLine = createDashedLine(this.bearingPositions, bearingMaterial, 921);
    this.distanceRing = createDashedLine(this.ringPositions, ringMaterial, 919);
    this.targetMarker = createDashedLine(this.markerPositions, bearingMaterial, 922);

    this.group.add(this.forwardLine, this.bearingLine, this.distanceRing, this.targetMarker);
    parentGroup.add(this.group);
  }

  public update(
    config: NameTagConfig,
    originMesh: THREE.Object3D | null | undefined,
    cameraForwardVector: THREE.Vector3,
    cameraRightVector: THREE.Vector3
  ): void {
    if (!config.enabled || !config.offscreenDistanceSimEnabled || !originMesh) {
      this.group.visible = false;
      return;
    }

    this.group.visible = true;
    const originX = originMesh.position.x;
    const originZ = originMesh.position.z;
    const simDistUu = Math.max(
      1,
      Number(config.offscreenDistanceSimDistanceUu) ||
        DEFAULT_NAME_TAG_CONFIG.offscreenDistanceSimDistanceUu
    );

    const fwdLen = Math.hypot(cameraForwardVector.x, cameraForwardVector.z);
    const fwdX = fwdLen > 1e-4 ? cameraForwardVector.x / fwdLen : 0;
    const fwdZ = fwdLen > 1e-4 ? cameraForwardVector.z / fwdLen : 1;

    const rightLen = Math.hypot(cameraRightVector.x, cameraRightVector.z);
    const rightX = rightLen > 1e-4 ? cameraRightVector.x / rightLen : 1;
    const rightZ = rightLen > 1e-4 ? cameraRightVector.z / rightLen : 0;

    const fwdEndX = originX + fwdX * simDistUu;
    const fwdEndZ = originZ + fwdZ * simDistUu;
    this.forwardPositions.set([originX, GROUND_Y_UU, originZ, fwdEndX, GROUND_Y_UU, fwdEndZ]);
    this.forwardLine.geometry.attributes.position.needsUpdate = true;
    this.forwardLine.computeLineDistances();

    const simAngleDeg = (((Number(config.offscreenDistanceSimAngleDeg) || 0) % 360) + 360) % 360;
    const rad = (simAngleDeg * Math.PI) / 180;
    const rayRightWeight = -Math.cos(rad);
    const rayFwdWeight = -Math.sin(rad);
    const bearingEndX = originX + (rightX * rayRightWeight + fwdX * rayFwdWeight) * simDistUu;
    const bearingEndZ = originZ + (rightZ * rayRightWeight + fwdZ * rayFwdWeight) * simDistUu;

    this.bearingPositions.set([
      originX,
      GROUND_Y_UU + 0.5,
      originZ,
      bearingEndX,
      GROUND_Y_UU + 0.5,
      bearingEndZ,
    ]);
    this.bearingLine.geometry.attributes.position.needsUpdate = true;
    this.bearingLine.computeLineDistances();

    for (let i = 0; i <= RING_SEGMENTS; i++) {
      const theta = (i / RING_SEGMENTS) * Math.PI * 2;
      const idx = i * 3;
      this.ringPositions[idx] = originX + Math.cos(theta) * simDistUu;
      this.ringPositions[idx + 1] = GROUND_Y_UU;
      this.ringPositions[idx + 2] = originZ + Math.sin(theta) * simDistUu;
    }
    this.distanceRing.geometry.attributes.position.needsUpdate = true;
    this.distanceRing.computeLineDistances();

    const markerRadiusUu = 85;
    for (let i = 0; i <= 24; i++) {
      const theta = (i / 24) * Math.PI * 2;
      const idx = i * 3;
      this.markerPositions[idx] = fwdEndX + Math.cos(theta) * markerRadiusUu;
      this.markerPositions[idx + 1] = GROUND_Y_UU + 1.0;
      this.markerPositions[idx + 2] = fwdEndZ + Math.sin(theta) * markerRadiusUu;
    }
    this.targetMarker.geometry.attributes.position.needsUpdate = true;
    this.targetMarker.computeLineDistances();
  }
}
