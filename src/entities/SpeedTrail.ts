import * as THREE from 'three';
import {
  SPEED_TRAIL_MAX_POINTS,
  SPEED_TRAIL_MAX_VERTICES,
  clearSpeedTrailPoints,
  rebuildSpeedTrailRibbonGeometry,
  stepSpeedTrailEmission,
  type SpeedTrailPoint,
  type SpeedTrailRibbonState,
} from './speedTrailRibbonPipeline.ts';

export type { SpeedTrailPoint };

const SPEED_TRAIL_VERTEX_SHADER = `
  attribute float aAcross;
  attribute float aLifeAlpha;
  varying float vAcross;
  varying float vLifeAlpha;
  void main() {
    vAcross = aAcross;
    vLifeAlpha = aLifeAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SPEED_TRAIL_FRAGMENT_SHADER = `
  uniform float uOpacity;
  uniform vec3 uColor;
  varying float vAcross;
  varying float vLifeAlpha;
  void main() {
    // The recovered 64uu Size.X is the ribbon envelope, not a 64uu
    // opaque band. Preserve that geometry while matching the material's
    // much narrower cross-ribbon luminous profile.
    float crossSection = 1.0 - smoothstep(0.0, 0.32, abs(vAcross));
    float alpha = uOpacity * vLifeAlpha * crossSection;
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

function createSpeedTrailRibbonResources(
  geometry: THREE.BufferGeometry,
  positions: Float32Array,
  lifeAlpha: Float32Array,
  across: Float32Array,
  indices: Uint16Array
): {
  positionAttribute: THREE.BufferAttribute;
  lifeAlphaAttribute: THREE.BufferAttribute;
  material: THREE.ShaderMaterial;
  ribbon: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
} {
  for (let i = 0; i < SPEED_TRAIL_MAX_VERTICES; i++) {
    across[i * 2] = -1;
    across[i * 2 + 1] = 1;
  }
  for (let i = 0; i < SPEED_TRAIL_MAX_VERTICES - 1; i++) {
    const idx = i * 6;
    const v = i * 2;
    indices[idx] = v;
    indices[idx + 1] = v + 2;
    indices[idx + 2] = v + 1;
    indices[idx + 3] = v + 1;
    indices[idx + 4] = v + 2;
    indices[idx + 5] = v + 3;
  }

  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  const lifeAlphaAttribute = new THREE.BufferAttribute(lifeAlpha, 1);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  lifeAlphaAttribute.setUsage(THREE.DynamicDrawUsage);

  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('aAcross', new THREE.BufferAttribute(across, 1));
  geometry.setAttribute('aLifeAlpha', lifeAlphaAttribute);
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    uniforms: {
      uOpacity: { value: 0 },
      uColor: { value: new THREE.Color(15398399) },
    },
    vertexShader: SPEED_TRAIL_VERTEX_SHADER,
    fragmentShader: SPEED_TRAIL_FRAGMENT_SHADER,
  });
  material.toneMapped = true;

  const ribbon = new THREE.Mesh(geometry, material);
  ribbon.name = 'SpeedTrail_PS-ribbon';
  ribbon.visible = false;
  ribbon.frustumCulled = false;
  ribbon.renderOrder = 1;

  return { positionAttribute, lifeAlphaAttribute, material, ribbon };
}

/**
 * SpeedTrail.ts
 * Luminous ribbon particle trail emitted behind high-speed objects (such as the ball or supersonic vehicles).
 * Dynamically computes camera-facing ribbon geometry and smooth opacity based on velocity.
 */
export class SpeedTrail implements SpeedTrailRibbonState {
  public side = new THREE.Vector3();
  public opacity = 0;
  public across = new Float32Array(SPEED_TRAIL_MAX_VERTICES * 2);
  public cameraPosition = new THREE.Vector3();
  public lastCameraPosition = new THREE.Vector3(NaN, NaN, NaN);
  public emissionClock = 0;
  public fallbackAxis = new THREE.Vector3(0, 1, 0);
  public geometry = new THREE.BufferGeometry();
  public geometryDirty = true;
  public hasSourcePosition = false;
  public indices = new Uint16Array((SPEED_TRAIL_MAX_VERTICES - 1) * 6);
  public isEmitting = false;
  public lastEmitting = false;
  public lifeAlpha = new Float32Array(SPEED_TRAIL_MAX_VERTICES * 2);
  public lifeAlphaAttribute: THREE.BufferAttribute;
  public material: THREE.ShaderMaterial;
  public object = new THREE.Group();
  public pointPool: SpeedTrailPoint[];
  public points: SpeedTrailPoint[] = [];
  public positionAttribute: THREE.BufferAttribute;
  public positions = new Float32Array(SPEED_TRAIL_MAX_VERTICES * 2 * 3);
  public previousSourcePosition = new THREE.Vector3();
  public previousSpeed = 0;
  public ribbon: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  public sourcePosition = new THREE.Vector3();
  public tangent = new THREE.Vector3();
  public timeDilation = 1;
  public viewDirection = new THREE.Vector3();

  constructor() {
    this.pointPool = Array.from({ length: SPEED_TRAIL_MAX_POINTS }, () => ({
      position: new THREE.Vector3(),
      age: 0,
    }));

    const resources = createSpeedTrailRibbonResources(
      this.geometry,
      this.positions,
      this.lifeAlpha,
      this.across,
      this.indices
    );
    this.positionAttribute = resources.positionAttribute;
    this.lifeAlphaAttribute = resources.lifeAlphaAttribute;
    this.material = resources.material;
    this.ribbon = resources.ribbon;

    this.object.name = 'ball-speed-trail';
    this.object.add(this.ribbon);
  }

  reset(): void {
    clearSpeedTrailPoints(this);
    this.hasSourcePosition = false;
    this.previousSpeed = 0;
    this.opacity = 0;
    const uOpacity = this.material.uniforms.uOpacity;
    if (uOpacity) {
      uOpacity.value = 0;
    }
    this.ribbon.visible = false;
    this.geometry.setDrawRange(0, 0);
    this.geometryDirty = true;
  }

  update(sourcePos: THREE.Vector3, velocity: THREE.Vector3, dt: number): void {
    stepSpeedTrailEmission(this, sourcePos, velocity, dt);
  }

  prepare(camera: THREE.Camera | null | undefined): void {
    rebuildSpeedTrailRibbonGeometry(this, camera);
  }

  rebuildGeometry(camera: THREE.Camera | null | undefined): void {
    rebuildSpeedTrailRibbonGeometry(this, camera);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    const parentGroup = this.object.parent;
    if (parentGroup) {
      parentGroup.remove(this.object);
    }
  }
}
