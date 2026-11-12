import React, { useRef, useEffect, useMemo } from 'react';
import { quickNotification } from '../../ui-core/stores/quickNotificationStore';
import { createScopedSyncedState } from '../stores/crossClientSync';
import {
  buildFloatingWindowCrossTabTarget,
  publishCrossTabActiveTarget,
  useCrossTabTargetFollow,
} from '../stores/crossTabTargetFollow';
import { readUrlParams, updateUrlParams } from '../stores/urlSync';
import { AppWindow } from 'lucide-react';
import { floatingSandboxStore, useFloatingStore } from '../../ui-core/stores/floatingStore';
import {
  USER_PRESET_WINDOWS,
  type PresetConfig,
  type FloatingWindowVisibilityTier,
} from '../../ui-core/stores/floatingPresets';
import { PRESET_WINDOWS } from '../../ui-core/stores/devFloatingPresets';
import { subscribeSurfaceCalibration } from '../../ui-core/manifest/surfaceCalibration';
import { FloatingWindowsCanvasStage } from './floating-windows/FloatingWindowsCanvasStage';
import { FloatingWindowsFlatMatrixWall } from './floating-windows/FloatingWindowsFlatMatrixWall';
import { FloatingWindowsScannerControlBar } from './floating-windows/FloatingWindowsScannerControlBar';
import { FloatingWindowsStageToolbar } from './floating-windows/FloatingWindowsStageToolbar';
import { FloatingWindowsAuditSection } from './floating-windows/FloatingWindowsAuditSection';
import {
  buildMergedFloatingPresets,
  useFloatingPlaylistState,
  useFloatingWindowsCalibration,
} from './floating-windows/useFloatingWindowsCalibration';
import { RapidReviewTriageBar } from '../components/review/RapidReviewTriageBar';
import { AutoConfigTunerPanel } from '../components/tuner/AutoConfigTunerPanel';

const useState = createScopedSyncedState('page:floating-windows-v2');

export interface FloatingWindowsSimulationPageProps {
  isLight?: boolean;
}

export const FloatingWindowsSimulationPage: React.FC<FloatingWindowsSimulationPageProps> = ({
  isLight = false,
}) => {
  const { totalCount, spawnWithFlight, clearAll } = useFloatingStore(floatingSandboxStore);

  const [calibrationVersion, setCalibrationVersion] = React.useState(0);
  useEffect(() => {
    return subscribeSurfaceCalibration(() => {
      setCalibrationVersion((v) => v + 1);
    });
  }, []);

  const userWindows = useMemo(() => buildMergedFloatingPresets('user'), [calibrationVersion]);
  const devWindows = useMemo(() => buildMergedFloatingPresets('developer'), [calibrationVersion]);
  const allWindows = useMemo(() => [...userWindows, ...devWindows], [userWindows, devWindows]);

  const [rawTier, setTier] = useState<FloatingWindowVisibilityTier>(() => {
    const params = readUrlParams();
    if (params.fw) {
      const match = PRESET_WINDOWS.find((p) => p.id === params.fw);
      if (match?.tier) return match.tier;
    }
    return params.tier === 'developer' ? 'developer' : 'user';
  }, 'tier');
  const tier: FloatingWindowVisibilityTier = rawTier === 'developer' ? 'developer' : 'user';
  const [rawFwMode, setFwMode] = useState<'inspector' | 'stack' | 'matrix'>(() => {
    const params = readUrlParams();
    if (params.fwMode === 'stack') return 'stack';
    if (params.fwMode === 'matrix') return 'matrix';
    return 'inspector';
  }, 'fwMode');
  const fwMode: 'inspector' | 'stack' | 'matrix' =
    rawFwMode === 'stack' ? 'stack' : rawFwMode === 'matrix' ? 'matrix' : 'inspector';
  const [selectedWindowId, setSelectedWindowId] = useState<string>(() => {
    const params = readUrlParams();
    if (params.fw && PRESET_WINDOWS.some((p) => p.id === params.fw)) {
      return params.fw;
    }
    return USER_PRESET_WINDOWS[0].id;
  }, 'selectedWindowId');
  const [activeSubTab, setActiveSubTab] = useState<string>(() => {
    const params = readUrlParams();
    if (params.fwTab) return params.fwTab;
    if (params.fw) {
      const match = PRESET_WINDOWS.find((p) => p.id === params.fw);
      if (match?.tabs && match.tabs.length > 0) return match.tabs[0].id;
    }
    return '';
  }, 'activeSubTab');

  const [containerPreset, setContainerPreset] = useState<'full' | '1080p-compact' | 'small-squeeze'>(
    'full',
    'containerPreset'
  );
  const [boundaryLocked, setBoundaryLocked] = useState<boolean>(false, 'boundaryLocked');
  const [manualBoundarySize, setManualBoundarySize] = useState<{
    width: number;
    height: number;
  }>({ width: 960, height: 700 }, 'manualBoundarySize');
  const [measuredCanvasSize, setMeasuredCanvasSize] = React.useState<{
    width: number;
    height: number;
  }>({ width: 960, height: 700 });

  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const update = () => {
      if (canvasRef.current) {
        setMeasuredCanvasSize({
          width: canvasRef.current.clientWidth || 960,
          height: canvasRef.current.clientHeight || 700,
        });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(canvasRef.current);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [fwMode]);

  const activeTierWindows = tier === 'user' ? userWindows : devWindows;
  const currentIndex = Math.max(
    0,
    activeTierWindows.findIndex((w) => w.id === selectedWindowId)
  );
  const currentPreset = activeTierWindows[currentIndex] || activeTierWindows[0];

  const { manualMinWidths, manualMinHeights, spawnPresetIntoSandbox } =
    useFloatingWindowsCalibration(currentPreset);

  const {
    activePlaylist,
    activePlaylistIdx,
    activePlaylistUnit,
    activePlaylistPresets,
    toolbarDisplayPreset,
  } = useFloatingPlaylistState({
    tier,
    fwMode,
    activeTierWindows,
    allWindows,
    currentPreset,
    activeSubTab,
    setTier,
    setSelectedWindowId,
    setActiveSubTab,
  });

  const { activeTarget, isFollowingStage } = useCrossTabTargetFollow();
  const lastFollowedTargetStampRef = useRef<number>(activeTarget.updatedAt);
  const suppressBroadcastForWindowRef = useRef<string | null>(null);

  // Honor explicit URL query parameters (`fw`, `fwTab`, `tier`) on mount / popstate
  // even when `useSyncedState` already holds a previously cached window ID in mirror.
  useEffect(() => {
    const syncFromUrl = () => {
      const params = readUrlParams();
      if (!params.fw) return;
      const matched = PRESET_WINDOWS.find((p) => p.id === params.fw);
      if (!matched) return;
      if (matched.tier && matched.tier !== tier) {
        setTier(matched.tier);
      }
      if (params.fw !== selectedWindowId) {
        suppressBroadcastForWindowRef.current = params.fw;
        setSelectedWindowId(params.fw);
      }
      if (params.fwTab !== undefined && params.fwTab !== activeSubTab) {
        setActiveSubTab(params.fwTab);
      } else if (!params.fwTab && matched.tabs && matched.tabs.length > 0 && !activeSubTab) {
        setActiveSubTab(matched.tabs[0].id);
      }
    };
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isFollowingStage) {
      lastFollowedTargetStampRef.current = activeTarget.updatedAt;
      return;
    }
    if (activeTarget.updatedAt <= lastFollowedTargetStampRef.current) return;
    lastFollowedTargetStampRef.current = activeTarget.updatedAt;

    if (
      activeTarget.kind === 'floating-window' &&
      activeTarget.floatingWindowId &&
      activeTarget.floatingWindowId !== selectedWindowId
    ) {
      suppressBroadcastForWindowRef.current = activeTarget.floatingWindowId;
      if (activeTarget.tier && activeTarget.tier !== tier) {
        setTier(activeTarget.tier);
      }
      setSelectedWindowId(activeTarget.floatingWindowId);
      if (activeTarget.subtab !== undefined) {
        setActiveSubTab(activeTarget.subtab);
      }
    }
  }, [
    isFollowingStage,
    activeTarget.kind,
    activeTarget.floatingWindowId,
    activeTarget.subtab,
    activeTarget.tier,
    activeTarget.updatedAt,
    selectedWindowId,
    tier,
    setTier,
    setSelectedWindowId,
    setActiveSubTab,
  ]);

  useEffect(() => {
    if (!currentPreset) return;
    if (
      suppressBroadcastForWindowRef.current &&
      suppressBroadcastForWindowRef.current !== currentPreset.id
    ) {
      return;
    }
    suppressBroadcastForWindowRef.current = null;
    publishCrossTabActiveTarget(
      buildFloatingWindowCrossTabTarget({
        windowId: currentPreset.id,
        title: currentPreset.title,
        subtab: activeSubTab || currentPreset.tabs?.[0]?.id,
        tier,
      })
    );
  }, [currentPreset?.id, currentPreset?.title, activeSubTab, tier]);

  useEffect(() => {
    updateUrlParams({
      tier,
      fw: currentPreset?.id || null,
      fwTab:
        currentPreset?.tabs && currentPreset.tabs.length > 0
          ? activeSubTab || currentPreset.tabs[0].id
          : null,
      fwMode,
    });
  }, [tier, currentPreset, activeSubTab, fwMode]);

  useEffect(() => {
    if (fwMode !== 'inspector' || !currentPreset) return;
    floatingSandboxStore.clearAll();
    spawnPresetIntoSandbox(currentPreset, true);
  }, [fwMode, currentPreset?.id, currentPreset?.width, currentPreset?.height]);

  const handleSwitchTier = (nextTier: FloatingWindowVisibilityTier) => {
    setTier(nextTier);
    const list = nextTier === 'user' ? userWindows : devWindows;
    const first = list[0];
    if (first) {
      setSelectedWindowId(first.id);
      setActiveSubTab(first.tabs?.[0]?.id || '');
    }
  };

  const handleSelectPreset = (preset: PresetConfig) => {
    setSelectedWindowId(preset.id);
    setActiveSubTab(preset.tabs?.[0]?.id || '');
    if (fwMode === 'stack') {
      spawnPresetIntoSandbox(preset);
    }
  };

  const handleStepWindow = (delta: number) => {
    if (activePlaylist.length === 0) return;
    const nextIdx =
      (activePlaylistIdx + delta + activePlaylist.length) % activePlaylist.length;
    const nextUnit = activePlaylist[nextIdx];
    if (!nextUnit) return;
    const windowChanged = nextUnit.windowId !== selectedWindowId;
    setSelectedWindowId(nextUnit.windowId);
    setActiveSubTab(nextUnit.subtab || '');
    if (windowChanged && fwMode === 'stack') {
      spawnPresetIntoSandbox(nextUnit.preset);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleStepWindow(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleStepWindow(1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePlaylistIdx, activePlaylist, selectedWindowId, fwMode, manualMinWidths, manualMinHeights]);

  const handleAddPresetToStack = (
    preset: PresetConfig,
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    if (!canvasRef.current) return;
    spawnWithFlight(preset, e.currentTarget, canvasRef.current);
  };

  const autoBoundaryW =
    containerPreset === '1080p-compact'
      ? Math.min(measuredCanvasSize.width, 760)
      : containerPreset === 'small-squeeze'
      ? Math.min(measuredCanvasSize.width, 520)
      : measuredCanvasSize.width;
  const autoBoundaryH =
    containerPreset === '1080p-compact'
      ? 520
      : containerPreset === 'small-squeeze'
      ? 380
      : 700;
  const effectiveBoundaryW = boundaryLocked ? manualBoundarySize.width : autoBoundaryW;
  const effectiveBoundaryH = boundaryLocked ? manualBoundarySize.height : autoBoundaryH;

  const handleToggleBoundaryLock = () => {
    if (!boundaryLocked) {
      const snapW = Math.max(320, Math.round(autoBoundaryW));
      const snapH = Math.max(260, Math.round(autoBoundaryH));
      setManualBoundarySize({ width: snapW, height: snapH });
      setBoundaryLocked(true);
      quickNotification.info(`Canvas Boundary Locked at ${snapW}×${snapH}px.`);
    } else {
      setBoundaryLocked(false);
      quickNotification.info('Canvas Boundary Unlocked (Auto-Adaptive).');
    }
  };

  const handleChangeManualBoundarySize = (next: { width: number; height: number }) => {
    setManualBoundarySize({
      width: Math.max(320, Math.min(2560, Math.round(next.width))),
      height: Math.max(260, Math.min(1600, Math.round(next.height))),
    });
    setBoundaryLocked(true);
  };

  return (
    <div className="flex flex-col gap-5 w-full relative">
      <div className="flex items-center justify-between gap-4 pb-2 border-b border-neutral-200/80 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
            <AppWindow className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Surface Workbench · Floating Window Calibration Suite
            </h1>
            <p className={`text-xs mt-0.5 ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
              Static top-pinned View Box stage — all window scanners, boundary locks, mode switchers, and Clear All Windows actions operate below the View Box.
            </p>
          </div>
        </div>
      </div>

      {fwMode === 'matrix' ? (
        <FloatingWindowsFlatMatrixWall
          isLight={isLight}
          tier={tier}
          selectedPreset={currentPreset}
        />
      ) : (
        <FloatingWindowsCanvasStage
          isLight={isLight}
          canvasRef={canvasRef}
          boundary={{
            containerPreset,
            boundaryLocked,
            manualBoundarySize,
          }}
          currentPreset={currentPreset}
          activeSubTab={activeSubTab}
          setActiveSubTab={setActiveSubTab}
          fwMode={fwMode}
          tier={tier}
          activeTierWindows={activeTierWindows}
          handleAddPresetToStack={handleAddPresetToStack}
        />
      )}

      <FloatingWindowsStageToolbar
        isLight={isLight}
        tier={tier}
        fwMode={fwMode}
        currentIndex={activePlaylistIdx}
        activeTierWindows={activePlaylistPresets}
        currentPreset={toolbarDisplayPreset}
        boundary={{
          containerPreset,
          setContainerPreset,
          boundaryLocked,
          effectiveBoundaryW,
          effectiveBoundaryH,
          setManualBoundarySize,
          handleChangeManualBoundarySize,
          handleToggleBoundaryLock,
        }}
        totalCount={totalCount}
        actions={{
          setFwMode,
          handleSwitchTier,
          handleStepWindow,
          clearAll,
        }}
      />
      <FloatingWindowsAuditSection
        isLight={isLight}
        tier={tier}
        fwMode={fwMode}
        currentIndex={currentIndex}
        currentPreset={currentPreset}
        activeSubTab={activeSubTab}
        playlistIndex={activePlaylistIdx}
        activePlaylistUnit={activePlaylistUnit}
      />

      <FloatingWindowsScannerControlBar
        isLight={isLight}
        tier={tier}
        fwMode={fwMode}
        currentIndex={currentIndex}
        activeTierWindows={activeTierWindows}
        currentPreset={currentPreset}
        containerPreset={containerPreset}
        activeSubTab={activeSubTab}
        actions={{
          setContainerPreset,
          setActiveSubTab,
          handleSwitchTier,
          handleStepWindow,
          handleSelectPreset,
        }}
      />

      <AutoConfigTunerPanel
        surfaceId={`floating:${currentPreset?.id ?? 'replay-viewer'}`}
        surfaceLabel={currentPreset?.title}
        defaultSizing={{
          width: currentPreset?.width ?? 480,
          height: currentPreset?.height ?? 600,
          minWidth: currentPreset?.minWidth,
          minHeight: currentPreset?.minHeight,
          maxHeight: currentPreset?.maxHeight,
          mode: currentPreset?.autoFitHeight ? 'adaptive' : 'fixed',
        }}
        isLight={isLight}
      />

      <RapidReviewTriageBar isLight={isLight} />
    </div>
  );
};
