import React, { useCallback } from 'react';
import { Columns, Layers, Rows } from 'lucide-react';
import type { HudSlotMode } from '../../ui-core/layout/HudAnchorStage';
import { SegmentedSwitch } from '../../ui-core/primitives/SegmentedSwitch';
import { ToggleSwitch } from '../../ui-core/primitives/ToggleSwitch';
import { CodeBlock } from '../CodeBlock';
import { TunerConfigExporterBar } from '../components/tuner/TunerConfigExporterBar';
import { PageJumpDirectory, type JumpDirectoryItem } from '../PageJumpDirectory';
import { crossClientSync, useSyncedState } from '../stores/crossClientSync';
import { StacksHudAnchorStageSection } from './stacks/StacksHudAnchorStageSection';

type StackGap = 'sm' | 'md' | 'lg';
const GAP_CLASS_MAP: Record<StackGap, string> = { sm: 'gap-2', md: 'gap-3.5', lg: 'gap-5' };

const STACKS_JUMP_ITEMS: JumpDirectoryItem[] = [
  {
    id: 'l2-stacks-1-vstack',
    code: 'L2.1',
    name: 'VStack (Vertical Stack Flow)',
    label: 'Vertical flex stack with configurable sm/md/lg spacing and divider',
  },
  {
    id: 'l2-stacks-2-hstack',
    code: 'L2.2',
    name: 'HStack (Horizontal Stack Flow)',
    label: 'Horizontal flex row with proportional gap tokens',
  },
  {
    id: 'l2-stacks-3-gridstack',
    code: 'L2.3',
    name: 'GridStack (Responsive Grid Array)',
    label: '2 / 3 / 4 column uniform grid container',
  },
  {
    id: 'l2-stacks-4-hud-anchor-stage',
    code: 'L2.4',
    name: 'HudAnchorStage / HudZone / HudSlot / HudRelativeAnchor',
    label: '3x3 spatial HUD anchor grid with 56px Top Split Band & reserve/collapse slot strategy',
  },
];

export const StacksPage: React.FC<{ isLight?: boolean }> = ({ isLight = true }) => {
  const [vGap, setVGap] = useSyncedState<StackGap>('page:stacks:vGap', 'md');
  const [hGap, setHGap] = useSyncedState<StackGap>('page:stacks:hGap', 'md');
  const [showDivider, setShowDivider] = useSyncedState<boolean>('page:stacks:showDivider', true);
  const [cols, setCols] = useSyncedState<2 | 3 | 4>('page:stacks:cols', 3);

  const [slotMode, setSlotMode] = useSyncedState<HudSlotMode>('page:stacks:slotMode', 'reserve');
  const [showTopBand, setShowTopBand] = useSyncedState<boolean>('page:stacks:showTopBand', true);
  const [showBoostSlot, setShowBoostSlot] = useSyncedState<boolean>(
    'page:stacks:showBoostSlot',
    true
  );
  const [showTopBandGuide, setShowTopBandGuide] = useSyncedState<boolean>(
    'page:stacks:showTopBandGuide',
    true
  );

  const stageStrategy = slotMode === 'reserve' ? 'reserve' : 'collapse-symmetric';

  const handleResetDefaults = useCallback(() => {
    crossClientSync.resetAll({ scopePrefix: 'page:stacks:' });
  }, []);

  const buildExportCode = useCallback(() => {
    const snapshot = {
      vStack: { gap: vGap, className: GAP_CLASS_MAP[vGap], showDivider },
      hStack: { gap: hGap, className: GAP_CLASS_MAP[hGap] },
      gridStack: { columns: cols },
      hudAnchorStage: {
        strategy: stageStrategy,
        slotMode,
        topSplitBandReservedHeightPx: 56,
        showTopBand,
        showBoostSlot,
        showTopBandGuide,
      },
    };
    return `// L2 Stacks & HudAnchorStage Layout Calibrated Default Snapshot\nexport const DEFAULT_L2_STACKS_AND_HUD_STAGE_SNAPSHOT = ${JSON.stringify(snapshot, null, 2)};`;
  }, [
    vGap,
    showDivider,
    hGap,
    cols,
    stageStrategy,
    slotMode,
    showTopBand,
    showBoostSlot,
    showTopBandGuide,
  ]);

  return (
    <div className="flex flex-col gap-8 max-w-5xl">
      <PageJumpDirectory
        layerTag="Layer 2 · Structural Layout Skeleton"
        title="L2 Stack & HudAnchorStage Layout Directory"
        subtitle="Zero L3–L7 business coupling · Covers VStack / HStack / GridStack & 3x3 HudAnchorStage spatial skeleton"
        items={STACKS_JUMP_ITEMS}
        isLight={isLight}
      />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          L2 Layout container (HStack / VStack / GridStack / HudAnchorStage)
        </h1>
        <p className={`text-xs mt-1 ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
          Pure structural skeleton layer (zero L3–L7 Business dependency) . Covers standard stream
          stack (VStack/HStack/GridStack) And dedicated to competitive HUD Nine-grid equal-height
          split stage (HudAnchorStage / HudTopSplitBand / HudZone / HudSlot / HudRelativeAnchor) .
        </p>
      </div>

      <TunerConfigExporterBar
        badge="L2-STACKS-EXPORT"
        title="L2 Stack & HudAnchorStage Parameter Tuner & One-Click Config Exporter"
        subtitle="Exports VStack/HStack gap tokens, GridStack columns & HudAnchorStage reserve/collapse slot strategy"
        copyLabel="Copy L2 Layout Config (Export Snapshot)"
        codeTitle="Current L2 Stack & HudAnchorStage Parameter Snapshot (Paste directly into DEFAULT_L2_STACKS_AND_HUD_STAGE_SNAPSHOT)"
        actionId="export-l2-stacks-config"
        isLight={isLight}
        buildExportCode={buildExportCode}
        onResetDefaults={handleResetDefaults}
      />

      {/* 1. VStack */}
      <div
        id="l2-stacks-1-vstack"
        className={`scroll-mt-24 p-6 rounded-2xl border flex flex-col gap-4 transition-colors ${
          isLight ? 'bg-white border-neutral-200 shadow-xs' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="font-bold text-sm flex items-center gap-2">
            <Rows className="h-4 w-4 text-amber-500" />
            <span>1. Vertical stack flow (VStack)</span>
          </span>
          <div className="flex items-center gap-3">
            <ToggleSwitch
              label="Divider"
              checked={showDivider}
              onCheckedChange={setShowDivider}
              isLight={isLight}
            />
            <SegmentedSwitch
              size="sm"
              value={vGap}
              onValueChange={(v) => setVGap(v as StackGap)}
              isLight={isLight}
              options={[
                { value: 'sm', label: 'Small (sm / 1.0%)' },
                { value: 'md', label: 'in (md / 1.8%)' },
                { value: 'lg', label: 'Large (lg / 2.8%)' },
              ]}
            />
          </div>
        </div>

        <div
          className={`flex flex-col ${GAP_CLASS_MAP[vGap]} ${
            showDivider
              ? isLight
                ? 'divide-y divide-neutral-200'
                : 'divide-y divide-neutral-800'
              : ''
          } p-4 rounded-xl border transition-colors ${
            isLight ? 'bg-neutral-50/80 border-neutral-200' : 'bg-neutral-950/40 border-neutral-800'
          }`}
        >
          <div
            className={`p-3 rounded-lg text-xs font-medium border transition-colors ${
              isLight
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
            }`}
          >
            VStack Element A (Top Section)
          </div>
          <div
            className={`p-3 rounded-lg text-xs font-medium border transition-colors ${
              isLight
                ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300'
            }`}
          >
            VStack Element B (Middle Section)
          </div>
          <div
            className={`p-3 rounded-lg text-xs font-medium border transition-colors ${
              isLight
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
            }`}
          >
            VStack Element C (Bottom Section)
          </div>
        </div>
      </div>

      {/* 2. HStack */}
      <div
        id="l2-stacks-2-hstack"
        className={`scroll-mt-24 p-6 rounded-2xl border flex flex-col gap-4 transition-colors ${
          isLight ? 'bg-white border-neutral-200 shadow-xs' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="font-bold text-sm flex items-center gap-2">
            <Columns className="h-4 w-4 text-emerald-500" />
            <span>2. Horizontal stack flow (HStack)</span>
          </span>
          <SegmentedSwitch
            size="sm"
            value={hGap}
            onValueChange={(v) => setHGap(v as StackGap)}
            isLight={isLight}
            options={[
              { value: 'sm', label: 'Small (sm / 1.0%)' },
              { value: 'md', label: 'in (md / 1.8%)' },
              { value: 'lg', label: 'Large (lg / 2.8%)' },
            ]}
          />
        </div>

        <div
          className={`flex items-center ${GAP_CLASS_MAP[hGap]} p-4 rounded-xl border transition-colors ${
            isLight ? 'bg-neutral-50/80 border-neutral-200' : 'bg-neutral-950/40 border-neutral-800'
          }`}
        >
          <div
            className={`flex-1 p-3 rounded-lg text-xs font-medium text-center border transition-colors ${
              isLight
                ? 'bg-white border-neutral-200 text-neutral-800 shadow-2xs'
                : 'bg-neutral-800 border-neutral-700 text-neutral-200'
            }`}
          >
            Item 1
          </div>
          <div
            className={`flex-1 p-3 rounded-lg text-xs font-medium text-center border transition-colors ${
              isLight
                ? 'bg-white border-neutral-200 text-neutral-800 shadow-2xs'
                : 'bg-neutral-800 border-neutral-700 text-neutral-200'
            }`}
          >
            Item 2
          </div>
          <div
            className={`flex-1 p-3 rounded-lg text-xs font-medium text-center border transition-colors ${
              isLight
                ? 'bg-white border-neutral-200 text-neutral-800 shadow-2xs'
                : 'bg-neutral-800 border-neutral-700 text-neutral-200'
            }`}
          >
            Item 3
          </div>
        </div>
      </div>

      {/* 3. GridStack */}
      <div
        id="l2-stacks-3-gridstack"
        className={`scroll-mt-24 p-6 rounded-2xl border flex flex-col gap-4 transition-colors ${
          isLight ? 'bg-white border-neutral-200 shadow-xs' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="font-bold text-sm flex items-center gap-2">
            <Layers className="h-4 w-4 text-amber-500" />
            <span>3. Responsive grid array (GridStack)</span>
          </span>
          <SegmentedSwitch
            size="sm"
            value={String(cols)}
            onValueChange={(v) => setCols(Number(v) as 2 | 3 | 4)}
            isLight={isLight}
            options={[
              { value: '2', label: '2 Cols' },
              { value: '3', label: '3 Cols' },
              { value: '4', label: '4 Cols' },
            ]}
          />
        </div>

        <div
          className={`grid ${
            cols === 2 ? 'grid-cols-2' : cols === 3 ? 'grid-cols-3' : 'grid-cols-4'
          } gap-3.5`}
        >
          {Array.from({ length: cols * 2 }).map((_, i) => (
            <div
              key={i}
              className={`p-4 rounded-xl border text-center text-xs font-mono transition-colors ${
                isLight
                  ? 'bg-white border-neutral-200 text-neutral-700 shadow-2xs'
                  : 'bg-neutral-950/40 border-neutral-800 text-neutral-300'
              }`}
            >
              Grid Item #{i + 1}
            </div>
          ))}
        </div>
      </div>

      <StacksHudAnchorStageSection
        slotMode={slotMode}
        onSlotModeChange={setSlotMode}
        showTopBand={showTopBand}
        onShowTopBandChange={setShowTopBand}
        showBoostSlot={showBoostSlot}
        onShowBoostSlotChange={setShowBoostSlot}
        showTopBandGuide={showTopBandGuide}
        onShowTopBandGuideChange={setShowTopBandGuide}
        isLight={isLight}
      />

      <CodeBlock
        isLight={isLight}
        title="Agent code recipe (Stack & HudAnchorStage Layout Recipe · Reflects Current Parameters)"
        code={`import {
  HudAnchorStage,
  HudZone,
  HudSlot,
  HudRelativeAnchor,
} from '@/ui-core/layout/HudAnchorStage';

// 1. Active HudAnchorStage Strategy: "${stageStrategy}" (slotMode="${slotMode}", showTopBand=${showTopBand}, showBoostSlot=${showBoostSlot})
<HudAnchorStage strategy="${stageStrategy}">
  <HudZone anchor="top-left" flush>
    <HudSlot visible={${showTopBand}} mode="${slotMode}" reservedHeight={56} innerClassName="h-[56px] flex items-center pl-3">
      <CompactTelemetryBarHUD />
    </HudSlot>
    <EdgePlayerHudStrip side="left" />
  </HudZone>

  <HudZone anchor="bottom-center">
    <HudRelativeAnchor
      placement="top"
      align="start"
      gap={8}
      floating
      attachment={<FlipIndicatorPillHUD />}
    >
      <VelocityProgressBar />
    </HudRelativeAnchor>
  </HudZone>

  <HudZone anchor="bottom-right" flush className="pb-3">
    <HudSlot visible={${showBoostSlot}} mode="reserve" innerClassName="pr-4">
      <CircularBoostGauge />
    </HudSlot>
  </HudZone>
</HudAnchorStage>`}
      />
    </div>
  );
};
