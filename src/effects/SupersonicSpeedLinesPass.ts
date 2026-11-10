import { Pass, FullScreenQuad, CopyShader } from './PostprocessingPasses.ts';
import * as THREE from 'three';
/**
 * SupersonicSpeedLinesPass.ts
 * Full-screen instanced postprocessing pass simulating high-speed supersonic travel lines.
 * Projective lines deform along the camera velocity vector with center clear-mask and smooth fade.
 */

export const SPEED_LINES_COUNT = 80;

export const SPEED_LINES_VERTEX_SHADER = `
  attribute vec4 seed;
  uniform float time, strength, aspect;
  uniform vec3 travel;
  uniform mat4 cameraProjection;
  varying vec2 vStroke;
  varying vec2 vScreen;
  varying float vOpacity;
  void main() {
    vec3 reference = abs(travel.y) > 0.95 ? vec3(1., 0., 0.) : vec3(0., 1., 0.);
    vec3 side = normalize(cross(travel, reference));
    vec3 up = cross(side, travel);
    float angle = seed.x * 6.2831853;
    float radius = mix(240., 1550., sqrt(seed.y));
    float phase = fract(seed.z + time * (0.58 + seed.w * 0.22));
    vec3 head = (side * cos(angle) + up * sin(angle)) * radius
      + travel * mix(2400., -2400., phase);
    vec3 tail = head + travel * mix(240., 440., seed.w);
    // Clip in camera space before division, including a camera looking backward.
    float visible = step(30., -min(head.z, tail.z));
    if (visible < 0.5) {
      gl_Position = vec4(2., 2., 2., 1.);
      vScreen = vec2(2.);
      vStroke = position.xy;
      vOpacity = 0.;
      return;
    }
    if (head.z > -30.) head = mix(head, tail, (-30. - head.z) / (tail.z - head.z));
    if (tail.z > -30.) tail = mix(tail, head, (-30. - tail.z) / (head.z - tail.z));
    vec4 a = cameraProjection * vec4(head, 1.);
    vec4 b = cameraProjection * vec4(tail, 1.);
    vec2 start = a.xy / max(a.w, 0.01);
    vec2 end = b.xy / max(b.w, 0.01);
    vec2 delta = (end - start) * vec2(aspect, 1.);
    vec2 normal = vec2(-delta.y, delta.x) / max(length(delta), 0.0001);
    float width = mix(0.0018, 0.0028, seed.w);
    vec2 point = mix(start, end, position.x)
      + normal / vec2(aspect, 1.) * position.y * width;
    gl_Position = vec4(point, 0., 1.);
    vScreen = point * 0.5 + 0.5;
    vStroke = position.xy;
    vOpacity = visible * strength * mix(0.30, 0.48, seed.w)
      * smoothstep(0., 0.08, phase) * (1. - smoothstep(0.88, 1., phase));
  }
`;

export const SPEED_LINES_FRAGMENT_SHADER = `
  uniform float aspect;
  varying vec2 vStroke;
  varying vec2 vScreen;
  varying float vOpacity;
  void main() {
    float width = 1. - smoothstep(0.15, 1., abs(vStroke.y));
    float cap = smoothstep(0., 0.08, vStroke.x) * (1. - smoothstep(0.35, 1., vStroke.x));
    float centerClear = smoothstep(0.12, 0.34, length((vScreen - 0.5) * vec2(aspect, 1.)));
    gl_FragColor = vec4(vec3(0.88, 0.96, 1.), width * cap * centerClear * vOpacity);
  }
`;

export const DEFAULT_COPY_SHADER = {
  name: 'CopyShader',
  uniforms: {
    tDiffuse: { value: null },
    opacity: { value: 1.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float opacity;
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      gl_FragColor = opacity * texel;
    }
  `,
};

export interface SpeedLinesCameraLike {
  aspect?: number;
  projectionMatrix?: THREE.Matrix4;
  quaternion?: THREE.Quaternion;
}

export class SpeedLinesEffectPass extends Pass {
  camera: THREE.OrthographicCamera;
  copy: FullScreenQuad;
  scene: THREE.Scene;

  constructor(material: THREE.Material) {
    super();

    const {
      ShaderMaterial,
      Scene,
      OrthographicCamera,
      BufferGeometry,
      BufferAttribute,
      InstancedBufferAttribute,
      Mesh,
    } = THREE;

    this.enabled = false;
    this.needsSwap = true;
    this.clear = false;
    this.renderToScreen = false;

    const copyUniforms: { [uniform: string]: THREE.IUniform } = {
      tDiffuse: { value: null },
      opacity: { value: 1.0 },
    };
    this.copy = new FullScreenQuad(
      new ShaderMaterial({
        uniforms: copyUniforms,
        vertexShader: CopyShader.vertexShader,
        fragmentShader: CopyShader.fragmentShader,
        depthTest: false,
        depthWrite: false,
      })
    );

    this.scene = new Scene();
    this.camera = new OrthographicCamera();

    const geometry = new BufferGeometry();
    geometry.setAttribute(
      'position',
      new BufferAttribute(
        new Float32Array([0, -1, 0, 1, -1, 0, 0, 1, 0, 0, 1, 0, 1, -1, 0, 1, 1, 0]),
        3
      )
    );

    const seedArray = new Float32Array(SPEED_LINES_COUNT * 4);
    for (let seedIndex = 0; seedIndex < seedArray.length; seedIndex++) {
      const pseudoRandom = Math.sin((seedIndex + 1) * 127.1) * 43758.5453;
      seedArray[seedIndex] = pseudoRandom - Math.floor(pseudoRandom);
    }
    geometry.setAttribute('seed', new InstancedBufferAttribute(seedArray, 4));
    (geometry as THREE.BufferGeometry & { instanceCount?: number }).instanceCount =
      SPEED_LINES_COUNT;

    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  override render(
    renderer: THREE.WebGLRenderer | null,
    writeBuffer: THREE.WebGLRenderTarget | null,
    readBuffer: THREE.WebGLRenderTarget | null
  ): void {
    if (!renderer) return;
    const copyMaterial = this.copy.material as THREE.ShaderMaterial | null;
    if (copyMaterial && copyMaterial.uniforms.tDiffuse) {
      copyMaterial.uniforms.tDiffuse.value = readBuffer ? readBuffer.texture : null;
    }
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.copy.render(renderer);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = autoClear;
  }

  override dispose(): void {
    this.copy.dispose();
  }
}

/**
 * SupersonicSpeedLinesPass (Original mangled class `Zw`)
 */
export class SupersonicSpeedLinesPass {
  strength: number;
  time: number;
  viewVelocity: THREE.Vector3;
  inverseCamera: THREE.Quaternion;
  material: THREE.ShaderMaterial;
  pass: SpeedLinesEffectPass;

  constructor() {
    const { ShaderMaterial, Vector3, Quaternion, Matrix4, DoubleSide } = THREE;

    this.strength = 0;
    this.time = 0;
    this.viewVelocity = new Vector3();
    this.inverseCamera = new Quaternion();

    this.material = new ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        strength: { value: 0 },
        aspect: { value: 1 },
        travel: { value: new Vector3(0, 0, -1) },
        cameraProjection: { value: new Matrix4() },
      },
      vertexShader: SPEED_LINES_VERTEX_SHADER,
      fragmentShader: SPEED_LINES_FRAGMENT_SHADER,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      side: DoubleSide,
    });

    this.pass = new SpeedLinesEffectPass(this.material);
  }

  update(
    dt: number,
    isSupersonic: boolean,
    velocity: THREE.Vector3 | null | undefined,
    camera: SpeedLinesCameraLike | null | undefined
  ): void {
    if (!camera) return;
    const clampedDt = Math.max(0, Math.min(dt, 0.1));

    const dampFunc =
      THREE.MathUtils.damp ||
      ((curr: number, target: number, lambda: number, step: number) =>
        target + (curr - target) * Math.exp(-lambda * step));
    this.strength = dampFunc(
      this.strength,
      isSupersonic ? 1 : 0,
      isSupersonic ? 12 : 18,
      clampedDt
    );
    this.time += clampedDt;
    this.pass.enabled = this.strength > 0.002;

    const uniforms = this.material.uniforms;
    uniforms.time.value = this.time;
    uniforms.strength.value = this.strength;
    uniforms.aspect.value = camera.aspect ?? 1;

    if (camera.projectionMatrix) {
      (uniforms.cameraProjection.value as THREE.Matrix4).copy(camera.projectionMatrix);
    }

    if (camera.quaternion) {
      this.inverseCamera.copy(camera.quaternion);
      this.inverseCamera.invert();
    }

    if (velocity) {
      this.viewVelocity.copy(velocity);
      this.viewVelocity.applyQuaternion(this.inverseCamera);
      if (this.viewVelocity.lengthSq() > 1) {
        (uniforms.travel.value as THREE.Vector3).copy(this.viewVelocity).normalize();
      }
    }
  }

  dispose(): void {
    this.pass.dispose();
    this.material.dispose();
  }
}
