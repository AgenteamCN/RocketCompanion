import {
  useAppStore,
  useStaticTrainingPackStore,
  getActiveEditItemVariable,
  hudStore,
} from '../../runtimeUiPort.ts';
import { getPreferredFreeplayTeam } from '../../../ui-core/config/vehiclePresets.ts';
import type { GameModeRuntimePort } from '../BaseGameMode.ts';
import type { FrameContext } from '../../pipeline/FramePipeline.ts';
import type { StaticTrainingEditorCameraPort, StaticTrainingShotConfig } from './ShotGizmoMath.ts';
import type { StaticTrainingArenaController } from './StaticTrainingArenaController.ts';
import type { StaticTrainingShotEditor } from './StaticTrainingShotEditor.ts';
import type { StaticTrainingVisuals } from './StaticTrainingVisuals.ts';
import { applyTrainingVariationsToShot } from './staticTrainingVariationMath.ts';

export const DEFAULT_VARIATION_TOGGLES = {
  enableCustomVariationOverride: false,
  moreBoostAmount: 0,
  disableBallVariance: false,
  disableVehicleVariance: false,
  disableAllRandomAngularVelocity: false,
  disableRLRCSPackAngularVelocity: true,
  enableFToMirror: true,
};

export const DEFAULT_CUSTOM_VARIATION = {
  ballSpeedModifierPct: [0, 0] as [number, number],
  ballLocationModifierXY: [0, 0] as [number, number],
  ballHeightModifierZ: [0, 0] as [number, number],
  ballRotationModifierDeg: [0, 0] as [number, number],
  ballSpinModifier: [0, 0] as [number, number],
  vehicleSpeedRange: null,
  vehicleLocationModifier: [0, 0] as [number, number],
  vehicleRotationModifierDeg: [0, 0] as [number, number],
  boostLimitOverride: null,
  forceSpawnVehicleOnGround: false,
  forceUnlimitedBoost: false,
};

export function teardownRuntimeNetworkForStaticTraining(runtime: GameModeRuntimePort | null): void {
  if (runtime?.serverHost) {
    (runtime.serverHost as { stop?: () => void }).stop?.();
    runtime.serverHost = null;
  }
  if (runtime?.reconciler) {
    (runtime.reconciler as { dispose?: () => void }).dispose?.();
    runtime.reconciler = null;
  }
}

export function initStaticTrainingStoreAndReload(onReload: () => void): void {
  const store = useStaticTrainingPackStore.getState();
  if (!store.isInitialized) {
    void store.initStore().then(() => {
      onReload();
    });
  } else {
    onReload();
  }
}

export function resolveActiveStaticTrainingShot(): StaticTrainingShotConfig | null {
  const store = useStaticTrainingPackStore.getState();
  if (store.sessionMode === 'edit' && store.isEditingItem) {
    const editVar = getActiveEditItemVariable();
    if (editVar) return editVar;
  }
  const items = store.activePack?.items;
  if (!Array.isArray(items) || items.length === 0) return null;
  const idx = Math.max(0, Math.min(items.length - 1, store.currentShotIndex));
  return items[idx] || items[0] || null;
}

export function buildEffectiveStaticTrainingShot(
  shot: StaticTrainingShotConfig,
  isPlayableSession: boolean
): StaticTrainingShotConfig {
  const store = useStaticTrainingPackStore.getState();
  const preferredTeam = getPreferredFreeplayTeam();
  const enableFToMirror =
    store.variationToggles?.enableFToMirror !== false &&
    useAppStore.getState().gameplay?.enableFToMirror !== false;
  const activeMeta = store.activePack?.metadata;
  return applyTrainingVariationsToShot({
    shot,
    toggles: store.variationToggles || DEFAULT_VARIATION_TOGGLES,
    customVariation: store.customVariation || DEFAULT_CUSTOM_VARIATION,
    recommendedVariation: activeMeta?.recommendedVariation,
    sourcePackType: activeMeta?.sourcePackType,
    isPlayOrTestSession: isPlayableSession,
    invertForOrangeTeam: preferredTeam === 1,
    mirrorHorizontal: Boolean(store.isShotMirrored) && enableFToMirror,
  });
}

export function resetStaticTrainingHudToPlaying(matchState?: { phase?: string } | null): void {
  if (matchState) matchState.phase = 'playing';
  hudStore.getState().setReplayState({ replayPaused: false, replayPersistent: false });
  hudStore.getState().setMatchState({
    matchPhase: 'playing',
    kickoffCountdown: 0,
    replayScorerName: null,
    replayScorerTeam: null,
    replayBallSpeedKph: null,
    replayAssistName: null,
  });
}

export function syncReloadedShotLiveTelemetry(
  timeoutSec: number,
  isPlayableSession: boolean
): void {
  const store = useStaticTrainingPackStore.getState();
  store.updateLiveTelemetry({
    remainingTimeoutSec: timeoutSec,
    activeCountdownSec: isPlayableSession && store.downCounterEnabled ? store.downCounterValue : 0,
    isShotLaunched: false,
    isOvertimeWaitGround: false,
    isReplayActive: false,
    replayType: null,
  });
}

export function stepStaticTrainingNonReplayFrame(params: {
  context: FrameContext;
  dt: number;
  isTestingSingleShot: boolean;
  isFreeCamTrajectoryTesting: boolean;
  playPhase: string;
  arenaController: StaticTrainingArenaController;
  editor: StaticTrainingShotEditor;
  camera: StaticTrainingEditorCameraPort | null | undefined;
  visuals: StaticTrainingVisuals | null;
}): void {
  const {
    context,
    dt,
    isTestingSingleShot,
    isFreeCamTrajectoryTesting,
    playPhase,
    arenaController,
    editor,
    camera,
    visuals,
  } = params;
  const store = useStaticTrainingPackStore.getState();
  const hudContext = context as { overrideCarSpeed?: number; isSupersonic?: boolean };

  if (store.sessionMode === 'edit' && !isTestingSingleShot) {
    editor.updateCameraAndContinuousInputs(dt, camera);
    const shot = resolveActiveStaticTrainingShot();
    if (!isFreeCamTrajectoryTesting) {
      arenaController.applyPreLaunchCarHudOverride(hudContext, shot, dt, true);
    }
    if (visuals && shot) visuals.update(shot, store.editSubMode, false);
    return;
  }

  const isPreLaunch = playPhase === 'countdown' || playPhase === 'waiting-input';
  if (isPreLaunch) {
    arenaController.applyPreLaunchCarHudOverride(hudContext, arenaController.stagedShot, dt, false);
  }

  if (visuals && arenaController.stagedShot) {
    if (isPreLaunch) visuals.update(arenaController.stagedShot, 'play', true);
    else visuals.setVisible(false);
  }

  const { playerCarView } = context;
  if (playerCarView) {
    hudStore
      .getState()
      .setBoost(
        playerCarView.boost,
        Boolean(playerCarView.isBoosting),
        Boolean(arenaController.stagedShot?.car?.unlimitedBoost)
      );
  }
}
