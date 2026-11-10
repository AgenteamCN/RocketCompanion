#!/usr/bin/env node
/**
 * scripts/extractGoldenBaseline65f1538d.mjs
 * Automatically extracts static vehicle calibration specs (wheel anchors, suspension rest heights,
 * boost outlets, boost nozzle params, default colors), hitbox presets, mutator defaults,
 * and authoritative signal/incident hexadecimal tables directly from commit 65f1538d
 * (and its corresponding src/ui-core submodule commit 8d71a71f).
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const rootRequire = createRequire(import.meta.url);
const viteRequire = createRequire(rootRequire.resolve('vite'));
const esbuild = viteRequire('esbuild');

const ROOT_DIR = process.cwd();
const DEFAULT_COMMIT = '65f1538d';
const DEFAULT_OUT = path.join(ROOT_DIR, 'src/game/scenario/goldenBaseline65f1538dData.ts');

function parseArgs(argv) {
  let commit = DEFAULT_COMMIT;
  let outPath = DEFAULT_OUT;
  let jsonOutPath = null;
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--commit=')) {
      commit = arg.slice('--commit='.length).trim() || DEFAULT_COMMIT;
    } else if (arg.startsWith('--out=')) {
      outPath = path.resolve(ROOT_DIR, arg.slice('--out='.length).trim());
    } else if (arg.startsWith('--json=')) {
      jsonOutPath = path.resolve(ROOT_DIR, arg.slice('--json='.length).trim());
    }
  }
  return { commit, outPath, jsonOutPath };
}

function gitShow(repoDir, revAndPath) {
  return execSync(`git --no-pager show ${revAndPath}`, {
    cwd: repoDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function resolveSubmoduleCommit(mainCommit, submodulePath) {
  const line = execSync(`git ls-tree ${mainCommit} ${submodulePath}`, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  }).trim();
  const parts = line.split(/\s+/);
  return parts[2];
}

function evalTypeScriptModule(tsSource, mockImports = {}) {
  const transpiled = esbuild.transformSync(tsSource, {
    loader: 'ts',
    format: 'cjs',
    target: 'es2022',
  }).code;

  const exportsObj = {};
  const moduleObj = { exports: exportsObj };
  const sandbox = {
    exports: exportsObj,
    module: moduleObj,
    require: (id) => {
      if (id in mockImports) return mockImports[id];
      throw new Error(`Unexpected import "${id}" during golden baseline evaluation`);
    },
    Object,
    Array,
    Number,
    String,
    Boolean,
    Math,
    console,
  };
  vm.runInNewContext(transpiled, sandbox);
  return moduleObj.exports;
}

function formatCompactObjectEntries(obj, indent = '  ') {
  const lines = Object.entries(obj).map(
    ([k, v]) => `${indent}${JSON.stringify(k)}: ${JSON.stringify(v)},`
  );
  return `{\n${lines.join('\n')}\n}`;
}

function extractGoldenData(mainCommit) {
  const uiCoreCommit = resolveSubmoduleCommit(mainCommit, 'src/ui-core');
  const uiCoreDir = path.join(ROOT_DIR, 'src/ui-core');

  const descriptorsTs = gitShow(uiCoreDir, `${uiCoreCommit}:config/vehicleDescriptorsConfig.ts`);
  const constantsTs = gitShow(uiCoreDir, `${uiCoreCommit}:config/vehicleConstants.ts`);
  const rocketSimConstantsTs = gitShow(ROOT_DIR, `${mainCommit}:src/physics/RocketSimConstants.ts`);
  const suspensionSystemTs = gitShow(
    ROOT_DIR,
    `${mainCommit}:src/entities/VehicleSuspensionSystem.ts`
  );

  const descriptorsMod = evalTypeScriptModule(descriptorsTs);
  const constantsMod = evalTypeScriptModule(constantsTs);
  const rocketSimMod = evalTypeScriptModule(rocketSimConstantsTs);

  const suspensionMod = evalTypeScriptModule(suspensionSystemTs, {
    three: {
      Vector3: class {
        constructor(x = 0, y = 0, z = 0) {
          this.x = x;
          this.y = y;
          this.z = z;
        }
      },
    },
    '../ui-core/config/vehicleTunerConfig': {
      getVehicleDescriptor: (id) => {
        const map = {
          fennec: descriptorsMod.FENNEC_DESCRIPTOR,
          insidio: descriptorsMod.INSIDIO_DESCRIPTOR,
          ryza: descriptorsMod.RYZA_DESCRIPTOR,
        };
        return map[id] || null;
      },
      hasVehicleDescriptor: (id) => ['fennec', 'insidio', 'ryza'].includes(id),
      wheelModifierRuntimeConfig: { verticalOffsetY: 0 },
    },
    '../ui-core/config/vehicleConstants': {
      normalizeVisualId: (id) => {
        if (typeof id === 'string' && id.startsWith('hitbox-')) return id;
        return constantsMod.normalizeVisualId(id);
      },
    },
  });

  const pickDescriptorSnapshot = (desc) => ({
    id: desc.id,
    name: desc.name,
    hitboxPreset: desc.hitboxPreset,
    rawBounds: desc.rawBounds,
    alignment: desc.alignment,
    wheelNames: desc.wheelNames,
    wheelAnchors: desc.wheelAnchors,
    suspensionHeights: desc.suspensionHeights,
    boostOutlets: desc.boostOutlets,
    boostNozzleParams: desc.boostNozzleParams,
    colors: desc.colors,
    chassisRestHeightUu: suspensionMod.getCarRestHeight(desc.id),
  });

  const vehicleDescriptors = {
    fennec: pickDescriptorSnapshot(descriptorsMod.FENNEC_DESCRIPTOR),
    insidio: pickDescriptorSnapshot(descriptorsMod.INSIDIO_DESCRIPTOR),
    ryza: pickDescriptorSnapshot(descriptorsMod.RYZA_DESCRIPTOR),
  };

  const hitboxPresets = {};
  for (const [id, spec] of Object.entries(constantsMod.HITBOX_PRESETS)) {
    hitboxPresets[id] = {
      ...spec,
      chassisRestHeightUu: suspensionMod.getCarRestHeight(id),
      wheelSpecs: suspensionMod.getWheelSpecsForVisual(id),
    };
  }

  return {
    sourceMainCommit: mainCommit,
    sourceUiCoreCommit: uiCoreCommit,
    vehicleDescriptors,
    hitboxPresets,
    rocketSimHitboxPresets: rocketSimMod.HITBOX_PRESETS,
    defaultMutatorConfig: rocketSimMod.DEFAULT_SOCCAR_MUTATOR_CONFIG,
    incidentEventTypes: rocketSimMod.INCIDENT_EVENT_TYPES,
    signalEventTypes: rocketSimMod.SIGNAL_EVENT_TYPES,
    systemControlSignals: rocketSimMod.SYSTEM_CONTROL_SIGNALS,
    clientCommandTypes: rocketSimMod.CLIENT_COMMAND_TYPES,
  };
}

function formatDescriptorEntries(descriptors) {
  const blocks = [];
  for (const [key, d] of Object.entries(descriptors)) {
    blocks.push(`  ${JSON.stringify(key)}: {
    id: ${JSON.stringify(d.id)},
    name: ${JSON.stringify(d.name)},
    hitboxPreset: ${JSON.stringify(d.hitboxPreset)},
    rawBounds: ${JSON.stringify(d.rawBounds)},
    alignment: ${JSON.stringify(d.alignment)},
    wheelNames: ${JSON.stringify(d.wheelNames)},
    wheelAnchors: ${JSON.stringify(d.wheelAnchors)},
    suspensionHeights: ${JSON.stringify(d.suspensionHeights)},
    boostOutlets: ${JSON.stringify(d.boostOutlets)},
    boostNozzleParams: ${JSON.stringify(d.boostNozzleParams)},
    colors: ${JSON.stringify(d.colors)},
    chassisRestHeightUu: ${d.chassisRestHeightUu},
  }`);
  }
  return `{\n${blocks.join(',\n')},\n}`;
}

function formatHitboxEntries(hitboxes) {
  const blocks = [];
  for (const [key, h] of Object.entries(hitboxes)) {
    blocks.push(`  ${JSON.stringify(key)}: {
    index: ${h.index},
    id: ${JSON.stringify(h.id)},
    name: ${JSON.stringify(h.name)},
    length: ${h.length},
    width: ${h.width},
    height: ${h.height},
    forward: ${h.forward},
    up: ${h.up},
    chassisRestHeightUu: ${h.chassisRestHeightUu},
    wheelSpecs: ${JSON.stringify(h.wheelSpecs)},
  }`);
  }
  return `{\n${blocks.join(',\n')},\n}`;
}

function main() {
  const { commit, outPath, jsonOutPath } = parseArgs(process.argv);
  const golden = extractGoldenData(commit);

  if (jsonOutPath) {
    fs.mkdirSync(path.dirname(jsonOutPath), { recursive: true });
    fs.writeFileSync(jsonOutPath, JSON.stringify(golden, null, 2) + '\n', 'utf8');
    console.log(`[GoldenExtractor] Wrote JSON snapshot to ${jsonOutPath}`);
  }

  const tsBanner = `/**
 * goldenBaseline65f1538dData.ts
 * Auto-generated by scripts/extractGoldenBaseline65f1538d.mjs from commit ${golden.sourceMainCommit}
 * (src/ui-core submodule commit ${golden.sourceUiCoreCommit}).
 * Provides the immutable 65f1538d golden calibration snapshot for SceneGraph vehicle rig
 * geometry probes (wheel anchors, suspension rest heights, boost outlets, hitboxes),
 * mutator parameters, and authoritative signal/incident contracts.
 */

export interface GoldenVehicleDescriptorSpec {
  id: string;
  name: string;
  hitboxPreset: string;
  rawBounds: {
    min: [number, number, number];
    max: [number, number, number];
    length: number;
    height: number;
    width: number;
    center: [number, number, number];
    roofTopY: number;
    rlHitboxTopY: number;
  };
  alignment: {
    scale: number;
    scaleX: number;
    scaleY: number;
    scaleZ: number;
    centerOffset: [number, number, number];
  };
  wheelNames: readonly string[];
  wheelAnchors: ReadonlyArray<readonly [number, number, number]>;
  suspensionHeights: readonly [number, number, number, number];
  boostOutlets: ReadonlyArray<readonly [number, number, number]>;
  boostNozzleParams: {
    x: number;
    y: number;
    z: number;
    followChassisOffset: boolean;
  };
  colors: {
    default: {
      primary: number;
      realisticPrimary: number;
      pearl: number;
    };
  };
  chassisRestHeightUu: number;
}

export interface GoldenHitboxPresetSpec {
  index: number;
  id: string;
  name: string;
  length: number;
  width: number;
  height: number;
  forward: number;
  up: number;
  chassisRestHeightUu: number;
  wheelSpecs: ReadonlyArray<readonly [number, number, number]>;
}

export interface VehicleWheelGeometrySample {
  wheelIndex: number;
  steerPosition: [number, number, number];
  steerRotationY: number; spinRotationZ: number;
  specAnchor: [number, number, number];
}

export interface VehicleRigGeometryProbeSnapshot {
  carIndex: number; visualId: string; hitboxPresetId: string;
  carVisible: boolean; carPosition: [number, number, number];
  frontAxleX: number; rearAxleX: number; wheelbaseX: number;
  frontTrackWidthZ: number; rearTrackWidthZ: number;
  wheelHeightsY: [number, number, number, number];
  wheels: VehicleWheelGeometrySample[];
  wheelSpecs: Array<[number, number, number]>;
  boostOutlets: Array<[number, number, number]>;
  hitboxDimensions: [number, number, number] | null;
  hitboxOffset: [number, number, number] | null;
}

export interface GoldenFieldDiffItem {
  field: string; expected: unknown; actual: unknown;
  maxAbsDelta: number; passed: boolean;
}

export interface VehicleRigGoldenDiffReport {
  carIndex: number; visualId: string; goldenReferenceId: string;
  passed: boolean; maxCoordinateDeltaUu: number;
  mismatches: GoldenFieldDiffItem[];
  probe: VehicleRigGeometryProbeSnapshot;
}

export interface GoldenBaselineDiffSummary {
  referenceCommit: string; referenceUiCoreCommit: string;
  passed: boolean; staticDescriptorChecksPassed: boolean;
  staticDescriptorDiffs: GoldenFieldDiffItem[];
  vehicleRigDiffs: VehicleRigGoldenDiffReport[];
}

export const GOLDEN_65F1538D_COMMIT = ${JSON.stringify(golden.sourceMainCommit)} as const;
export const GOLDEN_65F1538D_UICORE_COMMIT = ${JSON.stringify(golden.sourceUiCoreCommit)} as const;

export const GOLDEN_65F1538D_VEHICLE_DESCRIPTORS: Readonly<Record<string, GoldenVehicleDescriptorSpec>> = Object.freeze(${formatDescriptorEntries(golden.vehicleDescriptors)});

export const GOLDEN_65F1538D_HITBOX_PRESETS: Readonly<Record<string, GoldenHitboxPresetSpec>> = Object.freeze(${formatHitboxEntries(golden.hitboxPresets)});

export const GOLDEN_65F1538D_MUTATOR_CONFIG: Readonly<Record<string, number | boolean>> = Object.freeze(${formatCompactObjectEntries(golden.defaultMutatorConfig)});

export const GOLDEN_65F1538D_SIGNAL_EVENT_TYPES: Readonly<Record<string, number>> = Object.freeze(${formatCompactObjectEntries(golden.signalEventTypes)});

export const GOLDEN_65F1538D_INCIDENT_EVENT_TYPES: Readonly<Record<string, number>> = Object.freeze(${formatCompactObjectEntries(golden.incidentEventTypes)});
`;

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, tsBanner, 'utf8');
  console.log(
    `[GoldenExtractor] Extracted 65f1538d golden baseline (${Object.keys(golden.vehicleDescriptors).length} vehicle descriptors, ${Object.keys(golden.hitboxPresets).length} hitbox presets) -> ${path.relative(ROOT_DIR, outPath)}`
  );
}

main();
