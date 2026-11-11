import React from 'react';
import { TunerConfigExporterBar } from '../../components/tuner/TunerConfigExporterBar';
import { TakeoverVignetteTunerCard } from './TakeoverVignetteTunerCard';
import { TakeoverOffsetAndMotionCard } from './TakeoverOffsetAndMotionCard';
import { TakeoverGlowAndTypographyCards } from './TakeoverGlowAndTypographyCards';
import { useTakeoverSyncedState } from './useTakeoverSyncedState';

export interface TakeoverTunerSectionProps {
  isLight: boolean;
}

export const TakeoverTunerSection: React.FC<TakeoverTunerSectionProps> = ({
  isLight,
}) => {
  const {
    myTeamSide,
    setMyTeamSide,
    vignetteConfig,
    setVignetteConfig,
    alwaysPreviewVignette,
    setAlwaysPreviewVignette,
    glowConfig,
    setGlowConfig,
    syncGlowWithText,
    setSyncGlowWithText,
    timingConfig,
    setTimingConfig,
    typoConfig,
    setTypoConfig,
    countdownIntervalMs,
    setCountdownIntervalMs,
    bottomOffsetPx,
    setBottomOffsetPx,
    handleSetVisibleOnStage: setIsVisibleOnStage,
    setTriggerNonce,
    buildExportCode,
    handleResetDefaults,
  } = useTakeoverSyncedState();

  return (
    <section id="takeover-tuner" className="grid grid-cols-1 lg:grid-cols-2 gap-5 scroll-mt-24">
      <TunerConfigExporterBar
        badge="5G-2"
        title="Takeover Parameter Tuner & One-Click Config Exporter"
        subtitle="Adjust seamless rounded-rect vignette (Independent X/Y depth, blur feather, corner radius, Bezier curve), team-colored `Takeover in...`, and bottom offset"
        copyLabel="Copy Takeover Config (Export Snapshot)"
        codeTitle="Current Takeover Parameter Snapshot (Seamless Rounded-Rect Vignette + Team Top Label + Bottom-Center Offset + Typography)"
        actionId="export-takeover-config"
        className="lg:col-span-2"
        isLight={isLight}
        buildExportCode={buildExportCode}
        onResetDefaults={handleResetDefaults}
      />

      <TakeoverVignetteTunerCard
        isLight={isLight}
        vignetteConfig={vignetteConfig}
        setVignetteConfig={setVignetteConfig}
        alwaysPreviewVignette={alwaysPreviewVignette}
        setAlwaysPreviewVignette={setAlwaysPreviewVignette}
      />
      {/* Card 2: Bottom-Center Upward Offset + Motion Envelope Tuner */}
      <TakeoverOffsetAndMotionCard
        isLight={isLight}
        bottomOffsetPx={bottomOffsetPx}
        setBottomOffsetPx={setBottomOffsetPx}
        timingConfig={timingConfig}
        setTimingConfig={setTimingConfig}
        countdownIntervalMs={countdownIntervalMs}
        setCountdownIntervalMs={setCountdownIntervalMs}
        setIsVisibleOnStage={setIsVisibleOnStage}
        setTriggerNonce={setTriggerNonce}
      />

      {/* Cards 3 & 4: Team-Colored Top Label + Digit Glow + Typography Hierarchy */}
      <TakeoverGlowAndTypographyCards
        isLight={isLight}
        myTeamSide={myTeamSide}
        setMyTeamSide={setMyTeamSide}
        glowConfig={glowConfig}
        setGlowConfig={setGlowConfig}
        syncGlowWithText={syncGlowWithText}
        setSyncGlowWithText={setSyncGlowWithText}
        typoConfig={typoConfig}
        setTypoConfig={setTypoConfig}
        setIsVisibleOnStage={setIsVisibleOnStage}
      />
    </section>
  );
};
