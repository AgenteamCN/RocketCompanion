import React from 'react';
import {
  Swords,
  RotateCcw,
  Eye,
  EyeOff,
  Trophy,
  Gauge,
} from 'lucide-react';
import {
  useSubsystemIsolationLabStore,
  type KickoffDuelModelId,
  type IncidentSpeedMultiplier,
} from '../../../stores/subsystemIsolationLabStore';
import {
  KICKOFF_DUEL_SLOTS,
  KICKOFF_DUEL_PAIRINGS,
} from '../../../config/kickoffDuelConfig';
import { SegmentedSwitch } from '../../../primitives/SegmentedSwitch';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { Badge } from '../../../primitives/Badge';
import { Button } from '../../../primitives/Button';
import { KickoffDuelDiagnosticsCard } from './KickoffDuelDiagnosticsCard';
import { KickoffDuelMatrixCard } from '../../../compounds/KickoffDuelMatrixCard';

export interface KickoffDuelBenchPanelProps {
  isLight: boolean;
  cardBg: string;
  subPanelBg: string;
  mutedText: string;
}

const MODEL_META: Record<
  KickoffDuelModelId,
  { short: string; full: string; obsBadge: string; hasObs: boolean }
> = {
  ko_v2: {
    short: 'KO_v2',
    full: 'Kickoff v2 (RLRL101 a9a52e7 · 42D SafeTensors)',
    obsBadge: '42D (6D Opp Obs · Solo-Trained)',
    hasObs: false,
  },
  ko_v1: {
    short: 'KO_v1',
    full: 'Kickoff v1 (Legacy · 75D SafeTensors)',
    obsBadge: '75D Blind (No Opp Obs)',
    hasObs: false,
  },
  nexto: {
    short: 'Nexto',
    full: 'Nexto (EARL Perceiver GC · SafeTensors)',
    obsBadge: 'Multi-Car Perceiver Obs',
    hasObs: true,
  },
  necto: {
    short: 'Necto',
    full: 'Necto (EARL Perceiver Diamond · SafeTensors)',
    obsBadge: 'Multi-Car Perceiver Obs',
    hasObs: true,
  },
};

export const KickoffDuelBenchPanel: React.FC<KickoffDuelBenchPanelProps> = ({
  isLight,
  cardBg,
  subPanelBg,
  mutedText,
}) => {
  const {
    kickoffDuelBlueModel,
    kickoffDuelOrangeModel,
    kickoffDuelSlotIndex,
    kickoffDuelCutoffDelaySec,
    kickoffDuelAutoCycle,
    kickoffDuelAutoCycleAllPairs,
    kickoffDuelSpeedMultiplier,
    kickoffDuelNextoScripted,
    kickoffDuelSoloResults,
    setKickoffDuelModels,
    setKickoffDuelSlotIndex,
    setKickoffDuelCutoffDelaySec,
    setKickoffDuelAutoCycle,
    setKickoffDuelAutoCycleAllPairs,
    setKickoffDuelSpeedMultiplier,
    setKickoffDuelNextoScripted,
    restartKickoffDuel,
  } = useSubsystemIsolationLabStore();

  const blueMeta = MODEL_META[kickoffDuelBlueModel];
  const orangeMeta = MODEL_META[kickoffDuelOrangeModel];

  return (
    <div className="flex flex-col gap-2.5">
      {/* 1. Solo Speed Leaderboard & SafeTensors Model Capabilities */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-semibold text-[11px]">
              4 SafeTensors Models · Uncontested Solo Kickoff Speed (5 Slots @ 120Hz)
            </span>
          </div>
          <Badge variant="emerald" size="sm" isLight={isLight} className="font-mono text-[9px]">
            KO_v2 FASTEST (257.8f)
          </Badge>
        </div>

        <div className={`rounded-lg border overflow-hidden ${subPanelBg}`}>
          <table className="w-full text-[10px] font-mono border-collapse">
            <thead>
              <tr
                className={`border-b ${
                  isLight ? 'border-neutral-200 bg-neutral-100/70' : 'border-neutral-800 bg-neutral-900/60'
                }`}
              >
                <th className="py-1 px-1.5 text-left">Model</th>
                <th className="py-1 px-1 text-left">Opp Obs</th>
                <th className="py-1 px-1 text-right">DR</th>
                <th className="py-1 px-1 text-right">DL</th>
                <th className="py-1 px-1 text-right">BR</th>
                <th className="py-1 px-1 text-right">BL</th>
                <th className="py-1 px-1 text-right">CT</th>
                <th className="py-1 px-1.5 text-right font-bold">Avg</th>
              </tr>
            </thead>
            <tbody>
              {kickoffDuelSoloResults.map((row, idx) => (
                <tr
                  key={row.modelId}
                  className={`border-b last:border-b-0 ${
                    isLight ? 'border-neutral-200/60' : 'border-neutral-800/60'
                  } ${idx === 0 ? 'bg-emerald-500/10' : ''}`}
                >
                  <td className="py-1 px-1.5 font-bold">
                    {idx === 0 ? '[#1] ' : ''}
                    {row.shortName}
                  </td>
                  <td className="py-1 px-1">
                    {row.hasOpponentObs ? (
                      <span className="text-sky-400 flex items-center gap-0.5">
                        <Eye className="h-2.5 w-2.5" /> Yes
                      </span>
                    ) : (
                      <span className="text-neutral-400 flex items-center gap-0.5">
                        <EyeOff className="h-2.5 w-2.5" /> Blind
                      </span>
                    )}
                  </td>
                  {row.slotTicks.map((t, sIdx) => (
                    <td key={sIdx} className="py-1 px-1 text-right">
                      {t}f
                    </td>
                  ))}
                  <td className="py-1 px-1.5 text-right font-bold text-emerald-400">
                    {row.avgTicks}f ({row.avgSec}s)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Live 3D Duel Matchup & 10-Pair Quick Selector */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Swords className="h-3.5 w-3.5 text-sky-400" />
            <span className="font-semibold text-[11px]">
              10 Matchup Pairings (6 Cross-Model + 4 Self-Play) &amp; 5 Kickoff Slots
            </span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => restartKickoffDuel()}
            isLight={isLight}
            className="gap-1 px-2 py-0.5 text-[10px]"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Replay Slot</span>
          </Button>
        </div>

        {/* 10 Preset Pairings Grid */}
        <div className="grid grid-cols-5 gap-1">
          {KICKOFF_DUEL_PAIRINGS.map((pair) => {
            const isSelected =
              kickoffDuelBlueModel === pair.blue && kickoffDuelOrangeModel === pair.orange;
            return (
              <button
                key={pair.id}
                type="button"
                onClick={() =>
                  setKickoffDuelModels(
                    pair.blue as KickoffDuelModelId,
                    pair.orange as KickoffDuelModelId
                  )
                }
                className={`px-1.5 py-1 rounded-lg border text-[9px] font-mono truncate transition-all cursor-pointer ${
                  isSelected
                    ? isLight
                      ? 'bg-sky-600 text-white border-sky-600 font-bold'
                      : 'bg-sky-500/30 text-sky-200 border-sky-400 font-bold'
                    : pair.category === 'self'
                    ? isLight
                      ? 'bg-amber-500/5 border-amber-500/30 text-neutral-700 hover:bg-amber-500/15'
                      : 'bg-amber-500/10 border-amber-500/25 text-amber-200/90 hover:bg-amber-500/20'
                    : isLight
                    ? 'bg-neutral-100 border-neutral-200 text-neutral-700 hover:bg-neutral-200'
                    : 'bg-neutral-900/70 border-neutral-700/70 text-neutral-300 hover:bg-neutral-800'
                }`}
                title={`${pair.label} (${pair.category === 'self' ? 'Self-Play Mirror' : 'Cross-Model Duel'})`}
              >
                {pair.label}
              </button>
            );
          })}
        </div>

        {/* Custom Blue vs Orange Selector */}
        <div className={`p-2 rounded-lg border grid grid-cols-2 gap-2 ${subPanelBg}`}>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-sky-400">BLUE (Car 0)</span>
              <span className={`text-[9px] font-mono ${mutedText}`}>{blueMeta.obsBadge}</span>
            </div>
            <SegmentedSwitch
              value={kickoffDuelBlueModel}
              fullWidth
              size="sm"
              isLight={isLight}
              onValueChange={(v) =>
                setKickoffDuelModels(v as KickoffDuelModelId, kickoffDuelOrangeModel)
              }
              options={[
                { value: 'ko_v2', label: 'KO_v2' },
                { value: 'ko_v1', label: 'KO_v1' },
                { value: 'nexto', label: 'Nexto' },
                { value: 'necto', label: 'Necto' },
              ]}
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-orange-400">ORANGE (Car 1)</span>
              <span className={`text-[9px] font-mono ${mutedText}`}>{orangeMeta.obsBadge}</span>
            </div>
            <SegmentedSwitch
              value={kickoffDuelOrangeModel}
              fullWidth
              size="sm"
              isLight={isLight}
              onValueChange={(v) =>
                setKickoffDuelModels(kickoffDuelBlueModel, v as KickoffDuelModelId)
              }
              options={[
                { value: 'ko_v2', label: 'KO_v2' },
                { value: 'ko_v1', label: 'KO_v1' },
                { value: 'nexto', label: 'Nexto' },
                { value: 'necto', label: 'Necto' },
              ]}
            />
          </div>
        </div>

        {/* 5 Kickoff Slots & Post-Touch Cutoff Rule */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <span className={`text-[10px] font-semibold ${mutedText}`}>
              Kickoff Spawn Slot (5 Positions)
            </span>
            <SegmentedSwitch
              value={String(kickoffDuelSlotIndex)}
              fullWidth
              size="sm"
              isLight={isLight}
              onValueChange={(v) => setKickoffDuelSlotIndex(Number(v))}
              options={KICKOFF_DUEL_SLOTS.map((s) => ({
                value: String(s.slotIndex),
                label: s.code,
              }))}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className={`text-[10px] font-semibold ${mutedText}`}>
              Post-Touch Input Cutoff Delay
            </span>
            <SegmentedSwitch
              value={String(kickoffDuelCutoffDelaySec)}
              fullWidth
              size="sm"
              isLight={isLight}
              onValueChange={(v) => setKickoffDuelCutoffDelaySec(Number(v))}
              options={[
                { value: '0', label: '0.0s (Immediate)' },
                { value: '0.5', label: '+0.5s (60f Cutoff)' },
              ]}
            />
          </div>
        </div>

        {/* Speed & Auto-Cycle Controls */}
        <div
          className={`p-2 rounded-lg border flex flex-wrap items-center justify-between gap-2 ${subPanelBg}`}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium">Auto-Cycle 5 Slots</span>
              <ToggleSwitch
                checked={kickoffDuelAutoCycle}
                onCheckedChange={(v) => setKickoffDuelAutoCycle(v)}
                isLight={isLight}
                variant="neutral"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium">Cycle All 10 Pairs</span>
              <ToggleSwitch
                checked={kickoffDuelAutoCycleAllPairs}
                onCheckedChange={(v) => setKickoffDuelAutoCycleAllPairs(v)}
                isLight={isLight}
                variant="neutral"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Gauge className="h-3 w-3 text-amber-400" />
            <SegmentedSwitch
              value={String(kickoffDuelSpeedMultiplier)}
              size="sm"
              isLight={isLight}
              onValueChange={(v) =>
                setKickoffDuelSpeedMultiplier(Number(v) as IncidentSpeedMultiplier)
              }
              options={[
                { value: '100', label: '1x' },
                { value: '200', label: '2x' },
                { value: '400', label: '4x' },
              ]}
            />
          </div>
        </div>

        {/* Optional Policy Toggle */}
        <div className="flex items-center justify-between px-1 text-[10px]">
          <span className={mutedText}>
            KO_v2 &amp; KO_v1: Blind (No Opponent Obs) · Nexto &amp; Necto: Multi-Car Perceiver Obs
          </span>
          <div className="flex items-center gap-1.5">
            <span className={mutedText}>Nexto Use Scripted Macro:</span>
            <ToggleSwitch
              checked={kickoffDuelNextoScripted}
              onCheckedChange={(v) => setKickoffDuelNextoScripted(v)}
              isLight={isLight}
              variant="neutral"
            />
          </div>
        </div>
      </div>

      {/* 3 & 4. Live Touch Telemetry & Action/Channel Diagnostics Exporter */}
      <KickoffDuelDiagnosticsCard
        isLight={isLight}
        cardBg={cardBg}
        subPanelBg={subPanelBg}
        mutedText={mutedText}
        blueShortName={blueMeta.short}
        orangeShortName={orangeMeta.short}
      />

      {/* 5. Full 10-Pair x 5-Slot Matrix Table (Click any cell to inspect in 3D) */}
      <KickoffDuelMatrixCard
        isLight={isLight}
        cardBg={cardBg}
        subPanelBg={subPanelBg}
      />
    </div>
  );
};
