import * as THREE from 'three';
import {
  advanceDemolishShockwaveSimClock,
  evaluateDemolishShockwaveFrame,
  getDemolishShockwaveConfig,
  getDemolishShockwaveSimState,
  resolveDemolishSimTargetUu,
  subscribeDemolishShockwaveConfig,
  subscribeDemolishShockwaveSim,
  type DemolishShockwaveConfig,
} from '../ui-core/config/demolishShockwaveConfig.ts';

export const DEMOLITION_SHOCKWAVE_VERTEX_SHADER = `
  uniform float uQuadSize;
  uniform float uVerticalOffset;
  varying vec2 vUv;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(0.0, uVerticalOffset, 0.0, 1.0);
    viewPosition.xy += position.xy * uQuadSize;
    gl_Position = projectionMatrix * viewPosition;
    vUv = uv;
  }
`;

export const DEMOLITION_SHOCKWAVE_FRAGMENT_SHADER = `
  uniform float uInnerHole;
  uniform float uFeather;
  uniform float uOuterFeather;
  uniform float uGlowFactor;
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec2 vUv;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float dist = length(p) / 0.72;
    if (dist > 1.38) discard;

    float aa = max(fwidth(dist), 0.012);
    float outerSoft = max(uOuterFeather, aa);
    float outerAlpha = 1.0 - smoothstep(1.0 - outerSoft, 1.0 + aa, dist);

    float innerAlpha = 1.0;
    if (uInnerHole > 0.001) {
      float inStart = max(0.0, uInnerHole - uFeather * uInnerHole);
      float inEnd = max(inStart + aa, min(1.0, uInnerHole + uFeather * (1.0 - uInnerHole) * 0.5));
      innerAlpha = smoothstep(inStart, inEnd, dist);
    }

    float holeFade = 1.0 - smoothstep(0.94, 1.0, uInnerHole);
    float ringAlpha = innerAlpha * outerAlpha * holeFade;

    float glowAlpha = 0.0;
    float outerHalo = 0.0;
    if (uGlowFactor > 0.001) {
      float haloSpan = max(0.04, 0.30 * clamp(uGlowFactor, 0.0, 1.5));
      outerHalo = exp(-pow(max(0.0, dist - 0.92) / haloSpan, 2.0)) * (1.0 - smoothstep(1.16, 1.38, dist));
      glowAlpha = outerHalo * clamp(uGlowFactor * 0.75, 0.0, 0.92) * (1.0 - uInnerHole * 0.5);
    }

    float alpha = clamp(max(ringAlpha, glowAlpha), 0.0, 1.0) * uOpacity;
    if (alpha < 0.002) discard;

    vec3 color = uColor * (1.0 + uGlowFactor * (0.85 * ringAlpha + 0.55 * outerHalo));
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface ShockwaveUniforms {
  [uniform: string]: THREE.IUniform<unknown>;
  uQuadSize: THREE.IUniform<number>;
  uVerticalOffset: THREE.IUniform<number>;
  uInnerHole: THREE.IUniform<number>;
  uFeather: THREE.IUniform<number>;
  uOuterFeather: THREE.IUniform<number>;
  uGlowFactor: THREE.IUniform<number>;
  uOpacity: THREE.IUniform<number>;
  uColor: THREE.IUniform<THREE.Color>;
}

export class DemolitionEffect {
  public elapsed: number;
  public object: THREE.Group;
  public shockwave: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  public uniforms: ShockwaveUniforms;
  public wasDemolished: boolean | null;

  constructor() {
    this.object = new THREE.Group();
    this.object.name = 'demolition-effect';
    this.object.visible = false;

    this.wasDemolished = null;
    this.elapsed = Infinity;

    this.uniforms = {
      uQuadSize: { value: 10 },
      uVerticalOffset: { value: 32 },
      uInnerHole: { value: 0 },
      uFeather: { value: 0.12 },
      uOuterFeather: { value: 0.06 },
      uGlowFactor: { value: 0 },
      uOpacity: { value: 0 },
      uColor: { value: new THREE.Color(1, 1, 1) },
    };

    const material = new THREE.ShaderMaterial({
      name: 'Demolition / ShockwaveRing',
      uniforms: this.uniforms,
      vertexShader: DEMOLITION_SHOCKWAVE_VERTEX_SHADER,
      fragmentShader: DEMOLITION_SHOCKWAVE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      toneMapped: true,
    });

    this.shockwave = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    this.shockwave.name = 'demolition-shockwave';
    this.shockwave.frustumCulled = false;
    this.shockwave.renderOrder = 6;
    this.object.add(this.shockwave);
  }

  update(
    dt: number,
    isDemolished: boolean,
    position?: THREE.Vector3 | null,
    isMatchActive = true
  ): void {
    if (!isMatchActive) {
      this.wasDemolished = null;
      this.stop();
      return;
    }

    const config = getDemolishShockwaveConfig();
    if (!config.enabled) {
      this.wasDemolished = isDemolished;
      this.stop();
      return;
    }

    const justDemolished = this.wasDemolished === false && isDemolished;
    this.wasDemolished = isDemolished;

    if (!isDemolished) {
      this.stop();
      return;
    }

    const duration = Math.max(0.1, config.duration || 1.6);

    if (justDemolished) {
      if (position) {
        this.object.position.copy(position);
      }
      this.elapsed = 0;
      this.object.visible = true;
      this.applyNormalizedTime(0, config);
      return;
    }

    if (this.object.visible) {
      this.elapsed += dt;
      if (this.elapsed >= duration) {
        this.stop();
      } else {
        this.applyNormalizedTime(this.elapsed / duration, config);
      }
    }
  }

  applyNormalizedTime(
    normT: number,
    config: DemolishShockwaveConfig = getDemolishShockwaveConfig()
  ): void {
    const frame = evaluateDemolishShockwaveFrame(normT, config);
    this.uniforms.uQuadSize.value = frame.worldDiameterUu / 0.72;
    this.uniforms.uVerticalOffset.value = config.verticalOffsetUu;
    this.uniforms.uInnerHole.value = frame.innerHolePct / 100;
    this.uniforms.uFeather.value = Math.max(0.01, config.featherPct / 100);
    this.uniforms.uOuterFeather.value = Math.max(0.01, config.outerFeatherPct / 100);
    this.uniforms.uGlowFactor.value = frame.glowFactor;
    this.uniforms.uOpacity.value = frame.opacity;
    this.uniforms.uColor.value.setRGB(
      frame.rgbNormalized[0],
      frame.rgbNormalized[1],
      frame.rgbNormalized[2],
      THREE.SRGBColorSpace
    );
  }

  stop(): void {
    this.elapsed = Infinity;
    this.object.visible = false;
  }

  dispose(): void {
    this.stop();
    if (this.object) {
      this.object.parent?.remove?.(this.object);
      this.shockwave?.geometry?.dispose?.();
      this.shockwave?.material?.dispose?.();
    }
  }
}

export class DemolitionSimPreviewController {
  public group: THREE.Group;
  public effect: DemolitionEffect;
  public reticleGroup: THREE.Group;
  private unsubConfig: (() => void) | null;
  private unsubSim: (() => void) | null;
  private onRenderTreeChanged?: () => void;

  constructor(scene: THREE.Scene, onRenderTreeChanged?: () => void) {
    this.onRenderTreeChanged = onRenderTreeChanged;
    this.group = new THREE.Group();
    this.group.name = 'demolition-sim-preview-root';

    this.effect = new DemolitionEffect();
    this.group.add(this.effect.object);

    this.reticleGroup = this.createReticleGroup();
    this.group.add(this.reticleGroup);
    scene.add(this.group);

    const weakThis = new WeakRef(this);
    this.unsubConfig = subscribeDemolishShockwaveConfig(() => {
      weakThis.deref()?.syncFromState();
    });
    this.unsubSim = subscribeDemolishShockwaveSim(() => {
      weakThis.deref()?.syncFromState();
    });
    this.syncFromState();
  }

  private createReticleGroup(): THREE.Group {
    const reticle = new THREE.Group();
    reticle.name = 'demolition-sim-reticle';
    reticle.visible = false;

    const ringGeo = new THREE.RingGeometry(48, 56, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff9900,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.renderOrder = 5;

    const crossPts = new Float32Array([
      -75, 0, 0, 75, 0, 0, 0, 0, -75, 0, 0, 75, 0, -35, 0, 0, 95, 0,
    ]);
    const crossGeo = new THREE.BufferGeometry();
    crossGeo.setAttribute('position', new THREE.BufferAttribute(crossPts, 3));
    const crossMat = new THREE.LineBasicMaterial({
      color: 0x00ffcc,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const crossLines = new THREE.LineSegments(crossGeo, crossMat);
    crossLines.renderOrder = 5;

    reticle.add(ringMesh, crossLines);
    return reticle;
  }

  public syncFromState(): void {
    const cfg = getDemolishShockwaveConfig();
    const sim = getDemolishShockwaveSimState();
    const targetUu = resolveDemolishSimTargetUu(cfg);

    this.effect.object.position.set(targetUu.x, targetUu.z, targetUu.y);
    this.reticleGroup.position.set(targetUu.x, targetUu.z, targetUu.y);
    this.reticleGroup.visible = Boolean(cfg.simShowReticle);

    if (sim.activeIn3d && cfg.enabled) {
      this.effect.object.visible = true;
      this.effect.applyNormalizedTime(sim.normT, cfg);
    } else {
      this.effect.object.visible = false;
    }
    this.onRenderTreeChanged?.();
  }

  public stepFrame(): void {
    const sim = getDemolishShockwaveSimState();
    const cfg = getDemolishShockwaveConfig();
    if (cfg.simShowReticle || sim.activeIn3d) {
      const targetUu = resolveDemolishSimTargetUu(cfg);
      this.effect.object.position.set(targetUu.x, targetUu.z, targetUu.y);
      this.reticleGroup.position.set(targetUu.x, targetUu.z, targetUu.y);
    }
    if (sim.isPlaying) {
      advanceDemolishShockwaveSimClock(
        typeof performance !== 'undefined' ? performance.now() : Date.now()
      );
    }
  }

  public dispose(): void {
    this.unsubConfig?.();
    this.unsubSim?.();
    this.unsubConfig = null;
    this.unsubSim = null;
    this.effect.dispose();
    this.reticleGroup.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose?.();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose?.());
      } else {
        mesh.material?.dispose?.();
      }
    });
    this.group.parent?.remove?.(this.group);
  }
}
