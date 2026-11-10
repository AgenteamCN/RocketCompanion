/**
 * SequentialMlpEngine.ts
 * Zero-GC Pure-Web Float32 inference engine for GigaLearn / RocketForge
 * Sequential MLP policies (SHARED_HEAD + POLICY with Linear -> LayerNorm -> ReLU/LeakyReLU).
 *
 * Supports arbitrary layer widths up to MAX_HIDDEN_DIM (1536) and action heads up to 380.
 */

import type { MlpBotpackSpec } from './botpack9700488Specs.ts';
import { simdMatVecBias } from './wasmSimdMatVec.ts';

export interface SafeTensorEntry {
  shape: number[];
  dtype: string;
  data: Float32Array | Int32Array;
}

export type SafeTensorsMap = Record<string, SafeTensorEntry>;

const MAX_HIDDEN_DIM = 1536;
const MAX_ACTION_DIM = 512;
const LN_EPS = 1e-5;

/**
 * Dense linear + LayerNorm + Activation for a single 1D vector:
 *   y = W * x + b
 *   z = LayerNorm(y, lnW, lnB)
 *   out = activation(z)
 */
function linearLayerNormAct(
  x: Float32Array,
  inDim: number,
  outDim: number,
  weight: Float32Array,
  bias: Float32Array,
  lnWeight: Float32Array,
  lnBias: Float32Array,
  leakyAlpha: number,
  out: Float32Array
): void {
  simdMatVecBias(x, inDim, outDim, weight, bias, out, 0, 0);

  let sumMean = 0;
  for (let o = 0; o < outDim; o++) {
    sumMean += out[o];
  }

  const mean = sumMean / outDim;
  let varSum = 0;
  for (let o = 0; o < outDim; o++) {
    const diff = out[o] - mean;
    varSum += diff * diff;
  }
  const invStd = 1.0 / Math.sqrt(varSum / outDim + LN_EPS);

  for (let o = 0; o < outDim; o++) {
    const normVal = (out[o] - mean) * invStd * lnWeight[o] + lnBias[o];
    out[o] = normVal >= 0 ? normVal : normVal * leakyAlpha;
  }
}

/**
 * Final linear head: out[outDim] = weight[outDim, inDim] * x[inDim] + bias[outDim]
 */
function linearHead(
  x: Float32Array,
  inDim: number,
  outDim: number,
  weight: Float32Array,
  bias: Float32Array,
  out: Float32Array
): void {
  simdMatVecBias(x, inDim, outDim, weight, bias, out, 0, 0);
}

export class SequentialMlpEngine {
  private readonly bufA = new Float32Array(MAX_HIDDEN_DIM);
  private readonly bufB = new Float32Array(MAX_HIDDEN_DIM);
  private readonly logitsBuf = new Float32Array(MAX_ACTION_DIM);

  /**
   * Executes forward pass for a GigaLearn/RocketForge model stored in SafeTensors.
   */
  forward(obs: Float32Array, tensors: SafeTensorsMap, spec: MlpBotpackSpec): Float32Array {
    const { obsDim, sharedDims, policyDims, outDim, leakyAlpha = 0 } = spec;
    let curIn = obs;
    let curDim = obsDim;
    let ping = true;

    // 1. Shared head layers (if present)
    for (let i = 0; i < sharedDims.length; i++) {
      const nextDim = sharedDims[i];
      const dst = ping ? this.bufA : this.bufB;
      linearLayerNormAct(
        curIn,
        curDim,
        nextDim,
        tensors[`shared.layers.${i}.linear.weight`].data as Float32Array,
        tensors[`shared.layers.${i}.linear.bias`].data as Float32Array,
        tensors[`shared.layers.${i}.ln.weight`].data as Float32Array,
        tensors[`shared.layers.${i}.ln.bias`].data as Float32Array,
        leakyAlpha,
        dst
      );
      curIn = dst;
      curDim = nextDim;
      ping = !ping;
    }

    // 2. Policy hidden layers
    for (let i = 0; i < policyDims.length; i++) {
      const nextDim = policyDims[i];
      const dst = ping ? this.bufA : this.bufB;
      linearLayerNormAct(
        curIn,
        curDim,
        nextDim,
        tensors[`policy.layers.${i}.linear.weight`].data as Float32Array,
        tensors[`policy.layers.${i}.linear.bias`].data as Float32Array,
        tensors[`policy.layers.${i}.ln.weight`].data as Float32Array,
        tensors[`policy.layers.${i}.ln.bias`].data as Float32Array,
        leakyAlpha,
        dst
      );
      curIn = dst;
      curDim = nextDim;
      ping = !ping;
    }

    // 3. Output linear head
    linearHead(
      curIn,
      curDim,
      outDim,
      tensors['policy.head.weight'].data as Float32Array,
      tensors['policy.head.bias'].data as Float32Array,
      this.logitsBuf
    );

    return this.logitsBuf.subarray(0, outDim);
  }
}

/**
 * Selects the action index with the highest logit among valid (unmasked) actions.
 * Matches GigaLearn DiscretePolicy::GetAction(obs, deterministic=true) where invalid masks add -1e10.
 */
export function selectMaskedArgmax(logits: Float32Array, mask: Uint8Array | null = null): number {
  let bestIdx = 0;
  let bestVal = -Infinity;
  const len = logits.length;
  for (let i = 0; i < len; i++) {
    const raw = logits[i];
    if (!Number.isFinite(raw)) continue;
    const isValid = !mask || mask[i] !== 0;
    const val = isValid ? raw : raw - 1e10;
    if (val > bestVal) {
      bestVal = val;
      bestIdx = i;
    }
  }
  return bestIdx;
}
