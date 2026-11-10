import React from 'react';
import { Sliders, ArrowUpRight, ShieldAlert, Gauge, Compass } from 'lucide-react';
import { useEngineAudioStore } from '../../../stores/engineAudioStore';
import { SliderControl } from '../../../primitives/SliderControl';
import { ToggleSwitch } from '../../../primitives/ToggleSwitch';
import type { EngineLandingRevMode } from '../../../config/engineAudioConfig';

export interface EngineAudioDrivetrainCardProps {
  isLight?: boolean;
}

export const EngineAudioDrivetrainCard: React.FC<EngineAudioDrivetrainCardProps> = ({
  isLight = false,
}) => {
  const config = useEngineAudioStore((s) => s.config);
  const updateConfig = useEngineAudioStore((s) => s.updateConfig);

  const cardBg = isLight
    ? 'bg-neutral-50 border-neutral-200 text-neutral-800'
    : 'bg-neutral-900/75 border-neutral-800 text-neutral-200';
  const rowBg = isLight
    ? 'bg-white border-neutral-200/90'
    : 'bg-neutral-950/60 border-neutral-800/80';
  const mutedText = isLight ? 'text-neutral-500' : 'text-neutral-400';

  const isUnlimitedGears = config.maxGears <= 0;
  const landingOptions: { id: EngineLandingRevMode; label: string }[] = [
    { id: 'instant-speed-match', label: 'Instant Speed Match' },
    { id: 'fast-ramp-from-idle', label: 'Fast Ramp From Idle' },
  ];

  return (
    <div className={`p-2.5 rounded-xl border flex flex-col gap-2.5 ${cardBg}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="font-bold text-[11px] uppercase tracking-wider">
            Drivetrain, Physics Gearing &amp; Rev-Limiter
          </span>
        </div>
        <span className={`text-[10px] font-mono ${mutedText}`}>
          G1:{config.maxThrottleSpeedUU}uu · Boost:{config.boostOverdriveMultiplier.toFixed(2)}x · AirQuota:{config.airborneRevQuotaDurationSec.toFixed(2)}s
        </span>
      </div>

      {/* Physics Velocity-Coupled Gearing & Airborne Free-Rev Quota */}
      <div className="grid grid-cols-2 gap-2">
        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="emerald"
          label="Gear 1 Redline Speed (Throttle Max)"
          unit=" UU/s"
          value={config.maxThrottleSpeedUU}
          min={800}
          max={1800}
          step={5}
          isLight={isLight}
          onChange={(v) => updateConfig({ maxThrottleSpeedUU: Math.max(400, v) })}
        />
        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="sky"
          label="Supersonic Reference Speed"
          unit=" UU/s"
          value={config.supersonicSpeedUU}
          min={1600}
          max={2300}
          step={10}
          isLight={isLight}
          onChange={(v) => updateConfig({ supersonicSpeedUU: Math.max(1500, v) })}
        />
        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="amber"
          label="Airborne Rev Quota Duration"
          unit=" s"
          value={config.airborneRevQuotaDurationSec}
          min={0.25}
          max={5.0}
          step={0.05}
          isLight={isLight}
          onChange={(v) => updateConfig({ airborneRevQuotaDurationSec: Math.max(0.1, v) })}
        />
        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="amber"
          label="Boost Overdrive Accel Mult"
          unit="x"
          value={config.boostOverdriveMultiplier}
          min={1.0}
          max={3.0}
          step={0.05}
          isLight={isLight}
          onChange={(v) => updateConfig({ boostOverdriveMultiplier: Math.max(1.0, v) })}
        />
      </div>

      {/* Virtual Overdrive & Drop Rates */}
      <div className="grid grid-cols-2 gap-2">
        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="emerald"
          label="Forward Overdrive Accel"
          unit=" RPM/s"
          value={config.baseAccelRiseRate}
          min={200}
          max={4000}
          step={25}
          isLight={isLight}
          onChange={(v) => updateConfig({ baseAccelRiseRate: Math.max(50, v) })}
        />
        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="rose"
          label="Reverse Overdrive Accel (R2+)"
          unit=" RPM/s"
          value={config.reverseAccelRiseRate}
          min={50}
          max={2500}
          step={25}
          isLight={isLight}
          onChange={(v) => updateConfig({ reverseAccelRiseRate: Math.max(25, v) })}
        />
        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="sky"
          label="Base RPM Drop Rate"
          unit=" RPM/s"
          value={config.rpmDropRate}
          min={200}
          max={5000}
          step={50}
          isLight={isLight}
          onChange={(v) => updateConfig({ rpmDropRate: Math.max(100, v) })}
        />
        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="amber"
          label="Upshift Landing RPM"
          unit=" RPM"
          value={config.upshiftLandingRPM}
          min={1500}
          max={5200}
          step={50}
          isLight={isLight}
          onChange={(v) => updateConfig({ upshiftLandingRPM: Math.max(950, v) })}
        />
      </div>

      {/* Rev-Limiter & Gear Ratio Decay Parameters */}
      <div className="grid grid-cols-2 gap-2">
        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="rose"
          label="Rev-Limit Bounce Drop Depth"
          unit=" RPM"
          value={config.revLimiterBounceDrop}
          min={50}
          max={1200}
          step={10}
          isLight={isLight}
          onChange={(v) => updateConfig({ revLimiterBounceDrop: Math.max(10, v) })}
        />
        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={false}
          colorScheme="rose"
          label="Rev-Limit Bounce Period"
          unit=" s"
          value={config.revLimiterBounceDuration}
          min={0.01}
          max={0.25}
          step={0.005}
          isLight={isLight}
          onChange={(v) => updateConfig({ revLimiterBounceDuration: Math.max(0.005, v) })}
        />
        <SliderControl
          editable={true}
          allowOutOfBoundsInput={false}
          showStepper={false}
          colorScheme="amber"
          label="Forward Gear Decay Base"
          unit="x"
          value={config.gearDecayFactorBase}
          min={0.45}
          max={0.98}
          step={0.01}
          isLight={isLight}
          onChange={(v) => updateConfig({ gearDecayFactorBase: v })}
        />
        <SliderControl
          editable={true}
          allowOutOfBoundsInput={false}
          showStepper={false}
          colorScheme="rose"
          label="Reverse Gear Decay Base (R2+)"
          unit="x"
          value={config.reverseGearDecayFactorBase}
          min={0.25}
          max={0.9}
          step={0.01}
          isLight={isLight}
          onChange={(v) => updateConfig({ reverseGearDecayFactorBase: v })}
        />
      </div>

      {/* Physics Gearing, Turn Shift-Lock & Transmission Rules */}
      <div className="grid grid-cols-2 gap-2">
        <div className={`p-2 rounded-lg border flex items-center justify-between gap-2 ${rowBg}`}>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-[11px] truncate flex items-center gap-1">
              <Gauge className="w-3 h-3 text-emerald-400 shrink-0" />
              Velocity Floor + Overdrive
            </span>
            <span className={`text-[9px] truncate ${mutedText}`}>
              Speed-coupled G1 + boost-scaled virtual overdrive
            </span>
          </div>
          <ToggleSwitch
            checked={config.velocityCoupledGearsEnabled}
            onCheckedChange={(checked) => updateConfig({ velocityCoupledGearsEnabled: checked })}
            isLight={isLight}
            variant="emerald"
          />
        </div>

        <div className={`p-2 rounded-lg border flex items-center justify-between gap-2 ${rowBg}`}>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-[11px] truncate flex items-center gap-1">
              <Compass className="w-3 h-3 text-amber-400 shrink-0" />
              Turn + Accel Shift-Lock
            </span>
            <span className={`text-[9px] truncate ${mutedText}`}>
              Hold gear (no auto-upshift) when turning under power
            </span>
          </div>
          <ToggleSwitch
            checked={config.supersonicTurnRevBounceEnabled}
            onCheckedChange={(checked) => updateConfig({ supersonicTurnRevBounceEnabled: checked })}
            isLight={isLight}
            variant="amber"
          />
        </div>

        <div className={`p-2 rounded-lg border flex items-center justify-between gap-2 ${rowBg}`}>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-[11px] truncate flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3 text-emerald-400 shrink-0" />
              Unlimited Max Gears
            </span>
            <span className={`text-[9px] truncate ${mutedText}`}>
              No upper gear cap (Fwd &amp; Reverse both upshift)
            </span>
          </div>
          <ToggleSwitch
            checked={isUnlimitedGears}
            onCheckedChange={(checked) => updateConfig({ maxGears: checked ? 0 : 6 })}
            isLight={isLight}
            variant="emerald"
          />
        </div>

        <div className={`p-2 rounded-lg border flex items-center justify-between gap-2 ${rowBg}`}>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-[11px] truncate flex items-center gap-1">
              <ShieldAlert className="w-3 h-3 text-amber-400 shrink-0" />
              Airborne Instant Rev + Quota
            </span>
            <span className={`text-[9px] truncate ${mutedText}`}>
              Instant redline bounce for {config.airborneRevQuotaDurationSec.toFixed(2)}s cumulative air gas
            </span>
          </div>
          <ToggleSwitch
            checked={config.airborneAutoNeutralEnabled}
            onCheckedChange={(checked) => updateConfig({ airborneAutoNeutralEnabled: checked })}
            isLight={isLight}
            variant="amber"
          />
        </div>
      </div>

      {/* Touchdown Recovery Mode Selector */}
      <div className={`p-2 rounded-lg border flex items-center justify-between gap-2 ${rowBg}`}>
        <span className={`text-[10px] font-semibold ${mutedText}`}>
          Touchdown Landing RPM Recovery:
        </span>
        <div className="flex items-center gap-1">
          {landingOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => updateConfig({ landingRevRecoveryMode: opt.id })}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors cursor-pointer ${
                config.landingRevRecoveryMode === opt.id
                  ? 'bg-sky-500 text-neutral-950 border-sky-400'
                  : isLight
                    ? 'bg-neutral-100 border-neutral-200 text-neutral-700 hover:bg-neutral-200'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {!isUnlimitedGears && (
        <SliderControl
          editable={true}
          allowOutOfBoundsInput={true}
          showStepper={true}
          colorScheme="emerald"
          label="Maximum Gear Cap"
          unit=" Gears"
          value={config.maxGears}
          min={1}
          max={24}
          step={1}
          isLight={isLight}
          onChange={(v) => updateConfig({ maxGears: Math.max(1, Math.round(v)) })}
        />
      )}
    </div>
  );
};
