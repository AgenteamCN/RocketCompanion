import React from 'react';
import { Sliders, RotateCcw, Sparkles } from 'lucide-react';
import { useEngineAudioStore } from '../../../stores/engineAudioStore';
import {
  ENGINE_AUDIO_EQ_BAND_FREQS_HZ,
  ENGINE_AUDIO_EQ_BAND_LABELS,
  DEFAULT_ENGINE_AUDIO_TUNING_CONFIG,
  type EngineAudioTuningConfig,
} from '../../../config/engineAudioConfig';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { Button } from '../../../primitives/Button';
import { Badge } from '../../../primitives/Badge';

export interface EngineAudioEqualizerCardProps {
  isLight?: boolean;
}

export const EngineAudioEqualizerCard: React.FC<EngineAudioEqualizerCardProps> = ({
  isLight = false,
}) => {
  const config = useEngineAudioStore((s) => s.config);
  const telemetry = useEngineAudioStore((s) => s.telemetry);
  const updateConfig = useEngineAudioStore((s) => s.updateConfig);

  const cardBg = isLight
    ? 'bg-neutral-50 border-neutral-200 text-neutral-800'
    : 'bg-neutral-900/75 border-neutral-800 text-neutral-200';
  const rowBg = isLight
    ? 'bg-white border-neutral-200/90'
    : 'bg-neutral-950/60 border-neutral-800/80';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  const eqBands = config.eqBandGainsDb ?? [0, 0, 0, 0, 0];

  const handleBandChange = (bandIndex: number, gainDb: number) => {
    const nextBands: EngineAudioTuningConfig['eqBandGainsDb'] = [
      eqBands[0] ?? 0,
      eqBands[1] ?? 0,
      eqBands[2] ?? 0,
      eqBands[3] ?? 0,
      eqBands[4] ?? 0,
    ];
    nextBands[bandIndex] = Math.max(-12, Math.min(12, Number(gainDb.toFixed(2))));
    updateConfig({ eqBandGainsDb: nextBands });
  };

  const handleApplyAutoLevelPreset = () => {
    updateConfig({
      engineEqEnabled: true,
      sliceRmsAutoNormStrength: DEFAULT_ENGINE_AUDIO_TUNING_CONFIG.sliceRmsAutoNormStrength,
      freqTiltDb: DEFAULT_ENGINE_AUDIO_TUNING_CONFIG.freqTiltDb,
      eqBandGainsDb: [...DEFAULT_ENGINE_AUDIO_TUNING_CONFIG.eqBandGainsDb],
      timbreLowShelfDb: DEFAULT_ENGINE_AUDIO_TUNING_CONFIG.timbreLowShelfDb,
      timbreMidPeakDb: DEFAULT_ENGINE_AUDIO_TUNING_CONFIG.timbreMidPeakDb,
      timbreHighShelfDb: DEFAULT_ENGINE_AUDIO_TUNING_CONFIG.timbreHighShelfDb,
    });
  };

  const handleFlattenManualBands = () => {
    updateConfig({
      freqTiltDb: 0,
      eqBandGainsDb: [0, 0, 0, 0, 0],
      timbreLowShelfDb: 0,
      timbreMidPeakDb: 0,
      timbreHighShelfDb: 0,
    });
  };

  const compDb = telemetry.activeEqCompensationDb ?? 0;
  const compSign = compDb >= 0 ? '+' : '';

  return (
    <div className={`p-2.5 rounded-xl border flex flex-col gap-2.5 ${cardBg}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Sliders className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="font-bold text-[11px] uppercase tracking-wider truncate">
            Dedicated Engine Audio Equalizer &amp; Loudness Leveler
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Badge
            variant={config.engineEqEnabled ? 'emerald' : 'neutral'}
            size="sm"
            isLight={isLight}
            className="font-mono text-[9px]"
          >
            {config.engineEqEnabled
              ? `COMP ${compSign}${compDb.toFixed(1)} dB`
              : 'EQ BYPASSED'}
          </Badge>
          <ToggleSwitch
            checked={Boolean(config.engineEqEnabled)}
            onCheckedChange={(checked) => updateConfig({ engineEqEnabled: checked })}
            isLight={isLight}
            variant="emerald"
          />
        </div>
      </div>

      {/* Automatic Per-Slice RMS Normalization & Frequency Loudness Tilt */}
      <div className={`p-2 rounded-lg border flex flex-col gap-2 ${rowBg}`}>
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[10px] font-semibold ${mutedText}`}>
            Per-Slice RMS Loudness Normalization &amp; Frequency Tilt (37Hz &rarr; 75Hz)
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="sm"
              isLight={isLight}
              onClick={handleApplyAutoLevelPreset}
              className="gap-1 py-0.5 px-2 text-[9px]"
            >
              <Sparkles className="w-2.5 h-2.5 text-emerald-400" />
              <span>Calibrated Level</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              isLight={isLight}
              onClick={handleFlattenManualBands}
              className="gap-1 py-0.5 px-2 text-[9px]"
            >
              <RotateCcw className="w-2.5 h-2.5 text-amber-400" />
              <span>Flat 0dB</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <SliderControl
            editable={true}
            allowOutOfBoundsInput={false}
            showStepper={false}
            colorScheme="emerald"
            label="Auto-RMS Slice Leveling Strength"
            unit="%"
            value={Math.round((config.sliceRmsAutoNormStrength ?? 0.85) * 100)}
            min={0}
            max={100}
            step={5}
            isLight={isLight}
            onChange={(v) =>
              updateConfig({ sliceRmsAutoNormStrength: Math.max(0, Math.min(1, v / 100)) })
            }
          />
          <SliderControl
            editable={true}
            allowOutOfBoundsInput={false}
            showStepper={false}
            colorScheme="sky"
            label="High-RPM Loudness Tilt"
            unit=" dB"
            value={config.freqTiltDb ?? 1.5}
            min={-9}
            max={9}
            step={0.25}
            isLight={isLight}
            onChange={(v) => updateConfig({ freqTiltDb: Math.max(-12, Math.min(12, v)) })}
          />
        </div>
      </div>

      {/* 5-Band Fundamental Frequency Equalizer (37Hz .. 75Hz Pitch Contour) */}
      <div className={`p-2 rounded-lg border flex flex-col gap-2 ${rowBg}`}>
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[10px] font-semibold ${mutedText}`}>
            5-Band Fundamental Frequency Loudness EQ (Manual RPM / Pitch Trim)
          </span>
          <span className={`text-[9px] font-mono ${mutedText}`}>
            Active: {telemetry.lowerSliceFreqHz.toFixed(1)}Hz
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {ENGINE_AUDIO_EQ_BAND_FREQS_HZ.map((freqHz, idx) => {
            const isNearActive =
              Math.abs(telemetry.lowerSliceFreqHz - freqHz) <= 4.5 ||
              Math.abs(telemetry.upperSliceFreqHz - freqHz) <= 4.5;
            return (
              <SliderControl
                key={freqHz}
                editable={true}
                allowOutOfBoundsInput={false}
                showStepper={false}
                colorScheme={isNearActive ? 'emerald' : 'amber'}
                label={ENGINE_AUDIO_EQ_BAND_LABELS[idx]}
                unit=" dB"
                value={eqBands[idx] ?? 0}
                min={-12}
                max={12}
                step={0.25}
                isLight={isLight}
                onChange={(v) => handleBandChange(idx, v)}
              />
            );
          })}

          {/* 3-Band Web Audio Parametric Timbre Equalizer */}
          <SliderControl
            editable={true}
            allowOutOfBoundsInput={false}
            showStepper={false}
            colorScheme="sky"
            label="Timbre Low-Shelf (90Hz Sub Warmth)"
            unit=" dB"
            value={config.timbreLowShelfDb ?? 0}
            min={-12}
            max={12}
            step={0.5}
            isLight={isLight}
            onChange={(v) => updateConfig({ timbreLowShelfDb: Math.max(-12, Math.min(12, v)) })}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <SliderControl
            editable={true}
            allowOutOfBoundsInput={false}
            showStepper={false}
            colorScheme="sky"
            label="Timbre Mid-Peak (650Hz Body)"
            unit=" dB"
            value={config.timbreMidPeakDb ?? 0}
            min={-12}
            max={12}
            step={0.5}
            isLight={isLight}
            onChange={(v) => updateConfig({ timbreMidPeakDb: Math.max(-12, Math.min(12, v)) })}
          />
          <SliderControl
            editable={true}
            allowOutOfBoundsInput={false}
            showStepper={false}
            colorScheme="sky"
            label="Timbre High-Shelf (3.2kHz Presence)"
            unit=" dB"
            value={config.timbreHighShelfDb ?? 0}
            min={-12}
            max={12}
            step={0.5}
            isLight={isLight}
            onChange={(v) => updateConfig({ timbreHighShelfDb: Math.max(-12, Math.min(12, v)) })}
          />
        </div>
      </div>
    </div>
  );
};
