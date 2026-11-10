import { useCallback, useEffect } from 'react';
import { useReplayViewerStore } from '../stores/replayViewerStore';
import { useReplayToRcsImporterStore } from '../stores/replayToRcsImporterStore';
import { useHudStore } from '../stores/hudStore';
import { useExperimentalMultiBotsStore } from '../stores/experimentalMultiBotsStore';
import type { HudTransientChannel } from '../stores/hudTransientTypes';

export type HudPovSlotKey = 1 | 2 | 3 | 4 | 5 | 6;

export interface ResolvedHudPovSlotTarget {
  readonly slotKey: HudPovSlotKey;
  readonly carIndex: number | null;
}

export function resolveHudRosterSlotTarget(
  hudChannel: HudTransientChannel,
  slotKey: HudPovSlotKey
): ResolvedHudPovSlotTarget {
  const roster = hudChannel.getRoster();
  const leftPlayers = roster.leftPlayers || [];
  const rightPlayers = roster.rightPlayers || [];
  const allSlots = [...leftPlayers, ...rightPlayers];
  const matchedByKey = allSlots.find(
    (slot) => slot && slot.exists !== false && slot.slotKey === slotKey
  );
  const fallbackSlot =
    slotKey <= 3 ? leftPlayers[slotKey - 1] : rightPlayers[slotKey - 4];
  const targetSlot = matchedByKey ?? fallbackSlot;
  const carIndex =
    targetSlot &&
    targetSlot.exists !== false &&
    typeof targetSlot.carIndex === 'number' &&
    targetSlot.carIndex >= 0
      ? targetSlot.carIndex
      : null;

  return { slotKey, carIndex };
}

export function dispatchReplayViewerSelectPovSlot(
  slotKey: HudPovSlotKey | null,
  resolvedCarIndex: number | null = null
): void {
  const impState = useReplayToRcsImporterStore.getState();
  if (impState.viewerState !== 'idle' && impState.totalFrames > 0) {
    if (slotKey !== null) {
      const targetSlotParam =
        typeof resolvedCarIndex === 'number' && resolvedCarIndex >= 0
          ? resolvedCarIndex + 1
          : slotKey;
      impState.runtimeHandlers.onSelectPovSlot?.(targetSlotParam);
    }
    return;
  }
  useReplayViewerStore.getState().runtimeHandlers.onSelectPovSlot?.(slotKey);
}

export function useReplayPovSlotHotkeys(params: {
  hudChannel: HudTransientChannel;
  matchMode: string;
  matchPhase: string;
  isReplayViewerActive: boolean;
  isReplayViewerLoaded?: boolean;
}) {
  const {
    hudChannel,
    matchMode,
    matchPhase,
    isReplayViewerActive,
    isReplayViewerLoaded = isReplayViewerActive,
  } = params;

  const handleSelectPovSlot = useCallback(
    (slotKey: HudPovSlotKey | null) => {
      if (slotKey === null) {
        hudChannel.setRoster({ focusedSlotKey: null });
        if (isReplayViewerLoaded) {
          dispatchReplayViewerSelectPovSlot(null, null);
        }
        const curHud = useHudStore.getState();
        if (curHud.onReplaySelectPovCar) {
          curHud.onReplaySelectPovCar(null);
        } else if (curHud.matchPhase === 'replay' && curHud.replayCameraMode !== 'director') {
          curHud.onReplayToggleCameraMode?.();
        }
        return;
      }

      const { carIndex: slotCarIndex } = resolveHudRosterSlotTarget(hudChannel, slotKey);
      const curHud = useHudStore.getState();
      const isGoalReplayPhase = curHud.matchPhase === 'replay' || matchPhase === 'replay';

      if (isGoalReplayPhase && curHud.onReplaySelectPovCar && slotCarIndex !== null) {
        hudChannel.setRoster({ focusedSlotKey: slotKey });
        curHud.onReplaySelectPovCar(slotCarIndex);
        if (isReplayViewerLoaded) {
          dispatchReplayViewerSelectPovSlot(slotKey, slotCarIndex);
        }
        return;
      }

      if (isReplayViewerLoaded) {
        hudChannel.setRoster({ focusedSlotKey: slotKey });
        dispatchReplayViewerSelectPovSlot(slotKey, slotCarIndex);
        return;
      }

      if (slotCarIndex !== null) {
        hudChannel.setRoster({ focusedSlotKey: slotKey });
        if (isGoalReplayPhase) {
          if (curHud.onReplaySelectPovCar) {
            curHud.onReplaySelectPovCar(slotCarIndex);
          } else {
            if (curHud.replayCameraMode === 'director') {
              curHud.onReplayToggleCameraMode?.();
            }
            useExperimentalMultiBotsStore.getState().setActiveCameraCarIndex(slotCarIndex);
          }
        } else if (matchMode === 'exp-multi-bots') {
          useExperimentalMultiBotsStore.getState().setActiveCameraCarIndex(slotCarIndex);
        }
      }
    },
    [hudChannel, matchMode, matchPhase, isReplayViewerLoaded]
  );

  useEffect(() => {
    if (matchPhase !== 'replay' && !isReplayViewerLoaded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) {
        return;
      }
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) {
        return;
      }

      let keyNum = -1;
      if (e.code >= 'Digit0' && e.code <= 'Digit7') {
        keyNum = Number(e.code.replace('Digit', ''));
      } else if (e.code >= 'Numpad0' && e.code <= 'Numpad7') {
        keyNum = Number(e.code.replace('Numpad', ''));
      } else if (e.key >= '0' && e.key <= '7') {
        keyNum = Number(e.key);
      }

      if (keyNum === 7 || keyNum === 0) {
        if (matchPhase === 'replay') {
          e.preventDefault();
          handleSelectPovSlot(null);
        }
      } else if (keyNum >= 1 && keyNum <= 6) {
        e.preventDefault();
        handleSelectPovSlot(keyNum as HudPovSlotKey);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [matchPhase, isReplayViewerLoaded, handleSelectPovSlot]);

  return { handleSelectPovSlot };
}
