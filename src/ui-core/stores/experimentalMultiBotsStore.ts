import { create } from 'zustand';
import {
  buildTeamSlotsFromColorPrefs,
  type ExpBotPolicyId,
  type ExpSubMode,
  type ExpRosterSnapshot,
  type ExpPlayerParticipation,
  type ExpSpeedMultiplier,
  type ExperimentalMultiBotsSlotConfig,
  type ExpSpawnedCarInfo,
} from './experimentalMultiBotsRosterUtils';
import {
  createExperimentalMultiBotsRuntimeHandlersProxy,
  computeActivateMultiBotsTransition,
  computeConfigureExhibitionTransition,
  computeSyncExhibitionFromColorPrefsTransition,
  computeSetPlayerParticipationTransition,
  computeAddBotToTeamTransition,
  computeRemoveSlotFromTeamTransition,
  computeSetSlotBotTypeTransition,
  computeSetSlotColorTransition,
  computeApplyPresetRosterTransition,
  computeApplyAsymmetricPresetRosterTransition,
  computeApplyBotpackShowcaseTransition,
  type ExperimentalMultiBotsRuntimeHandlers,
} from './experimentalMultiBotsStateTransitions';

export interface ExperimentalMultiBotsState {
  // Roster & Player Configuration
  activeSubMode: ExpSubMode;
  savedMultiBotsRoster: ExpRosterSnapshot;
  savedBotpackModel: ExpBotPolicyId;
  playerParticipation: ExpPlayerParticipation; // 'none' (Spectate Bots), 'blue', or 'orange'
  blueSlots: ExperimentalMultiBotsSlotConfig[]; // Up to 5 slots on Team Blue (0)
  orangeSlots: ExperimentalMultiBotsSlotConfig[]; // Up to 5 slots on Team Orange (1)
  activeBotpackShowcaseModel: ExpBotPolicyId | null;

  // Camera & Match Settings
  isExhibitionMode: boolean;
  exhibitionTeamSize: 'solo' | 'double' | 'standard';
  exhibitionBotId: ExpBotPolicyId;
  activeCameraCarIndex: number; // 0..5 (switched via keys 1..6 when no player or spectating)
  matchDurationSec: number;
  speedMultiplier: ExpSpeedMultiplier;
  unlimitedBoost: boolean;
  disableGoalReplay: boolean;

  // Live Match & Telemetry State
  matchActive: boolean;
  matchPhase: string;
  kickoffCountdownSec: number;
  blueScore: number;
  orangeScore: number;
  remainingSec: number;
  isOvertime: boolean;
  nextoLoaded: boolean;
  nectoLoaded: boolean;
  lastTotalInferenceMs: number;
  spawnedCars: ExpSpawnedCarInfo[];

  // Actions
  setIsExhibitionMode: (isExhibition: boolean) => void;
  activateMultiBotsSubMode: (restartIfActive?: boolean) => void;
  activateBotpackSubMode: (botType?: ExpBotPolicyId, restartIfActive?: boolean) => void;
  configureExhibitionMatch: (
    botId: ExpBotPolicyId,
    durationSec?: number,
    teamSize?: 'solo' | 'double' | 'standard'
  ) => void;
  syncExhibitionFromColorPrefs: (triggerRuntime?: boolean) => void;
  setPlayerParticipation: (participation: ExpPlayerParticipation) => void;
  addBotToTeam: (team: 0 | 1, botType?: ExpBotPolicyId) => void;
  removeSlotFromTeam: (team: 0 | 1, slotIndex: number) => void;
  setSlotBotType: (team: 0 | 1, slotIndex: number, botType: ExpBotPolicyId) => void;
  setSlotColor: (team: 0 | 1, slotIndex: number, colorSlot: number) => void;
  applyPresetRoster: (
    preset: '1v1-player' | '2v2-player' | '3v3-player' | '1v1-bots' | '2v2-bots' | '3v3-bots'
  ) => void;
  applyAsymmetricPresetRoster: (
    blueCount: number,
    orangeCount: number,
    participationOverride?: ExpPlayerParticipation
  ) => void;
  applyBotpack9700488Showcase: (botType: ExpBotPolicyId, restartIfActive?: boolean) => void;
  setMatchDurationSec: (sec: number) => void;
  setActiveCameraCarIndex: (carIndex: number) => void;
  setSpeedMultiplier: (mult: ExpSpeedMultiplier) => void;
  setUnlimitedBoost: (unlimited: boolean) => void;
  setDisableGoalReplay: (disable: boolean) => void;
  startOrApplyMatch: () => void;
  triggerSandboxAction: (
    action: 'reset_kickoff' | 'score_blue' | 'score_orange' | 'force_overtime' | 'end_match'
  ) => void;
  preloadEngines?: () => void;
  updateLiveTelemetry: (patch: Partial<ExperimentalMultiBotsState>) => void;

  // Runtime Bridge Handlers
  runtimeHandlers: ExperimentalMultiBotsRuntimeHandlers;
  setRuntimeHandlers: (handlers: Partial<ExperimentalMultiBotsRuntimeHandlers>) => void;
}

const initialRoster = buildTeamSlotsFromColorPrefs(3, ['nexto', 'necto', 'nexto']);

export const useExperimentalMultiBotsStore = create<ExperimentalMultiBotsState>((set, get) => ({
  activeSubMode: 'multi-bots',
  savedMultiBotsRoster: initialRoster,
  savedBotpackModel: 'chronos',
  playerParticipation: initialRoster.playerParticipation,
  blueSlots: initialRoster.blueSlots,
  orangeSlots: initialRoster.orangeSlots,
  activeBotpackShowcaseModel: null,

  isExhibitionMode: false,
  exhibitionTeamSize: 'standard',
  exhibitionBotId: 'necto',
  activeCameraCarIndex: initialRoster.activeCameraCarIndex,
  matchDurationSec: 90,
  speedMultiplier: 100,
  unlimitedBoost: false,
  disableGoalReplay: false,

  matchActive: false,
  matchPhase: 'kickoff (3)',
  kickoffCountdownSec: 3,
  blueScore: 0,
  orangeScore: 0,
  remainingSec: 90,
  isOvertime: false,
  nextoLoaded: false,
  nectoLoaded: false,
  lastTotalInferenceMs: 0,
  spawnedCars: [],

  runtimeHandlers: createExperimentalMultiBotsRuntimeHandlersProxy(
    {},
    'was invoked before ExperimentalMultiBotsMode registered its handlers.'
  ),
  setRuntimeHandlers: (handlers) =>
    set((s) => ({
      runtimeHandlers: createExperimentalMultiBotsRuntimeHandlersProxy(
        { ...s.runtimeHandlers, ...handlers },
        'is not registered in the current mode.'
      ),
    })),

  setIsExhibitionMode: (isExhibitionMode) =>
    set((s) => ({
      isExhibitionMode,
      activeSubMode: isExhibitionMode
        ? 'exhibition'
        : s.activeSubMode === 'exhibition'
        ? 'multi-bots'
        : s.activeSubMode,
    })),

  activateMultiBotsSubMode: (restartIfActive = false) => {
    set(computeActivateMultiBotsTransition(get()));
    get().runtimeHandlers.onPreloadEngines?.();
    if (restartIfActive && get().matchActive) {
      get().runtimeHandlers.onApplyRosterAndStart?.();
    }
  },

  activateBotpackSubMode: (botType, restartIfActive = false) => {
    const state = get();
    const targetBot =
      botType ?? state.activeBotpackShowcaseModel ?? state.savedBotpackModel ?? 'chronos';
    get().applyBotpack9700488Showcase(targetBot, restartIfActive);
  },

  configureExhibitionMatch: (botId = 'necto', durationSec = 90, teamSize = 'standard') => {
    set(computeConfigureExhibitionTransition(get(), botId, durationSec, teamSize));
  },

  syncExhibitionFromColorPrefs: (triggerRuntime = true) => {
    const state = get();
    const { patch, participationChanged, nextParticipation, hotSwapColorSlot } =
      computeSyncExhibitionFromColorPrefsTransition(state);
    set(patch);

    if (triggerRuntime && state.matchActive) {
      if (participationChanged) {
        get().runtimeHandlers.onApplyRosterAndStart?.();
      } else {
        get().runtimeHandlers.onHotSwapSlotColor?.(
          nextParticipation === 'orange' ? 1 : 0,
          0,
          hotSwapColorSlot
        );
      }
    }
  },

  setPlayerParticipation: (playerParticipation) => {
    set(computeSetPlayerParticipationTransition(get(), playerParticipation));
    if (get().matchActive) {
      get().runtimeHandlers.onApplyRosterAndStart?.();
    }
  },

  addBotToTeam: (team, botType = 'nexto') => {
    const patch = computeAddBotToTeamTransition(get(), team, botType);
    if (!patch) return;
    set(patch);
    get().runtimeHandlers.onPreloadEngines?.();
    if (get().matchActive) {
      get().runtimeHandlers.onApplyRosterAndStart?.();
    }
  },

  removeSlotFromTeam: (team, slotIndex) => {
    const patch = computeRemoveSlotFromTeamTransition(get(), team, slotIndex);
    if (!patch) return;
    set(patch);
    if (get().matchActive) {
      get().runtimeHandlers.onApplyRosterAndStart?.();
    }
  },

  setSlotBotType: (team, slotIndex, botType) => {
    set(computeSetSlotBotTypeTransition(get(), team, slotIndex, botType));
    get().runtimeHandlers.onPreloadEngines?.();
    if (get().matchActive) {
      get().runtimeHandlers.onApplyRosterAndStart?.();
    }
  },

  setSlotColor: (team, slotIndex, colorSlot) => {
    const patch = computeSetSlotColorTransition(get(), team, slotIndex, colorSlot);
    if (!patch) return;
    set(patch);
    get().runtimeHandlers.onHotSwapSlotColor?.(team, slotIndex, colorSlot);
  },

  applyPresetRoster: (preset) => {
    set(computeApplyPresetRosterTransition(preset));
    if (get().matchActive) {
      get().runtimeHandlers.onApplyRosterAndStart?.();
    }
  },

  applyAsymmetricPresetRoster: (blueCount, orangeCount, participationOverride) => {
    set(
      computeApplyAsymmetricPresetRosterTransition(
        get(),
        blueCount,
        orangeCount,
        participationOverride
      )
    );
    get().runtimeHandlers.onPreloadEngines?.();
    if (get().matchActive) {
      get().runtimeHandlers.onApplyRosterAndStart?.();
    }
  },

  applyBotpack9700488Showcase: (botType, restartIfActive = true) => {
    set(computeApplyBotpackShowcaseTransition(get(), botType));
    get().runtimeHandlers.onPreloadEngines?.();
    if (restartIfActive && get().matchActive) {
      get().runtimeHandlers.onApplyRosterAndStart?.();
    }
  },

  setMatchDurationSec: (sec) => {
    const clamped = Math.max(0, Math.min(900, Math.round(Number(sec) || 0)));
    set({ matchDurationSec: clamped });
  },

  setActiveCameraCarIndex: (carIndex) => {
    const state = get();
    const maxCars = Math.max(
      1,
      state.spawnedCars.length || state.blueSlots.length + state.orangeSlots.length
    );
    const clamped = Math.max(0, Math.min(maxCars - 1, carIndex));
    set({ activeCameraCarIndex: clamped });
    get().runtimeHandlers.onSelectCameraCar?.(clamped);
  },

  setSpeedMultiplier: (speedMultiplier) => {
    set({ speedMultiplier });
    get().runtimeHandlers.onSpeedMultiplierChange?.(speedMultiplier);
  },

  setUnlimitedBoost: (unlimitedBoost) => {
    set({ unlimitedBoost });
    get().runtimeHandlers.onUnlimitedBoostChange?.(unlimitedBoost);
  },

  setDisableGoalReplay: (disableGoalReplay) => {
    set({ disableGoalReplay });
  },

  startOrApplyMatch: () => {
    get().runtimeHandlers.onApplyRosterAndStart?.();
  },

  triggerSandboxAction: (action) => {
    get().runtimeHandlers.onTriggerAction?.(action);
  },

  preloadEngines: () => {
    get().runtimeHandlers.onPreloadEngines?.();
  },

  updateLiveTelemetry: (patch) => set((s) => ({ ...s, ...patch })),
}));
