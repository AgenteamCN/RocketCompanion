import React from 'react';
import {
  type EdgeDemoIndicatorConfig,
  type EdgeSkipIndicatorConfig,
  type HudRosterViewMode,
  type MatchHudChoreographySignal,
} from '../../../ui-core/stores/hudTransientTypes';
import { FLIP_WINDOW_SECONDS } from '../../../ui-core/hud/FlipIndicatorPillHUD';
import type { HudSlotMode } from '../../../ui-core/layout/HudAnchorStage';
import { Badge } from '../../../ui-core/primitives/Badge';
import type { FlipSimMode } from './HudChoreographyTopBandColumn';
import { HudChoreographyControlDeck } from './HudChoreographyControlDeck';
import {
  HudChoreographySandboxProvider,
  type ScorePresetKey,
} from './HudChoreographySandboxContext';
import { HudSpatialChoreographyStageCanvas } from './HudSpatialChoreographyStageCanvas';
import { useHudSpatialChoreographySandboxState } from './useHudSpatialChoreographySandboxState';

export type { ScorePresetKey };

const ALL_SLOTS = [1, 2, 3, 4, 5, 6] as const;
const FLIP_SIM_ORDER: FlipSimMode[] = [
  'auto-drain',
  'grounded',
  'multi-flip',
  'unlimited',
  'expired',
];
const SCORE_PRESET_MAP: Record<ScorePresetKey, [number, number, 2 | 3]> = {
  '1digit': [2, 2, 2],
  '2digit': [12, 8, 2],
  '3digit': [104, 99, 3],
};

export const HudSpatialChoreographySandbox: React.FC<{ isLight?: boolean }> = React.memo(
  ({ isLight = true }) => {
    const s = useHudSpatialChoreographySandboxState(isLight);
    const ch = s.channelRef.current;
    const isBlue = s.myTeamSide === 'blue';
    const leftTeamColor = isBlue ? '#2563EB' : '#EA580C';
    const leftBarColor = isBlue ? '#3B82F6' : '#F97316';
    const rightTeamColor = isBlue ? '#EA580C' : '#2563EB';
    const rightBarColor = isBlue ? '#F97316' : '#3B82F6';
    const getPovBarColor = (slot: number | null) =>
      slot && slot >= 4 ? rightBarColor : leftBarColor;

    const resetAllReplaySkipReady = () => {
      s.setReplaySkipReady({ 1: false, 2: false, 3: false, 4: false, 5: false, 6: false });
      ALL_SLOTS.forEach((k) => ch.updatePlayerSlot(k, { replaySkipReady: false }));
    };

    const clearDemo = (k: 1 | 2 | 3 | 4 | 5 | 6) => {
      delete s.demoEndTimestampsRef.current[k];
      ch.updatePlayerSlot(k, {
        isDemolished: false,
        demoRespawnRemainingSec: 0,
        demolishedAtMs: 0,
        boostAmount: 33,
      });
      if (k === 1) {
        s.setSelfDemoActive(false);
        ch.setRespawnTimer({ remainingSeconds: 0, totalSeconds: 3.0, active: false });
      }
    };

    const handleDispatchSignal = (signal: MatchHudChoreographySignal) => {
      s.setActiveSignal(signal);
      s.setInstantCockpitTransition(false);
      if (signal === 'goal-replay-will-start' || signal === 'goal-replay-will-end') {
        s.setBottomHudRetracted(true);
        ch.setReplayFooter({ visible: false });
      } else if (signal === 'goal-replay-started') {
        s.setBottomHudRetracted(true);
        s.setViewMode('goal-replay');
        ch.setRoster({ viewMode: 'goal-replay' });
        ch.setReplayFooter({ visible: true, teamAccentColor: getPovBarColor(s.focusedSlot) });
      } else if (signal === 'kickoff-will-start') {
        s.setBottomHudRetracted(false);
        s.setViewMode('player-live');
        if (s.skipIndicatorConfig.autoResetOnKickoff !== false) resetAllReplaySkipReady();
        const focusedSlotKey = s.focusedSlot ?? 1;
        if (s.focusedSlot === null) s.setFocusedSlot(1);
        ch.setRoster({ viewMode: 'player-live', focusedSlotKey });
        ch.setReplayFooter({ visible: false });
      }
    };

    const handleModeChange = (mode: HudRosterViewMode) => {
      s.setInstantCockpitTransition(false);
      s.setViewMode(mode);
      ch.setRoster({ viewMode: mode });
      const isGoal = mode === 'goal-replay';
      s.setActiveSignal(isGoal ? 'goal-replay-started' : 'kickoff-will-start');
      s.setBottomHudRetracted(isGoal);
      if (!isGoal && mode === 'player-live' && s.skipIndicatorConfig.autoResetOnKickoff !== false) {
        resetAllReplaySkipReady();
      }
      ch.setReplayFooter(
        isGoal ? { visible: true, teamAccentColor: getPovBarColor(s.focusedSlot) } : { visible: false }
      );
    };

    const handleSelectPov = (slotKey: 1 | 2 | 3 | 4 | 5 | 6 | null) => {
      s.setInstantCockpitTransition(
        s.viewMode === 'spectator' && (slotKey === null || s.focusedSlot === null)
      );
      s.setFocusedSlot(slotKey);
      ch.setRoster({ focusedSlotKey: slotKey });
      ch.setReplayFooter({ teamAccentColor: getPovBarColor(slotKey) });
    };

    const handleTriggerDemo = (slotKey: 1 | 2 | 3 | 4 | 5 | 6) => {
      const now = performance.now();
      const wasAlreadyDemo = Boolean(s.demoEndTimestampsRef.current[slotKey]);
      if (s.persistentDemoRef.current && wasAlreadyDemo) {
        clearDemo(slotKey);
        return;
      }
      s.demoEndTimestampsRef.current[slotKey] = now + 3000;
      if (slotKey === 1) {
        s.setSelfDemoActive(true);
        ch.setRespawnTimer({ remainingSeconds: 3.0, totalSeconds: 3.0, active: true });
      }
      ch.updatePlayerSlot(slotKey, {
        isDemolished: true,
        demoRespawnRemainingSec: s.persistentDemoRef.current ? 1.8 : 3.0,
        ...(wasAlreadyDemo ? {} : { demolishedAtMs: now }),
      });
    };

    const handleTogglePersistentDemo = () => {
      s.setPersistentDemo((prev) => {
        const next = !prev;
        s.persistentDemoRef.current = next;
        const now = performance.now();
        if (next) {
          if (Object.keys(s.demoEndTimestampsRef.current).length === 0) {
            ([2, 4] as const).forEach((k, idx) => {
              if (s.slotExists[k]) {
                s.demoEndTimestampsRef.current[k] = now + 3000;
                ch.updatePlayerSlot(k, {
                  isDemolished: true,
                  demoRespawnRemainingSec: 1.8,
                  demolishedAtMs: now + idx * 10,
                });
              }
            });
          }
        } else {
          Object.keys(s.demoEndTimestampsRef.current).forEach((k) =>
            clearDemo(Number(k) as 1 | 2 | 3 | 4 | 5 | 6)
          );
        }
        return next;
      });
    };

    const handleFlipSimModeChange = (nextMode: FlipSimMode) => {
      s.setFlipSimMode(nextMode);
      s.flipSimModeRef.current = nextMode;
      const maxSeconds = FLIP_WINDOW_SECONDS;
      if (nextMode === 'auto-drain') {
        ch.setFlip({ flipsRemaining: 1 });
      } else {
        const isExp = nextMode === 'expired';
        ch.setFlip({
          maxSeconds,
          hasFlip: !isExp,
          status: nextMode === 'multi-flip' ? 'grounded' : nextMode,
          remainingSeconds: isExp ? 0 : maxSeconds,
          flipsRemaining: isExp ? 0 : nextMode === 'multi-flip' ? 2 : 1,
        });
      }
    };

    const winsNeededForBo = s.bestOf > 0 ? Math.ceil(s.bestOf / 2) : 0;
    const topBandSlotMode: HudSlotMode = s.layoutStrategy === 'reserve' ? 'reserve' : 'collapse';
    const isCockpitVisible =
      !s.bottomHudRetracted && !(s.viewMode === 'spectator' && s.focusedSlot === null);

    return (
      <HudChoreographySandboxProvider
        value={{
          isLight,
          hudThemeLight: s.hudThemeLight,
          setHudThemeLight: s.setHudThemeLight,
          scorePreset: s.scorePreset,
          handleScorePresetChange: (preset) => {
            s.setScorePreset(preset);
            const [leftScore, rightScore, scoreDigits] = SCORE_PRESET_MAP[preset];
            ch.setScoreboard({ leftScore, rightScore, scoreDigits });
          },
          overtimeChinOpen: s.overtimeChinOpen,
          handleTriggerOvertimeKickoff: () => {
            s.setOvertimeChinOpen(true);
            ch.setScoreboard({
              seconds: 0,
              isOvertime: true,
              overtimeChinOpen: true,
              overtimeChinText: 'OVERTIME',
            });
          },
          handleToggleOvertimeChin: () => {
            const next = !s.overtimeChinOpen;
            s.setOvertimeChinOpen(next);
            ch.setScoreboard({ overtimeChinOpen: next });
          },
          handleResetRegulation: () => {
            s.setOvertimeChinOpen(false);
            ch.setScoreboard({ seconds: 164, isOvertime: false, overtimeChinOpen: false });
          },
          bestOf: s.bestOf,
          handleBestOfChange: (nextBo) => {
            s.setBestOf(nextBo);
            const maxWins = nextBo > 0 ? Math.ceil(nextBo / 2) : 0;
            const clampedL = Math.min(s.leftWins, maxWins);
            const clampedR = Math.min(s.rightWins, maxWins);
            s.setLeftWins(clampedL);
            s.setRightWins(clampedR);
            ch.setScoreboard({ bestOf: nextBo, leftSeriesWins: clampedL, rightSeriesWins: clampedR });
          },
          leftWins: s.leftWins,
          rightWins: s.rightWins,
          winsNeededForBo,
          handleAddSeriesWin: (team) => {
            const winsNeeded = s.bestOf > 0 ? Math.ceil(s.bestOf / 2) : 3;
            if (team === 'left') {
              const nextL = (s.leftWins + 1) % (winsNeeded + 1);
              s.setLeftWins(nextL);
              ch.setScoreboard({ leftSeriesWins: nextL });
            } else {
              const nextR = (s.rightWins + 1) % (winsNeeded + 1);
              s.setRightWins(nextR);
              ch.setScoreboard({ rightSeriesWins: nextR });
            }
          },
          viewMode: s.viewMode,
          handleModeChange,
          activeSignal: s.activeSignal,
          handleDispatchSignal,
          myTeamSide: s.myTeamSide,
          handleToggleTeamSide: () => {
            s.setMyTeamSide((prev) => {
              const next = prev === 'blue' ? 'orange' : 'blue';
              const nextL = next === 'blue' ? '#3B82F6' : '#F97316';
              const nextR = next === 'blue' ? '#F97316' : '#3B82F6';
              ch.setReplayFooter({
                teamAccentColor: s.focusedSlot && s.focusedSlot >= 4 ? nextR : nextL,
              });
              return next;
            });
          },
          slotExists: s.slotExists,
          handleToggleSlotExists: (slotKey) => {
            s.setSlotExists((prev) => {
              const nextVal = !prev[slotKey];
              ch.updatePlayerSlot(slotKey, { exists: nextVal });
              return { ...prev, [slotKey]: nextVal };
            });
          },
          replaySkipReady: s.replaySkipReady,
          handleToggleReplaySkipReady: (slotKey) => {
            s.setReplaySkipReady((prev) => {
              const nextVal = !prev[slotKey];
              ch.updatePlayerSlot(slotKey, { replaySkipReady: nextVal });
              return { ...prev, [slotKey]: nextVal };
            });
          },
          skipIndicatorConfig: s.skipIndicatorConfig,
          onUpdateSkipIndicatorConfig: (patch: Partial<EdgeSkipIndicatorConfig>) => {
            s.setSkipIndicatorConfig((prev) => {
              const next = { ...prev, ...patch };
              ch.setRoster({ skipIndicatorConfig: next });
              return next;
            });
          },
          handleApplyTeamSizePreset: (leftCount, rightCount) => {
            const nextMap: Record<1 | 2 | 3 | 4 | 5 | 6, boolean> = {
              1: leftCount >= 1,
              2: leftCount >= 2,
              3: leftCount >= 3,
              4: rightCount >= 1,
              5: rightCount >= 2,
              6: rightCount >= 3,
            };
            s.setSlotExists(nextMap);
            ALL_SLOTS.forEach((k) => ch.updatePlayerSlot(k, { exists: nextMap[k] }));
          },
          opponentDemoCompact: s.opponentDemoCompact,
          handleToggleOpponentDemoCompact: () => {
            s.setOpponentDemoCompact((prev) => {
              const next = !prev;
              ch.setRoster({ opponentDemoCompact: next });
              return next;
            });
          },
          persistentDemo: s.persistentDemo,
          onTogglePersistentDemo: handleTogglePersistentDemo,
          demoIndicatorConfig: s.demoIndicatorConfig,
          onUpdateDemoIndicatorConfig: (patch: Partial<EdgeDemoIndicatorConfig>) => {
            s.setDemoIndicatorConfig((prev) => {
              const next = { ...prev, ...patch };
              ch.setRoster({ demoIndicatorConfig: next });
              return next;
            });
          },
          focusedSlot: s.focusedSlot,
          handleSelectPov,
          handleTriggerDemo,
          layoutStrategy: s.layoutStrategy,
          setLayoutStrategy: s.setLayoutStrategy,
          showTelemetryTopLeft: s.showTelemetryTopLeft,
          setShowTelemetryTopLeft: s.setShowTelemetryTopLeft,
          flipSimMode: s.flipSimMode,
          onFlipSimModeChange: handleFlipSimModeChange,
          handleCycleFlipSimMode: () => {
            handleFlipSimModeChange(
              FLIP_SIM_ORDER[(FLIP_SIM_ORDER.indexOf(s.flipSimMode) + 1) % FLIP_SIM_ORDER.length]
            );
          },
          jumpPlacement: s.jumpPlacement,
          setJumpPlacement: s.setJumpPlacement,
          showBallCam: s.showBallCam,
          setShowBallCam: s.setShowBallCam,
          leftTopBandVisible: s.showTelemetryTopLeft,
          rightTopBandVisible:
            s.layoutStrategy === 'collapse-symmetric' ? s.showTelemetryTopLeft : false,
          topBandSlotMode,
          leftTeamColor,
          leftBarColor,
          rightTeamColor,
          rightBarColor,
          selfDemoActive: s.selfDemoActive,
          selfDemoPillTextRef: s.selfDemoPillTextRef,
          isCockpitVisible,
          instantCockpitTransition: s.instantCockpitTransition,
          channel: ch,
        }}
      >
        <section ref={s.sandboxSectionRef} className="flex flex-col gap-5">
          <div className="flex items-center justify-between border-b pb-2.5 border-neutral-200 dark:border-neutral-800 flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="h-6 w-6 rounded-md bg-blue-500/15 text-blue-500 flex items-center justify-center font-bold text-xs font-mono">
                5A.S
              </div>
              <h2 className="text-base font-bold tracking-tight">
                HudSpatialChoreographySandbox · Four Stages Signal Animation Bus · Swap Teams
                (`Switch Side`) · Enemy destroyed, top-fill slot
              </h2>
              <Badge variant="primary" size="sm" isLight={isLight}>
                Goal Replay / Kickoff Signals · GPU `translate3d`
              </Badge>
              <Badge variant="amber" size="sm" isLight={isLight}>
                persistent DOM Node · 0 React Re-render · 0 GC
              </Badge>
            </div>
          </div>
          <HudChoreographyControlDeck isLight={isLight} />
          <HudSpatialChoreographyStageCanvas />
        </section>
      </HudChoreographySandboxProvider>
    );
  }
);

HudSpatialChoreographySandbox.displayName = 'HudSpatialChoreographySandbox';
