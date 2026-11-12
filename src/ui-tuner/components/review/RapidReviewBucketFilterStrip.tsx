import React from 'react';
import { FastForward, Sparkles } from 'lucide-react';
import { quickNotification } from '../../../ui-core/stores/quickNotificationStore';
import { useReviewLedgerStore } from './reviewLedgerStore';
import type { ReviewQueueFilterId, SurfaceVariantReviewUnit } from './reviewTypes';

export interface RapidReviewBucketFilterStripProps {
  bucketCounts: Record<ReviewQueueFilterId, number>;
  nextUnreviewedUnit?: SurfaceVariantReviewUnit | null;
  isLight: boolean;
}

export interface RapidReviewSpotCheckStripProps {
  activeUnitKey: string;
  templateStaleCount: number;
  samples: SurfaceVariantReviewUnit[];
}

const FILTER_META: Array<{
  id: ReviewQueueFilterId;
  shortLabel: string;
  badgeDot: string;
  activeClass: string;
  title: string;
  hideWhenZero?: boolean;
}> = [
  {
    id: 'all',
    shortLabel: 'All',
    badgeDot: '[ALL]',
    activeClass:
      'bg-neutral-800 text-white dark:bg-neutral-100 dark:text-neutral-950 border-neutral-700',
    title: 'Show all 137 sequential playlist review units (#1..#137)',
  },
  {
    id: 'rejected-only',
    shortLabel: 'Rejected',
    badgeDot: '[REJ]',
    activeClass: 'bg-rose-500 text-white border-rose-500',
    title: 'Show only rejected units requiring rework',
  },
  {
    id: 'bucket-1-visual',
    shortLabel: 'Fixed / Changed',
    badgeDot: '[FIX]',
    activeClass: 'bg-sky-500 text-neutral-950 border-sky-400',
    title:
      'Show units whose code was recently fixed or modified since last review (ready to verify & approve)',
  },
  {
    id: 'bucket-2-config',
    shortLabel: 'Unreviewed / Hold',
    badgeDot: '[HOLD]',
    activeClass: 'bg-amber-500 text-neutral-950 border-amber-500',
    title: 'Show unreviewed / deferred hold queue units',
  },
  {
    id: 'reviewed-healthy',
    shortLabel: 'Approved',
    badgeDot: '[OK]',
    activeClass: 'bg-emerald-500 text-neutral-950 border-emerald-400',
    title: 'Show approved units',
  },
  {
    id: 'bucket-3-template',
    shortLabel: 'Template Drift',
    badgeDot: '[B3]',
    activeClass: 'bg-purple-500 text-white border-purple-500',
    title: 'Show surfaces affected by shared 3-Stage Shell template token changes',
    hideWhenZero: true,
  },
];

export const RapidReviewBucketFilterStrip: React.FC<RapidReviewBucketFilterStripProps> = React.memo(
  ({ bucketCounts, nextUnreviewedUnit, isLight }) => {
    const { activeBucketFilter, setBucketFilter, jumpToNextUnreviewed } = useReviewLedgerStore();

    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTER_META.map((b) => {
          const count = bucketCounts[b.id] ?? 0;
          if (b.hideWhenZero && count === 0 && activeBucketFilter !== b.id) {
            return null;
          }
          const isActive = activeBucketFilter === b.id;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setBucketFilter(b.id)}
              title={b.title}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] font-bold cursor-pointer transition-all ${
                isActive
                  ? b.activeClass
                  : isLight
                    ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-200 text-neutral-700'
                    : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-neutral-300'
              }`}
            >
              <span>{b.badgeDot}</span>
              <span>{b.shortLabel}</span>
              <span className="px-1 rounded text-[10px] bg-black/15 dark:bg-white/15">{count}</span>
            </button>
          );
        })}

        {nextUnreviewedUnit && (
          <button
            type="button"
            onClick={() => {
              const target = jumpToNextUnreviewed();
              if (target) {
                quickNotification.info(
                  `Jumped to next unreviewed unit #${target.playlistIndex}: ${target.label}`
                );
              }
            }}
            title={`Jump directly to next unreviewed / fixed-verify unit (#${nextUnreviewedUnit.playlistIndex} ${nextUnreviewedUnit.label})`}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
              isLight
                ? 'bg-sky-50 hover:bg-sky-100 border-sky-300 text-sky-800'
                : 'bg-sky-500/15 hover:bg-sky-500/25 border-sky-500/40 text-sky-300'
            }`}
          >
            <FastForward className="h-3 w-3" />
            <span>Next Unreviewed (#{nextUnreviewedUnit.playlistIndex})</span>
          </button>
        )}
      </div>
    );
  }
);

RapidReviewBucketFilterStrip.displayName = 'RapidReviewBucketFilterStrip';

export const RapidReviewSpotCheckStrip: React.FC<RapidReviewSpotCheckStripProps> = React.memo(
  ({ activeUnitKey, templateStaleCount, samples }) => {
    const { selectUnitByKey, batchApproveTemplateStale } = useReviewLedgerStore();

    if (templateStaleCount <= 0) return null;

    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-purple-400 font-bold">
          Spot-Check 3 Samples (Simplest/Med/Dense):
        </span>
        {samples.map((sample, idx) => {
          const rankTag = idx === 0 ? 'Min' : idx === 1 ? 'Med' : 'Max';
          return (
            <button
              key={sample.unitKey}
              type="button"
              onClick={() => selectUnitByKey(sample.unitKey)}
              className={`px-1.5 py-0.5 rounded border text-[10px] cursor-pointer transition-colors ${
                activeUnitKey === sample.unitKey
                  ? 'bg-purple-500 text-white border-purple-400 font-bold'
                  : 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border-purple-500/30'
              }`}
              title={`Inspect ${rankTag} density sample: ${sample.label}`}
            >
              {rankTag}:{sample.componentName.replace(/(FloatingWindow|Recipe)$/, '')}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => {
            const count = batchApproveTemplateStale();
            quickNotification.success(
              `Batch Approved all ${count} template-stale surfaces after spot-check!`
            );
          }}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500 hover:bg-purple-400 text-white text-[11px] font-bold cursor-pointer transition-all active:scale-95"
          title="Batch Approve all Bucket 3 (template-stale) surfaces in 1 click"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Batch Approve All {templateStaleCount} Template-Stale</span>
        </button>
      </div>
    );
  }
);

RapidReviewSpotCheckStrip.displayName = 'RapidReviewSpotCheckStrip';
