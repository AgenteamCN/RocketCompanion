import * as THREE from 'three';
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { getTheme } from '../../ui-core/config/themeConfig.ts';
import { prewarmSceneShaders, waitForCompiledMaterials } from '../ShaderPrewarmer.ts';
import type { ArenaWorld } from '../../entities/ArenaWorld.ts';
import type { PhysicsStateInterpolator } from '../../physics/PhysicsStateInterpolator.ts';
import type { CarControlsInput } from '../../network/protocol/GlobalPayloadCodec.ts';
import type { CameraManager } from '../../camera/CameraManager.ts';
import type { BoostBloom } from '../../effects/BoostBloom.ts';
import type { SupersonicSpeedLinesPass } from '../../effects/SupersonicSpeedLinesPass.ts';

export const BLOOM_OCCLUDER_LAYER = 1;

export interface RuntimeBloomOcclusionHostPort {
  readonly renderer: THREE.WebGLRenderer | null;
  readonly arena: ArenaWorld | null;
  readonly composer: EffectComposer | null;
  readonly interpolator: PhysicsStateInterpolator | null;
  readonly neutralControls: CarControlsInput;
  readonly camera: CameraManager | null;
  readonly playerCarIndex: number;
  readonly cameraSubsystem?: { cameraDynamics: object | null } | null;
  readonly boostBloom: BoostBloom | null;
  readonly speedLinesPass: SupersonicSpeedLinesPass | null;
}

/**
 * RuntimeBloomOcclusion
 * Stateful SubController owning bloom occluder mesh caches, material backup arrays,
 * and shader prewarming orchestration via a narrow RuntimeBloomOcclusionHostPort.
 */
export class RuntimeBloomOcclusion {
  private readonly host: RuntimeBloomOcclusionHostPort;
  public readonly occluderMeshes: THREE.Mesh[] = [];
  public readonly savedMaterials: Array<THREE.Material | THREE.Material[]> = [];
  public readonly invisibleObjects: THREE.Object3D[] = [];
  public readonly hiddenObjects: THREE.Object3D[] = [];
  public lastTreeVersion = -1;
  public darkMaterial: THREE.MeshBasicMaterial | null;

  constructor(host: RuntimeBloomOcclusionHostPort) {
    this.host = host;
    this.darkMaterial = new THREE.MeshBasicMaterial({
      color: 0,
      colorWrite: false,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide || 2,
    });
  }

  public async setupShaders(
    onProgress: ((progress: number, label?: string) => void) | null = null
  ): Promise<void> {
    const r = this.host;
    if (!r.renderer || !r.arena || !r.composer || !r.interpolator || !r.camera || !r.boostBloom) {
      if (typeof onProgress === 'function') {
        onProgress(1.0, 'headless');
      }
      return;
    }
    const renderer = r.renderer;
    const arena = r.arena;
    const composer = r.composer;
    const camera = r.camera;
    const boostBloom = r.boostBloom;
    arena.update(
      r.interpolator.prevState,
      r.interpolator.currState,
      0,
      0,
      0,
      r.neutralControls,
      r.neutralControls,
      false
    );
    camera.update(
      arena.cars[r.playerCarIndex],
      arena.ball,
      0,
      r.cameraSubsystem?.cameraDynamics ?? {}
    );

    if (
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('skipShaderPrewarm') === '1'
    ) {
      if (typeof onProgress === 'function') {
        onProgress(1.0, 'skipShaderPrewarm');
      }
      return;
    }

    const activeTheme = getTheme();
    if (typeof onProgress === 'function') {
      onProgress(0.15, activeTheme);
    }

    const composerRenderTarget = (composer as any)?.renderTarget1 ?? null;
    const bloomSourceTarget =
      (boostBloom.sourceTarget as THREE.WebGLRenderTarget | undefined) ?? composerRenderTarget;
    const nonPovHiddenLights = [
      arena.lighting?.ballSun ?? null,
      arena.lighting?.opponentSun ?? null,
    ];

    // Seed non-degenerate boost & exhaust particle geometry so instanced particle meshes,
    // plume cone, sparks, and lens flare rasterize real fragments and upload WebP textures
    // during Stage 5 shader prewarming instead of stalling on the first movement frame.
    const activeEmitters = (arena.carBoosts ?? []).flatMap((list) =>
      Array.isArray(list) ? list : []
    );
    for (const emitter of activeEmitters) {
      try {
        await emitter?.preload?.();
        emitter?.update?.(true, true, true, 0.016, true);
      } catch {
        // Ignore prewarm emitter update errors
      }
    }

    try {
      await prewarmSceneShaders(renderer, arena.scene, camera.camera, {
        disappearingLightRoots: arena.cars,
        composerRenderTarget,
        nonPovHiddenLights,
        onProgress: (ratio) => {
          if (typeof onProgress === 'function') {
            onProgress(0.15 + Math.min(1, Math.max(0, ratio)) * 0.8, activeTheme);
          }
        },
        renderBloom: async () => {
          this.applyBloomOccluders();
          try {
            if (typeof renderer.compile === 'function') {
              const prevTarget = renderer.getRenderTarget ? renderer.getRenderTarget() : null;
              if (bloomSourceTarget && renderer.setRenderTarget) {
                renderer.setRenderTarget(bloomSourceTarget);
              }
              let bloomMaterials: Set<any> | null | undefined;
              try {
                bloomMaterials = renderer.compile(arena.scene, camera.camera);
              } finally {
                if (bloomSourceTarget && renderer.setRenderTarget) {
                  renderer.setRenderTarget(prevTarget);
                }
              }
              if (bloomMaterials) {
                await waitForCompiledMaterials(renderer, bloomMaterials);
              }
            }
            boostBloom.render(arena.scene, camera.camera);
          } finally {
            this.restoreBloomMaterials();
          }
        },
        renderFinal: () => {
          if (renderer.shadowMap) renderer.shadowMap.needsUpdate = true;
          composer.render(0);
        },
        passes: r.speedLinesPass?.pass ? [r.speedLinesPass.pass] : [],
      });
    } finally {
      for (const emitter of activeEmitters) {
        try {
          emitter?.resetVisual?.();
        } catch {
          // Ignore reset errors
        }
      }
      boostBloom.clear?.();
    }

    if (typeof onProgress === 'function') {
      onProgress(1.0, activeTheme);
    }
  }

  public applyBloomOccluders(): void {
    const r = this.host;
    if (!r.arena?.scene || !this.darkMaterial) return;
    if (this.lastTreeVersion !== r.arena.renderTreeVersion) {
      this.occluderMeshes.length = 0;
      this.savedMaterials.length = 0;
      this.invisibleObjects.length = 0;

      r.arena.scene.traverse(
        (node: THREE.Object3D & { material?: THREE.Material | THREE.Material[] }) => {
          if (node.layers && node.layers.isEnabled(BLOOM_OCCLUDER_LAYER)) return;
          if (node instanceof THREE.Mesh) {
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            if (
              node.userData?.bloomOccluder === false ||
              mats.every((m: THREE.Material) => m && m.transparent && !m.depthWrite)
            ) {
              this.invisibleObjects.push(node);
              return;
            }
            this.occluderMeshes.push(node);
            this.savedMaterials.push(node.material);
            return;
          }
          if (node.material) this.invisibleObjects.push(node);
        }
      );
      this.lastTreeVersion = r.arena.renderTreeVersion;
    }

    for (let i = 0; i < this.occluderMeshes.length; i++) {
      const mesh = this.occluderMeshes[i];
      this.savedMaterials[i] = mesh.material;
      mesh.material = this.darkMaterial;
    }

    this.hiddenObjects.length = 0;
    for (let i = 0; i < this.invisibleObjects.length; i++) {
      const obj = this.invisibleObjects[i];
      if (obj.visible) {
        obj.visible = false;
        this.hiddenObjects.push(obj);
      }
    }
  }

  public restoreBloomMaterials(): void {
    for (let i = 0; i < this.occluderMeshes.length; i++) {
      this.occluderMeshes[i].material = this.savedMaterials[i];
    }
    for (let i = 0; i < this.hiddenObjects.length; i++) {
      this.hiddenObjects[i].visible = true;
    }
  }

  public dispose(): void {
    this.occluderMeshes.length = 0;
    this.savedMaterials.length = 0;
    this.invisibleObjects.length = 0;
    this.hiddenObjects.length = 0;
    this.lastTreeVersion = -1;
    this.darkMaterial?.dispose();
    this.darkMaterial = null;
  }
}
