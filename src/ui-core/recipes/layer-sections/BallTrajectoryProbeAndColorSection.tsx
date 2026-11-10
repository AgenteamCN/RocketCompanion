import React, { useState } from 'react';
import { Cpu, Palette } from 'lucide-react';
import type {
  TrajectoryConfig,
  TrajectoryUpdateMode,
} from '../../config/trainingDefaults';
import { SettingActionRow } from '../../compounds/SettingActionRow';
import { SettingSegmentedRow } from '../../compounds/SettingSegmentedRow';
import { SettingSliderRow } from '../../compounds/SettingSliderRow';
import { SegmentedSwitch } from '../../primitives/SegmentedSwitch';

const PRESET_COLOR_MAP: Array<{ value: string; label: string }> = [
  { value: '#000000', label: 'Black' },
  { value: '#ffffff', label: 'White' },
  { value: '#00f0ff', label: 'Cyan' },
  { value: '#fbbf24', label: 'Amber' },
  { value: '#39ff14', label: 'Lime' },
];

export interface BallTrajectoryProbeAndColorSectionProps {
  resolved: TrajectoryConfig;
  updateConfig: (patch: Partial<TrajectoryConfig>) => void;
  developerMode: boolean;
  isLight: boolean;
  onHoverDesc: (desc: string | null) => void;
}

export const BallTrajectoryProbeAndColorSection: React.FC<
  BallTrajectoryProbeAndColorSectionProps
> = ({ resolved, updateConfig, developerMode, isLight, onHoverDesc }) => {
  const [customHexColor, setCustomHexColor] = useState<string>(() =>
    resolved.color?.startsWith('#') ? resolved.color : '#ffffff'
  );

  const solidDashLength = resolved.solidTicks ?? 50;
  const transparentGap = resolved.transparentTicks ?? 20;
  const updateMode: TrajectoryUpdateMode =
    resolved.updateMode === 'event-snapshot' || resolved.updateMode === 'full-every-tick'
      ? resolved.updateMode
      : 'continuous-incremental';

  const canEditDashes = Boolean(developerMode || resolved.allowUserDashEdit !== false);

  const normalizedColor = (resolved.color || '#ffffff').toLowerCase();
  const matchedPreset = PRESET_COLOR_MAP.find(
    (p) => p.value.toLowerCase() === normalizedColor
  );
  const renderColor = matchedPreset ? matchedPreset.value : 'custom';
  const effectiveHexColor = resolved.color?.startsWith('#')
    ? resolved.color
    : customHexColor;

  return (
    <>
      {canEditDashes && (
        <>
          <SettingSliderRow
            label="Solid Dash Length"
            title="Solid Dash Length"
            value={solidDashLength}
            min={5}
            max={240}
            step={5}
            unit=" ticks"
            developerMode={developerMode}
            layout="inline"
            bordered={false}
            showDescription={false}
            onChange={(solidTicks) => updateConfig({ solidTicks })}
            hoverDescription="Length of each solid dash segment along the trajectory in physics ticks (5 to 240 ticks)."
            onHover={(desc) => desc && onHoverDesc(desc)}
            onLeave={() => onHoverDesc(null)}
            isLight={isLight}
          />

          <SettingSliderRow
            label="Transparent Gap"
            title="Transparent Gap"
            value={transparentGap}
            min={5}
            max={240}
            step={5}
            unit=" ticks"
            developerMode={developerMode}
            layout="inline"
            bordered={false}
            showDescription={false}
            onChange={(transparentTicks) => updateConfig({ transparentTicks })}
            hoverDescription="Spacing gap between trajectory dash segments in physics ticks (5 to 240 ticks)."
            onHover={(desc) => desc && onHoverDesc(desc)}
            onLeave={() => onHoverDesc(null)}
            isLight={isLight}
          />
        </>
      )}

      <SettingActionRow
        icon={Palette}
        iconColor="text-purple-400"
        title="Line Color Tone"
        bordered={false}
        showDescription={false}
        hoverDescription="Select visual color preset or pick a custom hex color for the predictive trajectory tube."
        onHover={onHoverDesc}
        onLeave={() => onHoverDesc(null)}
        isLight={isLight}
        rightSlot={
          renderColor === 'custom' ? (
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={effectiveHexColor}
                onChange={(e) => {
                  const hex = e.target.value;
                  setCustomHexColor(hex);
                  updateConfig({ color: hex });
                }}
                className="h-5 w-6 rounded border border-neutral-500/40 cursor-pointer bg-transparent"
                title="Pick Custom Trajectory Color"
              />
              <span className="text-[11px] font-mono text-neutral-400">
                {effectiveHexColor}
              </span>
            </div>
          ) : null
        }
        bottomSlot={
          <SegmentedSwitch
            size="sm"
            fullWidth
            value={renderColor}
            onValueChange={(val) => {
              if (val === 'custom') {
                updateConfig({ color: effectiveHexColor });
              } else {
                updateConfig({ color: val });
              }
            }}
            isLight={isLight}
            options={[
              ...PRESET_COLOR_MAP,
              { value: 'custom', label: 'Custom' },
            ]}
          />
        }
      />

      <SettingSegmentedRow
        icon={Cpu}
        iconColor="text-emerald-400"
        title="Calculation Mode"
        value={
          updateMode === 'event-snapshot' ? 'event-snapshot' : 'continuous-incremental'
        }
        onChange={(v) => {
          const nextMode: TrajectoryUpdateMode =
            v === 'event-snapshot' ? 'event-snapshot' : 'continuous-incremental';
          updateConfig({
            updateMode: nextMode,
            calculationMode:
              nextMode === 'continuous-incremental' ? 'fast' : 'accurate',
          });
        }}
        layout="inline"
        bordered={false}
        showDescription={false}
        options={[
          { value: 'continuous-incremental', label: 'Incremental (600t)' },
          { value: 'event-snapshot', label: 'Snapshot (Hit Only)' },
        ]}
        hoverDescription="Incremental (600t): Extends tail continuously to maintain 5.0s lookahead at ~1/100th CPU cost. Snapshot: Recomputes only on collision or deviation."
        onHover={(desc) => desc && onHoverDesc(desc)}
        onLeave={() => onHoverDesc(null)}
        isLight={isLight}
      />
    </>
  );
};
