//! `ReplayCodecWorkspace`: Persistent WASM linear-memory workspace for `.rlrc` / `.replay`
//! import/export buffers, roster descriptors, bookmarks, and anomaly diff reports.

use rc_physics_sim::{layout::MAX_CARS, replay::ReplayStorage};

use crate::{
    container::{
        decode_rcreplay_v2_container, encode_rcreplay_v2_container, is_rcreplay_v2_container,
    },
    types::{
        ReplayAnomalyDiffPod, ReplayBookmarkPod, ReplayRosterSlotPod, ReplayStreamHeaderPod,
        RLRC_TICK_RATE_HZ,
    },
};

pub struct ReplayCodecWorkspace {
    pub header: ReplayStreamHeaderPod,
    pub import_buffer: Vec<u8>,
    pub export_buffer: Vec<u8>,
    pub roster: [ReplayRosterSlotPod; MAX_CARS],
    pub bookmarks: Vec<ReplayBookmarkPod>,
    pub keyframes: Vec<ReplayBookmarkPod>,
    pub anomaly_diff: ReplayAnomalyDiffPod,
}

impl Default for ReplayCodecWorkspace {
    fn default() -> Self {
        Self::new()
    }
}

impl ReplayCodecWorkspace {
    pub fn new() -> Self {
        let mut roster = [ReplayRosterSlotPod::default(); MAX_CARS];
        for (i, slot) in roster.iter_mut().enumerate() {
            slot.slot_index = i as u32;
            slot.team = (i % 2) as u32;
        }
        Self {
            header: ReplayStreamHeaderPod {
                magic: 0x524C5243,
                version: 2,
                container_format: 0,
                status_code: 0,
                frame_count: 0,
                source_frame_count: 0,
                tick_rate_hz: RLRC_TICK_RATE_HZ,
                record_fps: 30.0,
                duration_seconds: 0.0,
                regulation_seconds: 300.0,
                active_car_mask: 0,
                roster_count: 0,
                blue_score: 0,
                orange_score: 0,
                incident_count: 0,
                signal_count: 0,
                bookmark_count: 0,
                keyframe_count: 0,
                part1_crc_valid: 1,
                part2_crc_valid: 1,
            },
            import_buffer: Vec::new(),
            export_buffer: Vec::new(),
            roster,
            bookmarks: Vec::new(),
            keyframes: Vec::new(),
            anomaly_diff: ReplayAnomalyDiffPod::default(),
        }
    }

    pub fn alloc_import_buffer(&mut self, byte_len: usize) -> *mut u8 {
        if byte_len == 0 {
            self.import_buffer.clear();
            return core::ptr::null_mut();
        }
        self.import_buffer.clear();
        self.import_buffer.resize(byte_len, 0);
        self.import_buffer.as_mut_ptr()
    }

    pub fn decode_imported_stream(&mut self, byte_len: usize, replay: &mut ReplayStorage) -> i32 {
        let len = byte_len.min(self.import_buffer.len());
        if len < 16 {
            self.header.status_code = -1;
            return 0;
        }
        let slice = &self.import_buffer[..len];
        if is_rcreplay_v2_container(slice) {
            let mut roster_vec = Vec::new();
            let mut bm_vec = Vec::new();
            let frames = decode_rcreplay_v2_container(
                slice,
                replay,
                &mut self.header,
                &mut roster_vec,
                &mut bm_vec,
            );
            for (i, r) in roster_vec.into_iter().take(MAX_CARS).enumerate() {
                self.roster[i] = r;
            }
            self.bookmarks = bm_vec;
            return frames;
        }

        // Raw Unreal Engine 3 `.replay` stream scaffold: validate Part 1 length header and stage metadata
        let p1_len = u32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]) as usize;
        if 8 + p1_len + 8 > slice.len() {
            self.header.status_code = -4;
            return 0;
        }
        self.header.container_format = 2;
        self.header.status_code = 1;
        self.header.frame_count = replay.state_track.len() as u32;
        self.header.frame_count as i32
    }

    pub fn encode_export_stream(
        &mut self,
        replay: &ReplayStorage,
        use_delta_transpose: bool,
    ) -> usize {
        self.header.frame_count = replay.state_track.len() as u32;
        self.header.incident_count = replay.incident_track.len() as u32;
        self.header.signal_count = replay.signal_track.len() as u32;
        self.header.bookmark_count = self.bookmarks.len() as u32;
        self.header.keyframe_count = self.keyframes.len() as u32;
        encode_rcreplay_v2_container(
            replay,
            &self.header,
            &self.bookmarks,
            &self.keyframes,
            use_delta_transpose,
            &mut self.export_buffer,
        )
    }
}
