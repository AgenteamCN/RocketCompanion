/**
 * RLRCEntityLifeSpanBuilder.ts
 * Extracts continuous non-teleporting entity lifespans and deduplicated ReplicatedRBState
 * keyframe indices for 120Hz Hermite/SLERP resampling.
 */

import {
  RLRC_FIXED_DT,
  type RLRCCarFrameState120Hz,
  type RLRCRigidBodySample,
  type RLRCSourceEntityLifeSegment,
  type RLRCSourceNetworkFrame,
} from '../RLRCReplayTypes.ts';
import {
  calibrateNetStreamVel,
  clamp,
  isDupRb,
  isRest,
  resolveEffectivePhysicsDt,
  SLEEP_RB,
  vAdd,
  vDist,
  vScale,
  vSub,
} from './RLRCHermiteSlerpMathPipeline.ts';

export interface RLRCEntitySpan {
  readonly startNetIdx: number;
  readonly endNetIdx: number;
  readonly keyframeIndices: readonly number[];
  readonly keyframeTimes?: readonly number[];
}

export interface RLRCEntityBracketMatch {
  readonly k0Idx: number;
  readonly k1Idx: number;
  readonly alpha: number;
  readonly dt: number;
  readonly rest0: boolean;
  readonly rest1: boolean;
}

export function getCarFromNetworkFrame(
  nf: RLRCSourceNetworkFrame,
  slot: number
): RLRCCarFrameState120Hz | undefined {
  return nf.cars[slot]?.slotIndex === slot
    ? nf.cars[slot]
    : nf.cars.find((c) => c.slotIndex === slot);
}

export function getRbFromNetworkFrame(
  nf: RLRCSourceNetworkFrame,
  slot: number | 'ball'
): RLRCRigidBodySample {
  return slot === 'ball'
    ? nf.ball.rigidBody
    : (getCarFromNetworkFrame(nf, slot)?.rigidBody ?? SLEEP_RB);
}

function isRbUpdatedOnFrame(
  nf: RLRCSourceNetworkFrame,
  slot: number | 'ball'
): boolean | undefined {
  const entity = (slot === 'ball' ? nf.ball : getCarFromNetworkFrame(nf, slot)) as
    { readonly rbUpdated?: boolean } | undefined;
  if (typeof entity?.rbUpdated === 'boolean') return entity.rbUpdated;
  const rb = getRbFromNetworkFrame(nf, slot) as { readonly rbUpdated?: boolean };
  if (typeof rb.rbUpdated === 'boolean') return rb.rbUpdated;
  if (slot === 'ball' && typeof nf.ballRbUpdated === 'boolean') return nf.ballRbUpdated;
  if (typeof slot === 'number' && typeof nf.carRbUpdatedMask === 'number') {
    return ((nf.carRbUpdatedMask >>> slot) & 1) === 1;
  }
  const mask = nf.rbUpdatedMask;
  return typeof mask === 'number' ? ((mask >>> (slot === 'ball' ? 6 : slot)) & 1) === 1 : undefined;
}

function buildPhaseAlignedKeyframeTimes(
  nfs: readonly RLRCSourceNetworkFrame[],
  kf: readonly number[],
  slot: number | 'ball'
): number[] {
  const n = kf.length;
  if (n === 0) return [];
  const times = new Array<number>(n);
  times[0] = nfs[kf[0]].timeSeconds;
  for (let i = 0; i < n - 1; i++) {
    const k0 = kf[i];
    const k1 = kf[i + 1];
    const tWall1 = nfs[k1].timeSeconds;
    const dtWall = Math.max(RLRC_FIXED_DT, tWall1 - nfs[k0].timeSeconds);
    const rb0 = getRbFromNetworkFrame(nfs[k0], slot);
    const rb1 = getRbFromNetworkFrame(nfs[k1], slot);
    const dtPhys = resolveEffectivePhysicsDt(
      rb0.position,
      rb1.position,
      rb0.linearVelocity,
      rb1.linearVelocity,
      dtWall,
      isRest(rb0),
      isRest(rb1)
    );
    const candidate = times[i] + dtPhys;
    const maxPhaseShift = 0.85 * RLRC_FIXED_DT;
    times[i + 1] = Math.max(
      times[i] + RLRC_FIXED_DT,
      clamp(candidate, tWall1 - maxPhaseShift, tWall1 + maxPhaseShift)
    );
  }
  return times;
}

/**
 * Builds keyframe indices for a contiguous entity lifespan.
 * Only inserts `prev` as a stationary hold boundary when the entity is genuinely at rest
 * (`isRest(rbP)`) or had an explicit server `ReplicatedRBState` update at `prev`.
 * Never inserts un-updated `prev` frames during moving/airborne replication gaps (`hDt >= 0.095`),
 * which previously froze flipping cars in mid-air and snapped them in 1 frame.
 */
function buildSpan(
  nfs: readonly RLRCSourceNetworkFrame[],
  raw: readonly number[],
  slot: number | 'ball'
): RLRCEntitySpan {
  const kf: number[] = [];
  for (let r = 0; r < raw.length; r++) {
    const idx = raw[r];
    const p = kf[kf.length - 1];
    if (p === undefined) {
      kf.push(idx);
      continue;
    }
    const rbP = getRbFromNetworkFrame(nfs[p], slot);
    const rbC = getRbFromNetworkFrame(nfs[idx], slot);
    const dt = nfs[idx].timeSeconds - nfs[p].timeSeconds;
    if (dt <= 1e-5) {
      if (!isDupRb(rbP, rbC)) kf[kf.length - 1] = idx;
      continue;
    }
    if (!isDupRb(rbP, rbC)) {
      const prev = raw[r - 1];
      const hDt = nfs[prev].timeSeconds - nfs[p].timeSeconds;
      if (prev > p && hDt > 1e-5 && (isRest(rbP) || isRbUpdatedOnFrame(nfs[prev], slot) === true)) {
        kf.push(prev);
      }
      kf.push(idx);
    }
  }
  const end = raw[raw.length - 1];
  const last = kf[kf.length - 1];
  if (last !== undefined && end > last && nfs[end].timeSeconds > nfs[last].timeSeconds + 1e-5) {
    const rbL = getRbFromNetworkFrame(nfs[last], slot);
    if (isRest(rbL) || isRbUpdatedOnFrame(nfs[end], slot) === true) {
      kf.push(end);
    }
  }
  return {
    startNetIdx: raw[0],
    endNetIdx: end,
    keyframeIndices: kf,
    keyframeTimes: buildPhaseAlignedKeyframeTimes(nfs, kf, slot),
  };
}

export function extractEntityLifeSpans(
  nfs: readonly RLRCSourceNetworkFrame[],
  slot: number | 'ball',
  segsAll: readonly RLRCSourceEntityLifeSegment[],
  maxTel = 450
): RLRCEntitySpan[] {
  const segs = slot === 'ball' ? [] : segsAll.filter((s) => s.slotIndex === slot);
  const spans: RLRCEntitySpan[] = [];
  let raw: number[] = [];
  let curSeg = -1;
  let lastRb = -1;

  for (let i = 0; i < nfs.length; i++) {
    const nf = nfs[i];
    const isActive =
      slot === 'ball'
        ? nf.ball.entityActive
        : Boolean(getCarFromNetworkFrame(nf, slot)?.entityActive);
    if (!isActive) {
      if (raw.length) {
        spans.push(buildSpan(nfs, raw, slot));
        raw = [];
      }
      curSeg = -1;
      lastRb = -1;
      continue;
    }
    const si = segs.findIndex(
      (s) => nf.sourceFrame30Hz >= s.startFrame30Hz && nf.sourceFrame30Hz <= s.endFrame30Hz
    );
    const segId = si >= 0 ? segs[si].carActorId * 100000 + si : -1;
    const prev = raw.length ? raw[raw.length - 1] : -1;
    const ko = i > 0 && nf.roundCountdownNumber > 0 && nfs[i - 1].roundCountdownNumber === 0;
    const ref = lastRb >= 0 ? lastRb : prev;
    const cRb = getRbFromNetworkFrame(nf, slot);
    let tel = false;
    let jmp = false;
    if (prev >= 0 && ref >= 0) {
      const rNf = nfs[ref];
      const rRb = getRbFromNetworkFrame(rNf, slot);
      const dt = clamp(nf.timeSeconds - rNf.timeSeconds, nf.deltaSeconds || 1 / 30, 0.12);
      const dist = vDist(cRb.position, rRb.position);
      const secSpd = dist / Math.max(dt, 1e-4);
      const vR = calibrateNetStreamVel(rRb.linearVelocity, secSpd);
      const vC = calibrateNetStreamVel(cRb.linearVelocity, secSpd);
      const e0 = vDist(cRb.position, vAdd(rRb.position, vScale(vR, dt)));
      const e1 = vDist(rRb.position, vSub(cRb.position, vScale(vC, dt)));
      const e2 = vDist(cRb.position, vAdd(rRb.position, vScale(vAdd(vR, vC), 0.5 * dt)));
      const err = Math.min(e0, e1, e2);
      tel = dist > maxTel && err > maxTel;
      jmp = tel || (dist > 25 && err > 40);
    }
    if (prev >= 0 && ((segs.length > 0 && segId !== curSeg) || ko || tel)) {
      if (!jmp) {
        const rRb = getRbFromNetworkFrame(nfs[ref], slot);
        const pRef = raw.indexOf(ref);
        if (pRef > 0 && ref < i && isDupRb(rRb, cRb) && !isRest(rRb)) {
          spans.push(buildSpan(nfs, raw.slice(0, pRef + 1), slot));
          raw = raw.slice(pRef);
        } else {
          raw.push(i);
          spans.push(buildSpan(nfs, raw, slot));
          raw = [];
        }
      } else {
        spans.push(buildSpan(nfs, raw, slot));
        raw = [];
      }
    }
    if (
      !raw.length ||
      isRbUpdatedOnFrame(nf, slot) === true ||
      (ref >= 0 && !isDupRb(getRbFromNetworkFrame(nfs[ref], slot), cRb))
    ) {
      lastRb = i;
    }
    raw.push(i);
    curSeg = segId;
  }
  if (raw.length) spans.push(buildSpan(nfs, raw, slot));
  return spans;
}

export function locateEntitySpanBracket(
  nfs: readonly RLRCSourceNetworkFrame[],
  spans: readonly RLRCEntitySpan[],
  t: number,
  cur: number,
  near: number,
  slot: number | 'ball'
): RLRCEntityBracketMatch | null {
  let sp =
    spans.find(
      (s) =>
        near >= s.startNetIdx &&
        near <= s.endNetIdx &&
        t >= nfs[s.startNetIdx].timeSeconds &&
        t <= nfs[s.endNetIdx].timeSeconds
    ) ??
    spans.find(
      (s) => t >= nfs[s.startNetIdx].timeSeconds - 1e-4 && t <= nfs[s.endNetIdx].timeSeconds + 1e-4
    ) ??
    spans.find((s) => near >= s.startNetIdx && near <= s.endNetIdx);
  if (!sp) {
    const spP = spans.find((s) => s.endNetIdx === cur);
    const spN = spans.find((s) => s.startNetIdx === cur + 1);
    if (spP && (spN || near === cur)) sp = spP;
    else if (spN && near === cur + 1) sp = spN;
  }
  if (!sp || !sp.keyframeIndices.length) return null;
  const kf = sp.keyframeIndices;
  const kt = sp.keyframeTimes;
  const getKfTime = (idx: number): number =>
    kt && kt.length === kf.length ? kt[idx] : nfs[kf[idx]].timeSeconds;
  const last = kf[kf.length - 1];
  if (kf.length === 1 || t <= getKfTime(0)) {
    return { k0Idx: kf[0], k1Idx: kf[0], alpha: 0, dt: 0, rest0: false, rest1: false };
  }
  if (t >= getKfTime(kf.length - 1)) {
    return { k0Idx: last, k1Idx: last, alpha: 0, dt: 0, rest0: false, rest1: false };
  }

  let lo = 0;
  let hi = kf.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >>> 1;
    if (getKfTime(mid) <= t) lo = mid;
    else hi = mid;
  }
  const k0Idx = kf[lo];
  const k1Idx = kf[hi];
  const t0 = getKfTime(lo);
  const dt = getKfTime(hi) - t0;
  const rb0 = getRbFromNetworkFrame(nfs[k0Idx], slot);
  const rb1 = getRbFromNetworkFrame(nfs[k1Idx], slot);
  return {
    k0Idx,
    k1Idx,
    alpha: dt > 1e-6 ? clamp((t - t0) / dt, 0, 1) : 0,
    dt,
    rest0: lo > 0 && isDupRb(getRbFromNetworkFrame(nfs[kf[lo - 1]], slot), rb0),
    rest1: hi + 1 < kf.length && isDupRb(rb1, getRbFromNetworkFrame(nfs[kf[hi + 1]], slot)),
  };
}
