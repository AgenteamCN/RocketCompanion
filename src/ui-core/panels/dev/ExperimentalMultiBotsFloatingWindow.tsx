import React from 'react';
import { Play, RotateCcw, Users } from 'lucide-react';
import type {
  StandardSurfaceProps,
  SurfaceMeta,
} from '../../manifest/surfaceMetaTypes';
import { useExperimentalMultiBotsStore } from '../../stores/experimentalMultiBotsStore';
import type { ExpPlayerParticipation } from '../../stores/experimentalMultiBotsRosterUtils';
import { useAppStore } from '../../stores/appStore';
import { SegmentedSwitch } from '../../primitives/SegmentedSwitch';
import { Badge } from '../../primitives/Badge';
import { Button } from '../../primitives/Button';
import { ExperimentalMultiBotsTeamRosterCard } from './ExperimentalMultiBotsTeamRosterCard';
import {
  ExperimentalBotsCameraPovCard,
  ExperimentalBotsMatchControlsCard,
} from './ExperimentalBotsSharedCards';

export const SURFACE_META: SurfaceMeta = {
  id: 'experimental-multi-bots',
  title: 'Experimental Multiple Bots Mode',
  subtitle: 'Up to 3v3 Native SafeTensors Nexto/Necto POV Switching & Inference Telemetry',
  description:
    'Live floating controller for up to 3v3 Native SafeTensors Nexto/Necto POV switching & inference telemetry.',
  icon: 'Users',
  layer: 'floating-dev',
  menuGroup: 'sandboxes',
  defaultSizing: {
    width: 490,
    height: 620,
    minHeight: 200,
    mode: 'adaptive',
  },
};

export interface ExperimentalMultiBotsFloatingWindowProps
  extends StandardSurfaceProps {
  active?: boolean;
}

export const ExperimentalMultiBotsFloatingWindow: React.FC<
  ExperimentalMultiBotsFloatingWindowProps
> = ({ isLight = false, active = true }) => {
  const playerParticipation = useExperimentalMultiBotsStore(
    (s) => s.playerParticipation
  );
  const blueSlots = useExperimentalMultiBotsStore((s) => s.blueSlots);
  const orangeSlots = useExperimentalMultiBotsStore((s) => s.orangeSlots);
  const nextoLoaded = useExperimentalMultiBotsStore((s) => s.nextoLoaded);
  const nectoLoaded = useExperimentalMultiBotsStore((s) => s.nectoLoaded);
  const lastTotalInferenceMs = useExperimentalMultiBotsStore(
    (s) => s.lastTotalInferenceMs
  );
  const setPlayerParticipation = useExperimentalMultiBotsStore(
    (s) => s.setPlayerParticipation
  );
  const applyPresetRoster = useExperimentalMultiBotsStore(
    (s) => s.applyPresetRoster
  );
  const applyAsymmetricPresetRoster = useExperimentalMultiBotsStore(
    (s) => s.applyAsymmetricPresetRoster
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
                ? `Experimental Multiple Bots (${blueSlots.length}v${orangeSlots.length})`
                : 'Experimental Multiple Bots Standby'}
            </span>
          </div>
          <span className={`text-[10px] font-mono truncate mt-0.5 ${mutedText}`}>
            Native SafeTensors EARL Perceiver + SIMD128 · Asymmetric &amp; Up to 6 Cars
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

      {/* 2. Native Model Weights & Inference Telemetry Bar */}
      <div
        className={`px-2.5 py-1.5 rounded-xl border flex items-center justify-between gap-2 ${subPanelBg}`}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge
            variant={nextoLoaded ? 'emerald' : 'amber'}
            size="sm"
            isLight={isLight}
            className="font-mono text-[10px]"
          >
            Nexto SafeTensors: {nextoLoaded ? 'READY' : 'LOADING'}
          </Badge>
          <Badge
            variant={nectoLoaded ? 'emerald' : 'amber'}
            size="sm"
            isLight={isLight}
            className="font-mono text-[10px]"
          >
            Necto SafeTensors: {nectoLoaded ? 'READY' : 'LOADING'}
          </Badge>
        </div>
        <span className="text-[10px] font-mono text-sky-400 shrink-0">
          Infer: {lastTotalInferenceMs.toFixed(2)} ms
        </span>
      </div>

      {/* 3. Player Participation & Quick Presets */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <span className="font-bold text-[11px] flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-sky-400" />
            <span>Player Participation &amp; Matchup Presets</span>
          </span>
          <span className={`text-[10px] font-mono ${mutedText}`}>
            {playerParticipation === 'none'
              ? 'All-Bots Mode (Keys 1-6 switch POV)'
              : `Human Player on ${playerParticipation.toUpperCase()}`}
          </span>
        </div>

        <SegmentedSwitch
          value={playerParticipation}
          onChange={(v) => setPlayerParticipation(v as ExpPlayerParticipation)}
          options={[
            { value: 'none', label: 'No Player (Spectate)' },
            { value: 'blue', label: '+ Player (Blue)' },
            { value: 'orange', label: '+ Player (Orange)' },
          ]}
          size="sm"
          isLight={isLight}
        />

        {/* Quick Symmetric Format Presets */}
        <div className="grid grid-cols-6 gap-1 pt-0.5">
          {[
            { id: '1v1-player', label: '1v1 +P' },
            { id: '2v2-player', label: '2v2 +P' },
            { id: '3v3-player', label: '3v3 +P' },
            { id: '1v1-bots', label: '1v1 Bot' },
            { id: '2v2-bots', label: '2v2 Bot' },
            { id: '3v3-bots', label: '3v3 Bot' },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() =>
                applyPresetRoster(
                  p.id as
                    | '1v1-player'
                    | '2v2-player'
                    | '3v3-player'
                    | '1v1-bots'
                    | '2v2-bots'
                    | '3v3-bots'
                )
              }
              className={`py-1 px-1 rounded-lg text-[10px] font-semibold border transition-colors cursor-pointer text-center ${
                isLight
                  ? 'bg-white hover:bg-neutral-100 border-neutral-300 text-neutral-700'
                  : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Quick Asymmetric Format Presets */}
        <div className="grid grid-cols-6 gap-1">
          {[
            { blue: 3, orange: 2, label: '3v2 Asym' },
            { blue: 2, orange: 3, label: '2v3 Asym' },
            { blue: 3, orange: 1, label: '3v1 Asym' },
            { blue: 2, orange: 1, label: '2v1 Asym' },
            { blue: 4, orange: 2, label: '4v2 Asym' },
            { blue: 4, orange: 1, label: '4v1 Asym' },
          ].map((a) => {
            const isCurrent = blueSlots.length === a.blue && orangeSlots.length === a.orange;
            return (
              <button
                key={a.label}
                type="button"
                onClick={() => applyAsymmetricPresetRoster(a.blue, a.orange)}
                className={`py-1 px-1 rounded-lg text-[10px] font-semibold border transition-colors cursor-pointer text-center ${
                  isCurrent
                    ? 'bg-sky-500/25 border-sky-400 text-sky-300 font-bold'
                    : isLight
                      ? 'bg-white hover:bg-sky-500/10 border-neutral-300 text-neutral-700'
                      : 'bg-neutral-900/80 hover:bg-sky-500/15 border-neutral-700/80 text-neutral-300'
                }`}
              >
                {a.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Bot Camera POV Hotkey Bar (1 - 6) */}
      <ExperimentalBotsCameraPovCard
        isLight={isLight}
        cardBg={cardBg}
        mutedText={mutedText}
      />

      {/* 5. Blue Team (Team 0) Roster Builder (Max 3) */}
      <ExperimentalMultiBotsTeamRosterCard
        team={0}
        isLight={isLight}
        cardBg={cardBg}
        subPanelBg={subPanelBg}
        mutedText={mutedText}
      />

      {/* 6. Orange Team (Team 1) Roster Builder (Max 3) */}
      <ExperimentalMultiBotsTeamRosterCard
        team={1}
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
