import React from 'react';
import { Target } from 'lucide-react';
import { Badge } from '../../primitives/Badge';
import { UI_RADIUS } from '../../tokens/radius';
import {
  isVariationMatchingLatestPreset,
  resolveEffectiveRecommendedVariation,
} from '../../config/staticTrainingVariationTypes';
import {
  type StaticTrainingPackSummary,
  hasAnyRankTag,
  normalizeRankLabel,
} from './staticTrainingPackFilterLogic';

export interface StaticTrainingPackFolderGroupItemProps {
  isLight: boolean;
  applyNewKevpertBind: boolean;
  packs: StaticTrainingPackSummary[];
  selectedUuid?: string | null;
  onSelectPack: (uuid: string) => void;
  onHoverDesc: (desc: string | null) => void;
}

export const StaticTrainingPackFolderGroupItem: React.FC<
  StaticTrainingPackFolderGroupItemProps
> = React.memo(
  ({
    isLight,
    applyNewKevpertBind,
    packs,
    selectedUuid,
    onSelectPack,
    onHoverDesc,
  }) => {
    return (
      <div className="flex flex-col gap-1.5 p-2 overflow-y-auto grow min-h-0">
        {packs.map((pack) => {
          const isSelected = pack.uuid === selectedUuid;
          const effectiveRec = resolveEffectiveRecommendedVariation(
            pack.recommendedVariation,
            applyNewKevpertBind
          );
          const hasRecommendedVariance = Boolean(effectiveRec);
          const matchesLatest = isVariationMatchingLatestPreset(effectiveRec);
          const displayRank = hasAnyRankTag(pack)
            ? normalizeRankLabel(pack.rankTier) || pack.rankTier
            : null;

          return (
            <button
              key={pack.uuid}
              type="button"
              onClick={() => onSelectPack(pack.uuid)}
              onMouseEnter={() =>
                onHoverDesc(
                  `${pack.title} — ${pack.itemCount} shots (${
                    pack.description || 'No description'
                  })`
                )
              }
              onMouseLeave={() => onHoverDesc(null)}
              className={`flex flex-col gap-1 p-2 text-left transition-all border cursor-pointer ${UI_RADIUS.md} ${
                isSelected
                  ? isLight
                    ? 'bg-white border-neutral-900 shadow-xs text-neutral-900'
                    : 'bg-neutral-800 border-neutral-200 shadow-sm text-white'
                  : isLight
                    ? 'bg-white/60 hover:bg-white border-neutral-200/80 text-neutral-800'
                    : 'bg-neutral-850/60 hover:bg-neutral-800/80 border-neutral-800 text-neutral-200'
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-xs font-bold truncate">{pack.title}</span>
                <Badge
                  variant={
                    hasRecommendedVariance
                      ? matchesLatest
                        ? 'info'
                        : 'purple'
                      : isSelected
                        ? 'default'
                        : 'neutral'
                  }
                  size="sm"
                  isLight={isLight}
                  className="text-[9px] shrink-0"
                >
                  {pack.itemCount} {pack.itemCount === 1 ? 'Shot' : 'Shots'}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-[10px] truncate ${
                    isLight ? 'text-neutral-500' : 'text-neutral-400'
                  }`}
                >
                  {pack.description || 'No description'}
                </span>
                {displayRank && (
                  <span className="text-[9px] font-mono opacity-65 shrink-0">
                    {displayRank}
                  </span>
                )}
              </div>
            </button>
          );
        })}

        {packs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center px-3 opacity-60">
            <Target className="h-6 w-6 mb-2" />
            <span className="text-xs font-medium">No Matching Training Packs</span>
            <span className="text-[10px] mt-0.5">
              Switch folder tag or import .Tem / .RCSPack / .zip
            </span>
          </div>
        )}
      </div>
    );
  }
);
StaticTrainingPackFolderGroupItem.displayName = 'StaticTrainingPackFolderGroupItem';
