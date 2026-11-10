import React, { useEffect, useState } from 'react';
import { Card } from '../layout/Card';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import {
  TeamRosterCard,
  type TeamRosterSlotConfig,
  type BotPolicyId,
  type CarColorSwatch,
} from '../compounds/TeamRosterCard';
import { useAppStore } from '../stores/appStore';
import { useExperimentalMultiBotsStore } from '../stores/experimentalMultiBotsStore';
import {
  BOTPACK_9700488_POLICY_METAS,
  EXP_CAR_COLOR_PALETTE,
  getExpBotPolicyMeta,
} from '../stores/experimentalMultiBotsRosterUtils';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useScopedStore } from '../stores/storeSnapshotScope';
import { DEFAULT_PANEL_SIZING } from '../tokens/menuLayoutTokens';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import {
  ExpBotsMatchOptionsAndPovSection,
  enterOrRestartExperimentalBotsGame,
} from './dev/ExpBotsMatchOptionsAndPovSection';

export type Layer3ExpBotPackRecipeProps = StandardSurfaceProps;

export const SURFACE_META: SurfaceMeta = {
  id: 'layer3-exp-botpack',
  title: 'EXPERIMENTAL BOT PACK #9700488 (8 NATIVE MODELS)',
  subtitle: '8 Native SafeTensors RLBot #9700488 Models Showcase',
  description:
    'Spectate the 8 native SafeTensors models from RLBot Pack #9700488 in their recommended match formats.',
  icon: 'sparkles',
  layer: 'layer3',
  menuGroup: 'menu-layer',
  defaultSizing: {
    mode: 'adaptive',
    width: DEFAULT_PANEL_SIZING['layer3-exp-botpack'].width,
    height: DEFAULT_PANEL_SIZING['layer3-exp-botpack'].targetHeight,
    minHeight: DEFAULT_PANEL_SIZING['layer3-exp-botpack'].minHeight,
    maxHeight: DEFAULT_PANEL_SIZING['layer3-exp-botpack'].maxHeight,
  },
};

const EXP_SWATCH_PALETTE: CarColorSwatch[] = EXP_CAR_COLOR_PALETTE.map((c) => ({
  id: String(c.id),
  name: c.name,
  hex: c.hex,
}));

export const Layer3ExpBotPackRecipe: React.FC<Layer3ExpBotPackRecipeProps> =
  React.memo(({ isLight = true, onBack: propOnBack }) => {
    const storeGoBack = useScopedStore('appStore', useAppStore, (s) => s.goBack);
    const matchMode = useScopedStore('appStore', useAppStore, (s) => s.matchMode);
    const onBack = propOnBack ?? storeGoBack;
    const isInExpMode = matchMode === 'exp-multi-bots';

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
    const activeBotpackShowcaseModel = useScopedStore(
      'experimentalMultiBotsStore',
      useExperimentalMultiBotsStore,
      (s) => s.activeBotpackShowcaseModel
    );
    const savedBotpackModel = useScopedStore(
      'experimentalMultiBotsStore',
      useExperimentalMultiBotsStore,
      (s) => s.savedBotpackModel
    );
    const activeCameraCarIndex = useScopedStore(
      'experimentalMultiBotsStore',
      useExperimentalMultiBotsStore,
      (s) => s.activeCameraCarIndex
    );
    const lastTotalInferenceMs = useScopedStore(
      'experimentalMultiBotsStore',
      useExperimentalMultiBotsStore,
      (s) => s.lastTotalInferenceMs
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
    const applyBotpack9700488Showcase = useScopedStore(
      'experimentalMultiBotsStore',
      useExperimentalMultiBotsStore,
      (s) => s.applyBotpack9700488Showcase
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
      if (st.activeSubMode !== 'botpack') {
        st.activateBotpackSubMode(undefined, false);
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
        s.panels?.['layer3-exp-botpack'] ??
        DEFAULT_PANEL_SIZING['layer3-exp-botpack']
    );
    const totalCars = blueSlots.length + orangeSlots.length;
    const selectedModel =
      activeBotpackShowcaseModel ||
      savedBotpackModel ||
      blueSlots[0]?.botType ||
      'chronos';
    const activeMeta = getExpBotPolicyMeta(selectedModel);

    return (
      <PanelContainer isLight={isLight} sizing={sizing} className="w-full select-none">
        <PanelHeader
          isLight={isLight}
          title="EXPERIMENTAL BOT PACK #9700488 (8 NATIVE MODELS)"
          onBack={onBack}
          onRightAction={() => enterOrRestartExperimentalBotsGame('botpack')}
          rightActionLabel={isInExpMode ? 'Apply & Restart ↗' : 'Enter Game ↗'}
        />

        <PanelContent scrollable={true} className="flex flex-col gap-3">
          {/* Active BotPack Model & WASM SIMD128 Status Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-[11px] font-mono">
            <span className="text-emerald-400 font-bold">
              ● Active Showcase: {activeMeta.label} ({activeMeta.formatBadge})
            </span>
            <span className="text-sky-400 font-bold">
              ● WASM SIMD128 MatVec: READY
            </span>
            <span className={isLight ? 'text-neutral-600' : 'text-neutral-400'}>
              {isInExpMode
                ? `Active (${blueSlots.length}v${orangeSlots.length}) · Infer: ${lastTotalInferenceMs.toFixed(2)} ms`
                : `Recommended Format: ${blueSlots.length}v${orangeSlots.length}`}
            </span>
          </div>

          {/* 8 Models Spectate Showcase Selector */}
          <Card isLight={isLight} variant="outlined" className="p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold tracking-wider text-emerald-500">
                Experimental Bot Pack #9700488 — 8 Models Spectate Showcase
              </span>
              <span
                className={`text-[10px] font-mono ${
                  isLight ? 'text-neutral-500' : 'text-neutral-400'
                }`}
              >
                Select any model to configure max-format all-bots spectate (3v3 / 2v2 / 1v1)
              </span>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
              {BOTPACK_9700488_POLICY_METAS.map((m) => {
                const isSelected = selectedModel === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => applyBotpack9700488Showcase(m.id, true)}
                    onMouseEnter={() =>
                      setHoveredDesc(
                        `Configure ${m.label} (${m.formatBadge}) all-bots spectate match where every car runs ${m.label}.`
                      )
                    }
                    onMouseLeave={() => setHoveredDesc(null)}
                    className={`py-1.5 px-2 rounded-lg border text-[10px] font-mono font-bold flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-400 shadow-xs'
                        : isLight
                          ? 'bg-white hover:bg-emerald-500/10 border-neutral-200 text-neutral-700'
                          : 'bg-neutral-900 hover:bg-emerald-500/15 border-neutral-800 text-neutral-300'
                    }`}
                  >
                    <span className="truncate max-w-full">{m.shortLabel}</span>
                    <span className="text-[9px] opacity-75">{m.formatBadge}</span>
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
                  'Blue Team Roster: Customize individual BotPack #9700488 policies, colors, or active POV.'
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
                maxTeamSlots={activeMeta.maxPlayersPerTeam}
                maxTotalCars={activeMeta.maxPlayersPerTeam * 2}
                allowBotpackPolicies={true}
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
                  'Orange Team Roster: Customize individual BotPack #9700488 policies, colors, or active POV.'
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
                maxTeamSlots={activeMeta.maxPlayersPerTeam}
                maxTotalCars={activeMeta.maxPlayersPerTeam * 2}
                allowBotpackPolicies={true}
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
            accentColor="emerald"
            totalCars={totalCars}
            enterButtonLabel={
              isInExpMode
                ? `Apply & Restart Showcase (${activeMeta.shortLabel} · ${blueSlots.length}v${orangeSlots.length})`
                : `Enter Bot Pack Showcase (${activeMeta.shortLabel} · ${blueSlots.length}v${orangeSlots.length})`
            }
            enterHoverDescription={`Apply & Restart ${activeMeta.label} (${blueSlots.length}v${orangeSlots.length}) BotPack #9700488 showcase.`}
            onHover={setHoveredDesc}
          />
        </PanelContent>

        <PanelFooter
          isLight={isLight}
          defaultDescription="Spectate the 8 native SafeTensors models from RLBot Pack #9700488 in their recommended match formats."
          hoveredDescription={hoveredDesc}
        />
      </PanelContainer>
    );
  });

Layer3ExpBotPackRecipe.displayName = 'Layer3ExpBotPackRecipe';
