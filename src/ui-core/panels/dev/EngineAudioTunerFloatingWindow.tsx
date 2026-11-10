import React, { useState } from 'react';
import {
  Volume2,
  RotateCcw,
  Copy,
  Check,
  Download,
  Cpu,
} from 'lucide-react';
import type {
  StandardSurfaceProps,
  SurfaceMeta,
} from '../../manifest/surfaceMetaTypes';
import { useEngineAudioStore } from '../../stores/engineAudioStore';
import { listEngineAudioPacks } from '../../config/engineAudioConfig';
import { Badge } from '../../primitives/Badge';
import { Button } from '../../primitives/Button';
import { EngineAudioTelemetryCard } from './engine-audio-tuner/EngineAudioTelemetryCard';
import { EngineAudioDrivetrainCard } from './engine-audio-tuner/EngineAudioDrivetrainCard';
import { EngineAudioEqualizerCard } from './engine-audio-tuner/EngineAudioEqualizerCard';
import { EngineAudioSynthesisSfxCard } from './engine-audio-tuner/EngineAudioSynthesisSfxCard';

export const SURFACE_META: SurfaceMeta = {
  id: 'engine-audio-tuner',
  title: 'Engine Audio Tuner (Turtle Modem)',
  subtitle: '40-Slice Granular REV Powertrain Synthesizer & 5-Band Loudness EQ',
  description:
    'Turtle Modem 40-slice granular REV powertrain synthesizer, RPM/gear/reverse physics, backfire pops & Entity Spawn SFX.',
  icon: 'Volume2',
  layer: 'floating-dev',
  menuGroup: 'active-tuners',
  defaultSizing: {
    width: 500,
    height: 640,
    minHeight: 220,
    mode: 'adaptive',
  },
};

export interface EngineAudioTunerFloatingWindowProps
  extends StandardSurfaceProps {
  active?: boolean;
}

export const EngineAudioTunerFloatingWindow: React.FC<
  EngineAudioTunerFloatingWindowProps
> = ({ isLight = false, active = true }) => {
  const config = useEngineAudioStore((s) => s.config);
  const telemetry = useEngineAudioStore((s) => s.telemetry);
  const updateConfig = useEngineAudioStore((s) => s.updateConfig);
  const resetConfig = useEngineAudioStore((s) => s.resetConfig);

  const [copied, setCopied] = useState(false);

  if (!active) return null;

  const packs = listEngineAudioPacks();

  const handleCopyJson = () => {
    const json = JSON.stringify(config, null, 2);
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(json).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadJson = () => {
    const json = JSON.stringify(config, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'turtle-modem-engine-audio-config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const headerBg = isLight
    ? 'bg-neutral-100/90 border-neutral-200 text-neutral-800'
    : 'bg-neutral-900/80 border-neutral-800 text-neutral-200';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  return (
    <div
      data-ui-interactive="true"
      data-ui-element="engine-audio-tuner-window"
      className="flex flex-col gap-2.5 text-xs select-none"
    >
      {/* Header & Engine Sound Pack Selector */}
      <div
        className={`flex flex-col gap-2 px-2.5 py-2 rounded-xl border ${headerBg}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Volume2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="flex flex-col leading-snug min-w-0">
              <span className="font-bold text-[11px] truncate">
                Turtle Modem Granular REV Powertrain Synthesizer
              </span>
              <span className={`text-[10px] truncate ${mutedText}`}>
                40-Slice Phase-Conditioned M4A Matrix · 5-Band Loudness EQ · Spawn SFX Optional
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Badge
              variant={telemetry.loaded ? 'emerald' : 'amber'}
              size="sm"
              isLight={isLight}
              className="font-mono text-[9px]"
            >
              {telemetry.loaded
                ? `READY (${telemetry.loadedSlicesCount}/${telemetry.totalSlicesCount})`
                : `LOADING (${telemetry.loadedSlicesCount}/${telemetry.totalSlicesCount})`}
            </Badge>
          </div>
        </div>

        {/* Pack Registry Selector + Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5">
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${mutedText}`}>
              <Cpu className="w-3 h-3 text-emerald-400" />
              <span>Engine Pack:</span>
            </span>
            {packs.map((pack) => (
              <button
                key={pack.id}
                type="button"
                onClick={() => updateConfig({ activePackId: pack.id })}
                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-colors cursor-pointer ${
                  config.activePackId === pack.id
                    ? 'bg-emerald-500 text-neutral-950 border-emerald-400'
                    : isLight
                      ? 'bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                {pack.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="sm"
              isLight={isLight}
              onClick={resetConfig}
              className="gap-1 py-1 px-2 text-[10px]"
            >
              <RotateCcw className="w-3 h-3 text-amber-400" />
              <span>Reset Defaults</span>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              isLight={isLight}
              onClick={handleCopyJson}
              className="gap-1 py-1 px-2 text-[10px]"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 text-sky-400" />
                  <span>Copy JSON</span>
                </>
              )}
            </Button>

            <Button
              variant="secondary"
              size="sm"
              isLight={isLight}
              onClick={handleDownloadJson}
              className="gap-1 py-1 px-2 text-[10px]"
            >
              <Download className="w-3 h-3 text-emerald-400" />
              <span>Export</span>
            </Button>
          </div>
        </div>
      </div>

      {/* 1. Realtime Powertrain & Granular Matrix Telemetry */}
      <EngineAudioTelemetryCard isLight={isLight} />

      {/* 2. Dedicated Engine Audio Equalizer & Loudness Leveler */}
      <EngineAudioEqualizerCard isLight={isLight} />

      {/* 3. Drivetrain, Gearbox & Rev-Limiter Physics */}
      <EngineAudioDrivetrainCard isLight={isLight} />

      {/* 4. Entity Spawn SFX, Backfire Pops & Web Audio Loop Conditioning */}
      <EngineAudioSynthesisSfxCard isLight={isLight} />
    </div>
  );
};

export default EngineAudioTunerFloatingWindow;
