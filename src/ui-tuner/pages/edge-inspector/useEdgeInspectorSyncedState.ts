import { useCallback, useState as useLocalState } from 'react';
import type { EdgeDrawerSide } from '../../../ui-core/navigation/EdgeInspectorDrawer';
import {
  INITIAL_TRAINING_SHOTS,
  type EditSubMode,
  type StaticTrainingShotItem,
} from '../../../ui-core/recipes/static-training/staticTrainingTypes';
import { crossClientSync, useSyncedState } from '../../stores/crossClientSync';

export type ActiveEscMenuRoute = 'none' | 'main-menu' | 'play' | 'garage' | 'settings';

export function useEdgeInspectorSyncedState() {
  const [isDrawerExpanded, setIsDrawerExpanded] = useSyncedState<boolean>(
    'page:edge-inspector:isDrawerExpanded',
    true
  );
  const [escMenuRoute, setEscMenuRoute] = useSyncedState<ActiveEscMenuRoute>(
    'page:edge-inspector:escMenuRoute',
    'none'
  );
  const [drawerSide, setDrawerSide] = useSyncedState<EdgeDrawerSide>(
    'page:edge-inspector:drawerSide',
    'right'
  );
  const [expandedWidth, setExpandedWidth] = useSyncedState<number>(
    'page:edge-inspector:expandedWidth',
    520
  );
  const [collapsedWidth, setCollapsedWidth] = useSyncedState<number>(
    'page:edge-inspector:collapsedWidth',
    88
  );
  const [topOffset, setTopOffset] = useSyncedState<number>(
    'page:edge-inspector:topOffset',
    72
  );
  const [bottomOffset, setBottomOffset] = useSyncedState<number>(
    'page:edge-inspector:bottomOffset',
    184
  );

  const [shots, setShots] = useSyncedState<StaticTrainingShotItem[]>(
    'page:edge-inspector:shots',
    INITIAL_TRAINING_SHOTS
  );
  const [selectedShotIndex, setSelectedShotIndex] = useSyncedState<number>(
    'page:edge-inspector:selectedShotIndex',
    0
  );
  const [isInspectingShot, setIsInspectingShot] = useSyncedState<boolean>(
    'page:edge-inspector:isInspectingShot',
    false
  );
  const [editSubMode, setEditSubMode] = useSyncedState<EditSubMode>(
    'page:edge-inspector:editSubMode',
    'car-heading'
  );
  const [feedbackToast, setFeedbackToast] = useLocalState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setFeedbackToast(msg);
    window.setTimeout(() => setFeedbackToast(null), 2600);
  }, []);

  const handleResetParams = useCallback(() => {
    crossClientSync.resetAll({ scopePrefix: 'page:edge-inspector:' });
    showToast('[ok] Reset EdgeInspectorDrawer Default geometry and offset parameters');
  }, [showToast]);

  const buildExportCode = useCallback(() => {
    const snapshot = {
      drawerGeometry: {
        side: drawerSide,
        expandedWidthPx: expandedWidth,
        collapsedWidthPx: collapsedWidth,
        topOffsetPx: topOffset,
        bottomOffsetPx: bottomOffset,
        edgeMarginPx: 16,
        shortcutKey: 'TAB',
      },
      sessionState: {
        isDrawerExpanded,
        isInspectingShot,
        selectedShotIndex,
        editSubMode,
        escMenuRoute,
        shotCount: shots.length,
      },
    };
    return `// 6E EdgeInspectorDrawer & Static Training Editor Calibrated Default Snapshot\nexport const DEFAULT_6E_EDGE_INSPECTOR_SNAPSHOT = ${JSON.stringify(snapshot, null, 2)};`;
  }, [
    drawerSide,
    expandedWidth,
    collapsedWidth,
    topOffset,
    bottomOffset,
    isDrawerExpanded,
    isInspectingShot,
    selectedShotIndex,
    editSubMode,
    escMenuRoute,
    shots.length,
  ]);

  return {
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
  };
}
