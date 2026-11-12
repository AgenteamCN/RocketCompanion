import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Copy,
  Download,
  MessageSquare,
  XCircle,
} from 'lucide-react';
import { quickNotification } from '../../../ui-core/stores/quickNotificationStore';
import { buildReviewBundlePayload, formatReviewBundleMarkdown } from './alphaBravoRootCauseTriage';
import {
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
  filterReviewUnitsByQueueFilter,
  findUnitIndexByKeyOrSurface,
  pickRepresentativeTemplateStaleSamples,
} from './reviewLedgerAdapter';
import { ReviewBundleExporterModal } from './ReviewBundleExporterModal';
import { useReviewLedgerStore } from './reviewLedgerStore';
import type { ReviewQueueFilterId } from './reviewTypes';

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
    const [copiedQuick, setCopiedQuick] = useState(false);
    const [diffTick, setDiffTick] = useState(0);
    const noteInputRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
      return subscribeTunerDiffChanges(() => {
        setDiffTick((t) => t + 1);
      });
    }, []);

    const diffSnapshot = useMemo(() => {
      void diffTick;
      return collectTunerExportDiffSnapshot();
    }, [diffTick]);

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
      const counts: Record<ReviewQueueFilterId, number> = {
        all: allUnits.length,
        'rejected-only': 0,
        'bucket-1-visual': 0,
        'bucket-2-config': 0,
        'bucket-3-template': 0,
        'reviewed-healthy': 0,
      };
      for (const u of allUnits) {
        if (u.status === 'rejected') counts['rejected-only'] += 1;
        if (u.status === 'pending' || u.changedSubtreeFiles.length > 0) {
          counts['bucket-1-visual'] += 1;
        }
        if (u.status === 'deferred' && u.changedSubtreeFiles.length === 0) {
          counts['bucket-2-config'] += 1;
        }
        if (u.bucket === 'bucket-3-template') counts['bucket-3-template'] += 1;
        if (u.status === 'approved') counts['reviewed-healthy'] += 1;
      }
      return counts;
    }, [allUnits]);

    const filteredQueue = useMemo(
      () => filterReviewUnitsByQueueFilter(allUnits, activeBucketFilter),
      [allUnits, activeBucketFilter]
    );

    const activeUnit = useMemo(() => {
      const matchIdx = findUnitIndexByKeyOrSurface(allUnits, activeUnitKey);
      return (matchIdx >= 0 ? allUnits[matchIdx] : undefined) || filteredQueue[0] || allUnits[0];
    }, [allUnits, filteredQueue, activeUnitKey]);

    const nextUnreviewedUnit = useMemo(() => {
      if (allUnits.length === 0) return null;
      const currIdx = Math.max(0, findUnitIndexByKeyOrSurface(allUnits, activeUnitKey));
      for (let offset = 1; offset <= allUnits.length; offset++) {
        const cand = allUnits[(currIdx + offset) % allUnits.length];
        if (cand && (cand.status === 'deferred' || cand.status === 'pending')) {
          return cand;
        }
      }
      return null;
    }, [allUnits, activeUnitKey]);

    const exportMarkdown = useMemo(() => {
      const payload = buildReviewBundlePayload({
        units: allUnits,
        decisionsMap,
        diffSnapshot,
      });
      return formatReviewBundleMarkdown(payload, allUnits);
    }, [allUnits, decisionsMap, diffSnapshot]);

    const exportMetrics = useMemo(
      () => computeExportSizeTierMetrics(exportMarkdown),
      [exportMarkdown]
    );

    const templateStaleSamples = useMemo(
      () => pickRepresentativeTemplateStaleSamples(allUnits),
      [allUnits]
    );

    const triggerDecision = (status: 'approved' | 'rejected' | 'deferred') => {
      if (!activeUnit) return;
      const next = setDecision({
        unitKey: activeUnit.unitKey,
        status,
        advanceToNext: true,
      });
      const msg = `${status.toUpperCase()} #${activeUnit.playlistIndex} · ${
        activeUnit.label
      }${next ? ` -> #${next.playlistIndex} ${next.label}` : ''}`;
      if (status === 'approved') quickNotification.success(msg);
      else if (status === 'rejected') quickNotification.warning(msg);
      else quickNotification.info(msg);
    };

    const handleQuickCopyTriage = () => {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(exportMarkdown).catch(() => {});
      }
      setCopiedQuick(true);
      window.setTimeout(() => setCopiedQuick(false), 1800);
      quickNotification.success(`Copied Triage Summary (${exportMetrics.formattedBadge})!`);
    };

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
          const status = keyLower === 'a' ? 'approved' : keyLower === 'r' ? 'rejected' : 'deferred';
          triggerDecision(status);
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
    }, [activeUnit, setDecision]);

    if (!activeUnit) return null;

    const currentQueueIdx = Math.max(
      0,
      findUnitIndexByKeyOrSurface(filteredQueue, activeUnit.unitKey)
    );

    const statusBadgeText =
      activeUnit.status === 'pending' ? 'FIXED / VERIFY' : activeUnit.status.toUpperCase();

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
              nextUnreviewedUnit={nextUnreviewedUnit}
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
                title="Reject current unit & advance to next (Shortcut: R)"
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
                <span>Hold [D]</span>
              </button>

              <button
                type="button"
                onClick={handleQuickCopyTriage}
                title={`1-Click Copy compact Markdown triage summary (${exportMetrics.formattedBadge})`}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-all active:scale-95 ${
                  copiedQuick
                    ? 'bg-emerald-500 text-neutral-950 border-emerald-400'
                    : 'bg-amber-500 hover:bg-amber-400 text-neutral-950 border-amber-400'
                }`}
              >
                {copiedQuick ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>Copied ({exportMetrics.lineCount}L)</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Triage ({exportMetrics.lineCount}L)</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setExporterModalOpen(true)}
                title="Open Triage Summary & Export Modal"
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-all active:scale-95 ${
                  isLight
                    ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
                    : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-200'
                }`}
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export</span>
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
                  title="Previous unit in active filter"
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
                  title="Next unit in active filter"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>

                <span className="text-[11px] font-bold truncate max-w-[320px]">
                  [#{activeUnit.playlistIndex}/{allUnits.length}
                  {activeBucketFilter !== 'all'
                    ? ` · ${currentQueueIdx + 1}/${Math.max(1, filteredQueue.length)}`
                    : ''}
                  ] {activeUnit.label}
                </span>

                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${
                    activeUnit.status === 'approved'
                      ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-500'
                      : activeUnit.status === 'rejected'
                        ? 'bg-rose-500/15 border-rose-500/35 text-rose-500'
                        : activeUnit.status === 'pending'
                          ? 'bg-sky-500/15 border-sky-500/35 text-sky-400'
                          : isLight
                            ? 'bg-white border-neutral-200 text-neutral-600'
                            : 'bg-neutral-950 border-neutral-800 text-neutral-400'
                  }`}
                >
                  {statusBadgeText}
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

              <div className="flex items-start gap-1.5 flex-1 min-w-[240px] max-w-md">
                <MessageSquare className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-1.5" />
                <textarea
                  ref={noteInputRef}
                  rows={
                    activeUnit.note.includes('\n')
                      ? Math.min(4, activeUnit.note.split('\n').length)
                      : 1
                  }
                  value={activeUnit.note}
                  onChange={(e) => updateNote(activeUnit.unitKey, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.blur();
                      quickNotification.success(
                        `Saved note for #${activeUnit.playlistIndex} ${activeUnit.label}`
                      );
                    }
                  }}
                  placeholder="Press [Space] to type triage note (Shift+Enter for newline, Enter to save)..."
                  className={`w-full px-2.5 py-1 rounded-lg border text-[11px] font-mono outline-none transition-colors resize-y min-h-[26px] max-h-28 leading-relaxed ${
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
