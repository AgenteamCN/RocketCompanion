import React, { useState } from 'react';
import { Flame, RotateCcw } from 'lucide-react';
import { UI_RADIUS } from '../tokens/radius';
import { UI_THEME } from '../tokens/colors';

export const ALPHA_COMPONENT_ID = 'Alpha:PhaseVariationMatrix' as const;

export type VariationPhaseId = 'start' | 'loop' | 'end';

export interface PhaseVariationItem {
  id: string;
  label: string;
  isDefault?: boolean;
}

export const DEFAULT_BOOST_VARIATION_ITEMS: PhaseVariationItem[] = [
  { id: 'rush', label: 'Gold Rush', isDefault: true },
  { id: 'standard', label: 'Standard' },
  { id: 'flamethrower', label: 'Flamethrower' },
  { id: 'plasma', label: 'Plasma' },
];

export interface PhaseVariationSelection {
  start: string;
  loop: string;
  end: string;
}

export interface PhaseVariationMatrixProps {
  title?: string;
  subtitle?: string;
  badgeText?: string;
  variations?: PhaseVariationItem[];
  defaultVariationId?: string;
  selection?: PhaseVariationSelection;
  onSelectPhase?: (variationId: string, phase: VariationPhaseId) => void;
  onSelectAllPhases?: (variationId: string) => void;
  onHover?: (desc: string) => void;
  onLeave?: () => void;
  isLight?: boolean;
  className?: string;
}

/**
 * [L3 Compound] PhaseVariationMatrix
 * Decoupled N-Variation × 3-Phase (`Start / Loop / End`) Matrix Selector with Row-All & Reset actions.
 * Supports both controlled (`selection` + `onSelectPhase` / `onSelectAllPhases`) and uncontrolled standalone modes.
 */
export const PhaseVariationMatrix: React.FC<PhaseVariationMatrixProps> = React.memo(
  ({
    title = 'Boost Audio Variation Tuner',
    subtitle = 'Select one variation per column (Start / Loop / End) · Click cell to preview',
    badgeText = '4 Sets · M4A',
    variations = DEFAULT_BOOST_VARIATION_ITEMS,
    defaultVariationId = variations[0]?.id ?? 'rush',
    selection: controlledSelection,
    onSelectPhase,
    onSelectAllPhases,
    onHover,
    onLeave,
    isLight = true,
    className = '',
  }) => {
  const [internalSelection, setInternalSelection] = useState<PhaseVariationSelection>({
    start: defaultVariationId,
    loop: defaultVariationId,
    end: defaultVariationId,
  });
  const theme = isLight ? UI_THEME.light : UI_THEME.dark;

  const activeSelection = controlledSelection ?? internalSelection;

  const handleSelectPhase = (variationId: string, phase: VariationPhaseId) => {
    setInternalSelection((prev) => ({ ...prev, [phase]: variationId }));
    onSelectPhase?.(variationId, phase);
  };

  const handleSelectAllPhases = (variationId: string) => {
    setInternalSelection({
      start: variationId,
      loop: variationId,
      end: variationId,
    });
    onSelectAllPhases?.(variationId);
  };

  const isAllDefault =
    activeSelection.start === defaultVariationId &&
    activeSelection.loop === defaultVariationId &&
    activeSelection.end === defaultVariationId;

  return (
    <div
      data-alpha-id={ALPHA_COMPONENT_ID}
      data-ui-element="compound-phase-variation-matrix"
      className={`w-full p-3 ${UI_RADIUS.lg} border select-none flex flex-col gap-2.5 ${
        isLight
          ? 'bg-neutral-50/90 border-neutral-200'
          : 'bg-neutral-850/80 border-neutral-700/80'
      } ${className}`}
      onMouseEnter={() =>
        onHover?.(
          'Phase Variation Matrix: Mix and match Start, Loop, and End samples across audio variations.'
        )
      }
      onMouseLeave={() => onLeave?.()}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between gap-2 px-1 pb-2 border-b ${
          isLight ? 'border-neutral-200' : 'border-neutral-700/40'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Flame className="h-4 w-4 text-amber-500 shrink-0" />
          <div className="flex flex-col text-left leading-snug min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-bold truncate ${theme.textPrimary}`}>
                {title}
              </span>
              {badgeText && (
                <span
                  className={`text-[9px] font-mono px-1.5 py-0.5 ${UI_RADIUS.sm} border ${
                    isLight
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-700'
                      : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                  }`}
                >
                  {badgeText}
                </span>
              )}
            </div>
            <span className={`text-[10px] mt-0.5 truncate ${theme.textMuted}`}>
              {subtitle}
            </span>
          </div>
        </div>

        {!isAllDefault && (
          <button
            type="button"
            onClick={() => handleSelectAllPhases(defaultVariationId)}
            className={`px-2 py-1 ${UI_RADIUS.md} text-[10px] font-semibold border transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
              isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
            }`}
          >
            <RotateCcw className="h-2.5 w-2.5" />
            <span>Reset Default</span>
          </button>
        )}
      </div>

      {/* Matrix Table */}
      <div
        className={`w-full ${UI_RADIUS.md} border overflow-hidden ${
          isLight ? 'border-neutral-200 bg-white' : 'border-neutral-800 bg-neutral-900/60'
        }`}
      >
        <div
          className={`grid grid-cols-[1.35fr_1fr_1fr_1fr_44px] items-center px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b ${
            isLight
              ? 'bg-neutral-100/90 border-neutral-200 text-neutral-500'
              : 'bg-neutral-900/90 border-neutral-800 text-neutral-400'
          }`}
        >
          <span className="text-left">Variation</span>
          <span className="text-center">Start</span>
          <span className="text-center">Loop</span>
          <span className="text-center">End</span>
          <span className="text-right pr-1">Preset</span>
        </div>

        <div className={isLight ? 'divide-y divide-neutral-200/70' : 'divide-y divide-neutral-800/70'}>
          {variations.map((v) => {
            const isStartSelected = activeSelection.start === v.id;
            const isLoopSelected = activeSelection.loop === v.id;
            const isEndSelected = activeSelection.end === v.id;
            const isFullRowSelected = isStartSelected && isLoopSelected && isEndSelected;

            const renderPhaseCell = (
              phase: VariationPhaseId,
              selected: boolean,
              phaseLabel: string
            ) => (
              <div className="px-1 flex justify-center">
                <button
                  type="button"
                  onClick={() => handleSelectPhase(v.id, phase)}
                  aria-pressed={selected}
                  className={`w-full py-1 px-2 rounded-md text-[10px] font-semibold border transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                    selected
                      ? isLight
                        ? 'bg-amber-500/20 border-amber-500 text-amber-900 shadow-xs'
                        : 'bg-amber-500/20 border-amber-400/80 text-amber-300 shadow-xs'
                      : isLight
                      ? 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-500 hover:text-neutral-800'
                      : 'bg-neutral-850/60 hover:bg-neutral-800 border-neutral-700/50 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full shrink-0 transition-colors ${
                      selected
                        ? 'bg-amber-400'
                        : isLight
                        ? 'bg-neutral-300'
                        : 'bg-neutral-600'
                    }`}
                  />
                  <span>{phaseLabel}</span>
                </button>
              </div>
            );

            return (
              <div
                key={v.id}
                className={`grid grid-cols-[1.35fr_1fr_1fr_1fr_44px] items-center px-2.5 py-1.5 transition-colors ${
                  isFullRowSelected
                    ? isLight
                      ? 'bg-amber-500/5'
                      : 'bg-amber-500/[0.04]'
                    : isLight
                    ? 'hover:bg-neutral-50'
                    : 'hover:bg-neutral-850/40'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0 pr-1">
                  <span
                    className={`text-[11px] font-semibold truncate ${
                      isStartSelected || isLoopSelected || isEndSelected
                        ? isLight
                          ? 'text-neutral-900'
                          : 'text-neutral-100'
                        : isLight
                        ? 'text-neutral-600'
                        : 'text-neutral-400'
                    }`}
                  >
                    {v.label}
                  </span>
                  {(v.isDefault || v.id === defaultVariationId) && (
                    <span
                      className={`text-[8px] font-mono uppercase px-1 py-0.2 rounded ${
                        isLight
                          ? 'bg-neutral-200 text-neutral-600'
                          : 'bg-neutral-800 text-neutral-400'
                      }`}
                    >
                      def
                    </span>
                  )}
                </div>

                {renderPhaseCell('start', isStartSelected, 'Start')}
                {renderPhaseCell('loop', isLoopSelected, 'Loop')}
                {renderPhaseCell('end', isEndSelected, 'End')}

                <div className="pl-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleSelectAllPhases(v.id)}
                    className={`w-full py-1 px-1.5 rounded-md text-[10px] font-mono font-semibold border transition-colors cursor-pointer flex items-center justify-center ${
                      isFullRowSelected
                        ? isLight
                          ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-700'
                          : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                        : isLight
                        ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-500 hover:text-neutral-800'
                        : 'bg-neutral-800/80 hover:bg-neutral-700 border-neutral-700 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <span>All</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

PhaseVariationMatrix.displayName = 'PhaseVariationMatrix';
