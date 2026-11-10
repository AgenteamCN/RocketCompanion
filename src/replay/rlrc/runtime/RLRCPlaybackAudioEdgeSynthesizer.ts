/**
 * RLRCPlaybackAudioEdgeSynthesizer.ts
 * Stateful 120Hz audio edge synthesizer and dispatcher for RLRC Replay playback.
 */

import { gameAudio } from '../../../audio/GameAudioEngineFacade.ts';
import type { CameraTransformLike } from '../../../audio/SpatialAudioSource.ts';
import type { PhysicsImpactAudioEvent } from '../../../audio/WorldImpactAudioHandler.ts';
import { INCIDENT_EVENT_TYPES as EV } from '../../../physics/RocketSimConstants.ts';
import type { RLRCConvertedReplaySession } from '../RLReplayToRLRCConverter.ts';
import type {
  RLRCBookmarkRecord,
  RLRCFrame120Hz as Frame,
  RLRCPlayerSlotMeta,
} from '../RLRCReplayTypes.ts';
import {
  detectBallAndGoalAudioEdges,
  detectCarAndPadAudioEdges,
  detectCollisionAndDemoAudioEdges,
  detectMatchStateAndBookmarkAudioEdges,
  type AudioEdgeTrackerState,
  type AudioVec3Tuple,
  type RLRCSynthesizedAudioFrameBatch,
  type RLRCSynthesizedDirectCueEvent,
  type RLRCSynthesizedDiscreteAudioEvent,
  type SoundCueId,
} from './RLRCPlaybackAudioEdgeDetectorPipeline.ts';
import type { RLRCPlaybackRuntimePort } from './RLRCPlaybackSyncApplier.ts';

export type {
  RLRCSynthesizedAudioFrameBatch,
  RLRCSynthesizedDirectCueEvent,
  RLRCSynthesizedDiscreteAudioEvent,
  SoundCueId,
};

function toImpactAudioEvent(e: RLRCSynthesizedDiscreteAudioEvent): PhysicsImpactAudioEvent {
  const [x = 0, y = 0, z = 0] = e.pos ?? [0, 0, 0];
  const base = { type: e.eventType, x, y, z, posX: x, posY: y, posZ: z };
  switch (e.eventType) {
    case EV.CAR_BALL_HIT:
      return { ...base, carIndex: e.entityA, impulse: e.value, relSpeed: e.value };
    case EV.BALL_GOALPOST_HIT:
    case EV.BALL_WORLD_HIT:
      return { ...base, impulse: e.value, normalRelVel: e.value };
    case EV.CAR_CAR_BUMP:
      return {
        ...base,
        carIndex: e.entityA,
        car1Index: e.entityA,
        car2Index: e.entityB,
        secondaryId: e.entityB,
        impulse: e.value,
        relSpeed: e.value,
      };
    case EV.CAR_CAR_DEMO:
      return {
        ...base,
        carIndex: e.entityB,
        car1Index: e.entityA,
        car2Index: e.entityB,
        secondaryId: e.entityB,
      };
    case EV.BOOST_PICKUP:
      return {
        ...base,
        carIndex: e.entityA,
        padIndex: e.entityB,
        secondaryId: e.entityB,
        isBig: e.value >= 0.5,
      };
    default:
      return { ...base, carIndex: e.entityA, secondaryId: e.entityB };
  }
}

export interface RLRCPlaybackAudioDispatchTarget {
  handleEvent?(
    tOrEvent: number | PhysicsImpactAudioEvent,
    aOrCamera?: number | CameraTransformLike | null,
    b?: number,
    v?: number,
    pos?: AudioVec3Tuple
  ): void;
  play?(
    id: SoundCueId,
    volOrOpts?:
      | number
      | {
          volume?: number;
          pitch?: number;
          isPov?: boolean;
          pos?: AudioVec3Tuple;
          dist?: number;
        }
  ): void;
}

export interface RLRCPlaybackAudioRuntimePort extends RLRCPlaybackRuntimePort {
  audio?: RLRCPlaybackAudioDispatchTarget | null;
  camera?: { camera?: CameraTransformLike | null } | CameraTransformLike | null;
  options?: { gameAudio?: RLRCPlaybackAudioDispatchTarget | null } | null;
}

export interface RLRCPlaybackAudioStepOptions {
  smoothStep?: boolean;
  activePovSlotIndex?: number;
  activePovSlot?: number;
  runtime?: RLRCPlaybackAudioRuntimePort | null;
  audio?: RLRCPlaybackAudioDispatchTarget | null;
  camera?: CameraTransformLike | null;
  session?: RLRCConvertedReplaySession | null;
  bookmarks?: readonly RLRCBookmarkRecord[] | null;
  roster?: readonly RLRCPlayerSlotMeta[] | null;
}

export class RLRCPlaybackAudioEdgeSynthesizer {
  private prev: Frame | null = null;
  private anchor: Frame | null = null;
  private readonly ring: Frame[] = [];
  private povSlot = 0;
  private runtimeRef: RLRCPlaybackAudioRuntimePort | null = null;
  private audioOverride: RLRCPlaybackAudioDispatchTarget | null = null;
  private bookmarks: readonly RLRCBookmarkRecord[] = [];
  private readonly tracker: AudioEdgeTrackerState = {
    lastHitTick: -999,
    lastGoalTick: -999,
    lastOtTick: -999,
    lastCdNum: 0,
    lastBump: new Int32Array(8).fill(-999),
    lastDemo: new Int32Array(8).fill(-999),
    firedBm: new Set<number>(),
  };

  public reset(): void {
    this.prev = null;
    this.anchor = null;
    this.ring.length = 0;
    this.tracker.lastCdNum = 0;
    this.tracker.lastHitTick = -999;
    this.tracker.lastGoalTick = -999;
    this.tracker.lastOtTick = -999;
    this.tracker.lastBump.fill(-999);
    this.tracker.lastDemo.fill(-999);
    this.tracker.firedBm.clear();
  }

  public primeFrame(f: Frame | null): void {
    this.prev = f;
    this.anchor = f;
    this.ring.length = 0;
    if (f) {
      this.ring.push(f);
      this.tracker.lastCdNum = f.roundCountdownNumber;
    }
  }

  public setActivePovSlot = (s: number): void => {
    if (Number.isFinite(s) && s >= 0) this.povSlot = s | 0;
  };

  public setRuntime = (rt?: RLRCPlaybackAudioRuntimePort | null): void => {
    this.runtimeRef = rt ?? null;
  };

  public setAudioTarget = (a?: RLRCPlaybackAudioDispatchTarget | null): void => {
    this.audioOverride = a ?? null;
  };

  public configureSession = (
    s?: RLRCConvertedReplaySession | null,
    rt?: RLRCPlaybackAudioRuntimePort | null
  ): void => {
    this.reset();
    if (rt !== undefined) this.runtimeRef = rt;
    this.bookmarks = s?.bookmarks ?? [];
  };

  public stepFrame(
    frame: Frame,
    o?: RLRCPlaybackAudioStepOptions | number,
    sm?: boolean
  ): RLRCSynthesizedAudioFrameBatch {
    let smooth = typeof sm === 'boolean' ? sm : true;
    let aud: RLRCPlaybackAudioDispatchTarget | null = null;
    let camOverride: CameraTransformLike | null = null;
    if (typeof o === 'number') {
      this.setActivePovSlot(o);
    } else if (o) {
      const pov = o.activePovSlotIndex ?? o.activePovSlot;
      if (typeof pov === 'number') this.setActivePovSlot(pov);
      if (typeof o.smoothStep === 'boolean') smooth = o.smoothStep;
      if (o.runtime !== undefined) this.runtimeRef = o.runtime;
      if (o.audio !== undefined) aud = o.audio;
      if (o.camera !== undefined) camOverride = o.camera;
      if (o.session?.bookmarks) this.bookmarks = o.session.bookmarks;
      if (o.bookmarks) this.bookmarks = o.bookmarks;
    }
    const prev = this.prev;
    const dt = prev ? frame.frameIndex120Hz - prev.frameIndex120Hz : 0;
    const batch: RLRCSynthesizedAudioFrameBatch = { discreteEvents: [], directCues: [] };
    if (!smooth || !prev || dt < 1 || dt > 6) {
      this.primeFrame(frame);
      return batch;
    }
    const anc = this.anchor ?? prev;
    detectCarAndPadAudioEdges(prev, frame, this.povSlot, batch);
    detectBallAndGoalAudioEdges(prev, anc, frame, this.tracker, batch);
    detectCollisionAndDemoAudioEdges(prev, anc, frame, this.tracker, batch);
    detectMatchStateAndBookmarkAudioEdges(prev, frame, this.bookmarks, this.tracker, batch);
    this.prev = frame;
    this.ring.push(frame);
    if (this.ring.length > 5) this.ring.shift();
    this.anchor = this.ring[0] ?? frame;
    this.dispatchBatch(batch, aud, camOverride);
    return batch;
  }

  private dispatchBatch(
    b: RLRCSynthesizedAudioFrameBatch,
    ov?: RLRCPlaybackAudioDispatchTarget | null,
    camOverride?: CameraTransformLike | null
  ): void {
    const rt = this.runtimeRef;
    const rawCam =
      camOverride ??
      (rt?.camera && 'camera' in rt.camera
        ? rt.camera.camera
        : (rt?.camera as CameraTransformLike | null)) ??
      null;
    const custom =
      ov ?? (rt?.audio?.handleEvent || rt?.audio?.play ? rt.audio : this.audioOverride);
    if (custom) {
      if (custom.handleEvent) {
        for (const e of b.discreteEvents) {
          custom.handleEvent(e.eventType, e.entityA, e.entityB, e.value, e.pos);
        }
      }
      if (custom.play) {
        for (const c of b.directCues) {
          custom.play(c.cueId, {
            volume: c.volume,
            pitch: c.pitch,
            isPov: c.isPov,
            pos: c.pos,
          });
        }
      }
      return;
    }
    const aud = (rt?.options?.gameAudio as typeof gameAudio | undefined) || gameAudio;
    if (!aud) return;
    for (const e of b.discreteEvents) aud.handleEvent(toImpactAudioEvent(e), rawCam);
    for (const c of b.directCues) aud.play(c.cueId, c.volume ?? 1.0);
  }
}

export default RLRCPlaybackAudioEdgeSynthesizer;
