//! XOR-delta + 4-byte column transposition filter for Track A (`State + Controls`)
//! matching `filterAndTransposeStateInputTrack` and `unfilterAndUntransposeStateInputTrack`.

/// Applies XOR-delta + 4-byte column transposition on Track A (State + Input)
/// so GZIP achieves high compression ratios on floating-point state streams.
pub fn filter_and_transpose_track_a(
    raw_bytes: &[u8],
    frame_count: usize,
    stride: usize,
    out_bytes: &mut Vec<u8>,
) {
    let total_bytes = frame_count.saturating_mul(stride);
    out_bytes.clear();
    if frame_count == 0 || stride == 0 || raw_bytes.len() < total_bytes || (stride & 3) != 0 {
        return;
    }
    out_bytes.resize(total_bytes, 0);
    let words_per_frame = stride >> 2;
    let plane_size = frame_count * words_per_frame;

    for w in 0..words_per_frame {
        let mut prev_word = 0u32;
        let col_base = w * frame_count;
        for f in 0..frame_count {
            let byte_off = (f * words_per_frame + w) * 4;
            let cur_word = u32::from_le_bytes([
                raw_bytes[byte_off],
                raw_bytes[byte_off + 1],
                raw_bytes[byte_off + 2],
                raw_bytes[byte_off + 3],
            ]);
            let xor_word = cur_word ^ prev_word;
            prev_word = cur_word;

            let idx = col_base_add(col_base, f);
            out_bytes[idx] = (xor_word & 0xff) as u8;
            out_bytes[plane_size + idx] = ((xor_word >> 8) & 0xff) as u8;
            out_bytes[plane_size * 2 + idx] = ((xor_word >> 16) & 0xff) as u8;
            out_bytes[plane_size * 3 + idx] = ((xor_word >> 24) & 0xff) as u8;
        }
    }
}

#[inline]
const fn col_base_add(col_base: usize, f: usize) -> usize {
    col_base + f
}

/// Reverses 4-byte column transposition + XOR-delta filter back into contiguous Track A.
pub fn unfilter_and_untranspose_track_a(
    filtered_bytes: &[u8],
    frame_count: usize,
    stride: usize,
    out_bytes: &mut Vec<u8>,
) {
    let total_bytes = frame_count.saturating_mul(stride);
    out_bytes.clear();
    if frame_count == 0 || stride == 0 || filtered_bytes.len() < total_bytes || (stride & 3) != 0 {
        return;
    }
    out_bytes.resize(total_bytes, 0);
    let words_per_frame = stride >> 2;
    let plane_size = frame_count * words_per_frame;

    for w in 0..words_per_frame {
        let mut prev_word = 0u32;
        let col_base = w * frame_count;
        for f in 0..frame_count {
            let idx = col_base_add(col_base, f);
            let b0 = u32::from(filtered_bytes[idx]);
            let b1 = u32::from(filtered_bytes[plane_size + idx]);
            let b2 = u32::from(filtered_bytes[plane_size * 2 + idx]);
            let b3 = u32::from(filtered_bytes[plane_size * 3 + idx]);
            let xor_word = b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
            let cur_word = xor_word ^ prev_word;
            prev_word = cur_word;

            let dst_off = (f * words_per_frame + w) * 4;
            out_bytes[dst_off..dst_off + 4].copy_from_slice(&cur_word.to_le_bytes());
        }
    }
}
