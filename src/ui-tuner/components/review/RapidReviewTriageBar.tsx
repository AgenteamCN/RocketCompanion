import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Download,
  MessageSquare,
  XCircle,
} from 'lucide-react';
import { quickNotification } from '../../../ui-core/stores/quickNotificationStore';
import {
  buildApprovalMessageWithDiffs,
  collectTunerExportDiffSnapshot,
  computeExportSizeTierMetrics,
  subscribeTunerDiffChanges,
} from './exportDiffAndSizeTiering';
import {
  RapidReviewBucketFilterStrip,
  RapidReviewSpotCheckStrip,
} from './RapidReviewBucketFilterStrip';
import {
  buildAllReviewUnits,
  findUnitIndexByKeyOrSurface,
  pickRepresentativeTemplateStaleSamples,
} from './reviewLedgerAdapter';
import { ReviewBundleExporterModal } from './ReviewBundleExporterModal';
import { useReviewLedgerStore } from './reviewLedgerStore';
import type { ReviewTriageBucketId } from './reviewTypes';

export interface RapidReviewTriageBarProps {
  isLight?: boolean;
}

export const RapidReviewTriageBar: React.FC<RapidReviewTriageBarProps> = React.memo(
  ({ isLight = false }) => {
    const {
      decisionsMap,
      registeredUnitsMap,
      activeUnitKey,
      playlistScope,
      activeBucketFilter,
      simulateTemplateStale,
      isExporterModalOpen,
      setDecision,
      updateNote,
      stepQueue,
      setExporterModalOpen,
    } = useReviewLedgerStore();

    const [isCollapsed, setIsCollapsed] = useState(false);
    const [diffTick, setDiffTick] = useState(0);
    const noteInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
      return subscribeTunerDiffChanges(() => {
        setDiffTick((t) => t + 1);
      });
    }, []);

    const diffSnapshot = useMemo(() => {
      void diffTick;
      return collectTunerExportDiffSnapshot();
    }, [diffTick]);

    const diffSizeMetrics = useMemo(() => {
      const serialized = JSON.stringify(diffSnapshot, null, 2);
      return computeExportSizeTierMetrics(serialized);
    }, [diffSnapshot]);

    const allUnits = useMemo(
      () =>
        buildAllReviewUnits({
          decisionsMap,
          registeredUnitsMap,
          globalTemplateStaleOverride: simulateTemplateStale,
          activeUnitKey,
          playlistScope,
        }),
      [decisionsMap, registeredUnitsMap, simulateTemplateStale, activeUnitKey, playlistScope]
    );

    const bucketCounts = useMemo(() => {
      const counts: Record<'all' | ReviewTriageBucketId, number> = {
        all: allUnits.length,
        'bucket-1-visual': 0,
        'bucket-2-config': 0,
        'bucket-3-template': 0,
        'reviewed-healthy': 0,
      };
      for (const u of allUnits) {
        counts[u.bucket] += 1;
      }
      return counts;
    }, [allUnits]);

    const filteredQueue = useMemo(() => {
      if (activeBucketFilter === 'all') return allUnits;
      return allUnits.filter((u) => u.bucket === activeBucketFilter);
    }, [allUnits, activeBucketFilter]);

    const activeUnit = useMemo(() => {
      const matchIdx = findUnitIndexByKeyOrSurface(allUnits, activeUnitKey);
      return (
        (matchIdx >= 0 ? allUnits[matchIdx] : undefined) ||
        filteredQueue[0] ||
        allUnits[0]
      );
    }, [allUnits, filteredQueue, activeUnitKey]);

    const templateStaleSamples = useMemo(
      () => pickRepresentativeTemplateStaleSamples(allUnits),
      [allUnits]
    );

    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable)
        ) {
          if (e.key === 'Escape') target.blur();
          return;
        }
        if (!activeUnit) return;

        const keyLower = e.key.toLowerCase();
        if (keyLower === 'a' || keyLower === 'r' || keyLower === 'd') {
          e.preventDefault();
          const status =
            keyLower === 'a' ? 'approved' : keyLower === 'r' ? 'rejected' : 'deferred';
          const next = setDecision({
            unitKey: activeUnit.unitKey,
            status,
            advanceToNext: true,
          });
          const approvalMsg = buildApprovalMessageWithDiffs({
            baseNote: activeUnit.note,
            surfaceId: activeUnit.surfaceId,
            diffSnapshot,
          });
          const labelMsg = `${status.toUpperCase()} · ${
            activeUnit.label
          } (${approvalMsg})${next ? ` -> Next: ${next.label}` : ''}`;
          if (status === 'approved') quickNotification.success(labelMsg);
          else if (status === 'rejected') quickNotification.warning(labelMsg);
          else quickNotification.info(labelMsg);
        } else if (e.key === ' ') {
          e.preventDefault();
          setIsCollapsed(false);
          window.setTimeout(() => {
            noteInputRef.current?.focus();
            noteInputRef.current?.select();
          }, 20);
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeUnit, diffSnapshot, setDecision]);

    if (!activeUnit) return null;

    const currentQueueIdx = Math.max(
      0,
      findUnitIndexByKeyOrSurface(filteredQueue, activeUnit.unitKey)
    );

    const triggerDecision = (status: 'approved' | 'rejected' | 'deferred') => {
      const next = setDecision({
        unitKey: activeUnit.unitKey,
        status,
        advanceToNext: true,
      });
      const approvalMsg = buildApprovalMessageWithDiffs({
        baseNote: activeUnit.note,
        surfaceId: activeUnit.surfaceId,
        diffSnapshot,
      });
      const msg = `${status.toUpperCase()} · ${activeUnit.label} (${approvalMsg})${
        next ? ` -> ${next.label}` : ''
      }`;
      if (status === 'approved') quickNotification.success(msg);
      else if (status === 'rejected') quickNotification.warning(msg);
      else quickNotification.info(msg);
    };

    const totalDiffCount =
      diffSnapshot.totalCalibrationSurfaceCount + diffSnapshot.totalStoreDiffCount;

    return (
      <>
        <div
          className={`sticky bottom-0 z-30 border-t transition-all font-mono text-xs ${
            isLight
              ? 'bg-white/95 border-neutral-200 text-neutral-900 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]'
              : 'bg-neutral-950/95 border-neutral-800 text-neutral-100 shadow-[0_-4px_20px_rgba(0,0,0,0.45)]'
          } backdrop-blur-md`}
        >
          <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-2">
            <RapidReviewBucketFilterStrip
              bucketCounts={bucketCounts}
              isLight={isLight}
            />

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => triggerDecision('approved')}
                title="Approve current unit & advance to next (Shortcut: A)"
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-all active:scale-95 ${
                  activeUnit.status === 'approved'
                    ? 'bg-emerald-500 text-neutral-950 border-emerald-400'
                    : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-500 border-emerald-500/35'
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Approve [A]</span>
              </button>

              <button
                type="button"
                onClick={() => triggerDecision('rejected')}
                title="Instant Reject current unit & advance to next without mandatory note (Shortcut: R)"
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-all active:scale-95 ${
                  activeUnit.status === 'rejected'
                    ? 'bg-rose-500 text-white border-rose-400'
                    : 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-500 border-rose-500/35'
                }`}
              >
                <XCircle className="h-3.5 w-3.5" />
                <span>Reject [R]</span>
              </button>

              <button
                type="button"
                onClick={() => triggerDecision('deferred')}
                title="Defer current unit to Hold queue & advance to next (Shortcut: D)"
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-all active:scale-95 ${
                  activeUnit.status === 'deferred'
                    ? 'bg-amber-500 text-neutral-950 border-amber-400'
                    : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-500 border-amber-500/35'
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                <span>Defer [D]</span>
              </button>

              <button
                type="button"
                onClick={() => setExporterModalOpen(true)}
                title={diffSizeMetrics.reason}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-neutral-950 border-amber-400 cursor-pointer transition-all active:scale-95"
              >
                <Download className="h-3.5 w-3.5" />
                <span>
                  Export Bundle ({totalDiffCount} Diffs · {diffSizeMetrics.formattedBadge} ·{' '}
                  {diffSizeMetrics.recommendedAction === 'copy-clipboard'
                    ? 'Copy'
                    : 'Download .json'}
                  )
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIsCollapsed((v) => !v)}
                className={`p-1 rounded-lg border cursor-pointer ${
                  isLight
                    ? 'bg-neutral-100 border-neutral-200 text-neutral-600'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                }`}
                title={isCollapsed ? 'Expand Triage Details' : 'Collapse Triage Details'}
              >
                {isCollapsed ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {!isCollapsed && (
            <div
              className={`px-4 py-2 border-t flex flex-wrap items-center justify-between gap-2.5 ${
                isLight
                  ? 'bg-neutral-50/90 border-neutral-200/80'
                  : 'bg-neutral-900/60 border-neutral-800/80'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                <button
                  type="button"
                  onClick={() => stepQueue(-1)}
                  className={`p-1 rounded-lg border cursor-pointer ${
                    isLight
                      ? 'bg-white hover:bg-neutral-100 border-neutral-200'
                      : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800'
                  }`}
                  title="Previous unit in active bucket"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => stepQueue(1)}
                  className={`p-1 rounded-lg border cursor-pointer ${
                    isLight
                      ? 'bg-white hover:bg-neutral-100 border-neutral-200'
                      : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800'
                  }`}
                  title="Next unit in active bucket"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>

                <span className="text-[11px] font-bold truncate max-w-[300px]">
                  [#{currentQueueIdx + 1}/{Math.max(1, filteredQueue.length)}]{' '}
                  {activeUnit.label}
                </span>

                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border truncate max-w-[220px] ${
                    isLight
                      ? 'bg-white border-neutral-200 text-neutral-600'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400'
                  }`}
                  title={activeUnit.unitKey}
                >
                  {activeUnit.unitKey}
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-1 min-w-[240px] max-w-md">
                <MessageSquare className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <input
                  ref={noteInputRef}
                  type="text"
                  value={activeUnit.note}
                  onChange={(e) => updateNote(activeUnit.unitKey, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur();
                      quickNotification.success(`Saved note for ${activeUnit.label}`);
                    }
                  }}
                  placeholder="Press [Space] to type optional 1-line triage note (Enter to save)..."
                  className={`w-full px-2.5 py-1 rounded-lg border text-[11px] font-mono outline-none transition-colors ${
                    isLight
                      ? 'bg-white border-neutral-300 focus:border-amber-500 text-neutral-900 placeholder:text-neutral-400'
                      : 'bg-neutral-950 border-neutral-800 focus:border-amber-500 text-neutral-100 placeholder:text-neutral-500'
                  }`}
                />
              </div>

              <RapidReviewSpotCheckStrip
                activeUnitKey={activeUnit.unitKey}
                templateStaleCount={bucketCounts['bucket-3-template']}
                samples={templateStaleSamples}
              />
            </div>
          )}
        </div>

        <ReviewBundleExporterModal
          isOpen={isExporterModalOpen}
          onClose={() => setExporterModalOpen(false)}
          units={allUnits}
          isLight={isLight}
        />
      </>
    );
  }
);

RapidReviewTriageBar.displayName = 'RapidReviewTriageBar';
