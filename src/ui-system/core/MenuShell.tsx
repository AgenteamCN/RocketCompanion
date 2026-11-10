import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../ui-core/stores/appStore.ts';
import { useViewportStore } from '../../ui-core/stores/viewportStore.ts';
import { type ActiveMenuRoute } from '../../ui-core/config/uiConfig.ts';
import { MorphingShell } from '../../ui-core/navigation/MorphingShell.tsx';
import { FloatingStackIcon } from '../../ui-core/navigation/FloatingStackIcon.tsx';
import { FloatingWindowManager } from '../../ui-core/navigation/FloatingWindowManager.tsx';
import {
  renderFloatingWindowContent,
  handleFloatingStackCloseWindow,
} from './runtimeFloatingWindowLifecycle.tsx';
import {
  useReferenceOverlayStore,
  DEFAULT_REFERENCE_RESOLUTION,
  createDefaultResolutionProfile,
} from '../../ui-core/stores/referenceOverlayStore.ts';
import { QuickNotificationSystem } from '../../ui-core/navigation/QuickNotificationSystem.tsx';
import { DialogueStackContainer } from '../../ui-core/compounds/Dialogue.tsx';
import { useQuickNotificationStore } from '../../ui-core/stores/quickNotificationStore.ts';
import '../../ui-core/stores/cameraDeterminismStore.ts';
import { useMenuLayoutStore } from '../../ui-core/stores/menuLayoutStore.ts';
import { DEFAULT_PANEL_SIZING } from '../../ui-core/tokens/menuLayoutTokens.ts';
import { StaticTrainingShotInspectorDrawer } from '../../ui-core/recipes/StaticTrainingShotInspectorDrawer.tsx';
import { EdgeInspectorDrawer } from '../../ui-core/navigation/EdgeInspectorDrawer.tsx';
import { useStaticTrainingPackStore } from '../../ui-core/stores/staticTrainingPackStore.ts';
import { StaticTrainingPackHUD } from '../../ui-core/hud/StaticTrainingPackHUD.tsx';
import { useLivePreviewDockTransition } from './useLivePreviewDockTransition.ts';
import { ROUTE_TO_PANEL_ID, renderActiveMenuRoute } from './menuRouteRegistry.tsx';

const HitboxReferenceOverlayLayer: React.FC = () => {
  const enabled = useReferenceOverlayStore((s) => s.enabled);
  const images = useReferenceOverlayStore((s) => s.images);
  const activeIndex = useReferenceOverlayStore((s) => s.activeIndex);
  const activeResolutionKey = useReferenceOverlayStore((s) => s.activeResolutionKey);
  const profiles = useReferenceOverlayStore((s) => s.profiles);

  const activeImage = images[activeIndex] || null;
  const effectiveResKey =
    activeResolutionKey !== 'ALL'
      ? activeResolutionKey
      : activeImage
        ? `${activeImage.width}x${activeImage.height}`
        : DEFAULT_REFERENCE_RESOLUTION;

  const profile = profiles[effectiveResKey] || createDefaultResolutionProfile(effectiveResKey);

  if (!enabled || !activeImage) {
    return null;
  }

  const transformStyle = `translate3d(calc(-50% + ${profile.offsetX}px), calc(-50% + ${profile.offsetY}px), 0) scale(${profile.scaleX}, ${profile.scaleY})`;

  return (
    <div
      data-ui-element="hitbox-reference-overlay"
      className="fixed inset-0 pointer-events-none select-none overflow-hidden z-[4]"
    >
      <img
        src={activeImage.url}
        alt={activeImage.name}
        draggable={false}
        className="absolute left-1/2 top-1/2 max-w-none max-h-none pointer-events-none select-none"
        style={{
          width: `${activeImage.width}px`,
          height: `${activeImage.height}px`,
          opacity: profile.opacity,
          transform: transformStyle,
          transformOrigin: 'center center',
          filter: profile.invertImage ? 'invert(1)' : undefined,
        }}
      />
    </div>
  );
};

export interface MenuShellProps {
  inspectorSlot?: React.ReactNode;
}

export const MenuShell: React.FC<MenuShellProps> = ({ inspectorSlot }) => {
  const isOpen = useAppStore((s) => s.isOpen);
  const closeMenu = useAppStore((s) => s.closeMenu);
  const activeRoute = useAppStore((s) => s.activeRoute);
  const navigate = useAppStore((s) => s.navigate);
  const goBack = useAppStore((s) => s.goBack);
  const theme = useAppStore((s) => s.theme);
  const matchMode = useAppStore((s) => s.matchMode);
  const bridge = useAppStore((s) => s.bridge);
  const isLivePreviewCollapsed = useAppStore((s) => s.isLivePreviewCollapsed);
  const setLivePreviewCollapsed = useAppStore((s) => s.setLivePreviewCollapsed);
  const settingsTargetTab = useAppStore((s) => s.settingsTargetTab);
  const setSettingsTargetTab = useAppStore((s) => s.setSettingsTargetTab);
  const highlightSetting = useAppStore((s) => s.highlightSetting);
  const clearHighlightSetting = useAppStore((s) => s.clearHighlightSetting);
  const onlineSession = useAppStore((s) => s.onlineSession);
  const setMatchMode = useAppStore((s) => s.setMatchMode);
  const { renderScale: uiScale = 100, safeAreaMargin = 0 } = useViewportStore();

  const staticSessionMode = useStaticTrainingPackStore((s) => s.sessionMode);
  const isEdgeInspectorExpanded = useStaticTrainingPackStore((s) => s.isEdgeInspectorExpanded);
  const setEdgeInspectorExpanded = useStaticTrainingPackStore((s) => s.setEdgeInspectorExpanded);

  const isStaticTrainingEditActive =
    matchMode === 'static-training-pack' && staticSessionMode === 'edit';
  const hasExtraMainMenuItem =
    matchMode === 'match' || matchMode === 'online-warmup' || Boolean(onlineSession?.roomId);

  const isLight = theme === 'light';
  const developerMode = useAppStore((s) => s.developerMode);
  const isLayer1 = activeRoute === 'main-menu';
  const activePanelId = ROUTE_TO_PANEL_ID[activeRoute] || 'layer1-main';
  const activeSizing = useMenuLayoutStore(
    (s) => s.panels?.[activePanelId] ?? DEFAULT_PANEL_SIZING[activePanelId]
  );
  const expConfigParentRef = useRef<ActiveMenuRoute>('settings');
  const exhibitionParentRef = useRef<ActiveMenuRoute>('play');

  const {
    isDockState,
    isContentVisible,
    isPillContentVisible,
    handleTriggerCollapse,
    handleTriggerExpand,
    resetToExpanded,
  } = useLivePreviewDockTransition({
    activeRoute,
    isLivePreviewCollapsed,
    setLivePreviewCollapsed,
    bridge,
  });

  const [isShaking, setIsShaking] = useState(false);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerShake = () => {
    if (isShaking) return;
    setIsShaking(true);
    if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = setTimeout(() => {
      setIsShaking(false);
    }, 360);
  };

  useEffect(() => {
    return () => {
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (matchMode === 'online-warmup' && !onlineSession.signalingConnected) {
      useQuickNotificationStore.getState().pushNotification({
        id: 'signaling-disconnect',
        type: 'persistent',
        tone: 'warning',
        icon: 'wifi-off',
        duration: 0,
        content: 'Signaling server disconnected. Match continuing peer-to-peer.',
        buttons: [
          {
            label: 'Reconnect',
            color: 'amber',
            onClick: () => {
              useAppStore.getState().bridge.onReconnectSignaling?.();
            },
          },
        ],
      });
    } else {
      useQuickNotificationStore.getState().dismissNotification('signaling-disconnect');
    }
  }, [matchMode, onlineSession.signalingConnected]);

  return (
    <>
      <QuickNotificationSystem isLight={isLight} placement="bottom-right" />
      <HitboxReferenceOverlayLayer />
      <FloatingWindowManager isLight={isLight} renderWindowContent={renderFloatingWindowContent} />
      {matchMode === 'static-training-pack' && <StaticTrainingPackHUD isLight={isLight} />}
      <FloatingStackIcon
        isLight={isLight}
        absolute={true}
        isMenuOpen={isOpen && !isDockState}
        blockedTooltipText={
          activeRoute === 'settings'
            ? 'Please close settings window first'
            : 'Please close active menu first'
        }
        onBlockedClick={() => {
          triggerShake();
        }}
        onCloseWindowItem={handleFloatingStackCloseWindow}
      />

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
          isLight={isLight}
        >
          <StaticTrainingShotInspectorDrawer
            isLight={isLight}
            transparent={true}
            onCollapseDrawer={() => setEdgeInspectorExpanded(false)}
          />
        </EdgeInspectorDrawer>
      )}
      {!isOpen && isStaticTrainingEditActive && inspectorSlot}

      <MorphingShell
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) closeMenu();
        }}
        width={activeSizing.width}
        height={activeSizing.targetHeight}
        sizing={activeSizing}
        currentKey={activeRoute}
        isLight={isLight}
        isLayer1={isLayer1}
        isDockState={isDockState}
        isContentVisible={isContentVisible}
        isPillContentVisible={isPillContentVisible}
        onExpandDock={handleTriggerExpand}
        isShaking={isShaking}
        onBack={goBack}
        inspectorSlot={inspectorSlot}
        uiScale={uiScale}
        safeAreaMargin={safeAreaMargin}
        hasExtraMainMenuItem={hasExtraMainMenuItem}
        developerMode={developerMode}
      >
        {renderActiveMenuRoute({
          activeRoute,
          isLight,
          isStaticTrainingEditActive,
          settingsTargetTab,
          setSettingsTargetTab,
          highlightSetting,
          clearHighlightSetting,
          bridge,
          navigate,
          goBack,
          closeMenu,
          setMatchMode,
          handleTriggerCollapse,
          resetLivePreviewToExpanded: resetToExpanded,
          expConfigParentRef,
          exhibitionParentRef,
        })}
      </MorphingShell>
      <DialogueStackContainer isLight={isLight} />
    </>
  );
};
