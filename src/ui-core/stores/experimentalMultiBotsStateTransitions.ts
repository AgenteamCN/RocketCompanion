import {
  getExpBotPolicyMeta,
  resolveGarageColorPrefs,
  buildTeamSlotsFromColorPrefs,
  buildAsymmetricTeamSlotsFromColorPrefs,
  pickUnusedColorSlot,
  normalizeTeamPlayerFlags,
  type ExpBotPolicyId,
  type ExpSubMode,
  type ExpRosterSnapshot,
  type ExpPlayerParticipation,
  type ExpSpeedMultiplier,
  type ExperimentalMultiBotsSlotConfig,
} from './experimentalMultiBotsRosterUtils';

export interface ExperimentalMultiBotsRuntimeHandlers {
  onApplyRosterAndStart?: () => void;
  onSelectCameraCar?: (carIndex: number) => void;
  onSpeedMultiplierChange?: (mult: ExpSpeedMultiplier) => void;
  onUnlimitedBoostChange?: (unlimited: boolean) => void;
  onTriggerAction?: (
    action: 'reset_kickoff' | 'score_blue' | 'score_orange' | 'force_overtime' | 'end_match'
  ) => void;
  onHotSwapSlotBotType?: (team: 0 | 1, slotIndex: number, botType: ExpBotPolicyId) => void;
  onHotSwapSlotColor?: (team: 0 | 1, slotIndex: number, colorSlot: number) => void;
  onPreloadEngines?: () => void;
}

export interface ExperimentalMultiBotsTransitionState {
  activeSubMode: ExpSubMode;
  savedMultiBotsRoster: ExpRosterSnapshot;
  savedBotpackModel: ExpBotPolicyId;
  playerParticipation: ExpPlayerParticipation;
  blueSlots: ExperimentalMultiBotsSlotConfig[];
  orangeSlots: ExperimentalMultiBotsSlotConfig[];
  activeBotpackShowcaseModel: ExpBotPolicyId | null;
  isExhibitionMode: boolean;
  exhibitionTeamSize: 'solo' | 'double' | 'standard';
  exhibitionBotId: ExpBotPolicyId;
  activeCameraCarIndex: number;
  matchDurationSec: number;
  remainingSec: number;
  speedMultiplier: ExpSpeedMultiplier;
  unlimitedBoost: boolean;
  disableGoalReplay: boolean;
}

export function createExperimentalMultiBotsRuntimeHandlersProxy(
  targetHandlers: ExperimentalMultiBotsRuntimeHandlers,
  unregisteredReason: string
): ExperimentalMultiBotsRuntimeHandlers {
  return new Proxy(targetHandlers, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      if (typeof val === 'function') {
        return val;
      }
      if (typeof prop === 'string' && prop.startsWith('on')) {
        return (..._args: unknown[]) => {
          const hasAnyRegisteredHostHandler = Object.values(target).some(
            (fn) => typeof fn === 'function'
          );
          if (!hasAnyRegisteredHostHandler || prop === 'onPreloadEngines') {
            return;
          }
          console.warn(
            `[experimentalMultiBotsStore] Runtime handler "${prop}" ${unregisteredReason}`
          );
        };
      }
      return val;
    },
  });
}

function snapshotCurrentMultiBotsRoster(
  state: Pick<
    ExperimentalMultiBotsTransitionState,
    | 'activeSubMode'
    | 'playerParticipation'
    | 'blueSlots'
    | 'orangeSlots'
    | 'activeCameraCarIndex'
    | 'savedMultiBotsRoster'
  >
): ExpRosterSnapshot {
  return state.activeSubMode === 'multi-bots'
    ? {
        playerParticipation: state.playerParticipation,
        blueSlots: state.blueSlots,
        orangeSlots: state.orangeSlots,
        activeCameraCarIndex: state.activeCameraCarIndex,
      }
    : state.savedMultiBotsRoster;
}

export function computeActivateMultiBotsTransition(
  state: ExperimentalMultiBotsTransitionState
): Partial<ExperimentalMultiBotsTransitionState> {
  const restored = snapshotCurrentMultiBotsRoster(state);
  return {
    activeSubMode: 'multi-bots',
    isExhibitionMode: false,
    activeBotpackShowcaseModel: null,
    playerParticipation: restored.playerParticipation,
    blueSlots: restored.blueSlots,
    orangeSlots: restored.orangeSlots,
    activeCameraCarIndex: restored.activeCameraCarIndex,
  };
}

export function computeConfigureExhibitionTransition(
  state: ExperimentalMultiBotsTransitionState,
  botId: ExpBotPolicyId = 'necto',
  durationSec = 90,
  teamSize: 'solo' | 'double' | 'standard' = 'standard'
): Partial<ExperimentalMultiBotsTransitionState> {
  const savedMultiBotsRoster = snapshotCurrentMultiBotsRoster(state);
  const resolvedBotId: ExpBotPolicyId = botId === 'nexto' ? 'nexto' : 'necto';
  const resolvedDuration = Math.max(30, Math.min(900, Math.round(Number(durationSec) || 90)));
  const countPerTeam = teamSize === 'standard' ? 3 : teamSize === 'double' ? 2 : 1;
  const roster = buildTeamSlotsFromColorPrefs(countPerTeam, resolvedBotId);

  return {
    activeSubMode: 'exhibition',
    savedMultiBotsRoster,
    isExhibitionMode: true,
    exhibitionTeamSize: teamSize,
    exhibitionBotId: resolvedBotId,
    playerParticipation: roster.playerParticipation,
    blueSlots: roster.blueSlots,
    orangeSlots: roster.orangeSlots,
    activeCameraCarIndex: roster.activeCameraCarIndex,
    matchDurationSec: resolvedDuration,
    remainingSec: resolvedDuration,
    speedMultiplier: 100,
    unlimitedBoost: false,
    disableGoalReplay: false,
  };
}

export function computeSyncExhibitionFromColorPrefsTransition(
  state: ExperimentalMultiBotsTransitionState
): {
  patch: Partial<ExperimentalMultiBotsTransitionState>;
  participationChanged: boolean;
  nextParticipation: ExpPlayerParticipation;
  hotSwapColorSlot: number;
} {
  const { primaryTeam, blueColors, orangeColors } = resolveGarageColorPrefs();
  const nextParticipation: ExpPlayerParticipation =
    state.playerParticipation === 'none' && !state.isExhibitionMode
      ? 'none'
      : primaryTeam;
  const prevParticipation = state.playerParticipation;

  const nextBlue = state.blueSlots.map((slot, i) => ({
    ...slot,
    team: 0 as const,
    isPlayer: nextParticipation === 'blue' && i === 0,
    colorSlot: blueColors[i] ?? slot.colorSlot,
  }));
  const nextOrange = state.orangeSlots.map((slot, i) => ({
    ...slot,
    team: 1 as const,
    isPlayer: nextParticipation === 'orange' && i === 0,
    colorSlot: orangeColors[i] ?? slot.colorSlot,
  }));
  const nextCamIdx =
    nextParticipation === 'orange'
      ? nextBlue.length
      : nextParticipation === 'blue'
      ? 0
      : state.activeCameraCarIndex;

  const nextRoster: ExpRosterSnapshot = {
    playerParticipation: nextParticipation,
    blueSlots: nextBlue,
    orangeSlots: nextOrange,
    activeCameraCarIndex: nextCamIdx,
  };

  return {
    patch: {
      ...nextRoster,
      savedMultiBotsRoster:
        state.activeSubMode === 'multi-bots' ? nextRoster : state.savedMultiBotsRoster,
    },
    participationChanged: prevParticipation !== nextParticipation,
    nextParticipation,
    hotSwapColorSlot:
      (nextParticipation === 'orange' ? nextOrange[0] : nextBlue[0])?.colorSlot ?? 3,
  };
}

export function computeSetPlayerParticipationTransition(
  state: ExperimentalMultiBotsTransitionState,
  playerParticipation: ExpPlayerParticipation
): Partial<ExperimentalMultiBotsTransitionState> {
  let blue = [...state.blueSlots];
  let orange = [...state.orangeSlots];

  if (playerParticipation === 'blue' && blue.length === 0) {
    blue = [
      {
        id: `blue-${Date.now()}`,
        team: 0,
        isPlayer: true,
        botType: 'nexto',
        colorSlot: pickUnusedColorSlot(blue, orange, 0),
      },
    ];
  } else if (playerParticipation === 'orange' && orange.length === 0) {
    orange = [
      {
        id: `orange-${Date.now()}`,
        team: 1,
        isPlayer: true,
        botType: 'nexto',
        colorSlot: pickUnusedColorSlot(blue, orange, 1),
      },
    ];
  }

  const normalized = normalizeTeamPlayerFlags(blue, orange, playerParticipation);
  const defaultCameraIdx =
    playerParticipation === 'orange' ? normalized.blueSlots.length : 0;

  const nextRoster: ExpRosterSnapshot = {
    playerParticipation,
    blueSlots: normalized.blueSlots,
    orangeSlots: normalized.orangeSlots,
    activeCameraCarIndex: defaultCameraIdx,
  };

  return {
    ...nextRoster,
    savedMultiBotsRoster:
      state.activeSubMode === 'multi-bots' ? nextRoster : state.savedMultiBotsRoster,
  };
}

export function computeAddBotToTeamTransition(
  state: ExperimentalMultiBotsTransitionState,
  team: 0 | 1,
  botType: ExpBotPolicyId = 'nexto'
): Partial<ExperimentalMultiBotsTransitionState> | null {
  const targetList = team === 0 ? state.blueSlots : state.orangeSlots;
  const totalCars = state.blueSlots.length + state.orangeSlots.length;
  if (targetList.length >= 5 || totalCars >= 6) return null;

  const newColor = pickUnusedColorSlot(state.blueSlots, state.orangeSlots, team);
  const newSlot: ExperimentalMultiBotsSlotConfig = {
    id: `${team === 0 ? 'blue' : 'orange'}-${Date.now()}-${targetList.length}`,
    team,
    isPlayer: false,
    botType,
    colorSlot: newColor,
  };

  const nextBlue = team === 0 ? [...state.blueSlots, newSlot] : [...state.blueSlots];
  const nextOrange = team === 1 ? [...state.orangeSlots, newSlot] : [...state.orangeSlots];
  const normalized = normalizeTeamPlayerFlags(
    nextBlue,
    nextOrange,
    state.playerParticipation
  );

  const nextRoster: ExpRosterSnapshot = {
    playerParticipation: state.playerParticipation,
    blueSlots: normalized.blueSlots,
    orangeSlots: normalized.orangeSlots,
    activeCameraCarIndex: state.activeCameraCarIndex,
  };

  return {
    blueSlots: normalized.blueSlots,
    orangeSlots: normalized.orangeSlots,
    savedMultiBotsRoster:
      state.activeSubMode === 'multi-bots' ? nextRoster : state.savedMultiBotsRoster,
  };
}

export function computeRemoveSlotFromTeamTransition(
  state: ExperimentalMultiBotsTransitionState,
  team: 0 | 1,
  slotIndex: number
): Partial<ExperimentalMultiBotsTransitionState> | null {
  const targetList = team === 0 ? state.blueSlots : state.orangeSlots;
  const otherList = team === 0 ? state.orangeSlots : state.blueSlots;

  if (targetList.length + otherList.length <= 1) return null;
  if (slotIndex < 0 || slotIndex >= targetList.length) return null;

  const removedSlot = targetList[slotIndex];
  let nextParticipation = state.playerParticipation;
  if (removedSlot.isPlayer) {
    nextParticipation = 'none';
  }

  const updatedTarget = targetList.filter((_, idx) => idx !== slotIndex);
  const nextBlue = team === 0 ? updatedTarget : [...state.blueSlots];
  const nextOrange = team === 1 ? updatedTarget : [...state.orangeSlots];
  const normalized = normalizeTeamPlayerFlags(nextBlue, nextOrange, nextParticipation);
  const totalCars = normalized.blueSlots.length + normalized.orangeSlots.length;
  const nextCamIdx = Math.min(state.activeCameraCarIndex, Math.max(0, totalCars - 1));

  const nextRoster: ExpRosterSnapshot = {
    playerParticipation: nextParticipation,
    blueSlots: normalized.blueSlots,
    orangeSlots: normalized.orangeSlots,
    activeCameraCarIndex: nextCamIdx,
  };

  return {
    ...nextRoster,
    savedMultiBotsRoster:
      state.activeSubMode === 'multi-bots' ? nextRoster : state.savedMultiBotsRoster,
  };
}

export function computeSetSlotBotTypeTransition(
  state: ExperimentalMultiBotsTransitionState,
  team: 0 | 1,
  slotIndex: number,
  botType: ExpBotPolicyId
): Partial<ExperimentalMultiBotsTransitionState> {
  const meta = getExpBotPolicyMeta(botType);
  const maxCap = meta.maxPlayersPerTeam;

  const updateFn = (list: ExperimentalMultiBotsSlotConfig[]) =>
    list.map((slot, idx) => (idx === slotIndex ? { ...slot, botType } : slot));

  let nextBlue = team === 0 ? updateFn(state.blueSlots) : [...state.blueSlots];
  let nextOrange = team === 1 ? updateFn(state.orangeSlots) : [...state.orangeSlots];

  if (maxCap < 3) {
    if (nextBlue.length > maxCap) nextBlue = nextBlue.slice(0, maxCap);
    if (nextOrange.length > maxCap) nextOrange = nextOrange.slice(0, maxCap);
  }

  const totalCars = nextBlue.length + nextOrange.length;
  const nextCamIdx = Math.min(state.activeCameraCarIndex, Math.max(0, totalCars - 1));
  const nextRoster: ExpRosterSnapshot = {
    playerParticipation: state.playerParticipation,
    blueSlots: nextBlue,
    orangeSlots: nextOrange,
    activeCameraCarIndex: nextCamIdx,
  };

  return {
    blueSlots: nextBlue,
    orangeSlots: nextOrange,
    activeCameraCarIndex: nextCamIdx,
    savedMultiBotsRoster:
      state.activeSubMode === 'multi-bots' ? nextRoster : state.savedMultiBotsRoster,
  };
}

export function computeSetSlotColorTransition(
  state: ExperimentalMultiBotsTransitionState,
  team: 0 | 1,
  slotIndex: number,
  colorSlot: number
): Partial<ExperimentalMultiBotsTransitionState> | null {
  const currentList = team === 0 ? state.blueSlots : state.orangeSlots;
  const prevColor = currentList[slotIndex]?.colorSlot ?? 0;
  if (prevColor === colorSlot) return null;

  const swapIfMatching = (slot: ExperimentalMultiBotsSlotConfig) =>
    slot.colorSlot === colorSlot ? { ...slot, colorSlot: prevColor } : slot;

  const nextBlue = state.blueSlots.map((slot, idx) =>
    team === 0 && idx === slotIndex ? { ...slot, colorSlot } : swapIfMatching(slot)
  );
  const nextOrange = state.orangeSlots.map((slot, idx) =>
    team === 1 && idx === slotIndex ? { ...slot, colorSlot } : swapIfMatching(slot)
  );

  const nextRoster: ExpRosterSnapshot = {
    playerParticipation: state.playerParticipation,
    blueSlots: nextBlue,
    orangeSlots: nextOrange,
    activeCameraCarIndex: state.activeCameraCarIndex,
  };

  return {
    blueSlots: nextBlue,
    orangeSlots: nextOrange,
    savedMultiBotsRoster:
      state.activeSubMode === 'multi-bots' ? nextRoster : state.savedMultiBotsRoster,
  };
}

export function computeApplyPresetRosterTransition(
  preset: '1v1-player' | '2v2-player' | '3v3-player' | '1v1-bots' | '2v2-bots' | '3v3-bots'
): Partial<ExperimentalMultiBotsTransitionState> {
  const isPlayerPreset =
    preset === '1v1-player' || preset === '2v2-player' || preset === '3v3-player';
  let countPerTeam = 3;

  if (preset === '1v1-player' || preset === '1v1-bots') {
    countPerTeam = 1;
  } else if (preset === '2v2-player' || preset === '2v2-bots') {
    countPerTeam = 2;
  } else {
    countPerTeam = 3;
  }

  const botPattern: ExpBotPolicyId[] = ['nexto', 'necto', 'nexto'];
  const roster = buildTeamSlotsFromColorPrefs(
    countPerTeam,
    botPattern,
    isPlayerPreset ? undefined : 'none'
  );

  return {
    activeSubMode: 'multi-bots',
    savedMultiBotsRoster: roster,
    isExhibitionMode: false,
    activeBotpackShowcaseModel: null,
    playerParticipation: roster.playerParticipation,
    blueSlots: roster.blueSlots,
    orangeSlots: roster.orangeSlots,
    activeCameraCarIndex: roster.activeCameraCarIndex,
  };
}

export function computeApplyAsymmetricPresetRosterTransition(
  state: ExperimentalMultiBotsTransitionState,
  blueCount: number,
  orangeCount: number,
  participationOverride?: ExpPlayerParticipation
): Partial<ExperimentalMultiBotsTransitionState> {
  const botPattern: ExpBotPolicyId[] = ['nexto', 'necto', 'nexto'];
  const roster = buildAsymmetricTeamSlotsFromColorPrefs(
    blueCount,
    orangeCount,
    botPattern,
    participationOverride !== undefined ? participationOverride : state.playerParticipation
  );

  return {
    activeSubMode: 'multi-bots',
    savedMultiBotsRoster: roster,
    isExhibitionMode: false,
    activeBotpackShowcaseModel: null,
    playerParticipation: roster.playerParticipation,
    blueSlots: roster.blueSlots,
    orangeSlots: roster.orangeSlots,
    activeCameraCarIndex: roster.activeCameraCarIndex,
  };
}

export function computeApplyBotpackShowcaseTransition(
  state: ExperimentalMultiBotsTransitionState,
  botType: ExpBotPolicyId
): Partial<ExperimentalMultiBotsTransitionState> {
  const savedMultiBotsRoster = snapshotCurrentMultiBotsRoster(state);
  const meta = getExpBotPolicyMeta(botType);
  const countPerTeam = meta.maxPlayersPerTeam;
  const roster = buildTeamSlotsFromColorPrefs(countPerTeam, meta.id, 'none');

  return {
    activeSubMode: 'botpack',
    savedMultiBotsRoster,
    savedBotpackModel: meta.id,
    isExhibitionMode: false,
    activeBotpackShowcaseModel: meta.id,
    playerParticipation: 'none',
    blueSlots: roster.blueSlots,
    orangeSlots: roster.orangeSlots,
    activeCameraCarIndex: 0,
  };
}
