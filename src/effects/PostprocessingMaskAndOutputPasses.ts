import * as THREE from 'three';
import { Pass, FullScreenQuad } from './PostprocessingPasses.ts';

/**
 * MaskPass
 * Uses the WebGL stencil buffer to confine subsequent rendering to a masked region
 */
export class MaskPass extends Pass {
  scene: THREE.Scene;
  camera: THREE.Camera;
  inverse: boolean;

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.clear = true;
    this.needsSwap = false;
    this.inverse = false;
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget
  ): void {
    const gl = renderer.getContext ? renderer.getContext() : null;
    const state = renderer.state;

    if (!gl || !state) return;

    state.buffers.color.setMask(false);
    state.buffers.depth.setMask(false);
    state.buffers.color.setLocked(true);
    state.buffers.depth.setLocked(true);

    const writeValue = this.inverse ? 0 : 1;
    const clearValue = this.inverse ? 1 : 0;

    state.buffers.stencil.setTest(true);
    state.buffers.stencil.setOp(gl.REPLACE, gl.REPLACE, gl.REPLACE);
    state.buffers.stencil.setFunc(gl.ALWAYS, writeValue, 0xffffffff);
    state.buffers.stencil.setClear(clearValue);
    state.buffers.stencil.setLocked(true);

    renderer.setRenderTarget(readBuffer);
    if (this.clear) renderer.clear();
    renderer.render(this.scene, this.camera);

    renderer.setRenderTarget(writeBuffer);
    if (this.clear) renderer.clear();
    renderer.render(this.scene, this.camera);

    state.buffers.color.setLocked(false);
    state.buffers.depth.setLocked(false);
    state.buffers.color.setMask(true);
    state.buffers.depth.setMask(true);

    state.buffers.stencil.setLocked(false);
    state.buffers.stencil.setFunc(gl.EQUAL, 1, 0xffffffff);
    state.buffers.stencil.setOp(gl.KEEP, gl.KEEP, gl.KEEP);
    state.buffers.stencil.setLocked(true);
  }
}

/**
 * ClearMaskPass
 * Disables and unlocks stencil testing after masked passes complete
 */
export class ClearMaskPass extends Pass {
  constructor() {
    super();
    this.needsSwap = false;
  }

  render(renderer: THREE.WebGLRenderer): void {
    if (renderer && renderer.state && renderer.state.buffers && renderer.state.buffers.stencil) {
      renderer.state.buffers.stencil.setLocked(false);
      renderer.state.buffers.stencil.setTest(false);
    }
  }
}

/**
 * Output color grading and tonemapping shader
 */
export const OutputShader = {
  name: 'OutputShader',
  uniforms: {
    tDiffuse: { value: null },
    toneMappingExposure: { value: 1.0 },
  },
  vertexShader: `
		precision highp float;
		uniform mat4 modelViewMatrix;
		uniform mat4 projectionMatrix;
		attribute vec3 position;
		attribute vec2 uv;
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,
  fragmentShader: `
		precision highp float;
		uniform sampler2D tDiffuse;
		#include <tonemapping_pars_fragment>
		#include <colorspace_pars_fragment>
		varying vec2 vUv;
		void main() {
			gl_FragColor = texture2D( tDiffuse, vUv );
			#ifdef LINEAR_TONE_MAPPING
				gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );
			#elif defined( REINHARD_TONE_MAPPING )
				gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );
			#elif defined( CINEON_TONE_MAPPING )
				gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );
			#elif defined( ACES_FILMIC_TONE_MAPPING )
				gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );
			#elif defined( AGX_TONE_MAPPING )
				gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );
			#elif defined( NEUTRAL_TONE_MAPPING )
				gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );
			#elif defined( CUSTOM_TONE_MAPPING )
				gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );
			#endif
			#ifdef SRGB_TRANSFER
				gl_FragColor = sRGBTransferOETF( gl_FragColor );
			#endif
		}`,
};

/**
 * OutputPass
 * Dynamically maps output color space and tone mapping algorithm onto the OutputShader defines
 */
export class OutputPass extends Pass {
  isOutputPass: boolean;
  uniforms: { [uniform: string]: THREE.IUniform };
  material: THREE.ShaderMaterial | THREE.RawShaderMaterial;
  _fsQuad: FullScreenQuad;
  _outputColorSpace: THREE.ColorSpace | string | null;
  _toneMapping: THREE.ToneMapping | number | null;

  constructor() {
    super();
    this.isOutputPass = true;

    const { RawShaderMaterial, ShaderMaterial, UniformsUtils } = THREE;
    const MaterialClass = RawShaderMaterial || ShaderMaterial;

    this.uniforms = UniformsUtils.clone(OutputShader.uniforms);
    this.material = new MaterialClass({
      name: OutputShader.name,
      uniforms: this.uniforms,
      vertexShader: OutputShader.vertexShader,
      fragmentShader: OutputShader.fragmentShader,
    });
    this._fsQuad = new FullScreenQuad(this.material);
    this._outputColorSpace = null;
    this._toneMapping = null;
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget
  ): void {
    const {
      ColorManagement,
      SRGBTransfer: SRGBTransferConst,
      LinearToneMapping: LinearConst,
      ReinhardToneMapping: ReinhardConst,
      CineonToneMapping: CineonConst,
      ACESFilmicToneMapping: ACESConst,
      AgXToneMapping: AgXConst,
      NeutralToneMapping: NeutralConst,
      CustomToneMapping: CustomConst,
    } = THREE;

    if (this.uniforms && this.uniforms.tDiffuse && readBuffer) {
      this.uniforms.tDiffuse.value = readBuffer.texture;
    }
    if (this.uniforms && this.uniforms.toneMappingExposure) {
      this.uniforms.toneMappingExposure.value = renderer ? renderer.toneMappingExposure : 1.0;
    }

    if (
      renderer &&
      (this._outputColorSpace !== renderer.outputColorSpace ||
        this._toneMapping !== renderer.toneMapping)
    ) {
      this._outputColorSpace = renderer.outputColorSpace;
      this._toneMapping = renderer.toneMapping;

      this.material.defines = {};

      const colorMgmt = ColorManagement as typeof THREE.ColorManagement & {
        getTransfer?: (colorSpace: THREE.ColorSpace | string) => string;
      };
      if (
        colorMgmt &&
        colorMgmt.getTransfer &&
        colorMgmt.getTransfer(this._outputColorSpace) === SRGBTransferConst
      ) {
        this.material.defines.SRGB_TRANSFER = '';
      }

      if (this._toneMapping === LinearConst) {
        this.material.defines.LINEAR_TONE_MAPPING = '';
      } else if (this._toneMapping === ReinhardConst) {
        this.material.defines.REINHARD_TONE_MAPPING = '';
      } else if (this._toneMapping === CineonConst) {
        this.material.defines.CINEON_TONE_MAPPING = '';
      } else if (this._toneMapping === ACESConst) {
        this.material.defines.ACES_FILMIC_TONE_MAPPING = '';
      } else if (this._toneMapping === AgXConst) {
        this.material.defines.AGX_TONE_MAPPING = '';
      } else if (this._toneMapping === NeutralConst) {
        this.material.defines.NEUTRAL_TONE_MAPPING = '';
      } else if (this._toneMapping === CustomConst) {
        this.material.defines.CUSTOM_TONE_MAPPING = '';
      }

      this.material.needsUpdate = true;
    }

    if (this.renderToScreen === true) {
      if (renderer) renderer.setRenderTarget(null);
      this._fsQuad.render(renderer);
    } else {
      if (renderer) {
        renderer.setRenderTarget(writeBuffer);
        if (this.clear) {
          renderer.clear(
            renderer.autoClearColor,
            renderer.autoClearDepth,
            renderer.autoClearStencil
          );
        }
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
