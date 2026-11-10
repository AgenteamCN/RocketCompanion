import {
  useAppStore,
  hudStore,
  useExperimentalMultiBotsStore,
  floatingStore,
  NETWORK_MONITOR_PRESET,
  networkDiagnosticsStore,
  globalHudTransientChannel,
} from '../runtimeUiPort.ts';
import type { ExpSpawnedCarEntry } from '../modes/experimental-multi-bots/ExperimentalMultiBotsMatchMath.ts';
import type { KeyboardMouseController } from '../../input/KeyboardMouseController.ts';
import type { ReplayTimelineController } from '../../replay/ReplayTimelineController.ts';
import type { CameraManager } from '../../camera/CameraManager.ts';
import type { RuntimeMatchState } from './RuntimeMatchState.ts';
import type { RuntimeNetworkManager } from './RuntimeNetworkManager.ts';
import {
  isEditableFormElement,
  parseSlotKeyFromKeyEvent,
  resolveReplayCameraSlotCommand,
  resolveWindowHotkeyCommand,
  type ReplayCameraSlotCommand,
  type ReplayCameraSlotSnapshot,
  type WindowHotkeyCommand,
  type WindowKeyDownSnapshot,
} from './windowHotkeysPipeline.ts';

export type {
  ReplayCameraSlotCommand,
  ReplayCameraSlotSnapshot,
  WindowHotkeyCommand,
  WindowKeyDownSnapshot,
};

export interface ActiveModeReplayPort {
  id?: string;
  isReplayActive?: boolean;
  replayCameraMode?: string;
  replayPovCarIndex?: number | null;
  goalReplayPhase?: string;
  spawnedCars?: ReadonlyArray<ExpSpawnedCarEntry>;
  isGoalReplayActive?(): boolean;
  setReplayCameraMode?(mode: string): void;
  directorPreview?: {
    isReplayActive?: boolean;
  } | null;
  replaySession?: {
    isReplayActive?: boolean;
    replayCameraMode?: string;
    replayPovCarIndex?: number | null;
    replayController?: {
      directorCameraState?: { initialized?: boolean } | null;
    } | null;
  } | null;
  rosterController?: {
    spawnedCars?: ReadonlyArray<ExpSpawnedCarEntry>;
  } | null;
  replayController?: {
    directorCameraState?: { initialized?: boolean } | null;
  } | null;
  goalReplayTimelineController?: {
    sessionState?: { isActive?: boolean } | null;
    togglePause(): void;
  } | null;
  _applyCameraCarIndex?(carIndex: number): void;
  skipGoalReplay?(): void;
}

export interface RuntimeWindowHotkeysHostPort {
  readonly match: RuntimeMatchState | null;
  readonly modeManager: { getActiveMode(): ActiveModeReplayPort | null } | null;
  readonly keyboard: KeyboardMouseController | null;
  readonly replayTimelineController: ReplayTimelineController | null;
  readonly camera: CameraManager | null;
  readonly domEventManager: { syncPausedAndInputState?(): void } | null;
  readonly gameUI: { openMenu(route: string): void; toggleMenu?(): void } | null;
  readonly networkManager: RuntimeNetworkManager | null;
  readonly _lastHudSlotCarMap: Record<number, number> | null;
  replayPovCarIndex: number | null;
  _localSkipReplayReady: boolean;
  isCursorBrowsing: boolean;
  acquireGoalReplayCameraOverride(): void;
  releaseGoalReplayCameraOverride(): void;
}

function isNetworkDiagnosticsWindowPresent(): boolean {
  const windows = floatingStore.getSnapshot()?.windows || [];
  return windows.some((w) => w.id === NETWORK_MONITOR_PRESET.id);
}

function isReplayDirectorTunerWindowPresent(): boolean {
  const windows = floatingStore.getSnapshot()?.windows || [];
  return windows.some((w) => w.id === 'replay-director-tuner');
}

export class RuntimeWindowHotkeysController {
  private readonly readPort: () => RuntimeWindowHotkeysHostPort;

  constructor(portOrProvider: RuntimeWindowHotkeysHostPort | (() => RuntimeWindowHotkeysHostPort)) {
    this.readPort = typeof portOrProvider === 'function' ? portOrProvider : () => portOrProvider;
  }

  public selectReplayCameraSlot(
    slotKey: number | null,
    portOverride?: RuntimeWindowHotkeysHostPort
  ): boolean {
    const port = portOverride ?? this.readPort();
    if (!port) return false;
    const activeMode = port.modeManager?.getActiveMode?.() ?? null;
    const isModeReplayActive = Boolean(
      activeMode?.isGoalReplayActive?.() ||
      activeMode?.directorPreview?.isReplayActive ||
      activeMode?.replaySession?.isReplayActive
    );
    const isGoalReplay =
      port.match?.state?.phase === 'replay' ||
      hudStore.getState().matchPhase === 'replay' ||
      isModeReplayActive;
    const isExpSpectatorLive =
      !isGoalReplay &&
      port.match?.state?.mode === 'exp-multi-bots' &&
      useExperimentalMultiBotsStore.getState().playerParticipation === 'none';

    const cmd = resolveReplayCameraSlotCommand(slotKey, {
      isGoalReplay,
      isModeReplayActive,
      isExpSpectatorLive,
      localTeam: hudStore.getState().localTeam,
      lastHudSlotCarMap: port._lastHudSlotCarMap,
      spawnedCars: activeMode?.rosterController?.spawnedCars,
    });

    if (cmd.kind === 'select-director') {
      port.replayPovCarIndex = null;
      port.acquireGoalReplayCameraOverride();
      if (port.replayTimelineController?.directorCameraState) {
        port.replayTimelineController.directorCameraState.initialized = false;
      }
      if (activeMode && cmd.resetModeDirectorCamera) {
        activeMode.setReplayCameraMode?.('director');
        if (activeMode.replaySession) activeMode.replaySession.replayCameraMode = 'director';
        const modeCtrl = activeMode.replayController ?? activeMode.replaySession?.replayController;
        if (modeCtrl?.directorCameraState) modeCtrl.directorCameraState.initialized = false;
      }
      hudStore.getState().setReplayState?.({ replayCameraMode: 'director' });
      globalHudTransientChannel.setRoster({ focusedSlotKey: null });
      return true;
    }

    if (cmd.kind === 'select-replay-pov') {
      port.replayPovCarIndex = cmd.targetCarIndex;
      port.releaseGoalReplayCameraOverride();
      if (activeMode && cmd.applyToActiveMode) {
        activeMode.setReplayCameraMode?.('pov');
        if (activeMode.replaySession) {
          activeMode.replaySession.replayCameraMode = 'pov';
          activeMode.replaySession.replayPovCarIndex = cmd.targetCarIndex;
        }
        activeMode._applyCameraCarIndex?.(cmd.targetCarIndex);
        useExperimentalMultiBotsStore.getState().setActiveCameraCarIndex(cmd.targetCarIndex);
      }
      port.camera?.setFocusedCarIndex?.(cmd.targetCarIndex);
      port.camera?.resetView?.();
      hudStore.getState().setReplayState?.({ replayCameraMode: 'pov' });
      globalHudTransientChannel.setRoster({ focusedSlotKey: cmd.slotKey });
      return true;
    }

    if (cmd.kind === 'select-live-spectator-pov') {
      activeMode?._applyCameraCarIndex?.(cmd.targetCarIndex);
      useExperimentalMultiBotsStore.getState().setActiveCameraCarIndex(cmd.targetCarIndex);
      globalHudTransientChannel.setRoster({ focusedSlotKey: cmd.slotKey });
      return true;
    }
    return false;
  }

  public readonly handleKeyDown = (evt: KeyboardEvent): void => {
    if (evt.defaultPrevented) return;
    const port = this.readPort();
    if (!port) return;

    const net = port.networkManager;
    const activeMode = port.modeManager?.getActiveMode?.() ?? null;
    const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
    const isOutsideEditableUI =
      !isEditableFormElement(evt.target) && !isEditableFormElement(activeEl);
    const hasNoModifier = !evt.repeat && !evt.ctrlKey && !evt.metaKey && !evt.altKey;
    const appState = useAppStore?.getState?.();
    const isMenuOpen = Boolean(appState?.isOpen);
    const hudState = hudStore.getState();

    const isGoalReplay =
      port.match?.state?.phase === 'replay' ||
      hudState.matchPhase === 'replay' ||
      Boolean(activeMode?.isReplayActive);

    const skipReplaySources = port.keyboard?.boundSources?.('skipReplay');
    const matchesSkipReplayBinding =
      Array.isArray(skipReplaySources) && skipReplaySources.length > 0
        ? Boolean(
            port.keyboard?.matches?.('skipReplay', { kind: 'key', code: evt.code }) ||
            (evt.code === 'NumpadEnter' &&
              port.keyboard?.matches?.('skipReplay', { kind: 'key', code: 'Enter' }))
          )
        : evt.code === 'Enter' || evt.code === 'NumpadEnter' || evt.key === 'Enter';

    const cmd = resolveWindowHotkeyCommand({
      code: evt.code,
      key: evt.key,
      shiftKey: evt.shiftKey,
      isOutsideEditableUI,
      hasNoModifier,
      isMenuOpen,
      isOnlineSession: Boolean(appState?.onlineSession?.roomId),
      isGoalReplay,
      isExpSpectatorLive:
        !isGoalReplay &&
        port.match?.state?.mode === 'exp-multi-bots' &&
        useExperimentalMultiBotsStore.getState().playerParticipation === 'none',
      matchesSkipReplayBinding,
      isNetworkDiagnosticsPresent: isNetworkDiagnosticsWindowPresent(),
      isReplayDirectorTunerPresent: isReplayDirectorTunerWindowPresent(),
      hasHudReplayTogglePause: typeof hudState.onReplayTogglePause === 'function',
      hasModeGoalReplayTogglePause: Boolean(
        activeMode?.goalReplayPhase === 'replaying' &&
        activeMode?.goalReplayTimelineController?.sessionState?.isActive
      ),
      hasAppStoreStateReader: typeof useAppStore?.getState === 'function',
      hasNetworkManager: Boolean(net),
    });

    if (cmd.kind === 'skip-replay') {
      evt.preventDefault();
      port._localSkipReplayReady = true;
      const reconciler = net?.sessionCoordinator.networkReconciler;
      if (reconciler) {
        reconciler.localSkipReplayReady = true;
        reconciler.controlMessenger.flushPendingControlPackets(reconciler, performance.now());
      } else if (typeof hudState.onReplaySkip === 'function') {
        hudState.onReplaySkip();
      } else {
        activeMode?.skipGoalReplay?.();
      }
    } else if (cmd.kind === 'select-camera-slot') {
      if (this.selectReplayCameraSlot(cmd.slotKey, port)) evt.preventDefault();
    } else if (cmd.kind === 'toggle-hud-replay-pause') {
      evt.preventDefault();
      hudState.onReplayTogglePause?.();
      port.isCursorBrowsing = true;
      port.domEventManager?.syncPausedAndInputState?.();
    } else if (cmd.kind === 'toggle-mode-replay-pause') {
      evt.preventDefault();
      activeMode?.goalReplayTimelineController?.togglePause();
      port.isCursorBrowsing = true;
      port.domEventManager?.syncPausedAndInputState?.();
    } else if (cmd.kind === 'toggle-burst-drop' && net) {
      evt.preventDefault();
      if (!net.sessionCoordinator.networkReconciler) {
        net.sessionCoordinator.enableNetworkPrediction(false).then(() => {
          networkDiagnosticsStore.setSession(
            net.sessionCoordinator.networkReconciler,
            net.sessionCoordinator.networkChannel,
            port
          );
          networkDiagnosticsStore.toggleBurstDrop();
        });
      } else {
        networkDiagnosticsStore.toggleBurstDrop();
      }
    } else if (cmd.kind === 'adjust-simulated-latency' && net) {
      evt.preventDefault();
      net.diagnosticsProbe.adjustSimulatedLatency(cmd.direction);
    } else if (cmd.kind === 'open-main-menu') {
      evt.preventDefault();
      port.gameUI?.openMenu('main-menu');
    }
  };
}
