import React from 'react';
import { Play, RotateCcw, Sparkles } from 'lucide-react';
import type {
  StandardSurfaceProps,
  SurfaceMeta,
} from '../../manifest/surfaceMetaTypes';
import { useExperimentalMultiBotsStore } from '../../stores/experimentalMultiBotsStore';
import {
  BOTPACK_9700488_POLICY_METAS,
  getExpBotPolicyMeta,
} from '../../stores/experimentalMultiBotsRosterUtils';
import { useAppStore } from '../../stores/appStore';
import { Badge } from '../../primitives/Badge';
import { Button } from '../../primitives/Button';
import { ExperimentalMultiBotsTeamRosterCard } from './ExperimentalMultiBotsTeamRosterCard';
import {
  ExperimentalBotsCameraPovCard,
  ExperimentalBotsMatchControlsCard,
} from './ExperimentalBotsSharedCards';

export const SURFACE_META: SurfaceMeta = {
  id: 'experimental-bot-pack',
  title: 'Experimental Bot Pack #9700488',
  subtitle: '8 Native SafeTensors Policies (Chronos, Dice, Ducky, Fury, Galactus, Kira, Rain, Ripple v1.1)',
  description:
    'Live floating controller for Experimental Bot Pack #9700488 (8 native models: Chronos, Dice, Ducky, Fury, Galactus, Kira, Rain, Ripple v1.1).',
  icon: 'Sparkles',
  layer: 'floating-dev',
  menuGroup: 'sandboxes',
  defaultSizing: {
    width: 490,
    height: 620,
    minHeight: 200,
    mode: 'adaptive',
  },
};

export interface ExperimentalBotPackFloatingWindowProps
  extends StandardSurfaceProps {
  active?: boolean;
}

export const ExperimentalBotPackFloatingWindow: React.FC<
  ExperimentalBotPackFloatingWindowProps
> = ({ isLight = false, active = true }) => {
  const blueSlots = useExperimentalMultiBotsStore((s) => s.blueSlots);
  const orangeSlots = useExperimentalMultiBotsStore((s) => s.orangeSlots);
  const activeBotpackShowcaseModel = useExperimentalMultiBotsStore(
    (s) => s.activeBotpackShowcaseModel
  );
  const lastTotalInferenceMs = useExperimentalMultiBotsStore(
    (s) => s.lastTotalInferenceMs
  );
  const applyBotpack9700488Showcase = useExperimentalMultiBotsStore(
    (s) => s.applyBotpack9700488Showcase
  );
  const startOrApplyMatch = useExperimentalMultiBotsStore(
    (s) => s.startOrApplyMatch
  );
  const preloadEngines = useExperimentalMultiBotsStore((s) => s.preloadEngines);

  React.useEffect(() => {
    preloadEngines?.();
  }, [preloadEngines]);

  const matchMode = useAppStore((s) => s.matchMode);
  const bridge = useAppStore((s) => s.bridge);
  const isInExpMode = matchMode === 'exp-multi-bots';

  if (!active) return null;

  const cardBg = isLight
    ? 'bg-neutral-50/90 border-neutral-200 text-neutral-800'
    : 'bg-neutral-850/60 border-neutral-700/60 text-neutral-200';

  const subPanelBg = isLight
    ? 'bg-white border-neutral-200/90 text-neutral-800'
    : 'bg-neutral-950/50 border-neutral-800 text-neutral-200';

  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  const activeMeta = getExpBotPolicyMeta(
    activeBotpackShowcaseModel ?? blueSlots[0]?.botType ?? 'chronos'
  );

  return (
    <div className="flex flex-col gap-2.5 select-none text-xs">
      {/* 1. Top Status Bar & Mode Activation */}
      <div className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${cardBg}`}>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${
                isInExpMode ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="font-bold text-xs truncate">
              {isInExpMode
                ? `Experimental Bot Pack #9700488 · ${activeMeta.label} (${blueSlots.length}v${orangeSlots.length})`
                : `Experimental Bot Pack #9700488 · ${activeMeta.label} Standby`}
            </span>
          </div>
          <span className={`text-[10px] font-mono truncate mt-0.5 ${mutedText}`}>
            RLBot Pack #9700488 · Native SafeTensors + SIMD128 · Zero ONNX
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {!isInExpMode ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => bridge.onStartExpMultiBots?.()}
              isLight={isLight}
              className="gap-1.5 px-2.5 py-1 text-[11px] font-semibold"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Enter Mode</span>
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => startOrApplyMatch()}
              isLight={isLight}
              className="gap-1 px-2 py-1 text-[11px] font-semibold"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Apply &amp; Restart</span>
            </Button>
          )}
        </div>
      </div>

      {/* 2. Active Bot Pack Model & Telemetry Bar */}
      <div
        className={`px-2.5 py-1.5 rounded-xl border flex items-center justify-between gap-2 ${subPanelBg}`}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge
            variant="emerald"
            size="sm"
            isLight={isLight}
            className="font-mono text-[10px]"
          >
            Active Model: {activeMeta.label} ({activeMeta.formatBadge})
          </Badge>
          <Badge
            variant="sky"
            size="sm"
            isLight={isLight}
            className="font-mono text-[10px]"
          >
            WASM SIMD128: READY
          </Badge>
        </div>
        <span className="text-[10px] font-mono text-sky-400 shrink-0">
          Infer: {lastTotalInferenceMs.toFixed(2)} ms
        </span>
      </div>

      {/* 3. experimental bot pack #9700488 — 8 Models One-Click Spectate Selector */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${cardBg}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-[11px] flex items-center gap-1.5 text-emerald-400">
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            <span>Experimental Bot Pack #9700488 (8 Native Policies)</span>
          </span>
          <span className={`text-[10px] font-mono ${mutedText}`}>
            1-Click Max-Format Match Reset &amp; Spectate
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {BOTPACK_9700488_POLICY_METAS.map((m) => {
            const isSelected = activeBotpackShowcaseModel === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  applyBotpack9700488Showcase(m.id, true);
                  if (!isInExpMode) {
                    bridge.onStartExpMultiBots?.();
                  }
                }}
                className={`px-2 py-1.5 rounded-lg border text-[10px] font-semibold flex items-center justify-between gap-1 transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-500/25 border-emerald-400 text-emerald-300 font-bold shadow-xs'
                    : isLight
                      ? 'bg-white hover:bg-emerald-500/10 border-neutral-300 text-neutral-700'
                      : 'bg-neutral-900/80 hover:bg-emerald-500/15 border-neutral-700/80 text-neutral-200'
                }`}
              >
                <span className="truncate">{m.label}</span>
                <span className="text-[9px] font-mono opacity-75 shrink-0">
                  {m.formatBadge}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Camera POV Switcher (Keys 1 - 6) */}
      <ExperimentalBotsCameraPovCard
        isLight={isLight}
        cardBg={cardBg}
        mutedText={mutedText}
      />

      {/* 5. Blue Team (Team 0) Roster Builder */}
      <ExperimentalMultiBotsTeamRosterCard
        team={0}
        allowBotpackPolicies={true}
        isLight={isLight}
        cardBg={cardBg}
        subPanelBg={subPanelBg}
        mutedText={mutedText}
      />

      {/* 6. Orange Team (Team 1) Roster Builder */}
      <ExperimentalMultiBotsTeamRosterCard
        team={1}
        allowBotpackPolicies={true}
        isLight={isLight}
        cardBg={cardBg}
        subPanelBg={subPanelBg}
        mutedText={mutedText}
      />

      {/* 7. Live Match Scoreboard, Speed Multiplier & Sandbox Triggers */}
      <ExperimentalBotsMatchControlsCard
        isLight={isLight}
        cardBg={cardBg}
        mutedText={mutedText}
      />
    </div>
  );
};
