import * as THREE from 'three';
import {
  DEFAULT_SUN_OFFSET_X,
  DEFAULT_SUN_OFFSET_Y,
  DEFAULT_SUN_OFFSET_Z,
  type ShadowConfig,
} from '../../ui-core/config/atmosphereFxConfig.ts';

export interface ShadowSceneCameraContext {
  isPovCamera?: boolean;
  cameraMode?: string;
  focusedCarIndex?: number;
}

const REF_UP_Y = new THREE.Vector3(0, 1, 0);
const REF_UP_X = new THREE.Vector3(1, 0, 0);

export function recomputeShadowBasisVectors(
  shadowConfig: ShadowConfig,
  sunOffset: THREE.Vector3,
  shadowDir: THREE.Vector3,
  shadowX: THREE.Vector3,
  shadowY: THREE.Vector3
): void {
  const ox = Number(shadowConfig.sunOffsetX) ?? DEFAULT_SUN_OFFSET_X;
  const oy = Math.max(50, Number(shadowConfig.sunOffsetY) ?? DEFAULT_SUN_OFFSET_Y);
  const oz = Number(shadowConfig.sunOffsetZ) ?? DEFAULT_SUN_OFFSET_Z;
  sunOffset.set(ox, oy, oz);
  if (sunOffset.lengthSq() < 1) {
    sunOffset.set(DEFAULT_SUN_OFFSET_X, DEFAULT_SUN_OFFSET_Y, DEFAULT_SUN_OFFSET_Z);
  }
  shadowDir.copy(sunOffset).normalize();
  const refUp = Math.abs(shadowDir.y) < 0.99 ? REF_UP_Y : REF_UP_X;
  shadowX.copy(refUp).cross(shadowDir).normalize();
  shadowY.crossVectors(shadowDir, shadowX).normalize();
}

export function createSubjectDirectionalSun(
  targetGroup: THREE.Object3D,
  frustumSize: number,
  shadowConfig: ShadowConfig
): THREE.DirectionalLight {
  const sun = new THREE.DirectionalLight(16777215, 1);
  sun.position.set(DEFAULT_SUN_OFFSET_X, DEFAULT_SUN_OFFSET_Y, DEFAULT_SUN_OFFSET_Z);
  sun.castShadow = true;
  sun.target = targetGroup;
  sun.shadow.mapSize.set(shadowConfig.mapSize, shadowConfig.mapSize);
  sun.shadow.bias = shadowConfig.shadowBias;
  sun.shadow.camera.left = -frustumSize;
  sun.shadow.camera.right = frustumSize;
  sun.shadow.camera.top = frustumSize;
  sun.shadow.camera.bottom = -frustumSize;
  sun.shadow.camera.near = 100;
  sun.shadow.camera.far = 16000;
  return sun;
}

export function setDirectionalSunFrustum(sun: THREE.DirectionalLight, frustumSize: number): void {
  const cam = sun.shadow.camera;
  if (cam.right !== frustumSize) {
    cam.left = -frustumSize;
    cam.right = frustumSize;
    cam.top = frustumSize;
    cam.bottom = -frustumSize;
    cam.updateProjectionMatrix();
  }
}

export function applyEnvironmentalLightsConfig(
  c: ShadowConfig,
  suns: Array<THREE.DirectionalLight | null>,
  keyLight: THREE.DirectionalLight | null,
  hemiLight: THREE.HemisphereLight | null
): void {
  const sunHex = c.sunColor || '#ffffff';
  for (const s of suns) {
    if (s) s.color.set(sunHex);
  }

  if (keyLight) {
    keyLight.visible = c.keyLightEnabled !== false;
    keyLight.color.set(c.keyLightColor || '#88aadf');
    keyLight.intensity = Math.max(0, Number(c.keyLightIntensity) ?? 0.5);

    const mode = c.keyLightMode || 'fixed';
    if (mode === 'fixed') {
      keyLight.position.set(-2000, 2000, -2000);
    } else {
      const azDeg =
        mode === 'opposite-sun'
          ? (Number(c.sunAzimuthDeg) || 0) + 180
          : (Number(c.keyLightAzimuthDeg) ?? -135);
      const elDeg = Math.max(5, Math.min(85, Number(c.keyLightElevationDeg) ?? 35.3));
      const azRad = (azDeg * Math.PI) / 180;
      const elRad = (elDeg * Math.PI) / 180;
      const dist = 3464;
      const cosEl = Math.cos(elRad);
      keyLight.position.set(
        dist * cosEl * Math.cos(azRad),
        dist * Math.sin(elRad),
        dist * cosEl * Math.sin(azRad)
      );
    }
  }

  if (hemiLight) {
    hemiLight.visible = c.hemiLightEnabled !== false;
    hemiLight.color.set(c.hemiSkyColor || '#c8e0ff');
    hemiLight.groundColor.set(c.hemiGroundColor || '#2732c8');
    hemiLight.intensity = Math.max(0, Number(c.hemiIntensity) ?? 1.0);
  }
}

export function applyShadowRigModeConfig(
  shadowConfig: ShadowConfig,
  isPovShadowActive: boolean,
  carSun: THREE.DirectionalLight,
  ballSun: THREE.DirectionalLight,
  opponentSun: THREE.DirectionalLight | null,
  numCars: number,
  updateSunIntensitiesFn: (numCars: number) => void
): void {
  const { mode, singleSunFrustumRadius, mapSize, shadowBias } = shadowConfig;
  const baseSunIntensity = Math.max(0, Number(shadowConfig.sunIntensity) ?? 1.0);
  const suns = [carSun, ballSun, opponentSun].filter((s): s is THREE.DirectionalLight =>
    Boolean(s)
  );

  for (const s of suns) {
    s.shadow.bias = shadowBias;
    if (s.shadow.mapSize.x !== mapSize || s.shadow.mapSize.y !== mapSize) {
      s.shadow.mapSize.set(mapSize, mapSize);
      if (s.shadow.map) {
        s.shadow.map.dispose();
        s.shadow.map = null;
      }
    }
  }

  const effectiveMode = !isPovShadowActive && mode !== 'off' ? 'off' : mode;

  if (effectiveMode === 'off') {
    carSun.visible = true;
    carSun.castShadow = false;
    carSun.intensity = baseSunIntensity;
    ballSun.visible = false;
    ballSun.castShadow = false;
    if (opponentSun) {
      opponentSun.visible = false;
      opponentSun.castShadow = false;
    }
  } else if (effectiveMode === 'single-sun') {
    carSun.visible = true;
    carSun.castShadow = true;
    carSun.intensity = baseSunIntensity;
    setDirectionalSunFrustum(carSun, singleSunFrustumRadius);
    ballSun.visible = false;
    ballSun.castShadow = false;
    if (opponentSun) {
      opponentSun.visible = false;
      opponentSun.castShadow = false;
    }
  } else {
    carSun.visible = true;
    carSun.castShadow = true;
    setDirectionalSunFrustum(carSun, 260);
    ballSun.visible = true;
    ballSun.castShadow = true;
    setDirectionalSunFrustum(ballSun, 190);
    if (opponentSun) {
      opponentSun.castShadow = true;
      setDirectionalSunFrustum(opponentSun, 260);
    }
    updateSunIntensitiesFn(numCars);
  }
}

export function syncRendererShadowMapConfig(
  renderer: THREE.WebGLRenderer | null,
  scene: THREE.Scene,
  shadowConfig: ShadowConfig,
  prevSharpness: string | undefined,
  shouldRenderShadowMap: boolean
): void {
  if (!renderer?.shadowMap) return;
  renderer.shadowMap.enabled = shadowConfig.mode !== 'off';
  let targetType: THREE.ShadowMapType = THREE.PCFShadowMap;
  if (shadowConfig.sharpness === 'sharp') {
    targetType = THREE.BasicShadowMap;
  } else if (shadowConfig.sharpness === 'soft') {
    targetType = THREE.PCFSoftShadowMap;
  }
  if (renderer.shadowMap.type !== targetType || prevSharpness !== shadowConfig.sharpness) {
    renderer.shadowMap.type = targetType;
    scene.traverse(
      (
        node: THREE.Object3D & {
          isMesh?: boolean;
          material?: THREE.Material | THREE.Material[];
        }
      ) => {
        if (node.isMesh && node.material) {
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          for (const m of mats) {
            if (m) m.needsUpdate = true;
          }
        }
      }
    );
  }
  if (shouldRenderShadowMap) {
    renderer.shadowMap.needsUpdate = true;
  }
}

export function snapSubjectShadowFrustum(
  sun: THREE.DirectionalLight,
  targetGroup: THREE.Object3D,
  worldPos: THREE.Vector3,
  frustumSize: number,
  mapSize: number,
  shadowX: THREE.Vector3,
  shadowY: THREE.Vector3,
  shadowDir: THREE.Vector3,
  sunOffset: THREE.Vector3,
  shadowFocus: THREE.Vector3
): void {
  const texelSize = (frustumSize * 2) / (mapSize || 1024);
  const snappedX = Math.round(worldPos.dot(shadowX) / texelSize) * texelSize;
  const snappedY = Math.round(worldPos.dot(shadowY) / texelSize) * texelSize;
  const depthZ = worldPos.dot(shadowDir);

  shadowFocus
    .copy(shadowX)
    .multiplyScalar(snappedX)
    .addScaledVector(shadowY, snappedY)
    .addScaledVector(shadowDir, depthZ);

  targetGroup.position.copy(shadowFocus);
  sun.position.copy(shadowFocus).add(sunOffset);
  targetGroup.updateMatrixWorld();
}

export function resolvePovShadowActive(cameraContext?: ShadowSceneCameraContext | null): boolean {
  if (!cameraContext) return true;
  if (typeof cameraContext.isPovCamera === 'boolean') {
    return cameraContext.isPovCamera;
  }
  if (typeof cameraContext.cameraMode === 'string') {
    return (
      cameraContext.cameraMode === 'pov' ||
      cameraContext.cameraMode === 'wasmPov' ||
      cameraContext.cameraMode === 'rearView'
    );
  }
  return true;
}
