import * as THREE from 'three';
import { HITBOX_PRESETS } from '../../ui-core/config/vehiclePresets.ts';
import { normalizeVisualId } from '../../ui-core/config/vehicleConstants.ts';
import {
  FENNEC_DESCRIPTOR,
  getVehicleDescriptor,
  hasVehicleDescriptor,
  recomputeDescriptorBoostOutlets,
  GLOBAL_VEHICLE_SURFACE_MATERIALS,
} from '../../ui-core/config/vehicleTunerConfig.ts';
import {
  loadCustomGlbCarAsset,
  createCustomGlbCarModel,
  getCachedCustomVehicleAsset,
} from '../vehicle/customGlbCarModel.ts';
import { createProceduralSportWheel } from '../vehicle/vehicleWheelsAndLamps.ts';
import {
  DEFAULT_TEAM_COLORS,
  OCTANE_BOOST_OUTLETS,
  OCTANE_HITBOX_PRESET,
} from './ArenaConstants.ts';
import { createCarHitboxWireframe } from './ArenaMath.ts';

export function createDefaultVehicleLoaders() {
  return {
    loadCustomGlbCarAsset,
    createCustomGlbCarModel,
    createProceduralSportWheel,
    wheelSpecs: {
      game: FENNEC_DESCRIPTOR.wheelAnchors,
    },
    suspensionSpecs: {
      octaneZ: 17,
    },
    teamColors: DEFAULT_TEAM_COLORS,
  };
}

export type VehicleAssetStore = Map<string, unknown> | Record<string, unknown> | null | undefined;

export interface VehicleLoaderCallbacks {
  createCustomGlbCarModel?: (
    visualId: string,
    customAsset: unknown,
    teamColor: number
  ) => THREE.Object3D;
  createProceduralSportWheel?: (
    radius: number,
    teamColor: number,
    wheelIndex: number
  ) => THREE.Object3D;
  [key: string]: unknown;
}

export function buildVehicleModel(
  rawVisual: string,
  teamColor: number,
  isBot: boolean,
  assets: VehicleAssetStore,
  loaders: VehicleLoaderCallbacks,
  carHitboxesVisible: boolean
) {
  const visual = normalizeVisualId(rawVisual);
  const isHitbox = visual.startsWith('hitbox-');
  const isCustomGlb = hasVehicleDescriptor(visual);

  let carModel: THREE.Object3D | null = null;
  let carHitbox: THREE.Object3D | null = null;
  let boostOutlets: THREE.Vector3[] | null = null;

  if (isHitbox) {
    let preset = HITBOX_PRESETS[visual];
    if (!preset) {
      console.warn(
        `[VehicleFactory] Unrecognized hitbox preset "${visual}"; falling back to "hitbox-octane".`
      );
      preset = HITBOX_PRESETS['hitbox-octane'];
    }
    try {
      carModel = createWhiteboxCarModel(visual, teamColor);
    } catch (err) {
      console.error('[VehicleFactory] Failed to instantiate car model:', err, {
        visual,
        teamColor,
      });
      carModel = new THREE.Group();
    }
    carModel.name = 'car-body-mesh';
    carHitbox = createCarHitboxWireframe(preset);
    carHitbox.name = 'car-hitbox-wireframe';
    carHitbox.visible = carHitboxesVisible;
    boostOutlets = OCTANE_BOOST_OUTLETS.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    return { carModel, carHitbox, boostOutlets };
  }

  if (isCustomGlb) {
    const descriptor = getVehicleDescriptor(visual);
    if (descriptor) {
      recomputeDescriptorBoostOutlets(descriptor);
    }
    const hitboxKey = descriptor?.hitboxPreset || 'hitbox-octane';
    const hitboxPreset =
      HITBOX_PRESETS[hitboxKey as keyof typeof HITBOX_PRESETS] || OCTANE_HITBOX_PRESET;
    let customAsset = assets instanceof Map ? assets.get(visual) : assets?.[visual];
    if (!customAsset) {
      const cached = getCachedCustomVehicleAsset(visual);
      if (cached) {
        customAsset = cached;
        if (assets instanceof Map) {
          assets.set(visual, cached);
        }
      }
    }
    if (customAsset && loaders.createCustomGlbCarModel) {
      carModel = loaders.createCustomGlbCarModel(visual, customAsset, teamColor);
    } else {
      console.warn(
        `[VehicleFactory] Custom GLB asset or loader unavailable for "${visual}"; falling back to whitebox model "${descriptor?.hitboxPreset || 'hitbox-octane'}".`
      );
      try {
        carModel = createWhiteboxCarModel(descriptor?.hitboxPreset || 'hitbox-octane', teamColor);
      } catch (err) {
        console.warn(
          `[VehicleFactory] Failed to create whitebox fallback for "${visual}"; using empty Group:`,
          err
        );
        carModel = new THREE.Group();
      }
    }
    carModel.name = 'car-body-mesh';
    carHitbox = createCarHitboxWireframe(hitboxPreset);
    carHitbox.name = 'car-hitbox-wireframe';
    carHitbox.visible = carHitboxesVisible;
    const rawOutlets = descriptor?.boostOutlets || OCTANE_BOOST_OUTLETS;
    boostOutlets = rawOutlets.map(([x, y, z]: number[]) => new THREE.Vector3(x, y, z));
    return { carModel, carHitbox, boostOutlets };
  }

  console.warn(
    `[VehicleFactory] Visual preset "${visual}" has no custom GLB descriptor; falling back to "hitbox-octane" whitebox model.`
  );
  try {
    carModel = createWhiteboxCarModel('hitbox-octane', teamColor);
  } catch (err) {
    console.error('[VehicleFactory] Failed to instantiate fallback model:', err, { teamColor });
    carModel = new THREE.Group();
  }
  carHitbox = createCarHitboxWireframe(OCTANE_HITBOX_PRESET);
  boostOutlets = OCTANE_BOOST_OUTLETS.map(([x, y, z]) => new THREE.Vector3(x, y, z));

  carModel.name = 'car-body-mesh';
  carHitbox.name = 'car-hitbox-wireframe';
  carHitbox.visible = carHitboxesVisible;
  return { carModel, carHitbox, boostOutlets };
}

export function buildVehicleWheels(
  carRoot: THREE.Object3D,
  rawVisual: string,
  teamColor: number,
  wheelSpecs: number[][],
  assets: VehicleAssetStore,
  loaders: VehicleLoaderCallbacks
) {
  const visual = normalizeVisualId(rawVisual);
  const isHitbox = visual.startsWith('hitbox-');
  const isCustomGlb = hasVehicleDescriptor(visual);
  const wheels: Array<{ steer: THREE.Group; spin: THREE.Group }> = [];

  if (isHitbox || !isCustomGlb) {
    if (!loaders.createProceduralSportWheel) {
      console.warn(
        `[VehicleFactory] createProceduralSportWheel loader unavailable for "${visual}"; falling back to cylinder wheel geometry.`
      );
    }
    const wheelGeom = new THREE.CylinderGeometry(13.5, 13.5, 9, 16);
    wheelGeom.rotateX(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 2171169,
      roughness: 0.9,
      metalness: 0.1,
    });
    for (let i = 0; i < 4; i++) {
      const [specX, specZ, specRadius] = wheelSpecs[i] || [0, 0, 13.5];
      const steerGroup = new THREE.Group();
      steerGroup.name = 'car-wheel-steer';
      steerGroup.position.set(specX, -6.0, specZ);
      const spinGroup = new THREE.Group();
      if (loaders.createProceduralSportWheel) {
        spinGroup.add(loaders.createProceduralSportWheel(specRadius || 13.5, teamColor, i));
      } else {
        const wm = new THREE.Mesh(wheelGeom, wheelMat);
        wm.castShadow = true;
        spinGroup.add(wm);
      }
      steerGroup.add(spinGroup);
      carRoot.add(steerGroup);
      wheels.push({ steer: steerGroup, spin: spinGroup });
    }
    return wheels;
  }

  const descriptor = getVehicleDescriptor(visual);
  const isThreeWheels = Boolean(
    descriptor?.threeWheels || visual === 'trioctane-threewheel' || visual === 'hitbox-psyclops'
  );
  if (!loaders.createProceduralSportWheel) {
    console.warn(
      `[VehicleFactory] createProceduralSportWheel loader unavailable for custom vehicle "${visual}"; using empty wheel groups.`
    );
  }

  for (let i = 0; i < wheelSpecs.length; i++) {
    const [specX, rawSpecZ, specRadius] = wheelSpecs[i];
    const specZ = isThreeWheels && i === 0 ? 0.0 : rawSpecZ;
    const steerGroup = new THREE.Group();
    steerGroup.name = 'car-wheel-steer';
    const customRestY = descriptor?.suspensionHeights?.[i];
    const restYDelta = typeof customRestY === 'number' ? customRestY - (specRadius - 17) : 0;
    const restY = -4.5 + restYDelta;
    steerGroup.position.set(specX, restY, specZ);
    if (isThreeWheels && i === 1) {
      steerGroup.visible = false;
    }
    const spinGroup = new THREE.Group();

    let wheelMesh: THREE.Object3D;
    if (loaders.createProceduralSportWheel) {
      wheelMesh = loaders.createProceduralSportWheel(specRadius || 13.5, teamColor, i);
    } else {
      wheelMesh = new THREE.Group();
    }

    spinGroup.add(wheelMesh);
    steerGroup.add(spinGroup);
    carRoot.add(steerGroup);
    wheels.push({ steer: steerGroup, spin: spinGroup });
  }

  if (isThreeWheels) {
    (
      wheels as Array<{ steer: THREE.Group; spin: THREE.Group }> & { threeWheels?: boolean }
    ).threeWheels = true;
  }

  return wheels;
}

export function removeCarMeshes(carRoot: THREE.Object3D, removeWheels = false) {
  const toRemove: THREE.Object3D[] = [];
  for (const child of carRoot.children) {
    if (
      child.name === 'car-body-mesh' ||
      child.name === 'car-hitbox-wireframe' ||
      child.name === 'car-hitbox' ||
      child.name?.startsWith('whitebox-') ||
      (removeWheels && child.name === 'car-wheel-steer')
    ) {
      toRemove.push(child);
    }
  }
  for (const child of toRemove) {
    carRoot.remove(child);
    const preserveSharedGlbGeometry = child.name === 'car-body-mesh';
    child.traverse?.(
      (
        node: THREE.Object3D & {
          geometry?: THREE.BufferGeometry;
          material?: THREE.Material | THREE.Material[];
        }
      ) => {
        if (!preserveSharedGlbGeometry && node.geometry) node.geometry.dispose?.();
        if (node.material) {
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          mats.forEach((m) => m?.dispose?.());
        }
      }
    );
  }
}

export function createWhiteboxCarModel(
  presetId: string,
  teamColor = 0x0088ff,
  three: typeof THREE = THREE
) {
  const cfg = HITBOX_PRESETS[presetId] || HITBOX_PRESETS['hitbox-octane'];
  if (!three || !three.Group || !three.BoxGeometry || !three.MeshStandardMaterial || !three.Mesh) {
    throw new Error('[Garage] Three.js context required to build procedural car model.');
  }

  const root = new three.Group();
  root.name = `whitebox-${cfg.name}`;

  const bodySlot = GLOBAL_VEHICLE_SURFACE_MATERIALS?.body;
  const bodyGeom = new three.BoxGeometry(cfg.length, cfg.height, cfg.width);
  const bodyMat = new three.MeshStandardMaterial({
    color: teamColor,
    roughness: bodySlot?.roughness ?? 0.85,
    metalness: bodySlot?.metalness ?? 0.5,
  });
  bodyMat.name = 'paint';
  const rearMat = new three.MeshStandardMaterial({
    color: 0xffffff,
    roughness: bodySlot?.roughness ?? 0.85,
    metalness: bodySlot?.metalness ?? 0.5,
  });
  rearMat.name = 'whitebox-rear';
  const bottomMat = new three.MeshStandardMaterial({
    color: 0x1f2328,
    roughness: 0.85,
    metalness: 0.1,
  });
  bottomMat.name = 'lower-detail';

  const materials = [bodyMat, rearMat, bodyMat, bottomMat, bodyMat, bodyMat];

  const bodyMesh = new three.Mesh(bodyGeom, materials);
  bodyMesh.position.set(cfg.forward, cfg.up, 0);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = false;

  if (three.EdgesGeometry && three.LineBasicMaterial && three.LineSegments) {
    const edgesGeom = new three.EdgesGeometry(bodyGeom);
    const wireMat = new three.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
    });
    const wireMesh = new three.LineSegments(edgesGeom, wireMat);
    bodyMesh.add(wireMesh);
  }

  root.add(bodyMesh);
  return root;
}
