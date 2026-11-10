import React, { useEffect, useState } from 'react';
import { Bot, Clock, Play, SlidersHorizontal, Users } from 'lucide-react';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import {
  resolveCalibratedDefaultConfig,
  resolveCalibratedSurfaceSizing,
} from '../manifest/surfaceCalibration';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import { SettingSegmentedRow } from '../compounds/SettingSegmentedRow';
import { useAppStore } from '../stores/appStore';
import { useExperimentalMultiBotsStore } from '../stores/experimentalMultiBotsStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useSettingActionRowStore } from '../stores/settingRowStore';
import { useScopedStore } from '../stores/storeSnapshotScope';

export type BotDifficultyTier = 'nexto' | 'necto' | 'easy' | 'medium' | 'hard';
export type ExhibitionMatchFormat = '1v1' | '2v2' | '3v3';
export type ExhibitionDuration = '90' | '180' | '300' | '600' | 'unlimited';

export interface ExhibitionBotSetupConfig {
  format: ExhibitionMatchFormat;
  difficulty: BotDifficultyTier;
  duration: ExhibitionDuration;
}

export const DEFAULT_EXHIBITION_CONFIG: ExhibitionBotSetupConfig = {
  format: '3v3',
  difficulty: 'necto',
  duration: '90',
};

export const SURFACE_META: SurfaceMeta = {
  id: 'recipe:Layer3ExhibitionRecipe',
  title: 'Exhibition Match Setup',
  subtitle: 'Offline Exhibition Format, RLBot Neural Policy & Duration',
  description:
    'Select team format, RLBot neural policy difficulty, and regulation duration.',
  icon: 'Bot',
  layer: 'layer3',
  menuGroup: 'menu-layer',
  defaultSizing: {
    width: 480,
    height: 420,
    minHeight: 200,
    maxHeight: 960,
    mode: 'adaptive',
  },
  variants: [
    {
      variantId: 'exhibition:standard-necto',
      label: '3v3 Standard · Necto (1:30)',
      storeOverrides: {
        experimentalMultiBotsStore: {
          exhibitionTeamSize: 'standard',
          exhibitionBotId: 'necto',
          matchDurationSec: 90,
        },
      },
    },
    {
      variantId: 'exhibition:duel-nexto',
      label: '1v1 Duel · Nexto (5:00)',
      storeOverrides: {
        experimentalMultiBotsStore: {
          exhibitionTeamSize: 'solo',
          exhibitionBotId: 'nexto',
          matchDurationSec: 300,
        },
      },
    },
  ],
};

export interface Layer3ExhibitionRecipeProps extends StandardSurfaceProps {}

const DIFFICULTY_DESCRIPTIONS: Record<BotDifficultyTier, string> = {
  easy: 'Rookie Bot: Relaxed throttle pacing, no aerials, ideal for basic ball-cam tracking.',
  medium: 'Pro Bot: Standard ground powershots, front-flip kickoffs, and basic boost collection.',
  hard: 'All-Star (Necto): Fast aerials, wall play, shadow defense, and consistent 50/50 challenges.',
  necto: 'All-Star (Necto ONNX): Fast aerials, wall play, shadow defense, and consistent 50/50 challenges.',
  nexto: 'Grand Champion (Nexto ONNX): Full 120Hz neural policy with flicks, air dribbles, and speedflips.',
};

const DEFAULT_DIFFICULTY_OPTIONS: Array<{ label: string; value: BotDifficultyTier }> = [
  { label: 'Nexto', value: 'nexto' },
  { label: 'Necto', value: 'necto' },
];

const DEFAULT_DURATION_OPTIONS: Array<{ label: string; value: ExhibitionDuration }> = [
  { label: '1:30', value: '90' },
  { label: '3:00', value: '180' },
  { label: '5:00', value: '300' },
];

/**
 * [Recipe] Layer 3 Exhibition Match Setup
 * Store-First contract (`StandardSurfaceProps` <= 4 props), reading directly from
 * `useExperimentalMultiBotsStore` and `useAppStore` via `useScopedStore`.
 */
export const Layer3ExhibitionRecipe: React.FC<Layer3ExhibitionRecipeProps> = React.memo(({
  isLight = true,
  onBack: propOnBack,
}) => {
  const storeGoBack = useScopedStore('appStore', useAppStore, (s) => s.goBack);
  const closeMenu = useScopedStore('appStore', useAppStore, (s) => s.closeMenu);
  const setMatchMode = useScopedStore('appStore', useAppStore, (s) => s.setMatchMode);
  const bridge = useScopedStore('appStore', useAppStore, (s) => s.bridge);

  const exhibitionTeamSize = useScopedStore(
    'experimentalMultiBotsStore',
    useExperimentalMultiBotsStore,
    (s) => s.exhibitionTeamSize
  );
  const exhibitionBotId = useScopedStore(
    'experimentalMultiBotsStore',
    useExperimentalMultiBotsStore,
    (s) => s.exhibitionBotId
  );
  const matchDurationSec = useScopedStore(
    'experimentalMultiBotsStore',
    useExperimentalMultiBotsStore,
    (s) => s.matchDurationSec
  );
  const configureExhibitionMatch = useScopedStore(
    'experimentalMultiBotsStore',
    useExperimentalMultiBotsStore,
    (s) => s.configureExhibitionMatch
  );
  const preloadEngines = useScopedStore(
    'experimentalMultiBotsStore',
    useExperimentalMultiBotsStore,
    (s) => s.preloadEngines
  );

  useEffect(() => {
    preloadEngines?.();
  }, [preloadEngines]);

  const calibratedDefaults = resolveCalibratedDefaultConfig(
    SURFACE_META.id,
    DEFAULT_EXHIBITION_CONFIG
  );

  const format: ExhibitionMatchFormat =
    exhibitionTeamSize === 'solo'
      ? '1v1'
      : exhibitionTeamSize === 'double'
      ? '2v2'
      : exhibitionTeamSize === 'standard'
      ? '3v3'
      : calibratedDefaults.format;

  const selectedDiff: BotDifficultyTier =
    exhibitionBotId === 'nexto' ? 'nexto' : 'necto';

  const duration: ExhibitionDuration =
    matchDurationSec === 180
      ? '180'
      : matchDurationSec === 300
      ? '300'
      : '90';

  const applyExhibitionConfig = (patch: Partial<ExhibitionBotSetupConfig>) => {
    const nextFormat = patch.format ?? format;
    const nextDiff = patch.difficulty ?? selectedDiff;
    const nextDuration = patch.duration ?? duration;

    const policy = nextDiff === 'nexto' ? 'nexto' : 'necto';
    const durationSec = Number(nextDuration) || 90;
    const teamSize =
      nextFormat === '1v1'
        ? 'solo'
        : nextFormat === '2v2'
        ? 'double'
        : 'standard';

    configureExhibitionMatch(policy, durationSec, teamSize);
  };

  const handleStartExhibition = () => {
    const policy = selectedDiff === 'nexto' ? 'nexto' : 'necto';
    const durationSec = Number(duration) || 90;
    const teamSize =
      format === '1v1'
        ? 'solo'
        : format === '2v2'
        ? 'double'
        : 'standard';

    configureExhibitionMatch(policy, durationSec, teamSize);
    setMatchMode('exp-multi-bots');
    closeMenu();
    bridge.onStartMatch?.(policy, durationSec, teamSize);
  };

  const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);
  const onBack = propOnBack ?? storeGoBack;

  const storeSizing = useScopedStore(
    'menuLayoutStore',
    useMenuLayoutStore,
    (s) => s.panels['layer3-exhibition']
  );
  const calibratedSizing = resolveCalibratedSurfaceSizing(
    SURFACE_META.id,
    SURFACE_META.defaultSizing
  );
  const sizing = storeSizing ?? {
    mode: calibratedSizing.mode === 'fixed' ? 'fixed' : 'auto',
    width: calibratedSizing.width,
    targetHeight: typeof calibratedSizing.height === 'number' ? calibratedSizing.height : 420,
    minHeight: calibratedSizing.minHeight ?? 200,
    maxHeight: calibratedSizing.maxHeight ?? 960,
  };

  const { rowGap, paddingX } = useScopedStore(
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
        title="EXHIBITION MATCH SETUP"
        onBack={onBack}
      />

      <PanelContent scrollable={true} className="flex flex-col justify-between gap-3">
        <div
          data-layout="exhibition-setup-list"
          className="flex flex-col w-full"
          style={{ gap: `${rowGap}px` }}
        >
          {/* 1. Team Format */}
          <SettingSegmentedRow
            icon={Users}
            iconColor="text-sky-400"
            title="Team Format"
            value={format}
            onChange={(v) => applyExhibitionConfig({ format: v as ExhibitionMatchFormat })}
            layout="inline"
            bordered={false}
            showDescription={false}
            options={[
              { label: 'Duel', value: '1v1' },
              { label: 'Doubles', value: '2v2' },
              { label: 'Standard', value: '3v3' },
            ]}
            hoverDescription="Select standard 1v1 Duel, 2v2 Doubles, or 3v3 Standard team size."
            onHover={(desc) => desc && setHoveredDesc(desc)}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
          />

          {/* 2. Bot Difficulty */}
          <SettingSegmentedRow
            icon={Bot}
            iconColor="text-rose-400"
            title="Bot Difficulty"
            value={selectedDiff}
            onChange={(v) => applyExhibitionConfig({ difficulty: v as BotDifficultyTier })}
            layout="inline"
            bordered={false}
            showDescription={false}
            options={DEFAULT_DIFFICULTY_OPTIONS}
            hoverDescription={DIFFICULTY_DESCRIPTIONS[selectedDiff] ?? DIFFICULTY_DESCRIPTIONS.necto}
            onHover={(desc) => desc && setHoveredDesc(desc)}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
          />

          {/* 3. Match Duration */}
          <SettingSegmentedRow
            icon={Clock}
            iconColor="text-amber-500"
            title="Match Duration"
            value={duration}
            onChange={(v) => applyExhibitionConfig({ duration: v as ExhibitionDuration })}
            layout="inline"
            bordered={false}
            showDescription={false}
            options={DEFAULT_DURATION_OPTIONS}
            hoverDescription="Regulation timer length before sudden-death Overtime (+0:00)."
            onHover={(desc) => desc && setHoveredDesc(desc)}
            onLeave={() => setHoveredDesc(null)}
            isLight={isLight}
          />

          {/* 4. Full-width Long Bar Button: Advanced Settings (Disabled) */}
          <div
            style={{
              paddingLeft: `${Math.max(0, paddingX)}px`,
              paddingRight: `${Math.max(0, paddingX)}px`,
            }}
            className="pt-2"
          >
            <button
              type="button"
              disabled={true}
              aria-disabled="true"
              onMouseEnter={() =>
                setHoveredDesc(
                  'Advanced Settings: Configure asymmetric 1v2/1v3 bot counts, per-slot policies, and physics mutators.'
                )
              }
              onMouseLeave={() => setHoveredDesc(null)}
              className={`w-full py-2.5 px-4 rounded-xl border text-xs font-semibold tracking-wide flex items-center justify-center gap-2 transition-colors opacity-50 cursor-not-allowed ${
                isLight
                  ? 'bg-neutral-100 border-neutral-300 text-neutral-500 shadow-2xs'
                  : 'bg-neutral-800/60 border-neutral-700/70 text-neutral-500'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-amber-500/60" />
              <span>Advanced Settings</span>
            </button>
          </div>
        </div>

        {/* Primary Launch CTA */}
        <button
          type="button"
          onClick={handleStartExhibition}
          onMouseEnter={() =>
            setHoveredDesc('Launch offline 120Hz Exhibition Match with the selected AI policy and format.')
          }
          onMouseLeave={() => setHoveredDesc(null)}
          className="mt-2 w-full py-2.5 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          <span>Start Exhibition Match</span>
        </button>
      </PanelContent>

      <PanelFooter
        isLight={isLight}
        defaultDescription="Select team format, RLBot neural policy difficulty, and regulation duration."
        hoveredDescription={hoveredDesc}
      />
    </PanelContainer>
  );
});

Layer3ExhibitionRecipe.displayName = 'Layer3ExhibitionRecipe';
export default Layer3ExhibitionRecipe;
