import React from 'react';
import { createScopedSyncedState } from '../../stores/crossClientSync';
import { Check } from 'lucide-react';
import { SegmentedSwitch } from '../../../ui-core/primitives/SegmentedSwitch';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { Badge } from '../../../ui-core/primitives/Badge';

const useState = createScopedSyncedState('page:tabs');

export interface SegmentedAndSliderPrimitivesSectionProps {
  isLight: boolean;
}

export const SegmentedAndSliderPrimitivesSection: React.FC<
  SegmentedAndSliderPrimitivesSectionProps
> = React.memo(({ isLight }) => {
  // Segmented Switch States (testing multiple independent instances)
  const [switch1, setSwitch1] = useState('performance', 'switch1');
  const [switch2, setSwitch2] = useState('mid', 'switch2');
  const [switch3, setSwitch3] = useState('long-label', 'switch3');
  const [switch4, setSwitch4] = useState('proportional-2', 'switch4');

  // Sliders State
  const [sliderNeutral, setSliderNeutral] = useState(75, 'sliderNeutral');
  const [sliderAmber, setSliderAmber] = useState(50, 'sliderAmber');
  const [sliderCentered, setSliderCentered] = useState(18, 'sliderCentered');
  const [sliderTrim, setSliderTrim] = useState(-24, 'sliderTrim');
  const [sliderUnityGain, setSliderUnityGain] = useState(180, 'sliderUnityGain');

  return (
    <>
      {/* 2. Segmented Switch */}
      <div
        id="l1-segmented-switch"
        className={`scroll-mt-6 p-6 rounded-2xl border flex flex-col gap-6 ${
          isLight ? 'bg-white border-neutral-200 shadow-2xs' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="font-bold text-sm">2. Haptic segment controller (SegmentedSwitch)</span>
          <Badge size="sm" variant="neutral" isLight={isLight}>
            rounded rectangle / Multi-instance isolation
          </Badge>
        </div>
        <p className={`text-xs leading-relaxed ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
          Fix over-rounded capsule issue, Adopt standard rounded rectangle (
          <code className="font-mono text-amber-500">rounded-lg / rounded-md</code>); Comprehensive
          solution for multi-instance indicator conflicts; Supports <strong>Auto Compact</strong>,{' '}
          <strong>Equidistant (Equal)</strong>,{' '}
          <strong>Content proportional distribution (Proportional)</strong> Three width distributions.
        </p>

        {/* Feature 1: Multi-instance Coexistence Demonstration */}
        <div className="flex flex-col gap-3 p-4 rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 bg-neutral-50/50 dark:bg-neutral-950/40">
          <div className="flex items-center gap-2 text-xs font-bold">
            <Check className="h-4 w-4 text-emerald-500" />
            <span>
              Feature 1: Multi-instance concurrency (Render respective white/Highlight active indicator)
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-mono text-neutral-400">Controller 1:</span>
              <SegmentedSwitch
                value={switch1}
                onValueChange={setSwitch1}
                isLight={isLight}
                options={[
                  { value: 'quality', label: 'Quality' },
                  { value: 'balanced', label: 'Balanced' },
                  { value: 'performance', label: 'Performance' },
                ]}
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-mono text-neutral-400">
                Controller 2 (Independent activation):
              </span>
              <SegmentedSwitch
                value={switch2}
                onValueChange={setSwitch2}
                isLight={isLight}
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'mid', label: 'Medium' },
                  { value: 'high', label: 'High' },
                ]}
              />
            </div>
          </div>
        </div>

        {/* Feature 2: Width Distribution Modes */}
        <div className="flex flex-col gap-4">
          <span className="text-xs font-bold text-neutral-400">
            Feature 2: Width distribution mode (Width Distribution Modes)
          </span>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-neutral-400">
                A. align left / Content length adaptation (
                <code className="font-mono text-amber-500">distribution="auto"</code>):
              </span>
              <span className="text-[11px] text-neutral-400">
                Long text occupies more proportion, Short text occupies less ratio
              </span>
            </div>
            <SegmentedSwitch
              value={switch3}
              onValueChange={setSwitch3}
              isLight={isLight}
              distribution="auto"
              options={[
                { value: 'short', label: 'Short' },
                { value: 'medium-label', label: 'Medium length label' },
                { value: 'long-label', label: 'Long detailed setting options (Longer Content)' },
              ]}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-neutral-400">
                B. Equal spacing / Distribute evenly (
                <code className="font-mono text-amber-500">distribution="equal" / fullWidth</code>):
              </span>
              <span className="text-[11px] text-neutral-400">
                Regardless of length, Each segment strictly divides width equally
              </span>
            </div>
            <SegmentedSwitch
              value={switch3}
              onValueChange={setSwitch3}
              isLight={isLight}
              distribution="equal"
              options={[
                { value: 'short', label: 'Short' },
                { value: 'medium-label', label: 'Medium length label' },
                { value: 'long-label', label: 'Longer options (Distribute align)' },
              ]}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-neutral-400">
                C. Fill proportionally by width (
                <code className="font-mono text-amber-500">distribution="proportional"</code>):
              </span>
              <span className="text-[11px] text-neutral-400">
                Fill full row width, Maintain content weight and spacing
              </span>
            </div>
            <SegmentedSwitch
              value={switch4}
              onValueChange={setSwitch4}
              isLight={isLight}
              distribution="proportional"
              options={[
                { value: 'proportional-1', label: 'Compact' },
                { value: 'proportional-2', label: 'Balanced Proportion' },
                { value: 'proportional-3', label: 'Expanded High Priority Segment' },
              ]}
            />
          </div>
        </div>
      </div>

      {/* 3. Slider Control (Default + Centered Bipolar Variation + Custom Anchor) */}
      <div
        id="l1-slider-control"
        className={`scroll-mt-6 p-6 rounded-2xl border flex flex-col gap-5 ${
          isLight ? 'bg-white border-neutral-200 shadow-2xs' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="font-bold text-sm">
            3. Stepped slider fine-tuner (SliderControl - Includes center-zero bidirectional fill variant)
          </span>
          <Badge size="sm" variant="amber" isLight={isLight}>
            support Centered Bidirectional fill / Input enabled
          </Badge>
        </div>
        <p className={`text-xs ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
          Completely remove harsh blue highlights. Support standard left-to-right fill (
          <code className="font-mono text-amber-500">variation="default"</code>) Reference from center
          zero or arbitrary anchor point to the left/Bidirectional right fill (
          <code className="font-mono text-amber-500">variation="centered"</code>), Supports one-click
          reset to baseline and direct inline input (
          <code className="font-mono text-amber-500">editable={'{true}'}</code>).
        </p>

        {/* Neutral Monochrome Default */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-neutral-400">
            A. Default left-to-right unidirectional fill (Neutral Mono Scheme):
          </span>
          <SliderControl
            label="Field of View (FOV)"
            description="Adjust 3D perspective camera field of view (FOV) (Neutral black and white non-saturated track segment)"
            value={sliderNeutral}
            min={60}
            max={120}
            step={1}
            unit="°"
            onChange={setSliderNeutral}
            colorScheme="neutral"
            isLight={isLight}
          />
        </div>

        {/* Warm Amber Variant */}
        <div className="flex flex-col gap-1.5 pt-2 border-t border-neutral-200/60 dark:border-neutral-800/60">
          <span className="text-xs font-semibold text-neutral-400">
            B. Warm orange theme (Warm Amber Scheme):
          </span>
          <SliderControl
            label="Master Volume"
            description="Master mix output gain (Soft warm track)"
            value={sliderAmber}
            min={0}
            max={100}
            step={5}
            unit="%"
            onChange={setSliderAmber}
            colorScheme="amber"
            isLight={isLight}
          />
        </div>

        {/* Centered / Bipolar Variation (Positive & Negative bi-directional fill from origin) */}
        <div className="flex flex-col gap-3 pt-3 border-t border-neutral-200/60 dark:border-neutral-800/60">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-bold text-amber-500">
              C. Centrally symmetric / Anchor bidirectional fill variant (Centered / Bipolar Variation):
            </span>
            <Badge size="sm" variant="amber" isLight={isLight}>
              variation="centered" · Bidirectional fill
            </Badge>
          </div>
          <p className={`text-[11px] ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
            When slider has positive/negative values (e.g. <code className="font-mono">-50 ~ +50</code> or{' '}
            <code className="font-mono">-180° ~ +180°</code>) Or specific unit reference point (e.g.{' '}
            <code className="font-mono">100%</code> Standard gain) Time, No longer rigidly filling from
            the far left, Instead of <code className="font-mono">origin</code> Center-to-left (Negative
            offset) Or to the right (Positive offset) Dynamic fill, Double-click the track segment or
            click the zero-badge to reset to zero:
          </p>

          <SliderControl
            label="Steering Trim (Balance fine-tuning · Center 0 Point)"
            description="By center 0% As base point: Positive fill right, Negative fill left, Support color-coded positive/negative"
            value={sliderCentered}
            min={-50}
            max={50}
            step={1}
            unit="%"
            onChange={setSliderCentered}
            variation="centered"
            origin={0}
            showSign={true}
            colorScheme="neutral"
            isLight={isLight}
          />

          <SliderControl
            label="Boost Pad Symmetry Rotation (Boost pad symmetry rotation · Positive/negative contrast)"
            description="Negative angle from 0° Fill left with sky blue, Positive angle from 0° Fill right with warm orange, Support direct input of precise angles"
            value={sliderTrim}
            min={-180}
            max={180}
            step={1}
            unit="°"
            onChange={setSliderTrim}
            variation="centered"
            origin={0}
            showSign={true}
            colorScheme="amber"
            negativeColorScheme="sky"
            editable={true}
            isLight={isLight}
          />

          <SliderControl
            label="Acoustic Bus Gain (0% ~ 500% Volume matrix · Custom anchor origin=100%)"
            description="Benchmark Layer 4 Advanced Audio matrix: By 100% (Unity Gain) For non-centered anchor point, Lower than 100% Decay left, Higher than 100% Amplify right"
            value={sliderUnityGain}
            min={0}
            max={500}
            step={5}
            unit="%"
            onChange={setSliderUnityGain}
            variation="centered"
            origin={100}
            colorScheme="emerald"
            negativeColorScheme="amber"
            editable={true}
            isLight={isLight}
          />
        </div>
      </div>
    </>
  );
});

SegmentedAndSliderPrimitivesSection.displayName = 'SegmentedAndSliderPrimitivesSection';
