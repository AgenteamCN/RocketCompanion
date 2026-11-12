/**
 * RLRCHermiteSlerpResampler.ts
 * Bookmark alignment and 120Hz timeline resampling for RLRC replays.
 */

import { encodeRLRCFramesToTrack0Bytes } from '../container/RLRCBinaryContainerCodec.ts';
import {
  createParkedCarRigidBody,
  RLRC_BALL_MAX_SPEED_UU_S,
  RLRC_CAR_MAX_SPEED_UU_S,
  RLRC_SUPERSONIC_MAINTAIN_SPEED_UU_S,
  RLRC_SUPERSONIC_SPEED_UU_S,
} from '../parser/RLRCNetStreamAttributeDecoders.ts';
import {
  RLRC_BOOST_PAD_COUNT,
  RLRC_FIXED_DT,
  RLRC_MAX_PLAYER_SLOTS,
  RLRC_TICK_RATE,
  type RLRCBallFrameState120Hz,
  type RLRCBookmarkRecord,
  type RLRCCarFrameState120Hz,
  type RLRCFrame120Hz,
  type RLRCInterpolationMethod,
  type RLRCParserOutput,
  type RLRCResamplerOutput,
  type RLRCSourceNetworkFrame,
} from '../RLRCReplayTypes.ts';
import {
  extractEntityLifeSpans,
  getCarFromNetworkFrame,
  locateEntitySpanBracket,
  type RLRCEntitySpan,
} from './RLRCEntityLifeSpanBuilder.ts';
import {
  clamp,
  interpolateRigidBodyHermiteSlerp,
  lerp,
  toRest,
  vLen,
  ZERO_CTRL,
  ZERO_FLAGS,
  type RLRCOrthonormalBasis,
} from './RLRCHermiteSlerpMathPipeline.ts';

export type { RLRCEntitySpan, RLRCOrthonormalBasis };

export interface RLRCResamplerOptions {
  readonly method?: RLRCInterpolationMethod;
  readonly boostPadCooldownsByFrame120Hz?: readonly Float32Array[];
  readonly maxTeleportDistanceUu?: number;
  readonly skipTrack0Pack?: boolean;
  readonly deferTrack0Packing?: boolean;
}

const ZERO_PAD_COOLDOWNS = new Float32Array(RLRC_BOOST_PAD_COUNT);

export function alignBookmarksTo120Hz(
  bms: readonly RLRCBookmarkRecord[],
  nfs: readonly RLRCSourceNetworkFrame[],
  frames: readonly RLRCFrame120Hz[],
  fps = 30
): RLRCBookmarkRecord[] {
  if (!frames.length) return [];
  const t0 = frames[0].timeSeconds;
  const maxIdx = frames.length - 1;
  const rFps = fps > 0 ? fps : 30;
  return bms.map((bm) => {
    let t = bm.timeSeconds;
    let best = nfs[0];
    for (const nf of nfs) {
      if (
        Math.abs(nf.sourceFrame30Hz - bm.sourceFrame30Hz) <
        Math.abs(best.sourceFrame30Hz - bm.sourceFrame30Hz)
      ) {
        best = nf;
      }
    }
    if (
      best &&
      (Math.abs(best.sourceFrame30Hz - bm.sourceFrame30Hz) <= 2 || !Number.isFinite(t) || t <= 0)
    ) {
      t = best.timeSeconds;
    } else if (!Number.isFinite(t) || t <= 0) {
      t = t0 + bm.sourceFrame30Hz / rFps;
    }
    const idx = clamp(Math.round((t - t0) * RLRC_TICK_RATE), 0, maxIdx);
    return { ...bm, frameIndex120Hz: idx, timeSeconds: frames[idx].timeSeconds };
  });
}

export function resampleRLRCReplayTo120Hz(
  parsed: RLRCParserOutput,
  opts: RLRCResamplerOptions = {}
): RLRCResamplerOutput {
  const method = opts.method ?? 'hermite-clamped';
  const maxTel = opts.maxTeleportDistanceUu ?? 450;
  const nfs = parsed.networkFrames;
  const slots = Math.min(
    RLRC_MAX_PLAYER_SLOTS,
    Math.max(parsed.roster.length, nfs[0]?.cars.length ?? 0)
  );
  if (!nfs.length) {
    return {
      header: { ...parsed.header, frameCount120Hz: 0, durationSeconds: 0 },
      roster: parsed.roster,
      bookmarks: [],
      frames120Hz: [],
      stateInputTrackBytes: new Uint8Array(0),
    };
  }

  const t0 = nfs[0].timeSeconds;
  const tEnd = nfs[nfs.length - 1].timeSeconds;
  const dur = Math.max(0, tEnd - t0);
  const count = Math.max(1, Math.round(dur * RLRC_TICK_RATE) + 1);
  const bSpans = extractEntityLifeSpans(nfs, 'ball', parsed.lifeSegments ?? [], maxTel);
  const cSpans = Array.from({ length: slots }, (_, s) =>
    extractEntityLifeSpans(nfs, s, parsed.lifeSegments ?? [], maxTel)
  );
  const frames120Hz: RLRCFrame120Hz[] = new Array(count);
  const slotSupersonic = new Uint8Array(slots);

  for (let f = 0, cur = 0; f < count; f++) {
    const t = Math.min(tEnd, t0 + f * RLRC_FIXED_DT);
    while (cur + 1 < nfs.length && nfs[cur + 1].timeSeconds <= t) cur++;
    const nxtIdx = Math.min(nfs.length - 1, cur + 1);
    const curNf = nfs[cur];
    const nxtNf = nfs[nxtIdx];
    const near = Math.abs(nxtNf.timeSeconds - t) < Math.abs(t - curNf.timeSeconds) ? nxtIdx : cur;
    const ref = nfs[near];
    const localDt = nxtNf.timeSeconds - curNf.timeSeconds;
    const localAlpha = localDt > 1e-6 ? clamp((t - curNf.timeSeconds) / localDt, 0, 1) : 0;

    const bb = locateEntitySpanBracket(nfs, bSpans, t, cur, near, 'ball');
    const b0 = bb ? nfs[bb.k0Idx].ball.rigidBody : ref.ball.rigidBody;
    const b1 = bb ? nfs[bb.k1Idx].ball.rigidBody : ref.ball.rigidBody;
    const ball: RLRCBallFrameState120Hz = bb
      ? {
          entityActive: true,
          rigidBody: interpolateRigidBodyHermiteSlerp(
            bb.rest0 ? toRest(b0) : b0,
            bb.rest1 ? toRest(b1) : b1,
            bb.alpha,
            bb.dt,
            method,
            RLRC_BALL_MAX_SPEED_UU_S
          ),
        }
      : { entityActive: false, rigidBody: ref.ball.rigidBody };

    const rosterCount = parsed.roster.length;
    const cars: RLRCCarFrameState120Hz[] = new Array(slots);
    for (let s = 0; s < slots; s++) {
      const rCar = getCarFromNetworkFrame(ref, s);
      const cb =
        rosterCount > 0 && s >= rosterCount
          ? null
          : locateEntitySpanBracket(nfs, cSpans[s], t, cur, near, s);
      if (cb && rCar) {
        const c0 = getCarFromNetworkFrame(nfs[cb.k0Idx], s) ?? rCar;
        const c1 = getCarFromNetworkFrame(nfs[cb.k1Idx], s) ?? rCar;
        const nCar = cb.alpha < 0.5 ? c0 : c1;
        const rb = interpolateRigidBodyHermiteSlerp(
          cb.rest0 ? toRest(c0.rigidBody) : c0.rigidBody,
          cb.rest1 ? toRest(c1.rigidBody) : c1.rigidBody,
          cb.alpha,
          cb.dt,
          method,
          RLRC_CAR_MAX_SPEED_UU_S
        );
        const curCar = getCarFromNetworkFrame(curNf, s);
        const nxtCar = getCarFromNetworkFrame(nxtNf, s);
        const boostAmount =
          curCar?.entityActive && nxtCar?.entityActive
            ? clamp(lerp(curCar.boostAmount, nxtCar.boostAmount, localAlpha), 0, 100)
            : clamp(lerp(c0.boostAmount, c1.boostAmount, cb.alpha), 0, 100);
        const sourceBoosting = Boolean(
          rCar.activeFlags.boostActive || c0.activeFlags.boostActive || c1.activeFlags.boostActive
        );
        const boostConsumed =
          (curCar && nxtCar && curCar.boostAmount - nxtCar.boostAmount > 0.05) ||
          c0.boostAmount - c1.boostAmount > 0.05;
        const allowBoost = sourceBoosting || (boostConsumed && boostAmount > 0.5);
        const activeFlags =
          allowBoost === rCar.activeFlags.boostActive
            ? rCar.activeFlags
            : { ...rCar.activeFlags, boostActive: allowBoost };
        const controls =
          allowBoost === rCar.controls.boost
            ? rCar.controls
            : { ...rCar.controls, boost: allowBoost };
        const upZ = 1 - 2 * (rb.rotation.x * rb.rotation.x + rb.rotation.y * rb.rotation.y);
        const isOnGround =
          !activeFlags.doubleJumpActive &&
          !activeFlags.dodgeActive &&
          ((rb.position.z <= 20.5 && Math.abs(rb.linearVelocity.z) < 25 && upZ >= 0.7) ||
            (c0.isOnGround && c1.isOnGround && rb.position.z <= 22.0));
        const speed = vLen(rb.linearVelocity);
        const wasSupersonic = slotSupersonic[s] === 1;
        const isSupersonic =
          ref.roundCountdownNumber === 0 &&
          (wasSupersonic
            ? speed >= RLRC_SUPERSONIC_MAINTAIN_SPEED_UU_S
            : speed >= RLRC_SUPERSONIC_SPEED_UU_S);
        slotSupersonic[s] = isSupersonic ? 1 : 0;
        cars[s] = {
          slotIndex: s,
          entityActive: true,
          isDemolished: false,
          rigidBody: rb,
          boostAmount,
          isOnGround,
          isSupersonic,
          hasFlipOrJump: nCar.hasFlipOrJump,
          airTimeSinceJump: lerp(c0.airTimeSinceJump, c1.airTimeSinceJump, cb.alpha),
          activeFlags,
          controls,
        };
      } else {
        slotSupersonic[s] = 0;
        const isOutOfRoster = rosterCount > 0 && s >= rosterCount;
        const isDemolished = !isOutOfRoster && Boolean(rCar?.isDemolished);
        const parkedRb = isDemolished && rCar ? rCar.rigidBody : createParkedCarRigidBody(s);
        cars[s] = {
          slotIndex: s,
          entityActive: false,
          isDemolished,
          rigidBody: parkedRb,
          boostAmount: 0,
          isOnGround: false,
          isSupersonic: false,
          hasFlipOrJump: false,
          airTimeSinceJump: 0,
          activeFlags: ZERO_FLAGS,
          controls: ZERO_CTRL,
        };
      }
    }

    const pads = opts.boostPadCooldownsByFrame120Hz?.[f];
    const boostPadCooldowns =
      pads && pads.length >= RLRC_BOOST_PAD_COUNT
        ? pads.length === RLRC_BOOST_PAD_COUNT
          ? pads
          : pads.subarray(0, RLRC_BOOST_PAD_COUNT)
        : ZERO_PAD_COOLDOWNS;
    const {
      sourceFrame30Hz,
      secondsRemaining,
      isOvertime,
      roundCountdownNumber,
      blueScore,
      orangeScore,
    } = ref;
    frames120Hz[f] = {
      frameIndex120Hz: f,
      sourceFrame30Hz,
      timeSeconds: t,
      secondsRemaining,
      isOvertime,
      roundCountdownNumber,
      blueScore,
      orangeScore,
      ball,
      cars,
      boostPadCooldowns,
    };
  }

  return {
    header: { ...parsed.header, frameCount120Hz: count, durationSeconds: dur },
    roster: parsed.roster,
    bookmarks: alignBookmarksTo120Hz(
      parsed.bookmarks ?? [],
      nfs,
      frames120Hz,
      parsed.header?.recordFps ?? 30
    ),
    frames120Hz,
    stateInputTrackBytes:
      opts.skipTrack0Pack || opts.deferTrack0Packing
        ? new Uint8Array(0)
        : encodeRLRCFramesToTrack0Bytes(frames120Hz),
  };
}
