import { useAppStore } from '../runtimeUiPort.ts';
import { getEffectiveGamepad } from '../../ui-core/config/inputBindings.ts';
import { NEUTRAL_CAR_CONTROLS } from '../../network/client/PredictionHistoryBuffer.ts';
import type { CarControlsInput } from '../../network/protocol/GlobalPayloadCodec.ts';
import type { GamepadController } from '../../input/GamepadController.ts';
import type { KeyboardMouseController } from '../../input/KeyboardMouseController.ts';
import type { CameraManager } from '../../camera/CameraManager.ts';
import type { RuntimeMatchState } from './RuntimeMatchState.ts';
import type { PredictionReconciler } from '../../network/client/PredictionReconciler.ts';
import {
  TouchInputAgentController,
  type ActiveCarTeamSlot,
  type ActiveModeCarListPort,
  type TouchAgentWorldContext,
} from './TouchInputAgentController.ts';

export type { ActiveCarTeamSlot, ActiveModeCarListPort };

export interface RuntimeInputPollerHostPort extends TouchAgentWorldContext {
  readonly networkReconciler?: PredictionReconciler | null;
  readonly networkManager?: {
    readonly sessionCoordinator?: {
      readonly networkReconciler: PredictionReconciler | null;
    };
    readonly rosterSyncCoordinator?: {
      readonly participantTeams?: ReadonlyMap<number, number>;
    };
  } | null;
  readonly gamepad: GamepadController | null;
  readonly keyboard: KeyboardMouseController | null;
  readonly camera: CameraManager | null;
  readonly match: RuntimeMatchState | null;
  readonly cameraSubsystem?: { cameraDynamics: { lookX: number; lookY: number } | null } | null;
  readonly botCoordinator?: {
    readonly isBotMatch?: boolean;
    stepAuthoritativeBotControls(isKickoff: boolean): void;
  } | null;
  playerThrottle: number;
  playerControls: CarControlsInput;
}

export interface InputFrameSnapshot {
  readonly pad: Gamepad | null;
  readonly padReading: CarControlsInput;
  readonly kbReading: CarControlsInput;
  readonly activeDevice: 'gamepad' | 'keyboard';
  readonly gamepadCameraLook: { readonly x: number; readonly y: number };
  readonly keyboardCameraLook: { readonly x: number; readonly y: number };
  readonly isMenuOpen: boolean;
  readonly touchMode: boolean;
  readonly touchInputAgent: string;
  readonly isFreeCamActive: boolean;
  readonly phase: string | undefined;
  readonly isMatchPaused: boolean;
  readonly currentTick: number;
  readonly kickoffMaskUntilTick: number;
  readonly replayPlaybackMode: boolean;
  readonly hasFocus: boolean;
}

export interface NormalizedCarControls {
  throttle: number;
  steer: number;
  pitch: number;
  yaw: number;
  roll: number;
  jump: boolean;
  boost: boolean;
  handbrake: boolean;
}

export interface InputPollCommand {
  readonly shouldOpenPlayMenu: boolean;
  readonly isKickoff: boolean;
  readonly isKickoffMasked: boolean;
  readonly effectiveControls: CarControlsInput;
  readonly normalizedControls: NormalizedCarControls;
  readonly lookX: number;
  readonly lookY: number;
}

function clampUnitLookAxis(value: number): number {
  return Math.min(Math.max(value, -1), 1);
}

export function normalizeCarControlsInput(controls: CarControlsInput): NormalizedCarControls {
  return {
    throttle: controls.throttle ?? 0,
    steer: controls.steer ?? 0,
    pitch: controls.pitch ?? 0,
    yaw: controls.yaw ?? 0,
    roll: controls.roll ?? 0,
    jump: Boolean(controls.jump),
    boost: Boolean(controls.boost),
    handbrake: Boolean(controls.handbrake),
  };
}

/**
 * RuntimeInputPoller
 * Self-contained SubController owning gamepad button debounce state, jump suppression latch,
 * and delegating touch AI agent control synthesis to TouchInputAgentController.
 * Evaluates a pure InputFrameSnapshot and produces an explicit InputPollCommand.
 */
export class RuntimeInputPoller {
  private readonly readPort: () => RuntimeInputPollerHostPort;
  public readonly touchAgentController = new TouchInputAgentController();
  public lastGamepadId: string | null = null;
  public lastGamepadButton8 = false;
  public gamepadSettingsJustClosed = false;
  private _suppressJumpUntilReleased = false;

  constructor(portOrProvider: RuntimeInputPollerHostPort | (() => RuntimeInputPollerHostPort)) {
    this.readPort = typeof portOrProvider === 'function' ? portOrProvider : () => portOrProvider;
  }

  public latchJumpSuppression(portOverride?: RuntimeInputPollerHostPort): void {
    const port = portOverride ?? this.readPort();
    const kbJump = Boolean(port.keyboard?.read?.()?.jump);
    const padJump = Boolean(port.gamepad?.read?.()?.jump);
    if (kbJump || padJump || Boolean(port.playerControls?.jump)) {
      this._suppressJumpUntilReleased = true;
    }
  }

  public evaluateInputSnapshot(
    snapshot: InputFrameSnapshot,
    commitPhysicsStep: boolean,
    touchWorldContext: TouchAgentWorldContext
  ): InputPollCommand {
    const { pad, isMenuOpen, touchMode, touchInputAgent, hasFocus } = snapshot;
    const btn8 = pad?.buttons[8]?.pressed ?? false;
    const padId = pad ? JSON.stringify([pad.id, pad.index]) : null;

    if (padId !== this.lastGamepadId) {
      this.lastGamepadButton8 = btn8;
    }
    this.lastGamepadId = padId;

    const shouldOpenPlayMenu = btn8 && !this.lastGamepadButton8 && !isMenuOpen;
    this.lastGamepadButton8 = btn8;

    let padReading = snapshot.padReading;
    if (this.gamepadSettingsJustClosed) {
      this.gamepadSettingsJustClosed = [0, 1, 8, 9].some((i) => pad?.buttons[i]?.pressed);
      if (this.gamepadSettingsJustClosed) {
        padReading = NEUTRAL_CAR_CONTROLS;
      }
    }

    const rawControls = snapshot.activeDevice === 'gamepad' ? padReading : snapshot.kbReading;
    const isKickoff = snapshot.phase === 'kickoff' || snapshot.phase === 'prepare';
    const isKickoffMasked = snapshot.kickoffMaskUntilTick > snapshot.currentTick;
    const isReplayOrFrozenPhase =
      snapshot.isFreeCamActive ||
      isKickoff ||
      isKickoffMasked ||
      snapshot.phase === 'replay' ||
      snapshot.phase === 'podium' ||
      snapshot.phase === 'ended' ||
      snapshot.isMatchPaused ||
      snapshot.replayPlaybackMode;

    if (!rawControls.jump) {
      this._suppressJumpUntilReleased = false;
    } else if (isReplayOrFrozenPhase) {
      this._suppressJumpUntilReleased = true;
    }

    let effectiveControls: CarControlsInput;
    if (snapshot.isFreeCamActive || isKickoff || isKickoffMasked) {
      if (
        (isKickoff || isKickoffMasked) &&
        (touchInputAgent === 'necto' || touchInputAgent === 'nexto')
      ) {
        this.touchAgentController.resolveControls(touchInputAgent, true, touchWorldContext);
      }
      effectiveControls = NEUTRAL_CAR_CONTROLS;
    } else if (touchInputAgent === 'necto' || touchInputAgent === 'nexto') {
      effectiveControls = commitPhysicsStep
        ? this.touchAgentController.resolveControls(touchInputAgent, false, touchWorldContext)
        : this.touchAgentController.getCachedActionOrNeutral();
    } else if (touchMode && touchInputAgent === 'none') {
      effectiveControls = NEUTRAL_CAR_CONTROLS;
    } else if (this._suppressJumpUntilReleased && rawControls.jump) {
      effectiveControls = { ...rawControls, jump: false };
    } else {
      effectiveControls = rawControls;
    }

    const padLookX = this.gamepadSettingsJustClosed ? 0 : snapshot.gamepadCameraLook.x;
    const padLookY = this.gamepadSettingsJustClosed ? 0 : snapshot.gamepadCameraLook.y;
    const lookX = hasFocus ? clampUnitLookAxis(snapshot.keyboardCameraLook.x + padLookX) : 0;
    const lookY = hasFocus ? clampUnitLookAxis(snapshot.keyboardCameraLook.y + padLookY) : 0;

    return {
      shouldOpenPlayMenu,
      isKickoff,
      isKickoffMasked,
      effectiveControls,
      normalizedControls: normalizeCarControlsInput(effectiveControls),
      lookX,
      lookY,
    };
  }

  public pollInputs(commitPhysicsStep = true, portOverride?: RuntimeInputPollerHostPort): boolean {
    const port = portOverride ?? this.readPort();
    const { gamepad, keyboard, physics } = port;
    if (!gamepad || !keyboard || !physics) return false;

    const pad = getEffectiveGamepad();
    const appState = useAppStore ? useAppStore.getState() : null;
    const isMenuOpen = Boolean(appState?.isOpen);
    const btn8 = pad?.buttons[8]?.pressed ?? false;
    const padId = pad ? JSON.stringify([pad.id, pad.index]) : null;
    const willToggleMatch =
      btn8 && !(padId !== this.lastGamepadId ? btn8 : this.lastGamepadButton8) && !isMenuOpen;

    if (willToggleMatch) gamepad.capturing = true;
    const padReading = gamepad.read();
    if (willToggleMatch) gamepad.capturing = false;

    const snapshot: InputFrameSnapshot = {
      pad,
      padReading,
      kbReading: keyboard.read(),
      activeDevice: gamepad.active() ? 'gamepad' : 'keyboard',
      gamepadCameraLook: gamepad.cameraLook,
      keyboardCameraLook: keyboard.cameraLook,
      isMenuOpen,
      touchMode: Boolean(appState?.touchMode),
      touchInputAgent:
        typeof appState?.touchInputAgent === 'string' ? appState.touchInputAgent : 'none',
      isFreeCamActive: Boolean(port.camera?.isFreeCam),
      phase: port.match?.state?.phase,
      isMatchPaused: Boolean(port.match?.state?.paused),
      currentTick: Math.floor(physics.getHeaderView?.()?.tickCount ?? 0),
      kickoffMaskUntilTick: port.networkReconciler?.kickoffMaskUntilTick ?? -1,
      replayPlaybackMode: Boolean(port.networkReconciler?.replayPlaybackMode),
      hasFocus: typeof document !== 'undefined' && !document.hidden && document.hasFocus(),
    };

    const command = this.evaluateInputSnapshot(snapshot, commitPhysicsStep, port);

    if (command.shouldOpenPlayMenu) {
      appState?.openMenu?.('play');
    }

    const camDynamics = port.cameraSubsystem?.cameraDynamics;
    if (camDynamics) {
      camDynamics.lookX = command.lookX;
      camDynamics.lookY = command.lookY;
    }

    if (!commitPhysicsStep) {
      return true;
    }

    const reconciler = port.networkManager?.sessionCoordinator?.networkReconciler ?? null;
    if (reconciler?.shouldSkipLocalStep) {
      reconciler.shouldSkipLocalStep = false;
      return false;
    }

    const playerCarIndex = port.playerCarIndex;
    let car0Controls: CarControlsInput = command.normalizedControls;
    if (reconciler) {
      car0Controls =
        (reconciler.sampleAndPredictInput(
          playerCarIndex,
          command.normalizedControls
        ) as CarControlsInput | null) || command.normalizedControls;
    }

    port.playerThrottle = car0Controls.throttle ?? 0;
    port.playerControls = car0Controls;
    physics.setControls(playerCarIndex, car0Controls);

    port.botCoordinator?.stepAuthoritativeBotControls(command.isKickoff);

    if (reconciler?.historyBuffer.lastRemoteControls) {
      const numCars = Math.min(physics.numCars, 8);
      for (let c = 0; c < numCars; c++) {
        if (c !== playerCarIndex) {
          const remote = reconciler.historyBuffer.lastRemoteControls.get(c) as
            ({ controls?: CarControlsInput } & CarControlsInput) | undefined;
          const remoteCtrl = remote?.controls ? remote.controls : remote || NEUTRAL_CAR_CONTROLS;
          physics.setControls(c, remoteCtrl);
        }
      }
    }
    return true;
  }
}
