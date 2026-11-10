import type * as THREE from 'three';
import type { BoostPadSystem } from '../BoostPadSystem.ts';
import type { BallLocatorArrow } from '../BallLocatorArrow.ts';
import type { SpeedTrail } from '../SpeedTrail.ts';
import type {
  ArenaHeaderView,
  CarStateView,
  BallStateView,
  NumericStateBuffer,
} from '../../physics/RocketSimStateViews.ts';
import { ArenaEnvironmentManager } from './ArenaEnvironmentManager.ts';
import { updateSkyboxFrame } from './ArenaSky.ts';
import type { ArenaLightingManager } from './ArenaLighting.ts';
import type { ArenaVehicleRegistry } from './ArenaVehicleRegistry.ts';
import {
  stepArenaVehiclesFrame,
  updateBoostVisuals,
  type ArenaVehicleStepTarget,
  type CarControlInput,
  type CarControlsResolver,
} from './ArenaVehicleFrameStepper.ts';
import {
  loadBallAssetInto,
  loadCarAndPadAssets,
  prepareAllArenaWarmupAssets,
  runParallelArenaAssetSteps,
} from './ArenaAssetLoader.ts';
import { ensureRegistryOpponentCar } from './arenaVehicleCosmeticPipeline.ts';
import type { BoostPadTemplates } from './BoostPadTemplateLoader.ts';
import type { VehicleNameTagSystem } from './VehicleNameTagSystem.ts';
import type { GoalBarrierVisual } from './GoalBarrierVisual.ts';
import type { GoalVolumeHitboxVisual } from './GoalVolumeHitboxVisual.ts';
import type { RespawnGhostPreview } from './RespawnGhostPreview.ts';
import type { SpatialAudioDebugVisualizer } from './SpatialAudioDebugVisualizer.ts';
import type { CarNoseOrientationArrows } from './CarNoseOrientationArrows.ts';
import type { SupersonicWheelTrailSystem } from '../vehicle/supersonic-trail/SupersonicWheelTrailSystem.ts';
import type { DemolitionSimPreviewController } from '../DemolitionEffect.ts';

export interface ArenaWorldLifecycleState extends ArenaVehicleStepTarget {
  scene: THREE.Scene;
  ball: THREE.Group;
  ballRadius: number;
  ballVelocity: THREE.Vector3;
  ballSpeedTrail: SpeedTrail;
  ballLocatorArrow: BallLocatorArrow;
  boostPadSystem: BoostPadSystem;
  padTemplates: BoostPadTemplates | null;
  vehiclePreset: string;
  sky: THREE.Mesh;
  lighting: ArenaLightingManager;
  goalBarrierVisual: GoalBarrierVisual;
  goalVolumeHitboxVisual: GoalVolumeHitboxVisual;
  indicatorRing: THREE.Mesh;
  indicatorHeightRing: THREE.Mesh;
  vehicleRegistry: ArenaVehicleRegistry;
  environment: ArenaEnvironmentManager;
  nameTagSystem: VehicleNameTagSystem;
  respawnGhostPreview: RespawnGhostPreview;
  spatialAudioVisualizer: SpatialAudioDebugVisualizer;
  carNoseOrientationArrows: CarNoseOrientationArrows;
  supersonicWheelTrailSystem: SupersonicWheelTrailSystem;
  demolitionSimPreview: DemolitionSimPreviewController;
  _headerView: ArenaHeaderView;
  _currCarView: CarStateView;
  _prevCarView: CarStateView;
  _currBallView: BallStateView;
  _prevBallView: BallStateView;
  camera?: THREE.Camera | null;
  markRenderTreeChanged(): void;
}

export function createArenaEnvironmentManagerForWorld(
  world: Omit<ArenaWorldLifecycleState, 'environment'>
): ArenaEnvironmentManager {
  return new ArenaEnvironmentManager({
    scene: world.scene,
    ball: world.ball,
    ballRadius: world.ballRadius,
    ballVelocity: world.ballVelocity,
    ballSpeedTrail: world.ballSpeedTrail,
    sky: world.sky,
    lighting: world.lighting,
    goalBarrierVisual: world.goalBarrierVisual,
    goalVolumeHitboxVisual: world.goalVolumeHitboxVisual,
    indicatorRing: world.indicatorRing,
    indicatorHeightRing: world.indicatorHeightRing,
    cars: world.cars,
    pA: world.pA,
    pB: world.pB,
    qA: world.qA,
    qB: world.qB,
    _currBallView: world._currBallView,
    _prevBallView: world._prevBallView,
    markRenderTreeChanged: () => world.markRenderTreeChanged(),
  });
}

export async function loadAllArenaWorldAssets(
  world: ArenaWorldLifecycleState,
  onProgress: ((progress: number, name: string) => void) | null = null
): Promise<void> {
  await runParallelArenaAssetSteps(
    [
      { label: 'Stadium Architecture & Boundary', run: () => world.environment.loadArena() },
      {
        label: 'Ball Geometry',
        run: async () => {
          await loadBallAssetInto(world.ball);
          world.markRenderTreeChanged();
        },
      },
      {
        label: 'Vehicle Models & Boost Pads',
        run: async () => {
          world.padTemplates = await loadCarAndPadAssets(
            world.vehicleRegistry,
            world.boostPadSystem,
            world.vehiclePreset
          );
          world.markRenderTreeChanged();
        },
      },
    ],
    onProgress
  );
  world.markRenderTreeChanged();
}

export async function prepareArenaWorldWarmupAssets(
  world: ArenaWorldLifecycleState,
  onProgress: ((loaded: number, total: number, label: string) => void) | null = null
): Promise<void> {
  await prepareAllArenaWarmupAssets(
    () => ensureRegistryOpponentCar(world.vehicleRegistry),
    world.vehicleRegistry,
    onProgress
  );
}

export function stepArenaWorldFrame(
  world: ArenaWorldLifecycleState,
  prevState: NumericStateBuffer | null,
  currState: NumericStateBuffer | null,
  alpha: number,
  delta = 0,
  throttle = 0,
  controls?: CarControlInput | null,
  opponentControls?: CarControlInput | null,
  activeVisuals = true,
  carControlsResolver: CarControlsResolver | null = null
): void {
  let actualDelta = delta;
  let actualThrottle = throttle;
  if (actualDelta > 0.1 && actualThrottle > 0 && actualThrottle < 0.05) {
    actualDelta = throttle;
    actualThrottle = delta;
  }

  const header = world._headerView.attach(currState);
  world.environment.stepBallAndEnvironmentVisuals(prevState, currState, alpha, actualDelta);

  stepArenaVehiclesFrame(
    world,
    prevState,
    currState,
    header.numCars,
    alpha,
    actualDelta,
    actualThrottle,
    controls,
    opponentControls,
    activeVisuals,
    carControlsResolver
  );

  world.lighting.updateSunIntensities(header.numCars);
  updateSkyboxFrame(actualDelta, world.lighting._shadowDir);
  world.boostPadSystem.update(
    currState as Float32Array | null,
    undefined,
    actualDelta,
    world.camera
  );
  world.respawnGhostPreview.update(currState, actualDelta);
  world.demolitionSimPreview.stepFrame();
  updateBoostVisuals(
    world.cars,
    world.carBoosts,
    currState,
    actualThrottle,
    actualDelta,
    opponentControls?.throttle ?? 0,
    activeVisuals,
    controls,
    opponentControls,
    world.playerCarIndex,
    world._headerView,
    world._currCarView,
    carControlsResolver
  );
}

export function disposeArenaWorldSubsystems(world: ArenaWorldLifecycleState): void {
  world.boostPadSystem.dispose();
  world.ballSpeedTrail.dispose();
  world.ballLocatorArrow.dispose();
  world.goalBarrierVisual.dispose();
  world.goalVolumeHitboxVisual.dispose();
  world.nameTagSystem.dispose();
  world.respawnGhostPreview.dispose();
  world.spatialAudioVisualizer.dispose();
  world.carNoseOrientationArrows.dispose();
  world.supersonicWheelTrailSystem.dispose();
  world.demolitionSimPreview.dispose();
  world.lighting.dispose();
  world.vehicleRegistry.dispose();
  world.environment.disposeEnvironmentMeshes();
}
