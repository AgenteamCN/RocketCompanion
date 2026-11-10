/**
 * scenarioRigProbeAndGoldenDiffPipeline.ts
 * Pure SceneGraph geometry & physics calibration probe, 65f1538d Golden Baseline
 * diffing pipeline, and runtime error/focus environment guards. Inspects live vehicle
 * wheel steer anchors (wheelbase X, track width Z, suspension mount height Y),
 * wheelSpecs, boost outlets, hitbox dimensions, and static vehicle descriptors.
 */

import { HITBOX_PRESETS } from '../../ui-core/config/vehiclePresets.ts';
import {
  INSIDIO_DESCRIPTOR,
  RYZA_DESCRIPTOR,
} from '../../ui-core/config/vehicleDescriptorsConfig.ts';
import {
  FENNEC_DESCRIPTOR,
  getVehicleDescriptor,
  hasVehicleDescriptor,
} from '../../ui-core/config/vehicleTunerConfig.ts';
import {
  GOLDEN_65F1538D_COMMIT,
  GOLDEN_65F1538D_HITBOX_PRESETS,
  GOLDEN_65F1538D_UICORE_COMMIT,
  GOLDEN_65F1538D_VEHICLE_DESCRIPTORS,
} from './goldenBaseline65f1538dData.ts';
import { roundMetric } from './scenarioMetricsPipeline.ts';
import type {
  GoldenBaselineDiffSummary,
  GoldenFieldDiffItem,
  ScenarioRuntimePort,
  VehicleRigGeometryProbeSnapshot,
  VehicleRigGoldenDiffReport,
  VehicleWheelGeometrySample,
} from './ScenarioTypes.ts';

const DEFAULT_COORDINATE_TOLERANCE_UU = 0.05;

function computeMaxAbsDelta(expected: unknown, actual: unknown): number {
  if (typeof expected === 'number' && typeof actual === 'number') {
    if (!Number.isFinite(expected) || !Number.isFinite(actual)) return Infinity;
    return roundMetric(Math.abs(expected - actual), 4);
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const len = Math.max(expected.length, actual.length);
    let maxD = 0;
    for (let i = 0; i < len; i++) {
      const d = computeMaxAbsDelta(expected[i], actual[i]);
      if (d > maxD) maxD = d;
    }
    return roundMetric(maxD, 4);
  }
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
    const expObj = expected as Record<string, unknown>;
    const actObj = actual as Record<string, unknown>;
    const keys = new Set([...Object.keys(expObj), ...Object.keys(actObj)]);
    let maxD = 0;
    for (const k of keys) {
      const d = computeMaxAbsDelta(expObj[k], actObj[k]);
      if (d > maxD) maxD = d;
    }
    return roundMetric(maxD, 4);
  }
  return expected === actual ? 0 : Infinity;
}

export function captureVehicleRigGeometryProbe(
  arena: ScenarioRuntimePort['arena'],
  carIndex = 0
): VehicleRigGeometryProbeSnapshot | null {
  if (!arena || !Array.isArray(arena.cars)) return null;
  const carRoot = arena.cars[carIndex];
  if (!carRoot) return null;

  const visualId = String(arena.vehiclePresets?.[carIndex] || 'fennec').toLowerCase();
  const desc = hasVehicleDescriptor(visualId) ? getVehicleDescriptor(visualId) : null;
  const hitboxPresetId =
    desc?.hitboxPreset || (visualId.startsWith('hitbox-') ? visualId : 'hitbox-octane');
  const hbPreset = HITBOX_PRESETS[hitboxPresetId] || HITBOX_PRESETS['hitbox-octane'];

  const rawWheelSpecs =
    arena.carWheelSpecs?.[carIndex] || arena.vehicleRegistry?.carWheelSpecs?.[carIndex] || [];
  const wheelSpecs: Array<[number, number, number]> = rawWheelSpecs.map((w) => [
    roundMetric(Number(w?.[0] ?? 0), 4),
    roundMetric(Number(w?.[1] ?? 0), 4),
    roundMetric(Number(w?.[2] ?? 0), 4),
  ]);

  const rawWheels = arena.carWheels?.[carIndex] || [];
  const wheels: VehicleWheelGeometrySample[] = [];
  const wheelHeightsY: [number, number, number, number] = [0, 0, 0, 0];

  for (let i = 0; i < 4; i++) {
    const w = rawWheels[i];
    const pos = w?.steer?.position;
    const sx = roundMetric(Number(pos?.x ?? 0), 4);
    const sy = roundMetric(Number(pos?.y ?? 0), 4);
    const sz = roundMetric(Number(pos?.z ?? 0), 4);
    wheelHeightsY[i] = sy;
    const spec = wheelSpecs[i] || [0, 0, 0];
    wheels.push({
      wheelIndex: i,
      steerPosition: [sx, sy, sz],
      steerRotationY: roundMetric(Number(w?.steer?.rotation?.y ?? 0), 4),
      spinRotationZ: roundMetric(Number(w?.spin?.rotation?.z ?? 0), 4),
      specAnchor: [spec[0], spec[1], spec[2]],
    });
  }

  const frontAxleX =
    wheels.length >= 2
      ? roundMetric((wheels[0].steerPosition[0] + wheels[1].steerPosition[0]) * 0.5, 4)
      : 0;
  const rearAxleX =
    wheels.length >= 4
      ? roundMetric((wheels[2].steerPosition[0] + wheels[3].steerPosition[0]) * 0.5, 4)
      : 0;
  const wheelbaseX = roundMetric(frontAxleX - rearAxleX, 4);
  const frontTrackWidthZ =
    wheels.length >= 2
      ? roundMetric(Math.abs(wheels[0].steerPosition[2] - wheels[1].steerPosition[2]), 4)
      : 0;
  const rearTrackWidthZ =
    wheels.length >= 4
      ? roundMetric(Math.abs(wheels[2].steerPosition[2] - wheels[3].steerPosition[2]), 4)
      : 0;

  const rawBoosts = arena.carBoosts?.[carIndex] || [];
  const boostOutlets: Array<[number, number, number]> = rawBoosts.map((em) => {
    const noz = em?.nozzleLocal || em?.offset;
    return [
      roundMetric(Number(noz?.x ?? 0), 4),
      roundMetric(Number(noz?.y ?? 0), 4),
      roundMetric(Number(noz?.z ?? 0), 4),
    ];
  });

  const hitboxDimensions: [number, number, number] | null = hbPreset
    ? [
        roundMetric(hbPreset.length, 4),
        roundMetric(hbPreset.width, 4),
        roundMetric(hbPreset.height, 4),
      ]
    : null;
  const hitboxOffset: [number, number, number] | null = hbPreset
    ? [roundMetric(hbPreset.forward, 4), 0, roundMetric(hbPreset.up, 4)]
    : null;

  const cPos = carRoot.position;
  return {
    carIndex,
    visualId,
    hitboxPresetId,
    carVisible: Boolean(carRoot.visible),
    carPosition: [
      roundMetric(Number(cPos?.x ?? 0), 4),
      roundMetric(Number(cPos?.y ?? 0), 4),
      roundMetric(Number(cPos?.z ?? 0), 4),
    ],
    frontAxleX,
    rearAxleX,
    wheelbaseX,
    frontTrackWidthZ,
    rearTrackWidthZ,
    wheelHeightsY,
    wheels,
    wheelSpecs,
    boostOutlets,
    hitboxDimensions,
    hitboxOffset,
  };
}

export function diffVehicleRigProbeAgainstGolden65f1538d(
  probe: VehicleRigGeometryProbeSnapshot,
  toleranceUu = DEFAULT_COORDINATE_TOLERANCE_UU
): VehicleRigGoldenDiffReport {
  const mismatches: GoldenFieldDiffItem[] = [];
  let maxCoordinateDeltaUu = 0;

  const recordCheck = (field: string, expected: unknown, actual: unknown, tol = toleranceUu) => {
    const delta = computeMaxAbsDelta(expected, actual);
    if (Number.isFinite(delta) && delta > maxCoordinateDeltaUu) maxCoordinateDeltaUu = delta;
    if (delta > tol)
      mismatches.push({ field, expected, actual, maxAbsDelta: delta, passed: false });
  };

  const goldenDesc = GOLDEN_65F1538D_VEHICLE_DESCRIPTORS[probe.visualId];
  const goldenHb =
    GOLDEN_65F1538D_HITBOX_PRESETS[probe.hitboxPresetId] ||
    GOLDEN_65F1538D_HITBOX_PRESETS['hitbox-octane'];

  if (goldenDesc) {
    recordCheck(`${probe.visualId}.wheelSpecs`, goldenDesc.wheelAnchors, probe.wheelSpecs);
    recordCheck(`${probe.visualId}.boostOutlets`, goldenDesc.boostOutlets, probe.boostOutlets);
    recordCheck(
      `${probe.visualId}.wheelbaseX`,
      roundMetric(goldenDesc.wheelAnchors[0][0] - goldenDesc.wheelAnchors[2][0], 4),
      probe.wheelbaseX
    );
    recordCheck(
      `${probe.visualId}.frontTrackWidthZ`,
      roundMetric(Math.abs(goldenDesc.wheelAnchors[0][1] - goldenDesc.wheelAnchors[1][1]), 4),
      probe.frontTrackWidthZ
    );
    recordCheck(
      `${probe.visualId}.rearTrackWidthZ`,
      roundMetric(Math.abs(goldenDesc.wheelAnchors[2][1] - goldenDesc.wheelAnchors[3][1]), 4),
      probe.rearTrackWidthZ
    );
  } else if (goldenHb) {
    recordCheck(`${probe.visualId}.wheelSpecs`, goldenHb.wheelSpecs, probe.wheelSpecs);
    recordCheck(
      `${probe.visualId}.wheelbaseX`,
      roundMetric(goldenHb.wheelSpecs[0][0] - goldenHb.wheelSpecs[2][0], 4),
      probe.wheelbaseX
    );
  }

  if (goldenHb && probe.hitboxDimensions) {
    recordCheck(
      `${probe.hitboxPresetId}.dimensions`,
      [goldenHb.length, goldenHb.width, goldenHb.height],
      probe.hitboxDimensions
    );
  }

  return {
    carIndex: probe.carIndex,
    visualId: probe.visualId,
    goldenReferenceId: goldenDesc ? goldenDesc.id : goldenHb?.id || 'hitbox-octane',
    passed: mismatches.length === 0,
    maxCoordinateDeltaUu: roundMetric(maxCoordinateDeltaUu, 4),
    mismatches,
    probe,
  };
}

export function auditStaticDescriptorsAgainstGolden65f1538d(
  toleranceUu = DEFAULT_COORDINATE_TOLERANCE_UU
): GoldenFieldDiffItem[] {
  const diffs: GoldenFieldDiffItem[] = [];
  const liveDescriptors: Record<string, typeof FENNEC_DESCRIPTOR> = {
    fennec: FENNEC_DESCRIPTOR,
    insidio: INSIDIO_DESCRIPTOR,
    ryza: RYZA_DESCRIPTOR,
  };

  const checkField = (field: string, expected: unknown, actual: unknown, tol = toleranceUu) => {
    const delta = computeMaxAbsDelta(expected, actual);
    diffs.push({ field, expected, actual, maxAbsDelta: delta, passed: delta <= tol });
  };

  for (const [id, golden] of Object.entries(GOLDEN_65F1538D_VEHICLE_DESCRIPTORS)) {
    const live = liveDescriptors[id] || getVehicleDescriptor(id);
    if (!live) {
      diffs.push({
        field: `descriptor.${id}`,
        expected: 'defined',
        actual: 'missing',
        maxAbsDelta: Infinity,
        passed: false,
      });
      continue;
    }
    checkField(`descriptor.${id}.wheelAnchors`, golden.wheelAnchors, live.wheelAnchors);
    checkField(
      `descriptor.${id}.suspensionHeights`,
      golden.suspensionHeights,
      live.suspensionHeights
    );
    checkField(`descriptor.${id}.boostOutlets`, golden.boostOutlets, live.boostOutlets);
    checkField(
      `descriptor.${id}.boostNozzleParams`,
      golden.boostNozzleParams,
      live.boostNozzleParams
    );
    checkField(
      `descriptor.${id}.alignment.centerOffset`,
      golden.alignment.centerOffset,
      live.alignment?.centerOffset
    );
    checkField(`descriptor.${id}.colors.default`, golden.colors.default, live.colors?.default, 0);
  }

  for (const [hbId, goldenHb] of Object.entries(GOLDEN_65F1538D_HITBOX_PRESETS)) {
    const liveHb = HITBOX_PRESETS[hbId];
    if (!liveHb) {
      diffs.push({
        field: `hitbox.${hbId}`,
        expected: 'defined',
        actual: 'missing',
        maxAbsDelta: Infinity,
        passed: false,
      });
      continue;
    }
    checkField(
      `hitbox.${hbId}.dimensions`,
      [goldenHb.length, goldenHb.width, goldenHb.height, goldenHb.forward, goldenHb.up],
      [liveHb.length, liveHb.width, liveHb.height, liveHb.forward, liveHb.up]
    );
  }

  return diffs;
}

export function buildGoldenBaselineDiffSummary(
  arena: ScenarioRuntimePort['arena'],
  preCapturedProbes: readonly VehicleRigGeometryProbeSnapshot[] = [],
  toleranceUu = DEFAULT_COORDINATE_TOLERANCE_UU
): GoldenBaselineDiffSummary {
  const staticDescriptorDiffs = auditStaticDescriptorsAgainstGolden65f1538d(toleranceUu);
  const staticDescriptorChecksPassed = staticDescriptorDiffs.every((d) => d.passed);

  const probesToDiff: VehicleRigGeometryProbeSnapshot[] = [...preCapturedProbes];
  if (probesToDiff.length === 0 && arena && Array.isArray(arena.cars)) {
    for (let i = 0; i < Math.min(6, arena.cars.length); i++) {
      if (arena.cars[i]) {
        const p = captureVehicleRigGeometryProbe(arena, i);
        if (p) probesToDiff.push(p);
      }
    }
  }

  const vehicleRigDiffs = probesToDiff.map((p) =>
    diffVehicleRigProbeAgainstGolden65f1538d(p, toleranceUu)
  );
  const rigsPassed = vehicleRigDiffs.every((r) => r.passed);

  return {
    referenceCommit: GOLDEN_65F1538D_COMMIT,
    referenceUiCoreCommit: GOLDEN_65F1538D_UICORE_COMMIT,
    passed: staticDescriptorChecksPassed && rigsPassed,
    staticDescriptorChecksPassed,
    staticDescriptorDiffs,
    vehicleRigDiffs,
  };
}
