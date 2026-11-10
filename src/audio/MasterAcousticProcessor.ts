import type {
  AudioConfigSettings,
  DynamicRangeProfileId,
} from '../ui-core/config/audioConstants.ts';

export interface DynamicRangePresetSpec {
  id: DynamicRangeProfileId;
  label: string;
  thresholdDb: number;
  kneeDb: number;
  ratio: number;
  attackSec: number;
  releaseSec: number;
  makeupGain: number;
}

export const DYNAMIC_RANGE_PRESETS: Record<DynamicRangeProfileId, DynamicRangePresetSpec> = {
  monitor: {
    id: 'monitor',
    label: 'Studio (Uncompressed Reference)',
    thresholdDb: 0,
    kneeDb: 0,
    ratio: 1,
    attackSec: 0.003,
    releaseSec: 0.1,
    makeupGain: 1.0,
  },
  dynamic: {
    id: 'dynamic',
    label: 'Dynamic (Competitive Ceiling)',
    thresholdDb: -10,
    kneeDb: 8,
    ratio: 3.5,
    attackSec: 0.003,
    releaseSec: 0.15,
    makeupGain: 1.08,
  },
  compressed: {
    id: 'compressed',
    label: 'Night (High Compression)',
    thresholdDb: -24,
    kneeDb: 12,
    ratio: 8,
    attackSec: 0.002,
    releaseSec: 0.22,
    makeupGain: 1.45,
  },
};

export interface MasterAcousticProcessorSnapshot {
  profile: DynamicRangeProfileId;
  eqBassDb: number;
  eqMidDb: number;
  eqTrebleDb: number;
  farFieldHighShelfDb: number;
  makeupGain: number;
  compressorReductionDb: number;
  filtersConnected: boolean;
  compressorConnected: boolean;
}

function clampDb(value: unknown, minDb: number, maxDb: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(minDb, Math.min(maxDb, n));
}

function resolveProfileId(value: unknown): DynamicRangeProfileId {
  if (value === 'compressed' || value === 'dynamic' || value === 'monitor') {
    return value;
  }
  return 'dynamic';
}

function setAudioParamSmooth(
  param: AudioParam | null | undefined,
  context: AudioContext,
  targetValue: number,
  immediate: boolean,
  rampSec = 0.025
): void {
  if (!param) return;
  try {
    const now = context.currentTime;
    if (typeof param.cancelScheduledValues === 'function') {
      param.cancelScheduledValues(now);
    }
    if (
      !immediate &&
      context.state === 'running' &&
      typeof param.linearRampToValueAtTime === 'function'
    ) {
      const current = Number.isFinite(param.value) ? param.value : targetValue;
      param.setValueAtTime(current, now);
      param.linearRampToValueAtTime(targetValue, now + rampSec);
    } else if (typeof param.setValueAtTime === 'function') {
      param.setValueAtTime(targetValue, now);
    } else {
      param.value = targetValue;
    }
  } catch {
    try {
      param.value = targetValue;
    } catch {
      // ignore read-only or mock param errors
    }
  }
}

/**
 * MasterAcousticProcessor
 *
 * Implements the master bus 3-band parametric equalizer, far-field high-shelf roll-off,
 * and 3-mode dynamic range compressor/limiter (Night / Dynamic / Studio).
 *
 * Signal Topology:
 *   input -> bassFilter (100Hz lowshelf)
 *         -> midFilter (1000Hz peaking, Q=0.85)
 *         -> trebleFilter (10000Hz highshelf)
 *         -> farFieldShelfFilter (5500Hz highshelf)
 *         -> compressor (DynamicsCompressorNode)
 *         -> output (makeupGain GainNode)
 */
export class MasterAcousticProcessor {
  readonly context: AudioContext;
  readonly input: GainNode;
  readonly output: GainNode;

  bassFilter: BiquadFilterNode | null = null;
  midFilter: BiquadFilterNode | null = null;
  trebleFilter: BiquadFilterNode | null = null;
  farFieldShelfFilter: BiquadFilterNode | null = null;
  compressor: DynamicsCompressorNode | null = null;

  private _profile: DynamicRangeProfileId = 'dynamic';
  private _eqBassDb = 0;
  private _eqMidDb = 0;
  private _eqTrebleDb = 0;
  private _farFieldHighShelfDb = 0;
  private _makeupGain = 1.08;
  private _filtersConnected = false;
  private _compressorConnected = false;

  constructor(context: AudioContext) {
    this.context = context;
    this.input = context.createGain();
    this.output = context.createGain();

    this._buildGraph();
  }

  private _buildGraph(): void {
    const ctx = this.context;
    let tailNode: AudioNode = this.input;

    try {
      if (typeof ctx.createBiquadFilter === 'function') {
        const bass = ctx.createBiquadFilter();
        bass.type = 'lowshelf';
        bass.frequency.value = 100;
        bass.gain.value = 0;

        const mid = ctx.createBiquadFilter();
        mid.type = 'peaking';
        mid.frequency.value = 1000;
        mid.Q.value = 0.85;
        mid.gain.value = 0;

        const treble = ctx.createBiquadFilter();
        treble.type = 'highshelf';
        treble.frequency.value = 10000;
        treble.gain.value = 0;

        const farShelf = ctx.createBiquadFilter();
        farShelf.type = 'highshelf';
        farShelf.frequency.value = 5500;
        farShelf.gain.value = 0;

        tailNode.connect(bass);
        bass.connect(mid);
        mid.connect(treble);
        treble.connect(farShelf);
        tailNode = farShelf;

        this.bassFilter = bass;
        this.midFilter = mid;
        this.trebleFilter = treble;
        this.farFieldShelfFilter = farShelf;
        this._filtersConnected = true;
      }
    } catch (err) {
      console.warn('[MasterAcousticProcessor] BiquadFilter chain unavailable, bypassing EQ:', err);
    }

    try {
      if (typeof ctx.createDynamicsCompressor === 'function') {
        const comp = ctx.createDynamicsCompressor();
        const preset = DYNAMIC_RANGE_PRESETS[this._profile];
        comp.threshold.value = preset.thresholdDb;
        comp.knee.value = preset.kneeDb;
        comp.ratio.value = preset.ratio;
        comp.attack.value = preset.attackSec;
        comp.release.value = preset.releaseSec;

        tailNode.connect(comp);
        tailNode = comp;
        this.compressor = comp;
        this._compressorConnected = true;
      }
    } catch (err) {
      console.warn(
        '[MasterAcousticProcessor] DynamicsCompressor unavailable, bypassing dynamics:',
        err
      );
    }

    this.output.gain.value = this._makeupGain;
    tailNode.connect(this.output);
  }

  applyConfig(
    cfg:
      | Partial<
          Pick<
            AudioConfigSettings,
            'dynamicRangeProfile' | 'eqBass' | 'eqMid' | 'eqTreble' | 'farFieldHighShelfDb'
          >
        >
      | null
      | undefined,
    immediate = false
  ): void {
    if (!cfg || typeof cfg !== 'object') return;

    if (cfg.eqBass !== undefined) {
      this._eqBassDb = clampDb(cfg.eqBass, -12, 12, 0);
      setAudioParamSmooth(this.bassFilter?.gain, this.context, this._eqBassDb, immediate);
    }
    if (cfg.eqMid !== undefined) {
      this._eqMidDb = clampDb(cfg.eqMid, -12, 12, 0);
      setAudioParamSmooth(this.midFilter?.gain, this.context, this._eqMidDb, immediate);
    }
    if (cfg.eqTreble !== undefined) {
      this._eqTrebleDb = clampDb(cfg.eqTreble, -12, 12, 0);
      setAudioParamSmooth(this.trebleFilter?.gain, this.context, this._eqTrebleDb, immediate);
    }
    if (cfg.farFieldHighShelfDb !== undefined) {
      this._farFieldHighShelfDb = clampDb(cfg.farFieldHighShelfDb, -12, 0, 0);
      setAudioParamSmooth(
        this.farFieldShelfFilter?.gain,
        this.context,
        this._farFieldHighShelfDb,
        immediate
      );
    }
    if (cfg.dynamicRangeProfile !== undefined) {
      const nextProfile = resolveProfileId(cfg.dynamicRangeProfile);
      this._profile = nextProfile;
      const preset = DYNAMIC_RANGE_PRESETS[nextProfile];
      this._makeupGain = preset.makeupGain;

      if (this.compressor) {
        setAudioParamSmooth(
          this.compressor.threshold,
          this.context,
          preset.thresholdDb,
          immediate,
          0.035
        );
        setAudioParamSmooth(this.compressor.knee, this.context, preset.kneeDb, immediate, 0.035);
        setAudioParamSmooth(this.compressor.ratio, this.context, preset.ratio, immediate, 0.035);
        setAudioParamSmooth(
          this.compressor.attack,
          this.context,
          preset.attackSec,
          immediate,
          0.02
        );
        setAudioParamSmooth(
          this.compressor.release,
          this.context,
          preset.releaseSec,
          immediate,
          0.035
        );
      }
      setAudioParamSmooth(this.output.gain, this.context, preset.makeupGain, immediate, 0.035);
    }
  }

  getSnapshot(): MasterAcousticProcessorSnapshot {
    let reductionDb = 0;
    if (this.compressor && typeof this.compressor.reduction === 'number') {
      reductionDb = Number.isFinite(this.compressor.reduction)
        ? Number(this.compressor.reduction.toFixed(2))
        : 0;
    }
    return {
      profile: this._profile,
      eqBassDb: this._eqBassDb,
      eqMidDb: this._eqMidDb,
      eqTrebleDb: this._eqTrebleDb,
      farFieldHighShelfDb: this._farFieldHighShelfDb,
      makeupGain: this._makeupGain,
      compressorReductionDb: reductionDb,
      filtersConnected: this._filtersConnected,
      compressorConnected: this._compressorConnected,
    };
  }
}
