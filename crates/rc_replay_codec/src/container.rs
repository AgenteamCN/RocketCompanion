//! Native `.rlrc` / `RCREPLAY` V2 multi-track binary container encoder and decoder.

use rc_physics_sim::{
    layout::PhysicsEvent,
    replay::{ReplayFrameEntry, ReplayStorage},
};

use crate::{
    delta_transpose::{filter_and_transpose_track_a, unfilter_and_untranspose_track_a},
    types::{
        ReplayBookmarkPod, ReplayRosterSlotPod, ReplayStreamHeaderPod, RCREPLAY_V2_MAGIC,
        RCREPLAY_V2_VERSION, REPLAY_TRACK0_STRIDE_BYTES, RLRC_TICK_RATE_HZ,
    },
};

/// Checks whether `bytes` starts with `"RCREPLAY"`.
#[inline]
pub fn is_rcreplay_v2_container(bytes: &[u8]) -> bool {
    bytes.len() >= 16 && bytes[..8] == RCREPLAY_V2_MAGIC
}

/// Exports the active `ReplayStorage` + codec metadata into a binary `RCREPLAY` V2 container.
pub fn encode_rcreplay_v2_container(
    replay: &ReplayStorage,
    header: &ReplayStreamHeaderPod,
    bookmarks: &[ReplayBookmarkPod],
    keyframes: &[ReplayBookmarkPod],
    use_delta_transpose: bool,
    out_buf: &mut Vec<u8>,
) -> usize {
    let frame_count = replay.state_track.len();
    let stride = core::mem::size_of::<ReplayFrameEntry>();
    let raw_track_a_bytes = unsafe {
        core::slice::from_raw_parts(
            replay.state_track.as_ptr() as *const u8,
            frame_count * stride,
        )
    };

    let mut transposed_a = Vec::new();
    let track_a_slice: &[u8] = if use_delta_transpose && frame_count > 0 {
        filter_and_transpose_track_a(raw_track_a_bytes, frame_count, stride, &mut transposed_a);
        &transposed_a
    } else {
        raw_track_a_bytes
    };

    let track_b_slice = unsafe {
        core::slice::from_raw_parts(
            replay.incident_track.as_ptr() as *const u8,
            replay.incident_track.len() * core::mem::size_of::<PhysicsEvent>(),
        )
    };
    let track_c_slice = unsafe {
        core::slice::from_raw_parts(
            replay.signal_track.as_ptr() as *const u8,
            replay.signal_track.len() * core::mem::size_of::<PhysicsEvent>(),
        )
    };
    let track_d_slice = unsafe {
        core::slice::from_raw_parts(
            bookmarks.as_ptr() as *const u8,
            bookmarks.len() * core::mem::size_of::<ReplayBookmarkPod>(),
        )
    };
    let track_e_slice = unsafe {
        core::slice::from_raw_parts(
            keyframes.as_ptr() as *const u8,
            keyframes.len() * core::mem::size_of::<ReplayBookmarkPod>(),
        )
    };

    let tick_rate = if header.tick_rate_hz > 0.0 {
        header.tick_rate_hz
    } else {
        RLRC_TICK_RATE_HZ
    };
    let duration_sec = frame_count as f32 / tick_rate;
    let encoding_tag = if use_delta_transpose {
        "xor-delta-bytetran-v1"
    } else {
        "raw"
    };

    let compute_offsets = |meta_len: usize| -> (usize, usize, usize, usize, usize) {
        let a = (16 + meta_len + 7) & !7;
        let b = (a + track_a_slice.len() + 7) & !7;
        let c = (b + track_b_slice.len() + 7) & !7;
        let d = (c + track_c_slice.len() + 7) & !7;
        let e = (d + track_d_slice.len() + 7) & !7;
        (a, b, c, d, e)
    };

    let format_meta = |a: usize, b: usize, c: usize, d: usize, e: usize| -> String {
        format!(
            concat!(
                "{{\"magic\":\"RCREPLAY\",\"version\":2,\"format\":\"multi-track-binary-v2\",",
                "\"matchInfo\":{{\"mode\":\"match\",\"tickRate\":{},\"frameCount\":{},",
                "\"durationSec\":{:.2},\"blueScore\":{},\"orangeScore\":{}}},",
                "\"tracks\":{{",
                "\"stateInput\":{{\"offset\":{},\"byteLength\":{},\"count\":{},\"stride\":{},\"encoding\":\"{}\"}},",
                "\"incidents\":{{\"offset\":{},\"byteLength\":{},\"count\":{},\"stride\":64}},",
                "\"signals\":{{\"offset\":{},\"byteLength\":{},\"count\":{},\"stride\":64}},",
                "\"nativeEvents\":{{\"offset\":{},\"byteLength\":{},\"count\":{},\"stride\":64}},",
                "\"keyframes\":{{\"offset\":{},\"byteLength\":{},\"count\":{},\"stride\":64}}",
                "}}}}"
            ),
            tick_rate as u32,
            frame_count,
            duration_sec,
            header.blue_score,
            header.orange_score,
            a,
            track_a_slice.len(),
            frame_count,
            stride,
            encoding_tag,
            b,
            track_b_slice.len(),
            replay.incident_track.len(),
            c,
            track_c_slice.len(),
            replay.signal_track.len(),
            d,
            track_d_slice.len(),
            bookmarks.len(),
            e,
            track_e_slice.len(),
            keyframes.len(),
        )
    };

    let draft = format_meta(0, 0, 0, 0, 0);
    let (mut off_a, mut off_b, mut off_c, mut off_d, mut off_e) = compute_offsets(draft.len());
    let mut final_meta = format_meta(off_a, off_b, off_c, off_d, off_e);
    if ((16 + final_meta.len() + 7) & !7) != off_a {
        (off_a, off_b, off_c, off_d, off_e) = compute_offsets(final_meta.len());
        final_meta = format_meta(off_a, off_b, off_c, off_d, off_e);
    }

    let total_len = (off_e + track_e_slice.len() + 7) & !7;
    out_buf.clear();
    out_buf.resize(total_len, 0);
    out_buf[..8].copy_from_slice(&RCREPLAY_V2_MAGIC);
    out_buf[8..12].copy_from_slice(&RCREPLAY_V2_VERSION.to_le_bytes());
    out_buf[12..16].copy_from_slice(&(final_meta.len() as u32).to_le_bytes());
    out_buf[16..off_a].fill(0x20);
    out_buf[16..16 + final_meta.len()].copy_from_slice(final_meta.as_bytes());

    if !track_a_slice.is_empty() {
        out_buf[off_a..off_a + track_a_slice.len()].copy_from_slice(track_a_slice);
    }
    if !track_b_slice.is_empty() {
        out_buf[off_b..off_b + track_b_slice.len()].copy_from_slice(track_b_slice);
    }
    if !track_c_slice.is_empty() {
        out_buf[off_c..off_c + track_c_slice.len()].copy_from_slice(track_c_slice);
    }
    if !track_d_slice.is_empty() {
        out_buf[off_d..off_d + track_d_slice.len()].copy_from_slice(track_d_slice);
    }
    if !track_e_slice.is_empty() {
        out_buf[off_e..off_e + track_e_slice.len()].copy_from_slice(track_e_slice);
    }

    total_len
}

/// Minimal zero-dependency JSON integer field extractor for `RCREPLAY` V2 TOC headers.
fn extract_json_u32_after(haystack: &str, section: &str, key: &str) -> Option<u32> {
    let sec_pos = haystack.find(section)?;
    let sub = &haystack[sec_pos + section.len()..];
    let key_pat = format!("\"{key}\":");
    let key_pos = sub.find(&key_pat)?;
    let after = sub[key_pos + key_pat.len()..].trim_start();
    let digits_end = after
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(after.len());
    after[..digits_end].parse::<u32>().ok()
}

/// Decodes a binary `RCREPLAY` V2 container into `ReplayStorage` and `ReplayStreamHeaderPod`.
pub fn decode_rcreplay_v2_container(
    bytes: &[u8],
    replay: &mut ReplayStorage,
    header: &mut ReplayStreamHeaderPod,
    roster: &mut Vec<ReplayRosterSlotPod>,
    bookmarks: &mut Vec<ReplayBookmarkPod>,
) -> i32 {
    if !is_rcreplay_v2_container(bytes) {
        header.status_code = -1;
        return 0;
    }
    let version = u32::from_le_bytes([bytes[8], bytes[9], bytes[10], bytes[11]]);
    let meta_len = u32::from_le_bytes([bytes[12], bytes[13], bytes[14], bytes[15]]) as usize;
    if 16 + meta_len > bytes.len() {
        header.status_code = -2;
        return 0;
    }
    let Ok(meta_str) = core::str::from_utf8(&bytes[16..16 + meta_len]) else {
        header.status_code = -3;
        return 0;
    };

    let a_off = extract_json_u32_after(meta_str, "\"stateInput\"", "offset").unwrap_or(0) as usize;
    let a_len =
        extract_json_u32_after(meta_str, "\"stateInput\"", "byteLength").unwrap_or(0) as usize;
    let a_cnt = extract_json_u32_after(meta_str, "\"stateInput\"", "count").unwrap_or(0) as usize;
    let a_stride = extract_json_u32_after(meta_str, "\"stateInput\"", "stride")
        .unwrap_or(REPLAY_TRACK0_STRIDE_BYTES as u32) as usize;
    let is_transposed = meta_str.contains("xor-delta-bytetran-v1");

    replay.clear();
    roster.clear();
    bookmarks.clear();

    if a_cnt > 0 && a_off + a_len <= bytes.len() && a_stride == REPLAY_TRACK0_STRIDE_BYTES {
        let raw_slice = &bytes[a_off..a_off + a_len];
        let mut unfiltered = Vec::new();
        let src_bytes: &[u8] = if is_transposed {
            unfilter_and_untranspose_track_a(raw_slice, a_cnt, a_stride, &mut unfiltered);
            &unfiltered
        } else {
            raw_slice
        };
        if src_bytes.len() >= a_cnt * a_stride {
            replay.state_track.resize(a_cnt, ReplayFrameEntry::default());
            unsafe {
                core::ptr::copy_nonoverlapping(
                    src_bytes.as_ptr(),
                    replay.state_track.as_mut_ptr() as *mut u8,
                    a_cnt * a_stride,
                );
            }
            replay.header.frame_count = a_cnt as u32;
        }
    }

    let b_off = extract_json_u32_after(meta_str, "\"incidents\"", "offset").unwrap_or(0) as usize;
    let b_cnt = extract_json_u32_after(meta_str, "\"incidents\"", "count").unwrap_or(0) as usize;
    let b_bytes = b_cnt * core::mem::size_of::<PhysicsEvent>();
    if b_cnt > 0 && b_off + b_bytes <= bytes.len() {
        replay.incident_track.resize(b_cnt, PhysicsEvent::default());
        unsafe {
            core::ptr::copy_nonoverlapping(
                bytes.as_ptr().add(b_off),
                replay.incident_track.as_mut_ptr() as *mut u8,
                b_bytes,
            );
        }
        replay.header.incident_count = b_cnt as u32;
    }

    let c_off = extract_json_u32_after(meta_str, "\"signals\"", "offset").unwrap_or(0) as usize;
    let c_cnt = extract_json_u32_after(meta_str, "\"signals\"", "count").unwrap_or(0) as usize;
    let c_bytes = c_cnt * core::mem::size_of::<PhysicsEvent>();
    if c_cnt > 0 && c_off + c_bytes <= bytes.len() {
        replay.signal_track.resize(c_cnt, PhysicsEvent::default());
        unsafe {
            core::ptr::copy_nonoverlapping(
                bytes.as_ptr().add(c_off),
                replay.signal_track.as_mut_ptr() as *mut u8,
                c_bytes,
            );
        }
        replay.header.signal_count = c_cnt as u32;
    }

    let d_off =
        extract_json_u32_after(meta_str, "\"nativeEvents\"", "offset").unwrap_or(0) as usize;
    let d_cnt =
        extract_json_u32_after(meta_str, "\"nativeEvents\"", "count").unwrap_or(0) as usize;
    let d_bytes = d_cnt * core::mem::size_of::<ReplayBookmarkPod>();
    if d_cnt > 0 && d_off + d_bytes <= bytes.len() {
        bookmarks.resize(d_cnt, ReplayBookmarkPod::default());
        unsafe {
            core::ptr::copy_nonoverlapping(
                bytes.as_ptr().add(d_off),
                bookmarks.as_mut_ptr() as *mut u8,
                d_bytes,
            );
        }
    }

    header.magic = 0x524C5243;
    header.version = version;
    header.container_format = 1;
    header.status_code = 1;
    header.frame_count = replay.header.frame_count;
    header.tick_rate_hz =
        extract_json_u32_after(meta_str, "\"matchInfo\"", "tickRate").unwrap_or(120) as f32;
    header.duration_seconds = header.frame_count as f32 / header.tick_rate_hz.max(1.0);
    header.blue_score =
        extract_json_u32_after(meta_str, "\"matchInfo\"", "blueScore").unwrap_or(0);
    header.orange_score =
        extract_json_u32_after(meta_str, "\"matchInfo\"", "orangeScore").unwrap_or(0);
    header.incident_count = replay.header.incident_count;
    header.signal_count = replay.header.signal_count;
    header.bookmark_count = bookmarks.len() as u32;

    header.frame_count as i32
}
