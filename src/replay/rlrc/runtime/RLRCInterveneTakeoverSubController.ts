/**
 * RLRCInterveneTakeoverSubController.ts
 * Continuous takeover sub-controller for 120Hz RLRC replays:
 * - Injects 480 frames (4s @ 120Hz) of pre-roll history into ReplayRingBuffer
 * - Hot-swaps POV slot to user's garage preset & runs [t0-3s, t0] countdown
 * - Drives 4 non-POV modes: 'disappear' | 'no-input' | 'follow-state' | 'bot-takeover'
 */

import { SYSTEM_CONTROL_SIGNALS } from '../../../physics/RocketSimConstants.ts';
import {
  RLRC_FIXED_DT,
  RLRC_MAX_PLAYER_SLOTS,
  type RLRCFrame120Hz,
  type RLRCInterveneLaunchConfig,
  type RLRCNonPovInterventionMode,
  type RLRCSessionPhase,
  type RLRCSynthesizedCarControls,
  type RLRCTeamIndex,
} from '../RLRCReplayTypes.ts';
import { DEFAULT_NEUTRAL_CAR_CONTROLS } from './RLRCInterveneFrameStateBuilder.ts';
import {
  applyNonPovModeChangeToRuntime,
  finalizeInterveneStepAfterPhysics,
  prepareInterveneStepBeforePhysics,
  restorePovVehicleOnExitIntervene,
} from './RLRCInterveneNonPovSyncPipeline.ts';
import {
  buildInterveneLaunchConfig,
  computeNextPrerollCountdownTick,
  computeRLRCPrerollCountdownBounds,
  injectPrerollHistoryIntoRingBuffer,
  syncGoalAndTouchTrackerAtTakeover,
  type RLRCPrerollInjectionResult,
} from './RLRCIntervenePrerollHistoryInjector.ts';
import {
  applyPrerollFrameToRuntimeState,
  type RLRCInterveneEnvironmentPort,
} from './RLRCInterveneTargetFrameApplier.ts';

export type * from './RLRCInterveneFrameStateBuilder.ts';
export type * from './RLRCInterveneNonPovSyncPipeline.ts';
export type * from './RLRCIntervenePrerollHistoryInjector.ts';

export interface RLRCInterveneStepResult {
  readonly phase: RLRCSessionPhase;
  readonly physicsStepped: boolean;
  readonly currentTick: number;
  readonly countdownRemainingSeconds: number;
  readonly postTakeoverFrameOffset: number;
}

export class RLRCInterveneTakeoverSubController {
  public phase: RLRCSessionPhase = 'viewing';
  public targetFrame120Hz = 0;
  public prerollStartFrame120Hz = 0;
  public prerollCursorFrame120Hz = 0;
  public povSlotIndex = 0;
  public nonPovMode: RLRCNonPovInterventionMode = 'follow-state';
  public downCounterSeconds: 0 | 1 | 2 | 3 = 0;
  public countdownRemainingTicks = 0;
  public countdownRemainingSeconds = 0;
  public prerollInjection: RLRCPrerollInjectionResult | null = null;
  public liveInterventionTick = 1;
  public postTakeoverFrameOffset = 0;
  public lastLaunchConfig: RLRCInterveneLaunchConfig | null = null;

  private readonly env: RLRCInterveneEnvironmentPort;
  private lastBeepSecond = -1;
  private readonly slotActive = new Uint8Array(RLRC_MAX_PLAYER_SLOTS);
  private readonly latestControls = new Map<number, RLRCSynthesizedCarControls>();
  private prevStepState: Float32Array | null = null;

  public get _povSlot(): number {
    return this.povSlotIndex;
  }

  public set _povSlot(slot: number) {
    this.povSlotIndex = slot;
  }

  constructor(env: RLRCInterveneEnvironmentPort) {
    this.env = env;
  }

  public enterInterveneAtFrame(
    t0FrameIndex: number,
    overrides?: Partial<RLRCInterveneLaunchConfig>
  ): RLRCInterveneLaunchConfig | null {
    const frames = this.env.getFrames120Hz();
    if (!frames || frames.length === 0) return null;

    const bounds = computeRLRCPrerollCountdownBounds(
      frames.length,
      t0FrameIndex,
      overrides?.downCounterSeconds ?? this.downCounterSeconds
    );
    const clampedT0 = bounds.targetFrame120Hz;
    const targetFrame = frames[clampedT0];
    if (!targetFrame) return null;

    const roster = this.env.getRoster();
    const slot = overrides?.povSlotIndex ?? this.povSlotIndex;
    const team: RLRCTeamIndex =
      roster.find((r) => r.slotIndex === slot)?.team ?? (slot < 3 ? 0 : 1);
    const cfg = buildInterveneLaunchConfig({
      targetFrame,
      targetFrame120Hz: clampedT0,
      roster,
      currentPovSlotIndex: this.povSlotIndex,
      currentNonPovMode: this.nonPovMode,
      downCounterSeconds: bounds.countdownSeconds,
      userLoadoutPreset: this.env.getUserLoadoutPreset?.(team),
      overrides,
    });

    this.targetFrame120Hz = clampedT0;
    this.prerollStartFrame120Hz = bounds.prerollStartFrame120Hz;
    this.prerollCursorFrame120Hz = bounds.prerollStartFrame120Hz;
    this.povSlotIndex = cfg.povSlotIndex;
    this.nonPovMode = cfg.nonPovMode;
    this.downCounterSeconds = cfg.downCounterSeconds;
    this.lastLaunchConfig = cfg;
    this.postTakeoverFrameOffset = 0;

    this.prerollInjection = injectPrerollHistoryIntoRingBuffer({
      frames120Hz: frames,
      bookmarks: this.env.getBookmarks?.(),
      targetFrame120Hz: clampedT0,
      maxPrerollFrames: cfg.prerollHistoryFrames,
      povOverride: { povSlotIndex: cfg.povSlotIndex, playerHitboxId: cfg.playerHitboxId },
      ringBuffer: this.env.getRingBuffer?.(),
      goalAndTouch: this.env.getGoalAndTouch?.(),
    });
    this.liveInterventionTick = this.prerollInjection.nextLiveTick;

    const sec = cfg.downCounterSeconds;
    if (sec > 0) {
      this.phase = 'preroll-countdown';
      this.countdownRemainingTicks = Math.max(1, clampedT0 - bounds.prerollStartFrame120Hz);
      this.countdownRemainingSeconds = sec;
      this.lastBeepSecond = sec;
      this.applyPrerollFrame(frames[bounds.prerollStartFrame120Hz] ?? targetFrame, cfg, true);
      this.env.playSound?.('training_countdown', 1.0, 150);
      this.env.emitSystemSignal?.(
        SYSTEM_CONTROL_SIGNALS.SYS_CTRL_INTERVENE_WILL_RESUME,
        this.prerollInjection.finalPrerollTick,
        sec
      );
      this.env.onPhaseChanged?.('preroll-countdown', sec);
    } else {
      this.applyPrerollFrame(targetFrame, cfg, true);
      this.launchShotNow();
    }
    return cfg;
  }

  public reinterveneAtLastTargetFrame(
    overrides?: Partial<RLRCInterveneLaunchConfig>
  ): RLRCInterveneLaunchConfig | null {
    return this.enterInterveneAtFrame(this.targetFrame120Hz, {
      ...this.lastLaunchConfig,
      ...overrides,
    });
  }

  public launchShotNow(): void {
    const targetFrame = this.env.getFrames120Hz()[this.targetFrame120Hz];
    if (!targetFrame || !this.lastLaunchConfig) return;

    this.countdownRemainingTicks = 0;
    this.countdownRemainingSeconds = 0;
    this.lastBeepSecond = -1;
    this.postTakeoverFrameOffset = 0;
    this.prerollCursorFrame120Hz = this.targetFrame120Hz;
    this.phase = 'intervening';

    this.applyPrerollFrame(targetFrame, this.lastLaunchConfig, false);
    const sim = this.env.getPhysics();
    sim?.clearEvents?.();
    sim?.resetGoalLatch?.();
    syncGoalAndTouchTrackerAtTakeover(
      this.env.getGoalAndTouch?.(),
      targetFrame,
      this.prerollInjection?.baseTick ?? 1,
      this.prerollInjection?.latestTouchTick ?? 1
    );
    if (this.nonPovMode === 'bot-takeover') this.env.getBotPort?.()?.resetAllBots?.();

    this.env.playSound?.('match_start_go', 1.0, 150);
    this.env.emitSystemSignal?.(
      SYSTEM_CONTROL_SIGNALS.SYS_CTRL_PHYSICS_RESUME,
      this.liveInterventionTick,
      1
    );
    this.env.onPhaseChanged?.('intervening', 0);
  }

  public stepBeforePhysicsTick(
    playerControls: RLRCSynthesizedCarControls = DEFAULT_NEUTRAL_CAR_CONTROLS,
    dt = RLRC_FIXED_DT
  ): boolean {
    if (this.phase === 'preroll-countdown') {
      this.stepPrerollCountdownTick(dt);
      return false;
    }
    const sim = this.phase === 'intervening' ? this.env.getPhysics() : null;
    if (!sim) return false;

    this.prevStepState = prepareInterveneStepBeforePhysics({
      env: this.env,
      sim,
      followIdx: this.targetFrame120Hz + this.postTakeoverFrameOffset,
      povSlotIndex: this._povSlot,
      nonPovMode: this.nonPovMode,
      playerControls,
      dt,
      slotActiveTracker: this.slotActive,
      latestControlSnapshot: this.latestControls,
      prevStepStateBuffer: this.prevStepState,
    });
    return true;
  }

  public stepAfterPhysicsTick(recordToRingBuffer = false): number {
    const sim = this.phase === 'intervening' ? this.env.getPhysics() : null;
    if (!sim) return this.liveInterventionTick;

    const followIdx = this.targetFrame120Hz + this.postTakeoverFrameOffset;
    const recordedTick = this.liveInterventionTick++;
    this.postTakeoverFrameOffset++;

    finalizeInterveneStepAfterPhysics({
      env: this.env,
      sim,
      followIdx,
      povSlotIndex: this._povSlot,
      nonPovMode: this.nonPovMode,
      recordedTick,
      recordToRingBuffer,
      slotActiveTracker: this.slotActive,
      latestControlSnapshot: this.latestControls,
      prevStepStateBuffer: this.prevStepState,
    });
    return recordedTick;
  }

  public stepTick(
    playerControls: RLRCSynthesizedCarControls = DEFAULT_NEUTRAL_CAR_CONTROLS,
    dt = RLRC_FIXED_DT
  ): RLRCInterveneStepResult {
    if (this.phase === 'preroll-countdown') return this.stepPrerollCountdownTick(dt);
    if (!this.stepBeforePhysicsTick(playerControls, dt)) {
      return this.buildStepResult(
        false,
        this.phase === 'intervening' ? this.liveInterventionTick : 0
      );
    }
    this.env.getPhysics()?.step?.(1);
    return this.buildStepResult(true, this.stepAfterPhysicsTick(true));
  }

  public setNonPovMode(mode: RLRCNonPovInterventionMode): void {
    this.nonPovMode = mode;
    if (this.lastLaunchConfig)
      this.lastLaunchConfig = { ...this.lastLaunchConfig, nonPovMode: mode };
    if (this.phase === 'intervening' || this.phase === 'preroll-countdown') {
      applyNonPovModeChangeToRuntime({
        env: this.env,
        mode,
        povSlotIndex: this.povSlotIndex,
        slotActiveTracker: this.slotActive,
      });
    }
  }

  public exitInterveneToViewing(): number {
    restorePovVehicleOnExitIntervene(this.env, this.povSlotIndex);
    this.countdownRemainingTicks = 0;
    this.countdownRemainingSeconds = 0;
    this.lastBeepSecond = -1;
    this.prerollCursorFrame120Hz = this.targetFrame120Hz;
    this.phase = 'viewing';
    this.env.onPhaseChanged?.('viewing', 0);
    return this.targetFrame120Hz;
  }

  private stepPrerollCountdownTick(dt: number): RLRCInterveneStepResult {
    const frames = this.env.getFrames120Hz();
    const step = computeNextPrerollCountdownTick({
      totalFrames120Hz: frames.length,
      targetFrame120Hz: this.targetFrame120Hz,
      countdownRemainingTicks: this.countdownRemainingTicks,
      finalPrerollTick: this.prerollInjection?.finalPrerollTick ?? 1,
    });
    this.countdownRemainingTicks = step.nextRemainingTicks;
    if (this.countdownRemainingTicks <= 0) {
      this.prerollCursorFrame120Hz = this.targetFrame120Hz;
      this.launchShotNow();
      return this.buildStepResult(false, this.liveInterventionTick);
    }

    this.prerollCursorFrame120Hz = step.nextCursorFrame;
    const prerollFrame = frames[step.nextCursorFrame] ?? frames[this.targetFrame120Hz];
    if (prerollFrame && this.lastLaunchConfig) {
      if (this.env.getPhysics()) {
        this.applyPrerollFrame(prerollFrame, this.lastLaunchConfig, false);
      } else {
        this.env.getArena?.()?.spinBallInPlace?.(prerollFrame.ball.rigidBody.angularVelocity, dt);
      }
    }

    if (step.nextCountdownSeconds !== this.countdownRemainingSeconds) {
      this.countdownRemainingSeconds = step.nextCountdownSeconds;
      if (step.nextCountdownSeconds !== this.lastBeepSecond) {
        this.lastBeepSecond = step.nextCountdownSeconds;
        this.env.playSound?.('training_countdown', 1.0, 150);
      }
      this.env.onPhaseChanged?.('preroll-countdown', step.nextCountdownSeconds);
    }
    return this.buildStepResult(false, step.currentPrerollTick);
  }

  private buildStepResult(physicsStepped: boolean, currentTick: number): RLRCInterveneStepResult {
    return {
      phase: this.phase,
      physicsStepped,
      currentTick,
      countdownRemainingSeconds: this.countdownRemainingSeconds,
      postTakeoverFrameOffset: this.postTakeoverFrameOffset,
    };
  }

  private applyPrerollFrame(
    frame: RLRCFrame120Hz,
    config: RLRCInterveneLaunchConfig,
    rebuildMeshes: boolean
  ): void {
    this.prevStepState = applyPrerollFrameToRuntimeState({
      env: this.env,
      frame,
      config,
      slotActiveTracker: this.slotActive,
      rebuildMeshes,
      countdownRemainingTicks: this.countdownRemainingTicks,
      finalPrerollTick: this.prerollInjection?.finalPrerollTick ?? 1,
      prevStepStateBuffer: this.prevStepState,
    });
  }
}
