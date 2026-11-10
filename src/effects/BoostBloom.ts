import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
/**
 * BoostBloom.ts
 * Multi-pass progressive dual-filtering (downsampling & upsampling) bloom post-processor.
 * Generates low-frequency halo glow for vehicle boost fires, supersonic plumes, and goals.
 */

export const BLOOM_MIP_LEVELS = 4;
export const BLOOM_DOWNSCALE_FACTOR = 0.5;
export const BLOOM_THRESHOLD = 1.2;
export const BLOOM_SMOOTH_WIDTH = 0.01;
export const BLOOM_OUTPUT_STRENGTH = 0.275 * 3;
export const BLOOM_WEIGHTS = [0.76, 0.68, 0.6, 0.52 + 0.44];

export const BLOOM_QUAD_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const BLOOM_DOWNSAMPLE_FRAGMENT_SHADER = `
  uniform sampler2D inputTexture;
  uniform vec2 texelSize;
  uniform float applyThreshold;
  uniform float threshold;
  uniform float smoothWidth;
  varying vec2 vUv;

  void main() {
    // Four bilinear taps are enough for a stable, low-frequency boost
    // halo and suppress the stair-stepping of a single scaled lookup.
    vec3 color = (
      texture2D(inputTexture, vUv + texelSize * vec2(-0.5, -0.5)).rgb +
      texture2D(inputTexture, vUv + texelSize * vec2( 0.5, -0.5)).rgb +
      texture2D(inputTexture, vUv + texelSize * vec2(-0.5,  0.5)).rgb +
      texture2D(inputTexture, vUv + texelSize * vec2( 0.5,  0.5)).rgb
    ) * 0.25;

    if (applyThreshold > 0.5) {
      float brightness = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color *= smoothstep(threshold, threshold + smoothWidth, brightness);
    }
    gl_FragColor = vec4(color, 1.0);
  }
`;

export const BLOOM_UPSAMPLE_FRAGMENT_SHADER = `
  uniform sampler2D lowTexture;
  uniform sampler2D highTexture;
  uniform vec2 lowTexelSize;
  uniform float highWeight;
  uniform float lowWeight;
  uniform float outputStrength;
  varying vec2 vUv;

  void main() {
    vec2 d = lowTexelSize;
    // Tent-filter the coarser level while scaling it up. The diagonal
    // taps carry twice the weight of the axial taps, matching the smooth
    // rounded falloff expected from the old Gaussian chain.
    vec3 low = (
      texture2D(lowTexture, vUv + vec2(-d.x, -d.y)).rgb * 2.0 +
      texture2D(lowTexture, vUv + vec2( d.x, -d.y)).rgb * 2.0 +
      texture2D(lowTexture, vUv + vec2(-d.x,  d.y)).rgb * 2.0 +
      texture2D(lowTexture, vUv + vec2( d.x,  d.y)).rgb * 2.0 +
      texture2D(lowTexture, vUv + vec2(-2.0 * d.x, 0.0)).rgb +
      texture2D(lowTexture, vUv + vec2( 2.0 * d.x, 0.0)).rgb +
      texture2D(lowTexture, vUv + vec2(0.0, -2.0 * d.y)).rgb +
      texture2D(lowTexture, vUv + vec2(0.0,  2.0 * d.y)).rgb
    ) / 12.0;
    vec3 high = texture2D(highTexture, vUv).rgb;
    gl_FragColor = vec4(
      (high * highWeight + low * lowWeight) * outputStrength,
      1.0
    );
  }
`;

export interface BloomRenderTargetTextureLike {
  name: string;
  generateMipmaps: boolean;
}

export interface BloomRenderTargetLike {
  texture: THREE.Texture | BloomRenderTargetTextureLike;
  width: number;
  height: number;
  setSize(width: number, height: number): void;
  dispose(): void;
}

export interface BloomUniform<TValue> {
  value?: TValue;
}

export interface BloomDownsampleUniforms {
  [uniform: string]: THREE.IUniform;
  inputTexture: THREE.IUniform<THREE.Texture | BloomRenderTargetTextureLike | null>;
  texelSize: THREE.IUniform<THREE.Vector2>;
  applyThreshold: THREE.IUniform<number>;
  threshold: THREE.IUniform<number>;
  smoothWidth: THREE.IUniform<number>;
}

export interface BloomUpsampleUniforms {
  [uniform: string]: THREE.IUniform;
  lowTexture: THREE.IUniform<THREE.Texture | BloomRenderTargetTextureLike | null>;
  highTexture: THREE.IUniform<THREE.Texture | BloomRenderTargetTextureLike | null>;
  lowTexelSize: THREE.IUniform<THREE.Vector2>;
  highWeight: THREE.IUniform<number>;
  lowWeight: THREE.IUniform<number>;
  outputStrength: THREE.IUniform<number>;
}

export interface BloomMaterialLike<TUniforms> {
  uniforms: TUniforms;
  dispose(): void;
}

export interface BloomQuadLike {
  material:
    | THREE.Material
    | BloomMaterialLike<BloomDownsampleUniforms>
    | BloomMaterialLike<BloomUpsampleUniforms>;
  render(renderer: THREE.WebGLRenderer): void;
  dispose(): void;
}

export function createBloomRenderTarget(
  name: string,
  hasDepth: boolean
): THREE.WebGLRenderTarget | BloomRenderTargetLike {
  const RenderTarget = THREE.WebGLRenderTarget;
  if (!RenderTarget) {
    // Mock target for headless testing
    return {
      texture: { name, generateMipmaps: false },
      width: 1,
      height: 1,
      setSize(w: number, h: number) {
        this.width = w;
        this.height = h;
      },
      dispose() {},
    };
  }
  const target = new RenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: hasDepth,
    stencilBuffer: false,
  });
  target.texture.name = name;
  target.texture.generateMipmaps = false;
  return target;
}

export class BoostBloom {
  downTargets: Array<THREE.WebGLRenderTarget | BloomRenderTargetLike>;
  downsampleMaterial: BloomMaterialLike<BloomDownsampleUniforms>;
  height?: number;
  oldClearColor: THREE.Color;
  quad: BloomQuadLike;
  renderSubmissions: number;
  renderer: THREE.WebGLRenderer | null;
  sourceTarget: THREE.WebGLRenderTarget | BloomRenderTargetLike;
  texture: THREE.Texture | BloomRenderTargetTextureLike | null;
  upTargets: Array<THREE.WebGLRenderTarget | BloomRenderTargetLike>;
  upsampleMaterial: BloomMaterialLike<BloomUpsampleUniforms>;
  width?: number;

  constructor(
    renderer: THREE.WebGLRenderer | null,
    width: number,
    height: number,
    pixelRatio?: number
  ) {
    this.renderer = renderer;
    this.renderSubmissions = 1 + BLOOM_MIP_LEVELS + (BLOOM_MIP_LEVELS - 1);
    this.sourceTarget = createBloomRenderTarget('BoostBloom.source', true);
    this.downTargets = [];
    this.upTargets = [];

    const ShaderMaterial = THREE.ShaderMaterial;
    const Vector2 = THREE.Vector2;
    const Color = THREE.Color;
    // FullScreenQuad imported from three/addons/postprocessing/Pass.js

    this.oldClearColor = new Color();

    for (let mipIndex = 0; mipIndex < BLOOM_MIP_LEVELS; mipIndex += 1) {
      this.downTargets.push(createBloomRenderTarget(`BoostBloom.down${mipIndex}`, false));
      if (mipIndex < BLOOM_MIP_LEVELS - 1) {
        this.upTargets.push(createBloomRenderTarget(`BoostBloom.up${mipIndex}`, false));
      }
    }

    this.texture = this.upTargets[0]?.texture || null;

    if (ShaderMaterial) {
      const downUniforms: BloomDownsampleUniforms = {
        inputTexture: { value: null },
        texelSize: { value: new Vector2() },
        applyThreshold: { value: 0 },
        threshold: { value: BLOOM_THRESHOLD },
        smoothWidth: { value: BLOOM_SMOOTH_WIDTH },
      };
      this.downsampleMaterial = new ShaderMaterial({
        uniforms: downUniforms,
        vertexShader: BLOOM_QUAD_VERTEX_SHADER,
        fragmentShader: BLOOM_DOWNSAMPLE_FRAGMENT_SHADER,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }) as THREE.ShaderMaterial & BloomMaterialLike<BloomDownsampleUniforms>;

      const upUniforms: BloomUpsampleUniforms = {
        lowTexture: { value: null },
        highTexture: { value: null },
        lowTexelSize: { value: new Vector2() },
        highWeight: { value: 1 },
        lowWeight: { value: 1 },
        outputStrength: { value: 1 },
      };
      this.upsampleMaterial = new ShaderMaterial({
        uniforms: upUniforms,
        vertexShader: BLOOM_QUAD_VERTEX_SHADER,
        fragmentShader: BLOOM_UPSAMPLE_FRAGMENT_SHADER,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }) as THREE.ShaderMaterial & BloomMaterialLike<BloomUpsampleUniforms>;
    } else {
      this.downsampleMaterial = {
        uniforms: {
          inputTexture: { value: null },
          texelSize: { value: new Vector2() },
          applyThreshold: { value: 0 },
          threshold: { value: BLOOM_THRESHOLD },
          smoothWidth: { value: BLOOM_SMOOTH_WIDTH },
        },
        dispose() {},
      };
      this.upsampleMaterial = {
        uniforms: {
          lowTexture: { value: null },
          highTexture: { value: null },
          lowTexelSize: { value: new Vector2() },
          highWeight: { value: 1 },
          lowWeight: { value: 1 },
          outputStrength: { value: 1 },
        },
        dispose() {},
      };
    }

    if (FullScreenQuad) {
      this.quad = new FullScreenQuad(
        this.downsampleMaterial as THREE.Material
      ) as unknown as BloomQuadLike;
    } else {
      this.quad = { material: this.downsampleMaterial, render() {}, dispose() {} };
    }

    this.setSize(width, height, pixelRatio);
  }

  setSize(
    width: number,
    height: number,
    pixelRatio: number = this.renderer?.getPixelRatio?.() ?? 1
  ): void {
    let currentWidth = Math.max(1, Math.round(width * pixelRatio * BLOOM_DOWNSCALE_FACTOR));
    let currentHeight = Math.max(1, Math.round(height * pixelRatio * BLOOM_DOWNSCALE_FACTOR));
    this.sourceTarget.setSize(currentWidth, currentHeight);

    for (let mipIndex = 0; mipIndex < BLOOM_MIP_LEVELS; mipIndex += 1) {
      currentWidth = Math.max(1, Math.round(currentWidth / 2));
      currentHeight = Math.max(1, Math.round(currentHeight / 2));
      this.downTargets[mipIndex].setSize(currentWidth, currentHeight);
      if (mipIndex < BLOOM_MIP_LEVELS - 1) {
        this.upTargets[mipIndex].setSize(currentWidth, currentHeight);
      }
    }
  }

  clear(): void {
    if (!this.renderer) return;
    const renderer = this.renderer;
    const prevRenderTarget = renderer.getRenderTarget();
    const prevClearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this.oldClearColor);
    renderer.setRenderTarget(this.upTargets[0] as THREE.WebGLRenderTarget);
    renderer.setClearColor(0, 0);
    renderer.clear(true, false, false);
    renderer.setRenderTarget(prevRenderTarget);
    renderer.setClearColor(this.oldClearColor, prevClearAlpha);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.renderer) return;
    const renderer = this.renderer;
    const prevRenderTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    const prevClearAlpha = renderer.getClearAlpha();

    renderer.getClearColor(this.oldClearColor);
    renderer.autoClear = false;
    renderer.setRenderTarget(this.sourceTarget as THREE.WebGLRenderTarget);
    renderer.setClearColor(0, 0);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);

    this.quad.material = this.downsampleMaterial;
    let currentInputTarget = this.sourceTarget;
    for (let mipLevel = 0; mipLevel < BLOOM_MIP_LEVELS; mipLevel += 1) {
      this.downsampleMaterial.uniforms.inputTexture.value = currentInputTarget.texture;
      this.downsampleMaterial.uniforms.texelSize.value.set(
        1 / currentInputTarget.width,
        1 / currentInputTarget.height
      );
      this.downsampleMaterial.uniforms.applyThreshold.value = mipLevel === 0 ? 1 : 0;
      renderer.setRenderTarget(this.downTargets[mipLevel] as THREE.WebGLRenderTarget);
      this.quad.render(renderer);
      currentInputTarget = this.downTargets[mipLevel];
    }

    this.quad.material = this.upsampleMaterial;
    let currentUpTarget = this.downTargets[BLOOM_MIP_LEVELS - 1];
    for (let mipLevel = BLOOM_MIP_LEVELS - 2; mipLevel >= 0; mipLevel -= 1) {
      this.upsampleMaterial.uniforms.lowTexture.value = currentUpTarget.texture;
      this.upsampleMaterial.uniforms.highTexture.value = this.downTargets[mipLevel].texture;
      this.upsampleMaterial.uniforms.lowTexelSize.value.set(
        1 / currentUpTarget.width,
        1 / currentUpTarget.height
      );
      this.upsampleMaterial.uniforms.highWeight.value = BLOOM_WEIGHTS[mipLevel];
      this.upsampleMaterial.uniforms.lowWeight.value =
        mipLevel === BLOOM_MIP_LEVELS - 2 ? BLOOM_WEIGHTS[BLOOM_MIP_LEVELS - 1] : 1;
      this.upsampleMaterial.uniforms.outputStrength.value =
        mipLevel === 0 ? BLOOM_OUTPUT_STRENGTH : 1;
      renderer.setRenderTarget(this.upTargets[mipLevel] as THREE.WebGLRenderTarget);
      this.quad.render(renderer);
      currentUpTarget = this.upTargets[mipLevel];
    }

    renderer.setRenderTarget(prevRenderTarget);
    renderer.setClearColor(this.oldClearColor, prevClearAlpha);
    renderer.autoClear = prevAutoClear;
  }

  dispose() {
    this.sourceTarget.dispose();
    for (const target of this.downTargets) target.dispose();
    for (const target of this.upTargets) target.dispose();
    this.downsampleMaterial.dispose();
    this.upsampleMaterial.dispose();
    this.quad.dispose();
  }
}
