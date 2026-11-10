/**
 * ArenaBlobShadowSystem.ts
 * Global lightweight ground blob shadows for vehicles (oriented rounded rectangle)
 * and the ball (circle), with sun-angle ground projection, height-based opacity
 * attenuation (constant size), and fragment-level spatial coordinate auto-culling
 * against the active POV directional shadow frustum(s).
 */

import * as THREE from 'three';
import type { ShadowConfig } from '../../ui-core/config/atmosphereFxConfig.ts';

export interface BlobShadowLightRigState {
  shadowConfig: ShadowConfig;
  shouldRenderShadowMap(): boolean;
  carSunTarget: THREE.Object3D;
  ballSunTarget: THREE.Object3D;
  opponentSunTarget: THREE.Object3D;
  opponentSun: THREE.DirectionalLight | null;
  _shadowDir: THREE.Vector3;
  _shadowX: THREE.Vector3;
  _shadowY: THREE.Vector3;
}

const MAX_BLOB_CARS = 8;
const CAR_BLOB_SIZE_X = 220;
const CAR_BLOB_SIZE_Z = 170;
const BALL_BLOB_SIZE = 240;
const BLOB_GROUND_Y = 1.4;
const BASE_CAR_SHADOW_OPACITY = 0.44;
const BASE_BALL_SHADOW_OPACITY = 0.42;

const BLOB_SHADOW_VERTEX_SHADER = `
uniform vec2 uQuadSize;
varying vec2 vLocalXZ;
varying vec3 vWorldPos;

void main() {
  vLocalXZ = position.xz * uQuadSize;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const BLOB_SHADOW_FRAGMENT_SHADER = `
uniform float uShapeType;
uniform float uOpacity;
uniform float uRealShadowMode;
uniform vec3 uShadowFocus;
uniform vec3 uShadowX;
uniform vec3 uShadowY;
uniform float uSingleSunRadius;
uniform vec4 uMultiFocusA;
uniform vec4 uMultiFocusB;
uniform vec4 uMultiFocusC;

varying vec2 vLocalXZ;
varying vec3 vWorldPos;

void main() {
  if (uOpacity <= 0.002) discard;

  float roiCull = 1.0;
  if (uRealShadowMode > 0.5 && uRealShadowMode < 1.5) {
    vec3 rel = vWorldPos - uShadowFocus;
    float boxDist = max(abs(dot(rel, uShadowX)), abs(dot(rel, uShadowY)));
    roiCull = smoothstep(uSingleSunRadius - 40.0, uSingleSunRadius + 12.0, boxDist);
  } else if (uRealShadowMode >= 1.5) {
    vec3 relA = vWorldPos - uMultiFocusA.xyz;
    float distA = max(abs(dot(relA, uShadowX)), abs(dot(relA, uShadowY)));
    float cullA = smoothstep(uMultiFocusA.w - 30.0, uMultiFocusA.w + 10.0, distA);

    vec3 relB = vWorldPos - uMultiFocusB.xyz;
    float distB = max(abs(dot(relB, uShadowX)), abs(dot(relB, uShadowY)));
    float cullB = smoothstep(uMultiFocusB.w - 25.0, uMultiFocusB.w + 10.0, distB);

    roiCull = min(cullA, cullB);
    if (uMultiFocusC.w > 0.0) {
      vec3 relC = vWorldPos - uMultiFocusC.xyz;
      float distC = max(abs(dot(relC, uShadowX)), abs(dot(relC, uShadowY)));
      float cullC = smoothstep(uMultiFocusC.w - 30.0, uMultiFocusC.w + 10.0, distC);
      roiCull = min(roiCull, cullC);
    }
  }

  if (roiCull <= 0.002) discard;

  float shapeMask = 0.0;
  if (uShapeType > 0.5) {
    vec2 halfSize = vec2(42.0, 23.0);
    float cornerRadius = 20.0;
    vec2 q = abs(vLocalXZ) - halfSize;
    float sdf = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - cornerRadius;
    shapeMask = 1.0 - smoothstep(-14.0, 26.0, sdf);
    shapeMask = pow(shapeMask, 1.25);
  } else {
    float dist = length(vLocalXZ);
    shapeMask = 1.0 - smoothstep(32.0, 104.0, dist);
    shapeMask = pow(shapeMask, 1.35);
  }

  float finalAlpha = shapeMask * uOpacity * roiCull;
  if (finalAlpha <= 0.002) discard;

  gl_FragColor = vec4(0.0, 0.0, 0.0, finalAlpha);
}
`;

interface SharedBlobRoiUniforms {
  uRealShadowMode: { value: number };
  uShadowFocus: { value: THREE.Vector3 };
  uShadowX: { value: THREE.Vector3 };
  uShadowY: { value: THREE.Vector3 };
  uSingleSunRadius: { value: number };
  uMultiFocusA: { value: THREE.Vector4 };
  uMultiFocusB: { value: THREE.Vector4 };
  uMultiFocusC: { value: THREE.Vector4 };
}

export class ArenaBlobShadowSystem {
  public readonly group: THREE.Group;
  public readonly sharedGeometry: THREE.PlaneGeometry;
  public readonly sharedUniforms: SharedBlobRoiUniforms;
  public readonly carMeshes: THREE.Mesh[];
  public readonly carMaterials: THREE.ShaderMaterial[];
  public readonly ballMesh: THREE.Mesh;
  public readonly ballMaterial: THREE.ShaderMaterial;
  private readonly _fwdVec = new THREE.Vector3();
  private readonly _rightVec = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.group.name = 'ArenaBlobShadows';

    this.sharedGeometry = new THREE.PlaneGeometry(1, 1);
    this.sharedGeometry.rotateX(-Math.PI / 2);

    this.sharedUniforms = {
      uRealShadowMode: { value: 1 },
      uShadowFocus: { value: new THREE.Vector3() },
      uShadowX: { value: new THREE.Vector3(1, 0, 0) },
      uShadowY: { value: new THREE.Vector3(0, 0, 1) },
      uSingleSunRadius: { value: 1500 },
      uMultiFocusA: { value: new THREE.Vector4(0, 0, 0, 260) },
      uMultiFocusB: { value: new THREE.Vector4(0, 0, 0, 190) },
      uMultiFocusC: { value: new THREE.Vector4(0, 0, 0, -1) },
    };

    this.carMeshes = [];
    this.carMaterials = [];

    for (let i = 0; i < MAX_BLOB_CARS; i++) {
      const mat = this._createMaterial(true, CAR_BLOB_SIZE_X, CAR_BLOB_SIZE_Z);
      const mesh = new THREE.Mesh(this.sharedGeometry, mat);
      mesh.name = `CarBlobShadow_${i}`;
      mesh.scale.set(CAR_BLOB_SIZE_X, 1, CAR_BLOB_SIZE_Z);
      mesh.position.y = BLOB_GROUND_Y;
      mesh.renderOrder = 0.02;
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.userData = { bloomOccluder: false };
      this.carMaterials.push(mat);
      this.carMeshes.push(mesh);
      this.group.add(mesh);
    }

    this.ballMaterial = this._createMaterial(false, BALL_BLOB_SIZE, BALL_BLOB_SIZE);
    this.ballMesh = new THREE.Mesh(this.sharedGeometry, this.ballMaterial);
    this.ballMesh.name = 'BallBlobShadow';
    this.ballMesh.scale.set(BALL_BLOB_SIZE, 1, BALL_BLOB_SIZE);
    this.ballMesh.position.y = BLOB_GROUND_Y;
    this.ballMesh.renderOrder = 0.02;
    this.ballMesh.frustumCulled = false;
    this.ballMesh.userData = { bloomOccluder: false };
    this.group.add(this.ballMesh);

    scene.add(this.group);
  }

  private _createMaterial(isCar: boolean, sizeX: number, sizeZ: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: BLOB_SHADOW_VERTEX_SHADER,
      fragmentShader: BLOB_SHADOW_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      uniforms: {
        uShapeType: { value: isCar ? 1.0 : 0.0 },
        uQuadSize: { value: new THREE.Vector2(sizeX, sizeZ) },
        uOpacity: { value: isCar ? BASE_CAR_SHADOW_OPACITY : BASE_BALL_SHADOW_OPACITY },
        uRealShadowMode: this.sharedUniforms.uRealShadowMode,
        uShadowFocus: this.sharedUniforms.uShadowFocus,
        uShadowX: this.sharedUniforms.uShadowX,
        uShadowY: this.sharedUniforms.uShadowY,
        uSingleSunRadius: this.sharedUniforms.uSingleSunRadius,
        uMultiFocusA: this.sharedUniforms.uMultiFocusA,
        uMultiFocusB: this.sharedUniforms.uMultiFocusB,
        uMultiFocusC: this.sharedUniforms.uMultiFocusC,
      },
    });
  }

  private _clampGroundCoordX(x: number, z: number): number {
    const absZ = Math.abs(z);
    const maxAbsX = absZ > 5080 ? 860 : 4040;
    return Math.max(-maxAbsX, Math.min(maxAbsX, x));
  }

  private _clampGroundCoordZ(z: number): number {
    return Math.max(-5920, Math.min(5920, z));
  }

  public update(
    cars: Array<THREE.Object3D | null>,
    ball: THREE.Object3D | null,
    lighting: BlobShadowLightRigState
  ): void {
    const { mode, singleSunFrustumRadius } = lighting.shadowConfig;
    const realShadowActive = lighting.shouldRenderShadowMap();

    if (!realShadowActive || mode === 'off') {
      this.sharedUniforms.uRealShadowMode.value = 0.0;
    } else if (mode === 'single-sun') {
      this.sharedUniforms.uRealShadowMode.value = 1.0;
      this.sharedUniforms.uShadowFocus.value.copy(lighting.carSunTarget.position);
      this.sharedUniforms.uSingleSunRadius.value = singleSunFrustumRadius;
    } else {
      this.sharedUniforms.uRealShadowMode.value = 2.0;
      const pA = lighting.carSunTarget.position;
      const pB = lighting.ballSunTarget.position;
      this.sharedUniforms.uMultiFocusA.value.set(pA.x, pA.y, pA.z, 260);
      this.sharedUniforms.uMultiFocusB.value.set(pB.x, pB.y, pB.z, 190);
      if (lighting.opponentSun && lighting.opponentSun.visible) {
        const pC = lighting.opponentSunTarget.position;
        this.sharedUniforms.uMultiFocusC.value.set(pC.x, pC.y, pC.z, 260);
      } else {
        this.sharedUniforms.uMultiFocusC.value.w = -1.0;
      }
    }

    this.sharedUniforms.uShadowX.value.copy(lighting._shadowX);
    this.sharedUniforms.uShadowY.value.copy(lighting._shadowY);

    const sunDir = lighting._shadowDir;
    const effSunY = Math.max(0.32, sunDir.y);
    const sunSlopeX = sunDir.x / effSunY;
    const sunSlopeZ = sunDir.z / effSunY;

    for (let i = 0; i < MAX_BLOB_CARS; i++) {
      const car = cars?.[i] ?? null;
      const mesh = this.carMeshes[i]!;
      const mat = this.carMaterials[i]!;

      if (!car || !car.visible) {
        mesh.visible = false;
        continue;
      }

      const pos = car.position;
      this._fwdVec.set(1, 0, 0).applyQuaternion(car.quaternion);
      let fwdX = this._fwdVec.x;
      let fwdZ = this._fwdVec.z;
      const horizLenSq = fwdX * fwdX + fwdZ * fwdZ;

      if (horizLenSq < 1e-4) {
        this._rightVec.set(0, 0, 1).applyQuaternion(car.quaternion);
        fwdX = -this._rightVec.z;
        fwdZ = this._rightVec.x;
      } else {
        const invLen = 1 / Math.sqrt(horizLenSq);
        fwdX *= invLen;
        fwdZ *= invLen;
      }

      const bodyCenterX = pos.x + fwdX * 10.4;
      const bodyCenterZ = pos.z + fwdZ * 10.4;
      const effectiveY = Math.max(0, pos.y);
      const rawProjX = bodyCenterX - effectiveY * sunSlopeX;
      const rawProjZ = bodyCenterZ - effectiveY * sunSlopeZ;
      const projZ = this._clampGroundCoordZ(rawProjZ);
      const projX = this._clampGroundCoordX(rawProjX, projZ);

      const heightAboveGround = Math.max(0, pos.y - 18);
      const heightRatio = Math.min(1, heightAboveGround / 2000);
      const opacity = BASE_CAR_SHADOW_OPACITY * (1.0 - heightRatio * 0.78);

      mesh.visible = opacity > 0.005;
      mesh.position.set(projX, BLOB_GROUND_Y, projZ);
      mesh.rotation.y = Math.atan2(-fwdZ, fwdX);
      mat.uniforms.uOpacity!.value = opacity;
    }

    if (ball && ball.visible) {
      const bPos = ball.position;
      const effectiveY = Math.max(0, bPos.y);
      const rawProjX = bPos.x - effectiveY * sunSlopeX;
      const rawProjZ = bPos.z - effectiveY * sunSlopeZ;
      const projZ = this._clampGroundCoordZ(rawProjZ);
      const projX = this._clampGroundCoordX(rawProjX, projZ);

      const heightAboveGround = Math.max(0, bPos.y - 95);
      const heightRatio = Math.min(1, heightAboveGround / 2000);
      const opacity = BASE_BALL_SHADOW_OPACITY * (1.0 - heightRatio * 0.75);

      this.ballMesh.visible = opacity > 0.005;
      this.ballMesh.position.set(projX, BLOB_GROUND_Y, projZ);
      this.ballMaterial.uniforms.uOpacity!.value = opacity;
    } else {
      this.ballMesh.visible = false;
    }
  }

  public dispose(): void {
    this.sharedGeometry.dispose();
    for (const mat of this.carMaterials) {
      mat.dispose();
    }
    this.ballMaterial.dispose();
    this.group.removeFromParent();
  }
}
