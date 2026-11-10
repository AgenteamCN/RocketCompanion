import React from 'react';
import {
  CirclePile,
  ChartNoAxesGantt,
  Settings2,
} from 'lucide-react';
import { SettingSegmentedRow } from '../../../compounds/SettingSegmentedRow';
import { DualGrabberSlider } from '../../../primitives/DualGrabberSlider';
import { useAppStore } from '../../../stores/appStore';
import {
  useSettingsPacingStore,
  type ClockPacingMode,
} from '../../../stores/settingsPacingStore';
import { useScopedStore } from '../../../stores/storeSnapshotScope';

export interface InputBufferPacingSectionProps {
  bordered?: boolean;
  showBadges?: boolean;
  isLight?: boolean;
  onHover: (desc: string) => void;
  onLeave: () => void;
}

const PACING_MODE_DESCRIPTIONS: Record<ClockPacingMode, string> = {
  legacy:
    'Legacy (Fixed 120Hz discrete steps): Automatic target & deadband via Gameplay Experience Priority.',
  sts: 'STS (Variable Time Step): 2-tier Schmitt hysteresis fractional clock pacing with automatic parameters.',
  csts: 'CSTS (Continuous Variable Time Step): Continuous PD rate control with automatic jitter target boost.',
  custom:
    'Custom: Manually configure Input Buffer Target (α) and Threshold Tolerance Deadband below (forces Experience Priority to Custom).',
};

/**
 * [Layer 2 Settings -> Advanced Tab -> Input Buffer & Clock Pacing Section]
 * Renders the Clock Pacing mode selector (Legacy / STS / CSTS / Custom) and, when Custom
 * is active, the Input Buffer Target (α) dropdown and Threshold Tolerance Deadband dual slider.
 */
export const InputBufferPacingSection: React.FC<InputBufferPacingSectionProps> = React.memo(
  ({ bordered = false, showBadges = false, isLight = false, onHover, onLeave }) => {
    const setAppInputBufferTarget = useScopedStore(
      'appStore',
      useAppStore,
      (s) => s.setInputBufferTarget
    );
    const setAppInputBufferThreshold = useScopedStore(
      'appStore',
      useAppStore,
      (s) => s.setInputBufferThreshold
    );

    const clockPacingMode = useScopedStore(
      'settingsPacingStore',
      useSettingsPacingStore,
      (s) => s.clockPacingMode
    );
    const inputBufferTarget = useScopedStore(
      'settingsPacingStore',
      useSettingsPacingStore,
      (s) => s.inputBufferTarget
    );
    const inputBufferThreshold = useScopedStore(
      'settingsPacingStore',
      useSettingsPacingStore,
      (s) => s.inputBufferThreshold
    );
    const setClockPacingMode = useScopedStore(
      'settingsPacingStore',
      useSettingsPacingStore,
      (s) => s.setClockPacingMode
    );
    const setInputBufferTarget = useScopedStore(
      'settingsPacingStore',
      useSettingsPacingStore,
      (s) => s.setInputBufferTarget
    );
    const setInputBufferThreshold = useScopedStore(
      'settingsPacingStore',
      useSettingsPacingStore,
      (s) => s.setInputBufferThreshold
    );

    const handleTargetChange = (next: number) => {
      setInputBufferTarget(next);
      setAppInputBufferTarget(next);
    };

    const handleThresholdChange = (next: [number, number]) => {
      setInputBufferThreshold(next);
      setAppInputBufferThreshold(next);
    };

    const isCustomPacing = clockPacingMode === 'custom';

    return (
      <>
        <SettingSegmentedRow
          icon={CirclePile}
          iconName="circle-pile"
          title="Input Buffer"
          badge={
            showBadges ? (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider font-semibold bg-amber-500/15 border-amber-500/30 text-amber-400">
                {isCustomPacing ? 'Custom' : 'GDC Pacing'}
              </span>
            ) : undefined
          }
          description={PACING_MODE_DESCRIPTIONS[clockPacingMode]}
          value={clockPacingMode}
          onChange={(val) => setClockPacingMode(val as ClockPacingMode)}
          options={[
            { value: 'legacy', label: 'Legacy' },
            { value: 'sts', label: 'STS' },
            { value: 'csts', label: 'CSTS' },
            { value: 'custom', label: 'Custom' },
          ]}
          bordered={bordered}
          hoverDescription="Input Buffer: Select between Legacy, STS, CSTS (automatic parameters driven by Experience Priority), or Custom (reveals manual Input Buffer Target and Threshold Tolerance Deadband controls below and sets Gameplay Experience Priority to Custom)."
          onHover={(desc) => desc && onHover(desc)}
          onLeave={onLeave}
          isLight={isLight}
        />

        {isCustomPacing && (
          <>
            <SettingSegmentedRow
              icon={ChartNoAxesGantt}
              iconName="chart-no-axes-gantt"
              title="Input Buffer Target (α)"
              badge={
                showBadges ? (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border uppercase tracking-wider font-semibold bg-amber-500/15 border-amber-500/30 text-amber-400">
                    Target: {inputBufferTarget} Frame{inputBufferTarget > 1 ? 's' : ''}
                  </span>
                ) : undefined
              }
              description="Authoritative server queue depth target. Recommended: 3 Frames for WebRTC peer-to-peer matches."
              value={String(inputBufferTarget)}
              onChange={(val) => handleTargetChange(Number(val))}
              controlType="dropdown"
              bordered={bordered}
              options={[
                { value: '1', label: '1 Frame (LAN / 0ms)' },
                { value: '2', label: '2 Frames (Aggressive)' },
                { value: '3', label: '3 Frames (Default / Rec.)' },
                { value: '4', label: '4 Frames (Stable Jitter)' },
                { value: '5', label: '5 Frames (High Latency)' },
                { value: '6', label: '6 Frames (Max Buffer)' },
              ]}
              hoverDescription="Input Buffer Target (α): Target number of future input frames queued on the authoritative server to absorb packet arrival jitter."
              onHover={(desc) => desc && onHover(desc)}
              onLeave={onLeave}
              isLight={isLight}
            />

            <DualGrabberSlider
              icon={Settings2}
              iconName="settings-2"
              label="Threshold Tolerance Deadband"
              subtitle={`Allowed queue jitter around target α (${inputBufferTarget}). Catch-up triggers below, step skip triggers above.`}
              target={inputBufferTarget}
              value={inputBufferThreshold}
              onChange={handleThresholdChange}
              bordered={bordered}
              isLight={isLight}
              onHover={() =>
                onHover(
                  `Threshold Deadband: Defines the asymmetrical deadband [-α .. +α] around input buffer target α (${inputBufferTarget}).`
                )
              }
              onLeave={onLeave}
            />
          </>
        )}
      </>
    );
  }
);

InputBufferPacingSection.displayName = 'InputBufferPacingSection';
