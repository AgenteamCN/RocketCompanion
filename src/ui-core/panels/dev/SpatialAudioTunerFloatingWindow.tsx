import React, { useState } from 'react';
import {
  Volume2,
  Download,
  Copy,
  Check,
  RotateCcw,
  Play,
  Square,
  Sliders,
} from 'lucide-react';
import type {
  StandardSurfaceProps,
  SurfaceMeta,
} from '../../manifest/surfaceMetaTypes';
import { SliderControl } from '../../primitives/SliderControl';
import { ToggleSwitch } from '../../primitives/ToggleSwitch';
import { useSpatialAudioStore } from '../../stores/spatialAudioStore';
import { useSubsystemIsolationLabStore } from '../../stores/subsystemIsolationLabStore';
import { SpatialAudioCurveCard } from './SpatialAudioCurveCard';
import { DistanceAttenuationTunerTab } from './spatial-audio-tuner/DistanceAttenuationTunerTab';

export type SpatialAudioTunerTab = 'distance' | 'reverb';

export const SURFACE_META: SurfaceMeta = {
  id: 'spatial-audio-tuner',
  title: 'Spatial Audio & Anthem Tuner',
  subtitle: '3D Distance Rolloff Profiles, Live Arena Gizmo & Stadium Reverb Engine',
  description:
    'Stadium spatial acoustics (HPF 425Hz, LPF 3500Hz, Wet 69%, 3.0s Decay) & 2.0s directional non-linear transition curve.',
  icon: 'Volume2',
  layer: 'floating-dev',
  menuGroup: 'active-tuners',
  defaultSizing: {
    width: 480,
    height: 620,
    minHeight: 200,
    mode: 'adaptive',
  },
  variants: [
    {
      variantId: 'distance',
      label: '3D Distance Profiles & Gizmo',
      description: 'Tactical attenuation categories, interactive rolloff curve & 3D arena spheres.',
    },
    {
      variantId: 'reverb',
      label: 'Stadium Reverb & BGM Transition',
      description: 'Directional non-linear transition curve, stadium filter/reverb & goal stinger audition.',
    },
  ],
};

export interface SpatialAudioTunerFloatingWindowProps
  extends StandardSurfaceProps {
  active?: boolean;
}

export const SpatialAudioTunerFloatingWindow: React.FC<
  SpatialAudioTunerFloatingWindowProps
> = ({
  isLight = false,
  active = true,
  activeTab: controlledTab,
  onTabChange,
}) => {
  const tunerConfig = useSpatialAudioStore((s) => s.tunerConfig);
  const updateTunerConfig = useSpatialAudioStore((s) => s.updateTunerConfig);
  const resetTunerConfig = useSpatialAudioStore((s) => s.resetTunerConfig);

  const selectedAnthem = useSpatialAudioStore((s) => s.selectedAnthem);
  const previewingAnthemId = useSpatialAudioStore((s) => s.previewingAnthemId);
  const togglePreviewAnthem = useSpatialAudioStore((s) => s.togglePreviewAnthem);

  const [internalTab, setInternalTab] = useState<SpatialAudioTunerTab>('distance');
  const [copied, setCopied] = useState(false);

  const activeTab: SpatialAudioTunerTab =
    controlledTab === 'reverb' || controlledTab === 'distance'
      ? controlledTab
      : internalTab;

  const handleSelectTab = (tab: SpatialAudioTunerTab) => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };

  if (!active) return null;

  const testAnthemId =
    selectedAnthem && selectedAnthem !== 'none'
      ? selectedAnthem
      : 'MX_CelebrationStadium_Stingers_0001';
  const isAuditioning = previewingAnthemId !== null;

  const handleCopyJson = () => {
    const json = JSON.stringify(tunerConfig, null, 2);
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(json).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadJson = () => {
    const json = JSON.stringify(tunerConfig, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'spatial-audio-tuner-config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      data-ui-interactive="true"
      className="flex flex-col gap-2.5 text-xs select-none"
    >
      {/* Mode Tab Switcher */}
      <div
        className={`grid grid-cols-2 gap-1 p-1 rounded-xl border ${
          isLight
            ? 'bg-neutral-100 border-neutral-200'
            : 'bg-neutral-900/90 border-neutral-800'
        }`}
      >
        {(
          [
            { id: 'distance', label: '3D Distance Profiles & Gizmo' },
            { id: 'reverb', label: 'Stadium Reverb & BGM Transition' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleSelectTab(tab.id)}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
              activeTab === tab.id
                ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300'
                : isLight
                  ? 'text-neutral-600 hover:bg-neutral-200/70'
                  : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'distance' ? (
        <DistanceAttenuationTunerTab isLight={isLight} />
      ) : (
        <>
          {/* Header Status & Quick Audition Bar */}
          <div
            className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl border ${
              isLight
                ? 'bg-neutral-100/90 border-neutral-200 text-neutral-700'
                : 'bg-neutral-900/80 border-neutral-800 text-neutral-300'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Volume2 className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="flex flex-col leading-snug truncate">
                <span className="font-semibold text-[11px] truncate">
                  Stadium Spatial Audio & Non-Linear Transition Engine
                </span>
                <span className="text-[10px] text-neutral-400 truncate">
                  Fast near Normal (0.0) · Slow near Spatial (1.0) · Default 2.0s
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => togglePreviewAnthem(testAnthemId, 'tuner-audition')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-colors cursor-pointer shrink-0 ${
                isAuditioning
                  ? 'bg-amber-500 text-neutral-950 border-amber-400'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
              }`}
            >
              {isAuditioning ? (
                <>
                  <Square className="w-3 h-3 fill-current" />
                  <span>Stop Test</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 fill-current" />
                  <span>Test Stinger</span>
                </>
              )}
            </button>
          </div>

          {/* Live Directional Non-Linear Curve & Telemetry Card */}
          <SpatialAudioCurveCard isLight={isLight} />

      {/* Transition Duration & Directional Cubic-Bezier Sliders */}
      <div className="grid grid-cols-1 gap-2">
        <div className="grid grid-cols-2 gap-2">
          <SliderControl
            editable={true}
            allowOutOfBoundsInput={true}
            showStepper={false}
            colorScheme="amber"
            label="Spatial Transition (Default 2.0s)"
            unit="s"
            value={tunerConfig.transitionDurationSec}
            min={0.1}
            max={6.0}
            step={0.1}
            isLight={isLight}
            onChange={(v) =>
              updateTunerConfig({ transitionDurationSec: Math.max(0.1, v) })
            }
          />
          <SliderControl
            editable={true}
            allowOutOfBoundsInput={false}
            showStepper={false}
            colorScheme="amber"
            label="BGM Play/Pause Fade (Max 3.0s)"
            unit="s"
            value={tunerConfig.bgmFadeDurationSec ?? 2.0}
            min={0.1}
            max={3.0}
            step={0.1}
            isLight={isLight}
            onChange={(v) =>
              updateTunerConfig({
                bgmFadeDurationSec: Math.max(0.1, Math.min(3.0, v)),
              })
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { key: 'bzX1', label: 'Bezier P1.x (Normal)', min: 0.01, max: 0.99 },
              { key: 'bzY1', label: 'Bezier P1.y (Normal)', min: 0.0, max: 1.0 },
              { key: 'bzX2', label: 'Bezier P2.x (Spatial)', min: 0.01, max: 1.0 },
              { key: 'bzY2', label: 'Bezier P2.y (Spatial)', min: 0.0, max: 1.0 },
            ] as const
          ).map((item) => (
            <SliderControl
              key={item.key}
              editable={true}
              allowOutOfBoundsInput={false}
              showStepper={false}
              colorScheme="amber"
              label={item.label}
              unit=""
              value={tunerConfig[item.key]}
              min={item.min}
              max={item.max}
              step={0.01}
              isLight={isLight}
              onChange={(v) => updateTunerConfig({ [item.key]: v })}
            />
          ))}
        </div>
      </div>

      {/* Stadium Reverb & Filter Parameters (Defaults from spaceaudio/new) */}
      <div
        className={`flex flex-col gap-2 p-2.5 rounded-xl border ${
          isLight
            ? 'bg-neutral-100/80 border-neutral-200'
            : 'bg-neutral-900/70 border-neutral-800'
        }`}
      >
        <div className="flex items-center gap-1.5 text-[11px] font-semibold">
          <Sliders className="w-3.5 h-3.5 text-sky-400" />
          <span>Stadium Filter & Reverb Parameters (spaceaudio/new)</span>
        </div>

        {(
          [
            { key: 'lpfMinFreq', label: 'Low-Pass Cutoff (Spatial)', min: 400, max: 16000, step: 50 },
            { key: 'hpfMaxFreq', label: 'High-Pass Cutoff (Spatial)', min: 20, max: 2000, step: 25 },
          ] as const
        ).map((item) => (
          <SliderControl
            key={item.key}
            editable={true}
            allowOutOfBoundsInput={true}
            showStepper={false}
            colorScheme="amber"
            label={item.label}
            unit="Hz"
            value={tunerConfig[item.key]}
            min={item.min}
            max={item.max}
            step={item.step}
            isLight={isLight}
            onChange={(v) => updateTunerConfig({ [item.key]: v })}
          />
        ))}

        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { key: 'wetMaxPct', label: 'Wet Mix', unit: '%', min: 0, max: 100, step: 1, oob: false },
              { key: 'decaySec', label: 'Decay', unit: 's', min: 0.5, max: 6.0, step: 0.1, oob: true },
              { key: 'wetBoost', label: 'Wet Boost', unit: 'x', min: 0.5, max: 2.5, step: 0.05, oob: true },
            ] as const
          ).map((item) => (
            <SliderControl
              key={item.key}
              editable={true}
              allowOutOfBoundsInput={item.oob}
              showStepper={false}
              colorScheme="amber"
              label={item.label}
              unit={item.unit}
              value={tunerConfig[item.key]}
              min={item.min}
              max={item.max}
              step={item.step}
              isLight={isLight}
              onChange={(v) => updateTunerConfig({ [item.key]: v })}
            />
          ))}
        </div>

        <div className="flex items-center justify-between pt-1.5 border-t border-neutral-700/30">
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-[11px] truncate">
              Mute Signal Audio in Goal Replay
            </span>
            <span
              className={`text-[10px] truncate ${
                isLight ? 'text-neutral-500' : 'text-neutral-400'
              }`}
            >
              Suppress kickoff 3-2-1 &amp; 10s/30s/60s timer signal cues during Goal Replay
            </span>
          </div>
          <ToggleSwitch
            checked={Boolean(tunerConfig.muteSignalAudioInGoalReplay ?? true)}
            onCheckedChange={(v) => {
              updateTunerConfig({ muteSignalAudioInGoalReplay: v });
              try {
                useSubsystemIsolationLabStore.getState().updateLiveTelemetry({
                  goalReplayMuteSignalAudio: v,
                });
              } catch {
                // Ignore if unavailable
              }
            }}
            isLight={isLight}
            variant="amber"
          />
        </div>
      </div>

      {/* Export / Copy / Reset Footer */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleDownloadJson}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
              isLight
                ? 'bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100'
                : 'bg-sky-500/15 border-sky-500/35 text-sky-300 hover:bg-sky-500/25'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON</span>
          </button>

          <button
            type="button"
            onClick={handleCopyJson}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
              isLight
                ? 'bg-neutral-100 border-neutral-300 text-neutral-700 hover:bg-neutral-200'
                : 'bg-neutral-800 border-neutral-700 text-neutral-200 hover:bg-neutral-700'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy JSON</span>
              </>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={resetTunerConfig}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
            isLight
              ? 'bg-neutral-100 border-neutral-300 text-neutral-600 hover:bg-neutral-200'
              : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:border-neutral-600'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset (2.0s)</span>
        </button>
      </div>
        </>
      )}
    </div>
  );
};
