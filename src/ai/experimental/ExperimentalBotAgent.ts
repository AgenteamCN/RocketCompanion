/**
 * ExperimentalBotAgent.ts
 * Multi-Car Bot Agent bridging WASM BotDirector (Botpack #9700488 + Kickoff V1/V2)
 * and Perceiver / Heuristic policies.
 */

import { validateAssetResponse, resolveAssetPath } from '../../utils/AssetResponseValidator.ts';
import { ensureWasmSimdMatVec, preuploadSimdTensors } from './wasmSimdMatVec.ts';
import { EarlPerceiverEngine } from './EarlPerceiverEngine.ts';
import { SequentialMlpEngine, selectMaskedArgmax } from './SequentialMlpEngine.ts';
import { RipplePerceiverEngine } from './RipplePerceiverEngine.ts';
import { RippleAgentState } from './RippleObsBuilder.ts';
import { multiCarHeuristicDecide } from './multiCarHeuristicPolicy.ts';
import {
  DEFAULT_CAR_CONTROLS,
  NEXTO_ACTION_TABLE,
  getNextoKickoffControls,
  buildDynamicNextoObs,
  buildDynamicNectoObs,
  type CarControls,
  type BoostPadDescriptor,
} from './experimentalMultiCarObsPipeline.ts';
import {
  EXPERIMENTAL_MODEL_URLS,
  BOT_POLICY_ID_MAP,
  RIPPLE_BOTPACK_SPECS,
  getExperimentalBotPolicyMeta,
  type ExperimentalBotPolicyMeta,
  type BallPredictionEnginePort,
  type ParsedSafeTensorsModel,
  type SafeTensorEntry,
} from './botpackSharedBallPredPipeline.ts';
import type { RocketSimWasmModule } from '../../physics/core.d.ts';

export type { ExperimentalBotPolicyMeta };

const sPerceiverEngine = new EarlPerceiverEngine();
const sSequentialMlpEngine = new SequentialMlpEngine();
const sRippleEngine = new RipplePerceiverEngine();

const _rawBufferCache = new Map<string, ArrayBuffer>();
const _modelCache = new Map<string, ParsedSafeTensorsModel>();
const _loadingPromises = new Map<string, Promise<ParsedSafeTensorsModel | null>>();
const _uploadedWasmModules = new WeakMap<object, Set<number>>();

const _F16_LUT = (() => {
  const lut = new Float32Array(65536);
  const f32 = new Float32Array(1);
  const u32 = new Uint32Array(f32.buffer);
  for (let h = 0; h < 65536; h++) {
    const sign = (h & 0x8000) << 16;
    const exp = (h >> 10) & 0x1f;
    let mant = h & 0x03ff;
    if (exp === 0) {
      if (mant === 0) u32[0] = sign;
      else {
        let e = -14;
        while ((mant & 0x0400) === 0) {
          mant <<= 1;
          e--;
        }
        u32[0] = sign | ((e + 127) << 23) | ((mant & 0x03ff) << 13);
      }
    } else if (exp === 31) u32[0] = sign | 0x7f800000 | (mant << 13);
    else u32[0] = sign | ((exp + 112) << 23) | (mant << 13);
    lut[h] = f32[0];
  }
  return lut;
})();

export function parseSafeTensorsBuffer(buffer: ArrayBuffer): ParsedSafeTensorsModel {
  const view = new DataView(buffer);
  const headerLen = view.getUint32(0, true);
  const headerJson = JSON.parse(
    new TextDecoder('utf-8').decode(new Uint8Array(buffer, 8, headerLen)).trim()
  );
  const base = 8 + headerLen;
  const tensors: Record<string, SafeTensorEntry> = {};
  for (const [name, info] of Object.entries<any>(headerJson)) {
    if (name === '__metadata__') continue;
    const [sOff, eOff] = info.data_offsets;
    const s = base + sOff;
    const len = eOff - sOff;
    if (info.dtype === 'F32') {
      const data =
        s % 4 === 0
          ? new Float32Array(buffer, s, len / 4)
          : new Float32Array(buffer.slice(s, s + len));
      tensors[name] = { shape: info.shape, dtype: 'F32', data };
    } else if (info.dtype === 'F16') {
      const cnt = len / 2;
      const u16 =
        s % 2 === 0 ? new Uint16Array(buffer, s, cnt) : new Uint16Array(buffer.slice(s, s + len));
      const data = new Float32Array(cnt);
      for (let i = 0; i < cnt; i++) data[i] = _F16_LUT[u16[i]];
      tensors[name] = { shape: info.shape, dtype: 'F32', data };
    } else if (info.dtype === 'I32') {
      const data =
        s % 4 === 0 ? new Int32Array(buffer, s, len / 4) : new Int32Array(buffer.slice(s, s + len));
      tensors[name] = { shape: info.shape, dtype: 'I32', data };
    }
  }
  preuploadSimdTensors(tensors);
  return { metadata: headerJson.__metadata__ || {}, tensors };
}

export function syncBotWeightsToWasmModule(
  wasmMod: RocketSimWasmModule | null | undefined,
  modelId: string
): boolean {
  if (!wasmMod?._physics_loadBotWeights) return false;
  const policyId = BOT_POLICY_ID_MAP[modelId];
  if (!policyId) return false;
  let uploaded = _uploadedWasmModules.get(wasmMod);
  if (uploaded?.has(policyId)) return true;
  if (wasmMod._physics_isBotPolicyLoaded?.(policyId) === 1) {
    if (!uploaded) {
      uploaded = new Set<number>();
      _uploadedWasmModules.set(wasmMod, uploaded);
    }
    uploaded.add(policyId);
    return true;
  }
  const raw = _rawBufferCache.get(modelId);
  if (!raw || raw.byteLength < 16) return false;
  const ptr = wasmMod._malloc(raw.byteLength);
  if (!ptr) return false;
  try {
    wasmMod.HEAPU8.set(new Uint8Array(raw), ptr);
    const ok = wasmMod._physics_loadBotWeights(policyId, ptr, raw.byteLength) === 1;
    if (ok) {
      if (!uploaded) {
        uploaded = new Set<number>();
        _uploadedWasmModules.set(wasmMod, uploaded);
      }
      uploaded.add(policyId);
    }
    return ok;
  } finally {
    wasmMod._free(ptr);
  }
}

export async function ensureExperimentalEngine(
  botType: string
): Promise<ParsedSafeTensorsModel | null> {
  if (!botType || botType === 'heuristic' || !EXPERIMENTAL_MODEL_URLS[botType]) return null;
  if (_modelCache.has(botType)) return _modelCache.get(botType)!;
  if (_loadingPromises.has(botType)) return _loadingPromises.get(botType)!;

  const promise = (async () => {
    try {
      await ensureWasmSimdMatVec();
      const url = resolveAssetPath(EXPERIMENTAL_MODEL_URLS[botType]);
      const res = await fetch(url);
      const check = validateAssetResponse(res, url, 'binary');
      if (!check.ok) throw check.error;
      const buf = await res.arrayBuffer();
      _rawBufferCache.set(botType, buf);
      const parsed = parseSafeTensorsBuffer(buf);
      _modelCache.set(botType, parsed);
      return parsed;
    } catch (err) {
      console.warn(`[ExperimentalBotAgent] Failed to load SafeTensors for ${botType}:`, err);
      return null;
    } finally {
      _loadingPromises.delete(botType);
    }
  })();

  _loadingPromises.set(botType, promise);
  return promise;
}

export function registerExperimentalEngineTensors(
  botType: string,
  parsedSafeTensors: ParsedSafeTensorsModel
): ParsedSafeTensorsModel {
  if (parsedSafeTensors?.tensors) preuploadSimdTensors(parsedSafeTensors.tensors);
  _modelCache.set(botType, parsedSafeTensors);
  return parsedSafeTensors;
}

export function getCachedSafeTensors(botType: string): ParsedSafeTensorsModel | null {
  return _modelCache.get(botType) || null;
}

export function isExperimentalEngineReady(botType: string): boolean {
  return botType === 'heuristic' || _modelCache.has(botType);
}

function writeControlsToFloat8(c: CarControls, out8: Float32Array): void {
  out8[0] = c.throttle || 0;
  out8[1] = c.steer || 0;
  out8[2] = c.pitch || 0;
  out8[3] = c.yaw || 0;
  out8[4] = c.roll || 0;
  out8[5] = c.jump ? 1 : 0;
  out8[6] = c.boost ? 1 : 0;
  out8[7] = c.handbrake ? 1 : 0;
}

function decodeNextoLogits(logits90: Float32Array): CarControls {
  const idx = selectMaskedArgmax(logits90, null);
  return { ...(NEXTO_ACTION_TABLE[idx] || DEFAULT_CAR_CONTROLS) };
}

function decodeNectoLogits(logits: Float32Array): CarControls {
  const a3 = (b: number) => {
    const i = logits[b + 1] > logits[b] ? 1 : 0;
    return (logits[b + 2] > logits[b + i] ? 2 : i) - 1;
  };
  return {
    throttle: a3(0),
    steer: a3(3),
    pitch: a3(6),
    yaw: a3(9),
    roll: a3(12),
    jump: logits[16] > logits[15],
    boost: logits[18] > logits[17],
    handbrake: logits[20] > logits[19],
  };
}

export class ExperimentalBotAgent {
  botType: string;
  carIndex: number;
  team: number;
  action: CarControls;
  prevAction8: Float32Array;
  demoTimers: Float64Array;
  boostTimers: Float64Array;
  rippleState: RippleAgentState;
  tickSkipCounter = 0;
  lastInferenceMs = 0;
  _staggered = false;
  private _warnedUnloadedFallback = false;

  constructor(botType = 'nexto', carIndex = 0, team = 0) {
    this.botType = botType;
    this.carIndex = carIndex;
    this.team = team === 1 ? 1 : team === 0 ? 0 : carIndex % 2;
    this.action = { ...DEFAULT_CAR_CONTROLS };
    this.prevAction8 = new Float32Array(8);
    this.demoTimers = new Float64Array(8);
    this.boostTimers = new Float64Array(34);
    this.rippleState = new RippleAgentState();
    if (botType && botType !== 'heuristic') void ensureExperimentalEngine(botType);
  }

  setBotType(botType: string): void {
    if (this.botType !== botType) {
      this.botType = botType;
      this.reset();
      if (botType && botType !== 'heuristic') void ensureExperimentalEngine(botType);
    }
  }

  reset(): void {
    this.action = { ...DEFAULT_CAR_CONTROLS };
    this.prevAction8.fill(0);
    this.demoTimers.fill(0);
    this.boostTimers.fill(0);
    this.rippleState.reset();
    this.tickSkipCounter = 0;
    this._staggered = false;
  }

  async preload(): Promise<void> {
    if (this.botType && this.botType !== 'heuristic') await ensureExperimentalEngine(this.botType);
  }

  get isReady(): boolean {
    return isExperimentalEngineReady(this.botType);
  }

  get tickSkip(): number {
    return getExperimentalBotPolicyMeta(this.botType)?.tickSkip ?? 8;
  }

  overrideControls(controls: Partial<Record<keyof CarControls, number | boolean>>): void {
    this.action = {
      throttle: Number(controls.throttle ?? 0),
      steer: Number(controls.steer ?? 0),
      pitch: Number(controls.pitch ?? 0),
      yaw: Number(controls.yaw ?? 0),
      roll: Number(controls.roll ?? 0),
      jump: Boolean(controls.jump),
      boost: Boolean(controls.boost),
      handbrake: Boolean(controls.handbrake),
    };
    writeControlsToFloat8(this.action, this.prevAction8);
  }

  getKickoffControls(
    simState: Float32Array,
    kickoffTick: number,
    isPrimaryKickoffCar = true
  ): CarControls | null {
    if (!isPrimaryKickoffCar || this.botType !== 'nexto') return null;
    const normTeam = this.team === 1 ? 1 : this.team === 0 ? 0 : this.carIndex % 2;
    return getNextoKickoffControls(simState, kickoffTick, this.carIndex, normTeam);
  }

  decideSync(
    simState: Float32Array,
    boostPads: ReadonlyArray<BoostPadDescriptor>,
    activeCars: Array<{ carIndex: number; team: number }>,
    physicsEngine:
      | (BallPredictionEnginePort & { module?: RocketSimWasmModule | null })
      | number
      | null
      | undefined = null
  ): CarControls {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (this.botType === 'heuristic') {
      this.action = multiCarHeuristicDecide(
        simState,
        boostPads,
        this.carIndex,
        this.team,
        activeCars
      );
      writeControlsToFloat8(this.action, this.prevAction8);
      this.lastInferenceMs =
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
      return this.action;
    }

    const parsedModel = getCachedSafeTensors(this.botType);
    if (!parsedModel?.tensors) {
      if (!this._warnedUnloadedFallback) {
        this._warnedUnloadedFallback = true;
        void ensureExperimentalEngine(this.botType);
      }
      this.action = multiCarHeuristicDecide(
        simState,
        boostPads,
        this.carIndex,
        this.team,
        activeCars
      );
      writeControlsToFloat8(this.action, this.prevAction8);
      this.lastInferenceMs =
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
      return this.action;
    }
    this._warnedUnloadedFallback = false;

    try {
      const enginePort = typeof physicsEngine === 'object' ? physicsEngine : null;
      if (this.botType === 'nexto') {
        const obs = buildDynamicNextoObs(
          simState,
          boostPads,
          this.action,
          this.carIndex,
          this.team,
          activeCars
        );
        this.action = decodeNextoLogits(
          sPerceiverEngine.forwardNexto(
            obs.query,
            obs.entities,
            obs.numEntities,
            parsedModel.tensors
          )
        );
      } else if (this.botType === 'necto') {
        const obs = buildDynamicNectoObs(
          simState,
          boostPads,
          this.action,
          this.carIndex,
          this.team,
          activeCars,
          this.demoTimers,
          this.boostTimers
        );
        this.action = decodeNectoLogits(
          sPerceiverEngine.forwardNecto(
            obs.query,
            obs.entities,
            obs.numEntities,
            parsedModel.tensors
          )
        );
      } else if (this.botType === 'ripple_v1_1') {
        const rObs = this.rippleState.buildObs(
          simState,
          this.carIndex,
          this.team,
          activeCars,
          enginePort
        );
        const logits276 = sRippleEngine.forward(
          rObs,
          parsedModel.tensors,
          RIPPLE_BOTPACK_SPECS[this.botType]
        );
        this.action = this.rippleState.stepDelayedActionQueue(selectMaskedArgmax(logits276, null));
      } else if (
        enginePort?.module &&
        syncBotWeightsToWasmModule(enginePort.module, this.botType)
      ) {
        const mod = enginePort.module;
        const pid = BOT_POLICY_ID_MAP[this.botType] ?? 0;
        for (const c of activeCars) {
          if (c.carIndex !== this.carIndex) mod._physics_configureBotSlot(c.carIndex, 0, c.team, 8);
        }
        mod._physics_configureBotSlot(this.carIndex, pid, this.team, 1);
        mod._physics_stepBotInferenceMask(1 << this.carIndex, 0);
        const outPtr = mod._physics_getBotBatchOutputPtr();
        if (outPtr) {
          const base = (outPtr >> 2) + 4 + this.carIndex * 8;
          const h = mod.HEAPF32;
          this.action = {
            throttle: h[base],
            steer: h[base + 1],
            pitch: h[base + 2],
            yaw: h[base + 3],
            roll: h[base + 4],
            jump: h[base + 5] >= 0.5,
            boost: h[base + 6] >= 0.5,
            handbrake: h[base + 7] >= 0.5,
          };
        }
      } else {
        void sSequentialMlpEngine;
        this.action = multiCarHeuristicDecide(
          simState,
          boostPads,
          this.carIndex,
          this.team,
          activeCars
        );
      }
      writeControlsToFloat8(this.action, this.prevAction8);
    } catch {
      this.action = multiCarHeuristicDecide(
        simState,
        boostPads,
        this.carIndex,
        this.team,
        activeCars
      );
      writeControlsToFloat8(this.action, this.prevAction8);
    }

    this.lastInferenceMs =
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return this.action;
  }
}
