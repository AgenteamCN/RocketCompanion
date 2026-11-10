import * as THREE from 'three';
import { getMaterialsConfig } from '../../../ui-core/config/materialsConfig.ts';
import { boostParticleRuntimeConfig } from '../../../ui-core/config/vehicleTunerConfig.ts';

/**
 * boostEmitterPipeline.ts
 * Pure nozzle transform, material luminance/theme resolution, particle emission stepping,
 * and Three.js scene-node disposal helpers for RealisticBoostEmitter and VehicleBoostEmitter.
 */

export type NozzleOffsetInput =
  | number
  | number[]
  | { x?: number; y?: number; z?: number; clone?: () => THREE.Vector3; isVector3?: boolean }
  | null
  | undefined;

export interface BoostParticlePhysicsPort {
  currentNozzle: THREE.Vector3;
  previousNozzle: THREE.Vector3;
  hasPreviousNozzle: boolean;
  driveParticlesActive: boolean;
  trailParticlesActive: boolean;
  driveSpawnAccumulator: number;
  spawnRemainder: number;
  shortSpawnRemainder: number;
  longSpawnRemainder: number;
  spawnDrive(dt: number): void;
  spawnTrailByDistance(pos: THREE.Vector3, dt: number): void;
}

export function cloneOrCreateNozzleVector(nozzleLocal: NozzleOffsetInput): THREE.Vector3 {
  if (nozzleLocal && typeof nozzleLocal === 'object' && !Array.isArray(nozzleLocal)) {
    if (nozzleLocal.isVector3) {
      return nozzleLocal as THREE.Vector3;
    }
    if (typeof nozzleLocal.clone === 'function') {
      return nozzleLocal.clone();
    }
    return new THREE.Vector3(
      Number(nozzleLocal.x) || 0,
      Number(nozzleLocal.y) || 0,
      Number(nozzleLocal.z) || 0
    );
  }
  return new THREE.Vector3(0, 0, 0);
}

export function applyNozzleOffsetToVector(
  target: THREE.Vector3,
  xOrVec: NozzleOffsetInput,
  y?: number,
  z?: number
): void {
  if (xOrVec && typeof xOrVec === 'object') {
    if (Array.isArray(xOrVec)) {
      target.set(Number(xOrVec[0]) || 0, Number(xOrVec[1]) || 0, Number(xOrVec[2]) || 0);
    } else if (xOrVec !== target) {
      target.set(Number(xOrVec.x) || 0, Number(xOrVec.y) || 0, Number(xOrVec.z) || 0);
    }
  } else if (typeof xOrVec === 'number') {
    target.set(xOrVec, Number(y) || 0, Number(z) || 0);
  }
}

export function syncBoostNozzleAttachments(
  nozzleLocal: THREE.Vector3,
  cone: THREE.Object3D | null,
  flareOrFlash: THREE.Object3D | null,
  light: THREE.PointLight | null,
  scene: THREE.Object3D | null,
  car: THREE.Object3D | null
): void {
  const nx = nozzleLocal.x;
  const ny = nozzleLocal.y;
  const nz = nozzleLocal.z;
  if (cone) {
    cone.position.set(nx, ny, nz);
  }
  if (flareOrFlash) {
    flareOrFlash.position.set(nx - 2, ny, nz);
  }
  if (light) {
    light.position.set(nx - 10, ny, nz);
    if (car && light.parent === scene && typeof car.localToWorld === 'function') {
      if (typeof car.updateMatrixWorld === 'function') {
        car.updateMatrixWorld();
      }
      car.localToWorld(light.position);
    }
  }
}

export function updateBoostConeMaterials(
  materials: readonly THREE.ShaderMaterial[],
  elapsed: number,
  opacity: number,
  luminanceMode?: number
): void {
  for (const mat of materials) {
    if (!mat.uniforms) continue;
    mat.uniforms.time.value = elapsed;
    mat.uniforms.opacity.value = opacity;
    if (luminanceMode !== undefined && mat.uniforms.luminanceMode) {
      mat.uniforms.luminanceMode.value = luminanceMode;
    }
  }
}

export function updateBoostGlintMesh(
  mesh:
    | THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
    | THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
    | null,
  visible: boolean,
  intensity: number
): void {
  if (!mesh) return;
  mesh.visible = visible;
  const mat = mesh.material;
  if (mat && mat.uniforms && mat.uniforms.intensity) {
    mat.uniforms.intensity.value = intensity;
  }
}

export function resolveRealisticBoostLuminance(coneOpacity: number): {
  flameMode: number;
  plumeScale: number;
} {
  let flameMode = 0;
  let plumeScale = 1.0;
  try {
    const mats = getMaterialsConfig();
    if (mats) {
      flameMode = mats.boostFlameLuminance === 'dynamic' ? 1 : 0;
      const plumeMode = mats.boostPlumeLuminance || 'balanced';
      if (plumeMode === 'min') {
        plumeScale = 0.35;
      } else if (plumeMode === 'dynamic') {
        plumeScale = Math.max(0.4, Math.min(1.8, coneOpacity * 1.5 + 0.3));
      } else if (plumeMode === 'hdr') {
        plumeScale = 2.4;
      }
    }
  } catch (err) {
    console.warn(
      '[VehicleBoostEmitter] Error accessing materials configuration for plume luminance:',
      err
    );
  }
  return { flameMode, plumeScale };
}

export function resolveActiveBoostTheme(boostVisualOverride: string | null): string {
  if (boostVisualOverride) return boostVisualOverride;
  try {
    const mats = getMaterialsConfig();
    if (mats && mats.boostVisual) {
      return mats.boostVisual;
    }
  } catch (err) {
    console.warn(
      '[VehicleBoostEmitter] Error accessing materials configuration for boostVisual:',
      err
    );
  }
  return 'gold-rush';
}

export function canSpawnBoostTrail(): boolean {
  if (boostParticleRuntimeConfig.dualStreamEnabled) {
    const shortMul =
      boostParticleRuntimeConfig.shortTrailSpawnMultiplier !== undefined
        ? boostParticleRuntimeConfig.shortTrailSpawnMultiplier
        : 1.0;
    const longMul =
      boostParticleRuntimeConfig.longTrailSpawnMultiplier !== undefined
        ? boostParticleRuntimeConfig.longTrailSpawnMultiplier
        : 0.1;
    return shortMul > 0.01 || longMul > 0.01;
  }
  const baseMul =
    boostParticleRuntimeConfig.trailSpawnMultiplier !== undefined
      ? boostParticleRuntimeConfig.trailSpawnMultiplier
      : 1.0;
  return baseMul > 0.01;
}

export function stepEmitterParticlePhysics(
  physics: BoostParticlePhysicsPort,
  car: THREE.Object3D,
  nozzleLocal: THREE.Vector3,
  scratchWorldNozzle: THREE.Vector3,
  isDriving: boolean,
  isBoosting: boolean,
  dt: number
): boolean {
  if (isDriving && boostParticleRuntimeConfig.drivePuffsEnabled) {
    physics.spawnDrive(dt);
  } else {
    physics.driveSpawnAccumulator = 0;
  }

  let isPausedBoost = false;
  if (isBoosting && canSpawnBoostTrail()) {
    if (typeof car.updateMatrixWorld === 'function') {
      car.updateMatrixWorld();
    }
    scratchWorldNozzle.copy(nozzleLocal);
    if (typeof car.localToWorld === 'function') {
      car.localToWorld(scratchWorldNozzle);
    }
    if (
      physics.hasPreviousNozzle &&
      physics.trailParticlesActive &&
      scratchWorldNozzle.distanceToSquared(physics.previousNozzle) < 1e-4
    ) {
      isPausedBoost = true;
    } else {
      physics.spawnTrailByDistance(scratchWorldNozzle, dt);
    }
  } else {
    if (car && physics.currentNozzle) {
      if (typeof car.updateMatrixWorld === 'function') {
        car.updateMatrixWorld();
      }
      scratchWorldNozzle.copy(nozzleLocal);
      if (typeof car.localToWorld === 'function') {
        car.localToWorld(scratchWorldNozzle);
      }
      physics.currentNozzle.copy(scratchWorldNozzle);
    }
    physics.hasPreviousNozzle = false;
    physics.spawnRemainder = 0;
    physics.shortSpawnRemainder = 0;
    physics.longSpawnRemainder = 0;
  }

  return isPausedBoost;
}

export function disposeBoostSceneObject(
  node: THREE.Object3D | null,
  fallbackParent: THREE.Object3D | null
): void {
  if (!node) return;
  if (node.parent) {
    node.parent.remove(node);
  } else if (fallbackParent && typeof fallbackParent.remove === 'function') {
    fallbackParent.remove(node);
  }
  if (typeof node.traverse === 'function') {
    node.traverse((child) => {
      const meshChild = child as THREE.Mesh<
        THREE.BufferGeometry | undefined,
        THREE.Material | THREE.Material[] | undefined
      >;
      if (meshChild.geometry) {
        meshChild.geometry.dispose();
      }
      if (meshChild.material) {
        if (Array.isArray(meshChild.material)) {
          for (const mat of meshChild.material) {
            if (mat) mat.dispose();
          }
        } else {
          meshChild.material.dispose();
        }
      }
    });
  } else {
    const meshNode = node as THREE.Mesh<
      THREE.BufferGeometry | undefined,
      THREE.Material | THREE.Material[] | undefined
    >;
    if (meshNode.geometry) {
      meshNode.geometry.dispose();
    }
    if (meshNode.material && !Array.isArray(meshNode.material)) {
      meshNode.material.dispose();
    }
  }
}
