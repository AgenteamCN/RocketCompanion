import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_CENTER_UPPER_TIMING,
  DEFAULT_WINNER_BLUE_TEAM_CONFIG,
  type CenterUpperInfoPayload,
} from './centerUpperInfoDefaults';
import {
  buildTakeoverPrerollPayload,
  type TakeoverHudPayload,
  type TakeoverTeamSide,
} from './takeoverCountdownDefaults';

export interface ScoreboardDerivedState {
  isLobbyPhase: boolean;
  leftTeamColor: string;
  leftBarColor: string;
  rightTeamColor: string;
  rightBarColor: string;
  leftScore: number;
  rightScore: number;
  overtimeChinOpen: boolean;
  phaseChinOpen: boolean;
  phaseChinText: string;
  phaseChinColor: string | undefined;
  activeClockSec: number;
}

export function deriveInGameScoreboardState(params: {
  matchPhase: string;
  matchMode: string;
  roomType?: string;
  onlineLocalTeam?: string | null;
  localTeam: number;
  blueScore: number;
  orangeScore: number;
  isOvertime: boolean;
  overtimeSeconds: number;
  remainingSeconds: number;
  matchDurationSeconds?: number;
}): ScoreboardDerivedState {
  const {
    matchPhase,
    matchMode,
    roomType,
    onlineLocalTeam,
    localTeam,
    blueScore,
    orangeScore,
    isOvertime,
    overtimeSeconds,
    remainingSeconds,
    matchDurationSeconds,
  } = params;

  const isLobbyPhase =
    matchPhase === 'lobby' ||
    (matchMode === 'online-warmup' && roomType === 'match');

  const isOrangeLeft = isLobbyPhase
    ? onlineLocalTeam === 'orange' || (onlineLocalTeam !== 'blue' && localTeam === 1)
    : localTeam === 1;
  const leftTeamColor = isOrangeLeft ? '#EA580C' : '#2563EB';
  const leftBarColor = isOrangeLeft ? '#F97316' : '#3B82F6';
  const rightTeamColor = isOrangeLeft ? '#2563EB' : '#EA580C';
  const rightBarColor = isOrangeLeft ? '#3B82F6' : '#F97316';
  const leftScore = isLobbyPhase ? 0 : isOrangeLeft ? orangeScore : blueScore;
  const rightScore = isLobbyPhase ? 0 : isOrangeLeft ? blueScore : orangeScore;

  const overtimeChinOpen = Boolean(
    isOvertime &&
      !isLobbyPhase &&
      matchPhase !== 'goal' &&
      matchPhase !== 'replay' &&
      matchPhase !== 'podium' &&
      matchPhase !== 'ended'
  );
  const phaseChinOpen = overtimeChinOpen || isLobbyPhase;
  const phaseChinText = overtimeChinOpen
    ? 'OVERTIME'
    : isLobbyPhase
    ? 'LOBBY'
    : 'OVERTIME';
  const phaseChinColor = overtimeChinOpen
    ? '#DC2626'
    : isLobbyPhase
    ? '#52525B'
    : undefined;
  const activeClockSec = overtimeChinOpen
    ? overtimeSeconds
    : isLobbyPhase
    ? (matchDurationSeconds ?? remainingSeconds)
    : remainingSeconds;

  return {
    isLobbyPhase,
    leftTeamColor,
    leftBarColor,
    rightTeamColor,
    rightBarColor,
    leftScore,
    rightScore,
    overtimeChinOpen,
    phaseChinOpen,
    phaseChinText,
    phaseChinColor,
    activeClockSec,
  };
}

export function useWindowFocusAndPowerSave(params: {
  menuOpen: boolean;
  isLivePreviewCollapsed: boolean;
  activeRoute: string;
  menuPowerSave: string | number;
  telemetryEnabled: boolean;
  pauseTelemetryInPowerSave: boolean;
}) {
  const {
    menuOpen,
    isLivePreviewCollapsed,
    activeRoute,
    menuPowerSave,
    telemetryEnabled,
    pauseTelemetryInPowerSave,
  } = params;

  const [isWindowMinimized, setIsWindowMinimized] = useState<boolean>(() =>
    typeof document !== 'undefined' ? Boolean(document.hidden) : false
  );
  const [isWindowFocused, setIsWindowFocused] = useState<boolean>(() =>
    typeof document !== 'undefined'
      ? !document.hidden &&
        (typeof document.hasFocus === 'function' ? document.hasFocus() : true)
      : true
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const syncFocus = () => {
      const minimized = Boolean(document.hidden);
      const focused =
        !minimized &&
        (typeof document.hasFocus === 'function' ? document.hasFocus() : true);
      setIsWindowMinimized(minimized);
      setIsWindowFocused(focused);
    };
    window.addEventListener('blur', syncFocus);
    window.addEventListener('focus', syncFocus);
    document.addEventListener('visibilitychange', syncFocus);
    return () => {
      window.removeEventListener('blur', syncFocus);
      window.removeEventListener('focus', syncFocus);
      document.removeEventListener('visibilitychange', syncFocus);
    };
  }, []);

  const isLivePreviewDockCollapsed =
    Boolean(menuOpen) &&
    Boolean(isLivePreviewCollapsed) &&
    (activeRoute === 'trajectory' || activeRoute === 'camera');
  const isPowerSaveMenuOpen = Boolean(menuOpen) && !isLivePreviewDockCollapsed;
  const isPowerSaveModeEnabled =
    String(menuPowerSave) !== 'match' && String(menuPowerSave) !== 'disable';
  const isPowerSaveActive =
    isWindowMinimized ||
    (isPowerSaveModeEnabled && (isPowerSaveMenuOpen || !isWindowFocused));
  const shouldPollTelemetry =
    telemetryEnabled && !(pauseTelemetryInPowerSave && isPowerSaveActive);

  return { isPowerSaveActive, shouldPollTelemetry };
}

export function useCenterUpperCountdownChoreography(params: {
  kickoffCountdown: number;
  matchPhase: string;
  isPaused: boolean;
  winner: string | number | null;
  isOvertime: boolean;
  matchMode: string;
  roomType?: string;
}) {
  const {
    kickoffCountdown,
    matchPhase,
    isPaused,
    winner,
    isOvertime,
    matchMode,
    roomType,
  } = params;

  const [countdownPayload, setCountdownPayload] = useState<CenterUpperInfoPayload | null>(null);
  const prevCountdownRef = useRef<number>(-1);
  const prevEndedWinnerRef = useRef<string | number | null>(null);
  const countdownNonceRef = useRef<number>(1);
  const handleCountdownExpire = useCallback(() => {
    setCountdownPayload(null);
  }, []);

  useEffect(() => {
    if (matchMode === 'kickoff-training') {
      prevCountdownRef.current = kickoffCountdown;
      prevEndedWinnerRef.current = null;
      setCountdownPayload(null);
      return;
    }

    const isMatchContext =
      matchMode === 'match' ||
      matchMode === 'exp-multi-bots' ||
      (matchMode === 'online-warmup' && roomType === 'match');

    // 1. Winner Blue Team / Winner Orange Team announcement during 3s 'ended' window before 'podium'
    if (isMatchContext && matchPhase === 'ended' && winner !== null && winner !== undefined) {
      prevCountdownRef.current = 0;
      const isBlueWinner =
        winner === 0 ||
        String(winner).toUpperCase() === 'BLUE' ||
        String(winner).toUpperCase() === 'BLUE TEAM';
      const isOrangeWinner =
        winner === 1 ||
        String(winner).toUpperCase() === 'ORANGE' ||
        String(winner).toUpperCase() === 'ORANGE TEAM';
      if ((isBlueWinner || isOrangeWinner) && prevEndedWinnerRef.current !== winner) {
        prevEndedWinnerRef.current = winner;
        countdownNonceRef.current += 1;
        setCountdownPayload({
          variant: 'winner',
          winnerTeam: isOrangeWinner ? 'orange' : 'blue',
          winnerBlueConfig: DEFAULT_WINNER_BLUE_TEAM_CONFIG,
          topText: 'WINNER',
          mainText: isOrangeWinner ? 'ORANGE TEAM' : 'BLUE TEAM',
          timing: {
            ...DEFAULT_CENTER_UPPER_TIMING,
            durationMs: 2200,
            persistentInspect: false,
          },
          triggerKey: countdownNonceRef.current,
        });
      }
      return;
    }

    if (matchPhase !== 'ended') {
      prevEndedWinnerRef.current = null;
    }

    // 2. Match Paused (ADMIN CONTROL / MATCH PAUSED) when paused without active resume countdown
    const isAdminPaused = Boolean(
      isMatchContext && (isPaused || matchPhase === 'paused') && kickoffCountdown <= 0
    );
    if (isAdminPaused) {
      setCountdownPayload((prevPayload) => {
        if (
          prevPayload?.variant === 'announcement' &&
          prevPayload.mainText === 'MATCH PAUSED'
        ) {
          return prevPayload;
        }
        countdownNonceRef.current += 1;
        return {
          variant: 'announcement',
          topText: 'ADMIN CONTROL',
          mainText: 'MATCH PAUSED',
          timing: {
            ...DEFAULT_CENTER_UPPER_TIMING,
            persistentInspect: true,
          },
          triggerKey: countdownNonceRef.current,
        };
      });
      return;
    }

    setCountdownPayload((prevPayload) =>
      prevPayload?.variant === 'announcement' && prevPayload.mainText === 'MATCH PAUSED'
        ? null
        : prevPayload
    );

    const prev = prevCountdownRef.current;
    const curr = kickoffCountdown;

    if (
      curr === 0 &&
      (matchPhase === 'goal' ||
        matchPhase === 'replay' ||
        matchPhase === 'podium' ||
        matchPhase === 'freeplay' ||
        matchPhase === 'warmup')
    ) {
      prevCountdownRef.current = 0;
      setCountdownPayload(null);
      return;
    }

    if (curr === 3 || curr === 2 || curr === 1) {
      if (curr !== prev) {
        prevCountdownRef.current = curr;
        countdownNonceRef.current += 1;
        setCountdownPayload({
          variant: 'countdown',
          mainText: String(curr),
          triggerKey: countdownNonceRef.current,
        });
      }
      return;
    }

    if (
      (prev === 1 || prev === 2 || prev === 3) &&
      curr === 0 &&
      (matchPhase === 'playing' || isOvertime)
    ) {
      prevCountdownRef.current = 0;
      countdownNonceRef.current += 1;
      setCountdownPayload({
        variant: 'countdown',
        mainText: 'GO',
        triggerKey: countdownNonceRef.current,
      });
      return;
    }
  }, [
    kickoffCountdown,
    matchPhase,
    isPaused,
    winner,
    isOvertime,
    matchMode,
    roomType,
  ]);

  return { countdownPayload, handleCountdownExpire };
}

export function useTakeoverPrerollChoreography(params: {
  isReplayPreroll: boolean;
  isRewinderPreroll: boolean;
  replayPrerollSec: number;
  rewinderPrerollSec: number;
  replayDownCounterSec: number;
  rewinderDownCounterSec: number;
  takeoverTeam: TakeoverTeamSide;
}) {
  const {
    isReplayPreroll,
    isRewinderPreroll,
    replayPrerollSec,
    rewinderPrerollSec,
    replayDownCounterSec,
    rewinderDownCounterSec,
    takeoverTeam,
  } = params;

  const isTakeoverPreroll = isReplayPreroll || isRewinderPreroll;
  const [takeoverPayload, setTakeoverPayload] = useState<TakeoverHudPayload | null>(null);
  const takeoverSeqRef = useRef<number>(0);
  const lastTakeoverStepRef = useRef<number | null>(null);

  const handleTakeoverExpire = useCallback(() => {
    setTakeoverPayload(null);
  }, []);

  useEffect(() => {
    const activePrerollSec = isReplayPreroll
      ? replayPrerollSec
      : isRewinderPreroll
      ? rewinderPrerollSec
      : 0;
    const activeDownSec = isReplayPreroll
      ? replayDownCounterSec
      : isRewinderPreroll
      ? rewinderDownCounterSec
      : 0;

    if (isTakeoverPreroll) {
      const candidate = buildTakeoverPrerollPayload({
        activePrerollSec,
        activeDownSec,
        takeoverTeam,
        triggerKey: takeoverSeqRef.current + 1,
      });
      if (candidate) {
        if (lastTakeoverStepRef.current !== activePrerollSec) {
          lastTakeoverStepRef.current = activePrerollSec;
          takeoverSeqRef.current += 1;
          setTakeoverPayload(candidate);
        } else {
          setTakeoverPayload((prev) =>
            prev && prev.teamSide !== takeoverTeam ? { ...prev, teamSide: takeoverTeam } : prev
          );
        }
      } else {
        lastTakeoverStepRef.current = null;
        setTakeoverPayload(null);
      }
      return;
    }

    lastTakeoverStepRef.current = null;
    setTakeoverPayload(null);
  }, [
    isTakeoverPreroll,
    isReplayPreroll,
    isRewinderPreroll,
    replayPrerollSec,
    rewinderPrerollSec,
    replayDownCounterSec,
    rewinderDownCounterSec,
    takeoverTeam,
  ]);

  return { isTakeoverPreroll, takeoverPayload, handleTakeoverExpire };
}
