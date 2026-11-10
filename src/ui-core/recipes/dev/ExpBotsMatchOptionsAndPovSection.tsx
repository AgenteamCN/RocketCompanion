import React from 'react';
import { Card } from '../../layout/Card';
import { SegmentedSwitch } from '../../primitives/SegmentedSwitch';
import { SliderControl } from '../../primitives/SliderControl';
import { ToggleSwitch } from '../../primitives/ToggleSwitch';
import { useAppStore } from '../../stores/appStore';
import { useExperimentalMultiBotsStore } from '../../stores/experimentalMultiBotsStore';
import type { ExpSpeedMultiplier } from '../../stores/experimentalMultiBotsRosterUtils';
import { floatingStore } from '../../stores/floatingStore';
import {
  EXPERIMENTAL_BOT_PACK_PRESET,
  EXPERIMENTAL_MULTI_BOTS_PRESET,
} from '../../stores/devFloatingPresets';
import { useScopedStore } from '../../stores/storeSnapshotScope';

export interface ExpBotsMatchOptionsAndPovSectionProps {
  isLight: boolean;
  accentColor: 'amber' | 'emerald';
  totalCars: number;
  enterButtonLabel: string;
  enterHoverDescription: string;
  onHover: (desc: string | null) => void;
}

export function enterOrRestartExperimentalBotsGame(
  targetSubMode: 'multi-bots' | 'botpack'
): void {
  const expStore = useExperimentalMultiBotsStore.getState();
  if (targetSubMode === 'botpack') {
    expStore.activateBotpackSubMode(undefined, false);
  } else {
    expStore.activateMultiBotsSubMode(false);
  }
  floatingStore.setOpacity(70);
  const isBotpackShowcase = targetSubMode === 'botpack';
  const targetPreset = isBotpackShowcase
    ? EXPERIMENTAL_BOT_PACK_PRESET
    : EXPERIMENTAL_MULTI_BOTS_PRESET;
  const otherPreset = isBotpackShowcase
    ? EXPERIMENTAL_MULTI_BOTS_PRESET
    : EXPERIMENTAL_BOT_PACK_PRESET;
  floatingStore.closeWindow(otherPreset.id);

  const snap = floatingStore.getSnapshot();
  const exists =
    snap.windows.some((w) => w.id === targetPreset.id) ||
    snap.activeFlight?.preset?.id === targetPreset.id;
  if (!exists) {
    floatingStore.spawnWindow({
      ...targetPreset,
      startMinimized: true,
    });
  }
  const appState = useAppStore.getState();
  if (appState.matchMode === 'exp-multi-bots') {
    expStore.startOrApplyMatch();
    appState.closeMenu();
  } else {
    appState.bridge.onStartExpMultiBots?.();
  }
}

/**
 * Shared Store-First Match Duration, Simulation Speed, Unlimited Boost,
 * Camera POV Switcher (Keys 1-6), Live Match Actions, and Enter/Restart CTA
 * for `Layer3ExpMultiBotsRecipe` and `Layer3ExpBotPackRecipe`.
 */
export const ExpBotsMatchOptionsAndPovSection: React.FC<
  ExpBotsMatchOptionsAndPovSectionProps
> = ({
  isLight,
  accentColor,
  totalCars,
  enterButtonLabel,
  enterHoverDescription,
  onHover,
}) => {
  const activeCameraCarIndex = useScopedStore(
    'experimentalMultiBotsStore',
    useExperimentalMultiBotsStore,
    (s) => s.activeCameraCarIndex
  );
  const matchDurationSec = useScopedStore(
    'experimentalMultiBotsStore',
    useExperimentalMultiBotsStore,
    (s) => s.matchDurationSec
  );
  const speedMultiplier = useScopedStore(
    'experimentalMultiBotsStore',
    useExperimentalMultiBotsStore,
    (s) => s.speedMultiplier
  );
  const unlimitedBoost = useScopedStore(
    'experimentalMultiBotsStore',
    useExperimentalMultiBotsStore,
    (s) => s.unlimitedBoost
  );
  const disableGoalReplay = useScopedStore(
    'experimentalMultiBotsStore',
    useExperimentalMultiBotsStore,
    (s) => s.disableGoalReplay
  );
  const setMatchDurationSec = useScopedStore(
    'experimentalMultiBotsStore',
    useExperimentalMultiBotsStore,
    (s) => s.setMatchDurationSec
  );
  const setSpeedMultiplier = useScopedStore(
    'experimentalMultiBotsStore',
    useExperimentalMultiBotsStore,
    (s) => s.setSpeedMultiplier
  );
  const setUnlimitedBoost = useScopedStore(
    'experimentalMultiBotsStore',
    useExperimentalMultiBotsStore,
    (s) => s.setUnlimitedBoost
  );
  const setDisableGoalReplay = useScopedStore(
    'experimentalMultiBotsStore',
    useExperimentalMultiBotsStore,
    (s) => s.setDisableGoalReplay
  );
  const triggerSandboxAction = useScopedStore(
    'experimentalMultiBotsStore',
    useExperimentalMultiBotsStore,
    (s) => s.triggerSandboxAction
  );

  const simSpeedValue =
    speedMultiplier === 200
      ? '2x'
      : speedMultiplier === 300
        ? '3x'
        : speedMultiplier === 400
          ? '4x'
          : '1x';

  const handleSimSpeedChange = (val: string) => {
    const mult: ExpSpeedMultiplier =
      val === '2x' ? 200 : val === '3x' ? 300 : val === '4x' ? 400 : 100;
    setSpeedMultiplier(mult);
  };

  const targetSubMode = accentColor === 'emerald' ? 'botpack' : 'multi-bots';

  return (
    <>
      <Card isLight={isLight} variant="outlined" className="p-3 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider">
            Match Duration &amp; Simulation Options
          </span>
          <div className="flex items-center gap-1">
            {[
              { label: '1:30', sec: 90 },
              { label: '3:00', sec: 180 },
              { label: '5:00', sec: 300 },
              { label: '10:00', sec: 600 },
            ].map((d) => (
              <button
                key={d.label}
                type="button"
                onClick={() => setMatchDurationSec(d.sec)}
                className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold cursor-pointer ${
                  matchDurationSec === d.sec
                    ? accentColor === 'emerald'
                      ? 'bg-emerald-500 text-neutral-950 border-emerald-500'
                      : 'bg-amber-500 text-neutral-950 border-amber-500'
                    : isLight
                      ? 'bg-white border-neutral-300 text-neutral-700'
                      : 'bg-neutral-900 border-neutral-700 text-neutral-300'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <SliderControl
          label="Custom Match Duration"
          min={30}
          max={900}
          step={30}
          value={matchDurationSec}
          onChange={setMatchDurationSec}
          unit="s"
          isLight={isLight}
        />

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold">Simulation Speed</span>
          <SegmentedSwitch
            size="sm"
            isLight={isLight}
            options={[
              { label: '1x', value: '1x' },
              { label: '2x', value: '2x' },
              { label: '3x', value: '3x' },
              { label: '4x', value: '4x' },
            ]}
            value={simSpeedValue}
            onValueChange={handleSimSpeedChange}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <ToggleSwitch
            label="Unlimited Boost"
            checked={unlimitedBoost}
            onCheckedChange={setUnlimitedBoost}
            isLight={isLight}
          />
          <ToggleSwitch
            label="Fast Goal Reset"
            checked={disableGoalReplay}
            onCheckedChange={setDisableGoalReplay}
            isLight={isLight}
          />
        </div>
      </Card>

      <Card isLight={isLight} variant="outlined" className="p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider">
            Camera POV Switcher (Keys 1–{totalCars}) &amp; Live Match Actions
          </span>
          <span
            className={`text-[10px] font-mono ${
              accentColor === 'emerald' ? 'text-emerald-500' : 'text-amber-500'
            }`}
          >
            Active POV: Car #{activeCameraCarIndex + 1}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {(
            [
              { label: 'Reset Kickoff', action: 'reset_kickoff' },
              { label: '+1 Blue Goal', action: 'score_blue' },
              { label: '+1 Orange Goal', action: 'score_orange' },
              { label: 'Force OT', action: 'force_overtime' },
            ] as const
          ).map((act) => (
            <button
              key={act.label}
              type="button"
              onClick={() => triggerSandboxAction(act.action)}
              className={`py-1.5 px-2 rounded-lg border text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                isLight
                  ? 'bg-neutral-100 hover:bg-neutral-200 border-neutral-300 text-neutral-700'
                  : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-neutral-300'
              }`}
            >
              {act.label}
            </button>
          ))}
        </div>
      </Card>

      <button
        type="button"
        onClick={() => enterOrRestartExperimentalBotsGame(targetSubMode)}
        onMouseEnter={() => onHover(enterHoverDescription)}
        onMouseLeave={() => onHover(null)}
        className={`mt-auto w-full py-2.5 px-6 rounded-xl text-neutral-950 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shrink-0 ${
          accentColor === 'emerald'
            ? 'bg-emerald-500 hover:bg-emerald-400'
            : 'bg-amber-500 hover:bg-amber-400'
        }`}
      >
        {enterButtonLabel}
      </button>
    </>
  );
};
