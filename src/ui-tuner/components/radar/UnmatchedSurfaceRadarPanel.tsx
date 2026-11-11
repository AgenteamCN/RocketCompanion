import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Radar,
} from 'lucide-react';
import { Badge } from '../../../ui-core/primitives/Badge';
import { Button } from '../../../ui-core/primitives/Button';
import type { ShowcaseTab } from '../../sidebarNavConfig';
import { LocalPanelSizingTuner } from '../../pages/recipes/LocalPanelSizingTuner';
import {
  getUnmatchedSurfaceRadarReport,
  resolveAutoDiscoveredRecipeSurface,
} from './unmatchedSurfaceDetector';
import { UnmatchedSurfaceRowCard } from './UnmatchedSurfaceRowCard';
import {
  formatUnmatchedSurfaceFollowUpMarkdown,
  type UnmatchedSurfaceDiagnosticItem,
} from './unmatchedSurfaceTypes';

export interface UnmatchedSurfaceRadarPanelProps {
  isLight?: boolean;
  defaultExpanded?: boolean;
  onSelectRecipeId?: (recipeId: string, scrollStage?: boolean) => void;
  onSelectTab?: (tab: ShowcaseTab) => void;
}

type FilterTabId = 'flagged' | 'recipes' | 'floating' | 'all';

export const UnmatchedSurfaceRadarPanel: React.FC<UnmatchedSurfaceRadarPanelProps> = ({
  isLight = true,
  defaultExpanded = true,
  onSelectRecipeId,
  onSelectTab,
}) => {
  const report = useMemo(() => getUnmatchedSurfaceRadarReport(), []);
  const [expanded, setExpanded] = useState<boolean>(
    defaultExpanded || report.unmatchedOrUncalibratedCount > 0
  );
  const [filterTab, setFilterTab] = useState<FilterTabId>(
    report.unmatchedOrUncalibratedCount > 0 ? 'flagged' : 'all'
  );
  const [copiedReport, setCopiedReport] = useState(false);

  const visibleItems: UnmatchedSurfaceDiagnosticItem[] = useMemo(() => {
    if (filterTab === 'flagged') return report.flaggedItems;
    if (filterTab === 'recipes') {
      return report.allItems.filter((it) => it.surfaceKind === 'menu-recipe');
    }
    if (filterTab === 'floating') {
      return report.allItems.filter((it) => it.surfaceKind === 'floating-window');
    }
    return report.allItems;
  }, [filterTab, report]);

  const handleCopyFollowUp = async () => {
    const markdown = formatUnmatchedSurfaceFollowUpMarkdown(report);
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(markdown);
      setCopiedReport(true);
      window.setTimeout(() => setCopiedReport(false), 2000);
    }
  };

  const hasFlagged = report.unmatchedOrUncalibratedCount > 0;
  const mutedText = isLight ? 'text-neutral-600' : 'text-neutral-400';

  return (
    <div
      id="rc-unmatched-surface-radar-panel"
      className={`rounded-2xl border p-4 flex flex-col gap-3 transition-colors ${
        hasFlagged
          ? isLight
            ? 'bg-amber-50/70 border-amber-300/90 shadow-2xs'
            : 'bg-amber-950/20 border-amber-500/40 shadow-sm'
          : isLight
          ? 'bg-emerald-50/50 border-emerald-200/90 shadow-2xs'
          : 'bg-emerald-950/15 border-emerald-800/50'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-extrabold border ${
              hasFlagged
                ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40'
                : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40'
            }`}
          >
            <Radar className="h-3.5 w-3.5" />
            <span>RC SURFACE RADAR DETECTOR</span>
          </span>

          <span className="text-sm font-bold">
            {hasFlagged
              ? `${report.unmatchedOrUncalibratedCount} Unmatched / Uncalibrated RC Surface(s) Detected`
              : `All ${report.totalCandidates} RC Surfaces Matched & Calibrated`}
          </span>

          <Badge variant={hasFlagged ? 'amber' : 'success'} size="sm" isLight={isLight}>
            {report.matchedAndCalibratedCount}/{report.totalCandidates} Fully Matched
          </Badge>

          {report.issueCounts['missing-7a-playlist'] > 0 && (
            <Badge variant="danger" size="sm" isLight={isLight}>
              {report.issueCounts['missing-7a-playlist']} Missing 7A Playlist
            </Badge>
          )}
          {report.issueCounts['missing-7a-route'] > 0 && (
            <Badge variant="danger" size="sm" isLight={isLight}>
              {report.issueCounts['missing-7a-route']} Missing 7A Route
            </Badge>
          )}
          {report.issueCounts['missing-6a-curated-tuner'] > 0 && (
            <Badge variant="amber" size="sm" isLight={isLight}>
              {report.issueCounts['missing-6a-curated-tuner']} Auto-Fallback 6A
            </Badge>
          )}
          {report.issueCounts['missing-6d-preset'] > 0 && (
            <Badge variant="danger" size="sm" isLight={isLight}>
              {report.issueCounts['missing-6d-preset']} Missing 6D Preset
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="secondary"
            isLight={isLight}
            icon={copiedReport ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            onClick={handleCopyFollowUp}
          >
            {copiedReport ? 'Follow-Up Copied' : 'Copy Follow-Up Checklist'}
          </Button>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono border cursor-pointer transition-colors ${
              isLight
                ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-neutral-200'
            }`}
          >
            <span>{expanded ? 'Collapse' : 'Inspect Surfaces'}</span>
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <p className={`text-xs leading-relaxed ${mutedText}`}>
        Automatically scans <code className="font-mono">src/ui-core/recipes/*.tsx</code> and{' '}
        <code className="font-mono">src/ui-core/panels/&#123;user,dev&#125;/*FloatingWindow.tsx</code>{' '}
        for newly merged Rocket Companion temporary or experimental pages that have not yet been wired
        into 6A/6D Tuners, 7A Linear Approval Playlists, Sizing Tokens, or the 3-Layer Approval Ledger.
      </p>

      {expanded && (
        <div className="flex flex-col gap-3 pt-2 border-t border-neutral-200/70 dark:border-neutral-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center rounded-lg border p-0.5 text-[11px] font-mono bg-white/80 dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800">
              {(
                [
                  ['flagged', `Flagged Follow-Up (${report.unmatchedOrUncalibratedCount})`],
                  ['recipes', `Menu Recipes (${report.recipeCandidatesCount})`],
                  ['floating', `Floating Windows (${report.floatingCandidatesCount})`],
                  ['all', `All Surfaces (${report.totalCandidates})`],
                ] as const
              ).map(([tabId, label]) => (
                <button
                  key={tabId}
                  type="button"
                  onClick={() => setFilterTab(tabId)}
                  className={`px-2.5 py-1 rounded-md cursor-pointer transition-colors ${
                    filterTab === tabId
                      ? 'bg-amber-500 text-neutral-950 font-bold'
                      : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <span className={`text-[11px] font-mono ${mutedText}`}>
              Showing {visibleItems.length} of {report.totalCandidates} RC surfaces
            </span>
          </div>

          {visibleItems.length === 0 ? (
            <div
              className={`p-3.5 rounded-xl border text-xs font-mono flex items-center gap-2 ${
                isLight
                  ? 'bg-white border-emerald-200 text-emerald-700'
                  : 'bg-neutral-950/70 border-emerald-800/60 text-emerald-400'
              }`}
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                Zero unmatched or uncalibrated surfaces in this view. All discovered RC surfaces are
                wired into RCUITuner playlists and calibration manifests.
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 max-h-96 overflow-y-auto pr-1">
              {visibleItems.map((item) => (
                <UnmatchedSurfaceRowCard
                  key={item.surfaceId}
                  item={item}
                  isLight={isLight}
                  onSelectRecipeId={onSelectRecipeId}
                  onSelectTab={onSelectTab}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export interface UnmatchedRecipeFallbackStageProps {
  activeRecipeId: string;
  isLight?: boolean;
}

export const UnmatchedRecipeFallbackStage: React.FC<UnmatchedRecipeFallbackStageProps> = ({
  activeRecipeId,
  isLight = true,
}) => {
  const diagnostic = useMemo(
    () => resolveAutoDiscoveredRecipeSurface(activeRecipeId),
    [activeRecipeId]
  );

  if (!diagnostic) return null;
  const DiscoveredComponent = diagnostic.Component;

  return (
    <div className="flex flex-col gap-4">
      <div
        className={`p-4 rounded-2xl border flex flex-col gap-2 ${
          isLight
            ? 'bg-amber-50/80 border-amber-300 text-neutral-800'
            : 'bg-amber-950/25 border-amber-500/40 text-neutral-100'
        }`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="amber" size="sm" isLight={isLight}>
            AUTO-DISCOVERED UNCURATED RC SURFACE
          </Badge>
          <span className="font-mono font-bold text-xs">{diagnostic.componentName}</span>
          <code className="text-[11px] font-mono opacity-80">({diagnostic.entryFile})</code>
        </div>
        <p className="text-xs leading-relaxed opacity-90">
          This surface was automatically discovered in <code className="font-mono">src/ui-core/recipes</code>{' '}
          but has not yet been manually curated into 6A <code className="font-mono">CURATED_RECIPES_JUMP_ITEMS</code>{' '}
          or 7A Linear Playlists. Live fallback preview is mounted below for immediate inspection.
        </p>
      </div>

      {diagnostic.resolvedPanelId && (
        <LocalPanelSizingTuner
          panelId={diagnostic.resolvedPanelId}
          code={activeRecipeId}
          label={diagnostic.title}
          recommendation={`Auto-discovered fallback (${diagnostic.sizingSummary})`}
          isLight={isLight}
        />
      )}

      <div
        className={`flex justify-center p-6 rounded-2xl border transition-colors ${
          isLight
            ? 'bg-neutral-50/70 border-neutral-200/80 shadow-2xs'
            : 'border-neutral-800 bg-neutral-950/60'
        }`}
      >
        {DiscoveredComponent ? (
          <DiscoveredComponent isLight={isLight} />
        ) : (
          <div className="py-12 text-xs font-mono text-neutral-400">
            Unable to resolve exported React component from {diagnostic.entryFile}
          </div>
        )}
      </div>
    </div>
  );
};
