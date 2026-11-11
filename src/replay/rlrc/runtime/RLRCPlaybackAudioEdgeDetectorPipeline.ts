/**
 * RLRCPlaybackAudioEdgeDetectorPipeline.ts
 * Pure 120Hz frame-to-frame audio edge detection pipeline for RLRC Replay playback:
 * car jumps/dodges/boost/supersonic, pad pickups, ball impacts, goals, bumps, demos, and match state cues.
 */

import { GRAVITY_Z, INCIDENT_EVENT_TYPES as EV } from '../../../physics/RocketSimConstants.ts';
import { STANDARD_BOOST_PADS_34 as PADS } from '../catalog/RLRCBoostPadLocationsTable.ts';
import type {
  RLRCBookmarkRecord,
  RLRCCarFrameState120Hz,
  RLRCFrame120Hz as Frame,
  RLRCVec3,
} from '../RLRCReplayTypes.ts';
import {
  computeMaxSurfaceNormalReversal,
  COS_MIN_POST_DEFLECT_RAD,
  COS_MIN_WORLD_DEFLECT_RAD,
  hasSignificantVectorDeflection,
  isNearGoalPostSurface,
  RLRC_ARENA_HALF_Y,
} from './RLRCBallSurfaceImpactKinematics.ts';

export type SoundCueId =
  'match_countdown_321' | 'match_start_go' | 'match_entering_overtime' | 'sfx_goal_poof' | string;

export type AudioVec3Tuple = [number, number, number];

export interface RLRCSynthesizedDiscreteAudioEvent {
  eventType: number;
  entityA: number;
  entityB: number;
  value: number;
  pos?: AudioVec3Tuple;
}

export interface RLRCSynthesizedDirectCueEvent {
  cueId: SoundCueId;
  volume?: number;
  pitch?: number;
  isPov?: boolean;
  pos?: AudioVec3Tuple;
}

export interface RLRCSynthesizedAudioFrameBatch {
  discreteEvents: RLRCSynthesizedDiscreteAudioEvent[];
  directCues: RLRCSynthesizedDirectCueEvent[];
}

export interface AudioEdgeTrackerState {
  lastHitTick: number;
  lastWorldHitTick?: number;
  lastPostHitTick?: number;
  lastGoalTick: number;
  lastOtTick: number;
  lastCdNum: number;
  readonly lastBump: Int32Array;
  readonly lastDemo: Int32Array;
  readonly firedBm: Set<number>;
}

const GRAV_DV = GRAVITY_Z / 120;

const tup3 = (v: RLRCVec3): AudioVec3Tuple => [v.x, v.y, v.z];
const dist3 = (a: RLRCVec3, b: RLRCVec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const speed3 = (v: RLRCVec3): number => Math.hypot(v.x, v.y, v.z);

const pushEv = (
  b: RLRCSynthesizedAudioFrameBatch,
  eventType: number,
  entityA: number,
  entityB: number,
  value: number,
  pos?: AudioVec3Tuple
): void => {
  b.discreteEvents.push({ eventType, entityA, entityB, value, pos });
};

const pushCue = (
  b: RLRCSynthesizedAudioFrameBatch,
  cueId: SoundCueId,
  volume = 0.85,
  isPov = true,
  pos?: AudioVec3Tuple
): void => {
  b.directCues.push({ cueId, volume, isPov, pos });
};

function findNearestActiveCarSlot(
  cars: readonly RLRCCarFrameState120Hz[],
  pos: RLRCVec3,
  excl: number,
  fb = -1
): number {
  let best = fb;
  let bestD = Infinity;
  for (let s = 0; s < cars.length; s++) {
    if (s === excl || !cars[s]!.entityActive) continue;
    const d = dist3(cars[s]!.rigidBody.position, pos);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

export function detectCarAndPadAudioEdges(
  prev: Frame,
  curr: Frame,
  povSlot: number,
  batch: RLRCSynthesizedAudioFrameBatch
): void {
  const nCars = Math.min(prev.cars.length, curr.cars.length);
  for (let s = 0; s < nCars; s++) {
    const pC = prev.cars[s]!;
    const cC = curr.cars[s]!;
    if (!pC.entityActive || !cC.entityActive) continue;
    const pF = pC.activeFlags;
    const cF = cC.activeFlags;
    const rb = cC.rigidBody;
    const pos = tup3(rb.position);
    const bf = cC.boostAmount > 1.001 ? cC.boostAmount * 0.01 : cC.boostAmount;
    if (!pF.jumpActive && cF.jumpActive) pushEv(batch, EV.CAR_JUMP, s, 0, 1, pos);
    if (!pF.dodgeActive && cF.dodgeActive) pushEv(batch, EV.CAR_DODGE, s, 0, 1, pos);
    else if (!pF.doubleJumpActive && cF.doubleJumpActive) {
      pushEv(batch, EV.CAR_DOUBLE_JUMP, s, 0, 1, pos);
    }
    const b0 = (pF.boostActive || pC.controls.boost) && pC.boostAmount > 0.5;
    const b1 = (cF.boostActive || cC.controls.boost) && cC.boostAmount > 0.5;
    if (!b0 && b1) pushEv(batch, EV.CAR_BOOST_START, s, 0, bf, pos);
    else if (b0 && !b1) pushEv(batch, EV.CAR_BOOST_STOP, s, 0, bf, pos);
    if (!pC.isSupersonic && cC.isSupersonic) {
      pushEv(batch, EV.CAR_SUPERSONIC_ENTER, s, 0, speed3(rb.linearVelocity), pos);
    }
  }
  const nPads = Math.min(prev.boostPadCooldowns.length, curr.boostPadCooldowns.length, PADS.length);
  for (let p = 0; p < nPads; p++) {
    if (prev.boostPadCooldowns[p]! <= 1e-3 && curr.boostPadCooldowns[p]! > 0.5) {
      const pad = PADS[p]!;
      pushEv(
        batch,
        EV.BOOST_PICKUP,
        findNearestActiveCarSlot(curr.cars, pad.position, -1, povSlot),
        p,
        pad.isBigPad ? 1.0 : 0.12,
        tup3(pad.position)
      );
    }
  }
}

export function detectBallAndGoalAudioEdges(
  prev: Frame,
  anchor: Frame,
  curr: Frame,
  tracker: AudioEdgeTrackerState,
  batch: RLRCSynthesizedAudioFrameBatch
): void {
  const pB = prev.ball;
  const cB = curr.ball;
  const tick = curr.frameIndex120Hz;
  const pPos = pB.rigidBody.position;
  const bPos = cB.rigidBody.position;
  if (
    (curr.blueScore > prev.blueScore ||
      curr.orangeScore > prev.orangeScore ||
      (pB.entityActive && !cB.entityActive && Math.abs(pPos.y) >= RLRC_ARENA_HALF_Y - 350)) &&
    tick - tracker.lastGoalTick >= 60
  ) {
    tracker.lastGoalTick = tick;
    const gPos = tup3(pB.entityActive ? pPos : bPos);
    pushEv(batch, EV.GOAL_SCORED, curr.orangeScore > prev.orangeScore ? 1 : 0, 0, 1, gPos);
    pushCue(batch, 'sfx_goal_poof', 0.92, true, gPos);
    return;
  }
  if (
    !pB.entityActive ||
    !cB.entityActive ||
    curr.roundCountdownNumber > 0 ||
    tick - tracker.lastHitTick < 7
  ) {
    return;
  }

  const dt1 = Math.max(1, tick - prev.frameIndex120Hz);
  const vC = cB.rigidBody.linearVelocity;
  const vP = pB.rigidBody.linearVelocity;
  const vPGrav: RLRCVec3 = { x: vP.x, y: vP.y, z: vP.z + GRAV_DV * dt1 };
  const imp1 = Math.hypot(vC.x - vPGrav.x, vC.y - vPGrav.y, vC.z - vPGrav.z);
  let impW = 0;
  let vInRef: RLRCVec3 = vPGrav;
  if (anchor.ball.entityActive && tick > anchor.frameIndex120Hz) {
    const vA = anchor.ball.rigidBody.linearVelocity;
    const dtW = tick - anchor.frameIndex120Hz;
    const vAGrav: RLRCVec3 = { x: vA.x, y: vA.y, z: vA.z + GRAV_DV * dtW };
    impW = Math.hypot(vC.x - vAGrav.x, vC.y - vAGrav.y, vC.z - vAGrav.z);
    if (impW * 0.85 > imp1) vInRef = vAGrav;
  }
  if (imp1 < 185 && !(impW >= 230 && imp1 >= 75)) return;

  const imp = Math.max(imp1, impW * 0.85);
  const hitPos = tup3(bPos);
  let bestSlot = -1;
  let bestD = Infinity;
  for (let s = 0; s < curr.cars.length; s++) {
    if (!curr.cars[s]!.entityActive) continue;
    const d = Math.min(
      dist3(curr.cars[s]!.rigidBody.position, bPos),
      dist3(prev.cars[s]!.rigidBody.position, pPos)
    );
    if (d < bestD) {
      bestD = d;
      bestSlot = s;
    }
  }
  if (bestSlot >= 0 && bestD <= 285) {
    tracker.lastHitTick = tick;
    pushEv(batch, EV.CAR_BALL_HIT, bestSlot, 0, imp, hitPos);
    return;
  }

  const lastPostTick = tracker.lastPostHitTick ?? -999;
  if (isNearGoalPostSurface(bPos) && imp >= 240 && tick - lastPostTick >= 16) {
    const postSurface = computeMaxSurfaceNormalReversal(bPos, vInRef, vC);
    const postDeflected =
      hasSignificantVectorDeflection(vInRef, vC, COS_MIN_POST_DEFLECT_RAD, 160) ||
      hasSignificantVectorDeflection(vPGrav, vC, COS_MIN_POST_DEFLECT_RAD, 160);
    if (postSurface.maxReversal >= 220 || (postDeflected && imp >= 280)) {
      tracker.lastHitTick = tick;
      tracker.lastPostHitTick = tick;
      pushEv(batch, EV.BALL_GOALPOST_HIT, 0, 0, Math.max(imp, postSurface.maxReversal), hitPos);
      return;
    }
  }

  const lastWorldTick = tracker.lastWorldHitTick ?? -999;
  if (tick - lastWorldTick < 18) return;
  const surfaceCheck = computeMaxSurfaceNormalReversal(bPos, vInRef, vC);
  if (!surfaceCheck.nearSurface) return;
  const hasNormalBounce = surfaceCheck.maxReversal >= 240;
  const hasSharpVectorBounce =
    imp >= 320 &&
    imp1 >= 185 &&
    surfaceCheck.minInwardVel < -120 &&
    (hasSignificantVectorDeflection(vInRef, vC, COS_MIN_WORLD_DEFLECT_RAD, 200) ||
      hasSignificantVectorDeflection(vPGrav, vC, COS_MIN_WORLD_DEFLECT_RAD, 200));
  if (hasNormalBounce || hasSharpVectorBounce) {
    tracker.lastHitTick = tick;
    tracker.lastWorldHitTick = tick;
    pushEv(batch, EV.BALL_WORLD_HIT, 0, 0, Math.max(imp, surfaceCheck.maxReversal), hitPos);
  }
}

export function detectCollisionAndDemoAudioEdges(
  prev: Frame,
  anchor: Frame,
  curr: Frame,
  tracker: AudioEdgeTrackerState,
  batch: RLRCSynthesizedAudioFrameBatch
): void {
  const n = Math.min(prev.cars.length, curr.cars.length);
  const tick = curr.frameIndex120Hz;
  let deact = -1;
  let deactN = 0;
  for (let s = 0; s < n; s++) {
    const currCar = curr.cars[s]!;
    if (prev.cars[s]!.entityActive && !currCar.entityActive && currCar.isDemolished !== false) {
      deactN++;
      deact = s;
    }
  }
  if (
    deactN === 1 &&
    deact >= 0 &&
    curr.ball.entityActive &&
    !curr.roundCountdownNumber &&
    tick - tracker.lastDemo[deact]! >= 36
  ) {
    const vPos = prev.cars[deact]!.rigidBody.position;
    tracker.lastDemo[deact] = tick;
    pushEv(
      batch,
      EV.CAR_CAR_DEMO,
      findNearestActiveCarSlot(curr.cars, vPos, deact, deact),
      deact,
      2200,
      tup3(vPos)
    );
  }
  for (let i = 0; i < n; i++) {
    const cA = curr.cars[i]!;
    const pA = prev.cars[i]!;
    if (!cA.entityActive || !pA.entityActive || tick - tracker.lastBump[i]! < 18) continue;
    for (let j = i + 1; j < n; j++) {
      const cB = curr.cars[j]!;
      const pB = prev.cars[j]!;
      if (!cB.entityActive || !pB.entityActive || tick - tracker.lastBump[j]! < 18) continue;
      const posA = cA.rigidBody.position;
      const posB = cB.rigidBody.position;
      if (dist3(posA, posB) > 225) continue;
      const bA = (anchor.cars[i]?.entityActive ? anchor.cars[i]! : pA).rigidBody.linearVelocity;
      const bB = (anchor.cars[j]?.entityActive ? anchor.cars[j]! : pB).rigidBody.linearVelocity;
      const dv = Math.max(
        dist3(cA.rigidBody.linearVelocity, bA),
        dist3(cB.rigidBody.linearVelocity, bB)
      );
      if (dv < 320) continue;
      tracker.lastBump[i] = tick;
      tracker.lastBump[j] = tick;
      pushEv(batch, EV.CAR_CAR_BUMP, i, j, dv, [
        (posA.x + posB.x) * 0.5,
        (posA.y + posB.y) * 0.5,
        (posA.z + posB.z) * 0.5,
      ]);
    }
  }
}

export function detectMatchStateAndBookmarkAudioEdges(
  prev: Frame,
  curr: Frame,
  bookmarks: readonly RLRCBookmarkRecord[],
  tracker: AudioEdgeTrackerState,
  batch: RLRCSynthesizedAudioFrameBatch
): void {
  const tick = curr.frameIndex120Hz;
  const pCd = prev.roundCountdownNumber;
  const cCd = curr.roundCountdownNumber;
  if (cCd !== pCd && cCd !== tracker.lastCdNum) {
    tracker.lastCdNum = cCd;
    if (cCd >= 1 && cCd <= 3) pushCue(batch, 'match_countdown_321', 0.78, true);
    else if (pCd === 1 && cCd === 0) pushCue(batch, 'match_start_go', 0.85, true);
  }
  if (!prev.isOvertime && curr.isOvertime && tick - tracker.lastOtTick > 120) {
    tracker.lastOtTick = tick;
    pushCue(batch, 'match_entering_overtime', 0.88, true);
  }
  for (let i = 0; i < bookmarks.length; i++) {
    if (tracker.firedBm.has(i)) continue;
    const bm = bookmarks[i]!;
    const f = bm.frameIndex120Hz;
    const t = bm.timeSeconds;
    if (
      !(f > prev.frameIndex120Hz && f <= tick) &&
      !(t > prev.timeSeconds && t <= curr.timeSeconds)
    ) {
      continue;
    }
    tracker.firedBm.add(i);
    if (bm.kind === 'demolish') {
      const vic = Math.max(0, Math.min(7, bm.slotIndex | 0));
      if (tick - (tracker.lastDemo[vic] ?? -999) >= 36) {
        tracker.lastDemo[vic] = tick;
        const vPos = (curr.cars[vic] ?? prev.cars[vic])?.rigidBody.position ?? {
          x: 0,
          y: 0,
          z: 93,
        };
        pushEv(
          batch,
          EV.CAR_CAR_DEMO,
          findNearestActiveCarSlot(curr.cars, vPos, vic, vic),
          vic,
          2200,
          tup3(vPos)
        );
      }
    } else if (bm.kind === 'goal' && tick - tracker.lastGoalTick >= 60) {
      tracker.lastGoalTick = tick;
      const gPos = tup3(prev.ball.rigidBody.position);
      pushEv(batch, EV.GOAL_SCORED, bm.team === 1 ? 1 : 0, 0, 1, gPos);
      pushCue(batch, 'sfx_goal_poof', 0.92, true, gPos);
    }
  }
}
