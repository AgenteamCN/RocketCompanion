import { create } from 'zustand';
import { formatBindingDisplayName } from '../config/inputBindingValidators';
import { loadInputBindings } from '../config/inputBindings';
import type { InputBindingsConfig } from '../config/inputBindingValidators';
import { globalHudTransientChannel } from './hudTransientChannel';
import type { MatchHudChoreographySignal } from './hudTransientTypes';

export type HudFlipStatus = 'grounded' | 'countdown' | 'unlimited' | 'expired' | 'none';
export type HudCameraMode =
  | 'pov'
  | 'wasmPov'
  | 'rearView'
  | 'free'
  | 'director'
  | 'podium';

export interface HudStoreState {
  // Ball Camera & Camera Focus State
  ballCamActive: boolean;
  ballCamShortcut: string | null;
  cameraMode: HudCameraMode;
  focusedCarIndex: number;
  onToggleBallCam: (() => void) | null;

  // Boost, Flip & Speed Inventory
  boostAmount: number;
  isBoosting: boolean;
  isUnlimited: boolean;
  hasFlip: boolean;
  flipStatus: HudFlipStatus;
  flipRemainingSeconds: number;
  flipsRemaining: number;
  carSpeed: number;

  // Demolish & Respawn Telemetry
  isDemoed: boolean;
  demoRespawnTimer: number;
  demoSpawnSelection: number;

  // Match & Scoreboard State
  localTeam: 0 | 1;
  blueScore: number;
  orangeScore: number;
  remainingSeconds: number;
  overtimeSeconds: number;
  isOvertime: boolean;
  isPaused?: boolean;
  kickoffCountdown: number; // 0: inactive, 1..3: countdown ticks
  matchPhase: 'lobby' | 'warmup' | 'prepare' | 'kickoff' | 'playing' | 'goal' | 'replay' | 'paused' | 'ended' | 'podium' | 'freeplay';
  choreographySignal: MatchHudChoreographySignal;
  winner?: number | string | null; // 0/'BLUE': Blue, 1/'ORANGE': Orange, 2/'DRAW': Draw
  winReason?: string | null;

  // Replay Timeline Scrubbing & Goal Telemetry State
  replayProgress: number;
  replayFrameIndex: number;
  replayTotalFrames: number;
  replayPaused: boolean;
  replayPersistent: boolean;
  replaySpeed: number;
  replayCameraMode: 'director' | 'pov';
  replayScorerName: string | null;
  replayScorerTeam: number | null;
  replayScorerAnthemId: string | null;
  replayBallSpeedKph: number | null;
  replayAssistName: string | null;
  onReplaySeekNormalized?: ((progress01: number) => void) | null;
  onReplayTogglePause?: (() => void) | null;
  onReplayCycleSpeed?: (() => void) | null;
  onReplayToggleCameraMode?: (() => void) | null;
  onReplaySelectPovCar?: ((carIndex: number | null) => void) | null;

  // Mutator Actions
  setBallCamActive: (active: boolean) => void;
  setBallCamShortcut: (shortcut: string | null) => void;
  setCameraFocusState: (cameraMode: HudCameraMode, focusedCarIndex: number) => void;
  syncBindings: (bindings: Partial<InputBindingsConfig> | null | undefined) => void;
  setOnToggleBallCam: (fn: (() => void) | null) => void;
  toggleBallCam: () => void;
  setBoost: (amount: number, isBoosting?: boolean, isUnlimited?: boolean) => void;
  setHasFlip: (hasFlip: boolean, flipStatus?: HudFlipStatus, flipRemainingSeconds?: number, flipsRemaining?: number) => void;
  setDemoRespawnState: (isDemoed: boolean, demoRespawnTimer?: number, demoSpawnSelection?: number) => void;
  setCarSpeed: (speed: number) => void;
  setChoreographySignal: (signal: MatchHudChoreographySignal) => void;
  setReplayState: (state: Partial<{
    replayProgress: number;
    replayFrameIndex: number;
    replayTotalFrames: number;
    replayPaused: boolean;
    replayPersistent: boolean;
    replaySpeed: number;
    replayCameraMode: 'director' | 'pov';
    replayScorerName: string | null;
    replayScorerTeam: number | null;
    replayScorerAnthemId: string | null;
    replayBallSpeedKph: number | null;
    replayAssistName: string | null;
    onReplaySeekNormalized: ((progress01: number) => void) | null;
    onReplayTogglePause: ((() => void) | null);
    onReplayCycleSpeed: ((() => void) | null);
    onReplayToggleCameraMode: ((() => void) | null);
    onReplaySelectPovCar: (((carIndex: number | null) => void) | null);
  }>) => void;
  clearReplayState: () => void;
  setMatchState: (state: Partial<{
    localTeam: 0 | 1;
    blueScore: number;
    orangeScore: number;
    remainingSeconds: number;
    overtimeSeconds: number;
    isOvertime: boolean;
    isPaused?: boolean;
    kickoffCountdown: number;
    matchPhase: 'lobby' | 'warmup' | 'prepare' | 'kickoff' | 'playing' | 'goal' | 'replay' | 'paused' | 'ended' | 'podium' | 'freeplay';
    choreographySignal?: MatchHudChoreographySignal;
    winner?: number | string | null;
    winReason?: string | null;
    replayScorerName?: string | null;
    replayScorerTeam?: number | null;
    replayScorerAnthemId?: string | null;
    replayBallSpeedKph?: number | null;
    replayAssistName?: string | null;
  }>) => void;
}

/**
 * Extracts the first bound key or button display name for ballCam action.
 * Returns null if no binding is present, or formatted uppercase name (e.g. 'SPACE', 'C', 'L SHIFT', 'Y').
 */
export function extractFirstBallCamShortcut(
  bindings: Partial<InputBindingsConfig> | null | undefined
): string | null {
  if (!bindings) return 'SPACE';
  const kList = bindings.keyboard?.ballCam;
  if (Array.isArray(kList) && kList.length > 0 && kList[0]) {
    const name = formatBindingDisplayName(kList[0]);
    if (name) return name.toUpperCase();
  }
  const pList = bindings.pad?.ballCam;
  if (Array.isArray(pList) && pList.length > 0 && pList[0]) {
    const name = formatBindingDisplayName(pList[0]);
    if (name) return name.toUpperCase();
  }
  return null;
}

function getInitialBallCamShortcut(): string | null {
  if (typeof window === 'undefined') return 'SPACE';
  try {
    const initialBindings = loadInputBindings();
    return extractFirstBallCamShortcut(initialBindings) ?? 'SPACE';
  } catch (err) {
    console.warn('[hudStore] Failed to parse input bindings for ball-cam shortcut, falling back to SPACE:', err);
    return 'SPACE';
  }
}

/**
 * useHudStore / hudStore
 * High-performance decoupled Zustand state store for Match HUD elements.
 * Features zero-allocation dirty checking to ensure minimum React re-renders.
 */
export const useHudStore = create<HudStoreState>((set, get) => ({
  ballCamActive: true,
  ballCamShortcut: getInitialBallCamShortcut(),
  cameraMode: 'pov',
  focusedCarIndex: 0,
  onToggleBallCam: null,

  boostAmount: 100,
  isBoosting: false,
  isUnlimited: true,
  hasFlip: true,
  flipStatus: 'grounded',
  flipRemainingSeconds: 1.25,
  flipsRemaining: 1,
  carSpeed: 0,

  isDemoed: false,
  demoRespawnTimer: 0,
  demoSpawnSelection: -1,

  localTeam: 0,
  blueScore: 0,
  orangeScore: 0,
  remainingSeconds: 300,
  overtimeSeconds: 0,
  isOvertime: false,
  isPaused: false,
  kickoffCountdown: 0,
  matchPhase: 'warmup',
  choreographySignal: 'kickoff-will-start',
  winner: null,
  winReason: null,

  replayProgress: 0,
  replayFrameIndex: 0,
  replayTotalFrames: 360,
  replayPaused: false,
  replayPersistent: false,
  replaySpeed: 1.0,
  replayCameraMode: 'director',
  replayScorerName: null,
  replayScorerTeam: null,
  replayScorerAnthemId: null,
  replayBallSpeedKph: null,
  replayAssistName: null,
  onReplaySeekNormalized: null,
  onReplayTogglePause: null,
  onReplayCycleSpeed: null,
  onReplayToggleCameraMode: null,
  onReplaySelectPovCar: null,

  setBallCamActive: (active: boolean) => {
    const val = Boolean(active);
    globalHudTransientChannel.setBallCamActive(val);
    if (get().ballCamActive === val) return;
    set({ ballCamActive: val });
  },

  setBallCamShortcut: (shortcut: string | null) => {
    if (get().ballCamShortcut === shortcut) return;
    set({ ballCamShortcut: shortcut });
  },

  setCameraFocusState: (cameraMode: HudCameraMode, focusedCarIndex: number) => {
    const current = get();
    if (current.cameraMode === cameraMode && current.focusedCarIndex === focusedCarIndex) {
      return;
    }
    set({ cameraMode, focusedCarIndex });
  },

  syncBindings: (bindings: Partial<InputBindingsConfig> | null | undefined) => {
    const shortcut = extractFirstBallCamShortcut(bindings);
    if (get().ballCamShortcut === shortcut) return;
    set({ ballCamShortcut: shortcut });
  },

  setOnToggleBallCam: (fn: (() => void) | null) => {
    set({ onToggleBallCam: fn });
  },

  toggleBallCam: () => {
    const fn = get().onToggleBallCam;
    if (typeof fn === 'function') {
      fn();
    }
  },

  setBoost: (amount: number, isBoosting = false, isUnlimited = false) => {
    const clamped = Math.max(0, Math.min(100, Math.round(amount)));
    const unlim = Boolean(isUnlimited);
    globalHudTransientChannel.setBoost(clamped, unlim);
    const cur = get();
    if (
      cur.boostAmount === clamped &&
      cur.isBoosting === isBoosting &&
      cur.isUnlimited === unlim
    ) {
      return;
    }
    set({
      boostAmount: clamped,
      isBoosting,
      isUnlimited: unlim,
    });
  },

  setHasFlip: (
    hasFlip: boolean,
    flipStatus: HudFlipStatus = hasFlip ? 'grounded' : 'expired',
    flipRemainingSeconds = hasFlip ? 1.25 : 0,
    flipsRemaining = hasFlip ? 1 : 0
  ) => {
    const val = Boolean(hasFlip);
    const roundedRem = Math.max(0, Math.round((Number(flipRemainingSeconds) || 0) * 1000) / 1000);
    const flipsCount = Math.trunc(Number(flipsRemaining) || 0);
    globalHudTransientChannel.setFlip(val, flipStatus, roundedRem, 1.25, flipsCount);
    const cur = get();
    const quantizedRem = Math.round(roundedRem * 20) / 20;
    if (
      cur.hasFlip === val &&
      cur.flipStatus === flipStatus &&
      cur.flipsRemaining === flipsCount &&
      Math.abs(quantizedRem - cur.flipRemainingSeconds) < 1e-6
    ) {
      return;
    }
    set({
      hasFlip: val,
      flipStatus,
      flipRemainingSeconds: quantizedRem,
      flipsRemaining: flipsCount,
    });
  },

  setDemoRespawnState: (
    isDemoed: boolean,
    demoRespawnTimer = 0,
    demoSpawnSelection = -1
  ) => {
    const demoed = Boolean(isDemoed);
    const roundedTimer = demoed
      ? Math.max(0, Math.round((Number(demoRespawnTimer) || 0) * 1000) / 1000)
      : 0;
    const selection = demoed ? Math.trunc(Number(demoSpawnSelection) ?? -1) : -1;
    const isActive = demoed && roundedTimer > 0;
    globalHudTransientChannel.setRespawnTimer(isActive ? roundedTimer : 0, 3.0, isActive);
    const cur = get();
    const quantizedTimer = demoed ? Math.round(roundedTimer * 20) / 20 : 0;
    if (
      cur.isDemoed === demoed &&
      cur.demoSpawnSelection === selection &&
      Math.abs(quantizedTimer - cur.demoRespawnTimer) < 1e-6
    ) {
      return;
    }
    set({
      isDemoed: demoed,
      demoRespawnTimer: quantizedTimer,
      demoSpawnSelection: selection,
    });
  },

  setCarSpeed: (rawSpeed: number) => {
    const v = Math.max(0, Math.min(2300, Math.round(Math.abs(rawSpeed || 0) * 10) / 10));
    globalHudTransientChannel.setSpeed(v);
  },

  setChoreographySignal: (signal: MatchHudChoreographySignal) => {
    if (get().choreographySignal === signal) return;
    set({ choreographySignal: signal });
  },

  setReplayState: (partialReplay) => {
    const cur = get() as unknown as Record<string, unknown>;
    let hasChanges = false;
    for (const [k, v] of Object.entries(partialReplay)) {
      if (cur[k] !== v) {
        hasChanges = true;
        break;
      }
    }
    if (hasChanges) {
      set(partialReplay);
    }
  },

  clearReplayState: () => {
    set({
      replayProgress: 0,
      replayFrameIndex: 0,
      replayPaused: false,
      replayPersistent: false,
      replaySpeed: 1.0,
      replayCameraMode: 'director',
      replayScorerName: null,
      replayScorerTeam: null,
      replayScorerAnthemId: null,
      replayBallSpeedKph: null,
      replayAssistName: null,
      onReplaySeekNormalized: null,
      onReplayTogglePause: null,
      onReplayCycleSpeed: null,
      onReplayToggleCameraMode: null,
      onReplaySelectPovCar: null,
    });
  },

  setMatchState: (partialState) => {
    const cur = get();
    const nextPatch = { ...partialState };
    if (nextPatch.choreographySignal === undefined && nextPatch.matchPhase !== undefined) {
      if (nextPatch.matchPhase === 'goal') {
        nextPatch.choreographySignal = 'goal-replay-will-start';
      } else if (nextPatch.matchPhase === 'replay' && cur.matchPhase !== 'replay') {
        nextPatch.choreographySignal = 'goal-replay-started';
      } else if (
        nextPatch.matchPhase === 'kickoff' ||
        nextPatch.matchPhase === 'playing' ||
        nextPatch.matchPhase === 'warmup' ||
        nextPatch.matchPhase === 'prepare' ||
        nextPatch.matchPhase === 'freeplay'
      ) {
        nextPatch.choreographySignal = 'kickoff-will-start';
      }
    }
    const curRecord = cur as unknown as Record<string, unknown>;
    let hasChanges = false;
    for (const [k, v] of Object.entries(nextPatch)) {
      if (curRecord[k] !== v) {
        hasChanges = true;
        break;
      }
    }
    if (hasChanges) {
      set(nextPatch);
    }
  },
}));

export const hudStore = useHudStore;
