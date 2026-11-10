import React from 'react';
import {
  Zap,
  Play,
  ArrowLeftRight,
  Trophy,
  Pause,
  Flame,
  RotateCcw,
} from 'lucide-react';
import {
  useSubsystemIsolationLabStore,
  type IncidentOpponentMode,
  type IncidentControlledCar,
  type IncidentSpeedMultiplier,
} from '../../../stores/subsystemIsolationLabStore';
import { SegmentedSwitch } from '../../../primitives/SegmentedSwitch';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { Badge } from '../../../primitives/Badge';
import { Button } from '../../../primitives/Button';

export interface NinetySecMatchBenchPanelProps {
  isLight?: boolean;
  cardBg: string;
  subPanelBg: string;
  mutedText: string;
}

export const NinetySecMatchBenchPanel: React.FC<NinetySecMatchBenchPanelProps> = ({
  isLight = false,
  cardBg,
  subPanelBg,
  mutedText,
}) => {
  const {
    incidentMatchActive,
    incidentOpponentMode,
    incidentControlledCar,
    incidentSpeedMultiplier,
    incidentDisableGoalReplay,
    incidentClockStarted,
    incidentTicksSinceKickoff,
    incidentKickoffCountdownSec,
    incidentPhase,
    incidentBlueScore,
    incidentOrangeScore,
    incidentRemainingSec,
    incidentOvertime,
    incidentPossessionTeam,
    incidentPossessionBluePts,
    incidentPossessionOrangePts,
    setIncidentOpponentMode,
    setIncidentControlledCar,
    switchIncidentControlledCar,
    setIncidentSpeedMultiplier,
    setIncidentDisableGoalReplay,
    runtimeHandlers,
  } = useSubsystemIsolationLabStore();

  return (
    <div className="flex flex-col gap-2.5">
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-semibold text-[11px]">90s Incident & Overtime Match Sandbox</span>
          </div>
          <Badge
            variant={incidentMatchActive ? 'emerald' : 'neutral'}
            size="sm"
            isLight={isLight}
            className="font-mono text-[10px] uppercase"
          >
            {incidentMatchActive ? incidentPhase : 'STANDBY'}
          </Badge>
        </div>

        {/* Control Routing: Manual Control vs Nexto AI Bot Control */}
        <div className="flex flex-col gap-1">
          <span className={`text-[10px] font-semibold uppercase ${mutedText}`}>
            Vehicle Control Source (Manual Input vs AI Bot Input)
          </span>
          <SegmentedSwitch
            value={incidentOpponentMode}
            fullWidth
            size="sm"
            isLight={isLight}
            onValueChange={(v) => setIncidentOpponentMode(v as IncidentOpponentMode)}
            options={[
              { value: 'stationary', label: 'Manual Control (Human)' },
              { value: 'nexto', label: 'AI Bot Control (Nexto)' },
            ]}
          />
          <span className={`text-[10px] ${mutedText}`}>
            {incidentOpponentMode === 'stationary'
              ? 'Manual feeds your keyboard/gamepad into the selected vehicle; the other car stays still.'
              : 'AI Bot hooks Nexto neural/heuristic control directly into both vehicles.'}
          </span>
        </div>

        {/* Active Vehicle Switcher (Blue Car 0 vs Orange Car 1) */}
        <div className="flex flex-col gap-1 pt-0.5">
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-semibold uppercase ${mutedText}`}>
              Active Vehicle ({incidentOpponentMode === 'stationary' ? 'Manual Drive Target' : 'Camera Target'})
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={switchIncidentControlledCar}
              isLight={isLight}
              className="gap-1 px-2 py-0.5 text-[10px]"
            >
              <ArrowLeftRight className="h-3 w-3" />
              <span>Switch Side</span>
            </Button>
          </div>
          <SegmentedSwitch
            value={String(incidentControlledCar)}
            fullWidth
            size="sm"
            isLight={isLight}
            onValueChange={(v) => setIncidentControlledCar(Number(v) as IncidentControlledCar)}
            options={[
              { value: '0', label: 'Blue Team (Car 0)' },
              { value: '1', label: 'Orange Team (Car 1)' },
            ]}
          />
        </div>

        {/* Simulation Speed Multiplier: 100%, 200%, 300%, 400%, 500% */}
        <div className="flex flex-col gap-1 pt-0.5">
          <div className="flex items-center justify-between">
            <span className={`text-[10px] font-semibold uppercase ${mutedText}`}>
              Match Speed Multiplier
            </span>
            <Badge variant="neutral" size="sm" isLight={isLight} className="font-mono text-[10px]">
              {incidentSpeedMultiplier}% ({Math.round(1.2 * incidentSpeedMultiplier)}Hz)
            </Badge>
          </div>
          <SegmentedSwitch
            value={String(incidentSpeedMultiplier)}
            fullWidth
            size="sm"
            isLight={isLight}
            onValueChange={(v) => setIncidentSpeedMultiplier(Number(v) as IncidentSpeedMultiplier)}
            options={[
              { value: '100', label: '100%' },
              { value: '200', label: '200%' },
              { value: '300', label: '300%' },
              { value: '400', label: '400%' },
              { value: '500', label: '500%' },
            ]}
          />
        </div>

        {/* Disable Goal Replay Toggle (Default ON) */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex flex-col">
            <span className="font-semibold text-[11px]">Disable Goal Replay (Skip to Kickoff)</span>
            <span className={`text-[10px] ${mutedText}`}>
              Skips post-goal replay directly to 3-2-1 kickoff countdown
            </span>
          </div>
          <ToggleSwitch
            checked={incidentDisableGoalReplay}
            onCheckedChange={(v) => setIncidentDisableGoalReplay(v)}
            isLight={isLight}
            variant="neutral"
          />
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => runtimeHandlers.onStartIncidentMatch?.(incidentOpponentMode)}
          isLight={isLight}
          className="w-full gap-1.5 py-1.5 text-xs font-bold mt-1"
        >
          <Play className="h-3.5 w-3.5 fill-current" />
          <span>
            {incidentMatchActive ? 'Restart 1:30 Match (Reset Scores & Possession)' : 'Start 1:30 Match'}
          </span>
        </Button>
      </div>

      {/* Live Clock, 3-2-1 Countdown, 5s Kickoff Touch Timeout & Persistent Possession Readout */}
      <div className={`p-2.5 rounded-xl border font-mono text-[10px] flex flex-col gap-1.5 ${subPanelBg}`}>
        <div className="flex items-center justify-between border-b border-neutral-700/30 pb-1">
          <span>
            SCORE: <b className="text-sky-400">BLUE {incidentBlueScore}</b> –{' '}
            <b className="text-amber-400">{incidentOrangeScore} ORANGE</b>
          </span>
          <span>
            CLOCK:{' '}
            <b>
              {Math.floor(incidentRemainingSec / 60)}:
              {String(Math.floor(incidentRemainingSec % 60)).padStart(2, '0')}
            </b>
            {incidentOvertime ? ' (OT)' : ''}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span>
            Kickoff Gate:{' '}
            <b className={incidentClockStarted ? 'text-emerald-400' : 'text-amber-400'}>
              {incidentKickoffCountdownSec > 0
                ? `COUNTDOWN (${incidentKickoffCountdownSec}...)`
                : incidentClockStarted
                ? 'RUNNING'
                : `WAITING TOUCH (${Math.max(0, 5.0 - incidentTicksSinceKickoff / 120).toFixed(1)}s / 5.0s)`}
            </b>
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span>
            Possession:{' '}
            <b>
              {incidentPossessionTeam === 1
                ? 'BLUE'
                : incidentPossessionTeam === 2
                ? 'ORANGE'
                : 'NEUTRAL'}
            </b>
          </span>
          <span>
            Match Possession Score: <b className="text-sky-400">B:{incidentPossessionBluePts}</b> /{' '}
            <b className="text-amber-400">O:{incidentPossessionOrangePts}</b>
          </span>
        </div>
      </div>

      {/* Instant Incident Triggers */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${cardBg}`}>
        <span className={`text-[10px] font-semibold uppercase ${mutedText}`}>
          Instant Incident & Signal Triggers
        </span>
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => runtimeHandlers.onTriggerIncidentAction?.('score_blue')}
            isLight={isLight}
            className="gap-1 py-1 text-[11px]"
          >
            <Flame className="h-3 w-3 text-sky-400" />
            <span>Goal Blue</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => runtimeHandlers.onTriggerIncidentAction?.('score_orange')}
            isLight={isLight}
            className="gap-1 py-1 text-[11px]"
          >
            <Flame className="h-3 w-3 text-amber-400" />
            <span>Goal Orange</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => runtimeHandlers.onTriggerIncidentAction?.('force_overtime')}
            isLight={isLight}
            className="gap-1 py-1 text-[11px]"
          >
            <Trophy className="h-3 w-3 text-emerald-400" />
            <span>Force Overtime</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => runtimeHandlers.onTriggerIncidentAction?.('pause_5s')}
            isLight={isLight}
            className="gap-1 py-1 text-[11px]"
          >
            <Pause className="h-3 w-3 text-rose-400" />
            <span>5s Will-Resume</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => runtimeHandlers.onTriggerIncidentAction?.('reset_kickoff')}
            isLight={isLight}
            className="col-span-2 gap-1 py-1 text-[11px]"
          >
            <RotateCcw className="h-3 w-3 text-amber-400" />
            <span>Trigger 3-2-1 Kickoff (Preserve Scores & Possession)</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => runtimeHandlers.onTriggerIncidentAction?.('podium_blue')}
            isLight={isLight}
            className="gap-1 py-1 text-[10px]"
          >
            <Trophy className="h-3 w-3 text-sky-400" />
            <span>Podium: Blue Wins</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => runtimeHandlers.onTriggerIncidentAction?.('podium_orange')}
            isLight={isLight}
            className="gap-1 py-1 text-[10px]"
          >
            <Trophy className="h-3 w-3 text-amber-400" />
            <span>Podium: Orange Wins</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
