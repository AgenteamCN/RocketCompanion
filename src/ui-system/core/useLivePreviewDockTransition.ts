import { useState, useEffect, useRef, useCallback } from 'react';
import { type ActiveMenuRoute } from '../../ui-core/config/uiConfig.ts';
import { type AppState } from '../../ui-core/stores/appStoreTypes.ts';
import { floatingStore } from '../../ui-core/stores/floatingStore.ts';

export type LivePreviewAnimPhase =
  | 'expanded'
  | 'collapsing_content'
  | 'collapsing_resize'
  | 'collapsed'
  | 'expanding_content'
  | 'expanding_resize';

export interface UseLivePreviewDockTransitionParams {
  activeRoute: ActiveMenuRoute;
  isLivePreviewCollapsed: boolean;
  setLivePreviewCollapsed: (collapsed: boolean) => void;
  bridge: AppState['bridge'];
}

export interface LivePreviewDockTransitionState {
  liveAnimPhase: LivePreviewAnimPhase;
  isDockState: boolean;
  isContentVisible: boolean;
  isPillContentVisible: boolean;
  handleTriggerCollapse: () => void;
  handleTriggerExpand: () => void;
  resetToExpanded: () => void;
}

export function useLivePreviewDockTransition({
  activeRoute,
  isLivePreviewCollapsed,
  setLivePreviewCollapsed,
  bridge,
}: UseLivePreviewDockTransitionParams): LivePreviewDockTransitionState {
  const [liveAnimPhase, setLiveAnimPhase] = useState<LivePreviewAnimPhase>(
    isLivePreviewCollapsed ? 'collapsed' : 'expanded'
  );

  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  }, []);

  useEffect(() => {
    return () => clearAllTimers();
  }, [clearAllTimers]);

  const handleTriggerCollapse = useCallback(() => {
    if (liveAnimPhase !== 'expanded') return;
    clearAllTimers();
    setLiveAnimPhase('collapsing_content');
    const t1 = setTimeout(() => {
      setLiveAnimPhase('collapsing_resize');
      bridge.onOverlayChange?.(false);
      bridge.onResume?.();
      const t2 = setTimeout(() => {
        setLiveAnimPhase('collapsed');
        setLivePreviewCollapsed(true);
      }, 260);
      timersRef.current.push(t2);
    }, 100);
    timersRef.current.push(t1);
  }, [liveAnimPhase, clearAllTimers, bridge, setLivePreviewCollapsed]);

  const handleTriggerExpand = useCallback(() => {
    if (liveAnimPhase !== 'collapsed') return;
    clearAllTimers();
    floatingStore.triggerBatchMinimize();
    setLiveAnimPhase('expanding_content');
    const t1 = setTimeout(() => {
      setLiveAnimPhase('expanding_resize');
      const t2 = setTimeout(() => {
        setLiveAnimPhase('expanded');
        setLivePreviewCollapsed(false);
        bridge.onOverlayChange?.(true);
      }, 260);
      timersRef.current.push(t2);
    }, 80);
    timersRef.current.push(t1);
  }, [liveAnimPhase, clearAllTimers, bridge, setLivePreviewCollapsed]);

  const resetToExpanded = useCallback(() => {
    clearAllTimers();
    setLiveAnimPhase('expanded');
  }, [clearAllTimers]);

  const isLivePreviewRoute = activeRoute === 'trajectory' || activeRoute === 'camera';

  useEffect(() => {
    if (isLivePreviewRoute) {
      if (isLivePreviewCollapsed && liveAnimPhase === 'expanded') {
        handleTriggerCollapse();
      } else if (!isLivePreviewCollapsed && liveAnimPhase === 'collapsed') {
        handleTriggerExpand();
      }
    } else {
      clearAllTimers();
      if (liveAnimPhase !== 'expanded') {
        setLiveAnimPhase('expanded');
      }
    }
  }, [
    isLivePreviewCollapsed,
    activeRoute,
    isLivePreviewRoute,
    liveAnimPhase,
    handleTriggerCollapse,
    handleTriggerExpand,
    clearAllTimers,
  ]);

  const isDockState =
    isLivePreviewRoute &&
    (liveAnimPhase === 'collapsed' ||
      liveAnimPhase === 'collapsing_resize' ||
      liveAnimPhase === 'expanding_content');

  const isContentVisible = !isDockState && liveAnimPhase === 'expanded';
  const isPillContentVisible = liveAnimPhase === 'collapsed';

  return {
    liveAnimPhase,
    isDockState,
    isContentVisible,
    isPillContentVisible,
    handleTriggerCollapse,
    handleTriggerExpand,
    resetToExpanded,
  };
}
