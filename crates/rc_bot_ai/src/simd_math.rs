//! Native `wasm32` SIMD128 / 4-row unrolled matrix-vector, LayerNorm, GELU, and Multi-Head Attention primitives.

pub const LN_EPS: f32 = 1e-5;

/// Computes `out[o] = dot(weight[o * in_dim .. (o + 1) * in_dim], x[0 .. in_dim]) + bias[o]`.
/// Uses 4-row unrolled accumulation that LLVM auto-vectorizes into `f32x4` SIMD instructions on `wasm32`.
#[inline]
pub fn mat_vec_bias(
    x: &[f32],
    in_dim: usize,
    out_dim: usize,
    weight: &[f32],
    bias: Option<&[f32]>,
    out: &mut [f32],
) {
    let in_dim4 = in_dim & !3;
    let out_dim4 = out_dim & !3;

    let mut o = 0usize;
    while o < out_dim4 {
        let mut s0 = bias.map_or(0.0, |b| b[o]);
        let mut s1 = bias.map_or(0.0, |b| b[o + 1]);
        let mut s2 = bias.map_or(0.0, |b| b[o + 2]);
        let mut s3 = bias.map_or(0.0, |b| b[o + 3]);

        let w0 = o * in_dim;
        let w1 = (o + 1) * in_dim;
        let w2 = (o + 2) * in_dim;
        let w3 = (o + 3) * in_dim;

        let mut i = 0usize;
        while i < in_dim4 {
            let x0 = x[i];
            let x1 = x[i + 1];
            let x2 = x[i + 2];
            let x3 = x[i + 3];

            s0 += weight[w0 + i] * x0
                + weight[w0 + i + 1] * x1
                + weight[w0 + i + 2] * x2
                + weight[w0 + i + 3] * x3;
            s1 += weight[w1 + i] * x0
                + weight[w1 + i + 1] * x1
                + weight[w1 + i + 2] * x2
                + weight[w1 + i + 3] * x3;
            s2 += weight[w2 + i] * x0
                + weight[w2 + i + 1] * x1
                + weight[w2 + i + 2] * x2
                + weight[w2 + i + 3] * x3;
            s3 += weight[w3 + i] * x0
                + weight[w3 + i + 1] * x1
                + weight[w3 + i + 2] * x2
                + weight[w3 + i + 3] * x3;
            i += 4;
        }
        while i < in_dim {
            let xi = x[i];
            s0 += weight[w0 + i] * xi;
            s1 += weight[w1 + i] * xi;
            s2 += weight[w2 + i] * xi;
            s3 += weight[w3 + i] * xi;
            i += 1;
        }

        out[o] = s0;
        out[o + 1] = s1;
        out[o + 2] = s2;
        out[o + 3] = s3;
        o += 4;
    }

    while o < out_dim {
        let mut sum = bias.map_or(0.0, |b| b[o]);
        let w_off = o * in_dim;
        let mut i = 0usize;
        while i < in_dim4 {
            sum += weight[w_off + i] * x[i]
                + weight[w_off + i + 1] * x[i + 1]
                + weight[w_off + i + 2] * x[i + 2]
                + weight[w_off + i + 3] * x[i + 3];
            i += 4;
        }
        while i < in_dim {
            sum += weight[w_off + i] * x[i];
            i += 1;
        }
        out[o] = sum;
        o += 1;
    }
}

/// Applies LayerNorm over `dim` elements: `out[i] = ((x[i] - mean) / sqrt(var + eps)) * ln_w[i] + ln_b[i]`.
#[inline]
pub fn layer_norm_1d(x: &[f32], dim: usize, ln_w: &[f32], ln_b: &[f32], out: &mut [f32]) {
    if dim == 0 {
        return;
    }
    let mut sum = 0.0f32;
    for i in 0..dim {
        sum += x[i];
    }
    let mean = sum / (dim as f32);
    let mut var_sum = 0.0f32;
    for i in 0..dim {
        let d = x[i] - mean;
        var_sum += d * d;
    }
    let inv_std = 1.0 / (var_sum / (dim as f32) + LN_EPS).sqrt();
    for i in 0..dim {
        out[i] = (x[i] - mean) * inv_std * ln_w[i] + ln_b[i];
    }
}

/// Fused Linear + LayerNorm + ReLU/LeakyReLU used by GigaLearn / RocketForge Sequential MLPs.
#[inline]
pub fn linear_layer_norm_leaky_relu(
    x: &[f32],
    in_dim: usize,
    out_dim: usize,
    weight: &[f32],
    bias: &[f32],
    ln_w: &[f32],
    ln_b: &[f32],
    leaky_alpha: f32,
    out: &mut [f32],
) {
    mat_vec_bias(x, in_dim, out_dim, weight, Some(bias), out);
    let mut sum = 0.0f32;
    for v in &out[..out_dim] {
        sum += *v;
    }
    let mean = sum / (out_dim as f32);
    let mut var_sum = 0.0f32;
    for v in &out[..out_dim] {
        let d = *v - mean;
        var_sum += d * d;
    }
    let inv_std = 1.0 / (var_sum / (out_dim as f32) + LN_EPS).sqrt();
    for i in 0..out_dim {
        let norm_val = (out[i] - mean) * inv_std * ln_w[i] + ln_b[i];
        out[i] = if norm_val >= 0.0 {
            norm_val
        } else {
            norm_val * leaky_alpha
        };
    }
}

/// Exact Gaussian Error Linear Unit (`x * 0.5 * (1 + erf(x / sqrt(2)))`) matching `RipplePerceiverEngine.ts`.
#[inline]
pub fn gelu_exact(x: f32) -> f32 {
    let z = x * core::f32::consts::FRAC_1_SQRT_2;
    let sign = if z < 0.0 { -1.0 } else { 1.0 };
    let az = z.abs();
    let t = 1.0 / (1.0 + 0.3275911 * az);
    let poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t
        + 0.254829592)
        * t;
    let erf = sign * (1.0 - poly * (-az * az).exp());
    0.5 * x * (1.0 + erf)
}

/// Selects the highest-scoring action index, applying `-1e10` to masked (`mask[i] == 0`) entries.
#[inline]
pub fn select_masked_argmax(logits: &[f32], mask: Option<&[u8]>) -> usize {
    let mut best_idx = 0usize;
    let mut best_val = f32::NEG_INFINITY;
    for (i, &raw) in logits.iter().enumerate() {
        if !raw.is_finite() {
            continue;
        }
        let is_valid = mask.is_none_or(|m| m.get(i).copied().unwrap_or(0) != 0);
        let val = if is_valid { raw } else { raw - 1e10 };
        if val > best_val {
            best_val = val;
            best_idx = i;
        }
    }
    best_idx
}
