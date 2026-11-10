import React from 'react';
import {
  Film,
  Flame,
  Play,
  Pause,
  FastForward,
  RotateCcw,
  Download,
  Trophy,
  Radio,
} from 'lucide-react';
import { useSubsystemIsolationLabStore } from '../../../stores/subsystemIsolationLabStore';
import { SliderControl } from '../../../primitives/SliderControl';
import { Badge } from '../../../primitives/Badge';
import { Button } from '../../../primitives/Button';

export interface GoalReplayScenariosAndPodiumSectionProps {
  isLight: boolean;
  cardBg: string;
  subPanelBg: string;
  mutedText: string;
}

const SCENARIO_BUTTONS: ReadonlyArray<{
  id: 'instant_kickoff_goal' | 'normal_play_goal' | 'emit_kickoff_signal' | 'trigger_goal_now';
  label: string;
  variant: 'primary' | 'secondary';
  className: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'instant_kickoff_goal',
    label: 'Instant Kickoff Goal (<1s · Clamp)',
    variant: 'primary',
    className: 'gap-1 py-1.5 text-[10px] font-bold',
    icon: <Flame className="h-3 w-3 shrink-0" />,
  },
  {
    id: 'normal_play_goal',
    label: 'Normal Play Goal (>6s · Full)',
    variant: 'primary',
    className: 'gap-1 py-1.5 text-[10px] font-bold',
    icon: <Play className="h-3 w-3 shrink-0 fill-current" />,
  },
  {
    id: 'emit_kickoff_signal',
    label: 'Emit KICKOFF_WILL_START Now',
    variant: 'secondary',
    className: 'gap-1 py-1 text-[10px]',
    icon: <Radio className="h-3 w-3 text-amber-400 shrink-0" />,
  },
  {
    id: 'trigger_goal_now',
    label: 'Trigger Goal Incident Now',
    variant: 'secondary',
    className: 'gap-1 py-1 text-[10px]',
    icon: <Flame className="h-3 w-3 text-rose-400 shrink-0" />,
  },
];

const PODIUM_TEAM_OPTIONS: ReadonlyArray<{ team: 0 | 1 | 2; label: string }> = [
  { team: 0, label: 'Blue Wins' },
  { team: 1, label: 'Orange Wins' },
  { team: 2, label: 'Draw Podium' },
];

export const GoalReplayScenariosAndPodiumSection: React.FC<
  GoalReplayScenariosAndPodiumSectionProps
> = ({ isLight, cardBg, subPanelBg, mutedText }) => {
  const {
    goalReplayPhase,
    goalReplayPlaybackCursor,
    goalReplayPlaybackTotal,
    goalReplayPaused,
    goalReplaySpeed,
    podiumActive,
    podiumWinningTeam,
    runtimeHandlers,
  } = useSubsystemIsolationLabStore();

  const progressPct =
    goalReplayPlaybackTotal > 1
      ? Math.min(100, Math.max(0, (goalReplayPlaybackCursor / (goalReplayPlaybackTotal - 1)) * 100))
      : 0;

  return (
    <>
      {/* 3. Goal Incident & Kickoff Signal Test Scenarios */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${cardBg}`}>
        <span className={`text-[10px] font-semibold uppercase ${mutedText}`}>
          Goal Incident &amp; Kickoff Signal Test Scenarios
        </span>
        <div className="grid grid-cols-2 gap-1.5">
          {SCENARIO_BUTTONS.map((btn) => (
            <Button
              key={btn.id}
              variant={btn.variant}
              size="sm"
              onClick={() => runtimeHandlers.onGoalReplayTriggerScenario?.(btn.id)}
              isLight={isLight}
              className={btn.className}
            >
              {btn.icon}
              <span>{btn.label}</span>
            </Button>
          ))}

          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              runtimeHandlers.onGoalReplayTriggerScenario?.(
                goalReplayPhase === 'replaying' ? 'stop_replay' : 'start_replay_now'
              )
            }
            isLight={isLight}
            className="gap-1 py-1 text-[10px]"
          >
            {goalReplayPhase === 'replaying' ? (
              <>
                <RotateCcw className="h-3 w-3 text-emerald-400 shrink-0" />
                <span>Exit Replay → Live Play</span>
              </>
            ) : (
              <>
                <Film className="h-3 w-3 text-sky-400 shrink-0" />
                <span>Play Extracted Replay Now</span>
              </>
            )}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => runtimeHandlers.onGoalReplayTriggerScenario?.('export_replay_json')}
            isLight={isLight}
            className="gap-1 py-1 text-[10px]"
          >
            <Download className="h-3 w-3 text-emerald-400 shrink-0" />
            <span>Export Match Replay (.json)</span>
          </Button>
        </div>

        {/* Replay Timeline Scrubbing Bar when Replaying */}
        {goalReplayPhase === 'replaying' && (
          <div className={`p-2 rounded-lg border mt-1 flex flex-col gap-1.5 ${subPanelBg}`}>
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span>
                REPLAY PLAYBACK: <b>{goalReplayPlaybackCursor}</b> / <b>{goalReplayPlaybackTotal}f</b>
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => runtimeHandlers.onGoalReplayTogglePause?.()}
                  className="px-2 py-0.5 rounded border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  {goalReplayPaused ? (
                    <Play className="h-2.5 w-2.5" />
                  ) : (
                    <Pause className="h-2.5 w-2.5" />
                  )}
                  <span>{goalReplayPaused ? 'Play' : 'Pause'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => runtimeHandlers.onGoalReplayCycleSpeed?.()}
                  className="px-2 py-0.5 rounded border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <FastForward className="h-2.5 w-2.5" />
                  <span>{goalReplaySpeed}x</span>
                </button>
              </div>
            </div>
            <SliderControl
              label="Scrub Replay Timeline"
              value={Number(progressPct.toFixed(1))}
              min={0}
              max={100}
              step={0.5}
              unit="%"
              editable={true}
              showStepper={true}
              colorScheme="amber"
              isLight={isLight}
              onChange={(val) => runtimeHandlers.onGoalReplaySeekNormalized?.(val / 100)}
            />
          </div>
        )}
      </div>

      {/* 4. Post-Match Podium Celebration Showcase Test */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${cardBg}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-semibold text-[11px]">
              Post-Match Podium Celebration Test
            </span>
          </div>
          {podiumActive && (
            <Badge variant="emerald" size="sm" isLight={isLight} className="font-mono text-[10px]">
              {podiumWinningTeam === 0
                ? 'BLUE WINS'
                : podiumWinningTeam === 1
                ? 'ORANGE WINS'
                : 'DRAW'}
            </Badge>
          )}
        </div>
        <p className={`text-[10px] leading-relaxed ${mutedText}`}>
          Places cars onto V-formation Podium pedestals facing the Podium Showcase camera. Winners can drive freely;
          runners-up have horizontal XY locked while retaining jump, dodge, air-roll &amp; boost stunts.
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {PODIUM_TEAM_OPTIONS.map((opt) => (
            <Button
              key={opt.team}
              variant={podiumActive && podiumWinningTeam === opt.team ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => runtimeHandlers.onEnterPodiumTest?.(opt.team)}
              isLight={isLight}
              className="py-1 text-[10px] font-bold"
            >
              {opt.label}
            </Button>
          ))}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => runtimeHandlers.onExitPodiumTest?.()}
            isLight={isLight}
            className="py-1 text-[10px]"
          >
            Exit Podium
          </Button>
        </div>
      </div>
    </>
  );
};
