/**
 * stadiumSpatialAcousticPipeline.ts
 * Pure acoustic gain, runtime context snapshot extraction, transition delta,
 * and match-phase transition evaluation for StadiumSpatialAudioEngine.
 */

import { type SpatialAudioTunerConfig } from '../ui-core/config/spatialAttenuationProfiles.ts';
import { fetchAudioBuffer } from './audioAssetLoader.ts';
import { type SpatialAudioRuntimeContextSnapshot } from './SpatialAudioBusChain.ts';
import { type GoalAnthemPlayer } from './GoalAnthemPlayer.ts';
import { readRuntimeAudioSnapshot } from './spatialMusicAndAnthemPipeline.ts';

export const BGM_PREVIEW_SAMPLE_URL =
  '/assets/audio/bgm/Hollywood Principle - Breathing Underwater (Ether Remix).m4a';
export const BGM_PREVIEW_FALLBACK_URL =
  '/assets/audio/bgm/Mike Ault - Flying Forever (feat. Morgan Perry).m4a';

export interface SpatialContextTransitionPlan {
  nextChoreographySignal: string | null;
  nextHudMatchPhase: string | null;
  activateGoalSequenceBgm: boolean;
  setGoalReplaySkipped: boolean | null;
  startGoalReplayAnthem: boolean;
  refreshGoalSequenceGate: boolean;
  syncBgmPlayback: boolean;
}

export function isTrainingShotExpireContext(context: SpatialAudioRuntimeContextSnapshot): boolean {
  return (
    context.matchMode === 'static-training-pack' && context.staticTrainingReplayType === 'expire'
  );
}

export function readSpatialAudioRuntimeContextSnapshot(): SpatialAudioRuntimeContextSnapshot {
  return readRuntimeAudioSnapshot();
}

export function computeSpatialTransitionMaxDelta(
  nowMs: number,
  lastRafTimeMs: number,
  cfg: Partial<SpatialAudioTunerConfig>
): { dt: number; maxDelta: number } {
  const dt = Math.min(0.1, Math.max(0.0, (nowMs - lastRafTimeMs) / 1000));
  const duration = Math.max(0.05, Number(cfg.transitionDurationSec) || 2.0);
  return { dt, maxDelta: dt / duration };
}

export function resolveImpulseDecaySec(cfg?: Partial<SpatialAudioTunerConfig> | null): number {
  return Number(cfg?.decaySec) || 3.0;
}

export function hasImpulseDecayChanged(nextDecaySec: number, lastDecaySec: number): boolean {
  return Math.abs(nextDecaySec - lastDecaySec) > 0.05;
}

export function evaluateSpatialContextTransition(
  prevContext: SpatialAudioRuntimeContextSnapshot,
  nextContext: SpatialAudioRuntimeContextSnapshot,
  lastChoreographySignal: string | null,
  lastHudMatchPhase: string | null
): SpatialContextTransitionPlan {
  const expire = isTrainingShotExpireContext(nextContext);
  let activateGoalSequenceBgm = false;
  let setGoalReplaySkipped: boolean | null = null;
  let startGoalReplayAnthem = false;
  let refreshGoalSequenceGate = false;
  let syncBgmPlayback = false;

  const nextSignal = nextContext.choreographySignal;
  if (nextSignal !== lastChoreographySignal) {
    if (nextSignal === 'goal-replay-will-start' && !expire) {
      activateGoalSequenceBgm = true;
      syncBgmPlayback = true;
    }
  }

  const nextPhase = nextContext.matchPhase;
  const prevPhase = lastHudMatchPhase;
  if (nextPhase !== prevPhase && prevPhase !== null) {
    if (nextPhase === 'goal' && prevPhase !== 'goal') {
      if (!expire) activateGoalSequenceBgm = true;
      syncBgmPlayback = true;
    } else if (nextPhase === 'replay' && prevPhase !== 'replay') {
      if (!expire) {
        activateGoalSequenceBgm = true;
        setGoalReplaySkipped = false;
        startGoalReplayAnthem = true;
        syncBgmPlayback = true;
      }
    } else if (
      (prevPhase === 'replay' || prevPhase === 'goal') &&
      nextPhase !== 'replay' &&
      nextPhase !== 'goal'
    ) {
      setGoalReplaySkipped = true;
      refreshGoalSequenceGate = true;
      syncBgmPlayback = true;
    }
  }

  if (
    prevContext.isOpen !== nextContext.isOpen ||
    prevContext.matchMode !== nextContext.matchMode ||
    prevContext.onlineSession !== nextContext.onlineSession
  ) {
    syncBgmPlayback = true;
  }

  return {
    nextChoreographySignal: nextSignal,
    nextHudMatchPhase: nextPhase,
    activateGoalSequenceBgm,
    setGoalReplaySkipped,
    startGoalReplayAnthem,
    refreshGoalSequenceGate,
    syncBgmPlayback,
  };
}

export async function resolveAnthemVolumeSampleBuffer(
  ctx: AudioContext,
  selectedAnthem: string | null | undefined,
  anthemPlayer: GoalAnthemPlayer
): Promise<AudioBuffer | null> {
  const prefId = selectedAnthem && selectedAnthem !== 'none' ? selectedAnthem : 'random';
  const resolved = anthemPlayer.resolveAnthemDefinition(prefId);
  let buf = resolved ? await anthemPlayer.loadAnthemBuffer(resolved) : null;
  if (!buf) {
    const url = resolved?.file ? `/${resolved.file.replace(/^\//, '')}` : BGM_PREVIEW_FALLBACK_URL;
    buf = await fetchAudioBuffer(ctx, url, BGM_PREVIEW_FALLBACK_URL);
  }
  return buf;
}

export async function resolveBgmVolumeSampleBuffer(
  ctx: AudioContext,
  cachedBuffer: AudioBuffer | null
): Promise<{ buffer: AudioBuffer | null; offsetSec: number }> {
  const buffer =
    cachedBuffer || (await fetchAudioBuffer(ctx, BGM_PREVIEW_SAMPLE_URL, BGM_PREVIEW_FALLBACK_URL));
  if (!buffer) return { buffer: null, offsetSec: 0 };
  return {
    buffer,
    offsetSec: buffer.duration > 16 ? 12.0 : 0.0,
  };
}
