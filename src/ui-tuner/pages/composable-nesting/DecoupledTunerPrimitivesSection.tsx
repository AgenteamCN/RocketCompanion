import React from 'react';
import { Filter, Palette, Sliders } from 'lucide-react';
import { EventFilterMatrix } from '../../../ui-core/compounds/tuner/EventFilterMatrix';
import {
  PriorityQueueList,
  type PriorityQueueItem,
} from '../../../ui-core/compounds/tuner/PriorityQueueList';
import { Badge } from '../../../ui-core/primitives/Badge';
import {
  PrecisionDigitPicker,
  TunerPrecisionContext,
} from '../../../ui-core/primitives/PrecisionDigitPicker';
import { ColorSwatchInput } from '../../components/tuner/ColorSwatchInput';
import { UVTransformControl } from '../../components/tuner/UVTransformControl';
import {
  DEFAULT_EVENT_CATALOG,
  useDecoupledTunerPrimitivesState,
} from './useComposableNestingSyncedState';

export interface DecoupledTunerPrimitivesSectionProps {
  isLight: boolean;
}

export const DecoupledTunerPrimitivesSection: React.FC<
  DecoupledTunerPrimitivesSectionProps
> = ({ isLight }) => {
  const {
    globalStep,
    setGlobalStep,
    uvTransform,
    setUvTransform,
    primaryPaint,
    setPrimaryPaint,
    accentFinish,
    setAccentFinish,
    emissiveGlow,
    setEmissiveGlow,
    blueQueue,
    setBlueQueue,
    orangeQueue,
    setOrangeQueue,
    selectedEventsMap,
    setSelectedEventsMap,
  } = useDecoupledTunerPrimitivesState();

  const handleReorder = (
    setter: React.Dispatch<React.SetStateAction<PriorityQueueItem[]>>,
    index: number,
    direction: 'up' | 'down'
  ) => {
    setter((prev) => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      return copy;
    });
  };

  const handleToggleEvent = (hex: string) => {
    const key = hex.toLowerCase();
    setSelectedEventsMap((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSelectAllEvents = () => {
    const next: Record<string, boolean> = {};
    for (const item of DEFAULT_EVENT_CATALOG) {
      next[item.hex.toLowerCase()] = true;
    }
    setSelectedEventsMap(next);
  };

  const handleDeselectAllEvents = () => {
    setSelectedEventsMap({});
  };

  return (
    <section id="l3-3-uv-color-tuner" className="space-y-4 scroll-mt-24">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-2">
            <Sliders className="h-4 w-4 text-amber-500" />
            3. [L3.3 ~ L3.6] Decoupled Tuner &amp; Garage Primitives
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Standardized from <code>DecalTextTunerWindow</code>, <code>SoundTunerFloatingWindow</code>,{' '}
            <code>GaragePanel</code> and <code>EventStreamOBFloatingWindow</code>, Now fully decoupled
            into independent, reusable standard primitives.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-neutral-500">Shared Precision Context:</span>
          <PrecisionDigitPicker
            step={globalStep}
            onStepChange={setGlobalStep}
            compact
            isLight={isLight}
          />
        </div>
      </div>

      <TunerPrecisionContext.Provider value={{ step: globalStep, setStep: setGlobalStep }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
          <UVTransformControl
            title="Decal UV Scale & Offset Matrix"
            value={uvTransform}
            onChange={(patch) => setUvTransform((prev) => ({ ...prev, ...patch }))}
            isLight={isLight}
          />

          <div
            className={`p-4 rounded-xl border space-y-3 ${
              isLight
                ? 'bg-neutral-100/70 border-neutral-200/80'
                : 'bg-neutral-900/50 border-neutral-800/80'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-2 border-neutral-200/70 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-amber-500" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  ColorSwatchInput (Shader &amp; Decal Hex Pickers)
                </span>
              </div>
              <Badge variant="neutral" isLight={isLight}>
                TunerColorRow
              </Badge>
            </div>

            <div className="space-y-2">
              <ColorSwatchInput
                label="Chassis Primary Paint"
                value={primaryPaint}
                presets={['#F59E0B', '#EF4444', '#3B82F6', '#10B981']}
                onChange={setPrimaryPaint}
                isLight={isLight}
              />
              <ColorSwatchInput
                label="Anodized Accent Trim"
                value={accentFinish}
                presets={['#10B981', '#8B5CF6', '#EC4899', '#F97316']}
                onChange={setAccentFinish}
                isLight={isLight}
              />
              <ColorSwatchInput
                label="Boost Core Emissive"
                value={emissiveGlow}
                presets={['#38BDF8', '#FACC15', '#A855F7', '#F43F5E']}
                onChange={setEmissiveGlow}
                isLight={isLight}
              />
            </div>

            <div className="pt-2 flex items-center gap-2">
              <div
                className="h-6 flex-1 rounded-lg border border-black/10 shadow-inner"
                style={{
                  background: `linear-gradient(90deg, ${primaryPaint} 0%, ${accentFinish} 55%, ${emissiveGlow} 100%)`,
                }}
              />
              <span className="text-[10px] font-mono text-neutral-500">Live Shader Gradient</span>
            </div>
          </div>
        </div>
      </TunerPrecisionContext.Provider>

      <div id="l3-5-priority-event-matrix" className="space-y-4 scroll-mt-24">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 w-full">
          <PriorityQueueList
            title="Blue Team Paint Fallback Priority"
            subtitle="Primary -> Fallback 1 -> Fallback 2"
            items={blueQueue}
            accentDotColor="#0284c7"
            onReorder={(idx, dir) => handleReorder(setBlueQueue, idx, dir)}
            isLight={isLight}
          />
          <PriorityQueueList
            title="Orange Team Paint Fallback Priority"
            subtitle="Reorder preferred paint slots with zero coupling"
            items={orangeQueue}
            accentDotColor="#f59e0b"
            onReorder={(idx, dir) => handleReorder(setOrangeQueue, idx, dir)}
            isLight={isLight}
          />
        </div>

        <div
          className={`p-5 rounded-xl border space-y-3 ${
            isLight
              ? 'bg-neutral-100/70 border-neutral-200/80'
              : 'bg-neutral-900/50 border-neutral-800/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-bold uppercase tracking-wider">
                EventFilterMatrix (0x01..0x08 Hex Event Catalog Filter)
              </span>
            </div>
            <Badge variant="amber" isLight={isLight}>
              Decoupled Event Stream Filter
            </Badge>
          </div>
          <EventFilterMatrix
            items={DEFAULT_EVENT_CATALOG}
            selectedMap={selectedEventsMap}
            onToggleItem={handleToggleEvent}
            onSelectAll={handleSelectAllEvents}
            onDeselectAll={handleDeselectAllEvents}
            isLight={isLight}
          />
        </div>
      </div>
    </section>
  );
};
