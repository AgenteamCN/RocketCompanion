import React from 'react';
import { Sliders } from 'lucide-react';
import { PanelContainer, PanelHeader, PanelContent } from '../../ui-core/layout/Panel';
import { PanelFooter } from '../../ui-core/layout/PanelFooter';
import {
  UniversalThreeStageShell,
  FloatingWindowHeader,
  FloatingWindowContent,
  FloatingWindowFooter,
} from '../../ui-core/layout/UniversalThreeStageShell';
import { Badge } from '../../ui-core/primitives/Badge';
import { useMenuLayoutStore } from '../../ui-core/stores/menuLayoutStore';
import { createScopedSyncedState } from '../stores/crossClientSync';
import { CodeBlock } from '../CodeBlock';
import { PanelShellTuner } from './panels/PanelShellTuner';

const useState = createScopedSyncedState('page:panels');

export const PanelsPage: React.FC<{ isLight?: boolean }> = ({ isLight = false }) => {
  const {
    panelBodyPaddingX,
    panelBodyPaddingY,
    panelFooterPaddingX,
    panelFooterPaddingY,
    panelFooterFontSize,
    floatingOuterRadius,
    floatingHeaderPaddingX,
    floatingHeaderPaddingY,
    floatingBodyPaddingX,
    floatingBodyPaddingY,
    floatingFooterPaddingX,
    floatingFooterPaddingY,
    floatingFooterCornerReserveRightPx,
    floatingFooterFontSize,
  } = useMenuLayoutStore();

  const [hoveredDesc, setHoveredDesc] = useState<string | null>(null, 'hoveredDesc');
  const [floatingHoveredDesc, setFloatingHoveredDesc] = useState<string | null>(
    null,
    'floatingHoveredDesc'
  );

  return (
    <div className="flex flex-col gap-8 max-w-6xl w-full">
      <div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-2xl font-bold tracking-tight">
            Universal 3-Stage Shells (Menu &amp; Floating Window)
          </h1>
          <Badge variant="amber" size="sm" isLight={isLight}>
            Alpha-3 Mother Contract
          </Badge>
        </div>
        <p className={`text-xs mt-1 leading-relaxed ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
          Standard three-stage elastic shell specification unifying{' '}
          <strong>Menu Panels (`variant="menu"`)</strong> and{' '}
          <strong>Floating Windows (`variant="floating"`)</strong>: Stage 1 Header (`shrink-0`)
          calculates top-down height, Stage 3 Footer (`shrink-0 mt-auto`) anchors bottom-up, and
          Stage 2 Content (`flex-1 min-h-0`) fills remaining vertical space with independent
          scrolling. Token adjustments here persist to <code className="font-mono">localStorage</code>{' '}
          and automatically mark child surfaces as <code className="font-mono">template-stale</code>{' '}
          in Workspace Bravo.
        </p>
      </div>

      {/* Dual Anatomy Diagram: Variant A (Menu) + Variant B (Floating) */}
      <div
        className={`p-6 rounded-2xl border flex flex-col gap-5 ${
          isLight ? 'bg-white border-neutral-200 shadow-2xs' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold text-sm">
            Dual-Variant 3-Stage Shell Live Anatomy (Variant A: Menu Panel vs Variant B: Floating
            Window)
          </span>
          <span className={`text-[11px] font-mono ${isLight ? 'text-neutral-500' : 'text-neutral-400'}`}>
            Alpha:3StagePanelShell + Alpha:3StageFloatingShell
          </span>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          {/* Variant A: Menu 3-Stage Panel */}
          <div className="flex flex-col gap-2 w-full">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-amber-500">
                Variant A · Menu 3-Stage Shell (`variant="menu"`)
              </span>
              <span className="font-mono text-[11px] opacity-70">Alpha:3StagePanelShell</span>
            </div>

            <PanelContainer isLight={isLight} className="w-full my-1">
              <div className="relative">
                <PanelHeader
                  title="MENU PANEL TITLE"
                  onBack={() => {}}
                  onRightAction={() => {}}
                  rightActionLabel="Live Preview"
                  onRightActionHoverChange={(hovered) =>
                    setHoveredDesc(
                      hovered
                        ? 'Live Preview [TAB]: Collapse panel to side dock and inspect live 3D arena.'
                        : null
                    )
                  }
                  isLight={isLight}
                />
              </div>

              <div className="relative border-b border-dashed border-amber-500/40">
                <PanelContent scrollable={false} className="bg-amber-500/5">
                  <div
                    onMouseEnter={() =>
                      setHoveredDesc(
                        'Hovering Menu content item: Footer switches to high-contrast description.'
                      )
                    }
                    onMouseLeave={() => setHoveredDesc(null)}
                    className="p-4 rounded-xl border border-amber-500/30 text-xs text-center flex flex-col gap-1 cursor-pointer transition-colors hover:border-amber-500"
                  >
                    <span className="font-bold text-amber-500">
                      STAGE 2: MENU CONTENT BODY (Pad: {panelBodyPaddingX}px × {panelBodyPaddingY}px)
                    </span>
                    <span className="text-[11px] opacity-75">
                      Hover here or the top-right Minimize-2 button to preview live Footer linkage.
                    </span>
                  </div>
                </PanelContent>
              </div>

              <PanelFooter
                isLight={isLight}
                defaultDescription={`STAGE 3: MENU FOOTER (${panelFooterFontSize}px · Pad: ${panelFooterPaddingX}×${panelFooterPaddingY}px)`}
                hoveredDescription={hoveredDesc}
                rightLabel="Live Preview"
                rightShortcut="TAB"
                onRightClick={() => {}}
              />
            </PanelContainer>
          </div>

          {/* Variant B: Floating Window 3-Stage Shell */}
          <div className="flex flex-col gap-2 w-full">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-sky-500">
                Variant B · Floating Window 3-Stage Shell (`variant="floating"`)
              </span>
              <span className="font-mono text-[11px] opacity-70">Alpha:3StageFloatingShell</span>
            </div>

            <UniversalThreeStageShell
              variant="floating"
              isLight={isLight}
              outerRadius={floatingOuterRadius}
              className="w-full my-1"
              header={
                <FloatingWindowHeader
                  title="FLOATING TUNER WINDOW"
                  icon={<Sliders className="h-3.5 w-3.5 text-sky-500" />}
                  badge={
                    <Badge variant="primary" size="sm" isLight={isLight}>
                      Pad {floatingHeaderPaddingX}×{floatingHeaderPaddingY}
                    </Badge>
                  }
                  isLight={isLight}
                  onMinimize={() => {}}
                  onMinimizeHoverChange={(hovered) =>
                    setFloatingHoveredDesc(
                      hovered
                        ? 'Minimize [-]: Collapse floating window into top-right stack pill.'
                        : null
                    )
                  }
                />
              }
              footer={
                <FloatingWindowFooter
                  isLight={isLight}
                  reserveCornerDraggerSpace={true}
                  defaultDescription={`STAGE 3: FLOATING FOOTER (${floatingFooterFontSize}px · Pad: ${floatingFooterPaddingX}×${floatingFooterPaddingY}px · Corner Reserve: ${floatingFooterCornerReserveRightPx}px)`}
                  hoveredDescription={floatingHoveredDesc}
                />
              }
              cornerAccessory={
                <div
                  title={`Concentric Corner Resize Handle (Right Reserve: ${floatingFooterCornerReserveRightPx}px)`}
                  className="absolute bottom-1 right-1 w-4 h-4 pointer-events-none flex items-end justify-end opacity-80"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" className="text-sky-500">
                    <path
                      d="M 13 5 A 8 8 0 0 1 5 13"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              }
            >
              <FloatingWindowContent
                scrollable={false}
                paddedFallback={true}
                className="bg-sky-500/5 border-b border-dashed border-sky-500/40"
              >
                <div
                  onMouseEnter={() =>
                    setFloatingHoveredDesc(
                      'Hovering Floating content item: Footer switches to high-contrast description while reserving corner dragger clearance.'
                    )
                  }
                  onMouseLeave={() => setFloatingHoveredDesc(null)}
                  className="p-4 rounded-xl border border-sky-500/30 text-xs text-center flex flex-col gap-1 cursor-pointer transition-colors hover:border-sky-500"
                >
                  <span className="font-bold text-sky-500">
                    STAGE 2: FLOATING CONTENT BODY (Fallback Pad: {floatingBodyPaddingX}px ×{' '}
                    {floatingBodyPaddingY}px)
                  </span>
                  <span className="text-[11px] opacity-75">
                    Shared by all 29 User &amp; Dev Floating Windows with bottom-right concentric
                    resize handle clearance.
                  </span>
                </div>
              </FloatingWindowContent>
            </UniversalThreeStageShell>
          </div>
        </div>
      </div>

      {/* Live 3-Stage Compound Shell Tuner */}
      <PanelShellTuner isLight={isLight} />

      {/* Code Snippet */}
      <CodeBlock
        isLight={isLight}
        title="Agent Code Recipe (Menu & Floating 3-Stage Shell Contract)"
        code={`import { PanelContainer, PanelHeader, PanelContent, PanelFooter } from '@/ui-core/layout/Panel';
import {
  UniversalThreeStageShell,
  FloatingWindowHeader,
  FloatingWindowContent,
  FloatingWindowFooter,
} from '@/ui-core/layout/UniversalThreeStageShell';

// Variant A: Menu 3-Stage Panel (Alpha:3StagePanelShell)
<PanelContainer isLight={isLight} className="w-full max-w-[520px]">
  <PanelHeader title="PANEL TITLE" onBack={handleBack} isLight={isLight} />
  <PanelContent scrollable>
    {/* Inherits panelBodyPaddingX (${panelBodyPaddingX}px) × panelBodyPaddingY (${panelBodyPaddingY}px) */}
  </PanelContent>
  <PanelFooter isLight={isLight} defaultDescription="Idle hint." hoveredDescription={hoveredDesc} />
</PanelContainer>

// Variant B: Floating Window 3-Stage Shell (Alpha:3StageFloatingShell)
<UniversalThreeStageShell
  variant="floating"
  isLight={isLight}
  header={<FloatingWindowHeader title="TUNER TITLE" isLight={isLight} onMinimize={onMin} />}
  footer={<FloatingWindowFooter isLight={isLight} reserveCornerDraggerSpace defaultDescription="Ready." />}
>
  <FloatingWindowContent scrollable paddedFallback>
    {/* Inherits floatingBodyPaddingX (${floatingBodyPaddingX}px) × floatingBodyPaddingY (${floatingBodyPaddingY}px) */}
  </FloatingWindowContent>
</UniversalThreeStageShell>`}
      />
    </div>
  );
};
