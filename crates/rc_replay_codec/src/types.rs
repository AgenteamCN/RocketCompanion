//! Zero-copy C-ABI POD structures and constants for `rc_replay_codec`.
//!
//! Matches the 5-track `RCREPLAY` V2 container layout (`RCReplayBinarySchema.ts`),
//! `RLRCReplayTypes.ts`, and `ReplayFrameEntry` in `rc_physics_sim`.

use rc_physics_sim::layout::MAX_CARS;

pub const RCREPLAY_V2_MAGIC: [u8; 8] = *b"RCREPLAY";
pub const RCREPLAY_V2_VERSION: u32 = 2;

pub const RLRC_TICK_RATE_HZ: f32 = 120.0;
pub const RLRC_FIXED_DT: f32 = 1.0 / RLRC_TICK_RATE_HZ;
pub const RLRC_MAX_PLAYER_SLOTS: usize = 6;
pub const RLRC_BOOST_PAD_COUNT: usize = 34;

pub const REPLAY_STATE_FLOATS: usize = 448;
pub const REPLAY_STATE_BYTES: usize = REPLAY_STATE_FLOATS * 4;
pub const REPLAY_CONTROLS_BYTES: usize = 64;
pub const REPLAY_TRACK0_STRIDE_BYTES: usize = REPLAY_STATE_BYTES + REPLAY_CONTROLS_BYTES;
pub const REPLAY_EVENT_STRIDE_BYTES: usize = 64;
pub const REPLAY_BOOKMARK_STRIDE_BYTES: usize = 64;

/// Embedded Track 0 metadata float indices (floats 440..448 of `GameStateBufferPod`).
pub mod track0_meta_offsets {
    pub const SOURCE_FRAME_30HZ: usize = 440;
    pub const SECONDS_REMAINING: usize = 441;
    pub const MATCH_FLAGS: usize = 442;
    pub const TIME_SECONDS: usize = 443;
    pub const BLUE_SCORE: usize = 444;
    pub const ORANGE_SCORE: usize = 445;
    pub const SLOT_ACTION_MASK: usize = 446;
    pub const MAGIC_TAG: usize = 447;
    pub const MAGIC_VALUE: f32 = 1205.0;
}

/// Top-level stream header descriptor exposed via `_physics_getReplayCodecHeaderPtr`.
#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct ReplayStreamHeaderPod {
    pub magic: u32,
    pub version: u32,
    pub container_format: u32,
    pub status_code: i32,
    pub frame_count: u32,
    pub source_frame_count: u32,
    pub tick_rate_hz: f32,
    pub record_fps: f32,
    pub duration_seconds: f32,
    pub regulation_seconds: f32,
    pub active_car_mask: u32,
    pub roster_count: u32,
    pub blue_score: u32,
    pub orange_score: u32,
    pub incident_count: u32,
    pub signal_count: u32,
    pub bookmark_count: u32,
    pub keyframe_count: u32,
    pub part1_crc_valid: u32,
    pub part2_crc_valid: u32,
}

/// 64-byte player roster & loadout slot descriptor matching `RLRCPlayerSlotMeta`.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct ReplayRosterSlotPod {
    pub slot_index: u32,
    pub team: u32,
    pub pri_actor_id: u32,
    pub body_product_id: u32,
    pub hitbox_index: u32,
    pub visual_index: u32,
    pub primary_color_rgb: u32,
    pub accent_color_rgb: u32,
    pub camera_fov: f32,
    pub camera_height: f32,
    pub camera_pitch: f32,
    pub camera_distance: f32,
    pub camera_stiffness: f32,
    pub name_len: u8,
    pub name_utf8: [u8; 11],
}

impl Default for ReplayRosterSlotPod {
    fn default() -> Self {
        Self {
            slot_index: 0,
            team: 0,
            pri_actor_id: 0,
            body_product_id: 23,
            hitbox_index: 0,
            visual_index: 0,
            primary_color_rgb: 0,
            accent_color_rgb: 0,
            camera_fov: 110.0,
            camera_height: 100.0,
            camera_pitch: -3.0,
            camera_distance: 270.0,
            camera_stiffness: 0.5,
            name_len: 0,
            name_utf8: [0u8; 11],
        }
    }
}

/// 64-byte binary bookmark / keyframe record matching `RLRC_BOOKMARK_RECORD_STRIDE_BYTES = 64`.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct ReplayBookmarkPod {
    pub frame_index_120hz: u32,
    pub source_frame_30hz: u32,
    pub time_seconds: f32,
    pub kind_code: u8,
    pub slot_index: i8,
    pub team: i8,
    pub label_len: u8,
    pub label_utf8: [u8; 48],
}

impl Default for ReplayBookmarkPod {
    fn default() -> Self {
        Self {
            frame_index_120hz: 0,
            source_frame_30hz: 0,
            time_seconds: 0.0,
            kind_code: 1,
            slot_index: -1,
            team: -1,
            label_len: 0,
            label_utf8: [0u8; 48],
        }
    }
}

/// 64-byte anomaly / frame divergence report written by `_physics_diffReplayFrameAnomaly`.
#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct ReplayAnomalyDiffPod {
    pub frame_index: u32,
    pub tick: u32,
    pub ball_pos_error_uu: f32,
    pub ball_vel_error_uu_s: f32,
    pub ball_ang_vel_error: f32,
    pub max_car_pos_error_uu: f32,
    pub max_car_vel_error_uu_s: f32,
    pub max_car_rot_error_deg: f32,
    pub worst_car_slot: i32,
    pub diverged_car_mask: u32,
    pub car_pos_errors_uu: [f32; MAX_CARS],
}
