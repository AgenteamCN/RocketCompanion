import {
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  type Vector3,
  type Vector4,
} from 'three';

import {
  experimentalWallFxRuntimeConfig,
  type ExperimentalWallFxConfig,
} from '../../../ui-core/config/atmosphereFxConfig.ts';
import { ballVisualRuntimeConfig } from '../../../ui-core/config/ballVisualConfig.ts';
import type { DriftwoodsGroundConfig } from '../../../ui-core/config/driftwoodsConfig.ts';
import {
  PULSE_DIRECTION_MAP,
  PULSE_STEADY_MODE_MAP,
  type WallFxUniforms,
} from './WallFxShaderInjector.ts';

export interface WallFxRuntimeManagerTarget {
  wallFxConfig: ExperimentalWallFxConfig;
  wallFxUniforms: WallFxUniforms;
  groundUniforms?: {
    uBallRingPos: { value: Vector3 };
    uBallRingRadii: { value: Vector4 };
    uBallRingOpacity: { value: number };
  };
  circlePreviewMesh: Group | null;
  pulsePreviewMesh: Group | null;
  config?: {
    ground?: Partial<DriftwoodsGroundConfig>;
  };
  bakeQ1GroundTextures(ground: Partial<DriftwoodsGroundConfig> | null | undefined): void;
}

export function createSpherePreviewMeshes(
  scene: Group | null | undefined,
  wallFxConfig: Partial<ExperimentalWallFxConfig>
) {
  if (!scene) return null;
  const invParentScale = 1 / (scene.scale?.x || 100);
  const group = new Group();
  group.name = 'Experimental_Virtual_Spheres_Preview';
  group.scale.setScalar(invParentScale);

  const unitSphereGeo = new SphereGeometry(1, 32, 24);

  const circleGroup = new Group();
  const circleFillMat = new MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    side: DoubleSide,
  });
  const circleWireMat = new MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.55,
    wireframe: true,
    depthWrite: false,
  });
  circleGroup.add(new Mesh(unitSphereGeo, circleFillMat), new Mesh(unitSphereGeo, circleWireMat));
  circleGroup.visible = Boolean(wallFxConfig.circleShowSpherePreview);

  const pulseGroup = new Group();
  const pulseFillMat = new MeshBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
    side: DoubleSide,
  });
  const pulseWireMat = new MeshBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.5,
    wireframe: true,
    depthWrite: false,
  });
  pulseGroup.add(new Mesh(unitSphereGeo, pulseFillMat), new Mesh(unitSphereGeo, pulseWireMat));
  pulseGroup.visible = Boolean(wallFxConfig.pulseShowSpherePreview);

  group.add(circleGroup, pulseGroup);
  scene.add(group);

  return { group, circlePreviewMesh: circleGroup, pulsePreviewMesh: pulseGroup };
}

export function syncManagerSpherePreviewMeshes(manager: WallFxRuntimeManagerTarget): void {
  const c = manager.wallFxConfig;
  const u = manager.wallFxUniforms;
  if (manager.circlePreviewMesh) {
    const rX = Math.max(10, Number(c.circleRadius) || 500);
    const rY = Math.max(10, rX + (Number(c.circleVerticalExtendUu) || 0));
    manager.circlePreviewMesh.visible = Boolean(c.circleShowSpherePreview && c.circleEnabled);
    manager.circlePreviewMesh.scale.set(rX, rY, rX);
    manager.circlePreviewMesh.position.copy(u.uCircleBallPos.value);
  }
  if (manager.pulsePreviewMesh) {
    const rX = Math.max(10, Number(c.pulseSphereRadius) || 4000);
    const rY = Math.max(10, rX + (Number(c.pulseVerticalExtendUu) || 0));
    manager.pulsePreviewMesh.visible = Boolean(c.pulseShowSpherePreview && c.pulseEnabled);
    manager.pulsePreviewMesh.scale.set(rX, rY, rX);
    manager.pulsePreviewMesh.position.copy(u.uPulseBallPos.value);
  }
}

export function updateManagerBallProximity(
  manager: WallFxRuntimeManagerTarget,
  ballPos: Vector3 | null | undefined,
  _ballVel: Vector3 | null | undefined,
  dt = 0.016
): void {
  manager.wallFxUniforms.uTime.value += Math.max(0, Math.min(0.1, dt || 0.016));
  const t = manager.wallFxUniforms.uTime.value;
  const c = manager.wallFxConfig;

  if (c.circlePreviewOrbit || c.previewBallNearWall) {
    manager.wallFxUniforms.uCircleBallPos.value.set(
      3820,
      420 + Math.sin(t * 1.4) * 220,
      Math.cos(t * 0.8) * 900
    );
  } else if (ballPos) {
    manager.wallFxUniforms.uCircleBallPos.value.copy(ballPos);
  }

  if (c.pulsePreviewOrbit || c.previewBallNearWall) {
    manager.wallFxUniforms.uPulseBallPos.value.set(
      3820,
      420 + Math.sin(t * 1.4) * 220,
      Math.cos(t * 0.8) * 900
    );
  } else if (ballPos) {
    manager.wallFxUniforms.uPulseBallPos.value.copy(ballPos);
  }

  if (ballPos && manager.groundUniforms?.uBallRingPos) {
    manager.groundUniforms.uBallRingPos.value.copy(ballPos);
    const ringRadius = 95 * 1.15;
    const innerRadius = ringRadius * 0.92;
    const height = Math.max(0, ballPos.y - 95);
    const scale = 0.86 - 0.68 * Math.min(1, height / 1600);
    manager.groundUniforms.uBallRingRadii.value.set(
      innerRadius,
      ringRadius,
      innerRadius * scale,
      ringRadius * scale
    );
    manager.groundUniforms.uBallRingOpacity.value =
      ballVisualRuntimeConfig.visible === false
        ? 0.0
        : Math.max(0, Math.min(1, Number(ballVisualRuntimeConfig.indicatorRingOpacity) ?? 0.2));
  }

  if (c.circleShowSpherePreview || c.pulseShowSpherePreview) {
    syncManagerSpherePreviewMeshes(manager);
  }
}

export function updateManagerExperimentalWallConfig(
  manager: WallFxRuntimeManagerTarget,
  patch: Partial<ExperimentalWallFxConfig> | null | undefined
): void {
  if (!patch) return;
  Object.assign(manager.wallFxConfig, patch);
  Object.assign(experimentalWallFxRuntimeConfig, manager.wallFxConfig);
  const c = manager.wallFxConfig;
  const u = manager.wallFxUniforms;

  u.uCircleEnabled.value = c.circleEnabled ? 1.0 : 0.0;
  u.uCircleRadius.value = Number(c.circleRadius) || 500;
  u.uCircleVerticalExtendUu.value = Number(c.circleVerticalExtendUu) || 0;
  u.uCircleThickness.value = Number(c.circleThickness) || 5;
  if (c.circleColor) u.uCircleColor.value.set(c.circleColor);
  u.uCircleUseTeamColor.value = c.circleUseTeamColor ? 1.0 : 0.0;
  u.uCircleOpacity.value = Number(c.circleOpacity) ?? 0.75;

  u.uPulseEnabled.value = c.pulseEnabled ? 1.0 : 0.0;
  if (u.uPulseApplyToHexes) u.uPulseApplyToHexes.value = c.pulseApplyToHexes !== false ? 1.0 : 0.0;
  if (u.uPulseApplyToWalls) u.uPulseApplyToWalls.value = c.pulseApplyToWalls ? 1.0 : 0.0;
  u.uPulseSphereRadius.value = Number(c.pulseSphereRadius) || 4000;
  u.uPulseVerticalExtendUu.value = Number(c.pulseVerticalExtendUu) || 0;
  if (u.uPulseDirection) u.uPulseDirection.value = PULSE_DIRECTION_MAP[c.pulseDirection] ?? 1;
  if (u.uPulseFadeShrinkPct) u.uPulseFadeShrinkPct.value = Number(c.pulseFadeShrinkPct ?? 50);
  if (u.uPulseFadeBezier) {
    u.uPulseFadeBezier.value.set(
      Number(c.pulseFadeBezierP1X ?? 0.5),
      Number(c.pulseFadeBezierP1Y ?? 0.0),
      Number(c.pulseFadeBezierP2X ?? 1.0),
      Number(c.pulseFadeBezierP2Y ?? 0.0)
    );
  }
  if (u.uPulseSteadyMode) u.uPulseSteadyMode.value = PULSE_STEADY_MODE_MAP[c.pulseSteadyMode] ?? 0;
  if (u.uPulseStaticPositionPct) {
    u.uPulseStaticPositionPct.value = Number(c.pulseStaticPositionPct ?? 47);
  }
  if (u.uPulseStaticBandWidthPct) {
    u.uPulseStaticBandWidthPct.value = Number(c.pulseStaticBandWidthPct ?? 5);
  }
  u.uPulseIntervalSec.value = Number(c.pulseIntervalSec) || 1.0;
  if (u.uPulseRiseDurationSec) {
    u.uPulseRiseDurationSec.value = Number(c.pulseRiseDurationSec ?? 0.01);
  }
  if (u.uPulseFallDurationSec) {
    u.uPulseFallDurationSec.value = Number(c.pulseFallDurationSec ?? 0.2);
  }
  u.uPulseSpeedRadiusPct.value = Number(c.pulseSpeedRadiusPct) || 50;
  if (u.uPulseRiseBezier) {
    u.uPulseRiseBezier.value.set(
      Number(c.pulseRiseBezierP1X ?? 0.33),
      Number(c.pulseRiseBezierP1Y ?? 0.33),
      Number(c.pulseRiseBezierP2X ?? 0.67),
      Number(c.pulseRiseBezierP2Y ?? 0.67)
    );
  }
  if (u.uPulseFallBezier) {
    u.uPulseFallBezier.value.set(
      Number(c.pulseFallBezierP1X ?? 0.0),
      Number(c.pulseFallBezierP1Y ?? 0.5),
      Number(c.pulseFallBezierP2X ?? 0.0),
      Number(c.pulseFallBezierP2Y ?? 1.01)
    );
  }
  u.uPulseIntensity.value = Number(c.pulseIntensity) ?? 1.0;
  if (c.pulseColor) u.uPulseColor.value.set(c.pulseColor);
  u.uPulseMultiplyTeamColor.value = c.pulseMultiplyTeamColor ? 1.0 : 0.0;
  u.uPulseOpacity.value = Number(c.pulseOpacity) ?? 0.92;

  u.uTeamGradientEnabled.value = c.teamGradientEnabled ? 1.0 : 0.0;
  u.uCenterLineWidth.value = Number(c.centerLineWidth) ?? 5;
  u.uTeamTransitionWidth.value = Number(c.teamTransitionWidth) ?? 1000;
  u.uTeamColorStrength.value = Number(c.teamColorStrength) ?? 0.8;
  if (c.blueTeamColor) u.uBlueTeamColor.value.set(c.blueTeamColor);
  u.uBlueTeamAlpha.value = Number(c.blueTeamAlpha) ?? 0.85;
  if (c.orangeTeamColor) u.uOrangeTeamColor.value.set(c.orangeTeamColor);
  u.uOrangeTeamAlpha.value = Number(c.orangeTeamAlpha) ?? 0.85;
  if (c.centerLineColor) u.uCenterLineColor.value.set(c.centerLineColor);
  u.uCenterLineAlpha.value = Number(c.centerLineAlpha) ?? 0.0;

  if ((patch.blueTeamColor || patch.orangeTeamColor) && manager.config?.ground) {
    manager.bakeQ1GroundTextures(manager.config.ground);
  }

  syncManagerSpherePreviewMeshes(manager);
}
