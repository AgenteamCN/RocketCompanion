import { audioConfig } from '../ui-core/config/audioConfig.ts';
import {
  DEFAULT_BGM_SCENE_CONFIG,
  type SpatialAudioTunerConfig,
} from '../ui-core/config/spatialAudioConfig.ts';
import {
  ANTHEM_SPECIFIC_CATEGORIES,
  resolvePlayableAnthemDef,
  type AnthemDef,
} from '../ui-core/config/anthemCatalogConfig.ts';
import {
  useAppStore,
  useHudStore,
  useSpatialAudioStore,
  useStaticTrainingPackStore,
  type SpatialAudioStorePortState,
} from '../game/runtimeUiPort.ts';
import {
  SpatialAudioBusChain,
  TAIL_DRAIN_MIN_GUARD_SEC,
  TAIL_DRAIN_SILENCE_THRESHOLD,
  TAIL_DRAIN_SILENCE_HOLD_SEC,
  TAIL_DRAIN_SAFETY_MARGIN_SEC,
  type SpatialAudioRuntimeContextSnapshot,
} from './SpatialAudioBusChain.ts';

export type AnthemPlaybackMode = 'garage-preview' | 'tuner-audition' | 'goal-replay' | 'goal';
export type AnthemPreviewSource = 'garage-preview' | 'tuner-audition';

export interface BgmTrackEntry {
  id: string;
  title: string;
  volume?: string;
  file?: Blob | File;
}

const SPECIFIC_CATEGORY_ID_SET = new Set(ANTHEM_SPECIFIC_CATEGORIES.map((c) => c.id));

export function readRuntimeAudioSnapshot(): SpatialAudioRuntimeContextSnapshot {
  const appState = useAppStore.getState() || {};
  const hudState = useHudStore.getState() || {};
  const trainingState = useStaticTrainingPackStore.getState() || {};
  return {
    isOpen: Boolean(appState.isOpen ?? appState.isMenuOpen),
    matchMode: appState.matchMode || 'freeplay',
    onlineSession: appState.onlineSession || null,
    matchPhase: hudState.matchPhase || 'playing',
    choreographySignal: hudState.choreographySignal || null,
    replayScorerAnthemId: hudState.replayScorerAnthemId || null,
    staticTrainingReplayType:
      trainingState.liveTelemetry?.replayType ?? trainingState.replayType ?? null,
  };
}

export function isWindowFocusAudioMuted(explicitMuted: boolean): boolean {
  if (explicitMuted) return true;
  if (Boolean(audioConfig.get('continueAudioOnLostFocus'))) return false;
  if (typeof document === 'undefined') return false;
  return (
    Boolean(document.hidden) || (typeof document.hasFocus === 'function' && !document.hasFocus())
  );
}

export function computeBgmVolumeScalar(
  store: Partial<SpatialAudioStorePortState> = useSpatialAudioStore.getState()
): number {
  const baseScalar = Math.max(0, Math.min(1, (Number(store.bgmVolume) ?? 80) / 100));
  const busMult = Number(audioConfig.get('bgmBusVolume') ?? 1.0);
  return baseScalar * Math.max(0, Math.min(5.0, Number.isFinite(busMult) ? busMult : 1.0));
}

export function computeAnthemOutputGain(isActiveOrDraining: boolean, forceActive = false): number {
  if (!forceActive && !isActiveOrDraining) return 0.0;
  const raw = Number(audioConfig.get('anthemVolume') ?? 1.0);
  return Math.max(0, Math.min(5.0, Number.isFinite(raw) ? raw : 1.0));
}

export function evaluateBgmSceneAllowed(
  store: Partial<SpatialAudioStorePortState> = useSpatialAudioStore.getState(),
  appState: Partial<SpatialAudioRuntimeContextSnapshot> = readRuntimeAudioSnapshot()
): boolean {
  const scenes = store.bgmScenes || DEFAULT_BGM_SCENE_CONFIG;
  const matchMode = appState.matchMode;
  const onlineSession = appState.onlineSession as {
    roomId?: string | null;
    roomType?: string | null;
  } | null;

  if (onlineSession?.roomId) {
    return onlineSession.roomType === 'warmup' && matchMode !== 'match'
      ? Boolean(scenes.multiplayerTraining)
      : Boolean(scenes.match);
  }
  if (matchMode === 'online-warmup') return Boolean(scenes.multiplayerTraining);
  if (matchMode === 'match' || matchMode === 'exp-multi-bots') return Boolean(scenes.match);
  if (
    matchMode === 'kickoff-training' ||
    matchMode === 'static-training-pack' ||
    matchMode === 'dev-test-lab'
  ) {
    return Boolean(scenes.singlePlayerTraining);
  }
  return Boolean(scenes.freePlay);
}

export function computeBgmTargetPhase(cfg: Partial<SpatialAudioTunerConfig>): number {
  if (cfg.overrideMode === 'normal') return 0.0;
  if (cfg.overrideMode === 'spatial') return 1.0;
  if (cfg.overrideMode === 'manual') {
    return Math.max(0, Math.min(1, Number(cfg.manualBlend) || 0));
  }
  if (!useSpatialAudioStore.getState().realisticBgmEnabled) return 0.0;
  return readRuntimeAudioSnapshot().isOpen ? 0.0 : 1.0;
}

export function stepLinearFadeEnvelope(
  currentFade: number,
  shouldBeAudible: boolean,
  dt: number,
  bgmFadeDurationSec: number | undefined
): number {
  const targetFade = shouldBeAudible ? 1.0 : 0.0;
  const fadeDuration = Math.max(0.1, Math.min(3.0, Number(bgmFadeDurationSec) || 2.0));
  const maxFadeDelta = dt / fadeDuration;
  if (Math.abs(targetFade - currentFade) <= 1e-4) return targetFade;
  return targetFade > currentFade
    ? Math.min(targetFade, currentFade + maxFadeDelta)
    : Math.max(targetFade, currentFade - maxFadeDelta);
}

export function bindBgmMediaSession(
  track: BgmTrackEntry | null,
  handlers: {
    onPlay: () => void;
    onPause: () => void;
    onPrevious: () => void;
    onNext: () => void;
  }
): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    if (track && typeof window !== 'undefined' && typeof window.MediaMetadata === 'function') {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: track.title,
        artist: track.volume ? `RocketCompanion · Volume ${track.volume}` : 'RocketCompanion BGM',
        album: 'Background Music',
      });
    }
    navigator.mediaSession.setActionHandler('play', handlers.onPlay);
    navigator.mediaSession.setActionHandler('pause', handlers.onPause);
    navigator.mediaSession.setActionHandler('previoustrack', handlers.onPrevious);
    navigator.mediaSession.setActionHandler('nexttrack', handlers.onNext);
  } catch {
    /* ignore unsupported mediaSession actions */
  }
}

export function setBgmMediaSessionPlaybackState(state: MediaSessionPlaybackState): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.playbackState = state;
  } catch {
    /* ignore */
  }
}

export function resolveCatalogAnthemDef(anthemId: string | null | undefined): AnthemDef | null {
  const store = useSpatialAudioStore.getState();
  const trimmed = typeof anthemId === 'string' ? anthemId.trim() : '';
  if (trimmed && SPECIFIC_CATEGORY_ID_SET.has(trimmed)) {
    return resolvePlayableAnthemDef('random', {
      randomScope: 'specific',
      randomCategory: trimmed,
    });
  }
  return resolvePlayableAnthemDef(anthemId, {
    randomScope: store.randomAnthemScope,
    randomCategory: store.randomAnthemCategory,
  });
}

export function fetchAndCacheAnthemBuffer(
  ctx: AudioContext | null,
  anthemDef: AnthemDef | null | undefined,
  bufferCache: Map<string, AudioBuffer>,
  loadingPromises: Map<string, Promise<AudioBuffer | null>>
): Promise<AudioBuffer | null> {
  const fileUrl = anthemDef?.file ? `/${anthemDef.file.replace(/^\//, '')}` : null;
  if (!fileUrl || !anthemDef) return Promise.resolve(null);

  const cached = bufferCache.get(anthemDef.id);
  if (cached) return Promise.resolve(cached);

  const existing = loadingPromises.get(anthemDef.id);
  if (existing) return existing;
  if (!ctx) return Promise.resolve(null);

  const promise = fetch(fileUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.arrayBuffer();
    })
    .then((buf) => ctx.decodeAudioData(buf))
    .then((audioBuf) => {
      bufferCache.set(anthemDef.id, audioBuf);
      loadingPromises.delete(anthemDef.id);
      return audioBuf;
    })
    .catch(() => {
      loadingPromises.delete(anthemDef.id);
      return null;
    });

  loadingPromises.set(anthemDef.id, promise);
  return promise;
}

export function evaluateAnthemTargetPhase(
  cfg: Partial<SpatialAudioTunerConfig>,
  mode: AnthemPlaybackMode | null,
  isTailDraining: boolean,
  drainMinTargetPhase: number
): { targetPhase: number; nextDrainMinTargetPhase: number } {
  if (cfg.overrideMode === 'normal') {
    return { targetPhase: 0.0, nextDrainMinTargetPhase: drainMinTargetPhase };
  }
  if (cfg.overrideMode === 'spatial') {
    return { targetPhase: 1.0, nextDrainMinTargetPhase: drainMinTargetPhase };
  }
  if (cfg.overrideMode === 'manual') {
    const manual = Math.max(0, Math.min(1, Number(cfg.manualBlend) || 0));
    return { targetPhase: manual, nextDrainMinTargetPhase: drainMinTargetPhase };
  }

  const store = useSpatialAudioStore.getState();
  if (mode === 'garage-preview') {
    if (store.isGarageAnthemTabActive) {
      return {
        targetPhase: isTailDraining ? drainMinTargetPhase : 0.0,
        nextDrainMinTargetPhase: drainMinTargetPhase,
      };
    }
    if (isTailDraining) {
      const nextMin = Math.max(drainMinTargetPhase, 1.0);
      return { targetPhase: nextMin, nextDrainMinTargetPhase: nextMin };
    }
    return { targetPhase: 1.0, nextDrainMinTargetPhase: drainMinTargetPhase };
  }

  if (mode === 'tuner-audition' || mode === 'goal-replay' || mode === 'goal') {
    const snapshot = readRuntimeAudioSnapshot();
    const target =
      snapshot.isOpen || Boolean(store.isGoalReplaySkipped) || snapshot.matchPhase !== 'replay'
        ? 1.0
        : 0.0;
    if (isTailDraining) {
      const nextMin = Math.max(drainMinTargetPhase, target);
      return { targetPhase: nextMin, nextDrainMinTargetPhase: nextMin };
    }
    return { targetPhase: target, nextDrainMinTargetPhase: drainMinTargetPhase };
  }

  return { targetPhase: 0.0, nextDrainMinTargetPhase: drainMinTargetPhase };
}

export interface AnthemTailDrainTiming {
  startCtxTime: number;
  startPerfMs: number;
  silentAccumSec: number;
}

export function stepAnthemTailDrainSilenceCheck(
  anthemChain: SpatialAudioBusChain,
  audioContext: AudioContext | null,
  cfg: Partial<SpatialAudioTunerConfig>,
  timing: AnthemTailDrainTiming,
  now: number,
  dt: number,
  targetAnthemU: number,
  linearPhase: number
): boolean {
  const decaySec = Math.max(
    0.4,
    Number(anthemChain.impulseBuffer?.duration) || Number(cfg.decaySec) || 3.0
  );
  const ctxElapsed =
    audioContext?.state === 'running'
      ? Math.max(0, audioContext.currentTime - timing.startCtxTime)
      : -1;
  const elapsedSec = ctxElapsed >= 0 ? ctxElapsed : Math.max(0, (now - timing.startPerfMs) / 1000);

  if (elapsedSec >= decaySec + TAIL_DRAIN_SAFETY_MARGIN_SEC) {
    return true;
  }
  if (elapsedSec < TAIL_DRAIN_MIN_GUARD_SEC || targetAnthemU > linearPhase + 1e-3) {
    timing.silentAccumSec = 0;
    return false;
  }

  const { peak, valid } = anthemChain.sampleOutputPeak();
  if (!valid) return false;
  if (peak <= TAIL_DRAIN_SILENCE_THRESHOLD) {
    timing.silentAccumSec += dt;
    return timing.silentAccumSec >= TAIL_DRAIN_SILENCE_HOLD_SEC;
  }
  timing.silentAccumSec = 0;
  return false;
}
