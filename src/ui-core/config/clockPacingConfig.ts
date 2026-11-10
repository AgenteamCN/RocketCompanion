/**
 * clockPacingConfig.ts
 * Pure parameter sanitization, effective mode resolution, and LocalStorage persistence helpers
 * for Input Buffer & Clock Pacing algorithms.
 */

import {
  STORAGE_KEYS,
  safeStorage,
  isPlainObject,
  booleanOrDefault,
  clampNumberOrDefault,
  stringOrDefault,
} from './storageHelpers';
import { ALLOWED_CLOCK_PACING_MODES, ALLOWED_CLOCK_PACING_PRIORITIES, ALLOWED_RATE_STEP_MODES, CLOCK_PACING_PRIORITY_PRESETS, DEFAULT_CLOCK_PACING_PARAMS, type ClockPacingMode, type ClockPacingParams, type ClockPacingPriority, type ClockPacingPriorityDescriptor, type ClockRateStepMode } from './clockPacingPresets';

export type { ClockPacingMode, ClockPacingParams, ClockPacingPriority, ClockPacingPriorityDescriptor, ClockRateStepMode };

export function sanitizeClockPacingParams(
  raw: unknown,
  fallback: ClockPacingParams = DEFAULT_CLOCK_PACING_PARAMS
): ClockPacingParams {
  if (!isPlainObject(raw)) {
    return { ...fallback };
  }

  const targetBufferTicks = clampNumberOrDefault(raw.targetBufferTicks, fallback.targetBufferTicks, {
    min: 1,
    max: 12,
    integer: true,
  });
  const deadbandCatchupOffset = clampNumberOrDefault(
    raw.deadbandCatchupOffset,
    fallback.deadbandCatchupOffset,
    { min: -12, max: 0, integer: true }
  );
  const deadbandSkipOffset = clampNumberOrDefault(
    raw.deadbandSkipOffset,
    fallback.deadbandSkipOffset,
    { min: 0, max: 12, integer: true }
  );
  const rateStepMode = stringOrDefault(
    raw.rateStepMode,
    ALLOWED_RATE_STEP_MODES,
    fallback.rateStepMode
  ) as ClockRateStepMode;

  const tier1Hz = clampNumberOrDefault(raw.tier1Hz, fallback.tier1Hz, { min: 0.1, max: 6.0 });
  const tier2Hz = clampNumberOrDefault(raw.tier2Hz, fallback.tier2Hz, {
    min: Math.max(0.2, tier1Hz),
    max: 12.0,
  });

  const tier1EnterError = clampNumberOrDefault(raw.tier1EnterError, fallback.tier1EnterError, {
    min: 0.2,
    max: 8.0,
  });
  const tier1ExitError = clampNumberOrDefault(raw.tier1ExitError, fallback.tier1ExitError, {
    min: 0.0,
    max: Math.max(0.1, tier1EnterError - 0.1),
  });
  const tier2EnterError = clampNumberOrDefault(raw.tier2EnterError, fallback.tier2EnterError, {
    min: Math.max(0.5, tier1EnterError + 0.2),
    max: 12.0,
  });
  const tier2ExitError = clampNumberOrDefault(raw.tier2ExitError, fallback.tier2ExitError, {
    min: Math.max(0.1, tier1ExitError),
    max: Math.max(0.2, tier2EnterError - 0.1),
  });

  const minDwellTicks = clampNumberOrDefault(raw.minDwellTicks, fallback.minDwellTicks, {
    min: 0,
    max: 240,
    integer: true,
  });
  const kpHzPerTick = clampNumberOrDefault(raw.kpHzPerTick, fallback.kpHzPerTick, {
    min: 0.05,
    max: 4.0,
  });
  const kdHzPerTickVel = clampNumberOrDefault(raw.kdHzPerTickVel, fallback.kdHzPerTickVel, {
    min: 0.0,
    max: 3.0,
  });
  const maxAdjustHz = clampNumberOrDefault(raw.maxAdjustHz, fallback.maxAdjustHz, {
    min: 0.5,
    max: 12.0,
  });
  const inFlightCompGain = clampNumberOrDefault(raw.inFlightCompGain, fallback.inFlightCompGain, {
    min: 0.0,
    max: 1.2,
  });
  const rttEwmaAlpha = clampNumberOrDefault(raw.rttEwmaAlpha, fallback.rttEwmaAlpha, {
    min: 0.01,
    max: 0.8,
  });
  const bufferEwmaAlpha = clampNumberOrDefault(raw.bufferEwmaAlpha, fallback.bufferEwmaAlpha, {
    min: 0.02,
    max: 1.0,
  });
  const enableAdaptiveJitterBoost = booleanOrDefault(
    raw.enableAdaptiveJitterBoost,
    fallback.enableAdaptiveJitterBoost
  );
  const adaptiveJitterGain = clampNumberOrDefault(
    raw.adaptiveJitterGain,
    fallback.adaptiveJitterGain,
    { min: 0.0, max: 4.0 }
  );
  const maxAdaptiveBoostTicks = clampNumberOrDefault(
    raw.maxAdaptiveBoostTicks,
    fallback.maxAdaptiveBoostTicks,
    { min: 0.0, max: 10.0 }
  );
  const enableHardResync = booleanOrDefault(raw.enableHardResync, fallback.enableHardResync);
  const hardResyncThresholdTicks = clampNumberOrDefault(
    raw.hardResyncThresholdTicks,
    fallback.hardResyncThresholdTicks,
    { min: 4, max: 40, integer: true }
  );
  const hardResyncCooldownMs = clampNumberOrDefault(
    raw.hardResyncCooldownMs,
    fallback.hardResyncCooldownMs,
    { min: 100, max: 10000, integer: true }
  );

  return {
    targetBufferTicks,
    deadbandCatchupOffset,
    deadbandSkipOffset,
    rateStepMode,
    tier1Hz,
    tier2Hz,
    tier1EnterError,
    tier1ExitError,
    tier2EnterError,
    tier2ExitError,
    minDwellTicks,
    kpHzPerTick,
    kdHzPerTickVel,
    maxAdjustHz,
    inFlightCompGain,
    rttEwmaAlpha,
    bufferEwmaAlpha,
    enableAdaptiveJitterBoost,
    adaptiveJitterGain,
    maxAdaptiveBoostTicks,
    enableHardResync,
    hardResyncThresholdTicks,
    hardResyncCooldownMs,
  };
}

export function resolveEffectiveClockPacingParams(
  mode: ClockPacingMode,
  priority: ClockPacingPriority,
  targetBufferTicks: number,
  thresholdRange: [number, number],
  customParams: ClockPacingParams
): ClockPacingParams {
  if (mode === 'custom') {
    return sanitizeClockPacingParams(customParams);
  }

  const preset = CLOCK_PACING_PRIORITY_PRESETS[priority] || CLOCK_PACING_PRIORITY_PRESETS.balanced;
  const base: ClockPacingParams = {
    ...DEFAULT_CLOCK_PACING_PARAMS,
    ...preset.paramsPatch,
    targetBufferTicks: clampNumberOrDefault(targetBufferTicks, preset.targetBufferTicks, {
      min: 1,
      max: 12,
      integer: true,
    }),
    deadbandCatchupOffset: clampNumberOrDefault(thresholdRange?.[0], preset.deadband[0], {
      min: -12,
      max: 0,
      integer: true,
    }),
    deadbandSkipOffset: clampNumberOrDefault(thresholdRange?.[1], preset.deadband[1], {
      min: 0,
      max: 12,
      integer: true,
    }),
  };

  if (mode === 'legacy') {
    return {
      ...base,
      rateStepMode: 'discrete_2tier',
      tier1Hz: 0,
      tier2Hz: 0,
      maxAdjustHz: 0,
      enableAdaptiveJitterBoost: false,
    };
  }

  if (mode === 'sts') {
    return {
      ...base,
      rateStepMode: 'discrete_2tier',
      enableAdaptiveJitterBoost: false,
    };
  }

  return {
    ...base,
    rateStepMode: 'continuous_pd',
    enableAdaptiveJitterBoost: true,
  };
}

/**
 * Hydrate initial ClockPacingMode from LocalStorage.
 * Intentionally allows 'custom' to remain selected even when developerMode is false,
 * so a user who tuned custom parameters in developer mode and turned developer mode off
 * continues running their custom parameters until they click Legacy, STS, or CSTS.
 */
export function getInitialClockPacingMode(): ClockPacingMode {
  const raw = safeStorage.get(STORAGE_KEYS.CLOCK_PACING);
  if (raw && (ALLOWED_CLOCK_PACING_MODES as readonly string[]).includes(raw)) {
    return raw as ClockPacingMode;
  }
  return 'csts';
}

export function getInitialClockPacingPriority(): ClockPacingPriority {
  const raw = safeStorage.get(STORAGE_KEYS.CLOCK_PACING_PRIORITY);
  if (raw && (ALLOWED_CLOCK_PACING_PRIORITIES as readonly string[]).includes(raw)) {
    return raw as ClockPacingPriority;
  }
  return 'balanced';
}

export function getInitialCustomClockPacingParams(): ClockPacingParams {
  const raw = safeStorage.get(STORAGE_KEYS.CLOCK_PACING_CUSTOM_PARAMS);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return sanitizeClockPacingParams(parsed, DEFAULT_CLOCK_PACING_PARAMS);
    } catch (err) {
      console.warn('[clockPacingConfig] Failed to parse stored custom clock pacing params:', err);
    }
  }
  return { ...DEFAULT_CLOCK_PACING_PARAMS };
}

export function saveCustomClockPacingParams(params: ClockPacingParams): ClockPacingParams {
  const clean = sanitizeClockPacingParams(params, DEFAULT_CLOCK_PACING_PARAMS);
  safeStorage.set(STORAGE_KEYS.CLOCK_PACING_CUSTOM_PARAMS, JSON.stringify(clean));
  return clean;
}
