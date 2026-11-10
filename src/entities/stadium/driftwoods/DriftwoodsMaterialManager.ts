import {
  type DataTexture,
  type Group,
  type Mesh,
  type MeshLambertMaterial,
  type MeshStandardMaterial,
  type Texture,
  type Vector3,
} from 'three';
import {
  DEFAULT_DRIFTWOODS_CONFIG,
  cloneDriftwoodsConfig,
  mergeDriftwoodsConfig,
  type DriftwoodsGroundConfig,
  type DriftwoodsLayerConfig,
  type DriftwoodsTunerConfig,
} from '../../../ui-core/config/driftwoodsConfig.ts';
import {
  experimentalWallFxRuntimeConfig,
  type ExperimentalWallFxConfig,
} from '../../../ui-core/config/atmosphereFxConfig.ts';
import { createWallFxUniforms } from './WallFxShaderInjector.ts';
import {
  createSpherePreviewMeshes,
  syncManagerSpherePreviewMeshes,
  updateManagerBallProximity,
  updateManagerExperimentalWallConfig,
} from './WallFxShaderController.ts';
import {
  getOrLoadQ1GroundTexture,
  getPrecomputedQ1Mask,
  createBakedGroundDataTexture,
  subscribeQ1MaskReady,
} from './DriftwoodsMipmapBuilder.ts';
import {
  createDriftwoodsShaderUniforms,
  applyDriftwoodsLayerMaterials,
  type DriftwoodsGroundUniforms,
  type DriftwoodsGoalTeamUniforms,
  type DriftwoodsSpecularAAUniforms,
  type DriftwoodsOcclusionUniforms,
} from './DriftwoodsMaterialPaletteSpecs.ts';
import {
  bakeQ1GroundTexturesIntoManager,
  resolveDriftwoodsTeamColors,
  type DriftwoodsResolvedTeamColors,
} from './DriftwoodsColorMath.ts';
import {
  collectDriftwoodsSceneMeshes,
  setupDriftwoodsMeshMaterials,
  applyGroundMaterialCommon,
  resolveGroundTextureFiltering,
  syncDriftwoodsGlobalShaderUniforms,
  type DriftwoodsMeshSetupContext,
  type DriftwoodsWallFxUniforms,
} from './driftwoodsMeshMaterialPipeline.ts';

/**
 * Manages Driftwoods stadium mesh materials, hardware-mipmapped RGBA decal ground baking,
 * OKLCH perceptual color synchronization, and high-performance Lambert downgrades in real time.
 */
export class DriftwoodsMaterialManager {
  public _lastBakedPaletteSignature: string | null;
  public _unsubscribeQ1Mask: () => void;
  public bakedBlueGroundTexture: DataTexture;
  public bakedOrangeGroundTexture: DataTexture;
  public circlePreviewMesh: Group | null;
  public config: DriftwoodsTunerConfig;
  public goalTeamUniforms: DriftwoodsGoalTeamUniforms;
  public groundUniforms: DriftwoodsGroundUniforms;
  public lambertMaterials: Record<string, MeshLambertMaterial>;
  public meshes: Record<string, Mesh>;
  public occlusionOverlayLambertMaterials: Record<string, MeshLambertMaterial>;
  public occlusionOverlayMeshes: Record<string, Mesh>;
  public occlusionOverlayStandardMaterials: Record<string, MeshStandardMaterial>;
  public occlusionUniforms: DriftwoodsOcclusionUniforms;
  public pulsePreviewMesh: Group | null;
  public q1GroundTexture: Texture | null;
  public scene: Group;
  public sharedUpperOuterLambertMaterial: MeshLambertMaterial | null;
  public sharedUpperOuterStandardMaterial: MeshStandardMaterial | null;
  public specularAAUniforms: DriftwoodsSpecularAAUniforms;
  public spherePreviewGroup: Group | null;
  public standardMaterials: Record<string, MeshStandardMaterial>;
  public wallFxConfig: ExperimentalWallFxConfig;
  public wallFxUniforms: DriftwoodsWallFxUniforms;

  constructor(
    stadiumScene: Group,
    initialConfig: Partial<DriftwoodsTunerConfig> = DEFAULT_DRIFTWOODS_CONFIG
  ) {
    this.scene = stadiumScene;
    this.config = cloneDriftwoodsConfig(initialConfig as DriftwoodsTunerConfig);
    this.wallFxConfig = { ...experimentalWallFxRuntimeConfig };

    this.meshes = {};
    this.standardMaterials = {};
    this.lambertMaterials = {};
    this.occlusionOverlayMeshes = {};
    this.occlusionOverlayStandardMaterials = {};
    this.occlusionOverlayLambertMaterials = {};
    this.sharedUpperOuterStandardMaterial = null;
    this.sharedUpperOuterLambertMaterial = null;

    const preloadedQ1 = (stadiumScene?.userData?.q1GroundTexture as Texture | undefined) || null;
    this.q1GroundTexture = getOrLoadQ1GroundTexture(preloadedQ1);

    const hasReadyMask = Boolean(getPrecomputedQ1Mask().dilatedLayerId);
    this.bakedBlueGroundTexture = createBakedGroundDataTexture(!hasReadyMask);
    this.bakedOrangeGroundTexture = createBakedGroundDataTexture(!hasReadyMask);
    this._lastBakedPaletteSignature = '';

    this._unsubscribeQ1Mask = subscribeQ1MaskReady(() => {
      this._lastBakedPaletteSignature = '';
      this.bakeQ1GroundTextures(this.config.ground);
    });

    const { groundUniforms, specularAAUniforms, occlusionUniforms, goalTeamUniforms } =
      createDriftwoodsShaderUniforms(
        this.config,
        this.bakedBlueGroundTexture,
        this.bakedOrangeGroundTexture,
        this.q1GroundTexture
      );

    this.groundUniforms = groundUniforms;
    this.wallFxUniforms = createWallFxUniforms(this.wallFxConfig);
    this.specularAAUniforms = specularAAUniforms;
    this.occlusionUniforms = occlusionUniforms;
    this.goalTeamUniforms = goalTeamUniforms;

    this.spherePreviewGroup = null;
    this.circlePreviewMesh = null;
    this.pulsePreviewMesh = null;

    this.initScene();
    this.setupSpherePreviewMeshes();
    this.applyConfig(this.config);
  }

  bakeQ1GroundTextures(g: Partial<DriftwoodsGroundConfig> | null | undefined): void {
    bakeQ1GroundTexturesIntoManager(this, g);
  }

  getResolvedTeamColors(): DriftwoodsResolvedTeamColors {
    return resolveDriftwoodsTeamColors(this.config?.ground, this.wallFxConfig);
  }

  initScene(): void {
    const initialMeshes = collectDriftwoodsSceneMeshes(this.scene);
    const setupCtx: DriftwoodsMeshSetupContext = {
      fastDiffuse: Boolean(this.config.fastDiffuse),
      groundUniforms: this.groundUniforms,
      wallFxUniforms: this.wallFxUniforms,
      specularAAUniforms: this.specularAAUniforms,
      occlusionUniforms: this.occlusionUniforms,
      goalTeamUniforms: this.goalTeamUniforms,
      sharedUpperOuterStandardMaterial: this.sharedUpperOuterStandardMaterial,
      sharedUpperOuterLambertMaterial: this.sharedUpperOuterLambertMaterial,
    };

    for (const obj of initialMeshes) {
      obj.frustumCulled = false;
      this.meshes[obj.name] = obj;
      setupDriftwoodsMeshMaterials(obj, setupCtx, this);
    }
  }

  applyConfig(patch: Partial<DriftwoodsTunerConfig> | null | undefined): void {
    if (!patch) return;

    this.config = mergeDriftwoodsConfig(this.config, patch);
    const c = this.config;

    syncDriftwoodsGlobalShaderUniforms(
      c,
      this.specularAAUniforms,
      this.occlusionUniforms,
      this.goalTeamUniforms,
      this.wallFxUniforms
    );

    const useLambert = Boolean(c.fastDiffuse);
    for (const [name, mesh] of Object.entries(this.meshes)) {
      const targetMat = useLambert ? this.lambertMaterials[name] : this.standardMaterials[name];
      if (targetMat && mesh.material !== targetMat) {
        mesh.material = targetMat;
      }
      const overlayMesh = this.occlusionOverlayMeshes[name];
      if (overlayMesh) {
        const targetOverlayMat = useLambert
          ? this.occlusionOverlayLambertMaterials[name]
          : this.occlusionOverlayStandardMaterials[name];
        if (targetOverlayMat && overlayMesh.material !== targetOverlayMat) {
          overlayMesh.material = targetOverlayMat;
        }
      }
    }

    const groundMesh = this.meshes['Woods_Field_Ground'];
    if (groundMesh && c.ground) {
      this.groundUniforms.uGroundMode.value = c.ground.textureMode === 'original' ? 0.0 : 1.0;

      this.groundUniforms.uQ1UvScale.value.set(c.ground.q1ScaleX ?? 1.0, c.ground.q1ScaleY ?? 1.0);
      this.groundUniforms.uQ1UvOffset.value.set(
        c.ground.q1OffsetX ?? 0.0,
        c.ground.q1OffsetY ?? 0.0
      );

      this.groundUniforms.uL4UseTeamColor.value = c.ground.l4UseTeamColor !== false ? 1.0 : 0.0;
      this.groundUniforms.uL5UseTeamColor.value = c.ground.l5UseTeamColor !== false ? 1.0 : 0.0;
      this.groundUniforms.uL6UseTeamColor.value = c.ground.l6UseTeamColor !== false ? 1.0 : 0.0;

      if (c.ground.lineThreshold !== undefined) {
        this.groundUniforms.uLineThreshold.value = c.ground.lineThreshold;
      }
      if (c.ground.lineSmoothness !== undefined) {
        this.groundUniforms.uLineSmoothness.value = c.ground.lineSmoothness;
      }
      this.groundUniforms.uOrigLineThreshold.value = c.ground.originalLineThreshold ?? 0.0921;
      this.groundUniforms.uOrigLineSmoothness.value = c.ground.originalLineSmoothness ?? 0.0364;

      this.bakeQ1GroundTextures(c.ground);

      applyGroundMaterialCommon(this.standardMaterials['Woods_Field_Ground'], c.ground);
      applyGroundMaterialCommon(this.lambertMaterials['Woods_Field_Ground'], c.ground);

      const { targetMag, targetMinMipmap, targetAnisotropy } = resolveGroundTextureFiltering(
        c.ground
      );

      for (const bakedTex of [this.bakedBlueGroundTexture, this.bakedOrangeGroundTexture]) {
        if (
          bakedTex &&
          (bakedTex.magFilter !== targetMag ||
            bakedTex.minFilter !== targetMinMipmap ||
            bakedTex.anisotropy !== targetAnisotropy)
        ) {
          bakedTex.magFilter = targetMag;
          bakedTex.minFilter = targetMinMipmap;
          bakedTex.anisotropy = targetAnisotropy;
          bakedTex.needsUpdate = true;
        }
      }

      for (const mat of [
        this.standardMaterials['Woods_Field_Ground'],
        this.lambertMaterials['Woods_Field_Ground'],
      ]) {
        const tex = mat?.map;
        if (tex) {
          tex.repeat.set(c.ground.scaleX ?? 1.0, c.ground.scaleY ?? 1.0);
          tex.offset.set(c.ground.offsetX ?? 0.0, c.ground.offsetY ?? 0.0);
          if (
            tex.magFilter !== targetMag ||
            tex.minFilter !== targetMinMipmap ||
            tex.anisotropy !== targetAnisotropy
          ) {
            tex.magFilter = targetMag;
            tex.minFilter = targetMinMipmap;
            tex.anisotropy = targetAnisotropy;
            tex.needsUpdate = true;
          }
          tex.updateMatrix();
        }
      }

      groundMesh.visible = c.ground.visible !== false;
    }

    this.applyLayerConfig(['Woods_Field_Ramps', 'Woods_Field_Ramps_1'], c.ramps);
    this.applyLayerConfig(['Woods_Field_Ramps_2', 'Woods_Field_Goal_Net_2'], c.rampsUpperOuter);
    this.applyLayerConfig('Woods_Field_Ramps_Trim', c.rampsTrim);
    this.applyLayerConfig('Woods_Field_Wall_Posts', c.wallPosts);
    this.applyLayerConfig('Woods_Field_Goal', c.goalFrame);
    this.applyLayerConfig(['Woods_Field_Goal_Posts', 'Woods_Field_Goal_Posts_1'], c.goalPosts);
    this.applyLayerConfig('Woods_Field_Goal_Posts_2', c.goalPostsGlow);
    this.applyLayerConfig('Woods_Field_Walls', c.walls);
    this.applyLayerConfig(['Woods_Field_Goal_Net', 'Woods_Field_Goal_Net_1'], c.goalNet);
    this.applyLayerConfig('Woods_Field_Walls_Hexes', c.hexes);

    const hexMesh = this.meshes['Woods_Field_Walls_Hexes'];
    const wallsMesh = this.meshes['Woods_Field_Walls'];
    if (hexMesh) hexMesh.visible = c.hexes?.visible !== false;
    if (wallsMesh) wallsMesh.visible = c.walls?.visible !== false;
  }

  applyLayerConfig(
    meshNames: string | string[],
    layerConfig: Partial<DriftwoodsLayerConfig> | null | undefined
  ): void {
    if (!layerConfig) return;
    const names = Array.isArray(meshNames) ? meshNames : [meshNames];

    for (const meshName of names) {
      const mesh = this.meshes[meshName];
      if (!mesh) continue;

      mesh.visible = layerConfig.visible !== false;

      const overlayMesh = this.occlusionOverlayMeshes[meshName];
      if (overlayMesh) {
        overlayMesh.visible = mesh.visible;
      }

      applyDriftwoodsLayerMaterials(
        meshName,
        layerConfig,
        this.standardMaterials[meshName],
        this.lambertMaterials[meshName],
        this.occlusionOverlayStandardMaterials[meshName],
        this.occlusionOverlayLambertMaterials[meshName]
      );
    }
  }

  setupSpherePreviewMeshes(): void {
    if (!this.scene || this.spherePreviewGroup) return;
    const preview = createSpherePreviewMeshes(this.scene, this.wallFxConfig);
    if (preview) {
      this.spherePreviewGroup = preview.group;
      this.circlePreviewMesh = preview.circlePreviewMesh;
      this.pulsePreviewMesh = preview.pulsePreviewMesh;
      this.syncSpherePreviewMeshes();
    }
  }

  syncSpherePreviewMeshes(): void {
    syncManagerSpherePreviewMeshes(this);
  }

  updateBallProximity(ballPos: Vector3, ballVel: Vector3, dt = 0.016): void {
    updateManagerBallProximity(this, ballPos, ballVel, dt);
  }

  updateExperimentalWallConfig(patch: Partial<ExperimentalWallFxConfig>): void {
    updateManagerExperimentalWallConfig(this, patch);
  }
}

export function createDriftwoodsManager(
  stadiumScene: Group,
  config?: Partial<DriftwoodsTunerConfig>
): DriftwoodsMaterialManager {
  return new DriftwoodsMaterialManager(stadiumScene, config);
}
