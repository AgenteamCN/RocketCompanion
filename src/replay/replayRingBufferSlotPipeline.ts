/**
 * replayRingBufferSlotPipeline.ts
 * Pure in-place slot population and control snapshot copying pipeline for ReplayRingBuffer.
 */

import { isIncidentEvent, isSystemControlSignal } from '../physics/RocketSimConstants.ts';
import {
  resolveReplayAudioCueForSignal,
  type ReplayAcknowledgedControlEntry,
  type ReplayAudioCue,
  type ReplayCarControlsSnapshot,
  type ReplayRecordFrameOptions,
  type ReplayRecordedIncident,
  type ReplayRingBufferSlot,
  type ReplaySignalEntry,
  type ReplaySignalsOrOptionsArg,
} from './ReplayBufferSliceExtractor.ts';

export interface PopulateRingBufferSlotInput {
  existingSlot: ReplayRingBufferSlot | undefined;
  tick: number;
  stateSnapshot: Float32Array | number[] | null | undefined;
  snapshotFloatLimit: number;
  includeSystemControlSignals: boolean;
  isCountUpMode: boolean;
  signals: ReplaySignalsOrOptionsArg;
  audioEvents: ReadonlyArray<ReplayAudioCue | null | undefined> | null;
  incidents: ReadonlyArray<ReplayRecordedIncident | null | undefined> | null;
  acknowledgedControls: ReadonlyArray<ReplayAcknowledgedControlEntry | null | undefined> | null;
}

function copyControlsSnapshotInPlace(
  target: ReplayCarControlsSnapshot,
  source: ReplayCarControlsSnapshot
): void {
  target.throttle = Number(source.throttle) || 0;
  target.steer = Number(source.steer) || 0;
  target.pitch = Number(source.pitch) || 0;
  target.yaw = Number(source.yaw) || 0;
  target.roll = Number(source.roll) || 0;
  target.jump = Boolean(source.jump);
  target.boost = Boolean(source.boost);
  target.handbrake = Boolean(source.handbrake);
}

function writeControlEntryInPlace(
  outControls: ReplayAcknowledgedControlEntry[],
  writeIdx: number,
  carIndex: number,
  sourceControls: ReplayCarControlsSnapshot
): void {
  const existing = outControls[writeIdx];
  if (existing && existing.controls && typeof existing.controls === 'object') {
    existing.carIndex = carIndex;
    copyControlsSnapshotInPlace(existing.controls, sourceControls);
    return;
  }
  const clonedControls: ReplayCarControlsSnapshot = {
    throttle: 0,
    steer: 0,
    pitch: 0,
    yaw: 0,
    roll: 0,
    jump: false,
    boost: false,
    handbrake: false,
  };
  copyControlsSnapshotInPlace(clonedControls, sourceControls);
  outControls[writeIdx] = { carIndex, controls: clonedControls };
}

/**
 * Allocates or reuses a ring buffer slot in-place and populates its snapshot,
 * signals, audio cues, physics incidents, and acknowledged car controls.
 */
export function populateRingBufferSlot(input: PopulateRingBufferSlotInput): ReplayRingBufferSlot {
  const {
    existingSlot,
    tick,
    stateSnapshot,
    snapshotFloatLimit,
    includeSystemControlSignals,
    isCountUpMode,
    signals,
  } = input;
  let { audioEvents, incidents, acknowledgedControls } = input;

  let resolvedSignals: ReadonlyArray<
    ReplaySignalEntry | ReplayAcknowledgedControlEntry | null | undefined
  > = [];
  if (signals && typeof signals === 'object' && !Array.isArray(signals)) {
    const opts = signals as ReplayRecordFrameOptions;
    resolvedSignals = opts.signals || [];
    audioEvents = opts.audioEvents ?? audioEvents;
    incidents = opts.incidents ?? incidents;
    acknowledgedControls = opts.acknowledgedControls ?? acknowledgedControls;
  } else if (Array.isArray(signals)) {
    resolvedSignals = signals;
  }

  const copyLen = stateSnapshot ? Math.min(stateSnapshot.length, snapshotFloatLimit) : 0;
  let snapshot: Float32Array | null = null;
  if (copyLen > 0 && stateSnapshot) {
    snapshot =
      existingSlot?.snapshot && existingSlot.snapshot.length === copyLen
        ? existingSlot.snapshot
        : new Float32Array(copyLen);
    if (stateSnapshot instanceof Float32Array) {
      snapshot.set(stateSnapshot.subarray(0, copyLen));
    } else {
      for (let i = 0; i < copyLen; i++) snapshot[i] = stateSnapshot[i];
    }
  }

  const outSignals: ReplaySignalEntry[] = Array.isArray(existingSlot?.signals)
    ? existingSlot.signals
    : [];
  const outAudio: ReplayAudioCue[] = Array.isArray(existingSlot?.audioEvents)
    ? existingSlot.audioEvents
    : [];
  const outIncidents: ReplayRecordedIncident[] = Array.isArray(existingSlot?.incidents)
    ? existingSlot.incidents
    : [];
  const outControls: ReplayAcknowledgedControlEntry[] = Array.isArray(
    existingSlot?.acknowledgedControls
  )
    ? existingSlot.acknowledgedControls
    : [];
  outSignals.length = 0;
  outAudio.length = 0;
  outIncidents.length = 0;
  let writeControlIdx = 0;

  if (Array.isArray(resolvedSignals) && resolvedSignals.length > 0) {
    for (let i = 0; i < resolvedSignals.length; i++) {
      const sig = resolvedSignals[i];
      if (!sig || typeof sig !== 'object') continue;
      if ('signalType' in sig && typeof sig.signalType === 'number') {
        if (!includeSystemControlSignals && isSystemControlSignal(sig.signalType)) continue;
        outSignals.push({
          signalId: sig.signalId ?? 0,
          signalType: sig.signalType,
          frameId: sig.frameId ?? tick,
          param1: sig.param1 ?? 0,
          param2: sig.param2 ?? 0,
        });
        const cue = resolveReplayAudioCueForSignal(sig, isCountUpMode);
        if (cue) outAudio.push(cue);
      } else if (!acknowledgedControls) {
        const ctrlCandidate = sig as ReplayAcknowledgedControlEntry;
        if (typeof ctrlCandidate.carIndex === 'number' && ctrlCandidate.controls) {
          writeControlEntryInPlace(
            outControls,
            writeControlIdx++,
            ctrlCandidate.carIndex,
            ctrlCandidate.controls
          );
        }
      }
    }
  }

  if (Array.isArray(audioEvents) && audioEvents.length > 0) {
    for (let i = 0; i < audioEvents.length; i++) {
      const cue = audioEvents[i];
      if (cue) outAudio.push(cue);
    }
  }

  if (Array.isArray(incidents) && incidents.length > 0) {
    for (let i = 0; i < incidents.length; i++) {
      const inc = incidents[i];
      if (inc && isIncidentEvent(inc.type)) outIncidents.push({ ...inc });
    }
  }

  if (Array.isArray(acknowledgedControls) && acknowledgedControls.length > 0) {
    for (let i = 0; i < acknowledgedControls.length; i++) {
      const entry = acknowledgedControls[i];
      if (!entry || typeof entry !== 'object') continue;
      if (typeof entry.carIndex === 'number' && entry.controls) {
        writeControlEntryInPlace(outControls, writeControlIdx++, entry.carIndex, entry.controls);
      } else if ('throttle' in entry || 'steer' in entry || 'boost' in entry || 'jump' in entry) {
        writeControlEntryInPlace(outControls, writeControlIdx++, i, entry);
      }
    }
  }
  outControls.length = writeControlIdx;

  const normalizedTick = tick >>> 0;
  if (existingSlot) {
    existingSlot.tick = normalizedTick;
    existingSlot.snapshot = snapshot;
    existingSlot.signals = outSignals;
    existingSlot.audioEvents = outAudio;
    existingSlot.incidents = outIncidents;
    existingSlot.acknowledgedControls = outControls;
    return existingSlot;
  }

  return {
    tick: normalizedTick,
    snapshot,
    signals: outSignals,
    audioEvents: outAudio,
    incidents: outIncidents,
    acknowledgedControls: outControls,
  };
}
