import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileJson,
  FileText,
  RotateCcw,
  X,
} from 'lucide-react';
import { CodeBlock } from '../../CodeBlock';
import { resetRuntimeSurfaceCalibrationOverrides } from '../../../ui-core/manifest/surfaceCalibration';
import { quickNotification } from '../../../ui-core/stores/quickNotificationStore';
import {
  buildReviewBundlePayload,
  formatCompactIndexRanges,
  formatReviewBundleMarkdown,
} from './alphaBravoRootCauseTriage';
import {
  collectTunerExportDiffSnapshot,
  computeExportSizeTierMetrics,
  subscribeTunerDiffChanges,
  triggerExportJsonDownload,
} from './exportDiffAndSizeTiering';
import { useReviewLedgerStore } from './reviewLedgerStore';
import type { SurfaceVariantReviewUnit } from './reviewTypes';

export interface ReviewBundleExporterModalProps {
  isOpen: boolean;
  onClose: () => void;
  units: SurfaceVariantReviewUnit[];
  isLight?: boolean;
}

export const ReviewBundleExporterModal: React.FC<ReviewBundleExporterModalProps> = ({
  isOpen,
  onClose,
  units,
  isLight = false,
}) => {
  const { decisionsMap, selectUnitByKey, resetRuntimeDecisions } = useReviewLedgerStore();
  const [formatMode, setFormatMode] = useState<'markdown' | 'json'>('markdown');
  const [copiedBundle, setCopiedBundle] = useState(false);
  const [downloadedBundle, setDownloadedBundle] = useState(false);
  const [diffVersion, setDiffVersion] = useState(0);

  useEffect(() => {
    return subscribeTunerDiffChanges(() => {
      setDiffVersion((v) => v + 1);
    });
  }, []);

  const diffSnapshot = useMemo(() => {
    void diffVersion;
    void isOpen;
    return collectTunerExportDiffSnapshot();
  }, [diffVersion, isOpen]);

  const payload = useMemo(
    () => buildReviewBundlePayload({ units, decisionsMap, diffSnapshot }),
    [units, decisionsMap, diffSnapshot]
  );

  const jsonExportText = useMemo(() => JSON.stringify(payload, null, 2), [payload]);
  const markdownExportText = useMemo(
    () => formatReviewBundleMarkdown(payload, units),
    [payload, units]
  );

  const exportText = formatMode === 'json' ? jsonExportText : markdownExportText;
  const sizeTier = useMemo(() => computeExportSizeTierMetrics(exportText), [exportText]);
  const isCopyRecommended = sizeTier.recommendedAction === 'copy-clipboard';

  if (!isOpen) return null;

  const handleCopyBundle = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(exportText).catch(() => {});
    }
    setCopiedBundle(true);
    window.setTimeout(() => setCopiedBundle(false), 2000);
    quickNotification.success(
      `Copied Triage Summary (${formatMode.toUpperCase()} · ${sizeTier.formattedBadge})!`
    );
  };

  const handleDownloadJsonBundle = () => {
    const fileName = triggerExportJsonDownload(
      jsonExportText,
      `rc-ui-tuner-approval-bundle-${new Date().toISOString().slice(0, 10)}.json`
    );
    setDownloadedBundle(true);
    window.setTimeout(() => setDownloadedBundle(false), 2000);
    quickNotification.success(`Downloaded ${fileName} (${sizeTier.formattedBadge})!`);
  };

  const rejectedUnits = units.filter((u) => u.status === 'rejected');
  const pendingVerifyUnits = units.filter(
    (u) => u.status === 'pending' || (u.status !== 'rejected' && u.changedSubtreeFiles.length > 0)
  );
  const approvedIndices = units.filter((u) => u.status === 'approved').map((u) => u.playlistIndex);

  const summaryCards = [
    [
      'APPROVED',
      `${payload.summary.approvedCount} / ${payload.summary.totalUnits}`,
      isLight
        ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
        : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300',
    ],
    [
      'REJECTED',
      String(payload.summary.rejectedCount),
      isLight
        ? 'bg-rose-50/70 border-rose-200 text-rose-900'
        : 'bg-rose-500/10 border-rose-500/25 text-rose-300',
    ],
    [
      'FIXED / VERIFY',
      String(pendingVerifyUnits.length),
      isLight
        ? 'bg-sky-50/70 border-sky-200 text-sky-900'
        : 'bg-sky-500/10 border-sky-500/25 text-sky-300',
    ],
    [
      'UNREVIEWED HOLD',
      `${payload.summary.deferredCount} (omitted)`,
      isLight
        ? 'bg-amber-50/70 border-amber-200 text-amber-900'
        : 'bg-amber-500/10 border-amber-500/25 text-amber-300',
    ],
    [
      'EXPORT SIZE',
      `${sizeTier.lineCount}L · ${(sizeTier.byteCount / 1024).toFixed(2)}KB`,
      isLight
        ? 'bg-purple-50/70 border-purple-200 text-purple-900'
        : 'bg-purple-500/10 border-purple-500/25 text-purple-300',
    ],
  ] as const;

  const secondaryBtnCls = isLight
    ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
    : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-200';

  return (
    <div
      className="fixed inset-0 z-[650] flex items-center justify-center p-4 md:p-6 bg-black/65 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-4xl max-h-[86vh] rounded-2xl border flex flex-col overflow-hidden shadow-2xl ${
          isLight
            ? 'bg-white border-neutral-200 text-neutral-900'
            : 'bg-neutral-950 border-neutral-800 text-neutral-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`px-5 py-3.5 border-b flex items-center justify-between gap-3 shrink-0 ${
            isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-900/90 border-neutral-800'
          }`}
        >
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="px-2 py-0.5 rounded-md text-xs font-mono font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30">
              COMPACT TRIAGE EXPORTER
            </span>
            <h3 className="text-sm font-bold font-mono">
              Rejected &amp; Approved Summary (Untouched Hold Omitted)
            </h3>
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border ${
                isCopyRecommended
                  ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/35'
                  : 'bg-sky-500/15 text-sky-400 border-sky-500/35'
              }`}
              title={sizeTier.reason}
            >
              {sizeTier.formattedBadge}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg opacity-70 hover:opacity-100 cursor-pointer"
            title="Close Triage Exporter (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex flex-col gap-4 flex-1 min-h-0 text-xs font-mono">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {summaryCards.map(([label, value, tone]) => (
              <div key={label} className={`p-2.5 rounded-xl border flex flex-col gap-0.5 ${tone}`}>
                <span className="text-[10px] opacity-75">{label}</span>
                <span className="text-sm font-bold truncate" title={value}>
                  {value}
                </span>
              </div>
            ))}
          </div>

          <div
            className={`p-3 rounded-xl border flex flex-col gap-2 ${
              isLight
                ? 'bg-neutral-50 border-neutral-200 text-neutral-800'
                : 'bg-neutral-900/70 border-neutral-800 text-neutral-200'
            }`}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-bold text-[11px]">
                Approved Index Ranges ({approvedIndices.length}):{' '}
                <span className="text-emerald-500">
                  {formatCompactIndexRanges(approvedIndices)}
                </span>
              </span>
              {pendingVerifyUnits.length > 0 && (
                <span className="text-[11px] text-sky-400 font-bold">
                  Fixed / Ready to Verify:{' '}
                  {pendingVerifyUnits.map((u) => `#${u.playlistIndex}`).join(', ')}
                </span>
              )}
            </div>

            {rejectedUnits.length === 0 && pendingVerifyUnits.length === 0 ? (
              <div className="flex items-center gap-2 text-[11px] text-emerald-500">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span>No rejected or pending-verify units in queue.</span>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto pr-1">
                {[...rejectedUnits, ...pendingVerifyUnits].map((u) => {
                  const isRej = u.status === 'rejected';
                  return (
                    <div
                      key={u.unitKey}
                      className={`px-2.5 py-1.5 rounded-lg border flex items-start justify-between gap-2 ${
                        isRej
                          ? isLight
                            ? 'bg-white border-rose-200'
                            : 'bg-neutral-950/90 border-rose-500/35'
                          : isLight
                            ? 'bg-white border-sky-200'
                            : 'bg-neutral-950/90 border-sky-500/35'
                      }`}
                    >
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              isRej ? 'bg-rose-500 text-white' : 'bg-sky-500 text-neutral-950'
                            }`}
                          >
                            {isRej ? 'REJECTED' : 'FIXED / VERIFY'} #{u.playlistIndex}
                          </span>
                          <span className="font-bold truncate">{u.label}</span>
                          <span className="text-[10px] opacity-60 truncate">({u.unitKey})</span>
                        </div>
                        {u.note && (
                          <p className="text-[11px] opacity-85 whitespace-pre-wrap break-words">
                            {u.note}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          selectUnitByKey(u.unitKey);
                          onClose();
                        }}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-bold shrink-0 cursor-pointer ${secondaryBtnCls}`}
                        title={`Jump to #${u.playlistIndex} on stage`}
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>Jump #{u.playlistIndex}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {(['markdown', 'json'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setFormatMode(mode)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
                    formatMode === mode
                      ? 'bg-amber-500 text-neutral-950 border-amber-500'
                      : secondaryBtnCls
                  }`}
                >
                  {mode === 'markdown' ? (
                    <FileText className="h-3.5 w-3.5" />
                  ) : (
                    <FileJson className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {mode === 'markdown' ? 'Compact Markdown Summary' : 'Full JSON Payload'}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  resetRuntimeDecisions();
                  resetRuntimeSurfaceCalibrationOverrides();
                  quickNotification.info(
                    'Reset local browser overrides back to repository ledger baseline.'
                  );
                }}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] cursor-pointer transition-colors ${secondaryBtnCls}`}
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset Local Cache</span>
              </button>

              <button
                type="button"
                onClick={handleCopyBundle}
                title={sizeTier.reason}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
                  copiedBundle
                    ? 'bg-emerald-500 text-neutral-950 border-emerald-400'
                    : 'bg-amber-500 hover:bg-amber-400 text-neutral-950 border-amber-400 shadow-xs'
                }`}
              >
                {copiedBundle ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>Copied ({sizeTier.formattedBadge})</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Summary ({sizeTier.lineCount}L)</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadJsonBundle}
                title={sizeTier.reason}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
                  downloadedBundle
                    ? 'bg-emerald-500 text-neutral-950 border-emerald-400'
                    : secondaryBtnCls
                }`}
              >
                {downloadedBundle ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>Downloaded .json!</span>
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" />
                    <span>Download .json</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <CodeBlock
            title={
              formatMode === 'markdown'
                ? `Compact Triage Summary (${sizeTier.formattedBadge})`
                : `Full JSON Payload (${sizeTier.formattedBadge})`
            }
            language={formatMode === 'markdown' ? 'markdown' : 'json'}
            isLight={isLight}
            code={exportText}
          />
        </div>
      </div>
    </div>
  );
};
