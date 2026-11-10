import { INCIDENT_EVENT_TYPES } from '../../../physics/RocketSimConstants.ts';
import type { ReplayRingBuffer } from '../../../replay/ReplayRingBuffer.ts';
import { useStaticTrainingBallCamTunerStore } from '../../runtimeUiPort.ts';
import { setTemporaryBallOpacityOverride } from '../../../ui-core/config/ballVisualConfig.ts';
import {
  isGlobalHotkeyBlockedByUi,
  subscribeGlobalKeyDown,
} from '../../../input/hotkeyInputGuard.ts';
import {
  detectSingleCarBallTouch,
  evaluateGoalScoredFromBallView,
  stepPostGoalBallFreeze,
  type CarStateViewLike,
} from '../shared/goalAndBallTouchPipeline.ts';
import {
  canTriggerFreeplayManualBallExpire,
  computeManualBallExpireMetadata,
  extractFreeplayAcknowledgedCarControls,
  handleDisabledOrLobbyGoalLatch,
  normalizeFreeplayBallStateView,
  recordGoalScoredAndSyncHud,
  recordManualExpireAndSyncHud,
  resolveFreeplayScorerName,
  type FreeplayGoalAndTouchRuntimePort,
  type FreeplayGoalMetadataTargetPort,
} from './freeplayTouchAndGoalPipeline.ts';
import {
  applyCleanFreeplaySubsystemsReset,
  applyStandaloneViewerKickoffReset,
  resetFreeplayExtraCarsAndArenaToSingleCar,
  syncFreeplayAuthoritativeServerKickoffState,
  type CleanFreeplayResetOptions,
  type StandaloneViewerKickoffResetPort,
} from './freeplayKickoffAndArenaResetPipeline.ts';

export type { FreeplayGoalAndTouchRuntimePort, FreeplayGoalMetadataTargetPort };

export const POST_GOAL_CELEBRATION_TICKS = 150; // 1.25s @ 120Hz before Goal Replay

export interface FreeplayGoalAndTouchSubControllerDeps {
  getRuntime: () => FreeplayGoalAndTouchRuntimePort | null;
  replayRingBuffer: ReplayRingBuffer;
  directorPreview: FreeplayGoalMetadataTargetPort;
  resolveEffectivePlayerTeam: () => 0 | 1;
  isStandaloneReplayLoaded: () => boolean;
  isGoalReplayActive?: () => boolean;
  isExternalReplayOrRewinderBlocking?: () => boolean;
  isNameTagTunerActive?: () => boolean;
  onAfterFrameRecorded?: () => void;
  onBeginGoalReplay: () => void;
}

export class FreeplayGoalAndTouchSubController {
  private readonly deps: FreeplayGoalAndTouchSubControllerDeps;
  private _unsubKeyDown: (() => void) | null = null;
  public goalResetTicks = 0;
  public replayPendingType: 'goal' | 'expire' = 'goal';
  public isBallExpired = false;
  public lastKickoffStartTick = 0;
  public lastTouchTick = -1;
  public goalIncidentTick = -1;
  public frozenGoalBallState: Float32Array | null = null;
  public prevBallVelX = 0;
  public prevBallVelY = 0;
  public prevBallVelZ = 0;

  constructor(deps: FreeplayGoalAndTouchSubControllerDeps) {
    this.deps = deps;
  }

  public attach(): void {
    this.detach();
    this._unsubKeyDown = subscribeGlobalKeyDown((e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.code !== 'KeyU')
        return;
      if (
        isGlobalHotkeyBlockedByUi(e, this.deps.getRuntime(), {
          allowWhenLivePreviewCollapsed: true,
        })
      )
        return;
      if (this.triggerManualBallExpire()) e.preventDefault();
    }, false);
  }

  public detach(): void {
    if (this._unsubKeyDown) {
      this._unsubKeyDown();
      this._unsubKeyDown = null;
    }
    this.setBallExpiredOpacity(false);
  }

  public setBallExpiredOpacity(expired: boolean): void {
    if (!expired && !this.isBallExpired) return;
    this.isBallExpired = expired;
    const desiredOpacity = expired
      ? (useStaticTrainingBallCamTunerStore.getState().expiredBallOpacity ?? 0.7)
      : null;
    setTemporaryBallOpacityOverride(desiredOpacity, this.deps.getRuntime()?.arena?.ball);
  }

  public triggerManualBallExpire(): boolean {
    const scenePort = this.deps.getRuntime();
    const isBlocked = Boolean(
      (this.deps.isGoalReplayActive && this.deps.isGoalReplayActive()) ||
      (this.deps.isExternalReplayOrRewinderBlocking &&
        this.deps.isExternalReplayOrRewinderBlocking()) ||
      (this.deps.isNameTagTunerActive && this.deps.isNameTagTunerActive())
    );
    if (!canTriggerFreeplayManualBallExpire(scenePort, isBlocked, this.goalResetTicks)) {
      return false;
    }
    const sim = scenePort.physics;
    const currentTick = Math.floor(
      (sim.getHeaderView ? sim.getHeaderView()?.tickCount : undefined) ?? 0
    );
    const playerCarIndex = scenePort.playerCarIndex ?? 0;
    const playerControls = (scenePort.playerControls || scenePort.neutralControls || {}) as Record<
      string,
      unknown
    >;

    if (this.deps.replayRingBuffer.size === 0 && sim.state) {
      this.deps.replayRingBuffer.recordFrame(currentTick, sim.state, [], null, null, [
        {
          carIndex: playerCarIndex,
          controls: { ...playerControls },
        },
      ]);
    }

    const playerTeam = this.deps.resolveEffectivePlayerTeam();
    const bView = normalizeFreeplayBallStateView(
      sim.getBallStateView ? sim.getBallStateView() : null
    );
    const expireMeta = computeManualBallExpireMetadata(bView, playerTeam, playerCarIndex);

    this.goalIncidentTick = currentTick;
    this.replayPendingType = 'expire';
    this.frozenGoalBallState = null;
    this.deps.directorPreview.setGoalMetadata(expireMeta);
    if (!this.deps.isStandaloneReplayLoaded() && scenePort.arena?.setCarTeam) {
      scenePort.arena.setCarTeam(expireMeta.scorerCarIndex, playerTeam);
    }

    this.setBallExpiredOpacity(true);
    this.goalResetTicks = POST_GOAL_CELEBRATION_TICKS;
    recordManualExpireAndSyncHud({
      scenePort,
      ringBuffer: this.deps.replayRingBuffer,
      currentTick,
      playerTeam,
      scoringTeam: expireMeta.scoringTeam,
      ballSpeedKph: expireMeta.ballSpeedKph,
    });
    return true;
  }

  public getEffectiveGoalResetTicks(): number {
    if (this.goalResetTicks > 0) return this.goalResetTicks;
    const scenePort = this.deps.getRuntime();
    if (
      scenePort?.match?.state?.phase === 'goal' &&
      (scenePort.authoritativeServer || scenePort.networkReconciler)
    ) {
      return scenePort.authoritativeServer?.fallbackManager?.domain?.goalBufferTicks ?? 1;
    }
    return 0;
  }

  public resetPlayTouchAndGoalState(defaultTeam: 0 | 1): void {
    this.lastTouchTick = -1;
    this.goalIncidentTick = -1;
    this.replayPendingType = 'goal';
    this.setBallExpiredOpacity(false);
    this.deps.directorPreview.resetGoalMetadata(defaultTeam);
    this.frozenGoalBallState = null;
    this.prevBallVelX = 0;
    this.prevBallVelY = 0;
    this.prevBallVelZ = 0;
  }

  public recordIncidentEvent(
    eventTick: number,
    event: { type?: number; [k: string]: unknown }
  ): void {
    this.deps.replayRingBuffer.appendIncident(eventTick, event);
    if (event.type === INCIDENT_EVENT_TYPES.CAR_BALL_HIT || event.type === 0x01) {
      if (this.goalIncidentTick < 0 || eventTick <= this.goalIncidentTick) {
        this.lastTouchTick = Math.floor(eventTick);
      }
    }
  }

  public stepAfterPhysicsTick(): void {
    const scenePort = this.deps.getRuntime();
    const sim = scenePort?.physics;
    if (!scenePort || !sim) return;

    const currentTick = Math.floor(
      (sim.getHeaderView ? sim.getHeaderView()?.tickCount : undefined) ?? 0
    );
    const playerCarIndex = scenePort.playerCarIndex ?? 0;
    const bView = normalizeFreeplayBallStateView(
      sim.getBallStateView ? sim.getBallStateView() : null
    );
    const cv = (
      sim.getCarStateView ? sim.getCarStateView(playerCarIndex) : null
    ) as CarStateViewLike | null;

    if (this.goalResetTicks === 0 && detectSingleCarBallTouch(bView, cv, this)) {
      this.lastTouchTick = currentTick;
    }

    const acknowledgedControls = extractFreeplayAcknowledgedCarControls(
      sim,
      playerCarIndex,
      (scenePort.playerControls || scenePort.neutralControls || {}) as Record<string, unknown>
    );
    if (sim.state) {
      this.deps.replayRingBuffer.recordFrame(currentTick, sim.state, acknowledgedControls);
    }
    if (this.deps.onAfterFrameRecorded) {
      this.deps.onAfterFrameRecorded();
    }

    if (
      (scenePort.authoritativeServer || scenePort.networkReconciler) &&
      !(this.goalResetTicks > 0 && this.replayPendingType === 'expire')
    ) {
      if (sim.pollGoal) sim.pollGoal();
      return;
    }

    if (this.replayPendingType === 'goal') {
      this.frozenGoalBallState = stepPostGoalBallFreeze({
        sim,
        goalResetTicks: this.goalResetTicks,
        currentTick,
        goalIncidentTick: this.goalIncidentTick,
        frozenBallState: this.frozenGoalBallState,
      });
    } else if (this.goalResetTicks > 0 && sim.resetGoalLatch) {
      sim.resetGoalLatch();
    }

    if (this.goalResetTicks > 0) {
      this.goalResetTicks--;
      if (this.goalResetTicks <= 0) {
        this.setBallExpiredOpacity(false);
        this.deps.onBeginGoalReplay();
      }
      return;
    }

    if (handleDisabledOrLobbyGoalLatch(scenePort, sim, bView)) {
      return;
    }

    const goalEval = evaluateGoalScoredFromBallView(sim, bView);
    if (goalEval.scored && bView) {
      const playerTeam = this.deps.resolveEffectivePlayerTeam();
      const scoringTeam: 0 | 1 = bView.posY >= 0 ? 0 : 1;
      const { ballSpeedUu, ballSpeedKph } = goalEval;

      this.goalIncidentTick = currentTick;
      this.replayPendingType = 'goal';
      if (!this.deps.isStandaloneReplayLoaded() && scenePort.arena?.setCarTeam) {
        scenePort.arena.setCarTeam(playerCarIndex, playerTeam);
      }
      const scorerName = resolveFreeplayScorerName(playerCarIndex);
      this.deps.directorPreview.setGoalMetadata({
        scoringTeam,
        scorerCarIndex: playerCarIndex,
        scorerName,
        ballSpeedKph,
      });
      this.frozenGoalBallState = null;
      this.goalResetTicks = POST_GOAL_CELEBRATION_TICKS;

      recordGoalScoredAndSyncHud({
        scenePort,
        ringBuffer: this.deps.replayRingBuffer,
        currentTick,
        bView,
        playerTeam,
        scoringTeam,
        scorerCarIndex: playerCarIndex,
        scorerName,
        ballSpeedUu,
        ballSpeedKph,
      });
    }
  }

  public resetExtraCarsAndArenaToSingleCar(): void {
    resetFreeplayExtraCarsAndArenaToSingleCar(this.deps.getRuntime());
  }

  public syncAuthoritativeServerKickoffState(): void {
    syncFreeplayAuthoritativeServerKickoffState(this.deps.getRuntime());
  }

  public applyCleanFreeplayReset(options: CleanFreeplayResetOptions): void {
    applyCleanFreeplaySubsystemsReset(this.deps.getRuntime(), this.deps.directorPreview, options);
  }

  public tryApplyStandaloneViewerKickoffReset(
    standaloneReplayViewer: StandaloneViewerKickoffResetPort | null | undefined,
    onResetPresentation: () => void
  ): boolean {
    return applyStandaloneViewerKickoffReset(standaloneReplayViewer, onResetPresentation);
  }
}
