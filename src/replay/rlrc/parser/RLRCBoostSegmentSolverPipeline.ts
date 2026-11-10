/**
 * RLRCBoostSegmentSolverPipeline.ts
 * Pure mathematical solver pipeline for reconstructing continuous 30Hz per-slot boost curves
 * between sparse ReplicatedBoost anchors, boost active intervals (33.3333%/s drain),
 * grant_count resets, and 34-pad pickup grants (+100 big / +12 small).
 */

export const RLRC_BOOST_DRAIN_RATE_PCT_PER_SEC = (85 / 255) * 100;
export const RLRC_BOOST_CONSUMPTION_RATE_PER_SEC = RLRC_BOOST_DRAIN_RATE_PCT_PER_SEC;
export const RLRC_DEFAULT_SPAWN_BOOST_PCT = (85 / 255) * 100;
export const RLRC_DEFAULT_INITIAL_BOOST = RLRC_DEFAULT_SPAWN_BOOST_PCT;
export const RLRC_BIG_PAD_GRANT_AMOUNT = 100;
export const RLRC_SMALL_PAD_GRANT_AMOUNT = 12;

export interface RLRCSlotFrameBoostSample {
  readonly timeSeconds: number;
  readonly deltaSeconds: number;
  readonly entityActive: boolean;
  readonly carActorId: number;
  readonly spawned: boolean;
  readonly roundCountdownNumber: number;
  readonly boostActive: boolean;
  readonly anchorBoost: number | null;
  readonly grantChanged: boolean;
  readonly padGrant: number;
}

interface RLRCBoostAnchorPoint {
  readonly frameIndex: number;
  readonly boostAmount: number;
  readonly grantChanged: boolean;
}

export function clampBoostAmount(value: number, minVal = 0, maxVal = 100): number {
  return value < minVal ? minVal : value > maxVal ? maxVal : value;
}

export function reconstructSlotBoostTimeline(
  samples: readonly RLRCSlotFrameBoostSample[],
  frameCount: number
): Float64Array {
  const out = new Float64Array(frameCount);
  const count = Math.min(samples.length, frameCount);

  for (let frameIdx = 0; frameIdx < count;) {
    if (!samples[frameIdx].entityActive) {
      out[frameIdx++] = 0;
      continue;
    }

    const segStart = frameIdx;
    let segEnd = frameIdx;
    while (segEnd + 1 < count && samples[segEnd + 1].entityActive) {
      const next = samples[segEnd + 1];
      const prev = samples[segEnd];
      const isKickoffReset =
        next.roundCountdownNumber > 0 && next.roundCountdownNumber !== prev.roundCountdownNumber;
      const isCarSwap =
        next.carActorId >= 0 && prev.carActorId >= 0 && next.carActorId !== prev.carActorId;
      if (next.spawned || isCarSwap || isKickoffReset) {
        break;
      }
      segEnd++;
    }

    solveBoostLifeSegment(samples, segStart, segEnd, out);
    frameIdx = segEnd + 1;
  }

  return out;
}

function solveBoostLifeSegment(
  samples: readonly RLRCSlotFrameBoostSample[],
  segStart: number,
  segEnd: number,
  out: Float64Array
): void {
  const stepDt = (k: number): number => {
    const wallDt = samples[k].timeSeconds - samples[k - 1].timeSeconds;
    const rawDt =
      wallDt > 1e-5 ? wallDt : samples[k].deltaSeconds > 1e-5 ? samples[k].deltaSeconds : 1 / 30;
    return clampBoostAmount(rawDt, 1 / 240, 0.25);
  };

  const stepActiveSec = (k: number): number => {
    const dt = stepDt(k);
    if (samples[k].boostActive) return dt;
    if (samples[k - 1].boostActive) return 0.5 * dt;
    return 0;
  };

  const explicitAnchors: RLRCBoostAnchorPoint[] = [];
  for (let k = segStart; k <= segEnd; k++) {
    const anchor = samples[k].anchorBoost;
    if (anchor !== null) {
      explicitAnchors.push({
        frameIndex: k,
        boostAmount: clampBoostAmount(anchor),
        grantChanged: samples[k].grantChanged,
      });
    }
  }

  let initialBoost =
    samples[segStart].anchorBoost !== null
      ? clampBoostAmount(samples[segStart].anchorBoost!)
      : RLRC_DEFAULT_SPAWN_BOOST_PCT;

  if (samples[segStart].anchorBoost === null && samples[segStart].padGrant > 0) {
    initialBoost = clampBoostAmount(initialBoost + samples[segStart].padGrant);
  }

  if (samples[segStart].anchorBoost === null && explicitAnchors.length > 0) {
    const firstAnchor = explicitAnchors[0];
    let activeSec = 0;
    let padSum = samples[segStart].padGrant;
    for (let k = segStart + 1; k <= firstAnchor.frameIndex; k++) {
      activeSec += stepActiveSec(k);
      padSum += samples[k].padGrant;
    }
    const isMidGameInitialJoin =
      !samples[segStart].spawned &&
      segStart === 0 &&
      samples[0].roundCountdownNumber === 0 &&
      !firstAnchor.grantChanged;
    if (
      padSum === 0 &&
      ((firstAnchor.frameIndex - segStart <= 3 && activeSec === 0) || isMidGameInitialJoin)
    ) {
      initialBoost = clampBoostAmount(
        firstAnchor.boostAmount + activeSec * RLRC_BOOST_DRAIN_RATE_PCT_PER_SEC
      );
    }
  }

  const anchors: RLRCBoostAnchorPoint[] =
    explicitAnchors.length > 0 && explicitAnchors[0].frameIndex === segStart
      ? explicitAnchors
      : [
          {
            frameIndex: segStart,
            boostAmount: initialBoost,
            grantChanged: false,
          },
          ...explicitAnchors,
        ];

  out[segStart] = anchors[0].boostAmount;
  for (let m = 0; m + 1 < anchors.length; m++) {
    solveBoostSpanBetweenAnchors(
      samples,
      anchors[m].frameIndex,
      anchors[m + 1].frameIndex,
      anchors[m].boostAmount,
      anchors[m + 1].boostAmount,
      anchors[m + 1].grantChanged,
      stepDt,
      stepActiveSec,
      out
    );
  }

  const lastAnchor = anchors[anchors.length - 1];
  let currentBoost = lastAnchor.boostAmount;
  out[lastAnchor.frameIndex] = currentBoost;
  for (let k = lastAnchor.frameIndex + 1; k <= segEnd; k++) {
    if (samples[k].padGrant > 0) {
      currentBoost = clampBoostAmount(currentBoost + samples[k].padGrant);
    }
    currentBoost = clampBoostAmount(
      currentBoost - stepActiveSec(k) * RLRC_BOOST_DRAIN_RATE_PCT_PER_SEC
    );
    out[k] = currentBoost;
  }
}

function solveBoostSpanBetweenAnchors(
  samples: readonly RLRCSlotFrameBoostSample[],
  a0: number,
  a1: number,
  b0: number,
  b1: number,
  grantChangedAtEnd: boolean,
  stepDt: (k: number) => number,
  stepActiveSec: (k: number) => number,
  out: Float64Array
): void {
  if (a1 <= a0) {
    out[a1] = b1;
    return;
  }

  let activeSec = 0;
  let spanSec = 0;
  let midPadGrants = 0;
  let forwardBoost = b0;

  for (let k = a0 + 1; k <= a1; k++) {
    if (k < a1 && samples[k].padGrant > 0) {
      midPadGrants += samples[k].padGrant;
      forwardBoost = clampBoostAmount(forwardBoost + samples[k].padGrant);
    }
    const act = stepActiveSec(k);
    activeSec += act;
    spanSec += stepDt(k);
    forwardBoost = clampBoostAmount(forwardBoost - act * RLRC_BOOST_DRAIN_RATE_PCT_PER_SEC);
    out[k] = forwardBoost;
  }

  const endPadGrant = samples[a1].padGrant;

  // Case 1: Pure boost drain between anchors (no grant_count change and no pad pickups)
  if (!grantChangedAtEnd && midPadGrants === 0 && endPadGrant === 0 && b1 <= b0 + 0.5) {
    const actualDrop = Math.max(0, b0 - b1);
    if (actualDrop <= 1e-4) {
      for (let k = a0 + 1; k <= a1; k++) {
        out[k] = b1;
      }
      return;
    }

    if (activeSec > 1e-5) {
      const nominalDrop = activeSec * RLRC_BOOST_DRAIN_RATE_PCT_PER_SEC;
      const activeDrop = Math.min(
        actualDrop,
        2.2 * nominalDrop <= actualDrop ? 1.8 * nominalDrop : actualDrop
      );
      const residualDrop = Math.max(0, actualDrop - activeDrop);
      let cur = b0;
      for (let k = a0 + 1; k < a1; k++) {
        cur -=
          activeDrop * (stepActiveSec(k) / activeSec) +
          (residualDrop > 0 && spanSec > 1e-5 ? residualDrop * (stepDt(k) / spanSec) : 0);
        out[k] = clampBoostAmount(cur, b1, b0);
      }
      out[a1] = b1;
      return;
    }

    // Fallback when server anchor dropped without a replicated Boost_TA:ReplicatedActive edge
    const drainWindowSec = Math.max(0.12, (actualDrop / RLRC_BOOST_DRAIN_RATE_PCT_PER_SEC) * 1.25);
    const windowStartTime = Math.max(
      samples[a0].timeSeconds,
      samples[a1].timeSeconds - drainWindowSec
    );
    let windowDur = 0;
    for (let k = a0 + 1; k <= a1; k++) {
      if (samples[k].timeSeconds > windowStartTime) {
        windowDur += stepDt(k);
      }
    }
    let cur = b0;
    for (let k = a0 + 1; k < a1; k++) {
      if (samples[k].timeSeconds > windowStartTime && windowDur > 1e-5) {
        cur -= actualDrop * (stepDt(k) / windowDur);
      }
      out[k] = clampBoostAmount(cur, b1, b0);
    }
    out[a1] = b1;
    return;
  }

  // Case 2: Small boost pad pickup (+12) landed at anchor a1 while draining prior to a1
  if (
    !grantChangedAtEnd &&
    midPadGrants === 0 &&
    b1 < 99.0 &&
    (endPadGrant === RLRC_SMALL_PAD_GRANT_AMOUNT || b1 > forwardBoost + 6.0)
  ) {
    const prePickupTarget = Math.max(0, b1 - RLRC_SMALL_PAD_GRANT_AMOUNT);
    if (prePickupTarget <= b0 + 0.5 && activeSec > 1e-5) {
      const prePickupDrop = Math.max(0, b0 - prePickupTarget);
      if (prePickupDrop <= 2.2 * activeSec * RLRC_BOOST_DRAIN_RATE_PCT_PER_SEC) {
        let cur = b0;
        for (let k = a0 + 1; k < a1; k++) {
          cur -= prePickupDrop * (stepActiveSec(k) / activeSec);
          out[k] = clampBoostAmount(cur, prePickupTarget, b0);
        }
      }
    }
  }

  out[a1] = b1;
}
