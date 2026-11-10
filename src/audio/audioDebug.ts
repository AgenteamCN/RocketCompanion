import { audioConfig, registerAudioDiagnosticsProvider } from '../ui-core/config/audioConfig.ts';
import {
  subsystemState,
  getAudioContext,
  type AudioContextWithLatency,
  type AudioTelemetryState,
} from './audioContext.ts';
import { listenerManager } from './SpatialAudioSource.ts';
import {
  playAudioDiagnosticTestTone,
  forceAudioRecovery as runForceAudioRecovery,
  evaluateAudioRootCauseVerdict,
  AudioDebugMonitorController,
  type AudioDiagnosticReport,
  type VehicleEmitterDiagnosticEntry,
  type EngineSynthDiagnosticEntry,
} from './audioDiagnosticProbes.ts';

export function forceAudioRecovery() {
  return runForceAudioRecovery(dumpAudioDiagnosticsToConsole);
}

let _lastSampledContextTime = -1;
let _lastSampledPerfTime = 0;

/**
 * Collects a full diagnostic snapshot of the Web Audio subsystem, browser state,
 * master mixer, voice slot pool, continuous loops, EMotorSynth, and root-cause analysis.
 */
export function collectAudioDiagnosticReport(): AudioDiagnosticReport {
  const ctx = subsystemState.context || getAudioContext();
  const master = subsystemState.masterMixer;
  const pool = subsystemState.slotPool;
  const engine = subsystemState.audioEngine;
  const runtime = subsystemState.runtime;
  const telemetry: AudioTelemetryState = subsystemState.lastTelemetry;

  const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const ctxTime = ctx ? ctx.currentTime : 0;
  let clockAdvancing = true;
  if (
    _lastSampledPerfTime > 0 &&
    nowPerf - _lastSampledPerfTime > 150 &&
    ctx &&
    ctx.state === 'running'
  ) {
    clockAdvancing = ctxTime - _lastSampledContextTime > 0.001;
  }
  _lastSampledContextTime = ctxTime;
  _lastSampledPerfTime = nowPerf;

  const docHidden = typeof document !== 'undefined' ? Boolean(document.hidden) : false;
  const visibilityState = typeof document !== 'undefined' ? document.visibilityState : 'unknown';
  const docHasFocus =
    typeof document !== 'undefined' && typeof document.hasFocus === 'function'
      ? Boolean(document.hasFocus())
      : true;

  const outputMetrics = master
    ? master.sampleOutputMetrics()
    : { rms: 0, peak: 0, dbfs: -120, silent: true };

  // Inspect SlotPool
  const slotsSummary =
    pool && Array.isArray(pool.slots)
      ? pool.slots.map((s) => ({
          id: s.id,
          inUse: Boolean(s.inUse),
          mode: s.currentMode || 'none',
          priority: s.priority,
          gain:
            s.gainNode?.gain?.value !== undefined ? Number(s.gainNode.gain.value.toFixed(4)) : 0,
          ageMs: s.inUse && s.startTime > 0 ? Math.round(nowPerf - s.startTime) : 0,
        }))
      : [];
  const activeSlotCount = slotsSummary.filter((s) => s.inUse).length;

  // Inspect BallEmitter & Active Vehicle Emitter
  const ballEmit = engine?.ballEngine;
  const activeCarIdx = engine?.vehicleManager?.activeCarIndex ?? 0;
  const activeEmitter = engine?.vehicleManager?.emitters?.get(activeCarIdx);
  const stateLoopInfo = {
    initialized: Boolean(ballEmit?.initialized),
    isPlaying: Boolean(
      ballEmit?.rollingSource ||
      ballEmit?.flyingSource ||
      activeEmitter?.boostLoopSource ||
      activeEmitter?.supersonicLoopSource
    ),
    boostLoopSourceActive: Boolean(activeEmitter?.boostLoopSource),
    boostGain:
      activeEmitter?.boostLoopGain?.gain?.value !== undefined
        ? Number(activeEmitter.boostLoopGain.gain.value.toFixed(4))
        : 0,
    supersonicLoopSourceActive: Boolean(activeEmitter?.supersonicLoopSource),
    supersonicGain:
      activeEmitter?.supersonicLoopGain?.gain?.value !== undefined
        ? Number(activeEmitter.supersonicLoopGain.gain.value.toFixed(4))
        : 0,
    ballRollingSourceActive: Boolean(ballEmit?.rollingSource),
    ballRollingGain:
      ballEmit?.rollingGain?.gain?.value !== undefined
        ? Number(ballEmit.rollingGain.gain.value.toFixed(4))
        : 0,
    ballFlyingSourceActive: Boolean(ballEmit?.flyingSource),
    ballFlyingGain:
      ballEmit?.flyingGain?.gain?.value !== undefined
        ? Number(ballEmit.flyingGain.gain.value.toFixed(4))
        : 0,
  };

  // Inspect Vehicle Emitters
  const vehicleEmitters: VehicleEmitterDiagnosticEntry[] = [];
  if (engine?.vehicleManager?.emitters) {
    for (const [carIdx, em] of engine.vehicleManager.emitters.entries()) {
      vehicleEmitters.push({
        carIndex: carIdx,
        isSelf: Boolean(em.isSelf),
        isAlive: Boolean(em.isAlive),
        audible: Boolean(em.audible),
        isBoosting: Boolean(em.isBoosting),
        isSupersonic: Boolean(em.isSupersonic),
        boostLoopActive: Boolean(em.boostLoopSource),
        boostGain:
          em.boostLoopGain?.gain?.value !== undefined
            ? Number(em.boostLoopGain.gain.value.toFixed(4))
            : 0,
        supersonicLoopActive: Boolean(em.supersonicLoopSource),
        supersonicGain:
          em.supersonicLoopGain?.gain?.value !== undefined
            ? Number(em.supersonicLoopGain.gain.value.toFixed(4))
            : 0,
        activeOneShots: em.activeSources ? em.activeSources.size : 0,
      });
    }
  }

  // Inspect TurtleModemEngineSynths
  const engineSynths: EngineSynthDiagnosticEntry[] = [];
  const synthsList = Array.isArray(runtime?.engineSynths) ? runtime.engineSynths : [];
  for (let i = 0; i < synthsList.length; i++) {
    const entry = synthsList[i];
    const s = entry?.synth;
    engineSynths.push({
      carIndex: i,
      packId: s?.packId || 'turtle_modem',
      spatial: Boolean(entry?.spatial),
      spatialEnabled: Boolean(entry?.spatialBus?.enabled),
      spatialTargetGain:
        entry?.spatialBus?.targetGain !== undefined
          ? Number(entry.spatialBus.targetGain.toFixed(4))
          : null,
      active: Boolean(s?.active),
      alive: Boolean(s?.alive),
      audible: Boolean(s?.audible),
      engineVolume: s?.engineVolume !== undefined ? Number(s.engineVolume.toFixed(4)) : 0,
      outputGain:
        s?.outputNode?.gain?.value !== undefined ? Number(s.outputNode.gain.value.toFixed(4)) : 0,
      rpm: s?.currentRPM !== undefined ? Math.round(s.currentRPM) : 0,
      gear: s?.currentGear ?? 1,
      neutral: Boolean(s?.isNeutral),
      direction: s?.driveDirection || 'stopped',
    });
  }

  // Inspect Listener
  const listenerPos = listenerManager?.position || { x: 0, y: 0, z: 0 };
  const listenerValid =
    Boolean(listenerManager?.hasListener) &&
    Number.isFinite(listenerPos.x) &&
    Number.isFinite(listenerPos.y) &&
    Number.isFinite(listenerPos.z);

  // Loaded Buffers count
  let loadedBuffersCount = 0;
  if (subsystemState.buffers) {
    for (const v of subsystemState.buffers.values()) {
      if (v) loadedBuffersCount++;
    }
  }

  const masterVol = Number(audioConfig.get('masterVolume') ?? 1.0);
  const engineVol = Number(audioConfig.get('engineVolume') ?? 0.8);
  const continueOnBlur = Boolean(audioConfig.get('continueAudioOnLostFocus'));
  const masterOutputGain = master?.output?.gain?.value ?? 0;

  const verdict = evaluateAudioRootCauseVerdict({
    ctx,
    clockAdvancing,
    masterVol,
    masterActive: Boolean(master?.active),
    masterConnected: Boolean(master?.connected),
    masterOutputGain,
    docHasFocus,
    docHidden,
    continueOnBlur,
    poolMuted: Boolean(pool?.isMuted),
    telemetry,
    outputMetrics,
    listenerValid,
    hasListener: Boolean(listenerManager?.hasListener),
    listenerPos,
    engineSynths,
    stateLoopInfo,
    activeSlotCount,
  });

  const ctxWithLatency = ctx as AudioContextWithLatency | null;

  return {
    timestamp: new Date().toISOString(),
    verdict,
    audioContext: {
      exists: Boolean(ctx),
      state: ctx ? ctx.state : 'none',
      currentTime: ctx ? Number(ctx.currentTime.toFixed(3)) : 0,
      clockAdvancing,
      sampleRate: ctx ? ctx.sampleRate : 0,
      baseLatency: ctxWithLatency?.baseLatency ?? null,
      outputLatency: ctxWithLatency?.outputLatency ?? null,
      destinationMaxChannels: ctx?.destination?.maxChannelCount ?? null,
    },
    masterMixer: {
      active: Boolean(master?.active),
      connected: Boolean(master?.connected),
      configuredVolume: masterVol,
      outputGainValue: Number(masterOutputGain.toFixed(4)),
      realtimeOutput: outputMetrics,
      acoustics: master ? master.getAcousticSnapshot() : null,
    },
    focusAndVisibility: {
      documentHidden: docHidden,
      visibilityState,
      documentHasFocus: docHasFocus,
      runtimeWindowFocused: Boolean(runtime?.isWindowFocused ?? docHasFocus),
      continueAudioOnLostFocus: continueOnBlur,
    },
    gameAudioState: {
      ...telemetry,
      engineVolumeConfig: engineVol,
      boostVolumeConfig: Number(audioConfig.get('boostVolume') ?? 0.8),
      loadedBuffersCount,
      totalRegisteredBufferKeys: subsystemState.buffers ? subsystemState.buffers.size : 0,
    },
    slotPool: {
      initialized: Boolean(pool?._initialized),
      isMuted: Boolean(pool?.isMuted),
      activeSlots: activeSlotCount,
      maxSlots: pool?.maxSlots ?? 10,
      slots: slotsSummary,
    },
    continuousLoops: stateLoopInfo,
    vehicleEmitters,
    engineSynths,
    spatialListener: {
      hasListener: Boolean(listenerManager?.hasListener),
      valid: listenerValid,
      positionUU: {
        x: Number((listenerPos.x || 0).toFixed(1)),
        y: Number((listenerPos.y || 0).toFixed(1)),
        z: Number((listenerPos.z || 0).toFixed(1)),
      },
    },
    recentLifecycleEvents: subsystemState.lifecycleHistory.slice(-15),
  };
}

/**
 * Formats and prints the full Audio Diagnostic Report to the browser DevTools Console.
 */
export function dumpAudioDiagnosticsToConsole(
  reason: string = 'Manual Diagnostic Trigger'
): AudioDiagnosticReport {
  const report = collectAudioDiagnosticReport();
  const styleHeader = 'color:#38bdf8;font-weight:bold;font-size:12px;';
  const styleVerdict = report.verdict.code.startsWith('HEALTHY')
    ? 'color:#10b981;font-weight:bold;'
    : 'color:#f59e0b;font-weight:bold;';

  console.group(
    `%c[AudioDebug] Diagnostic Snapshot — ${reason} (${report.timestamp})`,
    styleHeader
  );
  console.log(`%c[Verdict] (${report.verdict.code}): ${report.verdict.summary}`, styleVerdict);

  if (report.verdict.anomalies.length > 0) {
    console.warn('[Detected Anomalies]:', report.verdict.anomalies);
  }

  console.log('[1. Web AudioContext & Master Mixer]:', {
    contextState: report.audioContext.state,
    currentTime: report.audioContext.currentTime,
    clockAdvancing: report.audioContext.clockAdvancing,
    sampleRate: report.audioContext.sampleRate,
    baseLatency: report.audioContext.baseLatency,
    outputLatency: report.audioContext.outputLatency,
    masterActive: report.masterMixer.active,
    masterConnected: report.masterMixer.connected,
    masterGainValue: report.masterMixer.outputGainValue,
    realtimeRMS: report.masterMixer.realtimeOutput.rms,
    realtimePeak: report.masterMixer.realtimeOutput.peak,
    realtimeDbFS: `${report.masterMixer.realtimeOutput.dbfs} dBFS`,
    isOutputSilent: report.masterMixer.realtimeOutput.silent,
  });

  console.log('[2. Focus, Visibility & Game Audibility Gate]:', {
    ...report.focusAndVisibility,
    isMatchActive: report.gameAudioState.isMatchActive,
    hasBlockingOverlay: report.gameAudioState.hasBlockingOverlay,
    blockingOverlays: report.gameAudioState.blockingOverlays,
    isAudibleActive: report.gameAudioState.isAudibleActive,
    loadedBuffers: `${report.gameAudioState.loadedBuffersCount}/${report.gameAudioState.totalRegisteredBufferKeys}`,
  });

  console.log('[3. Continuous Loops (Ball / Boost / Supersonic) & Spatial Listener]:', {
    loops: report.continuousLoops,
    listener: report.spatialListener,
    slotPoolMuted: report.slotPool.isMuted,
    slotPoolActiveVoices: `${report.slotPool.activeSlots}/${report.slotPool.maxSlots}`,
  });

  if (report.engineSynths.length > 0) {
    console.table(report.engineSynths);
  }
  if (report.vehicleEmitters.length > 0) {
    console.table(report.vehicleEmitters);
  }
  if (report.recentLifecycleEvents.length > 0) {
    console.log('[4. Recent Audio Lifecycle Events]:');
    console.table(report.recentLifecycleEvents);
  }
  console.groupEnd();

  return report;
}

export const audioDebugMonitor = new AudioDebugMonitorController({
  collectReport: collectAudioDiagnosticReport,
  dumpToConsole: dumpAudioDiagnosticsToConsole,
});

registerAudioDiagnosticsProvider({
  collectReport: collectAudioDiagnosticReport,
  dumpToConsole: dumpAudioDiagnosticsToConsole,
  playTestTone: playAudioDiagnosticTestTone,
  forceRecovery: forceAudioRecovery,
  previewBoostVariation: (variationId, phase) =>
    subsystemState.audioEngine?.previewBoostVariation?.(variationId, phase),
});

interface WindowWithAudioDebug extends Window {
  __audioDebug?: {
    getReport: typeof collectAudioDiagnosticReport;
    dump: () => AudioDiagnosticReport;
    testTone: typeof playAudioDiagnosticTestTone;
    recover: typeof forceAudioRecovery;
    enableMonitor: (on?: boolean) => void;
  };
}

if (typeof window !== 'undefined') {
  (window as WindowWithAudioDebug).__audioDebug = {
    getReport: collectAudioDiagnosticReport,
    dump: () => dumpAudioDiagnosticsToConsole('window.__audioDebug.dump()'),
    testTone: playAudioDiagnosticTestTone,
    recover: forceAudioRecovery,
    enableMonitor: (on = true) => {
      audioConfig.set('audioDebugMode', Boolean(on));
      audioDebugMonitor.setEnabled(Boolean(on));
    },
  };
}

audioConfig.subscribe((cfg) => {
  if (cfg && typeof cfg.audioDebugMode === 'boolean') {
    audioDebugMonitor.setEnabled(cfg.audioDebugMode);
  }
});
if (audioConfig.get('audioDebugMode')) {
  audioDebugMonitor.setEnabled(true);
}
