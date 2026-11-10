import React, { useState, useEffect } from 'react';
import { MonitorPlay, RefreshCw, Ruler, Gauge, Router, ChevronDown, BatteryCharging } from 'lucide-react';
import { SettingSegmentedRow } from './SettingSegmentedRow';
import { SettingToggleRow } from './SettingToggleRow';
import { ToggleSwitch } from '../primitives/ToggleSwitch';
import { SettingActionRow } from './SettingActionRow';
import { UI_THEME } from '../tokens/colors';
import {
  useSettingActionRowStore,
  type TelemetryNestedVariation,
} from '../stores/settingRowStore';

export const ALPHA_COMPONENT_ID = 'Alpha:TelemetryConfigCard' as const;

export type TelemetryDisplayMode = 'off' | 'on_demand' | 'always';
export type TelemetryLatencyDetailMode = 'simple' | 'advanced';

export interface TelemetryConfigState {
  alwaysShow: boolean;
  pauseTelemetryInPowerSave?: boolean;
  fpsMode: TelemetryDisplayMode;
  refreshRateMode: TelemetryDisplayMode;
  renderScaleMode: TelemetryDisplayMode;
  physicsRateMode: TelemetryDisplayMode;
  latencyMode: TelemetryDisplayMode;
  latencyDetailMode?: TelemetryLatencyDetailMode;
}

export const DEFAULT_TELEMETRY_CONFIG_STATE: TelemetryConfigState = {
  alwaysShow: true,
  pauseTelemetryInPowerSave: true,
  fpsMode: 'always',
  refreshRateMode: 'always',
  renderScaleMode: 'always',
  physicsRateMode: 'always',
  latencyMode: 'always',
  latencyDetailMode: 'simple',
};

export interface TelemetryConfigCardProps {
  telemetry?: TelemetryConfigState;
  onUpdateTelemetry?: (patch: Partial<TelemetryConfigState>) => void;
  /** Optional variation override */
  variation?: TelemetryNestedVariation;
  onHover?: (desc: string) => void;
  onLeave?: () => void;
  isLight?: boolean;
  className?: string;
}

/**
 * [L3 Compound] TelemetryConfigCard
 * Master toggle (`Show Telemetry Summary`) + 5 metric (`FPS`, `Screen Refresh Rate`, `Render Scale`, `Physics Rate`, `Network Latency`)
 * segmented configuration card with built-in `FPS -> Refresh Rate` dependency rule.
 *
 * Uses the `underline-disclosure` layout: underlined `Show v` / `Hide ^` link placed beside the ToggleSwitch
 * (collapsed by default). Expanding reveals a subtly framed nested sub-group.
 */
export const TelemetryConfigCard: React.FC<TelemetryConfigCardProps> = React.memo(
  ({
    telemetry = DEFAULT_TELEMETRY_CONFIG_STATE,
    onUpdateTelemetry,
    onHover,
    onLeave,
    isLight = true,
    className = '',
  }) => {
    const store = useSettingActionRowStore();
    const {
      bordered,
      advancedBordered,
      borderRadius,
      rowGap,
      telemetryTriggerPosition,
      telemetryDefaultCollapsed,
    } = store;

    const isBordered = bordered || advancedBordered;

    const [isExpanded, setIsExpanded] = useState<boolean>(() => !telemetryDefaultCollapsed);
    const [internalLatencyDetailMode, setInternalLatencyDetailMode] =
      useState<TelemetryLatencyDetailMode>(telemetry.latencyDetailMode ?? 'simple');

    useEffect(() => {
      setIsExpanded(!telemetryDefaultCollapsed);
    }, [telemetryDefaultCollapsed]);

    const latencyDetailMode: TelemetryLatencyDetailMode =
      telemetry.latencyDetailMode ?? internalLatencyDetailMode;

    const update = (patch: Partial<TelemetryConfigState>) => {
      if (patch.latencyDetailMode !== undefined) {
        setInternalLatencyDetailMode(patch.latencyDetailMode);
      }
      onUpdateTelemetry?.(patch);
    };

    const telemetryOptions = [
      { value: 'off', label: 'Off' },
      { value: 'on_demand', label: 'On Demand' },
      { value: 'always', label: 'Always On' },
    ];

    const latencyDetailOptions = [
      { value: 'simple', label: 'Simple' },
      { value: 'advanced', label: 'Advanced' },
    ];

    const renderSubMetricRows = () => (
      <>
        {/* 0. Pause Sampling in Power Saving */}
        <SettingToggleRow
          icon={BatteryCharging}
          iconName="battery-charging"
          title="Pause Sampling in Power Saving"
          description="Exclude menu and unfocused Power Saving frames from rolling FPS telemetry"
          checked={telemetry.pauseTelemetryInPowerSave !== false}
          onChange={(checked) => update({ pauseTelemetryInPowerSave: checked })}
          bordered={false}
          hoverDescription="When enabled, throttled or frozen frames during menu and unfocused Power Saving are excluded from the rolling telemetry window so FPS readouts do not slowly ramp up after resuming gameplay."
          onHover={(desc) => desc && onHover?.(desc)}
          onLeave={onLeave}
          isLight={isLight}
        />

        {/* 1. FPS */}
        <SettingSegmentedRow
          icon={MonitorPlay}
          title="Frames Per Second (FPS)"
          value={telemetry.fpsMode}
          onChange={(val) => update({ fpsMode: val as TelemetryDisplayMode })}
          options={telemetryOptions}
          bordered={false}
          hoverDescription="Display real-time frame presentation rate (e.g. 120hz)."
          onHover={(desc) => desc && onHover?.(desc)}
          onLeave={onLeave}
          isLight={isLight}
        />

        {/* 2. Screen Refresh Rate */}
        <SettingSegmentedRow
          icon={RefreshCw}
          title="Screen Refresh Rate"
          description={
            telemetry.fpsMode === 'off' ? 'Requires FPS to be enabled' : undefined
          }
          disabled={telemetry.fpsMode === 'off'}
          value={telemetry.fpsMode === 'off' ? 'off' : telemetry.refreshRateMode}
          onChange={(val) => update({ refreshRateMode: val as TelemetryDisplayMode })}
          options={telemetryOptions}
          bordered={false}
          hoverDescription={
            telemetry.fpsMode === 'off'
              ? 'Requires FPS to be enabled.'
              : 'Display screen hardware refresh rate appended to FPS (e.g. / 120hz).'
          }
          onHover={(desc) => desc && onHover?.(desc)}
          onLeave={onLeave}
          isLight={isLight}
        />

        {/* 3. Render Scale */}
        <SettingSegmentedRow
          icon={Ruler}
          title="Render Scale"
          value={telemetry.renderScaleMode}
          onChange={(val) => update({ renderScaleMode: val as TelemetryDisplayMode })}
          options={telemetryOptions}
          bordered={false}
          hoverDescription="Display current 3D viewport canvas rendering scale percentage."
          onHover={(desc) => desc && onHover?.(desc)}
          onLeave={onLeave}
          isLight={isLight}
        />

        {/* 4. Physics Rate */}
        <SettingSegmentedRow
          icon={Gauge}
          title="Physics Rate"
          value={telemetry.physicsRateMode}
          onChange={(val) => update({ physicsRateMode: val as TelemetryDisplayMode })}
          options={telemetryOptions}
          bordered={false}
          hoverDescription="Display physical simulation tick rate (118.0 to 122.0 Hz)."
          onHover={(desc) => desc && onHover?.(desc)}
          onLeave={onLeave}
          isLight={isLight}
        />

        {/* 5. Network Latency */}
        <SettingSegmentedRow
          icon={Router}
          title="Network Latency"
          secondaryValue={latencyDetailMode}
          onSecondaryChange={(val) =>
            update({ latencyDetailMode: val as TelemetryLatencyDetailMode })
          }
          secondaryOptions={latencyDetailOptions}
          value={telemetry.latencyMode}
          onChange={(val) => update({ latencyMode: val as TelemetryDisplayMode })}
          options={telemetryOptions}
          bordered={false}
          hoverDescription="Display network round-trip ping and jitter telemetry (choose Simple ping readout or Advanced jitter/buffer breakdown on the left, and visibility mode on the right)."
          onHover={(desc) => desc && onHover?.(desc)}
          onLeave={onLeave}
          isLight={isLight}
        />
      </>
    );

    const underlineShowTrigger = (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded((prev) => !prev);
        }}
        className={`inline-flex items-center gap-0.5 text-xs font-medium cursor-pointer transition-colors select-none py-0.5 px-1 rounded ${
          isLight
            ? 'text-neutral-500 hover:text-neutral-900'
            : 'text-neutral-400 hover:text-neutral-100'
        }`}
        title={isExpanded ? 'Collapse telemetry metrics' : 'Expand 5 telemetry metrics'}
      >
        <span className="underline underline-offset-3 decoration-current/60">
          {isExpanded ? 'Hide' : 'Show'}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>
    );

    return (
      <div
        data-alpha-id={ALPHA_COMPONENT_ID}
        data-ui-element="compound-telemetry-config-card"
        data-variation="underline-disclosure"
        style={{
          borderRadius: `${Math.max(0, borderRadius)}px`,
          gap: `${rowGap}px`,
        }}
        className={`flex flex-col w-full transition-colors ${
          isBordered
            ? isLight
              ? `p-2 border ${UI_THEME.light.bgSurface} ${UI_THEME.light.border} shadow-2xs`
              : `p-2 border ${UI_THEME.dark.bgSubtle} ${UI_THEME.dark.border}`
            : ''
        } ${className}`}
      >
        <SettingActionRow
          icon={MonitorPlay}
          title="Show Telemetry Summary"
          description="Display real-time performance indicators and hardware metrics during gameplay"
          bordered={false}
          onAction={() => update({ alwaysShow: !telemetry.alwaysShow })}
          hoverDescription="Toggle persistent display of performance and hardware telemetry summary overlay in the top-left corner."
          onHover={(desc) => desc && onHover?.(desc)}
          onLeave={onLeave}
          isLight={isLight}
          rightSlot={
            <div className="flex items-center gap-2.5">
              {telemetryTriggerPosition === 'left' && underlineShowTrigger}
              <ToggleSwitch
                checked={telemetry.alwaysShow}
                onCheckedChange={(checked) => update({ alwaysShow: checked })}
                isLight={isLight}
                variant="neutral"
              />
              {telemetryTriggerPosition === 'right' && underlineShowTrigger}
            </div>
          }
        />

        {isExpanded && (
          <div
            style={{
              borderRadius: `${Math.max(6, borderRadius)}px`,
              gap: `${rowGap}px`,
            }}
            className={`mt-1 p-1.5 border flex flex-col w-full transition-all ${
              telemetry.alwaysShow ? '' : 'opacity-50'
            } ${
              isLight
                ? 'bg-neutral-100/75 border-neutral-200/90'
                : 'bg-neutral-900/55 border-neutral-800/90'
            }`}
          >
            {renderSubMetricRows()}
          </div>
        )}
      </div>
    );
  }
);

TelemetryConfigCard.displayName = 'TelemetryConfigCard';
