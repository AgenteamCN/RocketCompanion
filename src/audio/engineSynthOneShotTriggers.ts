/**
 * engineSynthOneShotTriggers.ts
 * Backfire pop and entity-spawn audition decisions for the engine synth's discrete one-shots.
 */

import type { EngineAudioTuningConfig } from '../ui-core/config/engineAudioConfig.ts';
import type {
  BackfirePopDecision,
  LoadedEngineAudioPackAssets,
} from './turtleModemSynthAcousticPipeline.ts';

export function evaluateBackfirePopTrigger(
  assets: LoadedEngineAudioPackAssets | null,
  cfg: EngineAudioTuningConfig,
  nowSec: number,
  lastBackfireTimeSec: number,
  lastPopIndex: number,
  engineVolume: number,
  forceAudition: boolean,
  canPlayNormally: boolean
): BackfirePopDecision | null {
  const pops = assets?.popBuffers;
  if (!pops?.length || (!forceAudition && !canPlayNormally)) return null;
  if (
    !forceAudition &&
    nowSec - lastBackfireTimeSec < Math.max(0.15, cfg.backfireCooldownSec ?? 0.65)
  ) {
    return null;
  }
  let idx = 0;
  if (pops.length > 1) {
    do {
      idx = Math.floor(Math.random() * pops.length);
    } while (idx === lastPopIndex);
  }
  const gain = Math.max(
    0,
    Math.min(1.5, cfg.backfireVolume * (forceAudition ? 0.9 : engineVolume))
  );
  return { buffer: pops[idx], nextPopIndex: idx, gain, playbackRate: 0.94 + Math.random() * 0.12 };
}

export function evaluateEntitySpawnSfxTrigger(
  assets: LoadedEngineAudioPackAssets | null,
  cfg: EngineAudioTuningConfig,
  nowSec: number,
  lastEntitySpawnTimeSec: number,
  engineVolume: number,
  forceAudition: boolean,
  canPlayNormally: boolean
): { buffer: AudioBuffer; gain: number } | null {
  if (!forceAudition && (!cfg.entitySpawnSfxEnabled || !canPlayNormally)) return null;
  const spawnBuf = assets?.entitySpawnBuffer;
  if (!spawnBuf) return null;
  if (!forceAudition && nowSec - lastEntitySpawnTimeSec < 0.15) return null;
  const vol = cfg.entitySpawnSfxVolume * (forceAudition ? 0.9 : Math.max(0.35, engineVolume));
  return { buffer: spawnBuf, gain: Math.max(0, Math.min(1.5, vol)) };
}
