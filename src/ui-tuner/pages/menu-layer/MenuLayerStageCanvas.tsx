import React from 'react';
import { KeycapBadge } from '../../../ui-core/primitives/KeycapBadge';
import { MorphingStageShell } from '../../../ui-core/navigation/MorphingStageShell';
import { EdgeInspectorDrawer } from '../../../ui-core/navigation/EdgeInspectorDrawer';
import { FloatingStackIcon } from '../../../ui-core/navigation/FloatingStackIcon';
import { FloatingWindowManager } from '../../../ui-core/navigation/FloatingWindowManager';
import { StaticTrainingPackHUD } from '../../../ui-core/hud/StaticTrainingPackHUD';
import { StaticTrainingShotInspectorDrawer } from '../../../ui-core/recipes/StaticTrainingShotInspectorDrawer';
import { floatingStore } from '../../../ui-core/stores/floatingStore';
import { useStaticTrainingPackStore } from '../../../ui-core/stores/staticTrainingPackStore';
import { PRESET_WINDOWS } from '../../../ui-core/stores/devFloatingPresets';
import { renderFloatingWindowPanel } from '../../../ui-core/panels/floatingWindowRegistry';
import { MenuLayerStageRecipeRouter } from './MenuLayerStageRecipeRouter';
import { useMenuLayerSandbox } from './MenuLayerSandboxContext';

export interface MenuLayerStageCanvasProps {
  isLight: boolean;
}

export const MenuLayerStageCanvas: React.FC<MenuLayerStageCanvasProps> = ({
  isLight,
}) => {
  const {
    stageRef,
    contentWrapperRef,
    containerPreset,
    boundaryLocked = false,
    manualBoundarySize,
    isCursorHidden,
    currentRoute,
    activeFloatingWindowId,
    activeFloatingSubTab,
    setActiveFloatingSubTab,
    activePlaylistStep,
    layer1ContextMode,
    isDockState,
    ballSimSpeed,
    hasStackIcon,
    backdropDuration,
    triggerShake,
    showToast,
    handleSelectRoute,
    isShaking,
    targetX,
    targetY,
    targetW,
    targetH,
    targetRadius,
    handleTriggerExpand,
    isPillHovered,
    setIsPillHovered,
    isPillContentVisible,
    isContentVisible,
  } = useMenuLayerSandbox();
  const isEdgeInspectorExpanded = useStaticTrainingPackStore(
    (s) => s.isEdgeInspectorExpanded
  );
  const setEdgeInspectorExpanded = useStaticTrainingPackStore(
    (s) => s.setEdgeInspectorExpanded
  );
  const isStaticTrainingEditActive =
    !activeFloatingWindowId && layer1ContextMode === 'static-training-edit';
  const isStaticTrainingHudActive =
    !activeFloatingWindowId &&
    (isStaticTrainingEditActive || layer1ContextMode === 'static-training-play');
  const lockedW = boundaryLocked && manualBoundarySize ? manualBoundarySize.width : undefined;
  const lockedH = boundaryLocked && manualBoundarySize ? manualBoundarySize.height : undefined;

  return (
    <div
      id="rc-ui-tuner-preview-stage"
      ref={stageRef}
      className={`scroll-mt-6 relative mx-auto w-full rounded-2xl border p-6 md:p-10 flex items-center justify-center overflow-hidden transition-all duration-300 ${
        isCursorHidden && !isStaticTrainingEditActive && !activeFloatingWindowId
          ? 'cursor-none'
          : 'cursor-default'
      } ${
        isLight
          ? 'bg-neutral-100/70 border-neutral-200/90 shadow-inner'
          : 'bg-neutral-950/80 border-neutral-800 shadow-inner'
      }`}
      style={{
        width: lockedW ? `${lockedW}px` : undefined,
        minHeight: lockedH
          ? `${lockedH}px`
          : containerPreset === '1080p-compact'
          ? '520px'
          : containerPreset === 'small-squeeze'
          ? '380px'
          : `${Math.max(660, Math.min(980, targetH + 48))}px`,
        height: lockedH
          ? `${lockedH}px`
          : containerPreset === '1080p-compact'
          ? '520px'
          : containerPreset === 'small-squeeze'
          ? '380px'
          : undefined,
        maxWidth: lockedW
          ? '100%'
          : containerPreset === '1080p-compact'
          ? '760px'
          : containerPreset === 'small-squeeze'
          ? '520px'
          : undefined,
        backgroundImage: isLight
          ? 'radial-gradient(#d4d4d8 1px, transparent 1px)'
          : 'radial-gradient(#27272a 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }}
    >
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center pointer-events-none transition-opacity duration-300 ${
          activeFloatingWindowId
            ? 'opacity-25'
            : currentRoute === 'layer-0' || isDockState
            ? 'opacity-100'
            : 'opacity-25'
        }`}
      >
        <div className="flex flex-col items-center gap-2 select-none">
          <span
            className={`text-5xl ${
              (currentRoute === 'layer-0' && !activeFloatingWindowId) || isDockState
                ? 'animate-bounce'
                : ''
            }`}
          >
            [Ball]
          </span>
          <span className="text-xs font-mono font-bold text-neutral-700 dark:text-neutral-300">
            [Three.js Simulation Active: Ball Speed {ballSimSpeed} km/h]
          </span>
          <span className="text-xs text-neutral-400 max-w-md text-center leading-relaxed">
            {currentRoute === 'layer-0'
              ? activeFloatingWindowId
                ? `[*] Floating Window Stage: Inspecting "${activePlaylistStep?.label || activeFloatingWindowId}". Drag header to reposition or corner arc to resize.`
                : isStaticTrainingEditActive
                ? '[*] Static Training Pack Edit Mode: Press TAB to toggle EdgeInspectorDrawer + StaticTrainingShotInspectorDrawer, or press ESC to open the Main Menu.'
                : hasStackIcon
                ? '[*] Layer 0 status: Keep Top Right Stack Icon, Allow draggable observation window (Show on Hover). Click Top-right X Toggle icon and hide mouse cursor.'
                : '[*] Layer 0 status: none Stack icon, Hide mouse in match mode. Press ESC Call main menu and restore mouse.'
              : isDockState
              ? '[*] Live Preview Collapsed to right Dock Pill: Background Image 100% Resume rendering, zero black screen occlusion!'
              : 'Central panel expanded state: Background rendering auto-dimming and noise reduction, Focus on fine-tuned parameter controller.'}
          </span>
        </div>
      </div>

      <FloatingWindowManager
        isLight={isLight}
        containerRef={stageRef}
        defaultDescriptionForWindow={(win) => {
          const found = PRESET_WINDOWS.find(
            (p) => p.id === win.id || win.id.startsWith(p.id)
          );
          return (
            found?.summary ||
            win.subtitle ||
            `${win.title} · Hover controls for details · Drag bottom-right corner arc to resize.`
          );
        }}
        renderWindowContent={(item, ctx) => {
          const isMatchedFw =
            activeFloatingWindowId !== null &&
            (item.id === activeFloatingWindowId ||
              item.id.startsWith(activeFloatingWindowId));
          return renderFloatingWindowPanel(item.id, {
            isLight: ctx.isLight,
            activeTab: isMatchedFw ? activeFloatingSubTab || undefined : undefined,
            onTabChange: isMatchedFw ? setActiveFloatingSubTab : undefined,
          });
        }}
      />

      {isStaticTrainingHudActive && <StaticTrainingPackHUD isLight={isLight} />}

      {isStaticTrainingEditActive && (
        <EdgeInspectorDrawer
          isExpanded={isEdgeInspectorExpanded}
          onExpandedChange={(expanded) => {
            setEdgeInspectorExpanded(expanded);
          }}
          side="right"
          topOffset={72}
          bottomOffset={184}
          expandedWidth={520}
          enableHotkey={false}
          positionMode="absolute"
          isLight={isLight}
        >
          <StaticTrainingShotInspectorDrawer
            isLight={isLight}
            transparent={true}
            onCollapseDrawer={() => setEdgeInspectorExpanded(false)}
          />
        </EdgeInspectorDrawer>
      )}

      <div
        className="absolute inset-0 pointer-events-none backdrop-blur-none z-10"
        style={{
          backgroundColor:
            currentRoute === 'layer-0' || isDockState || currentRoute === 'main-menu'
              ? 'transparent'
              : 'rgba(0, 0, 0, 0.55)',
          transition: `background-color ${backdropDuration}ms cubic-bezier(0.2, 0.8, 0.25, 1)`,
        }}
      />

      <FloatingStackIcon
        isLight={isLight}
        absolute={true}
        containerRef={stageRef}
        isMenuOpen={currentRoute !== 'layer-0'}
        blockedTooltipText={
          currentRoute === 'settings'
            ? 'Please close settings window first'
            : 'Please close active menu first'
        }
        onBlockedClick={() => {
          triggerShake();
          showToast('[!] Please close active menu first (Vibration alert for blocked window)');
        }}
      />

      {currentRoute === 'layer-0' && !activeFloatingWindowId && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2.5 rounded-2xl border backdrop-blur-md select-none transition-all shadow-xl bg-neutral-900/90 text-neutral-100 border-neutral-700/80">
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <div className="flex flex-col">
            <span className="text-xs font-bold font-mono">
              {isStaticTrainingEditActive
                ? 'Static Training Pack Edit Mode (Layer 0 · Edge Inspector Active)'
                : 'Active Match (Layer 0 · In-Game Arena)'}
            </span>
            <span className="text-[11px] text-neutral-400">
              {isStaticTrainingEditActive
                ? 'Press TAB to toggle EdgeInspectorDrawer · Press ESC to open Main Menu'
                : hasStackIcon
                ? 'Keep Top Right Stack Icon: Allow free dragging and parameter adjustment (Show on Hover). Hide mouse for immersion, Click the top-right icon to close it.'
                : 'Currently in non-menu match state with no Stack icon (Mouse Hidden). Press Keyboard ESC Key to Open Menu'}
            </span>
          </div>
          <div className="h-4 w-px bg-neutral-700" />
          <button
            type="button"
            onClick={() => {
              floatingStore.triggerBatchMinimize();
              handleSelectRoute('main-menu');
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-white cursor-pointer transition-all active:scale-95 shadow-2xs"
          >
            <KeycapBadge shortcut="ESC" size="sm" isLight={false} />
            <span>Open Main Menu</span>
          </button>
        </div>
      )}

      {currentRoute !== 'layer-0' && (
        <MorphingStageShell
          isLight={isLight}
          targetX={targetX}
          targetY={targetY}
          targetW={targetW}
          targetH={targetH}
          targetRadius={targetRadius}
          isShaking={isShaking}
          isDockState={isDockState}
          isPillHovered={isPillHovered}
          onPillHoverChange={setIsPillHovered}
          isPillContentVisible={isPillContentVisible}
          isContentVisible={isContentVisible}
          onExpandFromDock={handleTriggerExpand}
          contentWrapperRef={contentWrapperRef}
        >
          <MenuLayerStageRecipeRouter isLight={isLight} />
        </MorphingStageShell>
      )}
    </div>
  );
};

