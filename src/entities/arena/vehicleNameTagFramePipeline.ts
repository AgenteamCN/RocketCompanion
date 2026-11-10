import * as THREE from 'three';
import {
  formatNameTagDisplayText,
  resolveCarSlotCode,
  shouldUseSingleCharIndicator,
  type NameTagBoostBorderOverride,
  type NameTagCarEntry,
  type NameTagCarTelemetry,
  type NameTagConfig,
  type NameTagRuntimeState,
} from '../../ui-core/config/nameTagConfig.ts';
import type { CarAerialClimbStatus } from './VehicleAerialClimbTracker.ts';
import { setNameTagTelemetrySnapshot } from '../../game/runtimeUiPort.ts';
import {
  renderPillCardToSprite,
  roundMetric,
  type NameTagOffscreenIndicatorCard2D,
  type NameTagSprite,
  type VisibleNameTagCard2D,
} from './VehicleNameTagCanvasRenderer.ts';
import { resolveCarBoostBorderState } from './VehicleNameTagBoostBorderPolicy.ts';
import { resolveCarAerialClimbSimulation } from './VehicleNameTagGroundSimVisual.ts';
import { projectCarNameTag, type CarProjectionConfigParams } from './VehicleNameTagProjector.ts';

export interface NameTagArenaHost {
  ball?: THREE.Object3D | null;
  ballRadius?: number;
  cars?: Array<THREE.Object3D | null | undefined>;
  carTeams?: ArrayLike<number>;
  carColors?: Array<string | number | null | undefined>;
  carBoostAmounts?: ArrayLike<number>;
  carVerticalVelZUu?: ArrayLike<number>;
  carAirborneFlipExhausted?: ArrayLike<number>;
  carAerialClimbStatuses?: ArrayLike<CarAerialClimbStatus>;
  camera?: THREE.PerspectiveCamera | null;
  cameraMode?: string;
  isFreeCam?: boolean;
  isPovCamera?: boolean;
  isGoalReplayActive?: boolean;
  isLobbyMode?: boolean;
  focusedCarIndex?: number;
  playerCarIndex?: number;
  boostBorderOverride?: NameTagBoostBorderOverride;
}

export function shouldShowVehicleNameTags(
  config: NameTagConfig,
  runtimeState: NameTagRuntimeState,
  arena: NameTagArenaHost,
  numCars: number
): boolean {
  const isGoalReplay = Boolean(arena.isGoalReplayActive);
  return (
    Boolean(config.enabled) &&
    Boolean(
      runtimeState.isTunerArenaActive ||
      runtimeState.isMultiplayerOrMultiCarMode ||
      arena.isLobbyMode ||
      config.aerialClimbSimulatePovInTuner ||
      config.offscreenDistanceSimEnabled ||
      config.showOnLocalCar ||
      isGoalReplay ||
      arena.cameraMode === 'director' ||
      runtimeState.activeCameraMode === 'director' ||
      numCars > 1
    )
  );
}

export function resolveNameTagCarTeam(
  carEntries: NameTagCarEntry[],
  arenaCarTeams: ArrayLike<number> | undefined,
  carIdx: number
): 0 | 1 {
  const entry = carEntries.find((item) => item.carIndex === carIdx);
  const t = entry?.team as unknown;
  const raw =
    typeof t === 'number'
      ? t
      : t === 'orange'
        ? 1
        : t === 'blue'
          ? 0
          : (arenaCarTeams?.[carIdx] ?? (carIdx < 3 ? 0 : 1));
  return Number(raw) === 1 ? 1 : 0;
}

export function resolveLiveCarColorHex(
  rawColor: string | number | null | undefined
): string | null {
  if (typeof rawColor === 'string') return rawColor;
  if (typeof rawColor === 'number') {
    return `#${(Math.trunc(rawColor) & 0xffffff).toString(16).padStart(6, '0')}`;
  }
  return null;
}

export interface StepNameTagCarSlotsParams {
  sprites: NameTagSprite[];
  maxSlots: number;
  arena: NameTagArenaHost;
  config: NameTagConfig;
  runtimeState: NameTagRuntimeState;
  carEntries: NameTagCarEntry[];
  camMode: string;
  isPovCam: boolean;
  isGoalReplay: boolean;
  focusedIdx: number;
  focusedCarTeam: 0 | 1;
  sysOverride: NameTagBoostBorderOverride;
  activeCam: THREE.PerspectiveCamera | null;
  cameraUpVector: THREE.Vector3;
  cameraForwardVector: THREE.Vector3;
  cameraRightVector: THREE.Vector3;
  projVector: THREE.Vector3;
  measureCtx: CanvasRenderingContext2D | null;
  pillProjectionParams: CarProjectionConfigParams;
  singleCharProjectionParams: CarProjectionConfigParams;
  useOverlay: boolean;
  visibleSprites: NameTagSprite[];
  visibleCards2D: VisibleNameTagCard2D[];
  offscreenIndicators2D: NameTagOffscreenIndicatorCard2D[];
  telemetryCars: NameTagCarTelemetry[];
}

export function stepNameTagCarSlots(p: StepNameTagCarSlotsParams): void {
  const {
    sprites,
    maxSlots,
    arena,
    config,
    runtimeState,
    carEntries,
    camMode,
    isPovCam,
    isGoalReplay,
    focusedIdx,
    focusedCarTeam,
    sysOverride,
    activeCam,
    cameraUpVector,
    cameraForwardVector,
    cameraRightVector,
    projVector,
    measureCtx,
    pillProjectionParams,
    singleCharProjectionParams,
    useOverlay,
    visibleSprites,
    visibleCards2D,
    offscreenIndicators2D,
    telemetryCars,
  } = p;

  for (let carIndex = 0; carIndex < sprites.length; carIndex++) {
    const sprite = sprites[carIndex];
    if (!sprite) continue;
    const carMesh = arena.cars?.[carIndex];
    if (carIndex >= maxSlots || !carMesh?.visible) {
      sprite.visible = false;
      continue;
    }

    const shouldHideFocusedCar = isPovCam && carIndex === focusedIdx && !config.showOnLocalCar;
    const carEntry = carEntries.find((e) => e.carIndex === carIndex);
    const rawName =
      carEntry?.name ||
      (carEntry as { username?: string } | undefined)?.username ||
      config.previewNames?.[carIndex % 6] ||
      `Player ${carIndex + 1}`;
    const team = resolveNameTagCarTeam(carEntries, arena.carTeams, carIndex);
    const isSingleChar = shouldUseSingleCharIndicator(config, team, focusedCarTeam);
    const projectionParams = isSingleChar ? singleCharProjectionParams : pillProjectionParams;
    const displayText = isSingleChar
      ? resolveCarSlotCode(carIndex, team, config.slotCodes)
      : formatNameTagDisplayText(rawName, projectionParams.maxChars);
    const liveBoost =
      arena.carBoostAmounts && carIndex < arena.carBoostAmounts.length
        ? Number(arena.carBoostAmounts[carIndex])
        : undefined;

    const simClimb = resolveCarAerialClimbSimulation({
      config,
      carIndex,
      focusedCarIndex: focusedIdx,
      isTunerArenaActive: Boolean(runtimeState.isTunerArenaActive),
      carEntry,
      carAerialClimbStatuses: arena.carAerialClimbStatuses,
      carAirborneFlipExhausted: arena.carAirborneFlipExhausted,
      carVerticalVelZUu: arena.carVerticalVelZUu,
    });

    const boostState = resolveCarBoostBorderState({
      config,
      carEntry: simClimb.effectiveCarEntry,
      carIndex,
      carTeam: team,
      focusedCarIndex: focusedIdx,
      focusedCarTeam,
      isGoalReplayActive: isGoalReplay,
      isCinematicCamera: camMode === 'director',
      isTunerFreeCamOverview: Boolean(runtimeState.isTunerArenaActive && camMode === 'free'),
      liveCarBoostAmount: liveBoost,
      liveCarDoubleJumpedAndClimbing: simClimb.liveCarDoubleJumpedAndClimbing,
      runtimeOverride: runtimeState.boostBorderOverride,
      systemOverride: sysOverride,
    });

    const projected = projectCarNameTag({
      carIndex,
      carMesh,
      rawName,
      displayText,
      team,
      shouldHideFocusedCar,
      boostAmount: boostState.boostAmount,
      boostBorderVisible: boostState.visible,
      boostFraction: boostState.boostFraction,
      boostBorderColorHex: boostState.borderColorHex,
      offscreenAudienceVisible: boostState.offscreenAudienceVisible,
      isDoubleJumpedAndClimbing: boostState.isDoubleJumpedAndClimbing,
      aerialClimbGlowVisible: boostState.aerialClimbGlowVisible,
      aerialClimbTriggerReason: simClimb.aerialClimbTriggerReason,
      carAltitudeUu: simClimb.activeClimbStatus?.altitudeUu,
      carVelZUu: simClimb.activeClimbStatus?.velZUu,
      carPitchFwdZ: simClimb.activeClimbStatus?.pitchFwdZ,
      carJumpHoldMs: simClimb.activeClimbStatus?.maxJumpHoldMs,
      povCarPosition: arena.cars?.[focusedIdx]?.position ?? null,
      liveCarColorHex: resolveLiveCarColorHex(arena.carColors?.[carIndex]),
      activeCamera: activeCam,
      cameraUpVector,
      cameraForwardVector,
      cameraRightVector,
      projVector,
      measureCtx,
      params: projectionParams,
    });

    if (!projected) {
      sprite.visible = false;
      continue;
    }
    if (projected.telemetry) telemetryCars.push(projected.telemetry);
    if (shouldHideFocusedCar) {
      sprite.visible = false;
      continue;
    }
    if (projected.isOffscreen) {
      sprite.visible = false;
      if (projected.offscreenIndicator2D) {
        offscreenIndicators2D.push(projected.offscreenIndicator2D);
      }
      continue;
    }

    sprite.userData.cameraDistanceSq = projected.cameraDistanceSq;
    sprite.position.set(projected.spritePosX, projected.spritePosY, projected.spritePosZ);
    sprite.scale.set(projected.baseWidthWorld, projected.baseHeightWorld, 1);

    if (useOverlay && activeCam?.projectionMatrix) {
      sprite.visible = false;
      if (projected.card2D) visibleCards2D.push(projected.card2D);
    } else {
      renderPillCardToSprite({
        sprite,
        displayText,
        team,
        config,
        variant: projectionParams.variant,
        carPillWidthPx: projected.carPillWidthPx,
        effectiveCornerRadiusPx: projected.effectiveCornerRadiusPx,
        boostBorderVisible: boostState.visible,
        boostFraction: boostState.boostFraction,
        boostBorderColor: boostState.borderColorHex,
        aerialClimbGlowVisible: false,
      });
      sprite.material.opacity = projectionParams.cardOpacity;
      sprite.visible = true;
      visibleSprites.push(sprite);
    }
  }
}

export function publishNameTagFrameTelemetry(
  vw: number,
  vh: number,
  dpr: number,
  camMode: string,
  focusedIdx: number,
  fovDeg: number,
  activeCam: THREE.PerspectiveCamera | null,
  cameraForwardVector: THREE.Vector3,
  cameraUpVector: THREE.Vector3,
  telemetryCars: NameTagCarTelemetry[]
): void {
  const r1 = (n: number) => roundMetric(n, 1);
  const r4 = (n: number) => roundMetric(n, 4);
  setNameTagTelemetrySnapshot({
    updatedAtMs: Date.now(),
    viewportWidthPx: vw,
    viewportHeightPx: vh,
    aspectRatio: vw / Math.max(1, vh),
    devicePixelRatio: dpr,
    cameraMode: camMode,
    focusedCarIndex: focusedIdx,
    cameraFovDeg: fovDeg,
    cameraPosition: activeCam?.position
      ? [r1(activeCam.position.x), r1(activeCam.position.y), r1(activeCam.position.z)]
      : [0, 0, 0],
    cameraForward: [
      r4(cameraForwardVector.x),
      r4(cameraForwardVector.y),
      r4(cameraForwardVector.z),
    ],
    cameraUp: [r4(cameraUpVector.x), r4(cameraUpVector.y), r4(cameraUpVector.z)],
    cars: telemetryCars,
  });
}
