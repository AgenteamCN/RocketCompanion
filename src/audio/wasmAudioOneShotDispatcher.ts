/**
 * wasmAudioOneShotDispatcher.ts
 * Dispatches discrete `AudioOneShotSlotPod` entries emitted by WASM `_physics_stepAudioDirector`
 * into WebAudio `AudioSlotPool` / `VehicleAudioEmitter` while sharing cooldown state with
 * `IncidentAudioEngine` and `VehicleAudioManager` to prevent duplicate playback.
 */

import { getAudioSlotPool } from './audioContext.ts';
import type { IncidentAudioBuffers } from './AudioMenuPreviewPlayer.ts';
import { type VehicleAudioManager } from './VehicleAudioManager.ts';

export const AUDIO_CUE_ONE_SHOTS_WORD_OFFSET = 182;
export const AUDIO_CUE_ONE_SHOT_STRIDE_WORDS = 12;

const SAME_FRAME_DEDUP_MS = 28;

export interface WasmIncidentAudioTarget {
  buffers: IncidentAudioBuffers;
}

let lastCarBallHitTimestamp = 0;
let lastCarCollisionTimestamp = 0;
let lastBallWorldHitTimestamp = 0;
let lastGoalpostHitTimestamp = 0;
let lastGoalScoredTimestamp = 0;
const lastCarDemoByVictim = new Map<number, number>();
const lastBoostPickupByPad = new Map<number, number>();

export function dispatchWasmOneShotSlots(
  u32: Uint32Array,
  f32: Float32Array,
  cueWordBase: number,
  incidentEngine: WasmIncidentAudioTarget,
  vehicleManager: VehicleAudioManager
): void {
  const count = Math.min(8, u32[cueWordBase + 2]);
  if (count <= 0) return;

  const pool = getAudioSlotPool();
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const incBufs = incidentEngine.buffers;
  const vehBufs = vehicleManager.buffers;

  for (let i = 0; i < count; i++) {
    const off = cueWordBase + AUDIO_CUE_ONE_SHOTS_WORD_OFFSET + i * AUDIO_CUE_ONE_SHOT_STRIDE_WORDS;
    const evType = u32[off + 0];
    const subType = u32[off + 1];
    const carIdx = u32[off + 2];
    const prioAndVar = u32[off + 3];
    const finalGain = f32[off + 4];
    const rate = f32[off + 5];
    const radiusScale = f32[off + 6];
    const posMetersX = f32[off + 8];
    const posMetersY = f32[off + 9];
    const posMetersZ = f32[off + 10];

    if (finalGain <= 0.0005) continue;

    const priority = prioAndVar & 0xff;
    const variant = (prioAndVar >>> 8) & 0xff;
    const posUU = {
      posX: posMetersX * 100.0,
      posY: posMetersZ * 100.0,
      posZ: posMetersY * 100.0,
    };

    switch (evType) {
      case 0x01: {
        if (nowMs - lastCarBallHitTimestamp < SAME_FRAME_DEDUP_MS) break;
        lastCarBallHitTimestamp = nowMs;
        if (!pool) break;
        const list = incBufs.ballHit || [];
        const bodyBuf = list.length > 0 ? list[variant % list.length] : null;
        if (bodyBuf) {
          pool.playBuffer(bodyBuf, {
            volume: finalGain,
            playbackRate: rate,
            priority,
            position: posUU,
            category: 'car_ball_hit',
            distanceRadiusScale: radiusScale,
          });
        }
        if (subType === 1 && incBufs.vehicleAccent) {
          pool.playBuffer(incBufs.vehicleAccent, {
            volume: finalGain * 0.75,
            playbackRate: rate,
            priority: Math.max(1, priority - 5),
            position: posUU,
            category: 'car_ball_hit',
            distanceRadiusScale: radiusScale,
          });
        }
        break;
      }
      case 0x02: {
        if (nowMs - lastCarCollisionTimestamp < SAME_FRAME_DEDUP_MS) break;
        lastCarCollisionTimestamp = nowMs;
        if (pool && incBufs.carCollision) {
          pool.playBuffer(incBufs.carCollision, {
            volume: finalGain,
            playbackRate: rate,
            priority,
            position: posUU,
            category: 'car_bump',
            distanceRadiusScale: radiusScale,
          });
        }
        break;
      }
      case 0x03: {
        const prevDemo = carIdx < 8 ? (lastCarDemoByVictim.get(carIdx) ?? 0) : 0;
        if (nowMs - prevDemo < SAME_FRAME_DEDUP_MS) break;
        if (carIdx < 8) lastCarDemoByVictim.set(carIdx, nowMs);
        const list = incBufs.carDemo || [];
        const buf = list.length > 0 ? list[variant % list.length] : incBufs.carCollision;
        if (pool && buf) {
          pool.playBuffer(buf, {
            volume: finalGain,
            playbackRate: rate,
            priority,
            position: posUU,
            category: 'demolish',
            distanceRadiusScale: radiusScale,
          });
        }
        break;
      }
      case 0x04: {
        if (nowMs - lastBallWorldHitTimestamp < SAME_FRAME_DEDUP_MS) break;
        lastBallWorldHitTimestamp = nowMs;
        if (!pool) break;
        const list =
          subType === 1
            ? incBufs.groundHit?.length
              ? incBufs.groundHit
              : incBufs.ballHit?.slice(0, 3)
            : incBufs.sidewallHit?.length
              ? incBufs.sidewallHit
              : incBufs.groundHit;
        const buf = list && list.length > 0 ? list[variant % list.length] : null;
        if (buf) {
          pool.playBuffer(buf, {
            volume: finalGain,
            playbackRate: rate,
            priority,
            position: posUU,
            category: 'world_surface',
            distanceRadiusScale: radiusScale,
          });
        }
        break;
      }
      case 0x05: {
        if (nowMs - lastGoalpostHitTimestamp < SAME_FRAME_DEDUP_MS) break;
        lastGoalpostHitTimestamp = nowMs;
        if (!pool) break;
        const isLarge = subType === 9;
        const list = isLarge ? incBufs.crossbarPing : incBufs.crossbarPingSmall;
        const fallback = incBufs.crossbarPing || incBufs.crossbarPingSmall;
        const activeList = list && list.length > 0 ? list : fallback;
        const buf =
          activeList && activeList.length > 0
            ? activeList[variant % activeList.length]
            : incBufs.goalpost;
        if (buf) {
          pool.playBuffer(buf, {
            volume: finalGain,
            playbackRate: rate,
            priority,
            position: posUU,
            category: isLarge ? 'goalpost_ping_large' : 'goalpost_ping_small',
            distanceRadiusScale: radiusScale,
          });
        }
        break;
      }
      case 0x06:
      case 0x07:
      case 0x08: {
        const cIdx = carIdx < 8 ? carIdx : 0;
        const keyOffset = evType === 0x08 ? 2 : evType === 0x07 ? 1 : 0;
        const jumpKey = cIdx * 16 + keyOffset;
        if (
          nowMs - (vehicleManager._lastJumpActionMsByCar.get(jumpKey) ?? 0) <
          SAME_FRAME_DEDUP_MS
        ) {
          break;
        }
        vehicleManager._lastJumpActionMsByCar.set(jumpKey, nowMs);
        const emitter = vehicleManager.getEmitter(cIdx);
        emitter.updatePosition(posUU);
        const list =
          evType === 0x08 ? vehBufs.dodge : evType === 0x07 ? vehBufs.doubleJump : vehBufs.jump;
        const buf = list && list.length > 0 ? list[variant % list.length] : vehBufs.carCollision;
        if (buf) {
          emitter.playAction(buf, finalGain, rate, 'jump_dodge_other', radiusScale);
        }
        break;
      }
      case 0x09: {
        const cIdx = carIdx < 8 ? carIdx : 0;
        if (
          nowMs - (vehicleManager._lastSupersonicEnterMsByCar.get(cIdx) ?? 0) <
          SAME_FRAME_DEDUP_MS
        ) {
          break;
        }
        vehicleManager._lastSupersonicEnterMsByCar.set(cIdx, nowMs);
        const emitter = vehicleManager.getEmitter(cIdx);
        emitter.updatePosition(posUU);
        const list = vehBufs.supersonicEnter;
        const buf = list && list.length > 0 ? list[variant % list.length] : vehBufs.supersonicLoop;
        if (buf) {
          emitter.playAction(buf, finalGain, rate, 'supersonic_other', radiusScale);
        }
        break;
      }
      case 0x0a: {
        if (nowMs - (lastBoostPickupByPad.get(variant) ?? 0) < SAME_FRAME_DEDUP_MS) {
          break;
        }
        lastBoostPickupByPad.set(variant, nowMs);
        if (pool && incBufs.boostCollect) {
          pool.playBuffer(incBufs.boostCollect, {
            volume: finalGain,
            playbackRate: rate,
            priority,
            position: posUU,
            category: 'boost_pickup',
          });
        }
        break;
      }
      case 0x0c:
      case 0x0d: {
        const cIdx = carIdx < 8 ? carIdx : 0;
        if (evType === 0x0c) {
          if (nowMs - (vehicleManager._lastBoostEdgeMsByCar.get(cIdx) ?? 0) < SAME_FRAME_DEDUP_MS) {
            break;
          }
          vehicleManager._lastBoostEdgeMsByCar.set(cIdx, nowMs);
        }
        vehicleManager.handleCarEvent({
          type: evType,
          carIndex: cIdx,
          x: posUU.posX,
          y: posUU.posY,
          z: posUU.posZ,
        });
        break;
      }
      case 0x0e: {
        if (nowMs - lastGoalScoredTimestamp < SAME_FRAME_DEDUP_MS) break;
        lastGoalScoredTimestamp = nowMs;
        if (pool && incBufs.goalScored) {
          pool.playBuffer(incBufs.goalScored, {
            volume: finalGain,
            playbackRate: rate,
            priority,
            position: posUU,
            category: 'goal_explosion',
            distanceRadiusScale: radiusScale,
          });
        }
        break;
      }
      case 0x0f: {
        const cIdx = carIdx < 8 ? carIdx : 0;
        if (!vehicleManager._lastFlipResetMsByCar) {
          vehicleManager._lastFlipResetMsByCar = new Map();
        }
        if (nowMs - (vehicleManager._lastFlipResetMsByCar.get(cIdx) ?? 0) < SAME_FRAME_DEDUP_MS) {
          break;
        }
        vehicleManager._lastFlipResetMsByCar.set(cIdx, nowMs);
        const emitter = vehicleManager.getEmitter(cIdx);
        emitter.updatePosition(posUU);
        if (vehBufs.reset) {
          emitter.playAction(vehBufs.reset, finalGain, rate, 'flip_reset_other', radiusScale);
        }
        break;
      }
      case 0x12: {
        const cIdx = carIdx < 8 ? carIdx : 0;
        if (
          nowMs - (vehicleManager._lastWheelLandingMsByCar.get(cIdx) ?? 0) <
          SAME_FRAME_DEDUP_MS
        ) {
          break;
        }
        vehicleManager._lastWheelLandingMsByCar.set(cIdx, nowMs);
        const emitter = vehicleManager.getEmitter(cIdx);
        emitter.updatePosition(posUU);
        const list = vehBufs.wheelImpact;
        const buf = list && list.length > 0 ? list[variant % list.length] : vehBufs.carCollision;
        if (buf) {
          emitter.playAction(buf, finalGain, rate, 'wheel_landing', radiusScale);
        }
        break;
      }
      default:
        break;
    }
  }
}
