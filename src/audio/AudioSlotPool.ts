import { audioConfig } from '../ui-core/config/audioConfig.ts';
import {
  listenerManager,
  toAudioCoordinates,
  calculateIncidentDistanceGain,
  getUuToMeters,
  isDistanceCulled,
  type AudioAttenuationCategory,
  type SpatialAttenuationProfile,
  type SpatialVector3Like,
  type SpatialPositionInput,
} from './SpatialAudioSource.ts';

export interface AudioVoiceSlot {
  id: number;
  gainNode: GainNode;
  panner3D: PannerNode;
  panner2D: StereoPannerNode | null;
  currentMode: 'spatial' | 'stereo' | null;
  inUse: boolean;
  sourceNode: AudioBufferSourceNode | null;
  startTime: number;
  priority: number;
  onEnded: (() => void) | null;
}

export interface PlayAudioBufferOptions {
  volume?: number;
  playbackRate?: number;
  priority?: number;
  position?: SpatialPositionInput | null;
  category?: AudioAttenuationCategory | SpatialAttenuationProfile | string | null;
  profileId?: AudioAttenuationCategory | string | null;
  distanceRadiusScale?: number;
  pan?: number;
  onEnded?: (() => void) | null;
}

export class AudioSlotPool {
  _initialized: boolean;
  _scratchPos: SpatialVector3Like;
  context: AudioContext | null;
  destination: AudioNode | null;
  isMuted: boolean;
  maxSlots: number;
  slots: AudioVoiceSlot[];

  constructor(context: AudioContext | null, maxSlots = 16, destination: AudioNode | null = null) {
    this.context = context;
    this.maxSlots = maxSlots;
    this.destination = destination;
    this.slots = [];
    this._initialized = false;
    this._scratchPos = { x: 0, y: 0, z: 0 };
    this.isMuted = false;
  }

  init(destination: AudioNode | null = null): void {
    if (this._initialized || !this.context) return;
    const ctx = this.context;
    if (destination) this.destination = destination;
    const dest = this.destination || ctx.destination;
    listenerManager.setContext(ctx);

    for (let i = 0; i < this.maxSlots; i++) {
      const gainNode = ctx.createGain();

      // 3D Omnidirectional Panner Node (follows unified spatialPanningModel)
      const panner3D = ctx.createPanner();
      panner3D.panningModel = audioConfig.get('spatialPanningModel') || 'equalpower';
      panner3D.distanceModel = 'inverse';
      panner3D.rolloffFactor = 0; // Distance gain handled explicitly via SpatialAttenuationEvaluator
      panner3D.coneInnerAngle = 360;
      panner3D.coneOuterAngle = 360;
      panner3D.channelCount = 1;
      panner3D.channelCountMode = 'explicit';
      panner3D.channelInterpretation = 'speakers';
      if (dest) panner3D.connect(dest);

      // 2D Stereo fallback Panner Node (for non-spatial broadcast signals & UI clicks)
      let panner2D: StereoPannerNode | null = null;
      if (typeof ctx.createStereoPanner === 'function') {
        const sp = ctx.createStereoPanner();
        if (dest) sp.connect(dest);
        panner2D = sp;
      } else if (i === 0) {
        console.warn(
          '[AudioSlotPool] AudioContext.createStereoPanner is unavailable; 2D stereo signals will connect directly to destination without stereo panning.'
        );
      }

      this.slots.push({
        id: i,
        gainNode,
        panner3D,
        panner2D,
        currentMode: null, // 'spatial' | 'stereo'
        inUse: false,
        sourceNode: null,
        startTime: 0,
        priority: 0,
        onEnded: null,
      });
    }
    this._initialized = true;
  }

  acquireSlot(priority = 1): AudioVoiceSlot | null {
    if (!this._initialized) this.init();

    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (!slot.inUse) {
        slot.inUse = true;
        slot.priority = priority;
        slot.startTime = performance.now();
        return slot;
      }
    }

    // Steal oldest slot with <= priority
    let candidate: AudioVoiceSlot | null = null;
    let oldestTime = Infinity;
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (slot.priority <= priority && slot.startTime < oldestTime) {
        oldestTime = slot.startTime;
        candidate = slot;
      }
    }

    if (candidate) {
      this.releaseSlot(candidate);
      candidate.inUse = true;
      candidate.priority = priority;
      candidate.startTime = performance.now();
      return candidate;
    }

    return null;
  }

  releaseSlot(slot: AudioVoiceSlot | null | undefined): void {
    if (!slot) return;
    if (slot.sourceNode) {
      try {
        slot.sourceNode.onended = null;
        slot.sourceNode.stop();
        slot.sourceNode.disconnect();
      } catch (e) {
        console.warn('[AudioArchitecture] Error stopping SoundPool source node:', e);
      }
      slot.sourceNode = null;
    }
    slot.inUse = false;
    slot.priority = 0;
    slot.startTime = 0;
    if (slot.onEnded) {
      try {
        slot.onEnded();
      } catch (e) {
        console.error('[AudioArchitecture] SoundPool onEnded callback error:', e);
      }
      slot.onEnded = null;
    }
  }

  updatePanningModel(model: PanningModelType | null | undefined): void {
    if (!model) return;
    for (const slot of this.slots) {
      if (slot && slot.panner3D) {
        try {
          slot.panner3D.panningModel = model;
        } catch (err) {
          console.warn(
            '[AudioSlotPool] Failed to set panningModel:',
            err instanceof Error ? err.message : err
          );
        }
      }
    }
  }

  playBuffer(
    buffer: AudioBuffer | null,
    options: PlayAudioBufferOptions = {}
  ): AudioVoiceSlot | null {
    if (!buffer || this.isMuted) return null;
    const ctx = this.context;
    if (!ctx || ctx.state === 'closed') return null;
    if (ctx.state === 'suspended') {
      ctx
        .resume()
        .catch((err) =>
          console.warn('[AudioArchitecture] AudioContext resume failed/blocked:', err)
        );
    }

    const baseVolume = options.volume ?? 1.0;
    if (baseVolume <= 1e-5) return null;
    const playbackRate = options.playbackRate ?? 1.0;
    const priority = options.priority ?? 1;
    const category = options.category ?? options.profileId ?? null;
    const distanceRadiusScale = options.distanceRadiusScale ?? 1.0;

    const audioPos = options.position
      ? toAudioCoordinates(this._scratchPos, options.position)
      : null;
    let distGain = 1.0;
    if (audioPos && listenerManager.hasListener) {
      const dx = audioPos.x - listenerManager.position.x;
      const dy = audioPos.y - listenerManager.position.y;
      const dz = audioPos.z - listenerManager.position.z;
      const distance = Math.hypot(dx, dy, dz);
      if (isDistanceCulled(distance, category ?? 'car_ball_hit', distanceRadiusScale)) {
        return null;
      }
      distGain = calculateIncidentDistanceGain(distance, category, distanceRadiusScale);
      if (baseVolume * distGain <= 1e-5) {
        return null;
      }
    }

    const slot = this.acquireSlot(priority);
    if (!slot) return null;

    const now = ctx.currentTime;
    try {
      slot.gainNode.gain.cancelScheduledValues(now);

      if (audioPos) {
        // Spatial 3D HRTF playback from emission coordinates (x, y, z)
        if (slot.currentMode !== 'spatial') {
          try {
            slot.gainNode.disconnect();
          } catch (e) {
            console.warn('[AudioArchitecture] Error disconnecting slot gainNode:', e);
          }
          slot.gainNode.connect(slot.panner3D);
          slot.currentMode = 'spatial';
        }

        const px = audioPos.x * getUuToMeters();
        const py = audioPos.y * getUuToMeters();
        const pz = audioPos.z * getUuToMeters();
        if (slot.panner3D.positionX) {
          slot.panner3D.positionX.value = px;
          slot.panner3D.positionY.value = py;
          slot.panner3D.positionZ.value = pz;
        } else if (typeof slot.panner3D.setPosition === 'function') {
          slot.panner3D.setPosition(px, py, pz);
        }

        const effectiveGain = Math.max(0, Math.min(5.0, baseVolume * distGain));
        slot.gainNode.gain.value = effectiveGain;
      } else {
        // Non-spatial 2D stereo playback (signals, UI clicks)
        if (slot.currentMode !== 'stereo') {
          try {
            slot.gainNode.disconnect();
          } catch (e) {
            console.warn('[AudioArchitecture] Error disconnecting slot gainNode:', e);
          }
          if (slot.panner2D) {
            slot.gainNode.connect(slot.panner2D);
          } else {
            const dest = this.destination || ctx.destination;
            if (dest) slot.gainNode.connect(dest);
          }
          slot.currentMode = 'stereo';
        }

        if (slot.panner2D && slot.panner2D.pan) {
          const pan = options.pan ?? 0.0;
          slot.panner2D.pan.cancelScheduledValues(now);
          slot.panner2D.pan.value = Math.max(-1, Math.min(1, pan));
        }

        slot.gainNode.gain.value = Math.max(0, Math.min(5.0, baseVolume));
      }

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = playbackRate;
      src.connect(slot.gainNode);

      slot.sourceNode = src;
      slot.onEnded = options.onEnded ?? null;

      src.onended = () => {
        if (slot.sourceNode === src) {
          this.releaseSlot(slot);
        }
      };

      src.start(now);
      return slot;
    } catch (e) {
      console.warn('[AudioArchitecture] Error starting SoundPool source:', e);
      this.releaseSlot(slot);
      return null;
    }
  }

  silenceAll(): void {
    for (let i = 0; i < this.slots.length; i++) {
      this.releaseSlot(this.slots[i]);
    }
  }
}
