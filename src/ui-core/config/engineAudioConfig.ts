/**
 * Engine Audio Pack Registry & Turtle Modem Drivetrain/Granular Synthesis Configuration
 * Provides extensible interfaces for multi-pack vehicle powertrain synthesis and
 * calibrated default physics/DSP parameters for the Turtle Modem engine audio pack.
 */

export type EngineAudioPackId = 'turtle_modem' | string;

export type EngineCrossfadeCurveType = 'equal-sine' | 'linear';
export type EngineDecelSynthesisMode = 'reverse-filter' | 'pure-on';
export type EngineDriveDirection = 'stopped' | 'forward' | 'reverse';
export type EngineLandingRevMode = 'instant-speed-match' | 'fast-ramp-from-idle';

export interface EngineAudioSliceMeta {
  index: number;
  rpm: number;
  freq: number;
  on_file: string;
  off_file: string;
}

export interface EngineAudioPackMetadata {
  id: EngineAudioPackId;
  name: string;
  sample_rate: number;
  idle_loop_file: string;
  idle_freq_hz: number;
  accel_ramp_file?: string;
  entity_spawn_file: string;
  pop_files: string[];
  slices: EngineAudioSliceMeta[];
}

export interface EngineAudioPackDescriptor {
  id: EngineAudioPackId;
  name: string;
  subtitle: string;
  basePath: string;
  metadataUrl: string;
  idleLoopUrl: string;
  entitySpawnUrl: string;
  popUrls: string[];
  idleFreqHz: number;
  idleRPM: number;
  redlineRPM: number;
}

export type EngineEqBandIndex = 0 | 1 | 2 | 3 | 4;

export const ENGINE_AUDIO_EQ_BAND_FREQS_HZ: readonly [number, number, number, number, number] = [
  42, 48, 56, 66, 74,
];

export const ENGINE_AUDIO_EQ_BAND_LABELS: readonly [string, string, string, string, string] = [
  'Band 1 · 42Hz (Idle / Low RPM)',
  'Band 2 · 48Hz (Low-Mid)',
  'Band 3 · 56Hz (Mid Transition)',
  'Band 4 · 66Hz (High-Mid Overdrive)',
  'Band 5 · 74Hz (Redline Presence)',
];

export interface EngineAudioTuningConfig {
  /** Active engine sound pack identifier (default: 'turtle_modem') */
  activePackId: EngineAudioPackId;
  /** Play entity spawn sound effect on Free Play reset or post-demolition respawn (default: false) */
  entitySpawnSfxEnabled: boolean;
  /** Volume multiplier for the entity spawn sound effect (0.0 - 1.5, default: 0.85) */
  entitySpawnSfxVolume: number;
  /** Independent volume multiplier for the engine idle loop (0.0 - 2.0, default: 1.0) */
  idleVolume: number;
  /** Idle baseline RPM when speed is zero or in neutral (default: 900) */
  idleRPM: number;
  /** Maximum redline RPM ceiling (default: 6000) */
  redlineRPM: number;
  /** Linear RPM drop rate when coasting or after airborne quota exhaustion (default: 1400 RPM/s) */
  rpmDropRate: number;
  /** Virtual overdrive forward base RPM acceleration rate (default: 1000 RPM/s) */
  baseAccelRiseRate: number;
  /** Virtual overdrive RPM rise multiplier when boosting vs throttle-only, calibrated from RocketSim physics (default: 1.85) */
  boostOverdriveMultiplier: number;
  /** Virtual overdrive reverse base RPM acceleration rate (default: 220 RPM/s) */
  reverseAccelRiseRate: number;
  /** Rev-limiter cutoff threshold RPM (default: 5980 RPM) */
  revLimitCutoffRPM: number;
  /** Rev-limiter bounce drop depth in RPM (default: 200 RPM -> drops to 5780 RPM) */
  revLimiterBounceDrop: number;
  /** Rev-limiter fuel-cut bounce period in seconds (default: 0.02 s) */
  revLimiterBounceDuration: number;
  /** Target landing RPM immediately after an upshift (default: 3300 RPM) */
  upshiftLandingRPM: number;
  /** Maximum gear cap; 0 means unlimited gears (default: 0 = unlimited) */
  maxGears: number;
  /** Exponential gear acceleration decay factor per gear: base^(gear - 1) (default: 0.72) */
  gearDecayFactorBase: number;
  /** Exponential reverse gear acceleration decay factor for R2+: base^(gear - 1) (default: 0.52) */
  reverseGearDecayFactorBase: number;
  /** Flywheel exponential response agility rate (default: 18.0) */
  flywheelAgility: number;
  /** Minimum RPM threshold to trigger exhaust backfire pop on overdrive lift / upshift / reverse braking (default: 4500 RPM) */
  backfireTriggerRPM: number;
  /** Substantial RPM drop applied immediately when an exhaust backfire pop triggers (default: 1650 RPM) */
  backfireRpmDrop: number;
  /** Minimum cooldown interval in seconds between exhaust backfire pops (default: 0.65 s) */
  backfireCooldownSec: number;
  /** Volume multiplier for exhaust backfire pops (default: 0.55) */
  backfireVolume: number;
  /** Web Audio GainNode / BiquadFilterNode smoothing time constant in milliseconds (default: 15 ms) */
  gainSmoothingTimeMs: number;
  /** Crossfade curve between adjacent RPM slices (default: 'equal-sine') */
  crossfadeCurveType: EngineCrossfadeCurveType;
  /** Off-throttle deceleration synthesis mode (default: 'reverse-filter') */
  decelMode: EngineDecelSynthesisMode;
  /** Phase decorrelation delay between adjacent slice oscillators in milliseconds (default: 0 ms) */
  decorrelationDelayMs: number;
  /** Automatically upshift when reaching revLimitCutoffRPM (default: true) */
  autoUpshiftEnabled: boolean;
  /** Automatically downshift with rev-match when dropping below downshiftTriggerRPM (default: true) */
  autoDownshiftEnabled: boolean;
  /** Downshift trigger RPM threshold when autoDownshiftEnabled is true (default: 2400 RPM) */
  downshiftTriggerRPM: number;
  /** Downshift rev-match peak RPM when autoDownshiftEnabled is true (default: 4600 RPM) */
  downshiftRevMatchPeakRPM: number;
  /** Automatically shift to Neutral when vehicle leaves the ground (!isOnGround) (default: true) */
  airborneAutoNeutralEnabled: boolean;
  /** Cumulative airborne throttle/boost duration quota in seconds before free-revving cuts off (default: 1.25 s) */
  airborneRevQuotaDurationSec: number;
  /** Enable physics velocity-coupled Gear 1 speed curve with virtual overdrive shifting (default: true) */
  velocityCoupledGearsEnabled: boolean;
  /** Maximum ground speed reachable with throttle alone (default: 1405 UU/s, RL max is 1410 UU/s) */
  maxThrottleSpeedUU: number;
  /** Supersonic speed threshold in UU/s (default: 2200 UU/s) */
  supersonicSpeedUU: number;
  /** Hold current gear (disable automatic upshifting) when continuously accelerating/boosting while steering on ground (default: true) */
  supersonicTurnRevBounceEnabled: boolean;
  /** Steering input magnitude threshold (0..1) above which turning under power locks automatic upshifting (default: 0.18) */
  shiftLockSteerThreshold: number;
  /** Forward deceleration rate threshold in UU/s^2 for wall-bevel / cornering RPM dip (default: -80 UU/s^2) */
  wallDecelDipThresholdUU: number;
  /** Touchdown RPM recovery mode when landing from airborne state (default: 'instant-speed-match') */
  landingRevRecoveryMode: EngineLandingRevMode;
  /** Reset RPM to idle and gear to Neutral whenever vehicle speed drops to zero (default: true) */
  zeroSpeedResetEnabled: boolean;
  /** Speed threshold in UU/s below which the vehicle is considered stopped (default: 18 UU/s) */
  zeroSpeedThresholdUU: number;
  /** Enable dedicated Engine Audio frequency loudness equalizer & RMS leveling (default: true) */
  engineEqEnabled: boolean;
  /** Blend strength (0.0 .. 1.0) of automatic per-slice RMS loudness normalization (default: 0.85) */
  sliceRmsAutoNormStrength: number;
  /** Frequency-axis loudness tilt in dB across fundamental slice frequencies (37Hz -> 75Hz) (default: 1.5 dB) */
  freqTiltDb: number;
  /** 5-Band Engine Frequency Equalizer gains in dB (-12 .. +12 dB) at [42, 48, 56, 66, 74] Hz */
  eqBandGainsDb: [number, number, number, number, number];
  /** 3-Band Web Audio Parametric Output Timbre EQ: Low Shelf (90Hz) in dB (-12 .. +12 dB) */
  timbreLowShelfDb: number;
  /** 3-Band Web Audio Parametric Output Timbre EQ: Mid Peaking (650Hz) in dB (-12 .. +12 dB) */
  timbreMidPeakDb: number;
  /** 3-Band Web Audio Parametric Output Timbre EQ: High Shelf (3200Hz) in dB (-12 .. +12 dB) */
  timbreHighShelfDb: number;
}

export interface EngineAudioLiveTelemetry {
  packId: EngineAudioPackId;
  loaded: boolean;
  loadedSlicesCount: number;
  totalSlicesCount: number;
  currentRPM: number;
  targetRPM: number;
  currentGear: number;
  isNeutral: boolean;
  isOnGround: boolean;
  driveDirection: EngineDriveDirection;
  speedUU: number;
  speedKmh: number;
  forwardAccelUU: number;
  airborneRevQuotaRemainingSec: number;
  isShiftLocked: boolean;
  isUnderStrain: boolean;
  isInOverdrive: boolean;
  isBoosting: boolean;
  throttleLoad: number;
  smoothThrottle: number;
  isRevLimiting: boolean;
  lowerSliceIndex: number;
  upperSliceIndex: number;
  lowerSliceFreqHz: number;
  upperSliceFreqHz: number;
  activeEqCompensationDb: number;
  idleWeight: number;
  filterCutoffHz: number;
  lastBackfireIndex: number;
  backfireCount: number;
  entitySpawnCount: number;
  manualOverrideActive: boolean;
  manualThrottle: boolean;
  manualBoost: boolean;
  manualReverse: boolean;
  manualAirborne: boolean;
}

export const TURTLE_MODEM_ENGINE_PACK: EngineAudioPackDescriptor = {
  id: 'turtle_modem',
  name: 'Turtle Modem',
  subtitle: '40-Slice Harmonic Granular REV Matrix + Phase-Locked Loop Conditioner',
  basePath: 'assets/audio/engine/turtle_modem',
  metadataUrl: 'assets/audio/engine/turtle_modem/metadata.json',
  idleLoopUrl: 'assets/audio/engine/turtle_modem/idle_loop.m4a',
  entitySpawnUrl: 'assets/audio/engine/turtle_modem/sfx/entity_spawn.m4a',
  popUrls: [
    'assets/audio/engine/turtle_modem/sfx/pop_01.m4a',
    'assets/audio/engine/turtle_modem/sfx/pop_02.m4a',
    'assets/audio/engine/turtle_modem/sfx/pop_03.m4a',
    'assets/audio/engine/turtle_modem/sfx/pop_04.m4a',
    'assets/audio/engine/turtle_modem/sfx/pop_05.m4a',
  ],
  idleFreqHz: 37.02,
  idleRPM: 900,
  redlineRPM: 6000,
};

const enginePackRegistry = new Map<EngineAudioPackId, EngineAudioPackDescriptor>([
  [TURTLE_MODEM_ENGINE_PACK.id, TURTLE_MODEM_ENGINE_PACK],
]);

export function registerEngineAudioPack(descriptor: EngineAudioPackDescriptor): void {
  enginePackRegistry.set(descriptor.id, descriptor);
}

export function getEngineAudioPack(id: EngineAudioPackId): EngineAudioPackDescriptor {
  return enginePackRegistry.get(id) ?? TURTLE_MODEM_ENGINE_PACK;
}

export function listEngineAudioPacks(): EngineAudioPackDescriptor[] {
  return Array.from(enginePackRegistry.values());
}

export const DEFAULT_ENGINE_AUDIO_TUNING_CONFIG: EngineAudioTuningConfig = {
  activePackId: 'turtle_modem',
  entitySpawnSfxEnabled: false,
  entitySpawnSfxVolume: 0.85,
  idleVolume: 1.0,
  idleRPM: 900,
  redlineRPM: 6000,
  rpmDropRate: 1400,
  baseAccelRiseRate: 1000,
  boostOverdriveMultiplier: 1.85,
  reverseAccelRiseRate: 220,
  revLimitCutoffRPM: 5980,
  revLimiterBounceDrop: 200,
  revLimiterBounceDuration: 0.02,
  upshiftLandingRPM: 3300,
  maxGears: 0,
  gearDecayFactorBase: 0.72,
  reverseGearDecayFactorBase: 0.52,
  flywheelAgility: 18.0,
  backfireTriggerRPM: 4500,
  backfireRpmDrop: 1650,
  backfireCooldownSec: 0.65,
  backfireVolume: 0.55,
  gainSmoothingTimeMs: 15,
  crossfadeCurveType: 'equal-sine',
  decelMode: 'reverse-filter',
  decorrelationDelayMs: 0,
  autoUpshiftEnabled: true,
  autoDownshiftEnabled: true,
  downshiftTriggerRPM: 2400,
  downshiftRevMatchPeakRPM: 4600,
  airborneAutoNeutralEnabled: true,
  airborneRevQuotaDurationSec: 1.25,
  velocityCoupledGearsEnabled: true,
  maxThrottleSpeedUU: 1405,
  supersonicSpeedUU: 2200,
  supersonicTurnRevBounceEnabled: true,
  shiftLockSteerThreshold: 0.18,
  wallDecelDipThresholdUU: -80,
  landingRevRecoveryMode: 'instant-speed-match',
  zeroSpeedResetEnabled: true,
  zeroSpeedThresholdUU: 18,
  engineEqEnabled: true,
  sliceRmsAutoNormStrength: 0.85,
  freqTiltDb: 1.5,
  eqBandGainsDb: [0.0, -1.0, 0.5, 2.0, 1.5],
  timbreLowShelfDb: 0.0,
  timbreMidPeakDb: 0.0,
  timbreHighShelfDb: 0.0,
};

export const INITIAL_ENGINE_AUDIO_TELEMETRY: EngineAudioLiveTelemetry = {
  packId: 'turtle_modem',
  loaded: false,
  loadedSlicesCount: 0,
  totalSlicesCount: 40,
  currentRPM: 900,
  targetRPM: 900,
  currentGear: 0,
  isNeutral: true,
  isOnGround: true,
  driveDirection: 'stopped',
  speedUU: 0,
  speedKmh: 0,
  forwardAccelUU: 0,
  airborneRevQuotaRemainingSec: 1.25,
  isShiftLocked: false,
  isUnderStrain: false,
  isInOverdrive: false,
  isBoosting: false,
  throttleLoad: 0,
  smoothThrottle: 0,
  isRevLimiting: false,
  lowerSliceIndex: 0,
  upperSliceIndex: 1,
  lowerSliceFreqHz: 37.6,
  upperSliceFreqHz: 38.4,
  activeEqCompensationDb: 0,
  idleWeight: 1,
  filterCutoffHz: 2800,
  lastBackfireIndex: -1,
  backfireCount: 0,
  entitySpawnCount: 0,
  manualOverrideActive: false,
  manualThrottle: false,
  manualBoost: false,
  manualReverse: false,
  manualAirborne: false,
};

export const ENGINE_AUDIO_TUNING_CONFIG: EngineAudioTuningConfig = {
  ...DEFAULT_ENGINE_AUDIO_TUNING_CONFIG,
  eqBandGainsDb: [...DEFAULT_ENGINE_AUDIO_TUNING_CONFIG.eqBandGainsDb],
};

type EngineAudioConfigListener = (config: EngineAudioTuningConfig) => void;
const configCallbacks: EngineAudioConfigListener[] = [];

export function getEngineAudioTuningConfig(): EngineAudioTuningConfig {
  return ENGINE_AUDIO_TUNING_CONFIG;
}

export function updateEngineAudioTuningConfig(
  patch: Partial<EngineAudioTuningConfig>
): EngineAudioTuningConfig {
  Object.assign(ENGINE_AUDIO_TUNING_CONFIG, patch);
  if (patch.eqBandGainsDb) {
    ENGINE_AUDIO_TUNING_CONFIG.eqBandGainsDb = [...patch.eqBandGainsDb];
  }
  for (const listener of configCallbacks) {
    try {
      listener(ENGINE_AUDIO_TUNING_CONFIG);
    } catch (err) {
      console.warn('[engineAudioConfig] Listener error:', err);
    }
  }
  return ENGINE_AUDIO_TUNING_CONFIG;
}

export function resetEngineAudioTuningConfig(): EngineAudioTuningConfig {
  return updateEngineAudioTuningConfig({
    ...DEFAULT_ENGINE_AUDIO_TUNING_CONFIG,
    eqBandGainsDb: [...DEFAULT_ENGINE_AUDIO_TUNING_CONFIG.eqBandGainsDb],
  });
}

export function subscribeEngineAudioTuningConfig(
  listener: EngineAudioConfigListener
): () => void {
  if (!configCallbacks.includes(listener)) {
    configCallbacks.push(listener);
  }
  return () => {
    const idx = configCallbacks.indexOf(listener);
    if (idx !== -1) configCallbacks.splice(idx, 1);
  };
}

export interface EngineAudioRuntimeActions {
  triggerBackfireTest?: () => void;
  triggerEntitySpawnTest?: () => void;
  triggerZeroSpeedReset?: () => void;
  setManualBenchState?: (patch: {
    active?: boolean;
    throttle?: boolean;
    boost?: boolean;
    reverse?: boolean;
    airborne?: boolean;
  }) => void;
}

let runtimeActions: EngineAudioRuntimeActions = {};

export function registerEngineAudioRuntimeActions(actions: EngineAudioRuntimeActions): void {
  runtimeActions = { ...runtimeActions, ...actions };
}

export function getEngineAudioRuntimeActions(): EngineAudioRuntimeActions {
  return runtimeActions;
}

type EngineAudioTelemetryListener = (patch: Partial<EngineAudioLiveTelemetry>) => void;
const telemetryCallbacks: EngineAudioTelemetryListener[] = [];

export function publishEngineAudioTelemetry(patch: Partial<EngineAudioLiveTelemetry>): void {
  for (const listener of telemetryCallbacks) {
    try {
      listener(patch);
    } catch {
      // Ignore telemetry listener errors
    }
  }
}

export function subscribeEngineAudioTelemetry(
  listener: EngineAudioTelemetryListener
): () => void {
  if (!telemetryCallbacks.includes(listener)) {
    telemetryCallbacks.push(listener);
  }
  return () => {
    const idx = telemetryCallbacks.indexOf(listener);
    if (idx !== -1) telemetryCallbacks.splice(idx, 1);
  };
}
