import { create } from 'zustand';
import {
  getInitialKickoffWsOffset,
  saveKickoffWsOffset,
  KICKOFF_SPAWNS as CONFIG_KICKOFF_SPAWNS,
} from '../config/trainingDefaults';

export interface KickoffSpawnMeta {
  index: number;
  key: string;
  id: string;
  label: string;
  shortLabel: string;
  x: number;
  y: number;
}

export const KICKOFF_SPAWNS: KickoffSpawnMeta[] = CONFIG_KICKOFF_SPAWNS;

export type KickoffSubMode = 'instant' | 'easy-learning' | 'realistic';
export type KickoffSpeedPreset = '100' | '50' | '25' | '75' | 'custom';
export type KickoffGhostPlacement = 'same' | 'opposite';
export type KickoffOverlayKey = 'Shift' | 'Q' | 'A' | 'W' | 'S' | 'D' | 'E' | 'Boost' | 'Jump';

export const KICKOFF_OVERLAY_KEY_ORDER: KickoffOverlayKey[] = [
  'Shift',
  'Q',
  'A',
  'W',
  'S',
  'D',
  'E',
  'Boost',
  'Jump',
];

export interface KickoffNoteBar {
  key: KickoffOverlayKey;
  startTick: number;
  endTick: number;
  startStep: number;
  endStep: number;
}

export interface KickoffTimelineStep {
  step: number;
  startTick: number;
  endTick: number;
  action: number[];
  keys: Record<KickoffOverlayKey, boolean>;
  keyStr: string;
}

export interface KickoffTimelineData {
  spawnIndex: number;
  steps: KickoffTimelineStep[];
  noteBars: KickoffNoteBar[];
  touchTick: number;
  touchStep: number;
}

const EMPTY_KEYS: Record<KickoffOverlayKey, boolean> = {
  Shift: false,
  Q: false,
  A: false,
  W: false,
  S: false,
  D: false,
  E: false,
  Boost: false,
  Jump: false,
};

function getInitialWsOffset(): number {
  return getInitialKickoffWsOffset();
}

export function resolvePhysicsRateFromPreset(preset: KickoffSpeedPreset, customTicks: number): number {
  switch (preset) {
    case '100':
      return 120;
    case '50':
      return 60;
    case '25':
      return 30;
    case '75':
      return 90;
    case 'custom':
    default:
      return Math.max(1, Math.min(120, Math.round(customTicks)));
  }
}

export interface KickoffTrainingState {
  // User-adjustable configuration
  subMode: KickoffSubMode;
  spawnIndex: number; // 0..4 (keys 1..5)
  speedPreset: KickoffSpeedPreset; // '100' | '50' | '25' | '75' | 'custom'
  customPhysicsRate: number; // 1..120 (N/120 speed)
  effectivePhysicsRate: number; // 1..120
  realisticWaitTicks: number; // 30..480 in steps of 30 (0.25s..4.00s)
  ghostPlacement: KickoffGhostPlacement; // 'same' (default) | 'opposite'
  ghostModeEnabled: boolean; // true = Holographic Ghost (default), false = Solid Physical Car (collision enabled)
  showGhostCar: boolean;
  showGhostBall: boolean;
  showKeyboardOverlay: boolean;
  showFallingNotes: boolean;
  wsVerticalOffsetPct: number; // 0..50%, default 10%

  // Live episode state
  phase: 'waiting-for-input' | 'countdown' | 'running' | 'paused-mismatch' | 'completed';
  episodeTick: number;
  decisionStep: number;
  countdownRemainingTicks: number;
  requiredAction: number[];
  requiredKeys: Record<KickoffOverlayKey, boolean>;
  requiredKeyStr: string;
  playerAction: number[];
  playerKeys: Record<KickoffOverlayKey, boolean>;
  isInputMatching: boolean;
  timeline: KickoffTimelineData | null;
  aiTouchTick: number | null;
  playerTouchTick: number | null;
  lastDeltaTicks: number | null;

  // Actions
  setSubMode: (subMode: KickoffSubMode) => void;
  setSpawnIndex: (spawnIndex: number) => void;
  setSpeedPreset: (preset: KickoffSpeedPreset) => void;
  setCustomPhysicsRate: (rate: number) => void;
  setRealisticWaitTicks: (ticks: number) => void;
  setGhostPlacement: (placement: KickoffGhostPlacement) => void;
  setGhostModeEnabled: (enabled: boolean) => void;
  setShowGhostCar: (show: boolean) => void;
  setShowGhostBall: (show: boolean) => void;
  setShowKeyboardOverlay: (show: boolean) => void;
  setShowFallingNotes: (show: boolean) => void;
  setWsVerticalOffsetPct: (pct: number) => void;
  resetToEntryDefaults: () => void;
  triggerResetSpawn: () => void;
  updateLiveState: (patch: Partial<KickoffTrainingState>) => void;

  // Runtime callbacks
  runtimeHandlers: {
    onSelectSpawn?: (spawnIndex: number) => void;
    onResetSpawn?: () => void;
    onSubModeChange?: (subMode: KickoffSubMode) => void;
    onSpeedChange?: (physicsRate: number) => void;
    onRealisticWaitChange?: (ticks: number) => void;
    onGhostPlacementChange?: (placement: KickoffGhostPlacement) => void;
    onGhostModeChange?: (enabled: boolean) => void;
    onGhostVisibilityChange?: (showCar: boolean, showBall: boolean) => void;
  };
  setRuntimeHandlers: (handlers: Partial<KickoffTrainingState['runtimeHandlers']>) => void;
}

export const useKickoffTrainingStore = create<KickoffTrainingState>((set, get) => ({
  subMode: 'instant',
  spawnIndex: 0,
  speedPreset: '100',
  customPhysicsRate: 60,
  effectivePhysicsRate: 120,
  realisticWaitTicks: 480,
  ghostPlacement: 'same',
  ghostModeEnabled: true,
  showGhostCar: true,
  showGhostBall: true,
  showKeyboardOverlay: true,
  showFallingNotes: true,
  wsVerticalOffsetPct: getInitialWsOffset(),

  phase: 'waiting-for-input',
  episodeTick: 0,
  decisionStep: 0,
  countdownRemainingTicks: 0,
  requiredAction: [1, 1, 1, 0, 0, 0],
  requiredKeys: { ...EMPTY_KEYS },
  requiredKeyStr: 'W + Boost',
  playerAction: [1, 1, 1, 0, 0, 0],
  playerKeys: { ...EMPTY_KEYS },
  isInputMatching: true,
  timeline: null,
  aiTouchTick: null,
  playerTouchTick: null,
  lastDeltaTicks: null,

  runtimeHandlers: new Proxy({} as KickoffTrainingState['runtimeHandlers'], {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      if (typeof val === 'function') {
        return val;
      }
      if (typeof prop === 'string' && prop.startsWith('on')) {
        return (..._args: unknown[]) => {
          console.warn(
            `[kickoffTrainingStore] Runtime handler "${prop}" was invoked before KickoffTrainingMode registered its handlers.`
          );
        };
      }
      return val;
    },
  }),
  setRuntimeHandlers: (handlers) =>
    set((s) => {
      const merged = { ...s.runtimeHandlers, ...handlers };
      return {
        runtimeHandlers: new Proxy(merged, {
          get(target, prop, receiver) {
            const val = Reflect.get(target, prop, receiver);
            if (typeof val === 'function') {
              return val;
            }
            if (typeof prop === 'string' && prop.startsWith('on')) {
              return (..._args: unknown[]) => {
                console.warn(
                  `[kickoffTrainingStore] Runtime handler "${prop}" is not registered.`
                );
              };
            }
            return val;
          },
        }),
      };
    }),

  setSubMode: (subMode) => {
    set({ subMode });
    get().runtimeHandlers.onSubModeChange?.(subMode);
  },

  setSpawnIndex: (spawnIndex) => {
    const clamped = Math.max(0, Math.min(4, Math.round(spawnIndex)));
    // Position 3 (Center Back, index 2) has no axis-symmetric partner on the same side when Ghost Mode is off
    if (!get().ghostModeEnabled && get().ghostPlacement === 'same' && clamped === 2) {
      return;
    }
    set({ spawnIndex: clamped });
    get().runtimeHandlers.onSelectSpawn?.(clamped);
  },

  setSpeedPreset: (speedPreset) => {
    const rate = resolvePhysicsRateFromPreset(speedPreset, get().customPhysicsRate);
    set({ speedPreset, effectivePhysicsRate: rate });
    get().runtimeHandlers.onSpeedChange?.(rate);
  },

  setCustomPhysicsRate: (rate) => {
    const clamped = Math.max(1, Math.min(120, Math.round(rate)));
    const effective = get().speedPreset === 'custom' ? clamped : get().effectivePhysicsRate;
    set({ customPhysicsRate: clamped, effectivePhysicsRate: effective });
    if (get().speedPreset === 'custom') {
      get().runtimeHandlers.onSpeedChange?.(clamped);
    }
  },

  setRealisticWaitTicks: (ticks) => {
    // Step of 30 frames (0.25s), clamped to [30, 480] (0.25s .. 4.00s)
    const stepped = Math.max(30, Math.min(480, Math.round(ticks / 30) * 30));
    set({ realisticWaitTicks: stepped });
    get().runtimeHandlers.onRealisticWaitChange?.(stepped);
  },

  setGhostPlacement: (ghostPlacement) => {
    const state = get();
    // If switching to Same Side while Ghost Mode is OFF and currently on Spawn 3 (CB, index 2),
    // move to Spawn 1 (LF, index 0) so the two solid cars do not overlap.
    if (ghostPlacement === 'same' && !state.ghostModeEnabled && state.spawnIndex === 2) {
      set({ ghostPlacement, spawnIndex: 0 });
    } else {
      set({ ghostPlacement });
    }
    get().runtimeHandlers.onGhostPlacementChange?.(ghostPlacement);
  },

  setGhostModeEnabled: (ghostModeEnabled) => {
    const state = get();
    // If disabling Ghost Mode while on Same Side at Spawn 3 (CB, index 2),
    // move to Spawn 1 (LF, index 0) because Spawn 3 has no axis-symmetric partner on the same half.
    if (!ghostModeEnabled && state.ghostPlacement === 'same' && state.spawnIndex === 2) {
      set({ ghostModeEnabled, spawnIndex: 0 });
    } else {
      set({ ghostModeEnabled });
    }
    get().runtimeHandlers.onGhostModeChange?.(ghostModeEnabled);
  },

  setShowGhostCar: (showGhostCar) => {
    set({ showGhostCar });
    get().runtimeHandlers.onGhostVisibilityChange?.(showGhostCar, get().showGhostBall);
  },

  setShowGhostBall: (showGhostBall) => {
    set({ showGhostBall });
    get().runtimeHandlers.onGhostVisibilityChange?.(get().showGhostCar, showGhostBall);
  },

  setShowKeyboardOverlay: (showKeyboardOverlay) => set({ showKeyboardOverlay }),
  setShowFallingNotes: (showFallingNotes) => set({ showFallingNotes }),

  setWsVerticalOffsetPct: (pct) => {
    const clamped = Math.max(0, Math.min(50, Math.round(pct)));
    saveKickoffWsOffset(clamped);
    set({ wsVerticalOffsetPct: clamped });
  },

  resetToEntryDefaults: () => {
    set({
      subMode: 'instant',
      ghostPlacement: 'same',
      ghostModeEnabled: true,
      phase: 'waiting-for-input',
      episodeTick: 0,
      decisionStep: 0,
      countdownRemainingTicks: 0,
      playerTouchTick: null,
      lastDeltaTicks: null,
    });
  },

  triggerResetSpawn: () => {
    get().runtimeHandlers.onResetSpawn?.();
  },

  updateLiveState: (patch) => set((s) => ({ ...s, ...patch })),
}));
