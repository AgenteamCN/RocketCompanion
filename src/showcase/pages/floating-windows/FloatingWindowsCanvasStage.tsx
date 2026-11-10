import React from 'react';
import { Plus, X } from 'lucide-react';
import { CodeBlock } from '../../CodeBlock';
import {
  floatingSandboxStore,
  useFloatingStore,
} from '../../../ui-core/stores/floatingStore';
import {
  type PresetConfig,
  type FloatingWindowVisibilityTier,
} from '../../../ui-core/stores/floatingPresets';
import { PRESET_WINDOWS } from '../../../ui-core/stores/devFloatingPresets';
import { FloatingStackIcon } from '../../../ui-core/navigation/FloatingStackIcon';
import { FloatingWindowManager } from '../../../ui-core/navigation/FloatingWindowManager';
import { FloatingWindowIcon } from '../../../ui-core/navigation/FloatingWindowIcon';
import { renderFloatingWindowPanel } from '../../../ui-core/panels/floatingWindowRegistry';

export interface FloatingCanvasBoundaryState {
  containerPreset: 'full' | '1080p-compact' | 'small-squeeze';
  boundaryLocked?: boolean;
  manualBoundarySize?: { width: number; height: number };
}

export interface FloatingWindowsCanvasStageProps {
  isLight: boolean;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  boundary: FloatingCanvasBoundaryState;
  currentPreset: PresetConfig | undefined;
  activeSubTab: string;
  setActiveSubTab: (tab: string) => void;
  fwMode: 'inspector' | 'stack';
  tier: FloatingWindowVisibilityTier;
  activeTierWindows: PresetConfig[];
  handleAddPresetToStack: (preset: PresetConfig, e: React.MouseEvent<HTMLButtonElement>) => void;
}

export const FloatingWindowsCanvasStage: React.FC<FloatingWindowsCanvasStageProps> = ({
  isLight,
  canvasRef,
  boundary: { containerPreset, boundaryLocked = false, manualBoundarySize },
  currentPreset,
  activeSubTab,
  setActiveSubTab,
  fwMode,
  tier,
  activeTierWindows,
  handleAddPresetToStack,
}) => {
  const { windows, minimizedCount, totalCount, opacity, closeWindow } =
    useFloatingStore(floatingSandboxStore);
  const lockedW = boundaryLocked && manualBoundarySize ? manualBoundarySize.width : undefined;
  const lockedH = boundaryLocked && manualBoundarySize ? manualBoundarySize.height : undefined;

  return (
    <>
      <div
        ref={canvasRef}
        className={`relative mx-auto rounded-2xl border p-6 overflow-hidden transition-all duration-300 ${
          isLight
            ? 'bg-neutral-100/70 border-neutral-200 shadow-inner'
            : 'bg-neutral-950/80 border-neutral-800 shadow-inner'
        }`}
        style={{
          width: lockedW
            ? `${lockedW}px`
            : containerPreset === 'full'
            ? '100%'
            : containerPreset === '1080p-compact'
            ? '760px'
            : '520px',
          maxWidth: '100%',
          height: lockedH
            ? `${lockedH}px`
            : containerPreset === 'full'
            ? '700px'
            : containerPreset === '1080p-compact'
            ? '520px'
            : '380px',
          backgroundImage: isLight
            ? 'radial-gradient(#d4d4d8 1px, transparent 1px)'
            : 'radial-gradient(#27272a 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-25 select-none">
          <span className="text-3xl mb-1">[Play]</span>
          <span className="text-xs font-mono font-bold text-neutral-800 dark:text-neutral-200">
            [Active 3D Arena Canvas · Opacity {opacity}% · Active Windows: {totalCount} · Minimized: {minimizedCount}]
          </span>
          <span className="text-[11px] text-neutral-400 max-w-md text-center mt-1">
            All floating windows run in a unified decoupled environment FloatingWindowManager In-container, Includes bottom hover description Footer, Bottom-right concentric arc Corner Arc Resize handle and unbounded free-form scaling. 
          </span>
        </div>

        <FloatingStackIcon
          isLight={isLight}
          store={floatingSandboxStore}
          absolute={true}
          containerRef={canvasRef}
        />

        <FloatingWindowManager
          isLight={isLight}
          store={floatingSandboxStore}
          containerRef={canvasRef}
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
          renderWindowContent={(item, ctx) =>
            renderFloatingWindowPanel(item.id, {
              isLight: ctx.isLight,
              activeTab: item.id === currentPreset?.id ? activeSubTab || undefined : undefined,
              onTabChange: item.id === currentPreset?.id ? setActiveSubTab : undefined,
            })
          }
        />

        {fwMode === 'stack' && (
          <div
            className={`absolute bottom-4 left-4 z-30 max-w-[360px] max-h-[340px] overflow-y-auto w-full p-3 rounded-2xl border backdrop-blur-md select-none transition-colors ${
              isLight
                ? 'bg-white/95 border-neutral-300 text-neutral-900 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_0_16px_rgba(0,0,0,0.12)]'
                : 'bg-neutral-900/95 border-neutral-700 text-neutral-100 shadow-[0_0_0_1px_rgba(255,255,255,0.16),0_0_20px_rgba(0,0,0,0.7),0_0_28px_rgba(255,255,255,0.06)]'
            }`}
          >
            <div className="flex items-center justify-between pb-2 border-b border-neutral-200/80 dark:border-neutral-800 mb-2">
              <span className="text-xs font-bold tracking-tight">
                {tier === 'user' ? 'USER PRESET WINDOWS' : 'DEV PRESET WINDOWS'} ({activeTierWindows.length})
              </span>
              <span className="text-[10px] font-mono text-neutral-400">Enqueues to Stack</span>
            </div>

            <div className="flex flex-col gap-1.5">
              {activeTierWindows.map((preset) => {
                const isSingleton = preset.singleton ?? true;
                const existingWindow = isSingleton
                  ? windows.find((w) => w.id === preset.id || w.id.startsWith(preset.id))
                  : null;

                return (
                  <div
                    key={preset.id}
                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border text-xs transition-colors ${
                      isLight
                        ? 'bg-neutral-50 hover:bg-neutral-100 border-neutral-200'
                        : 'bg-neutral-800/60 hover:bg-neutral-800 border-neutral-700/60'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <FloatingWindowIcon
                        id={preset.id}
                        category={preset.category}
                        className="h-3.5 w-3.5 text-neutral-800 dark:text-neutral-200 shrink-0"
                      />
                      <span className="font-medium truncate text-xs" title={preset.title}>
                        {preset.title}
                      </span>
                    </div>

                    {existingWindow ? (
                      <button
                        type="button"
                        onClick={() => closeWindow(existingWindow.id)}
                        title={`Remove ${preset.title} from stack`}
                        className="h-6 w-6 rounded-lg border flex items-center justify-center cursor-pointer transition-all active:scale-95 outline-none bg-red-500/15 hover:bg-red-500/25 border-red-400/40 text-red-500 shrink-0"
                      >
                        <X className="h-3.5 w-3.5 stroke-[2.5]" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => handleAddPresetToStack(preset, e)}
                        title={`Enqueue ${preset.title} into top-right Stack`}
                        className={`h-6 w-6 rounded-lg border flex items-center justify-center cursor-pointer transition-all active:scale-95 outline-none shrink-0 ${
                          isLight
                            ? 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-white'
                            : 'bg-neutral-100 hover:bg-white border-neutral-200 text-neutral-950 font-bold'
                        }`}
                      >
                        <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <CodeBlock
        isLight={isLight}
        title="Floating Window Decoupled registry and call specification (L4 Shell + L6 Panel Registry)"
        code={`import { FloatingWindowManager } from '@/ui-core/navigation/FloatingWindowManager';
import { renderFloatingWindowPanel } from '@/ui-core/panels/floatingWindowRegistry';

// L4 FloatingWindowManager Keep 100% Clean Shell, via renderWindowContent Inject L6 Standardized business panel: 
<FloatingWindowManager
  isLight={isLight}
  containerRef={stageRef}
  renderWindowContent={(item, ctx) =>
    renderFloatingWindowPanel(item.id, { isLight: ctx.isLight })
  }
/>`}
      />
    </>
  );
};
