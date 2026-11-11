import React, { useEffect, useRef, useCallback } from 'react';
import {
  CenterUpperInfoPayload,
  CenterUpperInfoVariant,
  WinnerTeamPreset,
} from '../../ui-core/hud/CenterUpperInfoHUD';
import { Badge } from '../../ui-core/primitives/Badge';
import { ToggleSwitch } from '../../ui-core/primitives/ToggleSwitch';
import { PageJumpDirectory } from '../PageJumpDirectory';
import { CenterUpperTunerSection } from './center-upper-info/CenterUpperTunerSection';
import {
  DIRECTORY_ITEMS,
  CenterUpperStageBackdropBar,
  type CustomAnnouncementPreset,
} from './center-upper-info/CenterUpperStageBackdropBar';
import { CenterUpperArchetypesSection } from './center-upper-info/CenterUpperArchetypesSection';
import { CenterUpperStageCanvas } from './center-upper-info/CenterUpperStageCanvas';
import { CenterUpperActionDeck } from './center-upper-info/CenterUpperActionDeck';
import { useCenterUpperSyncedState } from './center-upper-info/useCenterUpperSyncedState';

export const CenterUpperInfoPage: React.FC<{ isLight?: boolean }> = ({ isLight = true }) => {
  const {
    stageBgMode,
    stageBgColor,
    stageBgSecondaryColor,
    arenaPreset,
    stageBrightness,
    showPitchLines,
    showAnchorGuides,
    setShowAnchorGuides,
    showSurroundingHud,
    setShowSurroundingHud,
    upperCenterTopPct,
    activeVariant,
    setActiveVariant,
    countdownStep,
    setCountdownStep,
    goLabelText,
    countdownIntervalMs,
    isSequencePlaying,
    setIsSequencePlaying,
    loopSequence,
    winnerTeam,
    setWinnerTeam,
    winnerTopText,
    setWinnerTopText,
    winnerMainText,
    setWinnerMainText,
    winnerSubText,
    winnerBlueConfig,
    setCustomPresetId,
    showCustomTopLine,
    setShowCustomTopLine,
    customTopText,
    setCustomTopText,
    customMainText,
    setCustomMainText,
    customSubText,
    setCustomSubText,
    glowConfig,
    typoConfig,
    timingConfig,
    setTimingConfig,
    triggerNonce,
    setTriggerNonce,
    isVisibleOnStage,
    setIsVisibleOnStage,
  } = useCenterUpperSyncedState();

  const sequenceTimerRef = useRef<number | null>(null);

  const stopCountdownSequence = useCallback(() => {
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

  const startCountdownSequence = useCallback(
    (stepIntervalOverride?: number) => {
      stopCountdownSequence();
      const stepMs = Math.max(200, stepIntervalOverride ?? countdownIntervalMs);
      const finalHoldPlusExitMs =
        Math.max(timingConfig.entryDurationMs, timingConfig.durationMs) +
        Math.max(0, timingConfig.exitDurationMs);
      const steps: ('3' | '2' | '1' | 'GO')[] = ['3', '2', '1', 'GO'];
      setActiveVariant('countdown');
      setIsSequencePlaying(true);
      setIsVisibleOnStage(true);
      let idx = 0;
      const runStep = () => {
        const current = steps[idx];
        setCountdownStep(current);
        setIsVisibleOnStage(true);
        setTriggerNonce((n) => n + 1);
        idx += 1;
        if (idx < steps.length) {
          sequenceTimerRef.current = window.setTimeout(runStep, stepMs);
        } else {
          sequenceTimerRef.current = window.setTimeout(() => {
            if (loopSequence) {
              idx = 0;
              runStep();
            } else {
              setIsSequencePlaying(false);
              if (!timingConfig.persistentInspect) {
                setIsVisibleOnStage(false);
              }
            }
          }, finalHoldPlusExitMs);
        }
      };
      runStep();
    },
    [
      stopCountdownSequence,
      countdownIntervalMs,
      timingConfig.entryDurationMs,
      timingConfig.durationMs,
      timingConfig.exitDurationMs,
      timingConfig.persistentInspect,
      loopSequence,
      setActiveVariant,
      setIsSequencePlaying,
      setIsVisibleOnStage,
      setCountdownStep,
      setTriggerNonce,
    ]
  );

  const handleSelectVariant = useCallback(
    (variant: CenterUpperInfoVariant) => {
      stopCountdownSequence();
      setActiveVariant(variant);
      setIsVisibleOnStage(true);
      setTriggerNonce((n) => n + 1);
    },
    [stopCountdownSequence, setActiveVariant, setIsVisibleOnStage, setTriggerNonce]
  );

  const handleSelectWinnerTeam = useCallback(
    (team: WinnerTeamPreset) => {
      stopCountdownSequence();
      setActiveVariant('winner');
      setWinnerTeam(team);
      setWinnerTopText('WINNER');
      if (team === 'blue') {
        setWinnerMainText('BLUE TEAM');
      } else if (team === 'orange') {
        setWinnerMainText('ORANGE TEAM');
      } else {
        setWinnerMainText('CHAMPION SQUAD');
      }
      setIsVisibleOnStage(true);
      setTriggerNonce((n) => n + 1);
    },
    [
      stopCountdownSequence,
      setActiveVariant,
      setWinnerTeam,
      setWinnerTopText,
      setWinnerMainText,
      setIsVisibleOnStage,
      setTriggerNonce,
    ]
  );

  const handleActivateBlueWinnerPreview = useCallback(() => {
    stopCountdownSequence();
    setActiveVariant('winner');
    setWinnerTeam('blue');
    setWinnerTopText('WINNER');
    setWinnerMainText('BLUE TEAM');
    setIsVisibleOnStage(true);
  }, [
    stopCountdownSequence,
    setActiveVariant,
    setWinnerTeam,
    setWinnerTopText,
    setWinnerMainText,
    setIsVisibleOnStage,
  ]);

  const handleApplyCustomPreset = useCallback(
    (preset: CustomAnnouncementPreset) => {
      stopCountdownSequence();
      setActiveVariant('announcement');
      setCustomPresetId(preset.id);
      setShowCustomTopLine(Boolean(preset.topText));
      setCustomTopText(preset.topText.toUpperCase());
      setCustomMainText(preset.mainText.toUpperCase());
      setCustomSubText('');
      setIsVisibleOnStage(true);
      setTriggerNonce((n) => n + 1);
    },
    [
      stopCountdownSequence,
      setActiveVariant,
      setCustomPresetId,
      setShowCustomTopLine,
      setCustomTopText,
      setCustomMainText,
      setCustomSubText,
      setIsVisibleOnStage,
      setTriggerNonce,
    ]
  );

  const activePayload: CenterUpperInfoPayload | null = isVisibleOnStage
    ? activeVariant === 'countdown'
      ? {
          variant: 'countdown',
          topText: '',
          mainText: countdownStep === 'GO' ? goLabelText : countdownStep,
          glow: glowConfig,
          typography: typoConfig,
          timing: {
            ...timingConfig,
            persistentInspect: isSequencePlaying ? false : timingConfig.persistentInspect,
          },
          triggerKey: triggerNonce,
        }
      : activeVariant === 'winner'
      ? {
          variant: 'winner',
          winnerTeam,
          winnerBlueConfig,
          topText: winnerTopText,
          mainText: winnerMainText,
          subText: winnerSubText,
          glow: glowConfig,
          typography: typoConfig,
          timing: timingConfig,
          triggerKey: triggerNonce,
        }
      : {
          variant: 'announcement',
          topText: showCustomTopLine ? customTopText.toUpperCase() : '',
          mainText: customMainText.toUpperCase(),
          subText: customSubText.toUpperCase(),
          glow: glowConfig,
          typography: { ...typoConfig, uppercase: true },
          timing: timingConfig,
          triggerKey: triggerNonce,
        }
    : null;

  const getStageBackgroundStyle = (): React.CSSProperties => {
    const brightFactor = stageBrightness / 100;
    if (stageBgMode === 'solid') {
      return {
        backgroundColor: stageBgColor,
        backgroundImage: `radial-gradient(circle at 50% ${upperCenterTopPct}%, rgba(255,255,255,0.05) 0%, rgba(0,0,0,${(
          1 -
          brightFactor * 0.85
        ).toFixed(2)}) 85%)`,
      };
    }
    if (stageBgMode === 'gradient') {
      return {
        backgroundColor: stageBgColor,
        backgroundImage: `radial-gradient(ellipse at 50% ${upperCenterTopPct}%, ${stageBgSecondaryColor} 0%, ${stageBgColor} 78%)`,
        filter: `brightness(${(0.45 + brightFactor * 0.7).toFixed(2)})`,
      };
    }
    return {
      backgroundColor: stageBgColor,
    };
  };

  return (
    <div className="flex flex-col gap-8 max-w-6xl w-full">
      {/* Static Page Header (Nothing above the View Box ever changes) */}
      <div className="flex flex-col gap-1.5 pb-2 border-b border-neutral-200/80 dark:border-neutral-800">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="amber" size="sm" isLight={isLight}>
            5E · Five Echo
          </Badge>
          <h1 className="text-2xl font-bold tracking-tight">
            Center-Upper Information Top-Center High-Priority Alert System
          </h1>
          <Badge variant="primary" size="sm" isLight={isLight}>
            JetBrains Mono Thin (100) + Regular (400)
          </Badge>
        </div>
        <p className={`text-xs leading-relaxed ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
          Static top-pinned View Box stage — all countdown sequences, winner presets, custom
          announcements, and backdrop controls operate below the View Box so nothing above it ever
          changes.
        </p>
      </div>

      {/* SECTION 1: TOP-PINNED VIEW BOX STAGE & QUICK TRIGGERS BELOW */}
      <section
        id="center-upper-stage"
        className={`p-5 rounded-3xl border flex flex-col gap-5 scroll-mt-24 ${
          isLight
            ? 'bg-white border-neutral-200 text-neutral-900 shadow-xs'
            : 'bg-neutral-900/80 border-neutral-800 text-neutral-100 shadow-xl'
        }`}
      >
        <CenterUpperStageCanvas
          backdrop={{
            stageBgMode,
            arenaPreset,
            stageBrightness,
            showPitchLines,
            showAnchorGuides,
            getStageBackgroundStyle,
          }}
          upperCenterTopPct={upperCenterTopPct}
          showSurroundingHud={showSurroundingHud}
          activePayload={activePayload}
          glowConfig={glowConfig}
          winnerBlueConfig={winnerBlueConfig}
          typoConfig={typoConfig}
          timingConfig={timingConfig}
          activeVariant={activeVariant}
          isSequencePlaying={isSequencePlaying}
          setIsVisibleOnStage={setIsVisibleOnStage}
        />

        <CenterUpperStageBackdropBar isLight={isLight} />

        {/* Header Bar */}
        <div className="flex items-center justify-between border-b pb-3 border-neutral-200 dark:border-neutral-800 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="amber" size="sm" isLight={isLight}>
              5E-1
            </Badge>
            <h2 className="text-base font-bold tracking-tight">
              HudAnchorStage (`anchor=&quot;upper-center&quot;`) · Upper-center high-priority alert
              real-time preview stage
            </h2>
            <Badge variant="success" size="sm" isLight={isLight}>
              Zero Coupling · Standalone Component
            </Badge>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <ToggleSwitch
              label="Surrounding Arena HUD Reference"
              checked={showSurroundingHud}
              onCheckedChange={setShowSurroundingHud}
              isLight={isLight}
            />
            <ToggleSwitch
              label="Anchor assist crosshair"
              checked={showAnchorGuides}
              onCheckedChange={setShowAnchorGuides}
              isLight={isLight}
            />
            <ToggleSwitch
              label="Persistent Tuning (Do Not Auto-Dismiss)"
              checked={timingConfig.persistentInspect ?? false}
              onCheckedChange={(v) => {
                setTimingConfig((prev) => ({ ...prev, persistentInspect: v }));
                setIsVisibleOnStage(true);
                setTriggerNonce((n) => n + 1);
              }}
              isLight={isLight}
            />
          </div>
        </div>

        <CenterUpperActionDeck
          isLight={isLight}
          handleSelectVariant={handleSelectVariant}
          stopCountdownSequence={stopCountdownSequence}
          startCountdownSequence={startCountdownSequence}
          handleSelectWinnerTeam={handleSelectWinnerTeam}
          handleActivateBlueWinnerPreview={handleActivateBlueWinnerPreview}
          handleApplyCustomPreset={handleApplyCustomPreset}
        />
      </section>

      <PageJumpDirectory
        layerTag="Layer 5E · HUD Anchor Upper-Center Strong Reminder"
        title="Center-Upper Information Top-center high-priority alert system"
        subtitle={[
          'Based on L2 HudAnchorStage (upper-center Anchor Y=40%) Zero-coupling strong alert layer: ',
          'support 3-2-1-GO Overlay Countdown, Regular (400) + Thin (100) Double Layer Winner ',
          'Battle Result Broadcast, Custom match announcement and one-click parameter export.',
        ].join('')}
        items={DIRECTORY_ITEMS}
        isLight={isLight}
      />

      <CenterUpperTunerSection
        isLight={isLight}
        onActivateBlueWinnerPreview={handleActivateBlueWinnerPreview}
      />

      <CenterUpperArchetypesSection
        isLight={isLight}
        activePayload={activePayload}
        handleSelectVariant={handleSelectVariant}
        startCountdownSequence={startCountdownSequence}
        handleSelectWinnerTeam={handleSelectWinnerTeam}
        handleApplyCustomPreset={handleApplyCustomPreset}
      />
    </div>
  );
};
