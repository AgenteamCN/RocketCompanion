import React, { useEffect, useState } from 'react';
import { Card } from '../layout/Card';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import { SegmentedSwitch } from '../primitives/SegmentedSwitch';
import {
  TeamRosterCard,
  type TeamRosterSlotConfig,
  type BotPolicyId,
  type CarColorSwatch,
} from '../compounds/TeamRosterCard';
import { useAppStore } from '../stores/appStore';
import { useExperimentalMultiBotsStore } from '../stores/experimentalMultiBotsStore';
import {
  EXP_CAR_COLOR_PALETTE,
  type ExpPlayerParticipation,
} from '../stores/experimentalMultiBotsRosterUtils';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useScopedStore } from '../stores/storeSnapshotScope';
import { DEFAULT_PANEL_SIZING } from '../tokens/menuLayoutTokens';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import {
  ExpBotsMatchOptionsAndPovSection,
  enterOrRestartExperimentalBotsGame,
} from './dev/ExpBotsMatchOptionsAndPovSection';

export type Layer3ExpMultiBotsRecipeProps = StandardSurfaceProps;

export const SURFACE_META: SurfaceMeta = {
  id: 'layer3-exp-multi-bots',
  title: 'EXPERIMENTAL MULTIPLE BOTS (ASYMMETRIC & UP TO 6 CARS)',
  subtitle: 'Up to 3v3 Native SafeTensors Nexto & Necto Bot Rosters',
  description:
    'Configure up to 3v3 Native SafeTensors Nexto & Necto bot rosters and select active camera POV.',
  icon: 'bot',
  layer: 'layer3',
  menuGroup: 'menu-layer',
  defaultSizing: {
    mode: 'adaptive',
    width: DEFAULT_PANEL_SIZING['layer3-exp-multi-bots'].width,
    height: DEFAULT_PANEL_SIZING['layer3-exp-multi-bots'].targetHeight,
    minHeight: DEFAULT_PANEL_SIZING['layer3-exp-multi-bots'].minHeight,
    maxHeight: DEFAULT_PANEL_SIZING['layer3-exp-multi-bots'].maxHeight,
  },
};

const EXP_SWATCH_PALETTE: CarColorSwatch[] = EXP_CAR_COLOR_PALETTE.map((c) => ({
  id: String(c.id),
  name: c.name,
  hex: c.hex,
}));

export const Layer3ExpMultiBotsRecipe: React.FC<Layer3ExpMultiBotsRecipeProps> =
  React.memo(({ isLight = true, onBack: propOnBack }) => {
    const storeGoBack = useScopedStore('appStore', useAppStore, (s) => s.goBack);
    const matchMode = useScopedStore('appStore', useAppStore, (s) => s.matchMode);
    const onBack = propOnBack ?? storeGoBack;
    const isInExpMode = matchMode === 'exp-multi-bots';

    const playerParticipation = useScopedStore(
      'experimentalMultiBotsStore',
      useExperimentalMultiBotsStore,
      (s) => s.playerParticipation
    );
    const storeBlueSlots = useScopedStore(
      'experimentalMultiBotsStore',
      useExperimentalMultiBotsStore,
      (s) => s.blueSlots
    );
    const storeOrangeSlots = useScopedStore(
      'experimentalMultiBotsStore',
      useExperimentalMultiBotsStore,
      (s) => s.orangeSlots
    );
    const activeCameraCarIndex = useScopedStore(
      'experimentalMultiBotsStore',
      useExperimentalMultiBotsStore,
      (s) => s.activeCameraCarIndex
    );
    const nextoLoaded = useScopedStore(
      'experimentalMultiBotsStore',
      useExperimentalMultiBotsStore,
      (s) => s.nextoLoaded
    );
    const nectoLoaded = useScopedStore(
      'experimentalMultiBotsStore',
      useExperimentalMultiBotsStore,
      (s) => s.nectoLoaded
    );
    const lastTotalInferenceMs = useScopedStore(
      'experimentalMultiBotsStore',
      useExperimentalMultiBotsStore,
      (s) => s.lastTotalInferenceMs
    );
    const setPlayerParticipation = useScopedStore(
      'experimentalMultiBotsStore',
      useExperimentalMultiBotsStore,
      (s) => s.setPlayerParticipation
    );
    const addBotToTeam = useScopedStore(
      'experimentalMultiBotsStore',
      useExperimentalMultiBotsStore,
      (s) => s.addBotToTeam
    );
    const removeSlotFromTeam = useScopedStore(
      'experimentalMultiBotsStore',
      useExperimentalMultiBotsStore,
      (s) => s.removeSlotFromTeam
    );
    const setSlotBotType = useScopedStore(
      'experimentalMultiBotsStore',
      useExperimentalMultiBotsStore,
      (s) => s.setSlotBotType
    );
    const setSlotColor = useScopedStore(
      'experimentalMultiBotsStore',
      useExperimentalMultiBotsStore,
      (s) => s.setSlotColor
    );
    const applyPresetRoster = useScopedStore(
      'experimentalMultiBotsStore',
      useExperimentalMultiBotsStore,
      (s) => s.applyPresetRoster
    );
    const applyAsymmetricPresetRoster = useScopedStore(
      'experimentalMultiBotsStore',
      useExperimentalMultiBotsStore,
      (s) => s.applyAsymmetricPresetRoster
    );
    const setActiveCameraCarIndex = useScopedStore(
      'experimentalMultiBotsStore',
      useExperimentalMultiBotsStore,
      (s) => s.setActiveCameraCarIndex
    );
    const preloadEngines = useScopedStore(
      'experimentalMultiBotsStore',
      useExperimentalMultiBotsStore,
      (s) => s.preloadEngines
    );

    const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);

    useEffect(() => {
      const st = useExperimentalMultiBotsStore.getState();
      if (st.activeSubMode !== 'multi-bots') {
        st.activateMultiBotsSubMode(false);
      }
      preloadEngines?.();
    }, [preloadEngines]);

    const blueSlots: TeamRosterSlotConfig[] = storeBlueSlots.map((s) => ({
      id: s.id,
      team: s.team,
      isPlayer: s.isPlayer,
      botType: s.botType as BotPolicyId,
      colorSlot: String(s.colorSlot),
    }));

    const orangeSlots: TeamRosterSlotConfig[] = storeOrangeSlots.map((s) => ({
      id: s.id,
      team: s.team,
      isPlayer: s.isPlayer,
      botType: s.botType as BotPolicyId,
      colorSlot: String(s.colorSlot),
    }));

    const sizing = useMenuLayoutStore(
      (s) =>
        s.panels?.['layer3-exp-multi-bots'] ??
        DEFAULT_PANEL_SIZING['layer3-exp-multi-bots']
    );
    const totalCars = blueSlots.length + orangeSlots.length;

    const handleApplyFormatPreset = (preset: string) => {
      const symMap: Record<
        string,
        | '1v1-player'
        | '2v2-player'
        | '3v3-player'
        | '1v1-bots'
        | '2v2-bots'
        | '3v3-bots'
      > = {
        '1v1 +P': '1v1-player',
        '1v1 Bot': '1v1-bots',
        '2v2 +P': '2v2-player',
        '2v2 Bot': '2v2-bots',
        '3v3 +P': '3v3-player',
        '3v3 Bot': '3v3-bots',
      };
      const symKey = symMap[preset];
      if (symKey) {
        applyPresetRoster(symKey);
        return;
      }
      const asymMap: Record<string, [number, number]> = {
        '3v2 Asym': [3, 2],
        '2v3 Asym': [2, 3],
        '3v1 Asym': [3, 1],
        '2v1 Asym': [2, 1],
        '4v2 Asym': [4, 2],
        '4v1 Asym': [4, 1],
      };
      const asym = asymMap[preset];
      if (asym) {
        applyAsymmetricPresetRoster(asym[0], asym[1]);
      }
    };

    return (
      <PanelContainer isLight={isLight} sizing={sizing} className="w-full select-none">
        <PanelHeader
          isLight={isLight}
          title="EXPERIMENTAL MULTIPLE BOTS (ASYMMETRIC & UP TO 6 CARS)"
          onBack={onBack}
          onRightAction={() => enterOrRestartExperimentalBotsGame('multi-bots')}
          rightActionLabel={isInExpMode ? 'Apply & Restart ↗' : 'Enter Game ↗'}
        />

        <PanelContent scrollable={true} className="flex flex-col gap-3">
          {/* SafeTensors Model Status Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-[11px] font-mono">
            <span
              className={
                nextoLoaded ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'
              }
            >
              ● Nexto SafeTensors: {nextoLoaded ? 'READY' : 'LOADING'}
            </span>
            <span
              className={
                nectoLoaded ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'
              }
            >
              ● Necto SafeTensors: {nectoLoaded ? 'READY' : 'LOADING'}
            </span>
            <span className={isLight ? 'text-neutral-600' : 'text-neutral-400'}>
              {isInExpMode
                ? `Active (${blueSlots.length}v${orangeSlots.length}) · Infer: ${lastTotalInferenceMs.toFixed(2)} ms`
                : `Active Format: ${blueSlots.length}v${orangeSlots.length} (${totalCars}/6 Cars)`}
            </span>
          </div>

          {/* Player Participation & Symmetric / Asymmetric Format Presets */}
          <Card isLight={isLight} variant="outlined" className="p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider">
                Player Participation &amp; Symmetric / Asymmetric Presets
              </span>
              <SegmentedSwitch
                size="sm"
                isLight={isLight}
                options={[
                  { label: 'No Player', value: 'none' },
                  { label: '+ Player (Blue)', value: 'blue' },
                  { label: '+ Player (Orange)', value: 'orange' },
                ]}
                value={playerParticipation}
                onValueChange={(v) =>
                  setPlayerParticipation(v as ExpPlayerParticipation)
                }
              />
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {(
                ['1v1 +P', '1v1 Bot', '2v2 +P', '2v2 Bot', '3v3 +P', '3v3 Bot'] as const
              ).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleApplyFormatPreset(preset)}
                  onMouseEnter={() =>
                    setHoveredDesc(`Quickly configure ${preset} symmetric roster layout.`)
                  }
                  onMouseLeave={() => setHoveredDesc(null)}
                  className={`py-1.5 px-2 rounded-lg border text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                    isLight
                      ? 'bg-white hover:bg-amber-500/10 border-neutral-200 text-neutral-700'
                      : 'bg-neutral-900 hover:bg-amber-500/15 border-neutral-800 text-neutral-300'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {(
                [
                  { preset: '3v2 Asym', blue: 3, orange: 2 },
                  { preset: '2v3 Asym', blue: 2, orange: 3 },
                  { preset: '3v1 Asym', blue: 3, orange: 1 },
                  { preset: '2v1 Asym', blue: 2, orange: 1 },
                  { preset: '4v2 Asym', blue: 4, orange: 2 },
                  { preset: '4v1 Asym', blue: 4, orange: 1 },
                ] as const
              ).map((item) => {
                const isSelected =
                  blueSlots.length === item.blue &&
                  orangeSlots.length === item.orange;
                return (
                  <button
                    key={item.preset}
                    type="button"
                    onClick={() => handleApplyFormatPreset(item.preset)}
                    onMouseEnter={() =>
                      setHoveredDesc(
                        `Configure ${item.blue}v${item.orange} asymmetric matchup (keeps current Player Participation: ${playerParticipation}).`
                      )
                    }
                    onMouseLeave={() => setHoveredDesc(null)}
                    className={`py-1.5 px-2 rounded-lg border text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-sky-500/20 border-sky-400 text-sky-400'
                        : isLight
                          ? 'bg-white hover:bg-sky-500/10 border-neutral-200 text-neutral-700'
                          : 'bg-neutral-900 hover:bg-sky-500/15 border-neutral-800 text-neutral-300'
                    }`}
                  >
                    {item.preset}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Blue & Orange Team Roster Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 items-start">
            <div
              onMouseEnter={() =>
                setHoveredDesc(
                  'Blue Team Roster: Add up to 5 slots (6 cars total across both teams), switch Nexto/Necto/Heuristic policies, or select active POV.'
                )
              }
              onMouseLeave={() => setHoveredDesc(null)}
            >
              <TeamRosterCard
                team={0}
                slots={blueSlots}
                globalOffset={0}
                activeCameraCarIndex={activeCameraCarIndex}
                totalCars={totalCars}
                maxTeamSlots={5}
                maxTotalCars={6}
                allowBotpackPolicies={false}
                colorPalette={EXP_SWATCH_PALETTE}
                onAddBot={(team, botType) => addBotToTeam(team, botType)}
                onSelectCameraCar={setActiveCameraCarIndex}
                onSetSlotBotType={(team, slotIdx, botType) =>
                  setSlotBotType(team, slotIdx, botType)
                }
                onSetSlotColor={(team, slotIdx, colorId) =>
                  setSlotColor(team, slotIdx, Number(colorId))
                }
                onRemoveSlot={removeSlotFromTeam}
                isLight={isLight}
              />
            </div>

            <div
              onMouseEnter={() =>
                setHoveredDesc(
                  'Orange Team Roster: Add up to 5 slots (6 cars total across both teams), switch Nexto/Necto/Heuristic policies, or select active POV.'
                )
              }
              onMouseLeave={() => setHoveredDesc(null)}
            >
              <TeamRosterCard
                team={1}
                slots={orangeSlots}
                globalOffset={blueSlots.length}
                activeCameraCarIndex={activeCameraCarIndex}
                totalCars={totalCars}
                maxTeamSlots={5}
                maxTotalCars={6}
                allowBotpackPolicies={false}
                colorPalette={EXP_SWATCH_PALETTE}
                onAddBot={(team, botType) => addBotToTeam(team, botType)}
                onSelectCameraCar={setActiveCameraCarIndex}
                onSetSlotBotType={(team, slotIdx, botType) =>
                  setSlotBotType(team, slotIdx, botType)
                }
                onSetSlotColor={(team, slotIdx, colorId) =>
                  setSlotColor(team, slotIdx, Number(colorId))
                }
                onRemoveSlot={removeSlotFromTeam}
                isLight={isLight}
              />
            </div>
          </div>

          <ExpBotsMatchOptionsAndPovSection
            isLight={isLight}
            accentColor="amber"
            totalCars={totalCars}
            enterButtonLabel={
              isInExpMode
                ? `Apply & Restart Game (${blueSlots.length}v${orangeSlots.length})`
                : `Enter Game (${blueSlots.length}v${orangeSlots.length})`
            }
            enterHoverDescription={`Apply & Restart ${blueSlots.length}v${orangeSlots.length} multi-bot simulation (Active POV: Car #${activeCameraCarIndex + 1}).`}
            onHover={setHoveredDesc}
          />
        </PanelContent>

        <PanelFooter
          isLight={isLight}
          defaultDescription="Configure up to 3v3 Native SafeTensors Nexto & Necto bot rosters and select active camera POV."
          hoveredDescription={hoveredDesc}
        />
      </PanelContainer>
    );
  });

Layer3ExpMultiBotsRecipe.displayName = 'Layer3ExpMultiBotsRecipe';
