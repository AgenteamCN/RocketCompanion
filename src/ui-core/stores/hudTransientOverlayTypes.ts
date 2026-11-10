export type HudRosterViewMode = 'player-live' | 'goal-replay' | 'spectator';

export type MatchHudChoreographySignal =
  | 'goal-replay-will-start'
  | 'goal-replay-started'
  | 'goal-replay-will-end'
  | 'kickoff-will-start';

export type EdgeDemoIndicatorVariant = 'bomb-svg' | 'cross';

export interface EdgeDemoIndicatorConfig {
  /** Demolish indicator style: 'bomb-svg' (packaged svgrepo-528868 bomb) or 'cross' (classic x) */
  variant: EdgeDemoIndicatorVariant;
  /** Primary stroke / text color (default '#EF4444') */
  color: string;
  /** SVG stroke width (default 1.75, range 0.8 - 3.2) */
  strokeWidth: number;
  /** SVG icon size in px (default 16, range 12 - 22) */
  sizePx: number;
  /** Outer glow color (default '#EF4444') */
  glowColor: string;
  /** Outer glow blur radius in px (default 6, range 0 - 20) */
  glowBlurPx: number;
  /** Outer glow intensity percentage (default 85, range 0 - 200) */
  glowIntensityPct: number;
}

export type EdgeSkipIndicatorVariant =
  | 'check'
  | 'disconnect'
  | 'packet-loss'
  | 'latency'
  | 'waiting';

export interface EdgeSkipIndicatorConfig {
  /** Default icon variant rendered inside the inward slot extension card (default 'check') */
  variant: EdgeSkipIndicatorVariant;
  /** Icon SVG stroke color (default '#10B981' — 2nd green swatch) */
  color: string;
  /** Icon SVG stroke width (default 2.0, range 1.0 - 4.0) */
  strokeWidth: number;
  /** Icon SVG size in px (default 24, range 10 - 34) */
  sizePx: number;
  /** Icon SVG drop-shadow glow color (default '#10B981') */
  glowColor: string;
  /** Icon SVG drop-shadow glow blur radius in px (default 6, range 0 - 20) */
  glowBlurPx: number;
  /** Icon SVG drop-shadow glow intensity percentage (default 110, range 0 - 200) */
  glowIntensityPct: number;
  /** Visible inward protrusion length past the player card edge in px (default 34, range 24 - 76) */
  protrudeWidthPx: number;
  /** Inner overlap width tucked underneath the player card in px so borders extend seamlessly from beneath the card (default 20, range 0 - 28) */
  underlapPx: number;
  /** Outer rounded corner radius of the extension card in px (default 9, range 0 - 18) */
  cardRadiusPx: number;
  /** Horizontal fine-tuning offset of the icon inside the protruding area in px (default 0, range -12 - 12) */
  iconOffsetXPx: number;
  /** Vertical fine-tuning offset of the icon inside the protruding area in px for optical vs mathematical center balance (default -1, range -12 - 12) */
  iconOffsetYPx: number;
  /** Slide-out push animation duration when activated in ms (default 220, range 0 - 600) */
  enterDurationMs: number;
  /** Slide-in retract animation duration when deactivated/reset in ms (default 160, faster than 300ms 1-2-3 contraction) */
  exitDurationMs: number;
  /** Automatically reset all slots' replaySkipReady state when 'kickoff-will-start' signal fires (default true) */
  autoResetOnKickoff: boolean;
}

export interface EdgePlayerSlotState {
  slotKey: 1 | 2 | 3 | 4 | 5 | 6;
  team: 'left' | 'right';
  name: string;
  boostAmount: number;
  /** Authoritative carIndex in the simulation corresponding to this HUD slot */
  carIndex?: number;
  /** Whether this player slot is active in the current match (e.g. 1v1, 2v2, 1v3, 2v3, 3v3, 2v4, 1v5) */
  exists?: boolean;
  isSelf?: boolean;
  isFocusedPov?: boolean;
  isDemolished?: boolean;
  demoRespawnRemainingSec?: number;
  /** Total respawn duration baseline in seconds (default RLConst::DEMO_RESPAWN_TIME = 3.0) */
  demoRespawnTotalSec?: number;
  /** Optional timestamp (performance.now()) when demolish started; if omitted/0, FIFO falls back to demoRespawnRemainingSec ascending */
  demolishedAtMs?: number;
  /** Whether this player's inward auxiliary extension card (Skip Replay / Network Status) is active */
  replaySkipReady?: boolean;
  /** Optional per-slot auxiliary icon variant override ('check' | 'disconnect' | 'packet-loss' | 'latency' | 'waiting') */
  skipIndicatorVariant?: EdgeSkipIndicatorVariant;
  /** Optional per-slot auxiliary icon color override */
  skipIndicatorColor?: string;
}

export interface EdgeRosterHudState {
  viewMode: HudRosterViewMode;
  focusedSlotKey: 1 | 2 | 3 | 4 | 5 | 6 | null;
  /**
   * When true (default), demolished opponents on the right side during `player-live`
   * automatically compact upward to the top slot (FIFO order by demolish time or remaining timer) instead of leaving empty gaps.
   */
  opponentDemoCompact?: boolean;
  /** Optional demolish indicator configuration (bomb-svg vs red cross, stroke width, color, outer glow) */
  demoIndicatorConfig?: EdgeDemoIndicatorConfig;
  /** Optional replay skip checkmark SVG configuration (size, stroke width, color, SVG glow) */
  skipIndicatorConfig?: EdgeSkipIndicatorConfig;
  leftPlayers: [EdgePlayerSlotState, EdgePlayerSlotState, EdgePlayerSlotState, ...EdgePlayerSlotState[]];
  rightPlayers: [EdgePlayerSlotState, EdgePlayerSlotState, EdgePlayerSlotState, ...EdgePlayerSlotState[]];
}

export type RosterTransientListener = (state: EdgeRosterHudState) => void;

export interface FlipTransientState {
  hasFlip: boolean;
  /** Supports both 'expired' and RocketCompanion 'none' */
  status: 'grounded' | 'countdown' | 'unlimited' | 'expired' | 'none';
  remainingSeconds: number;
  maxSeconds?: number;
  /**
   * Optional multi-flip counter from RocketCompanion:
   * -1 = unlimited, 0 = none/expired, 1 = normal single dodge, 2+ = multi-flip (e.g. HAS FLIP ×2)
   */
  flipsRemaining?: number;
  wheelContacts?: [boolean, boolean, boolean, boolean];
}
export type FlipTransientListener = (state: FlipTransientState) => void;

export interface CompactTelemetryTransientSnapshot {
  fps: number;
  refreshHz: number;
  renderScalePct: number;
  physicsRateHz: number;
  baseLatencyMs: number;
  extraLatencyMs: number;
}
export type CompactTelemetryTransientListener = (snap: CompactTelemetryTransientSnapshot) => void;

export type KickoffKeyId = 'Shift' | 'Q' | 'A' | 'W' | 'S' | 'D' | 'E' | 'Boost' | 'Jump';

export interface KickoffTransientFrame {
  episodeTick: number;
  countdownRemainingTicks?: number;
  aiTouchTick?: number | null;
  playerTouchTick?: number | null;
  lastDeltaTicks?: number | null;
  requiredKeys?: Partial<Record<KickoffKeyId, boolean>>;
  playerKeys?: Partial<Record<KickoffKeyId, boolean>>;
}
export type KickoffTransientListener = (frame: KickoffTransientFrame) => void;

export interface ReplayBannerTransientState {
  replayProgress: number;
  replayFrameIndex: number;
  replayTotalFrames: number;
}
export type ReplayBannerTransientListener = (state: ReplayBannerTransientState) => void;

export interface TemporalReplayFooterTransientState {
  visible: boolean;
  scorerName: string;
  goalSpeed: string | number;
  assisterName?: string | null;
  teamAccentColor?: string;
  sideY?: number;
  centerY?: number;
}
export type TemporalReplayFooterTransientListener = (
  state: TemporalReplayFooterTransientState
) => void;
export type ReplayFooterTransientState = TemporalReplayFooterTransientState;
export type ReplayFooterTransientListener = TemporalReplayFooterTransientListener;

export interface DemolishHourglassTransientState {
  remainingSeconds: number;
  totalSeconds: number;
  active?: boolean;
  alwaysVisible?: boolean;
}
export type DemolishHourglassTransientListener = (
  state: DemolishHourglassTransientState
) => void;
export type RespawnTimerTransientState = DemolishHourglassTransientState;
export type RespawnTimerTransientListener = DemolishHourglassTransientListener;

export interface PitchMiniMapBallHitTransientEvent {
  id: number;
  normX: number;
  normY: number;
  speedKph: number;
  isMyTeam: boolean;
}

export interface PitchMiniMapTransientState {
  ballX: number;
  ballY: number;
  ballHitKph: number;
  isFlipped: boolean;
  flip180?: boolean;
  ballNormX?: number;
  ballNormY?: number;
  lastHitEvent?: PitchMiniMapBallHitTransientEvent;
}
export type PitchMiniMapTransientListener = (state: PitchMiniMapTransientState) => void;
export type MiniMapTransientState = PitchMiniMapTransientState;
export type MiniMapTransientListener = PitchMiniMapTransientListener;

export interface KickoffCountdownFlashTransientState {
  value: 4 | 3 | 2 | 1 | 0 | null;
  digit?: string;
  color?: string;
  sequenceId?: number;
}
export type KickoffCountdownFlashTransientListener = (
  state: KickoffCountdownFlashTransientState
) => void;
export type CountdownFlashTransientState = KickoffCountdownFlashTransientState;
export type CountdownFlashTransientListener = KickoffCountdownFlashTransientListener;
