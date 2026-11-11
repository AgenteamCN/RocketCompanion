import React, { useCallback, useEffect, useRef, useState as useLocalState } from 'react';
import { Eye, X } from 'lucide-react';
import { MorphingStageShell } from '../../ui-core/navigation/MorphingStageShell';
import { Button } from '../../ui-core/primitives/Button';
import { KeycapBadge } from '../../ui-core/primitives/KeycapBadge';
import { SliderControl } from '../../ui-core/primitives/SliderControl';
import { Layer3BallTrajectoryRecipe } from '../../ui-core/recipes/Layer3BallTrajectoryRecipe';
import { StoreSnapshotScope } from '../../ui-core/stores/storeSnapshotScope';
import { useAppStore } from '../../ui-core/stores/appStore';
import { CodeBlock } from '../CodeBlock';
import { TunerConfigExporterBar } from '../components/tuner/TunerConfigExporterBar';
import { PageJumpDirectory, type JumpDirectoryItem } from '../PageJumpDirectory';
import { crossClientSync, useSyncedState } from '../stores/crossClientSync';

export interface LivePreviewSimulationPageProps {
  isLight?: boolean;
}

export type LivePreviewAnimPhase =
  | 'expanded'
  | 'collapsing_content'
  | 'collapsing_resize'
  | 'collapsed'
  | 'expanding_content'
  | 'expanding_resize';

const LIVE_PREVIEW_JUMP_ITEMS: JumpDirectoryItem[] = [
  {
    id: 'l6-live-preview-stage',
    code: '6C.1',
    name: 'MorphingStageShell & Layer3BallTrajectoryRecipe',
    label: 'Sequenced step transition between 480×540px center config panel and 88×38px right-middle TAB dock',
  },
  {
    id: 'l6-live-preview-controls',
    code: '6C.2',
    name: 'Live Preview Session & Ball Sim Speed Controller',
    label: 'Session state toggle, TAB dock morph trigger & 3D Ball Simulation speed control',
  },
];

const EXPANDED_W = 480;
const EXPANDED_H = 540;
const DOCK_W = 88;
const DOCK_H = 38;

export const LivePreviewSimulationPage: React.FC<LivePreviewSimulationPageProps> = ({
  isLight = false,
}) => {
  const isCollapsed = useAppStore((s) => s.isLivePreviewCollapsed);
  const setCollapsed = useAppStore((s) => s.setLivePreviewCollapsed);
  const [activePreviewId, setActivePreviewId] = useSyncedState<string | null>(
    'page:live-preview:activePreviewId',
    'ball-trajectory-predictor'
  );
  const exitPreview = () => {
    setActivePreviewId(null);
    setCollapsed(false);
  };

  const [animPhase, setAnimPhase] = useSyncedState<LivePreviewAnimPhase>(
    'page:live-preview:animPhase',
    isCollapsed ? 'collapsed' : 'expanded'
  );
  const [isPillHovered, setIsPillHovered] = useLocalState(false);
  const [ballSimSpeed, setBallSimSpeed] = useSyncedState<number>(
    'page:live-preview:ballSimSpeed',
    128
  );

  const handleTriggerCollapse = () => {
    if (animPhase !== 'expanded') return;
    setAnimPhase('collapsing_content');
    setTimeout(() => {
      setAnimPhase('collapsing_resize');
      setTimeout(() => {
        setAnimPhase('collapsed');
        setCollapsed(true);
      }, 260);
    }, 110);
  };

  const handleTriggerExpand = () => {
    if (animPhase !== 'collapsed') return;
    setAnimPhase('expanding_content');
    setTimeout(() => {
      setAnimPhase('expanding_resize');
      setTimeout(() => {
        setAnimPhase('expanded');
        setCollapsed(false);
      }, 260);
    }, 90);
  };

  useEffect(() => {
    if (isCollapsed && animPhase === 'expanded') handleTriggerCollapse();
    else if (!isCollapsed && animPhase === 'collapsed') handleTriggerExpand();
  }, [isCollapsed]);

  const handleToggle = () => {
    if (animPhase === 'expanded') handleTriggerCollapse();
    else if (animPhase === 'collapsed') handleTriggerExpand();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        handleToggle();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [animPhase]);

  const handleLaunch = () => {
    setActivePreviewId('ball-trajectory-predictor');
    setAnimPhase('expanded');
    setCollapsed(false);
  };

  const isDockState =
    animPhase === 'collapsed' ||
    animPhase === 'collapsing_resize' ||
    animPhase === 'expanding_content';
  const isContentVisible = animPhase === 'expanded';
  const isPillContentVisible = animPhase === 'collapsed';

  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useLocalState({ width: 900, height: 620 });

  useEffect(() => {
    if (!stageRef.current) return;
    const update = () => {
      if (stageRef.current) {
        setStageSize({
          width: stageRef.current.clientWidth,
          height: stageRef.current.clientHeight,
        });
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, []);

  const xExpanded = Math.max(16, Math.round((stageSize.width - EXPANDED_W) / 2));
  const yExpanded = Math.max(16, Math.round((stageSize.height - EXPANDED_H) / 2));
  const xDock = Math.max(16, Math.round(stageSize.width - 16 - DOCK_W));
  const yDock = Math.max(16, Math.round((stageSize.height - DOCK_H) / 2));

  const handleResetDefaults = useCallback(() => {
    crossClientSync.resetAll({ scopePrefix: 'page:live-preview:' });
    setCollapsed(false);
  }, [setCollapsed]);

  const buildExportCode = useCallback(() => {
    const snapshot = {
      activePreviewId,
      animPhase,
      ballSimSpeedKmh: ballSimSpeed,
      geometry: {
        expandedPanel: { widthPx: EXPANDED_W, heightPx: EXPANDED_H, radiusPx: 16 },
        rightMiddleDockPill: { widthPx: DOCK_W, heightPx: DOCK_H, radiusPx: 12, marginRightPx: 16 },
      },
      sequencedStepTimingsMs: {
        collapseContentFadeOut: 110,
        collapseResizeAndDock: 260,
        expandPillFadeOut: 90,
        expandResizeToCenter: 260,
      },
    };
    return `export const DEFAULT_6C_LIVE_PREVIEW_SNAPSHOT = ${JSON.stringify(snapshot, null, 2)};`;
  }, [activePreviewId, animPhase, ballSimSpeed]);

  return (
    <div className="flex flex-col gap-6 w-full relative">
      <div className="flex items-center justify-between gap-4 pb-2 border-b border-neutral-200/80 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-neutral-200/80 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 flex items-center justify-center shrink-0">
            <Eye className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">6C · Live Preview Real-time Preview Spec</h1>
            <p className={`text-xs mt-0.5 ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
              Dedicated mode for three-level depth parameter adjustment. Press{' '}
              <code className="font-mono text-neutral-900 dark:text-neutral-100 font-bold">TAB</code>{' '}
              for smooth temporal deformation between central config panel and right side Dock.
            </p>
          </div>
        </div>
      </div>

      <div
        id="l6-live-preview-stage"
        ref={stageRef}
        className={`scroll-mt-24 relative w-full min-h-[620px] rounded-2xl border p-6 flex items-center justify-center overflow-hidden transition-colors ${
          isLight ? 'bg-neutral-100/70 border-neutral-200 shadow-inner' : 'bg-neutral-950/80 border-neutral-800 shadow-inner'
        }`}
        style={{
          backgroundImage: isLight
            ? 'radial-gradient(#d4d4d8 1px, transparent 1px)'
            : 'radial-gradient(#27272a 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center pointer-events-none transition-opacity duration-300 ${
            animPhase === 'collapsed' ? 'opacity-100' : 'opacity-25'
          }`}
        >
          <div className="flex flex-col items-center gap-2 select-none">
            <span className={`text-5xl ${animPhase === 'collapsed' ? 'animate-bounce' : ''}`}>[Ball]</span>
            <span className="text-xs font-mono font-bold text-neutral-700 dark:text-neutral-300">
              [Three.js Simulation Active: Ball Speed {ballSimSpeed} km/h]
            </span>
            <span className="text-xs text-neutral-400 max-w-md text-center leading-relaxed">
              {animPhase === 'collapsed'
                ? '[*] Live Preview Collapsed to right Dock: Background gameplay 100% Resume rendering!'
                : 'Central panel expanded state: Background rendering auto-dimming and noise reduction.'}
            </span>
          </div>
        </div>

        <MorphingStageShell
          isLight={isLight}
          targetX={isDockState ? xDock : xExpanded}
          targetY={isDockState ? yDock : yExpanded}
          targetW={isDockState ? DOCK_W : EXPANDED_W}
          targetH={isDockState ? DOCK_H : EXPANDED_H}
          targetRadius={isDockState ? 12 : 16}
          isDockState={isDockState}
          isPillHovered={isPillHovered}
          onPillHoverChange={setIsPillHovered}
          isPillContentVisible={isPillContentVisible}
          isContentVisible={isContentVisible}
          onExpandFromDock={handleTriggerExpand}
        >
          {isContentVisible && (
            <StoreSnapshotScope overrides={{ appStore: { setLivePreviewCollapsed: handleTriggerCollapse } }}>
              <Layer3BallTrajectoryRecipe
                isLight={isLight}
                onBack={() => {
                  exitPreview();
                  setAnimPhase('expanded');
                }}
              />
            </StoreSnapshotScope>
          )}
        </MorphingStageShell>

        <div className="absolute bottom-4 left-4 flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-xl border bg-black/50 text-neutral-200 backdrop-blur border-white/10 select-none">
          <span>Live Session:</span>
          <strong className={activePreviewId ? 'text-emerald-400' : 'text-neutral-400'}>
            {activePreviewId ? 'ACTIVE' : 'IDLE'}
          </strong>
          <span>|</span>
          <span>State:</span>
          <strong className="text-neutral-100">
            {animPhase === 'collapsed'
              ? 'COLLAPSED (Right Dock)'
              : animPhase === 'expanded'
                ? 'EXPANDED (Center)'
                : animPhase.toUpperCase()}
          </strong>
          <span>|</span>
          <span className="flex items-center gap-1">
            Toggle shortcut: <KeycapBadge shortcut="TAB" size="sm" isLight={false} />
          </span>
        </div>
      </div>

      <div
        id="l6-live-preview-controls"
        className={`scroll-mt-24 flex flex-col gap-4 px-5 py-4 rounded-2xl border text-xs ${
          isLight ? 'bg-white border-neutral-200 shadow-2xs' : 'bg-neutral-900/70 border-neutral-800'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-mono text-neutral-500 dark:text-neutral-400">
            Session Control (Placed below View Box so toggling session state never alters the header above the stage):
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" isLight={isLight} onClick={handleToggle}>
              {animPhase === 'collapsed' ? 'Expand from Right Dock [TAB]' : 'Collapse to Right Dock [TAB]'}
            </Button>
            {!activePreviewId ? (
              <Button variant="primary" size="sm" isLight={isLight} icon={<Eye className="h-4 w-4" />} onClick={handleLaunch}>
                Invoke Live Preview Session
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                isLight={isLight}
                icon={<X className="h-4 w-4" />}
                onClick={() => {
                  exitPreview();
                  setAnimPhase('expanded');
                }}
              >
                Exit Live Preview
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-neutral-200/70 dark:border-neutral-800 items-center">
          <SliderControl
            label="3D Ball Trajectory Simulation Speed"
            value={ballSimSpeed}
            min={32}
            max={240}
            step={4}
            unit=" km/h"
            colorScheme="amber"
            editable
            onChange={setBallSimSpeed}
            isLight={isLight}
          />
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <span className="text-[11px] font-mono text-neutral-400 mr-1">Speed Presets:</span>
            {[64, 128, 180, 216].map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => setBallSimSpeed(spd)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border cursor-pointer transition-colors ${
                  ballSimSpeed === spd
                    ? 'bg-amber-500 text-neutral-950 border-amber-400 font-bold'
                    : isLight
                      ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-700'
                      : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300'
                }`}
              >
                {spd === 128 ? '128 km/h (Default)' : `${spd} km/h`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <TunerConfigExporterBar
        badge="6C-EXPORT"
        title="Live Preview Session & Dock Morph One-Click Config Exporter"
        subtitle="Exports 6C Live Preview session state, 3D ball simulation speed (km/h), center panel (480×540px) & right-middle dock pill (88×38px) geometry"
        copyLabel="Copy 6C Live Preview Config (Export Snapshot)"
        codeTitle="Current 6C Live Preview Parameter Snapshot"
        actionId="export-6c-live-preview-config"
        isLight={isLight}
        buildExportCode={buildExportCode}
        onResetDefaults={handleResetDefaults}
      />

      <PageJumpDirectory
        layerTag="Layer 6 · 6C Live Preview Spec"
        title="6C · Live Preview & Right-Middle TAB Dock Directory"
        subtitle="Click to locate the top-pinned MorphingStageShell or session speed controls · Export 6C scoped parameters"
        items={LIVE_PREVIEW_JUMP_ITEMS}
        isLight={isLight}
      />

      <CodeBlock
        isLight={isLight}
        title="Live Preview Continuous deformation timing implementation (Reflects Current 6C Parameters)"
        code={`// Step 1: Content Fade-Out (110ms) -> Step 2: Resize (${EXPANDED_W}×${EXPANDED_H}px -> ${DOCK_W}×${DOCK_H}px, 260ms) -> Step 3: Dock Pill
setAnimPhase('collapsing_content');
setAnimPhase('collapsing_resize');
setAnimPhase('collapsed');`}
      />
    </div>
  );
};
