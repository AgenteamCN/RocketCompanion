import { AudioMixer } from './AudioMixer.ts';
import { AudioSlotPool } from './AudioSlotPool.ts';
import { audioConfig } from '../ui-core/config/audioConfig.ts';
import { listenerManager } from './SpatialAudioSource.ts';

export interface AudioTelemetryState {
  updatedAt: number;
  contextCurrentTime: number;
  isMatchActive: boolean;
  hasBlockingOverlay: boolean;
  blockingOverlays: string[];
  continueOnBlur: boolean;
  isHidden: boolean;
  isAudibleActive: boolean;
  activeCar: number;
  effectiveNumCars: number;
  engineSynthsCount: number;
  activeEngineSynths: number;
}

export interface AudioLifecycleEventEntry {
  timeIso: string;
  perfMs: number;
  event: string;
  ctxState: string;
  ctxTime: number;
  masterActive: boolean;
  masterConnected: boolean;
  masterGain: number | null;
  poolMuted: boolean;
  docHidden: boolean;
  docFocus: boolean;
  [key: string]: unknown;
}

export interface SignalAudioActiveModePort {
  id?: string;
  rewinderController?: { isScrubbing?: boolean } | null;
  directorPreview?: { isReplayActive?: boolean } | null;
  replaySession?: { isReplayActive?: boolean } | null;
  isGoalReplayActive?(): boolean;
  goalReplayPhase?: string;
}

export interface SignalAudioRuntimePort {
  replayViewerController?: { isActive?: boolean } | null;
  modeManager?: {
    getActiveMode?: () => SignalAudioActiveModePort | null;
    [key: string]: unknown;
  } | null;
  match?: { state?: { phase?: string } | null } | null;
  isGoalReplayCameraOverrideActive?: (() => boolean) | unknown;
  networkReconciler?: { replayPlaybackMode?: boolean } | null;
}

export interface AudioEngineSynthSlotPort {
  synth?: {
    packId?: string;
    active?: boolean;
    alive?: boolean;
    audible?: boolean;
    engineVolume?: number;
    outputNode?: { gain?: { value?: number } } | null;
    currentRPM?: number;
    currentGear?: number;
    isNeutral?: boolean;
    driveDirection?: string;
  } | null;
  spatial?: unknown;
  spatialBus?: {
    enabled?: boolean;
    targetGain?: number;
  } | null;
}

export interface AudioRuntimePort extends SignalAudioRuntimePort {
  engineSynths?: AudioEngineSynthSlotPort[];
  isWindowFocused?: boolean;
}

export interface AudioVehicleEmitterDiagnosticPort {
  isSelf?: boolean;
  isAlive?: boolean;
  audible?: boolean;
  isBoosting?: boolean;
  isSupersonic?: boolean;
  boostLoopSource?: AudioBufferSourceNode | null;
  boostLoopGain?: GainNode | null;
  supersonicLoopSource?: AudioBufferSourceNode | null;
  supersonicLoopGain?: GainNode | null;
  activeSources?: Set<AudioBufferSourceNode>;
  _startLoops?: () => void;
}

export interface AudioEnginePort {
  ballEngine?: {
    initialized?: boolean;
    rollingSource?: AudioBufferSourceNode | null;
    rollingGain?: GainNode | null;
    flyingSource?: AudioBufferSourceNode | null;
    flyingGain?: GainNode | null;
    _startLoops?: () => void;
  } | null;
  vehicleManager?: {
    activeCarIndex?: number;
    emitters?: Map<number, AudioVehicleEmitterDiagnosticPort>;
  } | null;
  stadiumSpatialEngine?: {
    handleWindowFocusChange?: (hasFocus: boolean, continueOnBlur: boolean) => void;
  } | null;
  silenceAll?: () => void;
  previewBoostVariation?: (variationId?: string, phase?: string) => void;
}

interface WindowWithWebkitAudioContext extends Window {
  webkitAudioContext?: typeof AudioContext;
}

export type AudioContextWithLatency = AudioContext;

export class AudioSubsystemStateStore {
  context: AudioContext | null = null;
  masterMixer: AudioMixer | null = null;
  slotPool: AudioSlotPool | null = null;
  buffers: Map<string, AudioBuffer | null> = new Map();
  loading: Promise<void> | null = null;
  loaded = false;
  audioEngine: AudioEnginePort | null = null;
  runtime: AudioRuntimePort | null = null;
  lastTelemetry: AudioTelemetryState = {
    updatedAt: 0,
    contextCurrentTime: 0,
    isMatchActive: false,
    hasBlockingOverlay: false,
    blockingOverlays: [],
    continueOnBlur: false,
    isHidden: false,
    isAudibleActive: false,
    activeCar: 0,
    effectiveNumCars: 0,
    engineSynthsCount: 0,
    activeEngineSynths: 0,
  };
  lifecycleHistory: AudioLifecycleEventEntry[] = [];
}

export type AudioSubsystemState = AudioSubsystemStateStore;

export const subsystemState = new AudioSubsystemStateStore();

export function recordAudioLifecycleEvent(
  eventType: string,
  details: Record<string, unknown> = {}
): AudioLifecycleEventEntry {
  const ctx = subsystemState.context;
  const entry: AudioLifecycleEventEntry = {
    timeIso: new Date().toISOString().slice(11, 23),
    perfMs: Math.round(typeof performance !== 'undefined' ? performance.now() : 0),
    event: eventType,
    ctxState: ctx ? ctx.state : 'uninitialized',
    ctxTime: ctx ? Number(ctx.currentTime.toFixed(3)) : 0,
    masterActive: Boolean(subsystemState.masterMixer?.active),
    masterConnected: Boolean(subsystemState.masterMixer?.connected),
    masterGain:
      subsystemState.masterMixer?.output?.gain?.value !== undefined
        ? Number(subsystemState.masterMixer.output.gain.value.toFixed(4))
        : null,
    poolMuted: Boolean(subsystemState.slotPool?.isMuted),
    docHidden: typeof document !== 'undefined' ? Boolean(document.hidden) : false,
    docFocus:
      typeof document !== 'undefined' && typeof document.hasFocus === 'function'
        ? Boolean(document.hasFocus())
        : true,
    ...details,
  };
  subsystemState.lifecycleHistory.push(entry);
  if (subsystemState.lifecycleHistory.length > 40) {
    subsystemState.lifecycleHistory.shift();
  }
  if (audioConfig.get('audioDebugMode')) {
    console.info(`[AudioDebug:Lifecycle] ${eventType}`, entry);
  }
  return entry;
}

export function registerAudioEngine(engine: AudioEnginePort | null): void {
  subsystemState.audioEngine = engine;
}

export function registerAudioRuntime(runtime: AudioRuntimePort | null): void {
  subsystemState.runtime = runtime;
}

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!subsystemState.context) {
    const win = window as WindowWithWebkitAudioContext;
    const AudioContextClass = window.AudioContext || win.webkitAudioContext;
    if (!AudioContextClass) return null;
    let ctx: AudioContext;
    try {
      ctx = new AudioContextClass({ latencyHint: 0 });
    } catch (_) {
      console.warn(
        '[AudioArchitecture:getAudioContext] Failed latencyHint 0, fallback to interactive:',
        _
      );
      try {
        ctx = new AudioContextClass({ latencyHint: 'interactive' });
      } catch (__) {
        console.warn(
          '[AudioArchitecture:getAudioContext] Failed latencyHint interactive, fallback to default:',
          __
        );
        ctx = new AudioContextClass();
      }
    }
    subsystemState.context = ctx;
    listenerManager.setContext(ctx);

    const master = new AudioMixer(ctx);
    master.setVolume(audioConfig.get('masterVolume'));
    master.applyAcousticConfig(audioConfig.config, true);
    master.setActive(true);
    subsystemState.masterMixer = master;

    subsystemState.slotPool = new AudioSlotPool(ctx, 16, master.input);
    subsystemState.slotPool.init(master.input);

    const ctxWithLatency = ctx as AudioContextWithLatency;
    recordAudioLifecycleEvent('context_created', {
      sampleRate: ctx.sampleRate,
      baseLatency: ctxWithLatency.baseLatency ?? null,
    });

    const onAudioReady = () => {
      if (ctx.state === 'running') {
        master.setActive(true);
        master.apply();
        subsystemState.audioEngine?.ballEngine?._startLoops?.();
        recordAudioLifecycleEvent('audio_ready_running');
      }
    };

    // User interaction audio unlock
    const unlock = (evt?: Event) => {
      if ((ctx.state as string) === 'suspended' || (ctx.state as string) === 'interrupted') {
        recordAudioLifecycleEvent('user_unlock_attempt', { trigger: evt?.type || 'gesture' });
        ctx
          .resume()
          .then(onAudioReady)
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            recordAudioLifecycleEvent('user_unlock_failed', { error: message });
            console.warn('[AudioArchitecture] AudioContext unlock resume failed/blocked:', err);
          });
      } else if (ctx.state === 'running') {
        if (!master.active || !master.connected) {
          onAudioReady();
        }
      }
    };
    window.addEventListener('pointerdown', unlock, { passive: true, capture: true });
    window.addEventListener('keydown', unlock, { passive: true, capture: true });
    window.addEventListener('touchstart', unlock, { passive: true, capture: true });
    window.addEventListener('click', unlock, { passive: true, capture: true });

    if (typeof document !== 'undefined') {
      document.addEventListener('pointerdown', unlock, { passive: true, capture: true });
      document.addEventListener('keydown', unlock, { passive: true, capture: true });
      document.addEventListener('touchstart', unlock, { passive: true, capture: true });
      document.addEventListener('click', unlock, { passive: true, capture: true });
    }

    if (typeof ctx.addEventListener === 'function') {
      ctx.addEventListener('statechange', () => {
        recordAudioLifecycleEvent('ctx_statechange', { newState: ctx.state });
        if (ctx.state === 'running') {
          onAudioReady();
        } else if (
          ((ctx.state as string) === 'suspended' || (ctx.state as string) === 'interrupted') &&
          typeof document !== 'undefined' &&
          !document.hidden &&
          (document.hasFocus?.() ?? true)
        ) {
          const continueOnBlur = audioConfig.get('continueAudioOnLostFocus');
          if (continueOnBlur || !document.hidden) {
            ctx
              .resume()
              .then(onAudioReady)
              .catch((err: unknown) => {
                const message = err instanceof Error ? err.message : String(err);
                recordAudioLifecycleEvent('statechange_auto_resume_failed', { error: message });
              });
          }
        }
      });
    }

    // Focus / Visibility shielding
    let isWindowCurrentlyFocused =
      typeof document !== 'undefined'
        ? !document.hidden && (typeof document.hasFocus === 'function' ? document.hasFocus() : true)
        : true;

    const handleFocus = (hasFocus: boolean, source: string = 'focus') => {
      const effectiveFocus =
        Boolean(hasFocus) && (typeof document === 'undefined' || !document.hidden);
      const wasFocused = isWindowCurrentlyFocused;
      isWindowCurrentlyFocused = effectiveFocus;

      const continueOnBlur = audioConfig.get('continueAudioOnLostFocus');
      recordAudioLifecycleEvent(effectiveFocus ? 'window_focus_regained' : 'window_focus_lost', {
        source,
        continueOnBlur,
        wasFocused,
      });

      subsystemState.audioEngine?.stadiumSpatialEngine?.handleWindowFocusChange?.(
        effectiveFocus,
        Boolean(continueOnBlur)
      );

      if (continueOnBlur) {
        if (subsystemState.slotPool) subsystemState.slotPool.isMuted = false;
        master.setActive(true);
        if ((ctx.state as string) === 'suspended' || (ctx.state as string) === 'interrupted') {
          ctx
            .resume()
            .then(onAudioReady)
            .catch((err) => {
              recordAudioLifecycleEvent('focus_resume_failed', {
                error: err?.message || String(err),
              });
            });
        }
      } else {
        if (!effectiveFocus) {
          master.setActive(false);
          if (subsystemState.slotPool) {
            subsystemState.slotPool.isMuted = true;
            subsystemState.slotPool.silenceAll();
          }
          subsystemState.audioEngine?.silenceAll?.();
        } else {
          // Avoid redundant flush/pop if a duplicate focus event (e.g. visibilitychange + window.focus)
          // fires when the audio output is already active and running.
          if (wasFocused && master.active && master.connected && ctx.state === 'running') {
            return;
          }
          // Regaining focus without background audio permitted:
          // Immediately flush output, unblock buffer reception, and clear all voice slots to avoid audio pops & latency
          master.flush();
          if (subsystemState.slotPool) {
            subsystemState.slotPool.silenceAll();
            subsystemState.slotPool.isMuted = false;
          }
          subsystemState.audioEngine?.silenceAll?.();
          master.setActive(true);
          if ((ctx.state as string) === 'suspended' || (ctx.state as string) === 'interrupted') {
            ctx
              .resume()
              .then(onAudioReady)
              .catch((err) => {
                recordAudioLifecycleEvent('regain_focus_resume_failed', {
                  error: err?.message || String(err),
                });
              });
          } else {
            onAudioReady();
          }
        }
      }
    };
    window.addEventListener('focus', () => handleFocus(true, 'window.focus'));
    window.addEventListener('blur', () => handleFocus(false, 'window.blur'));
    document.addEventListener('visibilitychange', () => {
      handleFocus(!document.hidden, 'document.visibilitychange');
    });
    window.addEventListener('pageshow', () => {
      if (typeof document === 'undefined' || !document.hidden) {
        handleFocus(true, 'window.pageshow');
      }
    });

    audioConfig.subscribe((cfg) => {
      master.setVolume(cfg.masterVolume ?? 1.0);
      master.applyAcousticConfig(cfg);
    });
  }
  return subsystemState.context;
}

export function getMasterAudioInput(): GainNode | null {
  getAudioContext();
  return subsystemState.masterMixer ? subsystemState.masterMixer.input : null;
}

export function getAudioSlotPool(): AudioSlotPool | null {
  getAudioContext();
  return subsystemState.slotPool;
}

export function setAudioSlotPool(pool: AudioSlotPool | null): void {
  subsystemState.slotPool = pool;
}
