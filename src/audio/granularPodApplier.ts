/**
 * granularPodApplier.ts
 * Applies a Rust `CarAcousticLoopPod` slice to a `TurtleModemGranularVoiceGraph`.
 * No slice selection, crossfade, or filter math runs here, so Rust stays the only
 * powertrain/granular authority and TypeScript only touches WebAudio params.
 */

export interface GranularPodCue {
  enginePitch: number;
  filterCutoffHz: number;
  idleGain: number;
  lowerSliceIndex: number;
  upperSliceIndex: number;
  lowerSliceGain: number;
  upperSliceGain: number;
  lowerSliceRate: number;
  upperSliceRate: number;
}

export interface GranularPodChannel {
  readonly sourceSliceIndex: number;
  readonly meta: { readonly freq: number };
  readonly onSource: AudioBufferSourceNode;
  readonly offSource: AudioBufferSourceNode | null;
  readonly onGain: GainNode;
  readonly offGain: GainNode | null;
}

export interface GranularPodTarget {
  readonly graphBuilt: boolean;
  readonly ctx: AudioContext;
  readonly lowpassNode: BiquadFilterNode;
  readonly idleSource: AudioBufferSourceNode | null;
  readonly idleGain: GainNode | null;
  readonly sliceChannels: readonly GranularPodChannel[];
  readonly sliceFreqHzByIndex: readonly number[];
}

const FILTER_POD_TAU_SEC = 0.02;
const PLAYBACK_RATE_TAU_SEC = 0.02;
const GAIN_POD_TAU_SEC = 0.012;

export function applyGranularPodCue(graph: GranularPodTarget, cue: GranularPodCue): void {
  if (!graph.graphBuilt || graph.sliceChannels.length === 0) return;
  const now = graph.ctx.currentTime;
  const cutoff = Number.isFinite(cue.filterCutoffHz)
    ? Math.max(400, Math.min(20000, cue.filterCutoffHz))
    : 12000;
  graph.lowpassNode.frequency.setTargetAtTime(cutoff, now, FILTER_POD_TAU_SEC);

  if (graph.idleSource) {
    const pitch = Number.isFinite(cue.enginePitch)
      ? Math.max(0.5, Math.min(2.4, cue.enginePitch))
      : 1;
    graph.idleSource.playbackRate.setTargetAtTime(pitch, now, PLAYBACK_RATE_TAU_SEC);
  }
  if (graph.idleGain) {
    const gain = Number.isFinite(cue.idleGain) ? Math.max(0, Math.min(2, cue.idleGain)) : 0;
    graph.idleGain.gain.setTargetAtTime(gain, now, GAIN_POD_TAU_SEC);
  }

  const lowerChannel = resolveChannel(graph.sliceChannels, cue.lowerSliceIndex);
  const upperChannel =
    cue.upperSliceIndex === cue.lowerSliceIndex
      ? null
      : resolveChannel(graph.sliceChannels, cue.upperSliceIndex);
  const targetFreq = resolveTargetFrequency(graph, cue, lowerChannel);

  for (const channel of graph.sliceChannels) {
    const isLower = channel === lowerChannel;
    const isUpper = upperChannel !== null && channel === upperChannel;
    const rawGain = isLower ? cue.lowerSliceGain : 0;
    const totalGain = isUpper ? rawGain + cue.upperSliceGain : rawGain;
    const gain = Number.isFinite(totalGain) ? Math.max(0, Math.min(4, totalGain)) : 0;
    channel.onGain.gain.setTargetAtTime(gain, now, GAIN_POD_TAU_SEC);
    if (channel.offGain) channel.offGain.gain.setTargetAtTime(0, now, GAIN_POD_TAU_SEC);
    if (gain <= 0) continue;
    const rate = targetFreq > 0 ? targetFreq / Math.max(15, channel.meta.freq) : cue.lowerSliceRate;
    channel.onSource.playbackRate.setTargetAtTime(
      Math.max(0.5, Math.min(2.0, Number.isFinite(rate) ? rate : 1)),
      now,
      PLAYBACK_RATE_TAU_SEC
    );
    if (channel.offSource) {
      channel.offSource.playbackRate.setTargetAtTime(1, now, PLAYBACK_RATE_TAU_SEC);
    }
  }
}

function resolveChannel(
  channels: readonly GranularPodChannel[],
  sliceIndex: number
): GranularPodChannel | null {
  let best: GranularPodChannel | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const channel of channels) {
    const delta = Math.abs(channel.sourceSliceIndex - sliceIndex);
    if (delta < bestDelta) {
      best = channel;
      bestDelta = delta;
    }
    if (delta === 0) break;
  }
  return best;
}

function resolveTargetFrequency(
  graph: GranularPodTarget,
  cue: GranularPodCue,
  lowerChannel: GranularPodChannel | null
): number {
  const lowerFreq = graph.sliceFreqHzByIndex[Math.round(cue.lowerSliceIndex)];
  if (Number.isFinite(lowerFreq) && lowerFreq > 0 && Number.isFinite(cue.lowerSliceRate)) {
    return lowerFreq * cue.lowerSliceRate;
  }
  if (!lowerChannel) return 0;
  return lowerChannel.meta.freq * (Number.isFinite(cue.lowerSliceRate) ? cue.lowerSliceRate : 1);
}
