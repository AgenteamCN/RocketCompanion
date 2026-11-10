import * as THREE from 'three';
import { useAppStore, hudStore } from '../runtimeUiPort.ts';
import { applyVisualMaterialsConfig } from '../../effects/ThemeMaterialPipeline.ts';
import type { BallTrajectoryPredictor } from '../../entities/BallTrajectoryPredictor.ts';
import type { ReachabilityVisualizer } from '../../entities/ReachabilityVisualizer.ts';
import { CameraManager } from '../../camera/CameraManager.ts';
import { RocketSimPhysicsEngine } from '../../physics/RocketSimPhysicsEngine.ts';
import { getTeamAssignment } from '../../physics/RocketSimMeshLoader.ts';
import { PhysicsStateInterpolator } from '../../physics/PhysicsStateInterpolator.ts';
import { RuntimeMatchState } from './RuntimeMatchState.ts';
import { KeyboardMouseController } from '../../input/KeyboardMouseController.ts';
import { GamepadController } from '../../input/GamepadController.ts';
import { loadInputBindings } from '../../ui-core/config/inputBindings.ts';
import { DEFAULT_GRAPHICS_SETTINGS } from '../../ui-core/config/trainingDefaults.ts';
import {
  garageSettingsStore,
  getPreferredFreeplayTeam,
} from '../../ui-core/config/vehiclePresets.ts';
import type { MultiplayerSessionManager } from '../../network/transport/MultiplayerSessionManager.ts';
import { BoostBloom } from '../../effects/BoostBloom.ts';
import { SupersonicSpeedLinesPass } from '../../effects/SupersonicSpeedLinesPass.ts';
import { RenderPass, ShaderPass } from '../../effects/PostprocessingPasses.ts';
import { OutputPass } from '../../effects/PostprocessingMaskAndOutputPasses.ts';
import { EffectComposer } from '../../effects/PostprocessingPipeline.ts';
import { RoomEnvironment } from '../../effects/RoomEnvironment.ts';
import { ArenaWorld } from '../../entities/ArenaWorld.ts';
import { EntityManager } from '../../entities/EntityManager.ts';
import {
  createSceneVisualizersAndMultiplayerSession,
  type HostRoomSettings,
  type JoinRoomSettings,
  type MountedGameUIHandle,
  type PairingApprovalRequest,
  type RuntimeSceneCallbackHost,
  type RuntimeSceneOptions,
  type SceneGraphFactoryConfig,
  type SceneGraphRuntimeCallbacks,
  type SessionStatusSnapshot,
  type TeamAssignmentPair,
} from './RuntimePostprocessingAndSessionBootstrap.ts';

export type {
  HostRoomSettings,
  JoinRoomSettings,
  MountedGameUIHandle,
  PairingApprovalRequest,
  RuntimeSceneCallbackHost,
  RuntimeSceneOptions,
  SceneGraphFactoryConfig,
  SceneGraphRuntimeCallbacks,
  SessionStatusSnapshot,
  TeamAssignmentPair,
};

export interface PhysicsBootstrapConfig {
  options?: Record<string, unknown>;
  onPhysicsRateChange?: (nextRate: number) => void;
}

export interface CorePhysicsBundle {
  physics: RocketSimPhysicsEngine;
  interpolator: PhysicsStateInterpolator;
  match: RuntimeMatchState;
  selectedPreset: string;
  teamAssignment: TeamAssignmentPair;
  playerCarIndex: number;
}

export interface SceneGraphBundle {
  selectedPreset: string;
  teamAssignment: TeamAssignmentPair;
  keyboard: KeyboardMouseController;
  gamepad: GamepadController;
  arena: ArenaWorld | null;
  entityManager: EntityManager | null;
  speedLinesPass: SupersonicSpeedLinesPass | null;
  applyVisualMaterialsConfig: typeof applyVisualMaterialsConfig | null;
  camera: CameraManager;
  cursorHintButton: HTMLButtonElement | null;
  activeGraphicsSettings: Record<string, unknown>;
  ballTrajectoryPredictor: BallTrajectoryPredictor | null;
  reachabilityVisualizer: ReachabilityVisualizer | null;
  multiplayerSession: MultiplayerSessionManager;
  gameUI: MountedGameUIHandle | null;
  renderer: THREE.WebGLRenderer | null;
  boostBloom: BoostBloom | null;
  composer: EffectComposer | null;
  isTouchHeadless: boolean;
}

export interface DisposableSceneGraphResources {
  cursorHintButton: HTMLButtonElement | null;
  keyboard: KeyboardMouseController | null;
  gamepad: GamepadController | null;
  camera: CameraManager | null;
  multiplayerSession: MultiplayerSessionManager | null;
  ballTrajectoryPredictor: BallTrajectoryPredictor | null;
  reachabilityVisualizer: ReachabilityVisualizer | null;
  gameUI: MountedGameUIHandle | null;
  composer: EffectComposer | null;
  boostBloom: BoostBloom | null;
  speedLinesPass: SupersonicSpeedLinesPass | null;
  renderer: THREE.WebGLRenderer | null;
  arena: ArenaWorld | null;
  physics: RocketSimPhysicsEngine | null;
}

export async function createCorePhysicsBundle(
  config: PhysicsBootstrapConfig = {}
): Promise<CorePhysicsBundle> {
  const loadedSettings = garageSettingsStore.load() as {
    vehiclePreset?: string;
    carVisual?: string;
  };
  const selectedPreset = loadedSettings.vehiclePreset || loadedSettings.carVisual || 'fennec';
  const freeplayTeam = getPreferredFreeplayTeam();
  const teamAssignment = getTeamAssignment(freeplayTeam === 1);

  const physics = new RocketSimPhysicsEngine();
  await physics.init(config.options ?? {});
  const playerCarIndex = physics.addCar(teamAssignment.playerTeam, selectedPreset);
  physics.resetKickoff();

  const interpolator = new PhysicsStateInterpolator(physics);
  if (config.onPhysicsRateChange) {
    interpolator.onPhysicsRateChange = config.onPhysicsRateChange;
  }
  const match = new RuntimeMatchState();

  return {
    physics,
    interpolator,
    match,
    selectedPreset,
    teamAssignment,
    playerCarIndex,
  };
}

export async function createCoreSceneGraph(
  config: SceneGraphFactoryConfig
): Promise<SceneGraphBundle> {
  const {
    container,
    physics,
    selectedPreset: presetOverride,
    teamAssignment: existingTeams,
    playerCarIndex,
    options,
    onProgress = null,
    callbacks,
  } = config;

  const loadedSettings = garageSettingsStore.load() as {
    vehiclePreset?: string;
    carVisual?: string;
  };
  const selectedPreset =
    presetOverride || loadedSettings.vehiclePreset || loadedSettings.carVisual || 'fennec';
  const freeplayTeam = getPreferredFreeplayTeam();
  const teamAssignment: TeamAssignmentPair = existingTeams || getTeamAssignment(freeplayTeam === 1);
  teamAssignment.playerTeam = freeplayTeam;
  teamAssignment.opponentTeam = freeplayTeam === 0 ? 1 : 0;
  hudStore.getState().setMatchState({ localTeam: freeplayTeam });

  const isTouchHeadless = Boolean(useAppStore?.getState?.()?.touchHeadlessMode);

  const bindings = loadInputBindings();
  const keyboard = new KeyboardMouseController(bindings);
  const gamepad = new GamepadController(bindings);

  const onResetHandler = () => callbacks.onResetKickoff();
  keyboard.onReset = onResetHandler;
  gamepad.onReset = onResetHandler;

  let arena: ArenaWorld | null = null;
  let entityManager: EntityManager | null = null;
  let speedLinesPass: SupersonicSpeedLinesPass | null = null;
  let resolvedApplyVisualMaterials: typeof applyVisualMaterialsConfig | null = null;

  if (!isTouchHeadless) {
    speedLinesPass = new SupersonicSpeedLinesPass();
    arena = new ArenaWorld(physics.ballRadius, selectedPreset);
    await arena.loadAllAssets(onProgress);
    entityManager = new EntityManager({
      physics,
      arena,
    });
    entityManager.spawnVehicle(0, {
      team: freeplayTeam,
      visual: selectedPreset,
      isPlayer: true,
    });
    await arena.vehicleRegistry.ensureOpponent();
    if (arena.cars[1]) {
      arena.cars[1].visible = false;
    }
    arena.addPads(physics.getPads());

    resolvedApplyVisualMaterials = applyVisualMaterialsConfig;
    callbacks.onSyncInitialMaterials(
      arena,
      applyVisualMaterialsConfig,
      useAppStore.getState().materials
    );
  } else if (typeof onProgress === 'function') {
    onProgress(1.0, 'Headless React-only mode (?touch=2) ready — Three.js disabled');
  }

  const onBallControlHandler = (actionId: string) => {
    callbacks.onBallControl(actionId);
  };
  keyboard.onBallControl = onBallControlHandler;
  gamepad.onBallControl = onBallControlHandler;

  keyboard.onKickoffSpawnSelect = (spawnIndex: number) => {
    callbacks.onKickoffSpawnSelect(spawnIndex);
  };

  if (!isTouchHeadless) {
    callbacks.onEnsurePlayerFlipResetVisual(playerCarIndex);
  }

  const aspect = typeof window !== 'undefined' ? window.innerWidth / window.innerHeight : 16 / 9;
  const CameraControllerClass = options.CameraControllerClass || CameraManager;
  const camera = new CameraControllerClass(aspect);
  const freeCtrl = camera?.controllers?.get?.('free') as
    | {
        onFovChange?: (fov: number) => void;
        shouldSuppressRightClickDrag?: () => boolean;
      }
    | undefined;
  if (freeCtrl) {
    freeCtrl.onFovChange = (newFov: number) => useAppStore.setState({ freeCamFov: newFov });
    freeCtrl.shouldSuppressRightClickDrag = () =>
      useAppStore.getState().matchMode === 'static-training-pack';
  }

  const cursorHintButton =
    typeof document !== 'undefined' ? document.createElement('button') : null;
  if (cursorHintButton) {
    cursorHintButton.type = 'button';
    cursorHintButton.className = 'cursor-hint';
  }

  const activeGraphicsSettings: Record<string, unknown> = {
    ...DEFAULT_GRAPHICS_SETTINGS,
  };

  const { ballTrajectoryPredictor, reachabilityVisualizer, multiplayerSession } =
    createSceneVisualizersAndMultiplayerSession({
      isTouchHeadless,
      arena,
      physics,
      callbacks,
    });

  let gameUI: MountedGameUIHandle | null = null;
  if (container && typeof document !== 'undefined') {
    gameUI = callbacks.onMountOrAttachGameUI(container);
    const carBtn = container.querySelector('#car-button') as HTMLElement | null;
    if (carBtn) {
      carBtn.onclick = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        gameUI?.openMenu('garage');
      };
    }
  }

  const onToggleBallCam = () => {
    if (typeof camera.handleAction === 'function') {
      camera.handleAction('ballCam');
    } else {
      camera.ballCam = !camera.ballCam;
    }
    hudStore.getState().setBallCamActive(camera.ballCam);
  };
  gamepad.onBallCamToggle = onToggleBallCam;
  keyboard.onBallCamToggle = onToggleBallCam;
  keyboard.onFreeCamToggle = () => useAppStore.getState().toggleFreeCam();
  hudStore.getState().setOnToggleBallCam(onToggleBallCam);
  hudStore.getState().setBallCamActive(camera.ballCam);
  hudStore.getState().syncBindings(bindings);

  let renderer: THREE.WebGLRenderer | null = null;
  let boostBloom: BoostBloom | null = null;
  let composer: EffectComposer | null = null;

  if (!isTouchHeadless && arena && speedLinesPass) {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const winHeight = typeof window !== 'undefined' ? window.innerHeight : 720;
    const devicePixelRatio =
      typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1;

    renderer.setSize(winWidth, winHeight);
    renderer.setPixelRatio(devicePixelRatio);
    if (renderer.shadowMap) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.BasicShadowMap ?? THREE.PCFShadowMap ?? 0;
      renderer.shadowMap.autoUpdate = false;
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping || 4;
    renderer.toneMappingExposure = 1.15;

    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    arena.scene.environment = pmrem.fromScene(roomEnv, 0.04).texture;
    arena.scene.environmentIntensity = 0.5;
    roomEnv.dispose();
    pmrem.dispose();

    if (container && renderer.domElement && renderer.domElement.parentNode !== container) {
      if (renderer.domElement.classList?.add) {
        renderer.domElement.classList.add('game-canvas');
      }
      container.appendChild(renderer.domElement);
    }

    boostBloom = new BoostBloom(renderer, winWidth, winHeight, renderer.getPixelRatio());
    composer = new EffectComposer(renderer);
    callbacks.onUpdateViewport(
      renderer,
      camera,
      composer,
      boostBloom,
      speedLinesPass,
      activeGraphicsSettings
    );

    composer.addPass(new RenderPass(arena.scene, camera.camera));
    composer.addPass(
      new ShaderPass(
        new THREE.ShaderMaterial({
          uniforms: {
            baseTexture: { value: null },
            bloomTexture: { value: boostBloom.texture },
          },
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform sampler2D baseTexture;
            uniform sampler2D bloomTexture;
            varying vec2 vUv;
            void main() {
              vec4 base = texture2D(baseTexture, vUv);
              vec3 glow = texture2D(bloomTexture, vUv).rgb;
              gl_FragColor = vec4(base.rgb + glow, base.a);
            }
          `,
        }),
        'baseTexture'
      )
    );
    composer.addPass(new OutputPass());
    composer.addPass(speedLinesPass.pass);
  } else {
    callbacks.onDisposeHeadlessBloomOcclusion();
  }

  return {
    selectedPreset,
    teamAssignment,
    keyboard,
    gamepad,
    arena,
    entityManager,
    speedLinesPass,
    applyVisualMaterialsConfig: resolvedApplyVisualMaterials,
    camera,
    cursorHintButton,
    activeGraphicsSettings,
    ballTrajectoryPredictor,
    reachabilityVisualizer,
    multiplayerSession,
    gameUI,
    renderer,
    boostBloom,
    composer,
    isTouchHeadless,
  };
}

export function disposeCoreSceneGraph(resources: DisposableSceneGraphResources): void {
  if (resources.cursorHintButton && resources.cursorHintButton.parentElement) {
    resources.cursorHintButton.parentElement.removeChild(resources.cursorHintButton);
  }

  resources.keyboard?.dispose?.();
  resources.gamepad?.dispose?.();
  resources.camera?.dispose?.();

  if (resources.multiplayerSession) {
    resources.multiplayerSession.stopHosting?.();
    resources.multiplayerSession.leaveSession?.();
  }

  resources.ballTrajectoryPredictor?.dispose?.();
  resources.reachabilityVisualizer?.dispose?.();
  resources.gameUI?.destroy?.();
  resources.composer?.dispose?.();
  resources.boostBloom?.dispose?.();
  resources.speedLinesPass?.dispose?.();

  if (resources.renderer) {
    if (resources.renderer.domElement && resources.renderer.domElement.parentElement) {
      resources.renderer.domElement.parentElement.removeChild(resources.renderer.domElement);
    }
    resources.renderer.dispose?.();
  }

  resources.arena?.dispose?.();
  resources.physics?.destroy?.();

  Object.assign(resources, {
    cursorHintButton: null,
    keyboard: null,
    gamepad: null,
    camera: null,
    multiplayerSession: null,
    ballTrajectoryPredictor: null,
    reachabilityVisualizer: null,
    gameUI: null,
    composer: null,
    boostBloom: null,
    speedLinesPass: null,
    renderer: null,
    arena: null,
    physics: null,
  });
}
