import * as THREE from 'three';

/**
 * Standard passthrough copy shader
 */
export const CopyShader = {
  name: 'CopyShader',
  uniforms: {
    tDiffuse: { value: null },
    opacity: { value: 1.0 },
  },
  vertexShader: `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,
  fragmentShader: `
		uniform float opacity;
		uniform sampler2D tDiffuse;
		varying vec2 vUv;
		void main() {
			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;
		}`,
};

export interface ShaderDefinitionLike {
  name?: string;
  defines?: Record<string, unknown>;
  uniforms: { [uniform: string]: THREE.IUniform };
  vertexShader: string;
  fragmentShader: string;
  isShaderMaterial?: boolean;
}

export interface EffectPassLike {
  isPass?: boolean;
  enabled: boolean;
  needsSwap: boolean;
  clear: boolean;
  renderToScreen: boolean;
  setSize?(width: number, height: number): void;
  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    deltaTime?: number,
    maskActive?: boolean
  ): void;
  dispose?(): void;
}

/**
 * Base Pass class adhering to EffectComposer lifecycle
 */
export class Pass implements EffectPassLike {
  isPass: boolean;
  enabled: boolean;
  needsSwap: boolean;
  clear: boolean;
  renderToScreen: boolean;

  constructor() {
    this.isPass = true;
    this.enabled = true;
    this.needsSwap = true;
    this.clear = false;
    this.renderToScreen = false;
  }
  setSize(_width: number, _height: number): void {}
  render(
    _renderer: THREE.WebGLRenderer,
    _writeBuffer: THREE.WebGLRenderTarget,
    _readBuffer: THREE.WebGLRenderTarget,
    _deltaTime?: number,
    _maskActive?: boolean
  ): void {
    console.error('THREE.Pass: .render() must be implemented in derived pass.');
  }
  dispose(): void {}
}

/**
 * Single large triangle covering the entire viewport (-1 to 3 in clip space)
 */
export class FullScreenGeometry extends THREE.BufferGeometry {
  declare setAttribute: (name: string, attribute: unknown) => this;
  declare dispose: () => void;

  constructor() {
    super();
    const { Float32BufferAttribute } = THREE;
    this.setAttribute('position', new Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
    this.setAttribute('uv', new Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
  }
}

let sharedFullScreenGeometry: FullScreenGeometry | null = null;
let sharedFullScreenCamera: THREE.OrthographicCamera | null = null;

function getSharedFullScreenGeometry(): FullScreenGeometry {
  if (!sharedFullScreenGeometry) {
    sharedFullScreenGeometry = new FullScreenGeometry();
  }
  return sharedFullScreenGeometry;
}

function getSharedFullScreenCamera(): THREE.OrthographicCamera {
  if (!sharedFullScreenCamera) {
    const { OrthographicCamera } = THREE;
    sharedFullScreenCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  return sharedFullScreenCamera;
}

/**
 * Fullscreen Quad renderer rendering through a fixed OrthographicCamera
 */
export class FullScreenQuad {
  _mesh: THREE.Mesh<FullScreenGeometry, THREE.Material | null>;

  constructor(material: THREE.Material | null = null) {
    const { Mesh } = THREE;
    this._mesh = new Mesh(getSharedFullScreenGeometry(), material);
  }

  dispose(): void {
    if (this._mesh && this._mesh.geometry && typeof this._mesh.geometry.dispose === 'function') {
      this._mesh.geometry.dispose();
    }
  }

  render(renderer: THREE.WebGLRenderer): void {
    if (renderer && typeof renderer.render === 'function') {
      renderer.render(this._mesh, getSharedFullScreenCamera());
    }
  }

  get material(): THREE.Material | null {
    return this._mesh ? this._mesh.material : null;
  }

  set material(value: THREE.Material | null) {
    if (this._mesh) {
      this._mesh.material = value;
    }
  }
}

/**
 * Generic shader pass rendering a full-screen shader material
 */
export class ShaderPass extends Pass {
  textureID: string;
  uniforms: { [uniform: string]: THREE.IUniform } | null;
  material: THREE.ShaderMaterial | null;
  _fsQuad: FullScreenQuad;

  constructor(shader?: THREE.ShaderMaterial | ShaderDefinitionLike | null, textureID = 'tDiffuse') {
    super();
    this.textureID = textureID;
    this.uniforms = null;
    this.material = null;

    const { ShaderMaterial, UniformsUtils } = THREE;

    if (
      shader &&
      ((shader as THREE.ShaderMaterial).isShaderMaterial ||
        (typeof ShaderMaterial === 'function' && shader instanceof ShaderMaterial))
    ) {
      const shaderMat = shader as THREE.ShaderMaterial;
      this.uniforms = shaderMat.uniforms;
      this.material = shaderMat;
    } else if (shader) {
      const shaderDef = shader as ShaderDefinitionLike;
      this.uniforms = UniformsUtils.clone(shaderDef.uniforms);
      this.material = new ShaderMaterial({
        name: shaderDef.name !== undefined ? shaderDef.name : 'unspecified',
        defines: Object.assign({}, shaderDef.defines),
        uniforms: this.uniforms,
        vertexShader: shaderDef.vertexShader,
        fragmentShader: shaderDef.fragmentShader,
      });
    }

    this._fsQuad = new FullScreenQuad(this.material);
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    _deltaTime?: number,
    _maskActive?: boolean
  ): void {
    if (this.uniforms && this.uniforms[this.textureID] && readBuffer) {
      this.uniforms[this.textureID].value = readBuffer.texture;
    }
    this._fsQuad.material = this.material;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
      this._fsQuad.render(renderer);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) {
        renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
      }
      this._fsQuad.render(renderer);
    }
  }

  dispose(): void {
    if (this.material && typeof this.material.dispose === 'function') {
      this.material.dispose();
    }
    if (this._fsQuad) {
      this._fsQuad.dispose();
    }
  }
}

/**
 * RenderPass
 * Evaluates the 3D scene & camera into an offscreen render target
 */
export class RenderPass extends Pass {
  scene: THREE.Scene;
  camera: THREE.Camera;
  overrideMaterial: THREE.Material | null;
  clearColor: THREE.ColorRepresentation | null;
  clearAlpha: number | null;
  clearDepth: boolean;
  isRenderPass: boolean;
  _oldClearColor: THREE.Color;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    overrideMaterial: THREE.Material | null = null,
    clearColor: THREE.ColorRepresentation | null = null,
    clearAlpha: number | null = null
  ) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.overrideMaterial = overrideMaterial;
    this.clearColor = clearColor;
    this.clearAlpha = clearAlpha;
    this.clear = true;
    this.clearDepth = false;
    this.needsSwap = false;
    this.isRenderPass = true;

    const { Color } = THREE;
    this._oldClearColor = new Color();
  }

  render(
    renderer: THREE.WebGLRenderer,
    _writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget
  ): void {
    if (!renderer) return;

    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    let oldClearAlpha = 1;
    let oldOverrideMaterial: THREE.Material | null = null;

    if (this.overrideMaterial !== null && this.scene) {
      oldOverrideMaterial = this.scene.overrideMaterial;
      this.scene.overrideMaterial = this.overrideMaterial;
    }

    if (this.clearColor !== null) {
      renderer.getClearColor(this._oldClearColor);
      renderer.setClearColor(this.clearColor, renderer.getClearAlpha());
    }

    if (this.clearAlpha !== null) {
      oldClearAlpha = renderer.getClearAlpha();
      renderer.setClearAlpha(this.clearAlpha);
    }

    if (this.clearDepth === true && renderer.clearDepth) {
      renderer.clearDepth();
    }

    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);

    if (this.clear === true) {
      renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
    }

    renderer.render(this.scene, this.camera);

    if (this.clearColor !== null) {
      renderer.setClearColor(this._oldClearColor);
    }

    if (this.clearAlpha !== null) {
      renderer.setClearAlpha(oldClearAlpha);
    }

    if (this.overrideMaterial !== null && this.scene) {
      this.scene.overrideMaterial = oldOverrideMaterial;
    }

    renderer.autoClear = oldAutoClear;
  }
}
