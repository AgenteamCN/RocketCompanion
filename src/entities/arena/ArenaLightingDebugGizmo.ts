/**
 * ArenaLightingDebugGizmo.ts
 * Stateful sub-controller for 3D light-source ray, sun position sphere,
 * and sky-dome direction beacon visualization in ArenaLightingManager.
 */

import * as THREE from 'three';

export class ArenaLightingDebugGizmo {
  public scene: THREE.Scene;
  public debugGroup: THREE.Group | null = null;
  public sunRayLine: THREE.Line | null = null;
  public sunMarkerSphere: THREE.Mesh | null = null;
  public sunMarkerRing: THREE.Mesh | null = null;
  public skyDomeBeaconRing: THREE.Mesh | null = null;
  public keyLightRayLine: THREE.Line | null = null;
  public keyLightMarkerSphere: THREE.Mesh | null = null;

  private _rayOriginPos = new THREE.Vector3();
  private _camForward = new THREE.Vector3();
  private _camUp = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  ensureGroup(depthTest: boolean): THREE.Group {
    if (this.debugGroup) return this.debugGroup;

    const group = new THREE.Group();
    group.name = 'ArenaLightingDebugGizmo';
    group.frustumCulled = false;

    const sunLineGeo = new THREE.BufferGeometry();
    sunLineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    const sunLineMat = new THREE.LineBasicMaterial({
      color: 0xffdd33,
      transparent: true,
      opacity: 0.95,
      depthTest,
      depthWrite: false,
    });
    this.sunRayLine = new THREE.Line(sunLineGeo, sunLineMat);
    this.sunRayLine.frustumCulled = false;
    this.sunRayLine.renderOrder = 999;

    const sunSphereGeo = new THREE.SphereGeometry(140, 16, 12);
    const sunSphereMat = new THREE.MeshBasicMaterial({
      color: 0xffe047,
      transparent: true,
      opacity: 0.95,
      depthTest,
      depthWrite: false,
    });
    this.sunMarkerSphere = new THREE.Mesh(sunSphereGeo, sunSphereMat);
    this.sunMarkerSphere.renderOrder = 1000;

    const sunRingGeo = new THREE.RingGeometry(210, 260, 32);
    const sunRingMat = new THREE.MeshBasicMaterial({
      color: 0xff8800,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthTest,
      depthWrite: false,
    });
    this.sunMarkerRing = new THREE.Mesh(sunRingGeo, sunRingMat);
    this.sunMarkerRing.renderOrder = 1000;
    this.sunMarkerSphere.add(this.sunMarkerRing);

    const skyBeaconGeo = new THREE.RingGeometry(420, 560, 32);
    const skyBeaconMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthTest,
      depthWrite: false,
    });
    this.skyDomeBeaconRing = new THREE.Mesh(skyBeaconGeo, skyBeaconMat);
    this.skyDomeBeaconRing.renderOrder = 998;

    const keyLineGeo = new THREE.BufferGeometry();
    keyLineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const keyLineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
      depthTest,
      depthWrite: false,
    });
    this.keyLightRayLine = new THREE.Line(keyLineGeo, keyLineMat);
    this.keyLightRayLine.frustumCulled = false;
    this.keyLightRayLine.renderOrder = 998;

    const keySphereGeo = new THREE.SphereGeometry(95, 12, 10);
    const keySphereMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
      depthTest,
      depthWrite: false,
    });
    this.keyLightMarkerSphere = new THREE.Mesh(keySphereGeo, keySphereMat);
    this.keyLightMarkerSphere.renderOrder = 999;

    group.add(
      this.sunRayLine,
      this.sunMarkerSphere,
      this.skyDomeBeaconRing,
      this.keyLightRayLine,
      this.keyLightMarkerSphere
    );

    this.debugGroup = group;
    this.scene.add(group);
    return group;
  }

  updateDepthTest(depthTest: boolean): void {
    if (!this.debugGroup) return;
    this.debugGroup.traverse((child: THREE.Object3D & { material?: THREE.Material }) => {
      if (child.material) {
        child.material.depthTest = depthTest;
        child.material.needsUpdate = true;
      }
    });
  }

  update(
    shadowConfig: {
      showLightGizmo?: boolean;
      showKeyLightGizmo?: boolean;
      lightGizmoDepthTest?: boolean;
      lightRayOrigin?: string;
    },
    carSunPos: THREE.Vector3,
    shadowDir: THREE.Vector3,
    keyLight: THREE.DirectionalLight | null,
    cars: Array<THREE.Object3D | null>,
    ball: THREE.Object3D | null,
    camera: THREE.Camera | null = null,
    focusedCarIndex = 0
  ): void {
    const showSun = Boolean(shadowConfig.showLightGizmo);
    const showKey = Boolean(shadowConfig.showKeyLightGizmo);
    if (!showSun && !showKey) {
      if (this.debugGroup) this.debugGroup.visible = false;
      return;
    }

    const group = this.ensureGroup(Boolean(shadowConfig.lightGizmoDepthTest));
    group.visible = true;

    const originMode = shadowConfig.lightRayOrigin || 'car';
    const origin = this._rayOriginPos.set(0, 20, 0);
    const focusedCar = cars?.[focusedCarIndex] ?? cars?.[0] ?? null;
    if (originMode === 'camera' && camera?.position) {
      origin.copy(camera.position);
      if (typeof camera.getWorldDirection === 'function') {
        camera.getWorldDirection(this._camForward);
        this._camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
        origin.addScaledVector(this._camForward, 85).addScaledVector(this._camUp, -28);
      } else {
        origin.y -= 25;
      }
    } else if (originMode === 'ball' && ball?.position) {
      origin.copy(ball.position);
    } else if (originMode === 'car' && focusedCar?.position) {
      origin.copy(focusedCar.position);
      origin.y += 35;
    }

    if (this.sunRayLine) this.sunRayLine.visible = showSun;
    if (this.sunMarkerSphere) this.sunMarkerSphere.visible = showSun;
    if (this.skyDomeBeaconRing) this.skyDomeBeaconRing.visible = showSun;

    if (
      showSun &&
      this.sunRayLine &&
      this.sunMarkerSphere &&
      this.sunMarkerRing &&
      this.skyDomeBeaconRing
    ) {
      const sunPos = carSunPos;
      const farSkyPosX = origin.x + shadowDir.x * 18000;
      const farSkyPosY = origin.y + shadowDir.y * 18000;
      const farSkyPosZ = origin.z + shadowDir.z * 18000;

      const posAttr = this.sunRayLine.geometry.getAttribute('position') as THREE.BufferAttribute;
      posAttr.setXYZ(0, origin.x, origin.y, origin.z);
      posAttr.setXYZ(1, sunPos.x, sunPos.y, sunPos.z);
      posAttr.setXYZ(2, farSkyPosX, farSkyPosY, farSkyPosZ);
      posAttr.needsUpdate = true;
      this.sunRayLine.geometry.computeBoundingSphere();

      this.sunMarkerSphere.position.copy(sunPos);
      if (camera?.position) {
        this.sunMarkerRing.lookAt(camera.position);
      }

      this.skyDomeBeaconRing.position.set(farSkyPosX, farSkyPosY, farSkyPosZ);
      this.skyDomeBeaconRing.lookAt(origin);
    }

    if (this.keyLightRayLine) this.keyLightRayLine.visible = showKey;
    if (this.keyLightMarkerSphere) this.keyLightMarkerSphere.visible = showKey;
    if (showKey && keyLight && this.keyLightRayLine && this.keyLightMarkerSphere) {
      const keyPos = keyLight.position;
      const keyAttr = this.keyLightRayLine.geometry.getAttribute(
        'position'
      ) as THREE.BufferAttribute;
      keyAttr.setXYZ(0, origin.x, origin.y, origin.z);
      keyAttr.setXYZ(1, keyPos.x, keyPos.y, keyPos.z);
      keyAttr.needsUpdate = true;
      this.keyLightRayLine.geometry.computeBoundingSphere();
      this.keyLightMarkerSphere.position.copy(keyPos);
    }
  }

  dispose(): void {
    if (this.debugGroup) {
      this.debugGroup.traverse((n: any) => {
        n.geometry?.dispose?.();
        n.material?.dispose?.();
      });
      this.scene?.remove?.(this.debugGroup);
      this.debugGroup = null;
    }
  }
}
