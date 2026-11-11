import React from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
} from 'lucide-react';
import { Badge } from '../../../ui-core/primitives/Badge';
import type { ShowcaseTab } from '../../sidebarNavConfig';
import {
  ISSUE_CODE_LABELS,
  type UnmatchedSurfaceDiagnosticItem,
} from './unmatchedSurfaceTypes';

export interface UnmatchedSurfaceRowCardProps {
  item: UnmatchedSurfaceDiagnosticItem;
  isLight: boolean;
  onSelectRecipeId?: (recipeId: string, scrollStage?: boolean) => void;
  onSelectTab?: (tab: ShowcaseTab) => void;
}

const STATUS_BADGE_CLASS: Record<UnmatchedSurfaceDiagnosticItem['status'], string> = {
  unmatched: 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/40',
  uncalibrated: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40',
  matched: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
};

export const UnmatchedSurfaceRowCard: React.FC<UnmatchedSurfaceRowCardProps> = ({
  item,
  isLight,
  onSelectRecipeId,
  onSelectTab,
}) => {
  const isFlagged = item.status !== 'matched';
  const mutedText = isLight ? 'text-neutral-600' : 'text-neutral-400';
  const chipClass = isLight
    ? 'bg-neutral-100 text-neutral-600'
    : 'bg-neutral-900 text-neutral-400';

  return (
    <div
      className={`p-3 rounded-xl border flex flex-col gap-2 transition-colors ${
        isFlagged
          ? isLight
            ? 'bg-white border-amber-300/90'
            : 'bg-neutral-950/85 border-amber-500/40'
          : isLight
          ? 'bg-white/80 border-neutral-200/80'
          : 'bg-neutral-950/50 border-neutral-800'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-extrabold uppercase border ${STATUS_BADGE_CLASS[item.status]}`}
          >
            {item.status}
          </span>
          <span className="font-mono font-bold text-xs">{item.componentName}</span>
          <span className={`text-xs ${mutedText}`}>· {item.title}</span>
          <Badge variant="neutral" size="sm" isLight={isLight}>
            {item.layer}
          </Badge>
          <span className={`text-[11px] font-mono ${mutedText}`}>
            ({item.sizingSummary})
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <code className={`px-2 py-0.5 rounded text-[10px] font-mono ${chipClass}`}>
            {item.entryFile}
          </code>
          {item.recipeJumpId && (onSelectRecipeId || onSelectTab) && (
            <button
              type="button"
              onClick={() => {
                if (onSelectRecipeId && item.recipeJumpId) {
                  onSelectRecipeId(item.recipeJumpId, true);
                } else if (onSelectTab) {
                  onSelectTab('recipes');
                }
              }}
              className={[
                'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-bold',
                'bg-amber-500/20 hover:bg-amber-500/30 text-amber-600 dark:text-amber-300',
                'border border-amber-500/40 cursor-pointer transition-colors',
              ].join(' ')}
            >
              <span>Open in 6A</span>
              <ArrowUpRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {item.issues.map((issueCode) => (
          <span
            key={issueCode}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-rose-500/15 text-rose-600 dark:text-rose-300 border border-rose-500/30"
          >
            <AlertTriangle className="h-2.5 w-2.5" />
            <span>{ISSUE_CODE_LABELS[issueCode]}</span>
          </span>
        ))}
        {item.passedChecks.map((checkLabel) => (
          <span
            key={checkLabel}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono ${chipClass}`}
          >
            <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
            <span>{checkLabel}</span>
          </span>
        ))}
      </div>

      {item.followUpTargets.length > 0 && (
        <div
          className={`text-[11px] font-mono flex flex-col gap-0.5 pt-1 border-t ${
            isLight
              ? 'border-amber-200/70 text-amber-800'
              : 'border-amber-500/20 text-amber-300/90'
          }`}
        >
          {item.followUpTargets.map((target) => (
            <div key={target}>Follow-up: {target}</div>
          ))}
        </div>
      )}
    </div>
  );
};
