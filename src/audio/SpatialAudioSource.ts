import { audioConfig } from '../ui-core/config/audioConfig.ts';
import type {
  AudioAttenuationCategory,
  SpatialAttenuationProfile,
} from '../ui-core/config/spatialAttenuationProfiles.ts';
import {
  evaluateCategoryDistanceGain,
  isAttenuationDistanceCulled,
  setArenaAcousticScale,
} from '../ui-core/config/spatialAudioVisualizerConfig.ts';

export type { AudioAttenuationCategory, SpatialAttenuationProfile };

export const UU_TO_METERS = 0.01;

export interface SpatialConfigPatch {
  spatialAudio?: boolean;
  arenaAcousticScale?: number;
  distanceUnitScale?: number;
  rolloffMinDistance?: number;
  rolloffMaxDistance?: number;
  minAudibleGainFloor?: number;
  spatialPanningModel?: PanningModelType | string;
  distanceModel?: string;
}

export interface SpatialVector3Like {
  x: number;
  y: number;
  z: number;
}

export interface SpatialPositionInput {
  isVector3?: boolean;
  isAudioCoords?: boolean;
  x?: number;
  y?: number;
  z?: number;
  posX?: number;
  posY?: number;
  posZ?: number;
}

export const SPATIAL_CONFIG = {
  spatialAudio: true,
  arenaAcousticScale: 1.0,
  distanceUnitScale: 0.01,
  minDistance: 500,
  maxDistance: 9000,
  minGainFloor: 0.05,
  panningModel: 'equalpower' as PanningModelType,
  distanceModel: 'smoothstep',
  rolloffFactor: 1.0,
  rampTime: 0.025,
};

export const SPATIAL_AUDIO_CONFIG = {
  get MIN_DISTANCE() {
    return SPATIAL_CONFIG.minDistance;
  },
  get MAX_DISTANCE() {
    return SPATIAL_CONFIG.maxDistance;
  },
  get MAX_GAIN() {
    return 1.0;
  },
  get RAMP_TIME() {
    return SPATIAL_CONFIG.rampTime;
  },
};

export function getUuToMeters(): number {
  return SPATIAL_CONFIG.distanceUnitScale;
}

export function getArenaAcousticScale(): number {
  return SPATIAL_CONFIG.arenaAcousticScale;
}

export function isDistanceCulled(
  distanceUU: number,
  categoryOrProfile: AudioAttenuationCategory | SpatialAttenuationProfile | string | null,
  distanceRadiusScale = 1.0
): boolean {
  return isAttenuationDistanceCulled(distanceUU, categoryOrProfile, distanceRadiusScale);
}

export function calculateIncidentDistanceGain(
  distance: number,
  category?: AudioAttenuationCategory | SpatialAttenuationProfile | string | null,
  distanceRadiusScale = 1.0
): number {
  if (!Number.isFinite(distance)) return 1.0;
  return evaluateCategoryDistanceGain(distance, category || 'car_ball_hit', distanceRadiusScale);
}

export function calculateDistanceGain(
  distance: number,
  category?: AudioAttenuationCategory | SpatialAttenuationProfile | string | null,
  distanceRadiusScale = 1.0
): number {
  if (!Number.isFinite(distance)) return 0;
  return calculateIncidentDistanceGain(distance, category ?? 'engine_other', distanceRadiusScale);
}

export function toAudioCoordinates(
  out: SpatialVector3Like,
  pos: SpatialPositionInput | null | undefined
): SpatialVector3Like | null {
  if (!pos) return null;
  if (pos.isVector3 || pos.isAudioCoords) {
    out.x = pos.x ?? 0;
    out.y = pos.y ?? 0;
    out.z = pos.z ?? 0;
    return out;
  }
  if (Number.isFinite(pos.posX) && Number.isFinite(pos.posY) && Number.isFinite(pos.posZ)) {
    out.x = pos.posX as number;
    out.y = pos.posZ as number;
    out.z = pos.posY as number;
    return out;
  }
  if (Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z)) {
    out.x = pos.x as number;
    out.y = pos.z as number;
    out.z = pos.y as number;
    return out;
  }
  return null;
}

export function applySpatialConfigPatch(
  patch: SpatialConfigPatch | null | undefined,
  onPanningModelChange: ((model: PanningModelType) => void) | null = null
): void {
  if (!patch || typeof patch !== 'object') return;
  if (typeof patch.spatialAudio === 'boolean') {
    SPATIAL_CONFIG.spatialAudio = patch.spatialAudio;
  }
  if (Number.isFinite(patch.arenaAcousticScale) && (patch.arenaAcousticScale as number) > 0) {
    SPATIAL_CONFIG.arenaAcousticScale = patch.arenaAcousticScale as number;
    setArenaAcousticScale(SPATIAL_CONFIG.arenaAcousticScale);
  }
  if (Number.isFinite(patch.distanceUnitScale) && (patch.distanceUnitScale as number) > 0) {
    SPATIAL_CONFIG.distanceUnitScale = patch.distanceUnitScale as number;
  }
  if (Number.isFinite(patch.rolloffMinDistance) && (patch.rolloffMinDistance as number) >= 0) {
    SPATIAL_CONFIG.minDistance = patch.rolloffMinDistance as number;
  }
  if (
    Number.isFinite(patch.rolloffMaxDistance) &&
    (patch.rolloffMaxDistance as number) > SPATIAL_CONFIG.minDistance
  ) {
    SPATIAL_CONFIG.maxDistance = patch.rolloffMaxDistance as number;
  }
  if (Number.isFinite(patch.minAudibleGainFloor) && (patch.minAudibleGainFloor as number) >= 0) {
    SPATIAL_CONFIG.minGainFloor = Math.max(0, Math.min(1.0, patch.minAudibleGainFloor as number));
  }
  if (patch.spatialPanningModel === 'equalpower' || patch.spatialPanningModel === 'HRTF') {
    SPATIAL_CONFIG.panningModel = patch.spatialPanningModel;
    onPanningModelChange?.(
      SPATIAL_CONFIG.spatialAudio ? SPATIAL_CONFIG.panningModel : 'equalpower'
    );
  } else if (typeof patch.spatialAudio === 'boolean') {
    onPanningModelChange?.(
      SPATIAL_CONFIG.spatialAudio ? SPATIAL_CONFIG.panningModel : 'equalpower'
    );
  }
  if (typeof patch.distanceModel === 'string') {
    SPATIAL_CONFIG.distanceModel = patch.distanceModel;
  }
}

export interface AudioPositionVector extends SpatialVector3Like {
  copy(p?: Partial<SpatialVector3Like> | null): AudioPositionVector;
  set(x: number, y: number, z: number): AudioPositionVector;
  setFromMatrixPosition(m?: { elements?: ArrayLike<number> } | null): AudioPositionVector;
}

export interface AudioQuaternionLike {
  x: number;
  y: number;
  z: number;
  w: number;
  copy(q?: Partial<AudioQuaternionLike> | null): AudioQuaternionLike;
  set(x: number, y: number, z: number, w?: number): AudioQuaternionLike;
}

export interface CameraTransformLike {
  updateWorldMatrix?: (updateParents?: boolean, updateChildren?: boolean) => void;
  matrixWorld?: { elements?: ArrayLike<number> } | null;
  getWorldPosition?: (target: AudioPositionVector) => void;
  position?: Partial<SpatialVector3Like> | null;
  getWorldQuaternion?: (target: AudioQuaternionLike) => void;
  quaternion?: Partial<AudioQuaternionLike> | null;
}

function createAudioPositionVector(): AudioPositionVector {
  return {
    x: 0,
    y: 0,
    z: 0,
    copy(p) {
      if (p) {
        this.x = p.x ?? 0;
        this.y = p.y ?? 0;
        this.z = p.z ?? 0;
      }
      return this;
    },
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    },
    setFromMatrixPosition(m) {
      if (m && m.elements) {
        this.x = m.elements[12];
        this.y = m.elements[13];
        this.z = m.elements[14];
      }
      return this;
    },
  };
}

export function updateSpatialConfig(patch: SpatialConfigPatch | null | undefined): void {
  applySpatialConfigPatch(patch, (panningModel) => {
    listenerManager?.updateSourcesPanningModel(panningModel);
  });
}

class AudioListenerManager {
  _lastFx: number | undefined;
  _lastFy: number | undefined;
  _lastFz: number | undefined;
  _lastLx: number | undefined;
  _lastLy: number | undefined;
  _lastLz: number | undefined;
  _lastUx: number | undefined;
  _lastUy: number | undefined;
  _lastUz: number | undefined;
  context: AudioContext | null = null;
  forward: SpatialVector3Like = { x: 0, y: 0, z: -1 };
  hasListener = false;
  position: AudioPositionVector = createAudioPositionVector();
  quaternion: AudioQuaternionLike = {
    x: 0,
    y: 0,
    z: 0,
    w: 1,
    copy(q) {
      if (q) {
        this.x = q.x ?? 0;
        this.y = q.y ?? 0;
        this.z = q.z ?? 0;
        this.w = q.w ?? 1;
      }
      return this;
    },
    set(x, y, z, w) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.w = w ?? 1;
      return this;
    },
  };
  sources: Set<SpatialAudioSource> = new Set();
  up: SpatialVector3Like = { x: 0, y: 1, z: 0 };

  setContext(ctx: AudioContext | null): void {
    if (ctx && ctx !== this.context) {
      this.context = ctx;
    }
  }

  register(source: SpatialAudioSource): void {
    this.sources.add(source);
  }

  unregister(source: SpatialAudioSource): void {
    this.sources.delete(source);
  }

  updateSourcesPanningModel(model: PanningModelType): void {
    for (const source of this.sources) {
      if (source?.panner) {
        try {
          source.panner.panningModel = model;
        } catch (err) {
          console.warn('[SpatialAudioSource] Failed to set panningModel:', err);
        }
      }
    }
  }

  rotateVector(
    v: SpatialVector3Like,
    q: { x: number; y: number; z: number; w?: number }
  ): SpatialVector3Like {
    const x = v.x,
      y = v.y,
      z = v.z;
    const qx = q.x,
      qy = q.y,
      qz = q.z,
      qw = q.w ?? 1;
    const ix = qw * x + qy * z - qz * y;
    const iy = qw * y + qz * x - qx * z;
    const iz = qw * z + qx * y - qy * x;
    const iw = -qx * x - qy * y - qz * z;
    return {
      x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
      y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
      z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
    };
  }

  updateFromCamera(camera: CameraTransformLike | null | undefined): void {
    if (!camera) return;
    try {
      camera.updateWorldMatrix?.(true, false);

      if (camera.matrixWorld?.elements) {
        const te = camera.matrixWorld.elements;
        this.position.set(te[12], te[13], te[14]);
        const fx = -te[8],
          fy = -te[9],
          fz = -te[10];
        const flen = Math.hypot(fx, fy, fz) || 1;
        this.forward = { x: fx / flen, y: fy / flen, z: fz / flen };

        const ux = te[4],
          uy = te[5],
          uz = te[6];
        const ulen = Math.hypot(ux, uy, uz) || 1;
        this.up = { x: ux / ulen, y: uy / ulen, z: uz / ulen };
      } else {
        if (typeof camera.getWorldPosition === 'function') {
          camera.getWorldPosition(this.position);
        } else if (camera.position) {
          this.position.copy(camera.position);
        }

        if (typeof camera.getWorldQuaternion === 'function') {
          camera.getWorldQuaternion(this.quaternion);
        } else if (camera.quaternion) {
          this.quaternion.copy(camera.quaternion);
        }

        this.forward = this.rotateVector({ x: 0, y: 0, z: -1 }, this.quaternion);
        this.up = this.rotateVector({ x: 0, y: 1, z: 0 }, this.quaternion);
      }

      this.hasListener = true;

      if (this.context?.listener) {
        const listener = this.context.listener;
        const scale = getUuToMeters();
        const lx = this.position.x * scale;
        const ly = this.position.y * scale;
        const lz = this.position.z * scale;
        const fx = this.forward.x;
        const fy = this.forward.y;
        const fz = this.forward.z;
        const ux = this.up.x;
        const uy = this.up.y;
        const uz = this.up.z;

        const changed =
          this._lastLx === undefined ||
          Math.abs(lx - this._lastLx) > 1e-4 ||
          Math.abs(ly - (this._lastLy ?? 0)) > 1e-4 ||
          Math.abs(lz - (this._lastLz ?? 0)) > 1e-4 ||
          Math.abs(fx - (this._lastFx ?? 0)) > 1e-4 ||
          Math.abs(fy - (this._lastFy ?? 0)) > 1e-4 ||
          Math.abs(fz - (this._lastFz ?? 0)) > 1e-4 ||
          Math.abs(ux - (this._lastUx ?? 0)) > 1e-4 ||
          Math.abs(uy - (this._lastUy ?? 0)) > 1e-4 ||
          Math.abs(uz - (this._lastUz ?? 0)) > 1e-4;

        if (changed) {
          this._lastLx = lx;
          this._lastLy = ly;
          this._lastLz = lz;
          this._lastFx = fx;
          this._lastFy = fy;
          this._lastFz = fz;
          this._lastUx = ux;
          this._lastUy = uy;
          this._lastUz = uz;

          if (listener.positionX) {
            listener.positionX.value = lx;
            listener.positionY.value = ly;
            listener.positionZ.value = lz;
            listener.forwardX.value = fx;
            listener.forwardY.value = fy;
            listener.forwardZ.value = fz;
            listener.upX.value = ux;
            listener.upY.value = uy;
            listener.upZ.value = uz;
          } else if (typeof listener.setPosition === 'function') {
            listener.setPosition(lx, ly, lz);
            listener.setOrientation(fx, fy, fz, ux, uy, uz);
          }
        }
      }

      for (const source of this.sources) {
        source.updateListener();
      }
    } catch (err) {
      console.warn('[AudioListenerManager] Failed to update listener from camera:', err);
    }
  }
}

export const listenerManager = new AudioListenerManager();

export function updateAudioListener(camera: CameraTransformLike | null | undefined): void {
  try {
    listenerManager.updateFromCamera(camera);
  } catch (err) {
    console.warn('[SpatialAudioSource] updateAudioListener failed:', err);
  }
}

export class SpatialAudioSource {
  _lastGainTime = 0;
  _lastPx: number | undefined;
  _lastPy: number | undefined;
  _lastPz: number | undefined;
  _lastWrittenGain: number | undefined;
  _smoothedGain = 0;
  category: AudioAttenuationCategory;
  context: AudioContext | null;
  enabled = true;
  distanceGainEnabled = true;
  input: GainNode;
  output: GainNode | null = null;
  panner: PannerNode | null = null;
  position: AudioPositionVector = createAudioPositionVector();
  targetGain = -1;

  constructor(
    context: AudioContext | null,
    destinationNode?: AudioNode | null,
    category: AudioAttenuationCategory = 'engine_other'
  ) {
    this.context = context;
    this.category = category;
    this.input = null!;

    if (!context) return;

    try {
      this.input = context.createGain();
      this.input.channelCount = 1;
      this.input.channelCountMode = 'explicit';
      this.input.channelInterpretation = 'speakers';

      this.panner = context.createPanner();
      this.panner.panningModel = SPATIAL_CONFIG.panningModel;
      this.panner.channelCount = 1;
      this.panner.channelCountMode = 'explicit';
      this.panner.rolloffFactor = 0;
      this.panner.coneInnerAngle = 360;
      this.panner.coneOuterAngle = 360;

      this.output = context.createGain();
      this.output.gain.value = 0;

      this.input.connect(this.panner);
      this.panner.connect(this.output);
      if (destinationNode) {
        this.output.connect(destinationNode);
      }
    } catch (err) {
      console.warn('[SpatialAudioSource] Failed to create audio nodes:', err);
    }

    listenerManager.register(this);
    this.updateListener();
  }

  setPosition(pos: SpatialPositionInput | null | undefined): void {
    if (!pos) return;
    if (Number.isFinite(pos.posX) && Number.isFinite(pos.posY) && Number.isFinite(pos.posZ)) {
      this.position.set(pos.posX as number, pos.posZ as number, pos.posY as number);
    } else if (Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z)) {
      this.position.copy({ x: pos.x, y: pos.y, z: pos.z });
    }
    if (!this.context || !this.panner) return;
    try {
      const scale = getUuToMeters();
      const px = this.position.x * scale;
      const py = this.position.y * scale;
      const pz = this.position.z * scale;
      if (
        this._lastPx === undefined ||
        Math.abs(px - this._lastPx) > 1e-4 ||
        Math.abs(py - (this._lastPy ?? 0)) > 1e-4 ||
        Math.abs(pz - (this._lastPz ?? 0)) > 1e-4
      ) {
        this._lastPx = px;
        this._lastPy = py;
        this._lastPz = pz;
        if (this.panner.positionX) {
          this.panner.positionX.value = px;
          this.panner.positionY.value = py;
          this.panner.positionZ.value = pz;
        } else if (typeof this.panner.setPosition === 'function') {
          this.panner.setPosition(px, py, pz);
        }
      }
    } catch (err) {
      console.warn('[SpatialAudioSource] Error setting panner position:', err);
    }
    this.applyGain();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = Boolean(enabled);
    this.applyGain();
  }

  updateListener(): void {
    if (!this.context) return;
    this.applyGain();
  }

  applyGain(): void {
    if (!this.context || !this.output) return;
    let target = 0;
    if (this.enabled && listenerManager.hasListener) {
      if (this.distanceGainEnabled) {
        const dx = this.position.x - listenerManager.position.x;
        const dy = this.position.y - listenerManager.position.y;
        const dz = this.position.z - listenerManager.position.z;
        target = calculateDistanceGain(Math.hypot(dx, dy, dz), this.category);
      } else {
        target = 1;
      }
    }

    this.targetGain = target;
    const t = this.context.currentTime;
    const rawDt = this._lastGainTime > 0 ? t - this._lastGainTime : 1 / 120;
    const dt = rawDt > 0.0005 && rawDt < 0.25 ? rawDt : 1 / 120;
    this._lastGainTime = t;

    try {
      if (target === 0 || this.context.state !== 'running') {
        this._smoothedGain = target;
      } else {
        const tau = Math.max(0.005, SPATIAL_AUDIO_CONFIG.RAMP_TIME);
        const alpha = 1 - Math.exp(-dt / tau);
        this._smoothedGain += (target - this._smoothedGain) * alpha;
        if (Math.abs(target - this._smoothedGain) <= 1e-4) {
          this._smoothedGain = target;
        }
      }

      if (
        this._lastWrittenGain === undefined ||
        Math.abs(this._smoothedGain - this._lastWrittenGain) > 1e-4 ||
        (target === 0 && this._lastWrittenGain !== 0)
      ) {
        this._lastWrittenGain = this._smoothedGain;
        this.output.gain.value = this._smoothedGain;
      }
    } catch (err) {
      console.warn('[SpatialAudioSource] Error updating output gain:', err);
    }
  }

  dispose(): void {
    this.setEnabled(false);
    listenerManager.unregister(this);
    try {
      this.input?.disconnect();
      this.panner?.disconnect();
      this.output?.disconnect();
    } catch (e) {
      console.warn('[SpatialAudioSource] Error disconnecting audio nodes on dispose:', e);
    }
  }
}

updateSpatialConfig(audioConfig.config);
audioConfig.subscribe((cfg) => {
  if (cfg) {
    updateSpatialConfig(cfg);
  }
});
