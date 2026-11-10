import React from 'react';
import { Zap, Play } from 'lucide-react';
import { Button } from '../primitives/Button';
import {
  useSubsystemIsolationLabStore,
  type KickoffDuelModelId,
} from '../stores/subsystemIsolationLabStore';
import { PRECOMPUTED_MATRIX_RESULTS } from '../config/kickoffDuelConfig';
import { UI_RADIUS } from '../tokens/radius';
import { UI_THEME } from '../tokens/colors';

export const ALPHA_COMPONENT_ID = 'Alpha:KickoffDuelMatrixCard' as const;

export interface KickoffDuelSlotCell {
  slotIndex: number;
  slotCode: 'DR' | 'DL' | 'BR' | 'BL' | 'CT';
  winner: 'BLUE' | 'ORANGE' | 'TIE';
  touchTick: number;
  touchSec?: string | number;
  blueDist?: number;
  orangeDist?: number;
  outcome?: string;
  endBallY?: number;
  endBallVy?: number;
}

export interface KickoffDuelMatrixRow {
  pairId: string;
  blue: string;
  orange: string;
  label: string;
  slots: KickoffDuelSlotCell[];
  blueWins: number;
  orangeWins: number;
  ties: number;
}

export const DEFAULT_KICKOFF_DUEL_MATRIX_ROWS: KickoffDuelMatrixRow[] =
  PRECOMPUTED_MATRIX_RESULTS as unknown as KickoffDuelMatrixRow[];

export interface KickoffDuelMatrixCardProps {
  rows?: KickoffDuelMatrixRow[];
  selectedBlueModel?: string;
  selectedOrangeModel?: string;
  selectedSlotIndex?: number;
  isRunningBenchmark?: boolean;
  onSelectCell?: (blueModel: string, orangeModel: string, slotIndex: number) => void;
  onInspectCell?: (pairId: string, slotCode: string) => void;
  onRunBenchmark?: () => void;
  onRunMatrix?: () => void;
  isLight?: boolean;
  className?: string;
  cardBg?: string;
  subPanelBg?: string;
}

/**
 * [L3 Compound] KickoffDuelMatrixCard
 * N-Pairing × 5-Slot (`DR / DL / BR / BL / CT`) Kickoff First-Touch Benchmark Matrix Table.
 * Supports controlled props or falls back to useSubsystemIsolationLabStore when omitted.
 */
export const KickoffDuelMatrixCard: React.FC<KickoffDuelMatrixCardProps> = React.memo(
  ({
    rows: controlledRows,
    selectedBlueModel: controlledBlue,
    selectedOrangeModel: controlledOrange,
    selectedSlotIndex: controlledSlot,
    isRunningBenchmark: controlledRunning,
    onSelectCell,
    onRunBenchmark,
    isLight = true,
    className = '',
    cardBg,
    subPanelBg,
  }) => {
    const {
      kickoffDuelBlueModel,
      kickoffDuelOrangeModel,
      kickoffDuelSlotIndex,
      kickoffDuelBenchmarkRunning,
      kickoffDuelMatrixResults,
      setKickoffDuelModels,
      setKickoffDuelSlotIndex,
      runKickoffDuelBenchmark,
    } = useSubsystemIsolationLabStore();
    const theme = isLight ? UI_THEME.light : UI_THEME.dark;

    const rows =
      controlledRows ??
      ((kickoffDuelMatrixResults && kickoffDuelMatrixResults.length > 0
        ? kickoffDuelMatrixResults
        : PRECOMPUTED_MATRIX_RESULTS) as unknown as KickoffDuelMatrixRow[]);
    const selectedBlueModel = controlledBlue ?? kickoffDuelBlueModel;
    const selectedOrangeModel = controlledOrange ?? kickoffDuelOrangeModel;
    const selectedSlotIndex = controlledSlot ?? kickoffDuelSlotIndex;
    const isRunningBenchmark = controlledRunning ?? kickoffDuelBenchmarkRunning;

    const handleSelectCell = (blue: string, orange: string, slotIndex: number) => {
      if (onSelectCell) {
        onSelectCell(blue, orange, slotIndex);
      } else {
        setKickoffDuelModels(blue as KickoffDuelModelId, orange as KickoffDuelModelId);
        setKickoffDuelSlotIndex(slotIndex);
      }
    };

    const handleRunBenchmark = () => {
      if (onRunBenchmark) {
        onRunBenchmark();
      } else {
        runKickoffDuelBenchmark();
      }
    };

    const containerClass = cardBg
      ? `p-2.5 ${UI_RADIUS.lg} border flex flex-col gap-2 ${cardBg}`
      : `p-3 ${UI_RADIUS.lg} border flex flex-col gap-2.5 select-none ${
          isLight
            ? `bg-neutral-50 border-neutral-200 ${theme.textPrimary}`
            : `bg-neutral-900/70 border-neutral-800 ${theme.textPrimary}`
        } ${className}`;

    const tableWrapClass = subPanelBg
      ? `${UI_RADIUS.md} border overflow-x-auto max-h-52 overflow-y-auto ${subPanelBg}`
      : `${UI_RADIUS.md} border overflow-x-auto max-h-52 overflow-y-auto ${
          isLight ? 'bg-white border-neutral-200' : 'bg-neutral-950/70 border-neutral-800'
        }`;

    return (
      <div
        data-alpha-id={ALPHA_COMPONENT_ID}
        data-ui-element="compound-kickoff-duel-matrix-card"
        className={containerClass}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            <span className="font-bold text-xs">
              Kickoff AI Pairing × 5-Spawn Benchmark Matrix
            </span>
          </div>
          <Button
            variant="primary"
            size="sm"
            disabled={isRunningBenchmark}
            onClick={handleRunBenchmark}
            isLight={isLight}
            className="gap-1 px-2.5 py-1 text-[10px]"
          >
            <Play className="h-3 w-3 fill-current" />
            <span>{isRunningBenchmark ? 'Simulating Duels...' : 'Re-Run Duels'}</span>
          </Button>
        </div>

        <div className={tableWrapClass}>
          <table className="w-full text-[10px] font-mono border-collapse">
            <thead>
              <tr
                className={`border-b sticky top-0 ${
                  isLight ? 'border-neutral-200 bg-neutral-100' : 'border-neutral-800 bg-neutral-900'
                }`}
              >
                <th className="py-1.5 px-2 text-left">Matchup (Blue vs Orange)</th>
                <th className="py-1.5 px-1.5 text-center">DR</th>
                <th className="py-1.5 px-1.5 text-center">DL</th>
                <th className="py-1.5 px-1.5 text-center">BR</th>
                <th className="py-1.5 px-1.5 text-center">BL</th>
                <th className="py-1.5 px-1.5 text-center">CT</th>
                <th className="py-1.5 px-2 text-right">W-L-T</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isCurrentPair =
                  row.blue === selectedBlueModel && row.orange === selectedOrangeModel;
                return (
                  <tr
                    key={row.pairId}
                    className={`border-b last:border-b-0 ${
                      isLight ? 'border-neutral-200/70' : 'border-neutral-800/70'
                    } ${isCurrentPair ? 'bg-amber-500/10' : ''}`}
                  >
                    <td
                      className="py-1.5 px-2 font-semibold cursor-pointer hover:underline whitespace-nowrap"
                      onClick={() => handleSelectCell(row.blue, row.orange, selectedSlotIndex)}
                    >
                      {row.label}
                    </td>
                    {row.slots.map((s) => {
                      const isCellActive = isCurrentPair && selectedSlotIndex === s.slotIndex;
                      const winColor =
                        s.winner === 'BLUE'
                          ? 'text-sky-500'
                          : s.winner === 'ORANGE'
                          ? 'text-amber-500'
                          : 'text-emerald-500';
                      const winChar =
                        s.winner === 'BLUE' ? 'B' : s.winner === 'ORANGE' ? 'O' : 'T';
                      return (
                        <td
                          key={s.slotIndex}
                          onClick={() => handleSelectCell(row.blue, row.orange, s.slotIndex)}
                          className={`py-1.5 px-1.5 text-center cursor-pointer transition-colors hover:bg-amber-500/15 ${
                            isCellActive ? 'ring-1 ring-inset ring-amber-500 font-bold' : ''
                          } ${winColor}`}
                          title={
                            s.touchSec
                              ? `${row.label} @ ${s.slotCode}: First Touch=${s.winner} at ${s.touchTick}f (${s.touchSec}s), Dist=${s.blueDist}/${s.orangeDist}uu, Ball Outcome=${s.outcome}`
                              : `${row.label} @ ${s.slotCode}: ${s.winner} at ${s.touchTick}f`
                          }
                        >
                          {winChar}:{s.touchTick}f
                        </td>
                      );
                    })}
                    <td className="py-1.5 px-2 text-right font-bold whitespace-nowrap">
                      <span className="text-sky-500">{row.blueWins}</span>-
                      <span className="text-amber-500">{row.orangeWins}</span>-
                      <span className="text-emerald-500">{row.ties}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }
);

KickoffDuelMatrixCard.displayName = 'KickoffDuelMatrixCard';
