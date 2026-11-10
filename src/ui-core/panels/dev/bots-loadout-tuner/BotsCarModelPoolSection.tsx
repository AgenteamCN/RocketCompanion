import React from 'react';
import { Car, Check } from 'lucide-react';
import { useBotsLoadoutStore } from '../../../stores/botsLoadoutStore';
import { BOT_VISUAL_CATALOG } from '../../../config/botsLoadoutConfig';

export interface BotsCarModelPoolSectionProps {
  isLight?: boolean;
}

export const BotsCarModelPoolSection: React.FC<BotsCarModelPoolSectionProps> = ({
  isLight = false,
}) => {
  const visualIds = useBotsLoadoutStore((s) => s.visualIds);
  const toggleVisualId = useBotsLoadoutStore((s) => s.toggleVisualId);
  const setVisualIdsPreset = useBotsLoadoutStore((s) => s.setVisualIdsPreset);

  return (
    <div
      className={`flex flex-col gap-2 p-2.5 rounded-xl border ${
        isLight
          ? 'bg-neutral-100/70 border-neutral-200'
          : 'bg-neutral-900/60 border-neutral-800'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Car className="w-3.5 h-3.5 text-sky-400" />
          <span className="font-semibold text-[11px]">
            1. Car Model Pool ({visualIds.length} / {BOT_VISUAL_CATALOG.length}{' '}
            Selected)
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setVisualIdsPreset('all')}
            className={`px-2 py-0.5 rounded text-[10px] font-mono border cursor-pointer transition-colors ${
              isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
            }`}
          >
            All ({BOT_VISUAL_CATALOG.length})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {BOT_VISUAL_CATALOG.map(
          (car: {
            id: string;
            label: string;
            defaultHitboxId: string;
            isPreset?: boolean;
          }) => {
            const isChecked = visualIds.includes(car.id);
            const isGlb = !car.isPreset;
            const hitboxShort = String(car.defaultHitboxId || '')
              .replace(/^hitbox-/, '')
              .toUpperCase();
            return (
              <button
                key={car.id}
                type="button"
                onClick={() => toggleVisualId(car.id)}
                className={`flex flex-col items-start justify-between p-2 rounded-lg border text-left transition-all cursor-pointer gap-1 ${
                  isChecked
                    ? isLight
                      ? 'bg-amber-50 border-amber-500 ring-1 ring-amber-500/40 text-neutral-900'
                      : 'bg-amber-500/15 border-amber-500/80 ring-1 ring-amber-500/30 text-white'
                    : isLight
                    ? 'bg-white hover:bg-neutral-50 border-neutral-200 text-neutral-600'
                    : 'bg-neutral-900/80 hover:bg-neutral-800 border-neutral-800 text-neutral-400'
                }`}
              >
                <div className="flex items-center justify-between w-full gap-1">
                  <span className="font-bold text-[11px] truncate">
                    {car.label}
                  </span>
                  <span
                    className={`w-3.5 h-3.5 rounded flex items-center justify-center border shrink-0 ${
                      isChecked
                        ? 'bg-amber-500 border-amber-400 text-neutral-950'
                        : isLight
                        ? 'border-neutral-300 bg-neutral-100'
                        : 'border-neutral-700 bg-neutral-950'
                    }`}
                  >
                    {isChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </span>
                </div>
                <div className="flex items-center justify-between w-full gap-1">
                  <span className="text-[9px] font-mono opacity-75 truncate">
                    {hitboxShort}
                  </span>
                  <span
                    className={`text-[9px] font-mono px-1 rounded ${
                      isGlb
                        ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                        : 'opacity-50'
                    }`}
                  >
                    {isGlb ? 'GLB' : 'BOX'}
                  </span>
                </div>
              </button>
            );
          }
        )}
      </div>
    </div>
  );
};
