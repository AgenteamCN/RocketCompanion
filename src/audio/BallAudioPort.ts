/**
 * BallAudioPort.ts
 * Stable ball-audio facade consumed by the WASM cue bridge and the diagnostics layer.
 * Owns only the `BallLoopAudioGraph`; every acoustic value arrives from Rust cue pods.
 */

import { BallLoopAudioGraph, type BallLoopCue } from './BallLoopAudioGraph.ts';
import { getAudioContext } from './audioContext.ts';

export interface BallAudioBuffersLike {
  ballRolling?: AudioBuffer | null;
  ballFlying?: AudioBuffer | null;
}

export class BallAudioPort {
  readonly graph = new BallLoopAudioGraph();
  initialized = true;
  position = { x: 0, y: 0, z: 0 };
  ballRollingBuffer: AudioBuffer | null = null;
  ballFlyingBuffer: AudioBuffer | null = null;

  get context(): AudioContext | null {
    return this.graph.context || getAudioContext();
  }

  get ballPanner(): PannerNode | null {
    return this.graph.panner;
  }

  get rollingSource(): AudioBufferSourceNode | null {
    return this.graph.rollingSource;
  }

  get flyingSource(): AudioBufferSourceNode | null {
    return this.graph.flyingSource;
  }

  get rollingGain(): GainNode | null {
    return this.graph.rollingGain;
  }

  get flyingGain(): GainNode | null {
    return this.graph.flyingGain;
  }

  init(buffers: BallAudioBuffersLike = {}): void {
    if (buffers.ballRolling) this.ballRollingBuffer = buffers.ballRolling;
    if (buffers.ballFlying) this.ballFlyingBuffer = buffers.ballFlying;
    this.graph.init(this.ballRollingBuffer, this.ballFlyingBuffer);
  }

  _startLoops(): void {
    this.graph.startLoops();
  }

  silenceAll(): void {
    this.graph.silence();
  }

  updatePanningModel(model: PanningModelType | null | undefined): void {
    this.graph.updatePanningModel(model);
  }

  applyCue(cue: BallLoopCue, isAudibleActive: boolean): void {
    this.position.x = cue.x;
    this.position.y = cue.y;
    this.position.z = cue.z;
    this.graph.apply(cue, isAudibleActive);
  }

  dispose(): void {
    this.graph.dispose();
  }
}
