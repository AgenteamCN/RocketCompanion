/**
 * RipplePerceiverEngine.ts
 * Pure-Web Float32 Perceiver Cross-Attention inference engine for Ripple v1.1 (dim=128, 4 layers).
 *
 * Implements the exact PyTorch/ONNX forward graph:
 * - 5 modality encoders with exact erf-based GELU:
 *   1. main_player_processor: 30 -> dim -> dim -> dim -> dim (1 query token)
 *   2. other_players_processor: [5, 21] -> dim -> dim -> dim -> dim (5 KV tokens, masked if others[:,15] == 0)
 *   3. ball_processor: [1, 54] -> dim -> dim -> dim -> dim (1 KV token)
 *   4. action_queue_processor: [1, 48] -> dim -> dim -> dim -> dim (1 KV token)
 *   5. boost_processor: [34, 5] -> bDim -> bDim -> bDim -> dim -> ReduceMax(axis=0) (1 KV token)
 * - L Pre-LN 4-Head Cross-Attention + 4x FFN blocks (Query = 1 token, KV = 8 tokens)
 * - Final state_norm -> Linear(dim -> 276, bias=False) -> optional X-mirror logit permutation via invert_map
 */

import type { RippleBotpackSpec } from './botpack9700488Specs.ts';
import type { RippleObservationTensors } from './RippleObsBuilder.ts';
import type { SafeTensorsMap } from './SequentialMlpEngine.ts';
import { simdMatVecBias } from './wasmSimdMatVec.ts';

const MAX_DIM = 256;
const MAX_FFN_DIM = 1024;
const NUM_KV_TOKENS = 8; // 5 others + 1 ball + 1 action_queue + 1 max-pooled boost
const NUM_OTHER_SLOTS = 5;
const NUM_BOOST_PADS = 34;
const NUM_HEADS = 4;
const NUM_ACTIONS = 276;
const LN_EPS = 1e-5;

/**
 * Exact Gaussian Error Linear Unit: x * 0.5 * (1 + erf(x / sqrt(2)))
 * Uses Abramowitz & Stegun 7.1.26 polynomial approximation for erf (max error < 1.5e-7).
 */
function geluExact(x: number): number {
  const z = x * 0.7071067811865475; // x / sqrt(2)
  const sign = z < 0 ? -1 : 1;
  const az = Math.abs(z);
  const t = 1.0 / (1.0 + 0.3275911 * az);
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  const erf = sign * (1.0 - poly * Math.exp(-az * az));
  return 0.5 * x * (1.0 + erf);
}

/**
 * Linear layer for a single 1D vector with optional GELU.
 */
function linearVecGelu(
  x: Float32Array,
  inDim: number,
  outDim: number,
  weight: Float32Array,
  bias: Float32Array | null,
  out: Float32Array,
  applyGelu = false
): void {
  simdMatVecBias(x, inDim, outDim, weight, bias, out, 0, 0);
  if (applyGelu) {
    for (let o = 0; o < outDim; o++) {
      out[o] = geluExact(out[o]);
    }
  }
}

/**
 * Batched linear layer for N tokens with optional GELU.
 */
function linearBatchGelu(
  x: Float32Array,
  numTokens: number,
  inDim: number,
  outDim: number,
  weight: Float32Array,
  bias: Float32Array | null,
  out: Float32Array,
  applyGelu = false
): void {
  for (let n = 0; n < numTokens; n++) {
    const inBase = n * inDim;
    const outBase = n * outDim;
    simdMatVecBias(x, inDim, outDim, weight, bias, out, inBase, outBase);
    if (applyGelu) {
      for (let o = 0; o < outDim; o++) {
        out[outBase + o] = geluExact(out[outBase + o]);
      }
    }
  }
}

/**
 * LayerNorm over `dim` for `numTokens` contiguous vectors.
 */
function layerNormTokens(
  x: Float32Array,
  numTokens: number,
  dim: number,
  weight: Float32Array,
  bias: Float32Array,
  out: Float32Array
): void {
  for (let n = 0; n < numTokens; n++) {
    const base = n * dim;
    let sum = 0;
    for (let d = 0; d < dim; d++) {
      sum += x[base + d];
    }
    const mean = sum / dim;
    let varSum = 0;
    for (let d = 0; d < dim; d++) {
      const diff = x[base + d] - mean;
      varSum += diff * diff;
    }
    const invStd = 1.0 / Math.sqrt(varSum / dim + LN_EPS);
    for (let d = 0; d < dim; d++) {
      out[base + d] = (x[base + d] - mean) * invStd * weight[d] + bias[d];
    }
  }
}

/**
 * Runs a 4-layer MLP processor ([0, 2, 4] with GELU, [6] linear) on `numTokens` tokens.
 */
function runFourLayerProcessor(
  x: Float32Array,
  numTokens: number,
  inDim: number,
  hiddenDim: number,
  outDim: number,
  tensors: SafeTensorsMap,
  prefix: string,
  bufA: Float32Array,
  bufB: Float32Array,
  outBuf: Float32Array,
  outOffset = 0
): void {
  linearBatchGelu(
    x,
    numTokens,
    inDim,
    hiddenDim,
    tensors[`${prefix}.0.weight`].data as Float32Array,
    tensors[`${prefix}.0.bias`].data as Float32Array,
    bufA,
    true
  );
  linearBatchGelu(
    bufA,
    numTokens,
    hiddenDim,
    hiddenDim,
    tensors[`${prefix}.2.weight`].data as Float32Array,
    tensors[`${prefix}.2.bias`].data as Float32Array,
    bufB,
    true
  );
  linearBatchGelu(
    bufB,
    numTokens,
    hiddenDim,
    hiddenDim,
    tensors[`${prefix}.4.weight`].data as Float32Array,
    tensors[`${prefix}.4.bias`].data as Float32Array,
    bufA,
    true
  );

  // Final layer into outBuf at outOffset
  const w3 = tensors[`${prefix}.6.weight`].data as Float32Array;
  const b3 = tensors[`${prefix}.6.bias`].data as Float32Array;
  for (let n = 0; n < numTokens; n++) {
    const inBase = n * hiddenDim;
    const outBase = outOffset + n * outDim;
    simdMatVecBias(bufA, hiddenDim, outDim, w3, b3, outBuf, inBase, outBase);
  }
}

export class RipplePerceiverEngine {
  private readonly procBufA = new Float32Array(NUM_BOOST_PADS * MAX_DIM);
  private readonly procBufB = new Float32Array(NUM_BOOST_PADS * MAX_DIM);
  private readonly boostOut = new Float32Array(NUM_BOOST_PADS * MAX_DIM);

  private readonly qState = new Float32Array(MAX_DIM);
  private readonly kvTokens = new Float32Array(NUM_KV_TOKENS * MAX_DIM);
  private readonly kvMask = new Uint8Array(NUM_KV_TOKENS); // 1 = masked (-inf), 0 = valid

  private readonly qNorm = new Float32Array(MAX_DIM);
  private readonly kvNorm = new Float32Array(NUM_KV_TOKENS * MAX_DIM);

  private readonly qProj = new Float32Array(MAX_DIM);
  private readonly kProj = new Float32Array(NUM_KV_TOKENS * MAX_DIM);
  private readonly vProj = new Float32Array(NUM_KV_TOKENS * MAX_DIM);
  private readonly scores = new Float32Array(NUM_KV_TOKENS);
  private readonly headConcat = new Float32Array(MAX_DIM);
  private readonly attnOut = new Float32Array(MAX_DIM);

  private readonly mlpNorm = new Float32Array(MAX_DIM);
  private readonly mlpHidden = new Float32Array(MAX_FFN_DIM);
  private readonly mlpOut = new Float32Array(MAX_DIM);

  private readonly finalNorm = new Float32Array(MAX_DIM);
  private readonly rawLogits = new Float32Array(NUM_ACTIONS);
  private readonly logits = new Float32Array(NUM_ACTIONS);

  /**
   * Executes Ripple v1.1 forward pass.
   */
  forward(
    obs: RippleObservationTensors,
    tensors: SafeTensorsMap,
    spec: RippleBotpackSpec
  ): Float32Array {
    const { dim, numLayers, boostDim } = spec;
    const headDim = dim / NUM_HEADS;
    const attnScale = Math.sqrt(headDim);
    const ffnDim = dim * 4;

    // 1. Attention mask over the 8 KV tokens:
    // First 5 tokens are `others`; masked if others[slot, 15] == 0.
    // Last 3 tokens (ball, actions, boost) are never masked.
    for (let s = 0; s < NUM_OTHER_SLOTS; s++) {
      this.kvMask[s] = obs.others[s * 21 + 15] === 0 ? 1 : 0;
    }
    this.kvMask[5] = 0;
    this.kvMask[6] = 0;
    this.kvMask[7] = 0;

    // 2. Encode main player [30] -> qState [dim]
    runFourLayerProcessor(
      obs.main,
      1,
      30,
      dim,
      dim,
      tensors,
      'main_player_processor',
      this.procBufA,
      this.procBufB,
      this.qState,
      0
    );

    // 3. Encode other players [5, 21] -> kvTokens[0 .. 5*dim]
    runFourLayerProcessor(
      obs.others,
      NUM_OTHER_SLOTS,
      21,
      dim,
      dim,
      tensors,
      'other_players_processor',
      this.procBufA,
      this.procBufB,
      this.kvTokens,
      0
    );

    // 4. Encode ball [1, 54] -> kvTokens[5*dim .. 6*dim]
    runFourLayerProcessor(
      obs.ball,
      1,
      54,
      dim,
      dim,
      tensors,
      'ball_processor',
      this.procBufA,
      this.procBufB,
      this.kvTokens,
      5 * dim
    );

    // 5. Encode action queue [1, 48] -> kvTokens[6*dim .. 7*dim]
    runFourLayerProcessor(
      obs.actions,
      1,
      48,
      dim,
      dim,
      tensors,
      'action_queue_processor',
      this.procBufA,
      this.procBufB,
      this.kvTokens,
      6 * dim
    );

    // 6. Encode boost pads [34, 5] -> [34, dim] -> ReduceMax over 34 pads -> kvTokens[7*dim .. 8*dim]
    runFourLayerProcessor(
      obs.boosts,
      NUM_BOOST_PADS,
      5,
      boostDim,
      dim,
      tensors,
      'boost_processor',
      this.procBufA,
      this.procBufB,
      this.boostOut,
      0
    );
    const boostTokenOffset = 7 * dim;
    for (let d = 0; d < dim; d++) {
      let maxVal = this.boostOut[d];
      for (let p = 1; p < NUM_BOOST_PADS; p++) {
        const v = this.boostOut[p * dim + d];
        if (v > maxVal) maxVal = v;
      }
      this.kvTokens[boostTokenOffset + d] = maxVal;
    }

    // 7. Run L Cross-Attention + MLP blocks
    for (let l = 0; l < numLayers; l++) {
      layerNormTokens(
        this.qState,
        1,
        dim,
        tensors[`layers.${l}.norm_q.weight`].data as Float32Array,
        tensors[`layers.${l}.norm_q.bias`].data as Float32Array,
        this.qNorm
      );
      layerNormTokens(
        this.kvTokens,
        NUM_KV_TOKENS,
        dim,
        tensors[`layers.${l}.norm_kv.weight`].data as Float32Array,
        tensors[`layers.${l}.norm_kv.bias`].data as Float32Array,
        this.kvNorm
      );

      // Project Q [1, dim], K [8, dim], V [8, dim]
      linearVecGelu(
        this.qNorm,
        dim,
        dim,
        tensors[`layers.${l}.attn.q_proj.weight`].data as Float32Array,
        tensors[`layers.${l}.attn.q_proj.bias`].data as Float32Array,
        this.qProj,
        false
      );
      linearBatchGelu(
        this.kvNorm,
        NUM_KV_TOKENS,
        dim,
        dim,
        tensors[`layers.${l}.attn.k_proj.weight`].data as Float32Array,
        tensors[`layers.${l}.attn.k_proj.bias`].data as Float32Array,
        this.kProj,
        false
      );
      linearBatchGelu(
        this.kvNorm,
        NUM_KV_TOKENS,
        dim,
        dim,
        tensors[`layers.${l}.attn.v_proj.weight`].data as Float32Array,
        tensors[`layers.${l}.attn.v_proj.bias`].data as Float32Array,
        this.vProj,
        false
      );

      // Multi-head attention across 4 heads
      for (let h = 0; h < NUM_HEADS; h++) {
        const hOff = h * headDim;
        let maxScore = -Infinity;

        for (let k = 0; k < NUM_KV_TOKENS; k++) {
          if (this.kvMask[k] !== 0) {
            this.scores[k] = -Infinity;
            continue;
          }
          const kBase = k * dim + hOff;
          let dot = 0;
          for (let d = 0; d < headDim; d++) {
            dot += (this.qProj[hOff + d] / attnScale) * this.kProj[kBase + d];
          }
          this.scores[k] = dot;
          if (dot > maxScore) maxScore = dot;
        }

        let expSum = 0;
        for (let k = 0; k < NUM_KV_TOKENS; k++) {
          if (this.kvMask[k] !== 0) {
            this.scores[k] = 0;
          } else {
            const e = Math.exp(this.scores[k] - maxScore);
            this.scores[k] = e;
            expSum += e;
          }
        }
        const invSum = expSum > 0 ? 1.0 / expSum : 0;

        for (let d = 0; d < headDim; d++) {
          let acc = 0;
          for (let k = 0; k < NUM_KV_TOKENS; k++) {
            const w = this.scores[k] * invSum;
            if (w === 0) continue;
            acc += w * this.vProj[k * dim + hOff + d];
          }
          this.headConcat[hOff + d] = acc;
        }
      }

      // Output projection + residual onto qState
      linearVecGelu(
        this.headConcat,
        dim,
        dim,
        tensors[`layers.${l}.attn.out_proj.weight`].data as Float32Array,
        tensors[`layers.${l}.attn.out_proj.bias`].data as Float32Array,
        this.attnOut,
        false
      );
      for (let d = 0; d < dim; d++) {
        this.qState[d] += this.attnOut[d];
      }

      // Pre-LN FFN + residual onto qState
      layerNormTokens(
        this.qState,
        1,
        dim,
        tensors[`layers.${l}.norm_qkv.weight`].data as Float32Array,
        tensors[`layers.${l}.norm_qkv.bias`].data as Float32Array,
        this.mlpNorm
      );
      linearVecGelu(
        this.mlpNorm,
        dim,
        ffnDim,
        tensors[`layers.${l}.mlp.0.weight`].data as Float32Array,
        tensors[`layers.${l}.mlp.0.bias`].data as Float32Array,
        this.mlpHidden,
        true
      );
      linearVecGelu(
        this.mlpHidden,
        ffnDim,
        dim,
        tensors[`layers.${l}.mlp.2.weight`].data as Float32Array,
        tensors[`layers.${l}.mlp.2.bias`].data as Float32Array,
        this.mlpOut,
        false
      );
      for (let d = 0; d < dim; d++) {
        this.qState[d] += this.mlpOut[d];
      }
    }

    // 8. Final LayerNorm + Linear head (no bias)
    layerNormTokens(
      this.qState,
      1,
      dim,
      tensors['state_norm.weight'].data as Float32Array,
      tensors['state_norm.bias'].data as Float32Array,
      this.finalNorm
    );
    linearVecGelu(
      this.finalNorm,
      dim,
      NUM_ACTIONS,
      tensors['head.weight'].data as Float32Array,
      null,
      this.rawLogits,
      false
    );

    // 9. Apply X-mirror permutation when obs.main[30] > 0.5
    const isFlipped = obs.main[30] > 0.5;
    if (isFlipped && tensors['invert_map']) {
      const invMap = tensors['invert_map'].data;
      for (let i = 0; i < NUM_ACTIONS; i++) {
        this.logits[i] = this.rawLogits[invMap[i]];
      }
      return this.logits;
    }

    return this.rawLogits;
  }
}
