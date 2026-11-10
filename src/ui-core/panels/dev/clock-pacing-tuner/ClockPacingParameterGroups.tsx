import React from 'react';
import { type ClockPacingParams } from '../../../config/clockPacingConfig';
import { SliderControl } from '../../../primitives/SliderControl';

interface ParamSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (val: number) => void;
  isLight?: boolean;
}

const ParamSlider: React.FC<ParamSliderProps> = ({
  label,
  value,
  min,
  max,
  step,
  unit = '',
  onChange,
  isLight = false,
}) => (
  <SliderControl
    label={label}
    value={value}
    min={min}
    max={max}
    step={step}
    unit={unit}
    editable={true}
    showStepper={true}
    colorScheme="amber"
    isLight={isLight}
    onChange={onChange}
  />
);

export interface ClockPacingParameterGroupsProps {
  customParams: ClockPacingParams;
  isLight: boolean;
  updateParam: <K extends keyof ClockPacingParams>(key: K, value: ClockPacingParams[K]) => void;
}

export const ClockPacingParameterGroups: React.FC<ClockPacingParameterGroupsProps> = ({
  customParams,
  isLight,
  updateParam,
}) => (
      <div className="grid grid-cols-2 gap-2">
        {/* Group A: Target, Deadband & Rate Step Mode */}
        <div
          className={`p-2.5 rounded-xl border flex flex-col gap-2 ${
            isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-850/60 border-neutral-700/60'
          }`}
        >
          <div className="flex items-center justify-between border-b border-neutral-700/40 pb-1">
            <span className="font-bold text-[10px] uppercase tracking-wider text-sky-400">
              1. Target Buffer & Deadband
            </span>
            <div className="flex items-center gap-1 font-mono text-[10px]">
              {(
                [
                  { id: 'discrete_2tier', label: '2-Tier STS' },
                  { id: 'continuous_pd', label: 'Continuous PD' },
                  { id: 'hybrid', label: 'Hybrid CSTS' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => updateParam('rateStepMode', m.id)}
                  className={`px-1.5 py-0.2 rounded border cursor-pointer ${
                    customParams.rateStepMode === m.id
                      ? 'bg-sky-500/25 border-sky-400 text-sky-200 font-bold'
                      : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <ParamSlider
            label="Target Buffer (α)"
            value={customParams.targetBufferTicks}
            min={1}
            max={8}
            step={0.5}
            unit=" ticks"
            onChange={(v) => updateParam('targetBufferTicks', v)}
            isLight={isLight}
          />
          <ParamSlider
            label="Catch-Up Deadband Offset"
            value={customParams.deadbandCatchupOffset}
            min={-4}
            max={-0.25}
            step={0.25}
            unit=" ticks"
            onChange={(v) => updateParam('deadbandCatchupOffset', v)}
            isLight={isLight}
          />
          <ParamSlider
            label="Skip Deadband Offset"
            value={customParams.deadbandSkipOffset}
            min={0.25}
            max={4}
            step={0.25}
            unit=" ticks"
            onChange={(v) => updateParam('deadbandSkipOffset', v)}
            isLight={isLight}
          />
          <ParamSlider
            label="Minimum State Dwell Time"
            value={customParams.minDwellTicks}
            min={1}
            max={60}
            step={1}
            unit=" ticks"
            onChange={(v) => updateParam('minDwellTicks', v)}
            isLight={isLight}
          />
        </div>

        {/* Group B: 2-Tier Schmitt Trigger Hysteresis */}
        <div
          className={`p-2.5 rounded-xl border flex flex-col gap-2 ${
            isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-850/60 border-neutral-700/60'
          }`}
        >
          <div className="flex items-center justify-between border-b border-neutral-700/40 pb-1">
            <span className="font-bold text-[10px] uppercase tracking-wider text-amber-400">
              2. Two-Tier Schmitt Hysteresis (Tier 1 & Tier 2)
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <ParamSlider
              label="Tier 1 Rate (±Hz)"
              value={customParams.tier1Hz}
              min={0.5}
              max={6}
              step={0.5}
              unit=" Hz"
              onChange={(v) => updateParam('tier1Hz', v)}
              isLight={isLight}
            />
            <ParamSlider
              label="Tier 2 Rate (±Hz)"
              value={customParams.tier2Hz}
              min={2}
              max={16}
              step={0.5}
              unit=" Hz"
              onChange={(v) => updateParam('tier2Hz', v)}
              isLight={isLight}
            />
            <ParamSlider
              label="Tier 1 Enter Err"
              value={customParams.tier1EnterError}
              min={0.3}
              max={3.0}
              step={0.1}
              unit="f"
              onChange={(v) => updateParam('tier1EnterError', v)}
              isLight={isLight}
            />
            <ParamSlider
              label="Tier 1 Exit Err"
              value={customParams.tier1ExitError}
              min={0.1}
              max={2.0}
              step={0.1}
              unit="f"
              onChange={(v) => updateParam('tier1ExitError', v)}
              isLight={isLight}
            />
            <ParamSlider
              label="Tier 2 Enter Err"
              value={customParams.tier2EnterError}
              min={1.0}
              max={6.0}
              step={0.2}
              unit="f"
              onChange={(v) => updateParam('tier2EnterError', v)}
              isLight={isLight}
            />
            <ParamSlider
              label="Tier 2 Exit Err"
              value={customParams.tier2ExitError}
              min={0.5}
              max={4.0}
              step={0.2}
              unit="f"
              onChange={(v) => updateParam('tier2ExitError', v)}
              isLight={isLight}
            />
          </div>
        </div>

        {/* Group C: Continuous PD & In-Flight RTT Rate Bias Compensation */}
        <div
          className={`p-2.5 rounded-xl border flex flex-col gap-2 ${
            isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-850/60 border-neutral-700/60'
          }`}
        >
          <div className="flex items-center justify-between border-b border-neutral-700/40 pb-1">
            <span className="font-bold text-[10px] uppercase tracking-wider text-emerald-400">
              3. Continuous PD & In-Flight RTT Bias Compensation
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <ParamSlider
              label="Kp (Hz / Tick Err)"
              value={customParams.kpHzPerTick}
              min={0.2}
              max={6.0}
              step={0.1}
              unit=" Hz/f"
              onChange={(v) => updateParam('kpHzPerTick', v)}
              isLight={isLight}
            />
            <ParamSlider
              label="Kd (Damping Gain)"
              value={customParams.kdHzPerTickVel}
              min={0.0}
              max={3.0}
              step={0.05}
              unit=""
              onChange={(v) => updateParam('kdHzPerTickVel', v)}
              isLight={isLight}
            />
            <ParamSlider
              label="Max Freq Adjust"
              value={customParams.maxAdjustHz}
              min={1.0}
              max={20.0}
              step={0.5}
              unit=" Hz"
              onChange={(v) => updateParam('maxAdjustHz', v)}
              isLight={isLight}
            />
            <ParamSlider
              label="In-Flight RTT Gain"
              value={customParams.inFlightCompGain}
              min={0.0}
              max={1.2}
              step={0.05}
              unit=""
              onChange={(v) => updateParam('inFlightCompGain', v)}
              isLight={isLight}
            />
            <ParamSlider
              label="Buffer EWMA Alpha"
              value={customParams.bufferEwmaAlpha}
              min={0.02}
              max={0.8}
              step={0.02}
              unit=""
              onChange={(v) => updateParam('bufferEwmaAlpha', v)}
              isLight={isLight}
            />
            <ParamSlider
              label="RTT EWMA Alpha"
              value={customParams.rttEwmaAlpha}
              min={0.02}
              max={0.5}
              step={0.02}
              unit=""
              onChange={(v) => updateParam('rttEwmaAlpha', v)}
              isLight={isLight}
            />
          </div>
        </div>

        {/* Group D: Dynamic Jitter Target Boost & Hard Resync Safety */}
        <div
          className={`p-2.5 rounded-xl border flex flex-col gap-2 ${
            isLight ? 'bg-neutral-50 border-neutral-200' : 'bg-neutral-850/60 border-neutral-700/60'
          }`}
        >
          <div className="flex items-center justify-between border-b border-neutral-700/40 pb-1">
            <span className="font-bold text-[10px] uppercase tracking-wider text-violet-400">
              4. Dynamic Jitter Boost & Hard Resync Snap
            </span>
            <div className="flex items-center gap-1.5 text-[10px] font-mono">
              <button
                type="button"
                onClick={() => updateParam('enableAdaptiveJitterBoost', !customParams.enableAdaptiveJitterBoost)}
                className={`px-1.5 py-0.2 rounded border cursor-pointer ${
                  customParams.enableAdaptiveJitterBoost
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 font-bold'
                    : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                }`}
              >
                Jitter Boost: {customParams.enableAdaptiveJitterBoost ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                onClick={() => updateParam('enableHardResync', !customParams.enableHardResync)}
                className={`px-1.5 py-0.2 rounded border cursor-pointer ${
                  customParams.enableHardResync
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 font-bold'
                    : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                }`}
              >
                Hard Snap: {customParams.enableHardResync ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <ParamSlider
              label="Jitter Boost Gain"
              value={customParams.adaptiveJitterGain}
              min={0.0}
              max={3.0}
              step={0.1}
              unit="×"
              onChange={(v) => updateParam('adaptiveJitterGain', v)}
              isLight={isLight}
            />
            <ParamSlider
              label="Max Jitter Boost"
              value={customParams.maxAdaptiveBoostTicks}
              min={0.0}
              max={6.0}
              step={0.5}
              unit=" ticks"
              onChange={(v) => updateParam('maxAdaptiveBoostTicks', v)}
              isLight={isLight}
            />
            <ParamSlider
              label="Hard Snap Threshold"
              value={customParams.hardResyncThresholdTicks}
              min={4}
              max={30}
              step={1}
              unit=" ticks"
              onChange={(v) => updateParam('hardResyncThresholdTicks', v)}
              isLight={isLight}
            />
            <ParamSlider
              label="Hard Snap Cooldown"
              value={customParams.hardResyncCooldownMs}
              min={250}
              max={5000}
              step={250}
              unit=" ms"
              onChange={(v) => updateParam('hardResyncCooldownMs', v)}
              isLight={isLight}
            />
          </div>
        </div>
      </div>
);
