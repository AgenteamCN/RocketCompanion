import {
  DEFAULT_INITIAL_ROSTER,
  resolveDemoIndicatorConfig,
  resolveSkipIndicatorConfig,
  type CompactTelemetryTransientSnapshot,
  type DemolishHourglassTransientState,
  type EdgePlayerSlotState,
  type EdgeRosterHudState,
  type FlipTransientState,
  type KickoffCountdownFlashTransientState,
  type KickoffTransientFrame,
  type PitchMiniMapBallHitTransientEvent,
  type PitchMiniMapTransientState,
  type ReplayBannerTransientState,
  type StepperScoreboardState,
  type TemporalReplayFooterTransientState,
} from './hudTransientTypes';

export interface HudTransientInitialSeed {
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
}

export function createTopic<T extends object>(_topicKey: string, initialState: T) {
  const listeners = new Set<(state: T) => void>();
  const state = initialState;

  const notify = () => {
    for (const fn of listeners) fn(state);
  };

  const subscribe = (listener: (state: T) => void) => {
    listeners.add(listener);
    listener(state);
    return () => {
      listeners.delete(listener);
    };
  };

  const patchShallow = (patch: Partial<T>): boolean => {
    let dirty = false;
    for (const key in patch) {
      const nextVal = patch[key];
      if (nextVal !== undefined && state[key] !== nextVal) {
        state[key] = nextVal as T[Extract<keyof T, string>];
        dirty = true;
      }
    }
    if (dirty) notify();
    return dirty;
  };

  return { state, notify, subscribe, patchShallow };
}

export function buildInitialScoreboardState(
  seed?: Partial<StepperScoreboardState>
): StepperScoreboardState {
  return {
    leftScore: seed?.leftScore ?? 2,
    rightScore: seed?.rightScore ?? 2,
    scoreDigits: seed?.scoreDigits ?? 2,
    seconds: seed?.seconds ?? 164,
    isOvertime: seed?.isOvertime ?? false,
    overtimeChinOpen: seed?.overtimeChinOpen ?? false,
    overtimeChinText: seed?.overtimeChinText ?? 'OVERTIME',
    bestOf: seed?.bestOf ?? 5,
    seriesTitle: seed?.seriesTitle,
    leftSeriesWins: seed?.leftSeriesWins ?? 2,
    rightSeriesWins: seed?.rightSeriesWins ?? 1,
    seriesResults: seed?.seriesResults ?? ['left', 'right', 'left', 'none', 'none'],
  };
}

export function buildInitialRosterState(seed?: Partial<EdgeRosterHudState>): EdgeRosterHudState {
  return {
    viewMode: seed?.viewMode ?? DEFAULT_INITIAL_ROSTER.viewMode,
    focusedSlotKey:
      seed?.focusedSlotKey !== undefined
        ? seed.focusedSlotKey
        : DEFAULT_INITIAL_ROSTER.focusedSlotKey,
    opponentDemoCompact:
      seed?.opponentDemoCompact ?? DEFAULT_INITIAL_ROSTER.opponentDemoCompact ?? true,
    demoIndicatorConfig: resolveDemoIndicatorConfig(seed?.demoIndicatorConfig),
    skipIndicatorConfig: resolveSkipIndicatorConfig(seed?.skipIndicatorConfig),
    leftPlayers: (seed?.leftPlayers ?? DEFAULT_INITIAL_ROSTER.leftPlayers).map((p) => ({
      ...p,
    })) as EdgeRosterHudState['leftPlayers'],
    rightPlayers: (seed?.rightPlayers ?? DEFAULT_INITIAL_ROSTER.rightPlayers).map((p) => ({
      ...p,
    })) as EdgeRosterHudState['rightPlayers'],
  };
}

export function buildInitialFlipState(seed?: Partial<FlipTransientState>): FlipTransientState {
  return {
    hasFlip: seed?.hasFlip ?? true,
    status: seed?.status ?? 'grounded',
    remainingSeconds: seed?.remainingSeconds ?? 1.25,
    maxSeconds: seed?.maxSeconds ?? 1.25,
    flipsRemaining: seed?.flipsRemaining ?? 1,
    wheelContacts: seed?.wheelContacts ?? [true, true, true, true],
  };
}

export function buildInitialTelemetrySnapshot(
  seed?: Partial<CompactTelemetryTransientSnapshot>
): CompactTelemetryTransientSnapshot {
  return {
    fps: seed?.fps ?? 120,
    refreshHz: seed?.refreshHz ?? 120,
    renderScalePct: seed?.renderScalePct ?? 100,
    physicsRateHz: seed?.physicsRateHz ?? 120.0,
    baseLatencyMs: seed?.baseLatencyMs ?? 18,
    extraLatencyMs: seed?.extraLatencyMs ?? 0,
  };
}

export function buildInitialKickoffFrame(
  seed?: Partial<KickoffTransientFrame>
): KickoffTransientFrame {
  return {
    episodeTick: seed?.episodeTick ?? 0,
    countdownRemainingTicks: seed?.countdownRemainingTicks ?? 0,
    aiTouchTick: seed?.aiTouchTick ?? null,
    playerTouchTick: seed?.playerTouchTick ?? null,
    lastDeltaTicks: seed?.lastDeltaTicks ?? null,
    requiredKeys: seed?.requiredKeys ?? {},
    playerKeys: seed?.playerKeys ?? {},
  };
}

export function buildInitialReplayBannerState(
  seed?: Partial<ReplayBannerTransientState>
): ReplayBannerTransientState {
  return {
    replayProgress: seed?.replayProgress ?? 0.42,
    replayFrameIndex: seed?.replayFrameIndex ?? 151,
    replayTotalFrames: seed?.replayTotalFrames ?? 360,
  };
}

export function buildInitialReplayFooterState(
  seed?: Partial<TemporalReplayFooterTransientState>
): TemporalReplayFooterTransientState {
  return {
    visible: seed?.visible ?? true,
    scorerName: seed?.scorerName ?? 'Swabbie',
    goalSpeed: seed?.goalSpeed ?? '118KPH',
    assisterName: seed?.assisterName !== undefined ? seed.assisterName : 'Beast',
    teamAccentColor: seed?.teamAccentColor ?? '#edce0b',
    sideY: seed?.sideY ?? -16,
    centerY: seed?.centerY ?? 47,
  };
}

export function buildInitialRespawnTimerState(
  seed?: Partial<DemolishHourglassTransientState>
): DemolishHourglassTransientState {
  return {
    remainingSeconds: seed?.remainingSeconds ?? 3.0,
    totalSeconds: seed?.totalSeconds ?? 3.0,
    active: seed?.active ?? true,
    alwaysVisible: seed?.alwaysVisible ?? true,
  };
}

export function buildInitialMiniMapState(
  seed?: Partial<PitchMiniMapTransientState>
): PitchMiniMapTransientState {
  return {
    ballX: seed?.ballX ?? 62,
    ballY: seed?.ballY ?? 34,
    ballHitKph: seed?.ballHitKph ?? 114,
    isFlipped: seed?.isFlipped ?? false,
    flip180: seed?.flip180 ?? false,
    ballNormX: seed?.ballNormX ?? 0.36,
    ballNormY: seed?.ballNormY ?? 0.32,
    lastHitEvent: seed?.lastHitEvent ?? {
      id: 1,
      normX: 0.36,
      normY: 0.32,
      speedKph: 102,
      isMyTeam: true,
    },
  };
}

export function buildInitialCountdownFlashState(
  seed?: Partial<KickoffCountdownFlashTransientState>
): KickoffCountdownFlashTransientState {
  return {
    value: seed?.value !== undefined ? seed.value : 3,
    digit: seed?.digit ?? '4',
    color: seed?.color ?? '#ef4444',
    sequenceId: seed?.sequenceId ?? 1,
  };
}

export function applyRosterPatchInPlace(
  s: EdgeRosterHudState,
  partial: Partial<EdgeRosterHudState>
): void {
  const {
    viewMode,
    opponentDemoCompact,
    demoIndicatorConfig,
    skipIndicatorConfig,
    focusedSlotKey,
    leftPlayers,
    rightPlayers,
  } = partial;
  if (viewMode !== undefined) s.viewMode = viewMode;
  if (opponentDemoCompact !== undefined) {
    s.opponentDemoCompact = opponentDemoCompact;
  }
  if (demoIndicatorConfig !== undefined) {
    s.demoIndicatorConfig = resolveDemoIndicatorConfig(
      demoIndicatorConfig,
      resolveDemoIndicatorConfig(s.demoIndicatorConfig)
    );
  }
  if (skipIndicatorConfig !== undefined) {
    s.skipIndicatorConfig = resolveSkipIndicatorConfig(
      skipIndicatorConfig,
      resolveSkipIndicatorConfig(s.skipIndicatorConfig)
    );
  }
  if (focusedSlotKey !== undefined) {
    s.focusedSlotKey = focusedSlotKey;
    for (const p of s.leftPlayers) {
      p.isFocusedPov = focusedSlotKey !== null && p.slotKey === focusedSlotKey;
    }
    for (const p of s.rightPlayers) {
      p.isFocusedPov = focusedSlotKey !== null && p.slotKey === focusedSlotKey;
    }
  }
  if (leftPlayers) s.leftPlayers = leftPlayers;
  if (rightPlayers) s.rightPlayers = rightPlayers;
}

export function applyPlayerSlotPatchInPlace(
  s: EdgeRosterHudState,
  slotKey: 1 | 2 | 3 | 4 | 5 | 6,
  patch: Partial<Omit<EdgePlayerSlotState, 'slotKey' | 'team'>>
): boolean {
  let slot =
    s.leftPlayers.find((p) => p.slotKey === slotKey) ??
    s.rightPlayers.find((p) => p.slotKey === slotKey);
  if (!slot) {
    const list = slotKey <= 3 ? s.leftPlayers : s.rightPlayers;
    slot = list[slotKey <= 3 ? slotKey - 1 : slotKey - 4];
  }
  if (!slot) return false;
  let dirty = false;
  for (const key in patch) {
    const k = key as keyof typeof patch;
    const nextVal = patch[k];
    if (nextVal !== undefined && slot[k] !== nextVal) {
      (slot as any)[k] = nextVal;
      dirty = true;
    }
  }
  return dirty;
}

export function applyMiniMapBallHitInPlace(
  s: PitchMiniMapTransientState,
  hit: Omit<PitchMiniMapBallHitTransientEvent, 'id'> & { id?: number }
): void {
  const { normX, normY, speedKph, isMyTeam, id } = hit;
  s.ballNormX = normX;
  s.ballNormY = normY;
  s.ballX = normX * 100;
  s.ballY = normY * 100;
  s.ballHitKph = speedKph;
  s.lastHitEvent = {
    id: id ?? Date.now() + Math.random(),
    normX,
    normY,
    speedKph,
    isMyTeam,
  };
}
