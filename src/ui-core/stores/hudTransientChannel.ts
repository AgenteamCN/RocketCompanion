/**
 * hudTransientChannel.ts
 * Zero-dependency, zero-React-rerender transient pub/sub channel for both 120Hz continuous
 * AND low-frequency discrete HUD metrics & GPU compositor animations.
 */
import type {
  SpeedTransientListener,
  BoostTransientListener,
  BallCamTransientListener,
  StepperScoreboardState,
  EdgeRosterHudState,
  FlipTransientState,
  CompactTelemetryTransientSnapshot,
  KickoffTransientFrame,
  ReplayBannerTransientState,
  TemporalReplayFooterTransientState,
  DemolishHourglassTransientState,
  PitchMiniMapTransientState,
  KickoffCountdownFlashTransientState,
  HudTransientChannel,
} from './hudTransientTypes';
import {
  applyMiniMapBallHitInPlace,
  applyPlayerSlotPatchInPlace,
  applyRosterPatchInPlace,
  buildInitialCountdownFlashState,
  buildInitialFlipState,
  buildInitialKickoffFrame,
  buildInitialMiniMapState,
  buildInitialReplayBannerState,
  buildInitialReplayFooterState,
  buildInitialRespawnTimerState,
  buildInitialRosterState,
  buildInitialScoreboardState,
  buildInitialTelemetrySnapshot,
  createTopic,
} from './hudTransientChannelHelpers';

export function createHudTransientChannel(initial?: {
  speed?: number;
  boostAmount?: number;
  isUnlimitedBoost?: boolean;
  ballCamActive?: boolean;
  scoreboard?: Partial<StepperScoreboardState>;
  roster?: Partial<EdgeRosterHudState>;
  flipState?: Partial<FlipTransientState>;
  telemetry?: Partial<CompactTelemetryTransientSnapshot>;
  kickoffFrame?: Partial<KickoffTransientFrame>;
  replayBanner?: Partial<ReplayBannerTransientState>;
  replayFooter?: Partial<TemporalReplayFooterTransientState>;
  respawnTimer?: Partial<DemolishHourglassTransientState>;
  miniMap?: Partial<PitchMiniMapTransientState>;
  countdownFlash?: Partial<KickoffCountdownFlashTransientState>;
}): HudTransientChannel {
  let currentSpeed = initial?.speed ?? 0;
  let currentBoost = initial?.boostAmount ?? 100;
  let currentUnlimited = Boolean(initial?.isUnlimitedBoost);
  let currentBallCam = initial?.ballCamActive ?? true;

  const speedListeners = new Set<SpeedTransientListener>();
  const boostListeners = new Set<BoostTransientListener>();
  const ballCamListeners = new Set<BallCamTransientListener>();
  const boostSnapshot = { amount: currentBoost, isUnlimited: currentUnlimited };

  const scoreboard = createTopic('hud:scoreboard', buildInitialScoreboardState(initial?.scoreboard));
  const roster = createTopic('hud:roster', buildInitialRosterState(initial?.roster));
  const flip = createTopic('hud:flip', buildInitialFlipState(initial?.flipState));
  const telemetry = createTopic('hud:telemetry', buildInitialTelemetrySnapshot(initial?.telemetry));
  const kickoff = createTopic('hud:kickoff', buildInitialKickoffFrame(initial?.kickoffFrame));
  const replayBanner = createTopic(
    'hud:replayBanner',
    buildInitialReplayBannerState(initial?.replayBanner)
  );
  const replayFooter = createTopic(
    'hud:replayFooter',
    buildInitialReplayFooterState(initial?.replayFooter)
  );
  const respawnTimer = createTopic(
    'hud:respawnTimer',
    buildInitialRespawnTimerState(initial?.respawnTimer)
  );
  const miniMap = createTopic('hud:miniMap', buildInitialMiniMapState(initial?.miniMap));
  const countdownFlash = createTopic(
    'hud:countdownFlash',
    buildInitialCountdownFlashState(initial?.countdownFlash)
  );

  const setFlipImpl = (
    patchOrHasFlip: Partial<FlipTransientState> | boolean,
    status?: FlipTransientState['status'],
    remainingSeconds?: number,
    maxSeconds?: number,
    flipsRemaining?: number
  ) => {
    const s = flip.state;
    let dirty = false;
    if (typeof patchOrHasFlip === 'boolean') {
      if (patchOrHasFlip !== s.hasFlip) {
        s.hasFlip = patchOrHasFlip;
        dirty = true;
      }
      if (status !== undefined && status !== s.status) {
        s.status = status;
        dirty = true;
      }
      if (remainingSeconds !== undefined) {
        const rounded = Math.max(0, Math.round(remainingSeconds * 1000) / 1000);
        if (Math.abs(rounded - s.remainingSeconds) >= 0.002) {
          s.remainingSeconds = rounded;
          dirty = true;
        }
      }
      if (maxSeconds !== undefined && maxSeconds !== s.maxSeconds) {
        s.maxSeconds = maxSeconds;
        dirty = true;
      }
      if (flipsRemaining !== undefined && flipsRemaining !== s.flipsRemaining) {
        s.flipsRemaining = flipsRemaining;
        dirty = true;
      }
      if (dirty) flip.notify();
      return;
    }

    const patch = patchOrHasFlip;
    if (patch.hasFlip !== undefined && patch.hasFlip !== s.hasFlip) {
      s.hasFlip = patch.hasFlip;
      dirty = true;
    }
    if (patch.status !== undefined && patch.status !== s.status) {
      s.status = patch.status;
      dirty = true;
    }
    if (patch.remainingSeconds !== undefined) {
      const rounded = Math.max(0, Math.round(patch.remainingSeconds * 1000) / 1000);
      if (Math.abs(rounded - s.remainingSeconds) >= 0.002) {
        s.remainingSeconds = rounded;
        dirty = true;
      }
    }
    if (patch.maxSeconds !== undefined && patch.maxSeconds !== s.maxSeconds) {
      s.maxSeconds = patch.maxSeconds;
      dirty = true;
    }
    if (patch.flipsRemaining !== undefined && patch.flipsRemaining !== s.flipsRemaining) {
      s.flipsRemaining = patch.flipsRemaining;
      dirty = true;
    }
    if (patch.wheelContacts !== undefined) {
      const prev = s.wheelContacts;
      const next = patch.wheelContacts;
      if (
        !prev ||
        prev[0] !== next[0] ||
        prev[1] !== next[1] ||
        prev[2] !== next[2] ||
        prev[3] !== next[3]
      ) {
        if (prev) {
          prev[0] = next[0];
          prev[1] = next[1];
          prev[2] = next[2];
          prev[3] = next[3];
        } else {
          s.wheelContacts = [next[0], next[1], next[2], next[3]];
        }
        dirty = true;
      }
    }
    if (dirty) flip.notify();
  };

  const setTelemetryImpl = (patch: Partial<CompactTelemetryTransientSnapshot>) => {
    const s = telemetry.state;
    let dirty = false;
    const roundAssign = (
      k: 'fps' | 'refreshHz' | 'renderScalePct' | 'baseLatencyMs' | 'extraLatencyMs',
      val: number | undefined
    ) => {
      if (val === undefined) return;
      const v = Math.round(val);
      if (v !== s[k]) {
        s[k] = v;
        dirty = true;
      }
    };
    roundAssign('fps', patch.fps);
    roundAssign('refreshHz', patch.refreshHz);
    roundAssign('renderScalePct', patch.renderScalePct);
    roundAssign('baseLatencyMs', patch.baseLatencyMs);
    roundAssign('extraLatencyMs', patch.extraLatencyMs);
    if (patch.physicsRateHz !== undefined) {
      const v = Math.round(patch.physicsRateHz * 10) / 10;
      if (Math.abs(v - s.physicsRateHz) >= 0.05) {
        s.physicsRateHz = v;
        dirty = true;
      }
    }
    if (dirty) telemetry.notify();
  };

  const setRespawnTimerImpl = (
    patchOrRem: Partial<DemolishHourglassTransientState> | number,
    totalSeconds?: number,
    active?: boolean
  ) => {
    const s = respawnTimer.state;
    let dirty = false;
    if (typeof patchOrRem === 'number') {
      const clamped = Math.max(0, Math.round(patchOrRem * 1000) / 1000);
      if (Math.abs(clamped - s.remainingSeconds) >= 0.002) {
        s.remainingSeconds = clamped;
        dirty = true;
      }
      if (totalSeconds !== undefined && totalSeconds !== s.totalSeconds) {
        s.totalSeconds = totalSeconds;
        dirty = true;
      }
      if (active !== undefined && active !== s.active) {
        s.active = active;
        dirty = true;
      }
      if (dirty) respawnTimer.notify();
      return;
    }

    const patch = patchOrRem;
    if (patch.remainingSeconds !== undefined) {
      const clamped = Math.max(0, Math.round(patch.remainingSeconds * 1000) / 1000);
      if (Math.abs(clamped - s.remainingSeconds) >= 0.002) {
        s.remainingSeconds = clamped;
        dirty = true;
      }
    }
    if (patch.totalSeconds !== undefined && patch.totalSeconds !== s.totalSeconds) {
      s.totalSeconds = patch.totalSeconds;
      dirty = true;
    }
    if (patch.active !== undefined && patch.active !== s.active) {
      s.active = patch.active;
      dirty = true;
    }
    if (patch.alwaysVisible !== undefined && patch.alwaysVisible !== s.alwaysVisible) {
      s.alwaysVisible = patch.alwaysVisible;
      dirty = true;
    }
    if (dirty) respawnTimer.notify();
  };

  const setReplayFooterImpl = (patch: Partial<TemporalReplayFooterTransientState>) => {
    replayFooter.patchShallow(patch);
  };

  const setMiniMapImpl = (patch: Partial<PitchMiniMapTransientState>) => {
    Object.assign(miniMap.state, patch);
    miniMap.notify();
  };

  const setCountdownFlashImpl = (patch: Partial<KickoffCountdownFlashTransientState>) => {
    const s = countdownFlash.state;
    if (patch.value !== undefined) s.value = patch.value;
    if (patch.digit !== undefined) s.digit = patch.digit;
    if (patch.color !== undefined) s.color = patch.color;
    s.sequenceId = patch.sequenceId ?? (s.sequenceId ?? 0) + 1;
    countdownFlash.notify();
  };

  return {
    getSpeed: () => currentSpeed,
    getBoost: () => {
      boostSnapshot.amount = currentBoost;
      boostSnapshot.isUnlimited = currentUnlimited;
      return boostSnapshot;
    },
    getBallCamActive: () => currentBallCam,
    getScoreboard: () => scoreboard.state,
    getRoster: () => roster.state,
    getFlip: () => flip.state,
    getFlipState: () => flip.state,
    getTelemetry: () => telemetry.state,
    getTelemetrySnapshot: () => telemetry.state,
    getKickoffFrame: () => kickoff.state,
    getReplayBannerState: () => replayBanner.state,
    getReplayFooter: () => replayFooter.state,
    getReplayFooterState: () => replayFooter.state,
    getRespawnTimer: () => respawnTimer.state,
    getRespawnTimerState: () => respawnTimer.state,
    getMiniMap: () => miniMap.state,
    getMiniMapState: () => miniMap.state,
    getCountdownFlash: () => countdownFlash.state,
    getCountdownFlashState: () => countdownFlash.state,

    setSpeed: (rawSpeed: number) => {
      const clamped = Math.max(0, Math.min(2300, Math.round(Math.abs(rawSpeed || 0) * 10) / 10));
      if (Math.abs(clamped - currentSpeed) < 0.05) return;
      currentSpeed = clamped;
      for (const fn of speedListeners) fn(currentSpeed);
    },

    setBoost: (rawAmount: number, isUnlimited = currentUnlimited) => {
      const clamped = Math.max(0, Math.min(100, Math.round(rawAmount || 0)));
      const unlim = Boolean(isUnlimited);
      if (clamped === currentBoost && unlim === currentUnlimited) return;
      currentBoost = clamped;
      currentUnlimited = unlim;
      for (const fn of boostListeners) fn(currentBoost, currentUnlimited);
    },

    setBallCamActive: (active: boolean) => {
      const next = Boolean(active);
      if (next === currentBallCam) return;
      currentBallCam = next;
      for (const fn of ballCamListeners) fn(currentBallCam);
    },

    toggleBallCam: () => {
      currentBallCam = !currentBallCam;
      for (const fn of ballCamListeners) fn(currentBallCam);
      return currentBallCam;
    },

    setScoreboard: (partial: Partial<StepperScoreboardState>) => {
      Object.assign(scoreboard.state, partial);
      scoreboard.notify();
    },

    setRoster: (partial: Partial<EdgeRosterHudState>) => {
      applyRosterPatchInPlace(roster.state, partial);
      roster.notify();
    },

    updatePlayerSlot: (slotKey, patch) => {
      if (applyPlayerSlotPatchInPlace(roster.state, slotKey, patch)) {
        roster.notify();
      }
    },

    setFlip: setFlipImpl,
    setFlipState: setFlipImpl,
    setTelemetry: setTelemetryImpl,
    setTelemetrySnapshot: setTelemetryImpl,

    setKickoffFrame: (patch: Partial<KickoffTransientFrame>) => {
      Object.assign(kickoff.state, patch);
      kickoff.notify();
    },

    setReplayBannerState: (patch: Partial<ReplayBannerTransientState>) => {
      const s = replayBanner.state;
      let dirty = false;
      if (
        patch.replayProgress !== undefined &&
        Math.abs(patch.replayProgress - s.replayProgress) >= 0.0005
      ) {
        s.replayProgress = patch.replayProgress;
        dirty = true;
      }
      if (patch.replayFrameIndex !== undefined && patch.replayFrameIndex !== s.replayFrameIndex) {
        s.replayFrameIndex = patch.replayFrameIndex;
        dirty = true;
      }
      if (patch.replayTotalFrames !== undefined && patch.replayTotalFrames !== s.replayTotalFrames) {
        s.replayTotalFrames = patch.replayTotalFrames;
        dirty = true;
      }
      if (dirty) replayBanner.notify();
    },

    setReplayFooter: setReplayFooterImpl,
    setReplayFooterState: setReplayFooterImpl,
    setRespawnTimer: setRespawnTimerImpl,
    setRespawnTimerState: setRespawnTimerImpl,
    setMiniMap: setMiniMapImpl,
    setMiniMapState: setMiniMapImpl,

    triggerMiniMapBallHit: (hit) => {
      applyMiniMapBallHitInPlace(miniMap.state, hit);
      miniMap.notify();
    },

    setCountdownFlash: setCountdownFlashImpl,
    setCountdownFlashState: setCountdownFlashImpl,

    subscribeSpeed: (listener: SpeedTransientListener) => {
      speedListeners.add(listener);
      listener(currentSpeed);
      return () => {
        speedListeners.delete(listener);
      };
    },
    subscribeBoost: (listener: BoostTransientListener) => {
      boostListeners.add(listener);
      listener(currentBoost, currentUnlimited);
      return () => {
        boostListeners.delete(listener);
      };
    },
    subscribeBallCam: (listener: BallCamTransientListener) => {
      ballCamListeners.add(listener);
      listener(currentBallCam);
      return () => {
        ballCamListeners.delete(listener);
      };
    },
    subscribeScoreboard: scoreboard.subscribe,
    subscribeRoster: roster.subscribe,
    subscribeFlip: flip.subscribe,
    subscribeTelemetry: telemetry.subscribe,
    subscribeKickoffFrame: kickoff.subscribe,
    subscribeReplayBanner: replayBanner.subscribe,
    subscribeReplayFooter: replayFooter.subscribe,
    subscribeRespawnTimer: respawnTimer.subscribe,
    subscribeMiniMap: miniMap.subscribe,
    subscribeCountdownFlash: countdownFlash.subscribe,
  };
}

export const globalHudTransientChannel = createHudTransientChannel();
