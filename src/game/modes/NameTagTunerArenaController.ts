/**
 * NameTagTunerArenaController.ts
 * Self-contained domain controller managing the 6-car kickoff stadium evaluation
 * environment for the Name Tag Active Tuner.
 */

import { type NameTagCameraMode } from '../../ui-core/config/nameTagConfig.ts';
import {
  getNameTagConfig,
  setNameTagRuntimeState,
  subscribeNameTagConfig,
  useAppStore,
} from '../runtimeUiPort.ts';
import { isEditableEventTarget, subscribeGlobalKeyDown } from '../../input/hotkeyInputGuard.ts';
import {
  NEUTRAL_HOLD_CONTROLS,
  SIX_CAR_KICKOFF_PERMUTATIONS,
  applyTunerCarPovToScene,
  applyTunerFreeCamOverviewToScene,
  buildNameTagCarEntriesFromConfig,
  isEditableTunerDomTarget,
  resolveNameTagTunerHotkeyAction,
  restoreSceneFromNameTagTuner,
  spawnSixKickoffCarsInScene,
  type NameTagTunerRuntimeHost,
} from './freeplay/nameTagTunerPipeline.ts';

export type { NameTagTunerRuntimeHost };

export class NameTagTunerArenaController {
  private _sceneTarget: NameTagTunerRuntimeHost | null;
  public isActive = false;
  public permutationIndex = 0;
  public focusedCarIndex = 0;
  private _unsubConfig: (() => void) | null = null;
  private _unsubKeyDown: (() => void) | null = null;
  private _keyDownHandler: ((event: KeyboardEvent) => void) | null = null;

  constructor(sceneTarget: NameTagTunerRuntimeHost | null) {
    this._sceneTarget = sceneTarget;
  }

  public get runtime(): NameTagTunerRuntimeHost | null {
    return this._sceneTarget;
  }

  public set runtime(nextTarget: NameTagTunerRuntimeHost | null) {
    this._sceneTarget = nextTarget;
  }

  public attach(): void {
    setNameTagRuntimeState({
      onEnterTunerArena: () => {
        void this.enterTunerArena();
      },
      onExitTunerArena: () => this.exitTunerArena(),
      onReshuffleKickoffPositions: () => this.reshuffleKickoffPositions(),
      onSelectPovCar: (carIndex: number) => {
        void this.focusCarPov(carIndex);
      },
      onFocusFreeCamOverview: () => this.focusFreeCamOverview(),
    });

    if (!this._unsubConfig) {
      this._unsubConfig = subscribeNameTagConfig(() => {
        if (this.isActive) {
          this._syncCarEntriesFromConfig();
        }
      });
    }
  }

  public detach(): void {
    this._unbindPovHotkeys();
    if (this.isActive) {
      this.exitTunerArena();
    }
  }

  private _bindPovHotkeys(): void {
    this._unbindPovHotkeys();
    if (typeof window === 'undefined') return;

    this._keyDownHandler = (event: KeyboardEvent) => {
      if (!this.isActive) return;
      if (this._sceneTarget?.match?.state?.mode !== 'freeplay') return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableEventTarget(event)) return;
      const activeElement = typeof document !== 'undefined' ? document.activeElement : null;
      if (isEditableTunerDomTarget(event.target) || isEditableTunerDomTarget(activeElement)) return;

      const action = resolveNameTagTunerHotkeyAction(event.code);
      if (!action) return;

      event.preventDefault();
      event.stopPropagation();
      if (action.type === 'pov') {
        void this.focusCarPov(action.carIndex);
      } else {
        this.focusFreeCamOverview();
      }
    };

    this._unsubKeyDown = subscribeGlobalKeyDown(this._keyDownHandler, true);
  }

  private _unbindPovHotkeys(): void {
    if (this._unsubKeyDown) {
      this._unsubKeyDown();
      this._unsubKeyDown = null;
    }
    this._keyDownHandler = null;
  }

  public _syncCarEntriesFromConfig(): void {
    const config = getNameTagConfig();
    const entries = buildNameTagCarEntriesFromConfig(config);
    const boostAmounts = this._sceneTarget?.arena?.carBoostAmounts;
    if (boostAmounts) {
      for (let i = 0; i < entries.length; i++) {
        boostAmounts[i] = entries[i].boostAmount ?? 0;
      }
    }
    const cam = this._sceneTarget?.camera;
    const cameraMode: NameTagCameraMode = cam?.isFreeCam ? 'free' : cam?.currentMode || 'pov';
    setNameTagRuntimeState({
      isTunerArenaActive: this.isActive,
      kickoffPermutationIndex: this.permutationIndex,
      activeCameraMode: cameraMode,
      focusedCarIndex: this.focusedCarIndex,
      carEntries: entries,
    });
  }

  private _refreshArenaNameTags(): void {
    const scene = this._sceneTarget;
    if (scene?.arena?.nameTagSystem?.update) {
      scene.arena.nameTagSystem.update(scene.arena, 6, scene.camera?.camera);
    }
  }

  public async enterTunerArena(): Promise<void> {
    const scene = this._sceneTarget;
    if (!scene?.physics) return;

    const appState = useAppStore.getState();
    if (appState.isOpen) {
      appState.closeMenu();
    }

    const matchState = scene.match?.state;
    if (matchState && matchState.mode !== 'freeplay') {
      matchState.mode = 'freeplay';
      matchState.phase = 'playing';
      appState.setMatchMode('freeplay');
      if (scene.modeManager?.setMode) {
        scene.modeManager.setMode('freeplay');
      }
    }

    if (scene.arena?.ensureOpponent) {
      await scene.arena.ensureOpponent();
    }

    this.isActive = true;
    if (scene.keyboard) {
      scene.keyboard.ballControlEnabled = false;
    }
    this._bindPovHotkeys();
    this._spawnSixKickoffCars();
    this.focusFreeCamOverview();
  }

  public focusFreeCamOverview(): void {
    const scene = this._sceneTarget;
    if (!scene) return;
    applyTunerFreeCamOverviewToScene(scene, this.focusedCarIndex);
    this._syncCarEntriesFromConfig();
    this._refreshArenaNameTags();
  }

  public async focusCarPov(carIndex = 0): Promise<void> {
    if (!this.isActive) {
      await this.enterTunerArena();
    }
    const scene = this._sceneTarget;
    if (!scene) return;

    const targetIndex = Math.max(0, Math.min(5, Math.round(Number(carIndex) || 0)));
    this.focusedCarIndex = targetIndex;
    applyTunerCarPovToScene(scene, targetIndex);
    this._syncCarEntriesFromConfig();
    this._refreshArenaNameTags();
  }

  public reshuffleKickoffPositions(): void {
    if (!this.isActive) {
      void this.enterTunerArena();
      return;
    }
    this.permutationIndex = (this.permutationIndex + 1) % SIX_CAR_KICKOFF_PERMUTATIONS.length;
    this._spawnSixKickoffCars();
    const scene = this._sceneTarget;
    if (!scene?.camera?.isFreeCam && scene?.camera?.resetView) {
      scene.camera.resetView();
    }
    this._syncCarEntriesFromConfig();
    this._refreshArenaNameTags();
  }

  public _spawnSixKickoffCars(): void {
    spawnSixKickoffCarsInScene(this._sceneTarget, this.permutationIndex, getNameTagConfig());
  }

  public onBeforePhysicsTick(): void {
    if (!this.isActive) return;
    const scene = this._sceneTarget;
    const sim = scene?.physics;
    if (!sim || !sim.setControls) return;
    const activePlayerIndex = scene?.playerCarIndex ?? 0;
    for (let carIndex = 0; carIndex < Math.min(6, sim.numCars || 0); carIndex++) {
      if (carIndex !== activePlayerIndex) {
        sim.setControls(carIndex, NEUTRAL_HOLD_CONTROLS);
      }
    }
  }

  public exitTunerArena(): void {
    this.isActive = false;
    this.focusedCarIndex = 0;
    this._unbindPovHotkeys();
    restoreSceneFromNameTagTuner(this._sceneTarget);
    setNameTagRuntimeState({
      isTunerArenaActive: false,
      activeCameraMode: 'pov',
      focusedCarIndex: 0,
      carEntries: [],
    });
  }
}
