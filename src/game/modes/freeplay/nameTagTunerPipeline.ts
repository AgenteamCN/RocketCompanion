import type * as THREE from 'three';
import { KICKOFF_SPAWN_PRESETS } from '../../../physics/RocketSimConstants.ts';
import type {
  NameTagCameraMode,
  NameTagCarEntry,
  NameTagConfig,
} from '../../../ui-core/config/nameTagConfig.ts';
import { hudStore, useAppStore } from '../../runtimeUiPort.ts';

export interface NameTagTunerRuntimeHost {
  playerCarIndex?: number;
  selectedPreset?: string;
  physics?: {
    numCars: number;
    removeCar?: (carIndex: number) => void;
    addCar?: (team: number, preset: string) => void;
    setCarTeam?: (carIndex: number, team: number) => void;
    setCarState: (carIndex: number, state: Record<string, unknown>) => void;
    setBallState: (state: Record<string, unknown>) => void;
    setControls?: (carIndex: number, controls: Record<string, unknown>) => void;
    step: (dt: number) => void;
  };
  match?: {
    state?: {
      mode?: string;
      phase?: string;
    };
  };
  modeManager?: {
    setMode?: (mode: string) => void;
  };
  keyboard?: {
    ballControlEnabled?: boolean;
  };
  interpolator?: {
    sync?: () => void;
  };
  camera?: {
    camera?: THREE.PerspectiveCamera | null;
    isFreeCam?: boolean;
    currentMode?: NameTagCameraMode;
    ballCam?: boolean;
    setFreeCamPose?: (pos: [number, number, number], target: [number, number, number]) => void;
    setFreeCam?: (enabled: boolean) => void;
    setFocusedCarIndex?: (carIndex: number) => void;
    resetView?: () => void;
  };
  arena?: {
    cars?: Array<THREE.Object3D | null | undefined>;
    carBoostAmounts?: Float32Array | number[];
    carVisual?: string;
    playerCarIndex?: number;
    focusedCarIndex?: number;
    isFreeCam?: boolean;
    cameraMode?: string;
    isPovCamera?: boolean;
    ensureOpponent?: () => Promise<void>;
    ensureCar?: (carIndex: number, team: number, visual: string) => void;
    setCarTeam?: (carIndex: number, team: number) => void;
    setCarColor?: (carIndex: number, colorHex: number) => void;
    nameTagSystem?: {
      update?: (arena: unknown, numCars?: number, camera?: THREE.PerspectiveCamera | null) => void;
    };
  };
}

export const SIX_CAR_KICKOFF_PERMUTATIONS: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [0, 1, 3],
  [0, 1, 4],
  [0, 2, 3],
  [0, 2, 4],
  [0, 3, 4],
  [1, 2, 3],
  [1, 2, 4],
  [1, 3, 4],
  [2, 3, 4],
];

export const TEAM_BLUE_COLORS = [0x0ea5e9, 0x38bdf8, 0x2563eb] as const;
export const TEAM_ORANGE_COLORS = [0xf97316, 0xfb923c, 0xea580c] as const;
export const OVERVIEW_FREECAM_POSITION: [number, number, number] = [-1950, 720, -2600];
export const OVERVIEW_FREECAM_TARGET: [number, number, number] = [0, 80, 0];

export const NEUTRAL_HOLD_CONTROLS = {
  throttle: 0,
  steer: 0,
  pitch: 0,
  yaw: 0,
  roll: 0,
  jump: false,
  boost: false,
  handbrake: true,
} as const;

interface EditableDomTarget {
  isContentEditable?: boolean;
  tagName?: string;
  type?: string;
}

export function isEditableTunerDomTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as EditableDomTarget;
  if (el.isContentEditable) return true;
  const tagName = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
  if (tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  if (tagName === 'INPUT') {
    const inputType = String(el.type || 'text').toLowerCase();
    return !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color'].includes(
      inputType
    );
  }
  return false;
}

export function resolveNameTagTunerHotkeyAction(
  code: string
): { type: 'pov'; carIndex: number } | { type: 'overview' } | null {
  if (code >= 'Digit1' && code <= 'Digit6') {
    return { type: 'pov', carIndex: Number(code.replace('Digit', '')) - 1 };
  }
  if (code >= 'Numpad1' && code <= 'Numpad6') {
    return { type: 'pov', carIndex: Number(code.replace('Numpad', '')) - 1 };
  }
  if (code === 'Digit0' || code === 'Numpad0' || code === 'Backquote') {
    return { type: 'overview' };
  }
  return null;
}

export function buildNameTagCarEntriesFromConfig(
  config: Readonly<Partial<NameTagConfig>>
): NameTagCarEntry[] {
  const entries: NameTagCarEntry[] = [];
  for (let carIndex = 0; carIndex < 6; carIndex++) {
    const sampleBoost = config.previewBoostAmounts?.[carIndex] ?? 100;
    const sampleClimbing = Boolean(config.previewAerialClimbingFlags?.[carIndex]);
    entries.push({
      carIndex,
      name: config.previewNames?.[carIndex] || `Player ${carIndex + 1}`,
      team: carIndex < 3 ? 0 : 1,
      boostAmount: sampleBoost,
      isDoubleJumpedAndClimbing: sampleClimbing,
    });
  }
  return entries;
}

export interface SixCarKickoffSpawnSpec {
  readonly carIndex: number;
  readonly team: 0 | 1;
  readonly colorHex: number;
  readonly sampleBoost: number;
  readonly carState: Record<string, unknown>;
}

export function buildSixCarKickoffSpawnSpecs(
  permutationIndex: number,
  config: Readonly<Partial<NameTagConfig>>
): SixCarKickoffSpawnSpec[] {
  const slotTriple =
    SIX_CAR_KICKOFF_PERMUTATIONS[permutationIndex % SIX_CAR_KICKOFF_PERMUTATIONS.length];
  const specs: SixCarKickoffSpawnSpec[] = [];

  for (let carIndex = 0; carIndex < 6; carIndex++) {
    const team: 0 | 1 = carIndex < 3 ? 0 : 1;
    const teamSlotIndex = carIndex % 3;
    const presetIndex = slotTriple[teamSlotIndex] ?? teamSlotIndex;
    const preset = KICKOFF_SPAWN_PRESETS[presetIndex] || KICKOFF_SPAWN_PRESETS[0];
    const spawnCoord = team === 0 ? preset.team0 : preset.team1;
    const cosYaw = Math.cos(spawnCoord.yaw);
    const sinYaw = Math.sin(spawnCoord.yaw);
    const sampleBoost = config.previewBoostAmounts?.[carIndex] ?? 100;
    const colorHex =
      team === 0
        ? TEAM_BLUE_COLORS[teamSlotIndex % TEAM_BLUE_COLORS.length]
        : TEAM_ORANGE_COLORS[teamSlotIndex % TEAM_ORANGE_COLORS.length];

    specs.push({
      carIndex,
      team,
      colorHex,
      sampleBoost,
      carState: {
        pos: [spawnCoord.x, spawnCoord.y, spawnCoord.z],
        vel: [0, 0, 0],
        angVel: [0, 0, 0],
        rot: [0, spawnCoord.yaw, 0],
        fwd: [cosYaw, sinYaw, 0],
        right: [-sinYaw, cosYaw, 0],
        up: [0, 0, 1],
        isOnGround: true,
        isSupersonic: false,
        isDemoed: false,
        hasFlipOrJump: true,
        isBoosting: false,
        isFlipping: false,
        boost: sampleBoost,
      },
    });
  }
  return specs;
}

export function spawnSixKickoffCarsInScene(
  scene: NameTagTunerRuntimeHost | null,
  permutationIndex: number,
  config: Readonly<Partial<NameTagConfig>>
): void {
  const sim = scene?.physics;
  if (!sim || !scene) return;

  while (sim.numCars > 6 && typeof sim.removeCar === 'function') {
    sim.removeCar(sim.numCars - 1);
  }
  while (sim.numCars < 6 && typeof sim.addCar === 'function') {
    const carIndex = sim.numCars;
    const team = carIndex < 3 ? 0 : 1;
    sim.addCar(team, scene.selectedPreset || 'octane');
  }

  const specs = buildSixCarKickoffSpawnSpecs(permutationIndex, config);
  const arena = scene.arena;

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    if (sim.setCarTeam) sim.setCarTeam(spec.carIndex, spec.team);
    sim.setCarState(spec.carIndex, spec.carState);

    if (arena) {
      if (arena.ensureCar) arena.ensureCar(spec.carIndex, spec.team, arena.carVisual || 'fennec');
      if (arena.setCarTeam) arena.setCarTeam(spec.carIndex, spec.team);
      if (arena.setCarColor) arena.setCarColor(spec.carIndex, spec.colorHex);
      const carMesh = arena.cars?.[spec.carIndex];
      if (carMesh) {
        carMesh.visible = true;
      }
      if (arena.carBoostAmounts) {
        arena.carBoostAmounts[spec.carIndex] = spec.sampleBoost;
      }
    }
  }

  sim.setBallState({
    pos: [0, 0, 93.15],
    vel: [0, 0, 0],
    angVel: [0, 0, 0],
  });

  for (let stepIndex = 0; stepIndex < 30; stepIndex++) {
    for (let carIndex = 0; carIndex < 6; carIndex++) {
      if (sim.setControls) sim.setControls(carIndex, NEUTRAL_HOLD_CONTROLS);
    }
    sim.step(1 / 120);
  }

  if (scene.interpolator?.sync) scene.interpolator.sync();
}

export function applyTunerFreeCamOverviewToScene(
  scene: NameTagTunerRuntimeHost,
  focusedCarIndex: number
): void {
  const { camera, arena } = scene;
  const appState = useAppStore.getState();
  if (camera) {
    if (typeof camera.setFreeCamPose === 'function') {
      camera.setFreeCamPose(OVERVIEW_FREECAM_POSITION, OVERVIEW_FREECAM_TARGET);
    } else if (camera.setFreeCam) {
      camera.setFreeCam(true);
    }
    appState.setFreeCam(true);
  }
  if (arena) {
    arena.isFreeCam = true;
    arena.cameraMode = 'free';
    arena.isPovCamera = false;
    arena.focusedCarIndex = focusedCarIndex;
  }
  hudStore.getState().setCameraFocusState('free', focusedCarIndex);
}

export function applyTunerCarPovToScene(scene: NameTagTunerRuntimeHost, targetIndex: number): void {
  scene.playerCarIndex = targetIndex;
  const { arena, camera } = scene;
  if (arena) {
    arena.playerCarIndex = targetIndex;
    arena.focusedCarIndex = targetIndex;
    arena.isFreeCam = false;
    arena.cameraMode = 'pov';
    arena.isPovCamera = true;
  }
  if (camera) {
    if (camera.setFocusedCarIndex) camera.setFocusedCarIndex(targetIndex);
    if (camera.setFreeCam) camera.setFreeCam(false);
    camera.ballCam = true;
    if (camera.resetView) camera.resetView();
  }
  useAppStore.getState().setFreeCam(false);
  const hud = hudStore.getState();
  hud.setBallCamActive(true);
  hud.setCameraFocusState(camera?.currentMode || 'pov', targetIndex);
}

export function restoreSceneFromNameTagTuner(scene: NameTagTunerRuntimeHost | null): void {
  if (scene) {
    scene.playerCarIndex = 0;
    if (scene.keyboard && scene.match?.state?.mode === 'freeplay') {
      scene.keyboard.ballControlEnabled = true;
    }
  }
  const sim = scene?.physics;
  if (sim) {
    while (sim.numCars > 1 && typeof sim.removeCar === 'function') {
      sim.removeCar(sim.numCars - 1);
    }
  }
  const arena = scene?.arena;
  if (arena) {
    arena.playerCarIndex = 0;
    arena.focusedCarIndex = 0;
    arena.isFreeCam = false;
    arena.cameraMode = 'pov';
    arena.isPovCamera = true;
    if (arena.cars) {
      for (let carIndex = 1; carIndex < arena.cars.length; carIndex++) {
        const carMesh = arena.cars[carIndex];
        if (carMesh) {
          carMesh.visible = false;
        }
      }
    }
  }
  const camera = scene?.camera;
  if (camera) {
    if (camera.setFocusedCarIndex) camera.setFocusedCarIndex(0);
    if (camera.setFreeCam) camera.setFreeCam(false);
    if (camera.resetView) camera.resetView();
  }
  useAppStore.getState().setFreeCam(false);
  hudStore.getState().setCameraFocusState('pov', 0);
  if (scene?.interpolator?.sync) scene.interpolator.sync();
}
