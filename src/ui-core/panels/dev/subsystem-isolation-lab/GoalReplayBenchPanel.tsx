import React from 'react';
import {
  Film,
  ShieldAlert,
  CheckCircle2,
  Sliders,
} from 'lucide-react';
import { useSubsystemIsolationLabStore } from '../../../stores/subsystemIsolationLabStore';
import { useSpatialAudioStore } from '../../../stores/spatialAudioStore';
import { floatingStore } from '../../../stores/floatingStore';
import { REPLAY_DIRECTOR_TUNER_PRESET } from '../../../stores/devFloatingPresets';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import { Badge } from '../../../primitives/Badge';
import { Button } from '../../../primitives/Button';
import { GoalReplayScenariosAndPodiumSection } from './GoalReplayScenariosAndPodiumSection';

export interface GoalReplayBenchPanelProps {
  isLight?: boolean;
  cardBg: string;
  subPanelBg: string;
  mutedText: string;
}

export const GoalReplayBenchPanel: React.FC<GoalReplayBenchPanelProps> = ({
  isLight = false,
  cardBg,
  subPanelBg,
  mutedText,
}) => {
  const {
    goalReplayLookbackSec,
    goalReplayPostGoalSec,
    goalReplayMuteSignalAudio,
    goalReplayPhase,
    goalReplayCurrentFrameId,
    goalReplayLastKickoffFrameId,
    goalReplayIncidentFrameId,
    goalReplayRequestedStartFrameId,
    goalReplayEffectiveStartFrameId,
    goalReplayEffectiveEndFrameId,
    goalReplayClampedByKickoff,
    goalReplayRecordedBufferCount,
    setGoalReplayLookbackSec,
    setGoalReplayPostGoalSec,
    setGoalReplayMuteSignalAudio,
  } = useSubsystemIsolationLabStore();

  const windowFrames = Math.max(
    0,
    goalReplayEffectiveEndFrameId - goalReplayEffectiveStartFrameId
  );

  const handleSpawnDirectorTuner = (e?: React.MouseEvent<HTMLButtonElement>) => {
    const containerEl =
      (typeof document !== 'undefined' && document.getElementById('game-ui-viewport-host')) ||
      (typeof document !== 'undefined' ? document.body : null);
    if (containerEl && e?.currentTarget) {
      floatingStore.spawnWithFlight(
        REPLAY_DIRECTOR_TUNER_PRESET,
        e.currentTarget,
        containerEl
      );
    } else {
      floatingStore.spawnWindow({
        ...REPLAY_DIRECTOR_TUNER_PRESET,
        startMinimized: true,
      });
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* 1. Goal Replay Window Parameters (Lookback Before Goal & Post-Goal Delay/End) */}
      <div className={`p-2.5 rounded-xl border flex flex-col gap-2 ${cardBg}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Film className="h-3.5 w-3.5 text-sky-400 shrink-0" />
            <span className="font-semibold text-[11px] truncate">
              Goal Incident &amp; Goal Replay Window Parameters
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSpawnDirectorTuner}
              isLight={isLight}
              className="gap-1 py-0.5 px-2 text-[10px] font-semibold"
              title="Spawn Replay Director Camera & Slow-Mo Tuner into Stack"
            >
              <Sliders className="h-2.5 w-2.5 text-amber-400 shrink-0" />
              <span>Director Tuner</span>
            </Button>
            <Badge
              variant={
                goalReplayPhase === 'replaying'
                  ? 'amber'
                  : goalReplayPhase === 'podium'
                  ? 'emerald'
                  : 'neutral'
              }
              size="sm"
              isLight={isLight}
              className="font-mono text-[10px] uppercase"
            >
              {goalReplayPhase}
            </Badge>
          </div>
        </div>

        <p className={`text-[10px] leading-relaxed ${mutedText}`}>
          Adjust how many seconds <b>before</b> the Goal Incident Event the replay begins, and how many seconds{' '}
          <b>after</b> the Goal Incident Event it ends (<code>SIGNAL_GOAL_REPLAY_WILL_START</code> default = 3.0s).
          <br />
          <b>Kickoff Minimum Time Rule:</b>{' '}
          <code>effectiveStart = max(goalFrame - lookbackTicks, lastKickoffWillStartFrame)</code> (follows the larger
          Frame ID / shorter duration so replay never rewinds past the most recent kickoff signal).
        </p>

        <div className={`p-2 rounded-lg border flex flex-col gap-2 ${subPanelBg}`}>
          <SliderControl
            label={`Pre-Goal Lookback Time (${goalReplayLookbackSec}s = ${Math.round(goalReplayLookbackSec * 120)}f)`}
            description="Seconds before Goal Incident to start replay (commit on Enter / unfocus)"
            value={goalReplayLookbackSec}
            min={0.5}
            max={15.0}
            step={0.5}
            unit="s"
            editable={true}
            allowOutOfBoundsInput={true}
            showStepper={true}
            colorScheme="amber"
            isLight={isLight}
            onChange={(val) => setGoalReplayLookbackSec(val)}
          />

          <SliderControl
            label={`Post-Goal Window / Delay (${goalReplayPostGoalSec}s = ${Math.round(goalReplayPostGoalSec * 120)}f)`}
            description="Seconds after Goal Incident before Goal Replay starts / ends (default 3.0s)"
            value={goalReplayPostGoalSec}
            min={0.0}
            max={10.0}
            step={0.5}
            unit="s"
            editable={true}
            allowOutOfBoundsInput={true}
            showStepper={true}
            colorScheme="neutral"
            isLight={isLight}
            onChange={(val) => setGoalReplayPostGoalSec(val)}
          />

          <div className="flex items-center justify-between pt-1 border-t border-neutral-700/30">
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-[11px] truncate">
                Mute Signal Audio in Goal Replay
              </span>
              <span className={`text-[10px] truncate ${mutedText}`}>
                Suppress kickoff countdown &amp; 10s/30s/60s timer signal sounds during Goal Replay
              </span>
            </div>
            <ToggleSwitch
              checked={Boolean(goalReplayMuteSignalAudio ?? true)}
              onCheckedChange={(v) => {
                setGoalReplayMuteSignalAudio(v);
                try {
                  useSpatialAudioStore.getState().updateTunerConfig({
                    muteSignalAudioInGoalReplay: v,
                  });
                } catch {
                  // Ignore if unavailable
                }
              }}
              isLight={isLight}
              variant="amber"
            />
          </div>
        </div>
      </div>

      {/* 2. Frame ID Clamping & Signal Telemetry Readout */}
      <div className={`p-2.5 rounded-xl border font-mono text-[10px] flex flex-col gap-1.5 ${subPanelBg}`}>
        <div className="flex items-center justify-between border-b border-neutral-700/30 pb-1">
          <span className="font-bold text-sky-400">FRAME ID &amp; KICKOFF CLAMP TELEMETRY</span>
          <span className="flex items-center gap-1">
            {goalReplayClampedByKickoff ? (
              <span className="text-amber-400 font-bold flex items-center gap-1">
                <ShieldAlert className="h-3 w-3" />
                CLAMPED TO KICKOFF
              </span>
            ) : (
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                FULL LOOKBACK
              </span>
            )}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-0.5">
          <span>
            Current Frame ID: <b>#{goalReplayCurrentFrameId}</b>
          </span>
          <span>
            RingBuffer Frames: <b>{goalReplayRecordedBufferCount}f</b>
          </span>
          <span>
            Last Kickoff Signal: <b className="text-amber-400">#{goalReplayLastKickoffFrameId}</b>
          </span>
          <span>
            Goal Incident Frame: <b className="text-rose-400">#{goalReplayIncidentFrameId || '—'}</b>
          </span>
          <span>
            Requested Start (G-{goalReplayLookbackSec}s): <b>#{goalReplayRequestedStartFrameId}</b>
          </span>
          <span>
            Effective Start (max):{' '}
            <b className={goalReplayClampedByKickoff ? 'text-amber-400' : 'text-emerald-400'}>
              #{goalReplayEffectiveStartFrameId}
            </b>
          </span>
          <span className="col-span-2">
            Effective Replay Window: <b>[{goalReplayEffectiveStartFrameId} .. {goalReplayEffectiveEndFrameId}]</b> (
            {windowFrames}f / {(windowFrames / 120).toFixed(2)}s)
          </span>
        </div>
      </div>

      {/* 3 & 4. Test Scenarios, Playback Scrubber & Podium Celebration */}
      <GoalReplayScenariosAndPodiumSection
        isLight={isLight}
        cardBg={cardBg}
        subPanelBg={subPanelBg}
        mutedText={mutedText}
      />
    </div>
  );
};
