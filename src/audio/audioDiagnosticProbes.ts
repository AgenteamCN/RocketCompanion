import { audioConfig } from '../ui-core/config/audioConfig.ts';
import {
  subsystemState,
  getAudioContext,
  getAudioSlotPool,
  recordAudioLifecycleEvent,
  type AudioLifecycleEventEntry,
  type AudioTelemetryState,
} from './audioContext.ts';
import type { AudioMixerOutputMetrics } from './AudioMixer.ts';
import type { MasterAcousticProcessorSnapshot } from './MasterAcousticProcessor.ts';

export interface VehicleEmitterDiagnosticEntry {
  carIndex: number;
  isSelf: boolean;
  isAlive: boolean;
  audible: boolean;
  isBoosting: boolean;
  isSupersonic: boolean;
  boostLoopActive: boolean;
  boostGain: number;
  supersonicLoopActive: boolean;
  supersonicGain: number;
  activeOneShots: number;
}

export interface EngineSynthDiagnosticEntry {
  carIndex: number;
  packId: string;
  spatial: boolean;
  spatialEnabled: boolean;
  spatialTargetGain: number | null;
  active: boolean;
  alive: boolean;
  audible: boolean;
  engineVolume: number;
  outputGain: number;
  rpm: number;
  gear: number;
  neutral: boolean;
  direction: string;
}

export interface SlotPoolDiagnosticEntry {
  id: number;
  inUse: boolean;
  mode: string;
  priority: number;
  gain: number;
  ageMs: number;
}

export interface ContinuousLoopsDiagnosticSnapshot {
  initialized: boolean;
  isPlaying: boolean;
  boostLoopSourceActive: boolean;
  boostGain: number;
  supersonicLoopSourceActive: boolean;
  supersonicGain: number;
  ballRollingSourceActive: boolean;
  ballRollingGain: number;
  ballFlyingSourceActive: boolean;
  ballFlyingGain: number;
}

export interface AudioDiagnosticReport {
  timestamp: string;
  verdict: {
    code: string;
    summary: string;
    anomalies: string[];
  };
  audioContext: {
    exists: boolean;
    state: string;
    currentTime: number;
    clockAdvancing: boolean;
    sampleRate: number;
    baseLatency: number | null;
    outputLatency: number | null;
    destinationMaxChannels: number | null;
  };
  masterMixer: {
    active: boolean;
    connected: boolean;
    configuredVolume: number;
    outputGainValue: number;
    realtimeOutput: AudioMixerOutputMetrics;
    acoustics?: MasterAcousticProcessorSnapshot | null;
  };
  focusAndVisibility: {
    documentHidden: boolean;
    visibilityState: string;
    documentHasFocus: boolean;
    runtimeWindowFocused: boolean;
    continueAudioOnLostFocus: boolean;
  };
  gameAudioState: AudioTelemetryState & {
    engineVolumeConfig: number;
    boostVolumeConfig: number;
    loadedBuffersCount: number;
    totalRegisteredBufferKeys: number;
  };
  slotPool: {
    initialized: boolean;
    isMuted: boolean;
    activeSlots: number;
    maxSlots: number;
    slots: SlotPoolDiagnosticEntry[];
  };
  continuousLoops: ContinuousLoopsDiagnosticSnapshot;
  vehicleEmitters: VehicleEmitterDiagnosticEntry[];
  engineSynths: EngineSynthDiagnosticEntry[];
  spatialListener: {
    hasListener: boolean;
    valid: boolean;
    positionUU: { x: number; y: number; z: number };
  };
  recentLifecycleEvents: AudioLifecycleEventEntry[];
}

export interface AudioRootCauseVerdictInput {
  ctx: AudioContext | null;
  clockAdvancing: boolean;
  masterVol: number;
  masterActive: boolean;
  masterConnected: boolean;
  masterOutputGain: number;
  docHasFocus: boolean;
  docHidden: boolean;
  continueOnBlur: boolean;
  poolMuted: boolean;
  telemetry: AudioTelemetryState;
  outputMetrics: AudioMixerOutputMetrics;
  listenerValid: boolean;
  hasListener: boolean;
  listenerPos: { x: number; y: number; z: number };
  engineSynths: EngineSynthDiagnosticEntry[];
  stateLoopInfo: ContinuousLoopsDiagnosticSnapshot;
  activeSlotCount: number;
}

export function evaluateAudioRootCauseVerdict(input: AudioRootCauseVerdictInput): {
  code: string;
  summary: string;
  anomalies: string[];
} {
  const {
    ctx,
    clockAdvancing,
    masterVol,
    masterActive,
    masterConnected,
    masterOutputGain,
    docHasFocus,
    docHidden,
    continueOnBlur,
    poolMuted,
    telemetry,
    outputMetrics,
    listenerValid,
    hasListener,
    listenerPos,
    engineSynths,
    stateLoopInfo,
    activeSlotCount,
  } = input;

  const anomalies: string[] = [];
  let code = 'HEALTHY_ACTIVE';
  let summary = 'Web Audio engine is healthy and actively outputting audio signals (RMS > 0).';

  if (!ctx) {
    code = 'NO_AUDIO_CONTEXT';
    summary = 'AudioContext is not yet initialized or Web Audio API is unsupported by the browser.';
    anomalies.push(summary);
  } else if ((ctx.state as string) === 'suspended' || (ctx.state as string) === 'interrupted') {
    code = 'BROWSER_CONTEXT_SUSPENDED';
    summary = `Browser blocked audio: AudioContext.state is "${ctx.state}" (likely autoplay policy or suspended audio focus; click page or Force Resume to unlock).`;
    anomalies.push(summary);
  } else if (ctx.state === 'closed') {
    code = 'BROWSER_CONTEXT_CLOSED';
    summary = 'AudioContext is closed and cannot output any sound.';
    anomalies.push(summary);
  } else if (!clockAdvancing) {
    code = 'BROWSER_AUDIO_CLOCK_STALLED';
    summary =
      'Browser/audio driver stall: AudioContext.state is "running", but hardware currentTime stopped advancing.';
    anomalies.push(summary);
  }

  if (masterVol <= 0.001) {
    anomalies.push('Configuration mute: Master Volume is set to 0%.');
    if (code === 'HEALTHY_ACTIVE') {
      code = 'CONFIG_MASTER_VOLUME_ZERO';
      summary = 'Configuration mute: Master Volume is 0%, muting all audio output gain.';
    }
  }

  if (
    subsystemState.masterMixer &&
    (!masterActive || !masterConnected || masterOutputGain <= 0.0001)
  ) {
    const reason =
      (!docHasFocus || docHidden) && !continueOnBlur
        ? 'Window lost focus and Play Audio in Background is disabled'
        : 'MasterMixer is not in an active connected state';
    anomalies.push(
      `MasterMixer muted: master.active=${masterActive}, master.connected=${masterConnected}, gain=${masterOutputGain.toFixed(4)} (${reason}).`
    );
    if (code === 'HEALTHY_ACTIVE') {
      code = 'MASTER_MIXER_DISCONNECTED_OR_MUTED';
      summary = `MasterMixer muted: gain=${masterOutputGain.toFixed(4)} / connected=${masterConnected} (${reason}).`;
    }
  }

  if (poolMuted) {
    anomalies.push(
      'SlotPool muted: AudioSlotPool.isMuted = true, blocking one-shot collision/signal sounds.'
    );
    if (code === 'HEALTHY_ACTIVE') {
      code = 'SLOT_POOL_MUTED';
      summary = 'AudioSlotPool.isMuted is true (typically triggered by window blur mute).';
    }
  }

  if (telemetry.hasBlockingOverlay) {
    anomalies.push(
      `UI overlay mute: Blocking overlay open (${(telemetry.blockingOverlays || []).join(', ') || 'Menu Open'}), muting continuous engine synths and loops.`
    );
    if (code === 'HEALTHY_ACTIVE' && outputMetrics.silent) {
      code = 'GAME_STATE_OVERLAY_MUTED';
      summary =
        'Game state mute: Menu/overlay is open (hasBlockingOverlay=true); continuous engine and vehicle loops are paused until returning to match.';
    }
  } else if (telemetry.updatedAt > 0 && !telemetry.isAudibleActive) {
    anomalies.push(
      `Match not audible: isMatchActive=${telemetry.isMatchActive}, isHidden=${telemetry.isHidden}, continueOnBlur=${telemetry.continueOnBlur} -> isAudibleActive=false.`
    );
    if (code === 'HEALTHY_ACTIVE' && outputMetrics.silent) {
      code = 'GAME_STATE_NOT_AUDIBLE';
      summary =
        'Game state mute: Match is inactive or window is muted on blur (isAudibleActive=false).';
    }
  }

  if (!listenerValid) {
    anomalies.push(
      `Spatial listener invalid: hasListener=${hasListener}, pos=(${listenerPos.x}, ${listenerPos.y}, ${listenerPos.z}).`
    );
  }

  if ((outputMetrics.nanCount ?? 0) > 0) {
    anomalies.push(
      `DSP NaN anomaly: Master output detected ${outputMetrics.nanCount} NaN/Infinity samples!`
    );
    code = 'DSP_NAN_CORRUPTION';
    summary = 'DSP pipeline error: MasterMixer output contains NaN/Infinity samples.';
  }

  if (code === 'HEALTHY_ACTIVE' && outputMetrics.silent) {
    const anySynthActive = engineSynths.some((s) => s.active && s.outputGain > 0.001);
    const anyLoopActive =
      stateLoopInfo.boostGain > 0.001 ||
      stateLoopInfo.supersonicGain > 0.001 ||
      stateLoopInfo.ballRollingGain > 0.001 ||
      stateLoopInfo.ballFlyingGain > 0.001 ||
      activeSlotCount > 0;
    if (anySynthActive || anyLoopActive) {
      code = 'CLIENT_GHOST_PLAYBACK';
      summary =
        'Client/Browser playback anomaly: Audio nodes are active with Gain > 0, but Master bus Analyser reads silence. Click Force Resume / Rebuild to recover.';
    } else {
      code = 'HEALTHY_IDLE_SILENT';
      summary =
        'Web Audio pipeline is healthy and ready (AudioContext running, MasterMixer connected), currently idle in silent standby.';
    }
  } else if (code === 'HEALTHY_ACTIVE' && !outputMetrics.silent) {
    summary = `Web Audio is actively outputting sound (Realtime Level: ${outputMetrics.dbfs} dBFS, Peak: ${outputMetrics.peak}). If no sound is heard, check browser tab mute or OS output device.`;
  }

  return { code, summary, anomalies };
}

/**
 * Plays a clean 440Hz -> 660Hz two-tone diagnostic beep through the MasterMixer
 * (and optionally directly to ctx.destination if master is muted) and measures actual RMS output.
 */
export async function playAudioDiagnosticTestTone({
  bypassMixer = false,
}: { bypassMixer?: boolean } = {}) {
  const ctx = getAudioContext();
  if (!ctx) {
    console.error('[AudioDebug:TestTone] Cannot play test tone: AudioContext unavailable.');
    return { ok: false, reason: 'No AudioContext' };
  }

  recordAudioLifecycleEvent('diagnostic_test_tone_start', { bypassMixer });

  if ((ctx.state as string) === 'suspended' || (ctx.state as string) === 'interrupted') {
    try {
      await ctx.resume();
    } catch (e) {
      console.warn('[AudioDebug:TestTone] ctx.resume() failed:', e);
    }
  }

  const master = subsystemState.masterMixer;
  if (master && !bypassMixer) {
    master.setActive(true);
    master.apply();
  }

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(440, now);
  osc.frequency.setValueAtTime(660, now + 0.12);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
  gain.gain.setValueAtTime(0.25, now + 0.22);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

  osc.connect(gain);
  const targetDest = !bypassMixer && master?.input ? master.input : ctx.destination;
  gain.connect(targetDest);

  osc.start(now);
  osc.stop(now + 0.32);

  await new Promise((resolve) => setTimeout(resolve, 100));
  const metricsMidTone = master
    ? master.sampleOutputMetrics()
    : { rms: 0, peak: 0, dbfs: -120, silent: true };
  const result = {
    ok: ctx.state === 'running' && (!metricsMidTone.silent || bypassMixer),
    contextState: ctx.state,
    bypassMixer,
    masterConnected: Boolean(master?.connected),
    masterGain: master?.output?.gain?.value ?? null,
    measuredOutput: metricsMidTone,
  };

  console.info('[AudioDebug:TestTone] 440Hz/660Hz Probe Result:', result);
  return result;
}

/**
 * Forces AudioContext resume, unmutes AudioSlotPool, reconnects MasterMixer,
 * and restarts continuous state loops. Useful for recovering from stuck audio states.
 */
export async function forceAudioRecovery(
  dumpToConsole: ((reason?: string) => AudioDiagnosticReport) | null = null
) {
  const ctx = getAudioContext();
  if (!ctx) return { ok: false, reason: 'No AudioContext' };

  recordAudioLifecycleEvent('force_audio_recovery_invoked');

  try {
    if ((ctx.state as string) === 'suspended' || (ctx.state as string) === 'interrupted') {
      await ctx.resume();
    }
  } catch (e) {
    console.warn('[AudioDebug:ForceRecovery] ctx.resume() error:', e);
  }

  const master = subsystemState.masterMixer;
  if (master) {
    master.setVolume(audioConfig.get('masterVolume') ?? 1.0);
    master.setActive(true);
    master.apply();
  }

  const pool = getAudioSlotPool();
  if (pool) {
    pool.isMuted = false;
  }

  subsystemState.audioEngine?.ballEngine?._startLoops?.();
  if (subsystemState.audioEngine?.vehicleManager?.emitters) {
    for (const emitter of subsystemState.audioEngine.vehicleManager.emitters.values()) {
      emitter._startLoops?.();
    }
  }

  const report =
    typeof dumpToConsole === 'function' ? dumpToConsole('After Force Audio Recovery') : null;
  return {
    ok: ctx.state === 'running' && Boolean(master?.connected),
    report,
  };
}

export class AudioDebugMonitorController {
  collectReport: (() => AudioDiagnosticReport) | undefined;
  dumpToConsole: ((reason?: string) => AudioDiagnosticReport) | undefined;
  enabled: boolean;
  intervalId: ReturnType<typeof setInterval> | null;

  constructor({
    collectReport,
    dumpToConsole,
  }: {
    collectReport?: () => AudioDiagnosticReport;
    dumpToConsole?: (reason?: string) => AudioDiagnosticReport;
  } = {}) {
    this.intervalId = null;
    this.enabled = false;
    this.collectReport = collectReport;
    this.dumpToConsole = dumpToConsole;
  }

  setEnabled(enabled: boolean) {
    const next = Boolean(enabled);
    if (this.enabled === next) return;
    this.enabled = next;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.enabled && typeof window !== 'undefined') {
      console.info(
        '%c[AudioDebug] Audio Debug Mode ENABLED — Periodic telemetry & anomaly detector active (window.__audioDebug available).',
        'color:#10b981;font-weight:bold;'
      );
      this.dumpToConsole?.('Audio Debug Mode Enabled');
      this.intervalId = setInterval(() => {
        if (!this.enabled || typeof this.collectReport !== 'function') return;
        const r = this.collectReport();
        const isSilentAnomaly =
          r.gameAudioState.isAudibleActive &&
          r.masterMixer.realtimeOutput.silent &&
          r.engineSynths.some((s) => s.active && s.outputGain > 0.005);

        if (!r.verdict.code.startsWith('HEALTHY') || isSilentAnomaly) {
          console.warn(
            `[AudioDebug:Monitor] Anomaly detected (${r.verdict.code}): ${r.verdict.summary}`,
            {
              ctxState: r.audioContext.state,
              ctxTime: r.audioContext.currentTime,
              masterGain: r.masterMixer.outputGainValue,
              masterConnected: r.masterMixer.connected,
              poolMuted: r.slotPool.isMuted,
              rms: r.masterMixer.realtimeOutput.rms,
              dbfs: r.masterMixer.realtimeOutput.dbfs,
            }
          );
        } else {
          console.debug(
            `[AudioDebug:Heartbeat] state=${r.audioContext.state} t=${r.audioContext.currentTime}s | ` +
              `masterGain=${r.masterMixer.outputGainValue} connected=${r.masterMixer.connected} | ` +
              `output=${r.masterMixer.realtimeOutput.dbfs}dBFS (peak=${r.masterMixer.realtimeOutput.peak}) | ` +
              `synths=${r.gameAudioState.activeEngineSynths}/${r.gameAudioState.engineSynthsCount} | ` +
              `poolVoices=${r.slotPool.activeSlots}/${r.slotPool.maxSlots}`
          );
        }
      }, 2500);
    } else if (!this.enabled) {
      console.info('%c[AudioDebug] Audio Debug Mode DISABLED.', 'color:#94a3b8;');
    }
  }
}
