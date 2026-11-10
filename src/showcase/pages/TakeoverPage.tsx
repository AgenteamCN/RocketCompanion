import React, { useEffect, useRef, useCallback } from 'react';
import { TakeoverHudPayload } from '../../ui-core/hud/TakeoverCountdownHUD';
import { PageJumpDirectory } from '../PageJumpDirectory';
import { createHudTransientChannel } from '../../ui-core/stores/hudTransientChannel';
import { DEFAULT_INITIAL_ROSTER } from '../../ui-core/stores/hudTransientTypes';
import { FLIP_WINDOW_SECONDS } from '../../ui-core/hud/FlipIndicatorPillHUD';
import {
  TAKEOVER_DIRECTORY_ITEMS,
  TakeoverStageCanvas,
} from './takeover/TakeoverStageCanvas';
import { TakeoverStageBackdropBar } from './takeover/TakeoverStageBackdropBar';
import {
  TakeoverArchetypesSection,
  type TakeoverScenarioPreset,
} from './takeover/TakeoverArchetypesSection';
import { TakeoverSignalControlDeck } from './takeover/TakeoverSignalControlDeck';
import { TakeoverTunerSection } from './takeover/TakeoverTunerSection';
import { useTakeoverSyncedState } from './takeover/useTakeoverSyncedState';

export const TakeoverPage: React.FC<{ isLight?: boolean }> = ({ isLight = true }) => {
  const {
    stageBgMode,
    setStageBgMode,
    stageBgColor,
    setStageBgColor,
    stageBgSecondaryColor,
    setStageBgSecondaryColor,
    arenaPreset,
    setArenaPreset,
    stageBrightness,
    setStageBrightness,
    showPitchLines,
    setShowPitchLines,
    showAnchorGuides,
    bottomOffsetPx,
    myTeamSide,
    setMyTeamSide,
    activeSignal,
    setActiveSignal,
    countdownStep,
    setCountdownStep,
    topLabelText,
    setTopLabelText,
    subCaptionText,
    setSubCaptionText,
    countdownIntervalMs,
    isSequencePlaying,
    setIsSequencePlaying,
    loopSequence,
    glowConfig,
    typoConfig,
    timingConfig,
    vignetteConfig,
    alwaysPreviewVignette,
    triggerNonce,
    setTriggerNonce,
    isVisibleOnStage,
    setIsVisibleOnStage,
  } = useTakeoverSyncedState();

  const sequenceTimerRef = useRef<number | null>(null);

  // Live 120Hz Transient Channel driving Scoreboard, Team Roster, Speed, Flip, and Boost
  const channelRef = useRef(
    createHudTransientChannel({
      speed: 1580,
      boostAmount: 85,
      ballCamActive: true,
      scoreboard: {
        leftScore: 2,
        rightScore: 1,
        scoreDigits: 2,
        seconds: 134,
        isOvertime: false,
        overtimeChinOpen: false,
        bestOf: 5,
        leftSeriesWins: 2,
        rightSeriesWins: 1,
        seriesResults: ['left', 'right', 'left', 'none', 'none'],
      },
      roster: DEFAULT_INITIAL_ROSTER,
    })
  );

  useEffect(() => {
    const ch = channelRef.current;
    let rafId = 0;
    let lastSecTick = performance.now();

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      if (document.hidden) return;

      const phase = now * 0.0014;
      const simSpeed = 1420 + Math.sin(phase) * 680;
      const simBoost = Math.round(58 + Math.sin(phase * 0.85) * 38);
      ch.setSpeed(Math.max(240, Math.min(2300, simSpeed)));
      ch.setBoost(simBoost, false);
      ch.updatePlayerSlot(1, { boostAmount: simBoost });

      const cycleSec = (now / 1000) % 2.4;
      if (cycleSec < 0.5) {
        ch.setFlip({
          hasFlip: true,
          status: 'grounded',
          remainingSeconds: FLIP_WINDOW_SECONDS,
          maxSeconds: FLIP_WINDOW_SECONDS,
        });
      } else if (cycleSec < 0.5 + FLIP_WINDOW_SECONDS) {
        const rem = Math.max(0, FLIP_WINDOW_SECONDS - (cycleSec - 0.5));
        ch.setFlip({
          hasFlip: true,
          status: 'countdown',
          remainingSeconds: rem,
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

      if (now - lastSecTick >= 1000) {
        lastSecTick = now;
        const sb = ch.getScoreboard();
        ch.setScoreboard({ seconds: Math.max(0, sb.seconds - 1) });
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const stopTakeoverSequence = useCallback(() => {
    if (sequenceTimerRef.current !== null) {
      window.clearTimeout(sequenceTimerRef.current);
      sequenceTimerRef.current = null;
    }
    setIsSequencePlaying(false);
  }, [setIsSequencePlaying]);

  useEffect(() => {
    if (!isSequencePlaying && sequenceTimerRef.current !== null) {
      window.clearTimeout(sequenceTimerRef.current);
      sequenceTimerRef.current = null;
    }
  }, [isSequencePlaying]);

  useEffect(() => {
    return () => {
      if (sequenceTimerRef.current !== null) {
        window.clearTimeout(sequenceTimerRef.current);
        sequenceTimerRef.current = null;
      }
    };
  }, []);

  const startTakeoverSequence = useCallback(
    (stepIntervalOverride?: number) => {
      stopTakeoverSequence();
      const stepMs = Math.max(250, stepIntervalOverride ?? countdownIntervalMs);
      const steps: ('3' | '2' | '1')[] = ['3', '2', '1'];

      setActiveSignal('replacing-in');
      setIsSequencePlaying(true);
      setIsVisibleOnStage(true);

      let idx = 0;
      const runStep = () => {
        const current = steps[idx];
        setCountdownStep(current);
        setActiveSignal('replacing-in');
        setIsVisibleOnStage(true);
        setTriggerNonce((n) => n + 1);
        idx += 1;

        if (idx < steps.length) {
          sequenceTimerRef.current = window.setTimeout(runStep, stepMs);
        } else {
          sequenceTimerRef.current = window.setTimeout(() => {
            setActiveSignal('takeover-complete');
            setIsVisibleOnStage(false);

            if (loopSequence) {
              sequenceTimerRef.current = window.setTimeout(() => {
                idx = 0;
                runStep();
              }, 1800);
            } else {
              setIsSequencePlaying(false);
            }
          }, stepMs);
        }
      };

      runStep();
    },
    [
      stopTakeoverSequence,
      countdownIntervalMs,
      loopSequence,
      setActiveSignal,
      setIsSequencePlaying,
      setIsVisibleOnStage,
      setCountdownStep,
      setTriggerNonce,
    ]
  );

  const handleSelectScenario = (preset: TakeoverScenarioPreset) => {
    setTopLabelText(preset.topText);
    setSubCaptionText(preset.subText);
    setMyTeamSide(preset.teamSide);
    startTakeoverSequence();
  };

  const isCockpitVisible = activeSignal === 'takeover-complete';
  const vignettePreviewActive =
    activeSignal === 'replacing-in' || alwaysPreviewVignette;

  const shouldRenderTakeoverBanner =
    activeSignal === 'replacing-in' &&
    (isVisibleOnStage || Boolean(timingConfig.persistentInspect));

  const activePayload: TakeoverHudPayload | null = shouldRenderTakeoverBanner
    ? {
        topText: topLabelText,
        mainText: countdownStep,
        subText: subCaptionText,
        teamSide: myTeamSide,
        glow: glowConfig,
        typography: typoConfig,
        timing: {
          ...timingConfig,
          durationMs: isSequencePlaying ? countdownIntervalMs : timingConfig.durationMs,
          persistentInspect: isSequencePlaying ? false : timingConfig.persistentInspect,
        },
        triggerKey: triggerNonce,
      }
    : null;

  const getStageBackgroundStyle = (): React.CSSProperties => {
    const brightFactor = stageBrightness / 100;
    if (stageBgMode === 'solid') {
      return {
        backgroundColor: stageBgColor,
        backgroundImage: `radial-gradient(circle at 50% 55%, rgba(255,255,255,0.05) 0%, rgba(0,0,0,${Math.max(
          0,
          1 - brightFactor * 0.85
        ).toFixed(2)}) 85%)`,
      };
    }
    if (stageBgMode === 'gradient') {
      return {
        backgroundColor: stageBgColor,
        backgroundImage: `radial-gradient(ellipse at 50% 55%, ${stageBgSecondaryColor} 0%, ${stageBgColor} 78%)`,
        filter: `brightness(${(0.45 + brightFactor * 0.7).toFixed(2)})`,
      };
    }
    return {
      backgroundColor: stageBgColor,
    };
  };

  return (
    <div className="flex flex-col gap-8 max-w-6xl w-full">
      {/* Static Page Header (100% Static — no interactive buttons or variable badges above View Box) */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-mono uppercase tracking-wider text-amber-500 font-bold">
          Layer 5G - HUD Bottom-Center Upward Takeover & Seamless Rounded-Rect Vignette
        </span>
        <h1 className="text-2xl font-bold tracking-tight">
          Takeover - Player Handoff & Reconnect Countdown System
        </h1>
        <p className={`text-xs leading-relaxed ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
          Cloned and evolved from 5E (Five Echo) for bot takeover and disconnect-reconnect handoffs: keeps Scoreboard
          and Team Roster visible, hides Cockpit HUD (BallCam, Speedometer, Flip Indicator, Boost Gauge) on replacing-in
          signal with a seamless rounded-rectangle 4-edge vignette mask underneath the UI layer, anchors relative to
          bottom-center with upward offset, renders Top Regular (Takeover in...) in Team Color (Blue vs Orange) +
          Glowing Stroke while Bottom Thin (3 -&gt; 2 -&gt; 1) pops, and slides all Cockpit HUD gauges back in upon
          completion.
        </p>
      </div>

      {/* SECTION 1: LIVE TAKEOVER STAGE & SIGNAL CHOREOGRAPHY (View Box Pinned at Top) */}
      <section
        id="takeover-stage"
        className={`p-5 rounded-3xl border flex flex-col gap-5 scroll-mt-24 ${
          isLight
            ? 'bg-white border-neutral-200 text-neutral-900 shadow-xs'
            : 'bg-neutral-900/80 border-neutral-800 text-neutral-100 shadow-xl'
        }`}
      >
        {/* 16:9 HUD ANCHOR STAGE PREVIEW CANVAS (View Box — Pinned directly below static Page Header) */}
        <TakeoverStageCanvas
          backdrop={{
            stageBgMode,
            arenaPreset,
            stageBrightness,
            showPitchLines,
            showAnchorGuides,
            getStageBackgroundStyle,
          }}
          hudConfig={{
            glowConfig,
            typoConfig,
            timingConfig,
            vignetteConfig,
            vignettePreviewActive,
          }}
          bottomOffsetPx={bottomOffsetPx}
          activeSignal={activeSignal}
          isCockpitVisible={isCockpitVisible}
          myTeamSide={myTeamSide}
          activePayload={activePayload}
          isSequencePlaying={isSequencePlaying}
          setIsVisibleOnStage={setIsVisibleOnStage}
          channel={channelRef.current}
        />

        <TakeoverStageBackdropBar isLight={isLight} />

        <TakeoverSignalControlDeck
          isLight={isLight}
          stopTakeoverSequence={stopTakeoverSequence}
          startTakeoverSequence={startTakeoverSequence}
        />
      </section>

      <PageJumpDirectory
        layerTag="Layer 5G - HUD Bottom-Center Upward Takeover & Seamless Rounded-Rect Vignette"
        title="Takeover - Player Handoff & Reconnect Countdown System"
        subtitle="Jump directly to any 5G Takeover section below."
        items={TAKEOVER_DIRECTORY_ITEMS}
        isLight={isLight}
      />

      {/* SECTION 2: VIGNETTE, OFFSET, MOTION, GLOW & TYPOGRAPHY TUNER */}
      <TakeoverTunerSection isLight={isLight} />

      {/* SECTION 3: SCENARIO PRESETS & CODE RECIPE */}
      <TakeoverArchetypesSection
        isLight={isLight}
        stageBgColor={stageBgColor}
        bottomOffsetPx={bottomOffsetPx}
        topLabelText={topLabelText}
        myTeamSide={myTeamSide}
        glowConfig={glowConfig}
        typoConfig={typoConfig}
        timingConfig={timingConfig}
        vignetteConfig={vignetteConfig}
        onSelectScenario={handleSelectScenario}
      />
    </div>
  );
};

export default TakeoverPage;
