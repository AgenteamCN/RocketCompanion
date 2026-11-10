import type {
  HudRosterViewMode,
  MatchHudChoreographySignal,
  EdgeDemoIndicatorVariant,
  EdgeDemoIndicatorConfig,
  EdgeSkipIndicatorVariant,
  EdgeSkipIndicatorConfig,
  EdgePlayerSlotState,
  EdgeRosterHudState,
  RosterTransientListener,
  FlipTransientState,
  FlipTransientListener,
  CompactTelemetryTransientSnapshot,
  CompactTelemetryTransientListener,
  KickoffKeyId,
  KickoffTransientFrame,
  KickoffTransientListener,
  ReplayBannerTransientState,
  ReplayBannerTransientListener,
  TemporalReplayFooterTransientState,
  TemporalReplayFooterTransientListener,
  ReplayFooterTransientState,
  ReplayFooterTransientListener,
  DemolishHourglassTransientState,
  DemolishHourglassTransientListener,
  RespawnTimerTransientState,
  RespawnTimerTransientListener,
  PitchMiniMapBallHitTransientEvent,
  PitchMiniMapTransientState,
  PitchMiniMapTransientListener,
  MiniMapTransientState,
  MiniMapTransientListener,
  KickoffCountdownFlashTransientState,
  KickoffCountdownFlashTransientListener,
  CountdownFlashTransientState,
  CountdownFlashTransientListener,
} from './hudTransientOverlayTypes';

export type {
  HudRosterViewMode,
  MatchHudChoreographySignal,
  EdgeDemoIndicatorVariant,
  EdgeDemoIndicatorConfig,
  EdgeSkipIndicatorVariant,
  EdgeSkipIndicatorConfig,
  EdgePlayerSlotState,
  EdgeRosterHudState,
  RosterTransientListener,
  FlipTransientState,
  FlipTransientListener,
  CompactTelemetryTransientSnapshot,
  CompactTelemetryTransientListener,
  KickoffKeyId,
  KickoffTransientFrame,
  KickoffTransientListener,
  ReplayBannerTransientState,
  ReplayBannerTransientListener,
  TemporalReplayFooterTransientState,
  TemporalReplayFooterTransientListener,
  ReplayFooterTransientState,
  ReplayFooterTransientListener,
  DemolishHourglassTransientState,
  DemolishHourglassTransientListener,
  RespawnTimerTransientState,
  RespawnTimerTransientListener,
  PitchMiniMapBallHitTransientEvent,
  PitchMiniMapTransientState,
  PitchMiniMapTransientListener,
  MiniMapTransientState,
  MiniMapTransientListener,
  KickoffCountdownFlashTransientState,
  KickoffCountdownFlashTransientListener,
  CountdownFlashTransientState,
  CountdownFlashTransientListener,
};

export type EditSubMode = 'car-heading' | 'car-speed' | 'ball-speed' | 'free-cam';

export interface StaticTrainingHudShot {
  car: {
    unlimitedBoost?: boolean;
    initialBoost?: number;
    snapToGround?: boolean;
    hasFlip?: boolean;
    speedFollowsHeading?: boolean;
  };
}

// ============================================================================
// Transient Channel Types (120Hz+ Zero-React-Rerender Pub/Sub)
// ============================================================================

export type SpeedTransientListener = (speed: number) => void;
export type BoostTransientListener = (amount: number, isUnlimited: boolean) => void;
export type BallCamTransientListener = (active: boolean) => void;
export type HudSpeedListener = SpeedTransientListener;
export type HudBoostListener = BoostTransientListener;
export type HudBallCamListener = BallCamTransientListener;

export type SeriesSlotWinner = 'left' | 'right' | 'none';

export interface StepperScoreboardState {
  leftScore: number;
  rightScore: number;
  scoreDigits: 2 | 3;
  seconds: number;
  isOvertime: boolean;
  overtimeChinOpen: boolean;
  overtimeChinText?: string;
  overtimeChinColor?: string;
  bestOf: 0 | 3 | 5 | 7;
  seriesTitle?: string;
  leftSeriesWins: number;
  rightSeriesWins: number;
  seriesResults: SeriesSlotWinner[];
}

export type ScoreboardTransientListener = (state: StepperScoreboardState) => void;

export interface HudTransientChannel {
  getSpeed: () => number;
  getBoost: () => { amount: number; isUnlimited: boolean };
  getBallCamActive: () => boolean;
  getScoreboard: () => StepperScoreboardState;
  getRoster: () => EdgeRosterHudState;
  getFlip: () => FlipTransientState;
  getFlipState: () => FlipTransientState;
  getTelemetry: () => CompactTelemetryTransientSnapshot;
  getTelemetrySnapshot: () => CompactTelemetryTransientSnapshot;
  getKickoffFrame: () => KickoffTransientFrame;
  getReplayBannerState: () => ReplayBannerTransientState;
  getReplayFooter: () => TemporalReplayFooterTransientState;
  getReplayFooterState: () => TemporalReplayFooterTransientState;
  getRespawnTimer: () => DemolishHourglassTransientState;
  getRespawnTimerState: () => DemolishHourglassTransientState;
  getMiniMap: () => PitchMiniMapTransientState;
  getMiniMapState: () => PitchMiniMapTransientState;
  getCountdownFlash: () => KickoffCountdownFlashTransientState;
  getCountdownFlashState: () => KickoffCountdownFlashTransientState;

  setSpeed: (speed: number) => void;
  setBoost: (amount: number, isUnlimited?: boolean) => void;
  setBallCamActive: (active: boolean) => void;
  toggleBallCam: () => boolean;
  setScoreboard: (partial: Partial<StepperScoreboardState>) => void;
  setRoster: (partial: Partial<EdgeRosterHudState>) => void;
  updatePlayerSlot: (
    slotKey: 1 | 2 | 3 | 4 | 5 | 6,
    patch: Partial<Omit<EdgePlayerSlotState, 'slotKey' | 'team'>>
  ) => void;
  setFlip: (
    patchOrHasFlip: Partial<FlipTransientState> | boolean,
    status?: FlipTransientState['status'],
    remainingSeconds?: number,
    maxSeconds?: number,
    flipsRemaining?: number
  ) => void;
  setFlipState: (
    patchOrHasFlip: Partial<FlipTransientState> | boolean,
    status?: FlipTransientState['status'],
    remainingSeconds?: number,
    maxSeconds?: number,
    flipsRemaining?: number
  ) => void;
  setTelemetry: (snap: Partial<CompactTelemetryTransientSnapshot>) => void;
  setTelemetrySnapshot: (snap: Partial<CompactTelemetryTransientSnapshot>) => void;
  setKickoffFrame: (frame: Partial<KickoffTransientFrame>) => void;
  setReplayBannerState: (patch: Partial<ReplayBannerTransientState>) => void;
  setReplayFooter: (patch: Partial<TemporalReplayFooterTransientState>) => void;
  setReplayFooterState: (patch: Partial<TemporalReplayFooterTransientState>) => void;
  setRespawnTimer: (
    patchOrRem: Partial<DemolishHourglassTransientState> | number,
    totalSeconds?: number,
    active?: boolean
  ) => void;
  setRespawnTimerState: (
    patchOrRem: Partial<DemolishHourglassTransientState> | number,
    totalSeconds?: number,
    active?: boolean
  ) => void;
  setMiniMap: (patch: Partial<PitchMiniMapTransientState>) => void;
  setMiniMapState: (patch: Partial<PitchMiniMapTransientState>) => void;
  triggerMiniMapBallHit: (
    hit: Omit<PitchMiniMapBallHitTransientEvent, 'id'> & { id?: number }
  ) => void;
  setCountdownFlash: (patch: Partial<KickoffCountdownFlashTransientState>) => void;
  setCountdownFlashState: (patch: Partial<KickoffCountdownFlashTransientState>) => void;

  subscribeSpeed: (listener: SpeedTransientListener) => () => void;
  subscribeBoost: (listener: BoostTransientListener) => () => void;
  subscribeBallCam: (listener: BallCamTransientListener) => () => void;
  subscribeScoreboard: (listener: ScoreboardTransientListener) => () => void;
  subscribeRoster: (listener: RosterTransientListener) => () => void;
  subscribeFlip: (listener: FlipTransientListener) => () => void;
  subscribeTelemetry: (listener: CompactTelemetryTransientListener) => () => void;
  subscribeKickoffFrame: (listener: KickoffTransientListener) => () => void;
  subscribeReplayBanner: (listener: ReplayBannerTransientListener) => () => void;
  subscribeReplayFooter: (listener: TemporalReplayFooterTransientListener) => () => void;
  subscribeRespawnTimer: (listener: DemolishHourglassTransientListener) => () => void;
  subscribeMiniMap: (listener: PitchMiniMapTransientListener) => () => void;
  subscribeCountdownFlash: (listener: KickoffCountdownFlashTransientListener) => () => void;
}

export const DEFAULT_DEMO_INDICATOR_CONFIG: EdgeDemoIndicatorConfig = {
  variant: 'bomb-svg', color: '#EF4444', strokeWidth: 1.75, sizePx: 16,
  glowColor: '#EF4444', glowBlurPx: 0, glowIntensityPct: 0,
};

export const DEFAULT_SKIP_INDICATOR_CONFIG: EdgeSkipIndicatorConfig = {
  variant: 'check', color: '#10B981', strokeWidth: 2, sizePx: 24,
  glowColor: '#10B981', glowBlurPx: 6, glowIntensityPct: 110,
  protrudeWidthPx: 34, underlapPx: 20, cardRadiusPx: 9,
  iconOffsetXPx: 0, iconOffsetYPx: -1, enterDurationMs: 220, exitDurationMs: 160,
  autoResetOnKickoff: true,
};

const VALID_SKIP_VARIANTS = new Set<EdgeSkipIndicatorVariant>(['check', 'disconnect', 'packet-loss', 'latency', 'waiting']);

export function resolveDemoIndicatorConfig(
  raw?: Partial<EdgeDemoIndicatorConfig> | unknown,
  fallback: EdgeDemoIndicatorConfig = DEFAULT_DEMO_INDICATOR_CONFIG
): EdgeDemoIndicatorConfig {
  const base = fallback && typeof fallback === 'object' ? fallback : DEFAULT_DEMO_INDICATOR_CONFIG;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...base };
  const r = raw as Partial<EdgeDemoIndicatorConfig>;
  return {
    variant: r.variant === 'cross' || r.variant === 'bomb-svg' ? r.variant : base.variant,
    color: typeof r.color === 'string' && r.color.trim().length > 0 ? r.color : base.color,
    strokeWidth: typeof r.strokeWidth === 'number' && Number.isFinite(r.strokeWidth) ? r.strokeWidth : base.strokeWidth,
    sizePx: typeof r.sizePx === 'number' && Number.isFinite(r.sizePx) ? r.sizePx : base.sizePx,
    glowColor:
      typeof r.glowColor === 'string' && r.glowColor.trim().length > 0
        ? r.glowColor
        : typeof r.color === 'string' && r.color.trim().length > 0 ? r.color : base.glowColor,
    glowBlurPx: typeof r.glowBlurPx === 'number' && Number.isFinite(r.glowBlurPx) ? r.glowBlurPx : base.glowBlurPx,
    glowIntensityPct: typeof r.glowIntensityPct === 'number' && Number.isFinite(r.glowIntensityPct) ? r.glowIntensityPct : base.glowIntensityPct,
  };
}

export function resolveSkipIndicatorConfig(
  raw?: Partial<EdgeSkipIndicatorConfig> | unknown,
  fallback: EdgeSkipIndicatorConfig = DEFAULT_SKIP_INDICATOR_CONFIG
): EdgeSkipIndicatorConfig {
  const base = fallback && typeof fallback === 'object' ? fallback : DEFAULT_SKIP_INDICATOR_CONFIG;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...base };
  const r = raw as Partial<EdgeSkipIndicatorConfig>;
  return {
    variant: typeof r.variant === 'string' && VALID_SKIP_VARIANTS.has(r.variant as EdgeSkipIndicatorVariant) ? r.variant : base.variant,
    color: typeof r.color === 'string' && r.color.trim().length > 0 ? r.color : base.color,
    strokeWidth: typeof r.strokeWidth === 'number' && Number.isFinite(r.strokeWidth) ? r.strokeWidth : base.strokeWidth,
    sizePx: typeof r.sizePx === 'number' && Number.isFinite(r.sizePx) ? r.sizePx : base.sizePx,
    glowColor:
      typeof r.glowColor === 'string' && r.glowColor.trim().length > 0
        ? r.glowColor
        : typeof r.color === 'string' && r.color.trim().length > 0 ? r.color : base.glowColor,
    glowBlurPx: typeof r.glowBlurPx === 'number' && Number.isFinite(r.glowBlurPx) ? r.glowBlurPx : base.glowBlurPx,
    glowIntensityPct: typeof r.glowIntensityPct === 'number' && Number.isFinite(r.glowIntensityPct) ? r.glowIntensityPct : base.glowIntensityPct,
    protrudeWidthPx: typeof r.protrudeWidthPx === 'number' && Number.isFinite(r.protrudeWidthPx) ? r.protrudeWidthPx : base.protrudeWidthPx,
    underlapPx: typeof r.underlapPx === 'number' && Number.isFinite(r.underlapPx) ? r.underlapPx : base.underlapPx,
    cardRadiusPx: typeof r.cardRadiusPx === 'number' && Number.isFinite(r.cardRadiusPx) ? r.cardRadiusPx : base.cardRadiusPx,
    iconOffsetXPx: typeof r.iconOffsetXPx === 'number' && Number.isFinite(r.iconOffsetXPx) ? r.iconOffsetXPx : base.iconOffsetXPx,
    iconOffsetYPx: typeof r.iconOffsetYPx === 'number' && Number.isFinite(r.iconOffsetYPx) ? r.iconOffsetYPx : base.iconOffsetYPx,
    enterDurationMs: typeof r.enterDurationMs === 'number' && Number.isFinite(r.enterDurationMs) ? r.enterDurationMs : base.enterDurationMs,
    exitDurationMs: typeof r.exitDurationMs === 'number' && Number.isFinite(r.exitDurationMs) ? r.exitDurationMs : base.exitDurationMs,
    autoResetOnKickoff: typeof r.autoResetOnKickoff === 'boolean' ? r.autoResetOnKickoff : base.autoResetOnKickoff,
  };
}

const makeInitialPlayer = (
  slotKey: 1 | 2 | 3 | 4 | 5 | 6,
  team: 'left' | 'right',
  name: string,
  boostAmount: number,
  isSelf = false
): EdgePlayerSlotState => ({
  slotKey, team, name, boostAmount, exists: true, isSelf, isFocusedPov: isSelf,
  isDemolished: false, demoRespawnRemainingSec: 0, demoRespawnTotalSec: 3.0, demolishedAtMs: 0,
  replaySkipReady: false,
});

export const DEFAULT_INITIAL_ROSTER: EdgeRosterHudState = {
  viewMode: 'player-live',
  focusedSlotKey: 1,
  opponentDemoCompact: true,
  demoIndicatorConfig: { ...DEFAULT_DEMO_INDICATOR_CONFIG },
  skipIndicatorConfig: { ...DEFAULT_SKIP_INDICATOR_CONFIG },
  leftPlayers: [
    makeInitialPlayer(1, 'left', 'You (Octane_99)', 85, true),
    makeInitialPlayer(2, 'left', 'Zen_Master_RL', 42),
    makeInitialPlayer(3, 'left', 'Vatira_Pro_LongName', 100),
  ],
  rightPlayers: [
    makeInitialPlayer(4, 'right', 'Firstkiller_NA', 64),
    makeInitialPlayer(5, 'right', 'BeastMode_Fennec', 18),
    makeInitialPlayer(6, 'right', 'Daniel_SSG_Apex', 90),
  ],
};
