import React, { useCallback } from 'react';
import { MorphingShell } from '../../ui-core/navigation/MorphingShell';
import { Badge } from '../../ui-core/primitives/Badge';
import { Button } from '../../ui-core/primitives/Button';
import { Layer1MainMenuRecipe } from '../../ui-core/recipes/Layer1MainMenuRecipe';
import { Layer2GarageRecipe } from '../../ui-core/recipes/Layer2GarageRecipe';
import { Layer2PlayRecipe } from '../../ui-core/recipes/Layer2PlayRecipe';
import { Layer2SettingsRecipe } from '../../ui-core/recipes/Layer2SettingsRecipe';
import { Layer3AcousticsEqualizerRecipe } from '../../ui-core/recipes/Layer3AcousticsEqualizerRecipe';
import { Layer3BallTrajectoryRecipe } from '../../ui-core/recipes/Layer3BallTrajectoryRecipe';
import { StoreSnapshotScope } from '../../ui-core/stores/storeSnapshotScope';
import type { ContainerTransitionMode } from '../../ui-core/tokens/easing';
import { CodeBlock } from '../CodeBlock';
import { TunerConfigExporterBar } from '../components/tuner/TunerConfigExporterBar';
import { PageJumpDirectory, type JumpDirectoryItem } from '../PageJumpDirectory';
import { crossClientSync, useSyncedState } from '../stores/crossClientSync';

type DemoRoute = 'main' | 'play' | 'garage' | 'settings' | 'audio-eq' | 'trajectory';

const ROUTE_WIDTH_MAP: Record<DemoRoute, number> = {
  main: 420,
  play: 680,
  garage: 680,
  settings: 680,
  'audio-eq': 480,
  trajectory: 560,
};

const NAVIGATION_JUMP_ITEMS: JumpDirectoryItem[] = [
  {
    id: 'l4-nav-1-sandbox',
    code: 'L4-N.1',
    name: 'MorphingShell Interactive Modal Sandbox',
    label: '3-Tier ESC Menu hierarchy (420px Layer 1 -> 680px Layer 2 -> 480px/560px Layer 3)',
  },
  {
    id: 'l4-nav-2-recipe',
    code: 'L4-N.2',
    name: 'MorphingShell Route & Width Mapping Recipe',
    label: 'Dynamic code recipe reflecting active route and transition mode',
  },
];

export const NavigationPage: React.FC<{ isLight?: boolean }> = ({ isLight = false }) => {
  const [isOpen, setIsOpen] = useSyncedState<boolean>('page:navigation:isOpen', false);
  const [currentRoute, setCurrentRoute] = useSyncedState<DemoRoute>(
    'page:navigation:currentRoute',
    'main'
  );
  const [history, setHistory] = useSyncedState<DemoRoute[]>('page:navigation:history', ['main']);
  const [targetSettingsTab, setTargetSettingsTab] = useSyncedState<string>(
    'page:navigation:targetSettingsTab',
    'gameplay'
  );
  const [bgRenderPaused] = useSyncedState<boolean>('page:navigation:bgRenderPaused', true);
  const [transitionMode, setTransitionMode] = useSyncedState<ContainerTransitionMode>(
    'page:navigation:transitionMode',
    'fluid-morph'
  );

  const navigateTo = (r: DemoRoute) => {
    setHistory((prev) => [...prev, r]);
    setCurrentRoute(r);
  };

  const goBack = () => {
    if (history.length > 1) {
      const next = history.slice(0, -1);
      setHistory(next);
      setCurrentRoute(next[next.length - 1]);
    } else {
      setIsOpen(false);
    }
  };

  const isLayer1 = currentRoute === 'main';

  const handleResetDefaults = useCallback(() => {
    crossClientSync.resetAll({ scopePrefix: 'page:navigation:' });
  }, []);

  const buildExportCode = useCallback(() => {
    const snapshot = {
      transitionMode,
      activeRoute: currentRoute,
      activeWidthPx: ROUTE_WIDTH_MAP[currentRoute],
      targetSettingsTab,
      bgRenderPaused,
      routeWidthMap: ROUTE_WIDTH_MAP,
    };
    return `// L4 Navigation & MorphingShell Calibrated Default Snapshot\nexport const DEFAULT_L4_NAVIGATION_SNAPSHOT = ${JSON.stringify(snapshot, null, 2)};`;
  }, [transitionMode, currentRoute, targetSettingsTab, bgRenderPaused]);

  return (
    <div className="flex flex-col gap-8 max-w-4xl">
      <PageJumpDirectory
        layerTag="Layer 4 · Navigation & Modal Hierarchy"
        title="L4 Navigation & MorphingShell Quick Jump Directory"
        subtitle="Click to locate the 3-tier ESC modal sandbox or dynamic code recipe · Export L4 navigation parameters"
        items={NAVIGATION_JUMP_ITEMS}
        isLight={isLight}
      />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Navigation Navigation and modal system</h1>
        <p className={`text-xs mt-1 ${isLight ? 'text-neutral-600' : 'text-neutral-400'}`}>
          New benchmarking game ESC Real-time menu hierarchy: Layer 1 (420px Center MENU Root Menu)
          → Layer 2 (Play Mode / Garage Modify / Settings Settings, All are 680px) → Layer 3 (audio
          EQ 480px). Level-one menu instant launch (No background blur or dimming, Surrounding
          projection highlight) ; Secondary and tertiary menu background 250ms Gradient fade no
          blur, Support direct click to exit, support FluidMorph Continuous fluid and SequencedStep
          Three-step.
        </p>
      </div>

      <TunerConfigExporterBar
        badge="L4-NAV-EXPORT"
        title="Navigation & MorphingShell Parameter Tuner & One-Click Config Exporter"
        subtitle="Exports MorphingShell transitionMode (fluid-morph / sequenced-step), route width hierarchy & default route settings"
        copyLabel="Copy L4 Navigation Config (Export Snapshot)"
        codeTitle="Current L4 Navigation & MorphingShell Parameter Snapshot (Paste directly into DEFAULT_L4_NAVIGATION_SNAPSHOT)"
        actionId="export-l4-navigation-config"
        isLight={isLight}
        buildExportCode={buildExportCode}
        onResetDefaults={handleResetDefaults}
      />

      {/* Interactive Trigger Card */}
      <div
        id="l4-nav-1-sandbox"
        className={`scroll-mt-24 p-6 rounded-2xl border flex flex-col gap-4 ${
          isLight ? 'bg-white border-neutral-200 shadow-2xs' : 'bg-neutral-900/60 border-neutral-800'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="font-bold text-sm">
              Real-time interaction sandbox: Open global game popup (Launch Morphing Menu)
            </span>
            <span className="text-xs text-neutral-400">
              Three-part layout MENU Root Menu, click Play, Garage or Settings Smoothly morph to
              secondary menu
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              onClick={() => {
                setCurrentRoute('main');
                setHistory(['main']);
                setIsOpen(true);
              }}
              isLight={isLight}
            >
              Launch Morphing Menu
            </Button>
          </div>
        </div>

        <div
          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono p-3 rounded-xl border transition-colors ${
            isLight
              ? 'bg-neutral-50/80 border-neutral-200 text-neutral-700'
              : 'border-neutral-800 bg-neutral-950/40 text-neutral-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className={isLight ? 'text-neutral-500' : 'text-neutral-400'}>Current route:</span>
            <Badge variant="primary" size="sm" isLight={isLight}>
              {currentRoute.toUpperCase()}
            </Badge>
            <span className="text-neutral-400">|</span>
            <span className={isLight ? 'text-neutral-500' : 'text-neutral-400'}>
              Hierarchy:{' '}
              <strong className="text-amber-500">
                {currentRoute === 'main'
                  ? 'Layer 1 (MENU Root Menu)'
                  : currentRoute === 'audio-eq' || currentRoute === 'trajectory'
                    ? 'Layer 3 (Depth panel)'
                    : 'Layer 2 (Secondary features)'}
              </strong>
            </span>
            <span className="text-neutral-400">|</span>
            <span className={isLight ? 'text-neutral-500' : 'text-neutral-400'}>
              Width: <strong className="text-amber-500">{ROUTE_WIDTH_MAP[currentRoute]}px</strong>
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-neutral-500 text-[11px]">animation:</span>
            <button
              type="button"
              onClick={() => setTransitionMode('fluid-morph')}
              className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer border ${
                transitionMode === 'fluid-morph'
                  ? 'bg-amber-500 text-white border-amber-500 font-bold'
                  : isLight
                    ? 'bg-white border-neutral-300 text-neutral-700'
                    : 'bg-neutral-800 border-neutral-700 text-neutral-300'
              }`}
            >
              FluidMorph
            </button>
            <button
              type="button"
              onClick={() => setTransitionMode('sequenced-step')}
              className={`px-2 py-0.5 rounded text-[11px] font-mono cursor-pointer border ${
                transitionMode === 'sequenced-step'
                  ? 'bg-amber-500 text-white border-amber-500 font-bold'
                  : isLight
                    ? 'bg-white border-neutral-300 text-neutral-700'
                    : 'bg-neutral-800 border-neutral-700 text-neutral-300'
              }`}
            >
              SequencedStep
            </button>
          </div>
        </div>
      </div>

      {/* The Morphing Shell Modal */}
      <MorphingShell
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) {
            setCurrentRoute('main');
            setHistory(['main']);
          }
        }}
        width={ROUTE_WIDTH_MAP[currentRoute]}
        currentKey={currentRoute}
        isLight={isLight}
        isLayer1={isLayer1}
        onBack={goBack}
        transitionMode={transitionMode}
        enableDiagnostics={true}
      >
        {currentRoute === 'main' && (
          <StoreSnapshotScope
            overrides={{
              appStore: {
                menuPowerSave: bgRenderPaused ? 'extreme' : '30',
              },
            }}
          >
            <Layer1MainMenuRecipe
              isLight={isLight}
              onBack={() => setIsOpen(false)}
              onTabChange={(target) => {
                if (target === 'play') navigateTo('play');
                else if (target === 'garage') navigateTo('garage');
                else if (target.startsWith('settings')) {
                  const tab = target.split(':')[1];
                  if (tab) setTargetSettingsTab(tab);
                  navigateTo('settings');
                }
              }}
            />
          </StoreSnapshotScope>
        )}

        {currentRoute === 'play' && (
          <Layer2PlayRecipe
            isLight={isLight}
            onBack={goBack}
            onTabChange={(mode) => alert(`Selected mode: ${mode}`)}
          />
        )}

        {currentRoute === 'garage' && <Layer2GarageRecipe isLight={isLight} onBack={goBack} />}

        {currentRoute === 'settings' && (
          <StoreSnapshotScope
            overrides={{
              appStore: {
                settingsTargetTab: targetSettingsTab,
                navigate: (route: string) => {
                  if (route === 'acoustics-equalizer' || route === 'audio-eq') {
                    navigateTo('audio-eq');
                  } else if (route === 'trajectory') {
                    navigateTo('trajectory');
                  }
                },
              },
            }}
          >
            <Layer2SettingsRecipe
              isLight={isLight}
              activeTab={targetSettingsTab}
              onBack={goBack}
            />
          </StoreSnapshotScope>
        )}

        {currentRoute === 'audio-eq' && (
          <Layer3AcousticsEqualizerRecipe isLight={isLight} onBack={goBack} />
        )}

        {currentRoute === 'trajectory' && (
          <Layer3BallTrajectoryRecipe isLight={isLight} onBack={goBack} />
        )}
      </MorphingShell>

      <div id="l4-nav-2-recipe" className="scroll-mt-24">
        <CodeBlock
          isLight={isLight}
          title="Agent code recipe (Morphing Shell Navigation Recipe · Reflects Current Parameters)"
          code={`import { MorphingShell } from '@/ui-core/navigation/MorphingShell';
import { Layer1MainMenuRecipe } from '@/ui-core/recipes/Layer1MainMenuRecipe';
import { Layer2PlayRecipe } from '@/ui-core/recipes/Layer2PlayRecipe';
import { Layer2GarageRecipe } from '@/ui-core/recipes/Layer2GarageRecipe';
import { Layer2SettingsRecipe } from '@/ui-core/recipes/Layer2SettingsRecipe';
import { Layer3AcousticsEqualizerRecipe } from '@/ui-core/recipes/Layer3AcousticsEqualizerRecipe';

// Routing and size mapping config (Active Route: "${currentRoute}" @ ${ROUTE_WIDTH_MAP[currentRoute]}px, transitionMode: "${transitionMode}")
const ROUTES = ${JSON.stringify(ROUTE_WIDTH_MAP, null, 2)};

<MorphingShell
  open={isOpen}
  onOpenChange={setIsOpen}
  width={ROUTES[activeRoute]}
  currentKey={activeRoute}
  isLayer1={activeRoute === 'main'}
  transitionMode="${transitionMode}"
  onBack={goBack}
  isLight={isLight}
>
  {activeRoute === 'main' && <Layer1MainMenuRecipe onResume={...} onNavigatePlay={...} onNavigateGarage={...} onNavigateSettings={...} />}
  {activeRoute === 'play' && <Layer2PlayRecipe onBack={goBack} />}
  {activeRoute === 'garage' && <Layer2GarageRecipe onBack={goBack} />}
  {activeRoute === 'settings' && <Layer2SettingsRecipe onBack={goBack} activeTab=${JSON.stringify(targetSettingsTab)} />}
  {activeRoute === 'audio-eq' && <Layer3AcousticsEqualizerRecipe onBack={goBack} />}
</MorphingShell>`}
        />
      </div>
    </div>
  );
};
