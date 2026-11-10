import type { ImportedDiagnosticPatternInput } from '../../../replay/ReplayDirectorStatePipeline.ts';
import type { ReplayRingBuffer } from '../../../replay/ReplayRingBuffer.ts';
import type { ReplayTimelineController } from '../../../replay/ReplayTimelineController.ts';
import type { NormalizedReplayDirectorCarEntry } from '../../../replay/replayDirectorCarRosterPipeline.ts';
import {
  getActiveReplayTimelineController,
  setActiveReplayTimelineController,
  registerReplayDirectorPreviewHandlers,
  getNameTagRuntimeState,
  useAppStore,
} from '../../runtimeUiPort.ts';
import {
  finalizeFreeplayReplaySessionCleanup,
  pauseReplayAndEnterReferenceFreeCam,
  releaseFreeplayGoalReplayOverridesOnExit,
  resolveImportedDiagnosticPatternInput,
  restoreDirectorCameraAfterReferenceFreeCam,
  syncAndAttachReplayTimelineController,
} from './directorPreviewPipeline.ts';
import {
  stepDirectorPreviewOrGoalReplayFrame,
  type DirectorPatternPreviewOptions,
  type DirectorPreviewRuntimePort,
  type DirectorPreviewStepContext,
  type ReferenceFreeCamOptions,
  type ReplayCameraMode,
} from './directorPreviewFrameStepPipeline.ts';
import {
  activateFreeplayPatternPreviewScene,
  bindFreeplayGoalReplayHudState,
  ensureFreeplayModeBeforePatternPreview,
  prepareAndLaunchFreeplayGoalReplay,
  type GoalReplayIncidentInput,
} from './freeplayGoalReplaySessionPipeline.ts';

export type {
  DirectorPatternPreviewOptions,
  DirectorPreviewRuntimePort,
  DirectorPreviewStepContext,
  GoalReplayIncidentInput,
  ReferenceFreeCamOptions,
  ReplayCameraMode,
};

export interface DirectorPreviewSubControllerDeps {
  getRuntime: () => DirectorPreviewRuntimePort | null;
  replayController: ReplayTimelineController;
  replayRingBuffer: ReplayRingBuffer;
  resolveEffectivePlayerTeam: () => number;
  isStandaloneReplayLoaded: () => boolean;
  isStandaloneReplayActive: () => boolean;
  pauseStandaloneReplay: () => void;
  isNameTagTunerActive: () => boolean;
  notifyReplaySessionCompleted: () => void;
}

export class DirectorPreviewSubController {
  private readonly deps: DirectorPreviewSubControllerDeps;
  public isReplayActive = false;
  public replayCameraMode: ReplayCameraMode = 'director';
  public goalScoringTeam = 0;
  public goalScorerCarIndex = 0;
  public goalScorerName = 'Player';
  public goalBallSpeedKph: number | null = null;
  public previewSpawnedExtraCars = false;
  private savedCar0: NormalizedReplayDirectorCarEntry | null = null;

  public readonly onImportPattern = (
    fileOrInput: unknown,
    options: DirectorPatternPreviewOptions = {}
  ): Promise<ImportedDiagnosticPatternInput | null> =>
    this.importDiagnosticPattern(fileOrInput, options);
  public readonly onStartPreview = (options: DirectorPatternPreviewOptions = {}): boolean =>
    this.startPatternPreview(null, options);
  public readonly onExitPreview = (): boolean => this.exitPatternPreview();
  public readonly onEnterReferenceFreeCam = (options: ReferenceFreeCamOptions = {}): boolean =>
    this.enterReferenceFreeCamFromHere(options);
  public readonly onExitReferenceFreeCam = (): boolean => this.exitReferenceFreeCam();
  public readonly onGetLiveCameraState = (): object | null => {
    const cam = this.deps.getRuntime()?.camera;
    return cam?.getFreeCamStateSnapshot ? cam.getFreeCamStateSnapshot() : null;
  };

  constructor(deps: DirectorPreviewSubControllerDeps) {
    this.deps = deps;
    this.goalScoringTeam = deps.resolveEffectivePlayerTeam();
    this.registerPreviewHandlers();
    if (!getActiveReplayTimelineController()) {
      setActiveReplayTimelineController(deps.replayController);
    }
  }

  public registerPreviewHandlers(): void {
    registerReplayDirectorPreviewHandlers(this as unknown as Record<string, unknown>);
  }

  public resetGoalMetadata(scoringTeam = this.deps.resolveEffectivePlayerTeam()): void {
    this.setGoalMetadata({
      scoringTeam,
      scorerCarIndex: 0,
      scorerName: 'Player',
      ballSpeedKph: null,
    });
  }

  public setGoalMetadata(meta: {
    scoringTeam: number;
    scorerCarIndex: number;
    scorerName: string;
    ballSpeedKph: number | null;
  }): void {
    this.goalScoringTeam = meta.scoringTeam;
    this.goalScorerCarIndex = meta.scorerCarIndex;
    this.goalScorerName = meta.scorerName;
    this.goalBallSpeedKph = meta.ballSpeedKph;
  }

  public onEnter(freeplayTeam: number): void {
    this.registerPreviewHandlers();
    syncAndAttachReplayTimelineController(
      this.deps.replayController,
      this.deps.getRuntime()?.physics,
      this.deps.replayRingBuffer,
      true
    );
    setActiveReplayTimelineController(this.deps.replayController);
    this.isReplayActive = false;
    this.resetGoalMetadata(freeplayTeam);
  }

  public onExit(): void {
    this.isReplayActive = false;
    releaseFreeplayGoalReplayOverridesOnExit(this.deps.getRuntime(), this.deps.replayController);
  }

  public beginGoalReplay(incident: GoalReplayIncidentInput): void {
    const scenePort = this.deps.getRuntime();
    const { replayRingBuffer, replayController } = this.deps;
    syncAndAttachReplayTimelineController(
      replayController,
      scenePort?.physics,
      replayRingBuffer,
      false
    );
    const launched = prepareAndLaunchFreeplayGoalReplay({
      scenePort,
      ringBuffer: replayRingBuffer,
      replayController,
      playerTeam: this.deps.resolveEffectivePlayerTeam(),
      isStandaloneReplayLoaded: this.deps.isStandaloneReplayLoaded(),
      explicitCarEntries: this.deps.isNameTagTunerActive()
        ? getNameTagRuntimeState()?.carEntries
        : undefined,
      incident,
    });
    if (!launched) {
      this.completeReplaySession();
      return;
    }
    this.setGoalMetadata(launched.prepared);
    this.isReplayActive = true;
    this.replayCameraMode = 'director';
    this.bindReplayHudState(launched.totalFrames);
  }

  public bindReplayHudState(totalFrames: number): void {
    bindFreeplayGoalReplayHudState({
      scenePort: this.deps.getRuntime(),
      replayController: this.deps.replayController,
      totalFrames,
      scorerName: this.goalScorerName,
      scoringTeam: this.goalScoringTeam,
      ballSpeedKph: this.goalBallSpeedKph,
      getCameraMode: () => this.replayCameraMode || 'director',
      setCameraMode: (m) => {
        this.replayCameraMode = m;
      },
      getScoringTeam: () => this.goalScoringTeam ?? 0,
      getScorerCarIndex: () => this.goalScorerCarIndex ?? 0,
    });
  }

  public async importDiagnosticPattern(
    fileOrInput: unknown,
    options: DirectorPatternPreviewOptions = {}
  ): Promise<ImportedDiagnosticPatternInput | null> {
    const parsed = await resolveImportedDiagnosticPatternInput(fileOrInput, options.fileName);
    if (!parsed) return null;
    if (options.autoStartPreview !== false) this.startPatternPreview(parsed, options);
    else this.deps.replayController.loadImportedDiagnosticPattern(parsed, options);
    return parsed;
  }

  public startPatternPreview(
    parsedPattern: ImportedDiagnosticPatternInput | null = null,
    options: DirectorPatternPreviewOptions = {}
  ): boolean {
    const scenePort = this.deps.getRuntime();
    if (!scenePort) return false;
    const { replayController, replayRingBuffer } = this.deps;

    ensureFreeplayModeBeforePatternPreview(scenePort);
    if (this.deps.isStandaloneReplayActive()) this.deps.pauseStandaloneReplay();

    syncAndAttachReplayTimelineController(
      replayController,
      scenePort.physics,
      replayRingBuffer,
      !parsedPattern
    );
    if (parsedPattern) replayController.loadImportedDiagnosticPattern(parsedPattern, options);

    const totalFrames = replayController.ActiveWindowCount;
    if (totalFrames <= 0) return false;

    const roster = activateFreeplayPatternPreviewScene({
      scenePort,
      replayController,
      savedCar0: this.savedCar0,
      fallbackScorerName: this.goalScorerName,
      startPaused: Boolean(options.startPaused),
      restart: Boolean(options.restart),
    });
    this.savedCar0 = roster.savedPrePreviewCar0;
    this.previewSpawnedExtraCars = true;
    this.setGoalMetadata({
      scoringTeam: roster.scoringTeam,
      scorerCarIndex: roster.scorerCarIndex,
      scorerName: roster.scorerName,
      ballSpeedKph: null,
    });
    this.isReplayActive = true;
    this.replayCameraMode = 'director';
    this.bindReplayHudState(totalFrames);
    return true;
  }

  public enterReferenceFreeCamFromHere(opt: ReferenceFreeCamOptions = {}): boolean {
    const scenePort = this.deps.getRuntime();
    if (!scenePort) return false;
    const { replayController } = this.deps;
    const activeCtrl = getActiveReplayTimelineController() || replayController;
    const saved = activeCtrl.sessionState?.cursorFloat ?? 0;
    let seekCursorFloat: number | null = null;
    if (!this.isReplayActive || !replayController.sessionState.isActive) {
      if (!this.startPatternPreview(null, { startPaused: true, restart: false })) return false;
      seekCursorFloat = saved;
    }
    return pauseReplayAndEnterReferenceFreeCam(scenePort, replayController, {
      seekCursorFloat,
      fov: opt.fov,
    });
  }

  public exitReferenceFreeCam(): boolean {
    return restoreDirectorCameraAfterReferenceFreeCam(
      this.deps.getRuntime(),
      this.deps.replayController,
      this.isReplayActive,
      this.goalScoringTeam,
      this.goalScorerCarIndex
    );
  }

  public exitPatternPreview(): boolean {
    if (!this.isReplayActive && !this.deps.replayController.sessionState.isActive) return false;
    if (useAppStore.getState().isFreeCam) useAppStore.getState().setFreeCam(false);
    this.completeReplaySession();
    return true;
  }

  public completeReplaySession(): void {
    const isTunerOrStandalone =
      this.deps.isNameTagTunerActive() || this.deps.isStandaloneReplayLoaded();
    const shouldRestoreSingleCar = this.previewSpawnedExtraCars && !isTunerOrStandalone;
    finalizeFreeplayReplaySessionCleanup({
      scenePort: this.deps.getRuntime(),
      replayController: this.deps.replayController,
      shouldRestoreSingleCar,
      savedCar0: this.savedCar0,
      enableBallControl: !isTunerOrStandalone,
    });
    this.isReplayActive = false;
    if (shouldRestoreSingleCar) {
      this.previewSpawnedExtraCars = false;
      this.savedCar0 = null;
    }
    this.deps.notifyReplaySessionCompleted();
  }

  public step(context: DirectorPreviewStepContext, isUnlimitedBoost: boolean): boolean {
    return stepDirectorPreviewOrGoalReplayFrame({
      scenePort: this.deps.getRuntime(),
      replayController: this.deps.replayController,
      context,
      isUnlimitedBoost,
      isReplayActive: this.isReplayActive,
      getCameraMode: () => this.replayCameraMode || 'director',
      setCameraMode: (m) => {
        this.replayCameraMode = m;
      },
      getScoringTeam: () => this.goalScoringTeam ?? 0,
      setScoringTeam: (t) => {
        this.goalScoringTeam = t;
      },
      getScorerCarIndex: () => this.goalScorerCarIndex ?? 0,
      setScorerCarIndex: (idx) => {
        this.goalScorerCarIndex = idx;
      },
      onCompleteReplaySession: () => this.completeReplaySession(),
    });
  }
}
