/**
 * EarlPerceiverEngine.ts
 * Pure-Web Float32 EARLPerceiver (Entity-Attention Reinforcement Learning) inference engine
 * for Necto (1-block Perceiver) and Nexto (2-block Pre-LN Perceiver).
 *
 * Uses preallocated Float32Array scratch buffers for zero-GC real-time execution
 * across arbitrary numbers of arena entities (1v1 = 37, 2v2 = 39, 3v3 = 41, up to 8 cars = 43).
 */

import { simdMatVecBias } from './wasmSimdMatVec.ts';
import type { SafeTensorEntry } from './SafeTensorsLoader.ts';

const MAX_ENTITIES = 64;
const EMBED_DIM = 128;
const NUM_HEADS = 4;
const HEAD_DIM = 32;
const ATTN_SCALE = 5.656854249492381; // Math.sqrt(32)
const LN_EPS = 1e-5;

function f32(entry: SafeTensorEntry): Float32Array {
  return entry.data as Float32Array;
}

/**
 * Dense linear transformation for a single vector: out[outDim] = weight[outDim, inDim] * x[inDim] + bias[outDim]
 */
function linearVec(
  x: Float32Array,
  inDim: number,
  outDim: number,
  weight: Float32Array,
  bias: Float32Array,
  out: Float32Array,
  applyReLU = false
): void {
  simdMatVecBias(x, inDim, outDim, weight, bias, out, 0, 0);
  if (applyReLU) {
    for (let o = 0; o < outDim; o++) {
      if (out[o] < 0) out[o] = 0;
    }
  }
}

/**
 * Batched linear transformation over N entity tokens:
 * out[n, outDim] = weight[outDim, inDim] * x[n, inDim] + bias[outDim]
 * Uses column-wise accumulation when inDim <= 32 (where entity tokens are >60% sparse zeros)
 * and SIMD row dot-products for dense 128-dim hidden layers.
 */
function linearBatch(
  x: Float32Array,
  numTokens: number,
  inDim: number,
  outDim: number,
  weight: Float32Array,
  bias: Float32Array,
  out: Float32Array,
  applyReLU = false
): void {
  if (inDim <= 32) {
    for (let n = 0; n < numTokens; n++) {
      const inBase = n * inDim;
      const outBase = n * outDim;
      for (let o = 0; o < outDim; o++) {
        out[outBase + o] = bias[o];
      }
      for (let i = 0; i < inDim; i++) {
        const xi = x[inBase + i];
        if (xi === 0) continue;
        for (let o = 0; o < outDim; o++) {
          out[outBase + o] += weight[o * inDim + i] * xi;
        }
      }
      if (applyReLU) {
        for (let o = 0; o < outDim; o++) {
          if (out[outBase + o] < 0) out[outBase + o] = 0;
        }
      }
    }
    return;
  }

  for (let n = 0; n < numTokens; n++) {
    const inBase = n * inDim;
    const outBase = n * outDim;
    simdMatVecBias(x, inDim, outDim, weight, bias, out, inBase, outBase);
    if (applyReLU) {
      for (let o = 0; o < outDim; o++) {
        if (out[outBase + o] < 0) out[outBase + o] = 0;
      }
    }
  }
}

/**
 * LayerNorm over the last dimension (128) for N tokens.
 */
function layerNorm128(
  x: Float32Array,
  numTokens: number,
  weight: Float32Array,
  bias: Float32Array,
  out: Float32Array
): void {
  for (let n = 0; n < numTokens; n++) {
    const base = n * EMBED_DIM;
    let sum = 0;
    for (let d = 0; d < EMBED_DIM; d++) {
      sum += x[base + d];
    }
    const mean = sum / EMBED_DIM;
    let varSum = 0;
    for (let d = 0; d < EMBED_DIM; d++) {
      const diff = x[base + d] - mean;
      varSum += diff * diff;
    }
    const invStd = 1.0 / Math.sqrt(varSum / EMBED_DIM + LN_EPS);
    for (let d = 0; d < EMBED_DIM; d++) {
      out[base + d] = (x[base + d] - mean) * invStd * weight[d] + bias[d];
    }
  }
}

/**
 * 4-Head Cross-Attention where Query has length 1 (128-dim) and Key/Value has length numEntities (numEntities * 128).
 * Matches PyTorch torch.nn.MultiheadAttention with in_proj_weight [384, 128] and in_proj_bias [384].
 */
function crossAttentionSingleQuery(
  qVec: Float32Array,
  kvMat: Float32Array,
  numEntities: number,
  mask: Float32Array | null,
  inProjWeight: Float32Array,
  inProjBias: Float32Array,
  outProjWeight: Float32Array,
  outProjBias: Float32Array,
  qProjBuf: Float32Array,
  kProjBuf: Float32Array,
  vProjBuf: Float32Array,
  scoresBuf: Float32Array,
  headConcatBuf: Float32Array,
  outVec: Float32Array
): void {
  // 1. Project Query (1 x 128) using first 128 rows of inProjWeight
  for (let o = 0; o < EMBED_DIM; o++) {
    let sum = inProjBias[o];
    const wOff = o * EMBED_DIM;
    for (let i = 0; i < EMBED_DIM; i += 4) {
      sum +=
        inProjWeight[wOff + i] * qVec[i] +
        inProjWeight[wOff + i + 1] * qVec[i + 1] +
        inProjWeight[wOff + i + 2] * qVec[i + 2] +
        inProjWeight[wOff + i + 3] * qVec[i + 3];
    }
    qProjBuf[o] = sum / ATTN_SCALE;
  }

  const kWeightOffset = EMBED_DIM * EMBED_DIM;
  const vWeightOffset = 2 * EMBED_DIM * EMBED_DIM;
  const kBiasOffset = EMBED_DIM;
  const vBiasOffset = 2 * EMBED_DIM;

  const qKBuf = kProjBuf;
  const vAggBuf = vProjBuf;

  // 2. Per-head factored attention & pre-projection entity aggregation
  for (let h = 0; h < NUM_HEADS; h++) {
    const headOffset = h * HEAD_DIM;

    let biasScore = 0;
    qKBuf.fill(0, 0, EMBED_DIM);

    for (let d = 0; d < HEAD_DIM; d++) {
      const qVal = qProjBuf[headOffset + d];
      biasScore += qVal * inProjBias[kBiasOffset + headOffset + d];
      const wkRow = kWeightOffset + (headOffset + d) * EMBED_DIM;
      for (let i = 0; i < EMBED_DIM; i += 4) {
        qKBuf[i] += qVal * inProjWeight[wkRow + i];
        qKBuf[i + 1] += qVal * inProjWeight[wkRow + i + 1];
        qKBuf[i + 2] += qVal * inProjWeight[wkRow + i + 2];
        qKBuf[i + 3] += qVal * inProjWeight[wkRow + i + 3];
      }
    }

    let maxScore = -Infinity;
    for (let n = 0; n < numEntities; n++) {
      const kvBase = n * EMBED_DIM;
      let dot = biasScore;
      for (let i = 0; i < EMBED_DIM; i += 4) {
        dot +=
          qKBuf[i] * kvMat[kvBase + i] +
          qKBuf[i + 1] * kvMat[kvBase + i + 1] +
          qKBuf[i + 2] * kvMat[kvBase + i + 2] +
          qKBuf[i + 3] * kvMat[kvBase + i + 3];
      }
      const mVal = mask ? mask[n] : 0;
      const s = mVal !== 0 ? dot + (mVal < 0 ? mVal : -1e9) : dot;
      scoresBuf[n] = s;
      if (s > maxScore) maxScore = s;
    }

    let expSum = 0;
    for (let n = 0; n < numEntities; n++) {
      const e = Math.exp(scoresBuf[n] - maxScore);
      scoresBuf[n] = e;
      expSum += e;
    }
    const invExpSum = expSum > 0 ? 1.0 / expSum : 0;

    vAggBuf.fill(0, 0, EMBED_DIM);
    for (let n = 0; n < numEntities; n++) {
      const weight = scoresBuf[n] * invExpSum;
      const kvBase = n * EMBED_DIM;
      for (let i = 0; i < EMBED_DIM; i += 4) {
        vAggBuf[i] += weight * kvMat[kvBase + i];
        vAggBuf[i + 1] += weight * kvMat[kvBase + i + 1];
        vAggBuf[i + 2] += weight * kvMat[kvBase + i + 2];
        vAggBuf[i + 3] += weight * kvMat[kvBase + i + 3];
      }
    }

    for (let d = 0; d < HEAD_DIM; d++) {
      let sumV = inProjBias[vBiasOffset + headOffset + d];
      const wvRow = vWeightOffset + (headOffset + d) * EMBED_DIM;
      for (let i = 0; i < EMBED_DIM; i += 4) {
        sumV +=
          inProjWeight[wvRow + i] * vAggBuf[i] +
          inProjWeight[wvRow + i + 1] * vAggBuf[i + 1] +
          inProjWeight[wvRow + i + 2] * vAggBuf[i + 2] +
          inProjWeight[wvRow + i + 3] * vAggBuf[i + 3];
      }
      headConcatBuf[headOffset + d] = sumV;
    }
  }

  // 3. Output projection (128 -> 128)
  linearVec(headConcatBuf, EMBED_DIM, EMBED_DIM, outProjWeight, outProjBias, outVec, false);
}

export class EarlPerceiverEngine {
  qH1 = new Float32Array(EMBED_DIM);
  qEmbed = new Float32Array(EMBED_DIM);
  kvH1 = new Float32Array(MAX_ENTITIES * EMBED_DIM);
  kvEmbed = new Float32Array(MAX_ENTITIES * EMBED_DIM);
  qNorm = new Float32Array(EMBED_DIM);
  kvNorm = new Float32Array(MAX_ENTITIES * EMBED_DIM);
  qProj = new Float32Array(EMBED_DIM);
  kProj = new Float32Array(EMBED_DIM);
  vProj = new Float32Array(EMBED_DIM);
  scores = new Float32Array(MAX_ENTITIES);
  headConcat = new Float32Array(EMBED_DIM);
  attnOut = new Float32Array(EMBED_DIM);
  res1 = new Float32Array(EMBED_DIM);
  res1Norm = new Float32Array(EMBED_DIM);
  ffnHidden = new Float32Array(512);
  ffnOut = new Float32Array(EMBED_DIM);
  blockOut = new Float32Array(EMBED_DIM);
  postReLU = new Float32Array(EMBED_DIM);
  nectoLogits = new Float32Array(12);
  nextoEmb32 = new Float32Array(32);
  nextoLogits = new Float32Array(90);

  private _preprocessQueryAndKV(
    query: Float32Array,
    entities: Float32Array,
    numEntities: number,
    tensors: Record<string, SafeTensorEntry>
  ): void {
    if (numEntities > MAX_ENTITIES) {
      throw new Error(
        `[EarlPerceiverEngine] numEntities (${numEntities}) exceeds MAX_ENTITIES (${MAX_ENTITIES}).`
      );
    }

    linearVec(
      query,
      32,
      128,
      f32(tensors['net.earl.query_preprocess.0.weight']),
      f32(tensors['net.earl.query_preprocess.0.bias']),
      this.qH1,
      true
    );
    linearVec(
      this.qH1,
      128,
      128,
      f32(tensors['net.earl.query_preprocess.2.weight']),
      f32(tensors['net.earl.query_preprocess.2.bias']),
      this.qEmbed,
      true
    );

    linearBatch(
      entities,
      numEntities,
      24,
      128,
      f32(tensors['net.earl.key_value_preprocess.0.weight']),
      f32(tensors['net.earl.key_value_preprocess.0.bias']),
      this.kvH1,
      true
    );
    linearBatch(
      this.kvH1,
      numEntities,
      128,
      128,
      f32(tensors['net.earl.key_value_preprocess.2.weight']),
      f32(tensors['net.earl.key_value_preprocess.2.bias']),
      this.kvEmbed,
      true
    );
  }

  private _runPreLnBlock(
    blockIdx: number,
    qInput: Float32Array,
    numEntities: number,
    tensors: Record<string, SafeTensorEntry>,
    mask: Float32Array | null,
    outBuf: Float32Array,
    applyFinalReLU: boolean
  ): void {
    const pfx = `net.earl.blocks.${blockIdx}`;
    layerNorm128(
      qInput,
      1,
      f32(tensors[`${pfx}.norm1.weight`]),
      f32(tensors[`${pfx}.norm1.bias`]),
      this.qNorm
    );
    layerNorm128(
      this.kvEmbed,
      numEntities,
      f32(tensors[`${pfx}.norm2.weight`]),
      f32(tensors[`${pfx}.norm2.bias`]),
      this.kvNorm
    );
    crossAttentionSingleQuery(
      this.qNorm,
      this.kvNorm,
      numEntities,
      mask,
      f32(tensors[`${pfx}.attention.in_proj_weight`]),
      f32(tensors[`${pfx}.attention.in_proj_bias`]),
      f32(tensors[`${pfx}.attention.out_proj.weight`]),
      f32(tensors[`${pfx}.attention.out_proj.bias`]),
      this.qProj,
      this.kProj,
      this.vProj,
      this.scores,
      this.headConcat,
      this.attnOut
    );
    for (let d = 0; d < EMBED_DIM; d++) {
      this.res1[d] = qInput[d] + this.attnOut[d];
    }
    layerNorm128(
      this.res1,
      1,
      f32(tensors[`${pfx}.norm3.weight`]),
      f32(tensors[`${pfx}.norm3.bias`]),
      this.res1Norm
    );
    linearVec(
      this.res1Norm,
      128,
      512,
      f32(tensors[`${pfx}.linear1.weight`]),
      f32(tensors[`${pfx}.linear1.bias`]),
      this.ffnHidden,
      true
    );
    linearVec(
      this.ffnHidden,
      512,
      128,
      f32(tensors[`${pfx}.linear2.weight`]),
      f32(tensors[`${pfx}.linear2.bias`]),
      this.ffnOut,
      false
    );
    for (let d = 0; d < EMBED_DIM; d++) {
      const v = this.res1[d] + this.ffnOut[d];
      outBuf[d] = applyFinalReLU && v < 0 ? 0 : v;
    }
  }

  forwardNecto(
    query: Float32Array,
    entities: Float32Array,
    numEntities: number,
    tensors: Record<string, SafeTensorEntry>,
    mask: Float32Array | null = null
  ): Float32Array {
    this._preprocessQueryAndKV(query, entities, numEntities, tensors);

    crossAttentionSingleQuery(
      this.qEmbed,
      this.kvEmbed,
      numEntities,
      mask,
      f32(tensors['net.earl.blocks.0.attention.in_proj_weight']),
      f32(tensors['net.earl.blocks.0.attention.in_proj_bias']),
      f32(tensors['net.earl.blocks.0.attention.out_proj.weight']),
      f32(tensors['net.earl.blocks.0.attention.out_proj.bias']),
      this.qProj,
      this.kProj,
      this.vProj,
      this.scores,
      this.headConcat,
      this.attnOut
    );

    for (let d = 0; d < EMBED_DIM; d++) {
      this.res1[d] = this.qEmbed[d] + this.attnOut[d];
    }

    linearVec(
      this.res1,
      128,
      256,
      f32(tensors['net.earl.blocks.0.linear1.weight']),
      f32(tensors['net.earl.blocks.0.linear1.bias']),
      this.ffnHidden,
      true
    );
    linearVec(
      this.ffnHidden,
      256,
      128,
      f32(tensors['net.earl.blocks.0.linear2.weight']),
      f32(tensors['net.earl.blocks.0.linear2.bias']),
      this.ffnOut,
      false
    );

    for (let d = 0; d < EMBED_DIM; d++) {
      const v = this.res1[d] + this.ffnOut[d];
      this.postReLU[d] = v > 0 ? v : 0;
    }

    linearVec(
      this.postReLU,
      128,
      12,
      f32(tensors['net.output.linear.weight']),
      f32(tensors['net.output.linear.bias']),
      this.nectoLogits,
      false
    );

    return this.nectoLogits;
  }

  /**
   * Forward pass for Nexto (2-block Pre-LN Perceiver, 90-action dot-product output head).
   */
  forwardNexto(
    query: Float32Array,
    entities: Float32Array,
    numEntities: number,
    tensors: Record<string, SafeTensorEntry>,
    mask: Float32Array | null = null
  ): Float32Array {
    this._preprocessQueryAndKV(query, entities, numEntities, tensors);
    this._runPreLnBlock(0, this.qEmbed, numEntities, tensors, mask, this.blockOut, false);
    this._runPreLnBlock(1, this.blockOut, numEntities, tensors, mask, this.postReLU, true);

    linearVec(
      this.postReLU,
      128,
      32,
      f32(tensors['net.output.emb_convertor.weight']),
      f32(tensors['net.output.emb_convertor.bias']),
      this.nextoEmb32,
      false
    );

    const actEmb = f32(tensors['precomputed.action_embeddings']);
    for (let a = 0; a < 90; a++) {
      const aOff = a * 32;
      let dot = 0;
      for (let d = 0; d < 32; d++) {
        dot += actEmb[aOff + d] * this.nextoEmb32[d];
      }
      this.nextoLogits[a] = dot;
    }

    return this.nextoLogits;
  }
}
