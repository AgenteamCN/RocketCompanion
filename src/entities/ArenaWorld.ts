import * as THREE from 'three';
import { BoostPadSystem } from './BoostPadSystem.ts';
import {
  type BoostPadDefinition,
  type BoostPadInstance,
  type BoostPadTemplates,
  type BoostPadTunerConfig,
} from './arena/BoostPadTemplateLoader.ts';
import { BallLocatorArrow } from './BallLocatorArrow.ts';
import {
  type ArenaEnvironmentManager,
  createBallGroundIndicatorRings,
} from './arena/ArenaEnvironmentManager.ts';
import { SpeedTrail } from './SpeedTrail.ts';
import { onThemeChange } from '../ui-core/config/themeConfig.ts';
import {
  ArenaHeaderView,
  CarStateView,
  BallStateView,
  type NumericStateBuffer,
} from '../physics/RocketSimStateViews.ts';
import { createStadiumDomeSky } from './arena/ArenaSky.ts';
import { ArenaLightingManager } from './arena/ArenaLighting.ts';
import {
  ArenaVehicleRegistry,
  type CarLoadoutConfig,
  type VehicleVisualInput,
  type VehicleWheelSet,
} from './arena/ArenaVehicleRegistry.ts';
import { rebuildRegistrySlotVisual } from './arena/arenaVehicleSlotPipeline.ts';
import {
  clearAllRegistryGhostOpacities,
  ensureRegistryOpponentCar,
  ensureRegistrySlotCar,
  setRegistrySlotCarColor,
  setRegistrySlotCarLoadout,
  setRegistrySlotCarTeam,
} from './arena/arenaVehicleCosmeticPipeline.ts';
import type { CarControlInput, CarControlsResolver } from './arena/ArenaVehicleFrameStepper.ts';
import {
  createArenaEnvironmentManagerForWorld,
  disposeArenaWorldSubsystems,
  loadAllArenaWorldAssets,
  prepareArenaWorldWarmupAssets,
  stepArenaWorldFrame,
} from './arena/arenaWorldFramePipeline.ts';
import { loadBallAssetInto, loadCarAndPadAssets } from './arena/ArenaAssetLoader.ts';
import { VehicleNameTagSystem } from './arena/VehicleNameTagSystem.ts';
import {
  VehicleAerialClimbTracker,
  type CarAerialClimbStatus,
} from './arena/VehicleAerialClimbTracker.ts';
import type { DriftwoodsMaterialManager } from './stadium/driftwoods/DriftwoodsMaterialManager.ts';
import { GoalBarrierVisual } from './arena/GoalBarrierVisual.ts';
import { GoalVolumeHitboxVisual } from './arena/GoalVolumeHitboxVisual.ts';
import { RespawnGhostPreview } from './arena/RespawnGhostPreview.ts';
import { SpatialAudioDebugVisualizer } from './arena/SpatialAudioDebugVisualizer.ts';
import { CarNoseOrientationArrows } from './arena/CarNoseOrientationArrows.ts';
import { SupersonicWheelTrailSystem } from './vehicle/supersonic-trail/SupersonicWheelTrailSystem.ts';
import type { VehicleBoostEmitter } from './vehicle/boost/vehicleBoostEmitter.ts';
import { DemolitionSimPreviewController, type DemolitionEffect } from './DemolitionEffect.ts';

export type { BoostPadDefinition, BoostPadInstance, BoostPadTemplates, BoostPadTunerConfig };

export class ArenaWorld {
  public scene: THREE.Scene = new THREE.Scene();
  public ball: THREE.Group = new THREE.Group();
  public pads: BoostPadInstance[] = [];
  public boostPadSystem: BoostPadSystem = new BoostPadSystem();
  public padTemplates: BoostPadTemplates | null = null;
  public ballRadius: number;
  public ballSpeedTrail: SpeedTrail = new SpeedTrail();
  public ballLocatorArrow: BallLocatorArrow = new BallLocatorArrow();
  public ballVelocity: THREE.Vector3 = new THREE.Vector3();
  public _renderTreeVersion = 0;
  public playerCarIndex = 0;
  public vehiclePreset: string;
  public carVisual: string;
  public pA: THREE.Vector3 = new THREE.Vector3();
  public pB: THREE.Vector3 = new THREE.Vector3();
  public qA: THREE.Quaternion = new THREE.Quaternion();
  public qB: THREE.Quaternion = new THREE.Quaternion();
  public lighting: ArenaLightingManager;
  public sky: THREE.Mesh = createStadiumDomeSky();
  public goalBarrierVisual: GoalBarrierVisual = new GoalBarrierVisual();
  public goalVolumeHitboxVisual: GoalVolumeHitboxVisual = new GoalVolumeHitboxVisual();
  public indicatorRing: THREE.Mesh;
  public indicatorHeightRing: THREE.Mesh;
  public vehicleRegistry: ArenaVehicleRegistry;
  public environment: ArenaEnvironmentManager;
  public cars: Array<THREE.Group | null>;
  public vehiclePresets: Array<string | null>;
  public carWheels: Array<VehicleWheelSet | null>;
  public carBoosts: Array<VehicleBoostEmitter[] | null>;
  public carDemolitions: Array<DemolitionEffect | null>;
  public carColors: Array<number | null | undefined>;
  public carTeams: number[];
  public aerialClimbTracker: VehicleAerialClimbTracker = new VehicleAerialClimbTracker(8);
  public carBoostAmounts: Float32Array;
  public carVerticalVelZUu: Float32Array;
  public carAirborneFlipExhausted: Uint8Array;
  public carAerialClimbStatuses: CarAerialClimbStatus[];
  public nameTagSystem: VehicleNameTagSystem;
  public respawnGhostPreview: RespawnGhostPreview;
  public spatialAudioVisualizer: SpatialAudioDebugVisualizer;
  public carNoseOrientationArrows: CarNoseOrientationArrows;
  public supersonicWheelTrailSystem: SupersonicWheelTrailSystem;
  public demolitionSimPreview: DemolitionSimPreviewController;
  public _headerView: ArenaHeaderView = new ArenaHeaderView();
  public _currCarView: CarStateView = new CarStateView();
  public _prevCarView: CarStateView = new CarStateView();
  public _currBallView: BallStateView = new BallStateView();
  public _prevBallView: BallStateView = new BallStateView();
  public camera?: THREE.Camera | null;
  public cameraMode?: string;
  public isPovCamera?: boolean;
  public isFreeCam?: boolean;
  public focusedCarIndex?: number;
  public isLobbyMode?: boolean;
  public isHostLobby?: boolean;
  public isGoalReplayActive?: boolean;

  constructor(ballRadius: number, defaultCarVisual = 'fennec') {
    const arenaScene = this.scene;
    this.ballRadius = ballRadius;
    this.vehiclePreset = defaultCarVisual;
    this.carVisual = defaultCarVisual;

    arenaScene.background = new THREE.Color(4679561);
    arenaScene.fog = new THREE.Fog(6586005, 15000, 34000);

    this.lighting = new ArenaLightingManager(arenaScene);
    arenaScene.add(
      this.sky,
      this.ball,
      this.goalBarrierVisual.group,
      this.goalVolumeHitboxVisual.group
    );
    if (this.ballLocatorArrow.object) arenaScene.add(this.ballLocatorArrow.object);
    if (this.ballSpeedTrail.object) arenaScene.add(this.ballSpeedTrail.object);

    const rings = createBallGroundIndicatorRings(arenaScene, ballRadius);
    this.indicatorRing = rings.indicatorRing;
    this.indicatorHeightRing = rings.indicatorHeightRing;

    const vr = (this.vehicleRegistry = new ArenaVehicleRegistry(
      arenaScene,
      () => this.markRenderTreeChanged(),
      () => this.lighting.ensureOpponentSun()
    ));
    this.cars = vr.cars;
    this.vehiclePresets = vr.vehiclePresets;
    this.carWheels = vr.carWheels;
    this.carBoosts = vr.carBoosts;
    this.carDemolitions = vr.carDemolitions;
    this.carColors = vr.carColors;
    this.carTeams = vr.carTeams;

    this.carBoostAmounts = this.aerialClimbTracker.carBoostAmounts;
    this.carVerticalVelZUu = this.aerialClimbTracker.carVerticalVelZUu;
    this.carAirborneFlipExhausted = this.aerialClimbTracker.carAirborneFlipExhausted;
    this.carAerialClimbStatuses = this.aerialClimbTracker.carAerialClimbStatuses;
    this.nameTagSystem = new VehicleNameTagSystem(arenaScene);
    this.respawnGhostPreview = new RespawnGhostPreview(this);
    this.spatialAudioVisualizer = new SpatialAudioDebugVisualizer(arenaScene, () =>
      this.markRenderTreeChanged()
    );
    this.carNoseOrientationArrows = new CarNoseOrientationArrows(arenaScene);
    this.supersonicWheelTrailSystem = new SupersonicWheelTrailSystem(arenaScene);
    this.demolitionSimPreview = new DemolitionSimPreviewController(arenaScene, () =>
      this.markRenderTreeChanged()
    );
    this.environment = createArenaEnvironmentManagerForWorld(this);

    this.markRenderTreeChanged();
    if (typeof onThemeChange === 'function') {
      onThemeChange(() => this.markRenderTreeChanged());
    }
  }

  get driftwoodsStadium(): THREE.Group | null {
    return this.environment.driftwoodsStadium;
  }
  get driftwoodsManager(): DriftwoodsMaterialManager | null {
    return this.environment.driftwoodsManager;
  }
  get isThrowbackStadiumActive(): boolean {
    return this.environment.isThrowbackStadiumActive;
  }

  resetBallTrail() {
    this.ballSpeedTrail.reset();
  }
  resetCarBoosts(carIndex: number | null = null) {
    this.vehicleRegistry.resetCarBoosts(carIndex);
    this.supersonicWheelTrailSystem.resetCar(carIndex);
  }
  resetAllCarEffects() {
    this.vehicleRegistry.resetAllCarEffects();
    this.supersonicWheelTrailSystem.resetCar(null);
    this.ballSpeedTrail.reset();
  }
  get renderTreeVersion() {
    return this._renderTreeVersion;
  }
  markRenderTreeChanged() {
    this._renderTreeVersion++;
  }
  get boostBloomActive() {
    return this.vehicleRegistry.hasActiveBoostBloom();
  }

  async loadBall() {
    await loadBallAssetInto(this.ball);
    this.markRenderTreeChanged();
  }

  updateBallLocatorArrow(
    ballCamActive: boolean,
    carIndex = 0,
    targetBall: THREE.Object3D | null = this.ball,
    targetCar: THREE.Object3D | null = null
  ) {
    const resolvedCar = targetCar || this.cars[carIndex] || this.cars[0];
    this.ballLocatorArrow.update(resolvedCar, targetBall || this.ball, ballCamActive);
  }

  async loadAllAssets(onProgress: ((progress: number, name: string) => void) | null = null) {
    await loadAllArenaWorldAssets(this, onProgress);
  }

  async loadCarAndPadAssets() {
    this.padTemplates = await loadCarAndPadAssets(
      this.vehicleRegistry,
      this.boostPadSystem,
      this.vehiclePreset
    );
    this.markRenderTreeChanged();
  }

  async prepareAssets(
    onProgress: ((loaded: number, total: number, label: string) => void) | null = null
  ) {
    await prepareArenaWorldWarmupAssets(this, onProgress);
  }

  setCarColor(carIndex: number, colorVal: string | number | null | undefined) {
    setRegistrySlotCarColor(this.vehicleRegistry, carIndex, colorVal);
  }
  setCarLoadout(carIndex: number, loadout: CarLoadoutConfig | null | undefined) {
    setRegistrySlotCarLoadout(this.vehicleRegistry, carIndex, loadout);
  }
  async ensureOpponent() {
    await ensureRegistryOpponentCar(this.vehicleRegistry);
  }
  ensureCar(
    carIndex: number,
    teamIndex: number | null = null,
    visual: VehicleVisualInput = this.carVisual
  ) {
    return ensureRegistrySlotCar(this.vehicleRegistry, carIndex, teamIndex, visual);
  }
  setCarTeam(carIndex: number, teamIndex: number) {
    setRegistrySlotCarTeam(this.vehicleRegistry, carIndex, teamIndex);
  }
  swapCarVisual(carIndex: number, newVisual: VehicleVisualInput) {
    return rebuildRegistrySlotVisual(this.vehicleRegistry, carIndex, newVisual);
  }
  refreshCustomVehicle(vehicleId?: string) {
    this.vehicleRegistry.loadout.refreshCustomVehicle(vehicleId);
  }
  clearAllGhostOpacities() {
    clearAllRegistryGhostOpacities(this.vehicleRegistry);
  }

  prepareBallSpeedTrail(camera: THREE.Camera | null | undefined) {
    this.ballSpeedTrail.prepare(camera);
    this.supersonicWheelTrailSystem.prepare(camera, this);
  }

  addPads(padDefs: BoostPadDefinition[]) {
    this.boostPadSystem.addPads(padDefs, this.padTemplates, this.scene);
    this.pads = this.boostPadSystem.pads;
    this.markRenderTreeChanged();
  }

  updateBoostPadTuner(config: Partial<BoostPadTunerConfig> | null | undefined) {
    if (!config) return;
    this.boostPadSystem.updateVisualTuningParams(config);
  }

  triggerGoalBarrierImpact(xUu: number, yUu: number, zUu: number) {
    this.goalBarrierVisual.triggerImpact(xUu, yUu, zUu);
  }

  update(
    prevState: NumericStateBuffer | null,
    currState: NumericStateBuffer | null,
    alpha: number,
    delta = 0,
    throttle = 0,
    controls?: CarControlInput | null,
    opponentControls?: CarControlInput | null,
    activeVisuals = true,
    carControlsResolver: CarControlsResolver | null = null
  ) {
    stepArenaWorldFrame(
      this,
      prevState,
      currState,
      alpha,
      delta,
      throttle,
      controls,
      opponentControls,
      activeVisuals,
      carControlsResolver
    );
  }

  updateSubjectShadows() {
    this.lighting.updateShadows(this.cars, this.ball, this.camera, {
      isPovCamera: this.isPovCamera,
      cameraMode: this.cameraMode,
      focusedCarIndex: this.focusedCarIndex ?? this.playerCarIndex ?? 0,
    });
  }

  resetBoostPads() {
    this.boostPadSystem.resetPads();
  }

  dispose() {
    disposeArenaWorldSubsystems(this);
  }
}
