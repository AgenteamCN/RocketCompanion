import React from 'react';
import { Crosshair, Sparkles, Play, Pause } from 'lucide-react';
import { Badge } from '../../ui-core/primitives/Badge';
import { SectionErrorBoundary } from '../components/SectionErrorBoundary';
import { TunerConfigExporterBar } from '../components/tuner/TunerConfigExporterBar';
import { PageJumpDirectory, JumpDirectoryItem } from '../PageJumpDirectory';
import { HudSpatialChoreographySandbox } from './hud-elements/HudSpatialChoreographySandbox';
import { EdgeDemoInspectorSection } from './hud-elements/EdgeDemoInspectorSection';
import { EdgeSkipReplayInspectorSection } from './hud-elements/EdgeSkipReplayInspectorSection';
import { HudCoreTriadInspectorSection } from './hud-elements/HudCoreTriadInspectorSection';
import { HudStageAndFollowupSection } from './hud-elements/HudStageAndFollowupSection';
import { HudTopBandPairSection } from './hud-elements/HudTopBandPairSection';
import { useHudElementsPageState } from './hud-elements/useHudElementsPageState';

const HUD_5A_DIRECTORY_ITEMS: JumpDirectoryItem[] = [
  {
    id: 'hud-5a-sandbox',
    code: '5A.S',
    name: 'HudSpatialChoreographySandbox',
    label:
      'High-density full-screen layout and transient animation sandbox (Top Edge Docking + Anti-glitch Double Chin)',
  },
  {
    id: 'hud-5a-1-scoreboard',
    code: '5A.1',
    name: 'StepperScoreboardHUD',
    label: 'Top flush right angle·Bottom rounded scoreboard + Anti-glitch Single/Double Chin',
  },
  {
    id: 'hud-5a-2-edge-strip',
    code: '5A.2',
    name: 'EdgePlayerHudStrip',
    label: '3v3 Strictly axis-symmetric single-sided rounded bar (Live/Replay/Spectator)',
  },
  {
    id: 'hud-5a-2-demo-inspector',
    code: '5A.2+',
    name: 'EdgeDemoInspectorSection',
    label: 'Explosion status persistent preview Bomb SVG size/weight/Outer glow workbench',
  },
  {
    id: 'hud-5a-2-skip-inspector',
    code: '5A.2++',
    name: 'EdgeSkipReplayInspectorSection',
    label:
      'Skip Replay & Slot Extension Card under-card border, push/retract choreography & icon workbench',
  },
  {
    id: 'hud-5a-3-ball-cam',
    code: '5A.3',
    name: 'BallCameraIndicator',
    label: 'Low-frequency discrete sphere view indicator (React.memo + subscribeBallCam)',
  },
  {
    id: 'hud-5a-4-velocity-bar',
    code: '5A.4',
    name: 'VelocityProgressBar',
    label: '120Hz Zero-radius supersonic progress bar (subscribeSpeed DOM Ref)',
  },
  {
    id: 'hud-5a-5-boost-gauge',
    code: '5A.5',
    name: 'CircularBoostGauge',
    label: '120Hz Fully parametric circular progress gauge (subscribeBoost SVG Ref)',
  },
  {
    id: 'hud-5a-5s-triad-stage',
    code: '5A.5S',
    name: 'Decoupled 3-Widget Stage',
    label:
      'high frequency Speed/Boost + low frequency BallCam Zero-coupling slot layout test bench',
  },
  {
    id: 'hud-5a-6-telemetry-flip',
    code: '5A.6 & 5A.7',
    name: 'CompactTelemetryBarHUD & FlipIndicatorPillHUD',
    label: 'Top-Left 4 Metric Micro-capsule + Double-jump countdown status light',
  },
  {
    id: 'hud-5a-9-kickoff-rhythm',
    code: '5A.9',
    name: 'KickoffRhythmOverlayHUD',
    label: '120Hz Zero Allocation Canvas Kickoff Rhythm Track + 9Key Hit Row',
  },
];

export const HudElementsPage: React.FC<{ isLight?: boolean }> = ({ isLight = true }) => {
  const {
    ballCamActive,
    ballCamShortcut,
    ballCamLabel,
    speed,
    boostAmount,
    isUnlimitedBoost,
    is120HzLive,
    setIs120HzLive,
    slotPreset,
    setSlotPreset,
    edgeSkipReady,
    toggleEdgeSkipReady,
    edgeSkipConfig,
    setEdgeSkipConfig,
    transientChannel,
    liveSpeedReadoutRef,
    liveBoostReadoutRef,
    liveHzReadoutRef,
    liveRenderRateRef,
    toastMsg,
    applyScenarioPreset,
    subscribeSpeedFn,
    subscribeBoostFn,
    subscribeBallCamFn,
    handleToggleBallCam,
    build5AExportCode,
    handleReset5ADefaults,
  } = useHudElementsPageState();

  return (
    <div className="flex flex-col gap-10 max-w-6xl w-full">
      {/* Top Jump Directory */}
      <PageJumpDirectory
        layerTag="Layer 5A · High-Frequency Match HUD Elements"
        title="HUD Elements Independent gauge and spatial layout directory"
        subtitle="all 5A Components uniformly integrated hudTransientChannel 120Hz Transient Channel (0 React Re-render) And Full Support Light/Dark Mode Switch. "
        items={HUD_5A_DIRECTORY_ITEMS}
        isLight={isLight}
      />

      <TunerConfigExporterBar
        badge="5A-EXPORT"
        title="HUD Elements Parameter Tuner & One-Click Config Exporter"
        subtitle="Exports 5A Cockpit Triad (BallCam, VelocityProgressBar, CircularBoostGauge), EdgePlayerHudStrip Skip/Demo indicators & slot layout preset"
        copyLabel="Copy 5A HUD Config (Export Snapshot)"
        codeTitle="Current 5A HUD Elements Parameter Snapshot (Paste directly into DEFAULT_5A_HUD_ELEMENTS_SNAPSHOT)"
        actionId="export-5a-hud-config"
        isLight={isLight}
        buildExportCode={build5AExportCode}
        onResetDefaults={handleReset5ADefaults}
      />

      {/* Top Title Area */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <Crosshair className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            HUD Elements Independent Gauge Component
          </h1>
          <Badge variant="primary" size="sm" isLight={isLight}>
            Standalone · Zero Position Coupling
          </Badge>
          <Badge variant="amber" size="sm" isLight={isLight}>
            120Hz Transient Ref + Low-Freq Memo
          </Badge>
        </div>
        <p className={`text-xs ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
          Each component is 100% Layout-agnostic presentation block (Internal never hardcoded{' '}
          <code className="font-mono">position: absolute</code>) . Low-frequency discrete component (
          <code className="font-mono text-red-500">BallCameraIndicator</code>) Adopt{' '}
          <code className="font-mono">React.memo</code> Isolation; High-frequency Continuous Component (
          <code className="font-mono text-emerald-500">VelocityProgressBar</code> and{' '}
          <code className="font-mono text-sky-500">CircularBoostGauge</code>) Support via{' '}
          <code className="font-mono">subscribeSpeed / subscribeBoost</code> or{' '}
          <code className="font-mono">ref</code> Transient Channel Direct Drive DOM/SVG, in{' '}
          <strong>0 React Re-renders at 120Hz</strong>.
        </p>

        {/* Top 120Hz Transient Engine Toggle + Contextual linkage test bar */}
        <div
          className={`mt-2 p-3.5 rounded-2xl border flex flex-col gap-3 ${
            isLight
              ? 'bg-neutral-50/90 border-neutral-200/90 text-neutral-800'
              : 'bg-neutral-900/70 border-neutral-800 text-neutral-200'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setIs120HzLive((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold border cursor-pointer transition-all ${
                  is120HzLive
                    ? 'bg-emerald-500 text-neutral-950 border-emerald-400 shadow-xs'
                    : isLight
                    ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                    : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
                }`}
              >
                {is120HzLive ? (
                  <>
                    <Pause className="h-3.5 w-3.5 fill-current" />
                    <span>
                      [Boost] 120Hz Transient physics stream running (Click to switch back to manual slider)
                    </span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>Start 120Hz Zero-redraw transient physics stream (Start 120Hz Stream)</span>
                  </>
                )}
              </button>

              {is120HzLive && (
                <div
                  className={`flex items-center gap-3 px-3 py-1 rounded-xl border font-mono text-[11px] ${
                    isLight
                      ? 'bg-white border-neutral-200 text-neutral-700'
                      : 'bg-neutral-950/80 border-neutral-800 text-neutral-300'
                  }`}
                >
                  <span>
                    Stream:{' '}
                    <strong ref={liveHzReadoutRef} className="text-sky-500">
                      120 Hz
                    </strong>
                  </span>
                  <span className="opacity-30">|</span>
                  <span>
                    React Re-renders:{' '}
                    <strong ref={liveRenderRateRef} className="text-emerald-500">
                      0 / sec
                    </strong>
                  </span>
                  <span className="opacity-30">|</span>
                  <span>
                    Speed:{' '}
                    <strong ref={liveSpeedReadoutRef} className="text-amber-500">
                      1410 uu/s
                    </strong>
                  </span>
                  <span className="opacity-30">|</span>
                  <span>
                    Boost:{' '}
                    <strong ref={liveBoostReadoutRef} className="text-sky-500">
                      85%
                    </strong>
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-mono text-neutral-400 flex items-center gap-1 mr-1">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span>Static Preset:</span>
              </span>
              <button
                type="button"
                onClick={() => applyScenarioPreset('kickoff')}
                className={`px-2.5 py-1 rounded-xl text-xs font-medium border cursor-pointer transition-all ${
                  isLight
                    ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-800'
                    : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
                }`}
              >
                Kickoff sprint (Kickoff)
              </button>
              <button
                type="button"
                onClick={() => applyScenarioPreset('defense')}
                className={`px-2.5 py-1 rounded-xl text-xs font-medium border cursor-pointer transition-all ${
                  isLight
                    ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-800'
                    : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
                }`}
              >
                Goal-line defense (Defense)
              </button>
              <button
                type="button"
                onClick={() => applyScenarioPreset('supersonic-rush')}
                className={`px-2.5 py-1 rounded-xl text-xs font-medium border cursor-pointer transition-all ${
                  isLight
                    ? 'bg-sky-50 hover:bg-sky-100 border-sky-300 text-sky-900'
                    : 'bg-sky-950/40 hover:bg-sky-900/50 border-sky-700/60 text-sky-300'
                }`}
              >
                Supersonic dash (Supersonic)
              </button>
              <button
                type="button"
                onClick={() => applyScenarioPreset('empty-clutch')}
                className={`px-2.5 py-1 rounded-xl text-xs font-medium border cursor-pointer transition-all ${
                  isLight
                    ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-800'
                    : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
                }`}
              >
                Zero-G speed (Empty Boost)
              </button>
            </div>
          </div>
        </div>

        {/* Toast Tooltip Bar */}
        {toastMsg && (
          <div className="fixed top-20 right-8 z-50 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500 text-white font-mono text-xs shadow-xl animate-in fade-in slide-in-from-top-2 duration-150">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{toastMsg}</span>
          </div>
        )}
      </div>

      {/* 5A.S: HUD v2 FULL-VIEWPORT SPATIAL LAYOUT & CHOREOGRAPHY SANDBOX */}
      <div id="hud-5a-sandbox" className="scroll-mt-24">
        <SectionErrorBoundary
          title="5A.S HudSpatialChoreographySandbox"
          scopePrefix="hud-spatial-sandbox"
          isLight={isLight}
        >
          <HudSpatialChoreographySandbox isLight={isLight} />
        </SectionErrorBoundary>
      </div>

      {/* 5A.1 & 5A.2: STEPPER SCOREBOARD HUD & EDGE PLAYER HUD STRIP */}
      <HudTopBandPairSection
        isLight={isLight}
        edgeSkipReady={edgeSkipReady}
        toggleEdgeSkipReady={toggleEdgeSkipReady}
        edgeSkipConfig={edgeSkipConfig}
        setEdgeSkipConfig={setEdgeSkipConfig}
        transientChannel={transientChannel}
      />

      {/* 5A.2+: Dedicated Persistent Demolished Slot & Bomb SVG Size/Style Inspector */}
      <SectionErrorBoundary
        title="5A.2+ EdgeDemoInspectorSection"
        scopePrefix="hud-5a-2-demo-inspector"
        isLight={isLight}
      >
        <EdgeDemoInspectorSection isLight={isLight} />
      </SectionErrorBoundary>

      {/* 5A.2++: Dedicated Skip Replay & Slot Extension Card Workbench */}
      <SectionErrorBoundary
        title="5A.2++ EdgeSkipReplayInspectorSection"
        scopePrefix="hud-5a-2-skip-inspector"
        isLight={isLight}
      >
        <EdgeSkipReplayInspectorSection isLight={isLight} />
      </SectionErrorBoundary>

      <SectionErrorBoundary
        title="5A.3 ~ 5A.5 HudCoreTriadInspectorSection"
        scopePrefix="hud-5a-5-boost-config"
        isLight={isLight}
      >
        <HudCoreTriadInspectorSection
          isLight={isLight}
          handleToggleBallCam={handleToggleBallCam}
          subscribeBallCamFn={subscribeBallCamFn}
          subscribeSpeedFn={subscribeSpeedFn}
          subscribeBoostFn={subscribeBoostFn}
        />
      </SectionErrorBoundary>

      <SectionErrorBoundary title="5A.6 ~ 5A.9 HudStageAndFollowupSection" isLight={isLight}>
        <HudStageAndFollowupSection
          isLight={isLight}
          is120HzLive={is120HzLive}
          slotPreset={slotPreset}
          setSlotPreset={setSlotPreset}
          ballCam={{
            active: ballCamActive,
            subscribeFn: subscribeBallCamFn,
            shortcut: ballCamShortcut,
            label: ballCamLabel,
            onToggle: handleToggleBallCam,
          }}
          speed={speed}
          subscribeSpeedFn={subscribeSpeedFn}
          boostAmount={boostAmount}
          isUnlimitedBoost={isUnlimitedBoost}
          subscribeBoostFn={subscribeBoostFn}
          transientChannel={transientChannel}
        />
      </SectionErrorBoundary>
    </div>
  );
};
