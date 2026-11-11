/**
 * src/ai/BotWeightLoader.ts
 * WASM SafeTensors weight loader and native `rc_bot_ai` (`BotDirector`) bridge.
 * Streams `.safetensors` weights into WebAssembly linear memory via `_physics_loadBotWeights`
 * and dispatches multi-car bot inference through `_physics_stepBotInferenceMask`.
 */

import {
  EXPERIMENTAL_MODEL_URLS,
  getExperimentalBotPolicyMeta,
  type ParsedSafeTensorsModel,
} from './experimental/botpackSharedBallPredPipeline.ts';
import {
  DEFAULT_CAR_CONTROLS,
  type CarControls,
} from './experimental/experimentalMultiCarObsPipeline.ts';
import { loadRocketSimWasmModule, type RocketSimWasmModule } from '../physics/RocketSimWasm.ts';
import { resolveAssetPath } from '../utils/AssetResponseValidator.ts';

export type { CarControls };

export const BOT_POLICY_IDS: Readonly<Record<string, number>> = {
  heuristic: 0,
  nexto: 1,
  necto: 2,
  ko_v1: 3,
  'kickoff-v1': 3,
  ko_v2: 4,
  'kickoff-v2': 4,
  chronos: 5,
  dice: 6,
  ducky: 7,
  fury: 8,
  galactus: 9,
  kira: 10,
  rain: 11,
  'ripple-v1.1': 12,
  ripple_v1_1: 12,
};

const BOT_BATCH_CONTROLS_F32_OFFSET = 4;
const BOT_BATCH_PREV_ACTIONS_F32_OFFSET = 68;
const BOT_BATCH_DIAGNOSTICS_U32_OFFSET = 132;
const BOT_DIAGNOSTIC_STRIDE_U32 = 8;

const rawSafeTensorsBytesByPolicyId = new Map<number, Uint8Array>();
const parsedStubByPolicyId = new Map<number, ParsedSafeTensorsModel>();
const uploadedModulesByPolicyId = new Map<number, WeakSet<RocketSimWasmModule>>();
const pendingLoadByBotType = new Map<string, Promise<ParsedSafeTensorsModel | null>>();
const detachedStateBackupScratch = new Float32Array(512);
const overrideControlsScratch = new Float32Array(8);

let singletonWasmMod: RocketSimWasmModule | null = null;
void loadRocketSimWasmModule()
  .then((mod) => {
    singletonWasmMod = mod;
    syncCachedWeightsToWasm(mod);
  })
  .catch(() => {});

export interface WasmBotSlotDiagnostics {
  policyId: number;
  team: number;
  tickSkip: number;
  tickSkipRemaining: number;
  kickoffStep: number;
  lastActionIndex: number;
  usedScriptedKickoff: boolean;
  modelReady: boolean;
}

export interface WasmModuleProviderPort {
  module?: RocketSimWasmModule | null;
}

export function resolveBotPolicyId(botType: string): number {
  if (!botType) return 0;
  return BOT_POLICY_IDS[botType] ?? BOT_POLICY_IDS[botType.toLowerCase()] ?? 0;
}

export function resolveBotDefaultTickSkip(botType: string): number {
  const meta = getExperimentalBotPolicyMeta(botType);
  if (meta) return meta.tickSkip;
  const pid = resolveBotPolicyId(botType);
  return pid === 0 ? 1 : pid === 3 || pid === 4 ? 4 : 8;
}

export function resolveActiveWasmModule(
  provider?: WasmModuleProviderPort | RocketSimWasmModule | object | number | null
): RocketSimWasmModule | null {
  if (provider && typeof provider === 'object') {
    if ('_physics_stepBotInferenceMask' in provider) {
      return provider as RocketSimWasmModule;
    }
    const maybeMod = (provider as WasmModuleProviderPort).module;
    if (maybeMod) return maybeMod;
  }
  return singletonWasmMod;
}

function uploadPolicyBytesToWasm(
  mod: RocketSimWasmModule,
  policyId: number,
  bytes: Uint8Array
): boolean {
  if (policyId <= 0 || bytes.byteLength < 16) return false;
  let uploadedSet = uploadedModulesByPolicyId.get(policyId);
  if (!uploadedSet) {
    uploadedSet = new WeakSet<RocketSimWasmModule>();
    uploadedModulesByPolicyId.set(policyId, uploadedSet);
  }
  if (uploadedSet.has(mod) || mod._physics_isBotPolicyLoaded(policyId) === 1) {
    uploadedSet.add(mod);
    return true;
  }
  const ptr = mod._malloc(bytes.byteLength);
  if (!ptr) return false;
  try {
    mod.HEAPU8.set(bytes, ptr);
    if (mod._physics_loadBotWeights(policyId, ptr, bytes.byteLength) > 0) {
      uploadedSet.add(mod);
      return true;
    }
    return false;
  } finally {
    mod._free(ptr);
  }
}

export function syncCachedWeightsToWasm(mod: RocketSimWasmModule | null | undefined): void {
  if (!mod) return;
  for (const [policyId, bytes] of rawSafeTensorsBytesByPolicyId.entries()) {
    uploadPolicyBytesToWasm(mod, policyId, bytes);
  }
}

export function syncBotWeightsToWasmModule(
  mod: RocketSimWasmModule | null | undefined,
  botType?: string
): boolean {
  if (!mod) return false;
  syncCachedWeightsToWasm(mod);
  if (!botType || botType === 'heuristic') return true;
  const policyId = resolveBotPolicyId(botType);
  if (policyId <= 0) return false;
  if (mod._physics_isBotPolicyLoaded(policyId) === 1) return true;
  const bytes = rawSafeTensorsBytesByPolicyId.get(policyId);
  return bytes ? uploadPolicyBytesToWasm(mod, policyId, bytes) : false;
}

async function fetchRawSafeTensorsBytes(botType: string): Promise<Uint8Array | null> {
  const key = botType === 'ripple-v1.1' ? 'ripple_v1_1' : botType;
  const rawUrl = (EXPERIMENTAL_MODEL_URLS as Record<string, string>)[key];
  if (!rawUrl || typeof fetch !== 'function') return null;
  try {
    const res = await fetch(resolveAssetPath(rawUrl));
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return buf.byteLength >= 16 ? new Uint8Array(buf) : null;
  } catch {
    return null;
  }
}

export async function ensureBotWeightsLoaded(
  botType: string = 'nexto',
  wasmMod?: RocketSimWasmModule | null
): Promise<ParsedSafeTensorsModel | null> {
  if (!botType || botType === 'heuristic') return null;
  const policyId = resolveBotPolicyId(botType);
  if (rawSafeTensorsBytesByPolicyId.has(policyId)) {
    const targetMod = wasmMod ?? singletonWasmMod ?? (await loadRocketSimWasmModule());
    singletonWasmMod ??= targetMod;
    syncCachedWeightsToWasm(targetMod);
    return parsedStubByPolicyId.get(policyId) ?? { metadata: {}, tensors: {} };
  }

  let pending = pendingLoadByBotType.get(botType);
  if (!pending) {
    pending = (async () => {
      try {
        const [rawBytes, resolvedMod] = await Promise.all([
          rawSafeTensorsBytesByPolicyId.has(policyId)
            ? Promise.resolve(rawSafeTensorsBytesByPolicyId.get(policyId)!)
            : fetchRawSafeTensorsBytes(botType),
          wasmMod ? Promise.resolve(wasmMod) : loadRocketSimWasmModule(),
        ]);
        singletonWasmMod ??= resolvedMod;
        if (rawBytes && policyId > 0) {
          rawSafeTensorsBytesByPolicyId.set(policyId, rawBytes);
          const stub: ParsedSafeTensorsModel = { metadata: { policyId }, tensors: {} };
          parsedStubByPolicyId.set(policyId, stub);
          uploadPolicyBytesToWasm(resolvedMod, policyId, rawBytes);
          if (singletonWasmMod && singletonWasmMod !== resolvedMod) {
            uploadPolicyBytesToWasm(singletonWasmMod, policyId, rawBytes);
          }
          return stub;
        }
        return null;
      } catch (err) {
        console.warn(`[BotWeightLoader] Failed to load SafeTensors for ${botType}:`, err);
        return null;
      } finally {
        pendingLoadByBotType.delete(botType);
      }
    })();
    pendingLoadByBotType.set(botType, pending);
  }
  return pending;
}

export function isBotPolicyReady(botType: string, wasmMod?: RocketSimWasmModule | null): boolean {
  if (!botType || botType === 'heuristic') return true;
  const policyId = resolveBotPolicyId(botType);
  const mod = wasmMod ?? singletonWasmMod;
  if (mod && policyId > 0) {
    syncCachedWeightsToWasm(mod);
    if (mod._physics_isBotPolicyLoaded(policyId) === 1) return true;
  }
  return rawSafeTensorsBytesByPolicyId.has(policyId);
}

export const ensureExperimentalEngine = ensureBotWeightsLoaded;
export const isExperimentalEngineReady = isBotPolicyReady;

function writeControlsToFloat8(c: CarControls, out8: Float32Array): void {
  out8[0] = c.throttle;
  out8[1] = c.steer;
  out8[2] = c.pitch;
  out8[3] = c.yaw;
  out8[4] = c.roll;
  out8[5] = c.jump ? 1 : 0;
  out8[6] = c.boost ? 1 : 0;
  out8[7] = c.handbrake ? 1 : 0;
}

export function readWasmBotSlotControls(
  mod: RocketSimWasmModule,
  carIndex: number,
  target?: CarControls
): CarControls {
  const out: CarControls = target ?? { ...DEFAULT_CAR_CONTROLS };
  if (carIndex < 0 || carIndex >= 8) return out;
  const basePtr = mod._physics_getBotBatchOutputPtr();
  if (!basePtr) return out;
  const ctrlIdx = (basePtr >>> 2) + BOT_BATCH_CONTROLS_F32_OFFSET + carIndex * 8;
  const heap = mod.HEAPF32;
  out.throttle = heap[ctrlIdx] || 0;
  out.steer = heap[ctrlIdx + 1] || 0;
  out.pitch = heap[ctrlIdx + 2] || 0;
  out.yaw = heap[ctrlIdx + 3] || 0;
  out.roll = heap[ctrlIdx + 4] || 0;
  out.jump = (heap[ctrlIdx + 5] || 0) > 0.5;
  out.boost = (heap[ctrlIdx + 6] || 0) > 0.5;
  out.handbrake = (heap[ctrlIdx + 7] || 0) > 0.5;
  return out;
}

export function readWasmBotSlotDiagnostics(
  mod: RocketSimWasmModule,
  carIndex: number
): WasmBotSlotDiagnostics {
  const basePtr = mod._physics_getBotBatchOutputPtr();
  const clamped = Math.max(0, Math.min(7, carIndex));
  const diagIdx =
    (basePtr >>> 2) + BOT_BATCH_DIAGNOSTICS_U32_OFFSET + clamped * BOT_DIAGNOSTIC_STRIDE_U32;
  const u32 = mod.HEAPU32;
  return {
    policyId: u32[diagIdx] ?? 0,
    team: u32[diagIdx + 1] ?? 0,
    tickSkip: u32[diagIdx + 2] ?? 1,
    tickSkipRemaining: u32[diagIdx + 3] ?? 0,
    kickoffStep: u32[diagIdx + 4] ?? 0,
    lastActionIndex: mod.HEAP32[diagIdx + 5] ?? -1,
    usedScriptedKickoff: (u32[diagIdx + 6] ?? 0) !== 0,
    modelReady: (u32[diagIdx + 7] ?? 0) !== 0,
  };
}

function withSyncedWasmState<T>(
  mod: RocketSimWasmModule,
  simState: Float32Array | null | undefined,
  fn: () => T
): T {
  if (!simState || simState.length === 0) return fn();
  const statePtr = mod._physics_getStatePtr();
  const stateSize = mod._physics_getStateSize();
  const heap = mod.HEAPF32;
  if (!statePtr || (simState.buffer === heap.buffer && simState.byteOffset === statePtr)) {
    return fn();
  }
  const f32Offset = statePtr >>> 2;
  const copyLen = Math.min(simState.length, stateSize, detachedStateBackupScratch.length);
  detachedStateBackupScratch.set(heap.subarray(f32Offset, f32Offset + copyLen), 0);
  heap.set(simState.subarray(0, copyLen), f32Offset);
  try {
    return fn();
  } finally {
    heap.set(detachedStateBackupScratch.subarray(0, copyLen), f32Offset);
  }
}

function syncActiveCarTeamsToWasm(
  mod: RocketSimWasmModule,
  selfCarIndex: number,
  activeCars: ReadonlyArray<{ carIndex: number; team: number }> | null | undefined
): void {
  if (!activeCars) return;
  for (let i = 0; i < activeCars.length; i++) {
    const entry = activeCars[i];
    if (entry && entry.carIndex >= 0 && entry.carIndex < 8 && entry.carIndex !== selfCarIndex) {
      const diag = readWasmBotSlotDiagnostics(mod, entry.carIndex);
      mod._physics_configureBotSlot(
        entry.carIndex,
        diag.policyId,
        entry.team === 1 ? 1 : 0,
        diag.tickSkip
      );
    }
  }
}

export function multiCarHeuristicDecide(
  simState: Float32Array,
  _boostPads: ReadonlyArray<unknown>,
  selfCarIndex: number = 0,
  selfTeam: number = 0,
  activeCars: ReadonlyArray<{ carIndex: number; team: number }> | null = null,
  wasmMod?: RocketSimWasmModule | null
): CarControls {
  const mod = resolveActiveWasmModule(wasmMod);
  if (!mod || selfCarIndex < 0 || selfCarIndex >= 8) return { ...DEFAULT_CAR_CONTROLS };
  const normTeam = selfTeam === 1 ? 1 : 0;
  return withSyncedWasmState(mod, simState, () => {
    syncActiveCarTeamsToWasm(mod, selfCarIndex, activeCars);
    const prevDiag = readWasmBotSlotDiagnostics(mod, selfCarIndex);
    mod._physics_configureBotSlot(selfCarIndex, 0, normTeam, 1);
    mod._physics_stepBotInferenceMask(1 << selfCarIndex, 0);
    const out = readWasmBotSlotControls(mod, selfCarIndex);
    if (prevDiag.policyId !== 0) {
      mod._physics_configureBotSlot(selfCarIndex, prevDiag.policyId, normTeam, prevDiag.tickSkip);
    }
    return out;
  });
}

export function getNextoKickoffControls(
  simState: Float32Array,
  kickoffTick: number,
  carIndex: number = 0,
  team: number = 0,
  wasmMod?: RocketSimWasmModule | null
): CarControls | null {
  if (!simState || simState.length < 22 || simState[5] !== 0 || kickoffTick >= 168) return null;
  const mod = resolveActiveWasmModule(wasmMod);
  if (!mod || carIndex < 0 || carIndex >= 8) return null;
  const normTeam = team === 1 ? 1 : 0;
  return withSyncedWasmState(mod, simState, () => {
    mod._physics_configureBotSlot(carIndex, 1, normTeam, 8);
    const basePtr = mod._physics_getBotBatchOutputPtr();
    if (basePtr) {
      const diagIdx =
        (basePtr >>> 2) + BOT_BATCH_DIAGNOSTICS_U32_OFFSET + carIndex * BOT_DIAGNOSTIC_STRIDE_U32;
      mod.HEAPU32[diagIdx + 4] = Math.max(0, Math.floor(kickoffTick / 2));
    }
    mod._physics_stepBotInferenceMask(1 << carIndex, 1);
    const diag = readWasmBotSlotDiagnostics(mod, carIndex);
    return diag.usedScriptedKickoff ? readWasmBotSlotControls(mod, carIndex) : null;
  });
}

export class ExperimentalBotAgent {
  botType: string;
  carIndex: number;
  team: number;
  action: CarControls;
  prevAction8: Float32Array;
  tickSkipCounter: number;
  lastInferenceMs: number;
  _staggered = false;

  constructor(botType: string = 'nexto', carIndex: number = 0, team: number = 0) {
    this.botType = botType || 'nexto';
    this.carIndex = carIndex;
    this.team = team === 1 ? 1 : team === 0 ? 0 : carIndex % 2;
    this.action = { ...DEFAULT_CAR_CONTROLS };
    this.prevAction8 = new Float32Array(8);
    this.tickSkipCounter = 0;
    this.lastInferenceMs = 0;
    if (this.botType !== 'heuristic') void ensureBotWeightsLoaded(this.botType);
    this._syncSlotConfig(singletonWasmMod);
  }

  private _syncSlotConfig(mod: RocketSimWasmModule | null): void {
    if (!mod || this.carIndex < 0 || this.carIndex >= 8) return;
    syncCachedWeightsToWasm(mod);
    mod._physics_configureBotSlot(
      this.carIndex,
      resolveBotPolicyId(this.botType),
      this.team,
      this.tickSkip
    );
  }

  setBotType(botType: string): void {
    if (this.botType !== botType) {
      this.botType = botType || 'heuristic';
      this.reset();
      if (this.botType !== 'heuristic') void ensureBotWeightsLoaded(this.botType);
      this._syncSlotConfig(singletonWasmMod);
    }
  }

  reset(): void {
    this.action = { ...DEFAULT_CAR_CONTROLS };
    this.prevAction8.fill(0);
    this.tickSkipCounter = 0;
    this._staggered = false;
    if (singletonWasmMod && this.carIndex >= 0 && this.carIndex < 8) {
      singletonWasmMod._physics_resetBotDirector(1 << this.carIndex);
    }
  }

  async preload(): Promise<void> {
    if (this.botType && this.botType !== 'heuristic') await ensureBotWeightsLoaded(this.botType);
  }

  get isReady(): boolean {
    return isBotPolicyReady(this.botType);
  }

  get tickSkip(): number {
    return resolveBotDefaultTickSkip(this.botType);
  }

  overrideControls(controls: Partial<Record<keyof CarControls, number | boolean>>): void {
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
    writeControlsToFloat8(this.action, overrideControlsScratch);
    this.prevAction8.set(overrideControlsScratch);

    const mod = singletonWasmMod;
    if (mod && this.carIndex >= 0 && this.carIndex < 8) {
      const basePtr = mod._physics_getBotBatchOutputPtr();
      if (basePtr) {
        const prevIdx = (basePtr >>> 2) + BOT_BATCH_PREV_ACTIONS_F32_OFFSET + this.carIndex * 8;
        mod.HEAPF32.set(overrideControlsScratch, prevIdx);
        mod._physics_overrideBotControls(this.carIndex, prevIdx * 4);
      }
    }
  }

  getKickoffControls(
    simState: Float32Array,
    kickoffTick: number,
    isPrimaryKickoffCar: boolean = true
  ): CarControls | null {
    if (!isPrimaryKickoffCar || this.botType !== 'nexto') return null;
    return getNextoKickoffControls(simState, kickoffTick, this.carIndex, this.team);
  }

  decideSync(
    simState: Float32Array,
    _boostPads: ReadonlyArray<unknown>,
    activeCars: ReadonlyArray<{ carIndex: number; team: number }>,
    physicsEngine:
      WasmModuleProviderPort | RocketSimWasmModule | object | number | null | undefined = null
  ): CarControls {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const mod = resolveActiveWasmModule(physicsEngine);
    if (!mod || this.carIndex < 0 || this.carIndex >= 8) {
      this.lastInferenceMs =
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
      return this.action;
    }

    syncCachedWeightsToWasm(mod);
    syncActiveCarTeamsToWasm(mod, this.carIndex, activeCars);
    const policyId = resolveBotPolicyId(this.botType);
    withSyncedWasmState(mod, simState, () => {
      mod._physics_configureBotSlot(this.carIndex, policyId, this.team, 1);
      mod._physics_stepBotInferenceMask(1 << this.carIndex, 0);
      readWasmBotSlotControls(mod, this.carIndex, this.action);
    });

    writeControlsToFloat8(this.action, this.prevAction8);
    this.lastInferenceMs =
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return this.action;
  }
}
