import React from 'react';
import { createScopedSyncedState } from '../../stores/crossClientSync';
import { ToggleSwitch } from '../../../ui-core/primitives/ToggleSwitch';
import { Checkbox } from '../../../ui-core/primitives/Checkbox';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { DualGrabberSlider } from '../../../ui-core/primitives/DualGrabberSlider';
import {
  PrecisionDigitPicker,
  TunerPrecisionContext,
} from '../../../ui-core/primitives/PrecisionDigitPicker';
import { Badge } from '../../../ui-core/primitives/Badge';

const useState = createScopedSyncedState('page:tabs');

export interface DualGrabberAndPrecisionPickerSectionProps {
  isLight: boolean;
}

export const DualGrabberAndPrecisionPickerSection: React.FC<
  DualGrabberAndPrecisionPickerSectionProps
> = React.memo(({ isLight }) => {
  const [bufferTargetAlpha, setBufferTargetAlpha] = useState(3, 'bufferTargetAlpha');
  const [deadbandOffsets, setDeadbandOffsets] = useState<[number, number]>(
    [-2, 2],
    'deadbandOffsets'
  );
  const [freeBand, setFreeBand] = useState<[number, number]>([120, 340], 'freeBand');

  const [precisionStep, setPrecisionStep] = useState(0.001, 'precisionStep');
  const [uvScaleX, setUvScaleX] = useState(1.0425, 'uvScaleX');
  const [lineSmoothness, setLineSmoothness] = useState(0.0512, 'lineSmoothness');

  const [toggleGreen, setToggleGreen] = useState(true, 'toggleGreen');
  const [toggleBlack, setToggleBlack] = useState(true, 'toggleBlack');
  const [toggleOrange, setToggleOrange] = useState(true, 'toggleOrange');

  return (
    <>
      {/* 4. Dual-Grabber Slider (Decoupled Dual-Grabber Deadband Control) */}
      <div
        id="l1-dual-grabber-slider"
        className={`scroll-mt-6 p-6 rounded-2xl border flex flex-col gap-5 ${
          isLight ? 'bg-white border-neutral-200 shadow-2xs' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="font-bold text-sm">
            4. Dual-slider center deadzone and range controller (DualGrabberSlider)
          </span>
          <Badge size="sm" variant="amber" isLight={isLight}>
            Decoupled Deadband Control / [-alpha .. +alpha]
          </Badge>
        </div>
        <p className={`text-xs leading-relaxed ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
          Decoupled network input buffer dead-zone controller. Supports{' '}
          <strong>
            Center-split deadzone mode (<code className="font-mono">mode="centered-deadband"</code>)
          </strong>{' '}
          (Left slider limit <code className="font-mono">[-alpha .. 0]</code> controls Catch-up
          threshold, Right slider limited to <code className="font-mono">[0 .. +alpha]</code>{' '}
          controls Skip Frame drop threshold, both converging on 0) and{' '}
          <strong>
            Free range mode (<code className="font-mono">mode="free-range"</code>)
          </strong>
          .
        </p>

        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-neutral-400">
            A. Center deadzone bidirectional dual-slider (Centered Split-Domain Deadband):
          </span>
          <div className="flex items-center gap-1 font-mono text-[11px]">
            <span className="text-neutral-400">Target alpha:</span>
            {[2, 3, 4, 6].map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => {
                  setBufferTargetAlpha(a);
                  setDeadbandOffsets(([l, r]) => [Math.max(-a, l), Math.min(a, r)]);
                }}
                className={`px-2 py-0.5 rounded border cursor-pointer ${
                  bufferTargetAlpha === a
                    ? 'bg-amber-500 text-neutral-950 border-amber-400 font-bold'
                    : isLight
                    ? 'bg-neutral-100 border-neutral-300 text-neutral-700'
                    : 'bg-neutral-800 border-neutral-700 text-neutral-300'
                }`}
              >
                alpha={a}
              </button>
            ))}
          </div>
        </div>

        <DualGrabberSlider
          label="Threshold Tolerance Deadband"
          subtitle={`Allowed server input queue jitter around target alpha (${bufferTargetAlpha}). Catch-up triggers below, step skip triggers above.`}
          target={bufferTargetAlpha}
          value={deadbandOffsets}
          onChange={setDeadbandOffsets}
          mode="centered-deadband"
          colorScheme="amber"
          isLight={isLight}
        />

        <div className="pt-2 border-t border-neutral-200/60 dark:border-neutral-800/60 flex flex-col gap-2">
          <span className="text-xs font-semibold text-neutral-400">
            B. Free dual-slider range selection (Free-Range Interval Mode):
          </span>
          <DualGrabberSlider
            label="Collision Impulse Bandpass Filter"
            subtitle="Trigger collision sound effects only within the lower and upper impulse thresholds"
            min={0}
            max={500}
            step={10}
            unit=" N*s"
            value={freeBand}
            onChange={setFreeBand}
            mode="free-range"
            leftLabel="Min Gate"
            rightLabel="Max Gate"
            colorScheme="emerald"
            isLight={isLight}
          />
        </div>
      </div>

      {/* 5. Precision Digit Picker (Decoupled Multi-Decimal Stepper Control) */}
      <div
        id="l1-precision-digit-picker"
        className={`scroll-mt-6 p-6 rounded-2xl border flex flex-col gap-5 ${
          isLight ? 'bg-white border-neutral-200 shadow-2xs' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="font-bold text-sm">
            5. Decimal place step precision selector (PrecisionDigitPicker)
          </span>
          <Badge size="sm" variant="success" isLight={isLight}>
            1 . 0 0 0 0 0 Precision decoupled context
          </Badge>
        </div>
        <p className={`text-xs leading-relaxed ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
          Standardized multi-decimal precision controller for stadium texture and physics tuners.
          Click any digit in <code className="font-mono">1 . 0 0 0 0 0</code> to toggle stepping
          granularity (from <code className="font-mono">+/-1.0</code> to{' '}
          <code className="font-mono">+/-0.00001</code>) with{' '}
          <code className="font-mono">TunerPrecisionContext</code>.
        </p>

        <TunerPrecisionContext.Provider value={{ step: precisionStep, setStep: setPrecisionStep }}>
          <PrecisionDigitPicker
            step={precisionStep}
            onStepChange={setPrecisionStep}
            colorScheme="emerald"
            isLight={isLight}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div
              className={`p-3 rounded-xl border ${
                isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-950/50 border-neutral-800'
              }`}
            >
              <SliderControl
                label="Ground UV Scale X"
                description="Press Up/Down arrows after focusing input to step by selected precision"
                value={uvScaleX}
                min={0.5}
                max={2.0}
                step={0.0001}
                origin={1.0}
                variation="centered"
                colorScheme="emerald"
                editable={true}
                usePrecisionContext={true}
                onChange={setUvScaleX}
                isLight={isLight}
              />
            </div>

            <div
              className={`p-3 rounded-xl border ${
                isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-950/50 border-neutral-800'
              }`}
            >
              <SliderControl
                label="Shader Line Smoothness"
                description="Supports up to 5 decimal places of floating-point precision adjustment"
                value={lineSmoothness}
                min={0.001}
                max={0.15}
                step={0.0001}
                colorScheme="emerald"
                editable={true}
                usePrecisionContext={true}
                onChange={setLineSmoothness}
                isLight={isLight}
              />
            </div>
          </div>
        </TunerPrecisionContext.Provider>
      </div>

      {/* 6. Toggle Switch */}
      <div
        id="l1-toggle-switch"
        className={`scroll-mt-6 p-6 rounded-2xl border flex flex-col gap-5 ${
          isLight ? 'bg-white border-neutral-200 shadow-2xs' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="font-bold text-sm">6. Haptic toggle (ToggleSwitch)</span>
          <Badge size="sm" variant="success" isLight={isLight}>
            Apple green / Apple black
          </Badge>
        </div>
        <p className={`text-xs ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
          Apple HIG physical switch specification with Apple Green, high-contrast Apple Black, and
          Warm Orange variants.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 flex flex-col justify-between gap-3">
            <ToggleSwitch
              label="Apple Green (Classic green)"
              description="iOS Standard green design"
              checked={toggleGreen}
              onCheckedChange={setToggleGreen}
              variant="green"
              isLight={isLight}
            />
          </div>

          <div className="p-4 rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 flex flex-col justify-between gap-3">
            <ToggleSwitch
              label="Apple Black (Minimal black)"
              description="Desaturated neutral design"
              checked={toggleBlack}
              onCheckedChange={setToggleBlack}
              variant="black"
              isLight={isLight}
            />
          </div>

          <div className="p-4 rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 flex flex-col justify-between gap-3">
            <ToggleSwitch
              label="Warm Orange (warm orange)"
              description="Soft warm-tone variant"
              checked={toggleOrange}
              onCheckedChange={setToggleOrange}
              variant="orange"
              isLight={isLight}
            />
          </div>
        </div>
      </div>

      {/* 7. Checkbox (L1.7) */}
      <div
        id="l1-checkbox"
        className={`scroll-mt-6 p-6 rounded-2xl border flex flex-col gap-5 ${
          isLight ? 'bg-white border-neutral-200/80 shadow-xs' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-500 font-mono font-bold text-xs">
                L1.7
              </span>
              <h2 className="text-base font-bold">Checkbox (Haptic rounded checkbox primitive)</h2>
            </div>
            <p className={`text-xs mt-1 ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
              Atomic checkbox controls for compact central-axis forms with multi-palette support,
              corner radius, outline thickness, and left/right label layout.
            </p>
          </div>
          <Badge variant="success" size="sm" isLight={isLight}>
            L1 Primitive
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 flex items-center justify-between">
            <Checkbox
              label="Invert Swivel (Amber)"
              description="Amber primary color + 5px Squircle"
              checked={toggleGreen}
              onCheckedChange={setToggleGreen}
              variant="amber"
              isLight={isLight}
            />
          </div>

          <div className="p-4 rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 flex items-center justify-between">
            <Checkbox
              label="Camera Shake (Neutral)"
              description="Desaturated monochrome minimalist"
              checked={toggleBlack}
              onCheckedChange={setToggleBlack}
              variant="neutral"
              isLight={isLight}
            />
          </div>

          <div className="p-4 rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 flex items-center justify-between">
            <Checkbox
              label="Right-Aligned Label"
              description="Left-aligned text, right-aligned + right Checkbox"
              labelPosition="left"
              checked={toggleOrange}
              onCheckedChange={setToggleOrange}
              variant="emerald"
              isLight={isLight}
            />
          </div>
        </div>
      </div>
    </>
  );
});
