import React from 'react';
import { Sparkles, Flame, Waves, Play } from 'lucide-react';
import { useEngineAudioStore } from '../../../stores/engineAudioStore';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { Button } from '../../../primitives/Button';
import type {
  EngineCrossfadeCurveType,
  EngineDecelSynthesisMode,
} from '../../../config/engineAudioConfig';

export interface EngineAudioSynthesisSfxCardProps {
  isLight?: boolean;
}

export const EngineAudioSynthesisSfxCard: React.FC<EngineAudioSynthesisSfxCardProps> = ({
  isLight = false,
}) => {
  const config = useEngineAudioStore((s) => s.config);
  const updateConfig = useEngineAudioStore((s) => s.updateConfig);
  const triggerEntitySpawnTest = useEngineAudioStore((s) => s.triggerEntitySpawnTest);
  const triggerBackfireTest = useEngineAudioStore((s) => s.triggerBackfireTest);

  const cardBg = isLight
    ? 'bg-neutral-50 border-neutral-200 text-neutral-800'
    : 'bg-neutral-900/75 border-neutral-800 text-neutral-200';
  const rowBg = isLight
    ? 'bg-white border-neutral-200/90'
    : 'bg-neutral-950/60 border-neutral-800/80';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  const crossfadeOptions: { id: EngineCrossfadeCurveType; label: string }[] = [
    { id: 'equal-sine', label: 'Equal-Sine (Smooth)' },
    { id: 'linear', label: 'Linear (Constant Sum)' },
  ];

  const decelOptions: { id: EngineDecelSynthesisMode; label: string }[] = [
    { id: 'reverse-filter', label: 'Reversed Buffer + Lowpass' },
    { id: 'pure-on', label: 'Forward Buffer + Lowpass' },
  ];

  return (
    <div className={`p-2.5 rounded-xl border flex flex-col gap-2.5 ${cardBg}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Waves className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="font-bold text-[11px] uppercase tracking-wider">
            Entity Spawn SFX, Backfire Pops & Web Audio Loop Conditioning
          </span>
        </div>
        <span className={`text-[10px] font-mono ${mutedText}`}>
          Pop &ge; {config.backfireTriggerRPM} RPM · Spawn SFX {config.entitySpawnSfxEnabled ? 'ON' : 'OFF'}
        </span>
      </div>

      {/* Entity Spawn Sound Effect Card (Default OFF) */}
      <div className={`p-2.5 rounded-lg border flex flex-col gap-2 ${rowBg}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-[11px] truncate">
                Entity Spawn Sound Effect (entity_spawn.m4a)
              </span>
              <span className={`text-[10px] truncate ${mutedText}`}>
                Plays when vehicle spawns on Free Play reset or respawns after demolition (Default: OFF)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              isLight={isLight}
              onClick={triggerEntitySpawnTest}
              className="gap-1 py-1 px-2 text-[10px]"
            >
              <Play className="w-3 h-3 text-purple-400 fill-current" />
              <span>Audition</span>
            </Button>
            <ToggleSwitch
              checked={config.entitySpawnSfxEnabled}
              onCheckedChange={(checked) => updateConfig({ entitySpawnSfxEnabled: checked })}
              isLight={isLight}
              variant="amber"
            />
          </div>
        </div>

        <SliderControl
          editable={true}
          allowOutOfBoundsInput={false}
          showStepper={false}
          colorScheme="amber"
          label="Entity Spawn SFX Volume"
          unit="%"
          value={Math.round(config.entitySpawnSfxVolume * 100)}
          min={0}
          max={150}
          step={5}
          isLight={isLight}
          onChange={(v) => updateConfig({ entitySpawnSfxVolume: Math.max(0, v / 100) })}
        />
      </div>

      {/* Idle Loop Volume & Backfire / Exhaust Pop Threshold, RPM Drop, Cooldown + Volume */}
      <div className="grid grid-cols-3 gap-2">
        <SliderControl
          editable={true}
          allowOutOfBoundsInput={false}
          showStepper={false}
          colorScheme="emerald"
          label="Idle Loop Volume (idle_loop)"
          unit="%"
          value={Math.round((config.idleVolume ?? 1.0) * 100)}
          min={0}
          max={200}
          step={5}
          isLight={isLight}
          onChange={(v) => updateConfig({ idleVolume: Math.max(0, v / 100) })}
        />
        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="amber"
          label="Backfire Trigger RPM Threshold"
          unit=" RPM"
          value={config.backfireTriggerRPM}
          min={1500}
          max={5950}
          step={50}
          isLight={isLight}
          onChange={(v) => updateConfig({ backfireTriggerRPM: Math.max(950, v) })}
        />
        <SliderControl
          editable={true}
          allowOutOfBoundsInput={false}
          showStepper={false}
          colorScheme="amber"
          label="Backfire Pop Volume (pop_01..05)"
          unit="%"
          value={Math.round(config.backfireVolume * 100)}
          min={0}
          max={150}
          step={5}
          isLight={isLight}
          onChange={(v) => updateConfig({ backfireVolume: Math.max(0, v / 100) })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="rose"
          label="Backfire Pop RPM Drop"
          unit=" RPM"
          value={config.backfireRpmDrop ?? 1650}
          min={400}
          max={3500}
          step={50}
          isLight={isLight}
          onChange={(v) => updateConfig({ backfireRpmDrop: Math.max(400, v) })}
        />
        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="amber"
          label="Backfire Pop Cooldown"
          unit=" s"
          value={config.backfireCooldownSec ?? 0.65}
          min={0.15}
          max={2.5}
          step={0.05}
          isLight={isLight}
          onChange={(v) => updateConfig({ backfireCooldownSec: Math.max(0.15, v) })}
        />
      </div>

      {/* Web Audio Buffer Smoothing & Phase Decorrelation */}
      <div className="grid grid-cols-2 gap-2">
        <SliderControl
          editable={true}
          allowOutOfBoundsInput={false}
          showStepper={false}
          colorScheme="emerald"
          label="Gain & Filter Smoothing Time"
          unit=" ms"
          value={config.gainSmoothingTimeMs}
          min={4}
          max={80}
          step={1}
          isLight={isLight}
          onChange={(v) => updateConfig({ gainSmoothingTimeMs: Math.max(2, v) })}
        />
        <SliderControl
          editable={true}
          allowOutOfBoundsInput={false}
          showStepper={false}
          colorScheme="sky"
          label="Slice Decorrelation Delay"
          unit=" ms"
          value={config.decorrelationDelayMs}
          min={0}
          max={40}
          step={1}
          isLight={isLight}
          onChange={(v) => updateConfig({ decorrelationDelayMs: Math.max(0, v) })}
        />
      </div>

      {/* Crossfade Law & Off-Throttle Synthesis Mode Selectors */}
      <div className="grid grid-cols-2 gap-2">
        <div className={`p-2 rounded-lg border flex flex-col gap-1.5 ${rowBg}`}>
          <span className={`text-[10px] font-semibold ${mutedText}`}>
            Slice Crossfade Curve Law
          </span>
          <div className="grid grid-cols-2 gap-1">
            {crossfadeOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => updateConfig({ crossfadeCurveType: opt.id })}
                className={`px-2 py-1 rounded text-[10px] font-semibold border transition-colors cursor-pointer truncate ${
                  config.crossfadeCurveType === opt.id
                    ? 'bg-amber-500 text-neutral-950 border-amber-400'
                    : isLight
                      ? 'bg-neutral-100 border-neutral-200 text-neutral-700 hover:bg-neutral-200'
                      : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className={`p-2 rounded-lg border flex flex-col gap-1.5 ${rowBg}`}>
          <div className="flex items-center justify-between gap-1">
            <span className={`text-[10px] font-semibold ${mutedText}`}>
              Off-Throttle Decel Synthesis
            </span>
            <button
              type="button"
              onClick={triggerBackfireTest}
              className="inline-flex items-center gap-1 text-[9px] text-amber-400 hover:text-amber-300 cursor-pointer"
            >
              <Flame className="w-2.5 h-2.5" />
              <span>Test Pop</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {decelOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => updateConfig({ decelMode: opt.id })}
                className={`px-2 py-1 rounded text-[10px] font-semibold border transition-colors cursor-pointer truncate ${
                  config.decelMode === opt.id
                    ? 'bg-sky-500 text-neutral-950 border-sky-400'
                    : isLight
                      ? 'bg-neutral-100 border-neutral-200 text-neutral-700 hover:bg-neutral-200'
                      : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
