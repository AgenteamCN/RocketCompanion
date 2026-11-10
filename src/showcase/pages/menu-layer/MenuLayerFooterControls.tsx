import React from 'react';
import {
  Check,
  Sliders,
  ArrowUpRight,
  Compass,
} from 'lucide-react';
import type { ShowcaseTab } from '../../sidebarNavConfig';
import {
  type ActiveMenuRoute,
  MENU_ROUTE_CONFIG,
} from './menuLayerRouteConfig';
import { resolveNodePathInspectorLinks } from './menuLayerInspectorLinks';

export interface MenuLayerFooterControlsProps {
  isLight: boolean;
  currentRoute: ActiveMenuRoute;
  settingsTab: string;
  garageTab: string;
  currentStepBreadcrumb?: string;
  activeRouteSizeModeLabel: string;
  feedbackToast: string | null;
  showInlineTuner: boolean;
  onToggleInlineTuner?: () => void;
  onNavigateShowcase?: (tab: ShowcaseTab, targetId?: string) => void;
}

export const MenuLayerFooterControls: React.FC<MenuLayerFooterControlsProps> = ({
  isLight,
  currentRoute,
  settingsTab,
  garageTab,
  currentStepBreadcrumb,
  activeRouteSizeModeLabel,
  feedbackToast,
  showInlineTuner,
  onToggleInlineTuner,
  onNavigateShowcase,
}) => {
  const inspectorLinks = resolveNodePathInspectorLinks(
    currentRoute,
    settingsTab,
    garageTab
  );
  const { pageRecipeTarget, elementTargets } = inspectorLinks;

  return (
      <div
        className={`flex flex-col gap-2.5 px-3.5 py-2.5 rounded-xl border text-xs font-mono transition-colors ${
          isLight
            ? 'bg-neutral-50/90 border-neutral-200/80 text-neutral-600'
            : 'bg-neutral-950/50 border-neutral-800/80 text-neutral-400'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Compass className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <span className="text-neutral-400">Current detection node path:</span>
            <span className="font-bold text-amber-500">
              {currentStepBreadcrumb ||
                MENU_ROUTE_CONFIG[currentRoute]?.label ||
                currentRoute}{' '}
              ({activeRouteSizeModeLabel})
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {feedbackToast && (
              <div className="text-amber-500 font-semibold flex items-center gap-1.5 animate-pulse mr-1">
                <Check className="h-3.5 w-3.5" />
                <span>{feedbackToast}</span>
              </div>
            )}

            {onToggleInlineTuner && (
              <button
                type="button"
                onClick={onToggleInlineTuner}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border transition-all cursor-pointer active:scale-95 ${
                  showInlineTuner
                    ? 'bg-amber-500 text-neutral-950 border-amber-400 shadow-2xs'
                    : isLight
                    ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-800 shadow-2xs'
                    : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-200 shadow-2xs'
                }`}
                title="Expand or collapse inline quick-tuner directly on the Approval Stage"
              >
                <Sliders className="h-3 w-3" />
                <span>
                  {showInlineTuner ? 'Collapse Inline Quick-Tuning' : 'Quick In-Place Node Tuning'}
                </span>
              </button>
            )}

            {onNavigateShowcase && (
              <button
                type="button"
                onClick={() =>
                  onNavigateShowcase(
                    pageRecipeTarget.tab,
                    pageRecipeTarget.targetId
                  )
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border transition-all cursor-pointer active:scale-95 bg-amber-500 hover:bg-amber-400 text-neutral-950 border-amber-400 shadow-2xs"
                title={`One-click jump to Surface Workbench tuner: ${pageRecipeTarget.componentName}`}
              >
                <span>Open in Surface Workbench ({pageRecipeTarget.componentName})</span>
                <ArrowUpRight className="h-3.5 w-3.5 stroke-[2.5]" />
              </button>
            )}
          </div>
        </div>

        {onNavigateShowcase && elementTargets.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-neutral-200/70 dark:border-neutral-800/70">
            <span className="text-[11px] text-neutral-400 shrink-0">
              Underlying Primitives &amp; Tuners:
            </span>
            {elementTargets.map((target) => (
              <button
                key={`${target.code}-${target.componentName}`}
                type="button"
                onClick={() => onNavigateShowcase(target.tab, target.targetId)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono border transition-all cursor-pointer active:scale-95 ${
                  isLight
                    ? 'bg-white hover:bg-amber-50 border-neutral-200/90 hover:border-amber-400 text-neutral-700 hover:text-amber-700 shadow-2xs'
                    : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 hover:border-amber-500/60 text-neutral-300 hover:text-amber-300'
                }`}
                title={`Jump to component tuner: ${target.componentName}`}
              >
                <span className="px-1 py-0.2 rounded text-[9.5px] font-extrabold bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  {target.componentName}
                </span>
                <span>{target.label.replace(/^[0-9A-Z.-]+\s+/, '')}</span>
                <ArrowUpRight className="h-3 w-3 opacity-70" />
              </button>
            ))}
          </div>
        )}
      </div>
  );
};
