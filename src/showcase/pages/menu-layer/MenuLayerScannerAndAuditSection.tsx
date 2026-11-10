import React from 'react';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { isFloatingWindowPlaylistUnit } from '../floating-windows/floatingWindowsLinearPlaylists';
import { MENU_ROUTE_CONFIG } from './menuLayerRouteConfig';
import { resolveNodePathInspectorLinks } from './menuLayerInspectorLinks';
import {
  ALL_UNIFIED_APPROVAL_PLAYLIST,
  DEV_UNIFIED_APPROVAL_PLAYLIST,
  USER_UNIFIED_APPROVAL_PLAYLIST,
} from './menuLayerLinearPlaylists';
import { AuditTicketHeader } from '../../components/AuditTicketHeader';
import { StageTrackpadScrubResizer } from '../../components/StageTrackpadScrubResizer';
import { MenuLayerStageActionToolbar } from './MenuLayerStageActionToolbar';
import {
  FreeRoamReturnBanner,
  StickySessionContextPill,
} from './StickySessionContextPill';
import { useMenuLayerSandbox } from './MenuLayerSandboxContext';

export interface MenuLayerScannerAndAuditSectionProps {
  isLight: boolean;
  showWorkbenchDecks?: boolean;
}

export const MenuLayerScannerAndAuditSection: React.FC<
  MenuLayerScannerAndAuditSectionProps
> = ({ isLight, showWorkbenchDecks = false }) => {
  const {
    playlistScope,
    handleChangePlaylistScope,
    visibilityTier,
    stepPlaylistBy,
    anchorIndex,
    anchorPlaylistStep,
    isFreeRoaming,
    activeViewRoamLabel,
    handleReturnToAnchor,
    activePlaylist,
    activePlaylistStep,
    currentRoute,
    activeFloatingSubTab,
    setActiveFloatingSubTab,
    containerPreset,
    setContainerPreset,
    boundaryLocked,
    effectiveStageW,
    effectiveStageH,
    handleChangeManualBoundarySize,
    handleToggleBoundaryLock,
    transitionMode,
    setTransitionMode,
    showToast,
    auditInfo,
    stickySessionContext,
    setStickySessionContext,
    settingsTab,
    garageTab,
    layer3StepOverride,
    onNavigateShowcase,
  } = useMenuLayerSandbox();

  const isFloatingStep = isFloatingWindowPlaylistUnit(activePlaylistStep);
  const floatingTabs = isFloatingStep ? activePlaylistStep.preset.tabs ?? [] : [];
  const inspectorLinks = resolveNodePathInspectorLinks(
    currentRoute,
    settingsTab,
    garageTab
  );

  const handleJumpToTuner = () => {
    if (!onNavigateShowcase) return;
    if (isFloatingStep) {
      onNavigateShowcase('floating-windows', activePlaylistStep.windowId);
      return;
    }
    if (currentRoute === 'layer-0' && stickySessionContext === 'static-training-edit') {
      onNavigateShowcase('edge-inspector', 'edge-inspector-stage');
      return;
    }
    const { pageRecipeTarget } = inspectorLinks;
    onNavigateShowcase(pageRecipeTarget.tab, pageRecipeTarget.targetId);
  };

  return (
    <>
      <div
        className={`flex flex-col gap-2 px-3.5 py-2.5 rounded-2xl border text-xs font-mono ${
          isLight
            ? 'bg-white border-neutral-200 text-neutral-800 shadow-2xs'
            : 'bg-neutral-900/90 border-neutral-800 text-neutral-200'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <div
              className={`inline-flex items-center p-0.5 rounded-lg border ${
                isLight ? 'bg-neutral-100 border-neutral-200' : 'bg-neutral-950 border-neutral-800'
              }`}
            >
              <button
                type="button"
                onClick={() => handleChangePlaylistScope('all')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold cursor-pointer transition-colors ${
                  playlistScope === 'all'
                    ? 'bg-sky-500 text-white'
                    : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                }`}
                title="Continuous Unified Queue: User Menu + Edge Inspector + Live Preview + User Floating + Dev Menu + Dev Floating"
              >
                All ({ALL_UNIFIED_APPROVAL_PLAYLIST.length})
              </button>
              <button
                type="button"
                onClick={() => handleChangePlaylistScope('user')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold cursor-pointer transition-colors ${
                  playlistScope === 'user'
                    ? 'bg-emerald-500 text-white'
                    : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                }`}
                title="User Surfaces Queue: User Menu + Edge Inspector + Live Preview + User Floating Windows"
              >
                User ({USER_UNIFIED_APPROVAL_PLAYLIST.length})
              </button>
              <button
                type="button"
                onClick={() => handleChangePlaylistScope('developer')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold cursor-pointer transition-colors ${
                  playlistScope === 'developer'
                    ? 'bg-amber-500 text-neutral-950'
                    : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
                }`}
                title="Developer Surfaces Queue: Dev Menu + Dev Floating Windows & Sub-Tabs"
              >
                Dev ({DEV_UNIFIED_APPROVAL_PLAYLIST.length})
              </button>
            </div>

            <button
              type="button"
              onClick={() => stepPlaylistBy(-1)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border font-bold cursor-pointer transition-all active:scale-95 ${
                isLight
                  ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
                  : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-100'
              }`}
              title="Previous step from approval anchor (ArrowLeft <-)"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Prev (←)</span>
            </button>

            <button
              type="button"
              onClick={() => stepPlaylistBy(1)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border font-bold cursor-pointer transition-all active:scale-95 ${
                isLight
                  ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-800'
                  : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-100'
              }`}
              title="Next step from approval anchor (ArrowRight ->)"
            >
              <span>Next (→)</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>

            <span className="px-2 py-0.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-600 dark:text-sky-400 text-[10px] font-bold">
              {auditInfo.surfaceKindLabel}
            </span>

            <span className="px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 font-bold">
              [#{anchorIndex + 1}/{activePlaylist.length}]{' '}
              {anchorPlaylistStep?.label || currentRoute}
            </span>

            <StickySessionContextPill
              isLight={isLight}
              visibilityTier={visibilityTier}
              stickySessionContext={stickySessionContext}
              onSelectSessionContext={(ctx) => {
                setStickySessionContext(ctx);
                showToast(`Session Context set to: ${ctx}`);
              }}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <StageTrackpadScrubResizer
              isLight={isLight}
              compact={true}
              containerPreset={containerPreset}
              onSelectPreset={setContainerPreset}
              boundaryLocked={boundaryLocked}
              onToggleLock={handleToggleBoundaryLock}
              width={effectiveStageW}
              height={effectiveStageH}
              onChangeSize={handleChangeManualBoundarySize}
            />

            {onNavigateShowcase && (
              <button
                type="button"
                onClick={handleJumpToTuner}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-mono font-bold border transition-all cursor-pointer active:scale-95 bg-amber-500 hover:bg-amber-400 text-neutral-950 border-amber-400 shadow-2xs"
                title={`Open ${auditInfo.componentName} in Surface Workbench Tuner`}
              >
                <span>Open in Surface Tuner</span>
                <ArrowUpRight className="h-3.5 w-3.5 stroke-[2.5]" />
              </button>
            )}
          </div>
        </div>

        {isFloatingStep && floatingTabs.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-1.5 border-t border-neutral-200/70 dark:border-neutral-800/70">
            <span className="text-[10px] text-neutral-400">
              Window Sub-Tabs ({activePlaylistStep.tabIndex + 1}/{floatingTabs.length}):
            </span>
            {floatingTabs.map((tab, idx) => {
              const isSelected =
                (activeFloatingSubTab || floatingTabs[0]?.id) === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFloatingSubTab(tab.id)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-amber-500 text-neutral-950 border-amber-400'
                      : isLight
                      ? 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200 text-neutral-600'
                      : 'bg-neutral-950 hover:bg-neutral-800 border-neutral-800 text-neutral-400'
                  }`}
                >
                  {idx + 1}. {tab.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <FreeRoamReturnBanner
        isLight={isLight}
        isFreeRoaming={isFreeRoaming}
        activeViewRoamLabel={activeViewRoamLabel}
        anchorIndex={anchorIndex}
        anchorLabel={anchorPlaylistStep?.label || currentRoute}
        onReturnToAnchor={handleReturnToAnchor}
      />

      {showWorkbenchDecks && (
        <MenuLayerStageActionToolbar
          isLight={isLight}
          currentRoute={currentRoute}
          transitionMode={transitionMode}
          setTransitionMode={setTransitionMode}
          showToast={showToast}
        />
      )}

      <div
        className={`px-3.5 py-2 rounded-xl border ${
          isLight
            ? 'bg-white border-neutral-200 shadow-2xs'
            : 'bg-neutral-900/80 border-neutral-800'
        }`}
      >
        <AuditTicketHeader
          index={anchorIndex + 1}
          label={
            (isFreeRoaming ? activeViewRoamLabel : anchorPlaylistStep?.label) ||
            MENU_ROUTE_CONFIG[currentRoute]?.label ||
            currentRoute
          }
          description={activePlaylistStep?.breadcrumb}
          referenceCode={auditInfo.referenceCode}
          componentName={auditInfo.componentName}
          sourceFile={auditInfo.sourceFile}
          stateId={
            isFloatingStep
              ? activePlaylistStep.stateId
              : activePlaylistStep?.id || currentRoute
          }
          activeProps={
            isFloatingStep
              ? activePlaylistStep.activeProps
              : {
                  route: currentRoute,
                  tier: visibilityTier,
                  sessionContext: stickySessionContext,
                  ...(currentRoute === 'main-menu' ||
                  currentRoute === 'manage-room' ||
                  (currentRoute === 'layer-0' &&
                    stickySessionContext === 'static-training-edit')
                    ? { contextMode: stickySessionContext }
                    : {}),
                  ...(currentRoute === 'settings' ? { activeTab: settingsTab } : {}),
                  ...(currentRoute === 'garage' ? { activeTab: garageTab } : {}),
                  ...(currentRoute === 'host-match' ||
                  currentRoute === 'host-training' ||
                  currentRoute === 'join-room'
                    ? {
                        progressStatus: layer3StepOverride.progressStatus ?? 'idle',
                        currentStep: layer3StepOverride.currentStep ?? 1,
                        ...(currentRoute === 'host-match'
                          ? {
                              defaultEditingConfig: Boolean(
                                layer3StepOverride.defaultEditingConfig
                              ),
                            }
                          : {}),
                      }
                    : {}),
                }
          }
          badgeColor={
            isFloatingStep
              ? 'sky'
              : visibilityTier === 'user'
              ? 'emerald'
              : 'amber'
          }
          tunerStatus={auditInfo.tunerStatus}
          isLight={isLight}
        />
      </div>
    </>
  );
};
