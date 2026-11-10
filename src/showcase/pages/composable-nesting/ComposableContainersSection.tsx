import React, { useEffect, useRef } from 'react';
import { Layers, MousePointerClick, Sparkles } from 'lucide-react';
import { CubicBezierCurveEditor } from '../../../ui-core/charts/CubicBezierCurveEditor';
import { TelemetryRingBuffer } from '../../../ui-core/charts/telemetryRingBuffer';
import { TelemetrySparklineChart } from '../../../ui-core/charts/TelemetrySparklineChart';
import { DropdownMenu } from '../../../ui-core/compounds/DropdownMenu';
import { Badge } from '../../../ui-core/primitives/Badge';
import { Button } from '../../../ui-core/primitives/Button';
import { DualGrabberSlider } from '../../../ui-core/primitives/DualGrabberSlider';
import { KeycapBadge } from '../../../ui-core/primitives/KeycapBadge';
import {
  PrecisionDigitPicker,
  TunerPrecisionContext,
} from '../../../ui-core/primitives/PrecisionDigitPicker';
import { SegmentedSwitch } from '../../../ui-core/primitives/SegmentedSwitch';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import { useComposableContainersState } from './useComposableNestingSyncedState';

export interface ComposableContainersSectionProps {
  isLight: boolean;
}

export const ComposableContainersSection: React.FC<ComposableContainersSectionProps> = ({
  isLight,
}) => {
  const {
    presetMode,
    setPresetMode,
    dropdownPrecision,
    setDropdownPrecision,
    dropdownBias,
    setDropdownBias,
    dropdownLiveHud,
    setDropdownLiveHud,
    buttonClicks,
    setButtonClicks,
    nestedPitchBias,
    setNestedPitchBias,
    nestedDeadband,
    setNestedDeadband,
    nestedCurve,
    setNestedCurve,
    nestedMode,
    setNestedMode,
  } = useComposableContainersState();

  const miniRingBufferRef = useRef<TelemetryRingBuffer | null>(null);
  if (!miniRingBufferRef.current) {
    const arr: number[] = [];
    for (let i = 0; i < 120; i++) {
      arr.push(Number((7.4 + Math.sin(i * 0.25) * 0.8 + (i % 19 === 0 ? 2.4 : 0)).toFixed(2)));
    }
    miniRingBufferRef.current = new TelemetryRingBuffer(120, arr);
  }

  useEffect(() => {
    let phase = 0;
    const timer = window.setInterval(() => {
      phase += 1;
      const nextMs = 7.3 + Math.sin(phase * 0.2) * 0.9 + (Math.random() > 0.94 ? 2.8 : 0);
      miniRingBufferRef.current!.push(nextMs);
    }, 33);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <>
      {/* Section 1: Universal Nesting - DropdownMenu */}
      <section id="l3-1-composable-dropdown" className="space-y-4 scroll-mt-24">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
              <Layers className="h-4 w-4 text-amber-500" />
              1. [L3.1] Composable DropdownMenu (Dropdown menu with arbitrary nested controls and charts)
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Supports both traditional lightweight option arrays (<code>options</code>), Also supports any panel,{' '}
              <code>SliderControl</code>, <code>PrecisionDigitPicker</code> and even 120Hz{' '}
              <code>TelemetrySparklineChart</code> as <code>children</code> Embed in dropdown menu.
            </p>
          </div>
          <Badge variant="success" isLight={isLight}>
            Composable Popover
          </Badge>
        </div>

        <div
          className={`p-6 rounded-xl border ${
            isLight
              ? 'bg-neutral-100/70 border-neutral-200/80'
              : 'bg-neutral-900/40 border-neutral-800/80'
          }`}
        >
          <div className="flex flex-wrap gap-3.5 items-center justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <DropdownMenu
                label="Camera Preset"
                value={presetMode}
                onChange={(val) => setPresetMode(val)}
                isLight={isLight}
                options={[
                  {
                    value: 'pro-esports',
                    label: 'Pro Esports (FOV 110°)',
                    badge: 'Default',
                    description: 'Wide field of view with minimal camera shake',
                  },
                  {
                    value: 'freestyle',
                    label: 'Aerial Freestyle',
                    badge: 'Tight',
                    description: 'Closer distance for precise flip reset tracking',
                  },
                  {
                    value: 'director',
                    label: 'Broadcast Director',
                    badge: 'Smooth',
                    description: 'High stiffness damping for replay observation',
                  },
                ]}
              />

              <DropdownMenu
                trigger={
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    <span className="font-semibold">Nested Live Telemetry &amp; Tuner Dropdown</span>
                    <Badge variant="amber" isLight={isLight}>
                      {dropdownBias > 0 ? `+${dropdownBias}°` : `${dropdownBias}°`}
                    </Badge>
                  </div>
                }
                menuWidthClass="w-[420px]"
                isLight={isLight}
              >
                <TunerPrecisionContext.Provider
                  value={{ step: dropdownPrecision, setStep: setDropdownPrecision }}
                >
                  <div className="p-3 space-y-3">
                    <div className="flex items-center justify-between border-b pb-2 border-neutral-200/70 dark:border-neutral-800">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                        Embedded Inspector inside Dropdown
                      </span>
                      <PrecisionDigitPicker
                        step={dropdownPrecision}
                        onStepChange={setDropdownPrecision}
                        compact
                        isLight={isLight}
                      />
                    </div>

                    <SliderControl
                      label="Instant Pitch Bias (Centered)"
                      value={dropdownBias}
                      min={-45}
                      max={45}
                      step={dropdownPrecision}
                      variation="centered"
                      origin={0}
                      showSign
                      editable
                      usePrecisionContext
                      unit="°"
                      colorScheme="amber"
                      negativeColorScheme="sky"
                      onChange={setDropdownBias}
                      isLight={isLight}
                    />

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs font-medium">Embed Live 120Hz Sparkline</span>
                      <ToggleSwitch
                        checked={dropdownLiveHud}
                        onCheckedChange={setDropdownLiveHud}
                        variant="orange"
                        isLight={isLight}
                      />
                    </div>

                    {dropdownLiveHud && (
                      <TelemetrySparklineChart
                        ringBuffer={miniRingBufferRef.current!}
                        height={95}
                        title="Dropdown Embedded Frame Pacing"
                        isLight={isLight}
                      />
                    )}
                  </div>
                </TunerPrecisionContext.Provider>
              </DropdownMenu>
            </div>

            <div className="text-xs font-mono text-neutral-500">
              Active Preset: <strong className="text-amber-500">{presetMode}</strong> · Bias:{' '}
              <strong>{dropdownBias > 0 ? `+${dropdownBias}` : dropdownBias}°</strong>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Universal Nesting - The Giant Composable Button */}
      <section id="l3-2-composable-button" className="space-y-4 scroll-mt-24">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
              <MousePointerClick className="h-4 w-4 text-amber-500" />
              2. [L3.2] Giant Composable Button (Embed the entire interactive page into a large Button Internal)
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              On <code>&lt;Button composable&gt;</code> mode, Button auto-upgraded to semantic{' '}
              <code>role="button"</code> Container with multi-line wrap <code>truncate</code> Limit: Click
              blank outer frame to trigger button main action, Internal bidirectional slider drag, numeric
              input, or when dragging Bezier curve control points, Events automatically isolated to prevent
              accidental clicks.
            </p>
          </div>
          <Badge variant="amber" isLight={isLight}>
            Button Outer Clicks: {buttonClicks}
          </Badge>
        </div>

        <Button
          composable
          variant="secondary"
          isLight={isLight}
          onClick={() => setButtonClicks((c) => c + 1)}
          className="w-full p-5 rounded-2xl text-left border-2 border-dashed border-amber-500/40 hover:border-amber-500/80 transition-all"
        >
          <div className="flex flex-col gap-3.5 w-full">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 border-neutral-200/80 dark:border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-amber-500 text-neutral-950 font-bold flex items-center justify-center text-xs shadow-xs">
                  BTN
                </div>
                <div>
                  <div className="text-xs font-bold flex items-center gap-2">
                    <span>I Am A Single Composable &lt;Button composable&gt; Instance</span>
                    <KeycapBadge shortcut="Click Frame to Trigger" isLight={isLight} />
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    Internally nested bidirectional zero-point slider, Center deadzone dual-cursor slider,
                    Segmented switch and draggable cubic Bezier curve editor
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <Badge variant="success" dot isLight={isLight}>
                  Triggered {buttonClicks}x
                </Badge>
                <SegmentedSwitch
                  options={[
                    { value: 'agile', label: 'Agile' },
                    { value: 'balanced', label: 'Balanced' },
                    { value: 'heavy', label: 'Heavy' },
                  ]}
                  value={nestedMode}
                  onValueChange={setNestedMode}
                  isLight={isLight}
                />
              </div>
            </div>

            <div
              className="grid grid-cols-1 lg:grid-cols-2 gap-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={`p-4 rounded-xl border space-y-4 ${
                  isLight
                    ? 'bg-white/90 border-neutral-200/80'
                    : 'bg-neutral-950/80 border-neutral-800'
                }`}
              >
                <SliderControl
                  label="Nested Bipolar Pitch Torque"
                  value={nestedPitchBias}
                  min={-50}
                  max={50}
                  step={0.5}
                  variation="centered"
                  origin={0}
                  showSign
                  editable
                  unit=" Nm"
                  colorScheme="amber"
                  negativeColorScheme="sky"
                  onChange={setNestedPitchBias}
                  isLight={isLight}
                />

                <DualGrabberSlider
                  label="Nested Dual-Grabber Steering Deadband"
                  value={nestedDeadband}
                  min={-30}
                  max={30}
                  step={0.5}
                  origin={0}
                  mode="centered-deadband"
                  unit="°"
                  colorScheme="amber"
                  onChange={setNestedDeadband}
                  isLight={isLight}
                />
              </div>

              <div>
                <CubicBezierCurveEditor
                  p1x={nestedCurve.p1x}
                  p1y={nestedCurve.p1y}
                  p2x={nestedCurve.p2x}
                  p2y={nestedCurve.p2y}
                  onChange={setNestedCurve}
                  title="Nested Cubic-Bezier Response Curve"
                  height={165}
                  isLight={isLight}
                />
              </div>
            </div>
          </div>
        </Button>
      </section>
    </>
  );
};
