import React from 'react';
import { Gauge, Flame, Sparkles, RotateCcw, Radio } from 'lucide-react';
import { useEngineAudioStore } from '../../../stores/engineAudioStore';
import { Badge } from '../../../primitives/Badge';
import { Button } from '../../../primitives/Button';

export interface EngineAudioTelemetryCardProps {
  isLight?: boolean;
}

export const EngineAudioTelemetryCard: React.FC<EngineAudioTelemetryCardProps> = ({
  isLight = false,
}) => {
  const telemetry = useEngineAudioStore((s) => s.telemetry);
  const config = useEngineAudioStore((s) => s.config);
  const triggerBackfireTest = useEngineAudioStore((s) => s.triggerBackfireTest);
  const triggerEntitySpawnTest = useEngineAudioStore((s) => s.triggerEntitySpawnTest);
  const triggerZeroSpeedReset = useEngineAudioStore((s) => s.triggerZeroSpeedReset);
  const setManualBenchState = useEngineAudioStore((s) => s.setManualBenchState);

  const rpmRange = Math.max(100, config.redlineRPM - config.idleRPM);
  const rpmPct = Math.max(
    0,
    Math.min(100, ((telemetry.currentRPM - config.idleRPM) / rpmRange) * 100)
  );
  const targetPct = Math.max(
    0,
    Math.min(100, ((telemetry.targetRPM - config.idleRPM) / rpmRange) * 100)
  );

  const gearDisplay = telemetry.isNeutral
    ? 'N'
    : telemetry.driveDirection === 'reverse'
      ? `R${telemetry.currentGear}`
      : `${telemetry.currentGear}`;

  const cardBg = isLight
    ? 'bg-neutral-50 border-neutral-200 text-neutral-800'
    : 'bg-neutral-900/75 border-neutral-800 text-neutral-200';
  const cellBg = isLight
    ? 'bg-white border-neutral-200/90'
    : 'bg-neutral-950/70 border-neutral-800/90';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  return (
    <div className={`p-2.5 rounded-xl border flex flex-col gap-2.5 ${cardBg}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Gauge className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="font-bold text-[11px] uppercase tracking-wider truncate">
            Realtime Powertrain & Granular Matrix Telemetry
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {telemetry.isBoosting && (
            <Badge
              variant="amber"
              size="sm"
              isLight={isLight}
              className="font-mono text-[9px]"
            >
              BOOST
            </Badge>
          )}
          {telemetry.isInOverdrive && (
            <Badge
              variant="emerald"
              size="sm"
              isLight={isLight}
              className="font-mono text-[9px]"
            >
              OVERDRIVE
            </Badge>
          )}
          {telemetry.isShiftLocked && (
            <Badge
              variant="amber"
              size="sm"
              isLight={isLight}
              className="font-mono text-[9px]"
            >
              SHIFT LOCK
            </Badge>
          )}
          {telemetry.isUnderStrain && (
            <Badge
              variant="danger"
              size="sm"
              isLight={isLight}
              className="font-mono text-[9px]"
            >
              LOAD STRAIN
            </Badge>
          )}
          <Badge
            variant={telemetry.isOnGround ? 'emerald' : 'amber'}
            size="sm"
            isLight={isLight}
            className="font-mono text-[9px]"
          >
            {telemetry.isOnGround
              ? 'ON GROUND'
              : `AIRBORNE (${(telemetry.airborneRevQuotaRemainingSec ?? 0).toFixed(2)}s)`}
          </Badge>
          <Badge
            variant={
              telemetry.driveDirection === 'reverse'
                ? 'danger'
                : telemetry.driveDirection === 'forward'
                  ? 'sky'
                  : 'neutral'
            }
            size="sm"
            isLight={isLight}
            className="font-mono text-[9px]"
          >
            {telemetry.driveDirection.toUpperCase()}
          </Badge>
        </div>
      </div>

      {/* Primary Tachometer & Gear Readout */}
      <div className="grid grid-cols-4 gap-2">
        <div className={`p-2 rounded-lg border flex flex-col justify-between ${cellBg}`}>
          <span className={`text-[9px] uppercase font-semibold ${mutedText}`}>Gear</span>
          <div className="flex items-baseline justify-between gap-1 mt-0.5">
            <span
              className={`font-mono text-lg font-extrabold leading-none ${
                telemetry.isNeutral
                  ? 'text-amber-400'
                  : telemetry.driveDirection === 'reverse'
                    ? 'text-rose-400'
                    : 'text-emerald-400'
              }`}
            >
              {gearDisplay}
            </span>
            <span className={`text-[9px] font-mono ${mutedText}`}>
              {config.maxGears <= 0 ? 'UNLIM' : `/${config.maxGears}`}
            </span>
          </div>
        </div>

        <div className={`p-2 rounded-lg border flex flex-col justify-between ${cellBg}`}>
          <span className={`text-[9px] uppercase font-semibold ${mutedText}`}>Engine RPM</span>
          <div className="flex items-baseline justify-between gap-1 mt-0.5">
            <span
              className={`font-mono text-base font-bold leading-none ${
                telemetry.isRevLimiting ? 'text-rose-400' : 'text-sky-400'
              }`}
            >
              {Math.round(telemetry.currentRPM)}
            </span>
            <span className={`text-[9px] font-mono ${mutedText}`}>
              T:{Math.round(telemetry.targetRPM)}
            </span>
          </div>
        </div>

        <div className={`p-2 rounded-lg border flex flex-col justify-between ${cellBg}`}>
          <span className={`text-[9px] uppercase font-semibold ${mutedText}`}>Speed</span>
          <div className="flex items-baseline justify-between gap-1 mt-0.5">
            <span className="font-mono text-sm font-bold leading-none">
              {Math.round(telemetry.speedKmh)} <span className="text-[9px] font-normal">km/h</span>
            </span>
            <span className={`text-[9px] font-mono ${mutedText}`}>
              {Math.round(telemetry.speedUU)}uu
            </span>
          </div>
        </div>

        <div className={`p-2 rounded-lg border flex flex-col justify-between ${cellBg}`}>
          <span className={`text-[9px] uppercase font-semibold ${mutedText}`}>Active Slices</span>
          <div className="flex items-baseline justify-between gap-1 mt-0.5">
            <span className="font-mono text-xs font-bold leading-none text-amber-400">
              #{telemetry.lowerSliceIndex}..#{telemetry.upperSliceIndex}
            </span>
            <span className={`text-[9px] font-mono ${mutedText}`}>
              {telemetry.lowerSliceFreqHz.toFixed(1)}Hz
            </span>
          </div>
        </div>
      </div>

      {/* RPM Progress Bar */}
      <div className="flex flex-col gap-1">
        <div className="relative h-2.5 w-full rounded-full overflow-hidden bg-neutral-950/90 border border-neutral-800">
          <div
            className={`h-full transition-none ${
              telemetry.isRevLimiting
                ? 'bg-rose-500'
                : telemetry.currentRPM >= config.backfireTriggerRPM
                  ? 'bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500'
                  : 'bg-gradient-to-r from-emerald-500 to-sky-400'
            }`}
            style={{ width: `${rpmPct.toFixed(1)}%` }}
          />
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white/80 pointer-events-none"
            style={{ left: `${targetPct.toFixed(1)}%` }}
          />
        </div>
        <div className={`flex items-center justify-between text-[9px] font-mono ${mutedText}`}>
          <span>IDLE {config.idleRPM}</span>
          <span>UPSHIFT LAND {config.upshiftLandingRPM}</span>
          <span>POP {config.backfireTriggerRPM}</span>
          <span>CUT {config.revLimitCutoffRPM}</span>
        </div>
      </div>

      {/* Interactive Dyno Bench & One-Shot Audition Bar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onMouseDown={() =>
              setManualBenchState({ active: true, throttle: true, boost: false, reverse: false })
            }
            onMouseUp={() => setManualBenchState({ throttle: false })}
            onMouseLeave={() => {
              if (telemetry.manualThrottle) setManualBenchState({ throttle: false });
            }}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition-colors cursor-pointer ${
              telemetry.manualOverrideActive &&
              telemetry.manualThrottle &&
              !telemetry.manualBoost &&
              !telemetry.manualReverse
                ? 'bg-emerald-500 text-neutral-950 border-emerald-400'
                : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
            }`}
          >
            Hold Forward Gas
          </button>

          <button
            type="button"
            onMouseDown={() =>
              setManualBenchState({ active: true, throttle: true, boost: true, reverse: false })
            }
            onMouseUp={() => setManualBenchState({ throttle: false, boost: false })}
            onMouseLeave={() => {
              if (telemetry.manualBoost) setManualBenchState({ throttle: false, boost: false });
            }}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition-colors cursor-pointer ${
              telemetry.manualOverrideActive && telemetry.manualBoost && !telemetry.manualReverse
                ? 'bg-sky-500 text-neutral-950 border-sky-400'
                : 'bg-sky-500/15 border-sky-500/40 text-sky-300 hover:bg-sky-500/25'
            }`}
          >
            Hold Boost
          </button>

          <button
            type="button"
            onMouseDown={() =>
              setManualBenchState({ active: true, throttle: true, boost: false, reverse: true })
            }
            onMouseUp={() => setManualBenchState({ throttle: false })}
            onMouseLeave={() => {
              if (telemetry.manualThrottle) setManualBenchState({ throttle: false });
            }}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition-colors cursor-pointer ${
              telemetry.manualOverrideActive && telemetry.manualThrottle && telemetry.manualReverse
                ? 'bg-rose-500 text-neutral-950 border-rose-400'
                : 'bg-rose-500/15 border-rose-500/40 text-rose-300 hover:bg-rose-500/25'
            }`}
          >
            Hold Reverse Gas
          </button>

          <button
            type="button"
            onClick={() =>
              setManualBenchState({
                active: true,
                airborne: !telemetry.manualAirborne,
              })
            }
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition-colors cursor-pointer ${
              telemetry.manualOverrideActive && telemetry.manualAirborne
                ? 'bg-amber-500 text-neutral-950 border-amber-400'
                : 'bg-neutral-800/80 border-neutral-700 text-neutral-300 hover:bg-neutral-700/80'
            }`}
          >
            {telemetry.manualAirborne ? 'Airborne: ON' : 'Airborne: OFF'}
          </button>

          <Button
            variant="secondary"
            size="sm"
            isLight={isLight}
            onClick={() => {
              setManualBenchState({
                active: false,
                throttle: false,
                boost: false,
                reverse: false,
                airborne: false,
              });
              triggerZeroSpeedReset();
            }}
            className="gap-1 py-1 px-2 text-[10px]"
          >
            <RotateCcw className="w-3 h-3 text-sky-400" />
            <span>Stop (0 Speed)</span>
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            isLight={isLight}
            onClick={triggerBackfireTest}
            className="gap-1 py-1 px-2 text-[10px]"
          >
            <Flame className="w-3 h-3 text-amber-400" />
            <span>Pop ({telemetry.backfireCount})</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            isLight={isLight}
            onClick={triggerEntitySpawnTest}
            className="gap-1 py-1 px-2 text-[10px]"
          >
            <Sparkles className="w-3 h-3 text-purple-400" />
            <span>Spawn SFX ({telemetry.entitySpawnCount})</span>
          </Button>
        </div>
      </div>

      {telemetry.manualOverrideActive && (
        <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-300">
          <span className="flex items-center gap-1.5">
            <Radio className="w-3 h-3 text-amber-400" />
            Manual Bench Override Active — click Stop (0 Speed) to return to live vehicle telemetry
          </span>
        </div>
      )}
    </div>
  );
};
