import { getAudioDescriptors } from './audioAssetManifest.ts';
import { getAudioContext, subsystemState } from './audioContext.ts';
import { resolveAssetPath } from '../utils/AssetResponseValidator.ts';
import { yieldToNextFrame } from '../loader/frameBudgetScheduler.ts';
import {
  audioConfig,
  BOOST_AUDIO_VARIATIONS,
  DEFAULT_BOOST_VARIATION,
} from '../ui-core/config/audioConfig.ts';
import type { VehicleAudioBuffers } from './VehicleAudioManager.ts';

export interface IncidentAudioBuffers {
  ballHit: Array<AudioBuffer | null>;
  vehicleAccent: AudioBuffer | null;
  vehicleDetail: Array<AudioBuffer | null>;
  sidewallHit: Array<AudioBuffer | null>;
  carDemo: Array<AudioBuffer | null>;
  carCollision: AudioBuffer | null;
  goalpost: AudioBuffer | null;
  boostCollect: AudioBuffer | null;
  goalScored: AudioBuffer | null;
  supersonic: AudioBuffer | null;
  jump: Array<AudioBuffer | null>;
  doubleJump: Array<AudioBuffer | null>;
  dodge: Array<AudioBuffer | null>;
  reset: AudioBuffer | null;
  wheelImpact: Array<AudioBuffer | null>;
  groundHit: Array<AudioBuffer | null>;
  crossbarPing: Array<AudioBuffer | null>;
  crossbarPingSmall: Array<AudioBuffer | null>;
  boostStart: AudioBuffer | null;
  boostRelease: AudioBuffer | null;
  supersonicEnter: Array<AudioBuffer | null>;
}

export interface BallAudioBuffers {
  ballRolling?: AudioBuffer | null;
  ballFlying?: AudioBuffer | null;
}

export interface AudioAssetTargetFacade {
  vehicleManager?: {
    setBuffers?: (buffers: Partial<VehicleAudioBuffers>) => void;
  };
  incidentEngine?: {
    setBuffers?: (buffers: Partial<IncidentAudioBuffers>) => void;
  };
  ballEngine?: {
    init?: (buffers: BallAudioBuffers) => void;
  };
  signalEngine?: {
    setBuffer?: (key: string, buffer: AudioBuffer | null) => void;
  };
}

export function resolveBoostVariationBuffers() {
  const startId = String(audioConfig.get('boostStartVariation') || DEFAULT_BOOST_VARIATION);
  const loopId = String(audioConfig.get('boostLoopVariation') || DEFAULT_BOOST_VARIATION);
  const endId = String(audioConfig.get('boostEndVariation') || DEFAULT_BOOST_VARIATION);

  const boostStart =
    subsystemState.buffers.get(`boost_${startId}_start`) ||
    subsystemState.buffers.get(`boost_${DEFAULT_BOOST_VARIATION}_start`) ||
    subsystemState.buffers.get('boost_start') ||
    null;
  const boostLoop =
    subsystemState.buffers.get(`boost_${loopId}_loop`) ||
    subsystemState.buffers.get(`boost_${DEFAULT_BOOST_VARIATION}_loop`) ||
    subsystemState.buffers.get('boost_loop') ||
    null;
  const boostRelease =
    subsystemState.buffers.get(`boost_${endId}_end`) ||
    subsystemState.buffers.get(`boost_${DEFAULT_BOOST_VARIATION}_end`) ||
    subsystemState.buffers.get('boost_release') ||
    null;

  return { boostStart, boostLoop, boostRelease };
}

export function applyBoostVariationBuffers(
  facade: AudioAssetTargetFacade | null | undefined
): void {
  if (!facade) return;
  const { boostStart, boostLoop, boostRelease } = resolveBoostVariationBuffers();
  if (boostStart) subsystemState.buffers.set('boost_start', boostStart);
  if (boostLoop) subsystemState.buffers.set('boost_loop', boostLoop);
  if (boostRelease) subsystemState.buffers.set('boost_release', boostRelease);

  facade.vehicleManager?.setBuffers?.({
    boostStart,
    boostLoop,
    boostRelease,
  });
  facade.incidentEngine?.setBuffers?.({
    boostStart,
    boostRelease,
  });
}

export async function fetchAudioBuffer(
  ctx: AudioContext,
  url: string,
  fallbackUrl: string | null = null
): Promise<AudioBuffer | null> {
  const resolvedUrl = resolveAssetPath(url);
  const resolvedFallback = fallbackUrl ? resolveAssetPath(fallbackUrl) : null;
  try {
    let res = await fetch(resolvedUrl);
    if (!res.ok && resolvedFallback) {
      console.warn('[Audio:Fallback] Primary audio missing (404), falling back:', {
        primary: resolvedUrl,
        fallback: resolvedFallback,
      });
      res = await fetch(resolvedFallback);
    }
    if (!res.ok) return null;
    return await ctx.decodeAudioData(await res.arrayBuffer());
  } catch (e) {
    console.warn('[AudioArchitecture] Failed to load/decode primary audio url:', resolvedUrl, e);
    if (resolvedFallback) {
      try {
        console.warn('[Audio:Fallback] Primary audio missing, falling back:', {
          primary: resolvedUrl,
          fallback: resolvedFallback,
          error: e,
        });
        const res = await fetch(resolvedFallback);
        if (res.ok) {
          return await ctx.decodeAudioData(await res.arrayBuffer());
        }
      } catch (e2) {
        console.error(
          '[AudioArchitecture] Failed to load/decode fallback audio url:',
          resolvedFallback,
          e2
        );
      }
    }
    return null;
  }
}

const isAudioBuffer = (b: AudioBuffer | undefined): b is AudioBuffer => Boolean(b);

export async function loadAudioAssets(
  facade: AudioAssetTargetFacade,
  onProgress: ((completed: number, total: number, url: string) => void) | null = null
): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return;

  const audioDescriptors = getAudioDescriptors();
  const poolLimit = 3;
  let completedCount = 0;
  const totalCount = audioDescriptors.length;
  let cursor = 0;
  const results = new Array<AudioBuffer | null>(totalCount);

  const worker = async () => {
    while (cursor < totalCount) {
      const idx = cursor++;
      const desc = audioDescriptors[idx];
      results[idx] = await fetchAudioBuffer(ctx, desc.url, desc.fallback);
      completedCount++;
      if (typeof onProgress === 'function') {
        onProgress(completedCount, totalCount, desc.url);
      }
      if (completedCount % 3 === 0) {
        await yieldToNextFrame();
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(poolLimit, totalCount) }, () => worker()));

  const bufferMap = new Map<string, AudioBuffer>();
  for (let idx = 0; idx < totalCount; idx++) {
    const desc = audioDescriptors[idx];
    const buf = results[idx];
    if (buf) {
      bufferMap.set(desc.id || desc.url, buf);
    }
  }

  const ballHitBuffers = [0, 1, 2, 3]
    .map((i) => bufferMap.get(`ball_hit_${i}`))
    .filter(isAudioBuffer);
  const groundHitBuffers = ballHitBuffers.slice(0, 3);
  const vehicleAccent = bufferMap.get('vehicle_accent') || null;
  const vehicleDetailBuffers = [0, 1, 2, 3, 4, 5]
    .map((i) => bufferMap.get(`vehicle_detail_${i}`))
    .filter(isAudioBuffer);
  const sidewallHitBuffers = [0, 1, 2, 3, 4]
    .map((i) => bufferMap.get(`side_${i}`))
    .filter(isAudioBuffer);
  const carDemoBuffers = [0, 1, 2, 3, 4]
    .map((i) => bufferMap.get(`car_demo_${i}`))
    .filter(isAudioBuffer);
  const jumpBuffers = [0, 1, 2, 3].map((i) => bufferMap.get(`jump_${i}`)).filter(isAudioBuffer);
  const doubleJumpBuffers = [0, 1, 2, 3]
    .map((i) => bufferMap.get(`double_jump_${i}`))
    .filter(isAudioBuffer);
  const dodgeBuffers = [0, 1, 2, 3].map((i) => bufferMap.get(`dodge_${i}`)).filter(isAudioBuffer);
  const wheelImpactBuffers = [0, 1, 2, 3]
    .map((i) => bufferMap.get(`wheel_impact_${i}`))
    .filter(isAudioBuffer);
  const supersonicEnterBuffers = [0, 1, 2]
    .map((i) => bufferMap.get(`supersonic_enter_${i}`))
    .filter(isAudioBuffer);
  const crossbarPingBuffers = [0, 1, 2, 3, 4, 5]
    .map((i) => bufferMap.get(`crossbar_ping_${i}`))
    .filter(isAudioBuffer);
  const crossbarPingSmallBuffers = [0, 1, 2, 3, 4, 5]
    .map((i) => bufferMap.get(`crossbar_ping_small_${i}`))
    .filter(isAudioBuffer);

  const carCollision = bufferMap.get('car_collision') || null;
  const boostCollect = bufferMap.get('boost_collect') || null;
  const goalPoof = bufferMap.get('goal_poof') || null;
  const ballRolling = bufferMap.get('ball_rolling') || null;
  const ballFlying = bufferMap.get('ball_flying') || null;
  const supersonic = bufferMap.get('supersonic') || null;
  const errorNoBoost = bufferMap.get('error_no_boost') || null;
  const match60s = bufferMap.get('match_60s') || null;
  const match30s = bufferMap.get('match_30s') || null;
  const matchCountdown = bufferMap.get('match_countdown') || null;
  const trainingCountdown = bufferMap.get('training_countdown') || matchCountdown;
  const trainingBallExpire = bufferMap.get('training_ball_expire') || null;
  const matchCountdown10s = bufferMap.get('match_countdown_10s') || null;
  const matchOvertime = bufferMap.get('match_overtime') || null;
  const matchStartGo = bufferMap.get('match_start_go') || null;
  const resetBuf = bufferMap.get('reset') || null;
  const goalpostBuf = bufferMap.get('goalpost') || crossbarPingBuffers[0] || null;
  const supersonicLoop = bufferMap.get('supersonic_loop') || null;
  const endgameBuf = bufferMap.get('endgame') || null;

  for (const v of BOOST_AUDIO_VARIATIONS) {
    const s = bufferMap.get(`boost_${v.id}_start`);
    const l = bufferMap.get(`boost_${v.id}_loop`);
    const e = bufferMap.get(`boost_${v.id}_end`);
    if (s) subsystemState.buffers.set(`boost_${v.id}_start`, s);
    if (l) subsystemState.buffers.set(`boost_${v.id}_loop`, l);
    if (e) subsystemState.buffers.set(`boost_${v.id}_end`, e);
  }

  const fallbackBoostStart = bufferMap.get('boost_start') || null;
  const fallbackBoostLoop = bufferMap.get('boost_loop') || null;
  const fallbackBoostRelease = bufferMap.get('boost_release') || null;
  if (fallbackBoostStart) subsystemState.buffers.set('boost_start', fallbackBoostStart);
  if (fallbackBoostLoop) subsystemState.buffers.set('boost_loop', fallbackBoostLoop);
  if (fallbackBoostRelease) subsystemState.buffers.set('boost_release', fallbackBoostRelease);

  const { boostStart, boostLoop, boostRelease } = resolveBoostVariationBuffers();

  // Save into global buffer registry
  subsystemState.buffers.set('car_collision', carCollision);
  subsystemState.buffers.set('vehicle_accent', vehicleAccent);
  vehicleDetailBuffers.forEach((b, i) => subsystemState.buffers.set(`vehicle_detail_${i}`, b));
  carDemoBuffers.forEach((b, i) => subsystemState.buffers.set(`car_demo_${i}`, b));
  if (carDemoBuffers[0]) subsystemState.buffers.set('car_demo', carDemoBuffers[0]);
  subsystemState.buffers.set('boost_collect', boostCollect);
  subsystemState.buffers.set('sfx_goal_poof', goalPoof);
  subsystemState.buffers.set('ballrolling', ballRolling);
  subsystemState.buffers.set('ballflying', ballFlying);
  subsystemState.buffers.set('sfx_state_supersonic', supersonic);
  subsystemState.buffers.set('sfx_error_no_boost', errorNoBoost);
  subsystemState.buffers.set('match_60_seconds_left', match60s);
  subsystemState.buffers.set('match_30_seconds_left', match30s);
  subsystemState.buffers.set('match_countdown_321', matchCountdown);
  subsystemState.buffers.set('training_countdown', trainingCountdown);
  if (trainingBallExpire) subsystemState.buffers.set('training_ball_expire', trainingBallExpire);
  subsystemState.buffers.set('match_countdown_10s', matchCountdown10s);
  subsystemState.buffers.set('match_entering_overtime', matchOvertime);
  subsystemState.buffers.set('match_start_go', matchStartGo);
  if (endgameBuf) subsystemState.buffers.set('endgame', endgameBuf);
  if (resetBuf) subsystemState.buffers.set('reset', resetBuf);
  if (goalpostBuf) subsystemState.buffers.set('goalpost', goalpostBuf);
  if (boostStart) subsystemState.buffers.set('boost_start', boostStart);
  if (boostLoop) subsystemState.buffers.set('boost_loop', boostLoop);
  if (boostRelease) subsystemState.buffers.set('boost_release', boostRelease);
  if (supersonicLoop) subsystemState.buffers.set('supersonic_loop', supersonicLoop);
  jumpBuffers.forEach((b, i) => subsystemState.buffers.set(`jump_${i}`, b));
  doubleJumpBuffers.forEach((b, i) => subsystemState.buffers.set(`double_jump_${i}`, b));
  dodgeBuffers.forEach((b, i) => subsystemState.buffers.set(`dodge_${i}`, b));
  wheelImpactBuffers.forEach((b, i) => subsystemState.buffers.set(`wheel_impact_${i}`, b));
  supersonicEnterBuffers.forEach((b, i) => subsystemState.buffers.set(`supersonic_enter_${i}`, b));

  // Distribute to Vehicle Manager (Multi-Car Dynamic Emitters)
  facade.vehicleManager?.setBuffers?.({
    jump: jumpBuffers,
    doubleJump: doubleJumpBuffers,
    dodge: dodgeBuffers,
    reset: resetBuf,
    wheelImpact: wheelImpactBuffers,
    boostStart,
    boostLoop,
    boostRelease,
    supersonicEnter: supersonicEnterBuffers,
    supersonicLoop: supersonicLoop || supersonic,
    carCollision,
    vehicleDetail: vehicleDetailBuffers,
  });

  // Distribute to Incident Engine (World Incidents)
  facade.incidentEngine?.setBuffers?.({
    ballHit: ballHitBuffers,
    vehicleAccent,
    vehicleDetail: vehicleDetailBuffers,
    groundHit: groundHitBuffers,
    sidewallHit: sidewallHitBuffers,
    carDemo: carDemoBuffers,
    crossbarPing: crossbarPingBuffers,
    crossbarPingSmall: crossbarPingSmallBuffers,
    carCollision,
    goalpost: goalpostBuf || crossbarPingBuffers[0] || null,
    boostCollect,
    goalScored: goalPoof,
    supersonic,
    jump: jumpBuffers,
    doubleJump: doubleJumpBuffers,
    dodge: dodgeBuffers,
    reset: resetBuf,
    wheelImpact: wheelImpactBuffers,
    boostStart,
    boostRelease,
    supersonicEnter: supersonicEnterBuffers,
  });

  // Distribute to Ball Audio Emitter
  facade.ballEngine?.init?.({
    ballRolling,
    ballFlying,
  });

  // Distribute to Signal Engine
  facade.signalEngine?.setBuffer?.('match_countdown_321', matchCountdown);
  facade.signalEngine?.setBuffer?.('training_countdown', trainingCountdown);
  if (trainingBallExpire)
    facade.signalEngine?.setBuffer?.('training_ball_expire', trainingBallExpire);
  facade.signalEngine?.setBuffer?.('match_countdown_10s', matchCountdown10s);
  facade.signalEngine?.setBuffer?.('match_start_go', matchStartGo);
  facade.signalEngine?.setBuffer?.('match_60_seconds_left', match60s);
  facade.signalEngine?.setBuffer?.('match_30_seconds_left', match30s);
  facade.signalEngine?.setBuffer?.('match_entering_overtime', matchOvertime);
  if (endgameBuf) facade.signalEngine?.setBuffer?.('endgame', endgameBuf);
  facade.signalEngine?.setBuffer?.('sfx_goal_poof', goalPoof);
  facade.signalEngine?.setBuffer?.('sfx_error_no_boost', errorNoBoost);
  facade.signalEngine?.setBuffer?.('boost_collect', boostCollect);
}
