import React from 'react';
import {
  Layers,
  History,
  Zap,
  Play,
  RotateCcw,
  Radio,
  Film,
  Swords,
  Skull,
} from 'lucide-react';
import {
  useSubsystemIsolationLabStore,
  type DevTestLabTab,
} from '../../stores/subsystemIsolationLabStore';
import { useAppStore } from '../../stores/appStore';
import { UnderlineTabs, type TabItem } from '../../primitives/UnderlineTabs';
import { Badge } from '../../primitives/Badge';
import { Button } from '../../primitives/Button';
import { ProbesBenchPanel } from './subsystem-isolation-lab/ProbesBenchPanel';
import { MultiGhostBenchPanel } from './subsystem-isolation-lab/MultiGhostBenchPanel';
import { StateReplayBenchPanel } from './subsystem-isolation-lab/StateReplayBenchPanel';
import { NinetySecMatchBenchPanel } from './subsystem-isolation-lab/NinetySecMatchBenchPanel';
import { GoalReplayBenchPanel } from './subsystem-isolation-lab/GoalReplayBenchPanel';
import { KickoffDuelBenchPanel } from './subsystem-isolation-lab/KickoffDuelBenchPanel';
import { DemolishRespawnBenchPanel } from './subsystem-isolation-lab/DemolishRespawnBenchPanel';
import type { StandardSurfaceProps, SurfaceMeta } from '../../manifest/surfaceMetaTypes';

export const SURFACE_META: SurfaceMeta = {
  id: 'subsystem-isolation-lab',
  title: 'Subsystem Isolation & MVP Lab',
  subtitle: 'DeveloperLab',
  description:
    '7 isolated test benches: Probes, Multi-World Ghost, State Replay, 90s Match, Goal Replay, Kickoff Duel & Demolish Respawn.',
  icon: 'Layers',
  layer: 'floating-dev',
  menuGroup: 'sandboxes',
  defaultSizing: {
    width: 470,
    height: 560,
    minHeight: 200,
    mode: 'adaptive',
  },
  variants: [
    { variantId: 'probes', label: '1. Probes' },
    { variantId: 'multi-ghost', label: '2. Multi Ghost' },
    { variantId: 'state-replay', label: '3. State Replay' },
    { variantId: '90s-match', label: '4. 90s Match' },
    { variantId: 'goal-replay', label: '5. Goal Replay' },
    { variantId: 'kickoff-duel', label: '6. Kickoff Duel' },
    { variantId: 'demolish-respawn', label: '7. Demo Respawn' },
  ],
};

export interface SubsystemIsolationLabFloatingWindowProps extends StandardSurfaceProps {
  active?: boolean;
}

/**
 * Subsystem Isolation & MVP Lab Controller
 * Declarative shell hosting UnderlineTabs for the isolated component verification benches:
 * 1. Probes (0G QE + Gravity Z-Hover)
 * 2. Multi Ghost (2..4 Parallel Worlds)
 * 3. State Replay (TAS RingBuffer & Rewinder)
 * 4. 90s Match (MatchController & Overtime MVP)
 * 5. Goal Replay (Goal Incident & Podium MVP)
 * 6. Kickoff Duel (4 SafeTensors Models - 10 Pairings x 5 Slots + Action Diagnostics)
 * 7. Demo Respawn (Demolish & Respawn Left/Right Handedness + Ghost Wheel Verification)
 */
export const SubsystemIsolationLabFloatingWindow: React.FC<SubsystemIsolationLabFloatingWindowProps> = ({
  isLight = false,
  activeTab: controlledTab,
  onTabChange,
}) => {
  const {
    activeTab: storeActiveTab,
    selectedTab: storeSelectedTab,
    setSelectedTab: setStoreSelectedTab,
    applyAndRestartLab,
  } = useSubsystemIsolationLabStore();

  const validTabs: DevTestLabTab[] = [
    'probes',
    'multi-ghost',
    'state-replay',
    '90s-match',
    'goal-replay',
    'kickoff-duel',
    'demolish-respawn',
  ];
  const selectedTab: DevTestLabTab =
    controlledTab && validTabs.includes(controlledTab as DevTestLabTab)
      ? (controlledTab as DevTestLabTab)
      : storeSelectedTab;
  const activeTab: DevTestLabTab =
    controlledTab && validTabs.includes(controlledTab as DevTestLabTab)
      ? (controlledTab as DevTestLabTab)
      : storeActiveTab;
  const setSelectedTab = (tab: DevTestLabTab) => {
    setStoreSelectedTab(tab);
    onTabChange?.(tab);
  };

  const matchMode = useAppStore((s) => s.matchMode);
  const bridge = useAppStore((s) => s.bridge);
  const isInDevLab = matchMode === 'dev-test-lab';
  const hasPendingTabSwitch = isInDevLab && selectedTab !== activeTab;

  const cardBg = isLight
    ? 'bg-neutral-50/90 border-neutral-200 text-neutral-800'
    : 'bg-neutral-850/60 border-neutral-700/60 text-neutral-200';

  const subPanelBg = isLight
    ? 'bg-white border-neutral-200/90 text-neutral-800'
    : 'bg-neutral-950/50 border-neutral-800 text-neutral-200';

  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  const tabs: TabItem[] = [
    { id: 'probes', label: '1. Probes', icon: <Radio className="h-3.5 w-3.5" /> },
    { id: 'multi-ghost', label: '2. Multi Ghost', icon: <Layers className="h-3.5 w-3.5" /> },
    { id: 'state-replay', label: '3. State Replay', icon: <History className="h-3.5 w-3.5" /> },
    { id: '90s-match', label: '4. 90s Match', icon: <Zap className="h-3.5 w-3.5" /> },
    { id: 'goal-replay', label: '5. Goal Replay', icon: <Film className="h-3.5 w-3.5" /> },
    { id: 'kickoff-duel', label: '6. Kickoff Duel', icon: <Swords className="h-3.5 w-3.5" /> },
    { id: 'demolish-respawn', label: '7. Demo Respawn', icon: <Skull className="h-3.5 w-3.5" /> },
  ];

  const handleApplyAndRestart = () => {
    if (!isInDevLab) {
      applyAndRestartLab(selectedTab);
      bridge.onStartDevTestLab?.();
    } else {
      applyAndRestartLab(selectedTab);
    }
  };

  return (
    <div className="flex flex-col gap-2.5 select-none text-xs">
      {/* Header Status Bar */}
      <div className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${cardBg}`}>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${
                isInDevLab
                  ? hasPendingTabSwitch
                    ? 'bg-amber-400 animate-pulse'
                    : isLight
                    ? 'bg-emerald-500 animate-pulse'
                    : 'bg-emerald-400 animate-pulse'
                  : isLight
                  ? 'bg-amber-500'
                  : 'bg-amber-400'
              }`}
            />
            <span className="font-bold text-xs truncate">
              {isInDevLab
                ? `Subsystem Isolation Lab (${activeTab})`
                : 'Subsystem Isolation & MVP Lab Standby'}
            </span>
          </div>
          <span className={`text-[10px] font-mono truncate mt-0.5 ${mutedText}`}>
            {!isInDevLab
              ? 'Select a tab and click Apply & Restart to initialize bench'
              : hasPendingTabSwitch
              ? `Staged [${selectedTab}] — Click Apply & Restart to switch scene`
              : 'Click Apply & Restart to re-initialize current bench'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isInDevLab && !hasPendingTabSwitch && (
            <Badge variant="emerald" size="sm" isLight={isLight} className="font-mono text-[10px]">
              ACTIVE
            </Badge>
          )}
          <Button
            variant={!isInDevLab || hasPendingTabSwitch ? 'primary' : 'secondary'}
            size="sm"
            onClick={handleApplyAndRestart}
            isLight={isLight}
            className="gap-1.5 px-2.5 py-1 text-[11px] font-semibold"
          >
            {!isInDevLab ? (
              <Play className="h-3.5 w-3.5 fill-current" />
            ) : (
              <RotateCcw className="h-3 w-3" />
            )}
            <span>Apply &amp; Restart</span>
          </Button>
        </div>
      </div>

      {/* 7-Bench Navigation Tabs (switches UI view only; Apply & Restart initializes scene) */}
      <div className="w-full shrink-0">
        <UnderlineTabs
          items={tabs}
          activeId={selectedTab}
          onChange={(id) => setSelectedTab(id as DevTestLabTab)}
          isLight={isLight}
          size="sm"
          fullWidth={true}
        />
      </div>

      {selectedTab === 'probes' && (
        <ProbesBenchPanel
          isLight={isLight}
          cardBg={cardBg}
          subPanelBg={subPanelBg}
          mutedText={mutedText}
        />
      )}

      {selectedTab === 'multi-ghost' && (
        <MultiGhostBenchPanel
          isLight={isLight}
          cardBg={cardBg}
          subPanelBg={subPanelBg}
          mutedText={mutedText}
        />
      )}

      {selectedTab === 'state-replay' && (
        <StateReplayBenchPanel
          isLight={isLight}
          cardBg={cardBg}
          subPanelBg={subPanelBg}
        />
      )}

      {selectedTab === '90s-match' && (
        <NinetySecMatchBenchPanel
          isLight={isLight}
          cardBg={cardBg}
          subPanelBg={subPanelBg}
          mutedText={mutedText}
        />
      )}

      {selectedTab === 'goal-replay' && (
        <GoalReplayBenchPanel
          isLight={isLight}
          cardBg={cardBg}
          subPanelBg={subPanelBg}
          mutedText={mutedText}
        />
      )}

      {selectedTab === 'kickoff-duel' && (
        <KickoffDuelBenchPanel
          isLight={isLight}
          cardBg={cardBg}
          subPanelBg={subPanelBg}
          mutedText={mutedText}
        />
      )}

      {selectedTab === 'demolish-respawn' && (
        <DemolishRespawnBenchPanel
          isLight={isLight}
          cardBg={cardBg}
          subPanelBg={subPanelBg}
          mutedText={mutedText}
        />
      )}
    </div>
  );
};
