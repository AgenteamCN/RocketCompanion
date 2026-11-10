import React, { useMemo, useState } from 'react';
import { Info, Play } from 'lucide-react';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import { SettingActionRow } from '../compounds/SettingActionRow';
import { useAppStore } from '../stores/appStore';
import { useExperimentalMultiBotsStore } from '../stores/experimentalMultiBotsStore';
import { floatingStore } from '../stores/floatingStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useSettingActionRowStore } from '../stores/settingRowStore';
import {
  useSubsystemIsolationLabStore,
  type DevTestLabTab as IsolationDevTestLabTab,
} from '../stores/subsystemIsolationLabStore';
import { useScopedStore } from '../stores/storeSnapshotScope';
import {
  EXPERIMENTAL_BOT_PACK_PRESET,
  EXPERIMENTAL_MULTI_BOTS_PRESET,
  SUBSYSTEM_ISOLATION_LAB_PRESET,
} from '../stores/devFloatingPresets';
import { DEFAULT_PANEL_SIZING } from '../tokens/menuLayoutTokens';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import {
  resolveSandboxBenchSpecs,
  type DevSandboxBenchSpec,
  type DevTestLabTab,
  type LayerDevTestLabTab,
} from './dev/devSandboxBenchesCatalog';

export type { DevTestLabTab, LayerDevTestLabTab };
export type Layer3DevSandboxesRecipeProps = StandardSurfaceProps;

export const SURFACE_META: SurfaceMeta = {
  id: 'layer3-dev-sandboxes',
  title: 'SANDBOXES',
  subtitle: 'Isolated Subsystem Selector & Test Benches',
  description:
    'Select an isolated subsystem to enter its dedicated test environment.',
  icon: 'flask-conical',
  layer: 'layer3',
  menuGroup: 'menu-layer',
  defaultSizing: {
    mode: 'adaptive',
    width: DEFAULT_PANEL_SIZING['layer3-dev-sandboxes'].width,
    height: DEFAULT_PANEL_SIZING['layer3-dev-sandboxes'].targetHeight,
    minHeight: DEFAULT_PANEL_SIZING['layer3-dev-sandboxes'].minHeight,
    maxHeight: DEFAULT_PANEL_SIZING['layer3-dev-sandboxes'].maxHeight,
  },
};

/**
 * [Recipe] Layer 3 Sandboxes — Isolated Subsystem Selector
 * Data-driven `menuGroup === 'sandboxes'` & `SANDBOX_BENCH_SPECS` list with Store-First navigation and launch actions.
 */
export const Layer3DevSandboxesRecipe: React.FC<Layer3DevSandboxesRecipeProps> = ({
  isLight = false,
  onBack: propOnBack,
}) => {
  const storeGoBack = useScopedStore('appStore', useAppStore, (s) => s.goBack);
  const navigate = useScopedStore('appStore', useAppStore, (s) => s.navigate);
  const closeMenu = useScopedStore('appStore', useAppStore, (s) => s.closeMenu);
  const matchMode = useScopedStore('appStore', useAppStore, (s) => s.matchMode);
  const bridge = useScopedStore('appStore', useAppStore, (s) => s.bridge);

  const activeLabTab = useScopedStore(
    'subsystemIsolationLabStore',
    useSubsystemIsolationLabStore,
    (s) => s.activeTab
  );
  const setSelectedTab = useScopedStore(
    'subsystemIsolationLabStore',
    useSubsystemIsolationLabStore,
    (s) => s.setSelectedTab
  );
  const applyAndRestartLab = useScopedStore(
    'subsystemIsolationLabStore',
    useSubsystemIsolationLabStore,
    (s) => s.applyAndRestartLab
  );
  const expActiveSubMode = useScopedStore(
    'experimentalMultiBotsStore',
    useExperimentalMultiBotsStore,
    (s) => s.activeSubMode
  );

  const onBack = propOnBack ?? storeGoBack;
  const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);

  const sizing = useMenuLayoutStore(
    (s) =>
      s.panels?.['layer3-dev-sandboxes'] ??
      DEFAULT_PANEL_SIZING['layer3-dev-sandboxes']
  );

  const {
    rowGap,
    buttonFontSize,
    buttonPaddingX,
    buttonPaddingY,
    buttonRadius,
  } = useSettingActionRowStore();

  const activeBenchId: DevTestLabTab | null =
    matchMode === 'dev-test-lab'
      ? activeLabTab
      : matchMode === 'exp-multi-bots'
        ? expActiveSubMode === 'botpack'
          ? 'exp-botpack-9700488'
          : 'exp-multi-bots'
        : null;

  const benchSpecs = useMemo(() => resolveSandboxBenchSpecs(), []);

  const enterSandboxBench = (tab: DevTestLabTab) => {
    if (tab === 'exp-multi-bots') {
      const expStore = useExperimentalMultiBotsStore.getState();
      expStore.activateMultiBotsSubMode(true);
      if (matchMode === 'exp-multi-bots') {
        expStore.startOrApplyMatch();
        closeMenu();
      } else {
        bridge.onStartExpMultiBots?.();
      }
      return;
    }

    if (tab === 'exp-botpack-9700488') {
      const expStore = useExperimentalMultiBotsStore.getState();
      expStore.activateBotpackSubMode(undefined, true);
      if (matchMode === 'exp-multi-bots') {
        expStore.startOrApplyMatch();
        closeMenu();
      } else {
        bridge.onStartExpMultiBots?.();
      }
      return;
    }

    if (tab === 'tem-pack-converter') {
      navigate('dev-tem-pack-converter');
      return;
    }

    if (tab === 'replay-to-rcs-importer') {
      if (bridge.onStartReplayToRcsImporter) {
        bridge.onStartReplayToRcsImporter();
      } else {
        closeMenu();
      }
      return;
    }

    const labTab = tab as IsolationDevTestLabTab;
    setSelectedTab(labTab);
    applyAndRestartLab(labTab);
    if (matchMode === 'dev-test-lab') {
      closeMenu();
    } else {
      bridge.onStartDevTestLab?.();
    }
  };

  const handleLaunchSubsystem = (
    bench: DevSandboxBenchSpec,
    sourceEl?: HTMLElement | null
  ) => {
    const tab = bench.id;
    if (tab === 'tem-pack-converter') {
      navigate('dev-tem-pack-converter');
      return;
    }
    if (tab === 'exp-multi-bots' && !sourceEl) {
      useExperimentalMultiBotsStore.getState().activateMultiBotsSubMode(false);
      navigate('exp-multi-bots');
      return;
    }
    if (tab === 'exp-botpack-9700488' && !sourceEl) {
      useExperimentalMultiBotsStore
        .getState()
        .activateBotpackSubMode(undefined, false);
      navigate('exp-botpack-9700488');
      return;
    }

    if (tab === 'exp-botpack-9700488') {
      floatingStore.closeWindow(EXPERIMENTAL_MULTI_BOTS_PRESET.id);
    } else if (tab === 'exp-multi-bots') {
      floatingStore.closeWindow(EXPERIMENTAL_BOT_PACK_PRESET.id);
    }

    const targetPreset = bench.preset ?? SUBSYSTEM_ISOLATION_LAB_PRESET;
    floatingStore.setOpacity(70);
    const snap = floatingStore.getSnapshot();
    const exists =
      snap.windows.some((w) => w.id === targetPreset.id) ||
      snap.activeFlight?.preset?.id === targetPreset.id;
    if (!exists && typeof document !== 'undefined') {
      const containerEl =
        document.getElementById('game-ui-viewport-host') || document.body;
      if (sourceEl && containerEl) {
        floatingStore.spawnWithFlight(targetPreset, sourceEl, containerEl);
      } else {
        floatingStore.spawnWindow({
          ...targetPreset,
          startMinimized: true,
        });
      }
    }
    enterSandboxBench(tab);
  };

  return (
    <PanelContainer isLight={isLight} sizing={sizing} className="w-full">
      <PanelHeader title="SANDBOXES" onBack={onBack} isLight={isLight} />

      <PanelContent scrollable>
        <div
          data-layout="sandboxes-list"
          className="flex flex-col w-full"
          style={{ gap: `${rowGap}px` }}
        >
          {benchSpecs.map((bench) => {
            const isRunning = activeBenchId === bench.id;
            return (
              <SettingActionRow
                key={bench.id}
                icon={bench.icon}
                iconColor={bench.iconColor}
                title={bench.title}
                description={bench.summary}
                bordered={false}
                showDescription={false}
                hoverDescription={bench.details}
                onAction={() => handleLaunchSubsystem(bench)}
                onHover={setHoveredDesc}
                onLeave={() => setHoveredDesc(null)}
                isLight={isLight}
                rightSlot={
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLaunchSubsystem(bench, e.currentTarget);
                    }}
                    style={{
                      fontSize: `${buttonFontSize}px`,
                      paddingLeft: `${buttonPaddingX}px`,
                      paddingRight: `${buttonPaddingX}px`,
                      paddingTop: `${buttonPaddingY}px`,
                      paddingBottom: `${buttonPaddingY}px`,
                      borderRadius: `${Math.max(0, buttonRadius)}px`,
                    }}
                    className={`shrink-0 font-semibold border transition-all duration-150 cursor-pointer inline-flex items-center gap-1.5 leading-tight active:scale-95 whitespace-nowrap ${
                      isLight
                        ? 'bg-neutral-200/60 group-hover:bg-neutral-200/95 hover:!bg-neutral-300/90 border-neutral-300/80 text-neutral-800'
                        : 'bg-white/[0.06] group-hover:bg-white/[0.11] hover:!bg-white/[0.16] border-white/[0.10] group-hover:border-white/[0.16] text-neutral-200'
                    }`}
                  >
                    <Play
                      style={{
                        width: `${Math.max(11, buttonFontSize)}px`,
                        height: `${Math.max(11, buttonFontSize)}px`,
                      }}
                      className="fill-current shrink-0"
                    />
                    <span>{isRunning ? 'Restart' : 'Enter'}</span>
                  </button>
                }
              />
            );
          })}
        </div>
      </PanelContent>

      <PanelFooter
        isLight={isLight}
        defaultDescription="Select an isolated subsystem to enter its dedicated test environment."
        hoveredDescription={hoveredDesc}
        icon={<Info className="h-3.5 w-3.5 text-neutral-400 shrink-0" />}
      />
    </PanelContainer>
  );
};
