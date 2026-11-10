import React, { useEffect, useState } from 'react';
import { Activity, Flame } from 'lucide-react';
import type {
  NameTagAerialClimbTriggerMode,
  NameTagConfig,
  NameTagOffscreenAudience,
  NameTagTelemetrySnapshot,
} from '../../../config/nameTagConfig';
import {
  getNameTagTelemetrySnapshot,
  subscribeNameTagTelemetry,
  useNameTagTunerStore,
} from '../../../stores/nameTagTunerStore';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { CAR_SLOT_BADGES } from './NameTagCalibrationSection';

export interface NameTagAerialClimbAlertSectionProps {
  isLight?: boolean;
  config?: NameTagConfig;
  updateConfig?: (partial: Partial<NameTagConfig>) => void;
  updatePreviewAerialClimbingFlag?: (index: number, climbing: boolean) => void;
}

const ALERT_AUDIENCE_OPTIONS: Array<{
  id: NameTagOffscreenAudience;
  label: string;
  desc: string;
}> = [
  {
    id: 'teammates',
    label: 'Teammates Only (Default)',
    desc: 'Show yellow inward alert ring only on off-screen teammate boost circles',
  },
  {
    id: 'all',
    label: 'All Off-Screen Cars',
    desc: 'Show yellow inward alert ring on any off-screen climbing car',
  },
  {
    id: 'none',
    label: 'Hidden / Disabled',
    desc: 'Suppress all off-screen aerial climb alerts',
  },
];

const TRIGGER_MODE_OPTIONS: Array<{
  id: NameTagAerialClimbTriggerMode;
  label: string;
  desc: string;
}> = [
  {
    id: 'both',
    label: 'Hold Jump+Pitch OR Double Jump',
    desc: 'Triggers when car holds single jump + pitches up OR expends second jump while climbing',
  },
  {
    id: 'hold-jump-pitch',
    label: 'Hold Jump + Pitch Up Only',
    desc: 'Triggers when single jump hold duration >= threshold and car pitches nose up while ascending',
  },
  {
    id: 'double-jump',
    label: 'Double Jump Only',
    desc: 'Triggers only after car expends its second jump in mid-air while ascending',
  },
];

const AERIAL_GLOW_COLOR_PRESETS = [
  { label: 'Alert Yellow (#FACC15)', hex: '#facc15' },
  { label: 'Amber Gold (#F59E0B)', hex: '#f59e0b' },
  { label: 'Lime Signal (#84CC16)', hex: '#84cc16' },
  { label: 'Pure White (#FFFFFF)', hex: '#ffffff' },
];

export const NameTagAerialClimbAlertSection: React.FC<
  NameTagAerialClimbAlertSectionProps
> = ({
  isLight = false,
  config: propConfig,
  updateConfig: propUpdateConfig,
  updatePreviewAerialClimbingFlag: propUpdateClimbingFlag,
}) => {
  const store = useNameTagTunerStore();
  const config = propConfig ?? store.config;
  const updateConfig = propUpdateConfig ?? store.updateConfig;
  const updatePreviewAerialClimbingFlag =
    propUpdateClimbingFlag ?? store.updatePreviewAerialClimbingFlag;

  const [telemetry, setTelemetry] = useState<NameTagTelemetrySnapshot>(() =>
    getNameTagTelemetrySnapshot()
  );

  useEffect(() => {
    return subscribeNameTagTelemetry((snap) => setTelemetry(snap));
  }, []);

  const focusedCarIdx = telemetry.focusedCarIndex ?? store.focusedCarIndex ?? 0;
  const povCarTelemetry =
    telemetry.cars?.find((c) => c.carIndex === focusedCarIdx) ||
    telemetry.cars?.[0] ||
    null;

  const subCardBackground = isLight
    ? 'border-neutral-200 bg-neutral-100/75'
    : 'border-neutral-800 bg-neutral-900/50';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';
  const btnInactive = isLight
    ? 'bg-white border-neutral-300 text-neutral-600 hover:bg-neutral-100'
    : 'border-neutral-700 text-neutral-400 hover:bg-neutral-800';
  const btnActiveAmber = isLight
    ? 'bg-amber-500/15 border-amber-500 text-amber-900 font-bold'
    : 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold';

  const povIsClimbing = Boolean(povCarTelemetry?.isDoubleJumpedAndClimbing);
  const povReason = povCarTelemetry?.aerialClimbTriggerReason || 'none';

  return (
    <div className="flex flex-col gap-2 pt-1 border-t border-neutral-200/80 dark:border-neutral-700/70">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-[11px] flex items-center gap-1.5">
          <Flame
            className={`h-3.5 w-3.5 ${isLight ? 'text-amber-600' : 'text-amber-400'}`}
          />
          <span>
            Off-Screen Aerial Climb Alert (Solid Inward Yellow Ring · Off-Screen Circle Only)
          </span>
        </span>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] ${mutedText}`}>Enable Climb Alert</span>
          <ToggleSwitch
            checked={config.aerialClimbAlertEnabled}
            onChange={(nextValue) =>
              updateConfig({ aerialClimbAlertEnabled: nextValue })
            }
            isLight={isLight}
          />
        </div>
      </div>

      <div className={`p-2 rounded-lg border flex flex-col gap-2 ${subCardBackground}`}>
        <div className="flex items-center justify-between gap-1.5 text-[10px]">
          <span className={mutedText}>
            Target Audience (Off-Screen Only · Never On-Screen):
          </span>
          <div className="flex items-center gap-1">
            {ALERT_AUDIENCE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                title={option.desc}
                onClick={() => updateConfig({ aerialClimbAlertAudience: option.id })}
                className={`px-2 py-0.5 rounded border font-mono cursor-pointer transition-colors ${
                  config.aerialClimbAlertAudience === option.id
                    ? btnActiveAmber
                    : btnInactive
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-1.5 text-[10px] pt-1 border-t border-neutral-200/70 dark:border-neutral-800">
          <span className={mutedText}>Climb Intent Detection Mode:</span>
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {TRIGGER_MODE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                title={option.desc}
                onClick={() => updateConfig({ aerialClimbTriggerMode: option.id })}
                className={`px-1.5 py-0.5 rounded border text-[9px] font-mono cursor-pointer transition-colors ${
                  config.aerialClimbTriggerMode === option.id
                    ? btnActiveAmber
                    : btnInactive
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-1.5 text-[10px]">
          <span className="font-semibold">Alert Ring Color:</span>
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {AERIAL_GLOW_COLOR_PRESETS.map((preset) => (
              <button
                key={preset.hex}
                type="button"
                onClick={() => updateConfig({ aerialClimbGlowColor: preset.hex })}
                className={`px-1.5 py-0.5 rounded border text-[9px] font-mono cursor-pointer ${
                  config.aerialClimbGlowColor.toLowerCase() === preset.hex
                    ? btnActiveAmber
                    : btnInactive
                }`}
              >
                {preset.label}
              </button>
            ))}
            <input
              type="color"
              value={config.aerialClimbGlowColor}
              onChange={(event) =>
                updateConfig({ aerialClimbGlowColor: event.target.value })
              }
              className="h-5 w-8 rounded cursor-pointer bg-transparent border-0"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <SliderControl
            label="Inward Ring Fill (50%=Half · 100%=Solid Dot)"
            value={config.aerialClimbGlowRadiusPx}
            min={8}
            max={100}
            step={2}
            unit="%"
            onChange={(nextValue) =>
              updateConfig({ aerialClimbGlowRadiusPx: nextValue })
            }
            isLight={isLight}
          />
          <SliderControl
            label="Inward Ring Opacity"
            value={config.aerialClimbGlowOpacity}
            min={0.1}
            max={1.0}
            step={0.05}
            onChange={(nextValue) =>
              updateConfig({ aerialClimbGlowOpacity: nextValue })
            }
            isLight={isLight}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-neutral-200/70 dark:border-neutral-800">
          <SliderControl
            label="Min Altitude Z"
            value={config.aerialClimbMinAltitudeUu}
            min={0}
            max={600}
            step={10}
            unit="UU"
            onChange={(nextValue) =>
              updateConfig({ aerialClimbMinAltitudeUu: nextValue })
            }
            isLight={isLight}
          />
          <SliderControl
            label="Min Upward VelZ (Extinguishes Below)"
            value={config.aerialClimbMinVelZUu}
            min={0}
            max={800}
            step={20}
            unit="UU/s"
            onChange={(nextValue) =>
              updateConfig({ aerialClimbMinVelZUu: nextValue })
            }
            isLight={isLight}
          />
          <SliderControl
            label="Hold Jump Min Duration (Tap vs Hold)"
            value={config.aerialClimbHoldJumpMinMs}
            min={25}
            max={200}
            step={5}
            unit="ms"
            onChange={(nextValue) =>
              updateConfig({ aerialClimbHoldJumpMinMs: nextValue })
            }
            isLight={isLight}
          />
          <SliderControl
            label="Min Pitch-Up Nose FwdZ"
            value={config.aerialClimbMinPitchFwdZ}
            min={-0.1}
            max={0.75}
            step={0.05}
            onChange={(nextValue) =>
              updateConfig({ aerialClimbMinPitchFwdZ: nextValue })
            }
            isLight={isLight}
          />
        </div>

        <div className="flex flex-col gap-1.5 pt-1.5 border-t border-neutral-200/70 dark:border-neutral-800">
          <div className="flex items-center justify-between gap-2 text-[10px]">
            <span className="font-semibold flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-amber-500" />
              <span>
                Simulate With POV Car Action (Jump / Hold / Pitch / Double-Jump Live Test)
              </span>
            </span>
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded font-mono text-[9px] font-bold border ${
                  povIsClimbing
                    ? isLight
                      ? 'bg-amber-400/30 border-amber-500 text-amber-950'
                      : 'bg-amber-400/25 border-amber-400 text-amber-200'
                    : isLight
                      ? 'bg-neutral-200/80 border-neutral-300 text-neutral-600'
                      : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                }`}
              >
                {povIsClimbing
                  ? `POV LIGHT UP: ON (${povReason.toUpperCase()})`
                  : 'POV LIGHT UP: OFF'}
              </span>
              <ToggleSwitch
                checked={config.aerialClimbSimulatePovInTuner}
                onChange={(nextValue) =>
                  updateConfig({ aerialClimbSimulatePovInTuner: nextValue })
                }
                isLight={isLight}
              />
            </div>
          </div>

          {povCarTelemetry && (
            <div
              className={`grid grid-cols-4 gap-1.5 px-2 py-1 rounded border font-mono text-[9px] ${
                isLight
                  ? 'bg-white/90 border-neutral-200 text-neutral-700'
                  : 'bg-neutral-950/60 border-neutral-800 text-neutral-300'
              }`}
            >
              <span>
                AltZ: <b>{Math.round(povCarTelemetry.carAltitudeUu ?? 0)}</b> /{' '}
                {config.aerialClimbMinAltitudeUu} UU
              </span>
              <span>
                VelZ: <b>{Math.round(povCarTelemetry.carVelZUu ?? 0)}</b> /{' '}
                {config.aerialClimbMinVelZUu} UU/s
              </span>
              <span>
                Hold: <b>{Math.round(povCarTelemetry.carJumpHoldMs ?? 0)}</b> /{' '}
                {config.aerialClimbHoldJumpMinMs} ms
              </span>
              <span>
                PitchZ: <b>{(povCarTelemetry.carPitchFwdZ ?? 0).toFixed(2)}</b> /{' '}
                {config.aerialClimbMinPitchFwdZ.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1 pt-1 border-t border-neutral-200/70 dark:border-neutral-800">
          <div className="flex items-center justify-between text-[10px]">
            <span className={mutedText}>
              6-Car Manual Climb State Override (Off-Screen Circle Ring Preview):
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  updateConfig({
                    previewAerialClimbingFlags: [true, true, true, true, true, true],
                  })
                }
                className={`px-1.5 py-0.5 rounded border text-[9px] font-mono cursor-pointer ${btnInactive}`}
              >
                All Climbing
              </button>
              <button
                type="button"
                onClick={() =>
                  updateConfig({
                    previewAerialClimbingFlags: [false, false, false, false, false, false],
                  })
                }
                className={`px-1.5 py-0.5 rounded border text-[9px] font-mono cursor-pointer ${btnInactive}`}
              >
                Clear All
              </button>
            </div>
          </div>

          <div className="grid grid-cols-6 gap-1">
            {CAR_SLOT_BADGES.map((slot) => {
              const isClimbing = Boolean(
                config.previewAerialClimbingFlags?.[slot.index]
              );
              return (
                <button
                  key={slot.index}
                  type="button"
                  onClick={() =>
                    updatePreviewAerialClimbingFlag(slot.index, !isClimbing)
                  }
                  className={`px-1.5 py-1 rounded border text-[9px] font-mono cursor-pointer flex items-center justify-between transition-colors ${
                    isClimbing ? btnActiveAmber : btnInactive
                  }`}
                >
                  <span>{slot.slotCode}</span>
                  <span>{isClimbing ? 'RING' : 'OFF'}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
