import React, { useState } from 'react';
import { Hourglass, Play, Sparkles } from 'lucide-react';
import { useAppStore } from '../../../stores/appStore';
import { type BoostPadTunerConfig } from '../../../config/uiConfig';
import { TunerRow, TunerColorRow, TunerToggleRow } from '../../../compounds/TunerControls';

export interface BoostPadRefillTabProps {
  tuner: BoostPadTunerConfig;
  updateTuner: (patch: Partial<BoostPadTunerConfig>) => void;
  isLight?: boolean;
  onSimulateRefill?: (padIndex?: number | 'all') => void;
}

export const BoostPadRefillTab: React.FC<BoostPadRefillTabProps> = ({
  tuner,
  updateTuner,
  isLight = false,
  onSimulateRefill,
}) => {
  const [simulatingIndex, setSimulatingIndex] = useState<number | 'all' | null>(null);

  const handleSimulateRefill = (target: number | 'all') => {
    setSimulatingIndex(target);
    if (typeof onSimulateRefill === 'function') {
      onSimulateRefill(target);
    } else {
      useAppStore.getState().bridge.onSimulateBoostPadRefill?.(target);
    }
    setTimeout(() => setSimulatingIndex(null), 3000);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Header and Simulation Action Buttons */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 font-semibold text-[11px] text-amber-500 uppercase tracking-wider">
          <Hourglass className="h-3 w-3" />
          <span>Countdown Refilling Ring Mask</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => handleSimulateRefill(0)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-all active:scale-95 ${
              simulatingIndex === 0
                ? 'bg-amber-500 text-black border-amber-400'
                : isLight
                ? 'bg-amber-100 hover:bg-amber-200 border-amber-300 text-amber-900 shadow-sm'
                : 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/40 text-amber-300'
            }`}
            title="Preview 3.0s countdown refilling simulation on Pad #0"
          >
            <Play className="h-3 w-3 fill-current" />
            <span>Pad #0</span>
          </button>

          <button
            type="button"
            onClick={() => handleSimulateRefill('all')}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-all active:scale-95 ${
              simulatingIndex === 'all'
                ? 'bg-amber-500 text-black border-amber-400'
                : isLight
                ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800 shadow-sm'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-600 text-neutral-200'
            }`}
            title="Trigger countdown refilling simulation across all 34 arena pads simultaneously"
          >
            <Sparkles className="h-3 w-3" />
            <span>All Pads</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <TunerToggleRow
          label="Enable Refilling Ring Effect"
          description="Inward circular mask with zero saturation before boost respawn"
          checked={tuner.refillEnabled}
          onChange={(checked) => updateTuner({ refillEnabled: checked })}
          isLight={isLight}
        />

        <TunerRow
          label="Big Pad Countdown Threshold"
          description="Seconds before respawn when desaturated circle starts contracting from perimeter"
          value={tuner.bigRefillThreshold}
          sliderMin={0.5}
          sliderMax={6.0}
          sliderStep={0.1}
          onChange={(val) => updateTuner({ bigRefillThreshold: val })}
          isLight={isLight}
          unit="s"
        />

        <TunerRow
          label="Small Pad Countdown Threshold"
          description="Seconds before small pad respawn to trigger rapid inward contraction"
          value={tuner.smallRefillThreshold}
          sliderMin={0.2}
          sliderMax={4.0}
          sliderStep={0.1}
          onChange={(val) => updateTuner({ smallRefillThreshold: val })}
          isLight={isLight}
          unit="s"
        />

      </div>

      <div
        className={`p-2.5 rounded-xl border text-[11px] leading-relaxed transition-colors font-mono ${
          isLight
            ? 'bg-neutral-100/60 border-neutral-200 text-neutral-600'
            : 'bg-neutral-900/40 border-neutral-800 text-neutral-400'
        }`}
      >
        <div className="font-semibold text-amber-500 mb-0.5">• Pure Inward Donut Reveal Mask</div>
        <div>• Starts as a thin outer donut ring, thickens inward, and becomes a solid circle at full recharge.</div>
        <div>• Automatically strips saturation (0% saturation) with no extra scan or ring color overlay.</div>
        <div>• Floating orb and black silhouette appear strictly upon full recharge completion.</div>
      </div>
    </div>
  );
};
