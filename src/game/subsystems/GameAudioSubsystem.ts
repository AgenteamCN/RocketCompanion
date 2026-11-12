import {
  RemoteEngineAudioLodController,
  type EngineSynthSlotEntry,
} from '../../audio/RemoteEngineAudioLodController.ts';
import { loadEngineAudioPackAssets } from '../../audio/EngineAudioLoopConditioner.ts';
import { getAudioContext, subsystemState, registerAudioRuntime } from '../../audio/audioContext.ts';
import { gameAudio } from '../../audio/GameAudioEngineFacade.ts';
import { isSignalAudioMutedInGoalReplay } from '../../audio/SignalAudioEngine.ts';
import { updateAudioListener } from '../../audio/SpatialAudioSource.ts';
import { yieldIdleSlice } from '../../loader/frameBudgetScheduler.ts';
import { CarStateView } from '../../physics/RocketSimStateViews.ts';
import {
  INCIDENT_EVENT_TYPES,
  DIAGNOSTIC_PROBE_SLOTS,
  isDiagnosticProbeSlot,
} from '../../physics/RocketSimConstants.ts';
import { hudStore } from '../runtimeUiPort.ts';
import type { FrameContext } from '../pipeline/FramePipeline.ts';

export type { EngineSynthSlotEntry };

/**
 * GameAudioSubsystem.ts
 * Encapsulates multi-car Turtle Modem granular powertrain synthesis (via RemoteEngineAudioLodController),
 * spatial audio bus tracking, vehicle listeners, ball acoustics, and lifecycle game sound effects.
 */
export class GameAudioSubsystem {
  public runtime: any;
  public readonly engineLodController: RemoteEngineAudioLodController;
  public lastRemainingSec = -1;
  public last10sCountdown = -1;
  public lastGoalScored = false;
  public lastOvertime = false;
  public lastCountdown = -1;
  public lastBoostPressed = false;
  public lastPhase: string | null = null;
  private readonly _lobbyCarViews: CarStateView[];
  private readonly _prevTestCarBoosting: Record<number, boolean> = { 6: false, 7: false };
  private _scratchVehiclePos: { posX: number; posY: number; posZ: number } | null = null;
  private _scratchVehicleUpdateOpts: any = null;

  constructor(runtime: any) {
    this.runtime = runtime;
    this.engineLodController = new RemoteEngineAudioLodController();
    this._lobbyCarViews = Array.from({ length: 8 }, () => new CarStateView());
    registerAudioRuntime(runtime);
  }

  public get engineSynths(): EngineSynthSlotEntry[] {
    return this.engineLodController.engineSynths;
  }

  public set engineSynths(v: EngineSynthSlotEntry[]) {
    this.engineLodController.engineSynths = v;
  }

  public async setupAudio(
    onProgress: ((loaded: number, total?: number, file?: string) => void) | null = null
  ): Promise<void> {
    const r = this.runtime;
    const ctx = getAudioContext();
    if (ctx) {
      await loadEngineAudioPackAssets(ctx, 'turtle_modem').catch((err) => {
        console.warn('[GameAudioSubsystem] Engine audio pack preload warning:', err);
      });
      await yieldIdleSlice(16);
    }
    await gameAudio.preload(onProgress as any);
    await yieldIdleSlice(16);
    await r.flipResetVisual?.preloadAudio?.();
    await yieldIdleSlice(24);
    await r.arena?.prepareAssets?.();
  }

  public resetMatchClockTracking(durationSeconds = -1): void {
    this.lastOvertime = false;
    this.lastGoalScored = false;
    this.lastCountdown = -1;
    this.last10sCountdown = -1;
    this.lastRemainingSec = durationSeconds;
  }

  public resetAudio(): void {
    const r = this.runtime;
    const activeIdx = typeof r?.playerCarIndex === 'number' ? r.playerCarIndex : 0;
    this.engineLodController.resetAll(activeIdx);
    gameAudio?.silenceAll?.();
    this.lastGoalScored = false;
    this.lastCountdown = -1;
    this.last10sCountdown = -1;
    this.lastBoostPressed = false;
  }

  public triggerGameAudioEvents(
    goalScored: boolean,
    curBoost: number,
    _isSupersonic: boolean,
    _curr?: Float32Array | null
  ): void {
    const r = this.runtime;
    const audio = r.options?.gameAudio || gameAudio;
    if (!audio) return;

    if (isSignalAudioMutedInGoalReplay(r)) {
      this.lastGoalScored = Boolean(
        goalScored || (r.match.state.mode === 'match' && r.match.state.phase === 'goal')
      );
      this.lastRemainingSec = r.match.state.remainingSeconds;
      this.lastOvertime = r.match.state.overtime;
      this.lastPhase = r.match.state.phase;
      this.lastBoostPressed = Boolean(r.playerControls && r.playerControls.boost);
      return;
    }

    const isGoalNow = Boolean(
      goalScored || (r.match.state.mode === 'match' && r.match.state.phase === 'goal')
    );
    if (
      isGoalNow &&
      !this.lastGoalScored &&
      !r.networkReconciler &&
      r.match.state.mode === 'kickoff-training'
    ) {
      audio.play('sfx_goal_poof', 1.0);
    }
    this.lastGoalScored = isGoalNow;

    if (r.networkReconciler) {
      const sigLatch = r.networkManager?.signalCoordinator?.latch;
      if (
        r.match?.state?.phase === 'kickoff' &&
        sigLatch &&
        typeof sigLatch.lastKickoffTargetFrame === 'number' &&
        sigLatch.lastKickoffTargetFrame > 0
      ) {
        const currentTick =
          r.networkReconciler.lastAckedServerTick >= 0
            ? r.networkReconciler.lastAckedServerTick
            : (r.networkReconciler.serverTick ?? 0);
        const remainingTicks = Math.max(0, sigLatch.lastKickoffTargetFrame - currentTick);
        if (remainingTicks > 0) {
          const rawSec = Math.max(1, Math.min(3, Math.ceil(remainingTicks / 120)));
          const prevSec =
            typeof r.match.state.countdown === 'number' && r.match.state.countdown >= 1
              ? r.match.state.countdown
              : 3;
          const displaySec = Math.min(prevSec, rawSec);

          if (r.match.state.countdown !== displaySec) {
            r.match.state.countdown = displaySec;
            hudStore.getState().setMatchState({
              matchPhase: 'kickoff',
              kickoffCountdown: displaySec,
            });
          }
        }

        if (
          remainingTicks <= 360 &&
          remainingTicks > 240 &&
          !sigLatch.latchedKickoffSeconds.has(3)
        ) {
          sigLatch.latchedKickoffSeconds.add(3);
          audio.play('match_countdown_321', 1.0);
        } else if (
          remainingTicks <= 240 &&
          remainingTicks > 120 &&
          !sigLatch.latchedKickoffSeconds.has(2)
        ) {
          sigLatch.latchedKickoffSeconds.add(2);
          audio.play('match_countdown_321', 1.0);
        } else if (
          remainingTicks <= 120 &&
          remainingTicks > 0 &&
          !sigLatch.latchedKickoffSeconds.has(1)
        ) {
          sigLatch.latchedKickoffSeconds.add(1);
          audio.play('match_countdown_321', 1.0);
        } else if (currentTick >= sigLatch.lastKickoffTargetFrame + 12) {
          console.warn(
            `[GameAudioSubsystem:Fallback] Authoritative KICKOFF_START signal not observed by tick ${currentTick} (target=${sigLatch.lastKickoffTargetFrame}); releasing local kickoff lock.`
          );
          r.networkReconciler.setKickoffMaskUntilTick?.(-1);
          sigLatch.lastResolvedKickoffTargetFrame = Math.max(
            typeof sigLatch.lastResolvedKickoffTargetFrame === 'number'
              ? sigLatch.lastResolvedKickoffTargetFrame
              : -1,
            sigLatch.lastKickoffTargetFrame
          );
          sigLatch.lastKickoffTargetFrame = -1;
          sigLatch.latchedKickoffSeconds.clear();
          r.match.state.phase = 'playing';
          r.match.state.countdown = 0;
          hudStore.getState().setMatchState({
            matchPhase: 'playing',
            kickoffCountdown: 0,
          });
          audio.play('match_start_go', 1.0);
        }
      }
    } else {
      this.lastRemainingSec = r.match.state.remainingSeconds;
      this.lastOvertime = r.match.state.overtime;
      this.lastPhase = r.match.state.phase;
    }

    const isBoostPressed = Boolean(r.playerControls && r.playerControls.boost);
    if (isBoostPressed && !this.lastBoostPressed && curBoost <= 0.001) {
      audio.play('sfx_error_no_boost', 0.85);
    }
    this.lastBoostPressed = isBoostPressed;
  }

  public update(context: FrameContext): void {
    const r = this.runtime;
    const {
      activeCar,
      activeCarMesh,
      numCarsInArena,
      isMatchActive,
      hasBlockingOverlay,
      continueOnBlur,
      isHidden,
      goalScored,
      curBoost,
      isSupersonic,
    } = context;

    if (!r.camera?.camera) return;

    updateAudioListener(r.camera.camera);

    const isAudibleActive =
      !hasBlockingOverlay && Boolean(isMatchActive) && (!isHidden || Boolean(continueOnBlur));

    if (gameAudio && typeof gameAudio.updateBallAudio === 'function' && r.arena?.ball) {
      if (isAudibleActive) {
        gameAudio.updateBallAudio(r.arena.ball, r.camera, r.physics);
      } else {
        gameAudio.ballEngine?.silenceAll?.();
      }
    }

    const testCarAudioEnabled = Boolean(r.networkManager?.diagnosticsProbe?.testCarAudioEnabled);
    const isLobbyDualWorld = Boolean(r.networkReconciler?.lobbyDualWorldMode);
    const lobbyState = isLobbyDualWorld ? r.networkReconciler.lobbyCurrAuthoritativeState : null;
    const lobbyNumCars = lobbyState ? Math.min(8, Math.max(0, Math.round(lobbyState[1] || 0))) : 0;
    const effectiveNumCars = Math.max(numCarsInArena, testCarAudioEnabled ? lobbyNumCars : 0);

    const resolveCarView = (i: number): CarStateView | null => {
      if (isDiagnosticProbeSlot(i) && !testCarAudioEnabled) {
        return null;
      }
      if (isLobbyDualWorld && i !== activeCar) {
        if (i >= 1 && i < 6) {
          return null;
        }
        if (lobbyState && i < lobbyNumCars) {
          const view = this._lobbyCarViews[i].attachCar(lobbyState, i);
          if (view.posZ <= -200 || view.posX < -5000 || view.isDemoed) {
            return null;
          }
          return view;
        }
        return null;
      }
      const cView = r.interpolator?.getCurrCarStateView(i) ?? null;
      if (!cView || cView.posZ <= -200 || cView.posX < -5000) {
        return null;
      }
      return cView;
    };

    if (isLobbyDualWorld && lobbyState && gameAudio) {
      for (const testIdx of DIAGNOSTIC_PROBE_SLOTS) {
        const view = testCarAudioEnabled ? resolveCarView(testIdx) : null;
        const nowBoosting = Boolean(view && view.isBoosting && !view.isDemoed);
        const wasBoosting = Boolean(this._prevTestCarBoosting[testIdx]);
        if (nowBoosting !== wasBoosting) {
          this._prevTestCarBoosting[testIdx] = nowBoosting;
          if (testCarAudioEnabled && view) {
            gameAudio.handleEvent(
              {
                type: nowBoosting
                  ? INCIDENT_EVENT_TYPES.CAR_BOOST_START
                  : INCIDENT_EVENT_TYPES.CAR_BOOST_STOP,
                carIndex: testIdx,
                carPosX: view.posX,
                carPosY: view.posY,
                carPosZ: view.posZ,
                x: view.posX,
                y: view.posY,
                z: view.posZ,
              },
              r.camera
            );
          }
        }
      }
    } else {
      for (const testIdx of DIAGNOSTIC_PROBE_SLOTS) {
        this._prevTestCarBoosting[testIdx] = false;
      }
    }

    this.engineLodController.updateFrame({
      activeCar,
      effectiveNumCars,
      isAudibleActive,
      curBoost,
      activeCarMesh,
      arenaCars: r.arena?.cars,
      playerControls: r.playerControls,
      resolveCarView,
    });

    if (subsystemState?.lastTelemetry) {
      const audioCtx = getAudioContext();
      const activeSynths = this.engineLodController.countActiveAwakeSynths();
      const t = subsystemState.lastTelemetry as Record<string, any>;
      t.updatedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      t.contextCurrentTime = audioCtx ? audioCtx.currentTime : 0;
      t.isMatchActive = Boolean(isMatchActive);
      t.hasBlockingOverlay = Boolean(hasBlockingOverlay);
      if (!Array.isArray(t.blockingOverlays)) {
        t.blockingOverlays = [];
      } else {
        t.blockingOverlays.length = 0;
      }
      if (r.openOverlays && r.openOverlays.size > 0) {
        for (const overlayName of r.openOverlays) {
          t.blockingOverlays.push(overlayName);
        }
      }
      t.continueOnBlur = Boolean(continueOnBlur);
      t.isHidden = Boolean(isHidden);
      t.isAudibleActive = Boolean(isAudibleActive);
      t.activeCar = activeCar;
      t.effectiveNumCars = effectiveNumCars;
      t.engineSynthsCount = this.engineSynths.length;
      t.activeEngineSynths = activeSynths;
    }

    if (gameAudio && typeof gameAudio.updateVehicles === 'function') {
      if (!this._scratchVehiclePos) {
        this._scratchVehiclePos = { posX: 0, posY: 0, posZ: 0 };
      }
      if (!this._scratchVehicleUpdateOpts) {
        this._scratchVehicleUpdateOpts = {
          activeCarIndex: 0,
          numCars: 0,
          getCarPos: (i: number) => {
            const cView = resolveCarView(i);
            if (
              cView &&
              Number.isFinite(cView.posX) &&
              Number.isFinite(cView.posY) &&
              Number.isFinite(cView.posZ) &&
              this._scratchVehiclePos
            ) {
              this._scratchVehiclePos.posX = cView.posX;
              this._scratchVehiclePos.posY = cView.posY;
              this._scratchVehiclePos.posZ = cView.posZ;
              return this._scratchVehiclePos;
            }
            return i === this._scratchVehicleUpdateOpts.activeCarIndex && this.runtime.arena?.car
              ? this.runtime.arena.car.position
              : this.runtime.arena?.cars?.[i]?.position;
          },
          getCarState: (i: number) => resolveCarView(i),
          isMatchActive: true,
          hasBlockingOverlay: false,
          continueOnBlur: false,
          isHidden: false,
        };
      }
      const vOpts = this._scratchVehicleUpdateOpts;
      vOpts.activeCarIndex = activeCar;
      vOpts.numCars = effectiveNumCars;
      vOpts.isMatchActive = isMatchActive;
      vOpts.hasBlockingOverlay = hasBlockingOverlay;
      vOpts.continueOnBlur = continueOnBlur;
      vOpts.isHidden = isHidden;
      gameAudio.updateVehicles(vOpts);
    }

    if (isMatchActive) {
      this.triggerGameAudioEvents(goalScored, curBoost, isSupersonic, r.interpolator?.currState);
    }
  }

  public dispose(): void {
    this.engineLodController.dispose();
  }
}
