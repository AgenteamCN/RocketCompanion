import React from 'react';
import {
  RotateCcw,
  Gauge,
  Sparkles,
  Play,
} from 'lucide-react';
import type {
  StandardSurfaceProps,
  SurfaceMeta,
} from '../../manifest/surfaceMetaTypes';
import {
  useKickoffTrainingStore,
  KICKOFF_SPAWNS,
  type KickoffSubMode,
  type KickoffSpeedPreset,
} from '../../stores/kickoffTrainingStore';
import { useAppStore } from '../../stores/appStore';
import { SegmentedSwitch } from '../../primitives/SegmentedSwitch';
import { SliderControl } from '../../primitives/SliderControl';
import { Badge } from '../../primitives/Badge';
import { Button } from '../../primitives/Button';
import { KickoffGhostAndOverlaySection } from './kickoff-training-tuner/KickoffGhostAndOverlaySection';

export const SURFACE_META: SurfaceMeta = {
  id: 'kickoff-training-tuner',
  title: 'Kickoff Training Tuner (PPO)',
  subtitle: 'Kickoff Sub-Modes, 0.25s Realistic Wait Steps, N/120 Speed & AI Ghost/Solid Opponent',
  description:
    'Kickoff sub-modes, realistic wait (0.25s steps), N/120 speed & W/S rhythm overlay offset.',
  icon: 'Gauge',
  layer: 'floating-dev',
  menuGroup: 'active-tuners',
  defaultSizing: {
    width: 460,
    height: 595,
    minHeight: 200,
    mode: 'adaptive',
  },
};

export interface KickoffTrainingTunerFloatingWindowProps
  extends StandardSurfaceProps {
  active?: boolean;
}

export const KickoffTrainingTunerFloatingWindow: React.FC<
  KickoffTrainingTunerFloatingWindowProps
> = ({ isLight = false, active = true }) => {
  const {
    subMode,
    spawnIndex,
    speedPreset,
    customPhysicsRate,
    effectivePhysicsRate,
    realisticWaitTicks,
    ghostPlacement,
    ghostModeEnabled,
    phase,
    episodeTick,
    decisionStep,
    aiTouchTick,
    playerTouchTick,
    lastDeltaTicks,
    setSubMode,
    setSpawnIndex,
    setSpeedPreset,
    setCustomPhysicsRate,
    setRealisticWaitTicks,
    triggerResetSpawn,
  } = useKickoffTrainingStore();

  const matchMode = useAppStore((s) => s.matchMode);
  const bridge = useAppStore((s) => s.bridge);
  const isInKickoffTraining = matchMode === 'kickoff-training';
  const isSameSideSolid = !ghostModeEnabled && ghostPlacement === 'same';

  if (!active) return null;

  const cardBg = isLight
    ? 'bg-neutral-50/90 border-neutral-200 text-neutral-800'
    : 'bg-neutral-850/60 border-neutral-700/60 text-neutral-200';

  const subPanelBg = isLight
    ? 'bg-white border-neutral-200/90 text-neutral-800'
    : 'bg-neutral-950/50 border-neutral-800 text-neutral-200';

  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  return (
    <div className="flex flex-col gap-2.5 select-none text-xs">
      {/* Mode Status & Quick Launch / Reset Header */}
      <div className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${cardBg}`}>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${
                isInKickoffTraining
                  ? isLight
                    ? 'bg-emerald-500 animate-pulse'
                    : 'bg-emerald-400 animate-pulse'
                  : isLight
                  ? 'bg-amber-500'
                  : 'bg-amber-400'
              }`}
            />
            <span className="font-bold text-xs truncate">
              {isInKickoffTraining ? 'Kickoff Training Active' : 'Kickoff Training Standby'}
            </span>
          </div>
          <span className={`text-[10px] font-mono truncate mt-0.5 ${mutedText}`}>
            {isInKickoffTraining
              ? `Phase: ${phase.toUpperCase()} · Tick #${episodeTick} (Step #${decisionStep})`
              : 'Click Enter Mode to activate PPO Kickoff Training'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isInKickoffTraining ? (
            <Button
              variant="primary"
              size="sm"
              onClick={triggerResetSpawn}
              isLight={isLight}
              className="gap-1.5 px-2.5 py-1 text-[11px] font-semibold"
              title="Reset current kickoff spawn (R)"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset</span>
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => bridge.onStartKickoffTraining?.()}
              isLight={isLight}
              className="gap-1.5 px-2.5 py-1 text-[11px] font-semibold"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Enter Mode</span>
            </Button>
          )}
        </div>
      </div>

      {/* 1. Kickoff Spawn Position Selector (Hotkeys 1-5) */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <span className={`font-semibold text-[11px] uppercase tracking-wider ${mutedText}`}>
            Kickoff Spawn Position (Hotkeys 1–5)
          </span>
          <Badge variant="neutral" size="sm" isLight={isLight} className="font-mono text-[10px]">
            {isSameSideSolid
              ? `You: ${KICKOFF_SPAWNS[spawnIndex]?.shortLabel} · AI: ${KICKOFF_SPAWNS[4 - spawnIndex]?.shortLabel}`
              : KICKOFF_SPAWNS[spawnIndex]?.label}
          </Badge>
        </div>

        <div className="grid grid-cols-5 gap-1.5">
          {KICKOFF_SPAWNS.map((sp) => {
            const active = sp.index === spawnIndex;
            const disabled = isSameSideSolid && sp.index === 2;
            return (
              <button
                key={sp.id}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setSpawnIndex(sp.index)}
                title={
                  disabled
                    ? 'Spawn 3 (Center Back) is disabled in Same-Side Solid Mode because two physical cars on the symmetry axis would overlap.'
                    : sp.label
                }
                className={`py-1.5 px-1 rounded-lg border font-mono text-[11px] font-bold flex flex-col items-center justify-center transition-all ${
                  disabled
                    ? isLight
                      ? 'bg-neutral-100 border-neutral-200 text-neutral-300 opacity-45 cursor-not-allowed'
                      : 'bg-neutral-900/40 border-neutral-800 text-neutral-600 opacity-45 cursor-not-allowed'
                    : active
                    ? isLight
                      ? 'bg-neutral-900 border-neutral-900 text-white shadow-xs cursor-pointer active:scale-95'
                      : 'bg-white border-white text-neutral-950 shadow-xs cursor-pointer active:scale-95'
                    : isLight
                    ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700 cursor-pointer active:scale-95'
                    : 'bg-neutral-900/80 hover:bg-neutral-800 border-neutral-700 text-neutral-300 cursor-pointer active:scale-95'
                }`}
              >
                <span className="text-xs font-black">{sp.key}</span>
                <span className="text-[9px] opacity-75">
                  {disabled ? 'N/A' : sp.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Kickoff Sub-Mode Selector (Instant / Easy Learning / Realistic) */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sparkles className={`h-3.5 w-3.5 ${isLight ? 'text-sky-600' : 'text-sky-400'}`} />
            <span className="font-semibold text-[11px]">Training Sub-Mode</span>
          </div>
          <Badge variant="default" size="sm" isLight={isLight} className="font-mono text-[10px] uppercase">
            {subMode}
          </Badge>
        </div>

        <SegmentedSwitch
          value={subMode}
          fullWidth
          size="sm"
          isLight={isLight}
          onValueChange={(val) => setSubMode(val as KickoffSubMode)}
          options={[
            { value: 'instant', label: 'Instant' },
            { value: 'easy-learning', label: 'Easy Learning' },
            { value: 'realistic', label: 'Realistic' },
          ]}
        />

        <p className={`text-[10px] leading-relaxed ${mutedText}`}>
          {subMode === 'instant' &&
            'Settles suspension via stepSilent(30), advances frame ID, and launches player + AI simultaneously on your first key press.'}
          {subMode === 'easy-learning' &&
            'Pauses physics whenever your input differs from the PPO model; match the highlighted keys to advance frame-by-frame.'}
          {subMode === 'realistic' &&
            'Runs a configurable KICKOFF_WILL_START countdown (in 0.25s / 30-frame steps up to 4.0s) before unlocking controls.'}
        </p>

        {/* Realistic Countdown Duration Slider (30-frame / 0.25s steps up to 480 frames / 4.00s) */}
        {subMode === 'realistic' && (
          <div className={`p-2.5 rounded-lg border ${subPanelBg}`}>
            <SliderControl
              label={`Countdown Wait (${(realisticWaitTicks / 120).toFixed(2)}s)`}
              description="Step: 0.25s (30 frames) · Max: 4.00s (480 frames)"
              value={realisticWaitTicks}
              min={30}
              max={480}
              step={30}
              unit="f"
              showStepper={true}
              colorScheme="neutral"
              isLight={isLight}
              onChange={(val) => setRealisticWaitTicks(val)}
            />
          </div>
        )}
      </div>

      {/* 3. Speed Control Segmented Control: 100% | 50% | 25% | 75% | Custom */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Gauge className={`h-3.5 w-3.5 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
            <span className="font-semibold text-[11px]">Simulation Speed (N / 120 Hz)</span>
          </div>
          <Badge variant="neutral" size="sm" isLight={isLight} className="font-mono text-[10px]">
            {effectivePhysicsRate}/120 ({((effectivePhysicsRate / 120) * 100).toFixed(1)}%)
          </Badge>
        </div>

        <SegmentedSwitch
          value={speedPreset}
          fullWidth
          size="sm"
          isLight={isLight}
          onValueChange={(val) => setSpeedPreset(val as KickoffSpeedPreset)}
          options={[
            { value: '100', label: '100%' },
            { value: '50', label: '50%' },
            { value: '25', label: '25%' },
            { value: '75', label: '75%' },
            { value: 'custom', label: 'Custom' },
          ]}
        />

        {speedPreset === 'custom' && (
          <div className={`p-2.5 rounded-lg border ${subPanelBg}`}>
            <SliderControl
              label={`Custom Rate (${((customPhysicsRate / 120) * 100).toFixed(1)}%)`}
              description="Exact 1/120 integer multiple (30Hz AI decision = 4 ticks)"
              value={customPhysicsRate}
              min={1}
              max={120}
              step={1}
              unit="/120"
              showStepper={true}
              colorScheme="neutral"
              isLight={isLight}
              onChange={(val) => setCustomPhysicsRate(val)}
            />
          </div>
        )}
      </div>

      {/* 4. Ghost Placement (Same Position vs Opposite Side), Ghost Mode ON/OFF & Overlay Toggles */}
      <KickoffGhostAndOverlaySection isLight={isLight} />

      {/* Live First-Touch Benchmark Footer */}
      <div className={`px-3 py-2 rounded-xl border font-mono text-[10px] flex items-center justify-between ${cardBg}`}>
        <span>
          PPO AI Touch:{' '}
          <strong className={isLight ? 'text-sky-600' : 'text-sky-400'}>
            {aiTouchTick ? `${(aiTouchTick / 120).toFixed(3)}s (${aiTouchTick}f)` : '--'}
          </strong>
        </span>
        <span>
          Your Touch:{' '}
          <strong
            className={
              playerTouchTick
                ? lastDeltaTicks !== null && lastDeltaTicks <= 0
                  ? isLight
                    ? 'text-emerald-600'
                    : 'text-emerald-400'
                  : isLight
                  ? 'text-amber-600'
                  : 'text-amber-400'
                : mutedText
            }
          >
            {playerTouchTick
              ? `${(playerTouchTick / 120).toFixed(3)}s (${playerTouchTick}f)`
              : 'Pending'}
          </strong>
        </span>
      </div>
    </div>
  );
};
