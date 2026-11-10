import React from 'react';
import { Layers, Sparkles } from 'lucide-react';
import { quickNotification } from '../../../ui-core/stores/quickNotificationStore';
import { useReviewLedgerStore } from './reviewLedgerStore';
import type { ReviewTriageBucketId, SurfaceVariantReviewUnit } from './reviewTypes';

export interface RapidReviewBucketFilterStripProps {
  bucketCounts: Record<'all' | ReviewTriageBucketId, number>;
  isLight: boolean;
}

export interface RapidReviewSpotCheckStripProps {
  activeUnitKey: string;
  templateStaleCount: number;
  samples: SurfaceVariantReviewUnit[];
}

const BUCKET_META: Array<{
  id: 'all' | ReviewTriageBucketId;
  shortLabel: string;
  badgeDot: string;
  activeClass: string;
  title: string;
}> = [
  {
    id: 'all',
    shortLabel: 'All Units',
    badgeDot: '[ALL]',
    activeClass: 'bg-neutral-800 text-white dark:bg-neutral-100 dark:text-neutral-950 border-neutral-700',
    title: 'Show all discovered surface & variant review units',
  },
  {
    id: 'bucket-1-visual',
    shortLabel: 'Bucket 1 · Visual/New',
    badgeDot: '[B1]',
    activeClass: 'bg-rose-500 text-white border-rose-500',
    title: 'Bucket 1: Unreviewed new surfaces, visual-stale subtree AST changes, or rejected units needing rework',
  },
  {
    id: 'bucket-2-config',
    shortLabel: 'Bucket 2 · Config/Sizing',
    badgeDot: '[B2]',
    activeClass: 'bg-amber-500 text-neutral-950 border-amber-500',
    title: 'Bucket 2: Config/Sizing overrides or deferred hold items (JSX unchanged)',
  },
  {
    id: 'bucket-3-template',
    shortLabel: 'Bucket 3 · Template-Stale',
    badgeDot: '[B3]',
    activeClass: 'bg-purple-500 text-white border-purple-500',
    title: 'Bucket 3: Surfaces unchanged locally, flagged only because Workspace Alpha 3-Stage Shell template changed',
  },
];

export const RapidReviewBucketFilterStrip: React.FC<RapidReviewBucketFilterStripProps> = React.memo(
  ({ bucketCounts, isLight }) => {
    const {
      activeBucketFilter,
      simulateTemplateStale,
      setBucketFilter,
      setSimulateTemplateStale,
    } = useReviewLedgerStore();

    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30">
          BRAVO TRIAGE
        </span>

        {BUCKET_META.map((b) => {
          const isActive = activeBucketFilter === b.id;
          const count = bucketCounts[b.id];
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
              <span className="px-1 rounded text-[10px] bg-black/15 dark:bg-white/15">
                {count}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setSimulateTemplateStale(!simulateTemplateStale)}
          title="Simulate a Workspace Alpha 3-Stage Shell template edit to test Bucket 3 Spot-Check & 1-Click Batch Approve"
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] cursor-pointer transition-colors ${
            simulateTemplateStale
              ? 'bg-purple-500/20 border-purple-500/50 text-purple-400 font-bold'
              : isLight
              ? 'bg-white border-neutral-200 text-neutral-500 hover:text-neutral-800'
              : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Layers className="h-3 w-3 text-purple-400" />
          <span>
            {simulateTemplateStale
              ? 'Alpha Shell Drift: ON'
              : 'Sim Alpha Shell Drift'}
          </span>
        </button>
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
              title={`Inspect ${rankTag} density sample: ${sample.label} (${
                Object.keys(sample.ledgerRecord?.fileVisualHashes || {}).length
              } visual files)`}
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
