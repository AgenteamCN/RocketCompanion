import React from 'react';
import { createScopedSyncedState } from '../stores/crossClientSync';
import { Volume2, Monitor, Gamepad2 } from 'lucide-react';
import { UnderlineTabs, TabItem } from '../../ui-core/primitives/UnderlineTabs';
import { Badge } from '../../ui-core/primitives/Badge';
import { CodeBlock } from '../CodeBlock';
import { PageJumpDirectory, JumpDirectoryItem } from '../PageJumpDirectory';
import { SettingActionRowTuner } from './tabs/SettingActionRowTuner';
import { UnderlineTabsTuner } from './tabs/UnderlineTabsTuner';
import { SegmentedAndSliderPrimitivesSection } from './tabs/SegmentedAndSliderPrimitivesSection';
import { DualGrabberAndPrecisionPickerSection } from './tabs/DualGrabberAndPrecisionPickerSection';

const useState = createScopedSyncedState('page:tabs');

const L1_TABS_JUMP_ITEMS: JumpDirectoryItem[] = [
  {
    id: 'l1-setting-action-row',
    code: 'L1.0',
    name: 'SettingActionRow',
    label: 'Set nav row (border · Description · Padding · font size · SVG Color tuning)',
    badge: 'L1 ⇄ L6 ⇄ L7',
  },
  {
    id: 'l1-underline-tabs',
    code: 'L1.1',
    name: 'UnderlineTabs',
    label: 'Sliding underline tab bar (font size · Icon Size · spacing · Real-time font weight tuning)',
    badge: 'L1 ⇄ L6 ⇄ L7',
  },
  {
    id: 'l1-segmented-switch',
    code: 'L1.2',
    name: 'SegmentedSwitch',
    label: 'Rounded rectangle tactile segment controller',
    badge: 'L1 Primitive',
  },
  {
    id: 'l1-slider-control',
    code: 'L1.3',
    name: 'SliderControl',
    label: 'Stepper slider and Centered Center bidirectional fill variant',
    badge: 'L1 Primitive',
  },
  {
    id: 'l1-dual-grabber-slider',
    code: 'L1.4',
    name: 'DualGrabberSlider',
    label: 'Dual-slider center deadzone and free-range controller',
    badge: 'L1 Primitive',
  },
  {
    id: 'l1-precision-digit-picker',
    code: 'L1.5',
    name: 'PrecisionDigitPicker',
    label: '1.00000 Decimal step precision selector',
    badge: 'L1 Primitive',
  },
  {
    id: 'l1-toggle-switch',
    code: 'L1.6',
    name: 'ToggleSwitch',
    label: 'Apple HIG Haptic toggle',
    badge: 'L1 Primitive',
  },
  {
    id: 'l1-checkbox',
    code: 'L1.7',
    name: 'Checkbox',
    label: 'Haptic rounded checkbox (Support palette · corner radius · Stroke weight · Indeterminate state)',
    badge: 'L1 Primitive',
  },
];

export const TabsPage: React.FC<{ isLight?: boolean }> = ({ isLight = false }) => {
  const [activeTab1, setActiveTab1] = useState('audio', 'activeTab1');
  const [activeTab2, setActiveTab2] = useState('all', 'activeTab2');

  const tabs1: TabItem[] = [
    { id: 'audio', label: 'Audio', icon: <Volume2 className="h-4 w-4" /> },
    {
      id: 'video',
      label: 'Graphics',
      icon: <Monitor className="h-4 w-4" />,
      badge: (
        <Badge size="sm" variant="amber" isLight={isLight}>
          NEW
        </Badge>
      ),
    },
    { id: 'gameplay', label: 'Gameplay', icon: <Gamepad2 className="h-4 w-4" /> },
  ];

  const tabs2: TabItem[] = [
    { id: 'all', label: 'All items' },
    {
      id: 'installed',
      label: 'Assembled components',
      badge: (
        <Badge size="sm" variant="neutral" isLight={isLight}>
          8
        </Badge>
      ),
    },
    { id: 'locked', label: 'Locked', disabled: true },
  ];

  return (
    <div className="flex flex-col gap-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Tabs & Controls Atomic controls and setting row primitives
        </h1>
        <p className={`text-xs mt-1 ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
          Lightweight high-order atomic interaction controls: Contains decoupled setting navigation row
          primitives (<code className="font-mono">SettingActionRow</code>), Warm orange underline,
          Rounded rectangle segmented controller, Supports bidirectional filling from center zero point
          SliderControl, Dual-slider deadzone controller (DualGrabberSlider), Decimal step precision
          selector (PrecisionDigitPicker) And physical switch.
        </p>
      </div>

      <PageJumpDirectory
        title="L1 · Tabs / Switch / Slider / SettingActionRow Jump-to directory"
        subtitle="Click the card to smoothly scroll to the corresponding atomic control or tuner, Supports one-click copy of standardized component codes"
        items={L1_TABS_JUMP_ITEMS}
        isLight={isLight}
      />

      {/* 0. SettingActionRow Standalone Primitive & Tuner */}
      <div id="l1-setting-action-row" className="scroll-mt-6 flex flex-col gap-3">
        <SettingActionRowTuner
          isLight={isLight}
          title="0. Set navigation row primitives and independent tuner (SettingActionRow · border / Description Visibility / Padding / SVG Icon color)"
          showStandalonePreview={true}
        />
      </div>

      {/* 1. Underline Tabs Standalone Tuner & Multi-Instance Preview */}
      <div id="l1-underline-tabs" className="scroll-mt-6 flex flex-col gap-4">
        <UnderlineTabsTuner
          isLight={isLight}
          title="1. Apple/Linear Sliding underline label primitive and independent tuner (UnderlineTabs · font size / Icon Size / spacing / Font Weight)"
          showStandalonePreview={true}
        />

        <div
          className={`p-5 rounded-2xl border flex flex-col gap-4 ${
            isLight ? 'bg-white border-neutral-200 shadow-2xs' : 'bg-neutral-900/60 border-neutral-800'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs">
              Multi-instance isolation verification (React useId() Standalone layoutId)
            </span>
            <Badge size="sm" variant="amber" isLight={isLight}>
              Orange underline / Multi-instance non-preemptive indicator
            </Badge>
          </div>

          {/* Instance A */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-neutral-400">
              Instance A (With icon and Badge):
            </span>
            <UnderlineTabs
              items={tabs1}
              activeId={activeTab1}
              onChange={setActiveTab1}
              isLight={isLight}
            />
          </div>

          {/* Instance B */}
          <div className="flex flex-col gap-2 pt-2 border-t border-neutral-200/60 dark:border-neutral-800/60">
            <span className="text-xs font-semibold text-neutral-400">
              Instance B (Includes disabled state and count Badge):
            </span>
            <UnderlineTabs
              items={tabs2}
              activeId={activeTab2}
              onChange={setActiveTab2}
              isLight={isLight}
            />
          </div>
        </div>
      </div>

      {/* 2 & 3. SegmentedSwitch & SliderControl Labs */}
      <SegmentedAndSliderPrimitivesSection isLight={isLight} />

      {/* 4, 5, 6, 7. DualGrabberSlider, PrecisionDigitPicker, ToggleSwitch & Checkbox */}
      <DualGrabberAndPrecisionPickerSection isLight={isLight} />

      {/* Code Snippet for AI Agents */}
      <CodeBlock
        isLight={isLight}
        title="Agent code recipe (Tabs, Centered Sliders, Dual-Grabber & Precision Picker)"
        code={`import {
  UnderlineTabs, SegmentedSwitch, SliderControl, DualGrabberSlider,
  PrecisionDigitPicker, TunerPrecisionContext, ToggleSwitch,
} from '@/ui-core/primitives/UnderlineTabs';

// 1. Centrally symmetric bidirectional fill slider (Support positive/negative or custom origin Anchor + Direct input)
<SliderControl
  label="Steering Trim"
  value={trim} min={-50} max={50} unit="%"
  variation="centered"          // By origin Center-to-left(Negative)/Right(Positive)Bidirectional fill
  origin={0}                    // Default is 0, Can also be set to 100 (e.g. 0~500% Volume Gain)
  showSign={true}               // Show Positive '+' Prefix
  negativeColorScheme="sky"     // Optional: Use independent color for negative axis
  editable={true}               // Optional: Enable right-side direct value input
  onChange={setTrim}
  isLight={isLight}
/>

// 2. Dual-slider center deadzone controller ([-α .. +α] Bidirectional independent adjustment)
<DualGrabberSlider
  label="Threshold Tolerance Deadband"
  target={3}                    // Auto Set [-3 .. +3] With Center 0 Point Anchor
  value={[-2, 2]}               // [Catch-up Negative offset, Skip Positive offset]
  mode="centered-deadband"      // or 'free-range'
  onChange={setDeadband}
  isLight={isLight}
/>

// 3. Decimal place step precision selector (1 . 0 0 0 0 0)
<TunerPrecisionContext.Provider value={{ step, setStep }}>
  <PrecisionDigitPicker step={step} onStepChange={setStep} isLight={isLight} />
  <SliderControl label="UV Scale X" value={scaleX} min={0.5} max={2.0} step={0.0001}
    editable={true} usePrecisionContext={true} onChange={setScaleX} isLight={isLight} />
</TunerPrecisionContext.Provider>`}
      />
    </div>
  );
};
