/**
 * clockPacingPresets.ts
 * Pure configuration types, trade-off priority presets, and default parameters
 * for Input Buffer & Clock Pacing algorithms.
 */

export type ClockPacingMode = 'legacy' | 'sts' | 'csts' | 'custom';

export type ClockPacingPriority =
  | 'low_latency_5050'
  | 'balanced'
  | 'anti_starvation'
  | 'rate_stability'
  | 'competitive'
  | 'motion'
  | 'input_consistency'
  | 'custom';

export type ClockRateStepMode = 'discrete_2tier' | 'continuous_pd' | 'hybrid';

export interface ClockPacingParams {
  targetBufferTicks: number;
  deadbandCatchupOffset: number;
  deadbandSkipOffset: number;
  rateStepMode: ClockRateStepMode;
  tier1Hz: number;
  tier2Hz: number;
  tier1EnterError: number;
  tier1ExitError: number;
  tier2EnterError: number;
  tier2ExitError: number;
  minDwellTicks: number;
  kpHzPerTick: number;
  kdHzPerTickVel: number;
  maxAdjustHz: number;
  inFlightCompGain: number;
  rttEwmaAlpha: number;
  bufferEwmaAlpha: number;
  enableAdaptiveJitterBoost: boolean;
  adaptiveJitterGain: number;
  maxAdaptiveBoostTicks: number;
  enableHardResync: boolean;
  hardResyncThresholdTicks: number;
  hardResyncCooldownMs: number;
}

export interface ClockPacingPriorityDescriptor {
  id: ClockPacingPriority;
  label: string;
  shortLabel: string;
  description: string;
  targetBufferTicks: number;
  deadband: [number, number];
  paramsPatch: Partial<ClockPacingParams>;
}

export const ALLOWED_CLOCK_PACING_MODES: readonly ClockPacingMode[] = Object.freeze([
  'legacy',
  'sts',
  'csts',
  'custom',
]);

export const ALLOWED_CLOCK_PACING_PRIORITIES: readonly ClockPacingPriority[] = Object.freeze([
  'low_latency_5050',
  'balanced',
  'anti_starvation',
  'rate_stability',
  'competitive',
  'motion',
  'input_consistency',
  'custom',
]);

export const ALLOWED_RATE_STEP_MODES: readonly ClockRateStepMode[] = Object.freeze([
  'discrete_2tier',
  'continuous_pd',
  'hybrid',
]);

export const DEFAULT_CLOCK_PACING_PARAMS: ClockPacingParams = Object.freeze({
  targetBufferTicks: 3,
  deadbandCatchupOffset: -2,
  deadbandSkipOffset: 2,
  rateStepMode: 'continuous_pd',
  tier1Hz: 1.0,
  tier2Hz: 3.0,
  tier1EnterError: 1.0,
  tier1ExitError: 0.4,
  tier2EnterError: 2.5,
  tier2ExitError: 1.3,
  minDwellTicks: 18,
  kpHzPerTick: 0.85,
  kdHzPerTickVel: 0.35,
  maxAdjustHz: 6.0,
  inFlightCompGain: 0.85,
  rttEwmaAlpha: 0.12,
  bufferEwmaAlpha: 0.25,
  enableAdaptiveJitterBoost: true,
  adaptiveJitterGain: 1.25,
  maxAdaptiveBoostTicks: 4.0,
  enableHardResync: true,
  hardResyncThresholdTicks: 10,
  hardResyncCooldownMs: 1000,
});

export const DEFAULT_CLOCK_PACING_CONFIG: Readonly<ClockPacingParams> =
  DEFAULT_CLOCK_PACING_PARAMS;

export const CLOCK_PACING_PRIORITY_PRESETS: Record<
  ClockPacingPriority,
  ClockPacingPriorityDescriptor
> = Object.freeze({
  low_latency_5050: {
    id: 'low_latency_5050',
    label: '50/50 Accuracy & Minimal Lead',
    shortLabel: '50/50 Lead',
    description:
      'Minimizes forward prediction ticks for sharper 50/50 challenges. Accepts occasional input starvation during severe jitter spikes.',
    targetBufferTicks: 2,
    deadband: [-1, 1],
    paramsPatch: {
      targetBufferTicks: 2,
      deadbandCatchupOffset: -1,
      deadbandSkipOffset: 1,
      tier1Hz: 1.5,
      tier2Hz: 4.0,
      tier1EnterError: 0.8,
      tier1ExitError: 0.3,
      tier2EnterError: 2.0,
      tier2ExitError: 1.0,
      minDwellTicks: 12,
      kpHzPerTick: 1.15,
      kdHzPerTickVel: 0.35,
      maxAdjustHz: 6.0,
      inFlightCompGain: 0.9,
      bufferEwmaAlpha: 0.32,
      adaptiveJitterGain: 0.65,
      maxAdaptiveBoostTicks: 2.5,
      hardResyncThresholdTicks: 8,
    },
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced (Default)',
    shortLabel: 'Balanced',
    description:
      'Balances 50/50 prediction lead against input buffer safety and smooth clock rate transitions.',
    targetBufferTicks: 3,
    deadband: [-2, 2],
    paramsPatch: {
      targetBufferTicks: 3,
      deadbandCatchupOffset: -2,
      deadbandSkipOffset: 2,
      tier1Hz: 1.0,
      tier2Hz: 3.0,
      tier1EnterError: 1.0,
      tier1ExitError: 0.4,
      tier2EnterError: 2.5,
      tier2ExitError: 1.3,
      minDwellTicks: 18,
      kpHzPerTick: 0.85,
      kdHzPerTickVel: 0.35,
      maxAdjustHz: 6.0,
      inFlightCompGain: 0.85,
      bufferEwmaAlpha: 0.25,
      adaptiveJitterGain: 1.25,
      maxAdaptiveBoostTicks: 4.0,
      hardResyncThresholdTicks: 10,
    },
  },
  anti_starvation: {
    id: 'anti_starvation',
    label: 'Anti-Starvation & Jitter Shield',
    shortLabel: 'Anti-Starve',
    description:
      'Prioritizes zero input starvation on unstable connections by maintaining a deeper buffer and stronger jitter margin.',
    targetBufferTicks: 4,
    deadband: [-1, 3],
    paramsPatch: {
      targetBufferTicks: 4,
      deadbandCatchupOffset: -1,
      deadbandSkipOffset: 3,
      tier1Hz: 1.25,
      tier2Hz: 3.5,
      tier1EnterError: 0.85,
      tier1ExitError: 0.35,
      tier2EnterError: 2.1,
      tier2ExitError: 1.1,
      minDwellTicks: 16,
      kpHzPerTick: 1.0,
      kdHzPerTickVel: 0.4,
      maxAdjustHz: 6.0,
      inFlightCompGain: 0.85,
      bufferEwmaAlpha: 0.28,
      adaptiveJitterGain: 2.0,
      maxAdaptiveBoostTicks: 5.5,
      hardResyncThresholdTicks: 12,
    },
  },
  rate_stability: {
    id: 'rate_stability',
    label: 'Physics Rate Stability',
    shortLabel: 'Rate Stable',
    description:
      'Minimizes clock frequency adjustments and state transitions, using gentle fractional pacing and wide hysteresis.',
    targetBufferTicks: 3,
    deadband: [-2, 2],
    paramsPatch: {
      targetBufferTicks: 3,
      deadbandCatchupOffset: -2,
      deadbandSkipOffset: 2,
      tier1Hz: 0.5,
      tier2Hz: 1.5,
      tier1EnterError: 1.5,
      tier1ExitError: 0.6,
      tier2EnterError: 3.2,
      tier2ExitError: 1.8,
      minDwellTicks: 36,
      kpHzPerTick: 0.45,
      kdHzPerTickVel: 0.55,
      maxAdjustHz: 3.0,
      inFlightCompGain: 0.9,
      bufferEwmaAlpha: 0.15,
      adaptiveJitterGain: 1.0,
      maxAdaptiveBoostTicks: 3.5,
      hardResyncThresholdTicks: 12,
    },
  },
  competitive: {
    id: 'competitive',
    label: 'Competitive',
    shortLabel: 'Competitive',
    description:
      'Minimizes forward prediction ticks for sharper 50/50 challenges.',
    targetBufferTicks: 2,
    deadband: [-1, 1],
    paramsPatch: {
      targetBufferTicks: 2,
      deadbandCatchupOffset: -1,
      deadbandSkipOffset: 1,
      tier1Hz: 1.5,
      tier2Hz: 4.0,
      tier1EnterError: 0.8,
      tier1ExitError: 0.3,
      tier2EnterError: 2.0,
      tier2ExitError: 1.0,
      minDwellTicks: 12,
      kpHzPerTick: 1.15,
      kdHzPerTickVel: 0.35,
      maxAdjustHz: 6.0,
      inFlightCompGain: 0.9,
      bufferEwmaAlpha: 0.32,
      adaptiveJitterGain: 0.65,
      maxAdaptiveBoostTicks: 2.5,
      hardResyncThresholdTicks: 8,
    },
  },
  motion: {
    id: 'motion',
    label: 'Motion',
    shortLabel: 'Motion',
    description:
      'Minimizes clock frequency adjustments and state transitions for smooth visual motion.',
    targetBufferTicks: 3,
    deadband: [-2, 2],
    paramsPatch: {
      targetBufferTicks: 3,
      deadbandCatchupOffset: -2,
      deadbandSkipOffset: 2,
      tier1Hz: 0.5,
      tier2Hz: 1.5,
      tier1EnterError: 1.5,
      tier1ExitError: 0.6,
      tier2EnterError: 3.2,
      tier2ExitError: 1.8,
      minDwellTicks: 36,
      kpHzPerTick: 0.45,
      kdHzPerTickVel: 0.55,
      maxAdjustHz: 3.0,
      inFlightCompGain: 0.9,
      bufferEwmaAlpha: 0.15,
      adaptiveJitterGain: 1.0,
      maxAdaptiveBoostTicks: 3.5,
      hardResyncThresholdTicks: 12,
    },
  },
  input_consistency: {
    id: 'input_consistency',
    label: 'Input Consistency',
    shortLabel: 'Input Consistency',
    description:
      'Prioritizes zero input starvation on unstable connections by maintaining a deeper buffer.',
    targetBufferTicks: 4,
    deadband: [-1, 3],
    paramsPatch: {
      targetBufferTicks: 4,
      deadbandCatchupOffset: -1,
      deadbandSkipOffset: 3,
      tier1Hz: 1.25,
      tier2Hz: 3.5,
      tier1EnterError: 0.85,
      tier1ExitError: 0.35,
      tier2EnterError: 2.1,
      tier2ExitError: 1.1,
      minDwellTicks: 16,
      kpHzPerTick: 1.0,
      kdHzPerTickVel: 0.4,
      maxAdjustHz: 6.0,
      inFlightCompGain: 0.85,
      bufferEwmaAlpha: 0.28,
      adaptiveJitterGain: 2.0,
      maxAdaptiveBoostTicks: 5.5,
      hardResyncThresholdTicks: 12,
    },
  },
  custom: {
    id: 'custom',
    label: 'Custom',
    shortLabel: 'Custom',
    description: 'Manual input buffer and deadband override.',
    targetBufferTicks: 3,
    deadband: [-1, 1],
    paramsPatch: {},
  },
});
