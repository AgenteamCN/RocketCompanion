import React from 'react';
import { Eye, Zap } from 'lucide-react';
import { useExperimentalMultiBotsStore } from '../../stores/experimentalMultiBotsStore';
import {
  getExpColorSwatch,
  type ExpSpeedMultiplier,
} from '../../stores/experimentalMultiBotsRosterUtils';
import { SegmentedSwitch } from '../../primitives/SegmentedSwitch';
import { ToggleSwitch } from '../../primitives/ToggleSwitch';
import { Button } from '../../primitives/Button';
import { KeycapBadge } from '../../primitives/KeycapBadge';

export interface ExperimentalBotsCameraPovCardProps {
  isLight?: boolean;
  cardBg?: string;
  mutedText?: string;
}

export const ExperimentalBotsCameraPovCard: React.FC<
  ExperimentalBotsCameraPovCardProps
> = ({ isLight = false, cardBg, mutedText }) => {
  const playerParticipation = useExperimentalMultiBotsStore(
    (s) => s.playerParticipation
  );
  const blueSlots = useExperimentalMultiBotsStore((s) => s.blueSlots);
  const orangeSlots = useExperimentalMultiBotsStore((s) => s.orangeSlots);
  const spawnedCars = useExperimentalMultiBotsStore((s) => s.spawnedCars);
  const activeCameraCarIndex = useExperimentalMultiBotsStore(
    (s) => s.activeCameraCarIndex
  );
  const onSelectCameraCar = useExperimentalMultiBotsStore(
    (s) => s.setActiveCameraCarIndex
  );

  const resolvedCardBg =
    cardBg ??
    (isLight
      ? 'bg-neutral-50/90 border-neutral-200 text-neutral-800'
      : 'bg-neutral-850/60 border-neutral-700/60 text-neutral-200');
  const resolvedMutedText =
    mutedText ?? (isLight ? 'text-neutral-500' : 'text-neutral-400');

  const carList =
    spawnedCars.length > 0
      ? spawnedCars
      : [
          ...blueSlots.map((s, i) => ({
            carIndex: i,
            keyNumber: i + 1,
            team: 0 as const,
            isPlayer: s.isPlayer,
            botType: s.botType,
            colorHex: getExpColorSwatch(s.colorSlot).hex,
            label: s.isPlayer ? 'PLAYER' : `${s.botType.toUpperCase()} #${i + 1}`,
          })),
          ...orangeSlots.map((s, i) => ({
            carIndex: blueSlots.length + i,
            keyNumber: blueSlots.length + i + 1,
            team: 1 as const,
            isPlayer: s.isPlayer,
            botType: s.botType,
            colorHex: getExpColorSwatch(s.colorSlot).hex,
            label: s.isPlayer
              ? 'PLAYER'
              : `${s.botType.toUpperCase()} #${blueSlots.length + i + 1}`,
          })),
        ];

  return (
    <div
      className={`p-2.5 rounded-xl border flex flex-col gap-1.5 ${resolvedCardBg}`}
    >
      <div className="flex items-center justify-between">
        <span className="font-bold text-[11px] flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5 text-amber-400" />
          <span>Camera POV Switcher (Keys 1–6)</span>
        </span>
        <span className={`text-[10px] font-mono ${resolvedMutedText}`}>
          {playerParticipation === 'none'
            ? 'Press 1-6 to switch bot POV'
            : 'Click to inspect car POV'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {carList.map((car) => {
          const isSelected = activeCameraCarIndex === car.carIndex;
          return (
            <button
              key={car.carIndex}
              type="button"
              onClick={() => onSelectCameraCar(car.carIndex)}
              className={`px-2 py-1.5 rounded-lg border flex items-center gap-1.5 text-left transition-all cursor-pointer ${
                isSelected
                  ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold shadow-sm'
                  : isLight
                    ? 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700'
                    : 'bg-neutral-900/70 hover:bg-neutral-800 border-neutral-700/70 text-neutral-300'
              }`}
            >
              <KeycapBadge
                label={String(car.keyNumber)}
                size="sm"
                isLight={isLight}
              />
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: car.colorHex }}
              />
              <span className="text-[10px] font-mono truncate">{car.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export interface ExperimentalBotsMatchControlsCardProps {
  isLight?: boolean;
  cardBg?: string;
  mutedText?: string;
}

export const ExperimentalBotsMatchControlsCard: React.FC<
  ExperimentalBotsMatchControlsCardProps
> = ({ isLight = false, cardBg, mutedText }) => {
  const blueScore = useExperimentalMultiBotsStore((s) => s.blueScore);
  const orangeScore = useExperimentalMultiBotsStore((s) => s.orangeScore);
  const remainingSec = useExperimentalMultiBotsStore((s) => s.remainingSec);
  const isOvertime = useExperimentalMultiBotsStore((s) => s.isOvertime);
  const matchPhase = useExperimentalMultiBotsStore((s) => s.matchPhase);
  const matchDurationSec = useExperimentalMultiBotsStore(
    (s) => s.matchDurationSec
  );
  const speedMultiplier = useExperimentalMultiBotsStore(
    (s) => s.speedMultiplier
  );
  const unlimitedBoost = useExperimentalMultiBotsStore((s) => s.unlimitedBoost);
  const disableGoalReplay = useExperimentalMultiBotsStore(
    (s) => s.disableGoalReplay
  );
  const onSetMatchDurationSec = useExperimentalMultiBotsStore(
    (s) => s.setMatchDurationSec
  );
  const onSetSpeedMultiplier = useExperimentalMultiBotsStore(
    (s) => s.setSpeedMultiplier
  );
  const onSetUnlimitedBoost = useExperimentalMultiBotsStore(
    (s) => s.setUnlimitedBoost
  );
  const onSetDisableGoalReplay = useExperimentalMultiBotsStore(
    (s) => s.setDisableGoalReplay
  );
  const onTriggerSandboxAction = useExperimentalMultiBotsStore(
    (s) => s.triggerSandboxAction
  );

  const resolvedCardBg =
    cardBg ??
    (isLight
      ? 'bg-neutral-50/90 border-neutral-200 text-neutral-800'
      : 'bg-neutral-850/60 border-neutral-700/60 text-neutral-200');
  const resolvedMutedText =
    mutedText ?? (isLight ? 'text-neutral-500' : 'text-neutral-400');

  const formatClock = (sec: number) => {
    const abs = Math.max(0, Math.floor(sec));
    const m = Math.floor(abs / 60);
    const s = abs % 60;
    return `${isOvertime ? '+' : ''}${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div
      className={`p-2.5 rounded-xl border flex flex-col gap-2 ${resolvedCardBg}`}
    >
      <div className="flex items-center justify-between">
        <span className="font-bold text-[11px] flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-amber-400" />
          <span>Match Telemetry &amp; Controls</span>
        </span>
        <span className="text-[11px] font-mono font-bold text-amber-400">
          Blue {blueScore} — {orangeScore} Orange · {formatClock(remainingSec)} (
          {matchPhase})
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] ${resolvedMutedText}`}>Match Duration</span>
        <SegmentedSwitch
          value={String(matchDurationSec)}
          onChange={(v) => onSetMatchDurationSec(Number(v))}
          options={[
            { value: '90', label: '1:30' },
            { value: '180', label: '3:00' },
            { value: '300', label: '5:00' },
            { value: '600', label: '10:00' },
          ]}
          size="sm"
          isLight={isLight}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] ${resolvedMutedText}`}>
          Simulation Speed
        </span>
        <SegmentedSwitch
          value={String(speedMultiplier)}
          onChange={(v) => onSetSpeedMultiplier(Number(v) as ExpSpeedMultiplier)}
          options={[
            { value: '100', label: '1x' },
            { value: '200', label: '2x' },
            { value: '300', label: '3x' },
            { value: '400', label: '4x' },
          ]}
          size="sm"
          isLight={isLight}
        />
      </div>

      <div className="flex items-center justify-between gap-4 pt-0.5">
        <div className="flex items-center gap-2">
          <span className={`text-[11px] ${resolvedMutedText}`}>
            Unlimited Boost
          </span>
          <ToggleSwitch
            checked={unlimitedBoost}
            onChange={(v) => onSetUnlimitedBoost(v)}
            isLight={isLight}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] ${resolvedMutedText}`}>
            Fast Goal Reset
          </span>
          <ToggleSwitch
            checked={disableGoalReplay}
            onChange={(v) => onSetDisableGoalReplay(v)}
            isLight={isLight}
          />
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1.5 pt-1">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onTriggerSandboxAction('reset_kickoff')}
          isLight={isLight}
          className="text-[10px] py-1"
        >
          Reset Kickoff
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onTriggerSandboxAction('score_blue')}
          isLight={isLight}
          className="text-[10px] py-1"
        >
          +1 Blue Goal
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onTriggerSandboxAction('score_orange')}
          isLight={isLight}
          className="text-[10px] py-1"
        >
          +1 Orange Goal
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onTriggerSandboxAction('force_overtime')}
          isLight={isLight}
          className="text-[10px] py-1"
        >
          Force OT
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onTriggerSandboxAction('end_match')}
          isLight={isLight}
          className="text-[10px] py-1"
        >
          End Match
        </Button>
      </div>
    </div>
  );
};
