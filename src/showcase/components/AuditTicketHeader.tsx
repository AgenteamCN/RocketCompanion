import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Flag,
  Target,
  XCircle,
} from 'lucide-react';
import { UI_APPROVAL_LEDGER } from '../../ui-core/manifest/surfaceCalibration';
import { quickNotification } from '../../ui-core/stores/quickNotificationStore';
import {
  buildUnitKey,
  classifySurfaceBucket,
  resolveCanonicalSurfaceId,
} from './review/reviewLedgerAdapter';
import { useReviewLedgerStore } from './review/reviewLedgerStore';

export interface AuditTicketHeaderProps {
  index?: number; label: string;
  description?: string;
  referenceCode: string;
  componentName: string;
  sourceFile: string;
  subViewFile?: string;
  stateId: string;
  activeProps?: Record<string, unknown>;
  badgeColor?: 'amber' | 'emerald' | 'rose' | 'sky' | 'indigo' | 'purple';
  tunerStatus?: 'dedicated-tuner' | 'direct-store' | 'unreviewed';
  isLight?: boolean;
}

const COLOR_STYLES: Record<
  NonNullable<AuditTicketHeaderProps['badgeColor']>,
  string
> = {
  amber: 'text-amber-500 bg-amber-500/10 border-amber-500/25',
  emerald: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/25',
  rose: 'text-rose-500 bg-rose-500/10 border-rose-500/25',
  sky: 'text-sky-500 bg-sky-500/10 border-sky-500/25',
  indigo: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/25',
  purple: 'text-purple-500 bg-purple-500/10 border-purple-500/25',
};

export function formatHostSourcePath(rawPath?: string): string {
  if (!rawPath) return '';
  if (rawPath.startsWith('src/')) return rawPath;
  return `src/ui-core/${rawPath.replace(/^\.?\//, '')}`;
}

export const AuditTicketHeader: React.FC<AuditTicketHeaderProps> = React.memo(
  (props) => {
    const {
      index,
      label,
      description,
      referenceCode,
      componentName,
      sourceFile: rawSourceFile,
      subViewFile: rawSubViewFile,
      stateId,
      activeProps,
      badgeColor = 'amber',
      tunerStatus,
      isLight = false,
    } = props;
    const sourceFile = formatHostSourcePath(rawSourceFile);
    const subViewFile = rawSubViewFile ? formatHostSourcePath(rawSubViewFile) : undefined;
    const [copiedTicket, setCopiedTicket] = useState(false);
    const [copiedPath, setCopiedPath] = useState(false);

    const surfaceId = resolveCanonicalSurfaceId({
      sourceFile,
      componentName,
      stateId,
    });
    const variantId = stateId.includes(':')
      ? stateId.split(':').slice(1).join(':')
      : stateId || 'default';
    const unitKey = buildUnitKey(surfaceId, variantId);

    const {
      decisionsMap,
      activeUnitKey,
      simulateTemplateStale,
      setActiveUnit,
      selectUnitByKey,
      setDecision,
    } = useReviewLedgerStore();

    // Auto-register single-stage audit headers as the active review unit
    useEffect(() => {
      if (index === undefined || index === 1) {
        setActiveUnit({
          surfaceId,
          variantId,
          label,
          referenceCode,
          componentName,
          sourceFile,
          subViewFile,
        });
      }
    }, [
      index,
      surfaceId,
      variantId,
      label,
      referenceCode,
      componentName,
      sourceFile,
      subViewFile,
      setActiveUnit,
    ]);

    const ledgerRecord = UI_APPROVAL_LEDGER.surfaces[surfaceId];
    const activeSurfaceMatchKey = activeUnitKey.startsWith(`${surfaceId}::`)
      ? activeUnitKey
      : '';
    const runtimeDecision =
      decisionsMap[unitKey] ??
      (activeSurfaceMatchKey ? decisionsMap[activeSurfaceMatchKey] : undefined) ??
      decisionsMap[buildUnitKey(surfaceId, 'default')];
    const { status, bucket, staleReason } = classifySurfaceBucket({
      surfaceId,
      ledgerRecord,
      runtimeDecision,
      globalTemplateStaleOverride: simulateTemplateStale,
    });
    const isFocusedUnit =
      activeUnitKey === unitKey || activeUnitKey.split('::')[0] === surfaceId;

    const handleCopyPath = (e: React.MouseEvent) => {
      e.stopPropagation();
      const targetPath = subViewFile
        ? `${sourceFile} -> ${subViewFile} [${stateId}]`
        : `${sourceFile} :: ${componentName} [${stateId}]`;
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(targetPath).catch(() => {});
      }
      setCopiedPath(true);
      window.setTimeout(() => setCopiedPath(false), 1800);
      quickNotification.success(`Copied path: ${targetPath}`);
    };

    const handleCopyTicket = (e: React.MouseEvent) => {
      e.stopPropagation();
      const lines = [
        '### [UI Audit Ticket]',
        ...(referenceCode ? [`- **Surface Group**: \`${referenceCode}\``] : []),
        `- **Review Unit Key**: \`${unitKey}\` (Status: \`${status}\` · Bucket: \`${bucket}\`)`,
        `- **Target Component**: \`${componentName}\``,
        `- **Source File**: \`${sourceFile}\``,
        ...(subViewFile ? [`- **Sub-View File**: \`${subViewFile}\``] : []),
        `- **State ID**: \`${stateId}\``,
        `- **State Label**: ${label}`,
        ...(description ? [`- **State Condition**: ${description}`] : []),
        `- **Active Props / Override**: \`${JSON.stringify(activeProps ?? {})}\``,
        `- **Theme Mode**: \`${isLight ? 'light' : 'dark'}\``,
        `- **Issue Description**: ${runtimeDecision?.note || ''}`,
        '',
      ];
      const text = lines.join('\n');
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
      setCopiedTicket(true);
      window.setTimeout(() => setCopiedTicket(false), 1800);
      quickNotification.success(
        `Copied UI Audit Ticket for ${componentName} (${stateId})`
      );
    };

    const handleQuickDecision = (
      e: React.MouseEvent,
      nextStatus: 'approved' | 'rejected' | 'deferred'
    ) => {
      e.stopPropagation();
      setActiveUnit({
        surfaceId,
        variantId,
        label,
        referenceCode,
        componentName,
        sourceFile,
        subViewFile,
      });
      setDecision({
        unitKey,
        status: nextStatus,
      });
      quickNotification.info(
        `Marked ${label} as ${nextStatus.toUpperCase()}`
      );
    };

    return (
      <div
        onClick={() => {
          setActiveUnit({
            surfaceId,
            variantId,
            label,
            referenceCode,
            componentName,
            sourceFile,
            subViewFile,
          });
          selectUnitByKey(unitKey);
        }}
        className="flex flex-wrap items-center justify-between gap-2 w-full"
      >
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span
            className={`text-xs font-mono font-bold px-2 py-0.5 rounded border truncate ${COLOR_STYLES[badgeColor]}`}
            title={description || label}
          >
            {index !== undefined ? `${index}. ` : ''}
            {referenceCode ? `[${referenceCode}] ` : ''}
            {label}
          </span>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border truncate max-w-[300px] ${
              isLight
                ? 'bg-neutral-100 border-neutral-200 text-neutral-600'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400'
            }`}
            title={subViewFile ? `${sourceFile} -> ${subViewFile}` : sourceFile}
          >
            {subViewFile || sourceFile}
          </span>

          {/* 3-Layer Approval & Bucket Badge */}
          <span
            className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
              status === 'rejected'
                ? 'text-rose-500 bg-rose-500/15 border-rose-500/35'
                : status === 'deferred'
                ? 'text-amber-500 bg-amber-500/15 border-amber-500/35'
                : bucket === 'bucket-3-template'
                ? 'text-purple-400 bg-purple-500/15 border-purple-500/35'
                : 'text-emerald-500 bg-emerald-500/10 border-emerald-500/25'
            }`}
            title={`Unit: ${unitKey} | Bucket: ${bucket} (${staleReason})`}
          >
            {status === 'rejected'
              ? '[REJECTED]'
              : status === 'deferred'
              ? '[DEFERRED]'
              : bucket === 'bucket-3-template'
              ? '[TEMPLATE-STALE]'
              : '[APPROVED]'}
          </span>

          {tunerStatus && (
            <span
              className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border ${
                tunerStatus === 'dedicated-tuner'
                  ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/25'
                  : 'text-sky-500 bg-sky-500/10 border-sky-500/25'
              }`}
            >
              {tunerStatus === 'dedicated-tuner'
                ? 'Dedicated Tuner'
                : 'Direct Store Binding'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          {/* Quick Inline Triage Buttons (A / R / D) */}
          <div
            className={`inline-flex items-center rounded-md border p-0.5 gap-0.5 ${
              isFocusedUnit
                ? 'border-amber-500/60 bg-amber-500/10'
                : isLight
                ? 'border-neutral-200 bg-neutral-50'
                : 'border-neutral-800 bg-neutral-900'
            }`}
            title="Quick Triage for this SurfaceVariantUnit (Click to focus for keyboard A/R/D)"
          >
            <button
              type="button"
              onClick={(e) => handleQuickDecision(e, 'approved')}
              title="Approve this unit (A)"
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer transition-colors ${
                status === 'approved'
                  ? 'bg-emerald-500 text-neutral-950'
                  : 'text-emerald-500 hover:bg-emerald-500/15'
              }`}
            >
              <CheckCircle2 className="h-3 w-3 inline mr-0.5" />A
            </button>
            <button
              type="button"
              onClick={(e) => handleQuickDecision(e, 'rejected')}
              title="Instant Reject this unit without mandatory reason (R)"
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer transition-colors ${
                status === 'rejected'
                  ? 'bg-rose-500 text-white'
                  : 'text-rose-500 hover:bg-rose-500/15'
              }`}
            >
              <XCircle className="h-3 w-3 inline mr-0.5" />R
            </button>
            <button
              type="button"
              onClick={(e) => handleQuickDecision(e, 'deferred')}
              title="Defer this unit (D)"
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer transition-colors ${
                status === 'deferred'
                  ? 'bg-amber-500 text-neutral-950'
                  : 'text-amber-500 hover:bg-amber-500/15'
              }`}
            >
              <Clock className="h-3 w-3 inline mr-0.5" />D
            </button>
            {isFocusedUnit && (
              <span
                className="px-1 text-[9px] font-mono font-bold text-amber-500"
                title="Currently focused in bottom Rapid Review & Triage Bar"
              >
                <Target className="h-2.5 w-2.5 inline" />
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleCopyPath}
            title="Copy exact file path and state ID"
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-mono font-semibold cursor-pointer transition-colors ${
              copiedPath
                ? 'bg-emerald-500 text-neutral-950 border-emerald-500 font-bold'
                : isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-neutral-300'
            }`}
          >
            {copiedPath ? (
              <>
                <Check className="h-3 w-3" />
                <span>Path Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3 text-sky-500" />
                <span>Copy Path</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCopyTicket}
            title="Copy structured UI Audit Ticket with exact file path and state props"
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-mono font-semibold cursor-pointer transition-colors ${
              copiedTicket
                ? 'bg-emerald-500 text-neutral-950 border-emerald-500 font-bold'
                : isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-neutral-300'
            }`}
          >
            {copiedTicket ? (
              <>
                <Check className="h-3 w-3" />
                <span>Ticket Copied</span>
              </>
            ) : (
              <>
                <Flag className="h-3 w-3 text-amber-500" />
                <span>Copy Ticket</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }
);

AuditTicketHeader.displayName = 'AuditTicketHeader';
