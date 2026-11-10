import React, { useState } from 'react';
import { Check, Clock, Compass, Crosshair, Ghost, GraduationCap, Play, Zap } from 'lucide-react';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import {
  resolveCalibratedDefaultConfig,
  resolveCalibratedSurfaceSizing,
} from '../manifest/surfaceCalibration';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import { SettingSegmentedRow } from '../compounds/SettingSegmentedRow';
import { SettingToggleRow } from '../compounds/SettingToggleRow';
import { useAppStore } from '../stores/appStore';
import { KICKOFF_TRAINING_TUNER_PRESET } from '../stores/devFloatingPresets';
import {
  useKickoffTrainingStore,
  type KickoffSubMode,
} from '../stores/kickoffTrainingStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useSettingActionRowStore } from '../stores/settingRowStore';
import { useScopedStore } from '../stores/storeSnapshotScope';
import { FloatingWindowCard } from './settings/components/FloatingWindowCard';

export type { KickoffSubMode };
export type KickoffAISpawnSide = 'same-position' | 'opposite-side';

export interface KickoffTrainingConfig {
  subMode: KickoffSubMode;
  aiSpawnSide: KickoffAISpawnSide;
  ghostMode: boolean;
  showRhythmHighway?: boolean;
}

export const DEFAULT_KICKOFF_TRAINING_CONFIG: KickoffTrainingConfig = {
  subMode: 'instant',
  aiSpawnSide: 'opposite-side',
  ghostMode: false,
  showRhythmHighway: true,
};

export const SURFACE_META: SurfaceMeta = {
  id: 'recipe:Layer3KickoffTrainingRecipe',
  title: 'Kickoff Training Setup',
  subtitle: 'Kickoff Drill Pacing, AI Spawn Side, Ghost Mode & PPO Tuner',
  description:
    'Configure countdown pacing, AI opponent spawn geometry, and kickoff training floating tools.',
  icon: 'Zap',
  layer: 'layer3',
  menuGroup: 'menu-layer',
  defaultSizing: {
    width: 520,
    height: 520,
    minHeight: 220,
    maxHeight: 1080,
    mode: 'adaptive',
  },
  variants: [
    {
      variantId: 'kickoff:instant',
      label: 'Instant Drill · Opposite Side',
      storeOverrides: {
        kickoffTrainingStore: {
          subMode: 'instant',
          ghostPlacement: 'opposite',
          ghostModeEnabled: false,
        },
      },
    },
    {
      variantId: 'kickoff:easy-learning',
      label: 'Easy Learning · Shadow Ghost',
      storeOverrides: {
        kickoffTrainingStore: {
          subMode: 'easy-learning',
          ghostPlacement: 'same',
          ghostModeEnabled: true,
        },
      },
    },
    {
      variantId: 'kickoff:realistic',
      label: 'Realistic · Opposite Duel',
      storeOverrides: {
        kickoffTrainingStore: {
          subMode: 'realistic',
          ghostPlacement: 'opposite',
          ghostModeEnabled: false,
        },
      },
    },
  ],
};

export interface Layer3KickoffTrainingRecipeProps extends StandardSurfaceProps {}

const SUB_MODE_DESCRIPTIONS: Record<KickoffSubMode, string> = {
  instant:
    'Skips the 3-second countdown and resets immediately upon first ball touch for high-rep muscle memory.',
  'easy-learning':
    'Slows physics to 75% speed with step-by-step falling note guidance on the 9-lane receptor bar.',
  realistic:
    'Full 120Hz regulation countdown and post-kickoff follow-through against Nexto / recorded pro bots.',
};

const DRILL_MODE_CARDS: Array<{
  value: KickoffSubMode;
  label: string;
  icon: React.ElementType;
}> = [
  { value: 'instant', label: 'Instant', icon: Zap },
  { value: 'easy-learning', label: 'Easy Learning', icon: GraduationCap },
  { value: 'realistic', label: 'Realistic', icon: Clock },
];

/**
 * [Recipe] Layer 3 Kickoff Training Setup
 * 1. Drill Mode — small header + 3 selectable cards (Instant | Easy Learning | Realistic) with checkmark & inverted active state
 * 2. AI Spawn Position — inline SegmentedSwitch (Same Side | Opposite Side)
 * 3. Ghost Mode — single-line ToggleSwitch
 * 4. Kickoff Training Tuner (PPO) — single-line FloatingWindowCard spawner
 * 5. Start Kickoff Drill — primary action button
 *
 * Store-First contract (`StandardSurfaceProps` <= 4 props), reading directly from
 * `useKickoffTrainingStore` and `useAppStore` via `useScopedStore`.
 */
export const Layer3KickoffTrainingRecipe: React.FC<Layer3KickoffTrainingRecipeProps> = React.memo(({
  isLight = true,
  onBack: propOnBack,
}) => {
  const storeGoBack = useScopedStore('appStore', useAppStore, (s) => s.goBack);
  const closeMenu = useScopedStore('appStore', useAppStore, (s) => s.closeMenu);
  const setMatchMode = useScopedStore('appStore', useAppStore, (s) => s.setMatchMode);
  const bridge = useScopedStore('appStore', useAppStore, (s) => s.bridge);

  const subModeState = useScopedStore(
    'kickoffTrainingStore',
    useKickoffTrainingStore,
    (s) => s.subMode
  );
  const ghostPlacement = useScopedStore(
    'kickoffTrainingStore',
    useKickoffTrainingStore,
    (s) => s.ghostPlacement
  );
  const ghostModeEnabled = useScopedStore(
    'kickoffTrainingStore',
    useKickoffTrainingStore,
    (s) => s.ghostModeEnabled
  );
  const setSubMode = useScopedStore(
    'kickoffTrainingStore',
    useKickoffTrainingStore,
    (s) => s.setSubMode
  );
  const setGhostPlacement = useScopedStore(
    'kickoffTrainingStore',
    useKickoffTrainingStore,
    (s) => s.setGhostPlacement
  );
  const setGhostModeEnabled = useScopedStore(
    'kickoffTrainingStore',
    useKickoffTrainingStore,
    (s) => s.setGhostModeEnabled
  );
  const setShowKeyboardOverlay = useScopedStore(
    'kickoffTrainingStore',
    useKickoffTrainingStore,
    (s) => s.setShowKeyboardOverlay
  );

  const calibratedDefaults = resolveCalibratedDefaultConfig(
    SURFACE_META.id,
    DEFAULT_KICKOFF_TRAINING_CONFIG
  );

  const subMode: KickoffSubMode = subModeState ?? calibratedDefaults.subMode;
  const aiSpawnSide: KickoffAISpawnSide =
    ghostPlacement === 'same' ? 'same-position' : 'opposite-side';
  const ghostMode: boolean = ghostModeEnabled ?? calibratedDefaults.ghostMode;

  const updateConfig = (patch: Partial<KickoffTrainingConfig>) => {
    if (patch.subMode !== undefined) setSubMode(patch.subMode);
    if (patch.aiSpawnSide !== undefined) {
      setGhostPlacement(patch.aiSpawnSide === 'same-position' ? 'same' : 'opposite');
    }
    if (patch.ghostMode !== undefined) setGhostModeEnabled(patch.ghostMode);
    if (patch.showRhythmHighway !== undefined) {
      setShowKeyboardOverlay(patch.showRhythmHighway);
    }
  };

  const handleStartTraining = () => {
    setSubMode(subMode);
    setGhostPlacement(aiSpawnSide === 'same-position' ? 'same' : 'opposite');
    setGhostModeEnabled(ghostMode);
    setMatchMode('kickoff-training');
    closeMenu();
    bridge.onStartKickoffTraining?.();
  };

  const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);
  const onBack = propOnBack ?? storeGoBack;

  const storeSizing = useScopedStore(
    'menuLayoutStore',
    useMenuLayoutStore,
    (s) => s.panels['layer3-kickoff-training']
  );
  const calibratedSizing = resolveCalibratedSurfaceSizing(
    SURFACE_META.id,
    SURFACE_META.defaultSizing
  );
  const sizing = storeSizing ?? {
    mode: calibratedSizing.mode === 'fixed' ? 'fixed' : 'auto',
    width: calibratedSizing.width,
    targetHeight: typeof calibratedSizing.height === 'number' ? calibratedSizing.height : 520,
    minHeight: calibratedSizing.minHeight ?? 220,
    maxHeight: calibratedSizing.maxHeight ?? 1080,
  };

  const { titleFontSize, rowGap, paddingX } = useScopedStore(
    'settingRowStore',
    useSettingActionRowStore
  );

  return (
    <PanelContainer
      isLight={isLight}
      sizing={sizing}
      className="w-full select-none"
    >
      <PanelHeader
        isLight={isLight}
        title="KICKOFF TRAINING SETUP"
        onBack={onBack}
      />

      <PanelContent scrollable={true} className="flex flex-col justify-between gap-3">
        <div
          data-layout="kickoff-training-list"
          className="flex flex-col w-full"
          style={{ gap: `${rowGap}px` }}
        >
          {/* 1. Drill Mode (Small title + 3 selectable cards) */}
          <div
            className="flex flex-col gap-2 py-1"
            style={{ paddingLeft: `${paddingX}px`, paddingRight: `${paddingX}px` }}
          >
            <span
              className={`font-semibold tracking-tight leading-snug ${
                isLight ? 'text-neutral-900' : 'text-white'
              }`}
              style={{ fontSize: `${titleFontSize}px` }}
            >
              Drill Mode
            </span>
            <div className="grid grid-cols-3 gap-2">
              {DRILL_MODE_CARDS.map((card) => {
                const Icon = card.icon;
                const isSelected = subMode === card.value;
                return (
                  <button
                    key={card.value}
                    type="button"
                    onClick={() => updateConfig({ subMode: card.value })}
                    onMouseEnter={() => setHoveredDesc(SUB_MODE_DESCRIPTIONS[card.value])}
                    onMouseLeave={() => setHoveredDesc(null)}
                    className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border transition-all cursor-pointer text-left ${
                      isSelected
                        ? isLight
                          ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm'
                          : 'bg-white text-neutral-950 border-white shadow-sm'
                        : isLight
                          ? 'bg-neutral-100/80 hover:bg-neutral-200/70 text-neutral-800 border-neutral-300/80'
                          : 'bg-neutral-900/60 hover:bg-neutral-800/80 text-neutral-200 border-neutral-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          isSelected
                            ? isLight
                              ? 'text-white'
                              : 'text-neutral-950'
                            : isLight
                              ? 'text-neutral-600'
                              : 'text-neutral-400'
                        }`}
                      />
                      <span className="text-xs font-bold tracking-tight truncate">
                        {card.label}
                      </span>
                    </div>
                    {isSelected && (
                      <Check
                        className={`h-3.5 w-3.5 shrink-0 ${
                          isLight ? 'text-white' : 'text-neutral-950'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. AI Spawn Position */}
          <SettingSegmentedRow
            icon={Compass}
            iconColor="text-sky-400"
            title="AI Spawn Position"
            value={aiSpawnSide}
            onChange={(v) => updateConfig({ aiSpawnSide: v as KickoffAISpawnSide })}
            layout="inline"
            bordered={false}
            showDescription={false}
            options={[
              { label: 'Same Side', value: 'same-position' },
              { label: 'Opposite Side', value: 'opposite-side' },
            ]}
            hoverDescription="AI Spawn Position: Spawn AI bot on the same position as a shadow ghost or opposite side for 50/50 duels."
            onHover={(desc) => desc && setHoveredDesc(desc)}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
          />

          {/* 3. Ghost Mode */}
          <SettingToggleRow
            icon={Ghost}
            iconColor="text-purple-400"
            title="Ghost Mode"
            checked={ghostMode}
            onChange={(nextGhost) => updateConfig({ ghostMode: nextGhost })}
            bordered={false}
            showDescription={false}
            hoverDescription="Ghost Mode: Disables physical car-to-car and AI ball collision to practice pure speedflip lines."
            onHover={(desc) => desc && setHoveredDesc(desc)}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
          />

          {/* 4. Kickoff Spawn & Mirror Floating Window Launcher */}
          <FloatingWindowCard
            preset={KICKOFF_TRAINING_TUNER_PRESET}
            icon={Crosshair}
            iconColor="text-amber-500"
            bordered={false}
            showDescription={false}
            hoverTooltip="Kickoff Training Tuner (PPO): Spawn floating window to configure exact kickoff spawn slots and PPO opponent mirror settings."
            onHover={setHoveredDesc}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
          />
        </div>

        <button
          type="button"
          onClick={handleStartTraining}
          onMouseEnter={() =>
            setHoveredDesc('Enter 120Hz Kickoff Training arena with the selected drill configuration.')
          }
          onMouseLeave={() => setHoveredDesc(null)}
          className="mt-2 w-full py-2.5 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          <span>Start Kickoff Drill</span>
        </button>
      </PanelContent>

      <PanelFooter
        isLight={isLight}
        defaultDescription="Configure countdown pacing, AI opponent spawn geometry, and kickoff training floating tools."
        hoveredDescription={hoveredDesc}
      />
    </PanelContainer>
  );
});

Layer3KickoffTrainingRecipe.displayName = 'Layer3KickoffTrainingRecipe';
export default Layer3KickoffTrainingRecipe;
