import React, { useEffect } from 'react';
import { PanelRightClose } from 'lucide-react';
import { useDialogueStack } from '../../ui-core/compounds/dialogue/dialogueStore';
import { CircularBoostGauge } from '../../ui-core/hud/CircularBoostGauge';
import { StaticTrainingPackHUD } from '../../ui-core/hud/StaticTrainingPackHUD';
import { VelocityProgressBar } from '../../ui-core/hud/VelocityProgressBar';
import { EdgeInspectorDrawer } from '../../ui-core/navigation/EdgeInspectorDrawer';
import { Badge } from '../../ui-core/primitives/Badge';
import { StaticTrainingShotInspectorDrawer } from '../../ui-core/recipes/StaticTrainingShotInspectorDrawer';
import type { EditSubMode } from '../../ui-core/recipes/static-training/staticTrainingTypes';
import { ArenaBackdrop } from '../ArenaBackdrop';
import { TunerConfigExporterBar } from '../components/tuner/TunerConfigExporterBar';
import { exportEdgeInspectorLayoutSnapshot } from './edge-inspector/edgeInspectorLayoutSnapshot';
import { EdgeInspectorReferenceMatrix } from './edge-inspector/EdgeInspectorReferenceMatrix';
import {
  EdgeInspectorSceneOverlayAndMenu,
  EdgeInspectorTunerControls,
} from './edge-inspector/EdgeInspectorTunerControls';
import {
  type ActiveEscMenuRoute,
  useEdgeInspectorSyncedState,
} from './edge-inspector/useEdgeInspectorSyncedState';

export interface EdgeInspectorSimulationPageProps {
  isLight?: boolean;
}

export type { ActiveEscMenuRoute };

export const EdgeInspectorSimulationPage: React.FC<EdgeInspectorSimulationPageProps> = ({
  isLight = false,
}) => {
  const {
    isDrawerExpanded,
    setIsDrawerExpanded,
    escMenuRoute,
    setEscMenuRoute,
    drawerSide,
    setDrawerSide,
    expandedWidth,
    setExpandedWidth,
    collapsedWidth,
    setCollapsedWidth,
    topOffset,
    setTopOffset,
    bottomOffset,
    setBottomOffset,
    shots,
    setShots,
    selectedShotIndex,
    setSelectedShotIndex,
    isInspectingShot,
    setIsInspectingShot,
    editSubMode,
    setEditSubMode,
    feedbackToast,
    showToast,
    handleResetParams,
    buildExportCode,
  } = useEdgeInspectorSyncedState();

  const { stack: dialogueStack } = useDialogueStack();

  const safeIndex = Math.max(0, Math.min(Math.max(0, shots.length - 1), selectedShotIndex));
  const activeShot = shots[safeIndex] || shots[0];
  const isEscMenuOpen = escMenuRoute !== 'none';

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'Escape') {
        if (dialogueStack.length > 0) return;
        e.preventDefault();
        if (escMenuRoute === 'none') {
          setEscMenuRoute('main-menu');
          showToast('ESC: Call independent main menu (Main Menu)');
        } else if (escMenuRoute === 'main-menu') {
          setEscMenuRoute('none');
          showToast('ESC: Close Main Menu, Back 3D Edit scene');
        } else {
          setEscMenuRoute('main-menu');
        }
        return;
      }

      if (!isEscMenuOpen && (e.key === '9' || e.key === '0')) {
        e.preventDefault();
        const delta = e.key === '0' ? 1 : -1;
        const speedFollowsHeading = activeShot?.car.speedFollowsHeading !== false;
        const order: EditSubMode[] = speedFollowsHeading
          ? ['car-heading', 'ball-speed', 'free-cam']
          : ['car-heading', 'car-speed', 'ball-speed', 'free-cam'];
        const curIdx = Math.max(0, order.indexOf(editSubMode));
        const nextMode = order[(curIdx + delta + order.length) % order.length];
        setEditSubMode(nextMode);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeShot, editSubMode, escMenuRoute, isEscMenuOpen, dialogueStack.length]);

  const handleExportLayoutSnapshot = () => {
    void exportEdgeInspectorLayoutSnapshot({
      isDrawerExpanded,
      isInspectingShot,
      drawerSide,
      topOffset,
      bottomOffset,
      showToast,
    });
  };

  return (
    <div className="flex flex-col gap-6 w-full relative">
      {/* 1. Static Page Header (Nothing above the View Box ever changes) */}
      <div className="flex items-center justify-between gap-4 pb-2 border-b border-neutral-200/80 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
            <PanelRightClose className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">
                6E · Edge Inspector Side Hover Inspection Drawer
              </h1>
              <Badge variant="amber" size="sm" isLight={isLight}>
                Zero-Backdrop · Right/Left Offset
              </Badge>
              <Badge variant="primary" size="sm" isLight={isLight}>
                TAB Independent Management Drawer · ESC Independent Management Menu
              </Badge>
            </div>
            <p className={`text-xs mt-0.5 ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
              Static top-pinned View Box stage — all drawer state toggles, ESC menu triggers, and
              geometry/offset tuners operate below the View Box so nothing above it ever changes.
            </p>
          </div>
        </div>
      </div>

      {/* 2. TOP-PINNED VIEW BOX STAGE */}
      <div
        id="edge-inspector-simulation-stage"
        className="relative w-full h-[680px] rounded-3xl border border-neutral-300 dark:border-neutral-800 overflow-hidden shadow-2xl bg-black select-none"
      >
        <ArenaBackdrop preset={isLight ? 'daylight' : 'night'} brightness={isLight ? 82 : 38} />
        <StaticTrainingPackHUD
          isLight={isLight}
          shotIndex={safeIndex}
          shot={activeShot}
          editSubMode={editSubMode}
          onSelectSubMode={setEditSubMode}
        />
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <VelocityProgressBar speed={activeShot.car.speed} width={280} height={20} />
        </div>

        <div
          className="absolute z-10 pointer-events-none flex flex-col items-end gap-1"
          style={{ right: 24, bottom: 20 }}
        >
          <CircularBoostGauge
            amount={activeShot.car.unlimitedBoost ? 100 : activeShot.car.initialBoost}
            size={148}
            isLight={isLight}
          />
        </div>

        <EdgeInspectorDrawer
          isExpanded={isDrawerExpanded}
          onExpandedChange={setIsDrawerExpanded}
          side={drawerSide}
          expandedWidth={expandedWidth}
          collapsedWidth={collapsedWidth}
          topOffset={topOffset}
          bottomOffset={bottomOffset}
          edgeMargin={16}
          shortcutKey="TAB"
          enableHotkey={true}
          positionMode="absolute"
          isLight={isLight}
        >
          <StaticTrainingShotInspectorDrawer
            isLight={isLight}
            transparent={true}
            packTitle="Aerial Striker Pack"
            onCollapseDrawer={() => setIsDrawerExpanded(false)}
            stateOverride={{
              shots,
              onShotsChange: setShots,
              selectedShotIndex,
              onSelectedShotIndexChange: setSelectedShotIndex,
              isInspectingShot,
              onInspectingShotChange: setIsInspectingShot,
              editSubMode,
              onEditSubModeChange: setEditSubMode,
            }}
          />
        </EdgeInspectorDrawer>

        <EdgeInspectorSceneOverlayAndMenu
          isLight={isLight}
          editSubMode={editSubMode}
          safeIndex={safeIndex}
          activeShot={activeShot}
          drawerLayout={{
            isDrawerExpanded,
            expandedWidth,
            collapsedWidth,
            drawerSide,
          }}
          isEscMenuOpen={isEscMenuOpen}
          escMenuRoute={escMenuRoute}
          setEscMenuRoute={setEscMenuRoute}
          showToast={showToast}
        />
      </div>

      <EdgeInspectorTunerControls
        isLight={isLight}
        feedbackToast={feedbackToast}
        handleExportLayoutSnapshot={handleExportLayoutSnapshot}
        isInspectingShot={isInspectingShot}
        setIsInspectingShot={setIsInspectingShot}
        isDrawerExpanded={isDrawerExpanded}
        setIsDrawerExpanded={setIsDrawerExpanded}
        isEscMenuOpen={isEscMenuOpen}
        setEscMenuRoute={setEscMenuRoute}
        handleResetParams={handleResetParams}
        geometry={{
          drawerSide,
          setDrawerSide,
          expandedWidth,
          setExpandedWidth,
          collapsedWidth,
          setCollapsedWidth,
          topOffset,
          setTopOffset,
          bottomOffset,
          setBottomOffset,
        }}
      />

      {/* Dedicated 6E One-Click Config Exporter Bar (Placed below Top-Pinned View Box) */}
      <TunerConfigExporterBar
        badge="6E-EXPORT"
        title="EdgeInspectorDrawer Geometry & HUD Avoidance One-Click Config Exporter"
        subtitle="Exports EdgeInspectorDrawer side, expandedWidth (520px), collapsedWidth (88px), topOffset (72px) & bottomOffset (184px Boost Gauge clearance)"
        copyLabel="Copy 6E Drawer Config (Export Snapshot)"
        codeTitle="Current 6E EdgeInspectorDrawer Parameter Snapshot (Paste directly into DEFAULT_6E_EDGE_INSPECTOR_SNAPSHOT)"
        actionId="export-6e-edge-inspector-config"
        isLight={isLight}
        buildExportCode={buildExportCode}
        onResetDefaults={handleResetParams}
      />

      <EdgeInspectorReferenceMatrix isLight={isLight} />
    </div>
  );
};
