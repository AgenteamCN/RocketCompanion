import React from 'react';
import { useAppStore } from '../../ui-core/stores/appStore.ts';
import type { AppState } from '../../ui-core/stores/appStoreTypes.ts';
import type { ActiveMenuRoute } from '../../ui-core/config/uiConfig.ts';
import { useExperimentalMultiBotsStore } from '../../ui-core/stores/experimentalMultiBotsStore.ts';
import { useStaticTrainingPackStore } from '../../ui-core/stores/staticTrainingPackStore.ts';
import { openStaticTrainingExitConfirmDialogue as openPureStaticTrainingExitConfirmDialogue } from '../../ui-core/recipes/StaticTrainingShotInspectorDrawer.tsx';

export interface MenuRouteRenderContext {
  activeRoute: ActiveMenuRoute;
  isLight: boolean;
  isStaticTrainingEditActive: boolean;
  settingsTargetTab: string;
  setSettingsTargetTab: (tab: string) => void;
  highlightSetting: string | null;
  clearHighlightSetting: () => void;
  bridge: AppState['bridge'];
  navigate: (route: ActiveMenuRoute) => void;
  goBack: () => void;
  closeMenu: () => void;
  setMatchMode: AppState['setMatchMode'];
  handleTriggerCollapse: () => void;
  resetLivePreviewToExpanded: () => void;
  expConfigParentRef: React.MutableRefObject<ActiveMenuRoute>;
  exhibitionParentRef: React.MutableRefObject<ActiveMenuRoute>;
}

function openStaticTrainingExitConfirmDialogue(
  onExitConfirmed?: (action: 'save' | 'ignore') => void | Promise<void>
): void {
  openPureStaticTrainingExitConfirmDialogue(async (action) => {
    if (action === 'save') {
      await useStaticTrainingPackStore.getState().commitEditSessionToMainDb();
    } else {
      await useStaticTrainingPackStore.getState().discardEditSessionChanges();
    }
    await onExitConfirmed?.(action);
  });
}

export async function leaveOnlineRoomAndCloseMenu(ctx: MenuRouteRenderContext): Promise<void> {
  if (ctx.bridge.onLeaveOnlineServer) {
    await ctx.bridge.onLeaveOnlineServer();
  }
  ctx.setMatchMode('freeplay');
  ctx.closeMenu();
}

export function dispatchMainMenuTabAction(target: string, ctx: MenuRouteRenderContext): void {
  const {
    navigate,
    closeMenu,
    setSettingsTargetTab,
    setMatchMode,
    bridge,
    expConfigParentRef,
    exhibitionParentRef,
  } = ctx;

  if (target === 'play' || target === 'garage' || target === 'manage-room') {
    navigate(target);
  } else if (target.startsWith('settings')) {
    const tab = target.split(':')[1];
    if (tab) setSettingsTargetTab(tab);
    navigate('settings');
  } else if (target === 'exp-multi-bots') {
    const { isExhibitionMode, activeSubMode } = useExperimentalMultiBotsStore.getState();
    if (isExhibitionMode) {
      exhibitionParentRef.current = 'main-menu';
      navigate('exhibition');
    } else {
      expConfigParentRef.current = 'main-menu';
      navigate(activeSubMode === 'botpack' ? 'exp-botpack-9700488' : 'exp-multi-bots');
    }
  } else if (target === 'restart-match') {
    bridge.onRestartMatch?.();
  } else if (target === 'return-freeplay') {
    setMatchMode('freeplay');
    closeMenu();
    bridge.onReturnToFreeplay?.();
  } else if (target === 'leave-room') {
    void leaveOnlineRoomAndCloseMenu(ctx);
  } else if (target === 'exit-edit-mode') {
    openStaticTrainingExitConfirmDialogue(() => {
      closeMenu();
      bridge.onReturnToFreeplay?.();
    });
  }
}

const PLAY_MENU_DIRECT_ROUTES: Record<string, ActiveMenuRoute> = {
  'self-training': 'self-training',
  'online-training': 'host-training',
  advanced: 'custom-play',
};

export function dispatchPlayMenuTabAction(modeId: string, ctx: MenuRouteRenderContext): void {
  if (modeId === 'exhibition') {
    ctx.exhibitionParentRef.current = 'play';
    ctx.navigate('exhibition');
  } else if (modeId === 'host-match' || modeId === 'join-room') {
    useAppStore.getState().setOnlineSession({ roomType: 'match', gameMode: '1v1' });
    ctx.navigate(modeId);
  } else if (PLAY_MENU_DIRECT_ROUTES[modeId]) {
    ctx.navigate(PLAY_MENU_DIRECT_ROUTES[modeId]);
  }
}
