import React, { useEffect, useRef } from 'react';
import { Hourglass, Play, RotateCcw, Zap } from 'lucide-react';
import { DemolishHourglassTimerHUD } from '../../ui-core/hud/DemolishHourglassTimerHUD';
import { TemporalReplayFooterHUD } from '../../ui-core/hud/TemporalReplayFooterHUD';
import { Badge } from '../../ui-core/primitives/Badge';
import { Button } from '../../ui-core/primitives/Button';
import { SliderControl } from '../../ui-core/primitives/SliderControl';
import { createHudTransientChannel } from '../../ui-core/stores/hudTransientChannel';
import { ArenaBackdrop } from '../ArenaBackdrop';
import { CodeBlock } from '../CodeBlock';
import { TunerConfigExporterBar } from '../components/tuner/TunerConfigExporterBar';
import { PageJumpDirectory, type JumpDirectoryItem } from '../PageJumpDirectory';
import { useTemporalOverlaySyncedState } from './temporal-overlay/useTemporalOverlaySyncedState';

const T5A_DIRECTORY_ITEMS: JumpDirectoryItem[] = [
  {
    id: 't5a-1-replay-footer',
    code: 'T5A.1',
    name: 'TemporalReplayFooterHUD',
    label: 'Beveled glass playback bottom bar + Dynamic SVG Glow Top Edge',
  },
  {
    id: 't5a-2-respawn-hourglass',
    code: 'T5A.2',
    name: 'DemolishHourglassTimerHUD',
    label: '3Stage-color-changing hourglass respawn countdown (3s→0s Inset Sides)',
  },
];

export const TemporalOverlayPage: React.FC<{ isLight?: boolean }> = ({ isLight = true }) => {
  const {
    autoStream120Hz,
    setAutoStream120Hz,
    replayVisible,
    setReplayVisible,
    scorerName,
    setScorerName,
    goalSpeed,
    setGoalSpeed,
    assisterName,
    setAssisterName,
    teamAccentColor,
    setTeamAccentColor,
    respawnRemSec,
    setRespawnRemSec,
    respawnAutoLoop,
    setRespawnAutoLoop,
    handleResetT5ADefaults,
    buildT5AExportCode,
  } = useTemporalOverlaySyncedState();

  const channelRef = useRef(
    createHudTransientChannel({
      boostAmount: 74,
      replayFooter: {
        visible: replayVisible,
        scorerName,
        goalSpeed: `${goalSpeed}KPH`,
        assisterName,
        teamAccentColor,
      },
      respawnTimer: {
        remainingSeconds: respawnRemSec,
        totalSeconds: 3.0,
        active: true,
      },
    })
  );

  // Keep transient channel synchronized whenever synced state changes (including Reset Defaults)
  useEffect(() => {
    channelRef.current.setReplayFooter({
      visible: replayVisible,
      scorerName,
      goalSpeed: `${goalSpeed}KPH`,
      assisterName,
      teamAccentColor,
    });
  }, [replayVisible, scorerName, goalSpeed, assisterName, teamAccentColor]);

  useEffect(() => {
    if (!autoStream120Hz || !respawnAutoLoop) {
      channelRef.current.setRespawnTimer({
        remainingSeconds: respawnRemSec,
        totalSeconds: 3.0,
        active: true,
      });
    }
  }, [autoStream120Hz, respawnAutoLoop, respawnRemSec]);

  const respawnReadoutRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!autoStream120Hz) return;
    const ch = channelRef.current;
    let rafId = 0;
    const startTs = performance.now();
    let scrollCooldownUntil = 0;

    const onScrollCapture = () => {
      scrollCooldownUntil = performance.now() + 90;
    };
    window.addEventListener('scroll', onScrollCapture, { capture: true, passive: true });

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      if (now < scrollCooldownUntil || document.hidden) return;
      const elapsedSec = (now - startTs) / 1000;

      if (respawnAutoLoop) {
        const cycle = elapsedSec % 3.4;
        const rem = cycle <= 3.0 ? Math.max(0, 3.0 - cycle) : 0;
        ch.setRespawnTimer({
          remainingSeconds: rem,
          totalSeconds: 3.0,
          active: true,
        });
        if (respawnReadoutRef.current) {
          const stage =
            rem > 2.0
              ? 'STAGE 1 · WHITE/INK (3s→2s)'
              : rem > 1.0
                ? 'STAGE 2 · YELLOW (2s→1s)'
                : rem > 0
                  ? 'STAGE 3 · RED (1s→0s)'
                  : 'RESPAWNED (0.0s)';
          respawnReadoutRef.current.textContent = `${rem.toFixed(2)}s / 3.00s · ${stage}`;
        }
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', onScrollCapture, { capture: true });
    };
  }, [autoStream120Hz, respawnAutoLoop]);

  const cardClass = isLight
    ? 'bg-white border-neutral-200 text-neutral-900 shadow-xs'
    : 'bg-neutral-900/90 border-neutral-800 text-neutral-100 shadow-lg';

  const subPanelClass = isLight
    ? 'bg-neutral-50 border-neutral-200 text-neutral-800'
    : 'bg-neutral-950/75 border-neutral-800 text-neutral-200';

  const previewStageClass = isLight
    ? 'bg-slate-100/90 border-neutral-300 text-neutral-900'
    : 'bg-[#090D16] border-neutral-800 text-white';

  return (
    <div className="flex flex-col gap-8 pb-16">
      <PageJumpDirectory
        layerTag="Layer T5A · High-Frequency Temporal HUD Widgets"
        title="Temporal Overlay HUD Catalog (0-React-Rerender Transient Architecture)"
        subtitle="Active high-frequency temporal HUD widgets decoupled into src/ui-core/hud/ standalone components, connected via hudTransientChannel 120Hz DOM/SVG Ref direct write and full Light/Dark Mode adaptation."
        items={T5A_DIRECTORY_ITEMS}
        isLight={isLight}
      />

      <TunerConfigExporterBar
        badge="T5A-EXPORT"
        title="Temporal Overlay HUD Parameter Tuner & One-Click Config Exporter"
        subtitle="Exports T5A TemporalReplayFooterHUD (Scorer, Assister, Goal Speed, Team Glow) & DemolishHourglassTimerHUD (3.0s Respawn Countdown) parameters"
        copyLabel="Copy T5A Temporal Config (Export Snapshot)"
        codeTitle="Current T5A Temporal Overlay Parameter Snapshot (Paste directly into DEFAULT_T5A_TEMPORAL_OVERLAY_SNAPSHOT)"
        actionId="export-t5a-config"
        isLight={isLight}
        buildExportCode={buildT5AExportCode}
        onResetDefaults={handleResetT5ADefaults}
      />

      <div
        className={`px-4 py-3 rounded-2xl border flex items-center justify-between flex-wrap gap-3 ${subPanelClass}`}
      >
        <div className="flex items-center gap-2.5">
          <Zap className="h-4 w-4 text-amber-500" />
          <span className="text-xs font-bold font-mono">
            T5A 120Hz Transient Channel Stream (`createHudTransientChannel`)
          </span>
          <Badge variant={autoStream120Hz ? 'success' : 'neutral'} size="sm" isLight={isLight}>
            {autoStream120Hz ? '120HZ LIVE · 0 REACT RE-RENDERS' : 'MANUAL SLIDER MODE'}
          </Badge>
        </div>
        <Button
          variant={autoStream120Hz ? 'primary' : 'secondary'}
          size="sm"
          isLight={isLight}
          onClick={() => setAutoStream120Hz((v) => !v)}
        >
          {autoStream120Hz
            ? 'Pause 120Hz Auto streaming (Switch manual fine-tuning)'
            : 'On 120Hz Auto streaming'}
        </Button>
      </div>

      {/* T5A.1: TemporalReplayFooterHUD */}
      <section
        id="t5a-1-replay-footer"
        className={`p-5 rounded-3xl border flex flex-col gap-4 scroll-mt-24 ${cardClass}`}
      >
        <div className="flex items-center justify-between border-b pb-3 border-neutral-200 dark:border-neutral-800 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="amber" size="sm" isLight={isLight}>
              T5A.1
            </Badge>
            <h2 className="text-base font-bold font-mono">
              TemporalReplayFooterHUD (`src/ui-core/hud/TemporalReplayFooterHUD.tsx`)
            </h2>
            <Badge variant="primary" size="sm" isLight={isLight}>
              subscribeReplayFooter · ResizeObserver SVG Border
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={replayVisible ? 'primary' : 'secondary'}
              size="sm"
              isLight={isLight}
              onClick={() => setReplayVisible((v) => !v)}
            >
              <Play className="h-3.5 w-3.5 mr-1 inline" />
              {replayVisible ? 'Collapse Bottom Bar (Slide Out 0.65s)' : 'Expand Bottom Bar (Slide In 0.75s)'}
            </Button>
          </div>
        </div>

        <div className={`p-3.5 rounded-2xl border grid grid-cols-1 md:grid-cols-4 gap-3 ${subPanelClass}`}>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-mono opacity-75">Goal Scorer (Scorer)</label>
            <input
              type="text"
              value={scorerName}
              onChange={(e) => setScorerName(e.target.value)}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono ${
                isLight
                  ? 'bg-white border-neutral-300 text-neutral-900'
                  : 'bg-neutral-900 border-neutral-700 text-white'
              }`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-mono opacity-75">
              Assist Player (Assister · Hide if Empty)
            </label>
            <input
              type="text"
              value={assisterName}
              onChange={(e) => setAssisterName(e.target.value)}
              placeholder="Leave blank to auto-hide assist icon"
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono ${
                isLight
                  ? 'bg-white border-neutral-300 text-neutral-900'
                  : 'bg-neutral-900 border-neutral-700 text-white'
              }`}
            />
          </div>

          <div>
            <SliderControl
              label="Goal Speed"
              value={goalSpeed}
              min={40}
              max={216}
              step={1}
              unit=" KPH"
              isLight={isLight}
              onChange={(v) => setGoalSpeed(v)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-mono opacity-75">Team Theme Glow (Team Accent)</span>
            <div className="flex items-center gap-1.5 pt-1">
              {[
                { label: 'Gold', hex: '#edce0b' },
                { label: 'Blue', hex: '#3b82f6' },
                { label: 'Orange', hex: '#f97316' },
                { label: 'Emerald', hex: '#10b981' },
              ].map((sw) => (
                <button
                  key={sw.hex}
                  type="button"
                  onClick={() => setTeamAccentColor(sw.hex)}
                  className={`px-2 py-1 rounded text-[10px] font-mono font-bold border cursor-pointer ${
                    teamAccentColor === sw.hex ? 'ring-2 ring-amber-500' : 'opacity-80'
                  }`}
                  style={{
                    backgroundColor: `${sw.hex}22`,
                    borderColor: sw.hex,
                    color: isLight ? '#0f172a' : '#f8fafc',
                  }}
                >
                  {sw.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="relative w-full h-[215px] rounded-2xl border border-neutral-300 dark:border-neutral-800 overflow-hidden bg-black">
          <ArenaBackdrop preset={isLight ? 'daylight' : 'night'} brightness={isLight ? 72 : 34} />
          <TemporalReplayFooterHUD
            isLight={isLight}
            subscribeReplayFooter={channelRef.current.subscribeReplayFooter}
          />
        </div>
      </section>

      {/* T5A.2: DemolishHourglassTimerHUD */}
      <section
        id="t5a-2-respawn-hourglass"
        className={`p-5 rounded-3xl border flex flex-col gap-4 scroll-mt-24 ${cardClass}`}
      >
        <div className="flex items-center justify-between border-b pb-3 border-neutral-200 dark:border-neutral-800 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="amber" size="sm" isLight={isLight}>
              T5A.2
            </Badge>
            <h2 className="text-base font-bold font-mono flex items-center gap-1.5">
              <Hourglass className="h-4 w-4 text-amber-500" />
              <span>DemolishHourglassTimerHUD (`src/ui-core/hud/DemolishHourglassTimerHUD.tsx`)</span>
            </h2>
            <Badge variant="primary" size="sm" isLight={isLight}>
              subscribeRespawnTimer · 3-Stage Color Progression
            </Badge>
          </div>
          <button
            type="button"
            onClick={() => setRespawnAutoLoop((v) => !v)}
            className="px-2.5 py-1 rounded-lg border border-neutral-400/40 text-xs font-mono cursor-pointer hover:bg-neutral-500/10"
          >
            <RotateCcw className="h-3 w-3 inline mr-1" />
            {respawnAutoLoop ? 'Toggle manual slider positioning' : 'restore 3.0s Loop Countdown'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
          <div className={`p-4 rounded-2xl border flex flex-col gap-3 ${subPanelClass}`}>
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="opacity-75">Current countdown phase:</span>
              <span ref={respawnReadoutRef} className="font-bold text-amber-500 tabular-nums">
                {respawnRemSec.toFixed(2)}s / 3.00s
              </span>
            </div>
            <SliderControl
              label="Remaining Respawn Seconds (3.0s → 0.0s)"
              value={respawnRemSec}
              min={0}
              max={3.0}
              step={0.05}
              unit="s"
              isLight={isLight}
              onChange={(v) => {
                setRespawnAutoLoop(false);
                setRespawnRemSec(v);
              }}
            />
          </div>

          <div
            className={`h-[124px] rounded-2xl border flex flex-col items-center justify-center gap-2 ${previewStageClass}`}
          >
            <DemolishHourglassTimerHUD
              isLight={isLight}
              subscribeRespawnTimer={channelRef.current.subscribeRespawnTimer}
              remainingSeconds={respawnRemSec}
              totalSeconds={3.0}
              alwaysVisible={true}
              width={260}
              height={38}
            />
            <span className="text-[10px] font-mono opacity-65">
              Left and right progress bars converge to the center hourglass (`transform-origin: 100% 50%` &amp; `0% 50%`)
            </span>
          </div>
        </div>
      </section>

      <CodeBlock
        isLight={isLight}
        title="T5A Temporal Overlay 120Hz Transient Channel Calling Recipe (Reflects Current Parameters)"
        code={`import { createHudTransientChannel } from '@/ui-core/stores/hudTransientChannel';
import { TemporalReplayFooterHUD } from '@/ui-core/hud/TemporalReplayFooterHUD';
import { DemolishHourglassTimerHUD } from '@/ui-core/hud/DemolishHourglassTimerHUD';

const hudChannel = createHudTransientChannel({
  replayFooter: {
    visible: ${replayVisible},
    scorerName: ${JSON.stringify(scorerName)},
    goalSpeed: ${JSON.stringify(`${goalSpeed}KPH`)},
    assisterName: ${JSON.stringify(assisterName)},
    teamAccentColor: ${JSON.stringify(teamAccentColor)},
  },
  respawnTimer: {
    remainingSeconds: ${respawnRemSec},
    totalSeconds: 3.0,
    active: true,
  },
});`}
      />
    </div>
  );
};
