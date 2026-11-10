import React, { useState } from 'react';
import { GraphStar, Info } from 'lucide-react';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import { SettingActionRow } from '../compounds/SettingActionRow';
import { DevScenarioRunnerSection } from './layer-sections/DevScenarioRunnerSection';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useSettingActionRowStore } from '../stores/settingRowStore';
import { useSignalingProfileStore } from '../stores/signalingProfileStore';
import { useAppStore } from '../stores/appStore';
import { useScopedStore } from '../stores/storeSnapshotScope';
import { DEFAULT_PANEL_SIZING } from '../tokens/menuLayoutTokens';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';

export type Layer3DevSelfTestRecipeProps = StandardSurfaceProps;

export const SURFACE_META: SurfaceMeta = {
  id: 'layer3-dev-self-test',
  title: 'SELF TEST',
  subtitle: 'Automated Subsystem Self-Test Suites & Scenario Runner',
  description:
    'Automated subsystem self-test suites, VirtualClock fast-forward scenario runner, and Golden Baseline verification harnesses.',
  icon: 'bug-play',
  layer: 'layer3',
  menuGroup: 'menu-layer',
  defaultSizing: {
    mode: 'adaptive',
    width: DEFAULT_PANEL_SIZING['layer3-dev-self-test'].width,
    height: DEFAULT_PANEL_SIZING['layer3-dev-self-test'].targetHeight,
    minHeight: DEFAULT_PANEL_SIZING['layer3-dev-self-test'].minHeight,
    maxHeight: DEFAULT_PANEL_SIZING['layer3-dev-self-test'].maxHeight,
  },
  variants: [
    {
      variantId: 'dev-private',
      label: 'Dev-Private Source (4-Server Lab + Scenario Runner)',
      storeOverrides: {
        signalingProfileStore: { source: 'dev-private' },
      },
    },
    {
      variantId: 'public-default',
      label: 'Public / Bundle Source (Scenario Runner Ready)',
      storeOverrides: {
        signalingProfileStore: { source: 'public-default' },
      },
    },
  ],
};

/**
 * [Recipe] Layer 3 Developer — Self Test (`bug-play`)
 * Permanently mounts the `window.__rcScenarioDriver` VirtualClock Scenario Runner
 * (suite/script selection, 1x/10x/20x/50x speed control, Golden diff audit, and JSON export),
 * alongside the `4-Server Signaling & Bridge Lab` when `source === 'dev-private'`.
 */
export const Layer3DevSelfTestRecipe: React.FC<Layer3DevSelfTestRecipeProps> = ({
  isLight = false,
  onBack: propOnBack,
}) => {
  const goBack = useScopedStore('appStore', useAppStore, (s) => s.goBack);
  const navigate = useScopedStore('appStore', useAppStore, (s) => s.navigate);
  const signalingSource = useScopedStore(
    'signalingProfileStore',
    useSignalingProfileStore,
    (s) => s.source,
  );
  const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);

  const onBack = propOnBack ?? goBack;
  const sizing = useMenuLayoutStore(
    (s) =>
      s.panels?.['layer3-dev-self-test'] ??
      DEFAULT_PANEL_SIZING['layer3-dev-self-test'],
  );
  const { rowGap } = useSettingActionRowStore();
  const showSignalingSelfTest = signalingSource === 'dev-private';

  return (
    <PanelContainer isLight={isLight} sizing={sizing} className="w-full select-none">
      <PanelHeader title="SELF TEST" onBack={onBack} isLight={isLight} />

      <PanelContent scrollable>
        <div
          data-layout="dev-self-test-list"
          className="flex flex-col w-full"
          style={{ gap: `${Math.max(6, rowGap)}px` }}
        >
          {showSignalingSelfTest && (
            <SettingActionRow
              icon={GraphStar}
              iconName="graph-star"
              iconColor="text-cyan-400"
              title="4-Server Signaling & Bridge Lab"
              actionLabel="Browse"
              description="4-Server Full-Mesh (emqx_cn, emqx_gb, supabase_jp, supabase_sg) & Dual Edge Bridge Self-Test"
              hoverDescription="Open Layer 4 4-Server Signaling & Dual Edge Bridge Lab: Inspect emqx_cn, emqx_gb, supabase_jp, and supabase_sg physical dir/brg topic isolation, 4-bit connectivity mask, and One-Click Full Diagnostic."
              onAction={() => navigate('dev-signaling-lab')}
              onHover={setHoveredDesc}
              onLeave={() => setHoveredDesc(null)}
              isLight={isLight}
            />
          )}

          <DevScenarioRunnerSection isLight={isLight} onHoverDesc={setHoveredDesc} />
        </div>
      </PanelContent>

      <PanelFooter
        isLight={isLight}
        defaultDescription="Automated subsystem self-test suites and developer verification harnesses."
        hoveredDescription={hoveredDesc}
        icon={<Info className="h-3.5 w-3.5 text-neutral-400 shrink-0" />}
      />
    </PanelContainer>
  );
};
