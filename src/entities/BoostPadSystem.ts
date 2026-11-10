import * as THREE from 'three';
import { BoostPadStateView } from '../physics/RocketSimStateViews.ts';
import {
  computeAllPadRotations,
  exportRotationsAsCode,
} from '../ui-core/config/boostPadGeometry.ts';
import {
  DEFAULT_BOOST_PAD_TUNER,
  applyBoostPadVisualTuning,
} from './arena/BoostPadShadersAndMeshes.ts';
import {
  loadBoostPadTemplates,
  buildBoostPadInstances,
  disposeBoostPadSystem,
  type BoostPadTemplates,
  type BoostPadInstance,
} from './arena/BoostPadTemplateLoader.ts';
export type { BoostPadTemplates, BoostPadInstance };

function createCubicBezier(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number
): (x: number) => number {
  const cx = 3.0 * p1x;
  const bx = 3.0 * (p2x - p1x) - cx;
  const ax = 1.0 - cx - bx;
  const cy = 3.0 * p1y;
  const by = 3.0 * (p2y - p1y) - cy;
  const ay = 1.0 - cy - by;
  const sampleCurveX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleCurveY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleCurveDerivativeX = (t: number) => (3.0 * ax * t + 2.0 * bx) * t + cx;

  function solveCurveX(x: number): number {
    let t2 = x;
    for (let i = 0; i < 8; i++) {
      const x2 = sampleCurveX(t2) - x;
      if (Math.abs(x2) < 1e-6) return t2;
      const d2 = sampleCurveDerivativeX(t2);
      if (Math.abs(d2) < 1e-6) break;
      t2 = t2 - x2 / d2;
    }
    let t0 = 0.0;
    let t1 = 1.0;
    t2 = x;
    while (t0 < t1) {
      const x2 = sampleCurveX(t2);
      if (Math.abs(x2 - x) < 1e-6) return t2;
      if (x > x2) t0 = t2;
      else t1 = t2;
      t2 = (t1 - t0) * 0.5 + t0;
    }
    return t2;
  }

  return function solve(x: number): number {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    if (p1x === p1y && p2x === p2y) return x;
    return sampleCurveY(solveCurveX(x));
  };
}

export interface BoostPadCollectAnimation {
  startTime: number;
  glowDuration: number;
  orbDuration: number;
  duration: number;
  isBig: boolean;
}

export interface BoostPadSimulatedRefill {
  startTime: number;
  duration: number;
  isBig: boolean;
}

/**
 * BoostPadSystem.ts
 * Manager for the arena's 34 boost pads (6 Large + 28 Small).
 */
export class BoostPadSystem {
  public _bezierSolver: (t: number) => number;
  public _edgeStatesInitialized = false;
  public _glowBezierSolver: (t: number) => number;
  public _orbBezierSolver: (t: number) => number;
  public _padView = new BoostPadStateView();
  public bigOrbs: THREE.Mesh[] = [];
  public bigShadows: THREE.Mesh[] = [];
  public collectAnimations = new Map<number, BoostPadCollectAnimation>();
  public padCooldownTimers = new Float32Array(34);
  public padPeakY = 6.6614;
  public padTemplates: BoostPadTemplates | null = null;
  public pads: BoostPadInstance[] = [];
  public prevActiveStates = new Uint8Array(34);
  public prevBufferCooldowns = new Float32Array(34);
  public sharedOrbMaterial: THREE.MeshStandardMaterial;
  public simulatedRefills = new Map<number, BoostPadSimulatedRefill>();
  public tunerConfig: typeof DEFAULT_BOOST_PAD_TUNER &
    Record<string, number | string | boolean | undefined>;

  constructor() {
    this.tunerConfig = { ...DEFAULT_BOOST_PAD_TUNER };
    this._glowBezierSolver = createCubicBezier(
      this.tunerConfig.bezierP1X,
      this.tunerConfig.bezierP1Y,
      this.tunerConfig.bezierP2X,
      this.tunerConfig.bezierP2Y
    );
    this._orbBezierSolver = createCubicBezier(
      Number(this.tunerConfig.orbBezierP1X ?? 0),
      Number(this.tunerConfig.orbBezierP1Y ?? -1.15),
      Number(this.tunerConfig.orbBezierP2X ?? 0),
      Number(this.tunerConfig.orbBezierP2Y ?? 1)
    );
    this._bezierSolver = this._glowBezierSolver;

    this.sharedOrbMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.tunerConfig.orbColor),
      emissive: new THREE.Color(this.tunerConfig.orbColor),
      emissiveIntensity: this.tunerConfig.orbEmissiveIntensity,
      roughness: 0.2,
      metalness: 0.1,
    });
  }

  async loadTemplates() {
    return loadBoostPadTemplates(this);
  }

  addPads(
    padsData: Array<{ isBig: boolean; pos: number[] | Float32Array }>,
    padTemplates: BoostPadTemplates | null = null,
    scene: THREE.Scene | THREE.Object3D | null = null,
    onPadMeshAdded: ((padGroup: THREE.Group) => void) | null = null
  ) {
    for (const oldPad of this.pads) {
      oldPad?.group?.removeFromParent?.();
    }
    this.pads.length = 0;
    this.bigOrbs.length = 0;
    this.bigShadows.length = 0;
    this.collectAnimations.clear();
    this.prevActiveStates.fill(0);
    this.prevBufferCooldowns.fill(0);
    this.padCooldownTimers.fill(0);
    this._edgeStatesInitialized = false;

    buildBoostPadInstances(this, padsData, padTemplates, scene, onPadMeshAdded);
    this.applyCurrentTuning();
  }

  updateVisualTuningParams(config: Record<string, unknown> | null | undefined) {
    if (!config) return;
    this.tunerConfig = {
      ...this.tunerConfig,
      ...(config as Record<string, number | string | boolean | undefined>),
    };

    if (
      config.bezierP1X !== undefined ||
      config.bezierP1Y !== undefined ||
      config.bezierP2X !== undefined ||
      config.bezierP2Y !== undefined
    ) {
      this._glowBezierSolver = createCubicBezier(
        this.tunerConfig.bezierP1X,
        this.tunerConfig.bezierP1Y,
        this.tunerConfig.bezierP2X,
        this.tunerConfig.bezierP2Y
      );
      this._bezierSolver = this._glowBezierSolver;
    }

    if (
      config.orbBezierP1X !== undefined ||
      config.orbBezierP1Y !== undefined ||
      config.orbBezierP2X !== undefined ||
      config.orbBezierP2Y !== undefined
    ) {
      this._orbBezierSolver = createCubicBezier(
        Number(this.tunerConfig.orbBezierP1X ?? 0),
        Number(this.tunerConfig.orbBezierP1Y ?? -1.15),
        Number(this.tunerConfig.orbBezierP2X ?? 0),
        Number(this.tunerConfig.orbBezierP2Y ?? 1)
      );
    }

    this.applyCurrentTuning();
  }

  applyCurrentTuning() {
    applyBoostPadVisualTuning(this);
  }

  simulateCollect(padIndex = 0) {
    this.startCollectAnimation(padIndex);
  }

  simulateCollectAll() {
    for (let i = 0; i < this.pads.length; i++) {
      this.startCollectAnimation(i);
    }
  }

  simulateRefill(padIndex = 0, duration: number | null = null) {
    const pad = this.pads[padIndex];
    if (!pad) return;
    const defaultDur = pad.isBig
      ? Number(this.tunerConfig.bigRefillThreshold) || 3
      : Number(this.tunerConfig.smallRefillThreshold) || 1;
    const dur = duration || defaultDur;
    this.simulatedRefills.set(padIndex, {
      startTime: performance.now(),
      duration: Math.max(0.1, dur * 1000),
      isBig: pad.isBig,
    });
  }

  simulateRefillAll(duration: number | null = null) {
    for (let i = 0; i < this.pads.length; i++) {
      this.simulateRefill(i, duration);
    }
  }

  startCollectAnimation(padIndex: number) {
    const pad = this.pads[padIndex];
    if (!pad) return;

    const rawGlowDur = Number(this.tunerConfig.collectDuration);
    const glowDurMs =
      !Number.isNaN(rawGlowDur) && rawGlowDur > 10 ? rawGlowDur : (rawGlowDur || 0.3) * 1000;

    const rawOrbDur =
      this.tunerConfig.orbCollectDuration !== undefined
        ? Number(this.tunerConfig.orbCollectDuration)
        : undefined;
    const orbDurMs =
      rawOrbDur !== undefined && rawOrbDur > 10
        ? rawOrbDur
        : rawOrbDur !== undefined
          ? rawOrbDur * 1000
          : 200;

    this.collectAnimations.set(padIndex, {
      startTime: performance.now(),
      glowDuration: Math.max(50, glowDurMs),
      orbDuration: Math.max(50, orbDurMs),
      duration: Math.max(50, glowDurMs, orbDurMs),
      isBig: pad.isBig,
    });

    if (pad.shadowMesh) {
      pad.shadowMesh.visible = false;
    }
  }

  update(
    stateBuffer: Float32Array | null | undefined,
    boostPadStatesOffset?: number,
    dt = 0.016,
    camera: THREE.Camera | null = null
  ) {
    if (!stateBuffer || this.pads.length === 0) return;

    const now = performance.now();
    const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(0.25, dt) : 0.016;
    const c = this.tunerConfig;
    const bigThreshold = c.bigRefillThreshold || 3.0;
    const smallThreshold = c.smallRefillThreshold || 1.0;
    const firstFrame = !this._edgeStatesInitialized;

    for (let i = 0; i < this.pads.length; i++) {
      const pad = this.pads[i];
      this._padView.attach(stateBuffer, i);

      const isActive = this._padView.isActive;
      const fullTimeout = pad.isBig ? 10.0 : 4.0;
      const bufferCooldown = this._padView.cooldown;

      if (firstFrame) {
        this.prevActiveStates[i] = isActive ? 1 : 0;
        this.prevBufferCooldowns[i] = isActive ? 0.0 : bufferCooldown;
        this.padCooldownTimers[i] = isActive
          ? 0.0
          : bufferCooldown > 0 && bufferCooldown <= fullTimeout
            ? bufferCooldown
            : fullTimeout;
      } else {
        const wasActive = this.prevActiveStates[i] === 1;
        const prevBufferCd = this.prevBufferCooldowns[i];
        const respawnedAndCollected =
          !wasActive && !isActive && prevBufferCd > 0 && bufferCooldown > prevBufferCd + 0.5;
        if ((wasActive && !isActive) || respawnedAndCollected) {
          this.startCollectAnimation(i);
          this.padCooldownTimers[i] =
            bufferCooldown > 0 && bufferCooldown <= fullTimeout ? bufferCooldown : fullTimeout;
        } else if (!isActive) {
          this.padCooldownTimers[i] = Math.max(0.0, this.padCooldownTimers[i] - safeDt);
          if (
            bufferCooldown > 0 &&
            bufferCooldown < fullTimeout &&
            Math.abs(this.padCooldownTimers[i] - bufferCooldown) > 0.5
          ) {
            this.padCooldownTimers[i] = bufferCooldown;
          }
        } else {
          this.padCooldownTimers[i] = 0.0;
        }
        this.prevActiveStates[i] = isActive ? 1 : 0;
        this.prevBufferCooldowns[i] = isActive ? 0.0 : bufferCooldown;
      }

      const cooldownTimer = isActive ? 0.0 : this.padCooldownTimers[i];

      const simRefill = this.simulatedRefills.get(i);
      let isSimulatingRefill = false;
      let simProgress = 0;
      if (simRefill) {
        const elapsed = now - simRefill.startTime;
        if (elapsed < simRefill.duration) {
          isSimulatingRefill = true;
          simProgress = elapsed / simRefill.duration;
        } else {
          this.simulatedRefills.delete(i);
        }
      }

      const anim = this.collectAnimations.get(i);
      let animProgress = 1.0;
      if (anim) {
        const elapsed = now - anim.startTime;
        animProgress = Math.min(1.0, elapsed / anim.duration);
        const glowProgress = Math.min(1.0, elapsed / anim.glowDuration);
        const orbProgress = Math.min(1.0, elapsed / anim.orbDuration);

        const glowEased = this._glowBezierSolver
          ? this._glowBezierSolver(glowProgress)
          : glowProgress;
        const orbEased = this._orbBezierSolver ? this._orbBezierSolver(orbProgress) : orbProgress;

        if (pad.glowMesh) {
          pad.glowMesh.scale.y = Math.max(0.001, 1.0 - glowEased);
        }

        if (pad.isBig && pad.orbMesh) {
          const baseRadius = c.orbRadius || DEFAULT_BOOST_PAD_TUNER.orbRadius;
          const baseY =
            this.padPeakY +
            (c.orbHeightOffset !== undefined
              ? c.orbHeightOffset
              : DEFAULT_BOOST_PAD_TUNER.orbHeightOffset);
          const dropDistance = c.orbDropDistance !== undefined ? c.orbDropDistance : 175;
          pad.orbMesh.position.y = baseY - orbEased * dropDistance;
          pad.orbMesh.scale.set(baseRadius, baseRadius, baseRadius);
          pad.orbMesh.visible = elapsed < anim.orbDuration;
        }

        if (animProgress >= 1.0) {
          this.collectAnimations.delete(i);
        }
      } else {
        if (pad.glowMesh) pad.glowMesh.scale.y = 1.0;
        if (pad.isBig && pad.orbMesh) {
          const baseRadius = c.orbRadius || DEFAULT_BOOST_PAD_TUNER.orbRadius;
          const baseY =
            this.padPeakY +
            (c.orbHeightOffset !== undefined
              ? c.orbHeightOffset
              : DEFAULT_BOOST_PAD_TUNER.orbHeightOffset);
          pad.orbMesh.scale.set(baseRadius, baseRadius, baseRadius);
          pad.orbMesh.position.y = baseY;
        }
      }

      const threshold = pad.isBig ? bigThreshold : smallThreshold;
      const isRefilling =
        isSimulatingRefill || (c.refillEnabled && cooldownTimer <= threshold && cooldownTimer > 0);

      if (isRefilling) {
        pad.full.visible = true;
        pad.base.visible = true;
        if (pad.orbMesh) pad.orbMesh.visible = false;
        if (pad.shadowMesh) pad.shadowMesh.visible = false;

        const progress = isSimulatingRefill
          ? simProgress
          : Math.min(1.0, Math.max(0.0, 1.0 - cooldownTimer / threshold));

        if (pad.glowMaterial?.uniforms?.uRefillActive) {
          pad.glowMaterial.uniforms.uRefillActive.value = 1.0;
          pad.glowMaterial.uniforms.uRefillProgress.value = progress;
        }
      } else if (isActive && animProgress >= 1.0) {
        pad.full.visible = true;
        pad.base.visible = false;
        if (pad.orbMesh) pad.orbMesh.visible = true;
        if (pad.shadowMesh) {
          pad.shadowMesh.visible = c.shadowEnabled !== false;
          if (pad.shadowMesh.visible && camera) {
            const dist = camera.position.distanceTo(pad.group.position);
            const baseScale = c.shadowRadius !== undefined ? c.shadowRadius : 10.0;
            const distScale =
              baseScale +
              dist * (c.shadowDistanceScale !== undefined ? c.shadowDistanceScale : 0.012);
            pad.shadowMesh.scale.set(distScale, distScale, 1.0);
          }
        }

        if (pad.glowMaterial?.uniforms?.uRefillActive) {
          pad.glowMaterial.uniforms.uRefillActive.value = 0.0;
        }
      } else {
        pad.full.visible = anim !== undefined;
        pad.base.visible = true;
        if (pad.orbMesh) {
          if (anim) {
            const elapsed = now - anim.startTime;
            pad.orbMesh.visible = elapsed < anim.orbDuration;
          } else {
            pad.orbMesh.visible = false;
          }
        }
        if (pad.shadowMesh) pad.shadowMesh.visible = false;
        if (pad.glowMaterial?.uniforms?.uRefillActive) {
          pad.glowMaterial.uniforms.uRefillActive.value = 0.0;
        }
      }
    }
    this._edgeStatesInitialized = true;
  }

  resetPads() {
    this.collectAnimations.clear();
    this.simulatedRefills.clear();
    this.prevActiveStates.fill(1);
    this.prevBufferCooldowns.fill(0);
    this.padCooldownTimers.fill(0);
    this._edgeStatesInitialized = false;
    for (const pad of this.pads) {
      if (!pad) continue;
      if (pad.full) pad.full.visible = true;
      if (pad.base) pad.base.visible = false;
      if (pad.orbMesh) pad.orbMesh.visible = true;
      if (pad.shadowMesh) pad.shadowMesh.visible = this.tunerConfig?.shadowEnabled !== false;
      if (pad.glowMaterial?.uniforms) {
        if (pad.glowMaterial.uniforms.uCollectProgress) {
          pad.glowMaterial.uniforms.uCollectProgress.value = 1.0;
        }
        if (pad.glowMaterial.uniforms.uRefillActive) {
          pad.glowMaterial.uniforms.uRefillActive.value = 0.0;
        }
      }
    }
  }

  exportRotations() {
    const angles = computeAllPadRotations(this.tunerConfig);
    return exportRotationsAsCode(angles);
  }

  dispose() {
    disposeBoostPadSystem(this);
  }
}
