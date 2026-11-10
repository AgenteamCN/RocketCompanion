import React from 'react';
import { Layers, ArrowLeftRight } from 'lucide-react';
import { useSubsystemIsolationLabStore } from '../../../stores/subsystemIsolationLabStore';
import { SegmentedSwitch } from '../../../primitives/SegmentedSwitch';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { Button } from '../../../primitives/Button';

export interface MultiGhostBenchPanelProps {
  isLight: boolean;
  cardBg: string;
  subPanelBg: string;
  mutedText: string;
}

export const MultiGhostBenchPanel: React.FC<MultiGhostBenchPanelProps> = ({
  isLight,
  cardBg,
  subPanelBg,
  mutedText,
}) => {
  const {
    dualWorldEnabled,
    activeWorldIndex,
    ghostWorldCount,
    ghostCarsPerWorld,
    ghostOpacity,
    setDualWorldEnabled,
    switchActiveWorld,
    setGhostWorldCount,
    setGhostCarsPerWorld,
    setGhostOpacity,
  } = useSubsystemIsolationLabStore();

  return (
    <div className="flex flex-col gap-2.5">
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2.5 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-sky-400" />
            <span className="font-semibold text-[11px]">Multi-World Same-Map Ghost Sandbox</span>
          </div>
          <ToggleSwitch
            checked={dualWorldEnabled}
            onCheckedChange={(v) => setDualWorldEnabled(v)}
            isLight={isLight}
            variant="neutral"
          />
        </div>

        <p className={`text-[10px] leading-relaxed ${mutedText}`}>
          Runs up to <b>{ghostWorldCount} independent physics worlds</b> on the same map, with up to{' '}
          <b>8 vehicles + 1 ball per world</b> (no ball trajectory prediction line). Cycle control across worlds at any time; non-controlled worlds render as translucent ghosts with zero physical collision interference.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-[10px]">Parallel Worlds</span>
            <SegmentedSwitch
              value={String(ghostWorldCount)}
              fullWidth
              size="sm"
              isLight={isLight}
              onValueChange={(v) => setGhostWorldCount(Number(v) as 2 | 3 | 4)}
              options={[
                { value: '2', label: '2 Worlds' },
                { value: '3', label: '3 Worlds' },
                { value: '4', label: '4 Worlds' },
              ]}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-semibold text-[10px]">Cars Per World (Max 8)</span>
            <SegmentedSwitch
              value={String(ghostCarsPerWorld)}
              fullWidth
              size="sm"
              isLight={isLight}
              onValueChange={(v) => setGhostCarsPerWorld(Number(v))}
              options={[
                { value: '1', label: '1' },
                { value: '2', label: '2' },
                { value: '4', label: '4' },
                { value: '8', label: '8' },
              ]}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex flex-col">
            <span className="font-bold text-xs">
              Controlling: World #{activeWorldIndex + 1} of {ghostWorldCount} ({ghostCarsPerWorld}{' '}
              {ghostCarsPerWorld === 1 ? 'Car' : 'Cars'}/World)
            </span>
            <span className={`text-[10px] ${mutedText}`}>
              Other {ghostWorldCount - 1} world(s) render as translucent ghosts (
              {Math.round(ghostOpacity * 100)}% opacity)
            </span>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={switchActiveWorld}
            isLight={isLight}
            className="gap-1.5 px-3 py-1.5 text-xs font-bold shrink-0"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            <span>Switch World</span>
          </Button>
        </div>

        <div className={`p-2.5 rounded-lg border ${subPanelBg}`}>
          <SliderControl
            label={`Ghost World Opacity (${Math.round(ghostOpacity * 100)}%)`}
            description="Translucency for all parallel ghost worlds (Cars 0..7 + Ball)"
            value={Math.round(ghostOpacity * 100)}
            min={15}
            max={90}
            step={5}
            unit="%"
            showStepper={true}
            colorScheme="neutral"
            isLight={isLight}
            onChange={(val) => setGhostOpacity(val / 100)}
          />
        </div>
      </div>
    </div>
  );
};
