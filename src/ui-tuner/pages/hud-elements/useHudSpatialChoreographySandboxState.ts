import React, { useEffect, useRef } from 'react';
import { createScopedSyncedState } from '../../stores/crossClientSync';
import { createHudTransientChannel } from '../../../ui-core/stores/hudTransientChannel';
import {
  DEFAULT_DEMO_INDICATOR_CONFIG,
  DEFAULT_INITIAL_ROSTER,
  DEFAULT_SKIP_INDICATOR_CONFIG,
  resolveDemoIndicatorConfig,
  resolveSkipIndicatorConfig,
  type EdgeDemoIndicatorConfig,
  type EdgeSkipIndicatorConfig,
  type HudRosterViewMode,
  type MatchHudChoreographySignal,
} from '../../../ui-core/stores/hudTransientTypes';
import { FLIP_WINDOW_SECONDS } from '../../../ui-core/hud/FlipIndicatorPillHUD';
import type { HudLayoutStrategy } from '../../../ui-core/layout/HudAnchorStage';
import type { FlipSimMode, JumpPlacementOption } from './HudChoreographyTopBandColumn';
import type { ScorePresetKey } from './HudChoreographySandboxContext';

const useState = createScopedSyncedState('hud-spatial-sandbox');

export function useHudSpatialChoreographySandboxState(isLight: boolean) {
  const channelRef = useRef(
    createHudTransientChannel({
      speed: 1680,
      boostAmount: 85,
      ballCamActive: true,
      scoreboard: {
        leftScore: 2,
        rightScore: 2,
        scoreDigits: 2,
        seconds: 164,
        isOvertime: false,
        overtimeChinOpen: false,
        overtimeChinText: 'OVERTIME',
        bestOf: 5,
        leftSeriesWins: 2,
        rightSeriesWins: 1,
        seriesResults: ['left', 'right', 'left', 'none', 'none'],
      },
      roster: DEFAULT_INITIAL_ROSTER,
      replayFooter: {
        visible: false,
        scorerName: 'Zen_Master_RL',
        goalSpeed: '118KPH',
        assisterName: 'You (Octane_99)',
        teamAccentColor: '#3B82F6',
      },
      respawnTimer: {
        remainingSeconds: 0,
        totalSeconds: 3.0,
        active: false,
      },
    })
  );

  const [viewMode, setViewMode] = useState<HudRosterViewMode>('player-live', 'viewMode');
  const [activeSignal, setActiveSignal] = useState<MatchHudChoreographySignal>(
    'kickoff-will-start',
    'activeSignal'
  );
  const [bottomHudRetracted, setBottomHudRetracted] = useState<boolean>(
    false,
    'bottomHudRetracted'
  );
  const [instantCockpitTransition, setInstantCockpitTransition] = useState<boolean>(
    false,
    'instantCockpitTransition'
  );
  const [myTeamSide, setMyTeamSide] = useState<'blue' | 'orange'>('blue', 'myTeamSide');
  const [slotExists, setSlotExists] = useState<Record<1 | 2 | 3 | 4 | 5 | 6, boolean>>(
    {
      1: true,
      2: true,
      3: true,
      4: true,
      5: true,
      6: true,
    },
    'slotExists'
  );
  const [replaySkipReady, setReplaySkipReady] = useState<Record<1 | 2 | 3 | 4 | 5 | 6, boolean>>(
    {
      1: false,
      2: false,
      3: false,
      4: false,
      5: false,
      6: false,
    },
    'replaySkipReady'
  );
  const [opponentDemoCompact, setOpponentDemoCompact] = useState<boolean>(
    true,
    'opponentDemoCompact'
  );
  const [persistentDemo, setPersistentDemo] = useState<boolean>(false, 'persistentDemo');
  const persistentDemoRef = useRef<boolean>(false);
  persistentDemoRef.current = persistentDemo;
  const [rawDemoIndicatorConfig, setDemoIndicatorConfig] = useState<EdgeDemoIndicatorConfig>(
    { ...DEFAULT_DEMO_INDICATOR_CONFIG },
    'demoIndicatorConfig'
  );
  const [rawSkipIndicatorConfig, setSkipIndicatorConfig] = useState<EdgeSkipIndicatorConfig>(
    { ...DEFAULT_SKIP_INDICATOR_CONFIG },
    'skipIndicatorConfigV2'
  );
  const demoIndicatorConfig = resolveDemoIndicatorConfig(rawDemoIndicatorConfig);
  const skipIndicatorConfig = resolveSkipIndicatorConfig(rawSkipIndicatorConfig);
  const [focusedSlot, setFocusedSlot] = useState<1 | 2 | 3 | 4 | 5 | 6 | null>(1, 'focusedSlot');
  const [scorePreset, setScorePreset] = useState<ScorePresetKey>('1digit', 'scorePreset');
  const [overtimeChinOpen, setOvertimeChinOpen] = useState<boolean>(false, 'overtimeChinOpen');
  const [bestOf, setBestOf] = useState<0 | 3 | 5 | 7>(5, 'bestOf');
  const [leftWins, setLeftWins] = useState<number>(2, 'leftWins');
  const [rightWins, setRightWins] = useState<number>(1, 'rightWins');
  const [hudThemeLight, setHudThemeLight] = useState<boolean>(isLight, 'hudThemeLight');
  useEffect(() => {
    setHudThemeLight(isLight);
  }, [isLight]);
  const [layoutStrategy, setLayoutStrategy] = useState<HudLayoutStrategy>(
    'reserve',
    'layoutStrategy'
  );
  const [jumpPlacement, setJumpPlacement] = useState<JumpPlacementOption>(
    'top-left',
    'jumpPlacement'
  );
  const [flipSimMode, setFlipSimMode] = useState<FlipSimMode>('auto-drain', 'flipSimMode');
  const flipSimModeRef = useRef<FlipSimMode>('auto-drain');
  const [showTelemetryTopLeft, setShowTelemetryTopLeft] = useState<boolean>(
    true,
    'showTelemetryTopLeft'
  );
  const [showBallCam, setShowBallCam] = useState<boolean>(true, 'showBallCam');
  const [selfDemoActive, setSelfDemoActive] = useState<boolean>(false, 'selfDemoActive');
  const sandboxSectionRef = useRef<HTMLElement | null>(null);
  const selfDemoPillTextRef = useRef<HTMLSpanElement | null>(null);
  const demoEndTimestampsRef = useRef<Record<number, number>>({});

  useEffect(() => {
    const ch = channelRef.current;
    ch.setRoster({
      viewMode,
      focusedSlotKey: focusedSlot,
      opponentDemoCompact,
      demoIndicatorConfig,
      skipIndicatorConfig,
    });
    ([1, 2, 3, 4, 5, 6] as const).forEach((k) => {
      ch.updatePlayerSlot(k, {
        exists: Boolean(slotExists?.[k] ?? true),
        replaySkipReady: Boolean(replaySkipReady?.[k] ?? false),
      });
    });
  }, [
    viewMode,
    focusedSlot,
    opponentDemoCompact,
    demoIndicatorConfig,
    skipIndicatorConfig,
    slotExists,
    replaySkipReady,
  ]);

  useEffect(() => {
    const ch = channelRef.current;
    let rafId = 0;
    let lastSecTick = performance.now();
    let isStageVisible = true;
    let scrollCooldownUntil = 0;
    const sectionEl = sandboxSectionRef.current;
    let io: IntersectionObserver | null = null;
    if (sectionEl && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (entries) => {
          if (entries[0]) {
            isStageVisible = entries[0].isIntersecting;
          }
        },
        { rootMargin: '150px' }
      );
      io.observe(sectionEl);
    }
    const onScrollCapture = () => {
      scrollCooldownUntil = performance.now() + 90;
    };
    window.addEventListener('scroll', onScrollCapture, { capture: true, passive: true });
    const loop = (now: number) => {
      rafId = requestAnimationFrame(loop);
      if (!isStageVisible || now < scrollCooldownUntil || document.hidden) {
        return;
      }
      const demoMap = demoEndTimestampsRef.current;
      const isPersistent = persistentDemoRef.current;
      const currentRoster = ch.getRoster();
      for (const keyStr of Object.keys(demoMap)) {
        const slotKey = Number(keyStr) as 1 | 2 | 3 | 4 | 5 | 6;
        const endAt = demoMap[slotKey];
        if (!endAt) continue;
        if (isPersistent) {
          const pinnedRem = 1.8;
          demoMap[slotKey] = now + pinnedRem * 1000;
          const existingSlot =
            slotKey <= 3
              ? currentRoster.leftPlayers[slotKey - 1]
              : currentRoster.rightPlayers[slotKey - 4];
          if (
            !existingSlot?.isDemolished ||
            Math.abs((existingSlot?.demoRespawnRemainingSec ?? 0) - pinnedRem) > 0.01
          ) {
            ch.updatePlayerSlot(slotKey, {
              isDemolished: true,
              demoRespawnRemainingSec: pinnedRem,
            });
            if (slotKey === 1) {
              ch.setRespawnTimer({
                remainingSeconds: pinnedRem,
                totalSeconds: 3.0,
                active: true,
              });
              if (selfDemoPillTextRef.current) {
                selfDemoPillTextRef.current.textContent = `PERSISTENT DEMO (${pinnedRem.toFixed(1)}S)`;
              }
            }
          }
          continue;
        }
        const remainingSec = Math.max(0, (endAt - now) / 1000);
        if (remainingSec <= 0) {
          delete demoMap[slotKey];
          ch.updatePlayerSlot(slotKey, {
            isDemolished: false,
            demoRespawnRemainingSec: 0,
            demolishedAtMs: 0,
            boostAmount: 33,
          });
          if (slotKey === 1) {
            ch.setRespawnTimer({ remainingSeconds: 0, totalSeconds: 3.0, active: false });
            setSelfDemoActive(false);
          }
        } else {
          ch.updatePlayerSlot(slotKey, {
            isDemolished: true,
            demoRespawnRemainingSec: remainingSec,
          });
          if (slotKey === 1) {
            ch.setRespawnTimer({
              remainingSeconds: remainingSec,
              totalSeconds: 3.0,
              active: true,
            });
            if (selfDemoPillTextRef.current) {
              const nextPillText = `RESPAWN IN ${remainingSec.toFixed(1)}S`;
              if (selfDemoPillTextRef.current.textContent !== nextPillText) {
                selfDemoPillTextRef.current.textContent = nextPillText;
              }
            }
          }
        }
      }
      const phase = now * 0.0012;
      const simSpeed = 1410 + Math.sin(phase) * 780;
      const selfBoost = Math.round(55 + Math.sin(phase * 0.9) * 44);
      ch.setSpeed(Math.max(200, Math.min(2300, simSpeed)));
      ch.setBoost(selfBoost, false);
      const slot1 = currentRoster.leftPlayers[0];
      if (slot1 && !slot1.isDemolished && slot1.boostAmount !== selfBoost) {
        ch.updatePlayerSlot(1, { boostAmount: selfBoost });
      }
      ch.setTelemetry({
        fps: Math.round(119 + Math.sin(phase * 2.1)),
        refreshHz: 120,
        renderScalePct: 100,
        physicsRateHz: 120.0,
        baseLatencyMs: Math.round(16 + Math.sin(phase * 0.7) * 3),
        extraLatencyMs: 0,
      });
      const mode = flipSimModeRef.current;
      if (mode === 'auto-drain') {
        const cycleSec = (now / 1000) % 2.4;
        if (cycleSec < 0.45) {
          ch.setFlip({
            hasFlip: true,
            status: 'grounded',
            remainingSeconds: FLIP_WINDOW_SECONDS,
            maxSeconds: FLIP_WINDOW_SECONDS,
          });
        } else if (cycleSec < 0.45 + FLIP_WINDOW_SECONDS) {
          const elapsedAir = cycleSec - 0.45;
          const remFlip = Math.max(0, FLIP_WINDOW_SECONDS - elapsedAir);
          ch.setFlip({
            hasFlip: true,
            status: 'countdown',
            remainingSeconds: remFlip,
            maxSeconds: FLIP_WINDOW_SECONDS,
          });
        } else {
          ch.setFlip({
            hasFlip: false,
            status: 'expired',
            remainingSeconds: 0,
            maxSeconds: FLIP_WINDOW_SECONDS,
          });
        }
      }
      if (now - lastSecTick >= 1000) {
        lastSecTick = now;
        const sb = ch.getScoreboard();
        const nextSec = sb.isOvertime ? sb.seconds + 1 : Math.max(0, sb.seconds - 1);
        ch.setScoreboard({ seconds: nextSec });
      }
    };
    rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafId);
      io?.disconnect();
      window.removeEventListener('scroll', onScrollCapture, { capture: true });
    };
  }, []);

  return {
    channelRef,
    viewMode,
    setViewMode,
    activeSignal,
    setActiveSignal,
    bottomHudRetracted,
    setBottomHudRetracted,
    instantCockpitTransition,
    setInstantCockpitTransition,
    myTeamSide,
    setMyTeamSide,
    slotExists,
    setSlotExists,
    replaySkipReady,
    setReplaySkipReady,
    opponentDemoCompact,
    setOpponentDemoCompact,
    persistentDemo,
    setPersistentDemo,
    persistentDemoRef,
    demoIndicatorConfig,
    setDemoIndicatorConfig,
    skipIndicatorConfig,
    setSkipIndicatorConfig,
    focusedSlot,
    setFocusedSlot,
    scorePreset,
    setScorePreset,
    overtimeChinOpen,
    setOvertimeChinOpen,
    bestOf,
    setBestOf,
    leftWins,
    setLeftWins,
    rightWins,
    setRightWins,
    hudThemeLight,
    setHudThemeLight,
    layoutStrategy,
    setLayoutStrategy,
    jumpPlacement,
    setJumpPlacement,
    flipSimMode,
    setFlipSimMode,
    flipSimModeRef,
    showTelemetryTopLeft,
    setShowTelemetryTopLeft,
    showBallCam,
    setShowBallCam,
    selfDemoActive,
    setSelfDemoActive,
    sandboxSectionRef,
    selfDemoPillTextRef,
    demoEndTimestampsRef,
  };
}
