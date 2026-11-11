/**
 * ExperimentalBotAgent.ts
 * Native SafeTensors Multi-Car Bot Agent for Experimental Multiple Bots Mode.
 *
 * Supports:
 * - 'nexto' (Grand Champion EARL Perceiver policy via SafeTensors, arbitrary 1..8 cars)
 * - 'necto' (Diamond EARL Perceiver policy via SafeTensors, arbitrary 1..8 cars)
 * - 'heuristic' (Role-aware multi-car tactical heuristic policy with striker/support/defender spacing)
 * - 8 RLBot Botpack#9700488 policies (Chronos v2.1, Dice, Ducky, Fury, Galactus v2, Kira, Rain 3v3, Ripple v1.1)
 */

import {
  EXPERIMENTAL_MODEL_URLS,
  loadExperimentalPolicySafeTensors,
  getCachedSafeTensors,
  registerCachedSafeTensors,
} from './SafeTensorsLoader.ts';
import { loadRocketSimWasmModule, type RocketSimWasmModule } from '../../physics/RocketSimWasm.ts';
import { SequentialMlpEngine, selectMaskedArgmax } from './SequentialMlpEngine.ts';
import { RipplePerceiverEngine } from './RipplePerceiverEngine.ts';
import {
  DEFAULT_90_ACTIONS,
  FURY_380_ACTIONS,
  computeDefaultAction90Mask,
  computeFuryAction380Mask,
  mirrorActionControlsX,
  writeControlsToFloat8,
} from './botpack9700488Actions.ts';
import {
  MLP_BOTPACK_SPECS,
  RIPPLE_BOTPACK_SPECS,
  getExperimentalBotPolicyMeta,
  type ExperimentalBotPolicyMeta,
} from './botpack9700488Specs.ts';
import {
  buildChronosObs,
  buildDiceObs,
  buildKiraObs,
  buildRainObs,
} from './botpack9700488ObsCorePipeline.ts';
import {
  buildDuckyObs,
  buildFuryObs,
  buildGalactusObs,
  type BallPredictionEnginePort,
} from './botpack9700488ObsExtendedPipeline.ts';
import { RippleAgentState } from './RippleObsBuilder.ts';
import { multiCarHeuristicDecide } from './multiCarHeuristicPolicy.ts';
import {
  DEFAULT_CAR_CONTROLS,
  decodeCarControls,
  getNextoKickoffControls,
  resolveActiveCars,
  type CarControls,
  type BoostPadDescriptor,
} from './experimentalMultiCarObsPipeline.ts';
import type { ParsedSafeTensorsModel, SafeTensorEntry } from './SafeTensorsLoader.ts';

export type { ExperimentalBotPolicyMeta };

// Shared zero-GC forward engines (stateless across calls; per-agent state stays on ExperimentalBotAgent)
const sSequentialMlpEngine = new SequentialMlpEngine();
const sRippleEngine = new RipplePerceiverEngine();

const WASM_POLICY_IDS: Readonly<Record<string, number>> = Object.freeze({
  heuristic: 0,
  nexto: 1,
  necto: 2,
});

let sWasmBotModule: RocketSimWasmModule | null = null;
let sWasmBotModulePromise: Promise<RocketSimWasmModule | null> | null = null;
const sPendingWasmWeightBuffers = new Map<number, ArrayBuffer>();

function uploadWeightsToWasmBotDirector(
  mod: RocketSimWasmModule,
  policyId: number,
  rawBuffer: ArrayBuffer
): void {
  if (rawBuffer.byteLength < 16) return;
  const ptr = mod._malloc(rawBuffer.byteLength);
  mod.HEAPU8.set(new Uint8Array(rawBuffer), ptr);
  mod._physics_loadBotWeights(policyId, ptr, rawBuffer.byteLength);
  mod._free(ptr);
}

function ensureWasmBotDirectorModule(): Promise<RocketSimWasmModule | null> {
  if (sWasmBotModule) return Promise.resolve(sWasmBotModule);
  if (sWasmBotModulePromise) return sWasmBotModulePromise;
  sWasmBotModulePromise = loadRocketSimWasmModule()
    .then((mod) => {
      sWasmBotModule = mod;
      for (const [policyId, buf] of sPendingWasmWeightBuffers.entries()) {
        uploadWeightsToWasmBotDirector(mod, policyId, buf);
      }
      sPendingWasmWeightBuffers.clear();
      return mod;
    })
    .catch(() => null);
  return sWasmBotModulePromise;
}

void ensureWasmBotDirectorModule();

/**
 * Preloads or retrieves a cached SafeTensors model for any neural policy.
 */
export async function ensureExperimentalEngine(
  botType: string
): Promise<ParsedSafeTensorsModel | null> {
  if (!botType || botType === 'heuristic' || !EXPERIMENTAL_MODEL_URLS[botType]) {
    return null;
  }
  const wasmPolicyId = WASM_POLICY_IDS[botType];
  if (wasmPolicyId !== undefined) {
    await ensureWasmBotDirectorModule();
  }
  const cached = getCachedSafeTensors(botType);
  if (cached) {
    if (wasmPolicyId !== undefined && sWasmBotModule && cached.rawBuffer instanceof ArrayBuffer) {
      if (sWasmBotModule._physics_isBotPolicyLoaded(wasmPolicyId) === 0) {
        uploadWeightsToWasmBotDirector(sWasmBotModule, wasmPolicyId, cached.rawBuffer);
      }
    }
    return cached;
  }
  try {
    const loaded = await loadExperimentalPolicySafeTensors(botType);
    if (wasmPolicyId !== undefined && loaded?.rawBuffer instanceof ArrayBuffer) {
      if (sWasmBotModule) {
        uploadWeightsToWasmBotDirector(sWasmBotModule, wasmPolicyId, loaded.rawBuffer);
      } else {
        sPendingWasmWeightBuffers.set(wasmPolicyId, loaded.rawBuffer);
      }
    }
    return loaded;
  } catch (err) {
    console.warn(`[ExperimentalBotAgent] Failed to load SafeTensors for ${botType}:`, err);
    return null;
  }
}

/**
 * Synchronously registers pre-parsed SafeTensors weights (useful for Node/headless verification).
 */
export function registerExperimentalEngineTensors(
  botType: string,
  parsedSafeTensors: ParsedSafeTensorsModel
): ParsedSafeTensorsModel {
  registerCachedSafeTensors(botType, parsedSafeTensors);
  const wasmPolicyId = WASM_POLICY_IDS[botType];
  if (wasmPolicyId !== undefined && parsedSafeTensors?.rawBuffer instanceof ArrayBuffer) {
    if (sWasmBotModule) {
      uploadWeightsToWasmBotDirector(sWasmBotModule, wasmPolicyId, parsedSafeTensors.rawBuffer);
    } else {
      sPendingWasmWeightBuffers.set(wasmPolicyId, parsedSafeTensors.rawBuffer);
    }
  }
  return parsedSafeTensors;
}

/**
 * Checks whether a native SafeTensors engine is loaded in memory.
 */
export function isExperimentalEngineReady(botType: string): boolean {
  if (botType === 'heuristic') return true;
  const wasmPolicyId = WASM_POLICY_IDS[botType];
  if (wasmPolicyId !== undefined && sWasmBotModule) {
    if (sWasmBotModule._physics_isBotPolicyLoaded(wasmPolicyId) === 1) {
      return true;
    }
  }
  return Boolean(getCachedSafeTensors(botType));
}

/**
 * ExperimentalBotAgent
 * Per-slot bot controller supporting dynamic N-car Nexto, Necto, Heuristic, and Botpack#9700488 policies.
 */
export class ExperimentalBotAgent {
  botType: string;
  carIndex: number;
  team: number;
  action: CarControls;
  prevAction8: Float32Array;
  obsBuf: Float32Array;
  mask90: Uint8Array;
  mask380: Uint8Array;
  demoTimers: Float64Array;
  boostTimers: Float64Array;
  rippleState: RippleAgentState;
  tickSkipCounter: number;
  lastInferenceMs: number;
  _warnedUnloadedFallback?: boolean;
  _staggered = false;

  constructor(botType: string = 'nexto', carIndex: number = 0, team: number = 0) {
    this.botType = botType;
    this.carIndex = carIndex;
    this.team = team === 1 ? 1 : team === 0 ? 0 : carIndex % 2;
    this.action = { ...DEFAULT_CAR_CONTROLS };
    this.prevAction8 = new Float32Array(8);
    this.obsBuf = new Float32Array(264);
    this.mask90 = new Uint8Array(90);
    this.mask380 = new Uint8Array(380);
    this.demoTimers = new Float64Array(8);
    this.boostTimers = new Float64Array(34);
    this.rippleState = new RippleAgentState();
    this.tickSkipCounter = 0;
    this._staggered = false;
    this.lastInferenceMs = 0;
    if (botType && botType !== 'heuristic') {
      ensureExperimentalEngine(botType);
    }
  }

  setBotType(botType: string): void {
    if (this.botType !== botType) {
      this.botType = botType;
      this.reset();
      if (botType && botType !== 'heuristic') {
        ensureExperimentalEngine(botType);
      }
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
    if (sWasmBotModule && this.carIndex >= 0 && this.carIndex < 8) {
      sWasmBotModule._physics_resetBotDirector(1 << this.carIndex);
    }
  }

  async preload(): Promise<void> {
    if (this.botType && this.botType !== 'heuristic') {
      await ensureExperimentalEngine(this.botType);
    }
  }

  get isReady(): boolean {
    return isExperimentalEngineReady(this.botType);
  }

  get tickSkip(): number {
    const policy = getExperimentalBotPolicyMeta(this.botType);
    return policy ? policy.tickSkip : 8;
  }

  overrideControls(controls: {
    throttle?: number;
    steer?: number;
    pitch?: number;
    yaw?: number;
    roll?: number;
    jump?: boolean | number;
    boost?: boolean | number;
    handbrake?: boolean | number;
  }): void {
    this.action = {
      throttle: Number(controls.throttle ?? DEFAULT_CAR_CONTROLS.throttle),
      steer: Number(controls.steer ?? DEFAULT_CAR_CONTROLS.steer),
      pitch: Number(controls.pitch ?? DEFAULT_CAR_CONTROLS.pitch),
      yaw: Number(controls.yaw ?? DEFAULT_CAR_CONTROLS.yaw),
      roll: Number(controls.roll ?? DEFAULT_CAR_CONTROLS.roll),
      jump: Boolean(controls.jump),
      boost: Boolean(controls.boost),
      handbrake: Boolean(controls.handbrake),
    };
    writeControlsToFloat8(this.action, this.prevAction8);
  }

  /**
   * Returns scripted speed-flip kickoff controls if applicable (only for primary kickoff striker).
   */
  getKickoffControls(
    simState: Float32Array,
    kickoffTick: number,
    isPrimaryKickoffCar: boolean = true
  ): CarControls | null {
    if (!isPrimaryKickoffCar) return null;
    if (this.botType !== 'nexto') return null;
    const normTeam = this.team === 1 ? 1 : this.team === 0 ? 0 : this.carIndex % 2;
    return getNextoKickoffControls(simState, kickoffTick, this.carIndex, normTeam);
  }

  private _decideWasmEarlPerceiver(
    policyId: number,
    simState: Float32Array,
    boostPads: ReadonlyArray<BoostPadDescriptor>,
    activeCars: Array<{ carIndex: number; team: number }>,
    parsedModel: ParsedSafeTensorsModel
  ): boolean {
    const mod = sWasmBotModule;
    if (!mod) {
      void ensureWasmBotDirectorModule();
      return false;
    }
    if (mod._physics_isBotPolicyLoaded(policyId) === 0) {
      if (parsedModel.rawBuffer instanceof ArrayBuffer) {
        uploadWeightsToWasmBotDirector(mod, policyId, parsedModel.rawBuffer);
      }
      if (mod._physics_isBotPolicyLoaded(policyId) === 0) {
        return false;
      }
    }

    const statePtr = mod._physics_getStatePtr();
    const stateLen = mod._physics_getStateSize();
    const wasmState = new Float32Array(mod.HEAPF32.buffer, statePtr, stateLen);
    if (simState.buffer !== wasmState.buffer || simState.byteOffset !== wasmState.byteOffset) {
      wasmState.set(simState.subarray(0, Math.min(simState.length, stateLen)));
    }

    if (Array.isArray(boostPads) && boostPads.length > 0) {
      const padPtr = mod._physics_getPadInfoPtr();
      const numPads = Math.min(34, boostPads.length);
      const padView = new Float32Array(mod.HEAPF32.buffer, padPtr, numPads * 4);
      if (padView[3] === 0 && padView[0] === 0 && padView[1] === 0) {
        for (let p = 0; p < numPads; p++) {
          const pad = boostPads[p];
          padView[p * 4] = pad.pos[0];
          padView[p * 4 + 1] = pad.pos[1];
          padView[p * 4 + 2] = pad.pos[2];
          padView[p * 4 + 3] = pad.isBig ? 1 : 0;
        }
      }
      if (wasmState[3] === 0) {
        wasmState[3] = numPads;
      }
    }

    const roster = resolveActiveCars(simState, activeCars);
    for (let i = 0; i < roster.length; i++) {
      const entry = roster[i];
      if (entry.carIndex === this.carIndex) continue;
      mod._physics_configureBotSlot(entry.carIndex, 0, entry.team, 8);
    }

    const normTeam = this.team === 1 ? 1 : this.team === 0 ? 0 : this.carIndex % 2;
    mod._physics_configureBotSlot(this.carIndex, policyId, normTeam, 1);

    const outPtr = mod._physics_getBotBatchOutputPtr();
    const prevActionsBase = (outPtr >>> 2) + 4 + 64 + 64 + this.carIndex * 8;
    mod.HEAPF32.set(this.prevAction8, prevActionsBase);

    mod._physics_stepBotInferenceMask(1 << this.carIndex, 0);

    const ctrlBase = (outPtr >>> 2) + 4 + this.carIndex * 8;
    const f32 = mod.HEAPF32;
    this.action = decodeCarControls(f32.subarray(ctrlBase, ctrlBase + 8));
    writeControlsToFloat8(this.action, this.prevAction8);
    return true;
  }

  /**
   * Executes synchronous native Float32 inference (or heuristic fallback) for this car.
   */
  decideSync(
    simState: Float32Array,
    boostPads: ReadonlyArray<BoostPadDescriptor>,
    activeCars: Array<{ carIndex: number; team: number }>,
    physicsEngine: BallPredictionEnginePort | number | null | undefined = null
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
    if (!parsedModel || !parsedModel.tensors) {
      if (!this._warnedUnloadedFallback) {
        this._warnedUnloadedFallback = true;
        console.warn(
          `[ExperimentalBotAgent] SafeTensors model "${this.botType}" is not yet loaded for car ${this.carIndex}; falling back to multiCarHeuristicDecide while loading in background.`
        );
        ensureExperimentalEngine(this.botType);
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
      if (this.botType === 'nexto' || this.botType === 'necto') {
        const policyId = this.botType === 'nexto' ? 1 : 2;
        if (
          !this._decideWasmEarlPerceiver(policyId, simState, boostPads, activeCars, parsedModel)
        ) {
          this.action = multiCarHeuristicDecide(
            simState,
            boostPads,
            this.carIndex,
            this.team,
            activeCars
          );
          writeControlsToFloat8(this.action, this.prevAction8);
        }
      } else if (this.botType === 'ripple_v1_1') {
        const enginePort = typeof physicsEngine === 'object' ? physicsEngine : null;
        const rObs = this.rippleState.buildObs(
          simState,
          this.carIndex,
          this.team,
          activeCars,
          enginePort
        );
        const rippleSpec = RIPPLE_BOTPACK_SPECS[this.botType];
        const logits276 = sRippleEngine.forward(rObs, parsedModel.tensors, rippleSpec);
        const actIdx = selectMaskedArgmax(logits276, null);
        this.action = this.rippleState.stepDelayedActionQueue(actIdx);
        writeControlsToFloat8(this.action, this.prevAction8);
      } else {
        const enginePort = typeof physicsEngine === 'object' ? physicsEngine : null;
        this._decideMlpBotpack9700488(simState, activeCars, enginePort, parsedModel.tensors);
      }
    } catch (err) {
      console.warn(
        `[ExperimentalBotAgent] Inference error on car ${this.carIndex} (${this.botType}):`,
        err
      );
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

  _decideMlpBotpack9700488(
    simState: Float32Array,
    activeCars: Array<{ carIndex: number; team: number }>,
    physicsEngine: BallPredictionEnginePort | null | undefined,
    tensors: Record<string, SafeTensorEntry>
  ): void {
    const spec = MLP_BOTPACK_SPECS[this.botType] || MLP_BOTPACK_SPECS.rain;
    let built: ReturnType<typeof buildRainObs>;

    switch (this.botType) {
      case 'chronos':
        built = buildChronosObs(simState, this.action, this.carIndex, this.team, activeCars);
        break;
      case 'dice':
        built = buildDiceObs(simState, this.action, this.carIndex, this.team, activeCars);
        break;
      case 'ducky':
        built = buildDuckyObs(
          simState,
          this.action,
          this.carIndex,
          this.team,
          activeCars,
          physicsEngine
        );
        break;
      case 'fury':
        built = buildFuryObs(
          simState,
          this.action,
          this.carIndex,
          this.team,
          activeCars,
          physicsEngine
        );
        break;
      case 'galactus':
        built = buildGalactusObs(
          simState,
          this.action,
          this.carIndex,
          this.team,
          activeCars,
          physicsEngine
        );
        break;
      case 'kira':
        built = buildKiraObs(simState, this.action, this.carIndex, this.team, activeCars);
        break;
      case 'rain':
      default:
        built = buildRainObs(simState, this.action, this.carIndex, this.team, activeCars);
        break;
    }

    const logits = sSequentialMlpEngine.forward(built.obs, tensors, spec);
    if (this.botType === 'fury') {
      const mask = computeFuryAction380Mask(built.selfCarView, this.mask380);
      const actIdx = selectMaskedArgmax(logits, mask);
      const rawCtrl = FURY_380_ACTIONS[actIdx] || DEFAULT_CAR_CONTROLS;
      this.action = { ...rawCtrl };
    } else {
      const mask = computeDefaultAction90Mask(built.selfCarView, this.mask90);
      const actIdx = selectMaskedArgmax(logits, mask);
      const rawCtrl = DEFAULT_90_ACTIONS[actIdx] || DEFAULT_CAR_CONTROLS;
      this.action = built.mirrorX ? mirrorActionControlsX(rawCtrl) : { ...rawCtrl };
    }
    writeControlsToFloat8(this.action, this.prevAction8);
  }
}
