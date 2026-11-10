import React, { useEffect, useRef } from 'react';
import { RuntimeViewportHost } from './core/RuntimeViewportHost.tsx';
import { MenuShell } from './core/MenuShell.tsx';
import { useAppStore } from '../ui-core/stores/appStore.ts';
import { copyAndLogLayoutSnapshot } from './core/UIInspector.ts';
import {
  floatingStore,
  configureFloatingStorePersistence,
} from '../ui-core/stores/floatingStore.ts';
import { FLOATING_WINDOW_OPACITY_PRESET } from '../ui-core/stores/floatingPresets.ts';
import { getInitialFloatingOpacity, saveFloatingOpacity } from '../ui-core/config/uiConfig.ts';
import { useStaticTrainingPackStore } from '../ui-core/stores/staticTrainingPackStore.ts';
import { useCloudProfileSyncStore } from '../ui-core/stores/cloudProfileSyncStore.ts';
import { dialogue } from '../ui-core/compounds/dialogue/dialogueStore.ts';
import { ensureSignalingProfileBridge } from './core/runtimeSignalingProfileBridge.ts';
import { activateNameTagOffscreenForDeveloperMode } from '../ui-core/stores/nameTagTunerStore.ts';

configureFloatingStorePersistence({
  getInitialOpacity: getInitialFloatingOpacity,
  onSaveOpacity: saveFloatingOpacity,
});
floatingStore.setOpacity(getInitialFloatingOpacity());

export interface GameUIRootProps {
  portalContainer?: HTMLElement | null;
}

export const GameUIRoot: React.FC<GameUIRootProps> = () => {
  const developerMode = useAppStore((s) => s.developerMode);
  const rootRef = useRef<HTMLDivElement>(null);
  const opacityInitRef = useRef(false);

  useEffect(() => {
    ensureSignalingProfileBridge();
  }, []);

  // Auto-generate Floating Window Opacity in default Stack and auto-activate Off-Screen Indicator if Developer Mode is active
  useEffect(() => {
    if (developerMode && !opacityInitRef.current) {
      opacityInitRef.current = true;
      activateNameTagOffscreenForDeveloperMode();
      const existing = floatingStore
        .getSnapshot()
        .windows.some((w) => w.id === FLOATING_WINDOW_OPACITY_PRESET.id);
      if (!existing) {
        const w = FLOATING_WINDOW_OPACITY_PRESET.width ?? 320;
        const h = FLOATING_WINDOW_OPACITY_PRESET.height ?? 100;
        const centerPos =
          typeof window !== 'undefined'
            ? {
                x: Math.max(20, Math.round((window.innerWidth - w) / 2)),
                y: Math.max(20, Math.round((window.innerHeight - h) / 2)),
              }
            : undefined;

        floatingStore.spawnWindow({
          ...FLOATING_WINDOW_OPACITY_PRESET,
          position: centerPos,
          startMinimized: true,
        });
      }
    }
  }, [developerMode]);

  // Global hotkeys: Escape and TAB
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || (e as any).__keybindingCaptureHandled) {
        return;
      }

      if (dialogue.getCount() > 0) {
        return;
      }

      const state = useAppStore.getState();
      const packStore = useStaticTrainingPackStore.getState();
      const isEditSessionActive =
        state.matchMode === 'static-training-pack' && packStore.sessionMode === 'edit';

      // 1. Tab key:
      // - When menu is open on 'trajectory' or 'camera' (and not in Remote Profile Tuning mode), toggles Live Preview dock
      // - When menu is closed and Static Training Pack Edit Mode is active, toggles EdgeInspectorDrawer
      if (e.key === 'Tab') {
        if (
          state.isOpen &&
          !useCloudProfileSyncStore.getState().activeRemoteSession &&
          (state.activeRoute === 'trajectory' || state.activeRoute === 'camera')
        ) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          state.setLivePreviewCollapsed(!state.isLivePreviewCollapsed);
          return;
        }
        if (!state.isOpen && isEditSessionActive) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          packStore.toggleEdgeInspectorExpanded();
          return;
        }
      }

      // 2. Escape key exclusively handles the Main Menu navigation stack (completely orthogonal to EdgeInspectorDrawer)
      if (e.key === 'Escape') {
        if (e.repeat) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (state.isOpen) {
          if (state.isLivePreviewCollapsed) {
            state.setLivePreviewCollapsed(false);
          } else {
            state.goBack();
          }
        } else {
          state.openMenu('main-menu');
        }
        return;
      }

      // 3. F8 hotkey: Manual 60s FIFO Training Replay Export in Solo Free Play & Online Warmup
      if (
        e.key === 'F8' &&
        !e.repeat &&
        !state.isOpen &&
        (state.matchMode === 'freeplay' || state.matchMode === 'online-warmup')
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (state.matchMode === 'online-warmup') {
          void state.bridge?.onExportOnlineTrainingReplay?.(60);
        } else {
          void state.bridge?.onExportRecentTrainingReplay?.(60);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as any).exportLayoutSnapshot = (customLabel?: string) => {
      const state = useAppStore.getState();
      const packState = useStaticTrainingPackStore.getState();
      const isEditActive =
        state.matchMode === 'static-training-pack' && packState.sessionMode === 'edit';
      const defaultLabel = state.isOpen
        ? state.activeRoute
        : isEditActive
          ? 'static-training-pack-edit'
          : state.activeRoute;
      return copyAndLogLayoutSnapshot(customLabel || defaultLabel);
    };
  }, []);

  return (
    <div ref={rootRef} className="contents">
      <RuntimeViewportHost>
        <MenuShell inspectorSlot={null} />
      </RuntimeViewportHost>
    </div>
  );
};
