import {
  BaseGameMode,
  type GameModePhysicsEvent,
  type GameModeRuntimePort,
} from './BaseGameMode.ts';
import { isIncidentEvent } from '../../physics/RocketSimConstants.ts';
import { ReplayRingBuffer, REPLAY_BUFFER_MODES } from '../../replay/ReplayRingBuffer.ts';
import { ReplayTimelineController } from '../../replay/ReplayTimelineController.ts';
import type { ImportedDiagnosticPatternInput } from '../../replay/ReplayDirectorStatePipeline.ts';
import {
  DirectorPreviewSubController,
  type DirectorPatternPreviewOptions,
  type DirectorPreviewStepContext,
  type ReferenceFreeCamOptions,
} from './freeplay/DirectorPreviewSubController.ts';
import { FreeplayGoalAndTouchSubController } from './freeplay/FreeplayGoalAndTouchSubController.ts';
import { endGoalReplaySession } from './shared/GoalReplaySessionCoordinator.ts';
import {
  getActiveReplayTimelineController,
  setActiveReplayTimelineController,
  setNameTagRuntimeState,
  hudStore,
  useReplayToRcsImporterStore,
} from '../runtimeUiPort.ts';
import { getPreferredFreeplayTeam } from '../../ui-core/config/vehiclePresets.ts';
import { StandaloneReplayViewerController } from '../../replay/StandaloneReplayViewerController.ts';
import { RLRCReplaySessionController } from '../../replay/rlrc/runtime/RLRCReplaySessionController.ts';
import type { ReplayScoreboardRuntimePort } from '../../replay/ReplayScoreboardSynchronizer.ts';
import {
  FreeplayRewinderController,
  type FreeplayRewinderRuntimePort,
} from '../../replay/FreeplayRewinderController.ts';
import {
  retainCompletedMatchReplayAndNotify,
  type RetainedMatchReplay,
} from '../../replay/ReplayFileExporter.ts';
import {
  captureRuntimeReplayCarEntries,
  type ReplayCarEntryRuntimePort,
} from '../../replay/replayDirectorCarRosterPipeline.ts';
import {
  NameTagTunerArenaController,
  type NameTagTunerRuntimeHost,
} from './NameTagTunerArenaController.ts';
export const DEFAULT_FREEPLAY_REPLAY_DURATION_SECONDS = 60;
export type FreeplayRuntimePort = GameModeRuntimePort &
  ReplayScoreboardRuntimePort &
  FreeplayRewinderRuntimePort &
  NameTagTunerRuntimeHost;
export class FreeplayMode extends BaseGameMode<FreeplayRuntimePort> {
  public readonly replayRingBuffer: ReplayRingBuffer;
  public readonly replayController: ReplayTimelineController;
  public readonly standaloneReplayViewer: StandaloneReplayViewerController;
  public readonly rlrcReplaySession: RLRCReplaySessionController;
  public readonly rewinderController: FreeplayRewinderController;
  public readonly nameTagTunerController: NameTagTunerArenaController;
  public readonly directorPreview: DirectorPreviewSubController;
  public readonly goalAndTouch: FreeplayGoalAndTouchSubController;
  constructor(rt: FreeplayRuntimePort | null) {
    super('freeplay', rt);
    const cfgSec = Number(rt?.trainingOptions?.freeplayReplayDurationSeconds);
    const replaySec =
      Number.isFinite(cfgSec) && cfgSec >= 10 ? cfgSec : DEFAULT_FREEPLAY_REPLAY_DURATION_SECONDS;
    this.replayRingBuffer = new ReplayRingBuffer({
      mode: REPLAY_BUFFER_MODES.COUNTUP_FIFO,
      capacityTicks: Math.round(replaySec * 120),
    });
    this.replayController = new ReplayTimelineController({
      engine: rt?.physics || null,
      ringBuffer: this.replayRingBuffer,
    });
    this.standaloneReplayViewer = new StandaloneReplayViewerController(rt, this);
    this.rlrcReplaySession = new RLRCReplaySessionController(rt, this);
    this.rewinderController = new FreeplayRewinderController(rt, this);
    this.nameTagTunerController = new NameTagTunerArenaController(rt);
    this.directorPreview = new DirectorPreviewSubController({
      getRuntime: () => this.runtime,
      replayController: this.replayController,
      replayRingBuffer: this.replayRingBuffer,
      resolveEffectivePlayerTeam: () => this._resolveEffectivePlayerTeam(),
      isStandaloneReplayLoaded: () => this._hasExtReplay(),
      isStandaloneReplayActive: () => this._isExtReplayActive(),
      pauseStandaloneReplay: () => {
        this.standaloneReplayViewer?.pausePlaying?.();
        this.rlrcReplaySession?.pausePlaying?.();
      },
      isNameTagTunerActive: () => Boolean(this.nameTagTunerController?.isActive),
      notifyReplaySessionCompleted: () => {
        this.goalAndTouch.goalResetTicks = 0;
        this.onResetKickoff();
      },
    });
    this.goalAndTouch = new FreeplayGoalAndTouchSubController({
      getRuntime: () => this.runtime,
      replayRingBuffer: this.replayRingBuffer,
      directorPreview: this.directorPreview,
      resolveEffectivePlayerTeam: () => this._resolveEffectivePlayerTeam(),
      isStandaloneReplayLoaded: () => this._hasExtReplay(),
      isGoalReplayActive: () => this.isGoalReplayActive(),
      isExternalReplayOrRewinderBlocking: () =>
        Boolean(this._isExtReplayActive() || this.rewinderController?.isBlockingLivePhysics),
      isNameTagTunerActive: () => Boolean(this.nameTagTunerController?.isActive),
      onAfterFrameRecorded: () => this.rewinderController?.onAfterPhysicsTick?.(),
      onBeginGoalReplay: () => this._beginGoalReplay(),
    });
    for (const c of this._subControllers()) c.attach();
    this.goalAndTouch.goalResetTicks = this.goalAndTouch.lastKickoffStartTick = 0;
    this._resetPlayTouchAndGoalState();
    if (!getActiveReplayTimelineController())
      setActiveReplayTimelineController(this.replayController);
  }
  private _subControllers() {
    return [
      this.standaloneReplayViewer,
      this.rlrcReplaySession,
      this.rewinderController,
      this.nameTagTunerController,
      this.goalAndTouch,
    ] as const;
  }
  private _hasExtReplay = (): boolean =>
    Boolean(
      this.standaloneReplayViewer?.hasLoadedReplay || this.rlrcReplaySession?.hasLoadedReplay
    );
  private _isExtReplayActive = (): boolean =>
    Boolean(this.standaloneReplayViewer?.isActive || this.rlrcReplaySession?.isActive);
  public isGoalReplayActive(): boolean {
    const r = this.runtime;
    return Boolean(
      this.directorPreview?.isReplayActive ||
      (r?.match?.state?.phase === 'replay' &&
        r?.networkReconciler &&
        this.replayController?.sessionState?.isActive)
    );
  }
  public setReplayCameraMode(val: string): void {
    const next = val === 'pov' ? 'pov' : 'director',
      r = this.runtime;
    if (this.directorPreview) this.directorPreview.replayCameraMode = next;
    if (r?.match?.state?.phase === 'replay' && r?.networkReconciler) {
      r.replayPovCarIndex =
        next === 'pov'
          ? typeof r.replayPovCarIndex === 'number' && r.replayPovCarIndex >= 0
            ? r.replayPovCarIndex
            : (this.directorPreview?.goalScorerCarIndex ?? 0)
          : null;
    }
  }
  private _resolveEffectivePlayerTeam(): 0 | 1 {
    if (this.standaloneReplayViewer?.hasLoadedReplay)
      return this.standaloneReplayViewer.rosterSubController.activePovTeam === 1 ? 1 : 0;
    if (this.rlrcReplaySession?.hasLoadedReplay) {
      const pov = this.rlrcReplaySession.activePovSlotIndex;
      return this.rlrcReplaySession.session?.roster.find((r) => r.slotIndex === pov)?.team === 1
        ? 1
        : 0;
    }
    return getPreferredFreeplayTeam();
  }
  private _syncPlayerPreferredFreeplayTeam(
    opts: { resetPlayerCarIndex?: boolean; restoreLoadout?: boolean } = {}
  ): 0 | 1 {
    const team = getPreferredFreeplayTeam();
    if (!this._hasExtReplay()) this.syncPlayerTeamAndFreeplayLoadout(team, opts);
    return team;
  }
  public _resetPlayTouchAndGoalState = (): void => {
    this.goalAndTouch?.resetPlayTouchAndGoalState(this._resolveEffectivePlayerTeam());
  };
  public override onEnter(): void {
    const r = this.runtime,
      ext = this._hasExtReplay();
    const team = this._syncPlayerPreferredFreeplayTeam({
      restoreLoadout: Boolean(!ext && !r?.arena?.isLobbyMode && r?.match?.state?.phase !== 'lobby'),
    });
    if (r?.keyboard) r.keyboard.ballControlEnabled = !ext;
    for (const c of [
      this.standaloneReplayViewer,
      this.rlrcReplaySession,
      this.rewinderController,
    ]) {
      c.runtime = r;
      c.mode = this;
    }
    this.nameTagTunerController.runtime = r;
    for (const c of this._subControllers()) c.attach();
    this.directorPreview.onEnter(team);
    this.goalAndTouch.goalResetTicks = 0;
    this.replayRingBuffer?.clear?.();
    this._resetPlayTouchAndGoalState();
    this.goalAndTouch.lastKickoffStartTick = Math.floor(
      r?.physics?.getHeaderView?.()?.tickCount ?? 0
    );
    this._syncPlayingHud(
      r?.arena?.isLobbyMode || r?.match?.state?.phase === 'lobby' ? 'lobby' : 'playing',
      team
    );
  }
  public override onLeave(): void {
    if (this.runtime?.keyboard) this.runtime.keyboard.ballControlEnabled = false;
    for (const c of this._subControllers()) c.detach();
    this.directorPreview.onExit();
    this.replayRingBuffer?.clear?.();
    this.goalAndTouch.goalResetTicks = 0;
  }
  public override onPhysicsEvent(ev: GameModePhysicsEvent | null | undefined): void {
    if (
      !ev ||
      !isIncidentEvent(ev.type ?? -1) ||
      this.isGoalReplayActive() ||
      this._isExtReplayActive() ||
      this.rewinderController?.isBlockingLivePhysics
    )
      return;
    const cur = Math.floor(this.runtime?.physics?.getHeaderView?.()?.tickCount ?? 0);
    const evTick =
      this.rlrcReplaySession?.isIntervening && cur > 0
        ? cur
        : typeof ev.tick === 'number' && ev.tick > 0
          ? ev.tick
          : cur;
    this.goalAndTouch.recordIncidentEvent(evTick, ev);
    this.rewinderController?.onPhysicsEvent?.(ev);
  }
  public override onBeforePhysicsTick(): boolean {
    this.nameTagTunerController?.onBeforePhysicsTick?.();
    if (this.rewinderController && !this.rewinderController.onBeforePhysicsTick()) return false;
    if (this.isGoalReplayActive()) return false;
    const rlrc = this.rlrcReplaySession;
    if (this.standaloneReplayViewer?.isActive && rlrc?.isActive && !rlrc.isIntervening) {
      rlrc.deactivateMode();
      useReplayToRcsImporterStore.getState().updateLiveTelemetry({
        isWindowOpen: false,
        hasHotkeyPriority: false,
        viewerState: 'idle',
      });
    }
    if (this.standaloneReplayViewer && !this.standaloneReplayViewer.onBeforePhysicsTick())
      return false;
    return !rlrc || rlrc.onBeforePhysicsTick();
  }
  public override onAfterPhysicsTick(): void {
    if (
      !this.runtime?.physics ||
      this.isGoalReplayActive() ||
      this._isExtReplayActive() ||
      this.rewinderController?.isBlockingLivePhysics
    )
      return;
    this.rlrcReplaySession?.onAfterPhysicsTick?.();
    this.goalAndTouch.stepAfterPhysicsTick();
  }
  private _beginGoalReplay(): void {
    const g = this.goalAndTouch,
      d = this.directorPreview;
    d.beginGoalReplay({
      goalIncidentTick: g.goalIncidentTick,
      lastTouchTick: g.lastTouchTick,
      lastKickoffStartTick: g.lastKickoffStartTick,
      scoringTeam: d.goalScoringTeam,
      scorerCarIndex: d.goalScorerCarIndex,
      scorerName: d.goalScorerName,
      ballSpeedKph: d.goalBallSpeedKph,
      replayType: g.replayPendingType,
    });
  }
  public override expireBall = (): boolean => this.goalAndTouch.triggerManualBallExpire();
  public _bindReplayHudState = (n: number): void => this.directorPreview.bindReplayHudState(n);
  public override importDirectorDiagnosticPattern = (
    f: unknown,
    o: DirectorPatternPreviewOptions = {}
  ): Promise<ImportedDiagnosticPatternInput | null> =>
    this.directorPreview.importDiagnosticPattern(f, o);
  public override startDirectorPatternPreview = (
    p: ImportedDiagnosticPatternInput | null = null,
    o: DirectorPatternPreviewOptions = {}
  ): boolean => this.directorPreview.startPatternPreview(p, o);
  public override enterDirectorReferenceFreeCamFromHere = (
    o: ReferenceFreeCamOptions = {}
  ): boolean => this.directorPreview.enterReferenceFreeCamFromHere(o);
  public override exitDirectorReferenceFreeCam = (): boolean =>
    this.directorPreview.exitReferenceFreeCam();
  public override exitDirectorPatternPreview = (): boolean =>
    this.directorPreview.exitPatternPreview();
  public override skipGoalReplay(): void {
    if (!this.isGoalReplayActive() && this.goalAndTouch.getEffectiveGoalResetTicks() <= 0) return;
    if (this.runtime?.networkReconciler && !this.directorPreview.isReplayActive) {
      this.runtime.networkManager?.voteSkipReplay?.();
      this.onResetKickoff();
      return;
    }
    this.goalAndTouch.goalResetTicks = 0;
    this.directorPreview.completeReplaySession();
  }
  public override exportRecentHighlightReplay(
    dur = DEFAULT_FREEPLAY_REPLAY_DURATION_SECONDS,
    quiet = false
  ): RetainedMatchReplay | null {
    const slots = this.replayRingBuffer
      .getRecentFrames(Math.max(120, Math.round(dur * 120)))
      .filter((s): s is NonNullable<typeof s> => Boolean(s?.snapshot));
    if (!slots.length) return null;
    const roster = captureRuntimeReplayCarEntries(
      this.runtime as unknown as ReplayCarEntryRuntimePort,
      {
        frameBuffer: slots[0].snapshot,
        defaultTeam: this._resolveEffectivePlayerTeam(),
      }
    );
    return retainCompletedMatchReplayAndNotify({
      frames: slots,
      mode: 'freeplay_highlight',
      gameMode: 'freeplay',
      durationSeconds: Number((slots.length / 120).toFixed(2)),
      roster,
      suppressNotification: quiet,
    });
  }
  public override getCarControls(carIdx: number): Record<string, unknown> | null {
    const rlrc = this.rlrcReplaySession;
    if (rlrc?.isActive && !rlrc.isIntervening && rlrc.session) {
      const cars = rlrc.session.frames120Hz[rlrc.cursorFrame120Hz]?.cars;
      const cf =
        (carIdx >= 0 && cars?.[carIdx]?.slotIndex === carIdx
          ? cars[carIdx]
          : cars?.find((c) => c.slotIndex === carIdx)) || null;
      if (cf?.controls) return cf.controls as unknown as Record<string, unknown>;
    }
    return null;
  }
  public override update(ctx: DirectorPreviewStepContext): void {
    const r = this.runtime,
      carIdx = ctx.activeCar ?? r?.playerCarIndex ?? 0;
    const isUnlim =
      this._isExtReplayActive() ||
      this.rlrcReplaySession?.isIntervening ||
      this.rewinderController?.isBlockingLivePhysics
        ? false
        : (r?.physics?.getCarUnlimitedBoost?.(carIdx) ??
          Boolean(r?.physics?.isUnlimitedBoost ?? r?.trainingOptions?.boostOption === 'unlimited'));
    if (this.directorPreview.step(ctx, isUnlim)) return;
    if (ctx.playerCarView)
      hudStore
        .getState()
        .setBoost(ctx.playerCarView.boost, Boolean(ctx.playerCarView.isBoosting), isUnlim);
  }
  public override resetToCleanFreeplay(): void {
    const r = this.runtime;
    this.id = 'freeplay';
    if (this.rlrcReplaySession?.hasLoadedReplay || this.rlrcReplaySession?.isActive)
      this.rlrcReplaySession.clearReplay();
    this.goalAndTouch.applyCleanFreeplayReset({
      standaloneReplayViewer: this.standaloneReplayViewer,
      isGoalReplayActive: this.isGoalReplayActive(),
      replayController: this.replayController,
      nameTagTunerController: this.nameTagTunerController,
      rewinderController: this.rewinderController,
    });
    setNameTagRuntimeState({ isMultiplayerOrMultiCarMode: false, carEntries: [] });
    if (r) {
      endGoalReplaySession(r, null, { resetHudFlags: false });
      const pref = getPreferredFreeplayTeam();
      const team =
        this.syncPlayerTeamAndFreeplayLoadout(pref, {
          resetPlayerCarIndex: true,
          restoreLoadout: true,
        }) ?? pref;
      hudStore.getState().setMatchState({ localTeam: team });
      if (r.keyboard) r.keyboard.ballControlEnabled = true;
    }
  }
  private _syncPlayingHud(phase: 'playing' | 'lobby', localTeam?: 0 | 1): void {
    if (this.runtime?.match?.state) this.runtime.match.state.phase = phase;
    hudStore.getState().setMatchState({
      matchPhase: phase,
      ...(localTeam !== undefined ? { localTeam } : {}),
      replayScorerName: null,
      replayScorerTeam: null,
      replayBallSpeedKph: null,
      replayAssistName: null,
    });
  }
  public override onResetKickoff(seed: number = -1): void {
    const r = this.runtime;
    if (this.directorPreview?.isReplayActive) this.directorPreview.onExit();
    if (r?.networkReconciler?.replayPlaybackMode || this.replayController?.sessionState?.isActive) {
      r?.networkReconciler?.setReplayPlaybackMode?.(false);
      endGoalReplaySession(r, this.replayController, { clearHud: false });
    }
    this.rewinderController?.onResetKickoff?.();
    this.goalAndTouch.goalResetTicks = 0;
    this._resetPlayTouchAndGoalState();
    if (this.rlrcReplaySession?.hasLoadedReplay) {
      if (this.rlrcReplaySession.isIntervening || !this.rlrcReplaySession.isActive) {
        this.rlrcReplaySession.resumeFromCursor();
      } else {
        this.rlrcReplaySession.seekFrame(this.rlrcReplaySession.cursorFrame120Hz);
      }
      this.resetKickoffPresentationAndAudio({ resetCamera: true, resetBots: false });
      this._syncPlayingHud('playing');
      return;
    }
    if (
      this.goalAndTouch.tryApplyStandaloneViewerKickoffReset(this.standaloneReplayViewer, () =>
        this.resetKickoffPresentationAndAudio({ resetCamera: true, resetBots: false })
      )
    ) {
      this._syncPlayingHud('playing');
      return;
    }
    const team = this._syncPlayerPreferredFreeplayTeam();
    r?.physics?.setUnlimitedBoost?.(r?.trainingOptions?.boostOption === 'unlimited');
    r?.inputPoller?.latchJumpSuppression?.();
    if (r) {
      if (r.neutralControls) r.playerControls = { ...r.neutralControls };
      r.playerThrottle = 0;
    }
    if (this.nameTagTunerController?.isActive) {
      this.nameTagTunerController._spawnSixKickoffCars();
      this.nameTagTunerController._syncCarEntriesFromConfig();
    } else r?.physics?.resetKickoff?.(seed);
    this.goalAndTouch.syncAuthoritativeServerKickoffState();
    this.resetKickoffPresentationAndAudio({
      resetCamera: !this.nameTagTunerController?.isActive || !r?.camera?.isFreeCam,
      resetBots: false,
    });
    this.goalAndTouch.lastKickoffStartTick = Math.floor(
      r?.physics?.getHeaderView?.()?.tickCount ?? 0
    );
    this._syncPlayingHud('playing', team);
  }
}
